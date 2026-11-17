from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from typing import Annotated, List, Literal, Optional
from datetime import datetime
from uuid import UUID
from app.models.tickets import EstadoTicket

class TicketBase(BaseModel):
    nombre_ticket: str
    descripcion: str
    id_aula: int
    id_equipo: Optional[int] = None

class TicketCreate(TicketBase):
    nombre_ticket: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    descripcion: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    problemas_ids: List[int] = Field(min_length=1, max_length=20)

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

    # UUIDs porque corresponden a Supabase Auth
    id_usuario: UUID
    id_tecnico: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)

class TicketDetalleRead(TicketRead):
    problemas: List[str] = []


class TicketListRead(TicketRead):
    nombre_reportante: str
    correo_reportante: str
    nombre_tecnico: Optional[str] = None
    nombre_aula: Optional[str] = None
    equipo_tipo: Optional[str] = None
    equipo_identificador: Optional[str] = None
    problemas: List[str] = []


class EventoHistorial(BaseModel):
    """Entrada de la línea de tiempo: creación o cambio de estado (con su solución si aplica)."""
    tipo: Literal["creacion", "estado"]
    fecha: Optional[datetime] = None
    nombre_usuario: Optional[str] = None
    estado_anterior: Optional[str] = None
    estado_actual: Optional[str] = None
    texto: Optional[str] = None


class TipoProblemaRead(BaseModel):
    id_tipo_problema: int
    nombre: str

    model_config = ConfigDict(from_attributes=True)


class AsignarTecnicoRequest(BaseModel):
    id_tecnico: UUID

class ResolverTicketRequest(BaseModel):
    texto_solucion: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]

