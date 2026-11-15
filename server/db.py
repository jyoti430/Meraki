"""Durable transaction boundary shared by commands, worker and capacity ledger.

PostgreSQL takes a row lock before *every* trade write. This deliberately coarse
lock also orders bids and makes idempotency deterministic across API processes.
SQLite's BEGIN IMMEDIATE is a local demonstration analogue, not PG acceptance.
"""
from contextlib import contextmanager
import hashlib
import json

from sqlalchemy import JSON, Integer, String, create_engine, event, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class TradeLock(Base):
    __tablename__ = 'trade_lock'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)


class Resource(Base):
    __tablename__ = 'trade_resources'
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    document: Mapped[dict] = mapped_column(JSON)


class Command(Base):
    __tablename__ = 'trade_commands'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)


class PrincipalSession(Base):
    __tablename__ = 'trade_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    principal_id: Mapped[str] = mapped_column(String(80))
    expires_at: Mapped[str] = mapped_column(String(40))


class SchemaVersion(Base):
    __tablename__ = 'trade_schema_version'
    version: Mapped[int] = mapped_column(Integer, primary_key=True)


class Database:
    def __init__(self, url):
        self.url = url
        self.engine = create_engine(url, connect_args={'check_same_thread': False, 'timeout': 30} if url.startswith('sqlite') else {}, pool_pre_ping=True)
        if url.startswith('sqlite'):
            @event.listens_for(self.engine, 'connect')
            def pragmas(connection, _):
                connection.execute('PRAGMA foreign_keys=ON')
                connection.execute('PRAGMA journal_mode=WAL')
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    def migrate(self):
        # Initial additive migration. Subsequent schema changes must add explicit
        # numbered migrations; this is not an automatic destructive upgrader.
        with self.engine.connect() as connection:
            if self.engine.dialect.name == 'postgresql':
                # API and worker may start together. Serialise schema checks and
                # DDL across processes before creating the command lock itself.
                connection.execute(text('SELECT pg_advisory_xact_lock(726527603)'))
                Base.metadata.create_all(connection)
                connection.execute(text('INSERT INTO trade_lock (id) VALUES (1) ON CONFLICT DO NOTHING'))
                connection.execute(text('INSERT INTO trade_schema_version (version) VALUES (1) ON CONFLICT DO NOTHING'))
            else:
                connection.execute(text('BEGIN IMMEDIATE'))
                Base.metadata.create_all(connection)
                connection.execute(text('INSERT OR IGNORE INTO trade_lock (id) VALUES (1)'))
                connection.execute(text('INSERT OR IGNORE INTO trade_schema_version (version) VALUES (1)'))
            connection.commit()

    @contextmanager
    def transaction(self):
        with self.sessions() as session:
            try:
                if self.engine.dialect.name == 'sqlite':
                    session.execute(text('BEGIN IMMEDIATE'))
                else:
                    session.execute(select(TradeLock).where(TradeLock.id == 1).with_for_update()).scalar_one()
                yield session
                session.commit()
            except BaseException:
                session.rollback()
                raise


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
