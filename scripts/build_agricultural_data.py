#!/usr/bin/env python3
"""Normalize attributed agricultural sources into an offline planning evidence artifact.

No network access or third-party Python packages are required. The source CSV is
an offline import path so builds are reproducible and do not depend on a live API.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data/agriculture/source/nhb-maharashtra-2018.csv"
DEFAULT_MANIFEST = ROOT / "data/agriculture/source-manifest.json"
DEFAULT_OUTPUT = ROOT / "src/data/agriculturalBaselines.json"
DEFAULT_WEATHER_SOURCE = ROOT / "data/agriculture/source/nasa-power-daily-2020-2025.csv"
DEFAULT_WEATHER_LOCATIONS = ROOT / "data/agriculture/source/nasa-power-locations.csv"
DEFAULT_WEATHER_METADATA = ROOT / "data/agriculture/source/nasa-power-download-metadata.json"

if __package__:
    from .evidence_sources import (  # noqa: E402
        normalize_horticulture_rows,
        normalize_market_rows,
        normalize_national_rows,
        normalize_weather_rows,
    )
else:
    from evidence_sources import (  # noqa: E402
        normalize_horticulture_rows,
        normalize_market_rows,
        normalize_national_rows,
        normalize_weather_rows,
    )

ACRES_PER_HECTARE = 2.4710538147
THOUSAND_HECTARES = 1_000
THOUSAND_TONNES_TO_KG = 1_000_000
MISSING_MARKERS = {"", "-", "–", "—", "na", "n/a", "null", "none"}

CROP_ALIASES = {
    "green chilli": "green-chilli",
    "green chillies": "green-chilli",
    "chillies green": "green-chilli",
    "chilli green": "green-chilli",
    "chili pepper": "green-chilli",
    "chilli pepper": "green-chilli",
    "capsicum annuum": "green-chilli",
    "okra": "okra",
    "okra ladyfinger": "okra",
    "lady finger": "okra",
    "lady s finger": "okra",
    "tomato": "tomato",
    "tomatoes": "tomato",
}


def hectares_to_acres(hectares: float) -> float:
    return hectares * ACRES_PER_HECTARE


def metric_tonnes_to_kg(metric_tonnes: float) -> float:
    return metric_tonnes * 1_000


def thousand_hectares_to_hectares(thousand_hectares: float) -> float:
    return thousand_hectares * THOUSAND_HECTARES


def thousand_metric_tonnes_to_kg(thousand_metric_tonnes: float) -> float:
    return thousand_metric_tonnes * THOUSAND_TONNES_TO_KG


def parse_number(value: Any) -> float | None:
    """Parse a non-negative numeric cell, preserving documented missing markers."""
    if value is None:
        return None
    cleaned = str(value).strip()
    if cleaned.lower() in MISSING_MARKERS:
        return None
    cleaned = cleaned.replace(",", "")
    try:
        number = float(cleaned)
    except ValueError as exc:
        raise ValueError(f"not a numeric source value: {value!r}") from exc
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"expected a finite non-negative value, got {value!r}")
    return number


def normalize_crop_name(value: str) -> str:
    key = re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()
    if key not in CROP_ALIASES:
        raise ValueError(f"unmapped crop name: {value!r}")
    return CROP_ALIASES[key]


def year_start(year_label: str) -> int:
    match = re.fullmatch(r"(\d{4})[-–](?:\d{2}|\d{4})", year_label.strip())
    if not match:
        raise ValueError(f"unsupported crop-year label: {year_label!r}")
    return int(match.group(1))


def _round(value: float | None, places: int = 2) -> float | None:
    if value is None:
        return None
    return round(value, places)


def _compact(value: float) -> int | float:
    rounded = round(value, 6)
    return int(rounded) if rounded.is_integer() else rounded


def _source_crop_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {crop["cropId"]: crop for crop in manifest["coverage"]["crops"]}


def normalize_rows(
    rows: Iterable[dict[str, str]], manifest: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, str]]]:
    crops = _source_crop_map(manifest)
    source_years = manifest["coverage"]["years"]
    allowed_years = set(source_years)
    seen: set[tuple[str, str]] = set()
    observations: list[dict[str, Any]] = []
    warnings: list[dict[str, str]] = []

    for row_number, row in enumerate(rows, start=2):
        crop_id = normalize_crop_name(row.get("crop_label", ""))
        year = (row.get("year") or "").strip()
        if year not in allowed_years:
            raise ValueError(f"row {row_number}: year {year!r} is outside manifest coverage")
        if crop_id not in crops:
            raise ValueError(f"row {row_number}: crop {crop_id!r} is outside manifest coverage")
        key = (crop_id, year)
        if key in seen:
            raise ValueError(f"row {row_number}: duplicate crop/year record {key}")
        seen.add(key)

        crop_metadata = crops[crop_id]
        table = (row.get("source_table") or "").strip()
        page = (row.get("source_page") or "").strip()
        if table != crop_metadata["table"] or page != str(crop_metadata["printedPage"]):
            raise ValueError(f"row {row_number}: source table/page does not match manifest")

        reported_area = parse_number(row.get("area_thousand_hectares"))
        reported_production = parse_number(row.get("production_thousand_metric_tonnes"))
        area_ha = (
            thousand_hectares_to_hectares(reported_area)
            if reported_area is not None
            else None
        )
        production_kg = (
            thousand_metric_tonnes_to_kg(reported_production)
            if reported_production is not None
            else None
        )
        production_tonnes = (
            production_kg / 1_000 if production_kg is not None else None
        )

        yield_kg_per_hectare = None
        yield_kg_per_acre = None
        if area_ha is not None and area_ha > 0 and production_kg is not None:
            yield_kg_per_hectare = production_kg / area_ha
            yield_kg_per_acre = yield_kg_per_hectare / ACRES_PER_HECTARE
        else:
            warnings.append(
                {
                    "cropId": crop_id,
                    "year": year,
                    "reason": "Area or production is missing or area is zero; no yield was derived.",
                }
            )

        source_name = row.get("crop_label", "").strip()
        observations.append(
            {
                "cropId": crop_id,
                "cropName": crop_metadata["name"],
                "sourceCropName": source_name,
                "year": year,
                "season": (row.get("season") or "").strip() or None,
                "areaHectares": _compact(area_ha) if area_ha is not None else None,
                "areaAcres": _round(hectares_to_acres(area_ha), 2)
                if area_ha is not None
                else None,
                "productionTonnes": _compact(production_tonnes)
                if production_tonnes is not None
                else None,
                "productionKg": _compact(production_kg)
                if production_kg is not None
                else None,
                "yieldKgPerHectare": _round(yield_kg_per_hectare),
                "yieldKgPerAcre": _round(yield_kg_per_acre),
                "recordKind": "source_reported_official_statistic",
                "estimateStatus": "not_specified_in_source_table",
                "source": {
                    "datasetId": manifest["datasetId"],
                    "table": table,
                    "printedPage": int(page),
                },
            }
        )

    expected_crops = set(crops)
    actual_crops = {observation["cropId"] for observation in observations}
    if actual_crops != expected_crops:
        missing = sorted(expected_crops - actual_crops)
        raise ValueError(f"source extract is missing crop records for: {missing}")

    observations.sort(key=lambda item: (item["cropId"], year_start(item["year"])))
    by_crop: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for observation in observations:
        by_crop[observation["cropId"]].append(observation)

    baselines = []
    for crop_id, crop_metadata in crops.items():
        crop_observations = by_crop[crop_id]
        valid = [
            item
            for item in crop_observations
            if item["yieldKgPerAcre"] is not None
        ]
        observed_years = [item["year"] for item in valid]
        missing_years = [year for year in source_years if year not in observed_years]
        yields_per_acre = [item["yieldKgPerAcre"] for item in valid]
        yields_per_hectare = [item["yieldKgPerHectare"] for item in valid]

        consecutive_changes = []
        for previous, current in zip(valid, valid[1:]):
            if year_start(current["year"]) - year_start(previous["year"]) != 1:
                continue
            previous_value = previous["yieldKgPerAcre"]
            current_value = current["yieldKgPerAcre"]
            if previous_value:
                consecutive_changes.append(
                    {
                        "fromYear": previous["year"],
                        "toYear": current["year"],
                        "percent": _round(
                            (current_value - previous_value) / previous_value * 100
                        ),
                    }
                )

        sample_count = len(valid)
        if sample_count:
            minimum_acre = min(yields_per_acre)
            median_acre = statistics.median(yields_per_acre)
            maximum_acre = max(yields_per_acre)
            mean_acre = statistics.fmean(yields_per_acre)
            variation_pct = (
                statistics.pstdev(yields_per_acre) / mean_acre * 100
                if mean_acre
                else None
            )
            minimum_hectare = min(yields_per_hectare)
            median_hectare = statistics.median(yields_per_hectare)
            maximum_hectare = max(yields_per_hectare)
            scenarios: dict[str, float | None] = {
                "conservativeKgPerAcre": _round(minimum_acre),
                "expectedKgPerAcre": _round(median_acre),
                "highestHistoricalKgPerAcre": _round(maximum_acre),
            }
        else:
            minimum_acre = median_acre = maximum_acre = mean_acre = None
            variation_pct = None
            minimum_hectare = median_hectare = maximum_hectare = None
            scenarios = {
                "conservativeKgPerAcre": None,
                "expectedKgPerAcre": None,
                "highestHistoricalKgPerAcre": None,
            }

        baselines.append(
            {
                "cropId": crop_id,
                "cropName": crop_metadata["name"],
                "status": "available" if sample_count else "insufficient_data",
                "sampleCount": sample_count,
                "observedYears": observed_years,
                "missingYears": missing_years,
                "annualYieldKgPerAcre": [
                    {"year": item["year"], "value": item["yieldKgPerAcre"]}
                    for item in valid
                ],
                "summary": {
                    "minimumKgPerAcre": _round(minimum_acre),
                    "medianKgPerAcre": _round(median_acre),
                    "maximumKgPerAcre": _round(maximum_acre),
                    "meanKgPerAcre": _round(mean_acre),
                    "coefficientOfVariationPct": _round(variation_pct),
                    "minimumKgPerHectare": _round(minimum_hectare),
                    "medianKgPerHectare": _round(median_hectare),
                    "maximumKgPerHectare": _round(maximum_hectare),
                    "yearToYearChangesPct": consecutive_changes,
                },
                "planningScenarios": scenarios,
                "scenarioMethod": (
                    "Historical reference only: conservative is the minimum supported "
                    "annual yield; expected is the median supported annual yield. "
                    "The highest historical value is descriptive and is not a forecast."
                ),
                "dataQuality": {
                    "historyLength": "short" if sample_count < 5 else "multi-year",
                    "estimateStatus": "not_specified_in_source_table",
                    "season": "not_reported",
                    "geographicLevel": "state",
                    "latestYieldYear": observed_years[-1] if observed_years else None,
                    "freshness": "stale_historical_reference" if observed_years else "unavailable",
                    "farmLevelPrediction": False,
                },
            }
        )

    return observations, baselines, warnings



def normalize_agronomy_rows(
    rows: Iterable[dict[str, str]], manifest: dict[str, Any]
) -> list[dict[str, Any]]:
    source = manifest["agronomicReference"]
    crop_metadata = {item["cropId"]: item for item in source["cropCoverage"]}
    seen: set[str] = set()
    references = []

    def numeric_range(row: dict[str, str], minimum_key: str, maximum_key: str):
        minimum = parse_number(row.get(minimum_key))
        maximum = parse_number(row.get(maximum_key))
        if minimum is None or maximum is None:
            return None
        return [_round(minimum), _round(maximum)]

    def string_values(value: str | None) -> list[str] | None:
        if value is None or value.strip().lower() in MISSING_MARKERS:
            return None
        return [item.strip() for item in value.split(",") if item.strip()]

    for row_number, row in enumerate(rows, start=2):
        crop_id = normalize_crop_name(row.get("source_crop_name", ""))
        if crop_id not in crop_metadata:
            raise ValueError(
                f"agronomy row {row_number}: crop {crop_id!r} is outside source coverage"
            )
        if crop_id in seen:
            raise ValueError(f"agronomy row {row_number}: duplicate crop reference {crop_id!r}")
        seen.add(crop_id)
        metadata = crop_metadata[crop_id]
        if str(row.get("ecocrop_code", "")).strip() != str(metadata["ecocropCode"]):
            raise ValueError(f"agronomy row {row_number}: ECOCROP code does not match manifest")

        temperature_optimal = numeric_range(row, "optimal_temp_min_c", "optimal_temp_max_c")
        temperature_absolute = numeric_range(row, "absolute_temp_min_c", "absolute_temp_max_c")
        rainfall_optimal = numeric_range(
            row, "optimal_rainfall_min_mm", "optimal_rainfall_max_mm"
        )
        rainfall_absolute = numeric_range(
            row, "absolute_rainfall_min_mm", "absolute_rainfall_max_mm"
        )
        ph_optimal = numeric_range(row, "optimal_ph_min", "optimal_ph_max")
        ph_absolute = numeric_range(row, "absolute_ph_min", "absolute_ph_max")
        cycle = numeric_range(row, "crop_cycle_min_days", "crop_cycle_max_days")
        irrigation = parse_number(row.get("irrigation_requirement"))
        missing_fields = []
        for field, value in (
            ("temperatureC", temperature_optimal),
            ("annualRainfallMm", rainfall_optimal),
            ("soilPh", ph_optimal),
            ("cropCycleDays", cycle),
            ("irrigationRequirement", irrigation),
        ):
            if value is None:
                missing_fields.append(field)

        references.append(
            {
                "cropId": crop_id,
                "cropName": next(
                    crop["name"]
                    for crop in manifest["coverage"]["crops"]
                    if crop["cropId"] == crop_id
                ),
                "scientificName": row.get("scientific_name", "").strip(),
                "scientificSynonyms": string_values(row.get("scientific_synonyms")),
                "scope": "global_species_reference",
                "environment": {
                    "temperatureC": {
                        "optimal": temperature_optimal,
                        "absolute": temperature_absolute,
                    },
                    "annualRainfallMm": {
                        "optimal": rainfall_optimal,
                        "absolute": rainfall_absolute,
                    },
                    "soilPh": {"optimal": ph_optimal, "absolute": ph_absolute},
                    "soilTexture": {
                        "optimal": string_values(row.get("optimal_soil_texture")),
                        "absolute": string_values(row.get("absolute_soil_texture")),
                    },
                    "soilDrainage": (row.get("soil_drainage") or "").strip() or None,
                    "soilDepth": (row.get("soil_depth") or "").strip() or None,
                    "cropCycleDays": cycle,
                    "irrigationRequirement": irrigation,
                    "plantingSeasons": None,
                },
                "missingFields": missing_fields,
                "limitations": source["limitations"],
                "source": {
                    "datasetId": source["datasetId"],
                    "publisher": source["publisher"],
                    "title": source["title"],
                    "sourceUrl": metadata["sourceUrl"],
                    "accessedOn": source["accessedOn"],
                    "ecocropCode": int(row["ecocrop_code"]),
                },
            }
        )

    expected = set(crop_metadata)
    actual = {reference["cropId"] for reference in references}
    if actual != expected:
        raise ValueError(
            f"agronomy extract crop coverage mismatch; missing={sorted(expected - actual)}"
        )
    return sorted(references, key=lambda item: item["cropId"])

def build_artifact(
    rows: Iterable[dict[str, str]],
    manifest: dict[str, Any],
    agronomy_rows: Iterable[dict[str, str]] = (),
    horticulture_rows: Iterable[dict[str, str]] = (),
    national_rows: Iterable[dict[str, str]] = (),
    weather_rows: Iterable[dict[str, str]] = (),
    weather_location_rows: Iterable[dict[str, str]] = (),
    weather_download_metadata: dict[str, Any] | None = None,
    market_rows: Iterable[dict[str, str]] = (),
    market_download_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    observations, baselines, warnings = normalize_rows(rows, manifest)
    yield_warnings = list(warnings)
    suitability_references = normalize_agronomy_rows(agronomy_rows, manifest)
    state_horticulture, state_warnings = normalize_horticulture_rows(
        horticulture_rows, manifest
    )
    national_context, national_warnings = normalize_national_rows(
        national_rows, manifest
    )
    weather_source = next(
        source
        for source in manifest["additionalDatasets"]
        if source["datasetId"] == "nasa-power-daily-maharashtra-2020-2025"
    )
    weather_manifest = {
        **weather_source,
        "weatherSeasonDefinition": manifest["weatherSeasonDefinition"],
    }
    weather_daily, weather_summaries = normalize_weather_rows(
        weather_rows,
        weather_location_rows,
        weather_manifest,
        weather_download_metadata or {},
    )
    market_observations, market_indicators, market_warnings = normalize_market_rows(
        market_rows, manifest, market_download_metadata
    )
    warnings.extend(state_warnings)
    warnings.extend(national_warnings)
    warnings.extend(market_warnings)
    coverage = manifest["coverage"]
    target_crop_ids = [crop["cropId"] for crop in coverage["crops"]]
    state_yields_by_source: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in state_horticulture:
        if record["cropId"] in target_crop_ids and record["yieldKgPerHectare"] is not None:
            state_yields_by_source[(record["cropId"], record["source"]["datasetId"])].append(record)
    regional_yield_series = []
    for (crop_id, source_dataset_id), records in sorted(state_yields_by_source.items()):
        values = [item["yieldKgPerHectare"] for item in records]
        mean_yield = statistics.fmean(values)
        regional_yield_series.append(
            {
                "cropId": crop_id,
                "datasetId": source_dataset_id,
                "geography": records[0]["geography"],
                "sampleCount": len(records),
                "observedYears": [item["year"] for item in records],
                "estimateStatuses": [item["estimateStatus"] for item in records],
                "summaryKgPerHectare": {
                    "minimum": _round(min(values)),
                    "median": _round(statistics.median(values)),
                    "maximum": _round(max(values)),
                    "mean": _round(mean_yield),
                    "coefficientOfVariationPct": _round(statistics.pstdev(values) / mean_yield * 100)
                    if mean_yield and len(values) >= 3
                    else None,
                },
                "observations": [
                    {
                        "year": item["year"],
                        "estimateStatus": item["estimateStatus"],
                        "yieldKgPerHectare": item["yieldKgPerHectare"],
                        "source": item["source"],
                    }
                    for item in records
                ],
                "interpretation": (
                    "Source-specific Maharashtra statistical yields; kept separate from other source series. "
                    "This short series does not support a forecast or farm-level accuracy claim."
                ),
            }
        )
    market_coverage = []
    for crop_id in target_crop_ids:
        crop_market_records = [item for item in market_observations if item["cropId"] == crop_id]
        market_coverage.append(
            {
                "cropId": crop_id,
                "status": "available" if crop_market_records else "unavailable",
                "observationCount": len(crop_market_records),
                "marketCount": len({item["marketId"] for item in crop_market_records}),
                "earliestDate": min((item["date"] for item in crop_market_records), default=None),
                "latestDate": max((item["date"] for item in crop_market_records), default=None),
                "reason": None
                if crop_market_records
                else f"No MSAMB or AGMARKNET market observations are loaded for {crop_id}.",
            }
        )
    regional_coverage = []
    for crop_id in target_crop_ids:
        crop_records = [item for item in state_horticulture if item["cropId"] == crop_id]
        regional_coverage.append(
            {
                "cropId": crop_id,
                "stateAreaYears": sorted(
                    {item["year"] for item in crop_records if item["areaHectares"] is not None}
                ),
                "stateProductionYears": sorted(
                    {item["year"] for item in crop_records if item["productionTonnes"] is not None}
                ),
                "stateYieldYears": sorted(
                    {item["year"] for item in crop_records if item["yieldKgPerHectare"] is not None}
                ),
                "latestStateYearWithArea": max(
                    (item["year"] for item in crop_records if item["areaHectares"] is not None),
                    default=None,
                ),
                "latestStateYearWithProduction": max(
                    (item["year"] for item in crop_records if item["productionTonnes"] is not None),
                    default=None,
                ),
            }
        )
    return {
        "schemaVersion": 3,
        "datasetId": manifest["datasetId"],
        "title": manifest["title"],
        "region": {
            "country": coverage["country"],
            "state": coverage["state"],
            "administrativeLevel": coverage["administrativeLevel"],
        },
        "coverage": {
            "years": coverage["years"],
            "crops": [crop["cropId"] for crop in coverage["crops"]],
            "season": coverage["season"],
        },
        "units": {
            "area": "hectares",
            "areaAlternate": "acres",
            "production": "metric_tonnes",
            "productionAlternate": "kilograms",
            "yield": "kilograms_per_hectare",
            "yieldAlternate": "kilograms_per_acre",
        },
        "source": {
            "publisher": manifest["publisher"],
            "dataProvider": manifest["dataProvider"],
            "title": manifest["title"],
            "sourceUrl": manifest["sourceUrl"],
            "accessedOn": manifest["accessedOn"],
            "publicationYear": manifest["publicationYear"],
            "estimateStatus": manifest["estimateStatus"],
            "licenseAndReuse": manifest["licenseAndReuse"],
            "transformations": manifest["cleaning"],
            "limitations": manifest["limitations"],
            "crops": [
                {
                    "cropId": crop["cropId"],
                    "table": crop["table"],
                    "printedPage": crop["printedPage"],
                }
                for crop in coverage["crops"]
            ],
        },
        "quality": {
            "sourceRecords": len(observations),
            "completeYieldRecords": sum(
                item["yieldKgPerAcre"] is not None for item in observations
            ),
            "incompleteYieldRecords": len(yield_warnings),
            "suitabilityReferenceRecords": len(suitability_references),
            "recentStateHorticultureRecords": len(state_horticulture),
            "nationalContextRecords": len(national_context),
            "weatherDailyObservations": len(weather_daily),
            "weatherSeasonalIndicators": len(weather_summaries),
            "marketObservations": len(market_observations),
            "marketIndicators": len(market_indicators),
            "warnings": warnings,
        },
        "additionalSources": manifest["additionalDatasets"],
        "regionalCropCoverage": regional_coverage,
        "agronomicReferenceSource": manifest["agronomicReference"],
        "cropSuitabilityReferences": suitability_references,
        "observations": observations,
        "baselines": baselines,
        "regionalYieldSeriesBySource": regional_yield_series,
        "regionalHorticultureObservations": state_horticulture,
        "nationalProductionContext": national_context,
        "weather": {
            "status": "available" if weather_daily else "unavailable",
            "source": {
                "datasetId": weather_source["datasetId"],
                "publisher": weather_source["publisher"],
                "title": weather_source["title"],
                "sourceUrl": weather_source["sourceUrl"],
                "documentationUrl": weather_source["documentationUrl"],
                "accessedOn": weather_source["accessedOn"],
                "timeStandard": weather_download_metadata.get("timeStandard")
                if weather_download_metadata
                else weather_source["timeStandard"],
                "sources": weather_download_metadata.get("sources", [])
                if weather_download_metadata
                else [],
                "licenseAndReuse": weather_source["licenseAndReuse"],
                "limitations": weather_source["limitations"],
            },
            "dailyObservations": weather_daily,
            "seasonalIndicators": weather_summaries,
            "forecast": {
                "status": "unavailable",
                "reason": "No forecast provider is configured; historical weather must not be used as future weather.",
            },
        },
        "historicalMarket": {
            "status": "available" if market_observations else "unavailable",
            "reason": None
            if market_observations
            else "No authorised dated market observations are loaded in the offline import files.",
            "coverageByCrop": market_coverage,
            "snapshot": market_download_metadata or None,
            "observations": market_observations,
            "indicators": market_indicators,
            "buyerDemand": "not_provided_by_market_data",
        },
        "farmConditionSchema": manifest["farmConditionSchema"],
    }


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source_file:
        return list(csv.DictReader(source_file))


def render_json(artifact: dict[str, Any]) -> str:
    return json.dumps(artifact, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument(
        "--agronomy-input",
        type=Path,
        default=ROOT / "data/agriculture/source/fao-ecocrop-requirements.csv",
    )
    parser.add_argument(
        "--horticulture-input",
        type=Path,
        default=ROOT / "data/agriculture/source/maharashtra-horticulture.csv",
    )
    parser.add_argument(
        "--national-input",
        type=Path,
        default=ROOT / "data/agriculture/source/national-horticulture.csv",
    )
    parser.add_argument(
        "--weather-input", type=Path, default=DEFAULT_WEATHER_SOURCE
    )
    parser.add_argument(
        "--weather-locations", type=Path, default=DEFAULT_WEATHER_LOCATIONS
    )
    parser.add_argument(
        "--weather-metadata", type=Path, default=DEFAULT_WEATHER_METADATA
    )
    parser.add_argument(
        "--market-input",
        type=Path,
        default=ROOT / "data/agriculture/source/agmarknet-prices-arrivals.csv",
    )
    parser.add_argument(
        "--msamb-market-input",
        type=Path,
        default=ROOT / "data/agriculture/source/msamb-market-prices-arrivals.csv",
    )
    parser.add_argument(
        "--market-metadata",
        type=Path,
        default=ROOT / "data/agriculture/source/msamb-market-download-metadata.json",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if the committed output differs from a fresh offline build.",
    )
    args = parser.parse_args(argv)

    with args.manifest.open("r", encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    with args.weather_metadata.open("r", encoding="utf-8") as metadata_file:
        weather_metadata = json.load(metadata_file)
    with args.market_metadata.open("r", encoding="utf-8") as metadata_file:
        market_metadata = json.load(metadata_file)
    artifact = build_artifact(
        read_csv(args.input),
        manifest,
        read_csv(args.agronomy_input),
        read_csv(args.horticulture_input),
        read_csv(args.national_input),
        read_csv(args.weather_input),
        read_csv(args.weather_locations),
        weather_metadata,
        read_csv(args.market_input) + read_csv(args.msamb_market_input),
        market_metadata,
    )
    rendered = render_json(artifact)

    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != rendered:
            print(f"Generated data is stale: run {Path(__file__).relative_to(ROOT)}", file=sys.stderr)
            return 1
        print(f"Verified {args.output.relative_to(ROOT)}")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(rendered, encoding="utf-8")
    print(f"Wrote {args.output.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
