# Meraki agent instructions

## Scope and authority

Read `README.md`, `Agent.md`, `docs/EXECUTION_PLAN.md` and the latest checkpoint in `docs/WORK_LOG.md` before implementation. Follow user instructions and any more specific directory instructions. This file is the agent-discovery entry point; `Agent.md` is the task/acceptance ledger. Keep these roles separate and avoid contradictory copies of task status.

The target is the full Final 3.0 crop-planning and procurement journey. Do not reduce it to an auction site or stop at a crop-label classifier. Current request scope matters: a documentation-only request does not authorise implementing the entire backlog, deploying, making bids or sending partner messages.

## Establish current facts

1. Inspect branch, HEAD, working tree, relevant source, scripts and CI. Preserve unrelated changes. Do not assume the deployment, checkpoint or another agent's claim matches current code.
2. Read the task's dependencies and acceptance criteria. If evidence is missing, use `UNVERIFIED`, `TODO` or `BLOCKED`; do not mark work done because a screen or document describes it.
3. Use installed stack and lockfiles. Inspect before migrating frameworks or adding packages. Never document a nonexistent command as usable.

## Bounded work and validation loop

While the user-authorised scope remains unfinished:

1. Pick the highest-priority ready task from `Agent.md`; state a concrete acceptance outcome.
2. Implement the smallest coherent slice, preserving synthetic/real evidence distinctions.
3. Run the task-specific check and relevant existing regressions. For current frontend changes, run `npm test` and `npm run build`. Add meaningful tests for new behaviour rather than tests that merely repeat implementation.
4. Inspect failures. Fix a diagnosed cause and rerun affected checks. Do not repeat unchanged failing commands indefinitely or weaken assertions to obtain green output.
5. Review the diff and invariants below. For a new UI workflow, verify representative user paths in a browser and record what was actually exercised.
6. Update status, evidence and checkpoint. Mark a task `DONE` only when every acceptance criterion is satisfied; otherwise retain `IN_PROGRESS`, `BLOCKED` or `UNVERIFIED` with the precise gap.
7. Continue to another ready task only within the authorised scope. If all remaining tasks need unavailable credentials, partner evidence or a user decision, record blockers and stop rather than inventing results.

After three attempts with the same unchanged blocker, record the attempted approaches and missing prerequisite, then switch to independent authorised work or report the blocker. This is a work-management rule, not permission to call incomplete work complete.

## Pause and resume

On an explicit pause, stop starting new work. At the nearest safe boundary, checkpoint task ID, branch/HEAD, modified files, implemented portion, exact checks/results, active process/port if any, blockers and one next action. Record paused work as unfinished. Do not force-commit incomplete or unrelated changes merely to checkpoint.

On resume, inspect the current repository and diff, reconcile any intervening edits, read the latest checkpoint and continue the recorded next action if still valid. Revalidate affected assumptions. Do not blindly reset, reclone over work or rerun every old check. A checkpoint is evidence to inspect, not proof of current state.

This Markdown does not schedule jobs, restart Codex, survive process termination as a running loop or unpause itself. An external user/session must resume execution. A clean stop with recorded external blockers is a valid handoff; it is not product completion.

## Non-negotiable product invariants

- Keep forecast, indicative enquiry, confirmed demand, proposed planting, farmer acceptance, planted crop, inspected lot and signed obligation distinct.
- Farmer consent can be withheld/withdrawn; show effects on future commitments for review. Do not silently delete history or instruct planting against unconfirmed demand.
- Preserve raw soil values, units, methods, depth, dates and plot/sample linkage. Total nitrogen and available nitrogen are different fields. Estimated maps are not laboratory tests.
- Preserve planned versus actual seed/input/irrigation events. Purchasing inputs is not verified application. Missing observations are unknown, not zero.
- Pre-sowing evaluation cannot use information unavailable at the decision date. District yield cannot become a farm label by copying it to soil samples.
- Weekly marketable supply must separate grade, committed share, retention and capacity; do not double-count grade losses or let surplus crops/weeks hide shortages.
- Water feasibility needs actual access and capacity; a regional well observation alone does not prove irrigation supply.
- Reuse existing scoped QC. Do not infer chemical safety, hidden defects or certification from photos, cheap probes, spray declarations or a QR code.
- Spot auctions rank eligible higher-price buyer bids; forward procurement ranks comparable lower-price supplier bids or a disclosed score. No opaque model overrides the published rule.
- Live reservations/awards require server validation, atomic durable writes, idempotency and audit history. Local storage, caches and browser clocks are not authorities.
- Never expose private farmer, buyer-contract or payment details on an open market board. Scope records by organisation and permission.
- API documentation/public visibility is not approval, licence or training consent. No scraped private records, invented credentials or silent production fallbacks.
- No guaranteed zero surplus, yield/income uplift, buyer order, export acceptance or calibrated confidence without supporting outcomes.

## Tests and completion evidence

Use `npm ci`, `npm test`, `npm run build` for the frontend and the virtual-environment Python with `-m pytest server/tests tests/part3_acceptance -q` for Part 3. Set `TRADE_TEST_DATABASE_URL` only to a disposable PostgreSQL database to include PostgreSQL acceptance cases. CI is `.github/workflows/ci.yml`. There is no configured lint or automated browser-test command. For documentation-only edits, check links and diff; do not invent tests for prose.

Backend ledger/auction tasks require real database concurrency, retry and recovery tests. Frontend mocks alone cannot satisfy them. Model tasks require independent held-out evaluation and documented provenance/permissions. Pilot outcomes require real consented observations, not fixtures or automated code tests.

Never replace TODOs with unchecked claims. A task record must identify implementation path, check command/manual procedure, actual result, date and relevant revision. Keep the historical evidence when code changes; mark stale evidence instead of silently rewriting it.

## Delivery

Report what changed, checks that actually ran, remaining material limits and the next ready task. Prepare reviewable branches/PRs where appropriate; do not merge or deploy without applicable authorisation. Never include secrets, personal farm reports, absolute local research paths or private conversation transcripts in public documentation.
