"""Upgrade retained pre-auction data without using current create_all metadata."""
import os
from pathlib import Path
import subprocess
import sys

import pytest
from sqlalchemy import MetaData, Table, create_engine, inspect, select
from sqlalchemy.exc import IntegrityError

ROOT = Path(__file__).resolve().parents[2]


def migrate(url, revision, direction="upgrade", *, success=True):
    result = subprocess.run([sys.executable, "-m", "alembic", "-c", "server/alembic.ini", direction, revision],
        cwd=ROOT, env={**os.environ, "MERAKI_DATABASE_URL": url}, capture_output=True, text=True, timeout=30)
    if success:
        assert result.returncode == 0, result.stderr
    return result


def seed_legacy(engine, *, duplicate_lots=False):
    metadata = MetaData()
    orgs = Table("organisations", metadata, autoload_with=engine)
    caps = Table("capacities", metadata, autoload_with=engine)
    with engine.begin() as db:
        from datetime import datetime, timezone
        db.execute(orgs.insert(), dict(id="retained-org", name="Synthetic retained org", status="active", created_at=datetime.now(timezone.utc)))
        common = dict(organisation_id="retained-org", crop="okra", variety="okra", grade="A", week_start="2026-12-01", week_end="2026-12-07",
            quantity_g=1000, reserved_g=100, committed_g=200, consent_status="opted-in", reviewed=True, status="available", version=3)
        # Multiple budgeted tranches of a projection are intentionally valid.
        db.execute(caps.insert(), [{**common, "id": "projection-tranche-a", "source_type": "projection", "source_id": "retained-projection"},
            {**common, "id": "projection-tranche-b", "source_type": "projection", "source_id": "retained-projection"},
            {**common, "id": "retained-lot-a", "source_type": "harvested_lot", "source_id": "retained-lot"}])
        if duplicate_lots:
            db.execute(caps.insert(), {**common, "id": "retained-lot-b", "source_type": "harvested_lot", "source_id": "retained-lot"})
    return caps


def test_fresh_schema_upgrade_rollback_and_upgrade(tmp_path):
    url = f"sqlite:///{tmp_path / 'fresh-migration.sqlite3'}"
    for revision, direction in [("head", "upgrade"), ("base", "downgrade"), ("head", "upgrade")]:
        migrate(url, revision, direction)
    engine = create_engine(url)
    try:
        tables = set(inspect(engine).get_table_names())
        assert {"auctions", "auction_awards", "password_credentials", "auth_throttles", "capacities"} <= tables
        assert "uq_capacity_source" in {item["name"] for item in inspect(engine).get_indexes("capacities")}
    finally:
        engine.dispose()


def test_retained_pre_auction_capacity_data_survives_upgrade_and_rollback(tmp_path):
    url = f"sqlite:///{tmp_path / 'retained-migration.sqlite3'}"
    migrate(url, "0001_shared_services")
    engine = create_engine(url)
    try:
        caps = seed_legacy(engine)
        with engine.connect() as db:
            before = list(db.execute(select(caps).order_by(caps.c.id)).mappings())
        for revision, direction in [("head", "upgrade"), ("0001_shared_services", "downgrade"), ("head", "upgrade")]:
            migrate(url, revision, direction)
            with engine.connect() as db:
                assert list(db.execute(select(caps).order_by(caps.c.id)).mappings()) == before
        duplicate = {**before[-1], "id": "new-lot-duplicate", "source_type": "harvested_lot", "source_id": "retained-lot"}
        with pytest.raises(IntegrityError), engine.begin() as db:
            db.execute(caps.insert(), duplicate)
    finally:
        engine.dispose()


@pytest.mark.parametrize("starting_revision", ["0001_shared_services", "bcd1160479c5"])
def test_duplicate_retained_lots_fail_before_partial_schema_changes(tmp_path, starting_revision):
    url = f"sqlite:///{tmp_path / 'duplicate-migration.sqlite3'}"
    migrate(url, starting_revision)
    engine = create_engine(url)
    try:
        caps = seed_legacy(engine, duplicate_lots=True)
        before_tables = set(inspect(engine).get_table_names())
        result = migrate(url, "head", success=False)
        assert result.returncode != 0
        assert "duplicate harvested-lot" in result.stderr
        assert set(inspect(engine).get_table_names()) == before_tables
        with engine.connect() as db:
            assert len(list(db.execute(select(caps)))) == 4
        # Explicit operator reconciliation in this disposable fixture permits retry.
        with engine.begin() as db:
            db.execute(caps.delete().where(caps.c.id == "retained-lot-b"))
        migrate(url, "head")
    finally:
        engine.dispose()


def test_mobile_upgrade_preserves_legacy_credentials_and_sessions(tmp_path):
    from datetime import datetime, timezone, timedelta
    url = f"sqlite:///{tmp_path / 'mobile-retained.sqlite3'}"
    migrate(url, "e24f867ea17b")
    engine = create_engine(url)
    try:
        metadata = MetaData()
        users = Table("users", metadata, autoload_with=engine)
        creds = Table("password_credentials", metadata, autoload_with=engine)
        sessions = Table("sessions", metadata, autoload_with=engine)
        with engine.begin() as db:
            db.execute(users.insert(), dict(id="legacy-user", email="synthetic@accounts.invalid", display_name="Synthetic legacy", status="active", identity_provider="local-password", created_at=datetime.now(timezone.utc)))
            db.execute(creds.insert(), dict(username="legacy", user_id="legacy-user", password_hash="retained-synthetic-hash"))
            db.execute(sessions.insert(), dict(token_hash="synthetic-token-hash", user_id="legacy-user", expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        for revision, direction in [("head", "upgrade"), ("e24f867ea17b", "downgrade"), ("head", "upgrade")]:
            migrate(url, revision, direction)
            with engine.connect() as db:
                assert db.execute(select(creds.c.password_hash)).scalar_one() == "retained-synthetic-hash"
                assert db.execute(select(sessions.c.token_hash)).scalar_one() == "synthetic-token-hash"
        credentials = Table("password_credentials", MetaData(), autoload_with=engine)
        with engine.connect() as db:
            assert db.execute(select(credentials.c.mobile_number)).scalar_one() is None
    finally:
        engine.dispose()
