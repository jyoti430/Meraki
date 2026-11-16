import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .models import AuditEvent, Capacity, ConsentEvent, IdempotencyRecord, Job, Listing, Projection, Reservation, ReservationEvent


def utcnow():
    return datetime.now(timezone.utc)


def aware(value):
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def as_dict(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def current_consent(db: Session, org_id: str, source_id: str, fallback: str):
    event = db.scalar(select(ConsentEvent).where(ConsentEvent.organisation_id == org_id, ConsentEvent.source_id == source_id).order_by(ConsentEvent.created_at.desc(), ConsentEvent.id.desc()).limit(1))
    return event.status if event else fallback


SOURCE_FIELDS = ("crop", "variety", "grade", "week_start", "week_end")


def projection_budget_used(db: Session, projection: Projection):
    # Withheld rows still consume their declared slice: approving them later
    # must not resurrect a second copy of the same quantity.
    allocated = db.scalar(select(func.coalesce(func.sum(Capacity.quantity_g), 0)).where(
        Capacity.source_type == "projection", Capacity.source_id == projection.id,
        Capacity.organisation_id == projection.organisation_id))
    older_ids = select(Projection.id).where(Projection.organisation_id == projection.organisation_id,
        Projection.source_id == projection.source_id, Projection.id != projection.id)
    committed = db.scalar(select(func.coalesce(func.sum(Capacity.committed_g), 0)).where(
        Capacity.source_type == "projection", Capacity.source_id.in_(older_ids)))
    return allocated + committed


def require_capacity_source(db: Session, capacity: Capacity):
    """The same source rules guard discovery, review, reservation and confirmation."""
    if capacity.source_type == "harvested_lot":
        raise HTTPException(409, "Verified Part 3 QC adapter is not configured; a text reference cannot release stock")
    projection = db.get(Projection, capacity.source_id)
    if not projection or projection.organisation_id != capacity.organisation_id:
        raise HTTPException(409, "Owned source projection not found")
    if any(getattr(capacity, field) != getattr(projection, field) for field in SOURCE_FIELDS):
        raise HTTPException(409, "Capacity product and delivery week disagree with its source projection")
    latest = db.scalar(select(Projection.version).where(Projection.organisation_id == projection.organisation_id,
        Projection.source_id == projection.source_id).order_by(Projection.version.desc()).limit(1))
    if latest != projection.version or projection.status != "current":
        raise HTTPException(409, "Projection has been superseded")
    if projection.stale_after and aware(projection.stale_after) <= utcnow():
        raise HTTPException(409, "Projection has expired")
    if capacity.consent_status != "opted-in" or current_consent(db, capacity.organisation_id, projection.source_id, projection.consent_status) != "opted-in":
        raise HTTPException(409, "Farmer consent does not permit allocation")
    if capacity.quantity_g > projection.quantity_g:
        raise HTTPException(409, "Capacity exceeds its source projection")
    if projection_budget_used(db, projection) > projection.quantity_g:
        raise HTTPException(409, "Source budget is overallocated; reconcile existing capacity and commitments")
    return projection


def require_capacity_eligible(db: Session, capacity: Capacity):
    if capacity.status != "available" or not capacity.reviewed or capacity.consent_status != "opted-in":
        raise HTTPException(409, "Capacity is not available, consented and reviewed")
    return require_capacity_source(db, capacity)


def audit(db: Session, actor: dict, action: str, resource_type: str, resource_id: str, before=None, after=None, correlation_id=None):
    db.add(AuditEvent(id=uuid4().hex, actor_user_id=actor["user_id"], organisation_id=actor["organisation_id"],
        action=action, resource_type=resource_type, resource_id=resource_id, correlation_id=correlation_id,
        transition={"from": before, "to": after} if before is not None or after is not None else {}))


def idempotent(db: Session, actor: dict, key: str, payload: dict, operation):
    if not key or len(key) > 200:
        raise HTTPException(400, "A valid Idempotency-Key (1-200 characters) is required")
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    fingerprint = hashlib.sha256(canonical.encode()).hexdigest()
    prior = db.scalar(select(IdempotencyRecord).where(
        IdempotencyRecord.organisation_id == actor["organisation_id"],
        IdempotencyRecord.actor_user_id == actor["user_id"], IdempotencyRecord.key == key))
    if prior:
        if prior.request_hash != fingerprint:
            raise HTTPException(409, "Idempotency key was reused with a different payload")
        return prior.response
    result = operation()
    db.add(IdempotencyRecord(id=uuid4().hex, organisation_id=actor["organisation_id"], actor_user_id=actor["user_id"],
                             key=key, request_hash=fingerprint, response=result))
    db.flush()
    return result


def eligible_listings(db: Session, organisation_id: str | None = None):
    rows = db.execute(select(Listing, Capacity).join(Capacity, Listing.capacity_id == Capacity.id)
        .where(Listing.status == "active", Listing.visible_to_members.is_(True), Capacity.status == "available")).all()
    result = []
    now = utcnow()
    for listing, capacity in rows:
        if listing.organisation_id == organisation_id:
            continue
        if listing.expires_at and aware(listing.expires_at) <= now:
            continue
        try:
            require_capacity_eligible(db, capacity)
        except HTTPException:
            continue
        if capacity.consent_status != "opted-in" or not capacity.reviewed:
            continue
        if capacity.source_type == "projection":
            projection = db.get(Projection, capacity.source_id)
            if not projection or projection.stale_after and aware(projection.stale_after) <= now:
                continue
            latest = db.scalar(select(Projection.version).where(Projection.organisation_id == projection.organisation_id,
                Projection.source_id == projection.source_id).order_by(Projection.version.desc()).limit(1))
            if latest != projection.version:
                continue
            if current_consent(db, capacity.organisation_id, projection.source_id, projection.consent_status) != "opted-in":
                continue
        available = capacity.quantity_g - capacity.reserved_g - capacity.committed_g
        if available <= 0:
            continue
        result.append({"listing": as_dict(listing), "capacity": as_dict(capacity), "available_g": available})
    return result


def reserve_capacity(db: Session, actor: dict, capacity_id: str, quantity_g: int, expires_at: datetime, correlation_id=None):
    capacity = db.scalar(select(Capacity).where(Capacity.id == capacity_id).with_for_update())
    if capacity is None or capacity.status != "available":
        raise HTTPException(404, "Capacity not found")
    require_capacity_eligible(db, capacity)
    listing = db.scalar(select(Listing).where(Listing.capacity_id == capacity.id, Listing.status == "active",
        Listing.visible_to_members.is_(True)))
    if listing is None or listing.organisation_id == actor["organisation_id"]:
        raise HTTPException(404, "Eligible listing not found")
    if listing.expires_at and aware(listing.expires_at) <= utcnow():
        raise HTTPException(409, "Listing has expired")
    if listing.resource_type != capacity.source_type:
        raise HTTPException(409, "Listing source type does not match capacity")
    if capacity.consent_status != "opted-in" or not capacity.reviewed:
        raise HTTPException(409, "Capacity is not consented and reviewed")
    if capacity.source_type == "projection":
        projection = db.get(Projection, capacity.source_id)
        if not projection or current_consent(db, capacity.organisation_id, projection.source_id, projection.consent_status) != "opted-in":
            raise HTTPException(409, "Projection consent does not allow allocation")
        if projection.stale_after and aware(projection.stale_after) <= utcnow():
            raise HTTPException(409, "Projection has expired")
        latest = db.scalar(select(Projection.version).where(Projection.organisation_id == projection.organisation_id,
            Projection.source_id == projection.source_id).order_by(Projection.version.desc()).limit(1))
        if latest != projection.version:
            raise HTTPException(409, "Projection version has been superseded")
    if expires_at.tzinfo is None or expires_at <= utcnow():
        raise HTTPException(422, "Reservation expiry must be in the future")
    available = capacity.quantity_g - capacity.reserved_g - capacity.committed_g
    if quantity_g > available:
        raise HTTPException(409, "Insufficient available capacity")
    reservation = Reservation(id=uuid4().hex, capacity_id=capacity.id, organisation_id=capacity.organisation_id,
        requester_organisation_id=actor["organisation_id"], quantity_g=quantity_g, status="reserved", expires_at=expires_at)
    capacity.reserved_g += quantity_g
    capacity.version += 1
    db.add(reservation)
    db.flush()
    db.add(Job(id=uuid4().hex, kind="expire_reservation", payload={"reservation_id": reservation.id}, run_at=expires_at))
    db.add(ReservationEvent(id=uuid4().hex, reservation_id=reservation.id, from_status=None, to_status="reserved", actor_user_id=actor["user_id"]))
    audit(db, actor, "reservation.created", "reservation", reservation.id, after={"status": "reserved", "quantity_g": quantity_g}, correlation_id=correlation_id)
    return {"reservation": as_dict(reservation), "capacity_version": capacity.version}


def transition_reservation(db: Session, actor: dict, reservation_id: str, expected_version: int, action: str, correlation_id=None):
    reservation = db.scalar(select(Reservation).where(Reservation.id == reservation_id).with_for_update())
    if not reservation or reservation.requester_organisation_id != actor["organisation_id"]:
        raise HTTPException(404, "Reservation not found")
    if reservation.version != expected_version:
        raise HTTPException(409, "Reservation changed; refresh and retry")
    capacity = db.scalar(select(Capacity).where(Capacity.id == reservation.capacity_id).with_for_update())
    if action == "confirm" and aware(reservation.expires_at) > utcnow():
        require_capacity_eligible(db, capacity)
    target = {"confirm": "committed", "release": "released", "cancel": "cancelled"}[action]
    if reservation.status != "reserved":
        raise HTTPException(409, "Only a reserved allocation can transition")
    if action == "confirm" and aware(reservation.expires_at) <= utcnow():
        capacity.reserved_g -= reservation.quantity_g
        capacity.version += 1
        reservation.status, reservation.version = "expired", reservation.version + 1
        db.add(ReservationEvent(id=uuid4().hex, reservation_id=reservation.id, from_status="reserved", to_status="expired",
            actor_user_id=None, actor_type="system"))
        db.add(AuditEvent(id=uuid4().hex, actor_user_id=None, actor_type="system", organisation_id=reservation.organisation_id,
            action="reservation.expired", resource_type="reservation", resource_id=reservation.id,
            transition={"from": "reserved", "to": "expired"}, correlation_id=correlation_id))
        return as_dict(reservation)
    capacity.reserved_g -= reservation.quantity_g
    if target == "committed":
        capacity.committed_g += reservation.quantity_g
    reservation.status = target
    reservation.version += 1
    capacity.version += 1
    db.add(ReservationEvent(id=uuid4().hex, reservation_id=reservation.id, from_status="reserved", to_status=target, actor_user_id=actor["user_id"]))
    audit(db, actor, "reservation." + target, "reservation", reservation.id, before={"status": "reserved"}, after={"status": target}, correlation_id=correlation_id)
    return as_dict(reservation)
