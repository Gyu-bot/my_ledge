# Advisor Analytics Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add advisor-oriented analytics endpoints that let OpenClaw explain cashflow, spending changes, recurring spend, anomalies, and asset/liability health without re-deriving core finance calculations from raw tables.

**Architecture:** Reuse the existing canonical transaction read path (`vw_transactions_effective`) as the row-level source of truth, add a small analytics service/router/schema layer for stable endpoint contracts, and introduce only the minimum new canonical aggregates needed for reuse (`vw_monthly_cashflow`, `vw_merchant_monthly_spend`) before considering schema enrichment. Keep heuristic outputs explicitly labeled with confidence/assumptions so OpenClaw can distinguish exact aggregates from estimated diagnostics.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, Alembic, pytest + httpx AsyncClient

---

## Feasibility Summary

- **P0 (implement now):** `monthly-cashflow`, `category-mom`, `fixed-cost-summary`, `merchant-spend`
- **P1 (rule-based v1):** `recurring-payments`, `spending-anomalies`, `payment-method-patterns`, `income-stability`
- **P2 (estimated / mapping-dependent):** `net-worth-breakdown`, `investment-performance`, `debt-burden`, `emergency-fund`
- **Schema enrichment deferred:** `merchant_normalized`, liquidity mapping, `monthly_payment`, `repayment_type`, budgets/goals/preferences

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
- `GET /api/v1/analytics/debt-burden`
- `GET /api/v1/analytics/emergency-fund`

**Implementation notes**
- `net-worth-breakdown` groups latest snapshot by `side` + `category`.
- `investment-performance` should expose history over snapshots, not just latest totals.
- `debt-burden` must label derived values as `estimated_monthly_payment`, `dti_est`, `dsr_est`.
- `emergency-fund` initially needs a documented mapping from `asset_snapshots.category` to cash-equivalent buckets.
- If the asset/liability mapping is hard to stabilize, ship `net-worth-breakdown` and `investment-performance` first, then `debt-burden` and `emergency-fund`.

**Verification**
- `cd backend && uv run pytest tests/services/test_analytics_service.py -k "net_worth or investment or debt or emergency"`
- `cd backend && uv run pytest tests/api/test_analytics_api.py -k "net_worth or investment or debt or emergency"`

## Workstream 4: Schema Enrichment Follow-Up

**Deferred additions**
- `transactions.merchant_normalized` or `merchant_alias_rules`
- liquidity mapping for `asset_snapshots`
- `loans.monthly_payment`
- `loans.repayment_type`
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

1. Finish current Phase 3 OpenClaw readonly/schema/upload verification.
2. Implement P0 analytics bundle in one branch.
3. Let OpenClaw consume P0 in real prompts and note missing advisor answers.
4. Implement P1 diagnostics with conservative rule-based contracts.
5. Implement P2 asset/liability health endpoints.
6. Only then decide whether schema enrichment is justified.
