"""Independent HTTP acceptance tests for the Part 3 trade contract.

The suite uses actual database writes. Its mutable server clock is supplied through
create_app's documented injection point; client payloads never decide deadlines.
"""
from __future__ import annotations

import os
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))


@dataclass
class Clock:
    now: datetime = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)

    def __call__(self):
        return self.now

    def advance_to(self, value):
        self.now = datetime.fromisoformat(value.replace("Z", "+00:00")) + timedelta(seconds=1)


class Trade:
    def __init__(self, client, clock, app_factory, database_url):
        self.client = client
        self.clock = clock
        self.app_factory = app_factory
        self.database_url = database_url
        self.tokens = {}
        for identity in ("fpo-a", "fpo-b", "exporter-a", "exporter-b", "qc-a", "qc-b", "finance-a", "finance-b"):
            response = client.post("/api/trade/dev/sessions", json={"principal_id": identity})
            assert response.status_code == 200, response.text
            self.tokens[identity] = response.json()["token"]

    def request(self, method, path, identity="fpo-a", body=None, key=None, headers=None):
        auth = {"Authorization": "Bearer " + self.tokens[identity]}
        if method == "POST":
            auth["Idempotency-Key"] = key or str(uuid.uuid4())
        auth.update(headers or {})
        return self.client.request(method, "/api/trade" + path, json=body, headers=auth)

    def get(self, path, identity="fpo-a"):
        response = self.request("GET", path, identity)
        assert response.status_code == 200, response.text
        return response.json()

    def post(self, path, body, identity="fpo-a", key=None):
        response = self.request("POST", path, identity, body, key)
        assert response.status_code in (200, 201), response.text
        return response.json()

    def current(self, collection, item, identity="fpo-a"):
        return self.get(f"/{collection}/{item['id']}", identity)

    def command(self, collection, item, command, identity="fpo-a", **fields):
        current = self.current(collection, item, identity)
        return self.post(f"/{collection}/{item['id']}/{command}", {"expected_version": current["version"], **fields}, identity)

    def lot(self, quantity=100_000, identity="fpo-a", members=None):
        return self.post("/lots", {
            "crop": "okra", "variety": "okra", "grade": "A", "quantity_g": quantity,
            "harvest_date": self.clock.now.date().isoformat(),
            "pickup_deadline": (self.clock.now + timedelta(days=8)).isoformat(),
            "member_contributions": members or [{"member_id": "member-z", "quantity_g": quantity}],
        }, identity)

    def inspect(self, lot, identity="fpo-a", safety_hold=False):
        return self.command("lots", lot, "inspections", identity,
            sample_id="sample-" + str(uuid.uuid4()), protocol="export-v1", protocol_version="1",
            inspected_weight_g=lot["quantity_g"], sample_count=5, observed_grade="A",
            defects="No observed cosmetic defects", report_reference="private://lab/report-7",
            issuer="Synthetic independent laboratory", inspected_at=self.clock.now.isoformat(),
            safety_hold=safety_hold)

    def release(self, lot, identity="fpo-a", reviewer="qc-a"):
        inspected = self.inspect(lot, identity)
        return self.command("lots", inspected, "reviews", reviewer, decision="release", reason="Scope checked; no unresolved safety hold")

    def commercial(self):
        return {
            "handover": "FPO packhouse scale", "grade_protocol": "export-v1", "payment_terms": "Invoice after accepted receipt",
            "delivery_start": (self.clock.now + timedelta(hours=3)).isoformat(),
            "delivery_end": (self.clock.now + timedelta(days=7)).isoformat(),
            "payment_due_days": 7, "downgrade_bps": 5000, "fee_paise": 11,
            "shortfall_liability": "seller", "cancellation_terms": "Recorded pre-dispatch default",
            "production_risk": "Seller reports disruption; no yield guarantee", "dispute_procedure": "Both parties approve resolution",
        }

    def spot(self, lot, reserve=1007, increment=10, closes_in=timedelta(hours=2)):
        return self.post("/auctions", {
            "mode": "spot", "lot_id": lot["id"], "reserve_price_paise_per_kg": reserve,
            "increment_paise_per_kg": increment, "opens_at": self.clock.now.isoformat(),
            "closes_at": (self.clock.now + closes_in).isoformat(), **self.commercial(),
        })

    def forward(self, quantity=100_000, maximum=2000):
        return self.post("/auctions", {
            "mode": "forward", "crop": "okra", "variety": "okra", "grade": "A", "quantity_g": quantity,
            "maximum_price_paise_per_kg": maximum, "opens_at": self.clock.now.isoformat(),
            "closes_at": (self.clock.now + timedelta(hours=2)).isoformat(), **self.commercial(),
        }, "exporter-a")

    def bid(self, auction, price=1007, identity="exporter-a", capacity_id=None):
        fields = {"price_paise_per_kg": price}
        if capacity_id:
            fields["capacity_id"] = capacity_id
        return self.command("auctions", auction, "bids", identity, **fields)

    def close(self, auction, identity="fpo-a"):
        auction = self.current("auctions", auction, identity)
        self.clock.advance_to(auction["closes_at"])
        return self.command("auctions", auction, "close", identity)

    def confirm(self, contract):
        for identity in ("fpo-a", "exporter-a"):
            contract = self.command("contracts", contract, "confirm", identity, terms_version=contract["terms_version"])
        assert contract["status"] == "confirmed"
        return contract

    def sold(self, quantity=100_000, price=1007, members=None):
        lot = self.release(self.lot(quantity, members=members))
        auction = self.spot(lot, reserve=price)
        auction = self.bid(auction, price)
        auction = self.close(auction)
        contract = self.get("/contracts/" + auction["contract_id"])
        return lot, self.confirm(contract)

    def shipment(self, contract, lot, quantity):
        return self.post("/shipments", {
            "contract_id": contract["id"], "lot_id": lot["id"], "quantity_g": quantity,
            "pickup_at": (self.clock.now + timedelta(hours=1)).isoformat(),
            "delivery_at": (self.clock.now + timedelta(hours=2)).isoformat(),
            "packing": "Traceable food grade crates", "handover_reference": "private://handover/9",
        })

    def receive(self, shipment, accepted, downgraded=0, rejected=0, missing=0):
        shipment = self.command("shipments", shipment, "dispatch")
        return self.command("shipments", shipment, "receive", "exporter-a",
            received_g=accepted + downgraded + rejected, accepted_g=accepted,
            downgraded_g=downgraded, rejected_g=rejected,
            reason="Scale discrepancy and cosmetic downgrade" if downgraded or rejected or missing else "Conforms to agreed protocol",
            evidence_reference="private://receipt/inspection-9")


DATABASES = ["sqlite"] + (["postgresql"] if os.environ.get("TRADE_TEST_DATABASE_URL") else [])


@pytest.fixture(params=DATABASES)
def trade(request, tmp_path):
    from fastapi.testclient import TestClient
    from server.app import create_app

    schema = None
    cleanup_engine = None
    if request.param == "sqlite":
        url = "sqlite:///" + (tmp_path / "acceptance.sqlite3").as_posix()
    else:
        from sqlalchemy import create_engine, text
        from sqlalchemy.engine import make_url
        supplied = make_url(os.environ["TRADE_TEST_DATABASE_URL"])
        assert supplied.get_backend_name() == "postgresql", "TRADE_TEST_DATABASE_URL must point to disposable PostgreSQL"
        schema = "trade_acceptance_" + uuid.uuid4().hex
        cleanup_engine = create_engine(supplied)
        with cleanup_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        url = str(supplied.update_query_dict({"options": "-csearch_path=" + schema}).render_as_string(hide_password=False))
    clock = Clock()
    app = create_app(database_url=url, demo_enabled=True, clock=clock)
    try:
        with TestClient(app) as client:
            yield Trade(client, clock, create_app, url)
    finally:
        database = getattr(app.state, "database", None)
        engine = getattr(database, "engine", None)
        if engine is not None:
            engine.dispose()
        if cleanup_engine is not None:
            from sqlalchemy import text
            with cleanup_engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
            cleanup_engine.dispose()


def assert_rejected(response, *statuses):
    assert response.status_code in (statuses or (403, 404, 409, 422)), response.text


def line_amount(weight_g, price, fraction_bps=10000):
    return int((Decimal(weight_g) * price * fraction_bps / Decimal(10_000_000)).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def test_spot_to_bilateral_claim_settlement_and_member_reconciliation(trade):
    members = [{"member_id": "member-b", "quantity_g": 50000}, {"member_id": "member-a", "quantity_g": 50001}]
    lot, contract = trade.sold(quantity=100001, price=1007, members=members)
    first = trade.shipment(contract, lot, 50001)
    second = trade.shipment(contract, lot, 50000)
    assert_rejected(trade.request("POST", "/shipments", body={
        "contract_id": contract["id"], "lot_id": lot["id"], "quantity_g": 1,
        "pickup_at": (trade.clock.now + timedelta(hours=1)).isoformat(),
        "delivery_at": (trade.clock.now + timedelta(hours=2)).isoformat(),
        "packing": "Crates", "handover_reference": "excess"}), 409, 422)
    receipt = trade.receive(first, accepted=48000, downgraded=1000, rejected=501, missing=500)
    trade.receive(second, accepted=50000)
    assert receipt["transit_shortfall_g"] == 500
    claim = trade.post("/claims", {"receipt_id": receipt["id"], "affected_g": 500,
        "amount_paise": 100, "reason": "Disputed shortfall", "evidence_reference": "private://claim/evidence"}, "exporter-a")
    assert_rejected(trade.request("POST", "/settlements", body={"contract_id": contract["id"]}), 409)
    claim = trade.command("claims", claim, "propose", "exporter-a", adjustment_paise=37, reason="Agreed scale allowance")
    claim = trade.command("claims", claim, "agree", "exporter-a", resolution_version=claim["proposal"]["version"])
    assert claim["status"] != "resolved", "One party cannot settle a disputed deduction"
    claim = trade.command("claims", claim, "agree", "fpo-a", resolution_version=claim["proposal"]["version"])
    assert claim["status"] == "resolved"
    settlement = trade.post("/settlements", {"contract_id": contract["id"]})
    gross = line_amount(48000, 1007) + line_amount(1000, 1007, 5000) + line_amount(50000, 1007)
    assert settlement["gross_paise"] == gross
    assert settlement["adjustments_paise"] == 37
    assert settlement["fee_paise"] == 11
    assert settlement["net_paise"] == gross - 37 - 11
    assert settlement["invoice_paise"] == gross - 37
    assert sum(row["amount_paise"] for row in settlement["allocations"]) == settlement["net_paise"]
    weights = {row["member_id"]: row["contribution_g"] for row in settlement["allocations"]}
    assert weights == {"member-a": 50001, "member-b": 50000}
    net = settlement["net_paise"]
    floors = {member: net * weight // 100001 for member, weight in weights.items()}
    order = sorted(weights, key=lambda member: (-(net * weights[member] % 100001), member))
    for member in order[:net - sum(floors.values())]:
        floors[member] += 1
    assert {row["member_id"]: row["amount_paise"] for row in settlement["allocations"]} == floors
    assert settlement["payment_status"] == "unverified"
    assert settlement["verified_receipt_paise"] == settlement["disbursed_paise"] == 0
    payment = {"expected_version": settlement["version"], "amount_paise": settlement["invoice_paise"],
        "evidence_reference": "private://bank/receipt", "verification_basis": "Matched independent statement entry"}
    assert_rejected(trade.request("POST", f"/settlements/{settlement['id']}/payments", body=payment), 403)
    assert_rejected(trade.request("POST", f"/settlements/{settlement['id']}/payments", "qc-a", payment), 403, 404)
    settlement = trade.post(f"/settlements/{settlement['id']}/payments", payment, "finance-a")
    assert settlement["payment_status"] == "paid"
    assert settlement["verified_receipt_paise"] == settlement["invoice_paise"]
    assert_rejected(trade.request("POST", f"/settlements/{settlement['id']}/payments", "finance-a", {
        **payment, "expected_version": settlement["version"], "amount_paise": 1}), 409, 422)
    for row in settlement["allocations"]:
        settlement = trade.command("settlements", settlement, "disbursals", "finance-a", member_id=row["member_id"],
            amount_paise=row["amount_paise"], evidence_reference="private://bank/disbursal", verification_basis="Matched member statement")
    assert settlement["disbursed_paise"] == net
    assert_rejected(trade.request("POST", "/settlements", body={"contract_id": contract["id"]}), 409)


def test_qc_roles_safety_hold_and_dispatch_recheck(trade):
    lot = trade.lot()
    assert lot["status"] == "held"
    assert_rejected(trade.request("POST", f"/lots/{lot['id']}/reviews", "qc-a", {
        "expected_version": lot["version"], "decision": "release", "reason": "No evidence"}), 409, 422)
    lot = trade.inspect(lot, safety_hold=True)
    for identity in ("fpo-a", "qc-b", "finance-a"):
        assert_rejected(trade.request("POST", f"/lots/{lot['id']}/reviews", identity, {
            "expected_version": lot["version"], "decision": "release", "reason": "Unauthorised"}), 403, 404)
    assert_rejected(trade.request("POST", f"/lots/{lot['id']}/reviews", "qc-a", {
        "expected_version": lot["version"], "decision": "release", "reason": "Unresolved safety evidence"}), 409, 422)
    # A safe observation must be genuinely later than the unsafe observation.
    trade.clock.now += timedelta(seconds=1)
    lot = trade.release(lot)
    auction = trade.close(trade.bid(trade.spot(lot)))
    contract = trade.confirm(trade.get("/contracts/" + auction["contract_id"]))
    shipment = trade.shipment(contract, lot, lot["quantity_g"])
    lot = trade.command("lots", trade.current("lots", lot), "reviews", "qc-a", decision="hold", reason="New safety concern before dispatch")
    assert_rejected(trade.request("POST", f"/shipments/{shipment['id']}/dispatch", body={"expected_version": shipment["version"]}), 409)


def test_public_market_excludes_other_bids_private_evidence_and_contracts(trade):
    lot, contract = trade.sold()
    private_ref = "private://lab/report-7"
    for identity in ("fpo-b", "exporter-b", "qc-b", "finance-b"):
        workspace = trade.get("/workspace", identity)
        assert all(row["id"] != lot["id"] for row in workspace["lots"])
        assert all(row["id"] != contract["id"] for row in workspace["contracts"])
        assert private_ref not in str(workspace)
        for collection, item in (("lots", lot), ("contracts", contract)):
            response = trade.request("GET", f"/{collection}/{item['id']}", identity,
                headers={"X-Organisation-Id": contract["seller_org"], "X-Role": "fpo"})
            assert response.status_code == 404, response.text
    public = trade.get("/auctions/" + contract["auction_id"], "exporter-b")
    assert not public.get("bids"), "Other organisations' individual bids must stay private"
    assert private_ref not in str(public)
    assert "member-z" not in str(public)
    assert trade.request("GET", f"/lots/{lot['id']}/inspections", "exporter-b").status_code in (404, 405)


def test_idempotency_conflict_and_restart_preserve_award(trade):
    lot = trade.release(trade.lot())
    auction = trade.spot(lot)
    body = {"expected_version": auction["version"], "price_paise_per_kg": 1007}
    key = str(uuid.uuid4())
    first = trade.request("POST", f"/auctions/{auction['id']}/bids", "exporter-a", body, key)
    assert first.status_code == 200, first.text
    again = trade.request("POST", f"/auctions/{auction['id']}/bids", "exporter-a", body, key)
    assert again.status_code == first.status_code
    assert again.json() == first.json()
    assert_rejected(trade.request("POST", f"/auctions/{auction['id']}/bids", "exporter-a", {**body, "price_paise_per_kg": 1017}, key), 409)
    auction = trade.close(first.json())
    contract = trade.get("/contracts/" + auction["contract_id"])
    from fastapi.testclient import TestClient
    app = trade.app_factory(database_url=trade.database_url, demo_enabled=True, clock=trade.clock)
    with TestClient(app) as client:
        reopened = Trade(client, trade.clock, trade.app_factory, trade.database_url)
        recovered = reopened.get("/contracts/" + contract["id"])
        assert recovered == contract
        auction = reopened.current("auctions", auction)
        closed = reopened.command("auctions", auction, "close")
        assert closed["contract_id"] == contract["id"]
        assert len([row for row in reopened.get("/workspace")["contracts"] if row["auction_id"] == auction["id"]]) == 1
    app.state.database.engine.dispose()


def test_spot_deadlines_extension_and_no_self_equal_or_subincrement_bids(trade):
    lot = trade.release(trade.lot())
    auction = trade.spot(lot)
    assert_rejected(trade.request("POST", f"/auctions/{auction['id']}/bids", body={
        "expected_version": auction["version"], "price_paise_per_kg": 1007}), 403, 409)
    auction = trade.bid(auction)
    for price in (1007, 1016):
        assert_rejected(trade.request("POST", f"/auctions/{auction['id']}/bids", "exporter-b", {
            "expected_version": auction["version"], "price_paise_per_kg": price}), 409, 422)
    assert_rejected(trade.request("POST", f"/auctions/{auction['id']}/close", body={"expected_version": auction["version"]}), 409)
    original = datetime.fromisoformat(auction["original_closes_at"].replace("Z", "+00:00"))
    price = 1007
    for _ in range(12):
        effective = datetime.fromisoformat(auction["closes_at"].replace("Z", "+00:00"))
        trade.clock.now = effective - timedelta(seconds=1)
        price += 10
        auction = trade.bid(auction, price, "exporter-b" if price % 20 == 17 else "exporter-a")
        assert datetime.fromisoformat(auction["closes_at"].replace("Z", "+00:00")) <= original + timedelta(seconds=600)
    assert auction["extension_seconds"] == 600
    trade.clock.advance_to(auction["closes_at"])
    assert_rejected(trade.request("POST", f"/auctions/{auction['id']}/bids", "exporter-b", {
        "expected_version": auction["version"], "price_paise_per_kg": price + 10}), 409)


def test_forward_capacity_ties_conversion_and_duplicate_commitment(trade):
    auction = trade.forward(quantity=700000)
    first = trade.bid(auction, 1500, "fpo-a", "capacity-a")
    second = trade.bid(first, 1500, "fpo-b", "capacity-b")
    other = trade.forward(quantity=400000)
    assert_rejected(trade.request("POST", f"/auctions/{other['id']}/bids", body={
        "expected_version": other["version"], "price_paise_per_kg": 1400, "capacity_id": "capacity-a"}), 409, 422)
    assert_rejected(trade.request("POST", f"/auctions/{other['id']}/bids", body={
        "expected_version": other["version"], "price_paise_per_kg": 1400, "capacity_id": "capacity-b"}), 403, 404)
    closed = trade.close(second, "exporter-a")
    contract = trade.get("/contracts/" + closed["contract_id"])
    assert contract["seller_org"] == trade.get("/workspace")["principal"]["organisation_id"]
    assert contract["price_paise_per_kg"] == 1500
    assert contract["capacity_id"] == "capacity-a"
    assert trade.get("/capacities/capacity-b", "fpo-b")["available_g"] == 1000000
    contract = trade.confirm(contract)
    payload = {"expected_version": contract["version"], "quantity_g": 700000,
        "harvest_date": trade.clock.now.date().isoformat(), "pickup_deadline": (trade.clock.now + timedelta(days=8)).isoformat(),
        "member_contributions": [{"member_id": "member-forward", "quantity_g": 700000}]}
    assert_rejected(trade.request("POST", f"/contracts/{contract['id']}/harvest", body={**payload, "quantity_g": 1}), 409, 422)
    lot = trade.post(f"/contracts/{contract['id']}/harvest", payload)
    assert lot["forward_contract_id"] == contract["id"]
    assert lot["reserved_g"] == 700000
    assert_rejected(trade.request("POST", "/auctions", body={
        "mode": "spot", "lot_id": lot["id"], "reserve_price_paise_per_kg": 1000, "increment_paise_per_kg": 1,
        "opens_at": trade.clock.now.isoformat(), "closes_at": (trade.clock.now + timedelta(hours=2)).isoformat(), **trade.commercial()}), 409)
    payload["expected_version"] = trade.current("contracts", contract)["version"]
    assert_rejected(trade.request("POST", f"/contracts/{contract['id']}/harvest", body=payload), 409)
    lot = trade.release(lot)
    shipment = trade.shipment(contract, lot, 700000)
    trade.receive(shipment, accepted=700000)
    settlement = trade.post("/settlements", {"contract_id": contract["id"]})
    assert settlement["gross_paise"] == 1050000
    assert sum(row["amount_paise"] for row in settlement["allocations"]) == settlement["net_paise"]


def test_confirmation_terms_version_and_expiry_release(trade):
    lot = trade.release(trade.lot())
    auction = trade.close(trade.bid(trade.spot(lot)))
    contract = trade.get("/contracts/" + auction["contract_id"])
    contract = trade.command("contracts", contract, "confirm", terms_version=contract["terms_version"])
    assert contract["status"] == "provisional"
    terms = {**contract["terms"], "payment_due_days": 9}
    changed = trade.command("contracts", contract, "amend", "exporter-a", terms=terms)
    assert changed["terms_version"] == contract["terms_version"] + 1
    assert changed["confirmations"] == []
    assert_rejected(trade.request("POST", f"/contracts/{contract['id']}/confirm", "exporter-a", {
        "expected_version": changed["version"], "terms_version": contract["terms_version"]}), 409)
    trade.clock.advance_to(changed["expires_at"])
    from server.worker import run_once
    run_once(trade.client.app.state.database, clock=trade.clock)
    session = trade.client.post("/api/trade/dev/sessions", json={"principal_id": "fpo-a"}).json()
    trade.tokens["fpo-a"] = session["token"]
    session = trade.client.post("/api/trade/dev/sessions", json={"principal_id": "exporter-a"}).json()
    trade.tokens["exporter-a"] = session["token"]
    expired = trade.current("contracts", contract)
    assert expired["status"] == "expired"
    assert trade.current("lots", lot)["reserved_g"] == 0
    assert_rejected(trade.request("POST", f"/contracts/{contract['id']}/confirm", "exporter-a", {
        "expected_version": expired["version"], "terms_version": expired["terms_version"]}), 409)


def test_concurrent_equal_spot_bids_close_and_stock_reservation(trade):
    lot = trade.release(trade.lot())
    auction = trade.spot(lot)
    body = {"expected_version": auction["version"], "price_paise_per_kg": 1007}
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda identity: trade.request("POST", f"/auctions/{auction['id']}/bids", identity, body), ("exporter-a", "exporter-b")))
    assert sorted(response.status_code for response in replies) == [200, 409], [response.text for response in replies]
    current = trade.current("auctions", auction)
    trade.clock.advance_to(current["closes_at"])
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: trade.request("POST", f"/auctions/{auction['id']}/close", body={"expected_version": current["version"]}), range(2)))
    assert all(response.status_code in (200, 409) for response in replies), [response.text for response in replies]
    assert any(response.status_code == 200 for response in replies)
    contracts = [row for row in trade.get("/workspace")["contracts"] if row["auction_id"] == auction["id"]]
    assert len(contracts) == 1
    assert trade.current("lots", lot)["reserved_g"] == lot["quantity_g"]


def test_two_auctions_cannot_reserve_same_stock(trade):
    lot = trade.release(trade.lot())
    body = {"mode": "spot", "lot_id": lot["id"], "reserve_price_paise_per_kg": 1007,
        "increment_paise_per_kg": 10, "opens_at": trade.clock.now.isoformat(),
        "closes_at": (trade.clock.now + timedelta(hours=2)).isoformat(), **trade.commercial()}
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: trade.request("POST", "/auctions", body=body), range(2)))
    assert sorted(response.status_code for response in replies) == [200, 409], [response.text for response in replies]
    created = next(response.json() for response in replies if response.status_code == 200)
    cancelled = trade.command("auctions", created, "cancel", reason="No longer offered")
    assert cancelled["status"] == "cancelled"
    assert trade.current("lots", lot)["reserved_g"] == 0
    assert trade.spot(lot)["id"] != created["id"]


@pytest.mark.parametrize("invalid", [-1, 0, 1.5, True, "NaN", "Infinity"])
def test_reject_invalid_non_integer_weights(trade, invalid):
    response = trade.request("POST", "/lots", body={"crop": "okra", "variety": "okra", "grade": "A", "quantity_g": invalid,
        "harvest_date": trade.clock.now.date().isoformat(), "pickup_deadline": (trade.clock.now + timedelta(days=1)).isoformat(),
        "member_contributions": [{"member_id": "member-x", "quantity_g": invalid}]})
    assert response.status_code == 422, response.text


def test_missing_auth_and_idempotency_are_rejected(trade):
    assert trade.client.get("/api/trade/workspace").status_code == 401
    response = trade.client.post("/api/trade/lots", json={}, headers={"Authorization": "Bearer " + trade.tokens["fpo-a"]})
    assert response.status_code in (400, 422), response.text


def test_demo_disabled_has_no_principal_or_session_backdoor(tmp_path):
    from fastapi.testclient import TestClient
    from server.app import create_app
    app = create_app(database_url="sqlite:///" + (tmp_path / "no-demo.sqlite3").as_posix(), demo_enabled=False, clock=Clock())
    with TestClient(app) as client:
        assert client.get("/api/trade/dev/principals").status_code in (403, 404, 503)
        assert client.post("/api/trade/dev/sessions", json={"principal_id": "fpo-a"}).status_code in (403, 404, 503)
        health = client.get("/api/trade/health")
        assert health.status_code == 200
        assert health.json()["production_ready"] is False


def test_open_claim_limits_resolution_versions_and_no_unpaid_disbursal(trade):
    lot, contract = trade.sold(quantity=10000, price=1000)
    receipt = trade.receive(trade.shipment(contract, lot, 10000), accepted=10000)
    base = {"receipt_id": receipt["id"], "affected_g": 1000, "amount_paise": 4000,
        "reason": "Documented commercial disagreement", "evidence_reference": "private://claim/1"}
    claim = trade.post("/claims", base, "exporter-a")
    assert_rejected(trade.request("POST", "/claims", "exporter-a", {**base, "amount_paise": 6001}), 409, 422)
    assert_rejected(trade.request("POST", "/claims", "exporter-b", base), 403, 404)
    assert_rejected(trade.request("POST", f"/claims/{claim['id']}/propose", "fpo-a", {
        "expected_version": claim["version"], "adjustment_paise": 4001, "reason": "Excess deduction"}), 409, 422)
    claim = trade.command("claims", claim, "propose", "exporter-a", adjustment_paise=100, reason="First proposal")
    old_resolution = claim["proposal"]["version"]
    claim = trade.command("claims", claim, "agree", "exporter-a", resolution_version=old_resolution)
    claim = trade.command("claims", claim, "propose", "fpo-a", adjustment_paise=50, reason="Counter proposal")
    assert not claim["approvals"]
    assert_rejected(trade.request("POST", f"/claims/{claim['id']}/agree", "fpo-a", {
        "expected_version": claim["version"], "resolution_version": old_resolution}), 409)
    for identity in ("fpo-a", "exporter-a"):
        claim = trade.command("claims", claim, "agree", identity, resolution_version=claim["proposal"]["version"])
    assert_rejected(trade.request("POST", f"/claims/{claim['id']}/propose", "exporter-a", {
        "expected_version": claim["version"], "adjustment_paise": 1, "reason": "Rewrite resolved deduction"}), 409)
    settlement = trade.post("/settlements", {"contract_id": contract["id"]})
    assert settlement["adjustments_paise"] == 50
    assert_rejected(trade.request("POST", f"/settlements/{settlement['id']}/disbursals", "finance-a", {
        "expected_version": settlement["version"], "member_id": "member-z", "amount_paise": 1,
        "evidence_reference": "private://bank/unfunded", "verification_basis": "No money received"}), 409, 422)
    assert_rejected(trade.request("POST", f"/settlements/{settlement['id']}/payments", "finance-b", {
        "expected_version": settlement["version"], "amount_paise": settlement["invoice_paise"],
        "evidence_reference": "private://bank/forged", "verification_basis": "Wrong organisation"}), 403, 404)


def test_partial_receipt_invalid_partitions_do_not_consume_shipment(trade):
    lot, contract = trade.sold(quantity=10000)
    shipment = trade.command("shipments", trade.shipment(contract, lot, 10000), "dispatch")
    payload = {"expected_version": shipment["version"], "received_g": 10000, "accepted_g": 9000,
        "downgraded_g": 0, "rejected_g": 999, "reason": "Weighing", "evidence_reference": "private://scale"}
    assert_rejected(trade.request("POST", f"/shipments/{shipment['id']}/receive", "exporter-a", payload), 409, 422)
    assert_rejected(trade.request("POST", f"/shipments/{shipment['id']}/receive", "exporter-a", {
        **payload, "received_g": 10001, "accepted_g": 10001, "rejected_g": 0}), 409, 422)
    assert_rejected(trade.request("POST", f"/shipments/{shipment['id']}/receive", "fpo-a", {
        **payload, "accepted_g": 10000, "rejected_g": 0}), 403, 404)
    assert trade.current("shipments", shipment)["status"] == "dispatched"
    receipt = trade.command("shipments", shipment, "receive", "exporter-a", received_g=10000,
        accepted_g=10000, downgraded_g=0, rejected_g=0, reason="Conforming", evidence_reference="private://scale")
    current = trade.current("shipments", shipment)
    assert_rejected(trade.request("POST", f"/shipments/{shipment['id']}/receive", "exporter-a", {
        **payload, "expected_version": current["version"], "accepted_g": 10000, "rejected_g": 0}), 409)
    assert receipt["quantity_g"] == 10000
    assert_rejected(trade.request("POST", f"/contracts/{contract['id']}/cancel", body={
        "expected_version": trade.current("contracts", contract)["version"], "reason": "Erase movement"}), 409)
    assert_rejected(trade.request("POST", f"/contracts/{contract['id']}/amend", body={
        "expected_version": trade.current("contracts", contract)["version"], "terms": contract["terms"]}), 409)


def test_concurrent_capacity_reservations_and_partial_shipments(trade):
    first = trade.forward(quantity=600000)
    second = trade.forward(quantity=600000)
    def offer(auction):
        return trade.request("POST", f"/auctions/{auction['id']}/bids", body={"expected_version": auction["version"],
            "price_paise_per_kg": 1500, "capacity_id": "capacity-a"})
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(offer, (first, second)))
    assert sorted(response.status_code for response in replies) == [200, 409], [response.text for response in replies]
    assert trade.get("/capacities/capacity-a")["available_g"] == 400000
    lot, contract = trade.sold(quantity=10000)
    body = {"contract_id": contract["id"], "lot_id": lot["id"], "quantity_g": 6000,
        "pickup_at": (trade.clock.now + timedelta(hours=1)).isoformat(),
        "delivery_at": (trade.clock.now + timedelta(hours=2)).isoformat(), "packing": "Crates", "handover_reference": "two trucks"}
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: trade.request("POST", "/shipments", body=body), range(2)))
    assert sorted(response.status_code for response in replies) == [200, 409], [response.text for response in replies]
    assert trade.current("contracts", contract)["shipped_g"] == 6000
    assert trade.current("lots", lot)["shipped_g"] == 6000


def test_no_bid_worker_close_releases_stock_and_preserves_audit(trade):
    lot = trade.release(trade.lot())
    auction = trade.spot(lot)
    trade.clock.advance_to(auction["closes_at"])
    from server.worker import run_once
    run_once(trade.client.app.state.database, clock=trade.clock)
    run_once(trade.client.app.state.database, clock=trade.clock)
    closed = trade.current("auctions", auction)
    assert closed["status"] == "no_sale"
    assert closed["contract_id"] is None
    assert trade.current("lots", lot)["reserved_g"] == 0
    assert not [contract for contract in trade.get("/workspace")["contracts"] if contract["auction_id"] == auction["id"]]
    events = trade.get("/workspace")["audit_events"]
    assert events, "Committed mutations must leave durable audit history"
    assert any(auction["id"] in str(event) for event in events)


def test_production_environment_overrides_demo_opt_in(tmp_path):
    from fastapi.testclient import TestClient
    from server.app import create_app
    app = create_app(database_url="sqlite:///" + (tmp_path / "production.sqlite3").as_posix(),
        demo_enabled=True, environment="production", clock=Clock())
    with TestClient(app) as client:
        assert client.post("/api/trade/dev/sessions", json={"principal_id": "fpo-a"}).status_code in (403, 404, 503)
        response = client.get("/api/trade/health")
        assert response.status_code == 200
        assert response.json()["production_ready"] is False
        assert response.json()["blockers"]


def test_half_paise_lines_and_stable_member_tie_break(trade):
    members = [{"member_id": "member-c", "quantity_g": 1}, {"member_id": "member-b", "quantity_g": 1}, {"member_id": "member-a", "quantity_g": 1}]
    lot = trade.release(trade.lot(quantity=3, members=members))
    auction = trade.post("/auctions", {"mode": "spot", "lot_id": lot["id"], "reserve_price_paise_per_kg": 500,
        "increment_paise_per_kg": 1, "opens_at": trade.clock.now.isoformat(),
        "closes_at": (trade.clock.now + timedelta(hours=2)).isoformat(), **{**trade.commercial(), "fee_paise": 0}})
    auction = trade.close(trade.bid(auction, price=500))
    contract = trade.confirm(trade.get("/contracts/" + auction["contract_id"]))
    trade.receive(trade.shipment(contract, lot, 3), accepted=3)
    settlement = trade.post("/settlements", {"contract_id": contract["id"]})
    assert settlement["gross_paise"] == settlement["net_paise"] == 2
    assert {row["member_id"]: row["amount_paise"] for row in settlement["allocations"]} == {
        "member-a": 1, "member-b": 1, "member-c": 0}


@pytest.mark.parametrize("invalid", [-1, 1.5, True, "NaN", "Infinity"])
def test_reject_invalid_non_integer_bid_prices(trade, invalid):
    lot = trade.release(trade.lot())
    auction = trade.spot(lot)
    response = trade.request("POST", f"/auctions/{auction['id']}/bids", "exporter-a", {
        "expected_version": auction["version"], "price_paise_per_kg": invalid})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("principal_id", [[], {}, ["fpo-a"], {"id": "fpo-a"}])
def test_malformed_session_principal_is_validation_error(trade, principal_id):
    from fastapi.testclient import TestClient
    with TestClient(trade.client.app, raise_server_exceptions=False) as client:
        response = client.post("/api/trade/dev/sessions", json={"principal_id": principal_id})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("collection,field", [("auctions", "lot_id"), ("shipments", "contract_id"), ("claims", "receipt_id"), ("settlements", "contract_id")])
@pytest.mark.parametrize("invalid_id", [[], {}])
def test_malformed_body_resource_ids_are_validation_errors(trade, collection, field, invalid_id):
    from fastapi.testclient import TestClient
    body = {field: invalid_id}
    if collection == "auctions":
        body.update(mode="spot", reserve_price_paise_per_kg=1000, increment_paise_per_kg=1,
            opens_at=trade.clock.now.isoformat(), closes_at=(trade.clock.now + timedelta(hours=2)).isoformat(), **trade.commercial())
    with TestClient(trade.client.app, raise_server_exceptions=False) as client:
        response = client.post("/api/trade/" + collection, json=body, headers={
            "Authorization": "Bearer " + trade.tokens["fpo-a"], "Idempotency-Key": str(uuid.uuid4())})
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("terms", [["not a terms object"], "terms", 1, True])
def test_amendment_terms_must_be_an_object(trade, terms):
    lot = trade.release(trade.lot())
    auction = trade.close(trade.bid(trade.spot(lot)))
    contract = trade.get("/contracts/" + auction["contract_id"])
    from fastapi.testclient import TestClient
    with TestClient(trade.client.app, raise_server_exceptions=False) as client:
        response = client.post(f"/api/trade/contracts/{contract['id']}/amend", json={
            "expected_version": contract["version"], "terms": terms}, headers={
                "Authorization": "Bearer " + trade.tokens["fpo-a"], "Idempotency-Key": str(uuid.uuid4())})
    assert response.status_code == 422, response.text
    assert trade.current("contracts", contract) == contract


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e9999"])
def test_raw_nonfinite_json_is_rejected_without_mutation(trade, literal):
    from fastapi.testclient import TestClient
    before = trade.get("/workspace")
    with TestClient(trade.client.app, raise_server_exceptions=False) as client:
        response = client.post("/api/trade/lots", content='{"quantity_g":' + literal + '}', headers={
            "Authorization": "Bearer " + trade.tokens["fpo-a"], "Idempotency-Key": str(uuid.uuid4()), "Content-Type": "application/json"})
    assert response.status_code == 422, response.text
    after = trade.get("/workspace")
    assert after["lots"] == before["lots"]
    assert after["audit_events"] == before["audit_events"]


def test_harvested_lot_cannot_represent_future_production(trade):
    response = trade.request("POST", "/lots", body={"crop": "okra", "variety": "okra", "grade": "A", "quantity_g": 1000,
        "harvest_date": (trade.clock.now + timedelta(days=1)).date().isoformat(),
        "pickup_deadline": (trade.clock.now + timedelta(days=2)).isoformat(),
        "member_contributions": [{"member_id": "member-x", "quantity_g": 1000}]})
    assert response.status_code in (409, 422), response.text


def test_contract_obligation_cannot_exceed_json_integer_precision(trade):
    lot = trade.release(trade.lot(quantity=10**12))
    response = trade.request("POST", "/auctions", body={"mode": "spot", "lot_id": lot["id"],
        "reserve_price_paise_per_kg": 10**12, "increment_paise_per_kg": 1,
        "opens_at": trade.clock.now.isoformat(), "closes_at": (trade.clock.now + timedelta(hours=2)).isoformat(), **trade.commercial()})
    assert response.status_code in (409, 422), response.text
    assert trade.current("lots", lot)["reserved_g"] == 0


def test_qc_evidence_must_match_commercial_protocol_and_keep_dispatch_snapshot(trade):
    lot = trade.release(trade.lot())
    bad_terms = {**trade.commercial(), "grade_protocol": "unrelated-protocol"}
    assert_rejected(trade.request("POST", "/auctions", body={"mode": "spot", "lot_id": lot["id"],
        "reserve_price_paise_per_kg": 1007, "increment_paise_per_kg": 1,
        "opens_at": trade.clock.now.isoformat(), "closes_at": (trade.clock.now + timedelta(hours=2)).isoformat(), **bad_terms}), 409, 422)
    auction = trade.close(trade.bid(trade.spot(lot)))
    contract = trade.confirm(trade.get("/contracts/" + auction["contract_id"]))
    shipment = trade.shipment(contract, lot, 50000)
    dispatched = trade.command("shipments", shipment, "dispatch")
    prior_dispatch = dispatched["dispatched_at"]
    lot = trade.inspect(trade.current("lots", lot), safety_hold=True)
    assert trade.current("shipments", dispatched)["dispatched_at"] == prior_dispatch
    assert_rejected(trade.request("POST", "/shipments", body={
        "contract_id": contract["id"], "lot_id": lot["id"], "quantity_g": 50000,
        "pickup_at": (trade.clock.now + timedelta(hours=1)).isoformat(),
        "delivery_at": (trade.clock.now + timedelta(hours=2)).isoformat(), "packing": "Crates", "handover_reference": "held remainder"}), 409)


def test_partial_forward_offer_is_explicitly_rejected(trade):
    auction = trade.forward(quantity=100000)
    response = trade.request("POST", f"/auctions/{auction['id']}/bids", body={
        "expected_version": auction["version"], "price_paise_per_kg": 1500,
        "capacity_id": "capacity-a", "quantity_g": 1})
    assert response.status_code in (409, 422), response.text
    assert trade.get("/capacities/capacity-a")["available_g"] == 1000000


def test_forward_offer_revision_releases_superseded_and_losing_capacity(trade):
    auction = trade.forward(quantity=600000)
    auction = trade.bid(auction, 1500, "fpo-a", "capacity-a")
    auction = trade.bid(auction, 1400, "fpo-a", "capacity-a")
    assert trade.get("/capacities/capacity-a")["available_g"] == 400000
    assert len(auction["bids"]) == 2
    assert auction["bids"][0]["status"] == "superseded"
    auction = trade.bid(auction, 1300, "fpo-b", "capacity-b")
    auction = trade.close(auction, "exporter-a")
    contract = trade.get("/contracts/" + auction["contract_id"], "exporter-a")
    assert contract["seller_org"] == "fpo-b"
    assert contract["price_paise_per_kg"] == 1300
    assert trade.get("/capacities/capacity-a")["available_g"] == 1000000
    assert trade.get("/capacities/capacity-b", "fpo-b")["available_g"] == 400000
    contract = trade.command("contracts", contract, "default", "exporter-a", reason="Winner cannot perform")
    assert contract["status"] == "defaulted"
    assert trade.get("/capacities/capacity-b", "fpo-b")["available_g"] == 1000000
    assert len([c for c in trade.get("/workspace", "exporter-a")["contracts"] if c["auction_id"] == auction["id"]]) == 1


def test_concurrent_identical_idempotency_replays_one_committed_bid(trade):
    lot = trade.release(trade.lot())
    auction = trade.spot(lot)
    body = {"expected_version": auction["version"], "price_paise_per_kg": 1007}
    key = str(uuid.uuid4())
    with ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: trade.request("POST", f"/auctions/{auction['id']}/bids", "exporter-a", body, key), range(2)))
    assert [response.status_code for response in replies] == [200, 200], [response.text for response in replies]
    assert replies[0].json() == replies[1].json()
    current = trade.current("auctions", auction)
    assert len(current["bids"]) == 1
    events = [event for event in trade.get("/workspace")["audit_events"]
        if event.get("resource_id") == auction["id"] and event.get("action") == "auction.bid_accepted"]
    assert len(events) == 1


def test_late_worker_recovery_expires_original_award_without_reselling(trade):
    lot = trade.release(trade.lot())
    auction = trade.bid(trade.spot(lot))
    trade.clock.now = datetime.fromisoformat(auction["closes_at"].replace("Z", "+00:00")) + timedelta(hours=25)
    from server.worker import run_once
    run_once(trade.client.app.state.database, clock=trade.clock)
    run_once(trade.client.app.state.database, clock=trade.clock)
    recovered = trade.current("auctions", auction)
    contract = trade.get("/contracts/" + recovered["contract_id"])
    assert contract["status"] == "expired"
    assert datetime.fromisoformat(contract["expires_at"].replace("Z", "+00:00")) == datetime.fromisoformat(auction["closes_at"].replace("Z", "+00:00")) + timedelta(hours=24)
    assert trade.current("lots", lot)["reserved_g"] == 0
    assert len([c for c in trade.get("/workspace")["contracts"] if c["auction_id"] == auction["id"]]) == 1


def test_payment_deadline_is_anchored_to_latest_receipt_not_statement_issue(trade):
    lot, contract = trade.sold(quantity=10000)
    first = trade.shipment(contract, lot, 5000)
    second = trade.shipment(contract, lot, 5000)
    trade.receive(first, accepted=5000)
    trade.clock.now += timedelta(days=1)
    latest = trade.receive(second, accepted=5000)
    expected_due = datetime.fromisoformat(latest["received_at"].replace("Z", "+00:00")) + timedelta(days=contract["terms"]["payment_due_days"])
    trade.clock.now += timedelta(days=3)
    statement = trade.post("/settlements", {"contract_id": contract["id"]})
    actual_due = datetime.fromisoformat(statement["payment_due_at"].replace("Z", "+00:00"))
    assert actual_due == expected_due
