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
  - `POST /api/v1/transactions`
  - `PATCH /api/v1/transactions/bulk-update`
  - `PATCH /api/v1/transactions/{id}`
  - `DELETE /api/v1/transactions/{id}`
  - `POST /api/v1/transactions/{id}/restore`
  - `POST /api/v1/transactions/merge`
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

### Transactions Read

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/transactions` | live | pagination, search, edited/deleted/merged filters 지원 |
| `GET` | `/api/v1/transactions/filter-options` | live | category/payment method distinct options |
| `GET` | `/api/v1/transactions/summary` | live | `group_by=month|week|day` |
| `GET` | `/api/v1/transactions/by-category` | live | `level=major|minor`, `type=지출|수입|이체|all` |
| `GET` | `/api/v1/transactions/by-category/timeline` | live | timeline aggregate |
| `GET` | `/api/v1/transactions/payment-methods` | live | payment method aggregate |

### Transactions Write

| Method | Path | Status | Notes |
|---|---|---|---|
| `POST` | `/api/v1/transactions` | live | manual transaction create |
| `PATCH` | `/api/v1/transactions/bulk-update` | live | merchant/category/cost kind/fixed necessity/memo |
| `PATCH` | `/api/v1/transactions/{id}` | live | merchant/category/cost kind/fixed necessity/memo |
| `DELETE` | `/api/v1/transactions/{id}` | live | soft delete |
| `POST` | `/api/v1/transactions/{id}/restore` | live | restore soft-deleted row |
| `POST` | `/api/v1/transactions/merge` | stub | `501 Not Implemented` |

### Assets / Snapshots

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/assets/snapshots` | live | query param 없음, snapshot totals list |
| `GET` | `/api/v1/assets/net-worth-history` | live | query param 없음 |
| `GET` | `/api/v1/assets/snapshot-compare` | live | `comparison_mode` optional, default `latest_available_vs_previous_available` |
| `GET` | `/api/v1/investments/summary` | live | optional `snapshot_date`; omitted면 latest |
| `GET` | `/api/v1/loans/summary` | live | optional `snapshot_date`; omitted면 latest |

### Advisor Analytics

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/analytics/monthly-cashflow` | live | P0 |
| `GET` | `/api/v1/analytics/category-mom` | live | P0 |
| `GET` | `/api/v1/analytics/fixed-cost-summary` | live | P0 |
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
  - `effective_category_major`
  - `effective_category_minor`
  - `is_edited`

### Snapshot Import Behavior

- 업로드는 `snapshot_date`를 필수로 받는다.
- snapshot 적재는 문서상 UPSERT처럼 보일 수 있지만, **현재 구현은 해당 `snapshot_date` 행을 먼저 삭제한 뒤 새 파싱 결과 전체를 다시 insert** 한다.
- 즉, contract는 실질적으로 “date-scoped replace”다.

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

- PRD/운영 문서에는 원본 업로드 파일을 `/data/uploads/` 에 최근 5개만 보관한다고 적혀 있었지만, **현재 backend 구현에서는 해당 보관 로직을 확인하지 못했다.**
- 이 항목은 live contract가 아니라 운영 목표 또는 미구현 문서 항목으로 취급한다.

### Reset / Upload Logs Semantics

- `POST /api/v1/data/reset` 는 transaction/snapshot current state만 삭제한다.
- `upload_logs` 는 reset 대상이 아니다.
- reset response의 `upload_logs_retained` 는 현재 항상 `true` 다.
- 따라서 작업대의 최근 업로드 이력은 “현재 남아 있는 데이터”가 아니라 “최근 import 실행 history” 로 읽어야 한다.

## Document Status

- `PRD.md`
  - 제품 요구사항 문서
  - 구현 반영은 하되, low-level contract는 이 문서가 더 직접적이다
- `docs/additional_feature.md`
  - historical planning 문서
  - 현재 live backend/API SSOT로 사용하지 않는다
- `docs/frontend-reimplementation-wireframe-functional-requirements.md`
  - frontend contract 참고 문서
  - backend/API SSOT 문서는 아니다
