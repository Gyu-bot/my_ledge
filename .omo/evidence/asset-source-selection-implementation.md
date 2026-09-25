# Investment source selection implementation evidence — 2026-09-24

## Scope and authorization

User approved source-selection foundation implementation, Toss first, with explicit concern about BankSalad and external API valuation times. Worktree: `.worktrees/asset-source-selection`, branch `codex/asset-source-selection`, based on fetched `origin/main` `fd74940`. The original worktree and its existing uncommitted roadmap/evidence changes were preserved. No live service, user account, production DB, credentials, or deployment was changed.

## Delivered source-selection behavior

1. `asset_source_runs`, `asset_source_observations`, `asset_source_mappings`, and `asset_source_policy_revisions` with Alembic upgrade/backfill/downgrade. Raw parsed BankSalad asset/investment/loan observations are appended before normalized snapshot replacement. Existing snapshot APIs remain compatible.
2. `GET /assets/source-policy`, authenticated preview/confirmed apply, investment default and account-group overrides, HMAC preview binding to current selection/policy/mappings, explicit account mapping with reason/cash/component scope.
3. Complete account selection; no field merge. Default BankSalad, Toss-only investment override, visible no-success/mapping fallback, partial/failed latest attempt retains last complete valuation. A complete empty run means zero. Names normalize without collapsing different brokers. Latest complete workbook bounds prevent old uploads resurrecting disappeared holdings.
4. Additive `/investments/selected` and `/assets/source-coverage` return source dates, configured/effective source, precision, selected run, sync metadata, stale/conflicts, and a separately labeled net-worth estimate. Ambiguous or missing valuations expose an incomplete subtotal and block a full estimate. Unsafe component/cash mapping yields unavailable estimate. Cross-account transfer timing risk is explicit.
5. `/data/settings` supports preview/confirm with read-only/error states and per-group overrides. `/net-worth` displays selected-source holdings/estimate separately from unchanged BankSalad history and detail. Full reset explicitly includes source observations, mappings and policy; transactions-only reset preserves them.

## Time contract

- BankSalad date precision stays a date; API valuation/read/ingestion times remain distinct.
- `as_of_date` limits valuation dates using current policy/mappings; late-ingested older valuations are eligible. It is **not** historical known-at reconstruction (`total_basis=valuation_cutoff_current_policy_not_known_at_history`).
- Mixed-date estimate is neither same-date confirmed net worth, available cash nor investment return. A transfer after a bank snapshot but before a broker valuation can be counted in both; no unobserved history is invented.

## Verification

- Parent full backend: **437 passed, 12 skipped** (48.36 s). The PostgreSQL-only recurring-configuration concurrency suite is skipped without an explicitly selected disposable PostgreSQL database; this run uses isolated SQLite fixtures. Log: `/private/tmp/my-ledge-source-backend-tests.log`.
- Parent full frontend: **218 passed, 33 files**. Log: `/private/tmp/my-ledge-source-frontend-tests.log`.
- Parent backend Ruff: all checks passed; new source files format check passed.
- Parent frontend typecheck, lint, production build: passed. Existing Browserslist age/chunk-size advisories remain; no dependency changes.
- New migration tests execute actual upgrade/backfill/downgrade against a private in-memory DB, verify raw rows unchanged and schema/model parity. No production migration performed.
- Parent baseline existing asset/service/API/schema tests: **28 passed** before implementation.
- Synthetic runtime: BankSalad snapshot 2026-09-20 = 12,000,000 KRW net worth; Toss complete valuation on 2026-09-24 replaces mapped account including cash = 12,300,000 KRW estimate. A later failed sync preserves the last complete run; another broker's equal-named holding remains distinct. Parent verified the actual GET response after the browser applied policy. Synthetic DB is `/private/tmp/my-ledge-source-selection-qa.db`; no personal workbook content was exposed in browser fixtures.
- Final browser report and latest targeted metadata regression are appended after completion below.

## Plan coverage and boundaries

The five implementation todos deliver the investment-account selection slice. Preserve the wider roadmap's unchecked requirements instead of marking all T015–T018 globally done: general asset/loan lifecycle editing and review workflow, global/noninvestment/individual-field priority overrides, full source-file/row fingerprint linkage and source-confidence coverage, generalized conflict-resolution workflows remain extensions. Actual Toss collection/authentication/scheduling (`T019`) is outside this implementation, as approved. No claim of production deployment, real Toss account synchronization, PostgreSQL migration execution, or investment performance support is made.


## Final checks

- Parent reran new source API/service/migration tests: **25 passed** after the late-ingestion metadata regression. The selected newest valuation retains its own ingestion timestamp while last success/attempt track later arrivals accurately.
- Real workbook (`tmp/2025-05-21~2026-05-21.xlsx`) verified in a disposable in-memory DB: raw asset/investment/loan payload equality, account+instrument identity separation, and repeat same-date upload preserving both observation sets without duplicating selected totals. Only a PASS message was emitted; no personal values or rows were captured.
- Parent final runtime GET with `as_of_date=2026-09-24`: complete investment total, 12,000,000 snapshot versus 12,300,000 estimate, mixed dates and explicit date-cutoff basis all asserted successfully. Ordinary latest reads retain their separate `selected_current_estimate_with_source_dates` basis label.
- Aside first desktop/mobile browser pass: preview → apply → reload persistence, other broker preserved, failure retains normal run, date-only BankSalad display, 1280/390px no page overflow. Agent-owned tab closed. Screenshots copied into `asset-source-selection-qa/`.
- Browser harness limit: the synthetic SQLite DB lacks the existing PostgreSQL canonical dashboard views; parent server logs contain an unrelated `/canonical-views/dashboard` 500. Source-policy/selected/asset endpoints returned 200. This is not an all-endpoints E2E pass or proof of production deployment. The browser delegate's initial claim of no API errors was corrected by parent log inspection.
- Final screenshot inspection prompted a small usability refinement: account selectors now show broker names rather than opaque normalized hashes. Targeted frontend tests are rerun and a narrow final browser pass follows.

- Final narrow Aside recheck passed: broker-name labels visible, full selected total 3,800,000 displayed without incomplete-subtotal wording, original snapshot 12,000,000 versus current estimate 12,300,000, source endpoints HTTP 200. Final 390px screenshots: `asset-source-selection-qa/11-final-settings-mobile-390x844.png`, `asset-source-selection-qa/12-final-net-worth-mobile-390x844.png`. No horizontal overflow; task-owned tabs closed. Parent inspected saved screenshots.
- After the final label refinement, parent reran SourcePolicyEditor/SelectedInvestmentsPanel tests: **12 passed**. Final typecheck/lint also pass. No API/data contract changed in this refinement.
