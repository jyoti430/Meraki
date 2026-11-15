#!/usr/bin/env python3
"""Refresh the offline snapshot from MSAMB's public dated arrival/price page.

The MSAMB endpoint currently returns a short rolling window of recent reporting
days. This explicit command refreshes the CSV; normal artifact builds stay
offline and use the committed snapshot.
"""
from __future__ import annotations

import argparse
import csv
import json
import subprocess
import tempfile
from datetime import date, datetime
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data/agriculture/source/msamb-market-prices-arrivals.csv"
DEFAULT_METADATA = ROOT / "data/agriculture/source/msamb-market-download-metadata.json"
BASE_URL = "https://www.msamb.com"
MARKET_LIST_URL = f"{BASE_URL}/ApmcDetail/GetApmcForArrivalPriceInfo"
REPORT_URL = f"{BASE_URL}/ApmcDetail/DataGridBind"
COMMODITIES = (
    {"cropId": "tomato", "label": "Tomato", "sourceLabel": "टोमॅटो", "code": "08071"},
    {"cropId": "green-chilli", "label": "Green chilli", "sourceLabel": "मिरची (हिरवी)", "code": "10013"},
)


class ReportTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[list[str]] = []
        self._cells: list[str] = []
        self._parts: list[str] = []
        self._in_cell = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._cells = []
        elif tag in ("td", "th"):
            self._parts = []
            self._in_cell = True

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th") and self._in_cell:
            self._cells.append(" ".join("".join(self._parts).split()))
            self._in_cell = False
        elif tag == "tr" and self._cells:
            self.rows.append(self._cells)


def _curl_to_file(url: str, destination: Path, *, referer: str | None = None) -> None:
    command = [
        "curl",
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--max-time",
        "60",
    ]
    if referer:
        command.extend(["--header", "X-Requested-With: XMLHttpRequest", "--referer", referer])
    command.extend(["--output", str(destination), url])
    subprocess.run(command, check=True)


def _fetch_market_catalog() -> dict[str, str]:
    with tempfile.TemporaryDirectory(prefix="meraki-msamb-") as temp_dir:
        response_path = Path(temp_dir) / "markets.json"
        _curl_to_file(MARKET_LIST_URL, response_path)
        payload = json.loads(response_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload:
        raise ValueError("MSAMB returned an empty or unexpected APMC catalog")
    name_to_code: dict[str, str] = {}
    for item in payload:
        name = " ".join(str(item.get("ApmcNameM", "")).split())
        code = str(item.get("ApmcCode", "")).strip()
        if name and code:
            name_to_code[name] = code
    return name_to_code


def _parse_report(html: str, commodity: dict[str, str], name_to_code: dict[str, str]) -> list[dict[str, str]]:
    parser = ReportTableParser()
    parser.feed(html)
    current_date = ""
    records: list[dict[str, str]] = []
    for cells in parser.rows:
        if len(cells) == 1:
            try:
                current_date = datetime.strptime(cells[0], "%d/%m/%Y").date().isoformat()
            except ValueError:
                continue
            continue
        if len(cells) != 7:
            continue
        if not current_date:
            raise ValueError("MSAMB report row appeared before a dated reporting group")
        market_name = " ".join(cells[0].split())
        market_code = name_to_code.get(market_name)
        if market_code is None:
            raise ValueError(f"MSAMB market name is missing from its catalog: {market_name!r}")
        records.append(
            {
                "arrival_date": current_date,
                "state": "Maharashtra",
                "district": "",
                "market": market_name,
                "market_id": market_code,
                "commodity": commodity["label"],
                "source_commodity_label": commodity["sourceLabel"],
                "variety": "" if cells[1].strip("-— ") == "" else cells[1],
                "grade": "",
                "min_price_rs_per_unit": cells[4],
                "max_price_rs_per_unit": cells[5],
                "modal_price_rs_per_unit": cells[6],
                "prices_unit": cells[2],
                "arrivals_value": cells[3],
                "arrivals_unit": cells[2],
                "source_id": "msamb-market-latest-eight-reporting-days",
            }
        )
    if not records:
        raise ValueError(f"MSAMB returned no dated market rows for {commodity['label']}")
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--metadata-output", type=Path, default=DEFAULT_METADATA)
    args = parser.parse_args()

    name_to_code = _fetch_market_catalog()
    all_records: list[dict[str, str]] = []
    commodity_metadata = []
    for commodity in COMMODITIES:
        query = f"{REPORT_URL}?commodityCode={commodity['code']}&apmcCode=null"
        with tempfile.TemporaryDirectory(prefix="meraki-msamb-") as temp_dir:
            response_path = Path(temp_dir) / "report.html"
            _curl_to_file(query, response_path, referer=f"{BASE_URL}/ApmcDetail/APMCPriceInformation")
            records = _parse_report(response_path.read_text(encoding="utf-8"), commodity, name_to_code)
        dates = sorted({item["arrival_date"] for item in records})
        all_records.extend(records)
        commodity_metadata.append(
            {
                "cropId": commodity["cropId"],
                "commodityCode": commodity["code"],
                "rowCount": len(records),
                "windowStart": dates[0],
                "windowEnd": dates[-1],
                "dates": dates,
                "sourceUrl": query,
            }
        )

    all_records.sort(
        key=lambda row: (
            row["commodity"],
            row["arrival_date"],
            row["market_id"],
            row["variety"],
        )
    )
    fieldnames = (
        "arrival_date",
        "state",
        "district",
        "market",
        "market_id",
        "commodity",
        "source_commodity_label",
        "variety",
        "grade",
        "min_price_rs_per_unit",
        "max_price_rs_per_unit",
        "modal_price_rs_per_unit",
        "prices_unit",
        "arrivals_value",
        "arrivals_unit",
        "source_id",
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(all_records)

    dates = sorted({row["arrival_date"] for row in all_records})
    metadata = {
        "datasetId": "msamb-market-latest-eight-reporting-days",
        "retrievedOn": date.today().isoformat(),
        "windowStart": dates[0],
        "windowEnd": dates[-1],
        "distinctReportingDates": len(dates),
        "rowCount": len(all_records),
        "marketCatalogRowCount": len(name_to_code),
        "priceAndArrivalUnitCounts": {
            unit: sum(1 for row in all_records if row["prices_unit"] == unit)
            for unit in sorted({row["prices_unit"] for row in all_records})
        },
        "marketSource": "Maharashtra State Agricultural Marketing Board public APMC arrival and price page",
        "commodities": commodity_metadata,
    }
    args.metadata_output.parent.mkdir(parents=True, exist_ok=True)
    args.metadata_output.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(all_records)} MSAMB market observations ({dates[0]} to {dates[-1]}) to {args.output}")
    print(f"Wrote snapshot metadata to {args.metadata_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
