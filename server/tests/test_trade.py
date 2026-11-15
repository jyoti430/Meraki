from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.domain import allocate, money


def test_integer_money_and_largest_remainder():
    assert money(1, 500) == 1  # exactly half a paise rounds up
    assert allocate(10, {"b": 1, "a": 1, "c": 1}) == [
        {"member_id": "a", "contribution_g": 1, "amount_paise": 4},
        {"member_id": "b", "contribution_g": 1, "amount_paise": 3},
        {"member_id": "c", "contribution_g": 1, "amount_paise": 3},
    ]


@pytest.fixture
def api(tmp_path):
    time = [datetime(2026, 11, 16, 10, tzinfo=timezone.utc)]
    app = create_app(database_url=f"sqlite:///{tmp_path / 'trade.db'}", demo_enabled=True, clock=lambda: time[0])
    with TestClient(app) as client:
        yield client, app, time


def auth(client, name):
    response = client.post('/api/trade/dev/sessions', json={"principal_id": name})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_identity_idempotency_and_held_lot(api):
    client, _, time = api
    fpo = auth(client, 'fpo-a')
    body = dict(crop='okra', variety='okra', grade='A', quantity_g=10000,
                harvest_date='2026-11-16', pickup_deadline='2026-11-20T10:00:00Z',
                member_contributions=[dict(member_id='m1', quantity_g=10000)])
    headers = {**fpo, 'Idempotency-Key': 'lot-1'}
    first = client.post('/api/trade/lots', json=body, headers=headers)
    assert first.status_code == 200, first.text
    assert client.post('/api/trade/lots', json=body, headers=headers).json() == first.json()
    body['grade'] = 'B'
    assert client.post('/api/trade/lots', json=body, headers=headers).status_code == 409
    assert client.get('/api/trade/lots/' + first.json()['id'], headers=auth(client, 'fpo-b')).status_code == 404
    assert client.get('/api/trade/workspace', headers={'X-Organisation-Id': 'fpo-a'}).status_code == 401
    assert client.post('/api/trade/auctions', json=dict(mode='spot', lot_id=first.json()['id']),
                       headers={**fpo, 'Idempotency-Key': 'auction-held'}).status_code in (409, 422)


def test_production_refuses_development_sessions(tmp_path):
    app = create_app(database_url=f"sqlite:///{tmp_path / 'prod.db'}", demo_enabled=True, environment='production')
    with TestClient(app) as client:
        assert client.post('/api/trade/dev/sessions', json={'principal_id': 'fpo-a'}).status_code == 404
        assert client.get('/api/trade/health').json()['production_ready'] is False
