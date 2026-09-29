from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.deps import get_current_user, CurrentUser
from app.models.tickets import Ticket, TicketProblema
from app.schemas.tickets import TicketCreate, TicketUpdate, TicketRead

router = APIRouter(prefix="/tickets", tags=["Tickets"])


@router.get("/", response_model=list[TicketRead])
def listar_tickets(estado: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Ticket)
    if estado:
        query = query.filter(Ticket.estado == estado)
    return query.all()


@router.get("/{id_ticket}", response_model=TicketRead)
def obtener_ticket(id_ticket: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return ticket


@router.post("/", response_model=TicketRead, status_code=201)
def crear_ticket(
    datos: TicketCreate,
    db: Session = Depends(get_db),
    usuario_actual: CurrentUser = Depends(get_current_user),
):
    nuevo = Ticket(
        nombre_ticket=datos.nombre_ticket,
        descripcion=datos.descripcion,
        id_aula=datos.id_aula,
        id_equipo=datos.id_equipo,
        id_usuario=usuario_actual.id_usuario,  # quien reporta = usuario autenticado
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    # Relaciona los tipos de problema seleccionados (tabla TICKETS_PROBLEMAS)
    for id_tipo_problema in datos.problemas_ids:
        db.add(TicketProblema(id_ticket=nuevo.id_ticket, id_tipo_problema=id_tipo_problema))
    db.commit()
    db.refresh(nuevo)

    return nuevo


@router.put("/{id_ticket}", response_model=TicketRead)
def actualizar_ticket(id_ticket: int, datos: TicketUpdate, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    cambios = datos.model_dump(exclude_unset=True)
    if "estado" in cambios and cambios["estado"] is not None:
        cambios["estado"] = cambios["estado"].value  # Enum -> string para la columna

    for campo, valor in cambios.items():
        setattr(ticket, campo, valor)

    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/{id_ticket}", status_code=204)
def eliminar_ticket(id_ticket: int, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    db.delete(ticket)
    db.commit()
