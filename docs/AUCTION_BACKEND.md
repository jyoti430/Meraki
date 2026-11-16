# Database-backed crop auctions

This extends the existing FastAPI / SQLAlchemy backend. The React auction workspace is at `/auctions` (FPO navigation) and `/exporter/auctions` (exporter navigation). Other planning and exporter pages retain their existing labelled demo/local-storage behavior; they have not silently become live database records.

## Run locally

Use Python 3.12 for the pinned dependencies, Node 20+ and PostgreSQL 16+. No email service, SMTP credentials, Redis or payment provider is needed.

The shortest database/API/worker setup is Docker Compose:

```sh
cp .env.example .env
# Set MERAKI_POSTGRES_PASSWORD in .env to a URL-safe random password.
docker compose up --build
```

Compose retains PostgreSQL and document volumes, runs migrations before the API starts, and starts the deadline worker after API health passes. The API is on `http://127.0.0.1:8000`. In another terminal:

```sh
npm ci
npm run dev
```

Vite proxies `/api` to port 8000. Open `/auctions`, create a separate FPO or exporter account, and sign in. FPO stock must first be published and reviewed through the existing capacity API; the auction form selects that capacity. Forward procurement requires prequalified FPO organisation IDs and a reviewed, consented, current projection covering the whole requirement. No external source or agronomy validation is implied by a review flag.

Without Docker:

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r server/requirements.txt
# Set MERAKI_DATABASE_URL=postgresql+psycopg://... in .env
.venv/bin/python -c "from dotenv import load_dotenv; load_dotenv(); from alembic.config import main; main(argv=['-c','server/alembic.ini','upgrade','head'])"
.venv/bin/uvicorn server.meraki.app:app --env-file .env --port 8000
# Separate terminal; load the SAME database environment first:
.venv/bin/python -m server.meraki.worker --interval 1
```

The worker reads exported environment variables, not `.env` automatically. Alternatively run it through `python -c` with `load_dotenv()` before importing `server.meraki.worker.main`. Protected auction writes fail with 503 on SQLite; the old shared demo remains usable on SQLite.

For an explicitly synthetic walkthrough against the local API:

```sh
# Set MERAKI_DEMO_PASSWORD to a throwaway password with at least 10 characters.
.venv/bin/python -m server.meraki.seed_demo
```

The seed command refuses non-development environments, creates `demo.fpo` and `demo.exporter`, and prints synthetic capacity and organisation IDs. It requires a healthy development API with registration enabled. Each run adds new labelled capacity; repeat accounts sign in to their existing organisation. All seed records are synthetic. It never sends emails or creates commercial transactions. The UI can then publish a 100 kg Okra / Hybrid / A spot auction using the printed delivery dates, receive an exporter bid, close via the worker, and collect both confirmations. The FPO projection can be used for a separate forward-procurement request.

## Accounts and access

`MERAKI_PASSWORD_AUTH=1` explicitly enables the local password adapter; `MERAKI_DEV_AUTH=0` keeps synthetic identity impersonation disabled. Passwords use salted scrypt (N=32768, r=8, p=1); opaque bearer sessions expire in eight hours, are stored only as SHA-256 hashes, and are revoked on logout. The browser keeps its token in tab session storage. There are no emails, verification codes, password-recovery emails or automatic payment actions. The legacy required email column receives an internal `.invalid` placeholder, not a contact address.

Registration creates a **new organisation**, with server-selected FPO/exporter permissions. It cannot join an existing organisation or choose arbitrary permissions. Production registration defaults off; enable it explicitly only under an appropriate onboarding process. Self-registration is not verification of a real FPO/exporter. Existing organisations/team membership provisioning and password recovery require an operator or a future identity adapter. Failed and successful login attempts are throttled by username and client address in the database (10 per 15 minutes); registration is throttled by address. Configure a trusted reverse proxy and an additional edge rate limit before internet exposure; forwarded addresses are not trusted automatically.

For a separate frontend origin, set an exact comma-separated `MERAKI_CORS_ORIGINS` and build with `VITE_API_BASE_URL` pointing at the API. Prefer a same-origin `/api` reverse proxy. Use HTTPS outside localhost. Keep secrets and `.env` out of Git. `production_ready` remains false: organisation verification, private object storage, operating/security review, trading terms and payment evidence are external release gates. Compose is a local development configuration, not a production hosting deployment.

## Published rule version: whole-lot-v1

- Spot: one entire reviewed harvested lot; eligible exporters bid upward in integer INR paise per kg. First bid must meet reserve, subsequent bids must improve by at least the increment.
- Forward: an exporter requests a fixed crop/variety/grade, quantity, delivery window and terms. Prequalified FPOs bid downward below the maximum price. A supplier must cover the entire request with its own current, reviewed, consented projection. Split awards and scored tenders are not implemented.
- Bids lock the auction row. Server time is checked **after** obtaining that lock. Equal/non-improving bids are rejected, so the first server-accepted equal price keeps precedence. The highest eligible spot bid / lowest eligible forward bid wins; invalidated capacity is excluded at closure.
- The default window is caller-published; the form uses explicit local opening/closing inputs converted to UTC. Default anti-sniping: a valid improving bid in the last 120 seconds adds 120 seconds, capped at 600 seconds beyond the original close. Rule parameters and terms cannot be edited after publication. The server, not the browser clock, decides whether a bid is on time.
- A spot auction reserves the lot at creation. A forward offer reserves supplier capacity on its first accepted bid; improvements reuse that hold. The shared capacity row lock and quantity constraint prevent an auction hold from racing an ordinary reservation. One source has one capacity row per organisation; the new uniqueness migration intentionally rejects pre-existing duplicates for operator reconciliation.
- Provisional awards retain the winner's hold and release losing holds. Both buyer and seller must confirm within the published deadline (24 hours by default). Only then does held quantity become committed. No bids, cancellation before the first bid, explicit decline and confirmation timeout release holds. Default requires an explicit rerun; no losing bidder is automatically bound or charged.
- Common active organisation members prevent linked/self-bids; this detects recorded membership links, not undisclosed real-world beneficial ownership. All mutation effects, receipts, holds and awards persist atomically with idempotency and audit records. Owners cannot cancel after bids arrive.
- The worker closes overdue auctions and expires provisional awards by querying durable state. Multiple PostgreSQL workers skip locked rows; a process restart requires no browser reconnect or in-memory timer recovery.

The board exposes auction terms and anonymous leading prices to authenticated members. Private organisation IDs, qualification lists and other bidders' receipts are excluded. Each bidder sees only its organisation's receipts; only the two award parties see confirmation details. Do not put private farmer/customer/contract information into market-facing title or terms fields. References must identify an approved shareable protocol rather than embed a private document.

## API

OpenAPI is at `/docs`. Protected requests use `Authorization: Bearer <token>` plus `X-Organisation-ID`. All auction mutations require a stable `Idempotency-Key` (1–200 characters). Identical retries return the original result; changed payload reuse returns 409. Keys are scoped by user/organisation and include the operation in the request fingerprint. Concurrent identical retries serialize before checking state.

| Method | Endpoint | Behavior |
|---|---|---|
| POST | `/api/v1/auth/register` | Create separate organisation and account |
| POST | `/api/v1/auth/login` | Issue expiring opaque session |
| GET / POST | `/api/v1/auth/me`, `/api/v1/auth/logout` | Check scope / revoke session |
| GET / POST | `/api/v1/auctions` | Market board / publish fixed terms |
| GET | `/api/v1/auctions/{id}` | Authoritative snapshot and server time |
| POST | `/api/v1/auctions/{id}/bids` | Price in paise/kg, `accept_terms: true`, supplier capacity for forward offers |
| GET | `/api/v1/auctions/{id}/bids` | Own organisation's immutable receipts |
| POST | `/api/v1/auctions/{id}/close` | Apply closure if due; early calls leave it open |
| POST | `/api/v1/auctions/{id}/award` | `action: confirm` or `decline`, award parties only |
| POST | `/api/v1/auctions/{id}/cancel` | Owner only, before first bid |

Quantities are integer grams, money is integer INR paise/kg, timestamps require timezones. Floats, numeric strings, negative bids, wrong currency, absent terms acceptance, wrong crop/grade/window, stale or withdrawn projections and foreign capacity fail server validation. The auction UI displays kilograms and rupees and converts them at the API boundary.

## Verification and recovery

```sh
npm test
npm run build
# Use a disposable PostgreSQL database, never a production URL:
MERAKI_TEST_POSTGRES_URL=postgresql+psycopg://... .venv/bin/python -m pytest server/tests -q
```

CI supplies PostgreSQL 16, applies migrations and runs the complete backend suite with database tests enabled. New auction tests create and remove isolated schemas. Coverage includes price direction, scope/privacy, login/logout/expiry/throttle, equal and concurrent bids, concurrent duplicate retries, lock-wait deadline rechecks, extension cap, stock reuse, ordinary ledger conflicts, supplier eligibility, both confirmations, no-bid/default/decline/cancel, concurrent worker restart recovery, migrations up/down/up and source uniqueness.

Use PostgreSQL tools with the same major version as the server. A backup covers database records; private document bytes need a separate object/filesystem backup. Store backups encrypted with restricted access and test restoration to a separate database:

```sh
pg_dump --format=custom --file=meraki.dump "$DATABASE_URL"
# Create a separate empty restore database first.
pg_restore --exit-on-error --dbname="$RESTORE_DATABASE_URL" meraki.dump
```

These tools take a PostgreSQL URL (`postgresql://`), without SQLAlchemy's `+psycopg` suffix. Resume the API and worker only after migrations, health, capacity totals and audit/award consistency pass. Downgrades remove the new auction/account tables and are only for throwaway tests or an explicitly approved destructive rollback; use a forward fix or restore procedure for retained data.
