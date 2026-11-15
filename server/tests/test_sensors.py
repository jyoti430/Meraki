from fastapi.testclient import TestClient
from server.sensors import create_app


def test_push_read_validate_auth_and_restart(tmp_path):
    now = [1000.0]
    path = tmp_path / 'sensor.db'
    client = TestClient(create_app(path, 'private-key', lambda: now[0]))
    assert client.get('/api/sensors').json()['devices'] == []
    reading = dict(device_id='crate-01', temperature=26.4, humidity=72, warnings=['Check airflow'])
    assert client.post('/api/sensors', json=reading).status_code == 401
    headers = {'X-Sensor-Key': 'private-key'}
    assert client.post('/api/sensors', json=reading, headers=headers).status_code == 200
    assert client.get('/api/sensors').json()['devices'][0]['warnings'] == ['Check airflow']
    for update in [dict(humidity=101), dict(temperature=True), dict(warnings='alarm'), dict(device_id='../bad')]:
        assert client.post('/api/sensors', json=reading | update, headers=headers).status_code == 422
    now[0] += 31
    assert client.get('/api/sensors').json()['devices'][0]['stale'] is True
    assert client.post('/api/sensors', json=reading | dict(warnings=[], temperature=27), headers=headers).status_code == 200
    assert client.post('/api/sensors', json=reading | dict(device_id='crate-02'), headers=headers).status_code == 200
    restored = TestClient(create_app(path, 'private-key', lambda: now[0])).get('/api/sensors').json()
    assert len(restored['devices']) == 2
    assert restored['devices'][0]['temperature'] == 27
    assert restored['devices'][0]['warnings'] == []
    assert restored['devices'][0]['stale'] is False


def test_unconfigured_gateway_rejects_push(tmp_path):
    client = TestClient(create_app(tmp_path / 'sensor.db', ''))
    assert client.post('/api/sensors', json=dict(temperature=25, humidity=70, warnings=[])).status_code == 503
