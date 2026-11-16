"""Local-gateway FPO contacts, crate rules and durable SMS outbox."""
import json
import os
import re
import sqlite3
from typing import Annotated
import httpx
from pydantic import BaseModel, ConfigDict, Field, model_validator

Identifier = Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{1,64}$')]


class FpoProfile(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    id: Identifier
    name: Annotated[str, Field(min_length=1, max_length=100)]
    phone: Annotated[str, Field(pattern=r'^\+[1-9][0-9]{7,14}$')]
    sms_enabled: bool = True


class CrateRule(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
    device_id: Identifier
    profile_id: Identifier
    temperature_min: Annotated[float | None, Field(ge=-50, le=100)] = None
    temperature_max: Annotated[float | None, Field(ge=-50, le=100)] = None
    humidity_min: Annotated[float | None, Field(ge=0, le=100)] = None
    humidity_max: Annotated[float | None, Field(ge=0, le=100)] = None
    location: Annotated[str, Field(max_length=120)] = ''
    alert_on_warnings: bool = True
    cooldown_seconds: Annotated[int, Field(strict=True, ge=60, le=86400)] = 1800

    @model_validator(mode='after')
    def ordered_ranges(self):
        for name in ('temperature', 'humidity'):
            low, high = getattr(self, name + '_min'), getattr(self, name + '_max')
            if (low is None) != (high is None):
                raise ValueError('Supply both limits or leave both unset')
            if low is not None and low >= high:
                raise ValueError('Each minimum must be below its maximum')
        if not self.alert_on_warnings and self.temperature_min is None and self.humidity_min is None:
            raise ValueError('Enable device warnings or configure at least one sensor range')
        return self


class SmsFailure(Exception):
    def __init__(self, reason, retryable=False, uncertain=False):
        self.reason, self.retryable, self.uncertain = reason, retryable, uncertain
        super().__init__(reason)


class TwilioSms:
    def __init__(self, environ=None, transport=None):
        env = os.environ if environ is None else environ
        self.sid = env.get('TWILIO_ACCOUNT_SID', '').strip()
        self.token = env.get('TWILIO_AUTH_TOKEN', '').strip()
        self.sender = env.get('TWILIO_FROM_NUMBER', '').strip()
        self.service = env.get('TWILIO_MESSAGING_SERVICE_SID', '').strip()
        self.transport = transport

    @property
    def configured(self):
        return bool(re.fullmatch(r'AC[a-fA-F0-9]{32}', self.sid) and self.token and (self.sender or self.service))

    def send(self, phone, body):
        if not self.configured:
            raise SmsFailure('SMS provider is not configured', retryable=True)
        data = {'To': phone, 'Body': body}
        data.update({'MessagingServiceSid': self.service} if self.service else {'From': self.sender})
        try:
            with httpx.Client(timeout=10, transport=self.transport) as client:
                response = client.post(f'https://api.twilio.com/2010-04-01/Accounts/{self.sid}/Messages.json',
                                       data=data, auth=(self.sid, self.token))
        except httpx.RequestError:
            # The provider may already have accepted the request. Do not blindly
            # retry a chargeable message without a provider idempotency contract.
            raise SmsFailure('Provider response unknown; check Twilio before resending', uncertain=True) from None
        if response.status_code != 201:
            raise SmsFailure(f'SMS provider returned HTTP {response.status_code}',
                             retryable=response.status_code == 429 or response.status_code >= 500)
        try:
            sid = response.json()['sid']
            if not isinstance(sid, str) or not re.fullmatch(r'SM[a-fA-F0-9]{32}', sid):
                raise ValueError('Invalid message SID')
        except (ValueError, KeyError, TypeError):
            raise SmsFailure('Provider accepted request but returned an invalid receipt; check Twilio', uncertain=True) from None
        return sid


def evaluate(reading, rule):
    problems = []
    for field, label, unit in [('temperature', 'Temperature', 'C'), ('humidity', 'Humidity', '% RH')]:
        low, high = rule[field + '_min'], rule[field + '_max']
        value = reading[field]
        if low is not None and high is not None and (value < low or value > high):
            problems.append(f'{label} {value:g}{unit} outside {low:g}-{high:g}{unit}')
    if rule['alert_on_warnings']:
        problems.extend(reading.get('warnings', []))
    return list(dict.fromkeys(problems))


class SensorAlerts:
    def __init__(self, path, clock, provider=None):
        self.path, self.clock = path, clock
        self.provider = provider if provider is not None else TwilioSms()
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS sensor_fpo_profiles (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sensor_crate_rules (device_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sensor_alert_state (device_id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0, last_queued REAL);
                CREATE TABLE IF NOT EXISTS sensor_sms_outbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, profile_id TEXT NOT NULL,
                    phone TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
                    created_at REAL NOT NULL, next_attempt REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                    provider_id TEXT, error TEXT, updated_at REAL NOT NULL);
            ''')
            # A process might have died after the external side effect. Keep this
            # visible for reconciliation instead of sending it twice.
            db.execute("UPDATE sensor_sms_outbox SET status='uncertain', error='Gateway restarted during send; check Twilio', updated_at=? WHERE status='sending'", (clock(),))

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def save_profile(self, profile):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT payload FROM sensor_fpo_profiles WHERE id=?', (profile.id,)).fetchone()
            db.execute('INSERT INTO sensor_fpo_profiles VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
                       (profile.id, profile.model_dump_json()))
            if old and json.loads(old['payload']) != profile.model_dump():
                db.execute("UPDATE sensor_sms_outbox SET status='cancelled', error='FPO contact changed', updated_at=? WHERE profile_id=? AND status IN ('queued','retry')", (self.clock(), profile.id))
                db.execute('DELETE FROM sensor_alert_state WHERE device_id IN (SELECT device_id FROM sensor_crate_rules WHERE profile_id=?)', (profile.id,))

    def save_rule(self, rule):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT 1 FROM sensor_fpo_profiles WHERE id=?', (rule.profile_id,)).fetchone():
                raise ValueError('Save the FPO profile before assigning a crate')
            old = db.execute('SELECT payload FROM sensor_crate_rules WHERE device_id=?', (rule.device_id,)).fetchone()
            db.execute('INSERT INTO sensor_crate_rules VALUES (?,?,?) ON CONFLICT(device_id) DO UPDATE SET profile_id=excluded.profile_id,payload=excluded.payload',
                       (rule.device_id, rule.profile_id, rule.model_dump_json()))
            if old and json.loads(old['payload']) != rule.model_dump():
                db.execute("UPDATE sensor_sms_outbox SET status='cancelled', error='Crate rule changed', updated_at=? WHERE device_id=? AND status IN ('queued','retry')", (self.clock(), rule.device_id))
                db.execute('DELETE FROM sensor_alert_state WHERE device_id=?', (rule.device_id,))

    def observe(self, db, reading, received_at):
        """Called inside the same transaction that persists the sensor reading."""
        row = db.execute('SELECT payload FROM sensor_crate_rules WHERE device_id=?', (reading.device_id,)).fetchone()
        if not row:
            return
        rule = json.loads(row[0])
        problems = evaluate(reading.model_dump(), rule)
        if not problems:
            db.execute('UPDATE sensor_alert_state SET active=0 WHERE device_id=?', (reading.device_id,))
            db.execute("UPDATE sensor_sms_outbox SET status='cancelled', error='Reading returned within range', updated_at=? WHERE device_id=? AND status IN ('queued','retry')", (received_at, reading.device_id))
            return
        profile_row = db.execute('SELECT payload FROM sensor_fpo_profiles WHERE id=?', (rule['profile_id'],)).fetchone()
        if not profile_row:
            return
        profile = json.loads(profile_row[0])
        if not profile['sms_enabled']:
            return
        state = db.execute('SELECT last_queued FROM sensor_alert_state WHERE device_id=?', (reading.device_id,)).fetchone()
        # Reminders and recovery/re-entry both respect the cooldown, limiting
        # threshold-flapping spam while retaining persistent-incident reminders.
        if state and state[0] is not None and received_at - state[0] < rule['cooldown_seconds']:
            db.execute('UPDATE sensor_alert_state SET active=1 WHERE device_id=?', (reading.device_id,))
            return
        if db.execute("SELECT 1 FROM sensor_sms_outbox WHERE device_id=? AND status IN ('queued','retry','sending')", (reading.device_id,)).fetchone():
            return
        details = '; '.join(problems)
        if len(details) > 220:
            details = details[:217] + '...'
        body = f'Meraki alert: Crate {reading.device_id}. {details}.'
        if rule['location']:
            body += ' Location: ' + rule['location'] + '.'
        db.execute('INSERT INTO sensor_sms_outbox(device_id,profile_id,phone,body,created_at,next_attempt,updated_at) VALUES(?,?,?,?,?,?,?)',
                   (reading.device_id, profile['id'], profile['phone'], body, received_at, received_at, received_at))
        db.execute('INSERT INTO sensor_alert_state VALUES (?,1,?) ON CONFLICT(device_id) DO UPDATE SET active=1,last_queued=excluded.last_queued',
                   (reading.device_id, received_at))

    def dispatch_once(self):
        if not self.provider.configured:
            return False
        now = self.clock()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT * FROM sensor_sms_outbox WHERE status IN ('queued','retry') AND next_attempt<=? ORDER BY id LIMIT 1", (now,)).fetchone()
            if row is None:
                return False
            latest = db.execute('SELECT received_at FROM readings WHERE device_id=? ORDER BY id DESC LIMIT 1', (row['device_id'],)).fetchone()
            if latest is None or now - latest[0] > 30:
                db.execute("UPDATE sensor_sms_outbox SET status='expired',error='No fresh sensor reading; waiting for new data',updated_at=? WHERE id=?", (now, row['id']))
                db.execute('UPDATE sensor_alert_state SET last_queued=NULL WHERE device_id=?', (row['device_id'],))
                return True
            db.execute("UPDATE sensor_sms_outbox SET status='sending',attempts=attempts+1,updated_at=? WHERE id=?", (now, row['id']))
        provider_id, error = None, None
        try:
            provider_id = self.provider.send(row['phone'], row['body'])
            status = 'accepted'
        except SmsFailure as exc:
            error = exc.reason
            status = 'uncertain' if exc.uncertain else 'retry' if exc.retryable and row['attempts'] + 1 < 5 else 'failed'
        except Exception:
            error, status = 'Unexpected provider failure; check Twilio before resending', 'uncertain'
        with self.connect() as db:
            db.execute('UPDATE sensor_sms_outbox SET status=?,provider_id=?,error=?,updated_at=?,next_attempt=? WHERE id=?',
                       (status, provider_id, error, self.clock(), self.clock() + min(60 * 2 ** row['attempts'], 900), row['id']))
        return True

    def snapshot(self):
        with self.connect() as db:
            profiles = [json.loads(r[0]) for r in db.execute('SELECT payload FROM sensor_fpo_profiles ORDER BY id')]
            rules = [json.loads(r[0]) for r in db.execute('SELECT payload FROM sensor_crate_rules ORDER BY device_id')]
            alerts = [dict(r) for r in db.execute('SELECT id,device_id,profile_id,body,status,attempts,provider_id,error,created_at,updated_at FROM sensor_sms_outbox ORDER BY id DESC LIMIT 50')]
        return dict(provider='twilio', provider_configured=self.provider.configured, profiles=profiles, rules=rules, alerts=alerts)
