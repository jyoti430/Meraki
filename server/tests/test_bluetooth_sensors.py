"""BLE framing and lifecycle with mocked Bleak only; never uses a real radio."""
import asyncio
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from server import sensors


@pytest.fixture(autouse=True)
def disable_real_ble(monkeypatch):
    monkeypatch.setenv('SENSOR_BLE_ENABLED', '0')
    monkeypatch.setattr(sensors, '_ble_runtime_available', lambda: True)

    class NoScanner:
        @staticmethod
        async def find_device_by_name(*_args, **_kwargs):
            raise AssertionError('Tests must install an explicit fake scanner before enabling BLE')

    monkeypatch.setitem(sys.modules, 'bleak', SimpleNamespace(BleakScanner=NoScanner, BleakClient=None))


def frame(**changes):
    value = {'device_id': 'crate-01', 'temperature': 26.4, 'humidity': 72.0, 'warnings': ['Crate door is OPEN']}
    return ('@SENSOR ' + json.dumps(value | changes, ensure_ascii=False) + '\n').encode()


def until(predicate, timeout=2):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = predicate()
        if value:
            return value
        time.sleep(.01)
    pytest.fail('Mock BLE worker did not reach its expected state')


@pytest.mark.parametrize('chunk_size', [1, 7, 20, 64])
def test_uart_fragments_and_coalesced_frames_preserve_readings(chunk_size):
    stream = b'UART startup log\n' + frame(warnings=['Température élevée; literal @SENSOR in a warning']) + frame(device_id='crate-02', humidity=65)
    parser = sensors.SensorNotifications()
    readings, errors = [], []
    for start in range(0, len(stream), chunk_size):
        found, rejected = parser.feed(stream[start:start + chunk_size])
        readings.extend(found)
        errors.extend(rejected)
    assert not errors
    assert [reading.device_id for reading in readings] == ['crate-01', 'crate-02']
    assert readings[0].warnings == ['Température élevée; literal @SENSOR in a warning']
    assert readings[1].humidity == 65
    assert parser.buffer == ''


def test_parser_recovers_from_invalid_frames_without_fabricating_observations():
    parser = sensors.SensorNotifications()
    stream = b'@SENSOR {broken json}\n' + frame(humidity=101) + frame(device_id='valid-crate')
    readings, errors = parser.feed(stream)
    assert len(errors) == 2
    assert [reading.device_id for reading in readings] == ['valid-crate']
    assert parser.feed(b'@SENSOR ' + b'x' * parser.max_chars)[1]
    assert len(parser.buffer) <= parser.max_chars
    assert parser.feed(b'@SENSOR \xff')[1]
    assert parser.feed(frame())[0][0].device_id == 'crate-01'


@pytest.mark.parametrize('value', ['false', 'true', 0, 1, None, [], {}])
def test_ble_control_requires_an_explicit_strict_boolean(tmp_path, value):
    with TestClient(sensors.create_app(tmp_path / 'strict.db', token='')) as client:
        response = client.post('/api/sensors/bluetooth', json={'enabled': value})
        assert response.status_code == 422
        assert client.get('/api/sensors/bluetooth').json()['enabled'] is False
        assert client.get('/api/sensors').json()['devices'] == []


def test_disabled_environment_and_explicit_override_do_not_start_workers(tmp_path, monkeypatch):
    starts = []
    monkeypatch.setattr(sensors, '_ble_thread', lambda *_args: starts.append(True))
    monkeypatch.delenv('SENSOR_BLE_ENABLED')
    with TestClient(sensors.create_app(tmp_path / 'default.db', token='')) as client:
        assert client.get('/api/sensors/bluetooth').json()['enabled'] is False
    monkeypatch.setenv('SENSOR_BLE_ENABLED', '1')
    with TestClient(sensors.create_app(tmp_path / 'override.db', token='', ble_enabled=False)) as client:
        status = client.get('/api/sensors/bluetooth').json()
        assert status['enabled'] is False
        assert status['http_push_available'] is False
    assert not starts


def test_fragmented_notifications_persist_only_valid_readings_and_disconnect(tmp_path, monkeypatch):
    notified, stopped, disconnected = threading.Event(), threading.Event(), threading.Event()
    callbacks = []

    class Scanner:
        @staticmethod
        async def find_device_by_name(name, timeout):
            return SimpleNamespace(name=name)

    class Client:
        is_connected = True

        def __init__(self, device, **_kwargs):
            self.device = device

        async def connect(self):
            self.is_connected = True

        async def disconnect(self):
            self.is_connected = False
            disconnected.set()

        async def start_notify(self, characteristic, callback):
            assert characteristic == sensors.TX_UUID
            callbacks.append(callback)
            payload = frame(opened_count=12, closed_count=11) + frame(humidity=101)
            for offset in range(0, len(payload), 20):
                callback(characteristic, bytearray(payload[offset:offset + 20]))
            notified.set()

        async def stop_notify(self, characteristic):
            stopped.set()

    monkeypatch.setitem(sys.modules, 'bleak', SimpleNamespace(BleakScanner=Scanner, BleakClient=Client))
    with TestClient(sensors.create_app(tmp_path / 'notifications.db', token='private-key', clock=lambda: 1234)) as client:
        assert client.post('/api/sensors/bluetooth', json={'enabled': True}).status_code == 200
        assert notified.wait(2)
        status = until(lambda: (value if (value := client.get('/api/sensors/bluetooth').json())['status'] == 'connected' else None))
        assert status['available'] is True and status['last_ok_at'] == 1234
        assert 'invalid reading' in status['error']
        assert status['http_push_available'] is True
        readings = client.get('/api/sensors').json()['devices']
        assert len(readings) == 1
        assert readings[0]['opened_count'] == 12 and readings[0]['closed_count'] == 11
        # Repeated connect commands reuse the worker and retain connected state.
        assert client.post('/api/sensors/bluetooth', json={'enabled': True}).json()['status'] == 'connected'
        assert len(callbacks) == 1
        assert client.post('/api/sensors/bluetooth', json={'enabled': False}).json()['status'] == 'disconnected'
        assert stopped.wait(1) and disconnected.wait(1)
        callbacks[0](sensors.TX_UUID, bytearray(frame(device_id='too-late')))
        assert len(client.get('/api/sensors').json()['devices']) == 1


def test_concurrent_connect_scan_cancellation_and_lifespan_cleanup(tmp_path, monkeypatch):
    scans, cancelled = [], []

    class Scanner:
        @staticmethod
        async def find_device_by_name(*_args, **_kwargs):
            scans.append(True)
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.append(True)

    monkeypatch.setitem(sys.modules, 'bleak', SimpleNamespace(BleakScanner=Scanner, BleakClient=None))
    with TestClient(sensors.create_app(tmp_path / 'lifecycle.db', token='')) as client:
        with ThreadPoolExecutor(max_workers=4) as pool:
            replies = list(pool.map(lambda _: client.post('/api/sensors/bluetooth', json={'enabled': True}), range(4)))
        assert all(response.status_code == 200 for response in replies)
        until(lambda: len(scans) == 1)
        assert client.post('/api/sensors/bluetooth', json={'enabled': False}).status_code == 200
        assert cancelled == [True]
        assert client.post('/api/sensors/bluetooth', json={'enabled': True}).status_code == 200
        until(lambda: len(scans) == 2)
    assert cancelled == [True, True]
    assert not [thread for thread in threading.enumerate() if thread.name == 'meraki-ble-gateway']


def test_missing_runtime_and_unavailable_adapter_are_explicit(tmp_path, monkeypatch):
    monkeypatch.setattr(sensors, '_ble_runtime_available', lambda: False)
    with TestClient(sensors.create_app(tmp_path / 'missing.db', token='')) as client:
        status = client.get('/api/sensors/bluetooth').json()
        assert status['available'] is False and status['enabled'] is False
        assert status['status'] == 'unavailable' and status['reason']
        assert client.post('/api/sensors/bluetooth', json={'enabled': True}).status_code == 503
    monkeypatch.setattr(sensors, '_ble_runtime_available', lambda: True)

    class Scanner:
        @staticmethod
        async def find_device_by_name(*_args, **_kwargs):
            raise RuntimeError('No powered Bluetooth adapter')

    monkeypatch.setitem(sys.modules, 'bleak', SimpleNamespace(BleakScanner=Scanner, BleakClient=None))
    with TestClient(sensors.create_app(tmp_path / 'unavailable.db', token='')) as client:
        client.post('/api/sensors/bluetooth', json={'enabled': True})
        status = until(lambda: (value if (value := client.get('/api/sensors/bluetooth').json())['status'] == 'unavailable' else None))
        assert status['available'] is False and status['enabled'] is False
        assert 'No powered Bluetooth adapter' in status['error']
        assert not client.get('/api/sensors').json()['devices']
        serial = client.get('/api/sensors/serial').json()
        assert serial['available'] is False and serial['port'] == ''
        assert client.post('/api/sensors/serial', json={}).status_code == 409


def test_lifespan_exception_cancels_inflight_connection_and_disconnects(tmp_path, monkeypatch):
    connecting, cancelled, disconnected = threading.Event(), threading.Event(), threading.Event()

    class Scanner:
        @staticmethod
        async def find_device_by_name(name, **_kwargs):
            return SimpleNamespace(name=name)

    class Client:
        is_connected = False

        def __init__(self, *_args, **_kwargs):
            pass

        async def connect(self):
            connecting.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        async def disconnect(self):
            disconnected.set()

    monkeypatch.setitem(sys.modules, 'bleak', SimpleNamespace(BleakScanner=Scanner, BleakClient=Client))
    with pytest.raises(RuntimeError, match='deliberate lifespan exit'):
        with TestClient(sensors.create_app(tmp_path / 'connecting.db', token='')) as client:
            client.post('/api/sensors/bluetooth', json={'enabled': True})
            assert connecting.wait(2)
            raise RuntimeError('deliberate lifespan exit')
    assert cancelled.wait(1) and disconnected.wait(1)
    assert not [thread for thread in threading.enumerate() if thread.name == 'meraki-ble-gateway']
