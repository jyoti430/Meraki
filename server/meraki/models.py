from datetime import datetime, timezone
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now_utc():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organisations"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    identity_provider: Mapped[str] = mapped_column(String(80), default="unconfigured", nullable=False)
    external_subject: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)


class Membership(Base):
    __tablename__ = "organisation_memberships"
    __table_args__ = (UniqueConstraint("user_id", "organisation_id"), Index("ix_membership_org", "organisation_id"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    permissions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)


class SessionToken(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), index=True, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    document_type: Mapped[str] = mapped_column(String(80), nullable=False)
    content_type: Mapped[str] = mapped_column(String(160), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="available", nullable=False)
    retention_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class Projection(Base):
    __tablename__ = "supply_projections"
    __table_args__ = (UniqueConstraint("organisation_id", "source_id", "version"), Index("ix_projection_org_week", "organisation_id", "week_start"))
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False)
    source_id: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    farmer_ref: Mapped[str | None] = mapped_column(String(120))
    crop: Mapped[str] = mapped_column(String(120), nullable=False)
    variety: Mapped[str] = mapped_column(String(120), nullable=False)
    grade: Mapped[str] = mapped_column(String(80), nullable=False)
    week_start: Mapped[str] = mapped_column(String(10), nullable=False)
    week_end: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity_g: Mapped[int] = mapped_column(Integer, nullable=False)
    low_g: Mapped[int | None] = mapped_column(Integer)
    high_g: Mapped[int | None] = mapped_column(Integer)
    consent_status: Mapped[str] = mapped_column(String(30), nullable=False)
    consent_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    evidence_refs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    uncertainty: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    assumptions: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    source_rule_version: Mapped[str] = mapped_column(String(120), nullable=False)
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stale_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(24), default="current", nullable=False)
    caveats: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)


class ConsentEvent(Base):
    __tablename__ = "projection_consent_events"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    note: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class Capacity(Base):
    __tablename__ = "capacities"
    __table_args__ = (CheckConstraint("quantity_g > 0 AND reserved_g >= 0 AND committed_g >= 0 AND reserved_g + committed_g <= quantity_g", name="ck_capacity_nonnegative"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)  # projection or harvested_lot
    source_id: Mapped[str] = mapped_column(String(120), nullable=False)
    crop: Mapped[str] = mapped_column(String(120), nullable=False)
    variety: Mapped[str] = mapped_column(String(120), nullable=False)
    grade: Mapped[str] = mapped_column(String(80), nullable=False)
    week_start: Mapped[str] = mapped_column(String(10), nullable=False)
    week_end: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity_g: Mapped[int] = mapped_column(Integer, nullable=False)
    reserved_g: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    committed_g: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consent_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="available", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class Listing(Base):
    __tablename__ = "market_listings"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    capacity_id: Mapped[str] = mapped_column(ForeignKey("capacities.id"), nullable=False, unique=True)
    resource_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False)
    visible_to_members: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (CheckConstraint("quantity_g > 0", name="ck_reservation_positive"), Index("ix_reservation_org_status", "organisation_id", "status"))
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    capacity_id: Mapped[str] = mapped_column(ForeignKey("capacities.id"), nullable=False, index=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False)
    requester_organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False)
    quantity_g: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="reserved", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class ReservationEvent(Base):
    __tablename__ = "reservation_events"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    reservation_id: Mapped[str] = mapped_column(ForeignKey("reservations.id"), index=True, nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(24))
    to_status: Mapped[str] = mapped_column(String(24), nullable=False)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_type: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("organisation_id", "actor_user_id", "key"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_type: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(120), nullable=False)
    correlation_id: Mapped[str | None] = mapped_column(String(120))
    transition: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class Job(Base):
    __tablename__ = "background_jobs"
    __table_args__ = (Index("ix_job_claim", "status", "run_at"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    kind: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
