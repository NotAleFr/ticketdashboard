# backend/app/services/ticket_service.py
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.tickets import Ticket
from app.models.usuarios import Usuario
from app.models.aulas import Aula
from app.models.tracking import Tracking
# from app.models.equipos import Equipo  # si tienes modelo de equipos

# --- Estados válidos ---
ESTADO_ABIERTO = "abierto"
ESTADO_EN_PROCESO = "en_proceso"
ESTADO_RESUELTO = "resuelto"
ESTADO_CERRADO = "cerrado"

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

    def asignar_tecnico(self, db: Session, id_ticket: int, id_tecnico: int) -> Ticket:
        """
        Asigna un técnico al ticket validando que pertenezca al mismo laboratorio.
        Cambia estado Abierto → En Proceso.
        """
        ticket = self._obtener_ticket(db, id_ticket)
        tecnico = db.query(Usuario).filter(Usuario.id == id_tecnico).first()

        if not tecnico:
            raise HTTPException(404, "El técnico no existe")

        # Validación clave del enrutamiento
        if tecnico.laboratorio_asignado_id != ticket.id_aula:
            raise HTTPException(
                400,
                "El técnico no pertenece al laboratorio del ticket",
            )

        estado_anterior = ticket.estado
        ticket.id_tecnico_asignado = tecnico.id
        ticket.estado = ESTADO_EN_PROCESO

        self._registrar_historial(db, ticket, estado_anterior, ESTADO_EN_PROCESO)
        self._actualizar_estado_equipo(db, ticket)
        db.commit()
        db.refresh(ticket)
        return ticket

    # ---------- CAMBIO DE ESTADOS ----------

    def cambiar_estado(
        self, db: Session, id_ticket: int, nuevo_estado: str, usuario: Usuario
    ) -> Ticket:
        ticket = self._obtener_ticket(db, id_ticket)
        estado_anterior = ticket.estado

        # Validar que la transición sea válida
        if nuevo_estado not in TRANSICIONES_VALIDAS.get(estado_anterior, []):
            raise HTTPException(
                400,
                f"Transición inválida: {estado_anterior} → {nuevo_estado}",
            )

        # Validaciones específicas por transición
        if nuevo_estado == ESTADO_RESUELTO:
            # Solo el técnico asignado o admin
            if usuario.id != ticket.id_tecnico_asignado and not self._es_admin(usuario):
                raise HTTPException(403, "Solo el técnico asignado puede resolver el ticket")

        if nuevo_estado == ESTADO_CERRADO:
            # Solo el creador, líder del lab o admin
            if (
                usuario.id != ticket.id_usuario_creador
                and not self._es_lider_del_lab(usuario, ticket.id_aula)
                and not self._es_admin(usuario)
            ):
                raise HTTPException(403, "No tienes permiso para cerrar este ticket")

        ticket.estado = nuevo_estado

        self._registrar_historial(db, ticket, estado_anterior, nuevo_estado, usuario)
        self._actualizar_estado_equipo(db, ticket)
        db.commit()
        db.refresh(ticket)
        return ticket

    # ---------- HELPERS PRIVADOS ----------

    def _obtener_ticket(self, db: Session, id_ticket: int) -> Ticket:
        ticket = db.query(Ticket).filter(Ticket.id == id_ticket).first()
        if not ticket:
            raise HTTPException(404, "Ticket no encontrado")
        return ticket

    def _registrar_historial(
        self,
        db: Session,
        ticket: Ticket,
        estado_anterior: str,
        estado_nuevo: str,
        usuario: Usuario | None = None,
    ):
        historial = Tracking(
            id_ticket=ticket.id,
            estado_anterior=estado_anterior,
            estado_nuevo=estado_nuevo,
            id_usuario=usuario.id if usuario else None,
        )
        db.add(historial)

    def _actualizar_estado_equipo(self, db: Session, ticket: Ticket):
        """Sincroniza el estado del equipo con el estado del ticket."""
        if not getattr(ticket, "id_equipo", None):
            return
        pass

    def _es_admin(self, usuario: Usuario) -> bool:
        return usuario.id_rol == 1

    def _es_lider_del_lab(self, usuario: Usuario, id_aula: int) -> bool:
        return (
            usuario.id_rol == 2
            and usuario.is_leader
            and usuario.laboratorio_asignado_id == id_aula
        )


ticket_service = TicketService()