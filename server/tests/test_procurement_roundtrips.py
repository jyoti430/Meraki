"""Multi-supplier procurement round trips against isolated transactional databases.

Reuse the HTTP acceptance harness so these cases also run against a disposable
PostgreSQL schema when TRADE_TEST_DATABASE_URL is supplied by CI. No hosted
database or external provider is contacted.
"""
from __future__ import annotations

import copy
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.part3_acceptance.test_trade_journeys import Trade, line_amount, trade


class Procurement(Trade):
    def __init__(self, *args):
        self.writes = []
        super().__init__(*args)

    def post(self, path, body, identity="fpo-a", key=None):
        key = key or str(uuid.uuid4())
        result = super().post(path, body, identity, key)
        self.writes.append((path, copy.deepcopy(body), identity, key, copy.deepcopy(result)))
        return result

    def requirement(self, quantity=100_000, deadline_days=2):
        created = self.post("/requirements", {
            **self.commercial(), "crop": "okra", "variety": "okra", "grade": "A",
            "quantity_g": quantity, "maximum_price_paise_per_kg": 10_000,
            "proposal_deadline": (self.clock.now + timedelta(days=deadline_days)).isoformat(),
            "packaging_requirements": "Separate labelled supplier crates",
            "quality_specification": [{"attribute": "pod length", "unit": "cm", "minimum": "8", "maximum": "12", "required": False}],
        }, "exporter-a")
        return self.command("requirements", created, "publish", "exporter-a")

    def proposal(self, requirement, quantity, suffix="a", price=1007):
        start = datetime.fromisoformat(requirement["terms"]["delivery_start"].replace("Z", "+00:00"))
        return self.post(f"/requirements/{requirement['id']}/proposals", {
            "quantity_g": quantity, "price_paise_per_kg": price, "grade": "A",
            "capacity_id": "capacity-" + suffix,
            "expected_availability": max(start + timedelta(hours=1), self.clock.now + timedelta(hours=1)).isoformat(),
            "evidence_reference": f"private://{suffix}/capacity-review",
        }, "fpo-" + suffix)

    def award(self, requirement, proposal):
        return self.command("requirements", requirement, "award", "exporter-a", proposal_id=proposal["id"])["contract"]

    def split(self, quantities=(60_000, 40_000)):
        requirement = self.requirement(sum(quantities))
        proposals = [self.proposal(requirement, quantity, suffix, price)
                     for quantity, suffix, price in zip(quantities, ("a", "b"), (1007, 2011))]
        contracts = [self.award(requirement, proposal) for proposal in proposals]
        return requirement, contracts

    def confirm(self, contract):
        for identity in (contract["seller_org"], contract["buyer_org"]):
            contract = self.command("contracts", contract, "confirm", identity, terms_version=contract["terms_version"])
        assert contract["status"] == "confirmed"
        return contract

    def harvest(self, contract):
        quantity = contract["quantity_g"]
        return self.command("contracts", contract, "harvest", contract["seller_org"],
            quantity_g=quantity, harvest_date=self.clock.now.date().isoformat(),
            pickup_deadline=(self.clock.now + timedelta(days=8)).isoformat(),
            member_contributions=[{"member_id": "member-a", "quantity_g": quantity // 3},
                                  {"member_id": "member-b", "quantity_g": quantity - quantity // 3}])

    def shipment(self, contract, lot, quantity):
        return self.post("/shipments", {
            "contract_id": contract["id"], "lot_id": lot["id"], "quantity_g": quantity,
            "pickup_at": (self.clock.now + timedelta(hours=1)).isoformat(),
            "delivery_at": (self.clock.now + timedelta(hours=2)).isoformat(),
            "packing": "Separate labelled supplier crates", "handover_reference": "private://handover/round-trip",
        }, contract["seller_org"])

    def receive(self, shipment, accepted, downgraded=0, rejected=0):
        self.command("shipments", shipment, "dispatch", shipment["seller_org"])
        return self.command("shipments", shipment, "receive", shipment["buyer_org"],
            received_g=accepted + downgraded + rejected, accepted_g=accepted,
            downgraded_g=downgraded, rejected_g=rejected,
            reason="Recorded receiving partitions", evidence_reference="private://receiving/round-trip")


@pytest.fixture
def procurement(trade):
    return Procurement(trade.client, trade.clock, trade.app_factory, trade.database_url)


def capacity(flow, suffix, *, reserved=0, committed=0, converted=0):
    value = flow.get("/capacities/capacity-" + suffix, "fpo-" + suffix)
    assert (value["reserved_g"], value["committed_g"], value["converted_g"]) == (reserved, committed, converted)
    assert value["available_g"] == value["quantity_g"] - reserved - committed - converted
    for counter, status in ((reserved, "reserved"), (committed, "committed"), (converted, "converted")):
        assert sum(row["quantity_g"] for row in value["reservations"] if row["status"] == status) == counter
    return value


def allocation(flow, requirement, allocated, remaining):
    value = flow.current("requirements", requirement, "exporter-a")
    assert (value["allocated_g"], value["remaining_g"]) == (allocated, remaining)
    assert allocated + remaining == value["quantity_g"]
    return value


def resolve(flow, receipt, seller, *, direction="seller_deduction", affected=500, requested=100, agreed=37):
    claim = flow.post("/claims", {
        "receipt_id": receipt["id"], "affected_g": affected, "amount_paise": requested,
        "direction": direction, "reason": "Documented receiving dispute",
        "evidence_reference": "private://claim/round-trip",
    }, seller if direction == "seller_credit" else "exporter-a")
    claim = flow.command("claims", claim, "propose", "exporter-a", adjustment_paise=agreed, reason="Agreed adjustment")
    claim = flow.command("claims", claim, "agree", seller, resolution_version=claim["proposal"]["version"])
    assert claim["status"] == "open"
    return flow.command("claims", claim, "agree", "exporter-a", resolution_version=claim["proposal"]["version"])


def test_split_procurement_delivery_claims_finance_and_restart_replay(procurement):
    flow = procurement
    requirement, (first, second) = flow.split((60_001, 40_000))
    first, second = flow.confirm(first), flow.confirm(second)
    old_first = copy.deepcopy(first)
    first = flow.command("contracts", first, "amend", "exporter-a", terms={
        **first["terms"], "payment_due_days": 9, "packaging_requirements": "Amended supplier A crate labels",
    })
    assert first["confirmations"] == [] and first["terms_version"] == 2
    assert first["amendment_history"][0]["confirmations"] == old_first["confirmations"]
    assert flow.current("contracts", second, "fpo-b") == second
    capacity(flow, "a", committed=60_001)
    allocation(flow, requirement, 100_001, 0)
    stale = flow.request("POST", f"/contracts/{first['id']}/confirm", "fpo-a", {
        "expected_version": first["version"], "terms_version": old_first["terms_version"]})
    assert stale.status_code == 409
    first = flow.confirm(first)
    assert first["terms"]["packaging_requirements"] == "Amended supplier A crate labels"
    assert second["terms"]["packaging_requirements"] == "Separate labelled supplier crates"
    lots = [flow.harvest(contract) for contract in (first, second)]
    for suffix, quantity in (("a", 60_001), ("b", 40_000)):
        capacity(flow, suffix, converted=quantity)
    # The contract's harvested stock stays exclusive through the QC handoff.
    held = flow.request("POST", "/shipments", "fpo-a", {
        "contract_id": first["id"], "lot_id": lots[0]["id"], "quantity_g": 1})
    assert held.status_code == 409
    lots = [flow.release(lot, "fpo-" + suffix, "qc-" + suffix) for lot, suffix in zip(lots, ("a", "b"))]
    flow.clock.now += timedelta(hours=3)
    shipments = [flow.shipment(first, lots[0], 30_001), flow.shipment(first, lots[0], 30_000), flow.shipment(second, lots[1], 40_000)]
    for contract, owner in ((first, "fpo-a"), (second, "fpo-b")):
        current = flow.current("contracts", contract, owner)
        blocked = flow.request("POST", f"/contracts/{contract['id']}/cancel", owner,
                               {"expected_version": current["version"], "reason": "Shipment already exists"})
        assert blocked.status_code == 409
    receipts = [flow.receive(shipments[0], 28_000, 1000, 501), flow.receive(shipments[1], 30_000), flow.receive(shipments[2], 40_000)]
    assert receipts[0]["transit_shortfall_g"] == 500
    assert flow.request("GET", "/receipts/" + receipts[0]["id"], "fpo-b").status_code == 404
    assert flow.request("GET", "/contracts/" + second["id"], "fpo-a").status_code == 404
    # Settlements and claims for one FPO must not consume the other's budget.
    second_settlement = flow.post("/settlements", {"contract_id": second["id"]}, "fpo-b")
    assert second_settlement["gross_paise"] == line_amount(40_000, 2011)
    deduction = resolve(flow, receipts[0], "fpo-a")
    credit = resolve(flow, receipts[0], "fpo-a", direction="seller_credit", affected=501, requested=250, agreed=250)
    assert deduction["status"] == credit["status"] == "resolved"
    first_settlement = flow.post("/settlements", {"contract_id": first["id"]})
    gross = line_amount(28_000, 1007) + line_amount(1000, 1007, 5000) + line_amount(30_000, 1007)
    assert (first_settlement["gross_paise"], first_settlement["deductions_paise"], first_settlement["credits_paise"]) == (gross, 37, 250)
    assert first_settlement["invoice_paise"] == gross - 37 + 250
    assert first_settlement["net_paise"] == gross - 37 + 250 - 11
    assert flow.current("settlements", second_settlement, "fpo-b") == second_settlement
    for settlement, suffix in ((first_settlement, "a"), (second_settlement, "b")):
        assert sum(row["amount_paise"] for row in settlement["allocations"]) == settlement["net_paise"]
        payment = {"expected_version": settlement["version"], "amount_paise": settlement["invoice_paise"],
                   "evidence_reference": "private://bank/synthetic-receipt", "verification_basis": "Synthetic statement match"}
        other_finance = "finance-b" if suffix == "a" else "finance-a"
        assert flow.request("POST", f"/settlements/{settlement['id']}/payments", other_finance, payment).status_code == 404
        settlement = flow.post(f"/settlements/{settlement['id']}/payments", payment, "finance-" + suffix)
        for row in settlement["allocations"]:
            settlement = flow.command("settlements", settlement, "disbursals", "finance-" + suffix,
                member_id=row["member_id"], amount_paise=row["amount_paise"],
                evidence_reference="private://bank/synthetic-disbursal", verification_basis="Synthetic member statement match")
        assert settlement["disbursed_paise"] == settlement["net_paise"]
        buyer_view = flow.current("settlements", settlement, "exporter-a")
        assert not {"allocations", "payments", "disbursals"}.intersection(buyer_view)
    snapshots = {identity: flow.get("/workspace", identity) for identity in ("fpo-a", "fpo-b", "exporter-a")}
    # Replay every successful command after opening a second API process against
    # the same durable database, including historical expected/terms versions.
    app = flow.app_factory(database_url=flow.database_url, demo_enabled=True, clock=flow.clock)
    with TestClient(app) as client:
        reopened = Trade(client, flow.clock, flow.app_factory, flow.database_url)
        for path, body, identity, key, original in flow.writes:
            response = reopened.request("POST", path, identity, body, key)
            assert response.status_code == 200, response.text
            assert response.json() == original
        for identity, before in snapshots.items():
            assert reopened.get("/workspace", identity) == before
    allocation(flow, requirement, 100_001, 0)
    capacity(flow, "a", converted=60_001)
    capacity(flow, "b", converted=40_000)


@pytest.mark.parametrize("action", ["cancel", "default", "expire"])
@pytest.mark.parametrize("converted", [False, True], ids=["committed", "harvested"])
def test_amended_split_contract_unwind_preserves_other_fpo_and_capacity(procurement, action, converted):
    flow = procurement
    requirement, (first, second) = flow.split()
    first, second = flow.confirm(first), flow.confirm(second)
    lot = flow.harvest(first) if converted else None
    first = flow.command("contracts", first, "amend", "exporter-a", terms={**first["terms"], "payment_due_days": 8})
    capacity(flow, "a", converted=60_000 if converted else 0, committed=0 if converted else 60_000)
    allocation(flow, requirement, 100_000, 0)
    if action == "expire":
        flow.clock.advance_to(first["expires_at"])
        assert flow.client.app.state.service.tick()["expired"] == 1
        assert flow.client.app.state.service.tick()["expired"] == 0
        first = flow.current("contracts", first)
        assert first["status"] == "expired"
    else:
        first = flow.command("contracts", first, action, reason="Recorded commercial unwind")
    assert flow.current("contracts", second, "fpo-b") == second
    capacity(flow, "b", committed=40_000)
    capacity(flow, "a", converted=60_000 if converted else 0)
    reopened = allocation(flow, requirement, 40_000, 60_000)
    assert reopened["status"] == "published"
    assert len(reopened["contract_ids"]) == 2, "Terminated awards remain in history"
    if converted:
        released = flow.current("lots", lot)
        assert released["reserved_g"] == 0 and released["forward_contract_id"] is None and released["buyer_org"] is None
    replacement = flow.award(requirement, flow.proposal(requirement, 60_000))
    replacement = flow.confirm(replacement)
    capacity(flow, "a", committed=60_000, converted=60_000 if converted else 0)
    allocation(flow, requirement, 100_000, 0)
    assert replacement["id"] != first["id"]
    assert flow.client.app.state.service.tick()["expired"] == 0


@pytest.mark.parametrize("reviewer", ["qc-a", "finance-a"])
def test_reviewers_cannot_confirm_amend_terminate_or_resolve_commercial_obligations(procurement, reviewer):
    flow = procurement
    requirement = flow.requirement()
    contract = flow.award(requirement, flow.proposal(requirement, 100_000))
    for action, fields in (("confirm", {"terms_version": 1}),
                           ("amend", {"terms": {**contract["terms"], "payment_due_days": 9}}),
                           ("cancel", {"reason": "Reviewer cannot cancel"}),
                           ("default", {"reason": "Reviewer cannot default"})):
        response = flow.request("POST", f"/contracts/{contract['id']}/{action}", reviewer,
                                {"expected_version": contract["version"], **fields})
        assert response.status_code == 403, (action, response.text)
        assert flow.current("contracts", contract) == contract
    contract = flow.confirm(contract)
    lot = flow.release(flow.harvest(contract))
    flow.clock.now += timedelta(hours=3)
    receipt = flow.receive(flow.shipment(contract, lot, 100_000), 100_000)
    body = {"receipt_id": receipt["id"], "affected_g": 100, "amount_paise": 100,
            "reason": "Commercial claim", "evidence_reference": "private://commercial/claim"}
    assert flow.request("POST", "/claims", reviewer, body).status_code == 403
    claim = flow.post("/claims", body, "exporter-a")
    proposed = {"expected_version": claim["version"], "adjustment_paise": 50, "reason": "Counteroffer"}
    assert flow.request("POST", f"/claims/{claim['id']}/propose", reviewer, proposed).status_code == 403
    claim = flow.command("claims", claim, "propose", "exporter-a", adjustment_paise=50, reason="Commercial counteroffer")
    assert flow.request("POST", f"/claims/{claim['id']}/agree", reviewer,
                        {"expected_version": claim["version"], "resolution_version": 1}).status_code == 403
    assert flow.current("claims", claim) == claim
    capacity(flow, "a", converted=100_000)


def test_competing_manual_awards_are_serialized_then_remaining_budget_can_be_filled(procurement):
    flow = procurement
    requirement = flow.requirement()
    proposals = [flow.proposal(requirement, 60_000, suffix) for suffix in ("a", "b")]
    requirement = flow.current("requirements", requirement, "exporter-a")
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda proposal: flow.request("POST", f"/requirements/{requirement['id']}/award", "exporter-a", {
            "expected_version": requirement["version"], "proposal_id": proposal["id"]}), proposals))
    assert sorted(response.status_code for response in responses) == [200, 409]
    selected = next(index for index, response in enumerate(responses) if response.status_code == 200)
    loser_suffix = ("a", "b")[1 - selected]
    loser = proposals[1 - selected]
    allocation(flow, requirement, 60_000, 40_000)
    for suffix in ("a", "b"):
        capacity(flow, suffix, reserved=60_000)
    flow.command("proposals", loser, "withdraw", "fpo-" + loser_suffix)
    replacement = flow.proposal(requirement, 40_000, loser_suffix)
    flow.award(requirement, replacement)
    allocation(flow, requirement, 100_000, 0)
    assert len(flow.get("/contracts", "exporter-a")["items"]) == 2
    capacity(flow, loser_suffix, reserved=40_000)


def test_simultaneous_duplicate_award_retry_creates_one_obligation(procurement):
    flow = procurement
    requirement = flow.requirement()
    proposal = flow.proposal(requirement, 60_000)
    requirement = flow.current("requirements", requirement, "exporter-a")
    body = {"expected_version": requirement["version"], "proposal_id": proposal["id"]}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: flow.request("POST", f"/requirements/{requirement['id']}/award", "exporter-a", body, "same-award"), range(2)))
    assert [response.status_code for response in responses] == [200, 200]
    assert responses[0].json() == responses[1].json()
    contract = responses[0].json()["contract"]
    assert len(flow.get("/contracts", "exporter-a")["items"]) == 1
    events = flow.get("/workspace", "exporter-a")["audit_events"]
    assert len([event for event in events if event["resource_id"] == contract["id"]]) == 1
    allocation(flow, requirement, 60_000, 40_000)
    capacity(flow, "a", reserved=60_000)


def test_required_buyer_criteria_block_creation_until_explicit_bilateral_amendment(procurement):
    flow = procurement
    requirement = flow.requirement()
    contract = flow.award(requirement, flow.proposal(requirement, 100_000))
    required = {**contract["terms"]["quality_specification"][0], "required": True}
    contract = flow.command("contracts", contract, "amend", "exporter-a",
                            terms={**contract["terms"], "quality_specification": [required]})
    contract = flow.confirm(contract)
    lot = flow.release(flow.harvest(contract))
    flow.clock.now += timedelta(hours=3)
    body = {"contract_id": contract["id"], "lot_id": lot["id"], "quantity_g": 100_000,
            "pickup_at": (flow.clock.now + timedelta(hours=1)).isoformat(),
            "delivery_at": (flow.clock.now + timedelta(hours=2)).isoformat(),
            "packing": "Labelled crates", "handover_reference": "private://handover/quality-scope"}
    response = flow.request("POST", "/shipments", body=body)
    assert response.status_code == 409, response.text
    assert "unassessed" in response.json()["detail"].lower()
    assert flow.current("contracts", contract)["shipped_g"] == 0
    assert flow.current("lots", lot)["shipped_g"] == 0
    # The API never silently removes a buyer criterion to make shipping pass.
    contract = flow.command("contracts", contract, "amend", "exporter-a",
                            terms={**contract["terms"], "quality_specification": []})
    blocked = flow.request("POST", "/shipments", body=body)
    assert blocked.status_code == 409
    contract = flow.confirm(contract)
    shipment = flow.shipment(contract, lot, 100_000)
    assert flow.receive(shipment, 100_000)["accepted_g"] == 100_000


def test_legacy_draft_with_unassessed_required_criteria_cannot_dispatch(procurement):
    flow = procurement
    requirement = flow.requirement()
    contract = flow.confirm(flow.award(requirement, flow.proposal(requirement, 100_000)))
    lot = flow.release(flow.harvest(contract))
    flow.clock.now += timedelta(hours=3)
    shipment = flow.shipment(contract, lot, 100_000)
    # Model a pre-guard persisted draft whose required criterion had only been
    # recorded, not assessed. This historical state must not escape on retry.
    service = flow.client.app.state.service
    with flow.client.app.state.database.transaction() as session:
        historical = service.get(session, "contracts", contract["id"])
        historical["terms"]["quality_specification"][0]["required"] = True
        service.save(session, historical)
    response = flow.request("POST", f"/shipments/{shipment['id']}/dispatch",
                            body={"expected_version": shipment["version"]})
    assert response.status_code == 409, response.text
    assert "unassessed" in response.json()["detail"].lower()
    assert flow.current("shipments", shipment)["status"] == "draft"
    assert flow.current("shipments", shipment)["dispatched_at"] is None
    assert not flow.get("/receipts")["items"]
