from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.usuarios import Usuario
from app.schemas.users import UsuarioCreate, UsuarioUpdate, UsuarioRead

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])


@router.get("/", response_model=list[UsuarioRead])
def listar_usuarios(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(require_admin),
):
    return db.query(Usuario).all()


@router.get("/{id_usuario}", response_model=UsuarioRead)
def obtener_usuario(
    id_usuario: UUID,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    usuario = db.query(Usuario).filter(Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario_actual.id_rol != 1 and usuario.id_usuario != usuario_actual.id_usuario:
        raise HTTPException(status_code=403, detail="No tienes acceso a este usuario")
    return usuario


@router.post("/", response_model=UsuarioRead, status_code=201)
def crear_usuario(
    datos: UsuarioCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(require_admin),
):
    # The profile UUID must match an existing Supabase Auth user.
    nuevo = Usuario(**datos.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.put("/{id_usuario}", response_model=UsuarioRead)
def actualizar_usuario(
    id_usuario: UUID,
    datos: UsuarioUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(require_admin),
):
    usuario = db.query(Usuario).filter(Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(usuario, campo, valor)

    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete("/{id_usuario}", status_code=204)
def eliminar_usuario(
    id_usuario: UUID,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(require_admin),
):
    usuario = db.query(Usuario).filter(Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    db.delete(usuario)
    db.commit()
