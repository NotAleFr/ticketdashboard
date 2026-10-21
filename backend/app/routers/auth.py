"""User-scoped password recovery; Supabase owns credentials and email delivery."""
import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, SecretStr
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, token_bearer
from app.db.database import get_db
from app.models.usuarios import Usuario

router = APIRouter(prefix="/auth", tags=["Autenticación"])
logger = logging.getLogger(__name__)
RECOVERY_MESSAGE = (
    "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."
)


class RecoveryRequest(BaseModel):
    email: EmailStr
    captcha_token: str | None = None


class PasswordUpdate(BaseModel):
    password: SecretStr


def supabase_auth_request(method, path, payload, token=None):
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(503, "Falta configurar Supabase Auth en el servidor.")
    headers = {
        "apikey": settings.supabase_publishable_key,
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(
        f"{settings.supabase_url.rstrip('/')}/auth/v1{path}",
        method=method,
        headers=headers,
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        with urlopen(request, timeout=15):
            return
    except HTTPError as error:
        if error.code == 429:
            raise HTTPException(429, "Demasiados intentos. Inténtalo más tarde.") from None
        if token and error.code in (401, 403):
            raise HTTPException(401, "La sesión no es válida. Solicita un enlace nuevo.") from None
        if token and error.code in (400, 422):
            raise HTTPException(
                422, "Supabase rechazó la contraseña. Revisa su política e intenta otra."
            ) from None
        logger.warning("Supabase Auth rechazó una operación; HTTP %s", error.code)
        raise HTTPException(502, "No fue posible completar la operación con Supabase.") from None
    except (URLError, TimeoutError):
        raise HTTPException(502, "No fue posible conectar con Supabase.") from None


@router.post("/recovery")
def request_password_recovery(data: RecoveryRequest):
    query = urlencode({"redirect_to": settings.password_recovery_redirect_url})
    payload = {"email": str(data.email)}
    if data.captcha_token:
        payload["gotrue_meta_security"] = {"captcha_token": data.captcha_token}
    supabase_auth_request("POST", f"/recover?{query}", payload)
    return {"message": RECOVERY_MESSAGE}


@router.put("/password")
def update_password(
    data: PasswordUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(token_bearer),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    password = data.password.get_secret_value()
    # Validate here so validation responses never echo the submitted password.
    if not 8 <= len(password) <= 128:
        raise HTTPException(422, "La contraseña debe tener entre 8 y 128 caracteres.")
    supabase_auth_request(
        "PUT", "/user", {"password": password}, token=credentials.credentials,
    )
    user.debe_cambiar_password = False
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("No se pudo sincronizar el perfil %s", user.id_usuario)
        raise HTTPException(
            503,
            "Tu contraseña ya cambió, pero no se pudo actualizar el estado de tu perfil. "
            "Contacta al administrador.",
        ) from None
    return {"message": "Contraseña actualizada correctamente."}
