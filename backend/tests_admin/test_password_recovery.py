import io
import json
from contextlib import nullcontext
from urllib.error import HTTPError, URLError
from unittest.mock import Mock
from uuid import uuid4

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.core.deps import get_current_user
from app.main import app
from app.models.usuarios import Rol, Usuario
from app.routers import auth


@pytest.fixture(autouse=True)
def auth_settings(monkeypatch):
    monkeypatch.setattr(auth.settings, 'supabase_url', 'https://example.supabase.co')
    monkeypatch.setattr(auth.settings, 'supabase_publishable_key', 'public-test-key')
    monkeypatch.setattr(auth.settings, 'password_recovery_redirect_url',
                        'http://localhost:5173/src/pages/login/nueva-contrasena.html')


@pytest.fixture
def user(client, db_session):
    db_session.add(Rol(id_rol=3, nombre='Maestro'))
    user = Usuario(id_usuario=uuid4(), nombre='Recovery', apellido='Test',
                   email='recovery@example.com', id_rol=3, debe_cambiar_password=True)
    db_session.add(user)
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


def test_recovery_is_public_and_redirect_is_server_controlled(client, monkeypatch):
    request = Mock(return_value=nullcontext())
    monkeypatch.setattr(auth, 'urlopen', request)
    response = client.post('/auth/recovery', json={
        'email': 'recovery@example.com', 'redirect_to': 'https://attacker.example',
    })
    assert response.status_code == 200
    assert response.json() == {'message': auth.RECOVERY_MESSAGE}
    outbound = request.call_args.args[0]
    assert '/recover?redirect_to=http%3A%2F%2Flocalhost' in outbound.full_url
    assert 'attacker' not in outbound.full_url
    assert json.loads(outbound.data) == {'email': 'recovery@example.com'}
    assert outbound.get_header('Apikey') == 'public-test-key'
    assert not outbound.has_header('Authorization')


def test_invalid_email_never_calls_supabase(client, monkeypatch):
    request = Mock()
    monkeypatch.setattr(auth, 'urlopen', request)
    assert client.post('/auth/recovery', json={'email': 'invalid'}).status_code == 422
    request.assert_not_called()


def test_missing_configuration(client, monkeypatch):
    monkeypatch.setattr(auth.settings, 'supabase_publishable_key', None)
    assert client.post('/auth/recovery', json={'email': 'test@example.com'}).status_code == 503


def test_captcha_is_forwarded(client, monkeypatch):
    request = Mock(return_value=nullcontext())
    monkeypatch.setattr(auth, 'urlopen', request)
    assert client.post('/auth/recovery', json={
        'email': 'test@example.com', 'captcha_token': 'captcha-test',
    }).status_code == 200
    assert json.loads(request.call_args.args[0].data)['gotrue_meta_security'] == {
        'captcha_token': 'captcha-test',
    }


@pytest.mark.parametrize('status,expected', [(429, 429), (500, 502), (400, 502)])
def test_recovery_upstream_errors_are_sanitized(client, monkeypatch, status, expected):
    def fail(*args, **kwargs):
        raise HTTPError('https://example', status, 'private upstream detail', {}, io.BytesIO(b'secret'))
    monkeypatch.setattr(auth, 'urlopen', fail)
    response = client.post('/auth/recovery', json={'email': 'test@example.com'})
    assert response.status_code == expected
    assert 'secret' not in response.text
    assert 'private upstream' not in response.text


def test_network_error(client, monkeypatch):
    monkeypatch.setattr(auth, 'urlopen', Mock(side_effect=URLError('network failure')))
    assert client.post('/auth/recovery', json={'email': 'test@example.com'}).status_code == 502


def test_password_change_requires_authentication(client, monkeypatch):
    request = Mock()
    monkeypatch.setattr(auth, 'urlopen', request)
    assert client.put('/auth/password', json={'password': 'valid-password'}).status_code == 401
    request.assert_not_called()


@pytest.mark.parametrize('password', ['short', 'x' * 129])
def test_invalid_password_is_not_sent_or_echoed(client, user, monkeypatch, password):
    request = Mock()
    monkeypatch.setattr(auth, 'urlopen', request)
    response = client.put('/auth/password', json={'password': password},
                          headers={'Authorization': 'Bearer test-token'})
    assert response.status_code == 422
    assert password not in response.text
    assert user.debe_cambiar_password is True
    request.assert_not_called()


def test_password_uses_user_token_and_clears_flag(client, user, db_session, monkeypatch):
    request = Mock(return_value=nullcontext())
    monkeypatch.setattr(auth, 'urlopen', request)
    response = client.put('/auth/password', json={'password': 'valid-password'},
                          headers={'Authorization': 'Bearer recovery-token'})
    assert response.status_code == 200
    outbound = request.call_args.args[0]
    assert outbound.full_url.endswith('/auth/v1/user')
    assert outbound.get_header('Authorization') == 'Bearer recovery-token'
    assert json.loads(outbound.data) == {'password': 'valid-password'}
    db_session.refresh(user)
    assert user.debe_cambiar_password is False


@pytest.mark.parametrize('status,expected', [(401, 401), (403, 401), (422, 422), (429, 429)])
def test_failed_auth_update_preserves_profile(client, user, monkeypatch, status, expected):
    monkeypatch.setattr(auth, 'urlopen', Mock(side_effect=HTTPError(
        'https://example', status, 'upstream failure', {}, io.BytesIO(),
    )))
    response = client.put('/auth/password', json={'password': 'valid-password'},
                          headers={'Authorization': 'Bearer test-token'})
    assert response.status_code == expected
    assert user.debe_cambiar_password is True


def test_partial_failure_explicitly_reports_password_already_changed(client, user, db_session, monkeypatch):
    monkeypatch.setattr(auth, 'urlopen', Mock(return_value=nullcontext()))
    monkeypatch.setattr(db_session, 'commit', Mock(side_effect=SQLAlchemyError('database failure')))
    response = client.put('/auth/password', json={'password': 'valid-password'},
                          headers={'Authorization': 'Bearer test-token'})
    assert response.status_code == 503
    assert 'ya cambió' in response.json()['detail']
    assert 'database failure' not in response.text
