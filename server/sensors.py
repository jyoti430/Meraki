"""Sensor gateway. Reads USB serial (@SENSOR JSON) and/or LAN HTTP pushes; independent of synthetic trade identities."""
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

class Reading(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    device_id: Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')] = 'crate-01'
    temperature: Annotated[float, Field(strict=True, ge=-50, le=100)]
    humidity: Annotated[float, Field(strict=True, ge=0, le=100)]
    opened_count: Optional[Annotated[int, Field(strict=True, ge=0, le=10_000_000)]] = None
    closed_count: Optional[Annotated[int, Field(strict=True, ge=0, le=10_000_000)]] = None
    warnings: list[Annotated[StrictStr, Field(min_length=1, max_length=200)]] = Field(max_length=20)

class SerialConnect(BaseModel):
    model_config = ConfigDict(extra='forbid')
    port: Annotated[str, Field(max_length=120)] = ''
    baud: Annotated[int, Field(strict=True, ge=1200, le=921600)] = 115200

def _store_reading(database_path, clock, reading: Reading):
    received_at = clock()
    with sqlite3.connect(database_path, timeout=10) as db:
        db.execute('INSERT INTO readings(device_id, received_at, payload) VALUES(?,?,?)', (reading.device_id, received_at, reading.model_dump_json()))
        db.execute('DELETE FROM readings WHERE device_id=? AND id NOT IN (SELECT id FROM readings WHERE device_id=? ORDER BY id DESC LIMIT 120)', (reading.device_id, reading.device_id))
    return received_at

def _list_ports():
    try:
        from serial.tools import list_ports
        return [dict(port=p.device, description=p.description or '', hwid=p.hwid or '') for p in list_ports.comports()]
    except Exception:
        return []

def _serial_loop(database_path, clock, get_config, state, state_lock, stop_event: threading.Event):
    try:
        import serial
    except Exception as e:
        with state_lock:
            state['status'] = 'error'
            state['error'] = f'pyserial not installed: {e}'
        return
    while not stop_event.is_set():
        port, baud = get_config()
        if not port:
            with state_lock:
                if state['status'] not in ('disconnected',):
                    state['status'] = 'disconnected'
                state['error'] = ''
            if stop_event.wait(1):
                break
            continue
        ser = None
        try:
            ser = serial.Serial(port, baudrate=baud, timeout=1)
            with state_lock:
                state['status'] = 'connected'
                state['error'] = ''
                state['port'] = port
                state['baud'] = baud
            print(f'[sensors] USB serial connected: {port} @ {baud}')
            while not stop_event.is_set():
                cur_port, cur_baud = get_config()
                if cur_port != port or cur_baud != baud:
                    break
                raw = ser.readline()
                if not raw:
                    continue
                try:
                    line = raw.decode('utf-8', errors='ignore').strip()
                except Exception:
                    continue
                if '@SENSOR' not in line:
                    continue
                payload = line.split('@SENSOR', 1)[1].strip()
                if not payload:
                    continue
                try:
                    data = json.loads(payload)
                    reading = Reading.model_validate(data)
                    _store_reading(database_path, clock, reading)
                    with state_lock:
                        state['last_ok_at'] = clock()
                except Exception as e:
                    with state_lock:
                        state['error'] = f'Ignored invalid reading: {e}'
        except Exception as e:
            if not stop_event.is_set():
                with state_lock:
                    state['status'] = 'connecting'
                    state['error'] = str(e)
                print(f'[sensors] Serial {port} unavailable: {e}; retrying in 2s')
        finally:
            try:
                if ser and ser.is_open:
                    ser.close()
            except Exception:
                pass
        cur_port, _ = get_config()
        if not stop_event.is_set() and cur_port == port:
            stop_event.wait(2)
    with state_lock:
        state['status'] = 'disconnected'

def create_app(database_path=None, token=None, clock=time.time, serial_port=None, serial_baud=None):
    database_path = str(database_path or os.getenv('SENSOR_DATABASE_PATH', 'server/sensors.sqlite3'))
    token = token if token is not None else os.getenv('SENSOR_PUSH_TOKEN', '')
    env_port = serial_port if serial_port is not None else os.getenv('SENSOR_SERIAL_PORT', '').strip()
    env_baud = int(serial_baud if serial_baud is not None else os.getenv('SENSOR_BAUD', '115200'))
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, received_at REAL NOT NULL, payload TEXT NOT NULL)')

    cfg_lock = threading.Lock()
    serial_cfg = {'port': env_port, 'baud': env_baud}
    state_lock = threading.Lock()
    serial_state = {'status': 'disconnected', 'port': env_port, 'baud': env_baud, 'error': '', 'last_ok_at': None}
    stop_event = threading.Event()
    thread = None

    def get_config():
        with cfg_lock:
            return serial_cfg['port'], serial_cfg['baud']

    def start_thread():
        nonlocal thread
        if thread and thread.is_alive():
            return
        stop_event.clear()
        thread = threading.Thread(target=_serial_loop, args=(database_path, clock, get_config, serial_state, state_lock, stop_event), daemon=True)
        thread.start()

    @asynccontextmanager
    async def lifespan(_app):
        start_thread()
        yield
        stop_event.set()
        if thread:
            thread.join(timeout=2)

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

    @app.get('/api/sensors/serial')
    def serial_status():
        with state_lock:
            st = dict(serial_state)
        with cfg_lock:
            st['port'] = serial_cfg['port']
            st['baud'] = serial_cfg['baud']
        st['ports'] = _list_ports()
        return st

    @app.post('/api/sensors/serial')
    def serial_connect(cfg: SerialConnect):
        port = (cfg.port or '').strip()
        with cfg_lock:
            serial_cfg['port'] = port
            serial_cfg['baud'] = int(cfg.baud)
        with state_lock:
            serial_state['port'] = port
            serial_state['baud'] = int(cfg.baud)
            serial_state['status'] = 'connecting' if port else 'disconnected'
            serial_state['error'] = ''
        start_thread()
        return serial_status()

    return app

app = create_app()
