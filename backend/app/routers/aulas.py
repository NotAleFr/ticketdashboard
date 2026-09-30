from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.database import get_db
from app.models.aulas import Aula, Equipo
from app.models.tickets import TipoProblema
from app.schemas.aulas import (
    AulaCreate, AulaUpdate, AulaRead,
    EquipoCreate, EquipoUpdate, EquipoRead,
)
from app.schemas.tickets import TipoProblemaRead

router = APIRouter(tags=["Aulas y Equipos"])


def _get_aula_or_404(db: Session, id_aula: int) -> Aula:
    aula = db.query(Aula).filter(Aula.id_aula == id_aula).first()
    if not aula:
        raise HTTPException(status_code=404, detail="Aula no encontrada")
    return aula


def _get_equipo_or_404(db: Session, id_equipo: int) -> Equipo:
    equipo = db.query(Equipo).filter(Equipo.id_equipo == id_equipo).first()
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    return equipo


# ---------------- Aulas ----------------

@router.get("/aulas", response_model=list[AulaRead])
def listar_aulas(
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    return db.query(Aula).all()


@router.get("/aulas/{id_aula}", response_model=AulaRead)
def obtener_aula(
    id_aula: int,
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    return _get_aula_or_404(db, id_aula)


@router.post("/aulas", response_model=AulaRead, status_code=201)
def crear_aula(
    datos: AulaCreate,
    db: Session = Depends(get_db),
    usuario_actual=Depends(require_admin),
):
    nueva = Aula(**datos.model_dump())
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva


@router.put("/aulas/{id_aula}", response_model=AulaRead)
def actualizar_aula(
    id_aula: int,
    datos: AulaUpdate,
    db: Session = Depends(get_db),
    usuario_actual=Depends(require_admin),
):
    aula = _get_aula_or_404(db, id_aula)

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(aula, campo, valor)

    db.commit()
    db.refresh(aula)
    return aula


@router.delete("/aulas/{id_aula}", status_code=204)
def eliminar_aula(
    id_aula: int,
    db: Session = Depends(get_db),
    usuario_actual=Depends(require_admin),
):
    aula = _get_aula_or_404(db, id_aula)

    db.delete(aula)
    db.commit()


# ---------------- Equipos ----------------

@router.get("/equipos", response_model=list[EquipoRead])
def listar_equipos(
    id_aula: int | None = None,
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    query = db.query(Equipo)
    if id_aula is not None:
        query = query.filter(Equipo.id_aula == id_aula)
    return query.all()


@router.get("/equipos/{id_equipo}", response_model=EquipoRead)
def obtener_equipo(
    id_equipo: int,
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    return _get_equipo_or_404(db, id_equipo)


@router.post("/equipos", response_model=EquipoRead, status_code=201)
def crear_equipo(
    datos: EquipoCreate,
    db: Session = Depends(get_db),
    usuario_actual=Depends(require_admin),
):
    _get_aula_or_404(db, datos.id_aula)
    nuevo = Equipo(**datos.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.put("/equipos/{id_equipo}", response_model=EquipoRead)
def actualizar_equipo(
    id_equipo: int,
    datos: EquipoUpdate,
    db: Session = Depends(get_db),
    usuario_actual=Depends(require_admin),
):
    equipo = _get_equipo_or_404(db, id_equipo)

    cambios = datos.model_dump(exclude_unset=True)
    if "id_aula" in cambios:
        _get_aula_or_404(db, cambios["id_aula"])

    for campo, valor in cambios.items():
        setattr(equipo, campo, valor)

    db.commit()
    db.refresh(equipo)
    return equipo


@router.delete("/equipos/{id_equipo}", status_code=204)
def eliminar_equipo(
    id_equipo: int,
    db: Session = Depends(get_db),
    usuario_actual=Depends(require_admin),
):
    equipo = _get_equipo_or_404(db, id_equipo)

    db.delete(equipo)
    db.commit()


@router.get("/tipos-problema", response_model=list[TipoProblemaRead])
def listar_tipos_problema(
    db: Session = Depends(get_db),
    usuario_actual=Depends(get_current_user),
):
    return db.query(TipoProblema).order_by(TipoProblema.id_tipo_problema).all()
