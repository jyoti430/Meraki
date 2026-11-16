"""Sensor gateway. Reads BLE (@SENSOR JSON) and/or LAN HTTP pushes; independent of synthetic trade identities."""
import asyncio
import hmac
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
    enabled: bool = True

def _store_reading(database_path, clock, reading: Reading):
    received_at = clock()
    with sqlite3.connect(database_path, timeout=10) as db:
        db.execute('INSERT INTO readings(device_id, received_at, payload) VALUES(?,?,?)', (reading.device_id, received_at, reading.model_dump_json()))
        db.execute('DELETE FROM readings WHERE device_id=? AND id NOT IN (SELECT id FROM readings WHERE device_id=? ORDER BY id DESC LIMIT 120)', (reading.device_id, reading.device_id))
    return received_at

async def _ble_main(database_path, clock, get_enabled, state, state_lock, stop_event: threading.Event):
    try:
        from bleak import BleakScanner, BleakClient
    except Exception as e:
        with state_lock:
            state['status'] = 'error'
            state['error'] = f'bleak not installed: {e}'
        return
    while not stop_event.is_set():
        if not get_enabled():
            with state_lock:
                state['status'] = 'disconnected'
                state['error'] = ''
            await asyncio.sleep(1)
            continue
        try:
            with state_lock:
                state['status'] = 'scanning'
                state['error'] = ''
            print(f'[sensors] Scanning for {DEVICE_NAME}...')
            device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=10)
            if device is None:
                with state_lock:
                    state['status'] = 'not_found'
                    state['error'] = 'Device not found. Check power and Bluetooth.'
                await asyncio.sleep(3)
                continue
            with state_lock:
                state['status'] = 'connecting'
            print(f'[sensors] Found: {device.name}; connecting...')
            async with BleakClient(device, disconnected_callback=lambda _c: None) as client:
                with state_lock:
                    state['status'] = 'connected'
                    state['device'] = device.name or DEVICE_NAME
                    state['error'] = ''
                print('[sensors] BLE CONNECTED; waiting for sensor data')

                def on_data(_sender, data: bytearray):
                    try:
                        message = data.decode('utf-8', errors='replace').strip()
                    except Exception:
                        return
                    if '@SENSOR' not in message:
                        return
                    payload = message.split('@SENSOR', 1)[1].strip()
                    if not payload:
                        return
                    try:
                        reading = Reading.model_validate(json.loads(payload))
                        _store_reading(database_path, clock, reading)
                        with state_lock:
                            state['last_ok_at'] = clock()
                    except Exception as e:
                        with state_lock:
                            state['error'] = f'Ignored invalid reading: {e}'

                await client.start_notify(TX_UUID, on_data)
                while client.is_connected and not stop_event.is_set() and get_enabled():
                    await asyncio.sleep(1)
                try:
                    if client.is_connected:
                        await client.stop_notify(TX_UUID)
                except Exception:
                    pass
        except Exception as e:
            if not stop_event.is_set() and get_enabled():
                with state_lock:
                    state['status'] = 'error'
                    state['error'] = str(e)
                print(f'[sensors] BLE error: {e}; retrying')
        if not stop_event.is_set() and get_enabled():
            await asyncio.sleep(2)
    with state_lock:
        state['status'] = 'disconnected'

def _ble_thread(database_path, clock, get_enabled, state, state_lock, stop_event):
    try:
        asyncio.run(_ble_main(database_path, clock, get_enabled, state, state_lock, stop_event))
    except Exception as e:
        with state_lock:
            state['status'] = 'error'
            state['error'] = str(e)

def create_app(database_path=None, token=None, clock=time.time, ble_enabled=None):
    database_path = str(database_path or os.getenv('SENSOR_DATABASE_PATH', 'server/sensors.sqlite3'))
    token = token if token is not None else os.getenv('SENSOR_PUSH_TOKEN', '')
    initial_enabled = str(os.getenv('SENSOR_BLE_ENABLED', '1' if ble_enabled is None else ('1' if ble_enabled else '0'))).lower() in ('1','true','yes','on')
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, received_at REAL NOT NULL, payload TEXT NOT NULL)')

    cfg_lock = threading.Lock()
    cfg = {'enabled': initial_enabled}
    state_lock = threading.Lock()
    ble_state = {'status': 'disconnected', 'device': DEVICE_NAME, 'error': '', 'last_ok_at': None}
    stop_event = threading.Event()
    thread = None

    def get_enabled():
        with cfg_lock:
            return cfg['enabled']

    def start_thread():
        nonlocal thread
        if thread and thread.is_alive():
            return
        stop_event.clear()
        thread = threading.Thread(target=_ble_thread, args=(database_path, clock, get_enabled, ble_state, state_lock, stop_event), daemon=True)
        thread.start()

    @asynccontextmanager
    async def lifespan(_app):
        start_thread()
        yield
        stop_event.set()
        if thread:
            thread.join(timeout=3)

    app = FastAPI(title='Meraki live crate sensors', lifespan=lifespan)

    @app.post('/api/sensors')
    def push(reading: Reading, x_sensor_key: str = Header(default='')):
        if not token:
            raise HTTPException(503, 'Configure SENSOR_PUSH_TOKEN on the gateway before accepting readings')
        if not hmac.compare_digest(x_sensor_key.encode(), token.encode()):
            raise HTTPException(401, 'Invalid sensor key')
        received_at = _store_reading(database_path, clock, reading)
        return {'ok': True, 'received_at': received_at}

    @app.get('/api/sensors')
    def latest():
        with sqlite3.connect(database_path, timeout=10) as db:
            rows = db.execute('SELECT r.id, r.received_at, r.payload FROM readings r JOIN (SELECT device_id, MAX(id) AS latest FROM readings GROUP BY device_id) d ON r.id=d.latest ORDER BY r.device_id').fetchall()
        now = clock()
        return {'server_time': now, 'stale_after_seconds': 30, 'devices': [dict(json.loads(payload), id=key, received_at=stamp, stale=now-stamp>30) for key, stamp, payload in rows]}

    @app.get('/api/sensors/bluetooth')
    def ble_status():
        with state_lock:
            st = dict(ble_state)
        with cfg_lock:
            st['enabled'] = cfg['enabled']
        st['device_name'] = DEVICE_NAME
        st['tx_uuid'] = TX_UUID
        return st

    @app.post('/api/sensors/bluetooth')
    def ble_connect(cfg_in: BleConnect):
        with cfg_lock:
            cfg['enabled'] = bool(cfg_in.enabled)
        with state_lock:
            ble_state['status'] = 'scanning' if cfg_in.enabled else 'disconnected'
            if not cfg_in.enabled:
                ble_state['error'] = ''
        start_thread()
        return ble_status()

    # compatibility
    @app.get('/api/sensors/serial')
    def serial_status_compat():
        st = ble_status()
        return {'status': st.get('status'), 'port': st.get('device_name'), 'baud': 0, 'error': st.get('error'), 'ports': [], 'last_ok_at': st.get('last_ok_at')}

    @app.post('/api/sensors/serial')
    def serial_connect_compat():
        return serial_status_compat()

    return app

app = create_app()
