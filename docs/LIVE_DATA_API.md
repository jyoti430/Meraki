# Public reference data gateway

This separate read-only service retrieves public data for three named Maharashtra reference centres. It does not collect farm coordinates or personal records, alter the planner, establish water access, create buyer demand, or authorise live trading. All returned source records have `synthetic: false`; source unavailability produces an explicit error or clearly stale previously retrieved data.

Run from the repository root using the existing pinned Python environment:

```sh
python -m uvicorn server.live_data:app --host 127.0.0.1 --port 8002
python -m pytest server/tests/test_live_data.py -q
```

The `create_app(transport=..., clock=...)` factory permits deterministic HTTP transport/clock injection in tests. Runtime defaults use actual HTTPS requests. No API key is required by these public endpoints. This is a development reference gateway, separate from production identity/capacity integration.

## API contract

Every resource endpoint is a public GET. Unknown/duplicate query parameters and values outside the allowlists fail with HTTP 422 before any upstream request. No client-supplied URL, coordinates, arbitrary date range, farm ID or personal fields are accepted. Redirects are not followed.

| Endpoint | Result |
|---|---|
| `/api/live-data/health` | `{status: "ok", mode: "public_reference_development", synthetic: false, server_time, upstream_health: "not_probed", private_farm_data: false}`; process health does not imply provider health |
| `/api/live-data/locations` | `{locations: [{id, name, latitude, longitude, scope: "public_reference"}], crops: [{id, name}]}` |
| `/api/live-data/forecast?location=nashik` | One forecast envelope, seven daily rows |
| `/api/live-data/history?location=nashik` | One NASA POWER envelope, thirty daily rows ending seven UTC dates before today |
| `/api/live-data/market?crop=tomato` | One MSAMB envelope, rows from the latest dated report only |
| `/api/live-data/snapshot?location=nashik&crop=tomato` | `{server_time, forecast: Envelope, history: Envelope, market: Envelope}`; three independent requests run concurrently |

Location IDs: `nashik` (19.9975, 73.7898), `pune` (18.5204, 73.8567), `satara` (17.6805, 74.0183). These are public city reference centres, not field locations. Crop IDs: `tomato` and `green_chilli`. Defaults are `nashik` and `tomato`. Market observations have `location: null` because the statewide report is not silently matched to the selected reference city.

```text
Envelope = {
  source_id, source_name, source_url, documentation_url, attribution, licence,
  data_kind: "forecast" | "gridded_historical_estimate" | "market_observation",
  status: "ok" | "partial" | "stale" | "error",
  synthetic: false,
  location: Location | null,
  time_basis: "Asia/Kolkata" | "UTC",
  retrieved_at: UTC timestamp | null,
  available_at: UTC timestamp | null,
  provider_issued_at: null,
  attempted_at: UTC timestamp,
  observation_start: YYYY-MM-DD | null,
  observation_end: YYYY-MM-DD | null,
  cache: {hit: boolean, ttl_seconds: number, expires_at: UTC timestamp | null},
  warnings: string[],
  error: {code, message} | null,
  units: Record<string, string>,
  payload_sha256: string | null,
  data: Row[]
}
```

Weather rows are `{date, t2m_min_c, t2m_max_c, precipitation_mm_day}`; forecast rows additionally include `et0_mm_day`. Measurements are finite numbers or `null`. Units are degrees Celsius and mm/day. **Forecast dates use Asia/Kolkata; NASA history uses UTC.** The envelope's `time_basis` and `units.date` state that difference explicitly. Dates are complete, unique and checked against the requested range; array lengths, source units, point-region geometry, finite physical bounds and minimum/maximum relationships are validated. NASA's declared missing sentinel is converted to `null`, never zero. `partial` means some measurements are missing; it does not impute them or claim all observations exist.

Market rows are `{observation_date, market, commodity, variety, grade, price_min_rs_per_unit, price_max_rs_per_unit, price_modal_rs_per_unit, price_unit, arrivals_value, arrivals_unit}`. Numeric values are finite/nonnegative or `null`; variety and grade can be unknown. The original source unit is retained in each row, including Marathi unit labels. No conversion to INR/kg or inferred grade is performed. Market min/max/modal ordering and explicit dates are checked; future dates fail. The latest observation date is separate from retrieval time. Reports older than three calendar days have `status: "stale"` even after a successful retrieval.

HTTP 200 with source `status: "error"` denotes provider unavailability or rejected provider schema; the snapshot remains useful when another source succeeds. Error responses have empty `data` and null successful-retrieval/availability timestamps. Error codes include `upstream_http`, `timeout`, `network_error`, `response_too_large` and `schema_invalid`; provider response bodies and local exception details are not exposed. The frontend should display the source state and error, including for HTTP 200.

## Time, cache and operational limits

`provider_issued_at` remains null: no usable provider publication/forecast-run timestamp is supplied by the selected endpoints. Open-Meteo `generationtime_ms` is response computation time, **not** a publication timestamp. `available_at` equals successful retrieval completion as a conservative knowledge timestamp for this gateway. It must not be backdated to an observation or forecast-valid date. Cache hits retain their original retrieval/knowledge timestamps; a failed refresh never makes an old value newly available.

Each upstream operation has a 15-second absolute async deadline, a maximum 600,000 decoded response bytes, fixed HTTPS destinations, no redirects and at most four client connections. Snapshot operations run concurrently. Latest market output is bounded to 500 rows; raw table parsing is bounded to 5,000 rows. Source bodies are not persisted.

An in-memory singleflight cache shares concurrent requests for each allowlisted source/reference key. TTLs are 15 minutes for forecasts, six hours for historical weather and 30 minutes for market reports. Failed requests have a 60-second retry cooldown. A refresh failure may return a known prior observation with `status: "stale"`, retained provenance and an explicit refresh error, for at most six hours (forecast), seven days (history) or three days (market). A changed requested weather period cannot replay a different period. Restart discards the cache; it does not pretend the source has already been fetched. Multi-process or deployed operation needs a shared cache/rate policy appropriate to provider terms; this module establishes no commercial access agreement.

## Verified source documentation and use constraints

- [Open-Meteo forecast documentation](https://open-meteo.com/en/docs) documents daily forecast variables and their returned units. Its [hosted-service terms](https://open-meteo.com/en/terms) restrict the free service to non-commercial use, with published request limits. Its [data licence](https://open-meteo.com/en/licence) requires attribution, a licence link and indication of changes under CC BY 4.0. The envelope supplies attribution and identifies selection/normalisation; display a link beside the source. Commercial/promotion use requires appropriate service terms; data licensing alone does not remove the hosted API restriction.
- [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) supports point daily data with explicit UTC/LST time standards. [NASA data services](https://power.larc.nasa.gov/docs/services/) explain the meteorological grid and later climate-quality revisions. Its [data FAQ](https://power.larc.nasa.gov/docs/faqs/data/) reports approximately 2–3-day meteorological latency. The gateway requests a conservative seven-day-lagged, thirty-day window and validates every requested date; it does not claim this is a provider-certified latest-complete archive or a farm observation. [NASA POWER acknowledgements](https://power.larc.nasa.gov/docs/acknowledgements/) identify the source project and contributors.
- [MSAMB's public APMC price/arrival page](https://www.msamb.com/ApmcDetail/APMCPriceInformation) exposes dated public market rows. The gateway calls the fixed public `DataGridBind` report for two allowlisted commodity codes; it does not access login-only records or crawl arbitrary pages. Broader redistribution/commercial/training permission has not been established. Public observations are not confirmed buyer commitments or price predictions. Existing agricultural snapshot refresh scripts were inspected as an endpoint/schema reference; this gateway does not run their `main` functions or overwrite their committed snapshots.

## Actual live retrieval evidence

On **15 November 2026 at 18:19 UTC** (16 November in Singapore), a real gateway snapshot request for Nashik and tomato completed successfully. These are small retrieval metadata, not mocked test outcomes or a guarantee of future availability:

| Source | Result | Observation/valid period | Rows | Retrieval UTC | Raw payload SHA-256 |
|---|---|---|---:|---|---|
| Open-Meteo | `ok` | 15–21 Nov 2026, Asia/Kolkata dates | 7 | `2026-11-15T18:19:25.902312Z` | `d9271d53760a78a41c9556a580e6727ce820317164f52bddc21730fbf5fbabb7` |
| NASA POWER | `ok` | 10 Oct–8 Nov 2026, UTC dates | 30 | `2026-11-15T18:19:26.150121Z` | `58d9a723fb2f29295cae29a3a3e0ca67d621c1a2edb3c96eec7f80a5b5284a4a` |
| MSAMB tomato | `ok` | 15 Nov 2026 report | 17 | `2026-11-15T18:19:25.727580Z` | `8f21428653579c254874d30d9b346b07f373b225f01bb02bc8717c6ebde68905` |
| MSAMB green chilli | `ok` | 15 Nov 2026 report | 14 | `2026-11-15T18:22:53.172251Z` | `cad38da4a0d0b2827a22c1228d872c912ca0b1c0b05d2c2f38f911838cbb1e0d` |

The green-chilli request was a separate live verification at 18:22 UTC. Every response had `provider_issued_at: null`; `available_at` equalled the stated retrieval time. No private records, credentials, personal coordinates or model-training consent were inferred from those retrievals. Other weather locations remain source-dependent and are exercised with mocked transports in automated tests unless a later explicit evidence entry records a real request.
