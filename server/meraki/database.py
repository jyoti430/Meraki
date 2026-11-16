import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from .models import Base


def database_url():
    return os.getenv("MERAKI_DATABASE_URL", "sqlite:///./server/meraki-dev.sqlite3")


def make_engine(url=None):
    url = url or database_url()
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def sqlite_pragmas(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA journal_mode=WAL")
    return engine


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def initialize():
    """Convenience for disposable local development only; use Alembic elsewhere."""
    if os.getenv("MERAKI_ENV", "development") == "production":
        raise RuntimeError("Automatic create_all is disabled in production; run Alembic migrations")
    Base.metadata.create_all(engine)
