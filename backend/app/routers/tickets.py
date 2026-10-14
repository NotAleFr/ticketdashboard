from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased


from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.aulas import Aula, Equipo
from app.models.usuarios import Usuario
from app.models.tickets import EstadoTicket, Ticket, TicketProblema, TipoProblema
from app.schemas.tickets import (
    AsignarTecnicoRequest,
    ResolverTicketRequest,
    TicketCreate,
    TicketListRead,
    TicketRead,
    TipoProblemaRead,
)
from app.services.ticket_service import ticket_service
from app.services.report_service import limitar_tickets

def usuario_puede_ver_ticket(ticket: Ticket, usuario: Usuario) -> bool:
    # El administrador tiene acceso global.
    if usuario.id_rol == 1:
        return True

    # El maestro solo consulta tickets que creó.
    if usuario.id_rol == 3:
        return ticket.id_usuario == usuario.id_usuario

    if usuario.id_rol == 2:
        # El líder ve los tickets de su laboratorio.
        if usuario.is_leader:
            return ticket.id_aula == usuario.laboratorio_asignado_id

        # El técnico ve solo los tickets que tiene asignados.
        return ticket.id_tecnico == usuario.id_usuario

    return False


router = APIRouter(prefix="/tickets", tags=["Tickets"])

@router.get("/", response_model=list[TicketListRead])
def listar_tickets(
    estado: str | None = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    # El JOIN obtiene el perfil asociado al id_usuario del ticket.
    tecnico_alias = aliased(Usuario)
    query = (
        db.query(Ticket, Usuario, tecnico_alias)
        .join(Usuario, Ticket.id_usuario == Usuario.id_usuario)
        .outerjoin(tecnico_alias, Ticket.id_tecnico == tecnico_alias.id_usuario)
    )


    query = limitar_tickets(query, usuario_actual)

    if estado:
        query = query.filter(Ticket.estado == estado)

    resultado = []
    for ticket, reportante, tecnico in query.all():
        datos_ticket = TicketRead.model_validate(ticket).model_dump()
        datos_ticket["nombre_reportante"] = (
            f"{reportante.nombre} {reportante.apellido}".strip()
            )
        datos_ticket["correo_reportante"] = reportante.email
        datos_ticket["nombre_tecnico"] = (
            f"{tecnico.nombre} {tecnico.apellido}".strip()
            if tecnico else None
        )
        resultado.append(TicketListRead.model_validate(datos_ticket))

    return resultado




@router.get("/tipos-problema", response_model=list[TipoProblemaRead])
def listar_tipos_problema(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return db.query(TipoProblema).order_by(TipoProblema.nombre).all()


@router.post("/{id_ticket}/asignar", response_model=TicketRead)
def asignar_tecnico_a_ticket(
    id_ticket: int,
    datos: AsignarTecnicoRequest,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return ticket_service.asignar_tecnico(
        db=db,
        id_ticket=id_ticket,
        id_tecnico=datos.id_tecnico,
        usuario=usuario_actual,
    )

@router.post("/{id_ticket}/resolver", response_model=TicketRead)
def resolver_ticket(
    id_ticket: int,
    datos: ResolverTicketRequest,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return ticket_service.cambiar_estado(
        db=db,
        id_ticket=id_ticket,
        nuevo_estado=EstadoTicket.RESUELTO.value,
        usuario=usuario_actual,
        texto_solucion=datos.texto_solucion,
    )

@router.post("/{id_ticket}/cerrar", response_model=TicketRead)
def cerrar_ticket(
    id_ticket: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    # TicketService verifica que el ticket esté resuelto
    # y que el usuario tenga permiso para cerrarlo.
    return ticket_service.cambiar_estado(
        db=db,
        id_ticket=id_ticket,
        nuevo_estado=EstadoTicket.CERRADO.value,
        usuario=usuario_actual,
    )


@router.post("/{id_ticket}/reabrir", response_model=TicketRead)
def reabrir_ticket(
    id_ticket: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    # TicketService verifica que esté resuelto
    # y que el maestro creador o administrador pueda reabrirlo.
    return ticket_service.cambiar_estado(
        db=db,
        id_ticket=id_ticket,
        nuevo_estado=EstadoTicket.EN_PROCESO.value,
        usuario=usuario_actual,
    )


@router.get("/{id_ticket}", response_model=TicketRead)
def obtener_ticket(
    id_ticket: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).first()

    # Respondemos 404 si no existe o el usuario no puede verlo.
    if not ticket or not usuario_puede_ver_ticket(ticket, usuario_actual):
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    return ticket

@router.post("/", response_model=TicketRead, status_code=201)
def crear_ticket(
    datos: TicketCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):

    if usuario_actual.id_rol not in {1, 3}:
        raise HTTPException(
            status_code=403,
            detail="Solo un Maestro o Administrador puede crear tickets",
        )

    aula = db.query(Aula).filter(Aula.id_aula == datos.id_aula).first()
    if not aula:
        raise HTTPException(status_code=404, detail="Aula no encontrada")

    if datos.id_equipo is not None:
        equipo = db.query(Equipo).filter(Equipo.id_equipo == datos.id_equipo).first()

        if not equipo:
            raise HTTPException(status_code=404, detail="Equipo no encontrado")

        if equipo.id_aula != datos.id_aula:
            raise HTTPException(
                status_code=400,
                detail="El equipo seleccionado no pertenece al aula indicada",
            )


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


@router.delete("/{id_ticket}", status_code=204)
def eliminar_ticket(
    id_ticket: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    if usuario_actual.id_rol != 1:
        raise HTTPException(
            status_code=403,
            detail="Solo un Administrador puede eliminar tickets",
        )

    ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    db.delete(ticket)
    db.commit()

