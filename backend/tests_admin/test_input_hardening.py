import csv
import io
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.models.tickets import Ticket
from tests_admin.test_role_boundaries import headers_for, role_accounts  # noqa: F401


@pytest.mark.parametrize("body", [
    b'{"email": NaN}',
    b'{"email": Infinity}',
    b'{"email": "\\ud800@example.com"}',
    b'{"email": "a\\u0000@example.com"}',
])
def test_unencodable_input_is_rejected_with_422_not_500(client, body):
    response = client.post("/auth/recovery", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422


def test_nul_in_ticket_text_never_reaches_the_database(client, role_accounts):
    response = client.post(
        "/tickets/", headers=headers_for(role_accounts["teacher"]),
        json={"nombre_ticket": "a\u0000b", "descripcion": "d", "id_aula": 1, "problemas_ids": [1]},
    )
    assert response.status_code == 422


def test_validation_errors_do_not_echo_the_input(client):
    response = client.post("/auth/recovery", json={"email": "no-es-correo"})
    assert response.status_code == 422
    assert all("input" not in error for error in response.json()["detail"])


def test_query_string_nul_is_rejected(client, role_accounts):
    response = client.get("/reportes?periodo=hoy%00", headers=headers_for(role_accounts["admin"]))
    assert response.status_code == 422


@pytest.mark.parametrize("claims", [
    {"aud": "authenticated"},  # sin exp
    {"aud": "anon", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
    {"exp": datetime.now(timezone.utc) + timedelta(minutes=5)},  # sin aud
])
def test_tokens_must_be_user_sessions_with_expiry(client, role_accounts, claims):
    from app.core.config import settings
    token = jwt.encode({"sub": str(role_accounts["admin"]), **claims}, settings.supabase_jwt_secret, algorithm="HS256")
    assert client.get("/usuarios/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_ticket_detail_includes_current_names(client, role_accounts):
    detail = client.get("/tickets/101", headers=headers_for(role_accounts["admin"])).json()
    assert detail["nombre_aula"] == "Lab A"
    assert detail["nombre_tecnico"] == "tech Fixture"
    assert detail["nombre_reportante"] == "teacher Fixture"


def test_csv_dates_are_local_without_microseconds(client, role_accounts, db_session):
    ticket = db_session.get(Ticket, 101)
    ticket.fecha_registro = datetime(2026, 10, 22, 2, 0, 0, 123456, tzinfo=timezone.utc)
    db_session.flush()
    response = client.get("/reportes/exportar?periodo=todos", headers=headers_for(role_accounts["admin"]))
    rows = list(csv.reader(io.StringIO(response.text.lstrip("﻿"))))
    fila = next(row for row in rows[1:] if row[0] == "101")
    assert fila[5] == "2026-10-21 19:00"


def test_blank_phone_is_stored_as_null(client, role_accounts):
    response = client.put(
        f"/usuarios/{role_accounts['teacher']}", headers=headers_for(role_accounts["admin"]),
        json={"telefono": "   "},
    )
    assert response.status_code == 200
    assert response.json()["telefono"] is None


def test_admin_cannot_reset_own_password(client, role_accounts):
    response = client.post(
        f"/usuarios/{role_accounts['admin']}/password", headers=headers_for(role_accounts["admin"]),
    )
    assert response.status_code == 422


GRANDE = 3_000_000_000  # no cabe en INTEGER de PostgreSQL


@pytest.mark.parametrize("method,path,body", [
    ("get", f"/tickets/{GRANDE}", None),
    ("get", f"/aulas/{GRANDE}", None),
    ("get", f"/usuarios/tecnicos?id_aula={GRANDE}", None),
    ("get", f"/reportes?id_aula={GRANDE}", None),
    ("post", "/tickets/", {"nombre_ticket": "a", "descripcion": "d", "id_aula": GRANDE, "problemas_ids": [1]}),
    ("post", "/tickets/", {"nombre_ticket": "a", "descripcion": "d", "id_aula": 1, "problemas_ids": [str(GRANDE)]}),
    ("post", "/tickets/", {"nombre_ticket": "a", "descripcion": "d", "id_aula": 1, "id_equipo": float(GRANDE), "problemas_ids": [1]}),
])
def test_out_of_range_ids_are_422_not_500(client, role_accounts, method, path, body):
    kwargs = {"headers": headers_for(role_accounts["admin"])}
    if body is not None:
        kwargs["json"] = body
    assert getattr(client, method)(path, **kwargs).status_code == 422


def test_equipment_names_are_unique_per_classroom(client, role_accounts, db_session):
    from app.models.aulas import Aula
    db_session.add(Aula(id_aula=50, nombre="Otra aula", activo=True))
    db_session.flush()
    admin = headers_for(role_accounts["admin"])
    nuevo = lambda aula: client.post("/equipos", headers=admin, json={"tipo": "Computadora", "identificador": "Equipo 1", "id_aula": aula})
    assert nuevo(1).status_code == 201
    assert nuevo(50).status_code == 201
    assert nuevo(1).status_code == 409
