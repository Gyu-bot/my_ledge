# Advisor Analytics Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add advisor-oriented analytics endpoints that let OpenClaw explain cashflow, spending changes, recurring spend, transfer flows, snapshot deltas, and asset/liability health without re-deriving core finance calculations from raw tables.

**Architecture:** Reuse the existing canonical transaction read path (`vw_transactions_effective`) as the row-level source of truth, add a small analytics service/router/schema layer for stable endpoint contracts, and introduce only the minimum new canonical aggregates needed for reuse (`vw_monthly_cashflow`, `vw_merchant_monthly_spend`, transfer-oriented read models if needed) before considering schema enrichment. Keep heuristic outputs explicitly labeled with confidence/assumptions so OpenClaw can distinguish exact aggregates from estimated diagnostics.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, Alembic, pytest + httpx AsyncClient

---

## Feasibility Summary

- **P0 (implement now):** `monthly-cashflow`, `category-mom`, `fixed-cost-summary`, `merchant-spend`
- **P1 (rule-based v1):** `recurring-payments`, `spending-anomalies`, `payment-method-patterns`, `income-stability`
- **P2 (estimated / mapping-dependent):** `net-worth-breakdown`, `investment-performance`, `liquidity-health`, `debt-health`, `snapshot-compare`
- **Schema enrichment deferred:** `merchant_normalized`, merchant-based fixed/variable classification rules, liquidity mapping, `monthly_payment`, `repayment_type`, budgets/goals/preferences

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
- `PRD.md`
- `STATUS.md`
- `docs/STATUS.md`
- `docs/openclaw/integration-guide.md`
- `docs/openclaw/skill-handoff.md`

**Optional later**
- `backend/app/models/transaction.py`
- `backend/app/models/loan.py`
- `backend/app/models/asset_snapshot.py`
- `backend/alembic/versions/<new>_advisor_metadata_fields.py`

## Contract Rules For Heuristics

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
- Add `vw_monthly_cashflow` if the SQL is reused by more than one endpoint or OpenClaw drill-down.
- Add `vw_merchant_monthly_spend` if merchant trend and recurring detection will share the same normalized aggregate path.
- `merchant-spend` v1 groups by raw `description`.
- `fixed-cost-summary` must return `unclassified_total` and `unclassified_count`.

**Verification**
- `cd backend && uv run pytest tests/services/test_analytics_service.py -k "cashflow or mom or fixed or merchant"`
- `cd backend && uv run pytest tests/api/test_analytics_api.py -k "cashflow or mom or fixed or merchant"`
- Validate system flow: API request -> canonical query/view -> response schema -> OpenClaw docs

## Workstream 2: P1 Rule-Based Diagnostics

**Target endpoints**
- `GET /api/v1/analytics/recurring-payments`
- `GET /api/v1/analytics/spending-anomalies`
- `GET /api/v1/analytics/payment-method-patterns`
- `GET /api/v1/analytics/income-stability`

**Implementation notes**
- `payment-method-patterns` can ship immediately after P0 because it is pure aggregation.
- `income-stability` should return both monthly series and summary stats (`avg`, `stdev`, `coefficient_of_variation`).
- `recurring-payments` should start with rule-based intervals:
  - 25-35 day gap => `monthly`
  - 6-8 day gap => `weekly`
- `spending-anomalies` should start with baseline comparison over recent N months and return `reason` plus `anomaly_score`.
- All heuristic endpoints must expose at least one of `confidence`, `reason`, `assumptions`.

**Verification**
- Add deterministic fixtures for merchant recurrence and anomaly cases.
- `cd backend && uv run pytest tests/services/test_analytics_service.py -k "recurring or anomaly or payment or income"`
- `cd backend && uv run pytest tests/api/test_analytics_api.py -k "recurring or anomaly or payment or income"`

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
- `liquidity-health` should show immediate survival capacity rather than portfolio quality.
- `debt-health` should show repayment burden and rate risk rather than raw debt size alone.
- `snapshot-compare` should compare against the previous available snapshot, not assume monthly spacing.
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
  - `selected_snapshot_vs_previous_available`
  - `selected_snapshot_vs_baseline_snapshot`
- Required outputs:
  - `comparison_days`
  - `absolute_delta`
  - `pct_delta`
  - optional `daily_change_est`
  - optional `monthly_change_est`
  - `confidence`
  - `assumptions`
- Guardrails:
  - do not present irregular-gap comparisons as plain `MoM`
  - lower `confidence` as the gap widens
  - present velocity-style metrics only as estimates

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
- Update both `STATUS.md` and `docs/STATUS.md`.
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
