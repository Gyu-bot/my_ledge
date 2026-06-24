# Backend/API SSOT

이 문서는 **현재 코드 기준의 live backend/API contract**를 요약한 SSOT다.

우선순위:

1. backend 구현 코드 (`backend/app/api/v1/**`, `backend/app/services/**`, `backend/app/schemas/**`)
2. 이 문서
3. `PRD.md`
4. 과거 planning 문서

과거 기획 문서가 이 문서와 충돌하면, 이 문서와 코드가 우선한다.
에이전트가 API/canonical view 값의 의미와 계산식을 해석할 때는 [agents/canonical-read-surface-reference.md](agents/canonical-read-surface-reference.md)를 함께 본다.

## Scope

- FastAPI `/api/v1` live endpoint
- request/response contract의 현재 구현 상태
- 문서와 코드가 어긋나기 쉬운 동작 메모

## Auth Rules

- 인증 없음
  - `GET /api/v1/health`
  - read-only 조회 endpoint 대부분
- `X-API-Key` 필요
  - `POST /api/v1/upload`
  - `GET /api/v1/schema`
  - `GET /api/v1/canonical-views/dashboard`
  - `GET /api/v1/settings/analytics`
  - `PATCH /api/v1/settings/analytics`
  - `GET /api/v1/auto-classification/settings`
  - `PATCH /api/v1/auto-classification/settings`
  - `GET /api/v1/auto-classification/category-rules`
  - `POST /api/v1/auto-classification/category-rules`
  - `DELETE /api/v1/auto-classification/category-rules/{id}`
  - `POST /api/v1/auto-classification/apply/category-rules`
  - `GET /api/v1/auto-classification/loan-merchant-rules`
  - `POST /api/v1/auto-classification/loan-merchant-rules`
  - `DELETE /api/v1/auto-classification/loan-merchant-rules/{id}`
  - `POST /api/v1/auto-classification/apply/loan-merchant-rules`
  - `GET /api/v1/auto-classification/merchant-alias-rules`
  - `POST /api/v1/auto-classification/merchant-alias-rules`
  - `DELETE /api/v1/auto-classification/merchant-alias-rules/{id}`
  - `POST /api/v1/auto-classification/apply/merchant-alias-rules`
  - `GET /api/v1/auto-classification/recurring-category-rules`
  - `POST /api/v1/auto-classification/recurring-category-rules`
  - `DELETE /api/v1/auto-classification/recurring-category-rules/{id}`
  - `GET /api/v1/auto-classification/recurring-category-rules/dry-run`
  - `POST /api/v1/auto-classification/apply/recurring-category-rules`
  - `POST /api/v1/auto-classification/apply/recurring-dry-run`
  - `POST /api/v1/transactions`
  - `PATCH /api/v1/transactions/bulk-update`
  - `POST /api/v1/transactions/bulk-delete/preview`
  - `POST /api/v1/transactions/bulk-delete`
  - `POST /api/v1/transactions/bulk-restore/preview`
  - `POST /api/v1/transactions/bulk-restore`
  - `PATCH /api/v1/transactions/{id}`
  - `DELETE /api/v1/transactions/{id}`
  - `POST /api/v1/transactions/{id}/restore`
  - `POST /api/v1/transactions/merge`
  - `PUT /api/v1/transactions/{id}/loan-link`
  - `DELETE /api/v1/transactions/{id}/loan-link`
  - `PUT /api/v1/transactions/loan-links/bulk`
  - `PATCH /api/v1/loan-accounts`
  - `POST /api/v1/installment-plans`
  - `PATCH /api/v1/installment-plans/{id}`
  - `PUT /api/v1/transactions/{id}/installment-link`
  - `DELETE /api/v1/transactions/{id}/installment-link`
  - `PUT /api/v1/transactions/installment-links/bulk`
  - `PATCH /api/v1/assets/snapshots/{asset_snapshot_id}/liquidity`
  - `PATCH /api/v1/loans/{loan_id}/repayment-metadata`
  - `PATCH /api/v1/analytics/purchase-gate-candidates/{candidate_key}/review`
  - `POST /api/v1/data/reset`

## Live Endpoints

### System

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/health` | live | healthcheck |
| `GET` | `/api/v1/schema` | live | API key required |
| `GET` | `/api/v1/canonical-views/dashboard` | live | API key required, canonical view row dashboard, optional `reference_date`, data coverage, complete-month flags, current-month estimated true-spendable enrichment |

### Upload / Operations

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/upload/logs` | live | 최근 10건 반환 |
| `POST` | `/api/v1/upload` | live | multipart + `snapshot_date` required |
| `POST` | `/api/v1/data/reset` | live | `transactions_only` / `transactions_and_snapshots` |
| `GET` | `/api/v1/profile` | live | latest BankSalad `1.고객정보` profile snapshot; stores gender/age/KCB score only, not name/email |
| `GET` | `/api/v1/settings/analytics` | live | API key required, analytics defaults/saved/effective values |
| `PATCH` | `/api/v1/settings/analytics` | live | API key required, persisted analytics settings |
| `GET` | `/api/v1/auto-classification/settings` | live | API key required, upload auto-apply toggles |
| `PATCH` | `/api/v1/auto-classification/settings` | live | API key required, persist upload auto-apply toggles |
| `GET` | `/api/v1/auto-classification/category-rules` | live | API key required, category-to-cost-kind rules |
| `POST` | `/api/v1/auto-classification/category-rules` | live | API key required, upsert a category rule |
| `DELETE` | `/api/v1/auto-classification/category-rules/{id}` | live | API key required |
| `POST` | `/api/v1/auto-classification/apply/category-rules` | live | API key required, apply rules to non-manual transactions |
| `GET` | `/api/v1/auto-classification/loan-merchant-rules` | live | API key required, exact merchant/description-to-loan rules |
| `POST` | `/api/v1/auto-classification/loan-merchant-rules` | live | API key required, upsert a loan match rule |
| `DELETE` | `/api/v1/auto-classification/loan-merchant-rules/{id}` | live | API key required |
| `POST` | `/api/v1/auto-classification/apply/loan-merchant-rules` | live | API key required, auto-link non-manual loan mappings |
| `GET` | `/api/v1/auto-classification/merchant-alias-rules` | live | API key required, merchant alias normalization rules |
| `POST` | `/api/v1/auto-classification/merchant-alias-rules` | live | API key required, upsert an alias-pattern rule |
| `DELETE` | `/api/v1/auto-classification/merchant-alias-rules/{id}` | live | API key required |
| `POST` | `/api/v1/auto-classification/apply/merchant-alias-rules` | live | API key required, normalize transaction merchants |
| `GET` | `/api/v1/auto-classification/recurring-category-rules` | live | API key required, category-to-recurring-kind rules |
| `POST` | `/api/v1/auto-classification/recurring-category-rules` | live | API key required, upsert a recurring category rule |
| `DELETE` | `/api/v1/auto-classification/recurring-category-rules/{id}` | live | API key required |
| `POST` | `/api/v1/auto-classification/apply/recurring-category-rules` | live | API key required, apply rules to recurring candidates or fixed costs only |
| `GET` | `/api/v1/auto-classification/recurring-category-rules/dry-run` | live | API key required, preview recurring rule proposals and matching transactions |
| `POST` | `/api/v1/auto-classification/apply/recurring-dry-run` | live | API key required, approve one dry-run proposal with explicit apply scope |

### Transactions Read

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/transactions` | live | pagination, search, edited/deleted/merged filters 지원 |
| `GET` | `/api/v1/transactions/filter-options` | live | category/payment method distinct options |
| `GET` | `/api/v1/transactions/summary` | live | `group_by=month|week|day`; response includes `basis` metadata for raw signed aggregation |
| `GET` | `/api/v1/transactions/by-category` | live | `level=major|minor`, `type=지출|수입|이체|all` |
| `GET` | `/api/v1/transactions/by-category/timeline` | live | timeline aggregate |
| `GET` | `/api/v1/transactions/payment-methods` | live | payment method aggregate |
| `GET` | `/api/v1/loan-transaction-links` | live | loan repayment candidate worklist, linked/unlinked filters |
| `GET` | `/api/v1/installment-plans` | live | installment ledger entries |
| `GET` | `/api/v1/installment-transaction-links` | live | installment candidate worklist, linked/unlinked filters |
| `GET` | `/api/v1/transactions/{id}/installment-link` | live | transaction-to-installment mapping |
| `GET` | `/api/v1/installments/forecast` | live | installment schedule forecast with observed/projected/missed states |

### Transactions Write

| Method | Path | Status | Notes |
|---|---|---|---|
| `POST` | `/api/v1/transactions` | live | manual transaction create |
| `PATCH` | `/api/v1/transactions/bulk-update` | live | merchant/category/cost kind/spend necessity/fixed necessity/recurring payment kind/memo |
| `POST` | `/api/v1/transactions/bulk-delete/preview` | live | API key required, preview count/period/expense/representative merchants before soft delete |
| `POST` | `/api/v1/transactions/bulk-delete` | live | API key required, soft delete selected active rows and return preview summary |
| `POST` | `/api/v1/transactions/bulk-restore/preview` | live | API key required, preview selected deleted rows before restore |
| `POST` | `/api/v1/transactions/bulk-restore` | live | API key required, restore selected deleted rows and return preview summary |
| `PATCH` | `/api/v1/transactions/{id}` | live | merchant/category/cost kind/spend necessity/fixed necessity/recurring payment kind/memo |
| `DELETE` | `/api/v1/transactions/{id}` | live | soft delete |
| `POST` | `/api/v1/transactions/{id}/restore` | live | restore soft-deleted row |
| `GET` | `/api/v1/transactions/{id}/loan-link` | live | transaction-to-loan repayment mapping |
| `PUT` | `/api/v1/transactions/{id}/loan-link` | live | API key required, upsert one transaction-to-loan mapping |
| `DELETE` | `/api/v1/transactions/{id}/loan-link` | live | API key required, remove mapping |
| `PUT` | `/api/v1/transactions/loan-links/bulk` | live | API key required, map selected transactions to one loan account |
| `PATCH` | `/api/v1/loan-accounts` | live | API key required, update loan account display name, loan kind, and user hidden state |
| `POST` | `/api/v1/installment-plans` | live | API key required, create an installment ledger entry |
| `PATCH` | `/api/v1/installment-plans/{id}` | live | API key required, update installment ledger metadata |
| `PUT` | `/api/v1/transactions/{id}/installment-link` | live | API key required, upsert one transaction-to-installment mapping |
| `DELETE` | `/api/v1/transactions/{id}/installment-link` | live | API key required, remove installment mapping |
| `PUT` | `/api/v1/transactions/installment-links/bulk` | live | API key required, sequentially map selected transactions to one installment plan |
| `POST` | `/api/v1/transactions/merge` | stub | `501 Not Implemented` |

### Assets / Snapshots

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/assets/snapshots` | live | query param 없음, `items` snapshot totals + latest snapshot `asset_items` editable asset rows |
| `GET` | `/api/v1/assets/net-worth-history` | live | query param 없음 |
| `GET` | `/api/v1/assets/snapshot-compare` | live | `comparison_mode` optional, default `latest_available_vs_previous_available` |
| `GET` | `/api/v1/investments/summary` | live | optional `snapshot_date`; omitted면 latest; items include `pct_of_investment_total` |
| `GET` | `/api/v1/insurance/summary` | live | optional `snapshot_date`; omitted면 latest; latest insurance contracts + recent closed-month insurance premium estimate + empty-state metadata |
| `GET` | `/api/v1/loans/summary` | live | optional `snapshot_date`; omitted면 latest; active-loans-only scope metadata; user-hidden accounts are excluded |
| `GET` | `/api/v1/loan-accounts` | live | stable loan account candidates from mapped accounts + loan snapshots, with active/historical/user-hidden lifecycle metadata; `include_hidden` optional |
| `GET` | `/api/v1/analytics/net-worth-breakdown` | live | optional `snapshot_date`; latest if omitted |
| `GET` | `/api/v1/analytics/liquidity-health` | live | optional `snapshot_date`, `monthly_required_spend`, `monthly_income`; omitted spend/income derive from closed-month data and expose source metadata |
| `PATCH` | `/api/v1/assets/snapshots/{asset_snapshot_id}/liquidity` | live | API key required, update `liquidity_tier` and `is_cash_equivalent` |
| `PATCH` | `/api/v1/loans/{loan_id}/repayment-metadata` | live | API key required, update `monthly_payment` / `repayment_method` and mark changed fields as `manual` source |

### Advisor Analytics

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/analytics/monthly-cashflow` | live | P0 |
| `GET` | `/api/v1/analytics/category-mom` | live | P0 |
| `GET` | `/api/v1/analytics/fixed-cost-summary` | live | P0 |
| `GET` | `/api/v1/analytics/fixed-cost-trend` | live | monthly fixed/variable and essential/discretionary spend trend |
| `GET` | `/api/v1/analytics/merchant-spend` | live | P0 |
| `GET` | `/api/v1/analytics/payment-method-patterns` | live | P1 shipped |
| `GET` | `/api/v1/analytics/income-stability` | live | P1 shipped |
| `GET` | `/api/v1/analytics/recurring-payments` | live | P1 shipped |
| `GET` | `/api/v1/analytics/spending-anomalies` | live | P1 shipped |
| `GET` | `/api/v1/analytics/discretionary-velocity` | live | discretionary spend pace against closed-month prorated baseline |
| `GET` | `/api/v1/analytics/purchase-gate-candidates` | live | discretionary purchase review queue; one row per transaction; optional `review_status` |
| `GET` | `/api/v1/analytics/spending-review-candidates` | live | preferred alias for post-transaction spending review candidates; same contract as legacy purchase-gate path |
| `PATCH` | `/api/v1/analytics/purchase-gate-candidates/{candidate_key}/review` | live | API key required, persist review status, memo, reviewed_at, cooldown_until under canonical `transaction:{transaction_id}` key |

## Key Contract Notes

### Transactions

- `GET /api/v1/transactions` supports:
  - `start_date`
  - `end_date`
  - `type`
  - `source`
  - `category_major`
  - `payment_method`
  - `cost_kind`
  - `fixed_cost_necessity`
  - `spend_necessity`
  - `recurring_payment_kind`
  - `is_edited`
  - `include_deleted`
  - `include_merged`
  - `search`
  - `page`
  - `per_page`
- Transaction response includes live fields that matter to frontend/workbench:
  - `merchant`
  - `cost_kind`
  - `fixed_cost_necessity`
  - `spend_necessity`
  - `recurring_payment_kind`
  - `effective_category_major`
  - `effective_category_minor`
  - `is_edited`

### Recurring Payment Classification

- `recurring_payment_kind` is a manual transaction-level classification.
- Supported values:
  - `installment`: installment/할부 repayment-like recurring charge
  - `monthly_recurring`: a fresh monthly recurring charge such as utilities or subscriptions
  - `not_recurring`: explicitly reviewed non-recurring merchant activity
- `GET /api/v1/analytics/recurring-payments` groups by merchant and returns transaction ids plus classification counts. The operations recurring-classification screen uses those ids for bulk updates; insights surfaces display the saved result only.
- Category-based recurring-payment classification is live via `recurring_category_rules`. It only fills unclassified `recurring_payment_kind` values for transactions whose merchant passes the recurring-candidate gate or whose `cost_kind='fixed'`; explicit manual/previous values are preserved.
- `GET /api/v1/auto-classification/recurring-category-rules/dry-run` returns group proposals with `merchant`, `proposed_kind`, `confidence`, `matched_transactions`, `reason`, `category_hint`, and `apply_scope_options`.
- `POST /api/v1/auto-classification/apply/recurring-dry-run` applies one proposal. The default `apply_scope` is `all_matching`, which backfills matching existing rows; `future_only` stores no historical row mutation and is an explicit no-op for current rows until a future-rule store exists.

### Auto Classification

- Category rules live in `category_classification_rules`.
- Category rules match effective category values, so `category_major_user/category_minor_user` take precedence over imported categories.
- Applying category rules writes `transactions.cost_kind`, `transactions.fixed_cost_necessity` for fixed rules, `transactions.spend_necessity`, and `transactions.cost_classification_source='auto'`.
- User edits through transaction update/bulk-update write `cost_classification_source='manual'`; later auto-apply never overwrites those manual rows.
- Loan merchant rules live in `loan_merchant_rules` and exact-match either `transactions.merchant` or `transactions.description` according to `match_field`.
- `match_field='merchant'` means the analysis/canonical merchant value, which can be normalized by merchant alias rules or edited by the user. `match_field='description'` means the imported raw transaction description.
- `loan_merchant_rules` are unique by `(match_field, merchant)`. The `merchant` column stores the exact match value for the selected field.
- If both a merchant-based and description-based rule match the same transaction, the merchant-based rule wins.
- Applying loan merchant rules creates or updates only missing/auto loan links. Existing `loan_transaction_links.source='manual'` rows are preserved.
- Merchant alias rules live in `merchant_alias_rules`. Applying them does a case-insensitive contains match on raw `transactions.description` and writes the canonical `normalized_merchant` into `transactions.merchant`.
- Merchant alias application only updates rows whose `merchant == description`, so user-edited analysis merchants are preserved by default.
- Upload auto-apply toggles live in `auto_classification_settings`; when enabled, upload success runs the matching rule application after transaction import.

### Spend Necessity

- `cost_kind` and `spend_necessity` are independent axes:
  - `cost_kind`: repeatability/predictability (`fixed` or `variable`)
  - `spend_necessity`: need/control axis (`essential` or `discretionary`)
- For `cost_kind='variable'`, omitted or null `spend_necessity` is normalized to `discretionary`. Variable expense is `essential` only when explicitly selected.
- `fixed_cost_necessity` remains a compatibility field for fixed costs. New summary surfaces use `spend_necessity` for both fixed and variable expenses.
- Required spend is interpreted as `essential_fixed_total + essential_variable_total + loan_repayment_total`.
- Discretionary spend is interpreted as `discretionary_fixed_total + discretionary_variable_total`.

### Installment Management

- Installment plans live in `installment_plans` and represent a user-managed ledger entry with `display_name`, `merchant`, optional `payment_method`, `total_installments`, `monthly_amount`, `first_payment_date`, `status`, and `memo`.
- Installment transaction links live in `installment_transaction_links`; one transaction can link to one plan, and each `(installment_plan_id, installment_number)` can be used once.
- `GET /api/v1/installment-transaction-links` returns expense candidates where `recurring_payment_kind='installment'` or an installment link already exists. It supports `linked`, date, search, plan, and pagination filters.
- The recurring-classification screen may classify a merchant group as `installment`, but the ledger, installment count, per-transaction installment number, and forecast are managed through installment plan/link APIs.
- `GET /api/v1/installments/forecast` derives the schedule from `first_payment_date + total_installments`. Linked installments are `observed`, unlinked future or current installments are `projected`, and past unlinked installments are `missed`.
- Forecast totals are a projection surface. Existing cashflow/canonical views stay observation-only, so projected installment totals must not be double-counted with already observed transactions.

### Purchase Gate

- Purchase gate candidates are a discretionary purchase review queue, not a final purchase allow/deny decision.
- Candidate generation excludes loan-linked transactions, fixed costs, essential variable expenses, and rows whose `spend_necessity` is still unclassified.
- A transaction appears once even if it triggers multiple signals. `candidate_type` is the representative reason, while `candidate_types[]`, `reasons[]`, and namespaced `signals` carry every matched reason.
- Canonical review keys are `transaction:{transaction_id}`. Legacy reason keys such as `large_oneoff:42` are still read as fallback state, but new writes store the canonical key.

### Snapshot Import Behavior

- 업로드는 `snapshot_date`를 필수로 받는다.
- snapshot 적재는 문서상 UPSERT처럼 보일 수 있지만, **현재 구현은 해당 `snapshot_date` 행을 먼저 삭제한 뒤 새 파싱 결과 전체를 다시 insert** 한다.
- 즉, contract는 실질적으로 “date-scoped replace”다.
- same-date snapshot replace preserves saved asset liquidity metadata and loan repayment metadata sources where possible, then reruns linked-loan repayment estimation for the latest affected loan snapshots.

### Loan Repayment Metadata Source

- `loans.monthly_payment_source` and `loans.repayment_method_source` are nullable string sources exposed on loan summary and repayment metadata responses.
- Stored live values are `manual` and `estimated_from_linked_transactions`.
- Manual `PATCH /api/v1/loans/{loan_id}/repayment-metadata` marks only the supplied field sources as `manual`.
- After loan-link writes and snapshot imports, My Ledge estimates latest loan snapshot `monthly_payment` from linked repayment transaction monthly totals using the effective `asset_liability_health.monthly_payment_estimate_*` settings. Estimation uses completed months only; overdraft accounts (`loan_kind='overdraft'`) use a recent completed-month average, while other loan kinds use completed-month median.
- Auto-estimation never overwrites `monthly_payment_source='manual'`. When linked observations fall below the configured minimum, stale `estimated_from_linked_transactions` monthly payments are cleared. When all observed linked repayment months use `repayment_type='mixed'`, My Ledge can auto-fill `repayment_method='principal_interest'` with `repayment_method_source='estimated_from_linked_transactions'`; stale estimated repayment methods are cleared only when linked observations no longer support an inferred method.
- Loan summary also joins the stable `loan_accounts` row by `lender + product_name` and exposes nullable `loan_kind`. If the snapshot repayment method is missing or non-manual `unknown`, compatible `loan_kind` values can be used as a read-only display fallback with `repayment_method_source='derived_from_loan_account'`; this does not write back to `loans`.

### Analytics Settings

- `GET /api/v1/settings/analytics` 와 `PATCH /api/v1/settings/analytics` 는 `X-API-Key` 인증이 필요하다.
- persisted setting 범위는 `spending_anomalies`, `discretionary_velocity`, `purchase_gate`, `recurring_dry_run`, `asset_liability_health`, `bulk_operations` 다.
- 응답은 `defaults`, `saved`, `effective` 를 나눠 반환한다.
- `spending_anomalies` 지원 필드:
  - `min_delta_amount` default `100000`
  - `anomaly_threshold` default `0.5`
  - `baseline_months` default `3`
- `PATCH` 에서 값을 지정하면 저장되고, `null` 로 보내면 해당 저장값을 삭제해 code default로 되돌린다.
- `GET /api/v1/analytics/spending-anomalies` 의 설정 해석 순서는 `명시적 query param > persisted setting > code default` 다.
- sparse baseline에서는 `delta_pct_raw`와 user-facing `delta_pct_display`/`reason`이 분리된다. 매우 작은 baseline에서 과도한 percentage를 그대로 문장화하지 않는다.
- `discretionary_velocity` 기본값은 `baseline_months=6`, `warning_velocity_ratio=1.2`, `high_velocity_ratio=1.5`, `minimum_classification_coverage=0.7`.
- `purchase_gate` 기본값은 큰 지출 `100000`, 새 거래처 lookback 6개월, spike ratio `merchant=2.0`, `discretionary=1.5`, review cooldown 14일.
- `bulk_operations`는 preview/confirmation 기본 ON, `max_bulk_rows_without_extra_confirmation=100`.

### Investment / Loan Summary

- `snapshot_date`는 선택값이다.
- `snapshot_date`를 생략하면 latest snapshot을 사용한다.
- 문자열 `latest`를 query parameter 값으로 보내는 contract는 현재 구현에 없다.

### Assets Snapshot Endpoints

- `GET /api/v1/assets/snapshots`
- `GET /api/v1/assets/net-worth-history`
- `GET /api/v1/assets/snapshot-compare`

위 세 endpoint는 현재 `start_date` / `end_date` filter를 받지 않는다.
현재 live contract에는 asset/investment/loan raw snapshot row를 삭제, 숨김, 만기 처리, 병합하는 endpoint가 없다. `PATCH /api/v1/assets/snapshots/{asset_snapshot_id}/liquidity`는 최신 자산 row의 유동성 metadata만 수정한다. raw-data lifecycle과 multi-source provenance 관리는 [planned-work.md](planned-work.md)의 P2 계획으로 둔다.

### Snapshot Compare Contract

- live 비교 endpoint는 현재 `GET /api/v1/assets/snapshot-compare` 다.
- 과거 planning 문서에 있던 `GET /api/v1/analytics/snapshot-compare` 는 **현재 구현과 다르다**. live contract는 assets namespace를 기준으로 본다.
- 지원 mode:
  - `latest_available_vs_previous_available` (default)
  - `last_closed_month_vs_previous_closed_month`
  - `selected_snapshot_vs_baseline_snapshot`
- `selected_snapshot_vs_baseline_snapshot` 모드에서는 `snapshot_date`, `baseline_snapshot_date` 둘 다 필요하다. 하나라도 없으면 `422` 를 반환한다.
- 응답 메타데이터:
  - `comparison_mode`
  - `current`
  - `baseline`
  - `delta`
  - `comparison_days`
  - `is_partial`
  - `is_stale`
  - `can_compare`
  - `comparison_label`
- fallback 규칙:
  - snapshot이 1개뿐이면 `can_compare=false`, `baseline=null`, `delta=null`, `comparison_label="비교 기준 부족"`
  - default mode는 최신 snapshot과 직전 available snapshot을 비교한다
  - closed-month mode는 실제 month-end snapshot pair만 비교한다
  - latest comparison의 current snapshot이 month-end가 아니면 `is_partial=true`, `comparison_label="부분 기간"`
  - stale 판정은 현재 snapshot이 오늘 기준 35일보다 오래됐을 때다

### Upload Retention

- `POST /api/v1/upload` 는 import log commit 이후 원본 업로드 파일을 `UPLOAD_DIR` 에 저장한다.
- upload snapshot summary includes `asset_snapshots`, `insurance_contracts`, `investments`, and `loans`; `2.현금흐름현황` is verification evidence only and is not stored.
- `UPLOAD_DIR` 기본값은 `/data/uploads` 이다.
- 저장 파일명은 `upload_logs.id` 기반 prefix와 안전화된 원본 파일명을 사용한다. 예: `000123-finance-sample.xlsx`
- 저장 후 같은 디렉터리의 파일은 최신 5개만 남기고 오래된 파일을 삭제한다.
- 직접 service helper를 호출하는 테스트/스크립트 경로는 `persist_upload_file=True` 를 명시한 경우에만 원본 파일을 저장한다.

### Reset / Upload Logs Semantics

- `POST /api/v1/data/reset` 는 transaction/snapshot current state만 삭제한다. `transactions_and_snapshots` includes asset, insurance, investment, and loan snapshot tables.
- `upload_logs` 는 reset 대상이 아니다.
- reset response의 `upload_logs_retained` 는 현재 항상 `true` 다.
- 따라서 작업대의 최근 업로드 이력은 “현재 남아 있는 데이터”가 아니라 “최근 import 실행 history” 로 읽어야 한다.

## Document Status

- `PRD.md`
  - 제품 요구사항 문서
  - 구현 반영은 하되, low-level contract는 이 문서가 더 직접적이다
- `docs/planned-work.md`
  - 현재 미구현이지만 계획으로 유지하는 backlog 문서
  - live contract가 아니라 실행 우선순위와 보류/장기 항목 정리 기준이다
- `docs/archive/planning/finance-advisor-analytics-expansion.md`
  - historical planning 문서
  - 현재 live backend/API SSOT나 active backlog로 사용하지 않는다
- `docs/frontend-reimplementation-wireframe-functional-requirements.md`
  - frontend contract 참고 문서
  - backend/API SSOT 문서는 아니다
