"""Hosted origin boundaries use the real child apps and disposable databases."""
import os
import time

import pytest
from fastapi.testclient import TestClient

from server.hosted import create_hosted_app, normalize_database_url
from server.meraki.database import make_engine
from server.meraki.models import Base


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
