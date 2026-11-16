"""Hosted origin boundaries use the real child apps and disposable databases."""
import os
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from server.hosted import create_hosted_app, normalize_database_url
from server.meraki.database import make_engine
from server.meraki.models import Base, Job


@pytest.fixture
def hosted_env(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'hosted.sqlite3'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.delenv("TRADE_DATABASE_URL", raising=False)
    monkeypatch.delenv("MERAKI_DATABASE_URL", raising=False)
    monkeypatch.setenv("HOSTED_MODE", "demo")
    monkeypatch.setenv("HOSTED_WORKER_INTERVAL", "0.1")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://meraki-example.vercel.app")
    monkeypatch.setenv("MERAKI_DOCUMENT_ROOT", str(tmp_path / "documents"))
    for key in ("TRADE_ENV", "TRADE_DEMO_MODE", "MERAKI_ENV", "MERAKI_DEV_AUTH", "MERAKI_AUTO_CREATE_SCHEMA"):
        monkeypatch.setenv(key, os.getenv(key, ""))
    engine = make_engine(url)
    Base.metadata.create_all(engine)
    engine.dispose()
    return url


def test_full_namespace_paths_preserve_child_auth_and_correlation(hosted_env):
    app = create_hosted_app(run_workers=False)
    with TestClient(app) as client:
        assert client.get("/health").json()["mode"] == "synthetic_demo"
        root_health = client.get("/api/health").json()
        assert root_health["production_ready"] is False
        assert root_health["persistence"]["mode"] == "local_file_or_mixed"
        assert root_health["persistence"]["restart_persistence"] == "not_guaranteed"
        assert client.get("/api/trade/health").status_code == 200
        shared = client.get("/api/v1/health", headers={"X-Request-ID": "hosted-check"})
        assert shared.status_code == 200
        assert shared.headers["X-Request-ID"] == "hosted-check"
        assert client.get("/api/live-data/health").status_code == 200
        schema = client.get("/api/v1/openapi.json")
        assert schema.status_code == 200
        assert "/api/v1/projections" in schema.json()["paths"]
        session = client.post("/api/trade/dev/sessions", json={"principal_id": "fpo-a"})
        assert session.status_code == 200
        workspace = client.get("/api/trade/workspace", headers={"Authorization": "Bearer " + session.json()["token"]})
        assert workspace.status_code == 200
        assert workspace.json()["synthetic"] is True
        assert client.get("/api/unknown").status_code == 404


def test_production_ignores_attempted_development_auth_flags(hosted_env, monkeypatch):
    monkeypatch.setenv("HOSTED_MODE", "production")
    monkeypatch.setenv("TRADE_DEMO_MODE", "1")
    monkeypatch.setenv("MERAKI_DEV_AUTH", "1")
    app = create_hosted_app()
    with TestClient(app) as client:
        assert client.get("/health").json()["mode"] == "production_gated"
        assert client.get("/api/trade/dev/principals").status_code == 404
        assert client.post("/api/v1/dev/sessions", json={}).status_code == 404
        deadline = time.monotonic() + 2
        while app.state.worker_status["last_completed_at"] is None and time.monotonic() < deadline:
            time.sleep(0.01)
        assert app.state.worker_status["trade"] == "disabled_pending_verified_adapters"
        assert app.state.worker_status["last_completed_at"] is not None
        assert app.state.worker_status["last_error"] is None


def test_hosted_usb_and_ephemeral_uploads_cannot_claim_operational_success(hosted_env):
    app = create_hosted_app(run_workers=False)
    with TestClient(app) as client:
        serial = client.get("/api/sensors/serial")
        assert serial.status_code == 200
        assert serial.json()["available"] is False and serial.json()["ports"] == []
        assert client.get("/api/sensors").status_code == 503
        assert client.post("/api/sensors/serial", json={"port": "COM3"}).status_code == 503
        assert client.post("/api/sensors", json={}).status_code == 503
        upload = client.post("/api/v1/documents", files={"file": ("synthetic.txt", b"dummy")})
        assert upload.status_code == 503
        assert upload.json()["error"]["code"] == "durable_document_store_unconfigured"


def test_cors_is_an_exact_origin_allowlist(hosted_env):
    app = create_hosted_app(run_workers=False)
    with TestClient(app) as client:
        headers = {"Origin": "https://meraki-example.vercel.app", "Access-Control-Request-Method": "POST",
                   "Access-Control-Request-Headers": "Authorization, Idempotency-Key"}
        accepted = client.options("/api/trade/requirements", headers=headers)
        assert accepted.status_code == 200
        assert accepted.headers["access-control-allow-origin"] == headers["Origin"]
        rejected = client.options("/api/trade/requirements", headers={**headers, "Origin": "https://unrelated.example"})
        assert rejected.status_code == 400
        assert "access-control-allow-origin" not in rejected.headers


def test_supervised_workers_start_and_stop_with_lifespan(hosted_env):
    app = create_hosted_app()
    with TestClient(app) as client:
        deadline = time.monotonic() + 2
        state = client.get("/health").json()["worker"]
        while state["last_completed_at"] is None and time.monotonic() < deadline:
            time.sleep(0.01)
            state = client.get("/health").json()["worker"]
        assert state["running"] is True
        assert state["last_completed_at"] is not None
        assert state["last_error"] is None
    assert app.state.worker_status["running"] is False


def test_database_url_normalization_and_cors_configuration_fail_closed(hosted_env, monkeypatch):
    assert normalize_database_url("postgres://user:dummy@host/db") == "postgresql+psycopg://user:dummy@host/db"
    assert normalize_database_url("postgresql://user:dummy@host/db") == "postgresql+psycopg://user:dummy@host/db"
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "*")
    with pytest.raises(RuntimeError, match="exact HTTPS origins"):
        create_hosted_app(run_workers=False)


def test_one_worker_error_is_visible_and_does_not_kill_supervision(hosted_env, monkeypatch):
    app = create_hosted_app()
    calls = []

    def flaky_tick():
        calls.append(True)
        if len(calls) == 1:
            raise ValueError("Synthetic worker fault")

    monkeypatch.setattr(app.state.trade.state.service, "tick", flaky_tick)
    with TestClient(app) as client:
        deadline = time.monotonic() + 2
        while len(calls) < 2 and time.monotonic() < deadline:
            time.sleep(0.01)
        state = client.get("/health").json()["worker"]
        assert len(calls) >= 2
        assert state["running"] is True and state["last_error"] is None


@pytest.mark.parametrize("namespace", ["trade", "shared"])
def test_database_outage_returns_safe_json_with_cors_and_recovers(hosted_env, monkeypatch, namespace):
    app = create_hosted_app(run_workers=False)
    headers = {"Origin": "https://meraki-example.vercel.app", "X-Request-ID": "db-outage-check"}
    def unavailable(*args, **kwargs):
        raise OperationalError("SELECT private-record", {}, RuntimeError("postgresql://private-password@host/db"))

    with TestClient(app, raise_server_exceptions=False) as client:
        if namespace == "trade":
            target = app.state.trade.state.service
            original = target.workspace
            session = client.post("/api/trade/dev/sessions", json={"principal_id": "fpo-a"}).json()
            headers["Authorization"] = "Bearer " + session["token"]
            path = "/api/trade/workspace"
            monkeypatch.setattr(target, "workspace", unavailable)
        else:
            session = client.post("/api/v1/dev/sessions", json={
                "user_id": "hosted-failure-user", "email": "synthetic@example.test", "display_name": "Synthetic test",
                "organisation_id": "hosted-failure-org", "organisation_name": "Synthetic test org", "role": "fpo",
            }).json()
            headers.update(Authorization="Bearer " + session["access_token"], **{"X-Organisation-ID": "hosted-failure-org"})
            target = app.state.shared.state.identity_provider
            original = target.authenticate
            path = "/api/v1/projections"
            monkeypatch.setattr(target, "authenticate", unavailable)
        response = client.get(path, headers=headers)
        assert response.status_code == 503
        assert response.headers["access-control-allow-origin"] == headers["Origin"]
        envelope = response.json()["detail" if namespace == "trade" else "error"]
        assert envelope["code"] == "database_unavailable"
        if namespace == "shared":
            assert envelope["request_id"] == "db-outage-check"
            assert response.headers["x-request-id"] == "db-outage-check"
        assert "private-password" not in response.text and "private-record" not in response.text
        if namespace == "trade":
            monkeypatch.setattr(target, "workspace", original)
        else:
            monkeypatch.setattr(target, "authenticate", original)
        assert client.get(path, headers=headers).status_code == 200


def test_ready_shared_jobs_are_drained_before_the_worker_idle_delay(hosted_env, monkeypatch):
    monkeypatch.setenv("HOSTED_WORKER_INTERVAL", "60")
    app = create_hosted_app()
    with app.state.shared.state.sessions.begin() as db:
        db.add_all([Job(id=f"ready-job-{i}", kind="expire_listing", payload={"listing_id": f"missing-listing-{i}"}) for i in range(3)])
    with TestClient(app):
        deadline = time.monotonic() + 2
        statuses = []
        while time.monotonic() < deadline:
            with app.state.shared.state.sessions() as db:
                statuses = [db.get(Job, f"ready-job-{i}").status for i in range(3)]
            if statuses == ["completed"] * 3:
                break
            time.sleep(0.01)
        assert statuses == ["completed"] * 3


def test_validation_and_auth_failures_keep_their_domain_statuses(hosted_env):
    app = create_hosted_app(run_workers=False)
    with TestClient(app) as client:
        assert client.post("/api/trade/dev/sessions", json={"principal_id": 123}).status_code == 422
        assert client.post("/api/v1/dev/sessions", json={}).status_code == 422
        assert client.get("/api/trade/workspace").status_code == 401
        assert client.get("/api/v1/projections").status_code == 401
        for prefix in ("/api/trade", "/api/v1", "/api/live-data"):
            assert client.put(prefix + "/health").status_code == 405


@pytest.mark.parametrize("database", ["trade", "shared"])
def test_readiness_reports_database_failure_and_recovery(hosted_env, monkeypatch, database):
    app = create_hosted_app(run_workers=False)
    engine = app.state.trade.state.database.engine if database == "trade" else app.state.shared.state.engine
    connect = engine.connect
    def unavailable(*args, **kwargs):
        raise OperationalError("SELECT private-record", {}, RuntimeError("private-database-credential"))
    with TestClient(app) as client:
        monkeypatch.setattr(engine, "connect", unavailable)
        response = client.get("/api/health")
        assert response.status_code == 503
        assert response.json() == {"status": "unavailable", "database": "unavailable_or_unmigrated"}
        assert "private-" not in response.text
        monkeypatch.setattr(engine, "connect", connect)
        assert client.get("/api/health").status_code == 200

def test_hosted_password_account_and_auction_namespace(hosted_env, monkeypatch):
    monkeypatch.setenv("MERAKI_PASSWORD_AUTH", "1")
    app = create_hosted_app(run_workers=False)
    with TestClient(app) as client:
        schema = client.get('/api/v1/openapi.json').json()
        assert '/api/v1/auctions' in schema['paths']
        result = client.post('/api/v1/auth/register', json={"username":"hosted-auction-user", "password":"Synthetic-hosted-password!",
            "display_name":"Synthetic account", "organisation_name":"Synthetic FPO", "role":"fpo"})
        assert result.status_code == 201
        account = result.json()
        headers = {"Authorization":"Bearer " + account['access_token'], "X-Organisation-ID":account['organisation_id']}
        assert client.get('/api/v1/auth/me', headers=headers).json()['role'] == 'fpo'
        assert client.get('/api/v1/auctions', headers=headers).json() == {"items":[]}


@pytest.mark.parametrize("password_auth", [False, True])
def test_hosted_capabilities_match_identity_and_database(hosted_env, monkeypatch, password_auth):
    monkeypatch.setenv("MERAKI_PASSWORD_AUTH", "1" if password_auth else "0")
    app = create_hosted_app(run_workers=False)
    with TestClient(app) as client:
        health = client.get('/api/v1/health').json()
        assert health['password_auth_enabled'] is password_auth
        assert health['registration_enabled'] is password_auth
        assert health['development_auth_enabled'] is not password_auth
        assert health['auction_mutations_enabled'] is False  # SQLite cannot arbitrate auctions.
        if password_auth:
            assert client.post('/api/v1/dev/sessions', json={}).status_code == 404
