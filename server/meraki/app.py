import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker
from .auth import DevelopmentSessionIdentityProvider
from .database import make_engine
from .models import AuditEvent, Capacity, ConsentEvent, Document, Job, Listing, Membership, Organization, Projection, Reservation, ReservationEvent, SessionToken, User
from .schemas import (CapacityCreate, CapacityResponse, CapacityReview, CapacityReviewResult, ConsentResult, ConsentUpdate,
    DevSessionRequest, DocumentResponse, ItemPage, JobCreate, JobResponse, ListingCreate, ListingResponse,
    ProjectionPublish, ProjectionResult, ProjectionResponse, ReservationCreate, ReservationResponse, ReservationResult,
    ReservationTransition)
from .services import as_dict, audit, current_consent, eligible_listings, idempotent, reserve_capacity, transition_reservation, utcnow, aware, SOURCE_FIELDS, require_capacity_source, require_capacity_eligible, projection_budget_used
from .storage import LocalStorage


def create_app(database_url=None, storage=None, create_schema=None, identity_provider=None):
    environment = os.getenv("MERAKI_ENV", "development").lower()
    engine = make_engine(database_url)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    storage = storage or LocalStorage()
    app = FastAPI(title="Meraki Shared Backend", version="v1", description="Shared organisation-scoped services for Meraki Parts 1 and 3.")
    from fastapi.middleware.cors import CORSMiddleware
    origins = [value.strip() for value in os.getenv("MERAKI_CORS_ORIGINS", "").split(",") if value.strip()]
    if origins:
        if "*" in origins: raise RuntimeError("CORS origins must be explicit")
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type", "X-Organisation-ID", "Idempotency-Key", "X-Request-ID"],
            expose_headers=["X-Request-ID"])
    app.state.engine = engine
    app.state.environment = environment
    app.state.sessions = sessions
    app.state.storage = storage
    password_auth_enabled = identity_provider is None and os.getenv("MERAKI_PASSWORD_AUTH") == "1"
    development_auth_enabled = (identity_provider is None and not password_auth_enabled
                                and environment == "development" and os.getenv("MERAKI_DEV_AUTH") == "1")
    app.state.identity_provider = identity_provider if identity_provider is not None else (
        DevelopmentSessionIdentityProvider() if development_auth_enabled else None)
    if password_auth_enabled:
        from .accounts import PasswordSessionIdentityProvider
        app.state.identity_provider = PasswordSessionIdentityProvider()
    if create_schema is None:
        create_schema = environment != "production" and os.getenv("MERAKI_AUTO_CREATE_SCHEMA", "0") == "1"
    if environment == "production" and create_schema:
        raise RuntimeError("Automatic schema creation is disabled in production; run Alembic")
    if create_schema:
        from .models import Base
        @app.on_event("startup")
        def initialize_development_schema():
            Base.metadata.create_all(engine)

    @app.middleware("http")
    async def correlation(request, call_next):
        request.state.correlation_id = request.headers.get("X-Request-ID", str(uuid4()))[:120]
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.correlation_id
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.status_code, "message": exc.detail,
            "request_id": getattr(request.state, "correlation_id", None)}})

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"error": {"code": 422, "message": "Request validation failed",
            "details": jsonable_encoder(exc.errors()), "request_id": getattr(request.state, "correlation_id", None)}})

    def db_session():
        db = sessions()
        try:
            yield db
        finally:
            db.close()

    def actor(request: Request, db: Session = Depends(db_session)):
        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Bearer authentication required")
        raw = authorization[7:]
        provider = app.state.identity_provider
        if provider is None:
            raise HTTPException(503, "Production identity provider is not configured")
        user_id = provider.authenticate(raw, db)
        user = db.get(User, user_id)
        org_id = request.headers.get("X-Organisation-ID")
        membership = db.scalar(select(Membership).where(Membership.user_id == user.id,
            Membership.organisation_id == org_id, Membership.status == "active")) if user and org_id else None
        organisation = db.get(Organization, org_id) if org_id else None
        if not user or user.status != "active" or not membership or not organisation or organisation.status != "active":
            raise HTTPException(403, "Active organisation membership required")
        return {"user_id": user.id, "organisation_id": org_id, "role": membership.role,
                "permissions": set(membership.permissions or [])}

    def allowed(user: dict, permission: str):
        if permission not in user["permissions"] and "*" not in user["permissions"]:
            raise HTTPException(403, f"Permission required: {permission}")

    def development_sessions_enabled():
        # Run before FastAPI validates the route body so production consistently
        # hides this development-only endpoint, even for an empty payload.
        if not development_auth_enabled:
            raise HTTPException(404, "Development authentication is disabled")

    def commit_idempotent(request, db, user, key, body, operation):
        # Authentication performs a read using this request-scoped session.
        # End that read transaction before opening the atomic mutation.
        if db.in_transaction():
            db.rollback()
        try:
            with db.begin():
                result = idempotent(db, user, key, {"operation": request.url.path, "payload": body}, lambda: jsonable_encoder(operation()))
            return result
        except IntegrityError:
            db.rollback()
            with db.begin():
                return idempotent(db, user, key, {"operation": request.url.path, "payload": body}, lambda: (_ for _ in ()).throw(HTTPException(409, "Concurrent idempotency conflict; retry the request")))

    @app.get("/api/v1/health")
    def health(db: Session = Depends(db_session)):
        try:
            db.execute(text("SELECT 1 FROM organisations LIMIT 1"))
        except SQLAlchemyError:
            raise HTTPException(503, "Database is unavailable or the shared schema is not migrated")
        return {"status": "ok", "database": "ok", "environment": environment,
                "identity_provider": "unconfigured" if app.state.identity_provider is None else "configured",
                "development_auth_enabled": development_auth_enabled,
                "password_auth_enabled": password_auth_enabled,
                "mobile_auth_enabled": password_auth_enabled,
                "registration_enabled": (password_auth_enabled and os.getenv("MERAKI_ALLOW_REGISTRATION", "1" if environment == "development" else "0") == "1"),
                "auction_mutations_enabled": environment == "development" and engine.dialect.name == "postgresql",
                "production_ready": False}

    @app.post("/api/v1/dev/sessions", dependencies=[Depends(development_sessions_enabled)])
    def dev_session(body: DevSessionRequest, db: Session = Depends(db_session)):
        token = secrets.token_urlsafe(40)
        with db.begin():
            user = db.get(User, body.user_id)
            if not user:
                user = User(id=body.user_id, email=body.email, display_name=body.display_name, identity_provider="local-development", external_subject=body.user_id)
                db.add(user)
            org = db.get(Organization, body.organisation_id)
            if not org:
                db.add(Organization(id=body.organisation_id, name=body.organisation_name))
            # These tables are linked by foreign keys but intentionally have no
            # ORM relationships. Persist parent rows before membership/session.
            db.flush()
            membership = db.scalar(select(Membership).where(Membership.user_id == body.user_id, Membership.organisation_id == body.organisation_id))
            if not membership:
                db.add(Membership(user_id=body.user_id, organisation_id=body.organisation_id, role=body.role, permissions=body.permissions))
            else:
                membership.role, membership.permissions, membership.status = body.role, body.permissions, "active"
            db.flush()
            db.add(SessionToken(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=body.user_id,
                                expires_at=utcnow() + timedelta(hours=8)))
        return {"access_token": token, "token_type": "bearer", "expires_in": 28800, "synthetic": True}

    @app.post("/api/v1/projections", status_code=201, response_model=ProjectionResult)
    def publish_projection(body: ProjectionPublish, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key"),
                           user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "projection:write")
        data = body.model_dump(mode="json")
        def op():
            prior = db.scalar(select(Projection).where(Projection.organisation_id == user["organisation_id"], Projection.source_id == body.source_id)
                              .order_by(Projection.version.desc()).limit(1))
            expected = (prior.version + 1) if prior else 1
            if body.version != expected:
                raise HTTPException(409, f"Expected projection version {expected}")
            row = Projection(id=uuid4().hex, organisation_id=user["organisation_id"], created_by=user["user_id"], **body.model_dump())
            db.add(row); db.flush()
            old_projections = db.scalars(select(Projection).where(Projection.organisation_id == user["organisation_id"],
                Projection.source_id == body.source_id, Projection.id != row.id)).all()
            affected_ids = [p.id for p in old_projections]
            for old_projection in old_projections:
                old_projection.status = "superseded"
            released, committed = [], []
            for old_capacity in db.scalars(select(Capacity).where(Capacity.source_type == "projection", Capacity.source_id.in_(affected_ids))).all() if affected_ids else []:
                old_capacity.status = "superseded"
                old_capacity.version += 1
                for old_listing in db.scalars(select(Listing).where(Listing.capacity_id == old_capacity.id, Listing.status == "active")).all():
                    old_listing.status = "superseded"
                for reservation in db.scalars(select(Reservation).where(Reservation.capacity_id == old_capacity.id,
                        Reservation.status.in_(["reserved", "committed"])).with_for_update()).all():
                    if reservation.status == "committed":
                        committed.append(reservation.id)
                        continue
                    old_capacity.reserved_g -= reservation.quantity_g
                    reservation.status, reservation.version = "released", reservation.version + 1
                    db.add(ReservationEvent(id=uuid4().hex, reservation_id=reservation.id, from_status="reserved",
                        to_status="released", actor_user_id=user["user_id"]))
                    released.append(reservation.id)
            if body.version == 1 or body.consent_status != (prior.consent_status if prior else None):
                db.add(ConsentEvent(id=uuid4().hex, organisation_id=user["organisation_id"], source_id=body.source_id,
                    status=body.consent_status, recorded_at=body.consent_recorded_at or body.as_of, actor_user_id=user["user_id"]))
            audit(db, user, "projection.published", "projection", row.id, after={"version": row.version, "status": row.status,
                "released_superseded_reservations": released, "committed_reservations_for_review": committed}, correlation_id=request.state.correlation_id)
            return {"projection": as_dict(row), "released_superseded_reservations": released,
                    "committed_reservations_for_review": committed}
        return commit_idempotent(request, db, user, idempotency_key, data, op)

    @app.get("/api/v1/projections", response_model=ItemPage)
    def projections(limit: int = 100, offset: int = 0, user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "projection:read")
        rows = db.scalars(select(Projection).where(Projection.organisation_id == user["organisation_id"])
                          .order_by(Projection.source_id, Projection.version.desc()).offset(offset).limit(min(max(limit, 1), 200))).all()
        return {"items": [as_dict(row) for row in rows], "limit": min(max(limit, 1), 200), "offset": offset}

    @app.get("/api/v1/projections/{source_id}/history", response_model=ItemPage)
    def projection_history(source_id: str, user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "projection:read")
        rows = db.scalars(select(Projection).where(Projection.organisation_id == user["organisation_id"], Projection.source_id == source_id)
                          .order_by(Projection.version.desc())).all()
        return {"items": [as_dict(row) for row in rows]}

    @app.post("/api/v1/projections/{source_id}/consent", status_code=201, response_model=ConsentResult)
    def update_consent(source_id: str, body: ConsentUpdate, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key"),
                       user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "projection:write")
        status = body.status
        data = {"source_id": source_id, "status": status, "note": body.note}
        def op():
            exists = db.scalar(select(Projection.id).where(Projection.organisation_id == user["organisation_id"], Projection.source_id == source_id).limit(1))
            if not exists:
                raise HTTPException(404, "Projection source not found")
            event = ConsentEvent(id=uuid4().hex, organisation_id=user["organisation_id"], source_id=source_id,
                status=status, recorded_at=utcnow(), actor_user_id=user["user_id"], note=data["note"])
            db.add(event)
            released, committed = [], []
            if status != "opted-in":
                projection_ids = db.scalars(select(Projection.id).where(Projection.organisation_id == user["organisation_id"], Projection.source_id == source_id)).all()
                capacities = db.scalars(select(Capacity).where(Capacity.source_type == "projection", Capacity.source_id.in_(projection_ids))).all() if projection_ids else []
                for capacity in capacities:
                    for listing in db.scalars(select(Listing).where(Listing.capacity_id == capacity.id, Listing.status == "active")).all():
                        listing.status = "withdrawn"
                    capacity.status = "withdrawn"
                    for reservation in db.scalars(select(Reservation).where(Reservation.capacity_id == capacity.id,
                            Reservation.status.in_(["reserved", "committed"])).with_for_update()).all():
                        if reservation.status == "committed":
                            committed.append(reservation.id)
                            continue
                        capacity.reserved_g -= reservation.quantity_g
                        capacity.version += 1
                        reservation.status, reservation.version = "released", reservation.version + 1
                        db.add(ReservationEvent(id=uuid4().hex, reservation_id=reservation.id, from_status="reserved",
                            to_status="released", actor_user_id=user["user_id"]))
                        released.append(reservation.id)
            audit(db, user, "projection.consent_updated", "projection", source_id, after={"consent_status": status,
                "released_reservations": released, "committed_reservations_for_review": committed}, correlation_id=request.state.correlation_id)
            db.flush(); return {"consent_event": as_dict(event), "released_reservations": released,
                                "committed_reservations_for_review": committed}
        return commit_idempotent(request, db, user, idempotency_key, data, op)

    @app.post("/api/v1/capacities", status_code=201, response_model=CapacityResponse)
    def create_capacity(body: CapacityCreate, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key"),
                        user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "capacity:write")
        data = body.model_dump(mode="json")
        def op():
            if body.source_type == "projection":
                projection = db.scalar(select(Projection).where(Projection.id == body.source_id, Projection.organisation_id == user["organisation_id"]).with_for_update())
                if not projection or body.quantity_g > projection.quantity_g:
                    raise HTTPException(422, "Capacity must reference an owned projection and not exceed its quantity")
                if any(getattr(body, field) != getattr(projection, field) for field in SOURCE_FIELDS):
                    raise HTTPException(422, "Capacity crop, variety, grade and week must match the source projection")
                if projection_budget_used(db, projection) + body.quantity_g > projection.quantity_g:
                    raise HTTPException(409, "Source quantity is already allocated or committed in an earlier version; review existing commitments")
                latest = db.scalar(select(Projection.version).where(Projection.organisation_id == projection.organisation_id,
                    Projection.source_id == projection.source_id).order_by(Projection.version.desc()).limit(1))
                if latest != projection.version or projection.stale_after and aware(projection.stale_after) <= utcnow():
                    raise HTTPException(409, "Capacity must reference the current, unexpired projection")
                if body.consent_status != "opted-in" or current_consent(db, user["organisation_id"], projection.source_id, projection.consent_status) != "opted-in":
                    raise HTTPException(409, "Farmer consent does not permit capacity publication")
            row = Capacity(id=uuid4().hex, organisation_id=user["organisation_id"], reviewed=False, **body.model_dump())
            db.add(row); db.flush()
            audit(db, user, "capacity.created", "capacity", row.id, after={"quantity_g": row.quantity_g}, correlation_id=request.state.correlation_id)
            return as_dict(row)
        return commit_idempotent(request, db, user, idempotency_key, data, op)

    @app.get("/api/v1/capacities/available", response_model=ItemPage)
    def available_capacity(user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "capacity:read")
        rows = db.scalars(select(Capacity).where(Capacity.organisation_id == user["organisation_id"], Capacity.status == "available")).all()
        result = []
        for row in rows:
            try:
                require_capacity_eligible(db, row)
            except HTTPException:
                continue
            if row.source_type == "projection":
                projection = db.get(Projection, row.source_id)
                latest = db.scalar(select(Projection.version).where(Projection.organisation_id == row.organisation_id,
                    Projection.source_id == (projection.source_id if projection else "")).order_by(Projection.version.desc()).limit(1))
                if not projection or latest != projection.version or current_consent(db, row.organisation_id, projection.source_id, projection.consent_status) != "opted-in":
                    continue
                if projection.stale_after and aware(projection.stale_after) <= utcnow():
                    continue
            available = row.quantity_g - row.reserved_g - row.committed_g
            if row.reviewed and available > 0:
                result.append({**as_dict(row), "available_g": available})
        return {"items": result}

    @app.post("/api/v1/capacities/{capacity_id}/review", response_model=CapacityReviewResult)
    def review_capacity(capacity_id: str, body: CapacityReview, request: Request,
                        idempotency_key: str = Header(..., alias="Idempotency-Key"), user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "capacity:review")
        data = body.model_dump(mode="json")
        def op():
            capacity = db.scalar(select(Capacity).where(Capacity.id == capacity_id, Capacity.organisation_id == user["organisation_id"]).with_for_update())
            if not capacity: raise HTTPException(404, "Capacity not found")
            released, committed = [], []
            if body.decision == "approve":
                require_capacity_source(db, capacity)
                if capacity.consent_status != "opted-in": raise HTTPException(409, "Consent does not permit capacity approval")
                if capacity.source_type == "projection":
                    projection = db.get(Projection, capacity.source_id)
                    latest = db.scalar(select(Projection.version).where(Projection.organisation_id == capacity.organisation_id,
                        Projection.source_id == (projection.source_id if projection else "")).order_by(Projection.version.desc()).limit(1))
                    if not projection or latest != projection.version or current_consent(db, capacity.organisation_id, projection.source_id, projection.consent_status) != "opted-in":
                        raise HTTPException(409, "Projection is missing, superseded or consent-withdrawn")
                    if projection.stale_after and aware(projection.stale_after) <= utcnow(): raise HTTPException(409, "Projection is stale")
                elif not body.evidence_reference:
                    raise HTTPException(422, "A Part 3 quality-release reference is required for harvested-lot capacity")
            before = {"reviewed": capacity.reviewed, "status": capacity.status}
            if body.decision == "withhold":
                for reservation in db.scalars(select(Reservation).where(Reservation.capacity_id == capacity.id,
                        Reservation.status.in_(["reserved", "committed"])).with_for_update()).all():
                    if reservation.status == "committed":
                        committed.append(reservation.id)
                        continue
                    capacity.reserved_g -= reservation.quantity_g
                    reservation.status, reservation.version = "released", reservation.version + 1
                    db.add(ReservationEvent(id=uuid4().hex, reservation_id=reservation.id, from_status="reserved",
                        to_status="released", actor_user_id=user["user_id"]))
                    released.append(reservation.id)
            capacity.reviewed = body.decision == "approve"
            capacity.status = "available" if body.decision == "approve" else "withheld"
            capacity.version += 1
            audit(db, user, "capacity.reviewed", "capacity", capacity.id, before=before,
                  after={"reviewed": capacity.reviewed, "status": capacity.status, "reason": body.reason,
                         "evidence_reference": body.evidence_reference, "released_reservations": released,
                         "committed_reservations_for_review": committed}, correlation_id=request.state.correlation_id)
            return {"capacity": as_dict(capacity), "released_reservations": released,
                    "committed_reservations_for_review": committed}
        return commit_idempotent(request, db, user, idempotency_key, data, op)

    @app.post("/api/v1/listings", status_code=201, response_model=ListingResponse)
    def create_listing(body: ListingCreate, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key"),
                       user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "listing:write")
        data = body.model_dump(mode="json")
        def op():
            capacity = db.scalar(select(Capacity).where(Capacity.id == body.capacity_id, Capacity.organisation_id == user["organisation_id"]))
            if not capacity or capacity.source_type != body.resource_type:
                raise HTTPException(404, "Owned capacity not found or resource type mismatch")
            require_capacity_eligible(db, capacity)
            if capacity.consent_status != "opted-in" or not capacity.reviewed:
                raise HTTPException(409, "Capacity is not consented and reviewed")
            if capacity.status != "available":
                raise HTTPException(409, "Capacity is not available for listing")
            if body.expires_at and aware(body.expires_at) <= utcnow():
                raise HTTPException(422, "Listing expiry must be in the future")
            if capacity.source_type == "projection":
                projection = db.get(Projection, capacity.source_id)
                if not projection or (projection.stale_after and aware(projection.stale_after) <= utcnow()):
                    raise HTTPException(409, "Projection is missing or stale")
                latest = db.scalar(select(Projection.version).where(Projection.organisation_id == projection.organisation_id,
                    Projection.source_id == projection.source_id).order_by(Projection.version.desc()).limit(1))
                if latest != projection.version:
                    raise HTTPException(409, "Projection version has been superseded")
                if current_consent(db, capacity.organisation_id, projection.source_id, projection.consent_status) != "opted-in":
                    raise HTTPException(409, "Current consent does not permit listing")
            listing = Listing(id=uuid4().hex, organisation_id=user["organisation_id"], **body.model_dump())
            db.add(listing); db.flush()
            if listing.expires_at:
                db.add(Job(id=uuid4().hex, kind="expire_listing", payload={"listing_id": listing.id}, run_at=listing.expires_at))
            audit(db, user, "listing.created", "listing", listing.id, after={"status": "active"}, correlation_id=request.state.correlation_id)
            return as_dict(listing)
        return commit_idempotent(request, db, user, idempotency_key, data, op)

    @app.get("/api/v1/market/listings", response_model=ItemPage)
    def market_listings(limit: int = 100, offset: int = 0, user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "listing:read")
        rows = eligible_listings(db, user["organisation_id"])
        size = min(max(limit, 1), 200)
        return {"items": rows[offset:offset + size], "limit": size, "offset": offset}

    @app.post("/api/v1/reservations", status_code=201, response_model=ReservationResult)
    def create_reservation(body: ReservationCreate, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key"),
                           user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "reservation:write")
        data = body.model_dump(mode="json")
        return commit_idempotent(request, db, user, idempotency_key, data, lambda: reserve_capacity(db, user, body.capacity_id, body.quantity_g, body.expires_at,
                                                                                           request.state.correlation_id))

    @app.post("/api/v1/reservations/{reservation_id}/transition", response_model=ReservationResponse)
    def update_reservation(reservation_id: str, body: ReservationTransition, request: Request,
                           idempotency_key: str = Header(..., alias="Idempotency-Key"), user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "reservation:write")
        data = {"reservation_id": reservation_id, **body.model_dump(mode="json")}
        return commit_idempotent(request, db, user, idempotency_key, data,
            lambda: transition_reservation(db, user, reservation_id, body.expected_version, body.action, request.state.correlation_id))

    @app.get("/api/v1/reservations", response_model=ItemPage)
    def reservations(limit: int = 100, offset: int = 0, user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "reservation:read")
        rows = db.scalars(select(Reservation).where((Reservation.requester_organisation_id == user["organisation_id"]) |
            (Reservation.organisation_id == user["organisation_id"])).order_by(Reservation.created_at.desc())
            .offset(offset).limit(min(max(limit, 1), 200))).all()
        return {"items": [as_dict(row) for row in rows], "limit": min(max(limit, 1), 200), "offset": offset}

    @app.get("/api/v1/reservations/{reservation_id}/history", response_model=ItemPage)
    def reservation_history(reservation_id: str, user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "reservation:read")
        reservation = db.get(Reservation, reservation_id)
        if not reservation or user["organisation_id"] not in (reservation.organisation_id, reservation.requester_organisation_id):
            raise HTTPException(404, "Reservation not found")
        events = db.scalars(select(ReservationEvent).where(ReservationEvent.reservation_id == reservation_id).order_by(ReservationEvent.created_at)).all()
        return {"items": [as_dict(event) for event in events]}

    @app.post("/api/v1/documents", status_code=201, response_model=DocumentResponse)
    async def upload_document(request: Request, document_type: str, provenance: str = "{}", file: UploadFile = File(...),
                              idempotency_key: str = Header(..., alias="Idempotency-Key"), user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "document:write")
        content = await file.read(25 * 1024 * 1024 + 1)
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(413, "Document exceeds 25 MiB")
        if not file.content_type or len(file.content_type) > 160:
            raise HTTPException(422, "A valid content type is required")
        try:
            provenance_data = __import__("json").loads(provenance)
            if not isinstance(provenance_data, dict): raise ValueError()
        except ValueError:
            raise HTTPException(422, "provenance must be a JSON object")
        payload = {"filename": Path(file.filename or "document").name, "content_type": file.content_type,
                   "size_bytes": len(content), "document_type": document_type, "provenance": provenance_data,
                   "sha256": hashlib.sha256(content).hexdigest()}
        storage_key = storage.put(content, Path(payload["filename"]).suffix)
        def op():
            row = Document(id=uuid4().hex, organisation_id=user["organisation_id"], owner_user_id=user["user_id"],
                document_type=document_type, content_type=file.content_type, filename=payload["filename"], storage_key=storage_key,
                size_bytes=len(content), provenance=provenance_data)
            db.add(row); db.flush()
            audit(db, user, "document.uploaded", "document", row.id, after={"size_bytes": row.size_bytes, "sha256": payload["sha256"]}, correlation_id=request.state.correlation_id)
            return as_dict(row)
        try:
            result = commit_idempotent(request, db, user, idempotency_key, payload, op)
            if result.get("storage_key") != storage_key:
                target = storage.root / storage_key
                if target.exists(): target.unlink()
            return result
        except Exception:
            # A failed metadata transaction must not leave an unreferenced local object.
            target = storage.root / storage_key
            if target.exists(): target.unlink()
            raise

    @app.get("/api/v1/documents/{document_id}", response_model=DocumentResponse)
    def document_metadata(document_id: str, user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "document:read")
        row = db.scalar(select(Document).where(Document.id == document_id, Document.organisation_id == user["organisation_id"]))
        if not row: raise HTTPException(404, "Document not found")
        return as_dict(row)

    @app.get("/api/v1/documents/{document_id}/content")
    def document_content(document_id: str, user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "document:read")
        row = db.scalar(select(Document).where(Document.id == document_id, Document.organisation_id == user["organisation_id"]))
        if not row: raise HTTPException(404, "Document not found")
        try: content = storage.get(row.storage_key)
        except FileNotFoundError: raise HTTPException(404, "Stored document content is unavailable")
        from fastapi.responses import Response
        return Response(content=content, media_type=row.content_type, headers={"Content-Disposition": f'attachment; filename="{row.filename}"'})

    @app.get("/api/v1/audit-events", response_model=ItemPage)
    def audit_events(limit: int = 100, offset: int = 0, user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "audit:read")
        rows = db.scalars(select(AuditEvent).where(AuditEvent.organisation_id == user["organisation_id"])
                          .order_by(AuditEvent.created_at.desc()).offset(offset).limit(min(max(limit, 1), 200))).all()
        return {"items": [as_dict(row) for row in rows]}

    @app.post("/api/v1/jobs", status_code=202, response_model=JobResponse)
    def create_job(body: JobCreate, request: Request, idempotency_key: str = Header(..., alias="Idempotency-Key"),
                   user: dict = Depends(actor), db: Session = Depends(db_session)):
        allowed(user, "job:write")
        kind, run_at = body.kind, body.run_at
        data = body.model_dump(mode="json")
        def op():
            if kind == "expire_reservation":
                resource = db.scalar(select(Reservation).where(Reservation.id == body.payload.get("reservation_id"),
                    Reservation.requester_organisation_id == user["organisation_id"]))
            else:
                resource = db.scalar(select(Listing).where(Listing.id == body.payload.get("listing_id"),
                    Listing.organisation_id == user["organisation_id"]))
            if not resource:
                raise HTTPException(404, "Expiry target not found in this organisation")
            due_at = resource.expires_at
            if due_at is None:
                raise HTTPException(409, "Expiry target has no configured expiry")
            if run_at and aware(run_at) != aware(due_at):
                raise HTTPException(422, "Expiry job run_at must match the resource expiry")
            job = Job(id=uuid4().hex, kind=kind, payload=data["payload"], run_at=due_at, max_attempts=body.max_attempts)
            db.add(job); db.flush()
            return as_dict(job)
        return commit_idempotent(request, db, user, idempotency_key, data, op)

    from .accounts import install_accounts
    from .auction_routes import install_auctions
    install_accounts(app, db_session, actor, environment)
    install_auctions(app, db_session, actor, allowed, commit_idempotent)

    @app.get("/api/v1/openapi.json")
    def openapi():
        return app.openapi()

    return app


app = create_app()
