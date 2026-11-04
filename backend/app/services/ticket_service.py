# backend/app/services/ticket_service.py
from uuid import UUID

from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.tickets import EstadoTicket, Ticket
from app.models.usuarios import Usuario
from app.models.aulas import Aula, Equipo
from app.models.tracking import HistorialEstado, Solucion


# from app.models.equipos import Equipo  # si tienes modelo de equipos

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


class TicketService:

    # ---------- ENRUTAMIENTO AUTOMÁTICO ----------

    def crear_ticket(self, db: Session, datos: dict, usuario_creador: Usuario) -> Ticket:
        """
        Crea un ticket con id_tecnico = NULL para que caiga en la bandeja
        del laboratorio correspondiente (enrutamiento automático).
        """
        # Validar que el aula exista
        aula = db.query(Aula).filter(Aula.id == datos["id_aula"]).first()
        if not aula:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El aula especificada no existe",
            )

        # Validar consistencia de equipo si viene
        if datos.get("id_equipo"):

            pass

        ticket = Ticket(
            titulo=datos["titulo"],
            descripcion=datos["descripcion"],
            prioridad=datos.get("prioridad", "media"),
            id_aula=datos["id_aula"],
            id_usuario_creador=usuario_creador.id,
            id_tecnico_asignado=None,   # ← clave del enrutamiento automático
            estado=ESTADO_ABIERTO,
        )

        db.add(ticket)
        db.commit()
        db.refresh(ticket)
        return ticket

    def obtener_lider_del_laboratorio(self, db: Session, id_aula: int) -> Usuario | None:
        """Devuelve el líder del laboratorio para notificarle."""
        return (
            db.query(Usuario)
            .filter(
                Usuario.laboratorio_asignado_id == id_aula,
                Usuario.is_leader == True,  # noqa: E712
            )
            .first()
        )

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

        estado_anterior = ticket.estado
        ticket.id_tecnico = tecnico.id_usuario
        ticket.estado = ESTADO_EN_PROCESO

        self._registrar_historial(
            db, ticket, estado_anterior, ticket.estado, usuario
        )
        self._actualizar_estado_equipo(db, ticket)

        db.commit()
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
            self._actualizar_estado_equipo(db, ticket)
            db.commit()
        except Exception:
            db.rollback()
            raise

        db.refresh(ticket)
        return ticket


    # ---------- HELPERS PRIVADOS ----------

    def _obtener_ticket(self, db: Session, id_ticket: int) -> Ticket:
        ticket = db.query(Ticket).filter(Ticket.id_ticket == id_ticket).first()
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


    def _actualizar_estado_equipo(self, db: Session, ticket: Ticket) -> None:
        # Los tickets sin equipo específico no cambian el inventario.
        if ticket.id_equipo is None:
            return

        equipo = (
            db.query(Equipo)
            .filter(Equipo.id_equipo == ticket.id_equipo)
            .first()
        )
        if not equipo:
            raise HTTPException(404, "Equipo no encontrado")

        if ticket.estado == ESTADO_EN_PROCESO:
            equipo.estado_actual = "En Mantenimiento"
        elif ticket.estado in {ESTADO_RESUELTO, ESTADO_CERRADO}:
            equipo.estado_actual = "Operativo"


    def _es_admin(self, usuario: Usuario) -> bool:
        return usuario.id_rol == 1

    def _es_lider_del_lab(self, usuario: Usuario, id_aula: int) -> bool:
        return (
            usuario.id_rol == 2
            and usuario.is_leader
            and usuario.laboratorio_asignado_id == id_aula
        )


ticket_service = TicketService()
