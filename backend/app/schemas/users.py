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
    #todo: check logic for ts
    pass

class UsuarioRead(UsuarioBase):
    id_usuario: UUID
    debe_cambiar_password: bool
    fecha_registro: datetime
    
    model_config = ConfigDict(from_attributes=True)
