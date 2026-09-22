from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from uuid import UUID

from app.models.tickets import EstadoTicket

class TicketBase(BaseModel):
    nombre_ticket: str
    descripcion: str
    id_aula: int
    id_equipo: Optional[int] = None

class TicketCreate(TicketBase):
    problemas_ids: List[int] 

class TicketRead(TicketBase):
    id_ticket: int
    estado: EstadoTicket
    fecha_registro: datetime
    
    # UUIDs because of Supabase Auth
    id_usuario: UUID
    id_tecnico: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)
