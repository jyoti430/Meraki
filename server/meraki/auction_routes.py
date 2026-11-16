from fastapi import Depends, Header, HTTPException, Query, Request
from sqlalchemy import select
from .models import Auction, AuctionBid, AuctionHold, Capacity
from .auction_schemas import AuctionCreate, BidCreate, AwardDecision
from .auctions import create_auction, place_bid, lock_auction, close_auction, auction_view, award_decision
from .services import as_dict


def install_auctions(app, db_session, actor, allowed, commit_idempotent):
    def transact(request, db, user, key, path, data, operation):
        # SQLite remains useful for the old local demo, but cannot arbitrate live auctions.
        if db.bind.dialect.name != "postgresql":
            raise HTTPException(503, "Auction transactions require PostgreSQL; configure MERAKI_DATABASE_URL")
        return commit_idempotent(request, db, user, key, {"operation": path, **data}, operation)

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

    @app.post("/api/v1/auctions", status_code=201)
    def create(body: AuctionCreate, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:write")
        return transact(request, db, user, key, "auction.create", body.model_dump(mode="json"), lambda: create_auction(db, user, body))

    @app.post("/api/v1/auctions/{auction_id}/bids", status_code=201)
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

    @app.post("/api/v1/auctions/{auction_id}/close")
    def close(auction_id: str, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:write")
        def op():
            row = lock_auction(db, auction_id)
            close_auction(db, row)
            return auction_view(db, row, user)
        return transact(request, db, user, key, "auction.close:" + auction_id, {}, op)

    @app.post("/api/v1/auctions/{auction_id}/award")
    def decision(auction_id: str, body: AwardDecision, request: Request, key: str = Header(..., alias="Idempotency-Key"), user=Depends(actor), db=Depends(db_session)):
        allowed(user, "auction:write")
        return transact(request, db, user, key, "auction.award:" + auction_id, body.model_dump(), lambda: award_decision(db, user, auction_id, body.action))

    @app.post("/api/v1/auctions/{auction_id}/cancel")
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
