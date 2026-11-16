"""Database-backed retryable worker. Run with `python -m server.meraki.worker`."""
import argparse
import time
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from .database import make_engine
from .models import AuditEvent, Capacity, Job, Listing, Reservation, ReservationEvent
from .services import aware, utcnow
from uuid import uuid4


def run_once(sessions):
    from .auctions import tick_auction
    if tick_auction(sessions): return True
    db = sessions()
    try:
        now = utcnow()
        with db.begin():
            # A process that died while holding a job leaves a recoverable lease.
            stuck = db.scalars(select(Job).where(Job.status == "running", Job.locked_at < now - timedelta(minutes=5))).all()
            for job in stuck:
                job.status, job.locked_at = "pending", None
            query = select(Job).where(Job.status == "pending", Job.run_at <= now).order_by(Job.run_at, Job.id).limit(1)
            if db.bind.dialect.name == "postgresql":
                query = query.with_for_update(skip_locked=True)
            job = db.scalar(query)
            if not job:
                return False
            job.status, job.locked_at = "running", now
            job.attempts += 1
            job_id, kind, payload, max_attempts = job.id, job.kind, dict(job.payload), job.max_attempts

        try:
            with db.begin():
                job = db.get(Job, job_id)
                if kind == "expire_reservation":
                    reservation = db.scalar(select(Reservation).where(Reservation.id == payload["reservation_id"]).with_for_update())
                    if reservation and reservation.status == "reserved" and aware(reservation.expires_at) <= utcnow():
                        capacity = db.scalar(select(Capacity).where(Capacity.id == reservation.capacity_id).with_for_update())
                        capacity.reserved_g -= reservation.quantity_g
                        capacity.version += 1
                        old = reservation.status
                        reservation.status, reservation.version = "expired", reservation.version + 1
                        db.add(ReservationEvent(id=uuid4().hex, reservation_id=reservation.id, from_status=old,
                            to_status="expired", actor_user_id=None, actor_type="system"))
                        db.add(AuditEvent(id=uuid4().hex, actor_user_id=None, actor_type="system", organisation_id=reservation.organisation_id,
                            action="reservation.expired", resource_type="reservation", resource_id=reservation.id,
                            transition={"from": old, "to": "expired"}))
                elif kind == "expire_listing":
                    listing = db.scalar(select(Listing).where(Listing.id == payload["listing_id"]).with_for_update())
                    if listing and listing.status == "active" and listing.expires_at and aware(listing.expires_at) <= utcnow():
                        listing.status = "expired"
                        db.add(AuditEvent(id=uuid4().hex, actor_user_id=None, actor_type="system", organisation_id=listing.organisation_id,
                            action="listing.expired", resource_type="listing", resource_id=listing.id,
                            transition={"from": "active", "to": "expired"}))
                else:
                    raise ValueError(f"Unsupported job kind: {kind}")
                job.status, job.finished_at, job.locked_at, job.last_error = "completed", utcnow(), None, None
            return True
        except Exception as exc:
            db.rollback()
            with db.begin():
                job = db.get(Job, job_id)
                job.last_error = str(exc)[:2000]
                job.locked_at = None
                if job.attempts >= max_attempts:
                    job.status, job.finished_at = "failed", utcnow()
                else:
                    job.status = "pending"
                    job.run_at = utcnow() + timedelta(seconds=min(300, 2 ** job.attempts))
            return True
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()
    if args.interval < 0.1:
        parser.error("--interval must be at least 0.1 seconds")
    engine = make_engine()
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        while True:
            worked = run_once(sessions)
            if args.once: return
            if not worked: time.sleep(args.interval)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
