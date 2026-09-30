from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

from app.models.tickets import EstadoTicket

class TicketBase(BaseModel):
    nombre_ticket: str = Field(min_length=1, max_length=100)
    descripcion: str = Field(min_length=1)
    id_aula: int
    id_equipo: Optional[int] = None

class TicketCreate(TicketBase):
    problemas_ids: List[int] = Field(min_length=1)

class TicketUpdate(BaseModel):
    """Todos los campos opcionales: solo se actualiza lo que se envíe."""
    nombre_ticket: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[EstadoTicket] = None
    id_tecnico: Optional[UUID] = None
    id_equipo: Optional[int] = None

class TicketRead(TicketBase):
    id_ticket: int
    estado: EstadoTicket
    fecha_registro: datetime

    # UUIDs because of Supabase Auth
    id_usuario: UUID
    id_tecnico: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


class TipoProblemaRead(BaseModel):
    id_tipo_problema: int
    nombre: str

    model_config = ConfigDict(from_attributes=True)
