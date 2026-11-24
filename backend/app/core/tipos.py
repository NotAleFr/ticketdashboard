from typing import Annotated

from pydantic import Field

# Las columnas numéricas de la BD son INTEGER (32 bits). Un número mayor que llega a
# una consulta hace fallar PostgreSQL ("out of range") y termina en 500; con este tipo
# se responde 422 desde la validación, venga en la ruta, la consulta o el cuerpo.
MAXIMO_INTEGER = 2_147_483_647
Entero = Annotated[int, Field(ge=-MAXIMO_INTEGER - 1, le=MAXIMO_INTEGER)]
