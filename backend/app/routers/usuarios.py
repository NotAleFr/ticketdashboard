from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app.core.deps import get_current_user
from app.db.database import get_db
from app.models.usuarios import Usuario
from app.schemas.users import UsuarioCreate, UsuarioUpdate, UsuarioRead

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])


@router.get("/", response_model=list[UsuarioRead])
def listar_usuarios(db: Session = Depends(get_db)):
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
def obtener_usuario(id_usuario: UUID, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return usuario


@router.post("/", response_model=UsuarioRead, status_code=201)
def crear_usuario(datos: UsuarioCreate, db: Session = Depends(get_db)):
    # Nota: cuando exista Supabase Auth (API-42), el id_usuario debería venir
    # del registro creado en auth.users, no generarse aquí. Por ahora se usa
    # el default de la columna (uuid4 aleatorio) para poder probar el CRUD.
    nuevo = Usuario(**datos.model_dump())
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.put("/{id_usuario}", response_model=UsuarioRead)
def actualizar_usuario(id_usuario: UUID, datos: UsuarioUpdate, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(usuario, campo, valor)

    db.commit()
    db.refresh(usuario)
    return usuario


@router.delete("/{id_usuario}", status_code=204)
def eliminar_usuario(id_usuario: UUID, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.id_usuario == id_usuario).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    db.delete(usuario)
    db.commit()
