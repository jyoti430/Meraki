from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(StrictBody):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    # Username remains available for existing operator-created demo accounts.
    username: str | None = Field(default=None, min_length=3, max_length=60, pattern=r"^[a-zA-Z0-9_.-]+$")
    mobile_number: str | None = Field(default=None, max_length=40)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value):
        return value.lower() if value else value

    @field_validator("mobile_number")
    @classmethod
    def normalize_mobile(cls, value):
        import re
        if value is None:
            return value
        value = re.sub(r"[\s()\-]", "", value)
        if not re.fullmatch(r"\+[1-9][0-9]{6,14}", value):
            raise ValueError("Include the country code, for example +91, and 7–15 digits")
        return value

    @model_validator(mode="after")
    def one_identifier(self):
        if bool(self.username) == bool(self.mobile_number):
            raise ValueError("Provide either mobile_number or username")
        return self


class Register(Login):
    display_name: str = Field(min_length=1, max_length=100)
    organisation_name: str = Field(min_length=2, max_length=150)
    role: Literal["fpo", "exporter"]


class Terms(StrictBody):
    handover: str = Field(min_length=3, max_length=300)
    acceptance: str = Field(min_length=3, max_length=1000)
    payment: str = Field(min_length=3, max_length=1000)
    cancellation: str = Field(min_length=3, max_length=1000)
    evidence_reference: str = Field(min_length=3, max_length=200)
    fee_paise_per_kg: int = Field(default=0, ge=0, le=100000, strict=True)
    evidence_status: Literal["synthetic", "reviewed"] = "synthetic"


class AuctionCreate(StrictBody):
    mode: Literal["spot", "forward"]
    title: str = Field(min_length=3, max_length=200)
    crop: str = Field(min_length=1, max_length=120)
    variety: str = Field(min_length=1, max_length=120)
    grade: str = Field(min_length=1, max_length=80)
    week_start: date
    week_end: date
    quantity_g: int = Field(gt=0, le=2_000_000_000, strict=True)
    capacity_id: str | None = Field(default=None, max_length=80)
    currency: Literal["INR"] = "INR"
    limit_price: int = Field(gt=0, le=10_000_000, strict=True)
    increment: int = Field(gt=0, le=1_000_000, strict=True)
    opens_at: datetime
    closes_at: datetime
    extension_window_s: int = Field(default=120, ge=0, le=600, strict=True)
    extension_s: int = Field(default=120, ge=0, le=600, strict=True)
    extension_cap_s: int = Field(default=600, ge=0, le=3600, strict=True)
    confirmation_hours: int = Field(default=24, ge=1, le=168, strict=True)
    eligible_org_ids: list[str] = Field(default_factory=list, max_length=100)
    terms: Terms

    @model_validator(mode="after")
    def coherent(self):
        if not self.opens_at.tzinfo or not self.closes_at.tzinfo:
            raise ValueError("Auction timestamps require a timezone")
        if self.closes_at <= self.opens_at or self.week_end < self.week_start:
            raise ValueError("End must follow start")
        if (self.mode == "spot") != bool(self.capacity_id):
            raise ValueError("Only spot auctions require a harvested capacity")
        if self.mode == "forward" and not self.eligible_org_ids:
            raise ValueError("Forward procurement requires a prequalified organisation list")
        return self


class BidCreate(StrictBody):
    price: int = Field(gt=0, le=10_000_000, strict=True)
    currency: Literal["INR"] = "INR"
    capacity_id: str | None = Field(default=None, max_length=80)
    accept_terms: Literal[True]


class AwardDecision(StrictBody):
    action: Literal["confirm", "decline"]
