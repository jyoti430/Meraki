# Part 3 trade development and integration

This module implements auctions, contract confirmation, QC, dispatch/receiving, claims and settlement records. It does not move money or establish export certification. Its development identities and production-capacity fixtures are synthetic.

## Local setup

Install Node/npm and Python 3.12 or newer compatible with the pinned server requirements. From the repository root:

```sh
npm ci
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\python.exe -m pip install -r server/requirements.txt
npm run dev:trade
```

macOS/Linux:

```sh
.venv/bin/python -m pip install -r server/requirements.txt
npm run dev:trade
```

Open the URL Vite prints, then `/trade`. The launcher starts a localhost-only FastAPI server on port 8000, its auction/expiry worker, and Vite. It explicitly enables synthetic development mode. Stop all three with Ctrl+C. `TRADE_PYTHON` can override the interpreter path. Ports must be free; a failed child stops the other processes.

The original `npm run dev` still starts the planning frontend alone. Without the trade API, trade pages show a connection error; they do not pretend a bid succeeded. Vite proxies `/api/trade` to localhost:8000 or `TRADE_PROXY_TARGET`. Production static hosting needs its own API proxy; Vite's development proxy is not included in a static build.

## Configuration

See `.env.example` for names, not production credentials. Export server variables in your shell or runtime. The Python service does not assume the example file has been loaded. The combined launcher deliberately forces development mode; never use it as a production command.

| Variable | Meaning |
|---|---|
| `TRADE_DATABASE_URL` | SQLAlchemy URL. Default file-backed SQLite for local work; PostgreSQL target uses `postgresql+psycopg://...` |
| `TRADE_DEMO_MODE` | Explicit `1` enables synthetic principals and capacity; default off |
| `TRADE_ENV` | `production` rejects demo and trading until real Part 2 adapters are implemented |
| `TRADE_TEST_DATABASE_URL` | Disposable PostgreSQL test database for database/concurrency tests |
| `TRADE_PROXY_TARGET` | Vite development proxy only |
| `VITE_TRADE_API_URL` | Optional frontend API prefix; use a same-origin reverse proxy, or separately configure restricted CORS for a different origin |

The API currently provides no cross-origin browser policy. Pointing the frontend directly at another origin is insufficient without configuring CORS in the deployment. Never enable unrestricted credentialed origins merely to bypass a browser error.

SQLite is a local development option, not evidence of PostgreSQL correctness or production readiness. Keep the database on local disk; do not put SQLite on a shared/network filesystem. Runtime database files, credentials and virtual environments are gitignored. Keep backups and controlled restoration separate from demo reset; the existing planning reset is browser-local and does not reset trade records.

## Independent processes

With the appropriate environment exported:

```sh
python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
python -m server.worker
python -m server.worker --once
```

Use the virtual-environment Python instead of a global interpreter. The worker closes auctions and expires unconfirmed contracts without an open browser. Repeated passes must not create duplicate contracts or release another transaction's capacity. Monitor the worker separately from the API; a running frontend is not proof that scheduled work is healthy.

## API contract

The implementation contract is [server/CONTRACT.md](../server/CONTRACT.md). API prefix is `/api/trade`. Authentication is a server-resolved bearer session. Mutating authenticated requests require an `Idempotency-Key`; changed intent with the same key fails. Transitions also require the last observed resource version.

On a network timeout, retry the same payload with the same key; do not generate a second intent. A stale-version conflict means refresh and review the current state before a new command. Grams are integer quantities, paise are integer money amounts, and price is paise per kilogram. The UI displays kg/rupees without changing the API contract.

Synthetic role selection exercises each side of the workflow. It is not production login, account verification or legal signing. Finance reconciliation records evidence and reviewer actions, not fund transfers. No development action should use real bank references, personal farmer records or commercial contracts.

## Part 2 integration gates

1. Supply a verified identity resolver with organisation and action scopes. Remove development identity switching from the live surface.
2. Connect the authoritative capacity ledger. Reserve/commit/release/lookup need idempotent tokens, expiry and recovery. Do not assume a remote capacity API participates in a local SQL transaction.
3. Keep forward tranche-to-harvest-lot allocations exclusive, including after amendment/default/retry. A crop planner forecast is not confirmed stock.
4. Replace reference-only document evidence with authorised private storage and scoped download access. A reference string is not an uploaded/verifiable laboratory report.
5. Run schema/migration, PostgreSQL concurrency, restart/restore and deployed routing checks in the target environment. Current global transaction locking prioritises correctness; benchmark before scaling.
6. Agree contracts, QC authority, finance reconciliation, claim resolution and operating responsibilities with real participants. A technically recorded confirmation does not establish legal/commercial suitability.

Production mode fails closed while these adapters are absent. Do not remove this guard to make a demo look live. Future remote adapters need an explicit pending/reconciliation protocol, not only replacing a function call.

## Verification

```sh
npm test
npm run build
python -m pytest server/tests tests/part3_acceptance -q
```

Use `.venv` Python. To verify PostgreSQL, set `TRADE_TEST_DATABASE_URL` to a disposable test database first; never point acceptance tests at production. CI provisions PostgreSQL 16 and runs the same Python suite. Read actual job outcomes before claiming PostgreSQL verification.

Backend tests must cover concurrent bids/reservations, idempotency conflicts, late bids/extensions, no-sale/expiry, wrong-organisation access, QC holds, partial shipment limits, receipts, claims and money conservation. Browser checks must cover the FPO/exporter/reviewer journey, rejected commands, refresh and mobile layout. A passing software suite is not field validation, payment-provider approval or a farmer-income result.
