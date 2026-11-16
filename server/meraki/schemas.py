from datetime import date, datetime
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Shared ledger columns are PostgreSQL INTEGER, unlike Part 3's JSON ledger.
MAX_GRAMS = 2_147_483_647


class DevSessionRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=1, max_length=200)
    organisation_id: str = Field(min_length=1, max_length=80)
    organisation_name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=40)
    permissions: list[str] = Field(default_factory=lambda: ["projection:read", "projection:write", "listing:read", "listing:write", "capacity:read", "capacity:write", "capacity:review", "document:read", "document:write", "reservation:read", "reservation:write", "audit:read", "job:write"])


class ProjectionPublish(BaseModel):
    source_id: str = Field(min_length=1, max_length=120)
    version: int = Field(ge=1)
    farmer_ref: str | None = Field(default=None, max_length=120)
    crop: str = Field(min_length=1, max_length=120)
    variety: str = Field(min_length=1, max_length=120)
    grade: str = Field(min_length=1, max_length=80)
    week_start: str
    week_end: str
    quantity_g: int = Field(ge=0, le=MAX_GRAMS, strict=True)
    low_g: int | None = Field(default=None, ge=0, le=MAX_GRAMS, strict=True)
    high_g: int | None = Field(default=None, ge=0, le=MAX_GRAMS, strict=True)
    consent_status: Literal["opted-in", "opted-out", "not-recorded", "unavailable"]
    consent_recorded_at: datetime | None = None
    evidence_refs: list[dict[str, Any]] = Field(default_factory=list)
    uncertainty: dict[str, Any] = Field(default_factory=dict)
    assumptions: dict[str, Any] = Field(default_factory=dict)
    source_rule_version: str = Field(min_length=1, max_length=120)
    as_of: datetime
    stale_after: datetime | None = None
    caveats: list[str] = Field(default_factory=list)

    @field_validator("week_start", "week_end")
    @classmethod
    def iso_date(cls, value):
        try:
            date.fromisoformat(value)
        except ValueError:
            raise ValueError("must be an ISO date (YYYY-MM-DD)")
        return value

    @field_validator("consent_recorded_at", "as_of", "stale_after")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value

    @model_validator(mode="after")
    def validate_week_and_range(self):
        if self.week_end < self.week_start:
            raise ValueError("week_end must not precede week_start")
        if self.low_g is not None and self.high_g is not None and self.low_g > self.high_g:
            raise ValueError("low_g must not exceed high_g")
        if self.low_g is not None and self.low_g > self.quantity_g or self.high_g is not None and self.high_g < self.quantity_g:
            raise ValueError("low_g <= quantity_g <= high_g is required when bounds are supplied")
        if self.stale_after is not None and self.stale_after <= self.as_of:
            raise ValueError("stale_after must follow as_of")
        return self


class CapacityCreate(BaseModel):
    source_type: Literal["projection", "harvested_lot"]
    source_id: str = Field(min_length=1, max_length=120)
    crop: str = Field(min_length=1, max_length=120)
    variety: str = Field(min_length=1, max_length=120)
    grade: str = Field(min_length=1, max_length=80)
    week_start: str
    week_end: str
    quantity_g: int = Field(gt=0, le=MAX_GRAMS, strict=True)
    consent_status: Literal["opted-in", "opted-out", "not-recorded", "unavailable"]

    @field_validator("week_start", "week_end")
    @classmethod
    def iso_date(cls, value):
        try:
            date.fromisoformat(value)
        except ValueError:
            raise ValueError("must be an ISO date (YYYY-MM-DD)")
        return value

    @model_validator(mode="after")
    def validate_week(self):
        if self.week_end < self.week_start:
            raise ValueError("week_end must not precede week_start")
        return self


class CapacityReview(BaseModel):
    decision: Literal["approve", "withhold"]
    reason: str = Field(min_length=1, max_length=500)
    evidence_reference: str | None = Field(default=None, max_length=500)


class ListingCreate(BaseModel):
    capacity_id: str
    resource_type: Literal["projection", "harvested_lot"]
    visible_to_members: bool = True
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value


class ReservationCreate(BaseModel):
    capacity_id: str
    quantity_g: int = Field(gt=0, le=MAX_GRAMS, strict=True)
    expires_at: datetime

    @field_validator("expires_at")
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value


class ReservationTransition(BaseModel):
    expected_version: int = Field(ge=1)
    action: Literal["confirm", "release", "cancel"]


class ConsentUpdate(BaseModel):
    status: Literal["opted-in", "opted-out", "not-recorded", "unavailable"]
    note: str = Field(default="", max_length=500)


class JobCreate(BaseModel):
    kind: Literal["expire_reservation", "expire_listing"]
    payload: dict[str, Any]
    run_at: datetime | None = None
    max_attempts: int = Field(default=5, ge=1, le=10)

    @field_validator("run_at")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("timestamp must include a timezone")
        return value


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProjectionResponse(ResponseModel):
    id: str
    organisation_id: str
    source_id: str
    version: int
    farmer_ref: str | None
    crop: str
    variety: str
    grade: str
    week_start: str
    week_end: str
    quantity_g: int
    low_g: int | None
    high_g: int | None
    consent_status: str
    consent_recorded_at: datetime | None
    evidence_refs: list[dict[str, Any]]
    uncertainty: dict[str, Any]
    assumptions: dict[str, Any]
    source_rule_version: str
    as_of: datetime
    stale_after: datetime | None
    status: str
    caveats: list[str]
    created_at: datetime
    created_by: str


class ProjectionResult(ResponseModel):
    projection: ProjectionResponse
    released_superseded_reservations: list[str]
    committed_reservations_for_review: list[str]


class CapacityResponse(ResponseModel):
    id: str
    organisation_id: str
    source_type: str
    source_id: str
    crop: str
    variety: str
    grade: str
    week_start: str
    week_end: str
    quantity_g: int
    reserved_g: int
    committed_g: int
    consent_status: str
    reviewed: bool
    status: str
    version: int


class CapacityReviewResult(ResponseModel):
    capacity: CapacityResponse
    released_reservations: list[str]
    committed_reservations_for_review: list[str]


class ConsentEventResponse(ResponseModel):
    id: str
    organisation_id: str
    source_id: str
    status: str
    recorded_at: datetime
    actor_user_id: str
    note: str
    created_at: datetime


class ConsentResult(ResponseModel):
    consent_event: ConsentEventResponse
    released_reservations: list[str]
    committed_reservations_for_review: list[str]


class ListingResponse(ResponseModel):
    id: str
    organisation_id: str
    capacity_id: str
    resource_type: str
    status: str
    visible_to_members: bool
    expires_at: datetime | None
    created_at: datetime


class ReservationResponse(ResponseModel):
    id: str
    capacity_id: str
    organisation_id: str
    requester_organisation_id: str
    quantity_g: int
    status: str
    expires_at: datetime
    version: int
    created_at: datetime


class ReservationResult(ResponseModel):
    reservation: ReservationResponse
    capacity_version: int


class DocumentResponse(ResponseModel):
    id: str
    organisation_id: str
    owner_user_id: str
    document_type: str
    content_type: str
    filename: str
    storage_key: str
    size_bytes: int
    provenance: dict[str, Any]
    status: str
    retention_until: datetime | None
    created_at: datetime


class JobResponse(ResponseModel):
    id: str
    kind: str
    payload: dict[str, Any]
    status: str
    run_at: datetime
    attempts: int
    max_attempts: int
    last_error: str | None
    locked_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class ItemPage(ResponseModel):
    items: list[dict[str, Any]]
    limit: int | None = None
    offset: int | None = None
    next_cursor: str | None = None
