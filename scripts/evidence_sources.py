"""Normalizers for secondary agricultural evidence streams.

These helpers keep national context, Maharashtra state statistics, NASA POWER
gridded weather, and MSAMB/AGMARKNET market observations at source geography.
They do not merge incompatible estimate rounds or impute missing values.
"""
from __future__ import annotations

import math
import re
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Iterable

MISSING_MARKERS = {"", "-", "–", "—", "na", "n/a", "null", "none"}
AREA_TO_HECTARES = {
    "hectare": 1.0,
    "hectares": 1.0,
    "ha": 1.0,
    "thousand hectare": 1_000.0,
    "thousand hectares": 1_000.0,
    "'000 ha": 1_000.0,
    "lakh hectare": 100_000.0,
    "lakh hectares": 100_000.0,
}
PRODUCTION_TO_TONNES = {
    "tonne": 1.0,
    "tonnes": 1.0,
    "metric tonne": 1.0,
    "metric tonnes": 1.0,
    "thousand tonne": 1_000.0,
    "thousand tonnes": 1_000.0,
    "thousand metric tonne": 1_000.0,
    "thousand metric tonnes": 1_000.0,
    "'000 mt": 1_000.0,
    "lakh tonne": 100_000.0,
    "lakh tonnes": 100_000.0,
    "kilogram": 0.001,
    "kilograms": 0.001,
    "kg": 0.001,
}
CROP_IDS = {
    "green chilli": "green-chilli",
    "green chillies": "green-chilli",
    "chillies green": "green-chilli",
    "chilli green": "green-chilli",
    "okra": "okra",
    "okra ladyfinger": "okra",
    "lady finger": "okra",
    "lady s finger": "okra",
    "tomato": "tomato",
    "tomatoes": "tomato",
    "vegetables": "vegetables-total",
    "vegetable": "vegetables-total",
}
CROP_NAMES = {
    "green-chilli": "Green chilli",
    "okra": "Okra",
    "tomato": "Tomato",
    "vegetables-total": "Vegetables (aggregate)",
}


def _number(value: Any, *, allow_negative: bool = False) -> float | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    if cleaned.lower() in MISSING_MARKERS or cleaned == "-999":
        return None
    try:
        number = float(cleaned.replace(",", ""))
    except ValueError as exc:
        raise ValueError(f"not a numeric source value: {value!r}") from exc
    if not math.isfinite(number) or (not allow_negative and number < 0):
        expectation = "finite" if allow_negative else "finite non-negative"
        raise ValueError(f"expected a {expectation} value, got {value!r}")
    return number


def _crop_id(value: str) -> str:
    key = re.sub(r"[^a-z0-9]+", " ", (value or "").casefold()).strip()
    try:
        return CROP_IDS[key]
    except KeyError as exc:
        raise ValueError(f"unmapped crop name: {value!r}") from exc


def _period_start(year_label: str) -> int:
    match = re.fullmatch(r"(\d{4})[-–](?:\d{2}|\d{4})", year_label.strip())
    if not match:
        raise ValueError(f"unsupported crop-year label: {year_label!r}")
    return int(match.group(1))


def _unit_factor(unit: str, factors: dict[str, float], measure: str) -> float:
    normalized = re.sub(r"\s+", " ", (unit or "").strip().casefold())
    if normalized not in factors:
        raise ValueError(f"unsupported {measure} unit: {unit!r}")
    return factors[normalized]


def _source_by_id(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {source["datasetId"]: source for source in manifest["additionalDatasets"]}


def _source_metadata(source: dict[str, Any], reference: str | None = None) -> dict[str, Any]:
    urls = source.get("sourceUrls")
    selected_url = reference if reference and reference.startswith("https://") else None
    metadata = {
        "datasetId": source["datasetId"],
        "publisher": source["publisher"],
        "title": source["title"],
        "sourceUrl": selected_url or (urls[0] if urls else source["sourceUrl"]),
        "sourceUrls": urls or [source["sourceUrl"]],
        "accessedOn": source["accessedOn"],
        "licenseAndReuse": source.get("licenseAndReuse"),
    }
    if reference and not reference.startswith("https://"):
        metadata["sourceReference"] = reference
    return metadata


def _converted_measure(value: Any, unit: str, factors: dict[str, float], measure: str) -> float | None:
    number = _number(value)
    if number is None:
        return None
    return number * _unit_factor(unit, factors, measure)


def _round(number: float | None, places: int = 2) -> float | None:
    return round(number, places) if number is not None else None


def normalize_horticulture_rows(
    rows: Iterable[dict[str, str]], manifest: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    sources = _source_by_id(manifest)
    observations: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()

    for row_number, row in enumerate(rows, start=2):
        crop_id = _crop_id(row.get("crop_label", ""))
        year = (row.get("year") or "").strip()
        _period_start(year)
        dataset_id = (row.get("dataset_id") or "").strip()
        if dataset_id not in sources:
            raise ValueError(f"row {row_number}: unknown source dataset {dataset_id!r}")
        source = sources[dataset_id]
        estimate_status = (row.get("estimate_status") or "").strip()
        if not estimate_status:
            raise ValueError(f"row {row_number}: estimate status is required")
        source_reference = (row.get("source_section") or row.get("source_reference") or "").strip()
        key = (crop_id, year, estimate_status, dataset_id)
        if key in seen:
            raise ValueError(f"row {row_number}: duplicate crop/year/status record {key}")
        seen.add(key)

        reported_area = _number(row.get("area_value"))
        reported_production = _number(row.get("production_value"))
        area_ha = _converted_measure(
            row.get("area_value"), row.get("area_unit", ""), AREA_TO_HECTARES, "area"
        )
        production_tonnes = _converted_measure(
            row.get("production_value"),
            row.get("production_unit", ""),
            PRODUCTION_TO_TONNES,
            "production",
        )
        if reported_area is not None and area_ha is None:
            raise ValueError(f"row {row_number}: could not normalize reported area")
        if reported_production is not None and production_tonnes is None:
            raise ValueError(f"row {row_number}: could not normalize reported production")

        yield_kg_per_hectare = None
        if area_ha is not None and area_ha > 0 and production_tonnes is not None:
            yield_kg_per_hectare = production_tonnes * 1_000 / area_ha
        elif crop_id != "vegetables-total":
            warnings.append(
                {
                    "cropId": crop_id,
                    "year": year,
                    "reason": "Target-crop production or area is unavailable; no crop yield was derived.",
                    "sourceDatasetId": dataset_id,
                }
            )

        observations.append(
            {
                "cropId": crop_id,
                "cropName": CROP_NAMES[crop_id],
                "year": year,
                "geography": {
                    "country": "India",
                    "state": "Maharashtra",
                    "administrativeLevel": "state",
                },
                "season": None,
                "reported": {
                    "area": {"value": reported_area, "unit": (row.get("area_unit") or "").strip() or None},
                    "production": {
                        "value": reported_production,
                        "unit": (row.get("production_unit") or "").strip() or None,
                    },
                },
                "areaHectares": _round(area_ha, 3),
                "areaAcres": _round(area_ha * 2.4710538147, 3) if area_ha is not None else None,
                "productionTonnes": _round(production_tonnes, 3),
                "productionKg": _round(production_tonnes * 1_000, 3)
                if production_tonnes is not None
                else None,
                "yieldKgPerHectare": _round(yield_kg_per_hectare),
                "yieldKind": "derived_statistical_estimate"
                if yield_kg_per_hectare is not None
                else None,
                "recordKind": "source_reported_official_statistic",
                "estimateStatus": estimate_status,
                "source": _source_metadata(source, source_reference),
            }
        )

    observations.sort(
        key=lambda item: (item["cropId"], _period_start(item["year"]), item["estimateStatus"])
    )
    return observations, warnings


def normalize_national_rows(
    rows: Iterable[dict[str, str]], manifest: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    sources = _source_by_id(manifest)
    observations: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str]] = set()

    for row_number, row in enumerate(rows, start=2):
        crop_id = _crop_id(row.get("crop_label", ""))
        year = (row.get("year") or "").strip()
        _period_start(year)
        dataset_id = (row.get("dataset_id") or "").strip()
        if dataset_id not in sources:
            raise ValueError(f"row {row_number}: unknown source dataset {dataset_id!r}")
        estimate_status = (row.get("estimate_status") or "").strip()
        if not estimate_status:
            raise ValueError(f"row {row_number}: estimate status is required")
        source_reference = (row.get("source_reference") or "").strip()
        key = (crop_id, year, estimate_status, dataset_id)
        if key in seen:
            raise ValueError(f"row {row_number}: duplicate crop/year/round record {key}")
        seen.add(key)

        area_value = _number(row.get("area_value"))
        production_value = _number(row.get("production_value"))
        area_ha = _converted_measure(
            row.get("area_value"), row.get("area_unit", ""), AREA_TO_HECTARES, "area"
        )
        production_tonnes = _converted_measure(
            row.get("production_value"),
            row.get("production_unit", ""),
            PRODUCTION_TO_TONNES,
            "production",
        )
        if (area_value is None) != (area_ha is None):
            raise ValueError(f"row {row_number}: area value and unit are inconsistent")
        if (production_value is None) != (production_tonnes is None):
            raise ValueError(f"row {row_number}: production value and unit are inconsistent")

        yield_kg_per_hectare = None
        if area_ha is not None and area_ha > 0 and production_tonnes is not None:
            yield_kg_per_hectare = production_tonnes * 1_000 / area_ha
        else:
            warnings.append(
                {
                    "cropId": crop_id,
                    "year": year,
                    "reason": "National context is incomplete; no yield was derived.",
                    "sourceDatasetId": dataset_id,
                }
            )

        observations.append(
            {
                "cropId": crop_id,
                "cropName": CROP_NAMES[crop_id],
                "year": year,
                "geography": {"country": "India", "administrativeLevel": "country"},
                "reported": {
                    "area": {"value": area_value, "unit": (row.get("area_unit") or "").strip() or None},
                    "production": {
                        "value": production_value,
                        "unit": (row.get("production_unit") or "").strip() or None,
                    },
                },
                "areaHectares": _round(area_ha, 3),
                "productionTonnes": _round(production_tonnes, 3),
                "yieldKgPerHectare": _round(yield_kg_per_hectare),
                "yieldKind": "derived_statistical_estimate"
                if yield_kg_per_hectare is not None
                else None,
                "recordKind": "source_reported_official_statistic",
                "estimateStatus": estimate_status,
                "source": _source_metadata(sources[dataset_id], source_reference),
            }
        )

    observations.sort(
        key=lambda item: (item["cropId"], _period_start(item["year"]), item["estimateStatus"])
    )
    return observations, warnings


def _weather_number(value: Any, field: str) -> float | None:
    number = _number(value, allow_negative=field in {"temperature_max", "temperature_min"})
    if field == "precipitation" and number is not None and number < 0:
        raise ValueError(f"precipitation cannot be negative: {value!r}")
    return number


def normalize_weather_rows(
    rows: Iterable[dict[str, str]],
    location_rows: Iterable[dict[str, str]],
    weather_manifest: dict[str, Any],
    download_metadata: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    locations = {row["location_id"]: row for row in location_rows}
    expected_locations = {item["locationId"] for item in download_metadata["locations"]}
    if set(locations) != expected_locations:
        raise ValueError("weather location CSV does not match the NASA download metadata")
    years = weather_manifest["coverage"]["years"]
    expected_start = f"{years[0]}0101"
    expected_end = f"{years[-1]}1231"
    expected_time_standard = (
        "LST"
        if "LST" in weather_manifest["timeStandard"]
        else weather_manifest["timeStandard"]
    )
    if download_metadata["startYear"] != int(years[0]) or download_metadata["endYear"] != int(years[-1]):
        raise ValueError("NASA weather download years do not match the source manifest")
    if any(
        item["start"] != expected_start
        or item["end"] != expected_end
        or item["timeStandard"] != expected_time_standard
        for item in download_metadata["locations"]
    ):
        raise ValueError("NASA weather download metadata has a mismatched time range or standard")

    daily: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    by_location: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row_number, row in enumerate(rows, start=2):
        location_id = (row.get("location_id") or "").strip()
        if location_id not in locations:
            raise ValueError(f"weather row {row_number}: unknown location {location_id!r}")
        try:
            observed_date = date.fromisoformat((row.get("date") or "").strip())
        except ValueError as exc:
            raise ValueError(f"weather row {row_number}: invalid date {row.get('date')!r}") from exc
        if observed_date.year < int(years[0]) or observed_date.year > int(years[-1]):
            raise ValueError(f"weather row {row_number}: date is outside manifest coverage")
        key = (location_id, observed_date.isoformat())
        if key in seen:
            raise ValueError(f"weather row {row_number}: duplicate location/date record {key}")
        seen.add(key)
        max_temp = _weather_number(row.get("t2m_max_c"), "temperature_max")
        min_temp = _weather_number(row.get("t2m_min_c"), "temperature_min")
        precipitation = _weather_number(row.get("precipitation_mm_day"), "precipitation")
        if max_temp is not None and min_temp is not None and max_temp < min_temp:
            raise ValueError(f"weather row {row_number}: maximum temperature is below minimum")
        location = locations[location_id]
        observation = {
            "date": observed_date.isoformat(),
            "locationId": location_id,
            "locationName": location["location_name"],
            "district": location["district"],
            "state": location["state"],
            "geographicLevel": "project_selected_city_reference_point",
            "coordinates": {
                "latitude": float(location["latitude"]),
                "longitude": float(location["longitude"]),
            },
            "temperatureMaxC": _round(max_temp, 3),
            "temperatureMinC": _round(min_temp, 3),
            "precipitationMmPerDay": _round(precipitation, 3),
            "recordKind": "gridded_historical_meteorological_estimate",
            "dataProductSources": download_metadata["sources"],
            "timeStandard": download_metadata["timeStandard"],
            "datasetId": weather_manifest["datasetId"],
        }
        daily.append(observation)
        by_location[location_id].append(observation)

    if not daily:
        raise ValueError("NASA weather source contains no daily rows")

    summaries = []
    for location_id, observations in sorted(by_location.items()):
        for year in years:
            season_days = [
                item
                for item in observations
                if item["date"].startswith(f"{year}-")
                and 6 <= int(item["date"][5:7]) <= 9
            ]
            if not season_days:
                continue
            season_start = date(int(year), 6, 1)
            expected_days = (date(int(year), 10, 1) - season_start).days
            rain_values = [item["precipitationMmPerDay"] for item in season_days]
            valid_rain = [value for value in rain_values if value is not None]
            rain_complete = len(valid_rain) == expected_days and len(season_days) == expected_days
            observed_rain_total = sum(valid_rain) if valid_rain else None
            dry_threshold = float(manifest_value(weather_manifest, "dryDayThresholdMm", 1))
            heat_threshold = float(manifest_value(weather_manifest, "heatThresholdC", 35))
            longest_dry_run = 0
            current_dry_run = 0
            observed_dates = {item["date"] for item in season_days}
            for offset in range(expected_days):
                current_date = (season_start + timedelta(days=offset)).isoformat()
                value_by_date = next(
                    (item["precipitationMmPerDay"] for item in season_days if item["date"] == current_date),
                    None,
                )
                value = value_by_date if current_date in observed_dates else None
                if value is not None and value < dry_threshold:
                    current_dry_run += 1
                    longest_dry_run = max(longest_dry_run, current_dry_run)
                else:
                    current_dry_run = 0
            max_values = [item["temperatureMaxC"] for item in season_days if item["temperatureMaxC"] is not None]
            min_values = [item["temperatureMinC"] for item in season_days if item["temperatureMinC"] is not None]
            summaries.append(
                {
                    "locationId": location_id,
                    "locationName": observations[0]["locationName"],
                    "district": observations[0]["district"],
                    "year": year,
                    "seasonId": "monsoon-june-september",
                    "periodStart": f"{year}-06-01",
                    "periodEnd": f"{year}-09-30",
                    "expectedDays": expected_days,
                    "rainfallObservedDays": len(valid_rain),
                    "rainfallMissingDays": expected_days - len(valid_rain),
                    "rainfallComplete": rain_complete,
                    "totalPrecipitationMm": _round(observed_rain_total) if rain_complete else None,
                    "observedPrecipitationSumMm": _round(observed_rain_total),
                    "meanDailyMaximumTemperatureC": _round(statistics.fmean(max_values)) if max_values else None,
                    "highestDailyMaximumTemperatureC": _round(max(max_values)) if max_values else None,
                    "heatThresholdC": heat_threshold,
                    "daysAtOrAboveHeatThreshold": sum(value >= heat_threshold for value in max_values),
                    "temperatureMaximumObservedDays": len(max_values),
                    "meanDailyMinimumTemperatureC": _round(statistics.fmean(min_values)) if min_values else None,
                    "dryDayThresholdMm": dry_threshold,
                    "longestObservedDrySpellDays": longest_dry_run,
                    "drySpellCoverageComplete": rain_complete,
                    "recordKind": "derived_historical_season_indicator",
                    "datasetId": weather_manifest["datasetId"],
                    "interpretation": "Historical gridded weather summary; not a crop-specific risk score or forecast.",
                }
            )

    daily.sort(key=lambda item: (item["locationId"], item["date"]))
    summaries.sort(key=lambda item: (item["locationId"], item["year"]))
    return daily, summaries


def manifest_value(weather_manifest: dict[str, Any], key: str, default: Any) -> Any:
    return weather_manifest.get("weatherSeasonDefinition", {}).get(key, default)


def _market_date(value: str) -> str:
    cleaned = (value or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return date.fromisoformat(cleaned).isoformat()
    except ValueError as exc:
        raise ValueError(f"unsupported market observation date: {value!r}") from exc


def _slug(value: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.casefold())).strip("-")


def _arrival_tonnes(value: float | None, unit: str) -> float | None:
    if value is None:
        return None
    normalized_source = unit.strip().casefold()
    localized_units = {"क्विंटल": "quintal", "क्विन्टल": "quintal"}
    normalized = localized_units.get(
        normalized_source,
        re.sub(r"[^a-z0-9]+", " ", normalized_source).strip(),
    )
    factors = {
        "tonne": 1.0,
        "tonnes": 1.0,
        "metric tonne": 1.0,
        "metric tonnes": 1.0,
        "mt": 1.0,
        "kilogram": 0.001,
        "kilograms": 0.001,
        "kg": 0.001,
        "quintal": 0.1,
        "quintals": 0.1,
        "qtl": 0.1,
    }
    return value * factors[normalized] if normalized in factors else None


def _price_inr_per_kg(value: float | None, unit: str) -> float | None:
    if value is None:
        return None
    normalized_source = (unit or "").strip().casefold()
    localized_units = {"क्विंटल": "quintal", "क्विन्टल": "quintal"}
    normalized = localized_units.get(
        normalized_source,
        re.sub(r"[^a-z0-9]+", " ", normalized_source).strip(),
    )
    kilograms_per_unit = {
        "quintal": 100.0,
        "quintals": 100.0,
        "qtl": 100.0,
        "tonne": 1_000.0,
        "tonnes": 1_000.0,
        "metric tonne": 1_000.0,
        "metric tonnes": 1_000.0,
        "mt": 1_000.0,
        "kilogram": 1.0,
        "kilograms": 1.0,
        "kg": 1.0,
    }
    denominator_kg = kilograms_per_unit.get(normalized)
    return value / denominator_kg if denominator_kg is not None else None


def _market_price_value(row: dict[str, str], bound: str) -> float | None:
    value = row.get(f"{bound}_price_rs_per_unit")
    if value is None or not str(value).strip():
        value = row.get(f"{bound}_price_rs_per_quintal")
    return _number(value)


def normalize_market_rows(
    rows: Iterable[dict[str, str]],
    manifest: dict[str, Any],
    download_metadata: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    datasets = _source_by_id(manifest)
    observations = []
    warnings = []
    seen = set()
    for row_number, row in enumerate(rows, start=2):
        source_id = (row.get("source_id") or "agmarknet-offline-market-import").strip()
        dataset = datasets.get(source_id)
        if dataset is None:
            raise ValueError(f"market row {row_number}: unknown source id {source_id!r}")
        crop_id = _crop_id(row.get("commodity", ""))
        if crop_id == "vegetables-total":
            raise ValueError(f"market row {row_number}: aggregate vegetables are not a commodity observation")
        observed_date = _market_date(row.get("arrival_date", ""))
        state = (row.get("state") or "").strip()
        district = (row.get("district") or "").strip() or None
        market = (row.get("market") or "").strip()
        if not state or not market or (not district and source_id == "agmarknet-offline-market-import"):
            raise ValueError(f"market row {row_number}: state, market and required district are required")
        variety_value = (row.get("variety") or "").strip()
        variety = None if variety_value.casefold() in MISSING_MARKERS | {"---"} else variety_value
        grade = (row.get("grade") or "").strip() or None
        external_market_id = (row.get("market_id") or "").strip()
        key = (source_id, external_market_id.casefold(), state.casefold(), (district or "").casefold(), market.casefold(), crop_id, observed_date, variety, grade)
        if key in seen:
            raise ValueError(f"market row {row_number}: duplicate market/crop/date/variety/grade observation")
        seen.add(key)

        minimum = _market_price_value(row, "min")
        maximum = _market_price_value(row, "max")
        modal = _market_price_value(row, "modal")
        if minimum is not None and maximum is not None and minimum > maximum:
            raise ValueError(f"market row {row_number}: minimum price exceeds maximum price")
        if modal is not None and minimum is not None and modal < minimum:
            raise ValueError(f"market row {row_number}: modal price is below minimum price")
        if modal is not None and maximum is not None and modal > maximum:
            raise ValueError(f"market row {row_number}: modal price exceeds maximum price")
        arrivals_value = _number(row.get("arrivals_value"))
        arrivals_unit = (row.get("arrivals_unit") or "").strip() or None
        arrivals_tonnes = _arrival_tonnes(arrivals_value, arrivals_unit or "")
        source_price_unit = (
            (row.get("prices_unit") or "").strip()
            or (arrivals_unit if source_id == "msamb-market-latest-eight-reporting-days" else "quintal")
        )
        price_inr_per_kg = {
            "minimum": _price_inr_per_kg(minimum, source_price_unit),
            "maximum": _price_inr_per_kg(maximum, source_price_unit),
            "modal": _price_inr_per_kg(modal, source_price_unit),
        }
        price_unit_is_weight = source_price_unit and any(
            value is not None for value in price_inr_per_kg.values()
        )
        if any(value is not None for value in (minimum, maximum, modal)) and not price_unit_is_weight:
            warnings.append(
                {
                    "cropId": crop_id,
                    "date": observed_date,
                    "reason": f"Price unit {source_price_unit!r} is not a recognized mass unit; raw prices are preserved and INR/kg is unavailable.",
                    "sourceDatasetId": source_id,
                }
            )
        if arrivals_value is not None and arrivals_tonnes is None:
            warnings.append(
                {
                    "cropId": crop_id,
                    "date": observed_date,
                    "reason": f"Arrival unit {arrivals_unit!r} cannot be converted to tonnes; raw arrivals are preserved.",
                    "sourceDatasetId": source_id,
                }
            )
        if external_market_id:
            market_id = f"{source_id.removesuffix('-latest-eight-reporting-days')}:{external_market_id}"
        else:
            market_id = "-".join(filter(None, (_slug(state), _slug(district or ""), _slug(market))))
        source = _source_metadata(
            dataset,
            (row.get("source_reference") or "").strip() or "daily market price and arrival report",
        )
        if download_metadata and download_metadata.get("retrievedOn"):
            source["accessedOn"] = download_metadata["retrievedOn"]
        observations.append(
            {
                "marketId": market_id,
                "sourceMarketCode": external_market_id or None,
                "marketName": market,
                "state": state,
                "district": district,
                "cropId": crop_id,
                "cropName": CROP_NAMES[crop_id],
                "sourceCommodityLabel": (row.get("source_commodity_label") or "").strip() or None,
                "date": observed_date,
                "variety": variety,
                "grade": grade,
                "sourcePricesInrPerUnit": {
                    "minimum": _round(minimum),
                    "maximum": _round(maximum),
                    "modal": _round(modal),
                },
                "sourcePriceUnit": source_price_unit or None,
                "priceInrPerKg": {key: _round(value) for key, value in price_inr_per_kg.items()},
                "priceSpreadInrPerKg": _round(price_inr_per_kg["maximum"] - price_inr_per_kg["minimum"])
                if price_inr_per_kg["minimum"] is not None and price_inr_per_kg["maximum"] is not None
                else None,
                "arrivals": {
                    "sourceValue": arrivals_value,
                    "sourceUnit": arrivals_unit,
                    "tonnes": _round(arrivals_tonnes, 3),
                },
                "recordKind": "historical_market_observation",
                "source": source,
            }
        )

    grouped: dict[tuple, list[dict[str, Any]]] = defaultdict(list)
    for observation in observations:
        grouped[
            (
                observation["source"]["datasetId"],
                observation["marketId"],
                observation["cropId"],
                observation["variety"],
                observation["grade"],
            )
        ].append(observation)

    indicators = []
    for (dataset_id, market_id, crop_id, variety, grade), records in sorted(
        grouped.items(),
        key=lambda entry: tuple("" if value is None else str(value) for value in entry[0]),
    ):
        modal_prices = [item["priceInrPerKg"]["modal"] for item in records if item["priceInrPerKg"]["modal"] is not None]
        mean_price = statistics.fmean(modal_prices) if modal_prices else None
        month_samples: dict[int, list[tuple[str, float]]] = defaultdict(list)
        for item in records:
            modal = item["priceInrPerKg"]["modal"]
            if modal is not None:
                month_samples[int(item["date"][5:7])].append((item["date"], modal))
        arrivals = [item for item in records if item["arrivals"]["tonnes"] is not None]
        arrivals.sort(key=lambda item: item["date"])
        arrival_values = [item["arrivals"]["tonnes"] for item in arrivals]
        first_arrival = arrival_values[0] if arrival_values else None
        latest_arrival = arrival_values[-1] if arrival_values else None
        arrival_change = (
            _round((latest_arrival - first_arrival) / first_arrival * 100)
            if len({item["date"] for item in arrivals}) >= 2
            and first_arrival not in (None, 0)
            and latest_arrival is not None
            else None
        )
        earliest_date = min(item["date"] for item in records)
        latest_date = max(item["date"] for item in records)
        temporal_window_days = (date.fromisoformat(latest_date) - date.fromisoformat(earliest_date)).days + 1
        reporting_dates = sorted({item["date"] for item in records})
        indicators.append(
            {
                "datasetId": dataset_id,
                "marketId": market_id,
                "marketName": records[0]["marketName"],
                "district": records[0]["district"],
                "cropId": crop_id,
                "variety": variety,
                "grade": grade,
                "observationCount": len(records),
                "priceObservationCount": len(modal_prices),
                "earliestDate": earliest_date,
                "latestDate": latest_date,
                "temporalWindowDays": temporal_window_days,
                "reportingDateCount": len(reporting_dates),
                "minimumModalPriceInrPerKg": _round(min(modal_prices)) if modal_prices else None,
                "medianModalPriceInrPerKg": _round(statistics.median(modal_prices)) if modal_prices else None,
                "maximumModalPriceInrPerKg": _round(max(modal_prices)) if modal_prices else None,
                "priceCoefficientOfVariationPct": _round(statistics.pstdev(modal_prices) / mean_price * 100)
                if mean_price and len(modal_prices) >= 2
                else None,
                "observedMonthSummariesInrPerKg": [
                    {
                        "month": month,
                        "median": _round(statistics.median(value for _, value in values)),
                        "sampleCount": len(values),
                        "sampledDates": sorted({day for day, _ in values}),
                        "scope": "observed_days_only_not_full_month",
                    }
                    for month, values in sorted(month_samples.items())
                ],
                "arrivalObservationCount": len(arrivals),
                "meanDailyArrivalsTonnes": _round(statistics.fmean(arrival_values), 3)
                if arrival_values
                else None,
                "minimumDailyArrivalsTonnes": _round(min(arrival_values), 3)
                if arrival_values
                else None,
                "maximumDailyArrivalsTonnes": _round(max(arrival_values), 3)
                if arrival_values
                else None,
                "arrivalChangePctBetweenFirstAndLastObservedDay": arrival_change,
                "arrivalSignalStatus": "observations_available_not_regional_supply"
                if arrivals
                else "unavailable",
                "interpretation": "Short-window descriptive market context; price variability is limited to the returned reporting days and arrivals are market-level observations, not regional production or complete supply.",
                "recordKind": "derived_historical_market_indicator",
                "sourceDatasetId": dataset_id,
            }
        )

    return observations, indicators, warnings
