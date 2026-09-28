from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.database import get_db
from app.routers import tickets, usuarios, aulas

app = FastAPI(title="API - Sistema de Gestión de Tickets")

app.include_router(tickets.router)
app.include_router(usuarios.router)
app.include_router(aulas.router)


@app.get("/")
def home():
    return {"message": "API Running"}


@app.get("/test-db")
def test_db(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"state": "DB Running"}
