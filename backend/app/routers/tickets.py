from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.usuarios import Usuario
from app.models.aulas import Aula, Equipo
from app.models.tickets import Ticket, TicketProblema, TipoProblema
from app.schemas.tickets import TicketCreate, TicketUpdate, TicketRead

router = APIRouter(prefix="/tickets", tags=["Tickets"])


def _get_ticket_or_404(db: Session, id_ticket: int) -> Ticket:
    ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return ticket


def _require_ticket_access(
    ticket: Ticket,
    usuario_actual: Usuario,
    *,
    allow_assigned_technician: bool = True,
) -> None:
    """Allow administrators, reporters, and optionally assigned technicians."""
    has_access = usuario_actual.id_rol == 1 or ticket.id_usuario == usuario_actual.id_usuario
    if allow_assigned_technician:
        has_access = has_access or ticket.id_tecnico == usuario_actual.id_usuario
    if not has_access:
        raise HTTPException(status_code=403, detail="No tienes acceso a este ticket")


@router.get("/", response_model=list[TicketRead])
def listar_tickets(
    estado: str | None = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user)
):
    query = db.query(Ticket)
    if usuario_actual.id_rol != 1:
        query = query.filter(
            or_(
                Ticket.id_usuario == usuario_actual.id_usuario,
                Ticket.id_tecnico == usuario_actual.id_usuario,
            )
        )
    if estado:
        query = query.filter(Ticket.estado == estado)
    return query.all()


@router.get("/{id_ticket}", response_model=TicketRead)
def obtener_ticket(
    id_ticket: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, id_ticket)
    _require_ticket_access(ticket, usuario_actual)
    return ticket


@router.post("/", response_model=TicketRead, status_code=201)
def crear_ticket(
    datos: TicketCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    aula = db.query(Aula).filter(Aula.id_aula == datos.id_aula).first()
    if not aula or not aula.activo:
        raise HTTPException(status_code=404, detail="Aula no encontrada o inactiva")

    if datos.id_equipo is not None:
        equipo = db.query(Equipo).filter(Equipo.id_equipo == datos.id_equipo).first()
        if not equipo:
            raise HTTPException(status_code=404, detail="Equipo no encontrado")
        if equipo.id_aula != datos.id_aula:
            raise HTTPException(
                status_code=400,
                detail="El equipo no pertenece al aula seleccionada",
            )

    problem_ids = set(datos.problemas_ids)
    valid_problem_count = (
        db.query(TipoProblema)
        .filter(TipoProblema.id_tipo_problema.in_(problem_ids))
        .count()
    )
    if valid_problem_count != len(problem_ids):
        raise HTTPException(status_code=400, detail="Tipo de problema no válido")

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
    for id_tipo_problema in problem_ids:
        db.add(TicketProblema(id_ticket=nuevo.id_ticket, id_tipo_problema=id_tipo_problema))
    db.commit()
    db.refresh(nuevo)

    return nuevo


@router.put("/{id_ticket}", response_model=TicketRead)
def actualizar_ticket(
    id_ticket: int,
    datos: TicketUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, id_ticket)
    _require_ticket_access(ticket, usuario_actual)

    if datos.id_tecnico is not None:
        tecnico = db.query(Usuario).filter(Usuario.id_usuario == datos.id_tecnico).first()
        if not tecnico:
            raise HTTPException(status_code=404, detail="Técnico no encontrado")

    cambios = datos.model_dump(exclude_unset=True)
    if "estado" in cambios and cambios["estado"] is not None:
        cambios["estado"] = cambios["estado"].value  # Enum -> string para la columna

    for campo, valor in cambios.items():
        setattr(ticket, campo, valor)

    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/{id_ticket}", status_code=204)
def eliminar_ticket(
    id_ticket: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    ticket = _get_ticket_or_404(db, id_ticket)
    _require_ticket_access(ticket, usuario_actual, allow_assigned_technician=False)

    db.delete(ticket)
    db.commit()
