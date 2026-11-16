"""Whole-lot auctions. All commands run inside the caller's database transaction.

Lock order: auction -> holds -> capacity (sorted by ID). The capacity lock is
shared with the existing reservation ledger; browser state never owns stock.
"""
import os
from datetime import timedelta
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import select
from .models import (Auction, AuctionBid, AuctionHold, AuctionAward, Capacity,
                     Membership, Projection, AuditEvent)
from .services import aware, utcnow, current_consent, audit


def lock_auction(db, auction_id):
    row = db.scalar(select(Auction).where(Auction.id == auction_id).with_for_update())
    if not row:
        raise HTTPException(404, "Auction not found")
    return row


def related(db, first, second):
    # Common active members link organisations; an organisation cannot bid on itself.
    members = select(Membership.user_id).where(Membership.organisation_id == first, Membership.status == "active")
    return first == second or db.scalar(select(Membership.id).where(Membership.organisation_id == second,
        Membership.status == "active", Membership.user_id.in_(members)).limit(1)) is not None


def capacity_matches(db, capacity, auction, source_type):
    if not capacity or capacity.source_type != source_type or not capacity.reviewed or capacity.consent_status != "opted-in" or capacity.status != "available":
        raise HTTPException(409, "Capacity must be available, reviewed and consented")
    if (capacity.crop.casefold(), capacity.variety.casefold(), capacity.grade.casefold()) != (auction.crop.casefold(), auction.variety.casefold(), auction.grade.casefold()):
        raise HTTPException(409, "Crop, variety or grade does not match")
    if capacity.week_start > auction.week_start or capacity.week_end < auction.week_end:
        raise HTTPException(409, "Capacity does not cover the delivery window")
    if source_type == "harvested_lot":
        if (os.getenv("MERAKI_ENV", "development") != "development" or auction.terms["evidence_status"] != "synthetic"
                or not capacity.source_id.startswith("synthetic-")):
            raise HTTPException(409, "Real harvested-lot trading requires the verified QC bridge; only explicit development fixtures are enabled")
    else:
        from .services import require_capacity_eligible
        require_capacity_eligible(db, capacity)
    if source_type == "harvested_lot" and capacity.quantity_g != auction.quantity_g:
        raise HTTPException(409, "Spot auctions must offer the entire harvested lot")
    if source_type == "projection":
        p = db.get(Projection, capacity.source_id)
        if not p or p.organisation_id != capacity.organisation_id or p.stale_after is None or aware(p.stale_after) <= utcnow():
            raise HTTPException(409, "A current dated projection is required")
        latest = db.scalar(select(Projection.version).where(Projection.organisation_id == p.organisation_id,
            Projection.source_id == p.source_id).order_by(Projection.version.desc()).limit(1))
        if latest != p.version or current_consent(db, p.organisation_id, p.source_id, p.consent_status) != "opted-in":
            raise HTTPException(409, "Projection is superseded or consent withdrawn")


def hold_capacity(db, auction, organisation_id, capacity_id, source_type):
    hold = db.scalar(select(AuctionHold).where(AuctionHold.auction_id == auction.id,
        AuctionHold.organisation_id == organisation_id))
    if hold and hold.capacity_id != capacity_id:
        raise HTTPException(409, "A bid cannot switch its reserved capacity")
    capacity = db.scalar(select(Capacity).where(Capacity.id == capacity_id,
        Capacity.organisation_id == organisation_id).with_for_update())
    capacity_matches(db, capacity, auction, source_type)
    if hold:
        if hold.status != "held": raise HTTPException(409, "Capacity hold is no longer active")
        return hold
    if capacity.quantity_g - capacity.reserved_g - capacity.committed_g < auction.quantity_g:
        raise HTTPException(409, "Insufficient unallocated capacity for a whole-lot offer")
    capacity.reserved_g += auction.quantity_g
    capacity.version += 1
    hold = AuctionHold(id=uuid4().hex, auction_id=auction.id, organisation_id=organisation_id,
        capacity_id=capacity.id, quantity_g=auction.quantity_g, status="held")
    db.add(hold)
    db.flush()
    return hold


def create_auction(db, actor, body):
    expected_role = "fpo" if body.mode == "spot" else "exporter"
    if actor["role"] != expected_role:
        raise HTTPException(403, f"Only {expected_role} organisations can create this auction mode")
    now = utcnow()
    if body.opens_at < now - timedelta(seconds=30) or body.closes_at <= max(now, body.opens_at):
        raise HTTPException(422, "Opening and closing must form a future server schedule")
    if body.closes_at - body.opens_at > timedelta(days=30):
        raise HTTPException(422, "Auction window cannot exceed 30 days")
    if body.mode == "forward" and not body.eligible_org_ids:
        raise HTTPException(422, "Forward procurement requires prequalified organisation IDs")
    data = body.model_dump(exclude={"capacity_id", "currency"})
    data["week_start"], data["week_end"] = body.week_start.isoformat(), body.week_end.isoformat()
    data["terms"] = body.terms.model_dump()
    row = Auction(id=uuid4().hex, organisation_id=actor["organisation_id"], created_by=actor["user_id"],
        original_closes_at=body.closes_at, status="open", **data)
    db.add(row); db.flush()
    if body.mode == "spot":
        if not body.capacity_id: raise HTTPException(422, "Harvested-lot capacity is required")
        hold_capacity(db, row, actor["organisation_id"], body.capacity_id, "harvested_lot")
    elif body.capacity_id:
        raise HTTPException(422, "The supplier attaches capacity when bidding")
    audit(db, actor, "auction.created", "auction", row.id, after={"mode": row.mode, "rule_version": row.rule_version})
    return auction_view(db, row, actor)


def place_bid(db, actor, auction_id, body):
    auction = lock_auction(db, auction_id)
    now = utcnow()  # Take time AFTER waiting for the lock.
    if auction.status != "open" or now < aware(auction.opens_at) or now >= aware(auction.closes_at):
        raise HTTPException(409, "Bidding is outside the server's open window; refresh")
    if related(db, auction.organisation_id, actor["organisation_id"]):
        raise HTTPException(403, "Self-bids and organisations with shared members cannot bid")
    if actor["role"] != ("exporter" if auction.mode == "spot" else "fpo"):
        raise HTTPException(403, "Organisation role cannot bid in this auction mode")
    if auction.eligible_org_ids and actor["organisation_id"] not in auction.eligible_org_ids:
        raise HTTPException(403, "Organisation is not prequalified for this auction")
    previous = db.scalar(select(AuctionBid).where(AuctionBid.auction_id == auction.id)
        .order_by(AuctionBid.sequence.desc()).limit(1))
    limit = auction.limit_price if previous is None else previous.price + (auction.increment if auction.mode == "spot" else -auction.increment)
    if (auction.mode == "spot" and body.price < limit) or (auction.mode == "forward" and body.price > limit):
        raise HTTPException(409, f"Offer must be {'at least' if auction.mode == 'spot' else 'at most'} {limit} paise/kg")
    if auction.mode == "forward":
        if not body.capacity_id: raise HTTPException(422, "A reviewed projection capacity is required")
        hold_capacity(db, auction, actor["organisation_id"], body.capacity_id, "projection")
    else:
        if body.capacity_id: raise HTTPException(422, "Buyers do not supply capacity for a spot auction")
        hold = db.scalar(select(AuctionHold).where(AuctionHold.auction_id == auction.id))
        capacity = db.scalar(select(Capacity).where(Capacity.id == hold.capacity_id).with_for_update())
        capacity_matches(db, capacity, auction, "harvested_lot")
    auction.bid_count += 1
    bid = AuctionBid(id=uuid4().hex, auction_id=auction.id, organisation_id=actor["organisation_id"],
        user_id=actor["user_id"], capacity_id=body.capacity_id, price=body.price,
        sequence=auction.bid_count, accepted_at=now)
    db.add(bid); db.flush()
    cap = aware(auction.original_closes_at) + timedelta(seconds=auction.extension_cap_s)
    if (aware(auction.closes_at) - now).total_seconds() <= auction.extension_window_s:
        auction.closes_at = min(cap, aware(auction.closes_at) + timedelta(seconds=auction.extension_s))
    audit(db, actor, "auction.bid_accepted", "auction", auction.id, after={"bid_id": bid.id, "price": bid.price, "sequence": bid.sequence})
    return bid


def holds_and_capacities(db, auction):
    holds = db.scalars(select(AuctionHold).where(AuctionHold.auction_id == auction.id).order_by(AuctionHold.capacity_id)).all()
    capacities = {c.id: c for c in db.scalars(select(Capacity).where(Capacity.id.in_([h.capacity_id for h in holds]))
        .order_by(Capacity.id).with_for_update()).all()}
    return holds, capacities


def finish_hold(hold, capacity, commit=False):
    if hold.status != "held": return
    capacity.reserved_g -= hold.quantity_g
    if commit: capacity.committed_g += hold.quantity_g
    capacity.version += 1
    hold.status = "committed" if commit else "released"


def system_event(db, auction, action, detail):
    db.add(AuditEvent(id=uuid4().hex, actor_type="system", actor_user_id=None,
        organisation_id=auction.organisation_id, action=action, resource_type="auction", resource_id=auction.id, transition=detail))


def close_auction(db, auction):
    if auction.status != "open" or aware(auction.closes_at) > utcnow(): return
    holds, capacities = holds_and_capacities(db, auction)
    bids = db.scalars(select(AuctionBid).where(AuctionBid.auction_id == auction.id).order_by(
        AuctionBid.price.desc() if auction.mode == "spot" else AuctionBid.price.asc(), AuctionBid.sequence)).all()
    winner, winner_hold = None, None
    for bid in bids:
        hold = next((h for h in holds if h.organisation_id == (auction.organisation_id if auction.mode == "spot" else bid.organisation_id)), None)
        try:
            if related(db, auction.organisation_id, bid.organisation_id): continue
            if not hold or hold.status != "held": continue
            capacity_matches(db, capacities.get(hold.capacity_id), auction, "harvested_lot" if auction.mode == "spot" else "projection")
            winner, winner_hold = bid, hold
            break
        except HTTPException:
            continue
    for hold in holds:
        if hold != winner_hold: finish_hold(hold, capacities[hold.capacity_id])
    if winner:
        buyer = winner.organisation_id if auction.mode == "spot" else auction.organisation_id
        seller = auction.organisation_id if auction.mode == "spot" else winner.organisation_id
        db.add(AuctionAward(id=uuid4().hex, auction_id=auction.id, bid_id=winner.id, buyer_org_id=buyer,
            seller_org_id=seller, status="provisional", buyer_confirmed=False, seller_confirmed=False,
            expires_at=utcnow() + timedelta(hours=auction.confirmation_hours)))
        auction.status = "provisional"
    else:
        auction.status = "unsold"
    system_event(db, auction, "auction.closed", {"status": auction.status, "bid_id": winner.id if winner else None})
    db.flush()


def award_decision(db, actor, auction_id, action):
    auction = lock_auction(db, auction_id)
    award = db.scalar(select(AuctionAward).where(AuctionAward.auction_id == auction.id))
    if not award or actor["organisation_id"] not in (award.buyer_org_id, award.seller_org_id):
        raise HTTPException(404, "Award not found for this organisation")
    if award.status != "provisional" or aware(award.expires_at) <= utcnow():
        raise HTTPException(409, "Award is no longer awaiting confirmation; refresh")
    holds, capacities = holds_and_capacities(db, auction)
    hold = next(h for h in holds if h.status == "held")
    if action == "confirm":
        capacity_matches(db, capacities[hold.capacity_id], auction, "harvested_lot" if auction.mode == "spot" else "projection")
    if action == "decline":
        finish_hold(hold, capacities[hold.capacity_id])
        award.status = auction.status = "defaulted"
    else:
        if actor["organisation_id"] == award.buyer_org_id: award.buyer_confirmed = True
        else: award.seller_confirmed = True
        if award.buyer_confirmed and award.seller_confirmed:
            finish_hold(hold, capacities[hold.capacity_id], commit=True)
            award.status = auction.status = "confirmed"
    audit(db, actor, "auction.award_" + action, "auction", auction.id, after={"status": award.status})
    db.flush()
    return auction_view(db, auction, actor)


def tick_auction(sessions):
    """One due transition per tick; multiple workers skip already locked rows."""
    with sessions() as db, db.begin():
        now = utcnow()
        query = select(Auction).where(Auction.status == "open", Auction.closes_at <= now).order_by(Auction.closes_at).limit(1)
        if db.bind.dialect.name == "postgresql": query = query.with_for_update(skip_locked=True)
        auction = db.scalar(query)
        if auction:
            close_auction(db, auction)
            return True
        query = select(Auction).join(AuctionAward).where(Auction.status == "provisional", AuctionAward.expires_at <= now).limit(1)
        if db.bind.dialect.name == "postgresql": query = query.with_for_update(of=Auction, skip_locked=True)
        auction = db.scalar(query)
        if not auction: return False
        award = db.scalar(select(AuctionAward).where(AuctionAward.auction_id == auction.id))
        holds, capacities = holds_and_capacities(db, auction)
        for hold in holds: finish_hold(hold, capacities[hold.capacity_id])
        award.status = auction.status = "defaulted"
        system_event(db, auction, "auction.confirmation_expired", {"status": "defaulted"})
        return True


def auction_view(db, row, actor):
    bid = db.scalar(select(AuctionBid).where(AuctionBid.auction_id == row.id).order_by(AuctionBid.sequence.desc()).limit(1))
    award = db.scalar(select(AuctionAward).where(AuctionAward.auction_id == row.id))
    result = {k: getattr(row, k) for k in ("id", "mode", "status", "title", "crop", "variety", "grade", "week_start", "week_end",
        "quantity_g", "limit_price", "increment", "opens_at", "closes_at", "original_closes_at", "extension_window_s", "extension_s",
        "extension_cap_s", "confirmation_hours", "terms", "rule_version", "bid_count")}
    own_hold = db.scalar(select(AuctionHold).where(AuctionHold.auction_id == row.id,
        AuctionHold.organisation_id == actor["organisation_id"], AuctionHold.status == "held"))
    result["own_capacity_id"] = own_hold.capacity_id if own_hold else None
    result.update(server_time=utcnow(), is_owner=row.organisation_id == actor["organisation_id"],
        eligible=not row.eligible_org_ids or actor["organisation_id"] in row.eligible_org_ids,
        leading_price=bid.price if bid else None, award=None)
    if award and actor["organisation_id"] in (award.buyer_org_id, award.seller_org_id):
        result["award"] = {"id": award.id, "status": award.status, "buyer_confirmed": award.buyer_confirmed,
            "seller_confirmed": award.seller_confirmed, "expires_at": award.expires_at,
            "your_side": "buyer" if actor["organisation_id"] == award.buyer_org_id else "seller"}
    return result
