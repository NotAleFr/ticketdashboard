# backend/app/services/ticket_service.py
from uuid import UUID

from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.tickets import EstadoTicket, Ticket
from app.models.usuarios import Usuario
from app.models.aulas import Aula, Equipo
from app.models.tracking import HistorialEstado, Solucion


# --- Estados válidos ---
ESTADO_ABIERTO = EstadoTicket.ABIERTO.value
ESTADO_EN_PROCESO = EstadoTicket.EN_PROCESO.value
ESTADO_RESUELTO = EstadoTicket.RESUELTO.value
ESTADO_CERRADO = EstadoTicket.CERRADO.value


TRANSICIONES_VALIDAS = {
    ESTADO_ABIERTO: [ESTADO_EN_PROCESO],
    ESTADO_EN_PROCESO: [ESTADO_RESUELTO],
    ESTADO_RESUELTO: [ESTADO_CERRADO, ESTADO_EN_PROCESO],  # En Proceso = reapertura
    ESTADO_CERRADO: [],
}


def tickets_en_proceso(db: Session, id_equipo: int) -> bool:
    db.flush()
    return db.query(Ticket.id_ticket).filter(
        Ticket.id_equipo == id_equipo,
        Ticket.estado == ESTADO_EN_PROCESO,
    ).first() is not None


def sincronizar_estado_equipo(db: Session, id_equipo: int | None) -> None:
    """Deriva Operativo/En Mantenimiento de los tickets en proceso del equipo."""
    # Los tickets sin equipo específico no cambian el inventario.
    if id_equipo is None:
        return
    equipo = (
        db.query(Equipo)
        .filter(Equipo.id_equipo == id_equipo)
        .with_for_update()
        .first()
    )
    # Un equipo dado de baja (Inoperativo) nunca vuelve a Operativo por un ticket.
    if not equipo or equipo.estado_actual == "Inoperativo":
        return
    # Sigue en mantenimiento mientras cualquier ticket suyo esté en proceso.
    equipo.estado_actual = (
        "En Mantenimiento" if tickets_en_proceso(db, id_equipo) else "Operativo"
    )


class TicketService:

    # ---------- ASIGNACIÓN DE TÉCNICO ----------

    def asignar_tecnico(
        self,
        db: Session,
        id_ticket: int,
        id_tecnico: UUID,
        usuario: Usuario,
    ) -> Ticket:
        ticket = self._obtener_ticket(db, id_ticket)

        puede_asignar = (
            self._es_admin(usuario)
            or self._es_lider_del_lab(usuario, ticket.id_aula)
        )
        if not puede_asignar:
            raise HTTPException(403, "No tienes permiso para asignar este ticket")

        tecnico = (
            db.query(Usuario)
            .filter(Usuario.id_usuario == id_tecnico)
            .first()
        )
        if not tecnico or tecnico.id_rol != 2:
            raise HTTPException(404, "Técnico no encontrado")

        es_otro_laboratorio = tecnico.laboratorio_asignado_id != ticket.id_aula
        if not self._es_admin(usuario) and es_otro_laboratorio:
            raise HTTPException(400, "El técnico no pertenece al laboratorio del ticket")

        if ticket.estado not in {ESTADO_ABIERTO, ESTADO_EN_PROCESO}:
            raise HTTPException(400, "Solo se pueden asignar tickets abiertos o en proceso")

        if ticket.id_tecnico == tecnico.id_usuario:
            raise HTTPException(400, "El ticket ya está asignado a ese técnico")

        estado_anterior = ticket.estado
        ticket.id_tecnico = tecnico.id_usuario
        ticket.estado = ESTADO_EN_PROCESO

        try:
            self._registrar_historial(
                db, ticket, estado_anterior, ticket.estado, usuario
            )
            sincronizar_estado_equipo(db, ticket.id_equipo)
            db.commit()
        except Exception:
            db.rollback()
            raise

        db.refresh(ticket)
        return ticket


    # ---------- CAMBIO DE ESTADOS ----------

    def cambiar_estado(
        self,
        db: Session,
        id_ticket: int,
        nuevo_estado: str,
        usuario: Usuario,
        texto_solucion: str | None = None,
    ) -> Ticket:
        ticket = self._obtener_ticket(db, id_ticket)
        estado_anterior = ticket.estado

        # Rechaza cambios que no formen parte de la máquina de estados.
        if nuevo_estado not in TRANSICIONES_VALIDAS.get(estado_anterior, []):
            raise HTTPException(
                status_code=400,
                detail=f"Transición inválida: {estado_anterior} → {nuevo_estado}",
            )

        # Resolver: solo el técnico asignado o un administrador.
        if nuevo_estado == ESTADO_RESUELTO:
            es_tecnico_asignado = (
                usuario.id_rol == 2
                and usuario.id_usuario == ticket.id_tecnico
            )
            if not es_tecnico_asignado and not self._es_admin(usuario):
                raise HTTPException(
                    status_code=403,
                    detail="Solo el técnico asignado puede resolver el ticket",
                )

            if not texto_solucion or not texto_solucion.strip():
                raise HTTPException(
                    status_code=422,
                    detail="Debes registrar la solución técnica",
                )

        # Cerrar: creador, líder del laboratorio o administrador.
        if nuevo_estado == ESTADO_CERRADO:
            es_creador = usuario.id_usuario == ticket.id_usuario
            es_lider = self._es_lider_del_lab(usuario, ticket.id_aula)
            if not es_creador and not es_lider and not self._es_admin(usuario):
                raise HTTPException(
                    status_code=403,
                    detail="No tienes permiso para cerrar este ticket",
                )

        # Reabrir: maestro creador o administrador.
        if estado_anterior == ESTADO_RESUELTO and nuevo_estado == ESTADO_EN_PROCESO:
            es_maestro_creador = (
                usuario.id_rol == 3 and usuario.id_usuario == ticket.id_usuario
            )
            if not es_maestro_creador and not self._es_admin(usuario):
                raise HTTPException(
                    status_code=403,
                    detail="No tienes permiso para reabrir este ticket",
                )

        # Abrir atención requiere asignar técnico; no se cambia con este método.
        if estado_anterior == ESTADO_ABIERTO and nuevo_estado == ESTADO_EN_PROCESO:
            raise HTTPException(
                status_code=400,
                detail="Usa la acción de asignación para iniciar la atención",
            )

        try:
            # La solución se guarda en la misma transacción que el cambio y su auditoría.
            if nuevo_estado == ESTADO_RESUELTO:
                db.add(
                    Solucion(
                        id_ticket=ticket.id_ticket,
                        id_usuario=usuario.id_usuario,
                        texto=texto_solucion.strip(),
                    )
                )

            ticket.estado = nuevo_estado
            self._registrar_historial(
                db, ticket, estado_anterior, nuevo_estado, usuario
            )
            sincronizar_estado_equipo(db, ticket.id_equipo)
            db.commit()
        except Exception:
            db.rollback()
            raise

        db.refresh(ticket)
        return ticket


    # ---------- HELPERS PRIVADOS ----------

    def _obtener_ticket(self, db: Session, id_ticket: int) -> Ticket:
        # Bloquea la fila: dos transiciones simultáneas no pueden partir del mismo estado.
        ticket = (
            db.query(Ticket)
            .filter(Ticket.id_ticket == id_ticket)
            .with_for_update()
            .first()
        )
        if not ticket:
            raise HTTPException(404, "Ticket no encontrado")
        return ticket

    def _registrar_historial(
        self,
        db: Session,
        ticket: Ticket,
        estado_anterior: str,
        estado_nuevo: str,
        usuario: Usuario,
    ) -> None:
        historial = HistorialEstado(
            id_ticket=ticket.id_ticket,
            estado_anterior=estado_anterior,
            estado_actual=estado_nuevo,
            id_usuario=usuario.id_usuario,
        )
        db.add(historial)


    def _es_admin(self, usuario: Usuario) -> bool:
        return usuario.id_rol == 1

    def _es_lider_del_lab(self, usuario: Usuario, id_aula: int) -> bool:
        return (
            usuario.id_rol == 2
            and usuario.is_leader
            and usuario.laboratorio_asignado_id == id_aula
        )


ticket_service = TicketService()
