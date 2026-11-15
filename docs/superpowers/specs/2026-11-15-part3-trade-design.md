# Part 3 auctions and fulfilment design

Status: proposed implementation design awaiting user approval. This makes the previously agreed Final 3.0 scope concrete for T06, T07, T09 and T10. No product code has been changed by preparing it.

## Outcome

An FPO and exporter can complete a traceable journey from a harvested-lot auction or qualified future supply request through bilateral contract confirmation, QC review, dispatch, receiving, claims and member settlement records. Existing crop-planning pages remain usable. State changes are durable and server-authorised rather than browser-local promises.

## Current evidence

The local feature branch starts at documentation commit `02a17e5`, based on main implementation `dddaa7c`. Main has React 18, Vite 5, TypeScript 5.6, React Router, Tailwind and Vitest. Five fulfilment pages are placeholders. Planning and existing-crop reservations use local storage. No shared backend, identity service, authoritative auction engine or payment provider was found. An independent agricultural-data branch exists; it is outside this workstream and will not be overwritten or silently merged.

## Approaches

1. Frontend-only simulator: quickest interface delivery but cannot satisfy atomic bid, identity, reservation or restart acceptance. Useful only as a labelled demonstration; not recommended for this request.
2. Isolated API-backed Part 3 module: recommended. A Python package owns only trade aggregates and provides React with a stable API. Part 2 can mount it and supply identity/capacity adapters. PostgreSQL is the authoritative target; a separate local demonstration setup is explicitly non-production.
3. Wait for the complete Part 2 backend: minimises integration adaptation but blocks independent Part 3 execution. Not recommended while no interface is available.

These are implementation recommendations, not choices the user has already made. Approval of this design selects approach 2 unless explicitly changed.

## Ownership and boundaries

- Part 3 owns trade lots and QC evidence references, auctions/bids/awards, contracts, shipment state, receipt inspections, claims, settlement calculations and audit events.
- Part 2 owns organisation identity, marketplace discovery, shared capacity and production deployment. Define adapters instead of creating incompatible duplicate customer/farm records.
- Consume external IDs for organisations, orders, crop cycles and capacity tranches. Import synthetic fixtures for development only; they are not confirmed supply from the existing browser planner.
- Shared backend absence is not permission to pretend browser local storage is authoritative. Live trading is disabled until real identity/capacity integration and PostgreSQL acceptance are verified.

## Technical shape

React/Vite routes and a typed API client under a dedicated trade feature directory. FastAPI/Pydantic request/response schemas, SQLAlchemy and migrations in a dedicated Python trade module. PostgreSQL transactions/row locks and uniqueness constraints protect awards and reservations. A durable scheduled close command can be invoked by Part 2's worker; a small local scheduler exercises it independently.

Use configurable API base URL and a Vite development proxy. Show loading, validation, offline/error/retry and empty states without falling back to fabricated success. Polling with server timestamps is acceptable initially; durable correctness does not depend on a live socket.

For local demonstrations, explicit opt-in development identities may simulate FPO, two exporters and reviewer roles using server-side principal mapping. The interface clearly labels synthetic data. Demo authentication must be unavailable in production mode; no production secret is embedded in the frontend. Production principals arrive through Part 2's verified token resolver, never a client-supplied organisation header.

## Auction rules

### Harvested lots

- Whole homogeneous lot, crop/variety/grade, quantity, seller, pickup deadline, handover basis, reserve, price increment and QC evidence.
- Scheduled opening/closure; highest eligible buyer price wins. Seller/self-linked accounts cannot bid. Bid receipt includes authoritative timestamp and ID.
- Default two-hour window, two-minute late-bid extension and ten-minute total extension cap, all published before opening. Persist original and effective close.
- Price priority wins; server acceptance order breaks equal prices where equal bids are allowed. Rules determine whether a bid must strictly improve; tests pin the chosen policy.
- Reserve the lot during active sale/award, prevent multiple active sales, release on disclosed cancellation/no-sale/default. Do not auto-bind the runner-up.

### Forward procurement

- Exporter request contains crop, variety, quantity, grade protocol, delivery window, handover, maximum price and payment terms.
- Qualified FPOs submit comparable offers. Whole-request awards first; partial bids are explicitly rejected unless a later split-award mode is implemented and tested.
- Qualification requires consented external capacity references, compatible timing/grade and reviewed evidence; synthetic qualification is visibly local-only.
- Lowest eligible comparable supplier price wins. No opaque model changes ranking. Reserve binding offered capacity, release superseded/lost/expired offers, and prevent duplicate commitments through the capacity adapter.
- Missing Part 2 capacity verification blocks production eligibility rather than producing an assumed qualified state.

## Award and contract lifecycle

Auction award is provisional. Both counterparties confirm a versioned term snapshot before dispatch. Terms include quantity, price basis, grade protocol, delivery window, payment deadline, cancellation/default, production risk and dispute procedure. Confirmation is a recorded local workflow, not an assertion of legally reviewed electronic signing.

Cancel/default operations require an authorised actor, reason, state guard, audit event and capacity release policy. Once a shipment exists, cancellation cannot silently erase movement or payment obligations. Amendments require a new version and renewed approval where material.

## QC and logistics

FPO records lot/sample identity, protocol/version, inspected weight/sample count, observed grade/defects and report references. Reports retain issuer, date and scope; attachments are private references with a Part 2 storage seam. Missing/failed evidence creates a hold. An authorised review records release without claiming certification; release is blocked for unresolved safety holds.

Shipment references a confirmed contract and eligible lot. Validate quantity against remaining contract/stock, pickup/delivery dates and packing/handover details. Track draft, dispatched and received states with actor/timestamps. Dispatch and receipt cannot be rewritten by a later claim. Allow multiple partial deliveries only with cumulative remaining-quantity checks.

Receiver partitions received weight into accepted, downgraded and rejected quantities; weights and transit shortfall reconcile. Require reasons for rejection/downgrade and retain inspection evidence. Cosmetic downgrade is separate from safety rejection. Disagreement opens an explicit claim; settlement can hold the disputed portion and preserve undisputed records.

## Claims and settlement

Claim references a receipt, affected weight/amount, evidence, reason and both parties. Resolve with recorded agreement or authorised review; never silently deduct a requested claim amount. Prevent duplicate recovery and amounts exceeding the attributable obligation. Preserve amendment history.

Calculate in integer money minor units and explicit fixed weight precision. Contract price, accepted/downgraded amounts, agreed adjustments, disclosed fees and member allocations reconcile. Reject negative/nonfinite values and rounding inconsistencies. Allocation weights/amounts must equal the distributable total. Track invoice obligation, verified FPO receipt and individual member disbursal separately.

This scope records payment reconciliation; it does not move funds, lend, auto-charge or claim an uploaded screenshot is verified payment. Real payment-provider integration remains Part 2 coordination and separately authorised commercial work.

## API and storage contract

### Concrete integration and commercial defaults

- Capacity adapter exposes idempotent `reserve`, `commit`, `release` and `lookup` operations returning reservation token, quantity and expiry. With a remote ledger, persist pending operations and reconcile after failures; block the award until reservation confirmation. Do not pretend a local SQL transaction also commits a remote system. A same-database adapter may join the trade transaction.
- Forward production reservations convert to identified harvest-lot allocations before dispatch. Their committed quantities cannot simultaneously enter a spot auction. Record the tranche-to-lot conversion atomically in the authoritative ledger or use the same recoverable reservation protocol.
- Spot bids must strictly improve the leading price by at least the published increment; an equal/insufficient bid is rejected, including simultaneous duplicates. Forward offers may tie: earliest server acceptance sequence wins. A supplier may improve its offer before close; keep revisions and release superseded excess reservations. Forward mode uses a published fixed two-hour window without extensions; spot mode uses the extension policy above.
- Provisional awards expire 24 hours after close unless both parties approve the same terms version. Scheduled expiry releases reservations. Reject term edits after dispatch; use explicit bilateral amendments before dispatch and adjustment records thereafter.
- Initial currency is INR; quantity precision is grams and prices are integer paise per kg. Use decimal arithmetic and round final line amounts to paise with a documented half-up rule. Contract terms specify any downgrade rate, fee payer, transit-shortfall liability and member contribution weights. No unilateral price/deduction default is inferred. Member distributions use contribution-weighted net proceeds with deterministic largest-remainder allocation, stable member ID breaking equal remainders.
- FPO seller creates lots and dispatches; exporter buyer bids/receives; qualified FPO bids on future supply. Assigned QC reviewer releases holds; finance reviewer reconciles payment evidence. These are separate permissions, not a universal reviewer role. Claims require both parties to approve the same resolution unless a contract-assigned adjudicator is authorised. Financial verification records the evidence basis and actor; upload alone cannot mark payment received. Development role switching remains visibly synthetic and opt-in.

Resources: trade workspace/identity, lots, QC inspections/reviews, auctions, bids, awards, contract terms/confirmations, shipments, receipts, claims, settlement statements and audit events. Every command carries an idempotency key; key reuse with a different payload fails. Principal and organisation scope are server-resolved. Server clock validates deadlines.

State transitions and their audit events commit in one transaction. Stable IDs and version numbers prevent stale overwrites. Read visibility distinguishes market opportunity data from private bids, evidence and financial records. Lists are bounded. No client can choose its own authoritative timestamps or final award winner.

## Screens

- Auction board and detail with schedule, terms, evidence, price direction, bid history/receipt and outcome.
- Forward request and qualification/offer workflow.
- Contract detail with term versions, both approvals and cancellation/default status.
- Replace Lots and inspection, Lab and release review, Crates and shipments, Arrival and claims, and Farmer settlements placeholders with real API-backed workflows.
- Add a discoverable trade navigation entry and coherent links across auction → contract → lot → shipment → receipt → claim → settlement.
- Retain existing visual language and mobile usability. Every create/action form has explicit labels, validation, pending state, failure messages and prevention of duplicate submission.

## Verification and completion

Test domain rules before implementation using pytest/Vitest as appropriate. Run real database concurrency tests for competing bids, close retries and stock/capacity races; SQLite results cannot be reported as PostgreSQL validation. Test identity isolation, self bids, late bids, extensions, reserve/no-bid, stale versions, idempotency conflicts, illegal transitions, held lots, partial deliveries, weight/money reconciliation, claims and over-allocation.

Run existing frontend regressions and production build. Exercise representative FPO/exporter/reviewer paths in a browser, including failures, reload and small viewport. Add API integration tests with temporary databases, restart recovery and close scheduling. Record actual commands/results and production gates in the work log and ledger.

Ship as a feature branch/PR, not a direct merge or deployment. T06/T07/T09/T10 are not marked fully DONE until their applicable acceptance checks pass. Missing partner/production identity/capacity/payment/legal/field validation stays explicit. No real bids, signed contracts, messages or money transfers occur during development.
