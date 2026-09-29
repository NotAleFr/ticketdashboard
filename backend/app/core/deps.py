"""
Dependencia real de autenticación (API-42).
Utiliza HTTPBearer para extraer el token JWT del header de la petición.
Usa app.core.security para validarlo contra el secreto de Supabase.
Busca al usuario en la base de datos y lo devuelve, o lanza un error 401/404.
"""

from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.usuarios import Usuario
from app.core.security import verify_token

# Instanciamos el esquema de seguridad Bearer
token_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(token_bearer),
    db: Session = Depends(get_db)
    ) -> Usuario:
    
    # Validar el token usando nuestra función de seguridad
    try:
        payload = verify_token(credentials.credentials)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extraer el 'sub' del token
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token no contiene un identificador de usuario (sub)",
        )
        
    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El 'sub' del token no es un UUID válido",
        )

    # Buscar al usuario en la tabla USUARIOS usando el UUID
    user = db.query(Usuario).filter(Usuario.id_usuario == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario autenticado no encontrado en la base de datos local",
        )
        
    return user
