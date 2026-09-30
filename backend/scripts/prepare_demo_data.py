"""Prepare the minimum catalog data required by the presentation flow.

Run from ``backend`` after a Supabase Auth user exists:

    python scripts/prepare_demo_data.py --auth-user-id <UUID>

The script is idempotent. It never creates an Auth identity and only links the
specified, existing identity to an Administrator profile.
"""

from __future__ import annotations

import argparse
from uuid import UUID

from sqlalchemy import text

from app.db.database import SessionLocal
from app.models.aulas import Aula, Equipo
from app.models.tickets import Ticket, TicketProblema, TipoProblema
from app.models.usuarios import Rol, Usuario


DEMO_AULA = "Laboratorio de Cómputo A"
DEMO_EQUIPO = "PC-A-01"
DEMO_CATEGORIAS = ("Hardware", "Red e Internet", "Software")


def prepare_schema(db) -> None:
    """Add fields required by the current API without altering existing data."""
    db.execute(text("ALTER TABLE public.aulas ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true"))
    db.execute(
        text(
            "ALTER TABLE public.usuarios "
            "ADD COLUMN IF NOT EXISTS debe_cambiar_password boolean NOT NULL DEFAULT false"
        )
    )
    db.commit()


def get_auth_email(db, auth_user_id: UUID) -> str:
    email = db.execute(
        text("SELECT email FROM auth.users WHERE id = :id"), {"id": auth_user_id}
    ).scalar_one_or_none()
    if not email:
        raise ValueError("The supplied UUID does not belong to a Supabase Auth user.")
    return email


def ensure_catalogs(db) -> tuple[Aula, Equipo, list[TipoProblema]]:
    roles = ((1, "Administrador"), (2, "Técnico"), (3, "Maestro"))
    for id_rol, nombre in roles:
        if not db.get(Rol, id_rol):
            db.add(Rol(id_rol=id_rol, nombre=nombre))

    aula = db.query(Aula).filter(Aula.nombre == DEMO_AULA).first()
    if not aula:
        aula = Aula(nombre=DEMO_AULA, ubicacion="Edificio de Ingeniería", activo=True)
        db.add(aula)
        db.flush()

    equipo = (
        db.query(Equipo)
        .filter(Equipo.id_aula == aula.id_aula, Equipo.identificador == DEMO_EQUIPO)
        .first()
    )
    if not equipo:
        equipo = Equipo(
            tipo="PC de escritorio",
            identificador=DEMO_EQUIPO,
            id_aula=aula.id_aula,
            estado_actual="Operativo",
        )
        db.add(equipo)

    categorias: list[TipoProblema] = []
    for nombre in DEMO_CATEGORIAS:
        categoria = db.query(TipoProblema).filter(TipoProblema.nombre == nombre).first()
        if not categoria:
            categoria = TipoProblema(nombre=nombre)
            db.add(categoria)
        categorias.append(categoria)

    db.commit()
    db.refresh(aula)
    db.refresh(equipo)
    for categoria in categorias:
        db.refresh(categoria)
    return aula, equipo, categorias


def ensure_demo_profile(db, auth_user_id: UUID, email: str) -> Usuario:
    profile = db.get(Usuario, auth_user_id)
    if profile:
        profile.id_rol = 1
        profile.debe_cambiar_password = False
    else:
        profile = Usuario(
            id_usuario=auth_user_id,
            nombre="Demo",
            apellido="Administrador",
            email=email,
            id_rol=1,
            debe_cambiar_password=False,
        )
        db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


def ensure_tickets(db, profile: Usuario, aula: Aula, equipo: Equipo, categorias: list[TipoProblema]) -> None:
    demo_tickets = (
        ("Equipo no enciende", "La PC A-01 no responde al botón de encendido.", equipo.id_equipo, "Abierto", categorias[0]),
        ("Conexión inestable", "La conexión del aula se interrumpe durante la clase.", None, "Abierto", categorias[1]),
    )
    for titulo, descripcion, id_equipo, estado, categoria in demo_tickets:
        ticket = (
            db.query(Ticket)
            .filter(Ticket.id_usuario == profile.id_usuario, Ticket.nombre_ticket == titulo)
            .first()
        )
        if not ticket:
            ticket = Ticket(
                nombre_ticket=titulo,
                descripcion=descripcion,
                id_aula=aula.id_aula,
                id_equipo=id_equipo,
                id_usuario=profile.id_usuario,
                estado=estado,
            )
            db.add(ticket)
            db.flush()
            db.add(TicketProblema(id_ticket=ticket.id_ticket, id_tipo_problema=categoria.id_tipo_problema))
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--auth-user-id", required=True, type=UUID)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        prepare_schema(db)
        email = get_auth_email(db, args.auth_user_id)
        aula, equipo, categorias = ensure_catalogs(db)
        profile = ensure_demo_profile(db, args.auth_user_id, email)
        ensure_tickets(db, profile, aula, equipo, categorias)
        print("Demo data is ready for the supplied Supabase Auth user.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
