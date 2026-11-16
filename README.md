# Meraki

Meraki helps FPOs propose feasible crops, coordinate farmer-approved production against buyer requirements, and manage procurement through delivery and farmer settlement.

**Current status:** a React/Vite browser prototype with synthetic fixtures and local storage, with an initial shared FastAPI backend foundation under development. The full supply-chain product below is the execution target, not a claim that every module is implemented. Baseline inspected on 15 November 2026 at `dddaa7cc4aab040802e8795b03565ad1d14d48c0`.

- [Demo](https://meraki-tau-opal.vercel.app/) — deployed content may differ from this checkout.
- [Full Final 3.0 execution plan](docs/EXECUTION_PLAN.md)
- [Implementation status and acceptance backlog](Agent.md)
- [Agent working instructions](AGENTS.md)
- [Validation and resume checkpoint](docs/WORK_LOG.md)

## Product journey

```mermaid
flowchart TD
  A[Authorised soil tests and plot records] --> C[Explain feasible crop options]
  B[Weather and water context] --> C
  C --> D[Propose weekly marketable supply]
  E[Exporter demand with commitment status] --> F[Collective FPO planning]
  D --> F
  F --> G[Farmer review and consent]
  G --> H[Forward procurement or exploratory plan]
  H --> I[Record seed and cultivation events]
  I --> J[Update harvest and shortfall estimates]
  J --> K[Harvest and reuse quality evidence]
  K --> L[Existing contract or harvested lot auction]
  L --> M[Delivery acceptance and claims]
  M --> N[Payment and member reconciliation]
  N --> C
```

Rank crop options using soil, season, water, resources, expected net returns and credible market access. Highest gross yield alone is not the objective. Farmers can accept, modify or decline proposals.

## Run the current prototype

Use a maintained Node.js release compatible with the lockfile. Existing CI uses Node 20; the documentation baseline was also checked locally with Node 24.22.1 and npm 11.19.1. No runtime upgrade is included in this change.

```sh
npm ci
npm run dev
```

Open the URL Vite prints. For a production bundle and local preview:

```sh
npm test
npm run build
npm run preview
```

`npm test` runs Vitest; `npm run build` runs TypeScript project checks and Vite. There is no configured lint or browser-test command. `npm ci` requires registry access. No API keys or backend are needed for the current synthetic demo.

Data persists in this browser's local storage with an in-memory fallback. It is not a shared database, an authentication boundary or a safe multi-user reservation ledger. The demo reset clears Meraki records in that browser; do not use it on records you need to retain. The planner uses a fixed synthetic scenario date of **16 November 2026**, not live time.

## Implemented versus unfinished

| Capability | Verified evidence | Status and limit |
|---|---|---|
| FPO navigation and forms | `src/routes/AppRoutes.tsx`, `src/pages/` | Implemented prototype; not an exporter portal |
| Buyer requirements and specification history | `BuyerOrdersContext.tsx`, order pages | Browser-local demo records; no verified buyer commitments |
| Farmers, plots, crop cycles and participation | `FarmersService.ts`, types and forms | Prototype CRUD and consent records |
| Collective planting suggestions | `src/planning/engine.ts` | Explainable rules with synthetic crop assumptions; not trained yield AI |
| Farmer response/replanning flow | `PlanContext.tsx`, `Messages.tsx` | Simulated messages/replies; no delivery provider |
| Weekly charts | `src/planning/series.ts` | Uniform distribution over windows; not observed picking curves |
| Existing-crop supply plans | `SupplyPlanningService.ts`, supply pages | Preview, adjustments, confirmation/cancellation and local reservations; no cross-client atomicity |
| Soil record fields | `src/types/index.ts`, plot forms | Basic report/pH/moisture representation; no full SHC analyte/provenance pipeline |
| Planning regression tests and CI | `src/planning/engine.test.ts`, `.github/workflows/ci.yml` | 15 tests and build passed at baseline; no service/concurrency/E2E coverage established |
| Lots, lab review, shipments, claims, settlements | Five pages wrapping `ModulePlaceholder` | Placeholders only |
| Shared API/backend | `server/meraki/`, `server/alembic/` | Initial Part 2 foundation; identity provider, PostgreSQL concurrency and operations remain unverified |
| Marketplace discovery | `GET /api/v1/market/listings` | Basic consented-capacity feed; exporter intake/matching and both auction engines remain planned |
| Government APIs, OCR and validated ML | No implementation in inspected tree | Planned; access/data gates apply |

Source inspection establishes implementation presence, not operational or agronomic validation. See [the ledger](Agent.md) for task-level evidence and acceptance criteria.

The `feature/part2-backend` branch now contains an **in-progress** shared API foundation in `server/meraki/`. It includes organisation-scoped sessions/permissions, projection version and consent records, listing/capacity/reservation APIs, document metadata with local file storage, audit/idempotency, Alembic migrations and an expiry job worker. It is not production-ready: no external identity provider or object store is configured, PostgreSQL concurrency has not been verified, and the existing Part 3 trade service has not been adapted to the shared transaction boundary. See [Part 2 backend setup and contracts](docs/PART2_BACKEND.md).

## Current and target stack

**Installed frontend:** React 18, TypeScript 5.6, Vite 5, React Router 6, Tailwind 3, Lucide icons and Vitest 2. Exact resolutions live in `package-lock.json`.

**Backend foundation in this branch:** FastAPI, Pydantic 2, SQLAlchemy 2, Alembic and Pytest are pinned in `server/requirements.txt`; PostgreSQL is the target shared database. The user initially reported 7 passed, 1 skipped using Python 3.10; after adding auth-guard cases, the latest local Python 3.10.10 run passed 10 tests with 1 skipped. The user reports Alembic migrations applied successfully. Local verification observed API health HTTP 200 and a successful synthetic end-to-end workflow. PostgreSQL concurrency remains unverified; no external production identity provider or production object store is configured, and production readiness has not been established. See [the Part 2 setup notes](docs/PART2_BACKEND.md).

**Proposed target:** retain the React/Vite frontend; add a Python FastAPI modular backend, PostgreSQL/PostGIS, private object storage, organisation-scoped authentication and a background worker. A worker is a separate Python process for imports, OCR, projections, notifications and auction deadlines. Celery/Redis is a candidate, not present infrastructure. Database transactions decide reservations and winners.

Python rules/scenarios come first. Later candidates include scikit-learn for properly labelled prediction and OR-Tools for constrained allocation. OCR, mapping, improved API state/forms, telemetry and managed auth/storage providers should be introduced only for an accepted task with pinned dependencies and measured need.

## Data and agronomic contract

- Actual SHC results require authorised access or member-authorised lab/card imports. Published API documentation does not mean access is approved. FPO staff can verify imports without farmers typing chemistry values.
- Preserve plot/sample linkage, raw units, analyte basis, method, depth, dates and source. Mapped total nitrogen is not SHC available nitrogen. Missing data stays unknown.
- Weather forecasts retain issue time and horizon. Historical NASA POWER weather is not future weather. Regional groundwater observations do not establish an individual farm's pumping capacity or reliable supply.
- Actual seed lot, fertiliser, pesticide and irrigation events require consented operational records. Purchase and planned application are not verified application.
- Pre-sowing decisions use only data available at that time. Do not train on future rainfall, later crop imagery or final harvest information and claim pre-sowing performance.
- No suitable linked local soil–management–vegetable-yield dataset has been established for this product. The earlier small crop-classification experiment is not a validated farm-yield model. Collect real outcomes and beat independent baselines before model deployment.
- Crop/input guidance needs qualified local review. Photos, self-reported spray logs and sensors do not certify pesticide safety or export compliance.

Weekly scenarios separate gross harvest, grade share, FPO commitment and retention:

```text
weekly allocatable kg =
  area_ha × gross_yield_t_per_ha × 1000 × weekly_harvest_share
  × eligible_grade_fraction × FPO_committed_fraction × retention
  constrained by logistics, timing, holds and existing reservations
```

Do not apply grade loss twice to an already-marketable yield. Compare crop/variety/grade/location/week obligations; aggregate seasonal tonnes do not prove coverage. Without an actual buyer, show feasible capacity and exploratory scenarios, not instructions to sow for an assumed sale.

## Market and auction rules

1. **Harvested lots:** eligible exporters bid upward for available produce; highest eligible price wins if the disclosed reserve is met.
2. **Forward procurement:** qualified FPOs quote future supply; lowest comparable eligible price wins, or use a scoring rule disclosed before bidding.
3. Server time, deterministic rules and atomic capacity reservations govern awards. First arrival breaks equal bids only. Browser timers/local storage cannot decide live winners.
4. Proposed versus accepted planting, growing forecasts, inspected stock and signed obligations remain distinct. Duplicate enquiries and capacity already committed elsewhere must not inflate available supply or demand.
5. Auction schedule, extensions, partial awards, fees, confirmation/default rules and quality acceptance must be agreed before live operation. The full plan contains proposed defaults, not live contracts.

## Execution sequence

| Phase | Deliverable | Exit condition |
|---|---|---|
| P0 | Scope, evidence ledger, source/permission register | Real versus hypothetical inputs explicit; crop and partner access documented |
| P1 | Typed soil/environment records and imports | Correct plot, units, timestamps, review and missing-data behaviour |
| P2 | Reviewed crop alternatives and weekly marketable plan | Water/resources/consent enforced; no-orders and common-shock scenarios work |
| P3 | Authenticated backend and durable capacity ledger | Organisation isolation, atomic reservations and migration/restore checks |
| P4 | Exporter workspace and market discovery | Dated eligible matching, demand states and duplicate review |
| P5 | Both auction modes and contract workflow | Concurrent bids, deadlines, retries/defaults and no overselling verified |
| P6 | Cultivation-to-acceptance and settlement | One complete reconciled journey with claim and failure paths |
| P7 | Supervised pilot and model evaluation | Paid repeat usefulness, full variable costs and independent outcomes measured |

Phases can deliver UI prototypes before backend work, but multi-user transactions require P3. A crop-cycle pilot cannot be completed by a short software sprint. Detailed dependencies, tests and stop/resume instructions are in [Agent.md](Agent.md).

## Business and impact

Test buyer-funded planning subscriptions, disclosed fees on accepted volume and separately priced coordination. These are hypotheses; no prices, margins, yield improvements or farmer-income gains are established by this repository. Measure cost per accepted kg, accepted-on-time quantity, weekly forecast error, coordinator time, farmer net receipts and payment delay against current practice.

## Working on the project

Read [AGENTS.md](AGENTS.md), then select one ready acceptance task from [Agent.md](Agent.md). Record actual checks and checkpoint in [docs/WORK_LOG.md](docs/WORK_LOG.md). Passing frontend tests does not complete backend, field or commercial milestones. Instructions and checkpoints support resumption; they do not automatically run an agent after it is paused.

The repository currently has no `LICENSE` file. Do not infer permission to reuse third-party code, data or model weights from public visibility; record applicable terms for each addition.
