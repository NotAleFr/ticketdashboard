from sqlalchemy import Boolean
from sqlalchemy import true
import enum
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.database import Base

class Aula(Base):
    __tablename__ = "AULAS"
    id_aula = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    ubicacion = Column(String, nullable=True)
    activo = Column(Boolean)

class Equipo(Base):
    __tablename__ = "EQUIPOS"
    id_equipo = Column(Integer, primary_key=True, index=True)
    tipo = Column(String, nullable=False)
    identificador = Column(String, nullable=False)
    id_aula = Column(ForeignKey("AULAS.id_aula",ondelete="RESTRICT"), nullable=False)
    estado_actual = Column(String, nullable=False, default="Operativo")