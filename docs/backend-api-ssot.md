# Backend/API SSOT

이 문서는 **현재 코드 기준의 live backend/API contract**를 요약한 SSOT다.

우선순위:

1. backend 구현 코드 (`backend/app/api/v1/**`, `backend/app/services/**`, `backend/app/schemas/**`)
2. 이 문서
3. `PRD.md`
4. 과거 planning 문서

과거 기획 문서가 이 문서와 충돌하면, 이 문서와 코드가 우선한다.

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
  - `POST /api/v1/transactions`
  - `PATCH /api/v1/transactions/bulk-update`
  - `PATCH /api/v1/transactions/{id}`
  - `DELETE /api/v1/transactions/{id}`
  - `POST /api/v1/transactions/{id}/restore`
  - `POST /api/v1/transactions/merge`
  - `PUT /api/v1/transactions/{id}/loan-link`
  - `DELETE /api/v1/transactions/{id}/loan-link`
  - `PUT /api/v1/transactions/loan-links/bulk`
  - `PATCH /api/v1/loan-accounts`
  - `POST /api/v1/data/reset`

## Live Endpoints

### System

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/health` | live | healthcheck |
| `GET` | `/api/v1/schema` | live | API key required |

### Upload / Operations

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/upload/logs` | live | 최근 10건 반환 |
| `POST` | `/api/v1/upload` | live | multipart + `snapshot_date` required |
| `POST` | `/api/v1/data/reset` | live | `transactions_only` / `transactions_and_snapshots` |
| `GET` | `/api/v1/settings/analytics` | live | API key required, analytics defaults/saved/effective values |
| `PATCH` | `/api/v1/settings/analytics` | live | API key required, persisted analytics settings |
| `GET` | `/api/v1/auto-classification/settings` | live | API key required, upload auto-apply toggles |
| `PATCH` | `/api/v1/auto-classification/settings` | live | API key required, persist upload auto-apply toggles |
| `GET` | `/api/v1/auto-classification/category-rules` | live | API key required, category-to-cost-kind rules |
| `POST` | `/api/v1/auto-classification/category-rules` | live | API key required, upsert a category rule |
| `DELETE` | `/api/v1/auto-classification/category-rules/{id}` | live | API key required |
| `POST` | `/api/v1/auto-classification/apply/category-rules` | live | API key required, apply rules to non-manual transactions |
| `GET` | `/api/v1/auto-classification/loan-merchant-rules` | live | API key required, exact merchant-to-loan rules |
| `POST` | `/api/v1/auto-classification/loan-merchant-rules` | live | API key required, upsert a merchant rule |
| `DELETE` | `/api/v1/auto-classification/loan-merchant-rules/{id}` | live | API key required |
| `POST` | `/api/v1/auto-classification/apply/loan-merchant-rules` | live | API key required, auto-link non-manual loan mappings |

### Transactions Read

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/transactions` | live | pagination, search, edited/deleted/merged filters 지원 |
| `GET` | `/api/v1/transactions/filter-options` | live | category/payment method distinct options |
| `GET` | `/api/v1/transactions/summary` | live | `group_by=month|week|day` |
| `GET` | `/api/v1/transactions/by-category` | live | `level=major|minor`, `type=지출|수입|이체|all` |
| `GET` | `/api/v1/transactions/by-category/timeline` | live | timeline aggregate |
| `GET` | `/api/v1/transactions/payment-methods` | live | payment method aggregate |
| `GET` | `/api/v1/loan-transaction-links` | live | loan repayment candidate worklist, linked/unlinked filters |

### Transactions Write

| Method | Path | Status | Notes |
|---|---|---|---|
| `POST` | `/api/v1/transactions` | live | manual transaction create |
| `PATCH` | `/api/v1/transactions/bulk-update` | live | merchant/category/cost kind/fixed necessity/recurring payment kind/memo |
| `PATCH` | `/api/v1/transactions/{id}` | live | merchant/category/cost kind/fixed necessity/recurring payment kind/memo |
| `DELETE` | `/api/v1/transactions/{id}` | live | soft delete |
| `POST` | `/api/v1/transactions/{id}/restore` | live | restore soft-deleted row |
| `GET` | `/api/v1/transactions/{id}/loan-link` | live | transaction-to-loan repayment mapping |
| `PUT` | `/api/v1/transactions/{id}/loan-link` | live | API key required, upsert one transaction-to-loan mapping |
| `DELETE` | `/api/v1/transactions/{id}/loan-link` | live | API key required, remove mapping |
| `PUT` | `/api/v1/transactions/loan-links/bulk` | live | API key required, map selected transactions to one loan account |
| `PATCH` | `/api/v1/loan-accounts` | live | API key required, update loan account display name and loan kind |
| `POST` | `/api/v1/transactions/merge` | stub | `501 Not Implemented` |

### Assets / Snapshots

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/assets/snapshots` | live | query param 없음, snapshot totals list |
| `GET` | `/api/v1/assets/net-worth-history` | live | query param 없음 |
| `GET` | `/api/v1/assets/snapshot-compare` | live | `comparison_mode` optional, default `latest_available_vs_previous_available` |
| `GET` | `/api/v1/investments/summary` | live | optional `snapshot_date`; omitted면 latest |
| `GET` | `/api/v1/loans/summary` | live | optional `snapshot_date`; omitted면 latest |
| `GET` | `/api/v1/loan-accounts` | live | stable loan account candidates from mapped accounts + loan snapshots |

### Advisor Analytics

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/analytics/monthly-cashflow` | live | P0 |
| `GET` | `/api/v1/analytics/category-mom` | live | P0 |
| `GET` | `/api/v1/analytics/fixed-cost-summary` | live | P0 |
| `GET` | `/api/v1/analytics/fixed-cost-trend` | live | monthly fixed/variable and essential/discretionary fixed-cost trend |
| `GET` | `/api/v1/analytics/merchant-spend` | live | P0 |
| `GET` | `/api/v1/analytics/payment-method-patterns` | live | P1 shipped |
| `GET` | `/api/v1/analytics/income-stability` | live | P1 shipped |
| `GET` | `/api/v1/analytics/recurring-payments` | live | P1 shipped |
| `GET` | `/api/v1/analytics/spending-anomalies` | live | P1 shipped |

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
  - `cost_classification_source`
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
  - `recurring_payment_kind`
  - `effective_category_major`
  - `effective_category_minor`
  - `is_edited`

### Recurring Payment Classification

- `recurring_payment_kind` is a manual transaction-level classification.
- Supported values:
  - `installment`: installment/할부 repayment-like recurring charge
  - `monthly_recurring`: a fresh monthly recurring charge such as utilities or subscriptions
- `GET /api/v1/analytics/recurring-payments` groups by merchant and returns transaction ids plus classification counts. The operations recurring-classification screen uses those ids for bulk updates; insights surfaces display the saved result only.
- Automatic recurring-payment classification is not live. The auto-classification surface currently covers fixed/variable cost rules and loan merchant rules, not `recurring_payment_kind`.

### Auto Classification

- Category rules live in `category_classification_rules`.
- Category rules match effective category values, so `category_major_user/category_minor_user` take precedence over imported categories.
- Applying category rules writes `transactions.cost_kind`, `transactions.fixed_cost_necessity`, and `transactions.cost_classification_source='auto'`.
- User edits through transaction update/bulk-update write `cost_classification_source='manual'`; later auto-apply never overwrites those manual rows.
- Loan merchant rules live in `loan_merchant_rules` and exact-match `transactions.merchant`.
- Applying loan merchant rules creates or updates only missing/auto loan links. Existing `loan_transaction_links.source='manual'` rows are preserved.
- Upload auto-apply toggles live in `auto_classification_settings`; when enabled, upload success runs the matching rule application after transaction import.

### Snapshot Import Behavior

- 업로드는 `snapshot_date`를 필수로 받는다.
- snapshot 적재는 문서상 UPSERT처럼 보일 수 있지만, **현재 구현은 해당 `snapshot_date` 행을 먼저 삭제한 뒤 새 파싱 결과 전체를 다시 insert** 한다.
- 즉, contract는 실질적으로 “date-scoped replace”다.

### Analytics Settings

- `GET /api/v1/settings/analytics` 와 `PATCH /api/v1/settings/analytics` 는 `X-API-Key` 인증이 필요하다.
- 현재 persisted setting 범위는 `spending_anomalies` 다.
- 응답은 `defaults`, `saved`, `effective` 를 나눠 반환한다.
- 지원 필드:
  - `min_delta_amount` default `100000`
  - `anomaly_threshold` default `0.5`
  - `baseline_months` default `3`
- `PATCH` 에서 값을 지정하면 저장되고, `null` 로 보내면 해당 저장값을 삭제해 code default로 되돌린다.
- `GET /api/v1/analytics/spending-anomalies` 의 설정 해석 순서는 `명시적 query param > persisted setting > code default` 다.

### Investment / Loan Summary

- `snapshot_date`는 선택값이다.
- `snapshot_date`를 생략하면 latest snapshot을 사용한다.
- 문자열 `latest`를 query parameter 값으로 보내는 contract는 현재 구현에 없다.

### Assets Snapshot Endpoints

- `GET /api/v1/assets/snapshots`
- `GET /api/v1/assets/net-worth-history`
- `GET /api/v1/assets/snapshot-compare`

위 세 endpoint는 현재 `start_date` / `end_date` filter를 받지 않는다.

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
- `UPLOAD_DIR` 기본값은 `/data/uploads` 이다.
- 저장 파일명은 `upload_logs.id` 기반 prefix와 안전화된 원본 파일명을 사용한다. 예: `000123-finance-sample.xlsx`
- 저장 후 같은 디렉터리의 파일은 최신 5개만 남기고 오래된 파일을 삭제한다.
- 직접 service helper를 호출하는 테스트/스크립트 경로는 `persist_upload_file=True` 를 명시한 경우에만 원본 파일을 저장한다.

### Reset / Upload Logs Semantics

- `POST /api/v1/data/reset` 는 transaction/snapshot current state만 삭제한다.
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
