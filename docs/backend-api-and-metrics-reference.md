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
  - `profile.py`
  - `settings.py`
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
- `GET /api/v1/profile`
- 모든 read-only transaction/assets/analytics endpoint
- `GET /api/v1/loan-accounts`
- `GET /api/v1/loan-transaction-links`
- `GET /api/v1/transactions/{transaction_id}/loan-link`
- `GET /api/v1/installment-transaction-suggestions`
- `GET /api/v1/installment-plans`
- `GET /api/v1/installment-transaction-links`
- `GET /api/v1/transactions/{transaction_id}/installment-link`
- `GET /api/v1/installments/forecast`

### `X-API-Key` 필요

- `GET /api/v1/schema`
- `GET /api/v1/canonical-views/dashboard`
- `GET /api/v1/settings/analytics`
- `PATCH /api/v1/settings/analytics`
- `GET /api/v1/settings/income-expectations`
- `PATCH /api/v1/settings/income-expectations`
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
- `GET /api/v1/auto-classification/recurring-category-rules/dry-run`
- `POST /api/v1/auto-classification/apply/recurring-dry-run`
- `POST /api/v1/upload`
- `POST /api/v1/upload/preview`
- `POST /api/v1/upload/apply`
- `POST /api/v1/data/reset`
- `POST /api/v1/transactions`
- `PATCH /api/v1/transactions/bulk-update`
- `PATCH /api/v1/transactions/{transaction_id}`
- `DELETE /api/v1/transactions/{transaction_id}`
- `POST /api/v1/transactions/{transaction_id}/restore`
- `POST /api/v1/transactions/merge`
- `PATCH /api/v1/loan-accounts`
- `POST /api/v1/loan-accounts/recalculate-estimates`
- `PUT /api/v1/transactions/{transaction_id}/loan-link`
- `DELETE /api/v1/transactions/{transaction_id}/loan-link`
- `PUT /api/v1/transactions/loan-links/bulk`
- `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`
- `POST /api/v1/installment-plans`
- `PATCH /api/v1/installment-plans/{plan_id}`
- `PUT /api/v1/transactions/{transaction_id}/installment-link`
- `DELETE /api/v1/transactions/{transaction_id}/installment-link`
- `PUT /api/v1/transactions/installment-links/bulk`
- `PATCH /api/v1/assets/snapshots/{asset_snapshot_id}/liquidity`
- `PATCH /api/v1/loans/{loan_id}/repayment-metadata`
- `PATCH /api/v1/analytics/purchase-gate-candidates/{candidate_key}/review`

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

- Auth: API key required. Reads allowlisted canonical views and a separate read-only monthly projection; it is not an arbitrary SQL interface.
- Query:
  - `months`: default `12`, range `1..36`; `merchant_limit`: default `10`, range `1..50`.
  - `queue_limit`: default `10`, range `1..100`; `queue_page`: default `1`, minimum `1`.
  - `search`: optional, maximum 200 characters; searches queue merchant/effective category text with literal LIKE escaping.
  - `issue_types`: comma-separated OR of `cost_kind`, `spend_necessity`, `recurring_kind`, `loan_link`; unknown-only values match no rows.
  - `period_from`, `period_to`: optional `YYYY-MM`; `current_only`: default false, restricts queue to the reference calendar month.
  - `reference_date`: optional, default server date; fixes projection and current-month queue interpretation, not a historical snapshot of all canonical rows.
- Response (`CanonicalViewsDashboardResponse`):
  - `monthly_cashflow[]`, `true_spendable_monthly[]`, `loan_repayment_monthly[]`: observed canonical monthly rows.
  - `merchant_monthly_baseline[]`, `recurring_merchant_monthly[]` plus `merchant_monthly_baseline_total`, `recurring_merchant_monthly_total`: limited rows and full view row counts (not distinct merchants).
  - `unclassified_work_queue[]` plus `unclassified_work_queue_total`, `_page`, `_per_page`, `_total_pages`: queue filters apply in SQL before count/limit/offset. Total pages is ceiling(total/per-page); an out-of-range page is empty, not clamped. Items include current nullable cost/necessity/recurring classifications alongside issue fields.
  - `data_coverage`: first/last valid observed transaction dates; this range alone does not prove complete data.
  - `month_projection`: the reference month's observed-plus-remaining scenario, described below.
- Both observed monthly groups use the same `is_complete_month` transaction-density heuristic, assessed for returned closed months independently of the projection's six-month learning window. Current/future months are false. This is not source completeness certification. Cashflow `savings_rate_basis` is `no_income`, `observed_closed_month`, or `observed_partial_month`.
- Legacy true-spendable forecast fields remain in the schema for compatibility but are no longer populated: `income_basis='observed'`, `is_income_estimated=false`, `observed_income_total=income_total`, `estimated_*`/`income_estimate_source=null`, count zero and excluded periods empty. Consumers must use `month_projection` for forecasts, without replacing observed canonical values.

#### Monthly Projection (`month_projection`)

Source: `app.services.monthly_projection_service`; model: `MonthlyProjection`. No GET persists expectations, classifications, links or derived forecasts.

| Field | Formula or meaning |
|---|---|
| `period`, `as_of_date`, `observed_through` | Reference month/date and latest valid observation at or before that date. |
| `observed_income` | Sum of all observed income rows in the reference month through the reference date. |
| `expected_remaining_income` | Sum of source-level remaining expectations after matching actual receipts. |
| `projected_month_income` | `observed_income + expected_remaining_income`. |
| `observed_net_expense` | Signed net expense (`sum(-amount)` for expense rows); refunds reduce it. Transfers are excluded. |
| `expected_remaining_expense` | Sum of complete expense components; null if any component is unknown or observation is stale. |
| `known_expected_remaining_expense` | Sum of the known portions of components, even when their complete amount is unknown. |
| `projected_month_expense` | `observed_net_expense + expected_remaining_expense`, or null. |
| `observed_net_cashflow` | `observed_income - observed_net_expense`. |
| `projected_month_end_net` | `projected_month_income - projected_month_expense`, or null. A monthly flow scenario, not a cash balance. |
| `net_after_known_remaining_expense` | `projected_month_income - observed_net_expense - known_expected_remaining_expense`. A partial calculation excluding unknown expenses, **not** a full month-end forecast or safe-to-spend amount. |
| `confidence`, `warnings`, `missing_reasons`, `limitations` | Warnings identify reviewable low-confidence estimates; missing inputs still make totals unavailable. Null totals must not become zero. |
| `included_periods`, `excluded_periods`, `coverage` | Historical observation coverage used or excluded, with missing periods and latest successful upload snapshot date when available. |
| `income_sources[]` | Source key/merchant, expected/observed/remaining amount, `expected_day`, expected date/window, status/confidence, history/exclusions, matched transaction ids and reason. |
| `expense_components[]` | `kind`, nullable `expected_remaining`, `known_expected_remaining`, `basis`, `missing_reasons`, `confidence`, `warnings`, and recurring-only `sources`. Known portions can include low-confidence estimates; they are not confirmed bills. |
| `expense_components[].sources[]` | Recurring source key/merchant; nullable `expected_monthly_amount`, gross `observed_payment_amount`, gross `observed_refund_amount`, signed `observed_net_expense`, nullable `expected_remaining`, `additional_observed_amount`; confidence, `expected|observed|review` status, basis, history/excluded periods and warnings. |

Coverage and income model:

- Reads valid canonical transactions from the first day six months before `as_of_date` through that date. Each closed month qualifies with at least eight distinct observed dates, an observation in the first seven and last seven days, and no consecutive observed-date gap over ten days. The successful-upload date is provenance, not proof that every day/account was imported.
- Automatic sources are positive salary-category income grouped by normalized merchant. Bonus, insurance payout, refund, resale/settlement-like descriptions/categories are excluded from recurring expectations; all actual income still remains in `observed_income`. Explicit expectations can identify a non-salary source, subject to the same one-off exclusion.
- A learned source needs at least three adequately covered positive income months, then at least three within ±30% of their median. Expected amount is the rounded median of accepted monthly totals. Small rows below 10% of the median monthly maximum are excluded as adjustments.
- `expected_day` is the median last receipt day, or `31` for a learned month-end pattern; it is null without an expectation. `expected_date` clips that day to the actual month length. When saving a detected source as an override, preserve `expected_day=31` rather than using a February date's day. Split-receipt ranges and a four-day tolerance accommodate timing shifts. A date spread over eight days without the month-end pattern is uncertain.
- User amount/day overrides supersede learning; `stopped=true` gives zero remaining. Missing recent receipts can mark an unobserved source stopped. Recent amounts outside the regular range or discontinuous history can instead make it uncertain and suppress remaining income. `expected`, `received`, `partial`, `late`, `stopped`, and `uncertain` remain distinct states.
- Actual receipts at least 10% of expected amount are matched. A partial total below the full expectation retains its difference when historical split-receipt count is not met or a user expectation exists. Otherwise at least 80% received prevents adding an expected duplicate. An unusually large/out-of-window receipt can be uncertain with zero remainder. Late status requires transaction observation beyond the expected window, not wall-clock time alone.

Expense model:

1. Loan-linked expense takes precedence. Latest loan snapshots at or before reference date provide monthly payments; subtract that account's current observed net repayments, floor remaining at zero. Missing payment/link ambiguity makes the component incomplete while preserving known amounts. No repayment day is inferred.
2. Installment-linked or schedule-matching expense comes next. Active current-month schedules subtract linked or unique exact merchant/payment/amount/date-match actuals read-only. Ambiguity or loan overlap remains unknown. A past unlinked due amount is excluded from future obligations and reported for review, not converted to arrears.
3. Recurring sources use gross outgoing payments for learning and subtract gross current payments; refunds reduce actual net expense but never restore an already observed payment obligation. Stable evidence needs at least three covered months within the existing ±30% median band and the immediately previous calendar month among them. For a weak explicit monthly-recurring source with current observations, use its accepted historical subset when available, otherwise covered positive-payment months, with low confidence and warnings. If only a current gross payment exists, assume that monthly cycle is observed and add zero further payment with an explicit review warning. Refund-only sources without any usable gross-payment evidence remain unknown. If the immediately previous month has inadequate overall coverage, an older stable pattern including the latest adequately covered month is retained with low confidence even before a current payment. A missing payment in an adequately covered recent month remains evidence of inactivity; weak historical-only explicit sources are not revived. Unstable ordinary fixed costs move to the residual model.
   - Remaining amount is `min(max(monthly_baseline - current_gross_payments, 0), median(historical_gross_payments_after_observed_day))`. Historical days are clipped to the reference month's final day. This prevents early full payment and small amount changes after the normal payment date from inventing extra bills while retaining evidenced later split payments.
   - Current gross payments above the baseline are `additional_observed_amount`, part of actual expense only. They indicate a baseline excess, not a proven one-off charge. Refunds, excess payments and weak histories carry review warnings. When the historical tail is zero and current gross payments are below 70% of the monthly baseline, a missing/changed payment warning lowers confidence without inventing a future charge; small amount differences within that historical stability tolerance do not. These are scenarios, not contract or settlement reconciliation.
4. The `variable` component is residual variable/unclassified/non-regular fixed spend after the preceding partitions. It uses the median historical signed expense for days after the current month's **last observed day**, with at least three adequately covered months; floor at zero.

Each transaction belongs to one model partition. Known portions survive a component's missing reason. Full expense/month-end projections are null if any component is unknown, there is no observed transaction, or the latest observation is more than seven days before reference. Confidence is unavailable when the full expense is unknown, otherwise low when reasons or component warnings remain and medium when none remain. Warning-only recurring sources do not create missing-input reasons or null totals. The returned scenario does not guarantee future employment, contracts, new spending or available bank cash.

#### `GET /api/v1/settings/income-expectations` / `PATCH /api/v1/settings/income-expectations`

- Both require `X-API-Key`; schema is `IncomeExpectationsSettings` (`items`, maximum 50 unique sources).
- Each item: `source_key`, `merchant` (1–500 characters, whitespace normalized), `expected_amount` (integer 0–1,000,000,000,000), `expected_day` (1–31), `stopped` (default false).
- Source key must equal `income:` plus the merchant with case folding and collapsed whitespace; duplicate keys or mismatched identities return `422`.
- GET returns only saved expectations, empty when none exist. PATCH **replaces the complete list** despite its verb; `items: []` removes all overrides. Store is `app_settings`, scope `forecast.income_expectations`, key `items`. It is separate from analytics knob defaults/saved/effective settings.

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
    - `insurance_contracts`
    - `investments`
    - `loans`
  - `error_message`
- Runtime behavior:
  - decrypts workbook with `open_excel_bytes()`
  - loads workbook with `openpyxl(..., data_only=True)`
  - transaction import and snapshot import run independently
  - snapshot import parses `1.고객정보`, `3.재무현황`, `4.보험현황`, `5.투자현황`, and `6.대출현황`; `2.현금흐름현황` is read only by parity verification, not persisted
  - final `status` can be `success`, `partial`, or `failed`
  - always writes one `upload_logs` row

#### `POST /api/v1/upload/preview`

- Purpose: build reconciliation plan without mutating transactions
- Auth: API key required
- Content type: `multipart/form-data`
- Request fields:
  - `file: UploadFile`
  - `snapshot_date: date`
- Response model: `UploadPreviewResponse`
- Response shape:
  - `filename`
  - `snapshot_date`
  - `summary`
    - `parsed_transaction_count`
    - `safe_change_count`
    - `review_required_count`
    - `change_type_counts`
  - `safe_changes[]: UploadPreviewChange`
  - `review_required_changes[]: UploadPreviewChange`
- Runtime behavior:
  - parses and normalizes workbook with `open_excel_bytes()` + `openpyxl(..., data_only=True)`
  - does not persist any transaction mutations
  - computes matching across latest import window:
    - exact hash match => `unchanged`
    - fallback match with drift => `source_fields_changed` / `time_shifted`
    - unmatched existing import rows => `missing_from_latest_export` (safe)
    - higher-risk matches => `possible_replacement`, `possible_duplicate`, `ambiguous`
  - each change includes field diffs, source rows, reason, `review_required`, `auto_apply_safe`, `preserved_user_fields`, and `preservation_summary`

#### `POST /api/v1/upload/apply`

- Purpose: explicitly apply selected preview changes that the backend allows after
  revalidating the latest preview state. Safe changes are accepted directly;
  `possible_replacement` is accepted only as an explicit reviewed selection;
  `possible_duplicate` and `ambiguous` remain rejected.
- Auth: API key required
- Content type: `multipart/form-data`
- Request fields:
  - `file: UploadFile`
  - `snapshot_date: date`
  - `apply_request: UploadApplyRequest` (JSON form field)
- Response model: `UploadApplyResponse`
- Response shape:
  - `status`
  - `upload_id`
  - `filename`
  - `snapshot_date`
  - `summary`
  - `applied_changes[]: UploadPreviewChange`
- Runtime behavior:
  - 업로드된 파일(`file`)을 서버에서 다시 파싱/복호화하고, 제출된 행 기준으로 최신 preview plan을 재생성·재검증한 뒤, `apply_request.selections`에 일치하는 허용 항목만 적용한다. 허용 항목은 `auto_apply_safe=true`인 safe change와, 명시 승인된 `possible_replacement` supersession이다.
  - `UploadApplySelection`는 `change_type + source_row_hash + existing_transaction_id` 조합으로 고유해야 하며, 중복 선택은 422로 거절한다.
  - `possible_replacement`를 제외한 `review_required` 또는 `auto_apply_safe=false` 항목은 적용에서 거부한다. `possible_replacement`는 최신 preview state와 일치하는 명시 selection일 때만 supersession으로 적용할 수 있다.
  - 결과에는 선택된 change 수, 적용된 change 수, 타입별 카운트를 포함한다.
  - `missing_from_latest_export`는 삭제 대신 lifecycle 상태 변경으로 남긴다.
  - 적용 트랜잭션 판단 근거는 업로드 로그의 `reconciliation_audit`(문자열 JSON)로 남을 수 있다.

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
    - `insurance_contracts`
    - `investments`
    - `loans`
  - `upload_logs_retained`
- Notes:
  - `upload_logs_retained` is currently always `true`

#### `GET /api/v1/profile`

- Purpose: latest BankSalad `1.고객정보` profile snapshot for agent context.
- Auth: none.
- Response model: `ProfileResponse`
- Response shape:
  - `snapshot_date`
  - `gender`
  - `age`
  - `credit_score_kcb`
  - `credit_score_history[]`
  - `has_snapshot`
  - `missing_reason`
  - `expected_source`
  - `source_section_found`
- Notes:
  - parser stores `gender`, `age`, and KCB credit score only.
  - name and email from the workbook are intentionally not stored.
  - missing `1.고객정보` skips profile import without failing the rest of the upload.

### Transactions Read

#### `GET /api/v1/transactions`

- Purpose: paginated transaction list for dashboard/workbench
- Query params:
  - `start_date`
  - `end_date`
  - `type: "지출" | "수입" | "이체" | "income_expense" | "all"` default `all`
  - `source: "import" | "manual" | "all"` default `all`
  - `category_major`
  - `payment_method`
  - `cost_kind: "fixed" | "variable" | "all"` default `all`
  - `fixed_cost_necessity: "essential" | "discretionary" | "all"` default `all`
  - `spend_necessity: "essential" | "discretionary" | "all"` default `all`
  - `recurring_payment_kind: "installment" | "monthly_recurring" | "not_recurring" | "all"` default `all`
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
  - ordered by `date asc, time asc, id asc`

`income_expense` selects income and expense while excluding transfers. It is shared by transaction/analytics endpoints using `TransactionTypeFilter`; `all` still includes transfers. Amounts remain raw signed values, not a claim of equivalence to canonical cashflow.

#### `GET /api/v1/transactions/{transaction_id}`

- Auth: none
- Response: one `TransactionResponse`, or `404` when the id does not exist.
- Reads the stored row by id independently of list filters; deleted/merged state is visible in the response. Useful for opening a referenced transaction without changing the table's current page.

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
  - `basis`
    - `aggregation_surface`
    - `amount_sign_convention`
    - `included_types`
    - `excluded_types`
    - `includes_loan_repayments`
    - `excludes_deleted`
    - `excludes_merged`
    - `canonical_cashflow_equivalent`
  - `items[]`
    - `period`
    - `amount`
- Notes:
  - sums raw signed `amount`; this is not necessarily equivalent to canonical cashflow because loan repayments, transfers, deleted rows, and merged rows have endpoint-specific rules

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

Single and bulk PATCH share field-presence semantics: omitted fields preserve stored values; explicit `spend_necessity:null` clears necessity and takes precedence over `fixed_cost_necessity` even when null. The compatibility fixed field is synchronized only for fixed costs. Explicit `cost_kind:null` is a historical no-op, whereas `recurring_payment_kind:null` clears classification. Only an actual change to the cost-kind/necessity tuple marks `cost_classification_source='manual'`; unchanged values and memo-only edits preserve the source. Creation/category-rule normalization retains the default of discretionary for variable expenses with missing necessity.

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
  - `spend_necessity`
  - `recurring_payment_kind`
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
    - `spend_necessity`
    - `recurring_payment_kind`
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
  - `spend_necessity`
  - `recurring_payment_kind`
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
- Query params:
  - `include_hidden: bool` default `false`
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
    - `as_of_date`
    - `latest_snapshot_date`
    - `is_active`
    - `is_hidden`
    - `is_matured`
    - `is_stale`
    - `lifecycle_status`
    - `latest_balance`
    - `last_observed_balance`
    - `last_observed_principal`
    - `last_observed_snapshot_date`
    - `included_in_active_summary`
    - `excluded_from_summary_reason`
    - `stable_identity_status`
    - `stable_identity_reason`
    - `latest_interest_rate`
- Behavior:
  - combines persisted `loan_accounts` with latest `loans` snapshot rows
  - deduplicates candidates by `lender + product_name`
  - does not directly expose or depend on `loans.id`
  - `display_name` prefers user-managed `display_name_user`
  - `loan_kind` is one of `unknown`, `overdraft`, `equal_principal_interest`, `equal_principal`, `bullet`, `other`
  - user-hidden accounts are excluded by default and can be included with `include_hidden=true`
  - hidden accounts return `lifecycle_status='user_hidden'`, `is_hidden=true`, `included_in_active_summary=false`, and `excluded_from_summary_reason='user_hidden'`
  - `loan_start_date` and `loan_maturity_date` come from the latest `loans` snapshot for the same `lender + product_name`
  - `/loan-accounts` is an inventory surface: rows missing from the latest global loan snapshot can remain visible with stale/matured lifecycle metadata instead of being treated as active balances

#### `PATCH /api/v1/loan-accounts`

- Purpose: update loan account metadata used by mapping controls and advisor analysis
- Auth: API key required
- Request model: `LoanAccountMetadataUpdateRequest`
- Request shape:
  - either `loan_account_id`
  - or `lender` plus `product_name`
  - `display_name_user`
  - optional `loan_kind: "unknown" | "overdraft" | "equal_principal_interest" | "equal_principal" | "bullet" | "other"`
  - `is_hidden`
- Response model: `LoanAccountCandidateResponse`
- Behavior:
  - stores user-managed display name on the stable `loan_accounts` identity
  - omitted metadata fields leave existing values unchanged
  - stores `loan_kind` as nullable when the request value is `unknown`
  - stores `is_hidden` when supplied; omitted leaves the existing hidden state unchanged
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
  - `review_status: "all" | "pending" | "not_candidate"` default `pending`
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

#### `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`

- Purpose: write one loan candidate review state so `/data/inbox` can omit non-loan candidates without UI-only hiding.
- Auth: API key required
- Request model: `LoanCandidateReviewPatchRequest`
- Request shape:
  - `review_status: "pending" | "not_candidate"`
  - optional `memo`
- Response model: `LoanCandidateReviewResponse`
- Behavior:
  - sets/replaces `loan_candidate_reviews` row for transaction
  - candidate key format uses `loan_transaction:{transaction_id}`
  - `not_candidate` hides a previously pending candidate from default list and is reversible by patching back to `pending`
  - restoring (`pending`) updates `reviewed_at`
  - linked transaction can not be marked `not_candidate`; returns `409` in that case
- Response shape:
  - `candidate_key`
  - `candidate_type: "loan_transaction"`
  - `transaction_id`
  - `review_status`
  - `memo`
  - `reviewed_at`

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
  - candidate scope includes `recurring_payment_kind='installment'`, existing links and read-only active-plan matching suggestions
  - excludes deleted and merged transactions through `vw_transactions_effective` semantics
  - ordered by `date desc, time desc, id desc`

#### `GET /api/v1/installment-transaction-suggestions`

- Purpose: read read-only advisory installment transaction suggestions for active installment plans.
- Auth: none
- Query params:
  - `installment_plan_id` (optional, filters by active plan id)
  - `page` default `1`
  - `per_page` default `40`, max `200`
- Response model: `InstallmentTransactionSuggestionListResponse`
- Response shape:
  - `total`
  - `page`
  - `per_page`
  - `items[]`
    - `transaction`
      - `transaction_id`, `date`, `time`, `type`, `effective_category_major`, `effective_category_minor`, `description`, `merchant`, `amount`, `currency`, `payment_method`, `memo`, `recurring_payment_kind`
    - `installment_plan_id`, `installment_plan_display_name`, `installment_plan_merchant`
    - `total_installments`, `monthly_amount`, `first_payment_date`
    - `suggested_installment_number`, `expected_billing_date`
    - `amount_delta`, `billing_day_delta`, `score`
    - `confidence: "high" | "medium" | "low"`
    - `reason_labels`
    - `conflict_reason`: `installment_number_already_linked`, `inactive_installment_link`, `ambiguous_plan_match`, `competing_transactions`, or null
    - nullable `conflicting_transaction_id`, `conflicting_transaction_state` (`deleted` or `merged`)
    - `is_usable: bool`
- Behavior:
  - only active installment plans are considered
  - all active plans participate in conflict detection before `installment_plan_id` filters returned suggestions
  - suggests only expense (`지출`) rows with `amount < 0`, not deleted, and not already linked
  - ordering is deterministic: `expected_billing_date`, `plan.display_name`, `transaction.date`, `transaction.id`
  - amount/날짜 일치성은 허용 오차(`amount tolerance`, `billing day tolerance`)를 적용한 뒤 점수(score)와 confidence를 산정한다
  - KRW and a configured plan payment method must match. Exact merchant matching is preferred; confirmed alias continuity can propose an alternate merchant only with exact amount/payment evidence, at most medium confidence. A similar amount alone is insufficient.
  - ambiguous plans, competing transactions and occupied installments are unusable suggestions; no GET creates or changes links
  - 제안은 advisory only이며, 제안된 회차를 UI가 수동 링크 payload(`installment_number`)로 전달할 수 있다

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
- Behavior: for an existing transaction, deleting a missing link returns `204` after any `require_inactive` guard. A missing transaction returns `404`.
- Optional query `require_inactive` defaults false. With true, the linked transaction must still be deleted/merged; a restored/active row returns `409`. Inactive links remain stored for audit/restore until explicitly removed, and continue to block reuse of their installment slot. Suggestions identify the conflict and transaction; plan linked counts and forecast observations exclude inactive transactions.

#### `GET /api/v1/installments/forecast`

- Purpose: project installment schedule status without changing observed cashflow views.
- Auth: none
- Query params:
  - `as_of_date`: defaults to server date
  - `months`: default `12`, range `1..120`
- Response model: `InstallmentForecastResponse`
- Response shape:
  - `items[]`: plan id/display name, installment number, due date, `period`, `amount`, `status`, `status_label`, `is_future_obligation`, optional linked `transaction_id`
  - `monthly_summary[]`: `observed_total`, `projected_total`, `past_unconfirmed_total`, compatibility `missed_total` per `period`
- Status behavior:
  - linked schedule entries are `observed`
  - unlinked entries before `as_of_date` are `missed`
  - unlinked entries on or after `as_of_date` are `projected`
  - projected totals are a separate planning surface and should not be double-counted with observed transactions
  - `missed`/`past_unconfirmed_total` means a past schedule entry without a confirmed link, not proven unpaid debt. `missed_total` is an alias for that value; only projected entries are future obligations.

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
  - sums nonnegative `side="asset"` rows and all `side="liability"` rows separately
  - `net_worth = asset_total - liability_total`
  - `asset_items` is the editable asset-row surface for liquidity and cash-equivalent review; it is limited to latest `side="asset"` rows and does not replace the date-level `items` totals.
  - each totals row exposes `negative_asset_excluded_total` (signed sum of preserved negative asset rows) and `aggregation_basis='nonnegative_asset_rows_minus_liability_rows'`

#### `GET /api/v1/assets/net-worth-history`

- Purpose: line-chart friendly net worth series
- Request: none
- Response model: `NetWorthHistoryResponse`
- Response shape:
  - `items[]`
    - `snapshot_date`
    - `net_worth`
    - `negative_asset_excluded_total`, `aggregation_basis`
- Uses the same nonnegative-asset-minus-liability basis as snapshot totals, comparison, breakdown and liquidity health; raw negative asset evidence is not deleted.

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
  - `current` and `baseline` expose the same aggregation basis and negative-asset exclusion metadata as snapshot totals; delta compares those consistently aggregated values

#### `GET /api/v1/analytics/net-worth-breakdown`

- Purpose: snapshot-level asset/liability/net-worth composition
- Query params:
  - `snapshot_date` optional; omitted uses latest snapshot
- Response model: `NetWorthBreakdownResponse`
- Response shape:
  - `snapshot_date`
  - `asset_total`
  - `negative_asset_excluded_total`
  - `liability_total`
  - `net_worth`
  - `items[]`
    - `side`: `asset` or `liability`
    - `category`
    - `amount`
    - `ratio`
- Notes:
  - excludes `side='asset' AND amount < 0` rows from `asset_total` and exposes the excluded sum as `negative_asset_excluded_total`
  - `aggregation_basis='nonnegative_asset_rows_minus_liability_rows'` also applies to snapshot/history/comparison/health totals
  - groups non-excluded `asset_snapshots` by side/category
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
  - `negative_asset_excluded_total`
  - `liability_total`
  - `net_worth`
  - `monthly_required_spend`
  - `monthly_required_spend_source`
  - `emergency_fund_months`
  - `emergency_fund_target_months`
  - `target_progress_ratio`
  - `monthly_debt_payment`
  - `monthly_income`
  - `monthly_income_source`
  - `derived_from_periods`
  - `manual_input_overrides`
  - `debt_payment_ratio`
  - `debt_to_asset_ratio`
  - `confidence`
  - `assumptions[]`
- Notes:
  - cash equivalents use `asset_snapshots.is_cash_equivalent=true` first
  - when `is_cash_equivalent` is null, `liquidity_tier='immediate'` counts as cash-equivalent; `near_liquid` and `illiquid` do not count in the base emergency-fund months
  - when the flag is missing, the service falls back to conservative category/type name heuristics and records the assumption; `자유입출금`, `전자금융`, and `통장` count only when locked markers such as `청약`, `저금통`, `보험`, `연금`, or `부동산` are absent
  - omitted income/required-spend defaults are bounded by the selected snapshot (`input_as_of_date`), not today's date; explicit query params override defaults and appear in `manual_input_overrides`
  - required spend uses that snapshot's latest closed calendar month (the same month if the snapshot is month-end): `max(0, required_spend_essential_total + required_spend_additional_debt_total)`. Essential expenses use signed `-amount`; linked debt expense is added only if it is not already essential. Monthly estimated debt payment is not added again.
  - `required_spend_period` names the observation month. Income uses the median of observed income-month totals through that closed month; missing income months are not synthesized as zero.
  - negative asset rows are excluded from cash-equivalent totals and add `negative_asset_rows_excluded` to assumptions
  - `emergency_fund_target_months` comes from effective `settings/analytics.financial_targets`; `target_progress_ratio = emergency_fund_months / emergency_fund_target_months` when required spend is available
  - same-date snapshot re-import preserves metadata by stable identity. Asset overrides also carry forward from the nearest prior unambiguous `side/category/product_name` identity, including explicit null/false; duplicated/generated-suffix names do not receive cross-date guesses.
  - monthly debt payment uses `loans.monthly_payment` from the selected loan snapshot once, not the sum of historical snapshots; `debt_payment_snapshot_date` identifies it. Sources distinguish `manual` and `estimated_from_linked_transactions`.
  - `estimated_from_linked_transactions` monthly payments are based on completed linked-transaction months. Overdraft accounts use a recent completed-month average; other loan kinds use completed-month median.
  - if required spend or income is omitted, emergency/debt ratios can be `null`

#### `PATCH /api/v1/assets/snapshots/{asset_snapshot_id}/liquidity`

- Auth: API key required
- Purpose: save user-confirmed asset liquidity metadata for emergency-fund calculations
- Request:
  - `liquidity_tier`: `immediate`, `near_liquid`, `illiquid`, or `null`
  - `is_cash_equivalent`: boolean or `null`
- Response model: `AssetSnapshotItemResponse`
- PATCH omission preserves a field. Explicit null restores automatic/heuristic behavior; `false` remains an explicit cash-equivalent override.

#### `PATCH /api/v1/loans/{loan_id}/repayment-metadata`

- Auth: API key required
- Purpose: save user-confirmed debt-payment metadata for liquidity/debt burden calculations
- Request:
  - `monthly_payment`: decimal `>= 0` or `null`
  - `repayment_method`: `principal_interest`, `principal_equal`, `interest_only`, `unknown`, or `null`
  - `monthly_payment_mode`, `repayment_method_mode`: optional `automatic`; supplied null or a simultaneous corresponding value is invalid (`422`)
- Response model: `LoanRepaymentMetadataResponse`
- Response/source fields:
  - `monthly_payment_source`: `manual`, `estimated_from_linked_transactions`, or `null`
  - `repayment_method_source`: `manual`, `estimated_from_linked_transactions`, or `null`
- Behavior:
  - supplied `monthly_payment` and `repayment_method` fields are marked `manual`
  - omission preserves the field; explicit null remains a manual missing value, and zero is a valid manual payment
  - automatic mode clears only the selected override and recomputes from linked transactions; only latest snapshots allow it (`409` for historical snapshots)
  - automatic linked-transaction estimation does not overwrite `monthly_payment_source='manual'`
  - non-manual estimated monthly payments can be cleared when loan-link deletion or replacement leaves too few completed-month observations; non-manual estimated repayment methods can be cleared when no linked observations still support the inferred method
  - single/bulk transaction delete/restore refresh affected linked-loan estimates while preserving the link itself and manual metadata; account kind, automatic link changes and imports also refresh affected accounts

Estimate metadata on repayment metadata, loan summary and recalculation items:

- `monthly_payment_missing_reason`: null or `manual_value_missing`, `recalculation_required`, `insufficient_observations`, `no_linked_transactions`, `current_month_excluded`, `no_observations_in_window`.
- `monthly_payment_estimate_basis`: `mean_recent_three_closed_month_linked_repayments` for overdraft accounts, otherwise `median_closed_month_linked_repayments`.
- `monthly_payment_observation_months`, `monthly_payment_estimate_window_start`, `monthly_payment_estimate_window_end`, `monthly_payment_min_observations` explain the effective observation window. Missing payment is not zero.

#### `POST /api/v1/loan-accounts/recalculate-estimates`

- Auth: API key required.
- Request: `loan_account_ids` (1–100, deduplicated), `reset_invalid_manual_null` (default false).
- Recalculates selected accounts' latest snapshots only. Opt-in reset clears only a null `monthly_payment` with manual source; non-null manual amounts and manual repayment methods are preserved.
- Unknown account: `404`; any selected account without a snapshot: `409`, before mutation.
- Response: `items[]` containing `loan_account_id`, `loan_id`, `snapshot_date`, `monthly_payment`, `monthly_payment_source` and the estimate metadata above.

#### `GET /api/v1/investments/summary`

- Purpose: latest or requested investment snapshot
- Query params:
  - `snapshot_date` optional
- Response model: `InvestmentSummaryResponse`
- Response shape:
  - `snapshot_date`
  - `has_contract_snapshot`
  - `missing_reason`
  - `expected_source`
  - `items[]`
    - `product_type`
    - `broker`
    - `product_name`
    - `cost_basis`
    - `market_value`
    - `return_rate`
    - `pct_of_investment_total`: `market_value / totals.market_value`, or `null` when total market value is zero
  - `totals`
    - `cost_basis`
    - `market_value`
- Behavior:
  - when `snapshot_date` omitted, service resolves `max(snapshot_date)`
  - when no data exists, returns empty items and zero totals

#### `GET /api/v1/insurance/summary`

- Purpose: latest or requested insurance contract snapshot plus a spending-based premium estimate.
- Query params:
  - `snapshot_date` optional
- Response model: `InsuranceSummaryResponse`
- Response shape:
  - `snapshot_date`
  - `items[]`
    - `id`
    - `snapshot_date`
    - `insurer`
    - `product_name`
    - `contract_status`
    - `total_paid`
    - `contract_date`
    - `maturity_date`
  - `monthly_premium_estimate`
    - `period`
    - `amount`
    - `assumptions[]`
    - `basis`
- Behavior:
  - upload parses `4.보험현황` by marker text and stores contract snapshots in `insurance_contracts`
  - same snapshot-date re-upload replaces insurance contracts for that date
  - total rows such as `총계` are skipped
  - `monthly_premium_estimate` uses the latest closed month `보험` effective category spend from non-deleted, non-merged expense transactions; refunds/cancellations offset the net estimate
  - My Ledge only provides contract and premium-estimate evidence. Insurance adequacy judgement belongs to the agent/user layer.

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
  - rows whose stable loan account has `is_hidden=true` are excluded from `items` and totals
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
- Behavior:
  - raw rows are loaded as signed transactions first (`income`/`expense`/`transfer` normalization happens after row loading).
  - confirmed settlement matches only (`auto_confirmed`, `user_confirmed`) are netted for analytics math.
  - confirmed netting is applied only while both original/refund participants still satisfy canonical analytics inclusion (`type='지출'`, `is_deleted=false`, `merged_into_id is null`, non-zero signed amount).
  - `review_required` and `rejected` settlement matches are treated as unconfirmed and remain on raw signed basis.
  - positive `type='지출'` rows are retained as refund/cancellation offsets on raw surfaces unless a confirmed settlement match applies netting.

#### `GET /api/v1/analytics/category-mom`

- Purpose: compare current month vs previous month by category
- Query params:
  - `start_date`
  - `end_date`
  - `level` default `major`
  - `type` default `지출`
- Response model: `CategoryMoMResponse`
- Metadata: `reference_date`, `is_partial_period`, `comparison_basis` (`same_day_previous_month` or `full_previous_month`). An explicit partial `end_date` selects that month even with no rows and compares only the same day range in the previous month.
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
  - `essential_variable_total`
  - `discretionary_variable_total`
  - `required_spend_total`
  - `discretionary_spend_total`
  - `unclassified_total`
  - `unclassified_count`

`necessity_unclassified_total` and `necessity_unclassified_count` separately expose expenses lacking a usable necessity classification. They are not aliases for missing `cost_kind`; axes can overlap. Amount buckets use signed net expense including refunds.

#### `GET /api/v1/analytics/fixed-cost-trend`

- Purpose: expose monthly fixed/variable and essential/discretionary fixed-cost trend for the selected period
- Query params:
  - `start_date`
  - `end_date`
- Response model: `FixedCostTrendResponse`
- Each month also exposes `necessity_unclassified_total`/`necessity_unclassified_count` with the same signed semantics as fixed-cost summary.
- Response shape:
  - `items[]`
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
    - `fixed_ratio`

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
  - calculations use observed income months only; absent months are not zero-income months and observation coverage is not proven complete

#### `GET /api/v1/analytics/recurring-payments`

- Purpose: detect recurring expense groups by merchant and expose saved recurring classification state.
- Query params:
  - `start_date`
  - `end_date`
  - `min_occurrences` default `2`
  - `activity`: `all` (default), `active`, or `history`
  - `recent_days`: default `90`, range `1..730`
  - `page` default `1`
  - `per_page` default `10`, max `100`
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
    - `recurring_payment_kind`
    - `installment_count`
    - `monthly_recurring_count`
    - `not_recurring_count`
    - `unclassified_count`
    - `transaction_ids`
    - `net_amount`, `last_charge_date`, `activity_status`
  - `reference_date`, `activity`, `recent_days`
  - `assumptions`
- Notes:
  - `recurring_payment_kind` is the resolved group value when all transactions in the group share one saved value; otherwise it can be `null`.
  - `transaction_ids` are the row ids used by `/operations/recurring-classification` for group-level bulk updates.
  - charge/refund rows are netted by date; positive net-charge dates determine cadence. `avg_amount` is signed net expense divided by the count of net-charge dates (at least one). `occurrences`/ids still describe all observed rows.
  - `activity_status` is `active_candidate`, `historical`, `irregular`, `non_positive`, or `not_recurring`. `activity=active` includes only active candidates; `history` includes the other statuses. Reference is `end_date` or today; recentness uses the smaller of `recent_days` and a cadence-aware window. Explicit installment/not-recurring classifications are not active subscription candidates.
  - an active candidate is an observation signal, not confirmation of a subscription contract

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
    - `delta_pct_raw`
    - `delta_pct_display`
    - `delta_display_capped`
    - `baseline_quality`
    - `anomaly_mode`
    - `direction`: `increase` or `decrease`
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
  - sparse baseline spikes keep raw `delta_pct`/`delta_pct_raw` for machines but cap or null `delta_pct_display` and use a stable user-facing `reason`
  - refunds remain signed. Direction comes from the signed delta; sparse drops use a drop mode instead of an increase label, and negative net expense identifies refund/cancellation effect.

#### `GET /api/v1/analytics/discretionary-velocity`

- Purpose: compare current-month discretionary spend pace with a prorated closed-month baseline.
- Query params:
  - `as_of_date` optional; omitted uses server date
- Response includes `period`, `as_of_date`, `month_progress_ratio`, `discretionary_spend`, `baseline_monthly_spend`, `baseline_spend_at_same_progress`, `velocity_ratio`, `risk_level`, `confidence`, `classification_coverage_ratio`, `unclassified_spend`, `reasons[]`, and `assumptions[]`.
- Calculation excludes loan-linked repayments and uses `spend_necessity='discretionary'`; classification coverage below the configured minimum lowers confidence instead of producing a strong warning.
- Current/baseline/unclassified spend use signed net expense. Coverage uses positive charge amounts only, so refunds do not make coverage ratios misleading. A nonpositive prorated baseline yields a null velocity ratio.

#### `GET /api/v1/analytics/purchase-gate-candidates`

Legacy naming for the same post-transaction review queue. Prefer `GET /api/v1/analytics/spending-review-candidates` for new clients.

#### `GET /api/v1/analytics/spending-review-candidates`

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
- Response items include `candidate_key`, `candidate_type`, `candidate_types[]`, `transaction_id`, `merchant`, `amount`, `category`, `signals`, `risk_level`, `review_priority`, `confidence`, `suggested_review_window`, `reasons[]`, `assumptions[]`, `review_status`, `review_memo`, `reviewed_at`, `cooldown_until`, `review_timing='post_transaction'`, `candidate_purpose='future_friction_rule_candidate'`, and `future_friction_suggestion`.
- `candidate_key` is canonicalized to `transaction:{transaction_id}`. Multiple matched reasons are collapsed into one row per transaction; reason-specific signals are namespaced in `signals`.
- Confirmed settlement refunds are netted before scoring. Fully refunded purchases are excluded; partial refunds are scored by net spend and expose `refund_netting_refund_total`.
- Candidate scoring uses shared settlement netting metadata from analytics service, so confirmed refunds are not double-netted by a separate pass.
- Response `start_date`/`end_date` identify the evaluated window. An unconfirmed unique one-charge/one-refund pair with the same date, merchant, payment method and amount can expose `possible_cancellation=true` and `cancellation_evidence_transaction_ids`. It remains a low-confidence review hint (`risk_level='unknown'`, normal priority, no future-friction suggestion), not a confirmed settlement or GET-side write.

#### `PATCH /api/v1/analytics/purchase-gate-candidates/{candidate_key}/review`

- Auth: API key required
- Purpose: persist review state for a stable purchase candidate key.
- Request: `review_status` as `pending`, `reviewed`, `ignored`, `snoozed`, or `dismissed`, plus optional `memo` and `cooldown_days`.
- Response: saved canonical `candidate_key`, `candidate_type`, `transaction_id`, `review_status`, `memo`, `reviewed_at`, and `cooldown_until`.
  - `snoozed` with `cooldown_days` stores an explicit `cooldown_until`; without an explicit value it defaults to 14 days.
  - legacy keys such as `large_oneoff:42` are accepted and rewritten to `transaction:42` on save.

#### `GET /api/v1/settings/analytics`

- Auth: API key required
- Purpose: read backend-tunable analytics settings for diagnostics
- Response model: `AnalyticsSettingsResponse`

Recurring `default_apply_scope` supports only `all_matching|reviewed_only`. Monthly/weekly interval minimums must not exceed their maximums. `recurring_dry_run.upload_auto_apply` is the canonical recurring upload switch; when it has no saved value the legacy upload toggle supplies compatibility fallback. Both settings APIs read the same effective value and writes synchronize it.
Historical unsupported default scopes remain visible in `saved`; `effective.default_apply_scope` safely resolves to `reviewed_only` until corrected. This does not silently turn a legacy preference into full-scope approval.
- Response shape:
  - `defaults`, `saved`, and `effective`
  - sections: `spending_anomalies`, `discretionary_velocity`, `purchase_gate`, `recurring_dry_run`, `asset_liability_health`, `bulk_operations`, `financial_targets`
  - `saved` values are nullable; `effective` is saved-over-default and is what backend analytics use when requests do not pass explicit overrides
  - `financial_targets` includes `emergency_fund_target_months` default `3`, nullable `savings_rate_target`, and nullable `debt_strategy_preference` (`avalanche` or `snowball`)

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
- New/upserted category and recurring-category rules validate against effective categories in currently valid expense transactions (`422` for unknown categories). Historical invalid rules remain readable with `category_valid=false` and `validation_message`; reads do not remove them.

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
- Apply behavior: automatic apply, upload apply, dry-run and approval share one candidate calculation using effective `recurring_dry_run` settings: occurrence/month/date minimums, amount coefficient of variation, cadence intervals and confidence. Fixed costs do not bypass evidence requirements. Only valid negative expenses supply evidence; explicit contrary recurring values are excluded. Already-matching classifications can support evidence, but only null classifications are changed.

#### Recurring Dry-run Approval

- `GET /api/v1/auto-classification/recurring-category-rules/dry-run` is authenticated/read-only. Proposals include matched transactions, confidence/reason/category hint, `apply_scope_options`, `default_apply_scope`, and a 64-hex `preview_token` bound to settings, rules and transaction evidence.
- `POST /api/v1/auto-classification/apply/recurring-dry-run` requires `merchant`, `proposed_kind`, and that token. It accepts `apply_scope=all_matching|reviewed_only`; omission uses effective settings. `future_only` is unsupported (`422`).
- Apply rechecks locked evidence. Missing/changed proposal or token returns `409`. `reviewed_only` requires nonempty eligible `transaction_ids` (`422` otherwise). For `all_matching`, omitted ids mean the exact eligible set; supplied ids must equal that set (`409` on mismatch). Merchant scope never expands past the preview's category/evidence gate.

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
- `negative_asset_excluded_total`
- `cash_equivalent_total`
- `near_liquid_total`
- `illiquid_total`
- `loan_balance_total`
- `monthly_debt_payment_total`
- `asset_row_count`
- `loan_row_count`

Interpretation rule: this view provides calculation evidence. `asset_total` excludes negative asset rows so overdraft-like assets are not double-counted when a liability row also exists; the excluded amount remains visible in `negative_asset_excluded_total`. Final liquidity/health judgement belongs to the agent, using `/api/v1/analytics/liquidity-health` confidence and assumptions when available.

### `vw_loan_account_canonical`

Latest loan-account structure surface. It uses stable lender/product identity, includes unmapped loan snapshots, and exposes `loan_account_id`, `display_name`, `lender`, `product_name`, `loan_kind`, `is_hidden`, `snapshot_date`, `principal`, `balance`, `interest_rate`, `monthly_payment`, `monthly_payment_source`, `repayment_method`, `start_date`, `maturity_date`, and `estimated_monthly_interest`. The interest estimate is `round(balance * interest_rate / 100 / 12)` and is a simple evidence field, not an amortization schedule. `is_hidden=true` means the user excluded that stable account from default loan-account and loan-summary surfaces.

### `vw_income_monthly_by_category`

Monthly income composition surface sourced from non-deleted, non-merged income transactions. Columns are `period`, `effective_category_major`, `income_total`, and `transaction_count`. Category totals reconcile to `vw_monthly_cashflow.income_total` for the same month.

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
- Creation/category-rule normalization defaults variable expense necessity to `discretionary`; single/bulk PATCH preserve omitted necessity and honor an explicit null instead of silently refilling it.
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

### Import Parity Verification

Source: `app.services.source_verification`

- `verify_import_parity()` and `backend/scripts/verify_import_parity.py` import or inspect a prepared workbook and compare DB state against workbook evidence.
- Transaction parity samples raw imported rows and accepts the upload fallback match for one-minute timestamp drift.
- Snapshot parity compares parsed `3.재무현황`, `5.투자현황`, and `6.대출현황` rows against stored snapshot tables.
- Cashflow benchmark parity reads `2.현금흐름현황` as validation evidence only. It does not persist those values.
- Cashflow benchmark rows are compared by `period`, transaction type, and category. Mismatches are reported as warnings in `cashflow_benchmarks.mismatches`; they do not block upload success.

### Search

Source: `app.services.transactions_service._build_transaction_query`

- case-insensitive substring match
- fields searched:
  - `description`
  - `merchant`
  - `memo`
  - `payment_method`

### Transaction Import Reconciliation

Source: `app.services.upload_service`, `app.services.transaction_source_lifecycle_service`, `app.services.upload_preview_service`, `app.services.upload_apply_service`

- Import lifecycle의 영속 상태는 `source="import"` 거래에서 `active`, `missing_from_latest_export`, `source_changed`, `superseded`를 포함한다.
- `duplicate_candidate`, `ambiguous`는 `POST /api/v1/upload/preview`에서 도출되는 review-required 후보 상태이며, `apply` 단계에서는 반영하지 않는다. `possible_replacement`만 사용자가 명시 승인한 selection일 때 supersession으로 적용할 수 있다.
- Reconciliation은 2단계:
  - `POST /api/v1/upload/preview`: no-write plan generation
  - `POST /api/v1/upload/apply`: explicit confirmation으로 safe selection과 명시 승인된 `possible_replacement` supersession만 반영
- 각 transaction은 source lineage로 이어지는 식별자가 존재한다:
  - `source_row_hash`
  - `first_seen_import_id`, `last_seen_import_id`
  - `source_first_seen_at`, `source_last_seen_at`
  - `superseded_by_transaction_id`
- 비인증 `GET /api/v1/transactions`는 위 lineage 필드를 반환하지 않고 `source`만 공개한다.
- Change type model:
  - safe: `new`, `unchanged`, `source_fields_changed`, `time_shifted`, `missing_from_latest_export`
  - review-required: `possible_replacement`, `possible_duplicate`, `ambiguous`
- User-managed field 보존:
  - `category_*_user`, `memo`, merchant override(`merchant != description`), `is_deleted`, `merged_into_id`는 재적용 시 자동으로 보존됨.
- 호환성:
  - 기존 `POST /api/v1/upload`는 즉시 적용 방식 그대로 유지되며, 새 preview/apply 경로는 같은 원천 매칭을 더 안전하게 제어하기 위한 업그레이드 경로다.

### Snapshot Replace

Source: `app.services.upload_service.replace_snapshots`

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
- settlement handling:
  - confirmed settlements (`auto_confirmed`, `user_confirmed`) only are folded into netting economics before final rollup.
  - confirmed settlements are skipped if either participant leaves canonical analytics basis after delete/merge.
  - `review_required`, `rejected` settlement matches are excluded from confirmed-net math and keep raw signed semantics.
  - read path is calculation-only and does not create/update settlement match rows.
- `net_cashflow = income - expense`
- `savings_rate = net_cashflow / income`

### Category MoM

Source: `app.services.analytics_service.get_category_mom`

- loads rows in requested date window
- an explicit `end_date` selects the current period even if it has no rows; otherwise derives it from the latest observed month
- derives `previous_period = previous calendar month`
- compares those two months; partial explicit dates truncate the prior month to the same day-of-month and expose `same_day_previous_month` rather than `full_previous_month`
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
- missing cost kind goes to `unclassified_*`; missing usable necessity separately goes to `necessity_unclassified_*`. These axes can overlap, so their totals are not additive.
- Amounts use signed net expense, including refunds. Category auto-classification can fill classification values; only actual user changes to the cost/necessity tuple mark the row manual.

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
- groups observed monthly income totals; absent months are not synthesized as zero and complete collection is not inferred
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
- net signed expense by date, then compute gaps only between positive net-charge dates; same-day charge/refund is not a repeated charge
- classify interval:
  - `25-35` days -> `monthly`
  - `6-8` days -> `weekly`
  - else -> `irregular`
- confidence:
  - based on gap variance when more than one gap exists
  - defaults to `0.5` for single-gap cases, zero for no gaps
- `net_amount` includes refunds; `avg_amount = round(net_amount / max(net-charge-date count, 1))`
- `last_date` is the latest observed row and `last_charge_date` is the latest positive net-charge date
- active window is `min(recent_days, max(14, ceil((avg_gap if gaps else 30) * 1.5)))`
- status precedence is non-positive net, explicit non-recurring/installment, historical, irregular/insufficient charge dates, then active candidate. The activity filter applies before pagination and totals.
- paginated after in-memory sort; saved classification and active pattern evidence do not establish a subscription contract

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
- analytics settings are stored in `app_settings` with `scope + key` uniqueness; current live analytics scopes include `spending_anomalies`, `discretionary_velocity`, `purchase_gate`, `recurring_dry_run`, `asset_liability_health`, `bulk_operations`, and `financial_targets`
- upload file retention is live for `POST /api/v1/upload`: default `UPLOAD_DIR=/data/uploads`, keep latest 5 original files


## Selected investment sources and mixed-date net worth

The source-selection foundation adds an explicit current read surface alongside the existing BankSalad snapshot APIs. It does not fetch Toss Securities or alter historical `asset_snapshots` / `investments` to resemble a later API valuation.

### Two distinct value bases

- **BankSalad snapshot net worth**: nonnegative asset rows minus liabilities at one `snapshot_date`, following the existing negative-asset exclusion rule. Snapshot history and comparisons keep this basis.
- **Selected current estimate**: start with that BankSalad total, subtract each explicitly mapped account component once, then add the selected complete external account value with the same cash scope. Formally `confirmed_net_worth - sum(mapped_bank_account_components) + sum(selected_external_account_values)`.
- The estimate is unavailable when account/component mapping or cash scope does not establish an equivalent replacement. Unknown values must not be interpreted as zero. Investment detail can be available while the full net-worth estimate is unavailable.
- Source selection replaces accounts, not individual overlapping fields. A position absent from a complete newer account run is absent; a partial or failed run cannot establish that a holding was sold. A complete empty account is a valid zero, distinct from failure.

### Time semantics

A BankSalad `snapshot_date` is the date the snapshot represents, not the upload time. External `valuation_at` is the valuation basis; the observation/read and ingestion timestamps record when data was received. Late arrival must not make an older valuation supersede a newer valuation. `as_of_date` filters valuation dates under the current policy and mappings; later-ingested observations with an eligible valuation may be included. It does not reconstruct historical knowledge or historical policy. Later valuations are excluded.

A current estimate can legitimately contain several valuation dates. Its account metadata and `mixed_dates` must remain attached to the amount. An API refresh failure preserves the last successful complete account run and exposes failure/freshness rather than silently switching back to BankSalad. Before any usable complete mapped external run exists, the configured Toss source may transparently fall back to BankSalad.

**Cross-account transfer limitation:** if a bank snapshot predates a transfer into the broker while the broker valuation follows it, the bank snapshot can still contain money already included in the broker. Account replacement avoids counting the same broker twice; it does not reconcile this timing gap across other accounts. Therefore the mixed-date total is an estimate, not a same-date confirmed total, spendable cash, investment return, or a reliable historical delta. No historical values or cashflows are invented to bridge the gap.

### Identity and scope

The workbook's broker label is a fallback group identity, not evidence of a unique real securities account. Holdings use account/group plus instrument identity, so equal product names across brokers remain distinct. External replacement requires explicit account mapping. Cash-inclusive and holdings-only valuations are different scopes; keep the selected run's currency/FX basis and cash scope intact. General field overrides and the actual Toss adapter remain separate extensions.
