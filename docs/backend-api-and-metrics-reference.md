# Backend API And Metrics Reference

## T056 입력·이전 읽기 표면 제거 (2026-11-17, PR A)

이 절이 아래의 이전 분류 호환 설명보다 우선한다. [전체 경로별 결정과 뷰 변경 목록](agents/t056-classification-retirement.md)을 따른다. `cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`, `cost_classification_source`는 거래 응답·생성·단건/일괄 수정에서 제거되며 옛 입력과 필터는 422다. `/nature/transactions/{id}.legacy`와 할부 응답의 `recurring_payment_kind`도 제거된다. 변동비·재량·반복 아님을 기본 저장하지 않는다.

GET `analytics/fixed-cost-summary`, `analytics/fixed-cost-trend`, `analytics/recurring-payments` 및 category/recurring 자동 분류 규칙 CRUD·apply·dry-run은 404다. 후속은 `/read/monthly-flow`, `/read/spend-cube`, `/read/commitments`와 사람이 입력하는 `/nature/*`다. 같은 이름으로 근사값을 내지 않는다. 자동 분류 설정에는 대출 규칙만 남고, `settings/analytics`의 `recurring_dry_run`은 읽기 보관용이며 수정은 422다. 거래처 정규화와 대출 연결은 유지한다.

`20261117_0041`은 가역적인 뷰 전용 이행이다. 원시 거래의 이전 컬럼은 legacy/frozen 보관이며 아직 삭제하지 않는다. `/schema`는 이를 표시하고 폐기된 뷰 필드는 더 열거하지 않는다. 아래의 옛 필드·산식·입력 설명은 이행 배경 기록이며 현재 계약이 아니다. 가져오기 HTTP 계약과 새 축·흐름표·큐브·`/read/*` 금융 값은 유지한다. 배포하지 않았다.


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
- `GET /api/v1/metrics/monthly-flow`, `GET /api/v1/metrics/spend-cube`, `GET /api/v1/metrics/data-status`
- `GET /api/v1/metrics/comparison/monthly-flow`, `GET /api/v1/metrics/comparison/contributions` (T057)
- every `/api/v1/nature/*` route (T056: category defaults, recurring commitments, transaction adjustability and explanation; reads included)
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

#### `GET /api/v1/canonical-views/dashboard` — removed

Returns 404 since the owner-approved T060 removal (2026-11-17). See [the final migration/field map](agents/read-surface-migration.md).

#### Monthly Projection (`month_projection`)

Current home: **`GET /api/v1/read/month-projection` → `data`**. The former dashboard path is removed. Requires `X-API-Key`; optional ISO date `reference_date`; no other query parameters. `ReadMonthProjectionResponse` uses the shared `/read/*` envelope (401 auth first; unified 422 `detail` array for invalid/unknown parameters; 503 `query_failed`). `as_of` is overall effective data context, `data.as_of_date` is the forecast reference date; scope/classification refer to that month. Existing `get_monthly_projection` remains the single calculation. Values, including coverage, omissions, and reference-date semantics, are unchanged.

Read `data.completeness.full_projection_available`, `amount_scope`, and `left_out[]` before calling a numeric value a full projection. `status=ok` describes the read/classification scope, not forecast completeness.

Source: `app.services.monthly_projection_service`; model: `MonthlyProjection`. No GET persists expectations, classifications, links or derived forecasts.

| Field | Formula or meaning |
|---|---|
| `period`, `as_of_date`, `observed_through` | Reference month/date and latest valid observation at or before that date. |
| `as_of_basis` | T064 R11. `requested_date` when the caller passed `reference_date`; `transaction_as_of` when the dashboard defaulted to the transaction as-of date of `vw_metric_as_of` (plan 2.1 in-progress month; a later successful upload snapshot in the same month becomes the as-of date so R10 covers its quiet days, an upload in a later month never moves the month); `today_no_data` when there is no transaction. Before T064 R11 the default was today. |
| `remaining_period_start` | First day covered by the remaining-period assumptions: the day after the later of the last observed transaction and the latest successful upload snapshot, each counted only when it falls in the reference month and not after `as_of_date`. Null when the whole month is covered. Added in T064 R10; optional for existing consumers. |
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
| `income_sources[]` | Source key/merchant, expected/observed/remaining amount, `expected_day`, expected date/window, status/confidence, history/exclusions, matched transaction ids and reason. T064 R7 adds `cycle_anchor` (`calendar_month`, `month_end`, `month_start`) and `cycle_reassigned_transaction_ids` (deposits counted for the neighbouring pay cycle). History periods, observed amount and matched ids are per pay cycle. |
| `expense_components[]` | `kind`, nullable `expected_remaining`, `known_expected_remaining`, `basis`, `missing_reasons`, `confidence`, `warnings`, and recurring-only `sources`. Known portions can include low-confidence estimates; they are not confirmed bills. T064 round 2 adds: `link_unconfirmed_count`/`link_unconfirmed_amount` (loan, installment: this month's payments counted by a person-registered rule without a link), `not_in_expense_commitments[]` (loan: registered loans left out because the ledger shows no expense line for them; `name`, `loan_account_id`, `monthly_amount`, `checked_periods`, `reason_code` = `no_expense_line_in_recent_month` or `no_loan_account`, `reason`), `twelve_month_window` and `annual_items[]` (variable, R4). |
| `expense_components[].sources[]` | Recurring source key/merchant; nullable `expected_monthly_amount`, gross `observed_payment_amount`, gross `observed_refund_amount`, signed `observed_net_expense`, nullable `expected_remaining`, `additional_observed_amount`; confidence, `expected|observed|review` status, basis, history/excluded periods and warnings. Since T064 R6 one source is one registered recurring commitment (T056 `recurring_commitments`), with `commitment_id`, `cycle` and `end_date`. `merchant` is the commitment's merchant (merchant scope) or its label/category (category scope); a duplicated `source_key` gets `#<commitment_id>`. |
| `expense_components[].annual_items[]` | T064 R4. A variable-spend category active in only 1–2 of the 12 closed months before the reference month: `category`, `active_months_in_window`, `last_year_period`, `last_year_same_month_amount`, `observed_this_month`, `expected_remaining`, `basis`. |
| `expense_components[].twelve_month_window` | T064 R4. `start_period`/`end_period` (the 12 closed months before the reference month), `available`, `unavailable_reason` (`data_start`, `baseline_start_date`, `no_data`), `rule`. |
| `remaining_expense_adjustability` | T064 R12. `known_expected_remaining_expense` split by the adjustability of the lines each assumption was read from: `protected_amount`, `adjustable_amount`, `undecided_amount`, `total_amount` (= `known_expected_remaining_expense`), `undecided_share_pct` (null when total is 0), `basis`. Loan and installment schedules are protected; a recurring source uses its commitment's past payment lines; the variable median uses the same-remaining-day historical lines (annual items: last year's lines). Undecided is never guessed as protected or adjustable. |

Coverage and income model:

- Reads valid canonical transactions from the first day six months before `as_of_date` through that date. Each closed month qualifies with at least eight distinct observed dates, an observation in the first seven and last seven days, and no consecutive observed-date gap over ten days. The successful-upload date is provenance, not proof that every day/account was imported.
- Automatic sources are positive salary-category income grouped by normalized merchant. Bonus, insurance payout, refund, resale/settlement-like descriptions/categories are excluded from recurring expectations; all actual income still remains in `observed_income`. Explicit expectations can identify a non-salary source, subject to the same one-off exclusion. (T064 R8: the human-set regular/irregular income axis does not exist yet, so the salary-word candidate rule stays; the income expectations are the person-designated path. Nothing is suggested automatically.)
- Pay cycles (T064 R7): deposits are grouped by pay cycle instead of calendar month. When more than half of a payer's salary-sized deposits in the six months before the reference month land in the last five days of a month (and fewer in the first four), the payer is `month_end` anchored and a deposit on days 1–4 belongs to the previous month's cycle; the mirror case is `month_start` (a deposit in the last five days belongs to the next cycle). Stability, continuity, `expected_day` (day position inside the cycle, clipped to 1–31) and the month-end pattern are judged per cycle. The current cycle's observed amount can include a `month_start` payer's deposit dated in the previous month (its `expected_date_from` may then fall in that month); a `month_end` payer's deposit on days 1–4 of the reference month is last cycle's salary and still counts in `observed_income`. Rows are read from four days before the six-month window so a boundary deposit can join the first cycle; coverage is unchanged.
- A learned source needs at least three adequately covered positive income months, then at least three within ±30% of their median. Expected amount is the rounded median of accepted monthly totals. Small rows below 10% of the median monthly maximum are excluded as adjustments.
- `expected_day` is the median last receipt day, or `31` for a learned month-end pattern; it is null without an expectation. `expected_date` clips that day to the actual month length. When saving a detected source as an override, preserve `expected_day=31` rather than using a February date's day. Split-receipt ranges and a four-day tolerance accommodate timing shifts. A date spread over eight days without the month-end pattern is uncertain.
- User amount/day overrides supersede learning; `stopped=true` gives zero remaining. Missing recent receipts can mark an unobserved source stopped. Recent amounts outside the regular range or discontinuous history can instead make it uncertain and suppress remaining income. `expected`, `received`, `partial`, `late`, `stopped`, and `uncertain` remain distinct states.
- Possible payer rename (T064 R9): when a salary-category deposit arrives this month from a payer with no earlier deposit in the window and no user expectation, and its total is at least 10% of an existing source's expected amount while that source has received nothing this month (`expected` or `late`), the existing source becomes `uncertain`/`low` with zero remainder and a review reason, and `missing_reasons` gains the payer-rename reason. Neither amount is added twice. This is income-side review: it lowers confidence but does not null the month-end value. Registering the new payer as a user expectation marks it as a separate income.
- Actual receipts at least 10% of expected amount are matched. A partial total below the full expectation retains its difference when historical split-receipt count is not met or a user expectation exists. Otherwise at least 80% received prevents adding an expected duplicate. An unusually large/out-of-window receipt can be uncertain with zero remainder. Late status requires transaction observation beyond the expected window, not wall-clock time alone.

Expense model (T064 round 2):

0. Partition (R6). Expense rows are read from `vw_metric_flow_lines` (12 months before the reference month through `as_of_date`; monthly assumptions still learn from the six-month window). Every line goes to exactly one component, in this order: `commitment_kind=loan` (loan link) → loan; `commitment_kind=installment` → installment; an unlinked line equal to a person-registered loan merchant rule (`loan_merchant_rules`, merchant or description) → loan (R1); an unlinked line matching an active installment plan exactly (exact amount, shared normalized merchant, payment method, ±7 days of the nearest valid scheduled date, including month-boundary posting) → installment (R2); `commitment_kind=recurring` (T056 recurring commitment) → recurring, grouped by `recurring_commitment_id`; an unlinked line a person marked as installment (`mapping_note=installment_link_unconfirmed`) → installment; everything else → variable. The legacy `cost_kind`/`recurring_payment_kind` columns are no longer read directly; they reach the forecast only through the T056 write-through. Nothing is linked or classified by the forecast.
1. Loan (R1). For each latest-snapshot loan with a balance, the loan is added only when its loan account has an expense line (linked or rule-matched) in the latest adequately covered closed month or in the reference month. Otherwise it is listed in `not_in_expense_commitments` with a loan-component warning and adds nothing (the repayment may be booked as a transfer, paid from an account outside the ledger, or unlinked and therefore already in the variable baseline). An added loan contributes `max(round(monthly_payment) - this month's linked or rule-matched repayments, 0)`; rule-matched repayments are counted in `link_unconfirmed_*` with a warning. A missing monthly payment on an added loan makes the component incomplete. An unlinked, non-rule expense this month whose category contains `대출` withholds the loan component only when at least one loan is added (it could be that loan's repayment). No repayment day is inferred.
2. Installment (R2, R3). Active current-month schedules subtract linked actuals, or a unique unlinked plan-rule match this month (counted in `link_unconfirmed_*`, plan-name-prefixed warning). A plan's current occurrence is any payment linked to that plan and dated in the reference month, whatever installment number the link carries (R3); a different number adds a warning instead of adding the scheduled amount again. Without such a payment, the link of the computed number elsewhere in the six-month window still counts. Plan-rule matches and person-marked installment rows never enter the variable baseline; a person-marked row this month without a link withholds the component. Ambiguity or loan overlap remains unknown. A past unlinked due amount is excluded from future obligations and reported for review.
3. Recurring (R6, R5, R4). One source per registered commitment, from its flow lines. Gross outgoing payments drive learning; current gross payments are subtracted; refunds reduce actual net expense but never restore an observed obligation. Stable evidence needs at least three covered months within the ±30% median band and the immediately previous calendar month among them. A weak source with current observations is kept (low confidence) only when the commitment's `cycle` is `monthly`. If only a current gross payment exists, that cycle is observed and nothing further is added (review warning). Refund-only sources remain unknown. If the previous month has inadequate overall coverage, an older stable pattern ending in the latest adequately covered month is retained with low confidence. A commitment with no source (stopped, unstable without a monthly cycle) is simply not assumed: its lines never move into the variable baseline (R5). A commitment `end_date` caps the remaining days; a commitment ended before the reference month without a current payment yields no source. A `cycle=yearly` commitment is assumed only in the month it was paid last year (12 months earlier), with that month's payment total as the baseline and the same remaining-day rule.
   - Remaining amount is `min(max(monthly_baseline - current_gross_payments, 0), median(historical_gross_payments_after_covered_day_and_up_to_end_date))`. Historical days are clipped to the reference month's final day.
   - Current gross payments above the baseline are `additional_observed_amount`. Refunds, excess payments and weak histories carry review warnings. When the uncapped historical tail is zero and current gross payments are below 70% of the baseline, a missing/changed payment warning lowers confidence without inventing a future charge.
4. Variable (R4). The median historical signed expense of variable lines for days after the current month's covered day (`remaining_period_start`), over at least three adequately covered months, floored at zero. When the 12-month window (the 12 closed months before the reference month) is available — every month has data, it starts on or after the first full data month and on or after the comparison baseline start date — a category (`effective_category_major`, `미분류` when empty) with spending in only 1–2 of those months is annual-like: its lines leave the six-month median, and last year's same-month spending after the covered day is added unless the category already has spending this month (`annual_items`). The median itself is unchanged (R13 not applied).

Each flow line belongs to one model partition. Known portions survive a component's missing reason. Full expense/month-end projections are null if any component is unknown, there is no observed transaction, or the latest observation is more than seven days before reference. Confidence is unavailable when the full expense is unknown, otherwise low when reasons or component warnings remain and medium when none remain. Warning-only recurring sources, installment number mismatches, link-unconfirmed rule matches and loans left out as not in expense do not create missing-input reasons or null totals. The returned scenario does not guarantee future employment, contracts, new spending or available bank cash.

At a covered month end the remaining interval is empty. Remaining income and all four remaining expense components then contribute zero. A fresh observed month closes at its observed totals. Late or partial receipts and unobserved payments retain their evidence in the source statuses and warnings. A snapshot date alone cannot override the seven-day transaction freshness check. For a finite recurring commitment, the full history of distinct outgoing payments through the reference day determines exhaustion. Posted refunds still reduce net spending. Registered loan rules use the same merchant-before-description precedence in the forecast and in the write path.

Accuracy and backtest actuals require closed months starting on or after the first complete month, with adequate transaction coverage under the projection activity rule (at least eight observed dates, observations in the first and last seven days, no gap longer than ten days). A requested reference date limits the evidence available to the accuracy calculation.

#### `GET /api/v1/canonical-views/month-projection/accuracy`

- T064 R12. Requires `X-API-Key`; read-only (no writes, no cache). Optional `reference_date`; without it the same default as the focused forecast (transaction as-of date, R11).
- Replays `get_monthly_projection` at days 5, 10, 15, 20, 25 of up to three closed months before the reference month (months before the first transaction month are skipped) and compares the month-end net forecast with that month's `residual` from `vw_metric_flow_lines`.
- Response `ProjectionAccuracy`: `definition`, `reference_period`, `evaluated_periods`, `as_of_days`, `current_band` (band of the reference day), `bands[]` (`band` = `day_01_10` | `day_11_20` | `day_21_31`, `as_of_days`, `points`, `withheld_points`, `evaluated_points`, `net_median_signed_error`, `net_median_absolute_error` (won), `net_median_signed_error_pct_of_income`, `expense_median_signed_error`), `limitations`. Signed error = forecast − actual (positive = over-forecast). Withheld points are counted, not given an error.
- Same replay limits as `app.tools.forecast_backtest`: classifications, links, plan status and income expectations are current values; every transaction dated on or before an as-of day is assumed known then.
- Kept out of the focused projection response because it runs the forecast 15 times (on the synthetic test ledger about 15× one forecast).

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
  - `flow_row` (T059, optional): a `vw_metric_flow_lines.flow_row` value
  - `payment_form: "committed" | "ad_hoc" | "not_applicable"` (T059, optional)
  - `adjustability: "protected" | "adjustable" | "undecided" | "not_applicable"` (T059, optional)
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
  - T059 line filters add `EXISTS (SELECT 1 FROM vw_metric_flow_lines l WHERE l.transaction_id = t.id AND …)` with every given value on the same line. `l.transaction_id` is the posting row, so an allocated refund part (which carries the original purchase's category, merchant and axes) lists the refund row under the purchase's flow row. Rows without lines (deleted, merged, superseded, non-KRW) never match.
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
    - `suggested_loan_account_id: int | null`, `suggestion_basis: "rule" | "history" | null` — 미연결 행에만 제공
- Behavior:
  - only returns visible `type="지출"` loan repayment candidates
  - excludes deleted and merged transactions
  - candidate scope is intentionally broad for manual mapping: already linked rows, `금융` major-category expense rows, or rows whose category/description/merchant/payment method contains loan repayment terms such as `대출`, `상환`, `이자`, `원리금`, `원금·이자`
  - 사람이 등록한 `LoanMerchantRule`과 정확히 일치하는 행도 후보에 포함한다. 거래처 규칙이 원문 규칙보다 우선하며 업로드 적용 설정이 꺼져 있어도 제안은 제공한다. GET은 연결을 생성하지 않고 이미 연결된 행에는 제안을 반환하지 않는다.
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
  - 금액 허용 오차는 월 납부액의 ±10%(최소 10,000), 날짜는 예정일 ±7일이다. 날짜·거래처 정규화·월경계 처리는 전망과 같은 읽기 전용 predicate를 쓴다. 달 차이로 계산한 회차와 앞뒤 회차 중 1..총 횟수 내 가장 가까운 예정일을 고른다. 첫/마지막 예정일의 월경계 이동도 허용한다.
  - 기존 전망 숫자 보존을 위해 날짜 창은 전망의 ±7일을 유지하고 제안을 확장한다. ±4~7일 제안은 최대 medium(점수 89)이며 high 일괄 수락 대상이 아니다. 전망은 정확한 금액만 허용하는 부분집합이다. 거래처는 소문자·연속 공백 정규화를 공유한다.
  - KRW and a configured plan payment method must match. Normalized merchant matching is preferred; confirmed alias continuity can propose an alternate merchant only with exact amount/payment evidence, at most medium confidence. A similar amount alone is insufficient.
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

#### `GET /api/v1/installments/forecast` — removed

Returns 404 since the owner-approved T060 removal (2026-11-17). See [the final migration/field map](agents/read-surface-migration.md).

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
- Status: legacy for 비상금 개월 수 since T061 (unchanged). The 재무상태 value with the explicit formula "현금성 자산 ÷ 월 보호 지급" and the 미정 share is `GET /api/v1/metrics/net-worth/emergency-fund` ([T061](#net-worth-reconciliation-t061)).
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
  - required spend uses that snapshot's latest closed calendar month (the same month if the snapshot is month-end): `max(0, required_spend_essential_total + required_spend_additional_debt_total)`. "Essential" is the resolved T056 adjustability `protected` on `vw_metric_flow_lines` (not the old `spend_necessity` column); expenses use signed `-amount`. Linked debt expense is added only if it is not already protected; because loan-linked lines are always `protected` in `vw_transaction_nature`, every linked repayment is in `required_spend_essential_total` and `required_spend_additional_debt_total` is 0 since T056 (the sum is unchanged). `undecided` spend is not assumed to be required. Monthly estimated debt payment is not added again.
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

#### `GET /api/v1/analytics/category-mom` — removed

Returns 404 since the owner-approved T060 removal (2026-11-17). See [the final migration/field map](agents/read-surface-migration.md).

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
  - if `end_date` is omitted, the last closed ledger month supplies the reference date; when none exists the date is null and the item list is empty. The coefficient uses the unrounded population standard deviation and mean.
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

#### `GET /api/v1/analytics/spending-anomalies` — removed

Returns 404 since the owner-approved T060 removal (2026-11-17). See [the final migration/field map](agents/read-surface-migration.md).

#### `GET /api/v1/analytics/discretionary-velocity` — removed

Returns 404 since the owner-approved T060 removal (2026-11-17). See [the final migration/field map](agents/read-surface-migration.md).

#### `GET /api/v1/analytics/purchase-gate-candidates` — removed

Returns 404 since the owner-approved T060 removal (2026-11-17). See [the final migration/field map](agents/read-surface-migration.md).

#### `GET /api/v1/analytics/spending-review-candidates` — removed

Returns 404 since the owner-approved T060 removal (2026-11-17). See [the final migration/field map](agents/read-surface-migration.md).

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
  - sections: `spending_anomalies`, `discretionary_velocity`, `purchase_gate`, `recurring_dry_run`, `asset_liability_health`, `bulk_operations`, `financial_targets`, `comparison`
  - `comparison.baseline_start_date` (T057): nullable ISO date, default `null`. Stored as one `app_settings` row (`scope=analytics.comparison`, `key=baseline_start_date`); no schema change. See [Comparison Contract](#comparison-contract-t057).
  - `spending_anomalies.baseline_months` default is `6` since T057 (was `3`).
  - `comparison_guide`: `title`, `summary`, `options[]` with `key`, Korean `label`, `description`, `editable`, and `value_label` (the effective value in Korean). Keys: `baseline_start_date` (editable), `baseline_method`, `partial_month_handling`, `no_data_months`, `annual_window`, `ordering` (fixed rules, shown for explanation).
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
- Purpose: 사람이 등록한 대출 규칙의 업로드 적용 설정을 읽는다.
- Response fields:
  - `apply_loan_rules_on_upload` (기본값 `true`)
- T065 이행에서 기존 저장 행도 `true`로 전환한다. 이후 사용자가 PATCH로 끌 수 있다. `/upload`, `/upload/apply`와 reviewed apply에서 전체 유효 지출 원장에 적용한다. 선택 외 기존 행도 재검사하며 추론 이력은 자동 연결하지 않는다.
- 현재 두 apply 경로에서는 거래·규칙 연결·대출 추정·되돌리기 지점을 같은 트랜잭션으로 반영한다. rollback snapshot은 `loan_transaction_links`를 포함하며, 반영 후 변경 감지도 해당 표를 검사한다. 수동 연결(`source=manual`)은 보존한다.
- reviewed apply는 규칙 적용에 따른 대출 추정 변화도 승인 미리보기에 투영하며 승인 후 규칙/설정 변경은 재검토가 필요하다.

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

Since migration `20261115_0035` this view reads `vw_metric_flow_lines` (`type='지출'`, signed `SUM(amount)`, so spend is negative and refunds positive). Analytics endpoints no longer compute category spend in Python; they aggregate `vw_metric_flow_lines` in SQL.

Documented columns:

- `period`
- `category_major`
- `category_minor`
- `amount`

### `vw_fixed_cost_monthly_summary`

Canonical monthly aggregate for fixed-cost analysis. It is intended for readonly SQL and AI drill-down use cases where the caller needs the same month-level structure shown in the spending page.
Loan-linked repayments are excluded from ordinary fixed/variable totals, so this view's `expense_total` equals `vw_monthly_flow_summary.living_spend`, while `/analytics/fixed-cost-summary.expense_total` includes loans and equals `total_outflow`. The two legacy names differ in scope; prefer the T054 names.

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

These views are live DB read surfaces created by Alembic and registered in `CANONICAL_VIEWS` for schema documentation. The legacy dashboard GET is removed; current metric/read surfaces expose their own definitions (the legacy SQL views remain); arbitrary SQL access remains limited to readonly DB users.

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
- Legacy imports hold the ledger transaction lock until the outcome is committed or rolled back. Savepoints isolate failing stages. The 60-second candidate window includes time drift at the file edges; missing-row detection uses the original bounds.
- Transaction parity samples raw imported rows and accepts the upload fallback match for one-minute timestamp drift.
- Snapshot parity compares parsed `3.재무현황`, `5.투자현황`, and `6.대출현황` rows against stored snapshot tables.
- Cashflow benchmark parity reads `2.현금흐름현황` as validation evidence only. It does not persist those values.
- Cashflow benchmarks use the posting month, transaction type, raw source category and effective imported KRW rows. Refunds offset charges in their posting month. Both import CLIs require `--snapshot-date` and return nonzero after partial or failed imports. The parity CLI reuses the opened workbook, reports differences in `cashflow_benchmarks.mismatches`, and exits nonzero when parity fails. Its report keeps the recorded import outcome.

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

Source: `app.services.analytics_service.get_monthly_cashflow` (SQL over `vw_metric_flow_lines` with the shared `flow_summary_columns`)

- groups by posting month `YYYY-MM`
- `income = income_total`, `expense = total_outflow` (loans included, refunds netted in their posting month), `transfer = transfer_activity_total` (`SUM(ABS(amount))` of `이체`)
- settlement links never move amounts between months (T055); see [Metric Contract](#metric-contract-t054t055)
- `net_cashflow = residual = income - expense`
- `savings_rate = net_cashflow / income` for closed months; `null` for the in-progress month since T057 (it was computed for every month before). The plan's 현금 잔여율 is `residual_rate`, closed months only, on `/metrics/monthly-flow`
- items add `month_status`; the response adds `contract`

### Category MoM

Source: `app.services.analytics_service.get_category_mom`

- loads rows in requested date window
- an explicit `end_date` selects the current period even if it has no rows; otherwise derives it from the latest observed month
- T057: an explicit `end_date` later than the transaction as-of date in the same month is clamped to the as-of date; without `end_date`, an in-progress latest month is cut at the as-of date. An in-progress month is therefore always partial and never compared with the full previous month
- derives `previous_period = previous calendar month`
- compares those two months; partial dates truncate the prior month to the same day-of-month and expose `same_day_previous_month` rather than `full_previous_month`
- T057 additive fields: per item `baseline_amount` (median of the comparison-contract baseline months for that category, same amount normalization and type filter, ignoring `start_date`) and `baseline_change_amount = current_amount − baseline_amount`; response `comparison` (the contract basis). `previous_*`/`delta_*` keep their previous-month meaning
- amount sign is normalized in SQL (`_analytics_amount`)
  - income positive
  - expense positive via `-amount`
  - transfer positive via `abs(amount)`
- categories come from `vw_metric_flow_lines`; a confirmed refund allocation counts under the original purchase's category in the refund's posting month

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
- loan-linked rows are included (by their `cost_kind`), so `expense_total` equals `total_outflow`; `*_count` fields count distinct transactions with an amount in the bucket
- Amounts use signed net expense, including refunds. Category auto-classification can fill classification values; only actual user changes to the cost/necessity tuple mark the row manual.

### Merchant Spend

Source: `app.services.analytics_service.get_merchant_spend`

- groups by `merchant` with fallback `"미분류"` (SQL over `vw_metric_flow_lines`)
- stores:
  - total normalized amount
  - count = distinct transactions (a linked refund counts under the original purchase's merchant)
  - average amount = amount / count
  - latest observed datetime (refund lines included)
- sorted by descending amount

### Payment Method Patterns

Source: `app.services.analytics_service.get_payment_method_patterns`

- groups by `payment_method` with fallback `"알 수 없음"` (SQL over `vw_metric_flow_lines`)
- stores:
  - total normalized amount
  - count = distinct transactions
  - average amount
  - percent of total (total computed in SQL over the same scope)

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
- reference period (T057: resolved by the comparison contract):
  - last closed month by default, judged from the transaction as-of date (previously from today's date)
  - or the month of the supplied `end_date`, counted through `min(end_date, transaction as-of date)`
  - a target month after the as-of month, or with no data, yields no items and `comparison=null` (target after as-of) / `target_coverage=no_data`
- baseline months (T057): the most recent `baseline_months` (default `6`) closed months before the target that have data; no-data months are skipped instead of counted as 0; months before the comparison baseline start date are excluded
- if partial target (in-progress or explicit mid-month end date):
  - baseline months are cut off at same day-of-month
- groups by `(period, effective_category_major)` in SQL over `vw_metric_flow_lines`
- for each category:
  - `target_amount`
  - `baseline_avg` — name kept; since T057 the value is the median of the baseline months (rounded to won), not the mean
  - `delta`
  - `delta_pct`
  - `anomaly_score`
- anomaly score (formula unchanged; stdev is the population stdev of the baseline month amounts around their mean):
  - `abs_delta / stdev` when baseline stdev exists
  - otherwise `abs_delta / baseline_avg`
  - otherwise `0`
- final filters:
  - `abs(delta) >= min_delta_amount`
  - `anomaly_score >= anomaly_threshold`

## Metric Contract (T054/T055)

Plan reference: `Implentation-plan.md` sections 2.1, 2.3 and 2.7. Definitions: `backend/app/services/metric_views.py`; PostgreSQL views: migration `20261115_0035_metric_contract_views.py`, recreated on the two axes by `20261115_0038_nature_axes_metric_views.py` (T056; downgrade restores 0035 exactly).

### View chain

| View | Grain | Notes |
|---|---|---|
| `vw_metric_refund_allocations` | settlement match | confirmed (`auto_confirmed`, `user_confirmed`), `matched_amount > 0`, purchase `지출 < 0` and refund `지출 > 0`, both effective and KRW |
| `vw_metric_transactions` | effective transaction (all currencies) | not deleted/merged/superseded; effective category; loan and installment links; `settlement_refund_total` (received by a purchase), `settlement_allocated_total` (given by a refund), `purchase_net_amount` |
| `vw_transaction_nature` | effective transaction (all currencies) | T056 two axes: `payment_form`, `commitment_kind`, `recurring_commitment_id`, `commitment_match`, `adjustability`, `adjustability_source`, the value at each level (`transaction_adjustability`, `commitment_adjustability`, `category_default_adjustability`), `excluded_from_commitments`, `installment_link_unconfirmed`, `necessity_conflict` |
| `vw_metric_flow_lines` | line (KRW only) | one `transaction` line per row; a refund with confirmed allocations becomes one `refund_allocation` line per allocation (original's classification) plus a `refund_remainder` line for the unallocated part (own classification, omitted when zero). Lines of one transaction always sum to its amount |
| `vw_monthly_flow` | period × flow row | `amount` (row direction), `signed_amount`, `transaction_count` |
| `vw_monthly_flow_summary` | period | totals below plus `month_status` |
| `vw_spend_cube` | period × category major/minor × merchant × payment form × commitment kind × adjustability × flow row | `amount` (net spend), `charge_total`, `refund_total`, `transaction_count` |
| `vw_metric_as_of` | single row | `transaction_as_of`, `first_transaction_date`, `last_closed_period`, `in_progress_period`, per-kind snapshot as-of dates, `non_krw_transaction_count` |
| `vw_metric_excluded_currency` | period × currency × type | non-KRW effective rows excluded from every total |

### Payment form and adjustability (from T056)

Each line takes the axes of `vw_transaction_nature` for its `attributed_transaction_id` (the original purchase for an allocated refund part). For `지출` lines:

| `commitment_kind` | `payment_form` | flow row |
|---|---|---|
| `loan` (loan link) | `committed` | `committed_loan` |
| `installment` (installment plan link) | `committed` | `committed_installment` |
| `recurring` (member of a `recurring_commitments` bundle) | `committed` | `committed_recurring` |
| — | `ad_hoc` | `ad_hoc_protected` / `ad_hoc_adjustable` / `undecided` by adjustability |

Adjustability precedence and the migration mapping are in [Two-Axis Nature (T056)](#two-axis-nature-t056). Income and transfers are `not_applicable` and never count as 미정. `mapping_note` is `installment_link_unconfirmed` (legacy installment kind without a plan link) or `necessity_conflict` (only while adjustability is `undecided`). The T054 mapping from the old columns (with `payment_form='undetermined'`) is retired; it is preserved in migration 0035.

Income lands in `income_undetermined` (no column supports the 정기/비정기/이자·소액 split yet); transfers in `transfer_undetermined` (투자·저축 vs other movements is T061). Any other `type` lands in `other_type`.

### Totals (`vw_monthly_flow_summary`, `flow_summary_columns`)

- `income_total = Σ amount` (`수입`)
- `committed_{loan,installment,recurring}_total`, `committed_total`, `ad_hoc_{protected,adjustable}_total`, `undecided_total = Σ −amount` of `지출` lines in that row/section
- `total_outflow` (총지급) `= Σ −amount` of all `지출` lines `= committed_total + ad_hoc_protected_total + ad_hoc_adjustable_total + undecided_total`
- `living_spend` (생활 지출) `= total_outflow − committed_loan_total`
- `adjustable_spend`, `protected_spend`, `adjustability_undecided_total` split `total_outflow` by adjustability (they sum to it)
- `residual` (잔여) `= income_total − total_outflow`; `residual_rate` (현금 잔여율) `= residual / income_total`, closed months with positive income only (API)
- `transfer_net = Σ amount` (`이체`, signed); `transfer_activity_total = Σ |amount|`
- `refund_total = Σ amount` of positive `지출` lines; `signed_total = Σ amount` of all lines `= income_total − total_outflow + transfer_net + other_type_total`
- `adjustability_undecided_share = adjustability_undecided_total / total_outflow` (null when `total_outflow ≤ 0`)

Invariant tests: `tests/services/test_metric_flow_invariants.py` (SQLite) and `tests/services/test_metric_views_postgresql.py` (migration-created PostgreSQL views).

### Refund attribution rule (month boundary)

- A refund stays in the month of its own posting date. It reduces spend there.
- Its classification (category, merchant, payment method, payment form, adjustability) is the original purchase's for the part a confirmed match allocates, and its own for the unallocated remainder. This is how 2.3's "환불은 원래 카테고리에서 차감" is applied without moving money across months.
- Consequences: a closed month never changes when a later refund is linked; per-month signed totals equal the raw signed sum of effective KRW transactions; a refund posted in a month with little other spend can make that month's net spend negative.
- Purchase-level economics (`purchase_net.v1`, used only by the recurring/velocity/review detectors) net allocations into the purchase regardless of date. It is a separate, named basis, not a cashflow actual.

### As-of dates and month status

- `transaction_as_of = MAX(date)` over `vw_metric_transactions` (basis `max_effective_transaction_date`).
- `last_closed_period` is the month of `transaction_as_of` when it is the month's last day, otherwise the previous month. Months up to it are `closed`; the month of `transaction_as_of` after it is `in_progress`.
- Snapshot as-of dates are `MAX(snapshot_date)` per table (`asset_snapshots`, `loans`, `investments`, `insurance_contracts`, `user_profile_snapshots`), reported separately.

### Exclusions

- Deleted, merged, and superseded rows (T055/F01): an approved replacement counts once.
- Non-KRW rows (T055/F04): excluded from every total and reported separately. The parser's integer `amount` still truncates fractional foreign amounts at import; that import-contract behavior is unchanged here.

## Two-Axis Nature (T056)

Plan reference: `Implentation-plan.md` section 2.2 and task `T056`. Code: `backend/app/models/nature_axes.py`, `backend/app/services/nature_axes_mapping.py` (mapping), `backend/app/services/nature_axes_service.py` (API, write-through, re-import), `backend/app/services/metric_views.py` (`vw_transaction_nature`). Migrations: `20261115_0036` (tables), `20261115_0037` (backfill), `20261115_0038` (views, work queue).

### Tables

| Table | Grain | Meaning |
|---|---|---|
| `recurring_commitments` | bundle | 정기 지급 묶음: `match_scope` (`merchant`/`category`), `merchant_match` (`exact`/`prefix`, 기본 exact), `merchant`, `category_major`, `category_minor`, `cycle` (`monthly`/`yearly`/`n_times`/null), `total_count`, `amount_kind` (`fixed`/`variable`/null), `adjustability` (null = 미정), `start_date`, `end_date`, `origin` (`migration`/`user`/`legacy_edit`), `label`, `memo` |
| `category_adjustability_defaults` | category key | `adjustability` default; `category_minor=null` covers the whole major |
| `transaction_nature_overrides` | transaction | `adjustability` (transaction level), `commitment_id` (explicit membership), `excluded_from_commitments`, `installment_link_unconfirmed`, `necessity_conflict`, `source` |

### Resolution (`vw_transaction_nature`)

- Membership: no membership for non-`지출`, loan/installment-linked or excluded rows; else explicit `commitment_id`, else the first bundle whose rule matches — same effective category (`category_major` equal, `category_minor IS NOT DISTINCT FROM`), merchant 범위에서는 `merchant_match=exact` 동등 비교 또는 `prefix` 정규화 접두 비교, `start_date <= date <= end_date` (열린 끝 허용). T066 이후 우선순위는 merchant exact → 긴 merchant prefix → category → id다.
- Adjustability: `not_applicable` for non-`지출`; `protected` while a loan or installment link exists; else `COALESCE(transaction, commitment, category default, 'undecided')`. Category default = exact `(major, minor)` row, else the `(major, NULL)` row. `adjustability_source` names the level that supplied the value.
- `GET /api/v1/nature/transactions/{id}` returns the same values (tested equal to the view) plus the legacy columns.

### Mapping of the existing human classification (user decision 2026-11-15)

essential → `protected`, discretionary → `adjustable`, empty → `undecided`. For `cost_kind='fixed'` the necessity is `fixed_cost_necessity` first, then `spend_necessity`; when both are set and disagree the row stays `undecided` and is flagged `necessity_conflict`. Other rows read `spend_necessity`. Evaluated in this order:

| `mapping_row` (report) | Existing | New |
|---|---|---|
| `loan_linked` | loan link | committed (loan) · protected |
| `installment_linked` | installment plan link | committed (installment) · protected |
| `installment_kind_unlinked` | `recurring_payment_kind='installment'`, no plan link | ad hoc, `installment_link_unconfirmed` (연결 미확인) · necessity |
| `fixed_not_recurring` | `cost_kind='fixed'` + `not_recurring` | ad hoc · necessity |
| `fixed_essential` / `fixed_discretionary` / `fixed_necessity_empty` / `fixed_necessity_conflict` | `cost_kind='fixed'` (+ monthly or empty kind) | committed (recurring) · protected / adjustable / undecided / undecided |
| `variable_monthly_recurring` | `cost_kind='variable'` + `monthly_recurring` (variable-amount recurring payment) | committed (recurring) · necessity |
| `variable_essential` / `variable_discretionary` / `variable_necessity_empty` | `cost_kind='variable'` | ad hoc · protected / adjustable / undecided |
| `monthly_recurring_no_cost_kind` | `monthly_recurring`, no `cost_kind` | committed (recurring) · necessity (undecided when empty) |
| `no_cost_kind_with_necessity` | no `cost_kind`, necessity set | ad hoc · necessity (same as the T054 view) |
| `unclassified` | nothing set | ad hoc · undecided |

Backfill (`20261115_0037`): scope = non-merged, non-superseded `지출` rows, deleted rows included (they can be restored). Committed (recurring) rows are grouped by `merchant` + effective category into one `origin='migration'`, `match_scope='merchant'` bundle per group: `start_date` = earliest member, no end; `cycle='monthly'` only when every member was `monthly_recurring`, else null; `amount_kind` = the members' common `cost_kind` (`fixed`/`variable`), else null; `adjustability` = the members' common mapped value, else null. A member whose value equals the bundle's stores no transaction-level value (bundle edits then apply to it); other members and every ad hoc row with a decided necessity store a transaction-level value. Ad hoc rows whose key has a bundle are excluded from it. Category defaults are not created (existing category rules keep working through the write-through). Re-running creates nothing new (bundles matched by key among `origin='migration'`; `ON CONFLICT DO NOTHING`). Downgrade deletes `origin='migration'` bundles and `source='migration'` rows only; the old columns are never written.

### Old columns and the write-through rule

The old columns stay, keep every existing endpoint field and filter, and still feed the legacy aggregate views and legacy analytics breakdowns (`fixed_total`, `essential_*`, `vw_recurring_merchant_monthly` …). The current frontend classifies through `PATCH /transactions/{id}`, `PATCH /transactions/bulk-update`, category/recurring rule apply and recurring dry-run approval (`frontend/src/features/data/InboxPage.tsx`, `TransactionsPage.tsx`, `RulesPage.tsx`, `frontend/src/api/transactions.ts`). Making the new tables authoritative without a bridge would silently stop those edits from reaching the metric views, so every old-column write is written through (`write_through_legacy_classification`) with the mapping above:

- transaction-level adjustability := mapped necessity (null when empty, so the commitment or category default applies);
- committed (recurring): keep a valid explicit membership; else the matching bundle (rule); else the newest bundle with exactly that merchant/category key (explicit membership); else register a new bundle for the key (`origin='legacy_edit'`, `start_date` = the transaction date, `cycle='monthly'` for `monthly_recurring`, `amount_kind` from `cost_kind`, adjustability null);
- ad hoc with a payment-form signal (`cost_kind` or `recurring_payment_kind` set): excluded from a matching bundle; a necessity-only edit keeps the current membership;
- flags `installment_link_unconfirmed` and `necessity_conflict` follow the mapping.

Writes through the new API never touch the old columns; the two can diverge and the new tables win.

### Readers of the old columns (consistency follow-up)

Readers whose decision has an exact counterpart in the mapping read the resolved axes, not the old columns, so a classification made only through the new API reaches them. Correspondence used: discretionary ↔ `adjustable`, essential ↔ `protected`, empty ↔ `undecided`, fixed cost ↔ committed (recurring bundle). On data where the old columns and the new axes agree (for example right after the backfill) the response bodies are byte-identical to the old ones; only the `/read/review-items` assumption sentence about the detector changed.

| Reader | Endpoint(s) | Old decision | Now |
|---|---|---|---|
| Removed `get_discretionary_velocity` (historical) | `/analytics/discretionary-velocity` | 재량 = `spend_necessity='discretionary'`, 분류됨 = essential/discretionary | `vw_transaction_nature.adjustability` = `adjustable` / `protected`+`adjustable` |
| `_is_purchase_gate_base_row` | `/analytics/purchase-gate-candidates`, `/analytics/spending-review-candidates`, `/read/review-items` | no loan link, `cost_kind<>'fixed'`, `spend_necessity='discretionary'` | no loan link, `commitment_kind is null` (ad hoc), adjustability `adjustable` |
| `_derive_liquidity_health_defaults` | `/analytics/liquidity-health` (derived required spend) | essential = `spend_necessity='essential'`; loan lines not essential added as debt | `vw_metric_flow_lines.adjustability='protected'`; loan lines not protected (none since loan lines are fixed `protected`) |

Where the two disagree the new axes decide, for example: a loan- or installment-linked row is `protected` whatever its old necessity; `cost_kind='variable'` + `monthly_recurring` (or `monthly_recurring` without `cost_kind`) is a committed recurring payment and is not a review candidate; `cost_kind='fixed'` + `not_recurring` is ad hoc and can be one.

Left on the old columns (no exact counterpart, or a database view that would need a migration): `/analytics/fixed-cost-summary` and `/analytics/fixed-cost-trend` (fixed/variable/unclassified `cost_kind` split and `fixed_cost_necessity` vs `spend_necessity` buckets; the new payment form has no "unclassified" state); `/analytics/recurring-payments` (per-merchant counts of `recurring_payment_kind` values, including `not_recurring`/unclassified, and the `activity_status` rule that reads them); the PostgreSQL legacy views `vw_monthly_cashflow` (fixed/variable/essential columns), `vw_true_spendable_monthly`, `vw_fixed_cost_monthly_summary`, `vw_recurring_merchant_monthly` and the `needs_cost_kind`/`needs_fixed_cost_necessity` flags of `vw_unclassified_work_queue` (DB-only legacy views; dashboard HTTP endpoint removed); the installment-link candidate list (`/installment-transaction-links`, `recurring_payment_kind='installment'`); the `GET /transactions` old-column filters and the `is_edited` flag (stored-value filters; the flow-row filters `flow_row`/`payment_form`/`adjustability` already read the new axes). The old columns are therefore not read-only yet (plan criterion "읽기 전용으로 남고" is only partly met until T059 replaces the frontend workflow).

### Work queue (`vw_unclassified_work_queue`, 0038)

Same columns and API fields. Rows: effective, non-superseded `지출` without a loan or installment link whose resolved adjustability is `undecided`, or that need a loan-link review. `needs_spend_necessity = undecided`; `needs_cost_kind = undecided AND cost_kind IS NULL`; `needs_fixed_cost_necessity = undecided AND cost_kind='fixed'`; `needs_recurring_payment_kind = false` always (the recurring-kind queue is gone). Priority formula unchanged; `merchant_expense_count` now counts the rows of this narrower base.

### Import contract and rollback impact

Checked before the design (code evidence, this branch):

- Rollback points capture and fingerprint every table in `Base.metadata` except `upload_logs`, `upload_review_operations`, `upload_rollback_points` (`upload_rollback_service.py:25`, `:39` `scope_tables`, `:85` `fingerprint`, `:106` `begin_point`); `tests/services/test_upload_rollback_postgresql.py:109` requires every database table to be in that scope. A rollback refuses with `schema_changed` when a captured snapshot lacks a current table (`upload_rollback_service.py:258`).
- Reviewed imports digest and lock every table in `Base.metadata` except two (`upload_review_service.py:117` `finance_tables`, `:128` `lock_state`, `:160` `state_digest`); a changed digest makes a prepared plan `stale_plan` (`:464`).
- The safe-apply replacement path copies the old columns to the new row and moves loan/installment links and purchase reviews (`upload_apply_service.py:306`, `:341` `_copy_user_managed_fields`, `:362` `_move_transaction_relationships`). `preserved_user_fields` in preview responses lists only categories, memo, merchant override, deleted, merged (`upload_preview_change_builder.py:178`).

Choice: new tables only. Adding columns to `transactions` would change its `to_jsonb` row text, i.e. every rollback/state fingerprint of that table and any structure fingerprint of it, and would add values to `preserved_user_fields` if listed. With new tables:

- No request/response shape, status value or existing table changes. `preserved_user_fields` is unchanged. The replacement path additionally moves the `transaction_nature_overrides` row (and pins bundle membership if the replacement's merchant/category no longer matches) inside `_move_transaction_relationships`; this is captured by the same rollback point (tested: `tests/migrations/test_nature_axes_migration_postgresql.py::test_rollback_restores_override_moved_by_reimport`). Reviewed apply updates rows in place, so overrides stay on the same id.
- Rollback `restored_counts` / `changed_tables` and the review state digest now include the three new tables (values, not shape). A rollback point captured before migration 0036 is refused with `schema_changed` (no silent loss). A prepared review from before the migration becomes `stale_plan` and must be prepared again.
- External rollback helper: it is not in this repository. If it fingerprints the structure of specific existing tables (`pg_dump --schema-only -t <table>`-style), nothing changes: no column, index or constraint is added to an existing table (the new foreign keys are owned by `transaction_nature_overrides`). If it restores `transactions` with `TRUNCATE … CASCADE` or deletes rows, the cascade also clears `transaction_nature_overrides` (`ON DELETE CASCADE`), so the helper must add the three new tables to its snapshot list to keep the new classification.

### Dry-run report

`DATABASE_URL=<url> uv run python -m app.tools.nature_axes_migration_report [--show-amounts] [--json]` (from `backend/`). One read-only transaction (`SET TRANSACTION READ ONLY` on PostgreSQL). Before migration: per `mapping_row` count and share of the net 지출 total of effective KRW rows, predicted new-axis combinations, bundles the backfill would create (with unanimous adjustability, monthly cycle), necessity disagreement count, unconfirmed installment-link count, and a conservation check. After migration: actual combinations from `vw_transaction_nature`, rows whose actual combination differs from the mapping, bundles by origin, category default count, and checks that every effective 지출 is in exactly one combination and that the combination total and the flow-lines 지출 total equal the transaction total. Amounts in won appear only with `--show-amounts`. Exit code 1 when a check fails.

## Comparison Contract (T057)

Plan reference: `Implentation-plan.md` section 2.4. Code: `backend/app/services/comparison_service.py`, schemas `backend/app/schemas/comparison.py`, setting in `backend/app/services/settings_service.py`. No view or migration is added; every amount is a SQL `SUM` over `vw_metric_flow_lines` with the same sign rules as the monthly flow (`flow_summary_columns`) and spend cube (`−amount` for 지출). Python takes medians of those SQL sums and assembles the response; it never re-sums transactions.

### Window resolution (`resolve_comparison_window`)

- Data facts come from `vw_metric_as_of` (`transaction_as_of`, `first_transaction_date`, `last_closed_period`) and the set of periods present in `vw_monthly_flow_summary` (a period is "with data" when it has at least one effective KRW line).
- Target: `period` if given, else `last_closed_period` (or the as-of month when no month is closed yet). A target after the as-of month is rejected (`422`) on `/metrics/comparison/*`.
- Target dates: `target_start_date` = 1st; `target_end_date` = month end for a closed target, the transaction as-of date for the in-progress month, or an earlier explicit end date passed by a legacy endpoint. `elapsed_day = target_end_date.day` when that is not the month end.
- Baseline months: walk back from the month before the target. Stop at the first data month (`baseline_limited_by=data_start`) or before `baseline_start_period` (`baseline_limited_by=baseline_start_date`). Skip months without data (`skipped_periods`, reason `no_data`) and keep walking. Collect up to `baseline_months_requested` (6 by default; `spending-anomalies` passes its own `baseline_months`).
- `baseline_start_period`: month of `baseline_start_date` when it is the 1st, otherwise the next month.
- Day cut: when `elapsed_day` is set, all lines in scope satisfy `day_of_month(date) <= elapsed_day` (target and baseline months alike).
- A first data month whose data starts mid-month (`first_data_period_starts_mid_month`) is not a full month: the median baseline and the 12-month windows stop before it (`baseline_limited_by=data_start`). It can still be a target month or the explicit previous month of a previous-month comparison, where `partial_month_note` says so. (Decided 2026-11-15.)

### Median

- `median_won(values)`: odd count → middle value; even count → `(a + b) / 2` rounded with `ROUND_HALF_UP` on `Decimal` (half away from zero). Empty → `null`.
- Baseline values are taken over every baseline month; a month with data but no amount for the item contributes `0`.
- Per-item medians are not additive: `sum(items[].baseline_amount)` generally differs from `baseline_total`.

### `GET /api/v1/metrics/comparison/monthly-flow`

- Query: `period` (`YYYY-MM`, optional).
- Measures (key → label): `income_total` 수입, `committed_loan_total`, `committed_installment_total`, `committed_recurring_total`, `committed_total`, `ad_hoc_protected_total`, `ad_hoc_adjustable_total`, `undecided_total` 미정, `total_outflow` 총지급, `living_spend` 생활 지출, `protected_spend`, `adjustable_spend`, `adjustability_undecided_total`, `residual` 잔여, `transfer_net`.
- Each measure: `target_amount` (null when the target has no data), `baseline_amount` (median), `change_amount = target − baseline`, `baseline_values[]` (`period`, `amount`).
- `residual_rate`: only for a closed target; `target_rate = residual ÷ income_total` (null when income ≤ 0), `baseline_rate` = median of the baseline months' rates (months with positive income only), rounded to 4 places. `null` for an in-progress target.

### `GET /api/v1/metrics/comparison/contributions`

- Query: `period`, `adjustability` (`all` = every expense line including 미정, `protected`, `adjustable`), `level` (`category` = effective major category; `merchant` = (category, merchant) pairs, so a merchant under two categories is two items), `category` (narrow to one category; `''`/null categories are `미분류`), `limit` (per list).
- Monthly items: target-month amount vs the median of the baseline months. Items with target `0` and baseline `0`/null are dropped. `baseline_observed_month_count` / `baseline_zero_month_count` show how many baseline months had an amount vs 0.
- Cadence: in the 12 months ending at the target (`twelve_month_window.target_window_*`), count months with positive net spend per item (SQL). When all 12 months have data and the count is 1–2, the item is `annual_like` and moves to `twelve_month_items`: `target_amount` = 12-month total, `baseline_amount` = total of the preceding 12 months, `target_period_amount` = the target month alone. For an in-progress target the last month of the baseline window is cut at the same `elapsed_day`.
- Baseline 12-month window availability: every month on/after the first data month (`data_start`), on/after `baseline_start_period` (`baseline_start_date`), and with data (`no_data`); otherwise annual-like baselines are `null` with `baseline_note`.
- Ordering (both lists): `abs(change_amount)` descending, then target amount, category, merchant; items without a baseline come last by target amount. Never by percent.
- View totals: `target_total` (null when the target has no data), `baseline_total` = median of the view's monthly totals, `change_total`.

### Existing analytics under the contract

| Surface | What changed (names and types unchanged) |
|---|---|
| `GET /analytics/spending-anomalies` (3-month mean baseline) | Replaced by the contract: median of up to `baseline_months` (default 6) closed months with data, baseline start date, same elapsed days, default target from the data as-of date. Adds `comparison`. `baseline_avg` keeps its name but holds the median. |
| `GET /analytics/category-mom` (previous month) | Previous-month fields kept, but an in-progress month is always compared through the same day. Adds per-item `baseline_amount`/`baseline_change_amount` (contract median) and `comparison`. `delta_pct` kept (same-elapsed-day percentage, not a ratio metric). |
| `GET /analytics/monthly-cashflow` | `savings_rate` null for the in-progress month. |
| `GET /analytics/fixed-cost-trend` | `fixed_ratio` null for the in-progress month. |
| `GET /canonical-views/dashboard` `monthly_cashflow[]` | `savings_rate` null for months after `metric_as_of.last_closed_period` (basis stays `observed_partial_month`, or `no_income`). The DB view `vw_monthly_cashflow.savings_rate` also suppresses in-progress ratios after migration `20261117_t054_t057`. |

Not migrated in T057 (each keeps its own baseline, stated here so consumers do not mistake it for the contract):

- `vw_merchant_monthly_baseline` and dashboard `merchant_monthly_baseline[]`: trailing 3-month mean (`trailing_3_month_avg`, `baseline_delta`, `baseline_delta_pct`). Column names encode the method and readonly SQL consumers depend on them; use `/metrics/comparison/contributions?level=merchant` for the contract view. Removal belongs to `T060`.
- `discretionary-velocity`: removed with its unused calculation.
- `purchase-gate-candidates`/`spending-review-candidates` `merchant_spike`/`discretionary_spike`: monthly mean of prior months on the `purchase_net.v1` basis; HTTP paths removed; the detector remains inside `/read/review-items`.
- `fixed-cost-summary.fixed_ratio` and `payment-method-patterns.pct_of_total`: composition shares of the requested range, not month comparisons; unchanged.
- `income-stability`: variability of observed income months. The default reference date is the ledger’s last closed month-end, or null when none exists. An explicit end date uses the requested cutoff.
- Monthly projection baselines (`T064`) and snapshot comparisons (`T061`).

## Net Worth Reconciliation (T061)

Plan reference: `Implentation-plan.md` 2.5, 3.3 (비상금 개월 수), task `T061` (backend and API only; the 재무상태 screen is a later frontend task). Code: `backend/app/services/net_worth_service.py`, `net_worth_views.py`, `transfer_purpose_service.py`, `metric_views.py` (`vw_transfer_purpose`, flow-line columns), schemas `backend/app/schemas/net_worth.py`, `transfer_purpose.py`, migration `20261116_0039_transfer_purpose_net_worth_views.py`.

### Formula

```
net_worth_change            = NW(end) − NW(start)                       (vw_net_worth_snapshots)
residual                    = income_total − total_outflow over (start, end]   (vw_metric_flow_lines)
loan_balance_decrease       = L(start) − L(end)                          (vw_snapshot_kind_totals, kind=loans)
investment_net_transfer_in  = − Σ amount of 이체 lines with transfer_purpose = 'investment' in (start, end]
investment_valuation_change = (I(end) − I(start)) − investment_net_transfer_in   (kind=investments)
unexplained_difference      = net_worth_change − residual − loan_balance_decrease − investment_valuation_change
```

- `NW(d)` = Σ non-negative `asset` rows − Σ `liability` rows at `d` (negative asset rows excluded and shown as `negative_asset_excluded_total`), the same definition as `/assets/snapshots`, `/assets/net-worth-history`, `vw_asset_snapshot_canonical`. `L(d)` = Σ `loans.balance` (every row; `is_hidden` loan accounts are not excluded, because the liability side of the asset snapshot is not filtered either). `I(d)` = Σ `investments.market_value`. A missing balance or market value increments `missing_value_row_count`. The read service withholds the affected total and change. When the same date also has known rows, `start_known_value_total` or `end_known_value_total` holds their subtotal. The subtotal is null when every value is missing.
- Every snapshot total is rounded half-up to the won before differencing, so the identity is exact on the returned integers.
- Why this explains net worth: transfers are not in the residual. A savings or investment transfer moves money out of a ledger account (−X) into a holding (+X); both sides are in net worth, so it cancels there. For investments the snapshot change is the transfer plus the valuation, hence `valuation = ΔI − net transfer in`. A loan payment is in `total_outflow` as the full 원리금; the balance decrease adds the principal back, leaving the interest. Whatever the records cannot explain (unrecorded fees, transfers to untracked accounts, a new loan disbursed as a transfer, valuation of savings, timing of the export) stays in `unexplained_difference`.

### Interval boundary

A snapshot is the balance at the end of its date (it includes that day's transactions). The transactions of the interval are therefore dated `start + 1 day` … `end` inclusive (`transaction_start_date`, `transaction_end_date` in the response). This is the only choice under which consecutive intervals partition the ledger: (D0, D1] and (D1, D2] together equal (D0, D2] (tested). With month-end snapshots the interval equals the calendar months of the monthly flow.

### Comparable snapshot pairs and states

- The interval is chosen by two asset (net worth) snapshot dates. Defaults: the latest two.
- Per kind (loans, investments): `observed` when rows and their values exist on both dates; `incomplete` when the dates match but at least one value is missing; `absent` when the kind has no rows in any snapshot (both ends 0, stated in `status_reasons`); otherwise `mismatched`, with `start_as_of`/`end_as_of` = the kind's latest snapshot on or before each date. A mismatched or incomplete pair withholds its change and the unexplained difference. `items.withheld_reasons` identifies the affected fields. The asset snapshot change and the ledger residual each retain their independent basis. Kinds are never aligned to a nearby date. Insurance and profile are not used; their as-of dates are reported in `other_kinds`.
- Transactions cover the interval when `first_transaction_date ≤ start + 1`, `transaction_as_of ≥ end`, and every month intersecting the interval has at least one effective KRW line (`periods_without_data` otherwise).
- `status`: `no_snapshot_pair` (fewer than two asset snapshot dates) > `snapshot_dates_mismatched` > `incomplete_snapshot_values` > `transactions_not_covered` > `incomplete_classification` (an undecided transfer leg in the interval; the valuation may be wrong by its amount) > `complete`. `items` other than the unexplained difference are still returned for `transactions_not_covered` so the partial evidence is visible.

### Transfer purpose

| Purpose | Meaning (set by a human) |
|---|---|
| `investment` | The leg moves money between a ledger account and a holding reported in the `investments` snapshot. |
| `savings` | The leg moves money between a ledger account and a savings deposit that is an asset row but not an `investments` row. |
| `internal_move` | Any other move between the person's own accounts (그 밖의 계좌 간 이동). |
| `undecided` | Nothing set. Never inferred. |

- Resolution (`vw_transfer_purpose`, one row per effective 이체, any currency): `transfer_purpose_overrides.purpose` > first merchant-scope rule with the same normalized `merchant` (lowest id) > first category-scope rule with the same effective major and the same minor (including none) or a whole-major rule, exact minor first, then lowest id > `undecided`. `purpose_source` = `transaction`, `rule_merchant`, `rule_category`, `none`.
- `investment` and `savings` are separate values because the plan's valuation formula subtracts investment transfers only; the monthly-flow row 투자·저축 이체 is their sum.
- Netting of the two legs: amounts are summed with their source sign everywhere (never gross). A move between two ledger accounts has both legs (−X, +X) marked `internal_move`, which nets to 0 in `transfer_internal_move_net` and does not touch the residual or the valuation. If a person marks both legs of such a pair `investment`, they cancel in `investment_net` too (the pair never left the ledger) — tested. Gross activity (`transfer_activity_total`) is the sum of absolute leg amounts and is used only for the undecided share.
- Re-import: the safe-apply replacement path moves `transfer_purpose_overrides` to the replacement row (`move_transfer_purpose_override`, next to the T056 nature move). Rules match by key and need no move. A rollback restores the moved row (tested on PostgreSQL).

### Monthly flow split (잔여의 행방)

`vw_metric_flow_lines` gains `transfer_purpose`, `transfer_purpose_source` (non-null exactly for 이체 lines). `vw_monthly_flow_summary` / `flow_summary_columns` gain `transfer_investment_net`, `transfer_savings_net`, `transfer_investment_savings_net`, `transfer_internal_move_net`, `transfer_undecided_net`, `transfer_undecided_activity_total`. Invariants (tested on SQLite and PostgreSQL): `transfer_net = investment + savings + internal_move + undecided`; `investment_savings = investment + savings`; every 이체 line has exactly one purpose. `/metrics/monthly-flow` adds these fields, `transfer_undecided_share`, and `transfer_rows[]`; the existing `rows[]` keeps its single `transfer_undetermined` row (meaning all transfers) so no existing value changes.

### Emergency fund months (`GET /api/v1/metrics/net-worth/emergency-fund`)

```
emergency_fund_months = cash_like_total ÷ monthly_protected_outflow   (2 decimals; null when the denominator ≤ 0)
```

- `cash_like_total`: latest asset snapshot, rule of `vw_asset_snapshot_canonical.cash_equivalent_total` (non-negative asset rows with `is_cash_equivalent IS TRUE` or `liquidity_tier IN ('immediate','cash','cash_equivalent')`, or with neither set and the existing name rule). `cash_like_name_rule_total` is the part decided by the name rule only. Equality with the canonical view is tested on PostgreSQL. Note: the canonical rule counts a cash `liquidity_tier` even when `is_cash_equivalent` is false; the legacy Python rule of `liquidity-health` checks the flag first. This existing difference is kept, not resolved here.
- `monthly_protected_outflow`: median (`median_won`) of `vw_monthly_flow_summary.protected_spend` over the baseline months: walk back from `last_closed_period` (inclusive), skip months without data, exclude a first data month that starts mid-month (`limited_by=data_start`) or before the comparison baseline start month (`baseline_start_date`), up to 6 months. Same rules as the comparison contract, except that the last closed month itself is included (nothing is compared against it).
- `adjustability_undecided_share` = Σ `adjustability_undecided_total` ÷ Σ `total_outflow` over those months; `monthly_adjustability_undecided_outflow` = their median. The denominator uses only protected spend. `adjustability_undecided_transaction_count` counts distinct undecided expense postings per month, including refunds. A nonzero count signals incomplete classification even when the net share rounds to zero. An absent baseline or nonpositive denominator withholds the months value.
- The asset snapshot date and the transaction as-of date are reported separately.

### Import contract and rollback impact

- New tables only (`transfer_purpose_rules`, `transfer_purpose_overrides`); no column, index or constraint on an existing table. Upload preview/apply, review prepare/decisions/apply, rollback points and upload logs keep their request/response shapes and status values; `preserved_user_fields` is unchanged.
- Rollback points and review state digests enumerate `Base.metadata`, so the new tables are captured and restored automatically (values only). A rollback point captured before 0039 is refused with `schema_changed`; a review prepared before 0039 becomes `stale_plan`.
- An external helper that restores `transactions` with `TRUNCATE … CASCADE` or row deletes also clears `transfer_purpose_overrides` (`ON DELETE CASCADE`) and must add the two tables to its snapshot list to keep human marks.

### Values that changed

- `/metrics/monthly-flow` `contract.inclusion.transfers` text now states the T061 split and netting rule; `contract.field_scopes.transfer_net` text no longer says "(투자·저축 구분은 T061)" and a `transfer_rows` scope was added. No numeric value of an existing field changes.
- `GET /api/v1/schema`: two new tables and three new views are listed; `vw_metric_flow_lines` and `vw_monthly_flow_summary` list the new columns.

## Read Surface Consumer Review

Formulas and rules added after a consuming agent used the read surface. All values are SQL aggregates over the existing views (`vw_metric_flow_lines`, `vw_transaction_nature`, `vw_spend_cube`, `vw_monthly_flow_summary`); no view, table or migration changed. Contract summary and field list: [backend-api-ssot.md](backend-api-ssot.md#read-surface-consumer-review).

### Validation and 422 shape (`app/core/validation.py`)

- `/read/*` router dependencies: `require_api_key` → `reject_unknown_query_params` (compares `request.query_params` with the matched route's flat dependant query parameter aliases; one `extra_forbidden` error per unknown name, `ctx.allowed`).
- `UniformValidationRoute` (both `/read` and `/metrics/net-worth` routers) turns `HTTPException(422, "<text>")` into `RequestValidationError([{type: value_error, loc: ["query"], msg: <text>}])`. Services owned by these surfaces raise `query_error(<param>, ...)` directly, so `loc` names the parameter (`group_by`, `end_period`, `start_period`, `start_date`, `end_date`). The comparison service's future-target message stays a string in the service (shared with `/metrics/comparison/*`) and is converted with `loc: ["query"]` on `/read/*` only.

### Classification completeness

Per period and per response scope, over expense lines (`type = 지출`) of `vw_metric_flow_lines`:

- `adjustability_undecided_transaction_count` = `COUNT(DISTINCT transaction_id)` of lines with `adjustability = 'undecided'`.
- `adjustability_undecided_gross_total` = `SUM(ABS(amount))` of those lines; `expense_gross_total` = `SUM(ABS(amount))` of all expense lines in scope; `adjustability_undecided_gross_share` = ratio (4 dp, null when the denominator is 0), always 0–1.
- `complete` = count is 0. The period `status` and the `adjustability_undecided` reason use the count. The net `adjustability_undecided_total`/`_share` are unchanged (signed). The spend cube scope uses the same filters on the flow lines (every cube dimension is a flow-line column).

### Month data coverage (`MONTH_DATA_COVERAGE_RULE`, `metrics_service.month_data_coverage`)

Bounds: first effective transaction date F, transaction as-of date A.

| Value | Rule |
|---|---|
| `outside_data` | period < month(F) or period > month(A), or no transactions at all |
| `no_transactions_observed` | inside the bounds and no effective KRW transaction (inferred, not verified) |
| `partial` | period = month(F) and F is not the 1st (`first_month_starts_mid_month`; the comparison's `first_full_period` rule), and/or period = month(A) and A is not the month's last day (`data_ends_before_month_end`) |
| `full` | otherwise (calendar range only; account completeness is not verified) |

Comparison `target_data_coverage` applies it to the target month. The projection's `coverage.month_coverage_rule` quotes the same text and adds that the forecast further keeps only adequately covered months (its observation-density rule, unchanged).

### Comparison baseline `previous_month`

- `previous_month_window(window)`: P = target − 1 month. `data_start` when P < `first_full_period`; `baseline_start_date` when P is before the user's baseline start period; `no_data` when P has no effective transaction (`skipped_periods=[P]`); otherwise the baseline is `[P]`. The in-progress target keeps the same-elapsed-days cut on P. Unusable → `baseline_status=none`, every baseline value null.
- `baseline_unavailable_reason` is set for both methods whenever no baseline month was used.
- `previous_full_month_delta_available` = target set ∧ target not cut to a partial day range ∧ target has data ∧ ≥1 baseline month.
- Contributions under `previous_month`: annual-like items are not split out of `items` (they keep `cadence=annual_like`, `window=monthly`), so Σ item `change_amount` = `change_total`. `twelve_month_items` and `twelve_month_window` are the same 12-month view as with the default baseline.

### Contribution list summaries

`read_contributions` asks the service for every item (`limit=None`) and cuts in the read layer. For each list: `total_count`, `returned_count`, `truncated`, Σ`change_amount` (nulls skipped) and Σ`target_amount` of returned and not returned items, `items_without_change_count`. `sum_item_changes` = Σ`change_amount` of all monthly items (null when `change_total` is null); `non_additive_gap` = `change_total − sum_item_changes`. `lists` only blanks the unrequested list (`requested=false`); the summary still counts it.

### Spend cube counts

Both group counts and values group the same filtered expense rows of `vw_metric_flow_lines`. Each group counts distinct posting transaction IDs. A split refund can appear in two groups while contributing only one transaction to their common parent. The API groups null and blank minor categories together and accepts an empty `effective_category_minor=` filter for that group. `total_group_count` counts every matching group and `returned_count` counts the rows returned.

### Commitments

- `end_date_status`: loan `recorded` with maturity, else `not_recorded`; installment `recorded` (first payment date + (total − 1) months), else `not_recorded`; recurring `recorded` with `end_date`, `not_applicable` for `n_times` with `total_count`, `not_recorded` for `n_times` without it, else `open_ended`.
- `monthly_burden_origin`: loan `manual` → `entered_by_person`, `estimated_from_linked_transactions` → same, other source with a value → `source_not_recorded`, no value → `not_available`; installment → `installment_plan_record`; monthly bundle with a last observed closed month → `observed_closed_month`.
- `status` filters `items` by `lifecycle` (`unknown` only in `all`); `view=summary` returns `item_summaries` instead of `items`; a summary row copies `cycle`, `monthly_burden_basis`, `adjustability` and `end_date_reason` from the detail item, so items can be counted by cycle without the detail view. `totals`, `counts_by_state` and `status_reasons` are computed on every commitment.

### Transaction axes (`transaction_axes_service.load_transaction_axes`)

For the returned page's ids: `vw_transaction_nature` gives `payment_form`, `commitment_kind`, `adjustability` and the sources; `vw_metric_flow_lines` gives the flow rows. Source mapping: `adjustability_source` `fixed_loan→loan_link`, `fixed_installment→installment_link`, others as named; `payment_form_source` `loan_link`/`installment_link` by `commitment_kind`, `transaction` when the transaction was put in a bundle explicitly (`commitment_match=explicit`), `commitment` when a bundle rule matched, `none` for ad hoc, `not_applicable` for non-expense. Rows outside the views → `not_effective`. `flow_row` = the row of the transaction's own line (`transaction`/`refund_remainder`), otherwise the first allocated purchase's row; `flow_rows` = all distinct rows.

### Net worth

- `unexplained_share_of_change` = round(`unexplained_difference` ÷ |`net_worth_change`|, 4); withheld with `net_worth_change_zero` or `unexplained_not_computable`.
- `investment_valuation_change_provisional` = `transfers.undecided_activity_total > 0`; the reason states the undecided transfer activity in won.
- `status_note` on reconciliation and intervals: `complete` = inputs computable, not explained.

### Month projection completeness

`left_out[]` order: income sources (`uncertain` → `income_source_uncertain`; `stopped` with low confidence, i.e. stopped by the history rule rather than by a person → `income_source_stopped_by_rule`), then per component its `not_in_expense_commitments` (loan, `reason_code` as there) and, when `expected_remaining` is null, `component_not_estimated` with the joined `missing_reasons`. `status` = `not_projected` if `projected_month_end_net` is null, else `known_components_only` if `left_out` is non-empty, else `all_known_components`. `full_projection_available` = (`status` = `all_known_components`); `amount_scope` = `none` / `known_components` / `all_known_components` for the three statuses in that order. Loan rows: `observed_payment_amount` = Σ −amount of this month's negative loan lines, `observed_refund_amount` = Σ positive, `observed_net_expense` = difference (the value the component subtracts), `expected_remaining` = max(monthly − net, 0) or null without a monthly payment; `match_method` from the lines' link vs person-registered loan merchant rule. Loans with balance ≤ 0 and loans in `not_in_expense_commitments` have no row.

## Implementation Notes That Matter

- `transactions/merge` is still an intentional `501` stub
- `schema` endpoint documents raw tables and canonical views, not arbitrary service-level derived metrics
- `income-stability` and `spending-anomalies` now both expose:
  - `comparison_mode`
  - `reference_date`
  - `is_partial_period`
- current frontend still contains some fallbacks for older backend contracts, especially around transaction filter options
- analytics settings are stored in `app_settings` with `scope + key` uniqueness; current live analytics scopes include `spending_anomalies`, `discretionary_velocity`, `purchase_gate`, `recurring_dry_run`, `asset_liability_health`, `bulk_operations`, `financial_targets`, and `comparison`
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

### Toss 주식 평가 조회

공식 v1.2.17 holdings의 통화별 합계는 해당 통화 종목의 합이며 환산 총액이 아니다. 각 종목의 수수료 차감 전 `marketValue.amount`를 사용한다. KRW 종목은 원금액, USD 종목은 `amount × 별도 exchange-rate.midRate`를 Decimal로 계산하고 0.01 KRW 단위로 반올림한다. `quantity`, 원통화 평가액/매입금액, 현재가(원통화), 환율을 관측 payload에 남긴다. 손익/성과 계산은 구현하지 않는다.

빈 items는 KRW/USD 합이 0일 때 완전한 0건 수집이다. 항목 누락/중복/지원 외 통화/overview 불일치/환율 오류는 부분 또는 실패로 기록하고 선택 후보에서 제외한다. 공급자에 holdings 평가 timestamp가 없어 `valuation_at=observed_at`은 명시적 observation_proxy이다. 환율 유효구간은 별도로 저장되며 같은 시각의 확정 평가를 뜻하지 않는다. 조회 최신성과 시세 최신성은 다르다.

계좌 그룹을 Toss로 교체하려면 동일한 단일계좌 및 국내·미국 주식 범위를 확인한다. 비주식/미분류 항목이 있으면 `unsupported_holdings_scope`로 뱅샐 유지. 예수금은 API가 제공하지 않으므로 매수가능액 등을 현금으로 대용하지 않는다. BankSalad 자산 component mapping과 cash_scope가 확인되기 전 estimated_net_worth=null은 정상적인 미확정 상태다.

## T054/T057 remaining criteria: computation boundaries (2026-11-17)

The scope-specific alias table and compatibility exceptions are in [SSOT](backend-api-ssot.md#t054t057-remaining-acceptance-2026-11-17). No prior field is renamed. Migration `20261117_t054_t057` appends `total_outflow`/`living_spend` to `vw_monthly_cashflow`, appends `living_spend` to `vw_fixed_cost_monthly_summary`, and suppresses only the in-progress cashflow `savings_rate`. Downgrade restores the exact prior view SQL and dependent `vw_true_spendable_monthly`; tables and their data are untouched.

### Purchase review

`_load_purchase_net_rows` reads effective KRW per-purchase nets from `vw_metric_transactions` with axes from `vw_transaction_nature`. `_purchase_review_totals` SQL-groups `-purchase_net_amount` by month and merchant/category for ad hoc, adjustable purchases with negative purchase net; standalone positive refunds and zero/over-refunded purchases do not enter candidate totals. Python no longer re-sums these records. It keeps novelty, minimum/large-purchase thresholds, spike threshold tests, cancellation evidence and persisted human review state. The SQL total is a purchase-economic total, not a monthly-flow or spend-cube total: a cross-month allocated refund changes the purchase net, while posting-month cashflow remains in its posting month.

On `/read/review-items`, both detectors use the same `ComparisonWindow` rules (default six recent closed months, shared baseline start, same elapsed days). Purchase baselines are medians of the SQL monthly totals, including zero-purchase months with ledger data and excluding missing-data months / first partial month. Novelty uses this same baseline window. `new_merchant_lookback_months` is retained as the legacy configured value; the new `new_merchant_baseline_month_count` and `data.comparison` state the actual baseline used by the successor. A zero/absent baseline does not generate a spike ratio. Category detection uses posting-month flow-line totals and monthly medians; annual-like 12-month totals are available on `/read/comparison/contributions.twelve_month_items`. These are different scoped amounts under the same period contract, not interchangeable amounts. In-progress purchase signals omit computed `*_ratio`; `*_threshold_ratio` is a configured detector threshold and remains. Read-item reasons express won differences. Deprecated purchase endpoints still use their old lookback/mean and return the same candidate values as before.

### Month-end projection (T064 boundary)

- Overall actuals `observed_income`, `observed_net_expense`, `observed_net_cashflow` are SQL aggregates over `vw_metric_flow_lines` in `[month start, reference date]`; they equal `income_total`, `total_outflow`, `residual` of the monthly-flow summary on the same dates. No Python re-aggregation of those totals is used.
- Income assumption sources group view-provided purchase rows by payer, amount floor, accepted salary pattern and explicitly configured receipt range; they exclude one-off/non-salary receipts. Their matched/observed amount is not the overall `income_total`.
- Expense assumption sources read `vw_metric_flow_lines` and partition by recorded loan rules, installment-plan rules, registered recurring commitments, then variable remainder. The local sums are matched-payment/refund amounts, source-period evidence, same-remaining-day tails, and known remaining assumptions. A rule-matched unlinked payment can belong to a projection's loan/installment source while still being ad hoc in the canonical ledger. Consequently these source subtotals are not aliases for canonical `committed_loan_total` / `committed_installment_total` and cannot be replaced with them. The code does not persist those matches or classify records.
- Remaining assumptions, medians, receipt timing, clipping, and error replay remain Python logic. No forecast beyond month end is added. The synthetic parity tests compare overall observed actuals with the view on SQLite and migrated PostgreSQL, including linked, refunded, superseded, merged, deleted and foreign-currency cases.

### 대출 연결 후보와 월상환 추정의 공통 실적 (T054 마지막 보완)

대출 연결 후보 목록은 원본 행과 사람의 검토 상태를 고르는 경로다. 후보의 `amount`는 원통화 원본 부호 금액이며 월 실적이 아니다. 후보 선택·연결·분류 계약은 바꾸지 않는다.

`_load_linked_repayment_observations`는 `vw_metric_flow_lines`의 `flow_row='committed_loan'`을 대출 계좌·게시월로 묶는다. `loan_repayment_total`이 월 흐름표의 `committed_loan_total`과 대출 추정에 같은 SQL 합계(`SUM(-amount)`)를 제공한다. 관측 월·상환 성격은 같은 줄 집합에서 읽는다. 확정 배분 환불의 상환 성격은 원 상환 거래의 연결을 따른다. `vw_loan_repayment_monthly`는 원본 연결 중심의 이전 읽기 뷰이므로 이번 추정의 입력으로 쓰지 않는다.

이전 Python 원본 합계와 달라질 수 있는 조건은 다음과 같다.

| 조건 | 이전 | 공통 월 흐름표 정의 |
|---|---|---|
| 원화 외 통화 | 연결돼 있으면 원본 숫자를 더함 | 대소문자를 무시한 KRW만 포함. 환산하지 않음 |
| 수입·이체·기타 유형에 남은 연결 | 연결돼 있으면 포함 | 지출 대출 줄만 포함. 이체는 자산 이동으로 분리 |
| 대체된 원본 | 삭제·병합만 제외 | 대체 ID가 있거나 생애주기가 superseded인 원본도 제외 |
| 확정 배분 환불 | 환불 행 자체의 연결에 귀속. 미연결 환불은 빠짐 | 확정 배분분은 원 상환의 대출·성격에 귀속하고 남은 금액은 환불 행의 연결에 남음. 달은 환불 게시월 유지 |
| 환불 초과·환불만 있는 달 | 월 원본 순액을 0으로 잘라 관측값에 저장 | 음수 순지급을 그대로 유지. 0 하한은 중앙값·평균을 낸 최종 월상환 추정에만 적용 |
| 관측 월·상환 성격 | 원본 연결이 있던 달·성격 | 공통 대출 줄이 있는 달·귀속 연결의 성격. 제외 조건과 환불 때문에 관측 수·추정 가능 여부·상환 방식도 달라질 수 있음 |

삭제·병합 제외는 유지된다. 최근 내보내기 누락·원천 변경·중복 후보 상태는 유효 조건을 만족하면 계속 포함한다. 연결 여부가 대출 줄을 정하므로 카테고리 사용자 수정은 연결된 상환액을 바꾸지 않는다. 분류 표시는 사용자 수정 우선이며, 금액은 구매 순액 대신 게시월 원본 지급·환불 줄을 쓴다. 순액이 0인 관측월은 남기고 대출 줄이 없는 달을 0원으로 채우지 않는다.

미리보기 `transaction_overrides`는 기존 거래의 날짜·금액만 바꾼 읽기 전용 CTE를 만든다. 환불 배분 → 유효 거래 → 성격 축 → 흐름표 줄의 **동일 SQL 생성 함수**를 이 거래 집합에 적용하고 마지막에 계좌·관측 기간을 고른다. 기존 날짜로 미리 자르거나 연결된 거래만 바꾸지 않는다. 기간 밖 원 상환·미연결 환불의 변경도 반영한다. 확정 배분 유효성도 변경된 금액 부호로 다시 판정한다. 미리보기 월 합계와 실제 적용 후 뷰 합계, 검토 수정 후 대출 스냅샷 값의 일치를 SQLite·PostgreSQL에서 검증한다. 쓰기·시퀀스 변경은 없고 검토/승인/적용/롤백 계약은 유지한다.

관측 기간·최소 관측 완료월·마이너스 통장의 최근 관측 완료월 최대 3개 평균·그 외 중앙값·수동값 보존은 추정 규칙이다. 수동 금액·수동 상환 방식은 자동 추정으로 덮지 않는다. 저장된 과거 추정값을 읽기만 해서 갱신하지 않는다. 기존의 명시 재계산, 연결·삭제·복원·대출 성격 변경, 스냅샷 가져오기에서 갱신한다. 새로운 이행이나 테이블·컬럼 변경은 없다. 설치된 뷰 SQL이 기존 이행의 고정 SQL과 같다는 테스트를 유지한다.

대출 화면과 재무상태 대출 카드는 `/loans/summary`, 약정의 월 부담은 저장된 같은 `loans.monthly_payment`를 읽는다. 자산·부채 요약의 월 부담 파생값도 그 값을 사용한다. 대출 잔액·순자산 스냅샷 자체는 이 추정과 별도다. 근거 문구는 재계산 기준이 원화 대출 지급 순액이며 환불을 기록된 달에 차감함을 밝힌다. `POST /upload/review`와 검토 수정 응답의 스냅샷 상세는 새 예상 추정값을 준다. 현재 `/data/import` 화면은 `/upload/preview`의 거래 변경 목록만 표시하므로 대출 예상 금액을 보여주는 화면으로 설명하지 않는다. 적용 후 대출 화면에서 확인하도록 안내한다. 새 검토 UI나 계약 확장은 이번 범위에 넣지 않는다.

## T062: spending_reference.v1 and spending_limit_revisions

`GET /api/v1/read/spending-reference`는 `period`(YYYY-MM) 하나를 받는다. 생략하면 가장 최근 마감월, 없으면 진행월이다. `/read/*` 공통 인증·422·503·기준일·기간별 상태·미정 비중 봉투를 따른다. 새 쓰기는 `/api/v1/spending-limits` POST이고, GET으로 이력 전체를 읽는다. 두 경로 모두 인증하고 알 수 없는 조회 인자를 거절한다.

계산 경로:

1. 기준일과 통화 범위를 한 번 읽고 선택한 달의 흐름 요약으로 기간 상태와 총지급을 계산한다.
2. 연간성 패턴은 대상 마감월로 끝나는 완전한 12개월 창에서 월 순지출이 양수인 달이 정확히 1~2개인 유효 대분류·소분류 쌍이다. 한 SQL 문에서 `vw_metric_flow_lines`의 `type=지출` 줄을 유효 대분류·소분류·연간 약정 ID·월로 집계하고, 쌍별 전체 월 순액/약정 제외 월 순액과 12개월 합계를 산출한다. T057에서는 창 해석 도우미만 읽고 기여 응답의 값·인자·집계는 변경하지 않는다. 월중 시작 첫 달·자료 없는 달을 포함하면 완전한 창이 아니다. 환불은 게시월 차감, 유효 KRW·대출 포함 등 기존 흐름표 규칙 그대로다. 전체 쌍의 양수 순지출 월 수로 패턴 자격을 먼저 판정하고, 사람이 `cycle=yearly`로 지정한 약정에 귀속된 구매·환불 줄은 그 쌍의 표시 금액에서 제외한다. 남은 지출 줄이 없으면 패턴 항목을 생략한다. 줄이 남으면 0·음수 순액도 환불을 반영한 값 그대로 표시한다. 등록 약정은 관측 빈도와 관계없이 관측된 12개월 순액을 별도 출처로 표시한다(0·음수 포함). 약정 귀속은 흐름표의 `recurring_commitment_id`를 따르며 거래 제외·명시적 연결·기간·배분 환불을 다시 판정하지 않는다. 기존 이행 묶음의 주기를 사람이 편집한 경우도 포함한다. 여러 쌍에 걸친 약정은 ID·쌍별 항목이다. `category`는 유효 대분류(기존 필드 유지), `category_minor`는 유효 소분류(null·빈 문자열은 null로 묶고 화면에 `소분류 없음`), `source=observed_pattern|registered_yearly_commitment`, `commitment_id`·`commitment_label`(패턴이면 null), `observed_periods`(차감 후 월 순지출이 양수인 YYYY-MM 목록, 오름차순), `active_months_in_window`(그 목록 길이), `window_amount`(환불을 포함한 12개월 순액), `monthly_equivalent`를 반환한다. 12개월 순액 내림차순, 대분류·소분류·source·약정 ID 오름차순으로 동률을 해소한다. 목록 전체를 반환하며 제한·잘림은 없다.
3. `monthly_equivalent = ROUND_HALF_UP(12개월 순액 / 12)` (원). 진행월에는 환산하지 않는다. 이 값은 기존 실적 계산에 들어가지 않는다. 창이 불완전하면 `annual_missing_reason=incomplete_twelve_month_window`; 진행월은 `month_in_progress`다.
4. 선택 월의 지출 줄을 한 SQL 문에서 대분류별·조정 가능성별로 각각 집계한다. 각 실적에 포함된 일회성 몫도 같은 줄에서 합산한다. 카테고리는 대분류의 정확한 값이며 빈 문자열은 미분류다.
5. 선택 월 이하의 최신 `spending_limit_revisions`를 대상별로 선택한다. `difference_amount = actual_amount − limit_amount`. 금액은 원 단위 정수이며, 양수=초과, 음수=한도 미만, 0=같음이다. 비율·건강/위험 판정·한도 추천·잔여 예산 전망은 없다.

한도 표: `id`, `target_kind(category|adjustability)`, `target_value`(대분류 최대 50자 또는 protected/adjustable/undecided), `effective_from_period`(YYYY-MM), `amount`(BigInteger nullable), 생성·수정 타임스탬프. `(target_kind, target_value, effective_from_period)` 유일, 금액 음수 금지, 조정 가능성 값 제약. 초기 표는 비어 있으며 데이터 이행이나 기존 행 수정은 없다. `amount=null`인 버전은 해당 월부터 해제, 0은 0원 한도다.

POST는 이미 마감된 달을 거절한다(422). 같은 대상의 마지막 버전보다 뒤인 월만 추가한다(409). 업데이트·삭제 API는 없다. 이전 버전의 값과 효력이 과거 비교에 남는다. 적용 시작월·금액을 고르는 자동 기본값은 없으며, 사용자가 열린 달에 정해 두면 해당 달이 마감된 뒤 비교한다. PostgreSQL에서는 가져오기/되돌리기와 같은 advisory transaction lock으로 쓰기와 기준일 검사를 직렬화한다. 새 표는 기존 `Base.metadata` 기반 검토 fingerprint·되돌리기 snapshot에 포함되므로 스키마 변경 전 준비 자료는 재준비가 필요할 수 있다. HTTP 가져오기 계약은 그대로다.

비교 불가 이유는 행별로 반환한다: `no_limit_set`, `month_in_progress`, `not_imported`, `no_transactions`, `partial_month`. 이유가 있으면 차이는 null이다. 달에 자료가 있지만 대상 거래가 없는 0원과 달 자체에 거래가 없는 상태는 다르다. 분류 미정은 기존 봉투에서 드러내며 조정 가능성 `undecided`도 사람이 한도를 정할 수 있다. 대분류와 조정 가능성 결과는 서로 겹치므로 합산할 수 없다.

## T060 approved removal (2026-11-17)

The seven deprecated GET contracts above are removed, not redirected. The migration guide lists all replacements and changed discovery keys. The review PATCH, income-expectations settings and `/canonical-views/month-projection/accuracy` are retained unchanged. No DB view/column or Alembic migration changes. Candidate and anomaly detectors remain because `/read/review-items` uses them; the removed dashboard, category-MoM, discretionary-velocity, installment-forecast-only services and schemas are deleted.

Liquidity health is retained and now deprecated through OpenAPI and successor headers pointing at `/metrics/net-worth/emergency-fund`; no body/status changes. Formula descriptions of the reused anomaly detector below describe internal service behavior, not a surviving `/analytics/spending-anomalies` route. Historical dashboard/category-MoM tables describe the former contract, whose live successors are in the migration guide.

Discovery-only changed keys: `/read/index.entries[key=month_end_projection]` changes `path`, `response_field`, `notes`; `/read/data-status.data.month_end_forecast` changes `path`, `field`, `note`. Remaining financial response values and keys are unchanged. Synthetic snapshot tooling asserts removed paths 404, exact retained response bytes except these precise metadata replacements, and former projection object equality.

전용 전망 응답은 예전 객체의 단위를 보존한다. `data.remaining_expense_adjustability.undecided_share_pct`는 백분율(0–100)이고, 봉투의 분류·기간 비중은 0–1이다. 새 응답의 `basis.rules.projection_ratio_units`와 `labels`가 단위 예외와 열거값 한국어 이름을 밝힌다.

### T056 이행 약정 확인

T056 확인 보완: 이행 약정은 `attributes_confirmed_at`으로 사용자의 주기·금액 확인을 기록한다. `/nature/recurring-commitments`와 `/read/commitments`의 대기 여부·대기 수는 추가 메타데이터이며 기존 관측·집계식은 바꾸지 않는다. HTTP `is_edited`는 별도 `legacy_classification_edited` 이력도 포함한다. 지정 출처·축 우선순위는 유지한다. 이행 전 검토는 다시 준비하며 이전 구조의 되돌리기는 `schema_changed`로 거절한다. 상세는 `agents/t056-classification-retirement.md`를 따른다.


### T065 PR2 연결 제안 상세

- 대출 제안: 규칙 우선. 이력은 유효 KRW 음수 지출의 이전 연결만 쓰며 미래 관측을 쓰지 않는다. 같은 결제수단의 최근 6개 관측 중, 해당 관측일을 거래 월과 인접 월로 이동한 예정일 중 최소 날짜 차이가 3일 이하인 행을 쓴다. 거래처 또는 원문을 공백/대소문자 정규화한 정확 일치(`merchant_seen`) 또는 해당 행의 절댓값 금액 중앙값 ±15%(`amount_within_band`)가 추가로 필요하다. 결제수단·날짜만이나 거래처만으로 결정하지 않는다. 여러 계좌는 `suggestion_ambiguous=true`, ID null, low, `multiple_accounts`. 단일 계좌에 거래처 연속성·날짜 관측 2개 이상이면 high, 그 외는 medium. 규칙은 high/`registered_rule`. 근거는 `same_payment_method`, `within_day_window`, `merchant_seen`, `amount_within_band`. 스냅샷 부재/숨김만으로 원장 이력을 지우지 않는다.
- 발견 후보: `payment_method`의 앞뒤 공백과 대소문자를 정리한 이름에 카드/card가 있으면 다른 표식과 관계없이 우선 후보로 포함한다. 명시 카드 표기가 없는 이름만 비어 있거나 계좌형(통장·예금·저축·적금·계좌·입출금·CMA·파킹), 선불/간편결제형(간편결제·선불·페이/pay·머니/money·포인트/point), 현금/cash 표식이 포함된 이름을 제외한다. 나머지는 짧은 이름도 사람 확인용 카드 후보로 본다. 이 판별만 바꾸며 원장 이름·결제열 그룹 키·생성 계획의 결제수단 표기는 보존한다. 활성 계획의 공통 predicate(정확 금액)에 맞는 행은 기존 연결 제안으로 보낸다. 정기 지급 소속은 `vw_transaction_nature.recurring_commitment_id`를 사용해 명시 소속·카테고리/거래처 규칙·유효 기간·개별 제외 계약을 그대로 따른다. 동일 결제수단과 정규화 거래처 또는 원문의 체인을 찾는다. 두 번째 이후 금액은 정확 일치, 첫 관측 차이는 `min(1000, max(100, monthly_amount // 100))` 이내다. 후보 월 금액은 최소 두 번 정확히 관측된 값만 허용한다. 월별 예정일 ±3일에 한 행씩 3회 이상 이어져야 하며 비어 있거나 같은 슬롯에 여러 거래면 연속 관측을 종료한다. 가장 긴 겹치지 않는 체인을 우선하며 같은 길이면 거래처 기준을 우선한다. 동일 키의 끊어진 반복 결제열은 한 번에 가장 긴 체인 하나만 제안하며 연결 뒤 남은 체인을 다시 검토할 수 있다. 첫 예정일은 첫 관측일 ±3일의 일정 중 관측 수 최대·전체 날짜 차이 최소를 제안한다. 첫 관측일이 원장 최소 일자+31일 이내면 `starts_at_data_window_edge=true`다. 총 횟수는 반환하지 않는다.
- 후보 키는 `[payment_method, continuity_kind + normalized_identity, monthly_amount]`의 SHA-256이다. 날짜·거래 ID를 포함하지 않아 같은 결제열의 재업로드/추가/이전 관측 보강에도 유지하며 같은 키의 반복 결제열도 명시 복원까지 기각한다. `installment_candidate_reviews`는 업로드 검토 digest/되돌리기 범위에 자동 포함된다. 재업로드가 사람이 등록한 기각을 초기화하지 않는다. 이 테이블이 없던 과거 업로드 검토는 재준비해야 하며, 과거 되돌리기 지점은 기존 `schema_changed` 보호에 따라 복원을 거절한다. 배포 전 DB 백업은 별도로 유지한다.
- 후보 생성 입력의 거래 ID 집합은 최신 후보 전체와 같아야 한다. 사람이 확인한 첫 납부일/총 횟수의 각 최근접 예정일에 ±3일 안으로 들어가고 회차가 중복되지 않아야 한다. 계획·모든 수동 연결은 함께 커밋된다. 첫 납부일을 과거로 조정하면 관측 첫 행은 1보다 큰 회차일 수 있다.
- 일괄 확인은 조회 결과를 그대로 신뢰하지 않고 잠금 뒤 다시 제안을 계산한다. 할부는 모든 활성 계획의 점유·다중 매칭·같은 슬롯 경쟁을 검사한 high만 허용한다. 대출도 요청 계좌와 현재 단일 제안을 대조한다. 이미 연결된 수동 링크는 후보에서 제외되어 덮어쓰지 않는다. 입력 중복 422, 변경/충돌 409. GET은 쓰지 않으며 이력/발견 결과를 자동 적용하지 않는다.
- 상세 URL·요청·응답은 `backend-api-ssot.md`의 T065 PR2 절을 따른다. 프런트엔드 일괄 확인 범위는 현재 페이지(대출은 선택이 있으면 그 선택)의 high 추천이며, 수정한 할부 제안은 일괄 대상에서 제외한다. 거래처 규칙 추가는 연결 확인 후 별도의 사람 클릭으로 기존 upsert를 사용한다.


### T066 정기 지급 정리·접두 매칭

계약 상세는 [정기 지급 API](backend-api-ssot.md#nature-axes-t056-지급-형태--조정-가능성)를 따른다. 0045는 `recurring_commitments.merchant_match`를 NOT NULL·server_default exact로 추가하고 `vw_transaction_nature`의 규칙 서브쿼리만 교체한다. 다른 뷰는 교체하지 않는다. downgrade는 직전 뷰 정의를 복원한 뒤 컬럼을 제거한다. 기존 exact 거래 매칭과 수치 산식은 유지한다.

공통 `commitment_match_predicate`/`commitment_match_order`를 뷰와 `nature_axes_service.find_rule_commitment_id`가 함께 사용한다. 월말 전망·약정 읽기·할부 후보는 그 뷰의 최종 commitment id를 사용하므로 별도 merchant 매처를 만들지 않는다. prefix는 공백(스페이스/탭/개행/CR) 제거·소문자화 뒤 `substr(merchant, 1, length(prefix)) = prefix`로 비교해 SQL LIKE 특수문자도 문자 그대로 처리한다. exact는 종전 문자열 동등 비교를 유지한다. 규칙 순서는 exact → 긴 prefix → category → id다. 월말 이후 전망은 추가하지 않는다.

관측은 `vw_transaction_nature`의 유효 거래 행(모든 통화)을 약정 id별 count/min(date)/max(date)로 집계한다. 삭제·병합·superseded 거래를 제외하고 기존 정기 지급 편집 화면의 member 집계와 같다. 월 흐름표의 KRW 금액·환불 귀속 line 수와는 구분한다. low_observation은 이행 출처·미확인·관측 ≤1 조건이며 반복성 판정이 아니다.

합치기 제안은 merchant 범위의 거래처 끝 ASCII 숫자를 제거하고 공백 제거·소문자화한 줄기를 카테고리 major/minor와 묶는다. 제안 대상 id는 최소 id이며 사용자가 다른 대상을 고를 수 있다. 생성/수정/합치기에서 prefix는 정규화 후 최소 2글자다. 합치기·일괄 삭제는 인증된 한 트랜잭션과 공통 설정 lock 안에서 실행한다. 합치기의 대상 속성 유지·충돌 시 확인 해제·source 명시 연결 이전, 삭제 시 override 보존/제거 규칙은 SSOT와 같다. 자동 삭제·합치기·확인은 없다.


## 일회성 지출 묶음 (T067)

`one_off_event_members.transaction_id`는 직접 소속의 키이며 거래마다 한
묶음만 지정한다. 금액은 `vw_metric_flow_lines.one_off_event_id`로 읽는다.
유효 KRW 지출 줄 중 약정이 없는 줄에만 `attributed_transaction_id`의
직접 소속을 적용한다. 확정 배분 환불은 원구매 묶음에 게시월 지출 차감으로
반영하고 환불 잔액은 환불 자체의 묶음에 반영한다.

직접 소속 상세의 상태는 `counted`, `fully_allocated`, `committed_now`,
`inactive`다. 약정 전환 및 비활성은 소속을 보존하며 자격을 되찾으면 다시
집계한다. 교체 재가져오기는 소속을 새 거래로 이동한다. 기존 정산 배분은
교체 결과에 따라 유효 줄에서 제외된다. 업로드 되돌리기와 검토 업로드
상태 해시는 두 표를 포함한다.

0046은 `vw_metric_flow_lines`에 `one_off_event_id`를 추가한다.
`vw_monthly_flow_summary`의 `month_status` 뒤에 일회성 순지출 합계
`one_off_total`, `total_outflow - one_off_total`인 `ongoing_outflow`,
`living_spend - one_off_total`인 `ongoing_living_spend`를 붙인다.

월 흐름 비교의 경상 기준값은 월별 차감으로 얻은 값의 중앙값이다. 일회성
지출만 있는 달의 경상 값은 0이다. 자료 없는 달의 대상 금액은 null이다.
변화 기여의 `one_off=exclude`는 대상, 기준 및 12개월 창의 모든 집계에
같은 제외 조건을 적용한다. `include`로 총지출 비교를 선택할 수 있다.
`one_off.target_events`와 `baseline_values`는 카테고리·조정 가능성·경과일
조건을 그대로 사용한 순액 참고값이다.

연간성 월 환산은 첫 월별 집계에 앞서 일회성 줄을 제외한다. 한도 대비는
전체 실적과 동일한 차이를 사용하며 그중 일회성 순액을 `one_off_amount`로
제공한다. 사후 검토의 구매 후보와 거래처·카테고리 합계는 구매 순액을
사용하며 일회성 구매를 제외한다. 카테고리 이상은 환불 게시월에 귀속된
유효 일회성 줄을 대상과 기준 양쪽에서 제외한다.

전망은 유효 일회성 줄을 대출 거래처 규칙, 할부 계획 매칭, 미확인 할부
표시보다 먼저 분리한다. 과거 변동 기준선, 잔여일 중앙값, 연간성 후보,
남은 지출의 조정 가능성 가중치와 미연결 대출 경고에서 제외한다. 현재
일회성 실적은 관측 총지급과 변동 실적 구성요소에서 한 번 집계한다.
되짚기의 `variable_ongoing_actual`은 변동 실적에서 이 일회성 실적을
차감한 값이다. CLI는 금액 표시를 요청했을 때 이 값을 보여 준다.
