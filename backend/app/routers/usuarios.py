from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime, timezone
import secrets
import logging
from sqlalchemy.exc import SQLAlchemyError
from app.models.aulas import Aula
from app.services.user_admin import auth_request, auth_metadata
from app.schemas.users import UsuarioAdminRead, UsuarioProvisionado, UsuarioEstadoUpdate
from app.core.deps import get_current_user
from app.db.database import get_db
from app.models.usuarios import Usuario
from app.schemas.users import UsuarioCreate, UsuarioUpdate, UsuarioRead

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])


def require_admin(user: Usuario = Depends(get_current_user)):
    if user.id_rol != 1:
        raise HTTPException(403, "Solo el administrador puede administrar usuarios")
    return user


def validate_profile(values, db):
    if values.get("id_rol") not in (1, 2, 3):
        raise HTTPException(422, "Rol no válido")
    for field in ("nombre", "apellido"):
        value = values.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > 50:
            raise HTTPException(422, "Nombre y apellido son obligatorios (máximo 50 caracteres)")
        values[field] = value.strip()
    if values.get("is_leader") is None or len(values.get("telefono") or "") > 20:
        raise HTTPException(422, "Datos de perfil no válidos")
    lab = values.get("laboratorio_asignado_id")
    if values.get("is_leader") and (values["id_rol"] != 2 or lab is None):
        raise HTTPException(422, "Un líder debe ser técnico y tener laboratorio asignado")
    if lab is not None and not db.query(Aula).filter(Aula.id_aula == lab, Aula.activo.is_(True)).first():
        raise HTTPException(422, "El laboratorio no existe o está inactivo")


@router.get("/administracion", response_model=list[UsuarioAdminRead])
def administrar_usuarios(db: Session = Depends(get_db), admin=Depends(require_admin)):
    metadata = auth_metadata(db)
    result = []
    for user in db.query(Usuario).order_by(Usuario.nombre, Usuario.apellido).all():
        auth = metadata.get(str(user.id_usuario), {})
        banned = auth.get("banned_until")
        if banned is not None:
            banned = banned.replace(tzinfo=timezone.utc) if banned.tzinfo is None else banned
        suspended = banned is not None and banned > datetime.now(timezone.utc)
        data = UsuarioRead.model_validate(user).model_dump()
        data.update(ultimo_acceso=auth.get("last_sign_in_at"), estado=(
            "suspendido" if suspended else "activo" if auth.get("last_sign_in_at") else "invitado"))
        result.append(data)
    return result


@router.get("/", response_model=list[UsuarioRead])
def listar_usuarios(db: Session = Depends(get_db), admin=Depends(require_admin)):
    return db.query(Usuario).all()

@router.get("/me", response_model=UsuarioRead)
def obtener_usuario_actual(
    usuario_actual: Usuario = Depends(get_current_user),
):
    return usuario_actual

@router.get("/tecnicos", response_model=list[UsuarioRead])
def listar_tecnicos(
    id_aula: int | None = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    # Solo un administrador o líder puede consultar técnicos para asignar.
    es_admin = usuario_actual.id_rol == 1
    es_lider = usuario_actual.id_rol == 2 and usuario_actual.is_leader

    if not es_admin and not es_lider:
        raise HTTPException(
            status_code=403,
            detail="No tienes permiso para consultar técnicos",
        )

    query = db.query(Usuario).filter(Usuario.id_rol == 2)

    if es_lider:
        aula_del_lider = usuario_actual.laboratorio_asignado_id

        # El líder no puede consultar técnicos de otro laboratorio.
        if id_aula is not None and id_aula != aula_del_lider:
            raise HTTPException(
                status_code=403,
                detail="No puedes consultar técnicos de otro laboratorio",
            )

        query = query.filter(Usuario.laboratorio_asignado_id == aula_del_lider)

    elif id_aula is not None:
        # El administrador puede filtrar los técnicos por aula.
        query = query.filter(Usuario.laboratorio_asignado_id == id_aula)

    return query.order_by(Usuario.nombre, Usuario.apellido).all()


@router.get("/{id_usuario}", response_model=UsuarioRead)
def obtener_usuario(id_usuario: UUID, db: Session = Depends(get_db), admin=Depends(require_admin)):
    usuario = db.query(Usuario).filter(Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return usuario


@router.post("/", response_model=UsuarioProvisionado, status_code=201)
def crear_usuario(datos: UsuarioCreate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    values = datos.model_dump()
    values["email"] = str(datos.email).lower()
    validate_profile(values, db)
    if len(values["email"]) > 100:
        raise HTTPException(422, "Correo demasiado largo")
    if db.query(Usuario).filter(Usuario.email == values["email"]).first():
        raise HTTPException(409, "El correo ya está registrado")
    password = secrets.token_urlsafe(18)
    identity = auth_request("POST", "", {"email": values["email"], "password": password, "email_confirm": True})
    nuevo = Usuario(id_usuario=UUID(identity["id"]), **values)
    db.add(nuevo)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        try:
            auth_request("DELETE", f"/{identity['id']}")
        except HTTPException:
            logging.getLogger(__name__).error("No se pudo cancelar la identidad %s", identity["id"])
            raise HTTPException(502, "No se pudo guardar el perfil ni cancelar la cuenta; contacta al administrador") from None
        raise HTTPException(409, "No se pudo crear el perfil; se canceló la cuenta de acceso") from None
    db.refresh(nuevo)
    return {**UsuarioRead.model_validate(nuevo).model_dump(), "password_temporal": password}


@router.put("/{id_usuario}", response_model=UsuarioRead)
def actualizar_usuario(id_usuario: UUID, datos: UsuarioUpdate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    usuario = obtener_usuario(id_usuario, db, admin)
    changes = datos.model_dump(exclude_unset=True)
    values = UsuarioRead.model_validate(usuario).model_dump() | changes
    validate_profile(values, db)
    if id_usuario == admin.id_usuario and values["id_rol"] != 1:
        raise HTTPException(422, "No puedes quitar tu propio acceso de administrador")
    for campo in changes:
        setattr(usuario, campo, values[campo])
    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete("/{id_usuario}", status_code=204)
def eliminar_usuario(id_usuario: UUID, db: Session = Depends(get_db), admin=Depends(require_admin)):
    obtener_usuario(id_usuario, db, admin)
    raise HTTPException(409, "Suspende la cuenta para conservar su historial")


@router.post("/{id_usuario}/password")
def restablecer_password(id_usuario: UUID, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = obtener_usuario(id_usuario, db, admin)
    password = secrets.token_urlsafe(18)
    auth_request("PUT", f"/{id_usuario}", {"password": password})
    user.debe_cambiar_password = True
    db.commit()
    return {"password_temporal": password}


@router.put("/{id_usuario}/estado", status_code=204)
def cambiar_estado(id_usuario: UUID, datos: UsuarioEstadoUpdate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    obtener_usuario(id_usuario, db, admin)
    if id_usuario == admin.id_usuario and datos.suspendido:
        raise HTTPException(422, "No puedes suspender tu propia cuenta")
    auth_request("PUT", f"/{id_usuario}", {"ban_duration": "876000h" if datos.suspendido else "none"})
