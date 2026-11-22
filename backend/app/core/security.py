from functools import lru_cache
import json
import sys
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.request import Request

from fastapi import HTTPException
import jwt
from app.core.config import settings
from app.core.http_transport import open_http


class WorkerJWKClient(jwt.PyJWKClient):
    def fetch_data(self):
        try:
            with open_http(Request(self.uri, headers=self.headers), timeout=self.timeout) as response:
                jwks = json.load(response)
        except (URLError, TimeoutError, ValueError) as error:
            if isinstance(error, HTTPError):
                error.close()
            raise jwt.PyJWKClientConnectionError("Supabase JWKS unavailable") from error

        if self.jwk_set_cache is not None:
            self.jwk_set_cache.put(jwks)
        self._last_successful_fetch = monotonic()
        return jwks

# Guarda el cliente JWKS para no crearlo en cada petición.
@lru_cache(maxsize=4)
def _get_jwks_client(supabase_url: str):
    # Supabase publica aquí las claves para verificar sus tokens ES256.
    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    client = WorkerJWKClient if sys.platform == "emscripten" else jwt.PyJWKClient
    return client(jwks_url, timeout=5)


def verify_token(token: str) -> dict:
    """Verifica un JWT de Supabase y devuelve su contenido."""
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")

        if algorithm == "HS256":
            if not settings.supabase_jwt_secret:
                raise ValueError("Falta configurar SUPABASE_JWT_SECRET")

            signing_key = settings.supabase_jwt_secret

        elif algorithm == "ES256":
            if not settings.supabase_url:
                raise ValueError("Falta configurar SUPABASE_URL")

            jwks_client = _get_jwks_client(settings.supabase_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token).key

        else:
            raise ValueError("El algoritmo del token no es compatible")

        # Aquí sí verificamos la firma y la expiración del token.
        return jwt.decode(
            token,
            signing_key,
            algorithms=[algorithm],
            leeway=5,  # Small clock differences between Supabase and the API host.
            options={"verify_aud": False},
        )

    except jwt.PyJWKClientConnectionError:
        raise HTTPException(503, "No se pudo verificar la sesión con Supabase.") from None
    except jwt.PyJWKClientError:
        raise ValueError("No se encontró una clave válida para verificar la sesión.") from None
    except jwt.ExpiredSignatureError:
        raise ValueError("El token expiró") from None
    except jwt.InvalidTokenError as error:
        raise ValueError(f"Token inválido: {error}") from error
