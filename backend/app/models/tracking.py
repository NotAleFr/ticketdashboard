from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.sql import func

from app.db.database import Base

class HistorialEstado(Base):
    __tablename__ = "HISTORIAL_ESTADO"

    id_historial = Column(Integer, primary_key=True, index=True)
    estado_anterior = Column(String(30), nullable=False)
    estado_actual = Column(String(30), nullable=False)
    fecha_cambio = Column(DateTime(timezone=True), server_default=func.now())
    
    # FKs
    id_ticket = Column(ForeignKey("TICKETS.id_ticket", ondelete="CASCADE"), nullable=False)
    id_usuario = Column(ForeignKey("USUARIOS.id_usuario", ondelete="RESTRICT"), nullable=False)

class Notificacion(Base):
    __tablename__ = "NOTIFICACIONES"

    id_notificacion = Column(Integer, primary_key=True, index=True)
    mensaje = Column(String(255), nullable=False)
    leido = Column(Boolean, default=False, nullable=False)
    fecha = Column(DateTime(timezone=True), server_default=func.now())

    # FKs
    id_ticket = Column(ForeignKey("TICKETS.id_ticket", ondelete="CASCADE"), nullable=False)
    id_usuario = Column(ForeignKey("USUARIOS.id_usuario", ondelete="CASCADE"), nullable=False)

class Solucion(Base):
    __tablename__ = "SOLUCIONES"

    id_solucion = Column(Integer, primary_key=True, index=True)
    texto = Column(Text, nullable=False)
    fecha = Column(DateTime(timezone=True), server_default=func.now())

    # FKs
    id_ticket = Column(ForeignKey("TICKETS.id_ticket", ondelete="CASCADE"), nullable=False)
    id_usuario = Column(ForeignKey("USUARIOS.id_usuario", ondelete="RESTRICT"), nullable=False)
