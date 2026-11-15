"""HTTP adapter for the isolated, server-authoritative trade module."""
import os
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, Header, Query, Request
from fastapi.responses import JSONResponse

from .db import Database
from .domain import require
from .service import COLLECTIONS, PRINCIPALS, TradeService


def create_app(database_url=None, demo_enabled=None, environment=None, clock=None):
    environment = environment or os.getenv('TRADE_ENV', 'development')
    demo_enabled = os.getenv('TRADE_DEMO_MODE') == '1' if demo_enabled is None else demo_enabled
    database = Database(database_url or os.getenv('TRADE_DATABASE_URL', 'sqlite:///./server/trade-dev.sqlite3'))
    database.migrate()
    service = TradeService(database, demo_enabled, environment, clock)
    service.seed()

    @asynccontextmanager
    async def lifespan(_):
        yield
        database.engine.dispose()

    app = FastAPI(title='Meraki Part 3 Trade API', version='1.0.0', lifespan=lifespan)
    app.state.database = database
    app.state.service = service
    prefix = '/api/trade'

    @app.exception_handler(ValueError)
    async def invalid_json_value(_, error):
        return JSONResponse(status_code=422, content={'detail': 'Invalid JSON value: ' + str(error)[:200]})

    def principal(request):
        return service.authenticate(request.headers.get('authorization'))

    def command(request, body, operation):
        actor = principal(request)
        return service.execute(actor, request.headers.get('idempotency-key'), request.url.path, body,
                               lambda session: operation(session, actor))

    @app.get(prefix + '/health')
    def health():
        return service.health()

    @app.get(prefix + '/dev/principals')
    def principals():
        require(service.demo_enabled, 'Development principals unavailable', 404)
        return dict(principals=list(PRINCIPALS.values()), synthetic=True)

    @app.post(prefix + '/dev/sessions')
    def sessions(body: dict = Body(...)):
        return service.create_session(body.get('principal_id'))

    @app.get(prefix + '/workspace')
    def workspace(request: Request):
        return service.workspace(principal(request))

    @app.get(prefix + '/{collection}')
    def resources(collection: str, request: Request, limit: int = Query(200, ge=1, le=200)):
        return service.read(collection, principal(request), limit=limit)

    @app.get(prefix + '/{collection}/{resource_id}')
    def resource(collection: str, resource_id: str, request: Request):
        return service.read(collection, principal(request), resource_id)

    @app.post(prefix + '/lots')
    def create_lot(request: Request, body: dict = Body(...)):
        return command(request, body, lambda s, p: service.create_lot(s, p, body))

    @app.post(prefix + '/lots/{key}/{action}')
    def lot_action(key: str, action: str, request: Request, body: dict = Body(...)):
        require(action in ('inspections', 'reviews'), 'Unknown lot action', 404)
        method = service.inspect_lot if action == 'inspections' else service.review_lot
        return command(request, body, lambda s, p: method(s, p, key, body))

    @app.post(prefix + '/auctions')
    def create_auction(request: Request, body: dict = Body(...)):
        return command(request, body, lambda s, p: service.create_auction(s, p, body))

    @app.post(prefix + '/auctions/{key}/{action}')
    def auction_action(key: str, action: str, request: Request, body: dict = Body(...)):
        require(action in ('bids', 'cancel', 'close'), 'Unknown auction action', 404)
        return command(request, body, lambda s, p: service.bid(s, p, key, body) if action == 'bids' else service.auction_action(s, p, key, action, body))

    @app.post(prefix + '/contracts/{key}/{action}')
    def contract_action(key: str, action: str, request: Request, body: dict = Body(...)):
        require(action in ('confirm', 'amend', 'cancel', 'default', 'harvest'), 'Unknown contract action', 404)
        return command(request, body, lambda s, p: service.harvest(s, p, key, body) if action == 'harvest' else service.contract_action(s, p, key, action, body))

    @app.post(prefix + '/shipments')
    def create_shipment(request: Request, body: dict = Body(...)):
        return command(request, body, lambda s, p: service.create_shipment(s, p, body))

    @app.post(prefix + '/shipments/{key}/{action}')
    def shipment_action(key: str, action: str, request: Request, body: dict = Body(...)):
        require(action in ('dispatch', 'receive'), 'Unknown shipment action', 404)
        return command(request, body, lambda s, p: service.shipment_action(s, p, key, action, body))

    @app.post(prefix + '/claims')
    def create_claim(request: Request, body: dict = Body(...)):
        return command(request, body, lambda s, p: service.create_claim(s, p, body))

    @app.post(prefix + '/claims/{key}/{action}')
    def claim_action(key: str, action: str, request: Request, body: dict = Body(...)):
        require(action in ('propose', 'agree'), 'Unknown claim action', 404)
        return command(request, body, lambda s, p: service.claim_action(s, p, key, action, body))

    @app.post(prefix + '/settlements')
    def create_settlement(request: Request, body: dict = Body(...)):
        return command(request, body, lambda s, p: service.create_settlement(s, p, body))

    @app.post(prefix + '/settlements/{key}/{action}')
    def settlement_action(key: str, action: str, request: Request, body: dict = Body(...)):
        require(action in ('payments', 'disbursals'), 'Unknown settlement action', 404)
        return command(request, body, lambda s, p: service.settlement_action(s, p, key, action, body))

    return app


app = create_app()
