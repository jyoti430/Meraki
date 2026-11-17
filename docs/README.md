# Meraki documentation

This index points to the technical material behind the [project README](../README.md). Meraki is a completed hackathon prototype. Plans, audits and task lists written during the hackathon are kept under [Development history](#development-history) as a record; they are not an active roadmap.

## Crop planning at a glance

The repository contains three distinct pieces of crop-planning logic. They are easy to confuse:

| Component | Where | What it is |
|---|---|---|
| Collective crop planning engine | `src/planning/engine.ts`, `/plan` | Rule-based planner. Plans each buyer order separately, works back sowing dates and assigns farmer plots using timing, water and soil rules. Explainable; not a trained model. |
| Seven-crop yield outlook | `src/yieldPoc/cropOutlook.ts`, `/yield-poc` | Fixed reference yields (kg/ha) for seven crops, multiplied by the entered plot area. Does not assess whether a plot suits a crop. |
| Synthetic trained yield model | `scripts/train_synthetic_yield.py`, `src/yieldPoc/model.ts` | Experimental ridge regression trained only on invented data. Its artefacts and tests remain, but the `/yield-poc` page no longer runs it. See [SYNTHETIC_YIELD_POC.md](SYNTHETIC_YIELD_POC.md). |

None of these has been validated against real farm outcomes.

## Prototype setup and technical architecture

| Document | Contents |
|---|---|
| [HOSTING.md](HOSTING.md) | Vercel frontend and Render API/PostgreSQL deployment |
| [AUCTION_BACKEND.md](AUCTION_BACKEND.md) | Bidding marketplace: setup with Docker Compose, accounts, auction rules and worker |
| [MOBILE_SIGN_IN.md](MOBILE_SIGN_IN.md) | Mobile-number sign-in for FPO and exporter demo accounts |
| [PART3_OPERATIONS.md](PART3_OPERATIONS.md) | Trade development workspace (contracts, QC, dispatch, claims, settlement records) |
| [server/CONTRACT.md](../server/CONTRACT.md) | Trade workspace JSON API contract |
| [PART2_BACKEND.md](PART2_BACKEND.md) | Shared backend foundation, migrations and the [projection](contracts/part1-projection-v1.json) and [reservation](contracts/part3-reservation-v1.json) contracts |
| [tests/part3_acceptance/README.md](../tests/part3_acceptance/README.md) | Trade acceptance tests against a real database |
| [LIVE_SENSORS.md](LIVE_SENSORS.md) | Experimental crate temperature sensor gateway and ESP32 example |
| [LIVE_DATA.md](LIVE_DATA.md), [LIVE_DATA_API.md](LIVE_DATA_API.md) | Experimental public weather and market data gateway. The `/live-data` route currently redirects to the FPO overview. |
| [PART1_FARM_DATA.md](PART1_FARM_DATA.md) | Experimental farm-data workspace (soil imports, water, cultivation records, weekly projections). The `/farm-intelligence` route currently redirects to the FPO overview. |

## Agricultural data and model research

| Document | Contents |
|---|---|
| [agricultural-data-foundation.md](agricultural-data-foundation.md) | Public crop, weather and market source data, provenance and coverage limits |
| [MODEL_VALIDATION.md](MODEL_VALIDATION.md) | Outcome data contract and model-readiness checks |
| [reports/model_validation.md](../reports/model_validation.md) | Generated readiness report: no eligible real farm outcomes, so no model is promoted |
| [SYNTHETIC_YIELD_POC.md](SYNTHETIC_YIELD_POC.md) | The experimental synthetic trained yield model: method, data splits and limits |

## Development history

These documents record how the prototype was built during the hackathon. They describe broader plans than what was built and are not an active roadmap.

| Document | Contents |
|---|---|
| [EXECUTION_PLAN.md](EXECUTION_PLAN.md) | The original "Final 3.0" execution plan for the full crop-planning and procurement journey. **Historical.** Its business model (an exporter-paid success fee with free FPO access) differs from the proposed model in the project README: independent FPO and exporter subscriptions plus a marketplace success fee. |
| [WORKFLOW_ALIGNMENT_AUDIT.md](WORKFLOW_ALIGNMENT_AUDIT.md) | Frontend/backend audit against an exporter-sponsored procurement proposal. **Historical.** Exporter sponsorship is not part of the proposed model in the project README, where FPOs and exporters subscribe independently. |
| [superpowers/specs/2026-11-15-part3-trade-design.md](superpowers/specs/2026-11-15-part3-trade-design.md), [superpowers/plans/2026-11-15-part3-plan.md](superpowers/plans/2026-11-15-part3-plan.md) | Design and implementation plan for the trade workflows |
| [Agent.md](../Agent.md) | Implementation ledger: tasks, evidence and acceptance criteria |
| [AGENTS.md](../AGENTS.md) | Working instructions used by coding agents during the hackathon |
| [WORK_LOG.md](WORK_LOG.md) | Dated log of changes and the checks actually run |
| [REMAINING_TASKS.md](REMAINING_TASKS.md) | Integration tasks that were still open when the hackathon ended |
| [QA_ROUNDTRIP_REPORT.md](QA_ROUNDTRIP_REPORT.md) | Frontend/backend robustness review of the hosted demo |

## Running the checks

Frontend (Node 20+):

```sh
npm ci
npm test
npm run build
```

Python (3.12, with `server/requirements.txt` installed in a virtual environment):

```sh
python -m pytest server/tests tests -q
python scripts/build_agricultural_data.py --check
python -m model_validation --check
python scripts/train_synthetic_yield.py --check
```

The same checks run in CI (`.github/workflows/ci.yml`). They need no network access to data providers.
