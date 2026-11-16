# Part 2 shared backend (prototype foundation)

This service provides organisation-scoped persistence and shared operations for Parts 1 and 3. It does not implement Part 1 agronomy or Part 3 auctions, contracts, QC decisions, fulfilment or settlement. `production_ready` is intentionally false: an external identity provider, production document store, operational controls, PostgreSQL verification, backup/restore and security review remain open.

## Architecture

- FastAPI v1 app: `server/meraki/app.py`; OpenAPI: `/docs` and `/api/v1/openapi.json`.
- Authentication boundary: `server/meraki/auth.py` defines the provider interface and local database-session adapter. Pass a verified provider to `create_app(identity_provider=...)`; no external provider is configured here.
- SQLAlchemy 2 relational models: `server/meraki/models.py`; transaction-aware reservation and idempotency services: `server/meraki/services.py`.
- Alembic migration chain: `server/alembic`; the first migration creates the typed initial schema. Production startup never runs `create_all`.
- Local document adapter: `server/meraki/storage.py`. Object bytes stay outside the SQL database; metadata and provenance stay relational. Replace this adapter with an approved object store before production.
- Database-backed worker: `server/meraki/worker.py`; it processes expiry jobs, uses a reclaimable lease, retries with exponential backoff and treats already-transitioned resources as no-ops.

Core tables: `users`, `organisations`, `organisation_memberships`, `sessions`, `documents`, `supply_projections`, `projection_consent_events`, `capacities`, `market_listings`, `reservations`, `reservation_events`, `idempotency_records`, `audit_events`, and `background_jobs`. Audit and reservation events identify user versus system actor. Quantities are integer grams; this service does not store financial amounts.

## Local setup

Use Python 3.11+ and install the pinned backend dependencies:

```sh
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r server/requirements.txt
Copy-Item .env.example .env # PowerShell; use cp on macOS/Linux
```

Local default uses SQLite. For PostgreSQL set `MERAKI_DATABASE_URL=postgresql+psycopg://...` in the environment. Do not put real credentials in `.env.example` or commit `.env`. PostgreSQL operations must be validated against a dedicated database before integration; SQLite is not evidence of row-lock concurrency behavior.

Initialize the schema with Alembic before starting the API:

```sh
alembic -c server/alembic.ini upgrade head
```

For a throwaway local SQLite database only, `MERAKI_AUTO_CREATE_SCHEMA=1` can create tables at startup. Do not combine that path with the initial Alembic upgrade on the same empty database; use one initialization path.

In production, set `MERAKI_ENV=production`, configure the database and run migrations as a deployment step. The API refuses automatic schema creation in production.

## Run API and worker

```sh
uvicorn server.meraki.app:app --reload --port 8003 --env-file .env
python -m server.meraki.worker --interval 1
```

Start the worker in a shell with the same `MERAKI_DATABASE_URL` as the API (PowerShell can load the values by setting `$env:MERAKI_DATABASE_URL` from `.env`). The synthetic development session route and its default local identity provider are available only when `MERAKI_ENV=development` and `MERAKI_DEV_AUTH=1`; the route is disabled in staging, production, and when the flag is off. It creates synthetic local identities and is not an identity-provider integration. Without an injected provider, protected requests fail closed with 503. Requests use `Authorization: Bearer <token>` and `X-Organisation-ID: <membership org>`. The authenticated user must have an active membership and the operation permission. Every API response includes an `X-Request-ID`; pass `X-Request-ID` to correlate audit operations.

## API v1 contract

Protected routes return a consistent `{ "error": { "code", "message", "request_id" } }` shape. Mutations use an `Idempotency-Key`; replaying the same payload returns the original response, while conflicting payload reuse returns 409. Reservation transitions require `expected_version`.

| Method / path | Purpose | Permission |
|---|---|---|
| `POST /api/v1/dev/sessions` | Explicitly enabled local synthetic session | Development only |
| `POST /api/v1/projections` | Publish immutable projection version | `projection:write` |
| `GET /api/v1/projections` | List only the selected organisation's projections | `projection:read` |
| `GET /api/v1/projections/{source_id}/history` | Read version history | `projection:read` |
| `POST /api/v1/projections/{source_id}/consent` | Append consent state; withdrawal releases pending reservations and reports committed ones for review | `projection:write` |
| `POST /api/v1/capacities`, `POST /api/v1/capacities/{id}/review`, `GET /api/v1/capacities/available` | Create, review and read organisation capacity ledger rows | `capacity:write`, `capacity:review`, `capacity:read` |
| `POST /api/v1/listings`, `GET /api/v1/market/listings` | List eligible capacity and discover other organisations' listings | `listing:write`, `listing:read` |
| `POST /api/v1/reservations` | Atomically reserve capacity visible through a listing | `reservation:write` |
| `POST /api/v1/reservations/{id}/transition` | Confirm, release or cancel a pending reservation | `reservation:write` |
| `GET /api/v1/reservations`, `GET /api/v1/reservations/{id}/history` | Read either-party reservation records and append-only transitions | `reservation:read` |
| `POST /api/v1/documents`, `GET /api/v1/documents/{id}`, `GET /api/v1/documents/{id}/content` | Upload metadata/content and access within the owning organisation | `document:write`, `document:read` |
| `GET /api/v1/audit-events` | Read organisation-scoped audit history | `audit:read` |
| `POST /api/v1/jobs` | Enqueue supported expiry task | `job:write` |

All produce quantities are integer `*_g`. Projection quantity is a planning value, not a reservation or harvested stock. `source_type` is either `projection` or `harvested_lot`; these remain distinct. Capacity starts unreviewed and requires a separate permissioned review command. Harvested-lot capacity cannot be approved, listed, reserved or confirmed through this service until a verified Part 3 QC adapter exists. An evidence-reference string alone is insufficient; the service now fails closed.

### Part 1 integration

Publish `POST /api/v1/projections` with an opaque stable `source_id` per scenario/week, sequential `version`, organisation from the auth context, farmer reference, crop/variety/grade, week bounds, integer gram quantity and optional low/high gram scenarios. Preserve `consent_status`, `consent_recorded_at`, evidence refs, uncertainty basis/caveats, assumptions, source rule version, `as_of`, `stale_after` and caveats. Use history to retrieve older versions. New versions supersede old listings and release pending reservations. Consent changes are append-only and revoke marketplace eligibility; pending reservations release with an audit event, while committed reservations are reported for human review.

Do not send a projection as if it were confirmed supply. Part 1 remains responsible for generating the projection and its uncertainty; this service stores and scopes it.

### Part 3 integration

Discover eligible listings with `GET /api/v1/market/listings`; availability is `quantity_g - reserved_g - committed_g`. Create a reservation with capacity ID, quantity and expiry. Transition using `confirm`, `release` or `cancel` with `expected_version`. Each mutation is idempotent and emits audit/reservation history. Do not implement auction or contract winner rules here.

For a single atomic Part 3 command and reservation, the Part 3 service must call `reserve_capacity()` or `transition_reservation()` from `server/meraki/services.py` using the same SQLAlchemy `Session` and outer transaction. Calling the HTTP route from another transaction cannot provide atomic cross-service commit. The current Kireeti trade service has not been adapted to this shared transaction boundary.

## Tests

```sh
python -m pytest server/tests -q
MERAKI_TEST_POSTGRES_URL=postgresql+psycopg://... python -m pytest server/tests/test_shared_backend.py -q
npm test
npm run build
```

The PostgreSQL test requires a disposable database and validates concurrent reservation attempts. No PostgreSQL result should be claimed unless that environment was configured and the command passed. Test fixtures use synthetic identities, evidence and quantities.

Verification note (16 November 2026): user reported 7 passed, 1 skipped with Python 3.10 before the environment-gate cases were added. The latest local Python 3.10.10 run passed 10 tests, 1 skipped. The user reports Alembic migrations applied successfully. A local synthetic API workflow and health check passed. These checks do not establish PostgreSQL concurrency or production readiness.

## Current limitations

- No verified external identity provider; development identity is explicit and synthetic.
- No production S3-compatible adapter, malware/content scanning, retention enforcement or signed URL policy.
- Current listing query is a basic eligible-supply feed, not a complete exporter workspace or matching engine.
- Harvested lot release is not bound to Kireeti's QC records; trust boundary needs a shared transaction adapter.
- Worker handles expiry jobs only; broader imports, notifications and projection tasks need domain-owned handlers.
- No successful PostgreSQL concurrency, migration upgrade, backup/restore, performance, security or deployment evidence in this workspace yet.

## Kireeti integration checkpoint (16 November 2026)

Part 2 is merged into Kireeti in `5dd2b23`. Port 8003 above avoids the separate trade API on 8000. Both services still have independent application/transaction boundaries; no frontend projection publisher or trusted trade identity/capacity/QC adapter was added by the merge. Existing dependency pins are retained with Alembic/multipart and Uvicorn extras added.

The earlier local-only limitations above are historical: upstream main CI 43790402925 passed the dedicated PostgreSQL reservation concurrency test. On merged Kireeti, 144 Python tests plus 10 subtests passed locally with the PostgreSQL-only test skipped; disposable SQLite Alembic upgrade/downgrade/upgrade passed. Fresh merged PostgreSQL CI is recorded in WORK_LOG.md. These checks do not establish production migration, backup/restore, identity-provider, object-store or deployment acceptance.

## Workflow alignment safeguards (16 November 2026)

See [WORKFLOW_ALIGNMENT_AUDIT.md](WORKFLOW_ALIGNMENT_AUDIT.md) for the frontend/backend comparison and exporter-sponsored procurement addendum matrix. Projection capacity creation now locks the owned projection and bounds the sum of capacity slices plus older-version commitments; withheld slices still consume their declared budget. Product/variety/grade/week must match the source. Current consent, review, freshness and source identity are rechecked at discovery, listing, reservation and confirmation. Legacy contradictory rows are excluded rather than silently repaired. Canonical physical-source identity across independently generated IDs, private procurement and partner authorisation remain unimplemented.

Shared gram fields accept strict JSON integers from 0 (projection) or 1 (capacity/reservation) through 2,147,483,647, matching PostgreSQL INTEGER storage. Bounds must enclose base quantity; stale_after must follow as_of. These shared limits differ from the JSON-backed Part 3 ledger and require explicit adapter validation.

Idempotency fingerprints now include the operation/resource path as well as the payload. Reusing a key on another endpoint/resource returns 409. A pre-change stored key can also return 409 under the stricter fingerprint; inspect the recorded operation rather than automatically creating a new key after an uncertain outcome. This is a fail-closed contract correction, not a data migration.

The reservation API still requires an eligible member-visible listing: it is not a private partner allocation channel. Generic organisation permissions are not approved exporter–FPO relationships. No source-level guarantee across the independent trade ledger or future private channel is claimed by these guards.
