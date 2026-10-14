"""Supabase identity operations, called only by the backend."""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException
from sqlalchemy import text

from app.core.config import settings


def auth_request(method, path, payload=None):
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(503, "Falta configurar Supabase Auth en el servidor")
    request = Request(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={"apikey": settings.supabase_service_role_key,
                 "Authorization": f"Bearer {settings.supabase_service_role_key}",
                 "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=15) as response:
            body = response.read()
            return json.loads(body) if body else None
    except HTTPError as error:
        if error.code == 422:
            raise HTTPException(409, "El correo ya existe o los datos no son válidos") from None
        raise HTTPException(502, "No se pudo actualizar la cuenta en Supabase Auth") from None
    except (URLError, TimeoutError):
        raise HTTPException(502, "No se pudo conectar con Supabase Auth") from None


def auth_metadata(db):
    return {str(row['id']): dict(row) for row in db.execute(text(
        "SELECT id, last_sign_in_at, banned_until FROM auth.users"
    )).mappings()}
