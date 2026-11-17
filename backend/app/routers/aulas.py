from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.database import get_db
from app.models.aulas import Aula, Equipo
from app.models.tickets import EstadoTicket, Ticket
from app.services.ticket_service import tickets_en_proceso
from app.schemas.aulas import (
    AulaCreate, AulaUpdate, AulaRead,
    EquipoCreate, EquipoUpdate, EquipoRead,
)

# Toda la API de inventario exige sesión; las escrituras, administrador.
router = APIRouter(tags=["Aulas y Equipos"], dependencies=[Depends(get_current_user)])


def _aula(db: Session, id_aula: int) -> Aula:
    aula = db.query(Aula).filter(Aula.id_aula == id_aula).first()
    if not aula:
        raise HTTPException(status_code=404, detail="Aula no encontrada")
    return aula


def _equipo(db: Session, id_equipo: int, bloquear: bool = False) -> Equipo:
    consulta = db.query(Equipo).filter(Equipo.id_equipo == id_equipo)
    # Con bloqueo, las validaciones contra sus tickets no compiten con
    # crear/asignar/resolver, que bloquean la misma fila del equipo.
    equipo = (consulta.with_for_update() if bloquear else consulta).first()
    if not equipo:
        raise HTTPException(status_code=404, detail="Equipo no encontrado")
    return equipo


def _guardar(db: Session, objeto):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "El registro entra en conflicto con otro existente") from None
    db.refresh(objeto)
    return objeto


# ---------------- Aulas ----------------

@router.get("/aulas", response_model=list[AulaRead])
def listar_aulas(activas: bool = False, db: Session = Depends(get_db)):
    query = db.query(Aula)
    if activas:
        query = query.filter(Aula.activo.is_(True))
    return query.order_by(Aula.nombre, Aula.id_aula).all()


@router.get("/aulas/{id_aula}", response_model=AulaRead)
def obtener_aula(id_aula: int, db: Session = Depends(get_db)):
    return _aula(db, id_aula)


@router.post("/aulas", response_model=AulaRead, status_code=201, dependencies=[Depends(require_admin)])
def crear_aula(datos: AulaCreate, db: Session = Depends(get_db)):
    nueva = Aula(**datos.model_dump())
    db.add(nueva)
    return _guardar(db, nueva)


@router.put("/aulas/{id_aula}", response_model=AulaRead, dependencies=[Depends(require_admin)])
def actualizar_aula(id_aula: int, datos: AulaUpdate, db: Session = Depends(get_db)):
    aula = _aula(db, id_aula)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        if valor is None and campo != "ubicacion":
            raise HTTPException(422, f"El campo {campo} no puede quedar vacío")
        setattr(aula, campo, valor)
    return _guardar(db, aula)


@router.delete("/aulas/{id_aula}", status_code=204, dependencies=[Depends(require_admin)])
def desactivar_aula(id_aula: int, db: Session = Depends(get_db)):
    # Baja lógica: conserva tickets y reportes históricos del aula.
    _aula(db, id_aula).activo = False
    db.commit()


# ---------------- Equipos ----------------

@router.get("/equipos", response_model=list[EquipoRead])
def listar_equipos(id_aula: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Equipo)
    if id_aula is not None:
        query = query.filter(Equipo.id_aula == id_aula)
    return query.order_by(Equipo.identificador).all()


@router.get("/equipos/{id_equipo}", response_model=EquipoRead)
def obtener_equipo(id_equipo: int, db: Session = Depends(get_db)):
    return _equipo(db, id_equipo)


@router.post("/equipos", response_model=EquipoRead, status_code=201, dependencies=[Depends(require_admin)])
def crear_equipo(datos: EquipoCreate, db: Session = Depends(get_db)):
    _aula(db, datos.id_aula)
    nuevo = Equipo(**datos.model_dump())
    db.add(nuevo)
    return _guardar(db, nuevo)


@router.put("/equipos/{id_equipo}", response_model=EquipoRead, dependencies=[Depends(require_admin)])
def actualizar_equipo(id_equipo: int, datos: EquipoUpdate, db: Session = Depends(get_db)):
    equipo = _equipo(db, id_equipo, bloquear=True)
    cambios = datos.model_dump(exclude_unset=True)
    if any(valor is None for valor in cambios.values()):
        raise HTTPException(422, "Los campos del equipo no pueden quedar vacíos")
    if "id_aula" in cambios and cambios["id_aula"] != equipo.id_aula:
        _aula(db, cambios["id_aula"])
        # Un ticket activo debe seguir apuntando al aula donde está el equipo.
        activo = db.query(Ticket.id_ticket).filter(
            Ticket.id_equipo == id_equipo, Ticket.estado != EstadoTicket.CERRADO.value
        ).first()
        if activo:
            raise HTTPException(409, "El equipo tiene tickets activos; ciérralos antes de moverlo")
    if cambios.get("estado_actual") == "Operativo" and tickets_en_proceso(db, id_equipo):
        raise HTTPException(409, "El equipo tiene tickets en proceso; no puede marcarse Operativo")
    for campo, valor in cambios.items():
        setattr(equipo, campo, valor)
    return _guardar(db, equipo)


@router.delete("/equipos/{id_equipo}", status_code=204, dependencies=[Depends(require_admin)])
def dar_de_baja_equipo(id_equipo: int, db: Session = Depends(get_db)):
    # Baja lógica: el equipo queda Inoperativo y conserva su historial.
    _equipo(db, id_equipo, bloquear=True).estado_actual = "Inoperativo"
    db.commit()
