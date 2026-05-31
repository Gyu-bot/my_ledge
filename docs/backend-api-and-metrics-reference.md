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
에이전트가 값 의미와 계산식을 빠르게 해석해야 할 때는 [agents/canonical-read-surface-reference.md](agents/canonical-read-surface-reference.md)를 먼저 본다.

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
  - `auto_classification.py`
  - `canonical_views.py`
  - `loan_mapping.py`
  - `installments.py`
  - `analytics.py`

## Auth

### 인증 없음

- `GET /api/v1/health`
- `GET /api/v1/upload/logs`
- 모든 read-only transaction/assets/analytics endpoint
- `GET /api/v1/loan-accounts`
- `GET /api/v1/loan-transaction-links`
- `GET /api/v1/transactions/{transaction_id}/loan-link`
- `GET /api/v1/installment-plans`
- `GET /api/v1/installment-transaction-links`
- `GET /api/v1/transactions/{transaction_id}/installment-link`
- `GET /api/v1/installments/forecast`

### `X-API-Key` 필요

- `GET /api/v1/schema`
- `GET /api/v1/canonical-views/dashboard`
- `GET /api/v1/auto-classification/settings`
- `PATCH /api/v1/auto-classification/settings`
- `GET /api/v1/auto-classification/category-rules`
- `POST /api/v1/auto-classification/category-rules`
- `DELETE /api/v1/auto-classification/category-rules/{rule_id}`
- `POST /api/v1/auto-classification/apply/category-rules`
- `GET /api/v1/auto-classification/loan-merchant-rules`
- `POST /api/v1/auto-classification/loan-merchant-rules`
- `DELETE /api/v1/auto-classification/loan-merchant-rules/{rule_id}`
- `POST /api/v1/auto-classification/apply/loan-merchant-rules`
- `GET /api/v1/auto-classification/merchant-alias-rules`
- `POST /api/v1/auto-classification/merchant-alias-rules`
- `DELETE /api/v1/auto-classification/merchant-alias-rules/{rule_id}`
- `POST /api/v1/auto-classification/apply/merchant-alias-rules`
- `GET /api/v1/auto-classification/recurring-category-rules`
- `POST /api/v1/auto-classification/recurring-category-rules`
- `DELETE /api/v1/auto-classification/recurring-category-rules/{rule_id}`
- `POST /api/v1/auto-classification/apply/recurring-category-rules`
- `POST /api/v1/upload`
- `POST /api/v1/data/reset`
- `POST /api/v1/transactions`
- `PATCH /api/v1/transactions/bulk-update`
- `PATCH /api/v1/transactions/{transaction_id}`
- `DELETE /api/v1/transactions/{transaction_id}`
- `POST /api/v1/transactions/{transaction_id}/restore`
- `POST /api/v1/transactions/merge`
- `PATCH /api/v1/loan-accounts`
- `PUT /api/v1/transactions/{transaction_id}/loan-link`
- `DELETE /api/v1/transactions/{transaction_id}/loan-link`
- `PUT /api/v1/transactions/loan-links/bulk`
- `POST /api/v1/installment-plans`
- `PATCH /api/v1/installment-plans/{plan_id}`
- `PUT /api/v1/transactions/{transaction_id}/installment-link`
- `DELETE /api/v1/transactions/{transaction_id}/installment-link`
- `PUT /api/v1/transactions/installment-links/bulk`

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

#### `GET /api/v1/canonical-views/dashboard`

- Purpose: actual row values from P0/P0.5 canonical views for the frontend canonical dashboard
- Auth: API key required
- Request query:
  - `months`: integer, default `12`, range `1..36`
  - `merchant_limit`: integer, default `10`, range `1..50`
  - `queue_limit`: integer, default `10`, range `1..50`
- Response model: `CanonicalViewsDashboardResponse`
- Response shape:
  - `monthly_cashflow[]`: rows from `vw_monthly_cashflow`, recent months in ascending display order
  - `true_spendable_monthly[]`: rows from `vw_true_spendable_monthly`, enriched with optional current-month income estimates
  - `loan_repayment_monthly[]`: recent rows from `vw_loan_repayment_monthly`
  - `merchant_monthly_baseline[]`: top recent rows from `vw_merchant_monthly_baseline`
  - `recurring_merchant_monthly[]`: recent rows from `vw_recurring_merchant_monthly`
  - `unclassified_work_queue[]`: top priority rows from `vw_unclassified_work_queue`
- Notes:
  - view names are hardcoded in the service; this endpoint is not an arbitrary SQL execution surface
  - intended consumer is `/operations/canonical-views`
  - for the current calendar month only, if observed income is less than 50% of the recent income baseline, true-spendable rows keep observed fields and add `income_basis='estimated'`, `estimated_income_total`, `estimated_spendable_before_variable_spend`, and `estimated_remaining_after_variable_spend`
  - the income baseline uses up to 6 closed months, removes months outside ±30% of the median as outliers, and averages the remaining months when at least 3 remain; otherwise it falls back to the 6-month median
  - `income_estimate_source`, `income_estimate_month_count`, and `excluded_income_periods` explain the estimate source and excluded months
  - estimated fields are API-level interpretation helpers, not DB view columns

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
      - `cost_classification_source`
      - `recurring_payment_kind`
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

#### `GET /api/v1/loan-accounts`

- Purpose: return stable loan account candidates for frontend mapping controls
- Auth: none
- Response model: `LoanAccountsResponse`
- Response shape:
  - `items[]`
    - `loan_account_id`
    - `lender`
    - `product_name`
    - `display_name_user`
    - `display_name`
    - `loan_kind`
    - `loan_start_date`
    - `loan_maturity_date`
    - `latest_snapshot_date`
    - `latest_balance`
    - `latest_interest_rate`
- Behavior:
  - combines persisted `loan_accounts` with latest `loans` snapshot rows
  - deduplicates candidates by `lender + product_name`
  - does not directly expose or depend on `loans.id`
  - `display_name` prefers user-managed `display_name_user`
  - `loan_kind` is one of `unknown`, `overdraft`, `equal_principal_interest`, `equal_principal`, `bullet`, `other`
  - `loan_start_date` and `loan_maturity_date` come from the latest `loans` snapshot for the same `lender + product_name`

#### `PATCH /api/v1/loan-accounts`

- Purpose: update loan account metadata used by mapping controls and advisor analysis
- Auth: API key required
- Request model: `LoanAccountMetadataUpdateRequest`
- Request shape:
  - either `loan_account_id`
  - or `lender` plus `product_name`
  - `display_name_user`
  - `loan_kind: "unknown" | "overdraft" | "equal_principal_interest" | "equal_principal" | "bullet" | "other"`
- Response model: `LoanAccountCandidateResponse`
- Behavior:
  - stores user-managed display name on the stable `loan_accounts` identity
  - stores `loan_kind` as nullable when the request value is `unknown`
  - creates a stable account for a `lender + product_name` pair if only snapshot data exists
  - returns the latest loan snapshot metadata when available

#### `GET /api/v1/transactions/{transaction_id}/loan-link`

- Purpose: read the loan repayment mapping for one transaction
- Auth: none
- Response model: `TransactionLoanLinkResponse`
- Response shape:
  - `link: LoanTransactionLinkItem | null`
- Behavior:
  - returns `404` if the transaction does not exist
  - returns `{"link": null}` when the transaction has no mapping

#### `GET /api/v1/loan-transaction-links`

- Purpose: list expense transactions with their current loan repayment mapping state for the dedicated frontend mapping screen
- Auth: none
- Query params:
  - `start_date`
  - `end_date`
  - `search`
  - `linked: "all" | "linked" | "unlinked"` default `all`
  - `loan_account_id`
  - `repayment_type: "principal" | "interest" | "mixed" | "unknown"`
  - `page` default `1`
  - `per_page` default `40`, max `200`
- Response model: `LoanTransactionMappingListResponse`
- Response shape:
  - `total`
  - `page`
  - `per_page`
  - `items[]`
    - transaction fields: `transaction_id`, `date`, `time`, `type`, effective category, `description`, `merchant`, `amount`, `currency`, `payment_method`, `memo`
    - `link: LoanTransactionLinkItem | null`
- Behavior:
  - only returns visible `type="지출"` loan repayment candidates
  - excludes deleted and merged transactions
  - candidate scope is intentionally broad for manual mapping: already linked rows, `금융` major-category expense rows, or rows whose category/description/merchant/payment method contains loan repayment terms such as `대출`, `상환`, `이자`, `원리금`, `원금·이자`
  - `search` matches transaction text and linked loan account lender/product text
  - ordered by `date desc, time desc, id desc`

#### `PUT /api/v1/transactions/{transaction_id}/loan-link`

- Purpose: create or replace the loan repayment mapping for one transaction
- Auth: API key required
- Request model: `LoanTransactionLinkUpsertRequest`
- Request shape:
  - either `loan_account_id`
  - or `lender` plus `product_name`
  - `repayment_type: "principal" | "interest" | "mixed" | "unknown"` default `unknown`
  - `memo`
- Response model: `LoanTransactionLinkItem`
- Behavior:
  - `loan_account_id` targets an existing stable account
  - `lender + product_name` upserts a stable account before linking
  - one transaction can have only one active loan link
  - returns `404` for unknown transactions or unknown account IDs

#### `PUT /api/v1/transactions/loan-links/bulk`

- Purpose: create or replace loan repayment mappings for selected transactions
- Auth: API key required
- Request model: `LoanTransactionLinkBulkUpsertRequest`
- Request shape:
  - `transaction_ids: int[]`
  - either `loan_account_id`
  - or `lender` plus `product_name`
  - `repayment_type: "principal" | "interest" | "mixed" | "unknown"` default `unknown`
  - `memo`
- Response shape:
  - `updated: int`
- Behavior:
  - maps many transaction rows to one stable loan account
  - returns `404` if any requested transaction or account ID does not exist
  - after a successful link write, latest matching loan snapshots may receive an estimated `monthly_payment` / `repayment_method` when their corresponding source is not `manual`; `monthly_payment` uses completed linked-transaction months only, with overdraft accounts using a recent completed-month average and other loan kinds using completed-month median
  - if linked observations later fall below the configured minimum, stale `estimated_from_linked_transactions` monthly payments are cleared; stale estimated repayment methods are cleared when linked observations no longer support an inferred method

#### `DELETE /api/v1/transactions/{transaction_id}/loan-link`

- Purpose: remove the loan repayment mapping for one transaction
- Auth: API key required
- Response: `204 No Content`
- Behavior:
  - returns `404` if the transaction does not exist
  - deleting a missing link is idempotent and still returns `204`

#### `GET /api/v1/installment-plans`

- Purpose: list user-managed installment ledger entries.
- Auth: none
- Response model: `InstallmentPlanListResponse`
- Response shape:
  - `items[]`
    - `id`, `display_name`, `merchant`, `payment_method`
    - `total_installments`, `monthly_amount`, `first_payment_date`
    - `status: "active" | "completed" | "cancelled"`
    - `memo`, `linked_installment_count`, `created_at`, `updated_at`

#### `POST /api/v1/installment-plans`

- Purpose: create an installment ledger entry that can be linked to observed transactions and forecast future cash outflow.
- Auth: API key required
- Request model: `InstallmentPlanCreateRequest`
- Required fields: `display_name`, `merchant`, `total_installments`, `monthly_amount`, `first_payment_date`
- Optional fields: `payment_method`, `status`, `memo`
- Response model: `InstallmentPlanResponse`

#### `PATCH /api/v1/installment-plans/{plan_id}`

- Purpose: update installment ledger metadata.
- Auth: API key required
- Request accepts partial plan fields from create plus `status`.
- Response model: `InstallmentPlanResponse`
- Behavior: returns `404` for unknown plans.

#### `GET /api/v1/installment-transaction-links`

- Purpose: list installment transaction candidates and current link state for `/operations/installments`.
- Auth: none
- Query params:
  - `start_date`
  - `end_date`
  - `search`
  - `linked: "all" | "linked" | "unlinked"` default `all`
  - `installment_plan_id`
  - `page` default `1`
  - `per_page` default `40`, max `200`
- Response model: `InstallmentTransactionMappingListResponse`
- Behavior:
  - only returns visible `type="지출"` rows
  - candidate scope is `recurring_payment_kind='installment'` or rows that already have an installment link
  - excludes deleted and merged transactions through `vw_transactions_effective` semantics
  - ordered by `date desc, time desc, id desc`

#### `GET /api/v1/transactions/{transaction_id}/installment-link`

- Purpose: read one transaction's installment mapping.
- Auth: none
- Response model: `TransactionInstallmentLinkResponse`
- Behavior: returns `{"link": null}` when no mapping exists, and `404` when the transaction does not exist.

#### `PUT /api/v1/transactions/{transaction_id}/installment-link`

- Purpose: create or replace one transaction-to-installment mapping.
- Auth: API key required
- Request model: `InstallmentTransactionLinkUpsertRequest`
- Request fields: `installment_plan_id`, `installment_number`, optional `memo`
- Response model: `InstallmentTransactionLinkItem`
- Behavior:
  - one transaction can have only one installment link
  - one `(installment_plan_id, installment_number)` can be linked once
  - `installment_number` must be within the plan range
  - conflict at the DB uniqueness boundary rolls back and returns `409`

#### `PUT /api/v1/transactions/installment-links/bulk`

- Purpose: sequentially link selected transactions to one installment plan.
- Auth: API key required
- Request fields: `transaction_ids`, `installment_plan_id`, `start_installment_number`, optional `memo`
- Response shape: `updated`
- Behavior:
  - transactions are sorted by transaction date/time/id before assigning sequential installment numbers
  - duplicate `transaction_ids` return `422`
  - conflict at the DB uniqueness boundary rolls back and returns `409`

#### `DELETE /api/v1/transactions/{transaction_id}/installment-link`

- Purpose: remove one transaction's installment mapping.
- Auth: API key required
- Response: `204 No Content`
- Behavior: deleting a missing link is idempotent and still returns `204`.

#### `GET /api/v1/installments/forecast`

- Purpose: project installment schedule status without changing observed cashflow views.
- Auth: none
- Query params:
  - `as_of_date`: defaults to server date
  - `months`: default `12`, range `1..120`
- Response model: `InstallmentForecastResponse`
- Response shape:
  - `items[]`: plan id/display name, installment number, due date, `period`, `amount`, `status`, optional linked `transaction_id`
  - `monthly_summary[]`: `observed_total`, `projected_total`, `missed_total` per `period`
- Status behavior:
  - linked schedule entries are `observed`
  - unlinked entries before `as_of_date` are `missed`
  - unlinked entries on or after `as_of_date` are `projected`
  - projected totals are a separate planning surface and should not be double-counted with observed transactions

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
  - `asset_items[]`
    - `id`
    - `snapshot_date`
    - `side`
    - `category`
    - `product_name`
    - `amount`
    - `liquidity_tier`
    - `is_cash_equivalent`
- Calculation:
  - groups `asset_snapshots` by `snapshot_date`
  - sums `side="asset"` and `side="liability"` separately
  - `net_worth = asset_total - liability_total`
  - `asset_items` is the editable asset-row surface for liquidity and cash-equivalent review; it is limited to latest `side="asset"` rows and does not replace the date-level `items` totals.

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

#### `GET /api/v1/analytics/net-worth-breakdown`

- Purpose: snapshot-level asset/liability/net-worth composition
- Query params:
  - `snapshot_date` optional; omitted uses latest snapshot
- Response model: `NetWorthBreakdownResponse`
- Response shape:
  - `snapshot_date`
  - `asset_total`
  - `liability_total`
  - `net_worth`
  - `items[]`
    - `side`: `asset` or `liability`
    - `category`
    - `amount`
    - `ratio`
- Notes:
  - groups `asset_snapshots` by side/category
  - investment details remain summary-only until brokerage API support

#### `GET /api/v1/analytics/liquidity-health`

- Purpose: cash-equivalent liquidity and debt burden read surface
- Query params:
  - `snapshot_date` optional; omitted uses latest snapshot
  - `monthly_required_spend` optional decimal
  - `monthly_income` optional decimal
- Response model: `AssetLiabilityHealthResponse`
- Response shape:
  - `snapshot_date`
  - `cash_equivalent_total`
  - `asset_total`
  - `liability_total`
  - `net_worth`
  - `monthly_required_spend`
  - `emergency_fund_months`
  - `monthly_debt_payment`
  - `monthly_income`
  - `debt_payment_ratio`
  - `debt_to_asset_ratio`
  - `confidence`
  - `assumptions[]`
- Notes:
  - cash equivalents use `asset_snapshots.is_cash_equivalent=true` first
  - when `is_cash_equivalent` is null, `liquidity_tier='immediate'` counts as cash-equivalent; `near_liquid` and `illiquid` do not count in the base emergency-fund months
  - when the flag is missing, the service falls back to conservative category/type name heuristics and records the assumption
  - same-date snapshot re-import preserves user-confirmed `liquidity_tier` / `is_cash_equivalent` and loan repayment metadata by stable snapshot row identity
  - monthly debt payment uses `loans.monthly_payment` when available; `monthly_payment_source` says whether that value is user-confirmed `manual` or `estimated_from_linked_transactions`
  - `estimated_from_linked_transactions` monthly payments are based on completed linked-transaction months. Overdraft accounts use a recent completed-month average; other loan kinds use completed-month median.
  - if required spend or income is omitted, emergency/debt ratios can be `null`

#### `PATCH /api/v1/assets/snapshots/{asset_snapshot_id}/liquidity`

- Auth: API key required
- Purpose: save user-confirmed asset liquidity metadata for emergency-fund calculations
- Request:
  - `liquidity_tier`: `immediate`, `near_liquid`, `illiquid`, or `null`
  - `is_cash_equivalent`: boolean or `null`
- Response model: `AssetSnapshotItemResponse`

#### `PATCH /api/v1/loans/{loan_id}/repayment-metadata`

- Auth: API key required
- Purpose: save user-confirmed debt-payment metadata for liquidity/debt burden calculations
- Request:
  - `monthly_payment`: decimal `>= 0` or `null`
  - `repayment_method`: `principal_interest`, `principal_equal`, `interest_only`, `unknown`, or `null`
- Response model: `LoanRepaymentMetadataResponse`
- Response/source fields:
  - `monthly_payment_source`: `manual`, `estimated_from_linked_transactions`, or `null`
  - `repayment_method_source`: `manual`, `estimated_from_linked_transactions`, or `null`
- Behavior:
  - supplied `monthly_payment` and `repayment_method` fields are marked `manual`
  - automatic linked-transaction estimation does not overwrite `monthly_payment_source='manual'`
  - non-manual estimated monthly payments can be cleared when loan-link deletion or replacement leaves too few completed-month observations; non-manual estimated repayment methods can be cleared when no linked observations still support the inferred method

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
    - `monthly_payment`
    - `repayment_method`
    - `monthly_payment_source`
    - `repayment_method_source`
    - `loan_kind`
    - `start_date`
    - `maturity_date`
  - `totals`
    - `principal`
    - `balance`
- Behavior:
  - latest or requested loan snapshots are enriched with matching `loan_accounts.loan_kind` by stable `lender + product_name`
  - when `repayment_method` is missing or non-manual `unknown`, compatible `loan_kind` values are exposed as read-only repayment-method fallbacks with `repayment_method_source='derived_from_loan_account'`
  - the enrichment is response-only and does not update the `loans` snapshot row

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

#### `GET /api/v1/analytics/fixed-cost-trend`

- Purpose: expose monthly fixed/variable and essential/discretionary fixed-cost trend for the selected period
- Query params:
  - `start_date`
  - `end_date`
- Response model: `FixedCostTrendResponse`
- Response shape:
  - `items[]`
    - `period`
    - `expense_total`
    - `fixed_total`
    - `variable_total`
    - `essential_fixed_total`
    - `discretionary_fixed_total`
    - `unclassified_total`
    - `unclassified_count`
    - `fixed_ratio`

#### `GET /api/v1/analytics/recurring-payments`

- Purpose: detect recurring expense groups by merchant and expose manual recurring classification state.
- Query params:
  - `start_date`
  - `end_date`
  - `min_occurrences` default `2`
  - `page` default `1`
  - `per_page` default `10`, max `100`
- Response includes:
  - `recurring_payment_kind`: resolved group value when all transactions in the group share one manual value
  - `installment_count`
  - `monthly_recurring_count`
  - `not_recurring_count`
  - `unclassified_count`
  - `transaction_ids`: ids used by the operations recurring-classification screen to bulk-update a recurring group

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
  - `baseline_months` optional override; default resolves from analytics settings, then code default `3`
  - `anomaly_threshold` optional override; default resolves from analytics settings, then code default `0.5`
  - `min_delta_amount` optional override; default resolves from analytics settings, then code default `100000`
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
  - setting precedence is explicit query param, then persisted analytics setting, then code default

#### `GET /api/v1/analytics/discretionary-velocity`

- Purpose: compare current-month discretionary spend pace with a prorated closed-month baseline.
- Query params:
  - `as_of_date` optional; omitted uses server date
- Response includes `period`, `as_of_date`, `month_progress_ratio`, `discretionary_spend`, `baseline_monthly_spend`, `baseline_spend_at_same_progress`, `velocity_ratio`, `risk_level`, `confidence`, `classification_coverage_ratio`, `unclassified_spend`, `reasons[]`, and `assumptions[]`.
- Calculation excludes loan-linked repayments and uses `spend_necessity='discretionary'`; classification coverage below the configured minimum lowers confidence instead of producing a strong warning.

#### `GET /api/v1/analytics/purchase-gate-candidates`

- Purpose: expose a discretionary purchase review queue without deciding whether a purchase is allowed.
- Query params:
  - `start_date`, `end_date`
  - `review_status`
  - `page`, `per_page`
- Candidate types: `large_oneoff`, `new_merchant`, `merchant_spike`, `discretionary_spike`.
- Candidate scope:
  - `loan_account_id is null`
  - `cost_kind != 'fixed'`
  - `spend_necessity == 'discretionary'`
  - amount meets the effective minimum candidate amount
- Response items include `candidate_key`, `candidate_type`, `candidate_types[]`, `transaction_id`, `merchant`, `amount`, `category`, `signals`, `risk_level`, `review_priority`, `confidence`, `suggested_review_window`, `reasons[]`, `assumptions[]`, and `review_status`.
- `candidate_key` is canonicalized to `transaction:{transaction_id}`. Multiple matched reasons are collapsed into one row per transaction; reason-specific signals are namespaced in `signals`.

#### `PATCH /api/v1/analytics/purchase-gate-candidates/{candidate_key}/review`

- Auth: API key required
- Purpose: persist review state for a stable purchase candidate key.
- Request: `review_status` as `pending`, `reviewed`, `ignored`, `snoozed`, or `dismissed`.
- Response: saved canonical `candidate_key`, `candidate_type`, `transaction_id`, and `review_status`.
  - `snoozed` is currently persisted as review state; cooldown days are exposed in settings/assumptions but do not create a separate hidden expiry filter yet.
  - legacy keys such as `large_oneoff:42` are accepted and rewritten to `transaction:42` on save.

#### `GET /api/v1/settings/analytics`

- Auth: API key required
- Purpose: read backend-tunable analytics settings for diagnostics
- Response model: `AnalyticsSettingsResponse`
- Response shape:
  - `defaults`, `saved`, and `effective`
  - sections: `spending_anomalies`, `discretionary_velocity`, `purchase_gate`, `recurring_dry_run`, `asset_liability_health`, `bulk_operations`
  - `saved` values are nullable; `effective` is saved-over-default and is what backend analytics use when requests do not pass explicit overrides

#### `PATCH /api/v1/settings/analytics`

- Auth: API key required
- Purpose: persist backend-tunable analytics settings
- Request body:
  - any supported setting section may be partially patched
  - sending `null` for a persisted value resets that key to code default
- Response model: `AnalyticsSettingsResponse`

#### `GET /api/v1/auto-classification/settings`

- Auth: API key required
- Purpose: read upload auto-apply toggles for category, recurring category, and loan merchant rules
- Response fields:
  - `apply_cost_rules_on_upload`
  - `apply_loan_rules_on_upload`
  - `apply_recurring_rules_on_upload`

#### `PATCH /api/v1/auto-classification/settings`

- Auth: API key required
- Purpose: persist upload auto-apply toggles
- Request accepts either or both boolean fields from the GET response

#### Category Auto-Classification Rules

- Endpoints:
  - `GET /api/v1/auto-classification/category-rules`
  - `POST /api/v1/auto-classification/category-rules`
  - `DELETE /api/v1/auto-classification/category-rules/{rule_id}`
  - `POST /api/v1/auto-classification/apply/category-rules`
- Rule fields: `category_major`, optional `category_minor`, `cost_kind`, optional `fixed_cost_necessity`
- Rule fields also accept optional `spend_necessity`. `fixed_cost_necessity` is only valid for `cost_kind='fixed'`; `spend_necessity` is valid for fixed and variable costs.
- When `cost_kind='variable'`, omitted or null `spend_necessity` is normalized to `discretionary`. Variable expense is `essential` only when explicitly selected.
- Apply behavior: matches effective category values and updates only rows whose `cost_classification_source` is not `manual`

#### Loan Merchant Auto-Link Rules

- Endpoints:
  - `GET /api/v1/auto-classification/loan-merchant-rules`
  - `POST /api/v1/auto-classification/loan-merchant-rules`
  - `DELETE /api/v1/auto-classification/loan-merchant-rules/{rule_id}`
  - `POST /api/v1/auto-classification/apply/loan-merchant-rules`
- Rule fields: `match_field`, exact `merchant`, `loan_account_id`, `repayment_type`, optional `memo`
- `match_field` accepts:
  - `merchant`: match against `transactions.merchant`, the analysis/canonical merchant value that may be normalized or user-edited
  - `description`: match against `transactions.description`, the imported raw transaction description
- The `merchant` field stores the exact match value for whichever `match_field` is selected. Rules are unique by `(match_field, merchant)`.
- Apply behavior: creates or updates only missing/auto loan links; `loan_transaction_links.source='manual'` is preserved
- If both merchant and description rules match a transaction, the merchant rule takes precedence.

#### Merchant Alias Normalization Rules

- Endpoints:
  - `GET /api/v1/auto-classification/merchant-alias-rules`
  - `POST /api/v1/auto-classification/merchant-alias-rules`
  - `DELETE /api/v1/auto-classification/merchant-alias-rules/{rule_id}`
  - `POST /api/v1/auto-classification/apply/merchant-alias-rules`
- Rule fields: `alias_pattern`, `normalized_merchant`
- Apply behavior: case-insensitive contains match against raw `transactions.description`; matched rows write `normalized_merchant` into `transactions.merchant`
- Rows whose `merchant != description` are treated as already user-edited or previously normalized analysis merchants and are preserved by default.

#### Recurring Category Auto-Classification Rules

- Endpoints:
  - `GET /api/v1/auto-classification/recurring-category-rules`
  - `POST /api/v1/auto-classification/recurring-category-rules`
  - `DELETE /api/v1/auto-classification/recurring-category-rules/{rule_id}`
  - `POST /api/v1/auto-classification/apply/recurring-category-rules`
- Rule fields: `category_major`, optional `category_minor`, `recurring_payment_kind`
- Supported recurring values: `installment`, `monthly_recurring`, `not_recurring`
- Apply behavior: matches effective category values and updates only rows whose `recurring_payment_kind` is currently empty. A transaction is eligible only when its merchant has at least 2 active months, at least 2 active dates, and amount coefficient of variation `<= 0.5`, or when the transaction already has `cost_kind='fixed'`.

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
  - `cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `cost_classification_source`, `memo`
  - nullable loan mapping fields: `loan_account_id`, `loan_lender`, `loan_product_name`, `loan_display_name`, `loan_kind`, `loan_start_date`, `loan_maturity_date`, `loan_repayment_type`, `loan_link_memo`
  - `is_deleted`, `merged_into_id`, `source`, `created_at`, `updated_at`
- derived fields:
  - `effective_category_major = coalesce(category_major_user, category_major)`
  - `effective_category_minor = coalesce(category_minor_user, category_minor)`
  - `is_edited = category user override OR merchant != description OR memo is not null OR cost/spend/recurring classification is present`

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

### `vw_fixed_cost_monthly_summary`

Canonical monthly aggregate for fixed-cost analysis. It is intended for readonly SQL and AI drill-down use cases where the caller needs the same month-level structure shown in the spending page.
Loan-linked repayments are excluded from ordinary fixed/variable totals.

Documented columns:

- `period`
- `expense_total`
- `fixed_total`
- `variable_total`
- `essential_fixed_total`
- `discretionary_fixed_total`
- `essential_variable_total`
- `discretionary_variable_total`
- `required_spend_total`
- `discretionary_spend_total`
- `unclassified_total`
- `unclassified_count`

### `vw_asset_snapshot_canonical`

Canonical snapshot-level asset/liability read surface for agent and readonly SQL use cases. It combines imported snapshot totals with user-confirmed asset liquidity and loan repayment metadata.

Documented columns:

- `snapshot_date`
- `asset_total`
- `liability_total`
- `net_worth`
- `cash_equivalent_total`
- `near_liquid_total`
- `illiquid_total`
- `loan_balance_total`
- `monthly_debt_payment_total`
- `asset_row_count`
- `loan_row_count`

Interpretation rule: this view provides calculation evidence. Final liquidity/health judgement belongs to the agent, using `/api/v1/analytics/liquidity-health` confidence and assumptions when available.

### Advisor canonical read model expansion

These views are live DB read surfaces created by Alembic and registered in `CANONICAL_VIEWS` for schema documentation. The main P0/P0.5 values are also exposed through `GET /api/v1/canonical-views/dashboard` for the frontend canonical dashboard; arbitrary SQL access remains limited to readonly DB users.

Direction:

- My Ledge's core role is to provide canonical read models for a finance assistant, not to decide assistant personality or coaching tone.
- Planned views should expose structured evidence fields where useful, such as `reason`, `confidence`, `assumptions`, `risk_level`, `baseline_delta`, `is_estimated`, and `needs_user_review`.
- P1 warning/recommendation features are the next implementation priority except investment performance/allocation work, which is deferred until brokerage API data is available.

Common rules:

- Use `vw_transactions_effective` semantics as the transaction source.
- Convert expense rows with `-amount`; positive `지출` refund/cancellation rows reduce monthly expense.
- Separate loan-linked transactions before fixed/variable breakdown to avoid double counting repayment burden as ordinary spending.
- Treat fixed/variable and essential/discretionary as independent axes. `cost_kind` is the repeatability/predictability axis; `spend_necessity` is the essential/discretionary axis for both fixed and variable expenses. Existing `fixed_cost_necessity` remains a fixed-cost compatibility field.
- Variable expense defaults to `spend_necessity='discretionary'` unless a user or rule explicitly chooses `essential`.
- Keep `transfer_activity_total` separate from `net_cashflow`.
- Keep `as_of_date`, threshold, and baseline settings in API/settings contracts when a calculation depends on runtime context.

Live P0/P0.5 views:

- `vw_monthly_cashflow`: monthly income, expense, non-loan expense, transfer activity, loan repayment, fixed/variable spend, essential/discretionary spend, unclassified expense, net cashflow, and savings rate.
- `vw_loan_repayment_monthly`: monthly repayment totals by `loan_account_id`, display name, lender, product, loan kind, maturity date, and repayment type.
- `vw_true_spendable_monthly`: monthly spendable amount after loan repayment and fixed commitments, with required/discretionary variable spend exposed separately.
- `vw_merchant_monthly_baseline`: canonical `merchant` monthly spend/count plus trailing 3-month closed-month baseline and delta fields.
- `vw_recurring_merchant_monthly`: monthly aggregate of stored `recurring_payment_kind` classifications. Interval confidence stays in API diagnostics.
- `vw_unclassified_work_queue`: prioritized transactions missing cost classification, spend necessity, fixed-cost necessity, monthly recurring kind, or likely loan-link review. Recurring review requires a monthly signal, not just two transactions at the same merchant: at least 2 active months, at least 2 active dates, and merchant amount coefficient of variation `<= 0.5`. Same-day split purchases are therefore not recurring-classification candidates. Priority combines analysis impact, amount, and recurrence likelihood.
- `vw_asset_snapshot_canonical`: snapshot-level asset/liability/net-worth/liquidity/monthly debt payment read model. It is calculation evidence for agent interpretation, not a final health label.

Planned P1/P2 views:

- Deferred investment work: `vw_investment_allocation_snapshot`, investment performance, product allocation, and cashflow-aware returns move to P2 after brokerage API integration.

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
- `spend_necessity` splits fixed and variable spend into essential/discretionary totals
- `required_spend_total = essential_fixed_total + essential_variable_total`
- `discretionary_spend_total = discretionary_fixed_total + discretionary_variable_total`
- missing classification goes to unclassified bucket
- Category auto-classification can fill `cost_kind`, fixed-cost compatibility necessity, and general `spend_necessity`; user edits mark the row manual.

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
- analytics settings are stored in `app_settings` with `scope + key` uniqueness; current live scope is `analytics.spending_anomalies`
- upload file retention is live for `POST /api/v1/upload`: default `UPLOAD_DIR=/data/uploads`, keep latest 5 original files
