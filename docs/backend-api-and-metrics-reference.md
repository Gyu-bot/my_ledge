# Backend API And Metrics Reference

이 문서는 **현재 백엔드 구현 코드 기준**으로 다음을 한 번에 정리한다.

- `/api/v1` 아래 모든 구현된 endpoint
- 각 endpoint의 인증, 요청 파라미터, 주요 응답 구조
- canonical view 정의와 사용 위치
- 주요 집계/진단 지표가 실제로 어떻게 계산되는지

우선순위는 아래와 같다.

1. `backend/app/api/v1/**`
2. `backend/app/services/**`
3. `backend/app/schemas/**`
4. 이 문서
5. 기타 기획 문서

`docs/backend-api-ssot.md`가 live contract 요약이라면, 이 문서는 **엔지니어용 구현 설명서**다.

## Scope

- FastAPI app: `backend/app/main.py`
- Router root: `/api/v1`
- Endpoint modules:
  - `health.py`
  - `schema.py`
  - `upload.py`
  - `data_management.py`
  - `transactions.py`
  - `assets.py`
  - `analytics.py`

## Auth

### 인증 없음

- `GET /api/v1/health`
- `GET /api/v1/upload/logs`
- 모든 read-only transaction/assets/analytics endpoint

### `X-API-Key` 필요

- `GET /api/v1/schema`
- `POST /api/v1/upload`
- `POST /api/v1/data/reset`
- `POST /api/v1/transactions`
- `PATCH /api/v1/transactions/bulk-update`
- `PATCH /api/v1/transactions/{transaction_id}`
- `DELETE /api/v1/transactions/{transaction_id}`
- `POST /api/v1/transactions/{transaction_id}/restore`
- `POST /api/v1/transactions/merge`

## Endpoints

### System

#### `GET /api/v1/health`

- Purpose: healthcheck
- Request: none
- Response model: `HealthResponse`
- Response shape:
  - `status: str`
- Current behavior:
  - always returns `{"status":"ok"}`

#### `GET /api/v1/schema`

- Purpose: raw table + canonical view schema document
- Auth: API key required
- Request: none
- Response model: `SchemaDocumentResponse`
- Response shape:
  - `tables: SchemaRelationResponse[]`
  - `views: SchemaRelationResponse[]`
- Notes:
  - built from `Base.metadata`
  - canonical views come from `app.services.canonical_views.CANONICAL_VIEWS`

### Upload / Operations

#### `GET /api/v1/upload/logs`

- Purpose: latest upload execution history
- Request: none
- Response model: `UploadLogListResponse`
- Response shape:
  - `items[]`
    - `id`
    - `uploaded_at`
    - `filename`
    - `snapshot_date`
    - `tx_total`
    - `tx_new`
    - `tx_skipped`
    - `status`
    - `error_message`
- Notes:
  - latest 10 rows only
  - ordered by `uploaded_at desc, id desc`

#### `POST /api/v1/upload`

- Purpose: import encrypted BankSalad workbook
- Auth: API key required
- Content type: `multipart/form-data`
- Request fields:
  - `file: UploadFile`
  - `snapshot_date: date`
- Response model: `UploadResponse`
- Response shape:
  - `status`
  - `upload_id`
  - `transactions`
    - `total`
    - `new`
    - `skipped`
  - `snapshots`
    - `asset_snapshots`
    - `investments`
    - `loans`
  - `error_message`
- Runtime behavior:
  - decrypts workbook with `open_excel_bytes()`
  - loads workbook with `openpyxl(..., data_only=True)`
  - transaction import and snapshot import run independently
  - final `status` can be `success`, `partial`, or `failed`
  - always writes one `upload_logs` row

#### `POST /api/v1/data/reset`

- Purpose: delete current stored data without deleting upload history
- Auth: API key required
- Request model: `DataResetRequest`
- Request shape:
  - `scope: "transactions_only" | "transactions_and_snapshots"`
- Response model: `DataResetResponse`
- Response shape:
  - `scope`
  - `deleted`
    - `transactions`
    - `asset_snapshots`
    - `investments`
    - `loans`
  - `upload_logs_retained`
- Notes:
  - `upload_logs_retained` is currently always `true`

### Transactions Read

#### `GET /api/v1/transactions`

- Purpose: paginated transaction list for dashboard/workbench
- Query params:
  - `start_date`
  - `end_date`
  - `type: "지출" | "수입" | "이체" | "all"` default `all`
  - `source: "import" | "manual" | "all"` default `all`
  - `category_major`
  - `payment_method`
  - `is_edited: "true" | "false" | "all"` default `all`
  - `include_deleted: bool` default `false`
  - `include_merged: bool` default `false`
  - `search`
  - `page` default `1`
  - `per_page` default `50`, max `200`
- Response model: `TransactionListResponse`
- Response shape:
  - `total`
  - `page`
  - `per_page`
  - `items[]: TransactionResponse`
    - includes raw category fields plus:
      - `effective_category_major`
      - `effective_category_minor`
      - `merchant`
      - `cost_kind`
      - `fixed_cost_necessity`
      - `is_deleted`
      - `merged_into_id`
      - `is_edited`
      - `source`
- Implementation notes:
  - query is built from `build_transactions_effective_select()`
  - default excludes deleted and merged rows
  - `search` is `ILIKE %keyword%` over `description`, `merchant`, `memo`, `payment_method`
  - ordered by `date desc, time desc, id desc`

#### `GET /api/v1/transactions/filter-options`

- Purpose: distinct values for transaction filters and workbench select inputs
- Query params:
  - `include_deleted`
  - `include_merged`
- Response model: `TransactionFilterOptionsResponse`
- Response shape:
  - `category_options: string[]`
  - `category_minor_options: string[]`
  - `category_minor_options_by_major: Record<string, string[]>`
  - `payment_method_options: string[]`
- Implementation notes:
  - sourced from effective-category view, not raw-only columns
  - minor options are deduplicated and also grouped by major category

#### `GET /api/v1/transactions/summary`

- Purpose: simple transaction sum by period
- Query params:
  - `start_date`
  - `end_date`
  - `group_by: "month" | "week" | "day"` default `month`
  - `type` default `all`
- Response model: `TransactionSummaryResponse`
- Response shape:
  - `items[]`
    - `period`
    - `amount`
- Notes:
  - sums raw signed `amount`

#### `GET /api/v1/transactions/by-category`

- Purpose: category aggregate
- Query params:
  - `start_date`
  - `end_date`
  - `level: "major" | "minor"` default `major`
  - `type` default `all`
- Response model: `CategorySummaryResponse`
- Response shape:
  - `items[]`
    - `category`
    - `amount`
- Notes:
  - category uses effective user-edited value first
  - `None` minor category is normalized to `"미분류"`

#### `GET /api/v1/transactions/by-category/timeline`

- Purpose: monthly category trend
- Query params:
  - `start_date`
  - `end_date`
  - `level: "major" | "minor"` default `major`
  - `type` default `지출`
- Response model: `CategoryTimelineResponse`
- Response shape:
  - `items[]`
    - `period`
    - `category`
    - `amount`

#### `GET /api/v1/transactions/payment-methods`

- Purpose: payment method aggregate
- Query params:
  - `start_date`
  - `end_date`
- Response model: `PaymentMethodSummaryResponse`
- Response shape:
  - `items[]`
    - `payment_method`
    - `amount`

### Transactions Write

#### `POST /api/v1/transactions`

- Purpose: create manual transaction
- Auth: API key required
- Request model: `TransactionCreateRequest`
- Request shape:
  - `date`
  - `time`
  - `type`
  - `category_major`
  - `category_minor`
  - `description`
  - `merchant`
  - `amount`
  - `payment_method`
  - `cost_kind`
  - `fixed_cost_necessity`
  - `memo`
- Response model: `TransactionResponse`
- Behavior:
  - `source` becomes `manual`
  - when `merchant` is omitted, service falls back to `description`

#### `PATCH /api/v1/transactions/bulk-update`

- Purpose: bulk edit selected transactions
- Auth: API key required
- Request model: `TransactionBulkUpdateRequest`
- Request shape:
  - `ids[]`
  - optional:
    - `merchant`
    - `category_major_user`
    - `category_minor_user`
    - `cost_kind`
    - `fixed_cost_necessity`
    - `memo`
- Response model: `TransactionBulkUpdateResponse`
- Response shape:
  - `updated: int`

#### `PATCH /api/v1/transactions/{transaction_id}`

- Purpose: patch one transaction
- Auth: API key required
- Request model: `TransactionUpdateRequest`
- Response model: `TransactionResponse`
- Editable fields:
  - `merchant`
  - `category_major_user`
  - `category_minor_user`
  - `cost_kind`
  - `fixed_cost_necessity`
  - `memo`

#### `DELETE /api/v1/transactions/{transaction_id}`

- Purpose: soft delete
- Auth: API key required
- Response: `204 No Content`
- Behavior:
  - row remains in DB
  - `is_deleted=true`

#### `POST /api/v1/transactions/{transaction_id}/restore`

- Purpose: restore soft-deleted row
- Auth: API key required
- Response model: `TransactionResponse`
- Behavior:
  - sets `is_deleted=false`

#### `POST /api/v1/transactions/merge`

- Purpose: reserved API surface only
- Auth: API key required
- Request model: `TransactionMergeRequest`
- Current behavior:
  - always raises `501 Not Implemented`
  - detail: `"Merge is out of MVP scope."`

### Assets / Snapshots

#### `GET /api/v1/assets/snapshots`

- Purpose: list snapshot totals by date
- Request: none
- Response model: `AssetSnapshotsResponse`
- Response shape:
  - `items[]`
    - `snapshot_date`
    - `asset_total`
    - `liability_total`
    - `net_worth`
- Calculation:
  - groups `asset_snapshots` by `snapshot_date`
  - sums `side="asset"` and `side="liability"` separately
  - `net_worth = asset_total - liability_total`

#### `GET /api/v1/assets/net-worth-history`

- Purpose: line-chart friendly net worth series
- Request: none
- Response model: `NetWorthHistoryResponse`
- Response shape:
  - `items[]`
    - `snapshot_date`
    - `net_worth`

#### `GET /api/v1/assets/snapshot-compare`

- Purpose: compare two snapshot dates
- Query params:
  - `comparison_mode`
    - `latest_available_vs_previous_available`
    - `last_closed_month_vs_previous_closed_month`
    - `selected_snapshot_vs_baseline_snapshot`
  - `snapshot_date`
  - `baseline_snapshot_date`
- Response model: `AssetSnapshotComparisonResponse`
- Response shape:
  - `comparison_mode`
  - `current`
  - `baseline`
  - `delta`
    - `asset_total`
    - `liability_total`
    - `net_worth`
    - `asset_total_pct`
    - `liability_total_pct`
    - `net_worth_pct`
  - `comparison_days`
  - `is_partial`
  - `is_stale`
  - `can_compare`
  - `comparison_label`
- Validation:
  - selected mode requires both `snapshot_date` and `baseline_snapshot_date`
  - missing or invalid pair returns `422`
- Behavior:
  - latest mode compares latest snapshot with previous available snapshot
  - closed-month mode compares latest month-end snapshot with previous month-end snapshot
  - selected mode compares explicit dates
  - `is_partial=true` when current snapshot is not month-end and mode is not closed-month mode
  - `is_stale=true` when current snapshot is older than 35 days from today

#### `GET /api/v1/investments/summary`

- Purpose: latest or requested investment snapshot
- Query params:
  - `snapshot_date` optional
- Response model: `InvestmentSummaryResponse`
- Response shape:
  - `snapshot_date`
  - `items[]`
    - `product_type`
    - `broker`
    - `product_name`
    - `cost_basis`
    - `market_value`
    - `return_rate`
  - `totals`
    - `cost_basis`
    - `market_value`
- Behavior:
  - when `snapshot_date` omitted, service resolves `max(snapshot_date)`
  - when no data exists, returns empty items and zero totals

#### `GET /api/v1/loans/summary`

- Purpose: latest or requested loan snapshot
- Query params:
  - `snapshot_date` optional
- Response model: `LoanSummaryResponse`
- Response shape:
  - `snapshot_date`
  - `items[]`
    - `loan_type`
    - `lender`
    - `product_name`
    - `principal`
    - `balance`
    - `interest_rate`
    - `start_date`
    - `maturity_date`
  - `totals`
    - `principal`
    - `balance`

### Analytics

#### `GET /api/v1/analytics/monthly-cashflow`

- Purpose: monthly income/expense/transfer/cashflow
- Query params:
  - `start_date`
  - `end_date`
- Response model: `MonthlyCashflowResponse`
- Response shape:
  - `items[]`
    - `period`
    - `income`
    - `expense`
    - `transfer`
    - `net_cashflow`
    - `savings_rate`

#### `GET /api/v1/analytics/category-mom`

- Purpose: compare current month vs previous month by category
- Query params:
  - `start_date`
  - `end_date`
  - `level` default `major`
  - `type` default `지출`
- Response model: `CategoryMoMResponse`
- Response shape:
  - `items[]`
    - `period`
    - `previous_period`
    - `category`
    - `current_amount`
    - `previous_amount`
    - `delta_amount`
    - `delta_pct`

#### `GET /api/v1/analytics/fixed-cost-summary`

- Purpose: classify expenses into fixed/variable/unclassified
- Query params:
  - `start_date`
  - `end_date`
- Response model: `FixedCostSummaryResponse`
- Response shape:
  - `expense_total`
  - `fixed_total`
  - `variable_total`
  - `fixed_ratio`
  - `essential_fixed_total`
  - `discretionary_fixed_total`
  - `unclassified_total`
  - `unclassified_count`

#### `GET /api/v1/analytics/merchant-spend`

- Purpose: top merchants by spend/inflow amount
- Query params:
  - `start_date`
  - `end_date`
  - `type` default `지출`
  - `limit` default `20`
- Response model: `MerchantSpendResponse`
- Response shape:
  - `items[]`
    - `merchant`
    - `amount`
    - `count`
    - `avg_amount`
    - `last_seen_at`

#### `GET /api/v1/analytics/payment-method-patterns`

- Purpose: aggregate transaction volume by payment method
- Query params:
  - `start_date`
  - `end_date`
  - `type` default `지출`
- Response model: `PaymentMethodPatternsResponse`
- Response shape:
  - `items[]`
    - `payment_method`
    - `total_amount`
    - `transaction_count`
    - `avg_amount`
    - `pct_of_total`

#### `GET /api/v1/analytics/income-stability`

- Purpose: monthly income volatility
- Query params:
  - `start_date`
  - `end_date`
- Response model: `IncomeStabilityResponse`
- Response shape:
  - `items[]`
    - `period`
    - `income`
  - `avg`
  - `stdev`
  - `coefficient_of_variation`
  - `comparison_mode`
  - `reference_date`
  - `is_partial_period`
  - `assumptions`
- Behavior:
  - if `end_date` omitted, service uses last closed month end as reference
  - if `end_date` is not month-end, previous months are also truncated at same day cutoff

#### `GET /api/v1/analytics/recurring-payments`

- Purpose: recurring merchant detection
- Query params:
  - `start_date`
  - `end_date`
  - `min_occurrences` default `2`
  - `page`
  - `per_page`
- Response model: `RecurringPaymentsResponse`
- Response shape:
  - `total`
  - `page`
  - `per_page`
  - `items[]`
    - `merchant`
    - `category`
    - `avg_amount`
    - `interval_type`
    - `avg_interval_days`
    - `occurrences`
    - `confidence`
    - `last_date`
  - `assumptions`

#### `GET /api/v1/analytics/spending-anomalies`

- Purpose: detect unusual category spend
- Query params:
  - `end_date`
  - `baseline_months` default `3`
  - `anomaly_threshold` default `0.5`
  - `min_delta_amount` default `100000`
  - `page`
  - `per_page`
- Response model: `SpendingAnomaliesResponse`
- Response shape:
  - `total`
  - `page`
  - `per_page`
  - `items[]`
    - `period`
    - `category`
    - `amount`
    - `baseline_avg`
    - `delta_pct`
    - `anomaly_score`
    - `reason`
  - `comparison_mode`
  - `reference_date`
  - `is_partial_period`
  - `assumptions`
- Behavior:
  - if `end_date` omitted, uses last closed month end
  - if partial date provided, baseline months use same day cutoff

## Canonical Views

### `vw_transactions_effective`

Defined in `app.services.canonical_views.build_transactions_effective_select()`.

Columns:

- raw fields:
  - `id`, `date`, `time`, `type`
  - `category_major`, `category_minor`
  - `category_major_user`, `category_minor_user`
  - `description`, `merchant`
  - `amount`, `currency`, `payment_method`
  - `cost_kind`, `fixed_cost_necessity`, `memo`
  - `is_deleted`, `merged_into_id`, `source`, `created_at`, `updated_at`
- derived fields:
  - `effective_category_major = coalesce(category_major_user, category_major)`
  - `effective_category_minor = coalesce(category_minor_user, category_minor)`
  - `is_edited = category user override OR merchant != description OR memo is not null`

Filtering behavior:

- default excludes deleted rows
- default excludes merged rows
- callers can opt back in with `include_deleted` / `include_merged`

Where it is used:

- transaction list/filter-options/read summaries
- analytics loader

### `vw_category_monthly_spend`

This view is registered in `CANONICAL_VIEWS` for schema documentation purposes, but the current analytics code computes category monthly spend directly in Python from `vw_transactions_effective` rows rather than querying a DB materialized view.

Documented columns:

- `period`
- `category_major`
- `category_minor`
- `amount`

## Major Metric Logic

### Transaction Effective Category

Source: `app.services.canonical_views`

- user-edited category overrides raw imported category
- downstream analytics and filter options generally use effective category

### Search

Source: `app.services.transactions_service._build_transaction_query`

- case-insensitive substring match
- fields searched:
  - `description`
  - `merchant`
  - `memo`
  - `payment_method`

### Transaction Import Reconciliation

Source: `app.services.upload_service`

- import only compares against `source="import"` rows inside workbook date-time window
- exact signature:
  - `date`, `time`, `type`, `category_major`, `category_minor`, `description`, `amount`, `currency`, `payment_method`
- fallback signature:
  - `date`, `type`, `description`, `amount`, `currency`, `payment_method`
- fallback matching uses time-of-day tolerance
- unmatched existing import rows in window are deleted
- unmatched parsed rows are inserted
- result is effectively **window-scoped reconcile**, not append-only import

### Snapshot Replace

Source: `app.services.upload_service._replace_snapshots`

- for the given `snapshot_date`, existing rows in:
  - `asset_snapshots`
  - `investments`
  - `loans`
  are deleted first
- parsed snapshot rows for that date are then inserted

### Asset Snapshot Comparison

Source: `app.services.assets_service`

- `latest_available_vs_previous_available`
  - latest snapshot vs immediately previous available snapshot
- `last_closed_month_vs_previous_closed_month`
  - latest month-end snapshot vs previous month-end snapshot
- `selected_snapshot_vs_baseline_snapshot`
  - explicit pair, both dates required
- delta fields are simple subtraction of current minus baseline
- percentage fields use `_safe_ratio(delta, baseline)`
- `is_partial` means current snapshot is not month-end in non-closed-month mode
- `is_stale` means current snapshot is older than 35 days

### Monthly Cashflow

Source: `app.services.analytics_service.get_monthly_cashflow`

- loads all transaction types
- groups by `YYYY-MM`
- signs:
  - `income += amount`
  - `expense += -amount`
  - `transfer += abs(amount)`
- `net_cashflow = income - expense`
- `savings_rate = net_cashflow / income`

### Category MoM

Source: `app.services.analytics_service.get_category_mom`

- loads rows in requested date window
- derives `current_period = max(month in rows)`
- derives `previous_period = previous calendar month`
- only compares those two months
- amount sign is normalized with `_amount_for_analytics`
  - income positive
  - expense positive via `-amount`
  - transfer positive via `abs(amount)`

### Fixed Cost Summary

Source: `app.services.analytics_service.get_fixed_cost_summary`

- expense-only rows
- `cost_kind == fixed` goes to fixed bucket
- `fixed_cost_necessity` further splits fixed into essential/discretionary
- `cost_kind == variable` goes to variable bucket
- missing classification goes to unclassified bucket

### Merchant Spend

Source: `app.services.analytics_service.get_merchant_spend`

- groups by `merchant` with fallback `"미분류"`
- stores:
  - total normalized amount
  - count
  - average amount
  - latest observed datetime
- sorted by descending amount

### Payment Method Patterns

Source: `app.services.analytics_service.get_payment_method_patterns`

- groups by `payment_method` with fallback `"알 수 없음"`
- stores:
  - total normalized amount
  - count
  - average amount
  - percent of total

### Income Stability

Source: `app.services.analytics_service.get_income_stability`

- income-only rows
- if `end_date` omitted:
  - reference date becomes last closed month end
- if `end_date` is partial:
  - previous months are also truncated at same day cutoff
- groups monthly income totals
- metrics:
  - `avg = mean(monthly incomes)`
  - `stdev = population standard deviation`
  - `coefficient_of_variation = stdev / avg`
- important boundary:
  - backend stops at returning the numeric `coefficient_of_variation`
  - backend does **not** classify the result into labels such as `안정`, `보통`, `불안정`
- current frontend interpretation thresholds:
  - `OverviewPage`
    - `CV < 0.1` -> `안정`
    - `0.1 <= CV < 0.25` -> `보통`
    - `CV >= 0.25` -> `불안정`
  - `InsightsPage`
    - `CV < 0.1` -> `낮음`
    - `0.1 <= CV < 0.25` -> `보통`
    - `CV >= 0.25` -> `높음`
- implication:
  - if the label threshold needs to change, the current change point is frontend page logic, not the backend endpoint contract

### Recurring Payments

Source: `app.services.analytics_service.get_recurring_payments`

- expense-only rows
- group by `merchant` fallback `description` fallback `"미분류"`
- compute sorted transaction dates and gaps
- classify interval:
  - `25-35` days -> `monthly`
  - `6-8` days -> `weekly`
  - else -> `irregular`
- confidence:
  - based on gap variance when more than one gap exists
  - defaults to `0.5` for single-gap cases
- paginated after in-memory sort

### Spending Anomalies

Source: `app.services.analytics_service.get_spending_anomalies`

- expense-only rows
- reference period:
  - last closed month by default
  - or supplied `end_date`
- baseline window:
  - previous `baseline_months`
- if partial end date:
  - baseline months are cut off at same day-of-month
- groups by `(period, effective_category_major)`
- for each category:
  - `target_amount`
  - `baseline_avg`
  - `delta`
  - `delta_pct`
  - `anomaly_score`
- anomaly score:
  - `abs_delta / stdev` when baseline stdev exists
  - otherwise `abs_delta / baseline_avg`
  - otherwise `0`
- final filters:
  - `abs(delta) >= min_delta_amount`
  - `anomaly_score >= anomaly_threshold`

## Implementation Notes That Matter

- `transactions/merge` is still an intentional `501` stub
- `schema` endpoint documents raw tables and canonical views, not arbitrary service-level derived metrics
- `income-stability` and `spending-anomalies` now both expose:
  - `comparison_mode`
  - `reference_date`
  - `is_partial_period`
- current frontend still contains some fallbacks for older backend contracts, especially around transaction filter options
- upload file retention to `/data/uploads/` is described in planning docs, but no confirmed live implementation was verified in `upload_service.py`
