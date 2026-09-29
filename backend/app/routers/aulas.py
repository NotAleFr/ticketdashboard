from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.aulas import Aula, Equipo
from app.schemas.aulas import (
    AulaCreate, AulaUpdate, AulaRead,
    EquipoCreate, EquipoUpdate, EquipoRead,
)

router = APIRouter(tags=["Aulas y Equipos"])


# ---------------- Aulas ----------------

@router.get("/aulas", response_model=list[AulaRead])
def listar_aulas(db: Session = Depends(get_db)):
    return db.query(Aula).all()


@router.get("/aulas/{id_aula}", response_model=AulaRead)
def obtener_aula(id_aula: int, db: Session = Depends(get_db)):
    aula = db.query(Aula).filter(Aula.id_aula == id_aula).first()
    if not aula:
        raise HTTPException(status_code=404, detail="Aula no encontrada")
    return aula


@router.post("/aulas", response_model=AulaRead, status_code=201)
def crear_aula(datos: AulaCreate, db: Session = Depends(get_db)):
    nueva = Aula(**datos.model_dump())
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva


@router.put("/aulas/{id_aula}", response_model=AulaRead)
def actualizar_aula(id_aula: int, datos: AulaUpdate, db: Session = Depends(get_db)):
    aula = db.query(Aula).filter(Aula.id_aula == id_aula).first()
    if not aula:
        raise HTTPException(status_code=404, detail="Aula no encontrada")

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(aula, campo, valor)

    db.commit()
    db.refresh(aula)
    return aula


@router.delete("/aulas/{id_aula}", status_code=204)
def eliminar_aula(id_aula: int, db: Session = Depends(get_db)):
    aula = db.query(Aula).filter(Aula.id_aula == id_aula).first()
    if not aula:
        raise HTTPException(status_code=404, detail="Aula no encontrada")

    db.delete(aula)
    db.commit()


# ---------------- Equipos ----------------

@router.get("/equipos", response_model=list[EquipoRead])
def listar_equipos(id_aula: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Equipo)
    if id_aula:
        query = query.filter(Equipo.id_aula == id_aula)
    return query.all()


@router.get("/equipos/{id_equipo}", response_model=EquipoRead)
def obtener_equipo(id_equipo: int, db: Session = Depends(get_db)):
    equipo = db.query(Equipo).filter(Equipo.id_equipo == id_equipo).first()
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    return equipo


@router.post("/equipos", response_model=EquipoRead, status_code=201)
def crear_equipo(datos: EquipoCreate, db: Session = Depends(get_db)):
    nuevo = Equipo(**datos.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.put("/equipos/{id_equipo}", response_model=EquipoRead)
def actualizar_equipo(id_equipo: int, datos: EquipoUpdate, db: Session = Depends(get_db)):
    equipo = db.query(Equipo).filter(Equipo.id_equipo == id_equipo).first()
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(equipo, campo, valor)

    db.commit()
    db.refresh(equipo)
    return equipo


@router.delete("/equipos/{id_equipo}", status_code=204)
def eliminar_equipo(id_equipo: int, db: Session = Depends(get_db)):
    equipo = db.query(Equipo).filter(Equipo.id_equipo == id_equipo).first()
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")

    db.delete(equipo)
    db.commit()
