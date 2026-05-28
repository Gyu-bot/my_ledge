# Advisor Analytics Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add advisor-oriented analytics endpoints that let OpenClaw explain cashflow, spending changes, recurring spend, transfer flows, snapshot deltas, and asset/liability health without re-deriving core finance calculations from raw tables.

**Architecture:** Reuse the existing canonical transaction read path (`vw_transactions_effective`) as the row-level source of truth, keep the live analytics service/router/schema contracts stable, and add advisor-oriented canonical aggregate views for readonly SQL and external-agent reuse. Separate exact aggregate views from heuristic or `as_of_date`-dependent diagnostics so OpenClaw can distinguish reusable finance facts from settings-driven recommendations.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, Alembic, pytest + httpx AsyncClient

---

## Feasibility Summary

- **P0 (live endpoints):** `monthly-cashflow`, `category-mom`, `fixed-cost-summary`, `fixed-cost-trend`, `merchant-spend`
- **P0 canonical view follow-up:** `vw_monthly_cashflow`, `vw_loan_repayment_monthly`, `vw_true_spendable_monthly`, `vw_merchant_monthly_baseline`
- **P0.5 data-quality view:** `vw_unclassified_work_queue`
- **P1 (live diagnostics):** `recurring-payments`, `spending-anomalies`, `payment-method-patterns`, `income-stability`
- **P1 as future consumer requirements:** P1 warning/recommendation features are not the next implementation target. Use them to make sure P0/P0.5 canonical views expose the fields future assistant consumers need.
- **P1 canonical/API split:** `vw_recurring_merchant_monthly` for stored recurring classifications; discretionary velocity and purchase-gate candidates stay behind API/settings contracts until `as_of_date` and threshold semantics are fixed.
- **P2 (estimated / mapping-dependent):** `net-worth-breakdown`, `investment-performance`, `liquidity-health`, `debt-health`, `snapshot-compare`, `vw_asset_snapshot_canonical`, `vw_investment_allocation_snapshot`
- **Schema enrichment deferred:** `merchant_normalized`, merchant-based fixed/variable classification rules, liquidity mapping, `monthly_payment`, `repayment_type`, budgets/goals/preferences

## Product Direction Decisions

- My Ledge should first provide canonical views/read models that a finance assistant can trust. Assistant personality, tone, and coaching style belong to a separate consumer layer.
- Canonical surfaces should expose structured evidence such as `reason`, `confidence`, `assumptions`, `risk_level`, `baseline_delta`, `is_estimated`, and `needs_user_review` rather than embedding a conversational persona.
- Upload source files should be retained as the latest 5 originals.
- Asset, investment, and loan snapshots remain upload-driven for now; do not introduce required month-end or scheduled snapshot capture in this batch.
- Loan repayments are separated from ordinary consumer spending.
- True spendable monthly output should expose both pre-variable-spend availability and remaining-after-variable-spend availability.
- Merchant baseline should include trailing 3-month averages and deltas.
- Unclassified work queue priority is based on analysis impact, amount, and recurrence likelihood.
- Merchant normalization starts with manual alias rules, not automatic merges.
- Recurring auto-classification starts as dry-run candidates that require user approval before saving.
- Settings is a real user-facing feature; Token Lab is a dev/review tool.
- Frontend work should continue improving current main before reviving the paused v2 rewrite.
- Bulk operations are allowed only with backup/recovery guardrails.
- Description override, budgets, goals, and advice preferences remain in product scope.

## File Structure

**Create**
- `backend/app/api/v1/endpoints/analytics.py`
- `backend/app/schemas/analytics.py`
- `backend/app/services/analytics_service.py`
- `backend/tests/api/test_analytics_api.py`
- `backend/tests/services/test_analytics_service.py`

**Modify**
- `backend/app/api/v1/router.py`
- `backend/app/services/schema_service.py`
- `backend/app/services/canonical_views.py`
- `backend/alembic/versions/<new>_advisor_analytics_views.py`
- `frontend/src/navigation.ts`
- `frontend/src/router.tsx`
- `frontend/src/components/layout/AppSidebar.tsx`
- `frontend/src/api/analytics.ts`
- `frontend/src/hooks/useAnalytics.ts`
- `frontend/src/types/analytics.ts`
- `PRD.md`
- `docs/STATUS.md`
- `docs/openclaw/integration-guide.md`
- `docs/openclaw/skill-handoff.md`

**Optional later**
- `backend/app/models/transaction.py`
- `backend/app/models/loan.py`
- `backend/app/models/asset_snapshot.py`
- `backend/alembic/versions/<new>_advisor_metadata_fields.py`

## Contract Rules For Heuristics

- Transaction amount sign convention follows the live analytics layer: income is positive, expense is `-amount`, and positive `지출` refund/cancellation rows reduce monthly expense.
- Loan-linked expense rows are separated before fixed/variable breakdown. Monthly aggregate views must expose `expense_total`, `loan_repayment_total`, and `non_loan_expense_total` so consumers do not double count repayment burden as general spending.
- `fixed_total`, `variable_total`, `essential_fixed_total`, and `discretionary_fixed_total` exclude `loan_account_id IS NOT NULL` rows unless a view explicitly labels an overlap field.
- `transfer_activity_total` is an activity measure and does not contribute to `net_cashflow`.
- All derived or assumption-dependent numeric outputs use `*_est`.
- All heuristic endpoints expose `confidence`.
- Heuristic endpoints also expose at least one of:
  - `assumptions`
  - `coverage_notes`
  - `reason`
- Irregular snapshot comparisons must always expose `comparison_days`.
- Do not label irregular-gap comparisons as plain `MoM` unless the gap is actually month-aligned.

## Workstream 1: P0 Analytics Foundation

**Target endpoints**
- `GET /api/v1/analytics/monthly-cashflow`
- `GET /api/v1/analytics/category-mom`
- `GET /api/v1/analytics/fixed-cost-summary`
- `GET /api/v1/analytics/merchant-spend`

**Implementation notes**
- Use `vw_transactions_effective` as the only transaction source.
- `merchant-spend` v1 groups by canonical `merchant`.
- `fixed-cost-summary` must return `unclassified_total` and `unclassified_count`.
- Existing live endpoints may continue using the shared SQLAlchemy canonical select, but readonly SQL consumers should get equivalent DB views in Workstream 1.5.

**Verification**
- `cd backend && uv run pytest tests/services/test_analytics_service.py -k "cashflow or mom or fixed or merchant"`
- `cd backend && uv run pytest tests/api/test_analytics_api.py -k "cashflow or mom or fixed or merchant"`
- Validate system flow: API request -> canonical query/view -> response schema -> OpenClaw docs

## Workstream 1.5: Canonical Aggregate View Expansion

**Goal**
- Promote repeated advisor calculations into documented DB views so readonly SQL users and external agents can ask monthly finance questions without re-deriving semantics from raw transactions.

**Target views**
- `vw_monthly_cashflow`
- `vw_loan_repayment_monthly`
- `vw_true_spendable_monthly`
- `vw_merchant_monthly_baseline`
- `vw_unclassified_work_queue`

**Implementation notes**
- Build every transaction-derived view from `vw_transactions_effective` or the shared select that defines it.
- `vw_monthly_cashflow` fields:
  - `period`
  - `income_total`
  - `expense_total`
  - `non_loan_expense_total`
  - `transfer_activity_total`
  - `loan_repayment_total`
  - `fixed_total`
  - `variable_total`
  - `essential_fixed_total`
  - `discretionary_fixed_total`
  - `unclassified_expense_total`
  - `net_cashflow`
  - `savings_rate`
- `vw_loan_repayment_monthly` fields:
  - `period`
  - `loan_account_id`
  - `loan_display_name`
  - `loan_lender`
  - `loan_product_name`
  - `loan_kind`
  - `loan_maturity_date`
  - `repayment_type`
  - `repayment_total`
  - `transaction_count`
- `vw_true_spendable_monthly` must distinguish:
  - `spendable_before_variable_spend`: income after loan repayment and fixed commitments
  - `remaining_after_variable_spend`: spendable amount after observed variable spending
- `vw_merchant_monthly_baseline` should use canonical `merchant`, `effective_category_major`, and `effective_category_minor`, then expose trailing closed-month averages and deltas. If the current month is partial, the API layer should carry `as_of_date` and comparison-mode metadata rather than baking it into the view.
- `vw_unclassified_work_queue` should prioritize recent/high-value transactions missing `cost_kind`, `fixed_cost_necessity`, `recurring_payment_kind`, or likely loan links. It should not auto-assign classifications.

**Verification**
- Add schema documentation tests proving `/api/v1/schema` lists every new view and column.
- Add migration tests or service-level SQL tests that assert loan-linked rows are excluded from non-loan fixed/variable totals.
- Add fixtures with refund rows (`type='지출'`, positive amount) to verify monthly expense is reduced, not inflated.

## Workstream 2: P1 Rule-Based Diagnostics

**Target endpoints**
- `GET /api/v1/analytics/recurring-payments`
- `GET /api/v1/analytics/spending-anomalies`
- `GET /api/v1/analytics/payment-method-patterns`
- `GET /api/v1/analytics/income-stability`

**Implementation notes**
- `payment-method-patterns` can ship immediately after P0 because it is pure aggregation.
- `income-stability` should return both monthly series and summary stats (`avg`, `stdev`, `coefficient_of_variation`).
- Add `vw_recurring_merchant_monthly` as a canonical read surface for stored `recurring_payment_kind` classifications. Keep interval detection and confidence scoring in the API response, because those are heuristic and threshold-sensitive.
- `recurring-payments` should start with rule-based intervals:
  - 25-35 day gap => `monthly`
  - 6-8 day gap => `weekly`
- `recurring-payments` follow-up should classify each recurring merchant into one of:
  - `subscription`
  - `installment`
  - `general_recurring`
  - Keep the first release rule-based and explain the evidence in `assumptions`/`reason` instead of pretending the subtype is exact.
- `spending-anomalies` should start with baseline comparison over recent N months and return `reason` plus `anomaly_score`.
- `spending-anomalies` follow-up should add a second-layer diagnostic payload per category that explains whether the spike came from:
  - average transaction amount expansion
  - transaction count expansion
  - one or more merchant outliers dominating the month
  - This should stay additive to the current response rather than replacing the baseline comparison.
- Discretionary spending velocity should be implemented as an API/settings contract over stable aggregate inputs, not as a plain view that silently depends on `CURRENT_DATE`.
- Purchase-gate candidates should expose feature flags (`is_new_merchant`, `is_large_oneoff`, `is_discretionary`, baseline deltas) and `purchase_gate_reason`, but thresholds should remain configurable through settings before they are treated as canonical facts.
- All heuristic endpoints must expose at least one of `confidence`, `reason`, `assumptions`.

**Verification**
- Add deterministic fixtures for merchant recurrence and anomaly cases.
- `cd backend && uv run pytest tests/services/test_analytics_service.py -k "recurring or anomaly or payment or income"`
- `cd backend && uv run pytest tests/api/test_analytics_api.py -k "recurring or anomaly or payment or income"`

## Workstream 2.5: Diagnostics Settings Surface

**Goal**
- Expose a user-facing settings surface for backend-tunable analytics parameters without forcing code changes or hidden query-string tweaks.
- Start with `spending-anomalies` controls, but design the surface so additional advisor/analytics parameters can be added later.

**Frontend scope**
- Add a lower-sidebar navigation entry: `설정`
- Create a settings page with an initial section such as `분석/진단 설정`
- Show editable backend parameter controls for analytics heuristics, starting with:
  - `spending-anomalies.min_delta_amount`
  - later candidates: `anomaly_threshold`, `baseline_months`, recurring-payment minimum occurrences, subtype thresholds
- Show each parameter with:
  - current effective value
  - default value
  - short explanation of impact/risk
  - save/reset actions

**Backend scope**
- Add a stable settings read/write contract instead of hardcoding overrides in the frontend.
- Recommended v1 shape:
  - `GET /api/v1/settings/analytics`
  - `PATCH /api/v1/settings/analytics`
- Persist user-adjustable analytics parameters in a dedicated settings store rather than environment variables so values survive restarts and can be audited.
- Analytics services should resolve parameters in this order:
  - explicit request override
  - persisted settings value
  - code default

**Data model direction**
- Preferred: dedicated `app_settings` or `analytics_settings` table keyed by `scope` + `key`
- Keep values typed enough for safe validation:
  - integer
  - float
  - boolean
  - string
- Store metadata needed for UI rendering either:
  - in backend schema/constants returned by settings API
  - or in a small frontend mapping if the parameter list remains short

**Design constraints**
- The left-sidebar `설정` entry is a shell-level page, not a modal hidden inside Insights.
- Do not couple the settings page to anomaly cards only; it should become the home for future backend-tunable parameters.
- Every adjustable parameter must have explicit server-side validation and allowed ranges.
- The UI must distinguish:
  - system default
  - currently saved value
  - per-request temporary override, if that concept is added later

**Suggested v1 parameter inventory**
- `spending_anomalies.min_delta_amount`
  - default `100000`
  - description: baseline 대비 절대 변동액이 이 값 미만이면 anomaly 목록에서 제외
- `spending_anomalies.anomaly_threshold`
  - default `0.5`
  - description: anomaly_score cutoff
- `spending_anomalies.baseline_months`
  - default `3`
  - description: 비교 기준 baseline 개월 수

**Verification**
- Backend:
  - settings read/write API tests
  - analytics service tests confirming persisted settings affect endpoint defaults
- Frontend:
  - sidebar nav rendering test
  - settings form read/save/reset interaction tests
  - one integration-style test showing saved `min_delta_amount` changes anomaly query defaults

## Workstream 3: P2 Asset / Liability Health

**Target endpoints**
- `GET /api/v1/analytics/net-worth-breakdown`
- `GET /api/v1/analytics/investment-performance`
- `GET /api/v1/analytics/liquidity-health`
- `GET /api/v1/analytics/debt-health`
- `GET /api/v1/analytics/snapshot-compare`

**Implementation notes**
- `net-worth-breakdown` groups latest snapshot by `side` + `category`.
- `investment-performance` should expose history over snapshots, not just latest totals.
- Add `vw_asset_snapshot_canonical` only after source-of-truth rules are explicit for `asset_snapshots`, `loans`, and `investments`; do not double count investment or loan amounts that are represented in more than one imported table.
- Add `vw_investment_allocation_snapshot` as an allocation read model over `investments.broker`, `product_type`, `product_name`, and `market_value`; sparse snapshot gaps are allowed and must be visible in delta fields.
- `liquidity-health` should show immediate survival capacity rather than portfolio quality.
- `debt-health` should show repayment burden and rate risk rather than raw debt size alone.
- `snapshot-compare` should default to previous available snapshot comparison, not assume monthly spacing.
- `snapshot-compare` should support a separate closed-month comparison mode when actual month-end pairs exist.
- Do not leave snapshot-comparison cards empty just because the current month is incomplete; use latest-available comparison with explicit partial labeling.
- If the asset/liability mapping is hard to stabilize, ship `net-worth-breakdown` and `investment-performance` first, then `snapshot-compare`, `liquidity-health`, and `debt-health`.

### Liquidity Health Logic

- Inputs:
  - latest `asset_snapshots`
  - recent 3-month average expense
  - optional user-tagged essential spend when available
- Liquidity tiers:
  - `liquidity_tier_1`: deposit/checking/CMA/cash-equivalent
  - `liquidity_tier_2`: near-liquid investment assets
  - `illiquid`: real estate, locked deposits, other illiquid assets
- Core outputs:
  - `liquid_assets`
  - `near_liquid_assets`
  - `monthly_burn_est`
  - `essential_monthly_burn_est`
  - `emergency_fund_months_est`
  - `total_runway_months_est`
  - `liquidity_ratio_est`
- Fallback:
  - if essential classification is missing, use recent 3-month average total expense and mark `confidence=low`
  - include `coverage_notes` when liquidity tier mapping is partial

### Debt Health Logic

- Inputs:
  - latest `loans`
  - recent average monthly income
  - latest `asset_snapshots`
- Core outputs:
  - `total_debt_balance`
  - `secured_debt_balance`
  - `unsecured_debt_balance`
  - `weighted_avg_interest_rate`
  - `debt_to_asset_ratio`
  - `net_worth_after_debt`
  - `monthly_debt_service_est`
  - `debt_service_to_income_est`
- Monthly payment estimate rules:
  - use amortized payment estimate when maturity exists
  - otherwise use `interest-only floor`
  - apply fallback terms by loan type:
    - mortgage/home loan: 360 months
    - installment/personal loan: 36-60 months
    - revolving/card-like: `max(balance * 0.02, interest-only)`
- Risk flags:
  - `high_rate_debt`
  - `high_debt_service_burden`
  - `debt_growing_faster_than_assets`

### Snapshot Compare Logic

- Supported compare modes:
  - `latest_vs_previous_available`
  - `last_closed_month_vs_previous_closed_month`
  - `selected_snapshot_vs_previous_available`
  - `selected_snapshot_vs_baseline_snapshot`
- Required outputs:
  - `comparison_mode`
  - `current_snapshot_date`
  - `baseline_snapshot_date`
  - `comparison_days`
  - `is_partial`
  - `is_stale`
  - `can_compare`
  - `comparison_label`
  - `absolute_delta`
  - `pct_delta`
  - optional `daily_change_est`
  - optional `monthly_change_est`
  - `confidence`
  - `assumptions`
- Default UX policy:
  - use `latest_vs_previous_available` as the primary default comparison
  - expose `last_closed_month_vs_previous_closed_month` only when real closed-month pairs exist
  - if the current month has a snapshot but it is not month-end, still show comparison but label it as `partial`
  - if the current month has no snapshot, do not pretend the previous month is the current month; fall back to the latest closed-month comparison or latest-state-only presentation
- Labeling rules:
  - examples: `부분 기간`, `마감월 아님`, `비교 기준 부족`, `stale snapshot`
  - the UI should always show `current_snapshot_date`, `baseline_snapshot_date`, and `comparison_days` together when a delta is shown
- Safe metrics for irregular snapshot gaps:
  - net worth absolute delta
  - asset total delta
  - liability total delta
  - investment market value delta
  - loan balance delta
  - allocation mix change
- Metrics that need stronger guardrails:
  - plain `MoM` wording on irregular gaps
  - monthly return style ratios
  - velocity-style percentages when baseline is zero or very small
- Guardrails:
  - do not present irregular-gap comparisons as plain `MoM`
  - lower `confidence` as the gap widens
  - present velocity-style metrics only as estimates
  - if only one snapshot exists, return `can_compare=false` and latest-state-only payload rather than an empty error surface
  - if the baseline value is zero, suppress or null out percentage deltas instead of forcing infinity-like outputs

### Snapshot Comparison Stabilization Checklist

- Scope this as stabilization of existing comparison-oriented asset surfaces, not as net-new feature work.
- Audit impacted live surfaces before coding:
  - `frontend/src/pages/AssetsPage.tsx`
  - `frontend/src/pages/OverviewPage.tsx`
  - any existing KPI/meta badge copy that implies plain `전월 대비` or closed-month comparison
  - any current or planned backend read surface that defaults to `latest snapshot` without comparison metadata
- Freeze comparison vocabulary before implementation:
  - `latest_available_vs_previous_available`
  - `last_closed_month_vs_previous_closed_month`
  - `selected_snapshot_vs_previous_available`
  - `selected_snapshot_vs_baseline_snapshot`
  - never use plain `MoM` unless the comparison is actually closed-month aligned
- Freeze fallback rules before implementation:
  - current month snapshot exists but is not month-end => show latest comparison with `is_partial=true`
  - current month snapshot missing => do not synthesize a fake current-month comparison; show last closed-month comparison or latest-state-only
  - only one snapshot exists => `can_compare=false`, no delta card, latest-state-only
  - multiple snapshots in one month => latest comparison uses the latest available row; closed-month comparison uses the last snapshot in that month
- Freeze required metadata before implementation:
  - `comparison_mode`
  - `current_snapshot_date`
  - `baseline_snapshot_date`
  - `comparison_days`
  - `is_partial`
  - `is_stale`
  - `can_compare`
  - `comparison_label`
  - nullable percentage fields when baseline is zero or missing
- Freeze safe output set before implementation:
  - absolute deltas for net worth / total assets / total liabilities
  - investment market value delta
  - loan balance delta
  - allocation mix change
  - avoid monthly-return-style interpretation unless the period semantics truly support it
- Decide stale labeling threshold before coding:
  - define when a latest snapshot is considered stale relative to “today”
  - keep the threshold explicit in code and docs, not implicit in UI copy
- Prepare backend test matrix before coding:
  - one snapshot only
  - two snapshots, irregular gap
  - same-month multiple snapshots
  - current month missing, prior closed month available
  - current month partial snapshot present
  - baseline zero for percentage calculation
- Prepare frontend acceptance criteria before coding:
  - asset summary cards never show a misleading plain `전월 대비` label for irregular gaps
  - cards do not render empty solely because the current month is incomplete
  - every delta display also shows comparison context (`comparison_label` and/or dates)
  - latest-state-only fallback is visually distinct from a true comparison card
- Documentation gate before coding:
  - update `docs/backend-api-ssot.md` only after the response contract is finalized
  - keep `docs/STATUS.md` and daily log aligned on the fact that this workstream is stabilization-first

**Verification**
- `cd backend && uv run pytest tests/services/test_analytics_service.py -k "net_worth or investment or debt or emergency"`
- `cd backend && uv run pytest tests/api/test_analytics_api.py -k "net_worth or investment or debt or emergency"`

## Workstream 4: Transfer Tracking MVP

**Target endpoints**
- `GET /api/v1/transfers/summary`
- `GET /api/v1/transfers`
- `GET /api/v1/transfers/unmatched`

**Implementation notes**
- Treat `이체` as a dedicated personal-finance slice, not only as “excluded from spend/income”.
- Current live-data caveat:
  - debt principal repayment is not reliably encoded as `type='이체'`
  - current imports contain principal-and-interest repayment rows as `type='지출'`, usually under `category_major='금융'`
  - therefore this slice must include a derived reclassification layer over expense rows, not only raw transfer rows
  - do not rewrite the raw transaction type in MVP; preserve imported `type='지출'` for spending history and user-controlled fixed/variable classification
- Domain model:
  - `transfer_candidate`
  - `matched_transfer_pair`
  - `unmatched_transfer`
  - `loan_principal_movement`
  - `investment_funding_or_withdrawal`
- MVP response fields:
  - `date`
  - `amount`
  - `from_hint`
  - `to_hint`
  - `transfer_type_est`
  - `match_status`
  - `confidence`
  - `assumptions`
- Rule-based pair matching is sufficient for v1.
- MVP scope boundary:
  - start with raw `type='이체'` rows and simple account/platform flow grouping
  - keep debt-principal derivation out of the first stable release of this workstream
  - expense-side debt movement interpretation is a post-stabilization follow-up, not an MVP blocker
- UI follow-up should show:
  - monthly transfer volume
  - account/platform flow
  - unmatched transfer review list
  - split between investment funding and simple account transfer in v1

**Post-stabilization follow-up**
- Expense-side debt movement handling:
  - detect patterns such as `원금·이자 자동이체`, `원금·이자 갚음`
  - expose them as derived `debt_movement` / `loan_principal_movement` annotations, not raw-type mutation
  - where enough metadata exists, split into:
    - `estimated_principal_component`
    - `estimated_interest_component`
    - `confidence`
    - `reason`
  - ambiguous rows should remain visible as debt-movement candidates rather than being silently left in ordinary spend analytics
  - default spending analytics should keep these rows included unless the user explicitly chooses a debt-principal-excluded view later

**Verification**
- `cd backend && uv run pytest tests/services/test_transfers_service.py`
- `cd backend && uv run pytest tests/api/test_transfers_api.py`

## Workstream 5: Schema Enrichment Follow-Up

**Deferred additions**
- `transactions.merchant_normalized` or `merchant_alias_rules`
- merchant-based fixed/variable classification rules
- liquidity mapping for `asset_snapshots`
- `loans.monthly_payment`
- `loans.repayment_type`
- expense-side debt principal / interest derivation for repayment transactions
- budget / goal / preference tables

**Decision gate**
- Do not block P0 on schema changes.
- Revisit enrichment only after OpenClaw consumes P0/P1 and the data quality pain is observed in real prompts.

## API Contract Rules

- Exact aggregates use plain field names.
- Estimates must use `*_est`.
- Heuristics must include `confidence`, `reason`, or `assumptions`.
- Null-safe contracts:
  - divide-by-zero ratios return `null`
  - missing classifications are counted in `unclassified_*`
  - missing history should return empty `items`, not 500s

## Documentation Updates Required Per Implementation Batch

- Update `PRD.md` for any contract or scope changes.
- Update `docs/STATUS.md`.
- Append a new day log under `docs/daily/YYYY-MM-DD/`.
- Update `docs/openclaw/integration-guide.md` and `docs/openclaw/skill-handoff.md` whenever analytics endpoints or assumptions change.

## Recommended Rollout Order

1. Freeze new analytics feature work until the current API/backend/frontend contract is green end-to-end.
2. Fix current backend regression and restore `cd backend && uv run pytest` to green.
3. Fix frontend-backend contract drift and period/filter mismatches in live analytics surfaces.
4. Align operational docs, UI copy, and live behavior where reset/import/history semantics currently diverge.
5. Re-run system validation on current implemented functionality only.
6. Resume new analytics work only after the existing surfaces are stable in code, tests, and docs.
7. Start with Transfer Tracking MVP with raw `type='이체'` scope first.
8. Then implement P2 asset/liability health and snapshot compare endpoints.
9. Only then decide whether schema enrichment and debt principal derivation are justified.
