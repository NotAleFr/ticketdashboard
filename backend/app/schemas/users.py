from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID

class UsuarioBase(BaseModel):
    nombre: str
    apellido: str
    email: EmailStr #Auto validates the string has a @ and a valid domain
    telefono: Optional[str] = None
    id_rol: int
    laboratorio_asignado_id: Optional[int] = None
    is_leader: bool = False

class UsuarioCreate(UsuarioBase):
    # This UUID must already exist in Supabase Auth (auth.users).
    id_usuario: UUID

class UsuarioUpdate(BaseModel):
    """Todos los campos opcionales: solo se actualiza lo que se envíe."""
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    telefono: Optional[str] = None
    id_rol: Optional[int] = None
    laboratorio_asignado_id: Optional[int] = None
    is_leader: Optional[bool] = None

class UsuarioRead(UsuarioBase):
    id_usuario: UUID
    debe_cambiar_password: bool
    fecha_registro: datetime

    model_config = ConfigDict(from_attributes=True)
