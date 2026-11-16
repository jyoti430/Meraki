from fastapi import Depends, Header, HTTPException, Query, Request
from sqlalchemy import select
from .models import Auction, AuctionBid, AuctionHold, Capacity
from .auction_schemas import AuctionCreate, BidCreate, AwardDecision
from .auctions import create_auction, place_bid, lock_auction, close_auction, auction_view, award_decision
from .services import as_dict
from .schemas import CapacityCreate


def install_auctions(app, db_session, actor, allowed, commit_idempotent):
    import os

    def auction_write_guard():
        if app.state.environment != "development":
            raise HTTPException(503, "Auction writes are disabled outside development until verified identity, QC and capacity bridges are accepted")

    def transact(request, db, user, key, path, data, operation):
        auction_write_guard()
        # SQLite remains useful for the old local demo, but cannot arbitrate live auctions.
        if db.bind.dialect.name != "postgresql":
            raise HTTPException(503, "Auction transactions require PostgreSQL; configure MERAKI_DATABASE_URL")
        return commit_idempotent(request, db, user, key, {"operation": path, **data}, operation)

    def development_fixture_guard():
        if os.getenv("MERAKI_ENV", "development") != "development":
            raise HTTPException(404, "Development fixtures are disabled")

    @app.post("/api/v1/dev/auction-lots", dependencies=[Depends(development_fixture_guard)], status_code=201)
    def synthetic_lot(body: CapacityCreate, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "capacity:write")
        if user["role"] != "fpo" or body.source_type != "harvested_lot" or not body.source_id.startswith("synthetic-"):
            raise HTTPException(422, "Only explicitly synthetic FPO harvested-lot fixtures can use this endpoint")
        def op():
            from uuid import uuid4
            from .services import audit
            row = Capacity(id=uuid4().hex, organisation_id=user["organisation_id"], reviewed=True, **body.model_dump())
            db.add(row); db.flush()
            audit(db, user, "synthetic.auction_lot_created", "capacity", row.id, after={"synthetic": True})
            return as_dict(row)
        return transact(request, db, user, key, "synthetic.auction_lot", body.model_dump(), op)

    @app.get("/api/v1/auction-capacities")
    def owned_capacity(user=Depends(actor), db=Depends(db_session)):
        allowed(user, "capacity:read")
        from .services import require_capacity_eligible
        rows = db.scalars(select(Capacity).where(Capacity.organisation_id == user["organisation_id"], Capacity.status == "available")).all()
        result = []
        for row in rows:
            if not row.reviewed or row.consent_status != "opted-in" or row.quantity_g <= row.reserved_g + row.committed_g: continue
            if row.source_type == "harvested_lot":
                if os.getenv("MERAKI_ENV", "development") != "development" or not row.source_id.startswith("synthetic-"): continue
            else:
                try: require_capacity_eligible(db, row)
                except HTTPException: continue
            result.append(as_dict(row))
        return {"items": result}

    @app.get("/api/v1/auctions")
    def list_auctions(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:read")
        rows = db.scalars(select(Auction).order_by(Auction.created_at.desc(), Auction.id).offset(offset).limit(limit)).all()
        return {"items": [auction_view(db, row, user) for row in rows]}

    @app.get("/api/v1/auctions/{auction_id}")
    def detail(auction_id: str, user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:read")
        row = db.get(Auction, auction_id)
        if not row: raise HTTPException(404, "Auction not found")
        return auction_view(db, row, user)

    @app.post("/api/v1/auctions", dependencies=[Depends(auction_write_guard)], status_code=201)
    def create(body: AuctionCreate, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:write")
        return transact(request, db, user, key, "auction.create", body.model_dump(mode="json"), lambda: create_auction(db, user, body))

    @app.post("/api/v1/auctions/{auction_id}/bids", dependencies=[Depends(auction_write_guard)], status_code=201)
    def bid(auction_id: str, body: BidCreate, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:write")
        def op():
            row = place_bid(db, user, auction_id, body)
            return {"receipt": as_dict(row), "auction": auction_view(db, db.get(Auction, auction_id), user)}
        return transact(request, db, user, key, "auction.bid:" + auction_id, body.model_dump(mode="json"), op)

    @app.get("/api/v1/auctions/{auction_id}/bids")
    def receipts(auction_id: str, user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:read")
        if not db.get(Auction, auction_id): raise HTTPException(404, "Auction not found")
        # Each bidder sees only their receipts; the market sees anonymous leading prices.
        rows = db.scalars(select(AuctionBid).where(AuctionBid.auction_id == auction_id,
            AuctionBid.organisation_id == user["organisation_id"]).order_by(AuctionBid.sequence)).all()
        return {"items": [as_dict(row) for row in rows]}

    @app.post("/api/v1/auctions/{auction_id}/close", dependencies=[Depends(auction_write_guard)])
    def close(auction_id: str, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:write")
        def op():
            row = lock_auction(db, auction_id)
            close_auction(db, row)
            return auction_view(db, row, user)
        return transact(request, db, user, key, "auction.close:" + auction_id, {}, op)

    @app.post("/api/v1/auctions/{auction_id}/award", dependencies=[Depends(auction_write_guard)])
    def decision(auction_id: str, body: AwardDecision, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:write")
        return transact(request, db, user, key, "auction.award:" + auction_id, body.model_dump(), lambda: award_decision(db, user, auction_id, body.action))

    @app.post("/api/v1/auctions/{auction_id}/cancel", dependencies=[Depends(auction_write_guard)])
    def cancel(auction_id: str, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:write")
        def op():
            from .auctions import holds_and_capacities, finish_hold
            from .services import audit
            row = lock_auction(db, auction_id)
            if row.organisation_id != user["organisation_id"]: raise HTTPException(404, "Owned auction not found")
            if row.status != "open" or row.bid_count: raise HTTPException(409, "Only auctions without bids can be cancelled")
            holds, capacities = holds_and_capacities(db, row)
            for hold in holds: finish_hold(hold, capacities[hold.capacity_id])
            row.status = "cancelled"
            audit(db, user, "auction.cancelled", "auction", row.id)
            return auction_view(db, row, user)
        return transact(request, db, user, key, "auction.cancel:" + auction_id, {}, op)
