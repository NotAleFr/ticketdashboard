from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    supabase_jwt_secret: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_publishable_key: str | None = None
    password_recovery_redirect_url: str = (
        "http://localhost:5173/src/pages/login/nueva-contrasena.html"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

settings = Settings()
