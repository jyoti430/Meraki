# Render backend and Vercel frontend

16 November live-auction rollout: the existing service now enables `MERAKI_PASSWORD_AUTH=1` and `MERAKI_ALLOW_REGISTRATION=1` in `HOSTED_MODE=demo`, with exact Vercel CORS. DATABASE_URL and the PostgreSQL instance are preserved. Effective shared password auth replaces shared development-token auth; the separate `/api/trade` synthetic sessions still work. Dedicated synthetic accounts/stock and both auction modes were verified live; see QA_ROUNDTRIP_REPORT.md. No passwords are stored in repository documentation.

Configured backend: [meraki-api-lpof.onrender.com](https://meraki-api-lpof.onrender.com/api/health). Render service `srv-dbt9bmec6qcc73b4c6m0` deploys `main` from `jyoti430/Meraki`, in Singapore. The free PostgreSQL16 database `meraki-demo-db` expires on 16 December2026. Frontend: [Meraki on Vercel](https://meraki-tau-opal.vercel.app/), deployed by the repository's existing Vercel integration. Deployment verification/results are recorded separately in WORK_LOG.md.

The composite backend starts with `python -m server.start_hosted` from the repository root. Build with `pip install -r server/requirements.txt`; Python is pinned in `.python-version`. The start command applies shared Alembic migrations before Uvicorn binds to `0.0.0.0:$PORT`. Trade tables use the existing trade schema manager. Use one instance/process: its lifespan supervises shared expiry and synthetic trade closing jobs. Jobs pause when the host stops and resume on startup; this is not an always-on worker guarantee.

Create a PostgreSQL database and Python web service in the same Render region. In the service environment set `DATABASE_URL` to that database's **internal** URL, `HOSTED_MODE=demo`, and `CORS_ALLOWED_ORIGINS=https://meraki-tau-opal.vercel.app`. Database credentials belong only in Render's secret environment. PostgreSQL URL aliases are normalized to the installed psycopg driver. Separate trade/shared URLs are supported, but the hosted demonstration uses one PostgreSQL database with distinct tables.

`HOSTED_MODE=demo` explicitly enables synthetic identities and capacity fixtures. Server-backed demonstrations persist on PostgreSQL; this does not turn fixtures into real farm evidence. The default production mode disables demo authentication and blocks trade commands until verified identity/capacity adapters exist. The root health response always reports `production_ready:false`, persistence metadata and worker state. Never enter private customer, farm or payment records into the public synthetic demo.

Routes retain their original full prefixes:

| Route | Authority |
| --- | --- |
| `/api/trade/*` | Trade requirements, proposals, auctions, contracts and lifecycle |
| `/api/v1/*` | Separate shared organisation/projection/reservation foundation |
| `/api/live-data/*` | Public regional providers with freshness/error provenance |
| `/api/sensors/serial` | Capability response; Render cannot access laptop USB |
| `/health`, `/api/health` | Database readiness and hosted limitations |

Each API namespace has `/docs` and `/openapi.json`. Child middleware and authentication remain active. Shared and trade ledgers are still separate domains: sharing a process/database does not create an atomic cross-domain capacity adapter.

The frontend uses same-origin `/api` requests through `vercel.json`, followed by SPA fallback for page routes. An explicit `VITE_BACKEND_URL` can override the root; service-specific overrides remain available. HTTPS pages reject HTTP APIs. API errors preserve stale records read-only and never substitute invented live results. Local planning/QC, example exporter drafts and synthetic yield POC retain their explicit local/synthetic labels.

Hosted sensor uploads return HTTP 503 until a durable, authenticated gateway adapter is connected; USB ingestion remains a local-gateway workflow. Hosted document uploads also return HTTP 503 pending approved durable object storage. Neither feature writes misleading ephemeral cloud files.

Free Render hosting is a demonstration choice: web instances sleep after inactivity and free PostgreSQL expires after 30 days with no managed backups. See [Render's current free-tier limits](https://render.com/docs/free). Upgrade/restore acceptance, external identity, private storage, hardware linkage and commercial/field validation remain separate tasks.

Verification: request `/api/health` through the deployed frontend, then check trade synthetic session/workspace, shared health, live-data health, and sensor unavailable responses. A frontend HTML response from an API path means its deployment/rewrite is stale; do not treat HTTP 200 alone as successful API routing.
