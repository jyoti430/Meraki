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

def _store_reading(database_path, clock, reading: Reading):
    received_at = clock()
    with sqlite3.connect(database_path, timeout=10) as db:
        db.execute('INSERT INTO readings(device_id, received_at, payload) VALUES(?,?,?)', (reading.device_id, received_at, reading.model_dump_json()))
        db.execute('DELETE FROM readings WHERE device_id=? AND id NOT IN (SELECT id FROM readings WHERE device_id=? ORDER BY id DESC LIMIT 120)', (reading.device_id, reading.device_id))
    return received_at

def _serial_loop(database_path, clock, port, baud, stop_event: threading.Event):
    try:
        import serial  # pyserial
    except Exception:
        print('[sensors] pyserial not installed; USB serial disabled')
        return
    while not stop_event.is_set():
        ser = None
        try:
            ser = serial.Serial(port, baudrate=baud, timeout=1)
            print(f'[sensors] USB serial connected: {port} @ {baud}')
            while not stop_event.is_set():
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
                except Exception as e:
                    print(f'[sensors] Ignored invalid serial reading: {e}')
        except Exception as e:
            if not stop_event.is_set():
                print(f'[sensors] Serial {port} unavailable: {e}; retrying in 2s')
        finally:
            try:
                if ser and ser.is_open:
                    ser.close()
            except Exception:
                pass
        if not stop_event.is_set():
            stop_event.wait(2)

def create_app(database_path=None, token=None, clock=time.time, serial_port=None, serial_baud=None):
    database_path = str(database_path or os.getenv('SENSOR_DATABASE_PATH', 'server/sensors.sqlite3'))
    token = token if token is not None else os.getenv('SENSOR_PUSH_TOKEN', '')
    serial_port = serial_port if serial_port is not None else os.getenv('SENSOR_SERIAL_PORT', '').strip()
    serial_baud = int(serial_baud if serial_baud is not None else os.getenv('SENSOR_BAUD', '9600'))
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, received_at REAL NOT NULL, payload TEXT NOT NULL)')

    stop_event = threading.Event()
    serial_thread = None

    @asynccontextmanager
    async def lifespan(_app):
        nonlocal serial_thread
        if serial_port:
            serial_thread = threading.Thread(target=_serial_loop, args=(database_path, clock, serial_port, serial_baud, stop_event), daemon=True)
            serial_thread.start()
        yield
        stop_event.set()
        if serial_thread:
            serial_thread.join(timeout=2)

    app = FastAPI(title='Meraki live crate sensors', lifespan=lifespan)
    app.state.serial_port = serial_port

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

    return app

app = create_app()
