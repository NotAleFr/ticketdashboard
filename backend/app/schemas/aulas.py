from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, StringConstraints
from app.core.tipos import Entero

EstadoEquipo = Literal["Operativo", "En Mantenimiento", "Inoperativo"]
Texto50 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
Texto100 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class AulaBase(BaseModel):
    nombre: str
    ubicacion: Optional[str] = None
    activo: bool = True


class AulaCreate(AulaBase):
    nombre: Texto50
    ubicacion: Optional[Texto100] = None


class AulaUpdate(BaseModel):
    nombre: Optional[Texto50] = None
    ubicacion: Optional[Texto100] = None
    activo: Optional[bool] = None


class AulaRead(AulaBase):
    id_aula: int

    model_config = ConfigDict(from_attributes=True)


class EquipoBase(BaseModel):
    tipo: str
    identificador: str
    id_aula: int
    estado_actual: str = "Operativo"


class EquipoCreate(EquipoBase):
    id_aula: Entero
    tipo: Texto50
    identificador: Texto50
    estado_actual: EstadoEquipo = "Operativo"


class EquipoUpdate(BaseModel):
    tipo: Optional[Texto50] = None
    identificador: Optional[Texto50] = None
    id_aula: Optional[Entero] = None
    estado_actual: Optional[EstadoEquipo] = None


class EquipoRead(EquipoBase):
    id_equipo: int

    model_config = ConfigDict(from_attributes=True)
