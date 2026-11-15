"""Train-only descriptive baselines with combined temporal/new-farm holdout.

Execution floors are reproducibility safeguards, not proof of statistical power.
No automated result in this module authorises model promotion.
"""
import hashlib
import math
from dataclasses import asdict, dataclass
from statistics import mean

from .contracts import Outcome


@dataclass(frozen=True)
class EvaluationPolicy:
    version: str = "farm-yield-offline-v1"
    min_train_rows: int = 30
    min_test_rows: int = 10
    min_train_farms: int = 5
    min_test_farms: int = 3
    min_train_seasons: int = 2
    holdout_farm_fraction: float = 0.25

    def __post_init__(self):
        for name in ("min_train_rows", "min_test_rows", "min_train_farms", "min_test_farms", "min_train_seasons"):
            value = getattr(self, name)
            if type(value) is not int or value < 1:
                raise ValueError("Evaluation execution floors must be positive integers")
        if not 0 < self.holdout_farm_fraction < 1:
            raise ValueError("holdout_farm_fraction must lie strictly between zero and one")


@dataclass(frozen=True)
class Split:
    train: tuple[Outcome, ...]
    test: tuple[Outcome, ...]
    excluded_count: int
    latest_season: int | None


def split_outcomes(outcomes, policy=EvaluationPolicy()):
    ordered = sorted(outcomes, key=lambda row: (row.decision_at, row.record_id))
    if not ordered:
        return Split((), (), 0, None)
    latest = max(row.season_year for row in ordered)
    latest_rows = [row for row in ordered if row.season_year == latest]
    farms = sorted({row.farm_id for row in latest_rows}, key=lambda farm: hashlib.sha256(farm.encode()).hexdigest())
    count = min(len(farms), max(policy.min_test_farms, math.ceil(len(farms) * policy.holdout_farm_fraction)))
    heldout = set(farms[:count])
    test = tuple(row for row in latest_rows if row.farm_id in heldout)
    cutoff = min(row.decision_at for row in test)
    train = tuple(row for row in ordered if row.season_year < latest and row.farm_id not in heldout and row.label_available_at <= cutoff)
    return Split(train, test, len(ordered) - len(train) - len(test), latest)


def _metrics(actual, predictions):
    errors = [prediction - target for target, prediction in zip(actual, predictions)]
    return {"n": len(errors), "mae_kg_ha": round(mean(abs(error) for error in errors), 6),
            "bias_kg_ha": round(mean(errors), 6), "maximum_absolute_error_kg_ha": round(max(abs(error) for error in errors), 6)}


def _median(values):
    # Contract-valid targets are nonnegative. This midpoint avoids overflow in
    # (low + high) / 2 for two very large but finite measurements.
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    low, high = ordered[middle - 1], ordered[middle]
    return low + (high - low) / 2


def evaluate(outcomes, policy=EvaluationPolicy()):
    split = split_outcomes(outcomes, policy)
    counts = {"train_rows": len(split.train), "test_rows": len(split.test),
        "train_farms": len({row.farm_id for row in split.train}), "test_farms": len({row.farm_id for row in split.test}),
        "train_seasons": len({row.season_year for row in split.train}), "test_season": split.latest_season,
        "excluded_rows": split.excluded_count, "farm_overlap": 0,
        "policy": "latest season; stable hash-selected new farms; earlier labels available by first held-out decision"}
    failures = [f"{key} below execution floor {getattr(policy, 'min_' + key)}" for key in
        ("train_rows", "test_rows", "train_farms", "test_farms", "train_seasons") if counts[key] < getattr(policy, "min_" + key)]
    cohorts = {(row.crop_id, row.variety) for row in split.train}
    if any((row.crop_id, row.variety) not in cohorts for row in split.test):
        failures.append("Held-out crop/variety lacks a training cohort; extrapolation is not scored")
    result = dict(status="not_run", purpose="offline farm gross-yield baseline comparison, not crop selection or income impact",
        primary_metric="MAE in kg/ha", promotion_allowed=False, policy=asdict(policy), split=counts,
        metrics=None, fitted_summary=None, reasons=failures,
        limits=["Execution floors do not establish sample sufficiency, uncertainty or external validity.",
                "No calibration, prospective field outcome, farmer-income or agronomic safety claim follows from this offline comparison.",
                "Test labels must remain untouched by tuning; independent protocol and human review are still required."])
    if failures:
        return result
    baseline = _median(row.yield_kg_ha for row in split.train)
    groups = {}
    crop_groups = {}
    for row in split.train:
        groups.setdefault((row.crop_id, row.variety, row.region_id), []).append(row.yield_kg_ha)
        crop_groups.setdefault((row.crop_id, row.variety), []).append(row.yield_kg_ha)
    fitted = {key: _median(values) for key, values in groups.items()}
    crop_fitted = {key: _median(values) for key, values in crop_groups.items()}
    predictions = [fitted.get((row.crop_id, row.variety, row.region_id), crop_fitted[(row.crop_id, row.variety)]) for row in split.test]
    actual = [row.yield_kg_ha for row in split.test]
    result.update(status="evaluated_offline_only", metrics={"training_median": _metrics(actual, [baseline] * len(actual)),
        "crop_region_median": _metrics(actual, predictions)},
        fitted_summary={"training_median_kg_ha": baseline, "crop_region_groups": len(fitted),
            "crop_variety_groups": len(crop_fitted), "fitting": "training rows only; crop/variety fallback for a new region"})
    result["slice_metrics"] = {}
    for crop in sorted({row.crop_id for row in split.test}):
        indexes = [index for index, row in enumerate(split.test) if row.crop_id == crop]
        result["slice_metrics"][crop] = _metrics([actual[index] for index in indexes], [predictions[index] for index in indexes])
    return result
