import uuid
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, text
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from app.db.database import Base

class Rol(Base):
    __tablename__ = "roles"
    id_rol = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), nullable=False, unique=True)

class Usuario(Base):
    __tablename__ = "usuarios"
    id_usuario = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre = Column(String(50), nullable=False)
    apellido = Column(String(50), nullable=False)
    email = Column(String(100), nullable=False, unique=True)
    telefono = Column(String(20), nullable=True)

    #FKs
    id_rol = Column(ForeignKey("roles.id_rol",ondelete="RESTRICT"), nullable=False)
    laboratorio_asignado_id = Column(ForeignKey("aulas.id_aula",ondelete="SET NULL"), nullable=True)
    
    is_leader = Column(Boolean, nullable=False, default=False)
    debe_cambiar_password = Column(Boolean, nullable=False, server_default=text("false"))
    fecha_registro = Column(DateTime, server_default=func.now())

