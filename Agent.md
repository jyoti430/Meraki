# Implementation ledger and resumable handoff

Last audited: 15 November 2026. Implementation baseline: `dddaa7cc4aab040802e8795b03565ad1d14d48c0`. This is the canonical task ledger; working rules are in `AGENTS.md`. Full product requirements are in `docs/EXECUTION_PLAN.md`.

## Status vocabulary

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

## Ordered unfinished work and acceptance gates

### T01 Evidence and planning contract — TODO

Dependencies: none. Keep synthetic demonstration usable while evidence is absent.

Deliver: source/access register, typed measurement/provenance contract, crop/cluster scope, decision-date semantics and no-orders mode. Capture available versus unknown inputs; do not assume willing partners or API access.

Acceptance: a scenario with no real demand shows feasible capacity without an invented order; unknown soil/water has explicit effects; crop/variety/grade/location/week gaps remain separate. Rules and data sources have versions. Correct premature planting/coverage instructions identified in the plan.

### T02 Soil environment and management records — TODO

Dependencies: T01. Approved provider access is external; authorised imports are the fallback.

Deliver: plot-linked soil sample/analyte/method/units/depth/date records; reviewed CSV/PDF import; forecast issue/horizon metadata; groundwater observation context; planned/actual seed, fertiliser, pesticide and irrigation events. Review extracted values before acceptance.

Acceptance: reject wrong-plot and incompatible-unit imports; preserve raw evidence; old/missing data stays flagged; map estimates never overwrite lab results; actual water access is distinct from regional level. Adapter failures are visible. No API is labelled live before a permitted retrieval/schema test. OCR is optional until needed.

### T03 Crop alternatives and weekly marketable planning — TODO

Dependencies: T01; use T02 data or labelled fixtures.

Deliver: locally reviewed feasibility reasons, crop alternatives, water/resource/land constraints, proposed/accepted/planted distinctions, weekly picking curves and low/base/high marketable supply scenarios. Preserve and extend D04 tests rather than replacing rules with unsupported AI.

Acceptance: farmer decline and overlapping plots prevent allocation; timing/grade/variety respected; gross versus accepted quantities reconcile; grade loss applied once; common water/weather shock exposes shortfalls; no future-data leakage. Labels say scenario rather than calibrated probability. Agronomic review remains an external gate for real advice.

### T04 Backend organisation access and ledger — IN_PROGRESS

Dependencies: T01 schema. Required before live multi-user transactions.

Deliver: FastAPI service, migrations, PostgreSQL/PostGIS where needed, private document storage, organisation-scoped authentication/permissions, immutable event/correction history, idempotency and reservation ledger. Choose/pin providers rather than silently claiming they exist.

Acceptance: two organisations cannot access each other's private records; concurrent reservations cannot oversell; retries cannot duplicate allocations; expiry/cancellation releases correctly; malformed amounts and units fail; backup restore works. Tests must use a real database. Preserve useful frontend workflows via an explicit API boundary.

Part 2 implementation slice (16 November 2026, `feature/part2-backend`): `server/meraki/` adds typed shared SQLAlchemy entities, FastAPI v1, synthetic-only development sessions, org membership/permission checks, projection history and consent events, local document storage, listings/capacity/reservations, audit/idempotency and `server/alembic/versions/0001_shared_services.py`. At initial implementation time, dependency installation was blocked; that historical limitation was superseded by the verification below. Missing acceptance: verified production identity adapter, actual PostgreSQL concurrency run, backup/restore, production object storage, security review, and adaptation of Kireeti's separate transaction service. The latest fetch attempt failed because `.git/FETCH_HEAD` is not writable.

Verification update (16 November 2026): before the auth-guard matrix was added, the user reported 7 passed, 1 skipped in Python 3.10. The latest local Python 3.10.10 run after adding the matrix passed 10 tests with 1 skipped. The user reports Alembic migrations applied successfully. Local checks observed API health HTTP 200 and a successful synthetic end-to-end workflow including projection history/consent, listing discovery, reservation/release/expiry and scoped document retrieval. PostgreSQL concurrency and production readiness remain UNVERIFIED; external production identity and object storage are not configured. T04 remains `IN_PROGRESS` because its full acceptance criteria are not met.

### T05 Exporter workspace and market discovery — IN_PROGRESS (API slice only)

Dependencies: T01; T04 for shared persistence.

Deliver: exporter order intake, budget/handover basis, public-to-members supply/demand board, freshness/confidence/evidence status, filters, matching, private customer reference and duplicate-enquiry review.

Acceptance: unrelated crops/windows never match; forecasts are distinct from confirmed obligations; reserved stock is unavailable; a duplicated overseas enquiry does not silently inflate committed demand; exact plot/contact/bank/customer details are permissioned. No assumed active exporters.

Part 2 API slice (16 November 2026, `feature/part2-backend`): `POST /api/v1/listings` and `GET /api/v1/market/listings` expose consented, reviewed, unexpired and non-superseded capacity with current available grams. Synthetic fixtures and API test cases are in `docs/contracts/` and `server/tests/test_shared_backend.py`. The user initially reported 7 passed, 1 skipped using Python 3.10; the latest local Python 3.10.10 run passed 10 tests with 1 skipped. The local synthetic discovery workflow passed. This is not an exporter workspace, demand intake, matching engine, or verified harvested-lot QC adapter. PostgreSQL concurrency remains UNVERIFIED.

Exporter Portal UI slice (16 November 2026, based on `e27051d`): the segment selector, exporter dashboard, local draft requirements, synthetic supply discovery and integration-status view are implemented under `src/exporter/`; exporter routes are in `src/routes/AppRoutes.tsx`. `npm test` passed 17 tests and `npm run build` passed. The service tests verify local draft isolation from fixture records. A local Vite server started, but the sandbox denied the HTTP smoke check with a socket permission error; route rendering and interaction behaviour remain unverified. No exporter demand API, authenticated market API integration, reservation action, identity provider or Part 3 lifecycle feed is connected. Requirements and supply are synthetic or browser-local. T05 remains `IN_PROGRESS`; the larger exporter workflow, duplicate enquiry review, matching, verified supply evidence and backend integration acceptance remain outstanding.

### T06 Harvested lot auction — IN_PROGRESS (synthetic workflow; production acceptance unverified)

Dependencies: T04–T05 and inspection record contract from T02/T09.

Deliver: whole-lot ascending price auction, eligibility/reserve/increment, published server schedule/extension policy, bid receipts, provisional award and default/no-bid paths. See plan for proposed timing; confirm the rule version before release.

Acceptance: highest eligible price meeting reserve wins; equal bids use server-accepted order; late/retried bids and extension cap are deterministic; restart closes once; two auctions cannot sell the same stock; linked/self-bids are prevented/flagged. Browser countdown is display only. Reconnect retrieves authoritative state. No real purchases in tests.

Implementation slice on `feature/procurement-bidding` (16 November 2026, revision `37d11df`): selectively reused `server/app.py`, `server/service.py`, `server/db.py`, `server/worker.py` and `src/trade/` from the existing Part 3 implementation; actual harvested lots remain held until recorded inspection and QC release. Spot listings use server-authoritative highest eligible price bids and reserve/extension rules. `npm test`, `npm run build` and `python -m pytest server/tests tests/part3_acceptance -q` passed (27 frontend tests; 73 passed, 1 skipped backend). PostgreSQL concurrency acceptance was skipped without a configured test database. Local API health and Vite route returned HTTP 200; browser interactions/mobile layout were not visually exercised. T06 remains incomplete pending browser verification, PostgreSQL concurrency, shared identity/capacity integration and production operations.

### T07 Future production procurement — IN_PROGRESS (synthetic requirement/proposal slice; acceptance incomplete)

Dependencies: T03–T05; can share T06 infrastructure but has different ranking.

Deliver: prequalification, reverse-price bidding or disclosed scoring, farmer-consented production capacity, provisional award, bilateral confirmation and contract/milestone fields. Whole-lot/split awards explicitly configured.

Acceptance: lowest comparable eligible quote wins unless a prepublished score applies; infeasible/unsupported capacity cannot bind; no plot tranche is double-awarded; quantity/price/payment/acceptance/default terms are recorded; stale forecasts trigger review. Weather and cancellation risk are allocated, not guaranteed away. Live terms require qualified operating/legal review.

Implementation slice on `feature/procurement-bidding` (16 November 2026, revision `37d11df`): `server/service.py` implements exporter drafts/publication, FPO proposals against consented/reviewed synthetic capacity, withdraw/reject, explicit exporter-selected award and linked provisional Part 3 contracts. It deliberately does not auto-select the cheapest proposal; the existing reverse auction remains a separate workflow with its published lowest-offer rule. Full-quantity proposals only; partial awards, shared Part 2 capacity, verified evidence upload, real identity and production terms review are absent. Checks: `npm test` (27 passed), `npm run build` (passed with bundle-size advisory), `python -m pytest server/tests tests/part3_acceptance -q` (73 passed, 1 skipped). Manual browser comparison/award journey and PostgreSQL concurrency remain UNVERIFIED. T07 remains `IN_PROGRESS`.

### T08 Cultivation tracking and projection updates — TODO

Dependencies: T02–T03; T04 for shared operation.

Deliver: seed/establishment/input/irrigation/scouting events, adviser review, milestone tasks, projection revisions and order-specific shortfall alerts.

Acceptance: planned versus actual events remain separate; missing event is not zero application; new observations affect only appropriate forecast dates; affected orders and agreed backup/replan are visible. No automatic chemical prescriptions or unauthorised farmer messages.

### T09 Lots QC and logistics — TODO

Dependencies: T02, T04; contracted or spot order from T06/T07/T05.

Deliver: replace lots/lab/shipment placeholders with traceable lots, protocol/version, sample count, existing scoped reports, hold/release review, collection appointments, dispatch/arrival weights and custody history.

Acceptance: raw results retained; sample result not exact whole-lot truth; report scope/lot/date gaps visible; safety-held stock excluded; dispatch/arrival reconcile; photos/sensors never certify residues; extra inspections have a named payer. Logistics capacity limits supply promises.

### T10 Claims fees and member settlement — TODO

Dependencies: T04, T09.

Deliver: acceptance/downgrade/rejection reasons, dispute and reinspection flow, disclosed fee, invoice/payment evidence and farmer allocation/disbursal records. Begin with reconciliation; live payment-provider integration is separately scoped.

Acceptance: weights and money reconcile; claims do not silently rewrite dispatch evidence; payment screenshots remain unverified until reconciled; refunds/adjustments are auditable; FPO receipt and farmer disbursal are distinct; cosmetic recovery does not imply unsafe produce is saleable.

### T11 Worker reliability and operational readiness — IN_PROGRESS (expiry slice only)

Dependencies: T04; deliver incrementally alongside T02/T06/T08–T10.

Deliver: retry-safe background imports/OCR/projections, auction-close scheduler, transactional notification outbox, monitoring, restore procedure and secrets/config examples without secrets. Select Celery/Redis or a justified simpler durable implementation.

Acceptance: crashes/retries cannot duplicate awards/payments; dead jobs and stale feeds are visible; authoritative close occurs even with no connected browser; notifications accurately distinguish queued/sent/delivered/failed. Low-connectivity drafts survive but cannot create accepted offline bids. Inspect access logs and restore evidence.

Part 2 implementation slice (16 November 2026, `feature/part2-backend`): `server/meraki/worker.py` claims database jobs, recovers stale running leases, retries with bounded exponential backoff and handles reservation/listing expiry. API creation schedules expiry jobs. The user initially reported 7 passed, 1 skipped; the latest local Python 3.10.10 backend run passed 10 tests with 1 skipped. The local synthetic workflow also verified one-shot reservation expiry and capacity restoration. Auction close, notifications, monitoring and broader crash/restart acceptance remain outstanding; PostgreSQL concurrency is UNVERIFIED. T11 remains `IN_PROGRESS`.

### T12 Model research and supervised pilot — TODO with external prerequisites

Dependencies: consented linked outcomes from T02/T08–T10 and sufficient independent data. Do not block deterministic workflow delivery on model training.

Deliver: dataset permission/provenance manifest, simple baselines, crop/season-specific holdouts, forecast-date feature snapshots, metrics/calibration, shadow evaluation and rollback. Optional optimisation is not a trained prediction model.

Acceptance: no district-to-farm fabricated labels; no future weather or same-farm leakage; beat appropriate baseline or retain it; report sample counts, bias/error and uncertainty by crop/region; keep uncalibrated scenarios labelled. Pilot must track failed orders, variable service cost, farmer net returns/payment delay, weekly accepted-on-time supply and coordinator time. A software demo cannot satisfy yield/income or customer-willingness-to-pay gates.

## Completion and resumption rules

Each task update must include: ID/status, source paths, acceptance checklist, exact check command or manual procedure, actual outcome/date/revision, remaining gap, dependency and next action. Never mark an entire T task DONE for a mock or partial screen. Split a task into explicit sub-items when useful while keeping parent acceptance visible.

Resume order: inspect repository state → read latest `docs/WORK_LOG.md` → reconcile task ledger → choose highest-priority ready item in authorised scope → implement → validate → record → repeat. Follow `AGENTS.md` for stop, failure and pause behaviour.

Product completion requires all applicable acceptance gates, not only green tests. Partner approvals, crop-cycle evidence and payments can remain honestly blocked while software work proceeds. Files do not automatically restart a paused process.
