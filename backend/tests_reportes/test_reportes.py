import csv
from datetime import datetime, timedelta, timezone
from io import StringIO
from uuid import uuid4

import pytest

from app.core.deps import get_current_user
from app.main import app
from app.models.aulas import Aula, Equipo
from app.models.tickets import Ticket
from app.models.usuarios import Rol, Usuario
from app.services.report_service import rango_periodo


@pytest.fixture
def report_data(db_session):
    db = db_session
    db.add_all([Rol(id_rol=i, nombre=name) for i, name in [(1, 'Admin'), (2, 'Tecnico'), (3, 'Maestro')]])
    db.add_all([Aula(id_aula=1, nombre='Lab A', activo=True), Aula(id_aula=2, nombre='Lab B', activo=False)])
    db.flush()
    users = {}
    for name, role, leader, lab in [('admin', 1, False, None), ('leader', 2, True, 1), ('tech', 2, False, 1), ('teacher', 3, False, None), ('other', 3, False, None), ('no_lab', 2, True, None)]:
        user = Usuario(id_usuario=uuid4(), nombre=name, apellido='Test', email=f'{name}@example.com', id_rol=role, is_leader=leader, laboratorio_asignado_id=lab)
        users[name] = user
        db.add(user)
    db.add(Equipo(id_equipo=1, identificador='PC-01', tipo='PC', id_aula=1))
    db.flush()
    now = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
    for i, state in enumerate(['Abierto', 'En Proceso', 'Resuelto', 'Cerrado'], 1):
        db.add(Ticket(id_ticket=i, nombre_ticket=f'Ticket {i}', descripcion='Detalle real', id_aula=1, id_equipo=1 if i == 1 else None, id_usuario=users['teacher'].id_usuario, id_tecnico=users['tech'].id_usuario if i > 1 else None, estado=state, fecha_registro=now))
    db.add(Ticket(id_ticket=5, nombre_ticket='=HYPERLINK("malicious")', descripcion='Otro laboratorio', id_aula=2, id_usuario=users['other'].id_usuario, estado='Abierto', fecha_registro=now))
    db.add(Ticket(id_ticket=6, nombre_ticket='Anterior', descripcion='Historial', id_aula=1, id_usuario=users['teacher'].id_usuario, estado='Abierto', fecha_registro=now - timedelta(days=35)))
    db.commit()
    yield users


def login(user):
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.mark.parametrize('role,expected,labs', [
    ('admin', [6, 5, 4, 3, 2, 1], [1, 2]),
    ('leader', [6, 4, 3, 2, 1], [1]),
    ('tech', [4, 3, 2], [1]),
    ('teacher', [6, 4, 3, 2, 1], [1]),
    ('no_lab', [], []),
])
def test_role_scope_covers_statistics_labs_rows_export_and_detail(client, report_data, role, expected, labs):
    login(report_data[role])
    response = client.get('/reportes?periodo=todos&por_pagina=100')
    assert response.status_code == 200
    data = response.json()
    assert set(row['id_ticket'] for row in data['tickets']) == set(expected)
    assert data['total'] == len(expected) == sum(data['estados'].values())
    assert [lab['id_aula'] for lab in data['laboratorios']] == labs
    assert sum(lab['total'] for lab in data['por_laboratorio']) == len(expected)
    exported = client.get('/reportes/exportar?periodo=todos')
    assert exported.status_code == 200
    rows = list(csv.reader(StringIO(exported.content.decode('utf-8-sig'))))
    assert {int(row[0]) for row in rows[1:]} == set(expected)
    assert client.get('/tickets/5').status_code == (200 if 5 in expected else 404)
    if role != 'admin':
        assert client.get('/reportes?id_aula=2').status_code == 404
        assert client.get('/reportes/exportar?id_aula=2').status_code == 404


def test_filters_counts_pagination_and_export_match(client, report_data):
    login(report_data['admin'])
    data = client.get('/reportes?por_pagina=3').json()
    assert data['total'] == 5
    assert data['estados'] == {'Abierto': 2, 'En Proceso': 1, 'Resuelto': 1, 'Cerrado': 1}
    assert data['anteriores'] == {'Abierto': 1}
    assert [row['id_ticket'] for row in data['tickets']] == [5, 4, 3]
    second = client.get('/reportes?por_pagina=3&pagina=2').json()
    assert [row['id_ticket'] for row in second['tickets']] == [2, 1]
    assert second['total'] == 5
    clamped = client.get('/reportes?por_pagina=3&pagina=999').json()
    assert clamped['pagina'] == 2
    data = client.get('/reportes?estado=Cerrado&id_aula=1').json()
    assert data['total'] == 1 and data['tickets'][0]['estado'] == 'Cerrado'
    assert data['tickets'][0]['nombre_tecnico'] == 'tech Test'
    rows = list(csv.reader(StringIO(client.get('/reportes/exportar?estado=Cerrado&id_aula=1').content.decode('utf-8-sig'))))
    assert len(rows) == 2 and rows[1][0] == '4'
    # CSV quotes commas/quotes and neutralizes formula injection.
    rows = list(csv.reader(StringIO(client.get('/reportes/exportar').content.decode('utf-8-sig'))))
    assert rows[1][1] == '\'=HYPERLINK("malicious")'


@pytest.mark.parametrize('params', ['estado=pendiente', 'periodo=bad', 'pagina=0', 'por_pagina=101', 'id_aula=0'])
def test_invalid_report_filters(client, report_data, params):
    login(report_data['admin'])
    assert client.get(f'/reportes?{params}').status_code == 422


def test_empty_result_unknown_lab_and_unknown_role(client, report_data):
    login(report_data['admin'])
    data = client.get('/reportes?estado=Resuelto&id_aula=2').json()
    assert data['total'] == 0 and data['tickets'] == [] and data['por_laboratorio'] == []
    assert data['pagina'] == 1 and data['paginas'] == 1
    assert client.get('/reportes?id_aula=999').status_code == 404
    report_data['admin'].id_rol = 999
    assert client.get('/reportes').status_code == 403
    assert client.get('/reportes/exportar').status_code == 403


def test_reports_require_authentication(client):
    assert client.get('/reportes').status_code in (401, 403)
    assert client.get('/reportes/exportar').status_code in (401, 403)


def test_period_boundaries_use_sonora_midnight():
    now = datetime(2026, 1, 1, 6, 30, tzinfo=timezone.utc)  # Still Dec 31 in Sonora.
    assert rango_periodo('hoy', now) == (datetime(2025, 12, 31, 7), datetime(2026, 1, 1, 7))
    assert rango_periodo('ultima-semana', now)[0] == datetime(2025, 12, 25, 7)
    assert rango_periodo('ultimo-mes', now)[0] == datetime(2025, 12, 2, 7)
    assert rango_periodo('este-ano', now)[0] == datetime(2025, 1, 1, 7)
    assert rango_periodo('todos', now) == (None, None)
