from datetime import datetime, timedelta, timezone
from uuid import uuid4
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import jwt
from sqlalchemy.exc import IntegrityError

from app.core.deps import get_current_user
from app.main import app
from app.models.aulas import Aula
from app.models.usuarios import Rol, Usuario
from app.routers import usuarios
from app.core import security
from app.core import deps
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


@pytest.mark.parametrize('suspended', [True, False])
def test_suspension_applies_to_existing_signed_tokens(monkeypatch, suspended):
    user = SimpleNamespace(id_usuario=uuid4())
    monkeypatch.setattr(deps, 'verify_token', lambda _: {'sub': str(user.id_usuario)})
    db = Mock()
    db.bind.dialect.name = 'postgresql'
    db.query.return_value.filter.return_value.first.return_value = user
    db.execute.return_value.scalar.return_value = suspended
    credentials = HTTPAuthorizationCredentials(scheme='Bearer', credentials='previously-issued-token')
    if suspended:
        with pytest.raises(HTTPException) as error:
            deps.get_current_user(credentials, db)
        assert error.value.status_code == 403
    else:
        assert deps.get_current_user(credentials, db) is user


def test_token_allows_small_auth_server_clock_skew(monkeypatch):
    secret = 'test-secret-key-at-least-32-characters'
    monkeypatch.setattr(security.settings, 'supabase_jwt_secret', secret)
    now = datetime.now(timezone.utc)
    user_id = str(uuid4())
    token = jwt.encode(
        {'sub': user_id, 'iat': now + timedelta(seconds=2), 'exp': now + timedelta(hours=1)},
        secret, algorithm='HS256',
    )
    assert security.verify_token(token)['sub'] == user_id


def test_token_rejects_large_auth_server_clock_skew(monkeypatch):
    secret = 'test-secret-key-at-least-32-characters'
    monkeypatch.setattr(security.settings, 'supabase_jwt_secret', secret)
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {'sub': str(uuid4()), 'iat': now + timedelta(minutes=1), 'exp': now + timedelta(hours=1)},
        secret, algorithm='HS256',
    )
    with pytest.raises(ValueError):
        security.verify_token(token)


def test_administration_requires_authentication(client):
    assert client.get('/usuarios/administracion').status_code == 401
    assert client.get('/usuarios/').status_code == 401


@pytest.fixture
def admin(db_session):
    db_session.add_all([Rol(id_rol=1, nombre="Administrador"), Rol(id_rol=2, nombre="Técnico"), Rol(id_rol=3, nombre="Maestro")])
    user = Usuario(id_usuario=uuid4(), nombre="Admin", apellido="Prueba", email="admin@example.com", id_rol=1)
    db_session.add(user)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


def test_administration_reads_real_status(client, db_session, admin, monkeypatch):
    user = Usuario(id_usuario=uuid4(), nombre="Docente", apellido="Prueba", email="teacher@example.com", id_rol=3)
    db_session.add(user)
    db_session.commit()
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(usuarios, "auth_metadata", lambda db: {
        str(admin.id_usuario): {"last_sign_in_at": now},
        str(user.id_usuario): {"banned_until": now + timedelta(days=1)},
    })
    data = client.get('/usuarios/administracion').json()
    assert {row['email']: row['estado'] for row in data} == {admin.email: 'activo', user.email: 'suspendido'}
    assert data[0]['ultimo_acceso'] is not None


@pytest.mark.parametrize('method,path,payload', [
    ('get', '/usuarios/', None), ('get', '/usuarios/administracion', None),
    ('post', '/usuarios/', {'nombre': 'Test', 'apellido': 'User', 'email': 'test@example.com', 'id_rol': 3}),
    ('put', '/usuarios/{id}', {'id_rol': 1}), ('delete', '/usuarios/{id}', None),
    ('post', '/usuarios/{id}/password', None), ('put', '/usuarios/{id}/estado', {'suspendido': True}),
])
def test_admin_routes_reject_other_roles(client, admin, method, path, payload):
    admin.id_rol = 3
    response = client.request(method, path.format(id=admin.id_usuario), json=payload)
    assert response.status_code == 403


def test_create_uses_auth_identity_and_temporary_password(client, db_session, admin, monkeypatch):
    identity = uuid4()
    calls = []
    def request(method, path, payload):
        calls.append((method, path, payload))
        return {'id': str(identity)}
    monkeypatch.setattr(usuarios, 'auth_request', request)
    response = client.post('/usuarios/', json={'nombre': ' Ana ', 'apellido': 'Prueba', 'email': 'new@example.com', 'id_rol': 3})
    assert response.status_code == 201
    data = response.json()
    assert data['id_usuario'] == str(identity)
    assert data['nombre'] == 'Ana'
    assert data['debe_cambiar_password'] is True
    assert calls[0][2]['password'] == data['password_temporal']
    assert db_session.get(Usuario, identity).email == 'new@example.com'


def test_duplicate_email_does_not_create_identity(client, admin, monkeypatch):
    monkeypatch.setattr(usuarios, 'auth_request', lambda *args: pytest.fail('Must not create identity'))
    response = client.post('/usuarios/', json={'nombre': 'Test', 'apellido': 'User', 'email': admin.email, 'id_rol': 3})
    assert response.status_code == 409


@pytest.mark.parametrize('changes', [{'nombre': None}, {'id_rol': None}, {'is_leader': None}, {'id_rol': 7}, {'is_leader': True}, {'laboratorio_asignado_id': 999}])
def test_invalid_profile_is_rejected(client, admin, changes):
    assert client.put(f'/usuarios/{admin.id_usuario}', json=changes).status_code == 422


def test_self_lockout_is_rejected(client, admin, monkeypatch):
    monkeypatch.setattr(usuarios, 'auth_request', lambda *args: pytest.fail('Must not suspend administrator'))
    assert client.put(f'/usuarios/{admin.id_usuario}', json={'id_rol': 3}).status_code == 422
    assert client.put(f'/usuarios/{admin.id_usuario}/estado', json={'suspendido': True}).status_code == 422
    assert client.delete(f'/usuarios/{admin.id_usuario}').status_code == 409


def test_edit_password_and_status(client, db_session, admin, monkeypatch):
    db_session.add(Aula(id_aula=1, nombre='Lab 1', activo=True))
    user = Usuario(id_usuario=uuid4(), nombre='User', apellido='Test', email='user@example.com', id_rol=3)
    db_session.add(user)
    db_session.commit()
    calls = []
    monkeypatch.setattr(usuarios, 'auth_request', lambda *args: calls.append(args))
    path = f'/usuarios/{user.id_usuario}'
    assert client.put(path, json={'id_rol': 2, 'is_leader': True, 'laboratorio_asignado_id': 1}).status_code == 200
    assert db_session.get(Usuario, user.id_usuario).is_leader is True
    password = client.post(f'{path}/password').json()['password_temporal']
    assert calls[-1][2] == {'password': password}
    assert client.put(f'{path}/estado', json={'suspendido': True}).status_code == 204
    assert calls[-1][2]['ban_duration'] == '876000h'
    assert client.put(f'{path}/estado', json={'suspendido': False}).status_code == 204
    assert calls[-1][2]['ban_duration'] == 'none'


def test_failed_profile_creation_cancels_auth_identity(client, db_session, admin, monkeypatch):
    identity = uuid4()
    calls = []
    def request(*args):
        calls.append(args)
        return {'id': str(identity)}
    monkeypatch.setattr(usuarios, 'auth_request', request)
    monkeypatch.setattr(db_session, 'commit', lambda: (_ for _ in ()).throw(IntegrityError('insert', {}, Exception())))
    response = client.post('/usuarios/', json={'nombre': 'Test', 'apellido': 'User', 'email': 'new@example.com', 'id_rol': 3})
    assert response.status_code == 409
    assert calls[-1] == ('DELETE', f'/{identity}')
