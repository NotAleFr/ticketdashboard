import jwt
from app.core.config import settings

def verify_token(token: str) -> dict:
    """
    Decodes and verifies a Supabase JWT token.
    Returns the payload dictionary if valid. Raises an exception if invalid.
    """
    try:
        # Decode the token using our secret
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Invalid token: {str(e)}")
