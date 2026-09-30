from sqlalchemy import Boolean
import enum
from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.database import Base

class Aula(Base):
    __tablename__ = "aulas"
    id_aula = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    ubicacion = Column(String, nullable=True)
    activo = Column(Boolean, nullable=False, server_default=text("true"))

class Equipo(Base):
    __tablename__ = "equipos"
    id_equipo = Column(Integer, primary_key=True, index=True)
    tipo = Column(String, nullable=False)
    identificador = Column(String, nullable=False)
    id_aula = Column(ForeignKey("aulas.id_aula",ondelete="RESTRICT"), nullable=False)
    estado_actual = Column(String, nullable=False, default="Operativo")
