import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from server.meraki.app import create_app
from server.meraki.database import make_engine
from server.meraki.models import Base, Capacity, Job, Listing, Organization, Projection, Reservation, User
from server.meraki.worker import run_once


def make_capacity(client, seller, source, quantity=100000, key="capacity-check", **changes):
    return client.post("/api/v1/capacities", headers={**seller, "Idempotency-Key": key}, json={
        "source_type": "projection", "source_id": source, "crop": "okra", "variety": "local", "grade": "A",
        "week_start": "2026-12-01", "week_end": "2026-12-07", "quantity_g": quantity,
        "consent_status": "opted-in", **changes})


@pytest.mark.parametrize("changes", [{"crop": "tomato"}, {"variety": "other"}, {"grade": "B"},
                                     {"week_start": "2026-12-02"}, {"week_end": "2026-12-08"}])
def test_capacity_cannot_relabel_source_projection(api, changes):
    client, _ = api
    seller = login(client, "source-owner")
    source = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "source"}, json=projection()).json()["projection"]["id"]
    assert make_capacity(client, seller, source, **changes).status_code == 422


def test_multiple_capacity_rows_cannot_multiply_one_forecast(api):
    client, _ = api
    seller = login(client, "source-owner")
    source = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "source"}, json=projection()).json()["projection"]["id"]
    assert make_capacity(client, seller, source, 60000, "first").status_code == 201
    assert make_capacity(client, seller, source, 50000, "second").status_code == 409
    assert make_capacity(client, seller, source, 40000, "remaining").status_code == 201


def reserve_from_projection(client, seller, buyer):
    source = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "p"}, json=projection()).json()["projection"]["id"]
    cap = make_capacity(client, seller, source).json()["id"]
    client.post(f"/api/v1/capacities/{cap}/review", headers={**seller, "Idempotency-Key": "review"}, json={"decision": "approve", "reason": "Synthetic fixture"})
    client.post("/api/v1/listings", headers={**seller, "Idempotency-Key": "listing"}, json={"capacity_id": cap, "resource_type": "projection"})
    response = client.post("/api/v1/reservations", headers={**buyer, "Idempotency-Key": "reserve"}, json={
        "capacity_id": cap, "quantity_g": 60000, "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()})
    assert response.status_code == 201, response.text
    return source, cap, response.json()["reservation"]["id"]


def test_confirmation_rechecks_source_after_listing_and_reservation(api):
    client, app = api
    seller, buyer = login(client, "seller"), login(client, "buyer")
    source, cap, reservation = reserve_from_projection(client, seller, buyer)
    sessions = sessionmaker(bind=app.state.engine)
    with sessions.begin() as db:
        db.get(Projection, source).stale_after = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert client.get("/api/v1/market/listings", headers=buyer).json()["items"] == []
    response = client.post(f"/api/v1/reservations/{reservation}/transition", headers={**buyer, "Idempotency-Key": "confirm"}, json={"expected_version": 1, "action": "confirm"})
    assert response.status_code == 409
    with sessions() as db:
        assert db.get(Capacity, cap).committed_g == 0


def test_projection_revision_cannot_repromise_old_committed_quantity(api):
    client, _ = api
    seller, buyer = login(client, "seller"), login(client, "buyer")
    _, _, reservation = reserve_from_projection(client, seller, buyer)
    result = client.post(f"/api/v1/reservations/{reservation}/transition", headers={**buyer, "Idempotency-Key": "confirm"}, json={"expected_version": 1, "action": "confirm"})
    assert result.status_code == 200 and result.json()["status"] == "committed"
    source = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "new-version"}, json=projection(version=2)).json()["projection"]["id"]
    assert make_capacity(client, seller, source, 100000, "too-much").status_code == 409
    assert make_capacity(client, seller, source, 40000, "remaining").status_code == 201


def test_idempotency_key_cannot_replay_a_different_resource_action(api):
    client, _ = api
    seller = login(client, "owner")
    source = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "source"}, json=projection()).json()["projection"]["id"]
    first = make_capacity(client, seller, source, 50000, "first").json()["id"]
    second = make_capacity(client, seller, source, 50000, "second").json()["id"]
    body = {"decision": "approve", "reason": "Synthetic fixture"}
    headers = {**seller, "Idempotency-Key": "same-review-key"}
    assert client.post(f"/api/v1/capacities/{first}/review", headers=headers, json=body).status_code == 200
    assert client.post(f"/api/v1/capacities/{second}/review", headers=headers, json=body).status_code == 409


def test_arbitrary_qc_reference_cannot_release_harvested_capacity(api):
    client, _ = api
    seller = login(client, "source-owner")
    capacity = make_capacity(client, seller, "invented-lot", source_type="harvested_lot")
    assert capacity.status_code == 201
    response = client.post(f"/api/v1/capacities/{capacity.json()['id']}/review",
        headers={**seller, "Idempotency-Key": "forged-release"},
        json={"decision": "approve", "reason": "Test fake linkage", "evidence_reference": "I-say-it-is-released"})
    assert response.status_code == 409


@pytest.mark.parametrize("changes", [{"quantity_g": True}, {"quantity_g": "100000"}, {"quantity_g": 2147483648},
                                     {"low_g": 110000}, {"high_g": 90000}])
def test_shared_projection_rejects_coercion_overflow_and_inconsistent_range(api, changes):
    client, _ = api
    seller = login(client, "source-owner")
    assert client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "bad"}, json={**projection(), **changes}).status_code == 422


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("MERAKI_DEV_AUTH", "1")
    monkeypatch.setenv("MERAKI_ENV", "development")
    app = create_app(f"sqlite:///{tmp_path / 'test.sqlite3'}", create_schema=True,
                     storage=__import__("server.meraki.storage", fromlist=["LocalStorage"]).LocalStorage(tmp_path / "objects"))
    with TestClient(app) as client:
        yield client, app
    app.state.engine.dispose()


def login(client, suffix, permissions=None):
    response = client.post("/api/v1/dev/sessions", json={"user_id": f"user-{suffix}", "email": f"{suffix}@example.test",
        "display_name": suffix, "organisation_id": f"org-{suffix}", "organisation_name": suffix,
        "role": "member", "permissions": permissions or ["projection:read", "projection:write", "listing:read", "listing:write", "capacity:read", "capacity:write", "capacity:review", "document:read", "document:write", "reservation:read", "reservation:write", "audit:read", "job:write"]})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}", "X-Organisation-ID": f"org-{suffix}"}


def projection(source="weekly-okara", version=1, consent="opted-in"):
    return {"source_id": source, "version": version, "farmer_ref": "farmer-ref-1", "crop": "okra", "variety": "local",
        "grade": "A", "week_start": "2026-12-01", "week_end": "2026-12-07", "quantity_g": 100000,
        "low_g": 80000, "high_g": 120000, "consent_status": consent,
        "consent_recorded_at": "2026-11-16T00:00:00Z", "evidence_refs": [{"id": "evidence-1", "status": "reported"}],
        "uncertainty": {"level": "high", "basis": "illustrative scenario", "caveats": ["Not calibrated"]},
        "assumptions": {"unit": "g"}, "source_rule_version": "projection-test-v1", "as_of": "2026-11-16T00:00:00Z",
        "stale_after": "2027-01-01T00:00:00Z", "caveats": ["Synthetic integration fixture"]}


def test_projection_version_consent_visibility_and_idempotency(api):
    client, _ = api
    health = client.get("/api/v1/health")
    assert health.status_code == 200 and health.json()["database"] == "ok"
    seller, buyer = login(client, "seller"), login(client, "buyer")
    first = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "projection-v1"}, json=projection())
    assert first.status_code == 201, first.text
    assert first.json()["projection"]["quantity_g"] == 100000
    replay = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "projection-v1"}, json=projection())
    assert replay.status_code == 201
    conflict = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "projection-v1"}, json=projection("different"))
    assert conflict.status_code == 409

    second_body = projection(version=2)
    second_body["quantity_g"] = 90000
    second = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "projection-v2"}, json=second_body)
    assert second.status_code == 201
    assert [row["version"] for row in client.get("/api/v1/projections/weekly-okara/history", headers=seller).json()["items"]] == [2, 1]
    assert client.get("/api/v1/projections", headers=buyer).json()["items"] == []

    capacity = client.post("/api/v1/capacities", headers={**seller, "Idempotency-Key": "capacity"}, json={
        "source_type": "projection", "source_id": second.json()["projection"]["id"], "crop": "okra", "variety": "local", "grade": "A",
        "week_start": "2026-12-01", "week_end": "2026-12-07", "quantity_g": 90000, "consent_status": "opted-in"})
    assert capacity.status_code == 201, capacity.text
    reviewed = client.post(f"/api/v1/capacities/{capacity.json()['id']}/review", headers={**seller, "Idempotency-Key": "review-cap"},
        json={"decision": "approve", "reason": "Synthetic review fixture"})
    assert reviewed.status_code == 200, reviewed.text
    listing = client.post("/api/v1/listings", headers={**seller, "Idempotency-Key": "listing"}, json={
        "capacity_id": capacity.json()["id"], "resource_type": "projection"})
    assert listing.status_code == 201, listing.text
    assert len(client.get("/api/v1/market/listings", headers=buyer).json()["items"]) == 1
    consent = client.post("/api/v1/projections/weekly-okara/consent", headers={**seller, "Idempotency-Key": "revoke"}, json={
        "status": "opted-out", "note": "Synthetic test withdrawal"})
    assert consent.status_code == 201
    assert client.get("/api/v1/market/listings", headers=buyer).json()["items"] == []


def test_reservation_atomic_release_and_permission_scope(api):
    client, _ = api
    seller, buyer, outsider = login(client, "seller"), login(client, "buyer"), login(client, "outsider", ["reservation:write"])
    p = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "p"}, json=projection())
    c = client.post("/api/v1/capacities", headers={**seller, "Idempotency-Key": "c"}, json={
        "source_type": "projection", "source_id": p.json()["projection"]["id"], "crop": "okra", "variety": "local", "grade": "A",
        "week_start": "2026-12-01", "week_end": "2026-12-07", "quantity_g": 100000, "consent_status": "opted-in"})
    client.post(f"/api/v1/capacities/{c.json()['id']}/review", headers={**seller, "Idempotency-Key": "review-cap"},
        json={"decision": "approve", "reason": "Synthetic review fixture"})
    client.post("/api/v1/listings", headers={**seller, "Idempotency-Key": "l"}, json={"capacity_id": c.json()["id"], "resource_type": "projection"})
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    payload = {"capacity_id": c.json()["id"], "quantity_g": 60000, "expires_at": expires}
    reserved = client.post("/api/v1/reservations", headers={**buyer, "Idempotency-Key": "r1"}, json=payload)
    assert reserved.status_code == 201, reserved.text
    replay = client.post("/api/v1/reservations", headers={**buyer, "Idempotency-Key": "r1"}, json=payload)
    assert replay.json()["reservation"]["id"] == reserved.json()["reservation"]["id"]
    over = client.post("/api/v1/reservations", headers={**outsider, "Idempotency-Key": "r2"}, json={**payload, "quantity_g": 50000})
    assert over.status_code == 409
    assert client.get("/api/v1/documents/random", headers=outsider).status_code == 403
    transitioned = client.post(f"/api/v1/reservations/{reserved.json()['reservation']['id']}/transition",
        headers={**buyer, "Idempotency-Key": "release"}, json={"expected_version": 1, "action": "release"})
    assert transitioned.status_code == 200, transitioned.text
    assert transitioned.json()["status"] == "released"
    stale = client.post(f"/api/v1/reservations/{reserved.json()['reservation']['id']}/transition",
        headers={**buyer, "Idempotency-Key": "release-stale"}, json={"expected_version": 1, "action": "cancel"})
    assert stale.status_code == 409
    assert client.get("/api/v1/audit-events", headers=buyer).json()["items"]


def test_documents_are_organisation_scoped_and_bytes_are_not_in_database(api):
    client, app = api
    owner, other = login(client, "owner"), login(client, "other")
    uploaded = client.post("/api/v1/documents?document_type=lab-report", headers={**owner, "Idempotency-Key": "doc-1"},
        data={"provenance": '{"synthetic": true, "source": "test"}'}, files={"file": ("report.txt", b"synthetic report", "text/plain")})
    assert uploaded.status_code == 201, uploaded.text
    row = uploaded.json()
    assert row["size_bytes"] == len(b"synthetic report")
    assert b"synthetic report" not in str(row).encode()
    assert client.get(f"/api/v1/documents/{row['id']}/content", headers=owner).content == b"synthetic report"
    assert client.get(f"/api/v1/documents/{row['id']}/content", headers=other).status_code == 404
    assert list((app.state.storage.root).iterdir())


def test_worker_expires_reservation_once_and_retries_failed_jobs(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'worker.sqlite3'}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    from server.meraki.models import Membership, ReservationEvent, User
    with sessions.begin() as db:
        db.add(Organization(id="worker-org", name="Worker synthetic"))
        db.add(User(id="worker-user", email="worker@example.test", display_name="worker"))
        db.flush()
        db.add(Membership(user_id="worker-user", organisation_id="worker-org", role="member", permissions=[]))
        db.add(Capacity(id="worker-cap", organisation_id="worker-org", source_type="projection", source_id="p", crop="okra", variety="v", grade="A",
            week_start="2026-12-01", week_end="2026-12-07", quantity_g=1000, reserved_g=500, consent_status="opted-in"))
        db.flush()
        db.add(Reservation(id="worker-res", capacity_id="worker-cap", organisation_id="worker-org", requester_organisation_id="worker-org",
            quantity_g=500, status="reserved", expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
        db.add(Job(id="worker-job", kind="expire_reservation", payload={"reservation_id": "worker-res"}, run_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
        db.add(Job(id="crashed-job", kind="expire_listing", payload={"listing_id": "missing-listing"}, status="running",
            run_at=datetime.now(timezone.utc) - timedelta(minutes=10), locked_at=datetime.now(timezone.utc) - timedelta(minutes=6)))
    assert run_once(sessions)
    assert run_once(sessions)
    assert run_once(sessions) is False
    with sessions() as db:
        assert db.get(Reservation, "worker-res").status == "expired"
        assert db.get(Capacity, "worker-cap").reserved_g == 0
        assert db.scalar(select(ReservationEvent).where(ReservationEvent.to_status == "expired")) is not None
        db.add(Job(id="retry-job", kind="unsupported", payload={}, run_at=datetime.now(timezone.utc) - timedelta(seconds=1), max_attempts=2))
        db.commit()
    assert run_once(sessions)
    with sessions() as db:
        retry = db.get(Job, "retry-job")
        assert retry.status == "pending" and retry.attempts == 1 and retry.last_error
        retry.run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    assert run_once(sessions)
    with sessions() as db:
        retry = db.get(Job, "retry-job")
        assert retry.status == "failed" and retry.attempts == 2 and retry.finished_at
        assert db.get(Job, "crashed-job").status == "completed"
    engine.dispose()


def test_alembic_initial_migration_up_and_down(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import inspect
    monkeypatch.delenv("MERAKI_DATABASE_URL", raising=False)
    db_path = tmp_path / "migration.sqlite3"
    config = Config("server/alembic.ini")
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(config, "head")
    engine = make_engine(f"sqlite:///{db_path}")
    expected = {"users", "organisations", "organisation_memberships", "supply_projections", "capacities", "market_listings",
                "projection_consent_events", "reservations", "documents", "idempotency_records", "audit_events", "background_jobs", "alembic_version"}
    assert expected.issubset(set(inspect(engine).get_table_names()))
    engine.dispose()
    command.downgrade(config, "base")
    engine = make_engine(f"sqlite:///{db_path}")
    assert set(inspect(engine).get_table_names()).issubset({"alembic_version"})
    engine.dispose()


def test_relational_capacity_constraint_rejects_oversell(tmp_path):
    from sqlalchemy.exc import IntegrityError
    engine = make_engine(f"sqlite:///{tmp_path / 'constraints.sqlite3'}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    with sessions.begin() as db:
        db.add(Organization(id="constraint-org", name="synthetic"))
    with pytest.raises(IntegrityError):
        with sessions.begin() as db:
            db.add(Capacity(id="bad-cap", organisation_id="constraint-org", source_type="projection", source_id="p", crop="okra", variety="v", grade="A",
                week_start="2026-12-01", week_end="2026-12-07", quantity_g=10, reserved_g=11, consent_status="opted-in"))
    engine.dispose()


@pytest.mark.parametrize(
    ("environment", "dev_auth", "expected_status"),
    [
        ("development", "1", 200),
        ("development", "0", 404),
        ("staging", "1", 404),
        ("production", "1", 404),
    ],
)
def test_development_sessions_require_development_and_explicit_flag(
    tmp_path, monkeypatch, environment, dev_auth, expected_status
):
    monkeypatch.setenv("MERAKI_ENV", environment)
    monkeypatch.setenv("MERAKI_DEV_AUTH", dev_auth)
    app = create_app(
        f"sqlite:///{tmp_path / f'{environment}-{dev_auth}.sqlite3'}",
        create_schema=environment != "production",
    )
    body = {
        "user_id": f"synthetic-{environment}-{dev_auth}",
        "email": f"synthetic-{environment}-{dev_auth}@example.test",
        "display_name": "Synthetic auth guard test",
        "organisation_id": f"synthetic-{environment}-{dev_auth}",
        "organisation_name": "Synthetic auth guard test",
        "role": "member",
    }
    try:
        with TestClient(app) as client:
            response = client.post("/api/v1/dev/sessions", json=body)
            assert response.status_code == expected_status
            if expected_status == 200:
                assert response.json()["synthetic"] is True
            else:
                assert app.state.identity_provider is None
                protected = client.get(
                    "/api/v1/projections", headers={"Authorization": "Bearer arbitrary"}
                )
                assert protected.status_code == 503
    finally:
        app.state.engine.dispose()


@pytest.mark.skipif(not os.getenv("MERAKI_TEST_POSTGRES_URL"), reason="Set MERAKI_TEST_POSTGRES_URL to run PostgreSQL concurrency verification")
def test_postgresql_concurrent_reservations_do_not_oversell():
    """The CI/database owner must provide a disposable PostgreSQL URL for this acceptance test."""
    from concurrent.futures import ThreadPoolExecutor
    from fastapi import HTTPException
    from server.meraki.services import reserve_capacity
    engine = make_engine(os.environ["MERAKI_TEST_POSTGRES_URL"])
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    suffix = uuid4().hex[:10]
    org_owner, org_buyer = f"owner-{suffix}", f"buyer-{suffix}"
    with sessions.begin() as db:
        db.add_all([Organization(id=org_owner, name="synthetic owner"), Organization(id=org_buyer, name="synthetic buyer")])
        db.add(User(id=f"pg-user-{suffix}", email=f"pg-{suffix}@example.test", display_name="Synthetic PostgreSQL test user"))
        db.flush()
        from server.meraki.schemas import ProjectionPublish
        source = ProjectionPublish(**{**projection(source=f"source-{suffix}"), "quantity_g": 100, "low_g": 80, "high_g": 120}).model_dump()
        db.add(Projection(id=f"projection-{suffix}", organisation_id=org_owner, created_by=f"pg-user-{suffix}", **source))
        db.flush()
        db.add(Capacity(id=f"cap-{suffix}", organisation_id=org_owner, source_type="projection", source_id=f"projection-{suffix}", crop="okra", variety="local", grade="A",
            week_start="2026-12-01", week_end="2026-12-07", quantity_g=100, consent_status="opted-in", reviewed=True))
        db.flush()
        db.add(Listing(id=f"listing-{suffix}", organisation_id=org_owner, capacity_id=f"cap-{suffix}", resource_type="projection"))
    def attempt():
        with sessions() as db:
            try:
                with db.begin():
                    reserve_capacity(db, {"user_id": f"pg-user-{suffix}", "organisation_id": org_buyer}, f"cap-{suffix}", 70,
                                     datetime.now(timezone.utc) + timedelta(minutes=5))
                return "reserved"
            except HTTPException as exc:
                db.rollback()
                return exc.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: attempt(), range(2)))
    assert results.count("reserved") == 1
    with sessions() as db:
        assert db.get(Capacity, f"cap-{suffix}").reserved_g == 70
    engine.dispose()


@pytest.mark.skipif(not os.getenv("MERAKI_TEST_POSTGRES_URL"), reason="Disposable PostgreSQL URL is required")
def test_postgresql_concurrent_capacity_creation_cannot_multiply_source(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    monkeypatch.setenv("MERAKI_DEV_AUTH", "1")
    monkeypatch.setenv("MERAKI_ENV", "development")
    app = create_app(os.environ["MERAKI_TEST_POSTGRES_URL"], create_schema=True)
    suffix = uuid4().hex
    with TestClient(app) as client:
        seller = login(client, suffix)
        source = client.post("/api/v1/projections", headers={**seller, "Idempotency-Key": "source"}, json=projection(source=suffix)).json()["projection"]["id"]
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(lambda i: make_capacity(client, seller, source, 70000, f"concurrent-{i}").status_code, range(2)))
        assert sorted(statuses) == [201, 409]
