# Part 3 independent acceptance checks

This directory tests API commands against a real temporary database. SQLite is the local demonstration target. Set `TRADE_TEST_DATABASE_URL` to a disposable PostgreSQL test database to run the same acceptance checks against PostgreSQL; a SQLite pass is not PostgreSQL evidence.

Acceptance scenarios to pin while the API is implemented:

- Spot: inspect/hold/review lot, prohibit simultaneous active sales, enforce increasing eligible bids and server close, create one provisional award, require both counterparties on the same terms version, fulfil two partial deliveries, reconcile receiver weights, settle an agreed claim and weighted member allocation.
- Forward: comparable whole-request offers, reviewed capacity with consent and matching window/grade, deterministic equal-price offer order, no duplicate reservation, release losing capacity and atomically convert winning capacity to identified harvest lots before dispatch.
- Privacy: anonymous/demo-disabled requests rejected, roles separate QC and finance, third-party organisations cannot inspect contract, bid, QC evidence, shipment, claim or financial details.
- Durability: repeated idempotency key and payload returns the prior result; changed payload conflicts; close and confirmation survive app recreation; audit events accompany committed commands.
- Races: two competing bids on a shared database, simultaneous close workers, competing auctions for the same lot, capacity reservations and cumulative partial dispatch/receipt limits.
- Finance: grams and integer paise, half-up line amounts, deterministic largest remainder, no negative/NaN/coerced fractional money, no unilateral claim deduction or duplicate recovery, payment evidence upload differs from verified receipt/disbursal.

Tests must assert public behavior and independently calculated values, without mocking database transactions or making client time authoritative. Production identity, Part 2 capacity integration, partner legal/payment review and live operation remain external gates.

Run from the repository root after installing `server/requirements.txt` into the Python 3.12 virtual environment:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\part3_acceptance -q
```

The PostgreSQL fixture creates and drops a randomly named schema within the explicitly supplied test database. It does not touch existing schemas. Database credentials are not printed. No production database URL should be supplied.
