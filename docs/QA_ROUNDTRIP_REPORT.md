# Frontend/backend round-trip robustness review

Date: 16 November 2026. Starting revision: `10f7e43`. Scope: the current synthetic demonstration and its hosted API boundary. This is not a guarantee of defect-free software or acceptance of real trading, agronomy, security or field outcomes.

## Reproduced defects and corrections

| Area | Failure exercised | Correction and regression |
| --- | --- | --- |
| Actor switching | A slower old session response could replace the latest actor; old actor remained writable while switching | Request identity/generation isolation, captured per-request token, immediate invalidation; adversarial controller tests |
| Actor picker | A choice made while the old options remained visible could be overwritten when identity loading finished | Clear prior choices/consent, disable pending inputs, require explicit choice; cancel/reopen invalidates late callbacks |
| Writes and retries | An uncertain POST could leave old data writable; a saved action followed by failed refresh appeared successful | Pause while submitting, recover authoritative state after failure, preserve request key for unchanged retries, distinguish saved-but-refresh-failed |
| Responses/authentication | Malformed validation errors or interrupted response bodies could escape normal error handling | Safe error parsing, health/session/workspace contract checks, retained authentication errors and read-only failure state |
| Hosted database failure | Child APIs returned plain HTTP500 for connection failures | Credential-free JSON503 in existing namespace envelopes, CORS/request ID preserved; failure and recovery injection |
| Expiry backlog | Hosted worker processed one ready job per idle interval | Bounded draining of ready jobs before idle sleep, with stop awareness and continued trade closing |
| Required buyer criteria | Generic grade/protocol release could authorize shipment despite unassessed custom criteria | Shipment creation and dispatch fail closed; terms view states that a criterion-specific assessment adapter is required. Optional preferences remain distinct |
| Planning instructions | Urgent next actions told unconfirmed farmers to sow, contradicting proposal/consent warnings | Review/proposal language and explicit buyer commitment/farmer acceptance; no allocation or agronomy changes |

The suspected QC/finance commercial-permission issue was disproved: the existing common party guard already restricts commercial actions. Added role regressions protect it; no invented permission defect is claimed.

## Automated coverage

The new procurement suite uses the existing HTTP acceptance harness with real database writes. It runs locally on disposable SQLite and also on disposable PostgreSQL schemas when CI supplies `TRADE_TEST_DATABASE_URL`.

- Multi-FPO partial awards and quantity conservation through confirmation, amendment, harvest conversion, QC, split shipment receipts, bilateral debit/credit claims and independent settlements.
- Cancel/default/expiry before and after harvest, recovery of capacity and no double release of commitments.
- Concurrent competing awards and identical request retries; replay of every successful command after API restart leaves the final ledger unchanged.
- Same-organisation reviewer denials, unrelated-organisation isolation, strict quantities, current terms versions, QC holds, retry fingerprints and source budgets.
- Frontend overlapping refresh/actor/disconnect races, malformed/misrouted envelopes, backend errors, interrupted responses, and saved versus refreshed outcomes.
- Hosted prefixes/middleware, exact-origin CORS, production/demo gates, safe database outages/recovery, readiness of both databases and worker backlog processing.
- Existing farm evidence, planning, local QC, public source, synthetic model and real-model promotion-gate suites remain in the full regression command.

Baseline before fixes: 72 Vitest +16 Node tests/build passed; Python179 passed,2 PostgreSQL-only skips and10 subtests. Artifact checks reproduced and real-data model promotion remained blocked. A clean local `npm ci` hit a Windows lock held by an existing preview; the resolution and final dependency/CI outcomes are recorded below when complete.

## Browser and deployed acceptance

Use isolated synthetic API/database on port8016 and frontend5186 for writes. Preserve the pre-existing preview on5181. Test the public deployment separately; do not create real orders, bids, contracts, payments or partner messages. Browser results, final counts, deployment revision and remaining limits are recorded in the delivery section after verification.

Verified locally after fixes:

- Browser-created tomato requirement retained its quality criterion, packaging and notes; the FPO view correctly offered no capacity when only okra capacity qualified.
- An API-seeded generic okra requirement appeared in the browser. FPO A submitted60kg and FPO B40kg. Each FPO saw only its own private proposal; the exporter saw both and explicitly awarded100kg with0kg remaining and two provisional contracts.
- The exporter approved contract A; FPO B saw it as unavailable. FPO A's approval confirmed it. Reload retained confirmation. Changing payment due days7→10 preserved packaging, created terms version2 and cleared both approvals. Both parties confirmed version2.
- Stopped only the isolated API: refresh retained the confirmed snapshot and disabled all3 command fieldsets. Restarted the same database/API: refresh restored the same confirmed contract and enabled all3 fieldsets. Saved screenshots document outage and recovery.
- Actual TCP/HTTP concurrency:12 identical simultaneous POSTs with one request key produced one draft ID;16 simultaneous scoped workspace reads each saw exactly one copy. No hosted database was stress-tested.
- Eight direct browser routes rendered after the React Router upgrade: root, FPO overview, farm intelligence, yield POC, public data, sensors, exporter examples and procurement. At the observed1280px viewport, none overflowed the document and browser error logs were empty. A375px override did not apply to this browser surface; phone layout and other browsers remain unverified.

Local final regression: **91 Vitest +16 Node tests**, production build, **198 Python tests +10 subtests passed**, with2 PostgreSQL-only skips. Python compilation and offline artifact checks passed. The bundle advisory and upstream FastAPI/TestClient deprecation notices remain. Security packages were pinned to compatible patched versions: Vite6.4.6, Vitest4.1.12 and React Router7.18.5, retaining React18 and the existing app structure. Both full and production-only npm audits report **0 known vulnerabilities**. Old locked dependencies were retained in ignored local runtime storage so existing previews were not terminated. Linux CI will verify a clean lockfile installation and disposable PostgreSQL coverage before main integration.

## Material limits

Required custom criteria remain blocked pending scoped assessment; no measurement or approval is fabricated. Production identity/capacity/QC bridging, private partner entitlements, durable object storage and real sensor gateway linkage remain unfinished. The free Render instance sleeps, pausing in-process workers; the demo database expires16December2026. Live provider rate limits remain explicit errors. The real yield model still has zero eligible farm outcomes and cannot be promoted.
