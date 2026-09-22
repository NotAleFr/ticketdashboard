import enum
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, PrimaryKeyConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship


from app.db.database import Base

class EstadoTicket(str, enum.Enum):
    ABIERTO = "Abierto"
    EN_PROCESO = "En Proceso"
    RESUELTO = "Resuelto"
    CERRADO = "Cerrado"

class Ticket(Base):
    __tablename__ = "TICKETS"
    id_ticket = Column(Integer, primary_key=True, index=True)
    nombre_ticket = Column(String(100), nullable=False)
    descripcion = Column(Text, nullable=False)
    fecha_registro = Column(DateTime, server_default=func.now())
    estado = Column(String(30), default=EstadoTicket.ABIERTO.value)

    #FK's
    id_usuario = Column(ForeignKey("USUARIOS.id_usuario",ondelete="RESTRICT"), nullable=False)
    id_tecnico = Column(ForeignKey("USUARIOS.id_usuario",ondelete="SET NULL"), nullable=True)
    id_aula = Column(ForeignKey("AULAS.id_aula",ondelete="RESTRICT"), nullable=False)
    id_equipo = Column(ForeignKey("EQUIPOS.id_equipo",ondelete="SET NULL"), nullable=True)

class TipoProblema(Base):
    __tablename__ = "TIPOS_PROBLEMA"
    id_tipo_problema = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)

class TicketProblema(Base):
    __tablename__ = "TICKETS_PROBLEMAS"
    __table_args__ = (PrimaryKeyConstraint('id_ticket', 'id_tipo_problema'),)
    id_ticket = Column(ForeignKey("TICKETS.id_ticket",ondelete="CASCADE"), nullable=False)
    id_tipo_problema = Column(ForeignKey("TIPOS_PROBLEMA.id_tipo_problema",ondelete="RESTRICT"), nullable=False)
    