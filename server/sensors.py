"""Sensor gateway. Reads BLE (@SENSOR JSON) and/or LAN HTTP pushes; independent of synthetic trade identities."""
import asyncio
import codecs
import hmac
import importlib.util
import os
import sqlite3
import json
import time
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Optional
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictStr
from .sensor_alerts import SensorAlerts, FpoProfile, CrateRule, evaluate

DEVICE_NAME = os.getenv('SENSOR_BLE_NAME', 'AgriTrust-Nexus')
TX_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

class Reading(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    device_id: Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')] = 'crate-01'
    temperature: Annotated[float, Field(strict=True, ge=-50, le=100)]
    humidity: Annotated[float, Field(strict=True, ge=0, le=100)]
    opened_count: Optional[Annotated[int, Field(strict=True, ge=0, le=10_000_000)]] = None
    closed_count: Optional[Annotated[int, Field(strict=True, ge=0, le=10_000_000)]] = None
    warnings: list[Annotated[StrictStr, Field(min_length=1, max_length=200)]] = Field(max_length=20)

class BleConnect(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: Annotated[bool, Field(strict=True)]


class SensorNotifications:
    """Reassemble bounded UART frames across arbitrary BLE notification chunks."""
    marker = '@SENSOR'
    max_chars = 16_384

    def __init__(self):
        self.buffer = ''
        self.utf8 = codecs.getincrementaldecoder('utf-8')()
        self.json = json.JSONDecoder()

    @staticmethod
    def next_marker(payload):
        quoted = escaped = False
        for index, char in enumerate(payload):
            if escaped:
                escaped = False
            elif quoted and char == '\\':
                escaped = True
            elif char == '"':
                quoted = not quoted
            elif not quoted and payload.startswith('@SENSOR', index):
                return index
        return -1

    def feed(self, data):
        readings, errors = [], []
        try:
            if len(data) > self.max_chars:
                raise ValueError('BLE notification exceeds the frame limit')
            self.buffer += self.utf8.decode(bytes(data))
            if len(self.buffer) > self.max_chars:
                raise ValueError('BLE sensor frame exceeds the frame limit')
        except (UnicodeError, ValueError) as error:
            self.buffer = ''
            self.utf8.reset()
            return [], [str(error)[:200]]
        while True:
            start = self.buffer.find(self.marker)
            if start < 0:
                # Retain only a possible split marker, not unrelated UART logs.
                self.buffer = next((self.buffer[-size:] for size in range(len(self.marker) - 1, 0, -1)
                                    if self.buffer.endswith(self.marker[:size])), '')
                break
            payload = self.buffer[start + len(self.marker):].lstrip()
            try:
                value, end = self.json.raw_decode(payload)
            except json.JSONDecodeError:
                following = self.next_marker(payload)
                if following < 0:
                    self.buffer = self.marker + payload
                    break
                errors.append('Ignored invalid JSON sensor frame')
                self.buffer = payload[following:]
                continue
            self.buffer = payload[end:]
            try:
                readings.append(Reading.model_validate(value))
            except ValueError as error:
                errors.append('Ignored invalid reading: ' + str(error)[:200])
        return readings, errors


def _ble_runtime_available():
    try:
        return importlib.util.find_spec('bleak') is not None
    except (ImportError, ValueError):
        return False

def _store_reading(database_path, clock, reading: Reading, alerts=None):
    received_at = clock()
    with sqlite3.connect(database_path, timeout=10) as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('INSERT INTO readings(device_id, received_at, payload) VALUES(?,?,?)', (reading.device_id, received_at, reading.model_dump_json()))
        db.execute('DELETE FROM readings WHERE device_id=? AND id NOT IN (SELECT id FROM readings WHERE device_id=? ORDER BY id DESC LIMIT 120)', (reading.device_id, reading.device_id))
        if alerts:
            alerts.observe(db, reading, received_at)
    return received_at

async def _ble_main(database_path, clock, get_enabled, state, state_lock, stop_event: threading.Event, alerts=None):
    if stop_event.is_set() or not get_enabled():
        return
    try:
        from bleak import BleakScanner, BleakClient
    except Exception as e:
        with state_lock:
            state.update(available=False, status='unavailable', reason='BLE runtime could not be loaded', error=str(e)[:300])
        return
    while not stop_event.is_set() and get_enabled():
        try:
            with state_lock:
                state['status'] = 'scanning'
                state['error'] = ''
            device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=10)
            if device is None:
                with state_lock:
                    state['status'] = 'not_found'
                    state['error'] = 'Device not found. Check power and Bluetooth.'
                await asyncio.sleep(3)
                continue
            with state_lock:
                state['status'] = 'connecting'
            client = BleakClient(device, disconnected_callback=lambda _c: None)
            try:
                await client.connect()
                parser = SensorNotifications()

                def on_data(_sender, data: bytearray):
                    if stop_event.is_set() or not get_enabled():
                        return
                    readings, errors = parser.feed(data)
                    for reading in readings:
                        try:
                            received_at = _store_reading(database_path, clock, reading, alerts)
                            with state_lock:
                                state['last_ok_at'] = received_at
                                state['error'] = ''
                        except Exception as error:
                            errors.append('Could not store sensor reading: ' + str(error)[:200])
                    if errors:
                        with state_lock:
                            state['error'] = errors[-1]

                try:
                    await client.start_notify(TX_UUID, on_data)
                    with state_lock:
                        state.update(available=True, status='connected', device=device.name or DEVICE_NAME, reason='')
                    while client.is_connected and not stop_event.is_set() and get_enabled():
                        await asyncio.sleep(.1)
                finally:
                    try:
                        if client.is_connected:
                            await client.stop_notify(TX_UUID)
                    except Exception:
                        pass
            finally:
                # __aexit__ would not run if cancellation interrupted __aenter__.
                # Explicit cleanup also covers a partially established connection.
                try:
                    await client.disconnect()
                except Exception as error:
                    with state_lock:
                        state.update(available=False, status='unavailable', reason='BLE disconnect failed; check the local gateway', error=str(error)[:300])
        except Exception as e:
            if not stop_event.is_set() and get_enabled():
                with state_lock:
                    state.update(available=False, status='unavailable', reason='BLE adapter or connection unavailable; check the gateway and retry', error=str(e)[:300])
                return
        if not stop_event.is_set() and get_enabled():
            await asyncio.sleep(2)
    with state_lock:
        if state['available']:
            state['status'] = 'disconnected'

def _ble_thread(database_path, clock, get_enabled, state, state_lock, stop_event, alerts=None):
    async def supervise():
        task = asyncio.create_task(_ble_main(database_path, clock, get_enabled, state, state_lock, stop_event, alerts))
        try:
            while not task.done() and not stop_event.is_set() and get_enabled():
                await asyncio.sleep(.05)
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=False)
    try:
        asyncio.run(supervise())
    except asyncio.CancelledError:
        pass
    except Exception as e:
        with state_lock:
            state.update(available=False, status='unavailable', reason='BLE worker failed', error=str(e)[:300])

def create_app(database_path=None, token=None, clock=time.time, ble_enabled=None, admin_token=None, sms_provider=None):
    database_path = str(database_path or os.getenv('SENSOR_DATABASE_PATH', 'server/sensors.sqlite3'))
    token = token if token is not None else os.getenv('SENSOR_PUSH_TOKEN', '')
    admin_token = admin_token if admin_token is not None else os.getenv('SENSOR_ADMIN_TOKEN', '')
    initial_enabled = (str(os.getenv('SENSOR_BLE_ENABLED', '0')).lower() in ('1','true','yes','on')
                       if ble_enabled is None else bool(ble_enabled))
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, received_at REAL NOT NULL, payload TEXT NOT NULL)')

    alerts = SensorAlerts(database_path, clock, sms_provider)
    sms_stop_event = threading.Event()

    cfg_lock = threading.Lock()
    cfg = {'enabled': initial_enabled}
    control_lock = threading.Lock()
    state_lock = threading.Lock()
    available = _ble_runtime_available()
    ble_state = {'available': available, 'status': 'disconnected' if available else 'unavailable', 'device': DEVICE_NAME,
                 'reason': '' if available else 'Install the BLE runtime on the local sensor gateway', 'error': '', 'last_ok_at': None}
    stop_event = threading.Event()
    thread = None

    def get_enabled():
        with cfg_lock:
            return cfg['enabled']

    def start_thread():
        nonlocal thread, stop_event
        if thread and thread.is_alive():
            return
        stop_event = threading.Event()
        thread = threading.Thread(target=_ble_thread, args=(database_path, clock, get_enabled, ble_state, state_lock, stop_event, alerts),
                                  name='meraki-ble-gateway', daemon=True)
        thread.start()

    def stop_thread():
        stop_event.set()
        if thread:
            thread.join(timeout=3)
        with state_lock:
            if thread and thread.is_alive():
                ble_state.update(status='stopping', error='BLE worker is still shutting down; retry after it stops')
            elif ble_state['available']:
                ble_state['status'] = 'disconnected'

    @asynccontextmanager
    async def lifespan(_app):
        with control_lock:
            if get_enabled() and ble_state['available']:
                start_thread()
        # SMS continues independently when Bluetooth is disabled/disconnected;
        # HTTP pushes can still contain warnings while no radio is enabled.
        sms_stop_event.clear()
        def sms_loop():
            while not sms_stop_event.is_set():
                try:
                    if alerts.dispatch_once():
                        continue
                except Exception:
                    import logging
                    logging.getLogger(__name__).warning('SMS worker unavailable; retrying')
                sms_stop_event.wait(2)
        sms_thread = threading.Thread(target=sms_loop, name='meraki-sms-worker', daemon=True)
        sms_thread.start()
        try:
            yield
        finally:
            sms_stop_event.set()
            with control_lock:
                stop_thread()
            sms_thread.join(timeout=12)

    app = FastAPI(title='Meraki live crate sensors', lifespan=lifespan)

    app.state.alerts = alerts

    def require_admin(value):
        if not admin_token:
            raise HTTPException(503, 'Configure SENSOR_ADMIN_TOKEN to manage FPO SMS alerts')
        if not hmac.compare_digest(value.encode(), admin_token.encode()):
            raise HTTPException(401, 'Invalid sensor admin key')

    @app.get('/api/sensors/alerts')
    def alert_settings(x_sensor_admin_key: str = Header(default='')):
        require_admin(x_sensor_admin_key)
        return alerts.snapshot()

    @app.post('/api/sensors/alerts/profiles')
    def save_profile(profile: FpoProfile, x_sensor_admin_key: str = Header(default='')):
        require_admin(x_sensor_admin_key)
        alerts.save_profile(profile)
        return {'ok': True}

    @app.post('/api/sensors/alerts/crates')
    def save_rule(rule: CrateRule, x_sensor_admin_key: str = Header(default='')):
        require_admin(x_sensor_admin_key)
        try:
            alerts.save_rule(rule)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return {'ok': True}

    @app.post('/api/sensors')
    def push(reading: Reading, x_sensor_key: str = Header(default='')):
        if not token:
            raise HTTPException(503, 'Configure SENSOR_PUSH_TOKEN on the gateway before accepting readings')
        if not hmac.compare_digest(x_sensor_key.encode(), token.encode()):
            raise HTTPException(401, 'Invalid sensor key')
        received_at = _store_reading(database_path, clock, reading, alerts)
        return {'ok': True, 'received_at': received_at}

    @app.get('/api/sensors')
    def latest():
        with sqlite3.connect(database_path, timeout=10) as db:
            rows = db.execute('SELECT r.id, r.received_at, r.payload FROM readings r JOIN (SELECT device_id, MAX(id) AS latest FROM readings GROUP BY device_id) d ON r.id=d.latest ORDER BY r.device_id').fetchall()
            rules = {device: json.loads(payload) for device, payload in db.execute('SELECT device_id,payload FROM sensor_crate_rules')}
        now = clock()
        devices = []
        for key, stamp, payload in rows:
            value = json.loads(payload)
            rule = rules.get(value['device_id'])
            value.update(id=key, received_at=stamp, stale=now-stamp>30,
                         range_problems=evaluate(value, rule) if rule else [],
                         range_configured=rule is not None)
            devices.append(value)
        return {'server_time': now, 'stale_after_seconds': 30, 'devices': devices}

    @app.get('/api/sensors/bluetooth')
    def ble_status():
        with state_lock:
            st = dict(ble_state)
        with cfg_lock:
            st['enabled'] = cfg['enabled'] and st['available']
        st['device_name'] = DEVICE_NAME
        st['tx_uuid'] = TX_UUID
        st['http_push_available'] = bool(token)
        return st

    @app.post('/api/sensors/bluetooth')
    def ble_connect(cfg_in: BleConnect):
        with control_lock:
            if cfg_in.enabled and not _ble_runtime_available():
                raise HTTPException(503, 'BLE runtime unavailable on this gateway')
            if cfg_in.enabled and thread and thread.is_alive() and stop_event.is_set():
                raise HTTPException(409, 'BLE worker is still stopping; retry after it stops')
            with cfg_lock:
                cfg['enabled'] = cfg_in.enabled
            if cfg_in.enabled:
                if not thread or not thread.is_alive():
                    with state_lock:
                        ble_state.update(available=True, status='scanning', error='', reason='')
                start_thread()
            else:
                stop_thread()
        return ble_status()

    # compatibility
    @app.get('/api/sensors/serial')
    def serial_status_compat():
        return {'available': False, 'status': 'unavailable', 'reason': 'Serial transport is disabled; use the local Bluetooth gateway',
                'port': '', 'baud': 0, 'error': '', 'ports': [], 'last_ok_at': None}

    @app.post('/api/sensors/serial')
    def serial_connect_compat():
        raise HTTPException(409, 'Serial transport is disabled; use the local Bluetooth gateway')

    return app

app = create_app()
