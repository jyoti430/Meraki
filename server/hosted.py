"""Single hosted API origin. Existing domain applications keep their authority.

Run through ``python -m server.start_hosted`` so shared migrations precede boot.
Synthetic sessions require HOSTED_MODE=demo; this never promotes demo data.
"""
import asyncio
from contextlib import AsyncExitStack, asynccontextmanager
from datetime import datetime, timezone
import logging
import os
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html
from sqlalchemy import text

LOG = logging.getLogger(__name__)
SERIAL_UNAVAILABLE = {
    "available": False, "status": "unavailable",
    "reason": "USB ports belong to the local gateway; Render cannot access laptop USB",
    "ports": [], "port": "", "baud": 115200, "error": "", "last_ok_at": None,
}


def normalize_database_url(value):
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value[len("postgres://"):]
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value[len("postgresql://"):]
    return value


def configure_environment():
    mode = os.getenv("HOSTED_MODE", "production").strip().lower()
    if mode not in ("production", "demo"):
        raise RuntimeError("HOSTED_MODE must be production or demo")
    database = os.getenv("DATABASE_URL", "").strip()
    for key in ("TRADE_DATABASE_URL", "MERAKI_DATABASE_URL"):
        value = os.getenv(key, "").strip() or database
        if not value:
            raise RuntimeError("Hosted APIs require DATABASE_URL or explicit trade/shared database URLs")
        os.environ[key] = normalize_database_url(value)
    os.environ["TRADE_ENV"] = "development" if mode == "demo" else "production"
    os.environ["TRADE_DEMO_MODE"] = "1" if mode == "demo" else "0"
    os.environ["MERAKI_ENV"] = "development" if mode == "demo" else "production"
    os.environ["MERAKI_DEV_AUTH"] = "1" if mode == "demo" else "0"
    os.environ["MERAKI_AUTO_CREATE_SCHEMA"] = "0"
    return mode


def allowed_origins():
    origins = []
    for raw in os.getenv("CORS_ALLOWED_ORIGINS", "").split(","):
        origin = raw.strip().rstrip("/")
        if not origin:
            continue
        parsed = urlsplit(origin)
        local = parsed.hostname in ("localhost", "127.0.0.1")
        if ("*" in origin or parsed.scheme not in ("https", "http")
                or parsed.scheme == "http" and not local or not parsed.netloc
                or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment):
            raise RuntimeError("CORS_ALLOWED_ORIGINS must contain exact HTTPS origins (HTTP only for localhost)")
        origins.append(origin)
    return origins


class NamespaceDispatcher:
    """Pass the original path to apps that already declare /api/... routes.

    A mount at /api/trade would strip that prefix, causing every child route to
    miss. Copying routes would instead bypass its middleware and error handling.
    """
    def __init__(self, applications):
        self.applications = applications

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await send({"type": "websocket.close", "code": 1008})
            return
        path = scope.get("path", "")
        if path == "/api/sensors/serial" and scope["method"] == "GET":
            await JSONResponse(SERIAL_UNAVAILABLE)(scope, receive, send)
            return
        if path == "/api/sensors" or path.startswith("/api/sensors/"):
            await JSONResponse({"detail": SERIAL_UNAVAILABLE["reason"], "available": False}, status_code=503)(scope, receive, send)
            return
        if path == "/api/v1/documents" and scope["method"] == "POST":
            await JSONResponse({"error": {"code": "durable_document_store_unconfigured",
                "message": "Hosted uploads are disabled until an approved durable document store is configured."}}, status_code=503)(scope, receive, send)
            return
        for prefix, app in self.applications.items():
            if path == prefix + "/openapi.json" and scope["method"] == "GET":
                await JSONResponse(app.openapi())(scope, receive, send)
                return
            if path == prefix + "/docs" and scope["method"] == "GET":
                await get_swagger_ui_html(openapi_url=prefix + "/openapi.json", title=app.title)(scope, receive, send)
                return
            if path == prefix or path.startswith(prefix + "/"):
                await app(scope, receive, send)
                return
        await JSONResponse({"detail": "API route not found"}, status_code=404)(scope, receive, send)


async def background_loop(app, stop, interval):
    from .meraki.worker import run_once as shared_expiry
    app.state.worker_status["running"] = True
    try:
        while not stop.is_set():
            failures = []
            operations = [("shared", lambda: shared_expiry(app.state.shared.state.sessions))]
            if app.state.hosted_mode == "demo":
                operations.insert(0, ("trade", app.state.trade.state.service.tick))
            for name, operation in operations:
                try:
                    await asyncio.to_thread(operation)
                except Exception as exc:
                    # Do not expose database URLs, evidence or session values.
                    failures.append(f"{name}: {type(exc).__name__}")
                    LOG.warning("Hosted %s worker failed (%s)", name, type(exc).__name__)
            app.state.worker_status.update(
                last_error="; ".join(failures) or None,
                last_completed_at=datetime.now(timezone.utc).isoformat(),
            )
            try:
                await asyncio.wait_for(stop.wait(), timeout=interval)
            except TimeoutError:
                pass
    finally:
        app.state.worker_status["running"] = False


def create_hosted_app(*, trade_app=None, shared_app=None, live_app=None, run_workers=True):
    mode = configure_environment()
    origins = allowed_origins()
    interval = float(os.getenv("HOSTED_WORKER_INTERVAL", "5"))
    if not 0.1 <= interval <= 60:
        raise RuntimeError("HOSTED_WORKER_INTERVAL must be between 0.1 and 60 seconds")
    if trade_app is None:
        from .app import create_app
        trade_app = create_app()
    if shared_app is None:
        from .meraki.app import create_app
        shared_app = create_app()
    if live_app is None:
        from .live_data import create_app
        live_app = create_app()

    @asynccontextmanager
    async def lifespan(app):
        stop = asyncio.Event()
        task = None
        async with AsyncExitStack() as stack:
            for child in (trade_app, shared_app, live_app):
                await stack.enter_async_context(child.router.lifespan_context(child))
            if run_workers:
                task = asyncio.create_task(background_loop(app, stop, interval))
            try:
                yield
            finally:
                stop.set()
                if task:
                    await task
                shared_app.state.engine.dispose()

    app = FastAPI(title="Meraki hosted API", version="1", lifespan=lifespan)
    app.state.hosted_mode = mode
    app.state.trade, app.state.shared, app.state.live = trade_app, shared_app, live_app
    app.state.worker_status = {"running": False, "last_error": None, "last_completed_at": None,
        "trade": "enabled_for_synthetic_demo" if mode == "demo" else "disabled_pending_verified_adapters",
        "shared_expiry": "enabled", "supervision": "single_process_lifespan; pauses_when_host_is_stopped"}
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Organisation-ID", "X-Request-ID"],
        expose_headers=["X-Request-ID"])

    @app.get("/health")
    @app.get("/api/health")
    def health():
        try:
            with shared_app.state.engine.connect() as connection:
                connection.execute(text("SELECT 1 FROM organisations LIMIT 1"))
            with trade_app.state.database.engine.connect() as connection:
                connection.execute(text("SELECT 1 FROM trade_schema_version LIMIT 1"))
        except Exception:
            return JSONResponse({"status": "unavailable", "database": "unavailable_or_unmigrated"}, status_code=503)
        managed_database = (shared_app.state.engine.dialect.name == "postgresql"
                            and trade_app.state.database.engine.dialect.name == "postgresql")
        persistence = {"mode": "external_postgresql" if managed_database else "local_file_or_mixed",
            "restart_persistence": "external_database" if managed_database else "not_guaranteed",
            "backup_restore_verified": False,
            "same_database_for_trade_and_shared": os.environ["TRADE_DATABASE_URL"] == os.environ["MERAKI_DATABASE_URL"]}
        return {"status": "ok", "database": "reachable", "mode": "synthetic_demo" if mode == "demo" else "production_gated",
            "synthetic_trade": mode == "demo", "production_ready": False,
            "persistence": persistence,
            "public_sources": "provider_health_not_probed", "worker": dict(app.state.worker_status),
            "sensors": "local_usb_gateway_required", "document_uploads": "disabled_pending_durable_storage"}

    app.mount("/", NamespaceDispatcher({"/api/trade": trade_app, "/api/v1": shared_app, "/api/live-data": live_app}))
    return app
