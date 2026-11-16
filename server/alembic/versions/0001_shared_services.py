"""Create the initial shared service schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_shared_services"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("organisations",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("users",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("display_name", sa.String(200), nullable=False), sa.Column("identity_provider", sa.String(80), nullable=False),
        sa.Column("external_subject", sa.String(255)), sa.Column("status", sa.String(20), nullable=False))
    op.create_table("organisation_memberships",
        sa.Column("id", sa.Integer, primary_key=True), sa.Column("user_id", sa.String(80), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(40), nullable=False), sa.Column("permissions", sa.JSON, nullable=False), sa.Column("status", sa.String(20), nullable=False),
        sa.UniqueConstraint("user_id", "organisation_id"))
    op.create_index("ix_membership_org", "organisation_memberships", ["organisation_id"])
    op.create_table("sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True), sa.Column("user_id", sa.String(80), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("documents",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("owner_user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=False), sa.Column("document_type", sa.String(80), nullable=False),
        sa.Column("content_type", sa.String(160), nullable=False), sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False, unique=True), sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("provenance", sa.JSON, nullable=False), sa.Column("status", sa.String(20), nullable=False),
        sa.Column("retention_until", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_documents_organisation_id", "documents", ["organisation_id"])
    op.create_table("supply_projections",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("source_id", sa.String(120), nullable=False), sa.Column("version", sa.Integer, nullable=False), sa.Column("farmer_ref", sa.String(120)),
        sa.Column("crop", sa.String(120), nullable=False), sa.Column("variety", sa.String(120), nullable=False), sa.Column("grade", sa.String(80), nullable=False),
        sa.Column("week_start", sa.String(10), nullable=False), sa.Column("week_end", sa.String(10), nullable=False), sa.Column("quantity_g", sa.Integer, nullable=False),
        sa.Column("low_g", sa.Integer), sa.Column("high_g", sa.Integer), sa.Column("consent_status", sa.String(30), nullable=False),
        sa.Column("consent_recorded_at", sa.DateTime(timezone=True)), sa.Column("evidence_refs", sa.JSON, nullable=False),
        sa.Column("uncertainty", sa.JSON, nullable=False), sa.Column("assumptions", sa.JSON, nullable=False),
        sa.Column("source_rule_version", sa.String(120), nullable=False), sa.Column("as_of", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stale_after", sa.DateTime(timezone=True)), sa.Column("status", sa.String(24), nullable=False), sa.Column("caveats", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("created_by", sa.String(80), sa.ForeignKey("users.id"), nullable=False),
        sa.UniqueConstraint("organisation_id", "source_id", "version"))
    op.create_index("ix_projection_org_week", "supply_projections", ["organisation_id", "week_start"])
    op.create_table("projection_consent_events",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("source_id", sa.String(120), nullable=False), sa.Column("status", sa.String(30), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False), sa.Column("actor_user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note", sa.String(500), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_projection_consent_events_organisation_id", "projection_consent_events", ["organisation_id"])
    op.create_index("ix_projection_consent_events_source_id", "projection_consent_events", ["source_id"])
    op.create_table("capacities",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("source_type", sa.String(30), nullable=False), sa.Column("source_id", sa.String(120), nullable=False),
        sa.Column("crop", sa.String(120), nullable=False), sa.Column("variety", sa.String(120), nullable=False), sa.Column("grade", sa.String(80), nullable=False),
        sa.Column("week_start", sa.String(10), nullable=False), sa.Column("week_end", sa.String(10), nullable=False), sa.Column("quantity_g", sa.Integer, nullable=False),
        sa.Column("reserved_g", sa.Integer, nullable=False), sa.Column("committed_g", sa.Integer, nullable=False),
        sa.Column("consent_status", sa.String(30), nullable=False), sa.Column("reviewed", sa.Boolean, nullable=False),
        sa.Column("status", sa.String(24), nullable=False), sa.Column("version", sa.Integer, nullable=False),
        sa.CheckConstraint("quantity_g > 0 AND reserved_g >= 0 AND committed_g >= 0 AND reserved_g + committed_g <= quantity_g", name="ck_capacity_nonnegative"))
    op.create_index("ix_capacities_organisation_id", "capacities", ["organisation_id"])
    op.create_table("market_listings",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("capacity_id", sa.String(80), sa.ForeignKey("capacities.id"), nullable=False, unique=True),
        sa.Column("resource_type", sa.String(30), nullable=False), sa.Column("status", sa.String(24), nullable=False),
        sa.Column("visible_to_members", sa.Boolean, nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_market_listings_organisation_id", "market_listings", ["organisation_id"])
    op.create_table("reservations",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("capacity_id", sa.String(80), sa.ForeignKey("capacities.id"), nullable=False),
        sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("requester_organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("quantity_g", sa.Integer, nullable=False), sa.Column("status", sa.String(24), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.CheckConstraint("quantity_g > 0", name="ck_reservation_positive"))
    op.create_index("ix_reservations_capacity_id", "reservations", ["capacity_id"])
    op.create_index("ix_reservation_org_status", "reservations", ["organisation_id", "status"])
    op.create_table("reservation_events",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("reservation_id", sa.String(80), sa.ForeignKey("reservations.id"), nullable=False),
        sa.Column("from_status", sa.String(24)), sa.Column("to_status", sa.String(24), nullable=False),
        sa.Column("actor_user_id", sa.String(80), sa.ForeignKey("users.id")), sa.Column("actor_type", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_reservation_events_reservation_id", "reservation_events", ["reservation_id"])
    op.create_table("idempotency_records",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("actor_user_id", sa.String(80), sa.ForeignKey("users.id"), nullable=False), sa.Column("key", sa.String(200), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False), sa.Column("response", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("organisation_id", "actor_user_id", "key"))
    op.create_table("audit_events",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("actor_user_id", sa.String(80), sa.ForeignKey("users.id")),
        sa.Column("actor_type", sa.String(20), nullable=False),
        sa.Column("organisation_id", sa.String(80), sa.ForeignKey("organisations.id"), nullable=False), sa.Column("action", sa.String(120), nullable=False),
        sa.Column("resource_type", sa.String(80), nullable=False), sa.Column("resource_id", sa.String(120), nullable=False),
        sa.Column("correlation_id", sa.String(120)), sa.Column("transition", sa.JSON, nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_audit_events_organisation_id", "audit_events", ["organisation_id"])
    op.create_table("background_jobs",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("kind", sa.String(100), nullable=False), sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("status", sa.String(20), nullable=False), sa.Column("run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False), sa.Column("max_attempts", sa.Integer, nullable=False), sa.Column("last_error", sa.Text),
        sa.Column("locked_at", sa.DateTime(timezone=True)), sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_job_claim", "background_jobs", ["status", "run_at"])


def downgrade():
    for table in ("background_jobs", "audit_events", "idempotency_records", "reservation_events", "reservations", "market_listings",
                  "capacities", "projection_consent_events", "supply_projections", "documents", "sessions", "organisation_memberships", "users", "organisations"):
        op.drop_table(table)
