from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased


from app.db.database import get_db
from app.core.deps import get_current_user
from app.models.aulas import Aula, Equipo
from app.models.usuarios import Usuario
from app.models.tickets import EstadoTicket, Ticket, TicketProblema, TipoProblema
from app.models.tracking import HistorialEstado, Solucion
from app.schemas.tickets import (
    AsignarTecnicoRequest,
    EventoHistorial,
    ResolverTicketRequest,
    TicketCreate,
    TicketListRead,
    TicketRead,
    TipoProblemaRead,
)
from app.services.ticket_service import sincronizar_estado_equipo, ticket_service
from app.services.report_service import limitar_tickets
from app.core.tipos import Entero

def usuario_puede_ver_ticket(ticket: Ticket, usuario: Usuario) -> bool:
    # El administrador tiene acceso global.
    if usuario.id_rol == 1:
        return True

    # El maestro solo consulta tickets que creó.
    if usuario.id_rol == 3:
        return ticket.id_usuario == usuario.id_usuario

    if usuario.id_rol == 2:
        # Todo técnico ve lo que tiene asignado; el líder además ve su laboratorio.
        if ticket.id_tecnico == usuario.id_usuario:
            return True
        return usuario.is_leader and ticket.id_aula == usuario.laboratorio_asignado_id

    return False


def _nombre_completo(usuario: Usuario | None) -> str | None:
    if usuario is None:
        return None
    return f"{usuario.nombre} {usuario.apellido}".strip()


router = APIRouter(prefix="/tickets", tags=["Tickets"])

@router.get("/", response_model=list[TicketListRead])
def listar_tickets(
    estado: EstadoTicket | None = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    query = limitar_tickets(_consulta_con_nombres(db), usuario_actual)

    if estado:
        query = query.filter(Ticket.estado == estado.value)

    filas = query.all()

    # Categorías de todos los tickets listados en una sola consulta.
    problemas: dict[int, list[str]] = {}
    ids = [ticket.id_ticket for ticket, *_ in filas]
    if ids:
        for id_ticket, nombre in (
            db.query(TicketProblema.id_ticket, TipoProblema.nombre)
            .join(TipoProblema, TicketProblema.id_tipo_problema == TipoProblema.id_tipo_problema)
            .filter(TicketProblema.id_ticket.in_(ids))
            .order_by(TipoProblema.nombre)
        ):
            problemas.setdefault(id_ticket, []).append(nombre)

    return [
        _ticket_con_nombres(ticket, reportante, tecnico, aula, equipo, problemas.get(ticket.id_ticket, []))
        for ticket, reportante, tecnico, aula, equipo in filas
    ]


def _consulta_con_nombres(db: Session):
    # El JOIN obtiene el perfil asociado al id_usuario del ticket.
    tecnico_alias = aliased(Usuario)
    return (
        db.query(Ticket, Usuario, tecnico_alias, Aula, Equipo)
        .join(Usuario, Ticket.id_usuario == Usuario.id_usuario)
        .outerjoin(tecnico_alias, Ticket.id_tecnico == tecnico_alias.id_usuario)
        .outerjoin(Aula, Ticket.id_aula == Aula.id_aula)
        .outerjoin(Equipo, Ticket.id_equipo == Equipo.id_equipo)
    )


def _ticket_con_nombres(ticket, reportante, tecnico, aula, equipo, problemas) -> TicketListRead:
    datos_ticket = TicketRead.model_validate(ticket).model_dump()
    datos_ticket.update(
        nombre_reportante=_nombre_completo(reportante),
        correo_reportante=reportante.email,
        nombre_tecnico=_nombre_completo(tecnico) if tecnico else None,
        nombre_aula=aula.nombre if aula else None,
        equipo_tipo=equipo.tipo if equipo else None,
        equipo_identificador=equipo.identificador if equipo else None,
        problemas=problemas,
    )
    return TicketListRead.model_validate(datos_ticket)




@router.get("/tipos-problema", response_model=list[TipoProblemaRead])
def listar_tipos_problema(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return db.query(TipoProblema).order_by(TipoProblema.nombre).all()


@router.post("/{id_ticket}/asignar", response_model=TicketRead)
def asignar_tecnico_a_ticket(
    id_ticket: Entero,
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
    id_ticket: Entero,
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
    id_ticket: Entero,
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
    id_ticket: Entero,
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


@router.get("/{id_ticket}", response_model=TicketListRead)
def obtener_ticket(
    id_ticket: Entero,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    fila = _consulta_con_nombres(db).filter(Ticket.id_ticket == id_ticket).first()

    # Respondemos 404 si no existe o el usuario no puede verlo.
    if not fila or not usuario_puede_ver_ticket(fila[0], usuario_actual):
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    problemas = [
        nombre for (nombre,) in db.query(TipoProblema.nombre)
        .join(TicketProblema, TicketProblema.id_tipo_problema == TipoProblema.id_tipo_problema)
        .filter(TicketProblema.id_ticket == id_ticket)
        .order_by(TipoProblema.nombre)
    ]
    return _ticket_con_nombres(*fila, problemas)

@router.get("/{id_ticket}/historial", response_model=list[EventoHistorial])
def obtener_historial(
    id_ticket: Entero,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).first()
    if not ticket or not usuario_puede_ver_ticket(ticket, usuario_actual):
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    reportante = db.get(Usuario, ticket.id_usuario)
    eventos = [EventoHistorial(
        tipo="creacion", fecha=ticket.fecha_registro, nombre_usuario=_nombre_completo(reportante),
        estado_actual=EstadoTicket.ABIERTO.value,
    )]
    # Cada paso a Resuelto se guarda junto con su solución: la n-ésima solución
    # corresponde a la n-ésima resolución (ambas en orden de inserción).
    soluciones = iter(
        db.query(Solucion.texto)
        .filter(Solucion.id_ticket == id_ticket)
        .order_by(Solucion.id_solucion)
        .all()
    )
    for cambio, autor in (
        db.query(HistorialEstado, Usuario)
        .outerjoin(Usuario, HistorialEstado.id_usuario == Usuario.id_usuario)
        .filter(HistorialEstado.id_ticket == id_ticket)
        .order_by(HistorialEstado.id_historial)
    ):
        texto = None
        if cambio.estado_actual == EstadoTicket.RESUELTO.value:
            texto = next(soluciones, (None,))[0]
        eventos.append(EventoHistorial(
            tipo="estado", fecha=cambio.fecha_cambio, nombre_usuario=_nombre_completo(autor),
            estado_anterior=cambio.estado_anterior, estado_actual=cambio.estado_actual,
            texto=texto,
        ))
    return eventos


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

    # Se bloquea el aula: si un administrador la desactiva al mismo tiempo,
    # una de las dos operaciones espera a la otra y nunca entra un ticket a un aula inactiva.
    aula = (
        db.query(Aula)
        .filter(Aula.id_aula == datos.id_aula)
        .with_for_update()
        .first()
    )
    if not aula:
        raise HTTPException(status_code=404, detail="Aula no encontrada")
    if not aula.activo:
        raise HTTPException(status_code=400, detail="El aula está inactiva y no recibe reportes")

    if datos.id_equipo is not None:
        # Se bloquea el equipo para que un cambio de aula o una baja no se cuele
        # entre esta validación y el alta del ticket.
        equipo = (
            db.query(Equipo)
            .filter(Equipo.id_equipo == datos.id_equipo)
            .with_for_update()
            .first()
        )
        if not equipo:
            raise HTTPException(status_code=404, detail="Equipo no encontrado")
        if equipo.id_aula != datos.id_aula:
            raise HTTPException(
                status_code=400,
                detail="El equipo seleccionado no pertenece al aula indicada",
            )
        if equipo.estado_actual == "Inoperativo":
            raise HTTPException(status_code=400, detail="El equipo está dado de baja")

    problemas_ids = set(datos.problemas_ids)
    existentes = {
        id_tipo for (id_tipo,) in db.query(TipoProblema.id_tipo_problema)
        .filter(TipoProblema.id_tipo_problema.in_(problemas_ids))
    }
    if existentes != problemas_ids:
        raise HTTPException(status_code=422, detail="Hay tipos de problema que no existen")

    # Ticket y categorías se guardan en una sola transacción.
    nuevo = Ticket(
        nombre_ticket=datos.nombre_ticket,
        descripcion=datos.descripcion,
        id_aula=datos.id_aula,
        id_equipo=datos.id_equipo,
        id_usuario=usuario_actual.id_usuario,  # quien reporta = usuario autenticado
        estado=EstadoTicket.ABIERTO.value,
    )
    db.add(nuevo)
    db.flush()
    db.add_all(
        TicketProblema(id_ticket=nuevo.id_ticket, id_tipo_problema=id_tipo)
        for id_tipo in sorted(problemas_ids)
    )
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.delete("/{id_ticket}", status_code=204)
def eliminar_ticket(
    id_ticket: Entero,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    if usuario_actual.id_rol != 1:
        raise HTTPException(
            status_code=403,
            detail="Solo un Administrador puede eliminar tickets",
        )

    # Mismo orden de bloqueo que las transiciones (ticket -> equipo) para no interbloquear.
    ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).with_for_update().first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    # Al borrar un ticket en proceso, el equipo puede dejar de estar en mantenimiento.
    db.delete(ticket)
    sincronizar_estado_equipo(db, ticket.id_equipo)
    db.commit()

