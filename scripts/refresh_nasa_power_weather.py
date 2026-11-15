#!/usr/bin/env python3
"""Download a small, offline NASA POWER daily-weather snapshot.

The normal data build is offline. Run this explicit refresh command when a new
historical window is desired, then review the raw CSV and update the manifest.
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import tempfile
from datetime import date
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOCATIONS = ROOT / "data/agriculture/source/nasa-power-locations.csv"
DEFAULT_OUTPUT = ROOT / "data/agriculture/source/nasa-power-daily-2020-2025.csv"
DEFAULT_METADATA = ROOT / "data/agriculture/source/nasa-power-download-metadata.json"
API_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETERS = ("T2M_MAX", "T2M_MIN", "PRECTOTCORR")
FILL_VALUE = -999.0


def _format_value(value: object, fill_value: float) -> str:
    if value is None:
        return str(int(fill_value))
    number = float(value)
    if number == fill_value:
        return str(int(fill_value))
    return format(number, ".8g")


def fetch_location(location: dict[str, str], start_year: int, end_year: int) -> tuple[list[dict[str, str]], dict]:
    start = f"{start_year}0101"
    end = f"{end_year}1231"
    query = urlencode(
        {
            "parameters": ",".join(PARAMETERS),
            "community": "AG",
            "longitude": location["longitude"],
            "latitude": location["latitude"],
            "start": start,
            "end": end,
            "time-standard": "LST",
            "format": "JSON",
        }
    )
    with tempfile.TemporaryDirectory(prefix="meraki-nasa-power-") as temp_dir:
        response_path = Path(temp_dir) / "response.json"
        subprocess.run(
            [
                "curl",
                "--fail",
                "--location",
                "--silent",
                "--show-error",
                "--max-time",
                "180",
                "--output",
                str(response_path),
                f"{API_URL}?{query}",
            ],
            check=True,
        )
        payload = json.loads(response_path.read_text(encoding="utf-8"))

    header = payload.get("header", {})
    if header.get("start") != start or header.get("end") != end:
        raise ValueError(f"NASA POWER returned an unexpected date range for {location['location_id']}")
    parameters = payload.get("parameters", {})
    units = {name: parameters.get(name, {}).get("units") for name in PARAMETERS}
    expected_units = {"T2M_MAX": "C", "T2M_MIN": "C", "PRECTOTCORR": "mm/day"}
    if units != expected_units:
        raise ValueError(f"NASA POWER returned unexpected units: {units}")
    parameter_values = payload.get("properties", {}).get("parameter", {})
    if set(parameter_values) != set(PARAMETERS):
        raise ValueError("NASA POWER response is missing a requested parameter")

    days: dict[str, dict[str, object]] = {}
    for parameter, values in parameter_values.items():
        for yyyymmdd, value in values.items():
            day = date.fromisoformat(f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:]}")
            if day.year < start_year or day.year > end_year:
                raise ValueError(f"NASA POWER returned an out-of-range date: {yyyymmdd}")
            days.setdefault(day.isoformat(), {})[parameter] = value

    expected_days = (date(end_year + 1, 1, 1) - date(start_year, 1, 1)).days
    if len(days) != expected_days:
        raise ValueError(
            f"NASA POWER returned {len(days)} days for {location['location_id']}; "
            f"expected {expected_days}"
        )

    rows = []
    for day in sorted(days):
        values = days[day]
        rows.append(
            {
                "date": day,
                "location_id": location["location_id"],
                "t2m_max_c": _format_value(values.get("T2M_MAX"), FILL_VALUE),
                "t2m_min_c": _format_value(values.get("T2M_MIN"), FILL_VALUE),
                "precipitation_mm_day": _format_value(values.get("PRECTOTCORR"), FILL_VALUE),
            }
        )

    response_metadata = {
        "api": header.get("api", {}),
        "sources": header.get("sources", []),
        "fillValue": header.get("fill_value", FILL_VALUE),
        "timeStandard": header.get("time_standard", "LST"),
        "units": units,
        "start": start,
        "end": end,
    }
    return rows, response_metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-year", type=int, default=2020)
    parser.add_argument("--end-year", type=int, default=2025)
    parser.add_argument("--locations", type=Path, default=DEFAULT_LOCATIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--metadata-output", type=Path, default=DEFAULT_METADATA)
    args = parser.parse_args()

    if args.start_year < 1981 or args.end_year < args.start_year:
        parser.error("years must be ordered and start at 1981 or later")

    with args.locations.open("r", encoding="utf-8-sig", newline="") as handle:
        locations = list(csv.DictReader(handle))
    if not locations:
        parser.error("the location file contains no reference points")

    all_rows: list[dict[str, str]] = []
    location_metadata = []
    for location in locations:
        rows, metadata = fetch_location(location, args.start_year, args.end_year)
        all_rows.extend(rows)
        location_metadata.append(
            {
                "locationId": location["location_id"],
                "name": location["location_name"],
                "district": location["district"],
                "latitude": float(location["latitude"]),
                "longitude": float(location["longitude"]),
                **metadata,
            }
        )

    all_rows.sort(key=lambda row: (row["location_id"], row["date"]))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=(
                "date",
                "location_id",
                "t2m_max_c",
                "t2m_min_c",
                "precipitation_mm_day",
            ),
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(all_rows)

    combined_sources = sorted(
        {source for item in location_metadata for source in item["sources"]}
    )
    args.metadata_output.write_text(
        json.dumps(
            {
                "datasetId": "nasa-power-daily-maharashtra-2020-2025",
                "downloadedOn": date.today().isoformat(),
                "startYear": args.start_year,
                "endYear": args.end_year,
                "parameters": list(PARAMETERS),
                "sources": combined_sources,
                "timeStandard": "LST",
                "locations": location_metadata,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(all_rows)} daily rows to {args.output}")
    print(f"Wrote API provenance metadata to {args.metadata_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
