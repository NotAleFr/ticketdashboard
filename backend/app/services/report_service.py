from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import false
from sqlalchemy.orm import aliased

from app.models.aulas import Aula, Equipo
from app.models.tickets import Ticket
from app.models.usuarios import Usuario


def limitar_tickets(query, usuario):
    # Las mismas reglas se usan en reportes y en el listado de tickets.
    if usuario.id_rol == 1:
        return query
    if usuario.id_rol == 3:
        return query.filter(Ticket.id_usuario == usuario.id_usuario)
    if usuario.id_rol == 2:
        if usuario.is_leader:
            if usuario.laboratorio_asignado_id is None:
                return query.filter(false())
            return query.filter(Ticket.id_aula == usuario.laboratorio_asignado_id)
        return query.filter(Ticket.id_tecnico == usuario.id_usuario)
    raise HTTPException(status_code=403, detail="Tu rol no tiene permiso para consultar tickets")


def laboratorios_visibles(db, usuario):
    tickets = limitar_tickets(db.query(Ticket.id_aula), usuario)
    query = db.query(Aula)
    if usuario.id_rol == 2 and usuario.is_leader:
        query = query.filter(Aula.id_aula == usuario.laboratorio_asignado_id)
    elif usuario.id_rol != 1:
        query = query.filter(Aula.id_aula.in_(tickets))
    # Incluye aulas inactivas para conservar el historial de reportes.
    return query.order_by(Aula.nombre, Aula.id_aula).all()


def rango_periodo(periodo, ahora=None):
    # Sonora usa UTC-7 todo el año. La BD guarda fecha_registro en UTC.
    zona = timezone(timedelta(hours=-7))
    hoy = (ahora or datetime.now(timezone.utc)).astimezone(zona).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    fin = hoy + timedelta(days=1)
    inicios = {
        "hoy": hoy,
        "ultima-semana": hoy - timedelta(days=6),
        "ultimo-mes": hoy - timedelta(days=29),
        "este-ano": hoy.replace(month=1, day=1),
    }
    if periodo == "todos":
        return None, None
    inicio = inicios[periodo]
    return (inicio.astimezone(timezone.utc).replace(tzinfo=None),
            fin.astimezone(timezone.utc).replace(tzinfo=None))


def consulta_reporte(db, usuario, estado, id_aula, periodo):
    labs = laboratorios_visibles(db, usuario)
    if id_aula is not None and id_aula not in {lab.id_aula for lab in labs}:
        raise HTTPException(status_code=404, detail="Laboratorio no encontrado")
    query = limitar_tickets(db.query(Ticket), usuario)
    if estado is not None:
        query = query.filter(Ticket.estado == estado.value)
    if id_aula is not None:
        query = query.filter(Ticket.id_aula == id_aula)
    inicio, fin = rango_periodo(periodo)
    anterior = None
    if inicio is not None:
        anterior = query.filter(Ticket.fecha_registro >= inicio - (fin - inicio),
                                Ticket.fecha_registro < inicio)
        query = query.filter(Ticket.fecha_registro >= inicio, Ticket.fecha_registro < fin)
    return query, anterior, labs


def filas_reporte(query):
    tecnico = aliased(Usuario)
    return (query.add_entity(Aula).add_entity(Equipo).add_entity(tecnico).add_entity(Usuario)
            .join(Aula, Ticket.id_aula == Aula.id_aula)
            .outerjoin(Equipo, Ticket.id_equipo == Equipo.id_equipo)
            .outerjoin(tecnico, Ticket.id_tecnico == tecnico.id_usuario)
            .join(Usuario, Ticket.id_usuario == Usuario.id_usuario)
            .order_by(Ticket.fecha_registro.desc(), Ticket.id_ticket.desc()))


def datos_fila(fila):
    ticket, aula, equipo, tecnico, reportante = fila
    return {
        "id_ticket": ticket.id_ticket, "nombre_ticket": ticket.nombre_ticket,
        "estado": ticket.estado, "fecha_registro": ticket.fecha_registro,
        "id_aula": ticket.id_aula, "nombre_aula": aula.nombre,
        "equipo": equipo.identificador if equipo else None,
        "nombre_tecnico": f"{tecnico.nombre} {tecnico.apellido}" if tecnico else None,
        "nombre_reportante": f"{reportante.nombre} {reportante.apellido}",
    }
