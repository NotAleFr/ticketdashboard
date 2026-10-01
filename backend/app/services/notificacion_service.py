# backend/app/services/notification_service.py
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings  


class NotificationService:
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER
        self.smtp_password = settings.SMTP_PASSWORD
        self.from_email = settings.SMTP_FROM or settings.SMTP_USER

    def enviar_correo(self, destinatario: str, asunto: str, cuerpo: str) -> bool:
        """Envía un correo. Devuelve True si se envió, False si falló."""
        if not destinatario:
            return False

        try:
            mensaje = MIMEMultipart()
            mensaje["From"] = self.from_email
            mensaje["To"] = destinatario
            mensaje["Subject"] = asunto
            mensaje.attach(MIMEText(cuerpo, "plain", "utf-8"))

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(mensaje)
            return True
        except Exception as e:
          
            print(f"[SMTP ERROR] No se pudo enviar a {destinatario}: {e}")
            return False

    # --- Métodos de notificación ---

    def notificar_ticket_creado(self, lider_email, ticket):
        self.enviar_correo(
            lider_email,
            f"Nuevo ticket en tu bandeja: {ticket.titulo}",
            f"Se creó el ticket #{ticket.id} en el laboratorio.\n\n"
            f"Título: {ticket.titulo}\n"
            f"Descripción: {ticket.descripcion}\n"
            f"Prioridad: {ticket.prioridad}\n\n"
            f"Ingresa al sistema para asignarlo a un técnico."
        )

    def notificar_ticket_asignado(self, tecnico_email, ticket):
        self.enviar_correo(
            tecnico_email,
            f"Se te asignó el ticket #{ticket.id}",
            f"Tienes un nuevo ticket asignado.\n\n"
            f"Título: {ticket.titulo}\n"
            f"Descripción: {ticket.descripcion}\n"
            f"Prioridad: {ticket.prioridad}\n"
        )

    def notificar_ticket_resuelto(self, maestro_email, ticket):
        self.enviar_correo(
            maestro_email,
            f"Tu ticket #{ticket.id} fue resuelto",
            f"El técnico marcó tu ticket como resuelto.\n\n"
            f"Título: {ticket.titulo}\n\n"
            f"Ingresa al sistema para confirmar la solución y cerrarlo."
        )

    def notificar_ticket_cerrado(self, destinatario_email, ticket):
        self.enviar_correo(
            destinatario_email,
            f"Ticket #{ticket.id} cerrado",
            f"El ticket '{ticket.titulo}' fue cerrado correctamente."
        )

    def notificar_ticket_reabierto(self, tecnico_email, ticket):
        self.enviar_correo(
            tecnico_email,
            f"Ticket #{ticket.id} reabierto",
            f"El ticket '{ticket.titulo}' fue reabierto. La falla persiste.\n\n"
            f"Por favor revísalo de nuevo."
        )
        
notification_service = NotificationService()
