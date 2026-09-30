import json
import urllib.request
from urllib.error import HTTPError, URLError

import jwt
from jwt.exceptions import PyJWKClientConnectionError

from app.core.config import settings


class DirectPyJWKClient(jwt.PyJWKClient):
    """Fetch public JWKS without inheriting a broken local HTTP proxy."""

    def fetch_data(self):
        jwk_set = None
        try:
            request = urllib.request.Request(url=self.uri, headers=self.headers)
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({}),
                urllib.request.HTTPSHandler(context=self.ssl_context),
            )
            with opener.open(request, timeout=self.timeout) as response:
                jwk_set = json.load(response)
        except (URLError, TimeoutError) as error:
            if isinstance(error, HTTPError):
                error.close()
            raise PyJWKClientConnectionError(
                f'Fail to fetch data from the url, err: "{error}"'
            ) from error
        finally:
            if self.jwk_set_cache is not None:
                self.jwk_set_cache.put(jwk_set)
        return jwk_set


_jwks_clients: dict[str, DirectPyJWKClient] = {}


def _get_jwks_client(supabase_url: str) -> DirectPyJWKClient:
    """Cache the public-key client per Supabase project URL."""
    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return _jwks_clients.setdefault(jwks_url, DirectPyJWKClient(jwks_url))

def verify_token(token: str) -> dict:
    """
    Decodes and verifies a Supabase JWT token.
    Returns the payload dictionary if valid. Raises an exception if invalid.
    """
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
        if algorithm == "HS256":
            if not settings.supabase_jwt_secret:
                raise ValueError("SUPABASE_JWT_SECRET is not configured")
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )

        if algorithm == "ES256":
            if not settings.supabase_url:
                raise ValueError("SUPABASE_URL is not configured")
            signing_key = _get_jwks_client(settings.supabase_url).get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                options={"verify_aud": False},
            )

        raise ValueError("Unsupported token signing algorithm")
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {str(e)}")
