"""
Autenticación (API-42): valida el JWT de Supabase y carga el perfil de USUARIOS.

- get_authenticated_user: sesión válida y cuenta no suspendida.
- get_current_user: además exige que el usuario ya haya cambiado su contraseña
  temporal (debe_cambiar_password = FALSE). Es la dependencia por defecto.
"""

from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.database import get_db
from app.models.usuarios import Usuario
from app.core.security import verify_token

token_bearer = HTTPBearer()

ROL_ADMIN = 1
ROL_TECNICO = 2
ROL_MAESTRO = 3


# Supabase guarda la suspensión en auth.users, que solo existe en PostgreSQL.
SQL_SUSPENDIDA = "SELECT banned_until > now() FROM auth.users WHERE id = :id"


def cuenta_suspendida(db: Session, id_usuario) -> bool:
    if db.bind.dialect.name != "postgresql":
        return False
    return bool(db.execute(text(SQL_SUSPENDIDA), {"id": str(id_usuario)}).scalar())


def filtrar_no_suspendidos(db: Session, query):
    """Excluye de una consulta de Usuario las cuentas suspendidas en Supabase."""
    if db.bind.dialect.name != "postgresql":
        return query
    return query.filter(text(
        "NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = usuarios.id_usuario AND au.banned_until > now())"
    ))


def get_authenticated_user(
    credentials: HTTPAuthorizationCredentials = Depends(token_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    try:
        payload = verify_token(credentials.credentials)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = UUID(str(payload.get("sub")))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token no contiene un usuario válido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(Usuario).filter(Usuario.id_usuario == user_id).first()
    if not user:
        # La identidad existe en Supabase pero no tiene perfil en el sistema.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta no tiene un perfil en el sistema. Contacta al administrador.",
        )

    # Un JWT firmado puede sobrevivir a una suspensión; se valida en cada petición.
    if cuenta_suspendida(db, user.id_usuario):
        raise HTTPException(status_code=403, detail="La cuenta está suspendida")
    return user


def get_current_user(user: Usuario = Depends(get_authenticated_user)) -> Usuario:
    if user.debe_cambiar_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes cambiar tu contraseña temporal antes de continuar.",
        )
    return user


def require_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
    if user.id_rol != ROL_ADMIN:
        raise HTTPException(403, "Solo el administrador puede realizar esta acción")
    return user
