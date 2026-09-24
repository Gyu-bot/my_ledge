# Live audit remediation and verified deployment

Status: in-progress
Authorization: user explicitly requested every discovered error to be fixed, pushed, deployed to Live, and verified on 2026-09-24. This instruction approves execution of the previously reviewed audit findings and T042/T043; no additional planning approval is pending. No merge into main is implied. OMO generator is not available in this session; this checked-in execution plan records the approved scope directly.

## Evidence and scope

Private audit evidence is in gitignored `tmp/live-audit-2026-09-24/report.md` and domain reports. Do not commit financial values, raw transactions, source files, browser captures, secrets, or diagnostic payloads. Preserve raw evidence. The accepted findings below are the completion checklist; false positives (routing cache, missing DOM, source duplicate claims) and correctly unavailable month-end snapshots are not bugs to implement around.

## Requirements

- [ ] R01/T042: preserve untouched loan metadata; explicit automatic/manual reset; recalculate affected current estimates after every link change; invalidate all dependent views; show missing reasons; repair invalid manual-null/stale estimates through reviewed API requests after backup.
- [ ] R02/T043: separate observed income, remaining expected regular income, projected monthly income and net cashflow; stable regular-pay matching/date/amount histories and editable expectations; closed-month data coverage, confidence, missing reasons; reconcile actual/split/late/one-off income without double counting; include remaining recurring/loan/installment/variable spend with no overlap; coherent home/chart/reference presentation and regression cases from T043.
- [ ] R03: net-worth totals/history/comparison/breakdown share negative-asset/debt treatment; preserve raw rows; expose exclusions and provenance consistently.
- [ ] R04: liquidity requirements use one appropriate period and avoid debt double counting; snapshot-specific input provenance and precise nonzero runway.
- [ ] R05/R07/R12: preserve refund signs throughout category/merchant charts and anomaly money; direction-correct sparse-baseline warnings; net refunds in discretionary velocity.
- [ ] R06: income-inclusive spending excludes transfers consistently across lenses.
- [ ] R08: all signal widgets honor or explicitly identify selected time scope; current vs closed comparisons labeled.
- [ ] R09: queue filtering before pagination, total counts and usable pagination/search/filter UI; summary truncation explicit.
- [ ] R10: installment suggestions handle evidenced merchant aliases/description continuity, expose candidates for review without auto-linking uncertain charges.
- [ ] R11/W04: asset cash-equivalent tri-state and partial updates; historical metadata inheritance across matching new snapshots with ambiguity handling; restore identifiable prior metadata through API.
- [ ] R13: existing invalid test rules removable through bounded authenticated API, reject invalid category rules using meaningful category validation; backup and remove confirmed nonmatching test artifacts only.
- [ ] R14: category/date and transaction context survive drilldown navigation.
- [ ] W01: recurring approval applies exactly previewed eligible rows, checks stale/conflicting state and settings; no silent scope expansion.
- [ ] W02/W03: explicit necessity edits take precedence, omitted classification fields and provenance preserved, inbox initial values meaningful and dependent cache invalidation correct.
- [ ] W05: every editable recurring detection setting actually consumed; default scope contract coherent; future-only option implemented or explicitly unavailable (never false success).
- [ ] C01: past unlinked installment observations distinct from future obligations; future schedule and all detail rows accessible; plan lifecycle controls if provided by API.
- [ ] C02: cancellation-like review candidates labeled accurately or conservatively excluded with clear evidence; no unapproved settlement-link creation.
- [ ] C03: recurring history versus active subscriptions clearly separated, recent/active filtering and last-observed dates.
- [ ] C04: necessity missing bucket makes decompositions exhaustive, percentages sum correctly, unclassified deductions/available-cash explanation accurate.
- [ ] C05: currency symbols singular; internal implementation labels replaced with user explanations; tiny nonzero runway meaningful; stale feature availability text corrected.
- [ ] C06: reference lists and installment schedules not silently truncated; same-day transactions distinguishable by source time/payment method.
- [ ] C07: spending lens/filter behavior coherent; cross-page bulk selection cannot silently omit selected records.

## Ownership and execution

- Assets backend: assets aggregation, liquidity, asset metadata inheritance and asset/loan metadata endpoint contracts.
- Loan/installment backend: link estimates and lifecycle, suggestions and forecast semantics.
- Classification backend: transaction updates, recurring rules/settings consumption and safe approval scope, rule validation.
- Analytics backend: refund netting, anomaly direction, time ranges, recent recurring candidates and necessity decomposition.
- Projection/canonical: T043 model/API, canonical queue filters/totals and home/reference consumers.
- Data frontend: inbox, transaction/rule/settings operations and shared transaction hooks/adapters.
- Analysis frontend: spending/signals/charts and analytics adapters.
- Asset frontend: loans/installments/assets/net-worth and asset adapters.
- Root: API seam coordination, integration, review, tests, docs, publication, backup, deployment, API remediation, live browser/read-only verification.

## Verification and delivery gates

- [ ] Targeted regression tests cover each accepted bug including negative/partial/ambiguous cases; isolated fixtures, no production DB test writes.
- [ ] Full relevant backend suite, Ruff lint and changed-file format, frontend Vitest/lint/typecheck/build and migration upgrade checks pass on final revision; identify unchanged pre-existing full-tree format issues separately.
- [ ] Independent code review and discrepancy resolution completed.
- [ ] Final branch committed/pushed; PR created and attached; CI verified. Preserve main until explicit merge authorization.
- [ ] Live service/ports/checkout inspected; database and affected row snapshots backed up and restore approach verified before changes.
- [ ] Deploy exactly the pushed commit, run migrations normally, preserve DB/uploads and unrelated services, prove backend/frontend version and health.
- [ ] Apply only deterministic authorized data repairs through authenticated API with before/after evidence; no direct DB data writes and no uncertain loan/installment matches.
- [ ] Aside-delegated Live browser QA and GET/readonly DB verification cover every changed user-visible behavior; all agent-created tabs closed.
- [ ] Requirement-by-requirement completion evidence recorded; roadmap and API/canonical docs updated; no unresolved accepted item hidden by a broad passing check.

## Evidence log

- Baseline local origin/main: 57de4dd. Original checkout has three planning document edits preserved and copied into isolated fix worktree; unrelated untracked artifacts untouched.
- Live checkout observed at eedf5fb, untracked package-lock.json preserved. Current my_ledge services bind 3000/8000/5432; other host services remain unchanged.
- Backend test fixture uses temporary SQLite. No test Docker needed for unit/API regressions; PostgreSQL integration will use an isolated database/container if required after port recheck.

- Restored a custom-format production backup successfully into a private local PostgreSQL 16 clone; existing migration head upgrades without schema changes. Runtime-parity Python 3.12 environment is isolated from the development virtual environment.
- Initial integration GET sweep: 45 parameterless read routes returned 200 against the clone. Loan repair API restored four current estimates; transaction links were not changed. Detailed private responses are retained under `tmp/live-remediation-2026-09-24/`.
- Independent review caught bulk lifecycle recalculation, inactive installment-link consistency, current-month comparison labeling, and stale recurring configuration concurrency. Fixes/regressions are being integrated before the final full check.

- Final implementation integration on Python 3.12: 404 backend tests passed, including 12 disposable-PostgreSQL concurrency cases. Frontend: 192 tests passed; lint, typecheck and production build passed. Backend lint and all 45 changed Python files format checks passed. Full-tree format reports 29 untouched baseline files; each also fails at origin/main, and no unrelated formatting was applied.
- Independent reviews for assets/loans/installments, analytics, classification concurrency and monthly projection all closed their P1/P2 findings after focused regressions.
- Clone API repair rehearsal completed through authenticated endpoints only; read verification passed 24 assertions before and after. Exactly the intended loan metadata, asset metadata and invalid-rule tables changed; raw transactions and all link tables remained byte-content equivalent. Live fingerprint still matches the original read-only audit.
- Aside assets/loans/installments UI QA and the original-value edit regate passed. Data-write and analytics/projection browser QA are finishing against separate private clones. Deployment and Live repair are still pending at this commit.
