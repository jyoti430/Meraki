"""HTTP acceptance tests against isolated real PostgreSQL schemas. No commercial data."""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text, func
from server.meraki.app import create_app
from server.meraki.database import make_engine
from server.meraki.models import (Base, Auction, AuctionBid, AuctionAward, AuctionHold, Capacity,
    Projection, ConsentEvent, Membership, AuditEvent, SessionToken, PasswordCredential)
from server.meraki.services import utcnow, aware
from server.meraki.worker import run_once

PG = os.getenv("MERAKI_TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not PG, reason="Requires disposable PostgreSQL via MERAKI_TEST_POSTGRES_URL")


@pytest.fixture
def system(monkeypatch):
    from sqlalchemy.engine import make_url
    schema = "auction_test_" + uuid4().hex
    admin = make_engine(PG)
    with admin.begin() as db: db.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(PG).update_query_dict({"options": "-csearch_path=" + schema}).render_as_string(hide_password=False)
    monkeypatch.setenv("MERAKI_PASSWORD_AUTH", "1")
    monkeypatch.setenv("MERAKI_DEV_AUTH", "0")
    monkeypatch.setenv("MERAKI_ENV", "development")
    app = create_app(url, create_schema=True)
    with TestClient(app) as client:
        accounts = {}
        for name, role in [("seller", "fpo"), ("supplier", "fpo"), ("buyer", "exporter"), ("buyer2", "exporter")]:
            response = client.post("/api/v1/auth/register", json={"username": name, "password": "Synthetic-Test-Password!",
                "display_name": name, "organisation_name": "Synthetic " + name, "role": role})
            assert response.status_code == 201, response.text
            data = response.json()
            accounts[name] = {"Authorization": "Bearer " + data["access_token"], "X-Organisation-ID": data["organisation_id"]}
        yield client, app, accounts
    app.state.engine.dispose()
    with admin.begin() as db: db.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    admin.dispose()


def post(client, path, who, data, key=None):
    return client.post("/api/v1" + path, json=data, headers={**who, "Idempotency-Key": key or uuid4().hex})


def capacity(app, who, source="harvested_lot", **changes):
    with app.state.sessions() as db, db.begin():
        oid = who["X-Organisation-ID"]
        sid = "synthetic-" + uuid4().hex
        if source == "projection":
            uid = db.scalar(select(Membership.user_id).where(Membership.organisation_id == oid))
            p = Projection(id=sid, organisation_id=oid, source_id=sid, version=1, crop="Okra", variety="Hybrid", grade="A",
                week_start="2026-12-01", week_end="2026-12-07", quantity_g=100000, consent_status="opted-in",
                source_rule_version="synthetic-v1", as_of=utcnow(), stale_after=utcnow()+timedelta(days=10), created_by=uid)
            db.add(p); db.flush()
        data = dict(id=uuid4().hex, organisation_id=oid, source_type=source, source_id=sid,
            crop="Okra", variety="Hybrid", grade="A", week_start="2026-12-01", week_end="2026-12-07",
            quantity_g=100000, reserved_g=0, committed_g=0, consent_status="opted-in", reviewed=True)
        data.update(changes)
        row = Capacity(**data); db.add(row); db.flush(); return row.id


def auction(client, accounts, cap_id=None, mode="spot", **changes):
    now = utcnow()
    body = dict(mode=mode, title="Synthetic whole-lot okra", crop="Okra", variety="Hybrid", grade="A",
        quantity_g=100000, week_start="2026-12-01", week_end="2026-12-07", limit_price=2000,
        increment=100, opens_at=(now-timedelta(seconds=2)).isoformat(), closes_at=(now+timedelta(hours=2)).isoformat(),
        extension_window_s=120, extension_s=120, extension_cap_s=600,
        terms={"handover":"Synthetic packhouse", "acceptance":"Synthetic grade protocol", "payment":"Synthetic bank terms",
               "cancellation":"Decline or rerun; no automatic fallback", "evidence_reference":"synthetic-plan-v1", "evidence_status":"synthetic"})
    if mode == "spot": body["capacity_id"] = cap_id
    else: body["eligible_org_ids"] = [accounts[n]["X-Organisation-ID"] for n in ("seller", "supplier")]
    body.update(changes)
    return post(client, "/auctions", accounts["seller" if mode == "spot" else "buyer"], body)


def bid(client, accounts, aid, who="buyer", price=2000, **extra):
    return post(client, f"/auctions/{aid}/bids", accounts[who], {"price":price, "accept_terms":True, **extra})


def force_due(app, aid):
    with app.state.sessions() as db, db.begin():
        row=db.get(Auction, aid); row.closes_at=utcnow()-timedelta(seconds=1)


def test_spot_full_flow_receipts_idempotency_privacy_and_confirmation(system):
    c, app, a = system
    cap = capacity(app, a["seller"])
    r = auction(c,a,cap); assert r.status_code == 201, r.text
    aid = r.json()["id"]
    assert bid(c,a,aid,price=1900).status_code == 409
    body={"price":2000,"accept_terms":True}
    r=post(c,f"/auctions/{aid}/bids",a["buyer"],body,"same-bid")
    assert r.status_code==201, r.text
    assert post(c,f"/auctions/{aid}/bids",a["buyer"],body,"same-bid").json()==r.json()
    assert post(c,f"/auctions/{aid}/bids",a["buyer"],{**body,"price":2100},"same-bid").status_code==409
    assert bid(c,a,aid,who="buyer2",price=2100).status_code==201
    assert c.get(f"/api/v1/auctions/{aid}/bids",headers=a["seller"]).json()["items"]==[]
    board=c.get("/api/v1/auctions",headers=a["buyer"]).json()["items"][0]
    assert "organisation_id" not in board and "eligible_org_ids" not in board
    force_due(app,aid)
    assert run_once(app.state.sessions)
    for name in ("seller","buyer2"):
        r=post(c,f"/auctions/{aid}/award",a[name],{"action":"confirm"}); assert r.status_code==200,r.text
    assert r.json()["status"]=="confirmed"
    assert post(c,f"/auctions/{aid}/award",a["buyer"],{"action":"confirm"}).status_code==404
    with app.state.sessions() as db:
        row=db.get(Capacity,cap); assert (row.reserved_g,row.committed_g)==(0,100000)
        assert db.scalar(select(func.count()).select_from(AuctionAward))==1


def test_competing_equal_bids_and_concurrent_duplicate_retry(system):
    c,app,a=system; cap=capacity(app,a["seller"]); aid=auction(c,a,cap).json()["id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda name: bid(c,a,aid,who=name),["buyer","buyer2"]))
    assert sorted(r.status_code for r in results)==[201,409]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:post(c,f"/auctions/{aid}/bids",a["buyer"],{"price":2100,"accept_terms":True},"concurrent-retry"),range(2)))
    assert [r.status_code for r in results]==[201,201]
    assert results[0].json()==results[1].json()
    with app.state.sessions() as db: assert db.scalar(select(func.count()).select_from(AuctionBid))==2


def test_concurrent_auctions_cannot_sell_same_stock(system):
    c,app,a=system; cap=capacity(app,a["seller"])
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(lambda _:auction(c,a,cap),range(2)))
    assert sorted(r.status_code for r in results)==[201,409]
    with app.state.sessions() as db:
        assert db.get(Capacity,cap).reserved_g==100000
        assert db.scalar(select(func.count()).select_from(Auction))==1


def test_schedule_extensions_cap_and_server_late_rejection(system,monkeypatch):
    c,app,a=system; cap=capacity(app,a["seller"])
    now=utcnow(); aid=auction(c,a,cap,closes_at=(now+timedelta(seconds=60)).isoformat()).json()["id"]
    from server.meraki import auctions
    for i in range(7):
        with app.state.sessions() as db: end=aware(db.get(Auction,aid).closes_at)
        monkeypatch.setattr(auctions,"utcnow",lambda:end-timedelta(seconds=1))
        assert bid(c,a,aid,price=2000+i*100).status_code==201
    with app.state.sessions() as db:
        row=db.get(Auction,aid); assert aware(row.closes_at)==aware(row.original_closes_at)+timedelta(seconds=600)
        end=aware(row.closes_at)
    monkeypatch.setattr(auctions,"utcnow",lambda:end)
    assert bid(c,a,aid,price=3000).status_code==409


def test_scheduled_not_open_and_self_linked_or_wrong_role_bids(system):
    c,app,a=system; cap=capacity(app,a["seller"])
    aid=auction(c,a,cap,opens_at=(utcnow()+timedelta(minutes=1)).isoformat()).json()["id"]
    assert bid(c,a,aid).status_code==409
    with app.state.sessions() as db, db.begin(): db.get(Auction,aid).opens_at=utcnow()-timedelta(seconds=2)
    assert bid(c,a,aid,who="seller").status_code==403
    assert bid(c,a,aid,who="supplier").status_code==403
    with app.state.sessions() as db,db.begin():
        user=db.scalar(select(Membership.user_id).where(Membership.organisation_id==a["buyer"]["X-Organisation-ID"]))
        db.add(Membership(user_id=user,organisation_id=a["seller"]["X-Organisation-ID"],role="staff",permissions=[]))
    assert bid(c,a,aid).status_code==403


@pytest.mark.parametrize("case",["no-bids","default","decline","cancel"])
def test_release_paths_worker_restart_and_single_close(system,case):
    c,app,a=system; cap=capacity(app,a["seller"]); aid=auction(c,a,cap).json()["id"]
    if case=="cancel":
        assert post(c,f"/auctions/{aid}/cancel",a["seller"],{}).status_code==200
    else:
        if case!="no-bids": assert bid(c,a,aid).status_code==201
        force_due(app,aid)
        # Recreate the app/session factory, as after a process restart.
        restarted=create_app(app.state.engine.url.render_as_string(hide_password=False),create_schema=False)
        with ThreadPoolExecutor(max_workers=2) as pool: list(pool.map(lambda _:run_once(restarted.state.sessions),range(2)))
        restarted.state.engine.dispose()
        if case=="default":
            with app.state.sessions() as db,db.begin(): db.scalar(select(AuctionAward)).expires_at=utcnow()-timedelta(seconds=1)
            run_once(app.state.sessions); run_once(app.state.sessions)
        elif case=="decline": assert post(c,f"/auctions/{aid}/award",a["buyer"],{"action":"decline"}).status_code==200
    with app.state.sessions() as db:
        row=db.get(Capacity,cap); assert (row.reserved_g,row.committed_g)==(0,0)
        assert db.scalar(select(func.count()).select_from(AuctionAward))==(0 if case in ("no-bids","cancel") else 1)
        if case!="cancel": assert db.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.action=="auction.closed"))==1


def test_forward_lowest_quote_loser_release_and_bilateral_confirmation(system):
    c,app,a=system; caps={name:capacity(app,a[name],"projection") for name in ("seller","supplier")}
    r=auction(c,a,mode="forward",limit_price=3000); assert r.status_code==201,r.text
    aid=r.json()["id"]
    assert bid(c,a,aid,who="seller",price=3000,capacity_id=caps["seller"]).status_code==201
    assert bid(c,a,aid,who="supplier",price=3100,capacity_id=caps["supplier"]).status_code==409
    assert bid(c,a,aid,who="supplier",price=2900,capacity_id=caps["supplier"]).status_code==201
    assert bid(c,a,aid,who="supplier",price=2800,capacity_id=caps["supplier"]).status_code==201
    force_due(app,aid); run_once(app.state.sessions)
    with app.state.sessions() as db:
        assert db.get(Capacity,caps["seller"]).reserved_g==0
        assert db.get(Capacity,caps["supplier"]).reserved_g==100000
    for who in ("buyer","supplier"):
        assert post(c,f"/auctions/{aid}/award",a[who],{"action":"confirm"}).status_code==200
    with app.state.sessions() as db: assert db.get(Capacity,caps["supplier"]).committed_g==100000


@pytest.mark.parametrize("fault",["wrong-crop","stale","withdrawn","unreviewed","short-window","insufficient","unqualified"])
def test_forward_ineligible_capacity_cannot_bid(system,fault):
    c,app,a=system; cap=capacity(app,a["seller"],"projection"); aid=auction(c,a,mode="forward",eligible_org_ids=[a["supplier" if fault=="unqualified" else "seller"]["X-Organisation-ID"]]).json()["id"]
    with app.state.sessions() as db,db.begin():
        row=db.get(Capacity,cap)
        if fault=="wrong-crop":row.crop="Tomato"
        elif fault=="stale": db.get(Projection,row.source_id).stale_after=utcnow()-timedelta(seconds=1)
        elif fault=="withdrawn": row.consent_status="withdrawn"
        elif fault=="unreviewed":row.reviewed=False
        elif fault=="short-window":row.week_start="2026-12-03"
        elif fault=="insufficient":row.quantity_g=90000
    assert bid(c,a,aid,who="seller",capacity_id=cap).status_code in [403,409]
    with app.state.sessions() as db: assert db.get(Capacity,cap).reserved_g==0


def test_invalidated_forward_offer_is_not_awarded(system):
    c,app,a=system; cap=capacity(app,a["seller"],"projection"); aid=auction(c,a,mode="forward").json()["id"]
    assert bid(c,a,aid,who="seller",capacity_id=cap).status_code==201
    with app.state.sessions() as db,db.begin(): db.get(Projection,db.get(Capacity,cap).source_id).stale_after=utcnow()-timedelta(seconds=1)
    force_due(app,aid); run_once(app.state.sessions)
    assert c.get(f"/api/v1/auctions/{aid}",headers=a["buyer"]).json()["status"]=="unsold"
    with app.state.sessions() as db: assert db.get(Capacity,cap).reserved_g==0


@pytest.mark.parametrize("extra",[{"price":-1},{"price":20.5},{"price":"2000"},{"currency":"USD"},{"accept_terms":False},{"price":True}])
def test_invalid_bids_are_rejected(system,extra):
    c,app,a=system; cap=capacity(app,a["seller"]); aid=auction(c,a,cap).json()["id"]
    data={"price":2000,"accept_terms":True,**extra}
    assert post(c,f"/auctions/{aid}/bids",a["buyer"],data).status_code==422


def test_accounts_scope_logout_expiry_bad_password_and_throttle(system):
    c,app,a=system
    assert c.get("/api/v1/auctions").status_code==401
    assert c.get("/api/v1/auctions",headers={**a["buyer"],"X-Organisation-ID":a["seller"]["X-Organisation-ID"]}).status_code==403
    assert c.post("/api/v1/dev/sessions",json={}).status_code==404
    assert c.post("/api/v1/auth/login",json={"username":"buyer","password":"incorrect-password"}).status_code==401
    logged=c.post("/api/v1/auth/login",json={"username":"BUYER","password":"Synthetic-Test-Password!"}); assert logged.status_code==200
    account=logged.json(); headers={"Authorization":"Bearer "+account["access_token"],"X-Organisation-ID":account["organisation_id"]}
    assert c.post("/api/v1/auth/logout",headers=headers).status_code==204
    assert c.get("/api/v1/auth/me",headers=headers).status_code==401
    for _ in range(10): response=c.post("/api/v1/auth/login",json={"username":"unknown","password":"incorrect-password"})
    assert response.status_code==429
    with app.state.sessions() as db,db.begin():
        for row in db.scalars(select(SessionToken)).all():row.expires_at=utcnow()-timedelta(seconds=1)
    assert c.get("/api/v1/auctions",headers=a["buyer"]).status_code==401
    with app.state.sessions() as db:
        hashes=db.scalars(select(PasswordCredential.password_hash)).all()
        assert all("Synthetic-Test-Password!" not in h for h in hashes)


def test_no_cross_org_capacity_and_non_owner_cancellation(system):
    c,app,a=system; cap=capacity(app,a["supplier"])
    assert auction(c,a,cap).status_code==409
    cap=capacity(app,a["seller"]); aid=auction(c,a,cap).json()["id"]
    assert post(c,f"/auctions/{aid}/cancel",a["buyer"],{}).status_code==404
    assert bid(c,a,aid).status_code==201
    assert post(c,f"/auctions/{aid}/cancel",a["seller"],{}).status_code==409


def test_bid_waiting_on_lock_rechecks_deadline(system):
    from threading import Event
    c,app,a=system; cap=capacity(app,a["seller"]); aid=auction(c,a,cap).json()["id"]
    started=Event()
    with app.state.sessions() as db:
        with db.begin():
            row=db.scalar(select(Auction).where(Auction.id==aid).with_for_update())
            with ThreadPoolExecutor(max_workers=1) as pool:
                def waiting_bid():
                    started.set()
                    return bid(c,a,aid)
                future=pool.submit(waiting_bid)
                assert started.wait(2)
                row.closes_at=utcnow()-timedelta(seconds=1)
                db.commit()
                assert future.result(timeout=5).status_code==409
    with app.state.sessions() as db: assert db.scalar(select(func.count()).select_from(AuctionBid))==0


def test_auction_hold_blocks_existing_reservation_ledger(system):
    from server.meraki.services import reserve_capacity
    from fastapi import HTTPException
    from server.meraki.models import Listing
    c,app,a=system; cap=capacity(app,a["seller"]); aid=auction(c,a,cap).json()["id"]
    with app.state.sessions() as db,db.begin():
        db.add(Listing(id=uuid4().hex,organisation_id=a["seller"]["X-Organisation-ID"],capacity_id=cap,resource_type="harvested_lot"))
    with app.state.sessions() as db,db.begin():
        with pytest.raises(HTTPException) as caught:
            reserve_capacity(db,{"user_id":"unused", "organisation_id":a["buyer"]["X-Organisation-ID"]},cap,1000,utcnow()+timedelta(hours=1))
        assert caught.value.status_code==409
    assert post(c,f"/auctions/{aid}/cancel",a["seller"],{}).status_code==200


def test_duplicate_stock_source_is_rejected_by_database(system):
    from sqlalchemy.exc import IntegrityError
    c,app,a=system; cap=capacity(app,a["seller"])
    with app.state.sessions() as db:
        sid=db.get(Capacity,cap).source_id
    with pytest.raises(IntegrityError):capacity(app,a["seller"],source_id=sid)


def test_disabled_auction_adapter_and_production_registration(tmp_path,monkeypatch):
    monkeypatch.setenv("MERAKI_ENV","production");monkeypatch.setenv("MERAKI_PASSWORD_AUTH","1")
    monkeypatch.delenv("MERAKI_ALLOW_REGISTRATION",raising=False)
    app=create_app(f'sqlite:///{tmp_path / "guard.sqlite3"}',create_schema=False)
    with TestClient(app) as client:
        assert client.post('/api/v1/auth/register',json={"username":"guard","password":"Synthetic-Test-Password!","display_name":"Guard","organisation_name":"Synthetic guard","role":"fpo"}).status_code==403
        assert client.post('/api/v1/dev/sessions',json={}).status_code==404
    app.state.engine.dispose()


def test_migrations_upgrade_downgrade_and_upgrade_again():
    import subprocess
    import sys
    from pathlib import Path
    from sqlalchemy.engine import make_url
    from sqlalchemy import inspect
    schema="migration_test_"+uuid4().hex
    admin=make_engine(PG)
    with admin.begin() as db:db.execute(text(f'CREATE SCHEMA "{schema}"'))
    url=make_url(PG).update_query_dict({"options":"-csearch_path="+schema}).render_as_string(hide_password=False)
    env={**os.environ,"MERAKI_DATABASE_URL":url}
    root=Path(__file__).resolve().parents[2]
    try:
        for revision in ["head","base","head"]:
            command="downgrade" if revision=="base" else "upgrade"
            result=subprocess.run([sys.executable,"-m","alembic","-c","server/alembic.ini",command,revision],cwd=root,env=env,capture_output=True,text=True,timeout=30)
            assert result.returncode==0,result.stderr
        engine=make_engine(url)
        assert set(Base.metadata.tables).issubset(inspect(engine).get_table_names())
        assert "uq_capacity_source" in {c['name'] for c in inspect(engine).get_indexes("capacities")}
        engine.dispose()
    finally:
        with admin.begin() as db:db.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()
