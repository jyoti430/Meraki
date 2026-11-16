from concurrent.futures import ThreadPoolExecutor
import json
import sqlite3
import httpx
import pytest
from fastapi.testclient import TestClient
from server.sensors import Reading, _store_reading, create_app
from server.sensor_alerts import CrateRule, FpoProfile, SensorAlerts, SmsFailure, TwilioSms


class FakeSms:
    configured = True

    def __init__(self):
        self.sent, self.failure = [], None

    def send(self, phone, body):
        if self.failure:
            raise self.failure
        self.sent.append((phone, body))
        return 'SM' + 'a' * 32


@pytest.fixture
def gateway(tmp_path):
    now, sms = [1000.0], FakeSms()
    path = tmp_path / 'sensors.db'
    app = create_app(path, 'push-key', lambda: now[0], admin_token='admin-key', sms_provider=sms)
    client = TestClient(app)
    return client, app.state.alerts, sms, now, path


ADMIN = {'X-Sensor-Admin-Key': 'admin-key'}
PUSH = {'X-Sensor-Key': 'push-key'}
PROFILE = dict(id='fpo-a', name='Example FPO A', phone='+15005550006', sms_enabled=True)
RULE = dict(device_id='crate-01', profile_id='fpo-a', temperature_min=10, temperature_max=30, humidity_min=40, humidity_max=90)
NORMAL = dict(device_id='crate-01', temperature=25, humidity=70, warnings=[])


def configure(client, profile=None, rule=None):
    assert client.post('/api/sensors/alerts/profiles', headers=ADMIN, json=profile or PROFILE).status_code == 200
    assert client.post('/api/sensors/alerts/crates', headers=ADMIN, json=rule or RULE).status_code == 200


def push(client, **updates):
    response = client.post('/api/sensors', headers=PUSH, json=NORMAL | updates)
    assert response.status_code == 200


def test_ranges_route_to_responsible_fpo_without_location_and_restart(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    configure(client, PROFILE | dict(id='fpo-b', phone='+15005550007'), RULE | dict(device_id='crate-02', profile_id='fpo-b', location='Warehouse A'))
    push(client)
    assert alerts.snapshot()['alerts'] == []
    push(client, temperature=35)
    push(client, device_id='crate-02', humidity=95)
    restored = create_app(path, 'push-key', lambda: now[0], admin_token='admin-key', sms_provider=sms).state.alerts
    assert len(restored.snapshot()['profiles']) == 2
    assert restored.dispatch_once() and restored.dispatch_once()
    assert sms.sent[0][0] == PROFILE['phone']
    assert 'Crate crate-01' in sms.sent[0][1] and 'Temperature 35C outside 10-30C' in sms.sent[0][1]
    assert 'Location' not in sms.sent[0][1]
    assert sms.sent[1][0] == '+15005550007' and 'Warehouse A' in sms.sent[1][1]
    assert all(row['status'] == 'accepted' for row in restored.snapshot()['alerts'])
    public = client.get('/api/sensors').json()
    assert public['devices'][0]['range_problems'] == ['Temperature 35C outside 10-30C']
    assert PROFILE['phone'] not in json.dumps(public)
    assert 'profile_id' not in json.dumps(public)


def test_inclusive_boundaries_warnings_and_pause(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    push(client, temperature=10, humidity=90)
    push(client, temperature=30, humidity=40)
    assert alerts.snapshot()['alerts'] == []
    push(client, warnings=['Door open'])
    assert 'Door open' in alerts.snapshot()['alerts'][0]['body']
    assert client.post('/api/sensors/alerts/profiles', headers=ADMIN, json=PROFILE | dict(sms_enabled=False)).status_code == 200
    assert alerts.snapshot()['alerts'][0]['status'] == 'cancelled'
    push(client, temperature=40)
    assert not alerts.dispatch_once()
    assert not sms.sent


def test_cooldown_recovery_and_fresh_reminder(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    push(client, temperature=35)
    assert alerts.dispatch_once()
    for i in range(10):
        push(client, temperature=36)
    push(client)  # recovery followed by threshold flapping must not spam
    now[0] += 60
    push(client, humidity=99)
    assert not alerts.dispatch_once()
    now[0] += 1740
    push(client, temperature=36)
    assert alerts.dispatch_once()
    assert len(sms.sent) == 2


def test_cancel_on_recovery_and_contact_or_assignment_change(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    push(client, temperature=35)
    push(client)
    assert alerts.snapshot()['alerts'][0]['status'] == 'cancelled'
    assert not alerts.dispatch_once()
    configure(client, PROFILE | dict(phone='+15005550008'))
    push(client, temperature=35)
    assert alerts.dispatch_once()
    assert sms.sent[0][0] == '+15005550008'
    now[0] += 1800
    push(client, temperature=40)
    configure(client, PROFILE | dict(id='fpo-b', phone='+15005550009'), RULE | dict(profile_id='fpo-b'))
    push(client, temperature=40)
    assert alerts.dispatch_once()
    assert sms.sent[-1][0] == '+15005550009'
    assert len(sms.sent) == 2


def test_retry_backoff_and_restart(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    sms.failure = SmsFailure('SMS provider returned HTTP 429', retryable=True)
    push(client, temperature=35)
    assert alerts.dispatch_once()
    assert alerts.snapshot()['alerts'][0]['status'] == 'retry'
    assert not alerts.dispatch_once()
    now[0] += 60
    push(client, temperature=35)
    restored = SensorAlerts(path, lambda: now[0], sms)
    sms.failure = None
    assert restored.dispatch_once()
    assert len(sms.sent) == 1
    assert restored.snapshot()['alerts'][0]['attempts'] == 2


@pytest.mark.parametrize('failure,status', [(SmsFailure('Rejected'), 'failed'), (SmsFailure('Unknown response', uncertain=True), 'uncertain')])
def test_failure_states_are_not_claimed_delivered(gateway, failure, status):
    client, alerts, sms, now, path = gateway
    configure(client)
    push(client, temperature=35)
    sms.failure = failure
    assert alerts.dispatch_once()
    assert alerts.snapshot()['alerts'][0]['status'] == status
    assert not alerts.dispatch_once()
    assert not sms.sent


def test_unconfigured_provider_queues_and_stale_reading_expires(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    sms.configured = False
    push(client, temperature=35)
    assert not alerts.dispatch_once()
    assert alerts.snapshot()['alerts'][0]['status'] == 'queued'
    now[0] += 31
    sms.configured = True
    assert alerts.dispatch_once()
    assert alerts.snapshot()['alerts'][0]['status'] == 'expired'
    assert not sms.sent
    push(client, temperature=35)
    assert alerts.dispatch_once()
    assert len(sms.sent) == 1


def test_crash_during_send_is_uncertain_not_retried(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    push(client, temperature=35)
    with sqlite3.connect(path) as db:
        db.execute("UPDATE sensor_sms_outbox SET status='sending'")
    restored = SensorAlerts(path, lambda: now[0], sms)
    assert restored.snapshot()['alerts'][0]['status'] == 'uncertain'
    assert not restored.dispatch_once()


def test_simultaneous_http_usb_readings_and_workers_do_not_duplicate(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    reading = Reading(**(NORMAL | dict(temperature=35)))
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: _store_reading(path, lambda: now[0], reading, alerts), range(16)))
    assert len(alerts.snapshot()['alerts']) == 1
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: alerts.dispatch_once(), range(8)))
    assert sum(results) == 1
    assert len(sms.sent) == 1


def test_admin_is_separate_from_upload_key_and_validation(gateway):
    client, alerts, sms, now, path = gateway
    for endpoint in ('/api/sensors/alerts',):
        for headers in ({}, PUSH, {'X-Sensor-Admin-Key': 'push-key'}):
            assert client.get(endpoint, headers=headers).status_code == 401
    assert client.post('/api/sensors/alerts/profiles', json=PROFILE, headers=PUSH).status_code == 401
    assert client.post('/api/sensors/alerts/crates', json=RULE, headers=ADMIN).status_code == 422
    for phone in ('12345', '9876543210', '+0123456789', '+91 9876543210'):
        assert client.post('/api/sensors/alerts/profiles', json=PROFILE | dict(phone=phone), headers=ADMIN).status_code == 422
    configure(client)
    for update in (dict(temperature_min=31), dict(humidity_max=30), dict(cooldown_seconds=0), dict(device_id='../crate')):
        assert client.post('/api/sensors/alerts/crates', json=RULE | update, headers=ADMIN).status_code == 422
    disabled = TestClient(create_app(path, 'push-key', admin_token=''))
    assert disabled.get('/api/sensors/alerts', headers=ADMIN).status_code == 503


def test_lifespan_worker_sends_without_browser(tmp_path):
    import time
    sms = FakeSms()
    app = create_app(tmp_path / 'worker.db', 'push-key', admin_token='admin-key', sms_provider=sms)
    with TestClient(app) as client:
        configure(client)
        push(client, temperature=35)
        deadline = time.monotonic() + 5
        while not sms.sent and time.monotonic() < deadline:
            time.sleep(0.05)
        assert len(sms.sent) == 1
        assert app.state.alerts.snapshot()['alerts'][0]['status'] == 'accepted'


def test_twilio_request_contract_and_sanitized_failure():
    env = dict(TWILIO_ACCOUNT_SID='AC' + '1' * 32, TWILIO_AUTH_TOKEN='secret-value', TWILIO_FROM_NUMBER='+15005550006')
    def handler(request):
        assert request.url == f"https://api.twilio.com/2010-04-01/Accounts/{env['TWILIO_ACCOUNT_SID']}/Messages.json"
        assert request.headers['Authorization'].startswith('Basic ')
        from urllib.parse import parse_qs
        data = parse_qs(request.content.decode())
        assert data == dict(To=['+15005550007'], Body=['Crate alert'], From=['+15005550006'])
        return httpx.Response(201, json={'sid': 'SM' + '2' * 32, 'status': 'queued'})
    sms = TwilioSms(env, httpx.MockTransport(handler))
    assert sms.configured and sms.send('+15005550007', 'Crate alert').startswith('SM')
    sms.transport = httpx.MockTransport(lambda _: httpx.Response(401, json={'message': 'secret-value'}))
    with pytest.raises(SmsFailure) as error:
        sms.send('+15005550007', 'Crate alert')
    assert 'secret-value' not in str(error.value)
    assert not error.value.retryable
    def timeout(request):
        raise httpx.ReadTimeout('private details', request=request)
    sms.transport = httpx.MockTransport(timeout)
    with pytest.raises(SmsFailure) as error:
        sms.send('+15005550007', 'Crate alert')
    assert error.value.uncertain and 'private details' not in str(error.value)


def test_existing_app_warnings_trigger_sms_without_custom_ranges(gateway):
    client, alerts, sms, now, path = gateway
    configure(client, rule={'device_id': 'crate-01', 'profile_id': 'fpo-a'})
    push(client, temperature=35)  # no warning: no invented crop limits
    assert alerts.snapshot()['alerts'] == []
    push(client, temperature=35, warnings=['Temperature outside selected crop range'])
    assert alerts.dispatch_once()
    assert sms.sent == [(PROFILE['phone'], 'Meraki alert: Crate crate-01. Temperature outside selected crop range.')]
    push(client, warnings=['Humidity outside selected crop range'])
    assert not alerts.dispatch_once()  # ongoing warnings respect per-crate gap
    now[0] += 1800
    push(client, warnings=['Humidity outside selected crop range'])
    assert alerts.dispatch_once()
    assert 'Humidity outside selected crop range' in sms.sent[-1][1]


def test_optional_custom_limits_require_complete_pairs(gateway):
    client, alerts, sms, now, path = gateway
    configure(client)
    for update in (dict(temperature_min=None), dict(humidity_max=None)):
        assert client.post('/api/sensors/alerts/crates', headers=ADMIN, json=RULE | update).status_code == 422
    assert client.post('/api/sensors/alerts/crates', headers=ADMIN,
                       json=dict(device_id='crate-01', profile_id='fpo-a', alert_on_warnings=False)).status_code == 422


def test_ble_warning_alerts_and_http_sms_survive_bluetooth_disconnect(tmp_path, monkeypatch):
    import sys
    import threading
    import time
    from types import SimpleNamespace
    from server import sensors

    class Scanner:
        @staticmethod
        async def find_device_by_name(name, **_kwargs):
            return SimpleNamespace(name=name)

    class BleClient:
        is_connected = False

        def __init__(self, *_args, **_kwargs):
            pass

        async def connect(self):
            self.is_connected = True

        async def start_notify(self, characteristic, callback):
            payload = ('@SENSOR ' + json.dumps(NORMAL | dict(warnings=['Temperature warning from BLE']))).encode()
            for offset in range(0, len(payload), 7):
                callback(characteristic, bytearray(payload[offset:offset + 7]))

        async def stop_notify(self, *_args):
            pass

        async def disconnect(self):
            self.is_connected = False

    def wait_for_count(count):
        deadline = time.monotonic() + 5
        while len(sms.sent) < count and time.monotonic() < deadline:
            time.sleep(.02)
        assert len(sms.sent) == count

    monkeypatch.setattr(sensors, '_ble_runtime_available', lambda: True)
    monkeypatch.setitem(sys.modules, 'bleak', SimpleNamespace(BleakScanner=Scanner, BleakClient=BleClient))
    sms, now = FakeSms(), [1000.0]
    app = create_app(tmp_path / 'ble-sms.db', 'push-key', lambda: now[0],
                     ble_enabled=False, admin_token='admin-key', sms_provider=sms)
    with TestClient(app) as client:
        configure(client, rule=dict(device_id='crate-01', profile_id='fpo-a'))
        assert client.post('/api/sensors/bluetooth', json={'enabled': True}).status_code == 200
        wait_for_count(1)
        assert 'Temperature warning from BLE' in sms.sent[0][1]
        assert client.post('/api/sensors/bluetooth', json={'enabled': False}).status_code == 200
        now[0] += 1800
        push(client, warnings=['Humidity warning from HTTP'])
        wait_for_count(2)
        assert 'Humidity warning from HTTP' in sms.sent[1][1]
    assert not [thread for thread in threading.enumerate() if thread.name == 'meraki-sms-worker']
