# Part 1 farm data and crop intelligence (development slice)

> **Status (17 November 2026):** the `/farm-intelligence` route currently redirects to the FPO overview (`/fpo`). The workspace (`src/pages/FarmIntelligence.tsx` and `src/farmdata/`) and its regression tests remain in the repository as an experimental implementation. The behaviour and browser walkthrough below describe that implementation; the page is not reachable in the current app without restoring its route.

This module is a browser-local development workspace at `/farm-intelligence`. It implements the data-contract and workflow slices of T01, T02, T03 and T08: reviewed soil imports, weather/water evidence, planned versus actual cultivation records, an explainable pre-sowing screen and immutable versioned weekly supply projections.

This farm workspace connects to **no farm-specific weather, laboratory, groundwater or procurement feed**. Its shipped scenarios are labelled synthetic. The separate [public context page](LIVE_DATA.md) (whose `/live-data` route also currently redirects to the overview) retrieves real regional forecasts, historical weather and dated market observations; these are not silently assigned to farm plots or used to certify the synthetic crop scenarios. None of the parent tasks is complete at production or field acceptance; the gaps are listed below. Working rules are in [AGENTS.md](../AGENTS.md), task acceptance criteria in [Agent.md](../Agent.md) and product requirements in [EXECUTION_PLAN.md](EXECUTION_PLAN.md).

## Implemented behaviour

| Area | Source | Behaviour |
|---|---|---|
| Soil import | `src/farmdata/soil.ts`, `csv.ts` | Plot-linked CSV template that preserves raw value, raw unit, normalised value/unit, method, analyte basis, depth range, sample date and source row. Unknown plot, incompatible or unparseable unit, invalid number/date, future sample date, missing column and duplicate analyte rows are rejected with row-level reasons; nothing is guessed or silently converted. |
| Soil evidence | `resolveSoilEvidence` | Measured laboratory, field-kit and sensor records resolve at the decision date; stale evidence is flagged, not dropped. Mapped estimates are held alongside and can never overwrite a measured result. Total nitrogen and available nitrogen are separate analytes. |
| Weather adapter | `src/farmdata/weather.ts` | Deterministic synthetic adapter with issue time and horizon per record, plus an injectable failure path. Forecasts issued after the decision date are excluded. A failed run is recorded as failed with no fabricated zero-rainfall records. |
| Water feasibility | `src/farmdata/water.ts` | Uses the farm's own recorded source, rights, reliability, pump discharge, pumping hours, shared allocation, storage and an explicit indicative crop requirement. Rainfed or no-rights records yield `none`; incomplete capacity yields `unknown`; regional observation-well readings are never inputs. |
| Cultivation records | `src/farmdata/cultivation.ts` | Planned and actual seed, fertiliser, pesticide and irrigation events stay separate. Purchase is not planting. Missing categories are reported as unknown, not zero. Validation rejects future actual dates and impossible quantities, and flags chemical applications for adviser/pre-harvest review. |
| Pre-sowing screen | `src/farmdata/agronomy.ts` | Explainable pass/review/block reasons for consent, plot overlap, water, soil evidence, measured pH, soil type and available forecast. Uses only records dated on or before the decision date. Labelled explanatory rules, not a calibrated probability. |
| Weekly projections | `src/farmdata/projections.ts` | Gross, grade loss (applied once), marketable, committed share, retained, allocatable, consent blocked, capacity and capacity-constrained quantities in separate columns with low/base/high cases and an uncertainty basis. |
| Versions and revisions | `src/farmdata/scenario.ts` | Published projections are immutable. Version numbers increase monotonically and link to the superseded version. A cultivation revision changes only weeks on or after its effective date; earlier weeks keep their published quantities. |
| Consent | `scenario.ts`, `projections.ts` | Consent is snapshotted from the farmer record when a scenario is saved or a version is published. Withheld, withdrawn, unavailable or unrecorded consent sets allocatable quantity to zero and reports the quantity as consent-blocked for review. History is never deleted. |

## Contract versions and keys

Contract and rule versions are explicit and are stored on each record:

| Constant | Value |
|---|---|
| `FARM_DATA_CONTRACT_VERSION` | `farm-data-2026-11-16.1` |
| `SOIL_IMPORT_TEMPLATE_VERSION` | `soil-csv-2026-11-16.1` |
| `WEATHER_IMPORT_TEMPLATE_VERSION` | `weather-csv-2026-11-16.1` |
| `AGRONOMY_RULE_VERSION` | `agronomy-rules-2026-11-16.1` |
| `PROJECTION_RULE_VERSION` | `weekly-projection-2026-11-16.1` |
| `WATER_ASSUMPTION_VERSION` | `water-budget-assumption-2026-11-16.1` |

Planning and farm-intelligence state persist in the browser under `meraki-farm-intelligence-v1`, using the same local-storage service pattern as the existing planning prototype. The demo reset clears this key along with the other planning keys. This is browser-local state, not a shared database, authentication boundary or safe multi-user ledger.

## Invariants covered by regression tests

`src/farmdata/farmdata.test.ts` encodes the behaviours that must not regress:

- Wrong-plot and incompatible-unit soil rows are rejected; accepted rows retain raw values and source.
- Analytes with different methods remain one reviewed sample per plot, date, depth and kind.
- Mapped estimates never replace a laboratory result; total nitrogen is not available nitrogen; a later sample is not used at an earlier decision date.
- Forecast issue time and horizon are preserved; out-of-horizon or later-issued forecasts are not evidence.
- An adapter failure is visible and produces no weather records.
- Water feasibility comes from farm capacity; a regional observation-well reading is not substituted.
- Rainfed and future-dated water records produce unknown/none, not zero demand.
- Planned versus actual cultivation stays separate; missing inputs remain unknown.
- Purchase is not verified planting, and a later observation cannot enter a pre-sowing evaluation.
- Grade loss is applied once and the projection columns reconcile.
- Low, base and high cases and logistics capacity are visible.
- Any consent state other than opted-in blocks allocation without deleting the quantity.
- Revisions change only weeks on or after the effective date; version numbers increase and earlier versions are retained.

## Verification

```sh
npm ci
npm test
npm run build
```

The walkthrough below was run on 16 November 2026, when `/farm-intelligence` was routed in the app (`npm run dev`). With the shipped synthetic fixtures:

1. **Soil & evidence** — restore the template and validate; two samples are accepted. Swap in an unknown plot or a `meq/100g` pH row to see row-level rejections. The selected plot shows measured laboratory evidence and keeps mapped estimates separate.
2. **Weather & water** — run the synthetic adapter (21 forecast records) and then inject the failure; the failed run is recorded with no records. The okra plot reports sufficient farm water, while the regional observation table stays context-only.
3. **Inputs & cultivation** — planned fertiliser and pesticide stay apart from actual events; unknown input categories are listed rather than zeroed. Recording a scouting observation adds a synthetic actual record.
4. **Scenarios & projections** — the demo scenario shows a passing pre-sowing screen at 2.00 acres, the versioned weekly table (gross through constrained/low/high), uncertainty, evidence and consent. Publishing creates a new immutable version; applying a revision from 15 January 2027 changes only the remaining weeks.

## Checks actually run

| Check | Actual outcome (16 November 2026) | Limit |
|---|---|---|
| `npm test -- --reporter=dot` | Passed: 44 tests in 5 files, including 19 Part 1 regressions | Software assertions only |
| `npm run build` | Passed TypeScript project checks and Vite production build | Bundle-size advisory; no deployment check |
| Browser check at `/farm-intelligence` | Soil import (2 samples), synthetic weather run and injected failure, cultivation record, scenario save, projection publish, revision publish, crop-fit screen at 108% water coverage; no console errors or failed requests; desktop `scrollWidth === clientWidth === 1280` | Representative desktop flow, not exhaustive device, accessibility or production validation |

A passing suite is not agronomic validation. The crop, picking-curve, water-budget and pH/soil-type rules are indicative development assumptions until a qualified local adviser reviews them.

## Not implemented / remaining gates

- **No backend.** There is no organisation-scoped API, shared database, concurrency control, idempotency or immutable server audit. T04 remains TODO and is required before multi-user use.
- **No reviewed document pipeline.** Soil import is CSV only; PDF/OCR extraction and human review of extracted laboratory reports are not built.
- **Farm linkage remains unfinished.** Regional weather/market adapters have verified retrieval and schema checks on `/live-data`; the farm workspace still uses its labelled fixtures. Authenticated laboratory/groundwater/procurement feeds and authorised farm-location mapping are absent.
- **No source/access register UI** (T01), no order-specific shortfall alerts or adviser-review workflow (T08), and no notification or messaging integration.
- **Consent history is preserved but not propagated automatically.** Withdrawing consent requires a new published version; existing versions stay as published evidence and are reviewed, not rewritten.
- **No pilot evidence or model.** No real conserved farm outcomes, no yield model trained on real data and no calibrated confidence. The earlier crop-classification work is not a farm-yield model and is not used here.
- **No automated browser-test command** is configured; the browser flow above was exercised manually.

## Next ready work

1. Implement T04's organisation-scoped backend and ledger, then move farm-intelligence writes behind it without changing the evidence semantics.
2. Add the T08 adviser-review and affected-order shortfall workflow on top of the version/revision model.
3. Replace synthetic fixtures with consented real observations and obtain qualified agronomic review before making recommendations.
