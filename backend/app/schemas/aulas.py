from pydantic import BaseModel, ConfigDict
from typing import Optional

class AulaBase(BaseModel):
    nombre: str
    ubicacion: Optional[str] = None
    activo: bool = True

class AulaCreate(AulaBase):
    pass 

class AulaRead(AulaBase):
    id_aula: int
    
    model_config = ConfigDict(from_attributes=True)

class EquipoBase(BaseModel):
    tipo: str
    identificador: str
    id_aula: int
    estado_actual: str = "Operativo"

class EquipoCreate(EquipoBase):
    pass

class EquipoRead(EquipoBase):
    id_equipo: int
    
    model_config = ConfigDict(from_attributes=True)
