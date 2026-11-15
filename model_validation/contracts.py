"""Strict plot-season outcome contract. No records are supplied by this project."""
import csv
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TextIO

CONTRACT_VERSION = "farm-gross-yield-v1"
DEFAULT_AS_OF = "2026-11-15T18:20:00Z"
HEADER = (
    "record_id", "dataset_version", "farm_id", "plot_id", "crop_id", "variety", "region_id", "season_year",
    "decision_at", "sowing_at", "harvest_at", "label_available_at", "feature_observed_at", "feature_available_at",
    "area_ha", "harvested_weight_kg", "label_scope", "label_method", "source_id", "source_version", "synthetic",
    "consent_for_training", "consent_reference", "training_permission", "permission_reference", "privacy_classification",
)
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")
CONTEXT_SOURCE_PREFIXES = ("nhb-", "des-", "pib-", "nasa-", "msamb-", "agmarknet-", "fao-ecocrop")


@dataclass(frozen=True)
class Issue:
    row: int
    code: str
    message: str


@dataclass(frozen=True)
class Outcome:
    record_id: str
    dataset_version: str
    farm_id: str
    plot_id: str
    crop_id: str
    variety: str
    region_id: str
    season_year: int
    decision_at: datetime
    sowing_at: datetime
    harvest_at: datetime
    label_available_at: datetime
    feature_observed_at: datetime
    feature_available_at: datetime
    area_ha: float
    harvested_weight_kg: float
    yield_kg_ha: float
    source_id: str
    source_version: str


@dataclass(frozen=True)
class ValidationResult:
    submitted_rows: int
    outcomes: tuple[Outcome, ...]
    issues: tuple[Issue, ...]


def timestamp(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if "T" not in value or result.tzinfo is None:
        raise ValueError("Timezone-aware ISO timestamp required")
    return result.astimezone(timezone.utc)


def validate_csv(source: Path | TextIO, *, as_of: str = DEFAULT_AS_OF) -> ValidationResult:
    """Validate every row, retaining real zero yields and reporting no identifiers.

    References are attestations to an external permission/consent register, not
    proof of permission. Human verification remains a separate promotion gate.
    """
    if isinstance(source, Path):
        with source.open(encoding="utf-8-sig", newline="") as stream:
            return validate_csv(stream, as_of=as_of)
    cutoff = timestamp(as_of)
    reader = csv.DictReader(source)
    rows = list(reader)
    if tuple(reader.fieldnames or ()) != HEADER:
        return ValidationResult(len(rows), (), (Issue(1, "invalid_header", "Use exactly the versioned header; extra or missing fields are rejected."),))
    accepted = []
    issues = []
    seen_ids = set()
    seen_keys = set()
    dataset_version = None
    for number, raw in enumerate(rows, start=2):
        errors = []

        def reject(code, message):
            errors.append(Issue(number, code, message))

        if None in raw or any(value is None for value in raw.values()):
            reject("malformed_csv_row", "CSV row has the wrong number of fields.")
            issues.extend(errors)
            continue
        row = {key: value.strip() for key, value in raw.items()}
        for key in ("record_id", "dataset_version", "farm_id", "plot_id", "crop_id", "variety", "region_id", "source_id", "source_version"):
            if not IDENTIFIER.fullmatch(row[key]):
                reject("invalid_identifier", f"{key} must be a pseudonymous versioned identifier, not personal information.")
        if row["synthetic"] != "false":
            reject("synthetic_record", "Only explicitly non-synthetic outcomes are eligible.")
        if row["consent_for_training"] != "true" or not row["consent_reference"]:
            reject("training_consent_missing", "Explicit training consent and its external register reference are required.")
        if row["training_permission"] != "approved" or not row["permission_reference"]:
            reject("training_permission_missing", "Approved training rights and a permission register reference are required.")
        if row["privacy_classification"] != "deidentified":
            reject("privacy_not_deidentified", "Only deidentified outcomes may enter this evaluation contract.")
        if row["label_scope"] != "plot-season-gross-harvest" or row["label_method"] != "measured":
            reject("not_measured_farm_outcome", "Label must be measured whole-plot-season gross harvest, not an aggregate, estimate or shipment allocation.")
        if row["source_id"].lower().startswith(CONTEXT_SOURCE_PREFIXES):
            reject("aggregate_source_not_farm_label", "A known aggregate, market, weather or species-reference source cannot establish a measured farm outcome.")
        if dataset_version is None:
            dataset_version = row["dataset_version"]
        elif row["dataset_version"] != dataset_version:
            reject("mixed_dataset_versions", "A CSV must represent one frozen dataset version.")
        dates = {}
        for key in ("decision_at", "sowing_at", "harvest_at", "label_available_at", "feature_observed_at", "feature_available_at"):
            try:
                dates[key] = timestamp(row[key])
            except (ValueError, TypeError, OverflowError):
                reject("invalid_timestamp", f"{key} requires a timezone-aware ISO timestamp.")
        if len(dates) == 6:
            if not dates["decision_at"] <= dates["sowing_at"] < dates["harvest_at"] <= dates["label_available_at"] <= cutoff:
                reject("invalid_label_chronology", "Require decision <= sowing < harvest <= label availability <= evaluation snapshot.")
            if not dates["feature_observed_at"] <= dates["feature_available_at"] <= dates["decision_at"]:
                reject("feature_leakage", "Latest feature observation and actual availability must both precede the pre-sowing decision.")
        numbers = {}
        for key in ("area_ha", "harvested_weight_kg"):
            try:
                value = float(row[key])
                if not math.isfinite(value) or value < 0 or (key == "area_ha" and value == 0):
                    raise ValueError
                numbers[key] = value
            except (ValueError, OverflowError):
                reject("invalid_measurement", f"{key} must be finite and nonnegative; area must be positive.")
        try:
            year = int(row["season_year"])
            if str(year) != row["season_year"] or not 1900 <= year <= 2200 or ("sowing_at" in dates and year != dates["sowing_at"].year):
                raise ValueError
        except ValueError:
            year = 0
            reject("invalid_season", "season_year must equal the sowing calendar year.")
        natural_key = (row["farm_id"], row["plot_id"], row["season_year"])
        if row["record_id"] in seen_ids or natural_key in seen_keys:
            reject("duplicate_outcome", "Duplicate record or farm/plot/season outcome; aggregate or repeated labels are not independent observations.")
        seen_ids.add(row["record_id"])
        seen_keys.add(natural_key)
        if numbers.keys() >= {"area_ha", "harvested_weight_kg"}:
            derived = numbers["harvested_weight_kg"] / numbers["area_ha"]
            if not math.isfinite(derived):
                reject("invalid_measurement", "Derived gross yield must be finite.")
        if errors:
            issues.extend(errors)
            continue
        accepted.append(Outcome(**{key: row[key] for key in ("record_id", "dataset_version", "farm_id", "plot_id", "crop_id", "variety", "region_id", "source_id", "source_version")},
            season_year=year, **dates, **numbers, yield_kg_ha=derived))
    return ValidationResult(len(rows), tuple(accepted), tuple(issues))
