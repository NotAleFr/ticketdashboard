"""Cloudflare entry point for the existing FastAPI app."""
from urllib.parse import urlsplit

import pg8000
from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from workers import WorkerEntrypoint, asgi

from app.core.config import settings
from app.db.database import get_db
from app.main import app

_configured = False


def configure(env):
    global _configured
    if _configured:
        return

    for key in (
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "PASSWORD_RECOVERY_REDIRECT_URL",
    ):
        value = getattr(env, key, None)
        if not value:
            raise RuntimeError(f"Missing Worker setting {key}")
        setattr(settings, key.lower(), value)

    redirect = urlsplit(settings.password_recovery_redirect_url)
    if redirect.scheme != "https" or not redirect.hostname:
        raise RuntimeError("PASSWORD_RECOVERY_REDIRECT_URL must be an HTTPS URL")
    settings.supabase_jwt_secret = getattr(env, "SUPABASE_JWT_SECRET", None)
    _configured = True


def get_worker_db(request: Request):
    binding = request.scope["env"].HYPERDRIVE

    def connect():
        return pg8000.connect(
            host=binding.host,
            port=int(binding.port),
            user=binding.user,
            password=binding.password,
            database=binding.database,
            ssl_context=False,
        )

    # Hyperdrive owns the pool. Each request closes its own connection,
    # including after a streaming response finishes.
    engine = create_engine("postgresql+pg8000://", creator=connect, poolclass=NullPool,
                           hide_parameters=True)
    try:
        with Session(engine, autoflush=False) as session:
            yield session
    finally:
        engine.dispose()


app.dependency_overrides[get_db] = get_worker_db


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        configure(self.env)
        return await asgi.fetch(app, request, self.env)
