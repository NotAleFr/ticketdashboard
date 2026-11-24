from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.database import get_db
from app.routers import tickets, usuarios, aulas, reportes, auth
from app.core.config import settings
from app.core.input_guard import InputGuardMiddleware, manejar_validacion
from fastapi.exceptions import RequestValidationError

app = FastAPI(title="API - Sistema de Gestión de Tickets")
app.add_exception_handler(RequestValidationError, manejar_validacion)

# Va antes de CORS: Starlette ejecuta primero el último middleware agregado,
# así CORS envuelve también los 422 de esta validación.
app.add_middleware(InputGuardMiddleware)

# Vite development and the packaged Capacitor Android origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tickets.router)
app.include_router(usuarios.router)
app.include_router(aulas.router)
app.include_router(reportes.router)
app.include_router(auth.router)


@app.get("/")
def home():
    return {"message": "API Running"}


@app.get("/test-db")
def test_db(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"state": "DB Running"}
