"""Offline transition guards; PostgreSQL arbitration has its own acceptance suite."""
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from server.meraki.auction_schemas import AuctionCreate, BidCreate
from server.meraki.auctions import award_decision, close_auction, create_auction, place_bid
from server.meraki.models import (Auction, AuctionAward, AuctionHold, Base, Capacity,
                                  Membership, Organization, Reservation, User)
from server.meraki.services import utcnow


@pytest.fixture
def provisional(tmp_path, monkeypatch):
    monkeypatch.setenv("MERAKI_ENV", "development")
    engine = create_engine("sqlite:///" + (tmp_path / "guards.sqlite3").as_posix())
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine)
    seller = {"user_id": "seller-user", "organisation_id": "seller", "role": "fpo"}
    buyer = {"user_id": "buyer-user", "organisation_id": "buyer", "role": "exporter"}
    now = utcnow()
    with sessions() as db, db.begin():
        db.add_all([Organization(id=side, name="Synthetic " + side) for side in ("seller", "buyer")])
        db.add_all([User(id=actor["user_id"], email=actor["user_id"] + "@synthetic.invalid", display_name=actor["user_id"])
                    for actor in (seller, buyer)])
        db.flush()
        db.add_all([Membership(user_id=actor["user_id"], organisation_id=actor["organisation_id"], role=actor["role"], permissions=["auction:write"])
                    for actor in (seller, buyer)])
        db.add(Capacity(id="lot-capacity", organisation_id="seller", source_type="harvested_lot", source_id="synthetic-lot",
                        crop="Okra", variety="Hybrid", grade="A", week_start="2026-12-01", week_end="2026-12-07",
                        quantity_g=100_000, reviewed=True, consent_status="opted-in"))
        db.flush()
        body = AuctionCreate(mode="spot", title="Synthetic guard lot", crop="Okra", variety="Hybrid", grade="A",
            week_start="2026-12-01", week_end="2026-12-07", quantity_g=100_000, capacity_id="lot-capacity",
            limit_price=2000, increment=100, opens_at=now, closes_at=now + timedelta(hours=2),
            terms={"handover": "Synthetic packhouse", "acceptance": "Synthetic protocol", "payment": "Synthetic statement",
                   "cancellation": "Recorded default", "evidence_reference": "synthetic://guard", "evidence_status": "synthetic"})
        auction_id = create_auction(db, seller, body)["id"]
        place_bid(db, buyer, auction_id, BidCreate(price=2000, accept_terms=True))
        row = db.get(Auction, auction_id)
        row.closes_at = now - timedelta(seconds=1)
        close_auction(db, row)
    yield sessions, auction_id, seller, buyer
    engine.dispose()


@pytest.mark.parametrize("role", ["qc_reviewer", "finance_reviewer"])
@pytest.mark.parametrize("action", ["confirm", "decline"])
@pytest.mark.parametrize("side", ["buyer", "seller"])
def test_noncommercial_members_cannot_sign_or_decline_awards(provisional, role, action, side):
    sessions, auction_id, seller, buyer = provisional
    actor = {**(seller if side == "seller" else buyer), "role": role}
    with sessions() as db, db.begin():
        with pytest.raises(HTTPException) as caught:
            award_decision(db, actor, auction_id, action)
        assert caught.value.status_code == 403
        award = db.scalar(select(AuctionAward).where(AuctionAward.auction_id == auction_id))
        assert award.status == "provisional"
        assert not award.buyer_confirmed and not award.seller_confirmed
        assert db.get(Capacity, "lot-capacity").reserved_g == 100_000


def test_new_membership_link_prevents_provisional_award_confirmation(provisional):
    sessions, auction_id, seller, buyer = provisional
    with sessions() as db, db.begin():
        db.add(Membership(user_id=seller["user_id"], organisation_id=buyer["organisation_id"], role="exporter", permissions=[]))
    with sessions() as db, db.begin():
        with pytest.raises(HTTPException) as caught:
            award_decision(db, seller, auction_id, "confirm")
        assert caught.value.status_code == 403
        award = db.scalar(select(AuctionAward).where(AuctionAward.auction_id == auction_id))
        assert not award.seller_confirmed and not award.buyer_confirmed
        assert db.get(Capacity, "lot-capacity").committed_g == 0
        # Parties may still decline an ineligible provisional award to release it.
        assert award_decision(db, seller, auction_id, "decline")["status"] == "defaulted"
        assert db.get(Capacity, "lot-capacity").reserved_g == 0


def test_valid_parties_commit_shared_hold_once_without_second_reservation(provisional):
    sessions, auction_id, seller, buyer = provisional
    with sessions() as db, db.begin():
        assert award_decision(db, seller, auction_id, "confirm")["status"] == "provisional"
        assert award_decision(db, buyer, auction_id, "confirm")["status"] == "confirmed"
        capacity = db.get(Capacity, "lot-capacity")
        assert (capacity.reserved_g, capacity.committed_g) == (0, 100_000)
        assert db.scalar(select(func.count()).select_from(AuctionAward)) == 1
        assert db.scalar(select(func.count()).select_from(Reservation)) == 0
        assert db.scalar(select(AuctionHold.status)) == "committed"


@pytest.mark.parametrize("environment", ["staging", "production"])
def test_shared_auction_mutations_fail_closed_outside_development(tmp_path, monkeypatch, environment):
    from fastapi.testclient import TestClient
    from server.meraki.app import create_app

    monkeypatch.setenv("MERAKI_ENV", environment)
    monkeypatch.setenv("MERAKI_PASSWORD_AUTH", "1")
    monkeypatch.setenv("MERAKI_DEV_AUTH", "0")
    app = create_app("sqlite:///" + (tmp_path / "production-guard.sqlite3").as_posix(), create_schema=False)
    with TestClient(app) as client:
        # Dependency guards precede credential/body validation; enabling local
        # password accounts cannot enable binding auction writes in production.
        for path in ("/auctions", "/auctions/unknown/bids", "/auctions/unknown/award",
                     "/auctions/unknown/close", "/auctions/unknown/cancel"):
            response = client.post("/api/v1" + path, json={})
            assert response.status_code == 503, (path, response.text)
            assert "disabled outside development" in response.json()["error"]["message"]
        assert client.post("/api/v1/dev/auction-lots", json={}).status_code == 404
    app.state.engine.dispose()
