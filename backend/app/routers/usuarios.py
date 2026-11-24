from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime, timezone
import secrets
import logging
from app.models.aulas import Aula
from app.services.user_admin import auth_request, auth_metadata
from app.schemas.users import UsuarioAdminRead, UsuarioProvisionado, UsuarioEstadoUpdate
from app.core.deps import SQL_SUSPENDIDA, filtrar_no_suspendidos, get_authenticated_user, get_current_user, require_admin
from app.db.database import get_db
from app.models.usuarios import Usuario
from app.models.tickets import EstadoTicket, Ticket
from app.schemas.users import UsuarioCreate, UsuarioUpdate, UsuarioRead
from app.core.tipos import Entero

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])


def validate_profile(values, db, lab_actual=None):
    if values.get("id_rol") not in (1, 2, 3):
        raise HTTPException(422, "Rol no válido")
    for field in ("nombre", "apellido"):
        value = values.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > 50:
            raise HTTPException(422, "Nombre y apellido son obligatorios (máximo 50 caracteres)")
        values[field] = value.strip()
    telefono = values.get("telefono")
    values["telefono"] = telefono.strip() or None if isinstance(telefono, str) else telefono
    if values.get("is_leader") is None or len(values.get("telefono") or "") > 20:
        raise HTTPException(422, "Datos de perfil no válidos")
    lab = values.get("laboratorio_asignado_id")
    if values.get("is_leader") and (values["id_rol"] != 2 or lab is None):
        raise HTTPException(422, "Un líder debe ser técnico y tener laboratorio asignado")
    # Solo se exige laboratorio activo al asignarlo: si ya estaba asignado y luego se
    # desactivó, el administrador debe poder seguir editando el resto del perfil.
    if lab is not None and lab != lab_actual and not db.query(Aula).filter(Aula.id_aula == lab, Aula.activo.is_(True)).first():
        raise HTTPException(422, "El laboratorio no existe o está inactivo")


def bloquear_administradores(db, admin):
    """Serializa las operaciones que quitan acceso administrativo.

    Bloquea todas las filas de administradores (siempre en el mismo orden, sin
    interbloqueos) y vuelve a comprobar que quien hace la petición sigue siendo
    un administrador habilitado. Así dos administradores que se suspenden o se
    degradan mutuamente al mismo tiempo no pueden dejar el sistema sin ninguno:
    la segunda petición espera y luego es rechazada.
    """
    admins = (
        db.query(Usuario)
        .filter(Usuario.id_rol == 1)
        .order_by(Usuario.id_usuario)
        .with_for_update()
        .populate_existing()
        .all()
    )
    if admin.id_usuario not in {row.id_usuario for row in admins}:
        raise HTTPException(403, "Ya no tienes permisos de administrador")
    if db.bind.dialect.name == "postgresql" and db.execute(
        text(SQL_SUSPENDIDA), {"id": str(admin.id_usuario)}
    ).scalar():
        raise HTTPException(403, "La cuenta está suspendida")


def usuario_bloqueado(db, id_usuario, admin, quita_admin):
    """Lee el usuario con su fila bloqueada hasta el commit.

    Si la operación le quita acceso a un administrador, primero se bloquean
    todos los administradores (incluido él) para mantener un orden único."""
    usuario = obtener_usuario(id_usuario, db, admin)
    if usuario.id_rol == 1 and quita_admin:
        bloquear_administradores(db, admin)
    return (
        db.query(Usuario)
        .filter(Usuario.id_usuario == id_usuario)
        .with_for_update()
        .populate_existing()
        .one()
    )


@router.get("/administracion", response_model=list[UsuarioAdminRead])
def administrar_usuarios(db: Session = Depends(get_db), admin=Depends(require_admin)):
    metadata = auth_metadata(db)
    en_proceso = dict(
        db.query(Ticket.id_tecnico, func.count(Ticket.id_ticket))
        .filter(Ticket.estado == EstadoTicket.EN_PROCESO.value, Ticket.id_tecnico.isnot(None))
        .group_by(Ticket.id_tecnico)
        .all()
    )
    result = []
    for user in db.query(Usuario).order_by(Usuario.nombre, Usuario.apellido).all():
        auth = metadata.get(str(user.id_usuario), {})
        banned = auth.get("banned_until")
        if banned is not None:
            banned = banned.replace(tzinfo=timezone.utc) if banned.tzinfo is None else banned
        suspended = banned is not None and banned > datetime.now(timezone.utc)
        data = UsuarioRead.model_validate(user).model_dump()
        data.update(tickets_en_proceso=en_proceso.get(user.id_usuario, 0), ultimo_acceso=auth.get("last_sign_in_at"), estado=(
            "suspendido" if suspended else "activo" if auth.get("last_sign_in_at") else "invitado"))
        result.append(data)
    return result


@router.get("/", response_model=list[UsuarioRead])
def listar_usuarios(db: Session = Depends(get_db), admin=Depends(require_admin)):
    return db.query(Usuario).all()

@router.get("/me", response_model=UsuarioRead)
def obtener_usuario_actual(
    # Sin exigir cambio de contraseña: el cliente necesita el perfil para pedirlo.
    usuario_actual: Usuario = Depends(get_authenticated_user),
):
    return usuario_actual

@router.get("/tecnicos", response_model=list[UsuarioRead])
def listar_tecnicos(
    id_aula: Entero | None = None,
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

    # Un técnico suspendido no puede entrar, así que tampoco se le puede asignar.
    query = filtrar_no_suspendidos(db, db.query(Usuario).filter(Usuario.id_rol == 2))

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
    except Exception:
        # No solo errores de SQLAlchemy: cualquier fallo deja una cuenta sin perfil.
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
    changes = datos.model_dump(exclude_unset=True)
    # Fila bloqueada: dos ediciones simultáneas no pueden combinar cambios que
    # por separado son válidos (p. ej. un docente marcado como líder).
    usuario = usuario_bloqueado(db, id_usuario, admin, quita_admin=changes.get("id_rol", 1) != 1)
    values = UsuarioRead.model_validate(usuario).model_dump() | changes
    validate_profile(values, db, lab_actual=usuario.laboratorio_asignado_id)
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
    if id_usuario == admin.id_usuario:
        # Quedaría bloqueado hasta cambiarla; para su propia cuenta usa "Cambiar contraseña".
        raise HTTPException(422, "Para tu propia cuenta usa la opción Cambiar contraseña del panel")
    user = obtener_usuario(id_usuario, db, admin)
    password = secrets.token_urlsafe(18)
    # Primero se exige el cambio: si Supabase falla después, la contraseña anterior
    # sigue sirviendo y solo se le pedirá cambiarla; nunca queda una contraseña
    # temporal activa sin la obligación de cambiarla.
    user.debe_cambiar_password = True
    db.commit()
    # Fila bloqueada durante el cambio en Supabase: un PUT /auth/password simultáneo
    # del propio usuario espera y no puede dejar la bandera en False justo antes de
    # que se instale la contraseña temporal.
    user = (
        db.query(Usuario).filter(Usuario.id_usuario == id_usuario)
        .with_for_update().populate_existing().one()
    )
    user.debe_cambiar_password = True
    auth_request("PUT", f"/{id_usuario}", {"password": password})
    db.commit()
    return {"password_temporal": password}


@router.put("/{id_usuario}/estado", status_code=204)
def cambiar_estado(id_usuario: UUID, datos: UsuarioEstadoUpdate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    if id_usuario == admin.id_usuario and datos.suspendido:
        raise HTTPException(422, "No puedes suspender tu propia cuenta")
    usuario_bloqueado(db, id_usuario, admin, quita_admin=datos.suspendido)
    auth_request("PUT", f"/{id_usuario}", {"ban_duration": "876000h" if datos.suspendido else "none"})
