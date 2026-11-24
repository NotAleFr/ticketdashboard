import csv
import io
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest

from app.core.config import settings
from app.models.aulas import Aula
from app.models.tickets import Ticket
from app.models.usuarios import Rol, Usuario


@pytest.fixture
def role_accounts(db_session):
    db_session.add_all(
        Rol(id_rol=role_id, nombre=name)
        for role_id, name in [(1, "Admin"), (2, "Technician"), (3, "Teacher")]
    )
    db_session.add_all([Aula(id_aula=1, nombre="Lab A"), Aula(id_aula=2, nombre="Lab B")])
    db_session.flush()

    accounts = {}
    for name, role, lab, leader, temporary in [
        ("admin", 1, None, False, False),
        ("teacher", 3, None, False, False),
        ("other", 3, None, False, False),
        ("tech", 2, 1, False, False),
        ("leader", 2, 1, True, False),
        ("temporary", 3, None, False, True),
    ]:
        user_id = uuid4()
        accounts[name] = user_id
        db_session.add(Usuario(
            id_usuario=user_id, nombre=name, apellido="Fixture", email=f"{name}@example.com",
            id_rol=role, laboratorio_asignado_id=lab, is_leader=leader,
            debe_cambiar_password=temporary,
        ))
    db_session.flush()
    db_session.add_all([
        Ticket(id_ticket=101, nombre_ticket="Assigned", descripcion="test", estado="En Proceso",
               id_usuario=accounts["teacher"], id_tecnico=accounts["tech"], id_aula=1),
        Ticket(id_ticket=102, nombre_ticket="Other lab", descripcion="test",
               id_usuario=accounts["other"], id_aula=2),
        Ticket(id_ticket=103, nombre_ticket="Same lab", descripcion="test",
               id_usuario=accounts["other"], id_aula=1),
    ])
    db_session.flush()
    return accounts


def headers_for(user_id, secret=None):
    token = jwt.encode(
        {"sub": str(user_id), "aud": "authenticated", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        secret or settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize(("account", "visible"), [
    ("admin", {101, 102, 103}),
    ("teacher", {101}),
    ("other", {102, 103}),
    ("tech", {101}),
    ("leader", {101, 103}),
])
def test_ticket_scope_is_enforced_on_lists_details_history_and_csv(client, role_accounts, account, visible):
    headers = headers_for(role_accounts[account])
    listed = client.get("/tickets/", headers=headers)
    assert listed.status_code == 200
    assert {row["id_ticket"] for row in listed.json()} == visible

    for ticket_id in (101, 102, 103):
        expected = 200 if ticket_id in visible else 404
        assert client.get(f"/tickets/{ticket_id}", headers=headers).status_code == expected
        assert client.get(f"/tickets/{ticket_id}/historial", headers=headers).status_code == expected

    report = client.get("/reportes/exportar?periodo=todos", headers=headers)
    assert report.status_code == 200
    csv_rows = csv.DictReader(io.StringIO(report.text.lstrip("\ufeff")))
    assert {int(row["ID"]) for row in csv_rows} == visible


def test_direct_api_rejects_unauthenticated_non_admin_and_temporary_accounts(client, role_accounts):
    assert client.get("/tickets/").status_code == 401
    assert client.get("/reportes/exportar?periodo=todos").status_code == 401
    for account in ("teacher", "tech", "leader"):
        headers = headers_for(role_accounts[account])
        assert client.get("/usuarios/administracion", headers=headers).status_code == 403
        assert client.delete(f"/usuarios/{role_accounts['admin']}", headers=headers).status_code == 403
    temp_headers = headers_for(role_accounts["temporary"])
    assert client.get("/usuarios/me", headers=temp_headers).status_code == 200
    assert client.get("/tickets/", headers=temp_headers).status_code == 403
    assert client.get("/tickets/", headers=headers_for(role_accounts["admin"], "other-fixture-signing-key-long-enough")).status_code == 401

def test_unassigned_leader_cannot_resolve_or_assign_outside_lab(client, role_accounts):
    leader = headers_for(role_accounts["leader"])
    assert client.post("/tickets/101/resolver", headers=leader,
                       json={"texto_solucion": "Local test"}).status_code == 403
    assert client.post("/tickets/102/asignar", headers=leader,
                       json={"id_tecnico": str(role_accounts["tech"])}).status_code == 403
    assert client.get("/tickets/102", headers=headers_for(role_accounts["other"])).json()["estado"] == "Abierto"

def test_worker_jwks_client_caches_public_keys_and_accepts_a_valid_signature(
    client, role_accounts, monkeypatch,
):
    import json
    from cryptography.hazmat.primitives.asymmetric import ec
    from app.core import security

    private_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    public_jwk.update(kid="worker-test", alg="ES256", use="sig")
    jwks_url = "https://example.supabase.co/auth/v1/.well-known/jwks.json"
    requests = []

    def open_jwks(request, *, timeout):
        requests.append((request.full_url, timeout))
        return io.BytesIO(json.dumps({"keys": [public_jwk]}).encode())

    jwks = security.WorkerJWKClient(jwks_url, timeout=5)
    monkeypatch.setattr(security, "open_http", open_jwks)
    monkeypatch.setattr(security, "_get_jwks_client", lambda _: jwks)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    token = jwt.encode(
        {"sub": str(role_accounts["teacher"]), "aud": "authenticated", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        private_key, algorithm="ES256", headers={"kid": "worker-test"},
    )
    headers = {"Authorization": f"Bearer {token}"}
    profile = client.get("/usuarios/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["id_rol"] == 3
    assert client.get("/usuarios/administracion", headers=headers).status_code == 403
    assert requests == [(jwks_url, 5)]
