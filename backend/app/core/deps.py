"""
Dependencia temporal de autenticación.

Mientras API-42 (Integración de Supabase Auth) no esté lista, esta función
simula un usuario ya autenticado para poder construir y probar los
endpoints de API-43 sin bloquearse.

Cuando API-42 esté lista: reemplazar el cuerpo de get_current_user() por la
validación real del JWT de Supabase (con PyJWT, ya está en requirements.txt),
extrayendo el "sub" del token y consultando USUARIOS para obtener su perfil.
La firma de la función (lo que regresa) puede quedar igual, para no tener
que tocar los routers que ya la usan.
"""

from dataclasses import dataclass
from uuid import UUID


@dataclass
class CurrentUser:
    id_usuario: UUID
    id_rol: int
    is_leader: bool


def get_current_user() -> CurrentUser:
    # Usuario de prueba fijo. Ajusta id_rol/is_leader según lo que necesites
    # probar (ver la matriz de roles en docs/Logica.md).
    return CurrentUser(
        id_usuario=UUID("00000000-0000-0000-0000-000000000001"),
        id_rol=1,
        is_leader=True,
    )
