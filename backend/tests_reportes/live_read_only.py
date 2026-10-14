"""Read-only checks against the configured database and a local copy's running API.

Run from backend: .venv/Scripts/python.exe tests_reportes/live_read_only.py
Uses short-lived locally signed JWTs for existing profiles; does not change Auth/DB.
"""
import csv
import json
import sys
from datetime import datetime, timedelta, timezone
from io import StringIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import jwt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import settings
from app.db.database import SessionLocal
from app.models.aulas import Aula
from app.models.tickets import Ticket
from app.models.usuarios import Usuario
from app.routers.tickets import usuario_puede_ver_ticket


def get(path, token=None):
    request = Request('http://127.0.0.1:8005' + path,
                      headers={'Authorization': f'Bearer {token}'} if token else {})
    with urlopen(request, timeout=20) as response:
        return response.read()


with SessionLocal() as db:
    tickets = db.query(Ticket).all()
    labs = db.query(Aula).all()
    users = db.query(Usuario).all()
    for user in users:
        now = datetime.now(timezone.utc)
        token = jwt.encode({'sub': str(user.id_usuario), 'iat': now,
                            'exp': now + timedelta(minutes=5)},
                           settings.supabase_jwt_secret, algorithm='HS256')
        expected = [ticket for ticket in tickets if usuario_puede_ver_ticket(ticket, user)]
        data = json.loads(get('/reportes?periodo=todos&por_pagina=3', token))
        assert data['total'] == len(expected)
        assert sum(data['estados'].values()) == len(expected)
        for state in data['estados']:
            assert data['estados'][state] == sum(ticket.estado == state for ticket in expected)
        seen = []
        for page in range(1, data['paginas'] + 1):
            rows = json.loads(get(f'/reportes?periodo=todos&por_pagina=3&pagina={page}', token))
            seen.extend(row['id_ticket'] for row in rows['tickets'])
        assert len(seen) == len(set(seen)) == len(expected)
        assert set(seen) == {ticket.id_ticket for ticket in expected}
        exported = list(csv.reader(StringIO(get('/reportes/exportar?periodo=todos', token).decode('utf-8-sig'))))
        assert {int(row[0]) for row in exported[1:]} == set(seen)
        for lab in labs:
            for state in data['estados']:
                params = urlencode({'periodo': 'todos', 'id_aula': lab.id_aula, 'estado': state})
                if lab.id_aula not in {lab['id_aula'] for lab in data['laboratorios']}:
                    try:
                        get('/reportes?' + params, token)
                    except HTTPError as error:
                        assert error.code == 404
                    else:
                        raise AssertionError('Unauthorized lab was exposed')
                    continue
                result = json.loads(get('/reportes?' + params, token))
                assert result['total'] == sum(ticket.id_aula == lab.id_aula and ticket.estado == state for ticket in expected)
        denied = next((ticket for ticket in tickets if ticket not in expected), None)
        if denied:
            try:
                get(f'/tickets/{denied.id_ticket}', token)
            except HTTPError as error:
                assert error.code == 404
            else:
                raise AssertionError('Unauthorized detail was exposed')
        print(f'role={user.id_rol}, leader={user.is_leader}: {len(expected)} scoped tickets; counts, pages, labs, states, CSV and detail permissions pass')
    print(f'PASS: {len(users)} existing profiles, {len(tickets)} live tickets, {len(labs)} laboratories; no writes')
