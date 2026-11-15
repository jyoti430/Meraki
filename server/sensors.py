"""LAN sensor gateway. Independent of synthetic trade identities and records."""
import hmac
import os
import sqlite3
import json
import time
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictStr

class Reading(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    device_id: Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')] = 'crate-01'
    temperature: Annotated[float, Field(strict=True, ge=-50, le=100)]
    humidity: Annotated[float, Field(strict=True, ge=0, le=100)]
    warnings: list[Annotated[StrictStr, Field(min_length=1, max_length=200)]] = Field(max_length=20)

def create_app(database_path=None, token=None, clock=time.time):
    database_path = str(database_path or os.getenv('SENSOR_DATABASE_PATH', 'server/sensors.sqlite3'))
    token = token if token is not None else os.getenv('SENSOR_PUSH_TOKEN', '')
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database_path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, received_at REAL NOT NULL, payload TEXT NOT NULL)')
    app = FastAPI(title='Meraki live crate sensors')

    @app.post('/api/sensors')
    def push(reading: Reading, x_sensor_key: str = Header(default='')):
        if not token:
            raise HTTPException(503, 'Configure SENSOR_PUSH_TOKEN on the gateway before accepting readings')
        if not hmac.compare_digest(x_sensor_key.encode(), token.encode()):
            raise HTTPException(401, 'Invalid sensor key')
        received_at = clock()
        with sqlite3.connect(database_path, timeout=10) as db:
            db.execute('INSERT INTO readings(device_id, received_at, payload) VALUES(?,?,?)', (reading.device_id, received_at, reading.model_dump_json()))
            # Keep bounded recent history per device; latest values survive gateway restarts.
            db.execute('DELETE FROM readings WHERE device_id=? AND id NOT IN (SELECT id FROM readings WHERE device_id=? ORDER BY id DESC LIMIT 120)', (reading.device_id, reading.device_id))
        return {'ok': True, 'received_at': received_at}

    @app.get('/api/sensors')
    def latest():
        with sqlite3.connect(database_path, timeout=10) as db:
            rows = db.execute('SELECT r.id, r.received_at, r.payload FROM readings r JOIN (SELECT device_id, MAX(id) AS latest FROM readings GROUP BY device_id) d ON r.id=d.latest ORDER BY r.device_id').fetchall()
        now = clock()
        return {'server_time': now, 'stale_after_seconds': 30, 'devices': [dict(json.loads(payload), id=key, received_at=stamp, stale=now-stamp>30) for key, stamp, payload in rows]}

    return app

app = create_app()
