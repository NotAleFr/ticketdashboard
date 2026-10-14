from functools import lru_cache
import jwt
from app.core.config import settings

# Guarda el cliente JWKS para no crearlo en cada petición.
@lru_cache(maxsize=4)
def _get_jwks_client(supabase_url: str):
    # Supabase publica aquí las claves para verificar sus tokens ES256.
    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(jwks_url)


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

    except jwt.ExpiredSignatureError:
        raise ValueError("El token expiró") from None
    except jwt.InvalidTokenError as error:
        raise ValueError(f"Token inválido: {error}") from error
