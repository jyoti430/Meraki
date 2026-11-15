# Implementation ledger and resumable handoff

Last audited: 15 November 2026. Implementation baseline: `dddaa7cc4aab040802e8795b03565ad1d14d48c0`. This is the canonical task ledger; working rules are in `AGENTS.md`. Full product requirements are in `docs/EXECUTION_PLAN.md`.

## Status vocabulary

Part 3 update: `server/` and `src/trade/` now implement the T06/T07/T09/T10 development journey. Production acceptance remains **IN_PROGRESS / externally gated**, not TODO from scratch or fully DONE. The authoritative integration contract is `server/CONTRACT.md`; setup and limitations are in `docs/PART3_OPERATIONS.md`. See the latest work-log entry for actual test/review evidence and next steps. The original prototype baseline below remains historical evidence.

Part 1 update (16 November 2026): `src/farmdata/` and `/farm-intelligence` implement a browser-local development slice of T01/T02/T03/T08 — reviewed soil imports, weather/water evidence, planned versus actual cultivation, an explainable pre-sowing screen and immutable versioned weekly projections. Details and gaps are in `docs/PART1_FARM_DATA.md`. Parent tasks remain unfinished: there is no backend, organisation scoping, shared persistence or real consented observation set, and agronomic rules are unreviewed synthetic assumptions.

- `DONE`: stated acceptance passed with code and validation evidence.
- `PROTOTYPE`: implemented browser/demo behaviour; production acceptance remains unfinished.
- `TODO`: no accepted implementation established.
- `IN_PROGRESS`: a bounded slice is being worked on.
- `BLOCKED`: a specific external prerequisite prevents this task; record it, work around it only honestly.
- `UNVERIFIED`: implementation/result may exist but required validation has not run.

Baseline counts below concern source inspection and the commands recorded in `docs/WORK_LOG.md`; they do not validate agronomic or commercial impact.

## Finished work at prototype scope

| ID | Status | Evidence | What remains outside this completion |
|---|---|---|---|
| D01 | PROTOTYPE | Routes and FPO pages in `src/routes/AppRoutes.tsx`, `src/pages/` | Exporter portal, identity and shared backend |
| D02 | PROTOTYPE | `BuyerOrdersContext.tsx`, order forms/details | Browser-local order/specification history; actual buyer verification absent |
| D03 | PROTOTYPE | `FarmersService.ts`, farmer/plot/cycle pages, `FarmersContext.tsx` | Consent and CRUD exist locally; no full soil chemistry/provenance or management-event store |
| D04 | PROTOTYPE | `planning/engine.ts`, `data/crops.ts` | Order-specific rule-based allocation; synthetic crop assumptions and fixed scenario date |
| D05 | PROTOTYPE | `PlanContext.tsx`, `planning/messages.ts`, `Messages.tsx` | Reply/constraint replanning is simulated; no real messaging |
| D06 | PROTOTYPE | `planning/series.ts` | Uniform weekly distribution; no validated picking curve or full marketable-yield factors |
| D07 | PROTOTYPE | `SupplyPlanningService.ts`, `SupplyPlanningContext.tsx`, supply pages | Existing-crop previews, adjustments, reservations and cancellation are local; concurrent clients unprotected |
| D08 | DONE at baseline test scope | `planning/engine.test.ts`: 15 tests passed; build passed; existing CI runs both | Service, browser, database and field checks not established |

Five post-harvest pages contain `ModulePlaceholder`; their existence is not finished implementation. Current dependencies and commands are listed in README. Re-audit before changing statuses.

That placeholder statement describes the original baseline. On the Part 3 branch the five legacy URLs redirect to API-backed trade screens. New implementation paths: `server/service.py`, `server/db.py`, `server/app.py`, `server/worker.py`, `src/trade/`, `src/routes/TradeRoutes.tsx`; regression evidence: `server/tests/`, `tests/part3_acceptance/`, `src/trade/*.test.ts`. Existing synthetic farmer planning is not automatically joined to the new trade ledger.

Remaining gates for those four tasks: verified Part 2 identity, linked-entity verification and authoritative capacity adapter; production schema/restore/deployment checks; private document storage integration; agreed participant QC/contract/finance responsibility; actual field/commercial validation. Same-organisation self-bids are prevented, but no external legal-entity linkage service is installed. Evidence references are records, not document uploads. Settlement entries reconcile money but do not transfer it.

## Ordered unfinished work and acceptance gates

### T01 Evidence and planning contract — PROTOTYPE (development slice)

Dependencies: none. Keep synthetic demonstration usable while evidence is absent.

Deliver: source/access register, typed measurement/provenance contract, crop/cluster scope, decision-date semantics and no-orders mode. Capture available versus unknown inputs; do not assume willing partners or API access.

Acceptance: a scenario with no real demand shows feasible capacity without an invented order; unknown soil/water has explicit effects; crop/variety/grade/location/week gaps remain separate. Rules and data sources have versions. Correct premature planting/coverage instructions identified in the plan.

Part 1 slice (`src/farmdata/types.ts`, `evidence.ts`, `scenario.ts`): typed provenance/evidence contract with named versions, decision-date filtering, unknown-versus-zero handling, consent snapshot and immutable version history; the `/farm-intelligence` pre-sowing screen runs without buyer demand and does not invent an order. Still missing: source/access register, crop/cluster scope and no-orders analysis across the full journey.

### T02 Soil environment and management records — PROTOTYPE (development slice)

Dependencies: T01. Approved provider access is external; authorised imports are the fallback.

Deliver: plot-linked soil sample/analyte/method/units/depth/date records; reviewed CSV/PDF import; forecast issue/horizon metadata; groundwater observation context; planned/actual seed, fertiliser, pesticide and irrigation events. Review extracted values before acceptance.

Acceptance: reject wrong-plot and incompatible-unit imports; preserve raw evidence; old/missing data stays flagged; map estimates never overwrite lab results; actual water access is distinct from regional level. Adapter failures are visible. No API is labelled live before a permitted retrieval/schema test. OCR is optional until needed.

Part 1 slice (`src/farmdata/soil.ts`, `weather.ts`, `water.ts`, `cultivation.ts`): plot-linked CSV import with row-level rejection and raw-value preservation; measured-versus-mapped resolution; forecast issue/horizon metadata and visible adapter failure; farm water capacity separate from regional observations; planned/actual cultivation events with missing-input reporting. Still missing: PDF/OCR extraction and review, a permitted live provider adapter, and a persisted multi-user store. Development fixtures are synthetic.

### T03 Crop alternatives and weekly marketable planning — PROTOTYPE (development slice)

Dependencies: T01; use T02 data or labelled fixtures.

Deliver: locally reviewed feasibility reasons, crop alternatives, water/resource/land constraints, proposed/accepted/planted distinctions, weekly picking curves and low/base/high marketable supply scenarios. Preserve and extend D04 tests rather than replacing rules with unsupported AI.

Acceptance: farmer decline and overlapping plots prevent allocation; timing/grade/variety respected; gross versus accepted quantities reconcile; grade loss applied once; common water/weather shock exposes shortfalls; no future-data leakage. Labels say scenario rather than calibrated probability. Agronomic review remains an external gate for real advice.

Part 1 slice (`src/farmdata/agronomy.ts`, `projections.ts`): explainable consent/timing/water/soil reasons, low/base/high weekly projections with grade loss applied once and additive columns, and decision-date filtering. Crop alternatives, accepted-versus-planted distinctions across the order journey and reviewed local agronomy remain unfinished; labels state that confidence is not calibrated.

### T04 Backend organisation access and ledger — TODO

Dependencies: T01 schema. Required before live multi-user transactions.

Deliver: FastAPI service, migrations, PostgreSQL/PostGIS where needed, private document storage, organisation-scoped authentication/permissions, immutable event/correction history, idempotency and reservation ledger. Choose/pin providers rather than silently claiming they exist.

Acceptance: two organisations cannot access each other's private records; concurrent reservations cannot oversell; retries cannot duplicate allocations; expiry/cancellation releases correctly; malformed amounts and units fail; backup restore works. Tests must use a real database. Preserve useful frontend workflows via an explicit API boundary.

### T05 Exporter workspace and market discovery — TODO

Dependencies: T01; T04 for shared persistence.

Deliver: exporter order intake, budget/handover basis, public-to-members supply/demand board, freshness/confidence/evidence status, filters, matching, private customer reference and duplicate-enquiry review.

Acceptance: unrelated crops/windows never match; forecasts are distinct from confirmed obligations; reserved stock is unavailable; a duplicated overseas enquiry does not silently inflate committed demand; exact plot/contact/bank/customer details are permissioned. No assumed active exporters.

### T06 Harvested lot auction — IN_PROGRESS production integration gated

Dependencies: T04–T05 and inspection record contract from T02/T09.

Deliver: whole-lot ascending price auction, eligibility/reserve/increment, published server schedule/extension policy, bid receipts, provisional award and default/no-bid paths. See plan for proposed timing; confirm the rule version before release.

Acceptance: highest eligible price meeting reserve wins; equal bids use server-accepted order; late/retried bids and extension cap are deterministic; restart closes once; two auctions cannot sell the same stock; linked/self-bids are prevented/flagged. Browser countdown is display only. Reconnect retrieves authoritative state. No real purchases in tests.

### T07 Future production procurement — IN_PROGRESS production integration gated

Dependencies: T03–T05; can share T06 infrastructure but has different ranking.

Deliver: prequalification, reverse-price bidding or disclosed scoring, farmer-consented production capacity, provisional award, bilateral confirmation and contract/milestone fields. Whole-lot/split awards explicitly configured.

Acceptance: lowest comparable eligible quote wins unless a prepublished score applies; infeasible/unsupported capacity cannot bind; no plot tranche is double-awarded; quantity/price/payment/acceptance/default terms are recorded; stale forecasts trigger review. Weather and cancellation risk are allocated, not guaranteed away. Live terms require qualified operating/legal review.

### T08 Cultivation tracking and projection updates — PROTOTYPE (development slice)

Dependencies: T02–T03; T04 for shared operation.

Deliver: seed/establishment/input/irrigation/scouting events, adviser review, milestone tasks, projection revisions and order-specific shortfall alerts.

Acceptance: planned versus actual events remain separate; missing event is not zero application; new observations affect only appropriate forecast dates; affected orders and agreed backup/replan are visible. No automatic chemical prescriptions or unauthorised farmer messages.

Part 1 slice (`src/farmdata/cultivation.ts`, `projections.ts`, `scenario.ts`): planned/actual seed, fertiliser, pesticide, irrigation and scouting records; validation flags; review flags; immutable projection versions and revisions that change only weeks on or after the effective date. Still missing: adviser-review workflow, milestone tasks and affected-order shortfall alerts. No chemical prescription or farmer message is generated.

### T09 Lots QC and logistics — IN_PROGRESS production integration gated

Dependencies: T02, T04; contracted or spot order from T06/T07/T05.

Deliver: replace lots/lab/shipment placeholders with traceable lots, protocol/version, sample count, existing scoped reports, hold/release review, collection appointments, dispatch/arrival weights and custody history.

Acceptance: raw results retained; sample result not exact whole-lot truth; report scope/lot/date gaps visible; safety-held stock excluded; dispatch/arrival reconcile; photos/sensors never certify residues; extra inspections have a named payer. Logistics capacity limits supply promises.

### T10 Claims fees and member settlement — IN_PROGRESS production integration gated

Dependencies: T04, T09.

Deliver: acceptance/downgrade/rejection reasons, dispute and reinspection flow, disclosed fee, invoice/payment evidence and farmer allocation/disbursal records. Begin with reconciliation; live payment-provider integration is separately scoped.

Acceptance: weights and money reconcile; claims do not silently rewrite dispatch evidence; payment screenshots remain unverified until reconciled; refunds/adjustments are auditable; FPO receipt and farmer disbursal are distinct; cosmetic recovery does not imply unsafe produce is saleable.

### T11 Worker reliability and operational readiness — TODO

Dependencies: T04; deliver incrementally alongside T02/T06/T08–T10.

Deliver: retry-safe background imports/OCR/projections, auction-close scheduler, transactional notification outbox, monitoring, restore procedure and secrets/config examples without secrets. Select Celery/Redis or a justified simpler durable implementation.

Acceptance: crashes/retries cannot duplicate awards/payments; dead jobs and stale feeds are visible; authoritative close occurs even with no connected browser; notifications accurately distinguish queued/sent/delivered/failed. Low-connectivity drafts survive but cannot create accepted offline bids. Inspect access logs and restore evidence.

### T12 Model research and supervised pilot — TODO with external prerequisites

Dependencies: consented linked outcomes from T02/T08–T10 and sufficient independent data. Do not block deterministic workflow delivery on model training.

Deliver: dataset permission/provenance manifest, simple baselines, crop/season-specific holdouts, forecast-date feature snapshots, metrics/calibration, shadow evaluation and rollback. Optional optimisation is not a trained prediction model.

Acceptance: no district-to-farm fabricated labels; no future weather or same-farm leakage; beat appropriate baseline or retain it; report sample counts, bias/error and uncertainty by crop/region; keep uncalibrated scenarios labelled. Pilot must track failed orders, variable service cost, farmer net returns/payment delay, weekly accepted-on-time supply and coordinator time. A software demo cannot satisfy yield/income or customer-willingness-to-pay gates.

## Completion and resumption rules

Each task update must include: ID/status, source paths, acceptance checklist, exact check command or manual procedure, actual outcome/date/revision, remaining gap, dependency and next action. Never mark an entire T task DONE for a mock or partial screen. Split a task into explicit sub-items when useful while keeping parent acceptance visible.

Resume order: inspect repository state → read latest `docs/WORK_LOG.md` → reconcile task ledger → choose highest-priority ready item in authorised scope → implement → validate → record → repeat. Follow `AGENTS.md` for stop, failure and pause behaviour.

Product completion requires all applicable acceptance gates, not only green tests. Partner approvals, crop-cycle evidence and payments can remain honestly blocked while software work proceeds. Files do not automatically restart a paused process.

## S01 — Optional live crate sensors (15 November 2026)

Software implemented: `server/sensors.py`, `src/pages/LiveSensors.tsx`, LAN launcher, device upload example and `docs/LIVE_SENSORS.md`. POST/GET, polling, persistence, warning clearing and stale detection checked. 25 frontend and 71 API tests pass; production build passes. Browser received explicit test upload without reload. Hardware/firmware, deployed routing and lot association remain UNVERIFIED. No automatic release or actuation.
