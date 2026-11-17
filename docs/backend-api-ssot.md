# Backend/API SSOT

## T056 입력·이전 읽기 표면 제거 (2026-11-17, PR A)

이 절이 아래의 이전 분류 호환 설명보다 우선한다. [전체 경로별 결정과 뷰 변경 목록](agents/t056-classification-retirement.md)을 따른다. `cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`, `cost_classification_source`는 거래 응답·생성·단건/일괄 수정에서 제거되며 옛 입력과 필터는 422다. `/nature/transactions/{id}.legacy`와 할부 응답의 `recurring_payment_kind`도 제거된다. 변동비·재량·반복 아님을 기본 저장하지 않는다.

GET `analytics/fixed-cost-summary`, `analytics/fixed-cost-trend`, `analytics/recurring-payments` 및 category/recurring 자동 분류 규칙 CRUD·apply·dry-run은 404다. 후속은 `/read/monthly-flow`, `/read/spend-cube`, `/read/commitments`와 사람이 입력하는 `/nature/*`다. 같은 이름으로 근사값을 내지 않는다. 자동 분류 설정에는 대출 규칙만 남고, `settings/analytics`의 `recurring_dry_run`은 읽기 보관용이며 수정은 422다. 거래처 정규화와 대출 연결은 유지한다.

`20261117_0041`은 가역적인 뷰 전용 이행이다. 원시 거래의 이전 컬럼은 legacy/frozen 보관이며 아직 삭제하지 않는다. `/schema`는 이를 표시하고 폐기된 뷰 필드는 더 열거하지 않는다. 아래의 옛 필드·산식·입력 설명은 이행 배경 기록이며 현재 계약이 아니다. 가져오기 HTTP 계약과 새 축·흐름표·큐브·`/read/*` 금융 값은 유지한다. 배포하지 않았다.


이 문서는 **현재 코드 기준의 live backend/API contract**를 요약한 SSOT다.

우선순위:

1. backend 구현 코드 (`backend/app/api/v1/**`, `backend/app/services/**`, `backend/app/schemas/**`)
2. 이 문서
3. `PRD.md`
4. 과거 planning 문서

과거 기획 문서가 이 문서와 충돌하면, 이 문서와 코드가 우선한다.
에이전트가 API/canonical view 값의 의미와 계산식을 해석할 때는 [agents/canonical-read-surface-reference.md](agents/canonical-read-surface-reference.md)를 함께 본다.

## Scope

정확한 원본 검토 승인 경로(`T052`)는 [reviewed-imports.md](agent-integration/reviewed-imports.md)를 따른다. 기존 safe apply의 모호한 항목 거절을 완화하지 않으며, 별도 version/digest·전체 결정·snapshot 효과·canonical approval locator를 원자 적용하고 durable operation GET으로 결과를 확인한다. 공유 API key는 기술 인증이지 실제 사람의 승인 증명이 아니므로 소비자는 표시된 계획과 native human provenance를 검증해야 한다.

- FastAPI `/api/v1` live endpoint
- request/response contract의 현재 구현 상태
- 문서와 코드가 어긋나기 쉬운 동작 메모

## Auth Rules

- 인증 없음
  - `GET /api/v1/health`
  - read-only 조회 endpoint 대부분
- `X-API-Key` 필요
  - `POST /api/v1/upload`
  - `POST /api/v1/upload/preview`
  - `POST /api/v1/upload/apply`
  - `POST /api/v1/upload/review/prepare`
  - `GET /api/v1/upload/review/{operation_id}`
  - `POST /api/v1/upload/review/{operation_id}/decisions`
  - `POST /api/v1/upload/review/{operation_id}/apply`
  - `GET /api/v1/schema`
  - `GET /api/v1/read/month-projection`
  - `GET /api/v1/metrics/monthly-flow`
  - `GET /api/v1/metrics/spend-cube`
  - `GET /api/v1/metrics/data-status`
  - `GET /api/v1/metrics/comparison/monthly-flow`
  - `GET /api/v1/metrics/comparison/contributions`
  - every `/api/v1/nature/*` route (T056; reads and writes)
  - `GET /api/v1/settings/analytics`
  - `PATCH /api/v1/settings/analytics`
  - `GET /api/v1/settings/income-expectations`
  - `PATCH /api/v1/settings/income-expectations`
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
  - `POST /api/v1/loan-accounts/recalculate-estimates`
  - `POST /api/v1/installment-plans`
  - `PATCH /api/v1/installment-plans/{id}`
  - `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`
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
| `GET` | `/api/v1/canonical-views/month-projection/accuracy` | live | API key required, read-only; recent closed-month replay error of the month-end forecast by as-of day band (T064 R12) |

### Upload / Operations

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/upload/logs` | live | 최근 10건 반환 |
| `POST` | `/api/v1/upload` | live | multipart + `snapshot_date` required |
| `POST` | `/api/v1/upload/preview` | live | no-write preview; multipart + `snapshot_date` required |
| `POST` | `/api/v1/upload/apply` | live | preview+explicit 선택 적용 + workbook snapshot replace; multipart + `snapshot_date` + `apply_request` required |
| `GET` | `/api/v1/upload/rollback-points` | live | 최근 20개 되돌리기 지점. `can_rollback`은 최신 `ready` 지점이고 이후 성공 업로드가 없을 때만 true, `changed_tables`는 반영 후 바뀐 표 |
| `POST` | `/api/v1/upload/{upload_id}/rollback` | live | API key 필요. body `{accept_changes}`. 반영 직전 원장 상태로 원자 복원. 404 `unknown_rollback_point`, 409 `not_latest`/`ledger_changed`(+`changed_tables`)/`schema_changed`; 성공 시 upload log `status=rolled_back` |
| `POST` | `/api/v1/data/reset` | live | `transactions_only` / `transactions_and_snapshots` |
| `GET` | `/api/v1/profile` | live | latest BankSalad `1.고객정보` profile snapshot; stores gender/age/KCB score only, not name/email |
| `GET` | `/api/v1/settings/analytics` | live | API key required, analytics defaults/saved/effective values |
| `PATCH` | `/api/v1/settings/analytics` | live | API key required, persisted analytics settings |
| `GET` | `/api/v1/settings/income-expectations` | live | API key required, saved expected income sources |
| `PATCH` | `/api/v1/settings/income-expectations` | live | API key required, replace the complete expected-income `items` list |
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
| `POST` | `/api/v1/auto-classification/apply/recurring-category-rules` | live | API key required, apply rules only to candidates passing the shared evidence gate |
| `GET` | `/api/v1/auto-classification/recurring-category-rules/dry-run` | live | API key required, preview recurring rule proposals and matching transactions |
| `POST` | `/api/v1/auto-classification/apply/recurring-dry-run` | live | API key required, approve one dry-run proposal with explicit apply scope |

### T065 대출 규칙과 할부 매칭 계약

- `apply_loan_rules_on_upload`은 기본 `true`이며 기존 저장 행도 이행에서 활성화한다. 사람이 이후 끄는 설정은 유지된다. 사람이 등록한 `LoanMerchantRule`만 `/upload`, `/upload/apply`, reviewed apply에서 전체 유효 지출 원장에 적용한다. 선택한 신규 행 외 기존 미연결·비수동 연결도 재검사하며 `source=manual`은 덮어쓰지 않는다.
- 현재 두 apply 경로의 규칙 연결은 업로드와 같은 트랜잭션이며 되돌리기 snapshot과 변경 감지에 `loan_transaction_links`가 포함된다. reviewed apply는 규칙으로 바뀌는 추정값을 승인 미리보기에 포함한다.
- `GET /api/v1/loan-transaction-links`는 규칙과 정확히 일치하는 미연결 행도 포함하고 `suggested_loan_account_id`, `suggestion_basis="rule"`을 제공한다. 이력 제안의 상세 계약은 아래 PR2 항목을 따른다. 업로드 설정이 꺼져 있어도 읽기 제안은 제공하며 실제 연결은 생성하지 않는다. 거래처 규칙이 원문 규칙보다 우선한다. 연결된 행의 제안 계좌·기준·신뢰도는 null, 근거는 빈 목록, 모호성은 false다.
- 할부 제안과 전망은 거래처 소문자·공백 정규화, 결제수단, 유효 회차 중 가장 가까운 예정일 ±7일을 공유한다. 월경계 게시도 앞뒤 회차와 비교한다. 전망은 정확한 금액만, 제안은 ±10%(최소 10,000)까지 허용한다. 기존 ±3일 밖의 ±4~7일 제안은 최대 medium(점수 89)이다. 제안과 전망의 읽기는 연결을 쓰지 않는다.


#### PR2: 사람 확인용 연결 제안과 계획 후보

- 대출 후보 응답에 `suggestion_basis=rule|history|null`, `suggestion_confidence=high|medium|low|null`, `suggestion_reasons: string[]`, `suggestion_ambiguous: bool`을 제공한다. 규칙 우선이며 기존 연결은 제안하지 않는다. 이력은 같은 결제수단의 이전 유효 KRW 지출 연결 최대 6건에서 날짜 ±3일과 거래처/원문 연속성 또는 최근 금액 중앙값 ±15%를 함께 요구한다. 여러 계좌가 해당하면 ID 없이 모호함을 반환한다. 거래처 연속성 + 날짜 일치 이력 2건 이상은 high, 나머지는 medium이다. 추론 결과를 업로드나 GET에서 연결하지 않는다.
- `POST /api/v1/transactions/loan-links/accept-suggestions`: `{items:[{transaction_id,loan_account_id}]}`. 최대 200건의 사람이 확인한 계좌를 서버의 최신 제안과 대조하고 원자적으로 `source=manual` 연결한다. 모호/변경/이미 연결된 행은 409로 전체 거절한다. X-API-Key 필수.
- `GET /api/v1/installment-plan-candidates?include_dismissed=false`: 미연결 KRW 카드 후보 음수 지출(이름 앞뒤 공백·대소문자 정리 후 계좌형·선불/간편결제형·현금 제외, 짧은 나머지 이름도 포함)에서 동일 결제수단·정규화 거래처 또는 동일 정규화 원문의 3개월 이상 연속 관측을 찾는다. 기존 대출/할부 연결·활성 계획의 정확 금액 매칭·정기 지급 묶음 소속은 제외한다. 활성 계획에 맞는 행은 기존 연결 제안에서 확인한다. 금액은 동일하며 첫 관측만 제한된 반올림 차이를 허용한다. 예정일 ±3일은 월경계를 포함한다. 후보는 관측 건수·기간·결제수단·거래처·월 금액·거래 ID·첫 납부일 제안·자료 시작 경계 여부를 제공하며 총 횟수를 추정하지 않는다. 정기 구독도 후보일 수 있으므로 사람이 확인한다.
- `PATCH /api/v1/installment-plan-candidates/{series_key}/review`: `review_status=pending|not_installment`. 별도 이행 테이블에 기각/복원을 저장한다. 결제수단·연속성 기준·금액의 해시 키는 거래 ID나 자료 시작일과 무관해 재업로드·관측 추가/이전 관측 보강에도 유지된다. 동일한 키의 재발생은 명시 복원까지 기각한다.
- `POST /api/v1/installment-plan-candidates/{series_key}/create-plan`: 사람이 `display_name`, 필수 `total_installments`, 확인한 `first_payment_date`, 현재 후보의 `transaction_ids`를 보낸다. 최신 후보 일치·날짜/회차 범위를 검증하고 계획과 관측 회차의 수동 연결을 한 트랜잭션으로 생성한다. 변경된 후보 409, 유효하지 않은 입력 422. 총 횟수/첫 납부일로 관측 이전 회차도 사람이 지정할 수 있다.
- `POST /api/v1/transactions/installment-links/accept-suggestions`: `{items:[{transaction_id,installment_plan_id,installment_number}]}`. 최대 200건, 최신 high·충돌 없음 제안만 원자적으로 수동 연결한다. 하나라도 변경/모호/충돌/기존 연결이면 409. 모든 쓰기는 X-API-Key 필수.
- 월말 전망은 같은 게시 월의 서로 다른 nearest 회차를 개별 연결 미확인으로 센다. 같은 회차에 여러 거래가 맞으면 기존처럼 보류한다. 읽기만으로 연결하지 않는다.

### Transactions Read

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/transactions` | live | pagination, search, edited/deleted/merged filters 지원. T059: optional monthly-flow line filters `flow_row`, `payment_form`, `adjustability` (read from `vw_metric_flow_lines`) |
| `GET` | `/api/v1/transactions/{id}` | live | one stored transaction by id; `404` if absent; independent of list filters |
| `GET` | `/api/v1/transactions/filter-options` | live | category/payment method distinct options |
| `GET` | `/api/v1/transactions/summary` | live | `group_by=month|week|day`; response includes `basis` metadata for raw signed aggregation |
| `GET` | `/api/v1/transactions/by-category` | live | `level=major|minor`, `type=지출|수입|이체|income_expense|all` |
| `GET` | `/api/v1/transactions/by-category/timeline` | live | timeline aggregate |
| `GET` | `/api/v1/transactions/payment-methods` | live | payment method aggregate |
| `GET` | `/api/v1/loan-transaction-links` | live | loan repayment candidate worklist, linked/unlinked filters |
| `GET` | `/api/v1/installment-transaction-suggestions` | live | suggested installment transaction links for active plans |
| `GET` | `/api/v1/installment-plans` | live | installment ledger entries |
| `GET` | `/api/v1/installment-transaction-links` | live | installment candidate worklist, linked/unlinked filters |
| `GET` | `/api/v1/transactions/{id}/installment-link` | live | transaction-to-installment mapping |

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
| `PUT` | `/api/v1/transactions/{id}/settlement-match` | live | API key required, upsert manual `user_confirmed` or `rejected` settlement override for a refund/cancellation row |
| `DELETE` | `/api/v1/transactions/{id}/settlement-match` | live | API key required, remove a user-managed settlement override via `original_transaction_id` |
| `GET` | `/api/v1/transactions/{id}/loan-link` | live | transaction-to-loan repayment mapping |
| `PUT` | `/api/v1/transactions/{id}/loan-link` | live | API key required, upsert one transaction-to-loan mapping |
| `DELETE` | `/api/v1/transactions/{id}/loan-link` | live | API key required, remove mapping |
| `PUT` | `/api/v1/transactions/loan-links/bulk` | live | API key required, map selected transactions to one loan account |
| `PATCH` | `/api/v1/loan-transaction-links/{transaction_id}/review` | live | API key required, set loan candidate review status |
| `PATCH` | `/api/v1/loan-accounts` | live | API key required, update loan account display name, loan kind, and user hidden state |
| `POST` | `/api/v1/loan-accounts/recalculate-estimates` | live | API key required, recalculate latest estimates for explicitly selected loan accounts |
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
| `GET` | `/api/v1/analytics/liquidity-health` | live | optional `snapshot_date`, `monthly_required_spend`, `monthly_income`; omitted spend/income derive from closed-month data and expose source metadata. Derived required spend = `protected` expense lines (`vw_metric_flow_lines.adjustability`; loan lines are always protected) plus loan lines not protected (always 0 since T056). Legacy since T061 for 비상금 개월 수: unchanged, see `/metrics/net-worth/emergency-fund` |
| `PATCH` | `/api/v1/assets/snapshots/{asset_snapshot_id}/liquidity` | live | API key required, update `liquidity_tier` and `is_cash_equivalent` |
| `PATCH` | `/api/v1/loans/{loan_id}/repayment-metadata` | live | API key required, update `monthly_payment` / `repayment_method` and mark changed fields as `manual` source |

### Advisor Analytics

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/analytics/monthly-cashflow` | live | P0 |
| `GET` | `/api/v1/analytics/fixed-cost-summary` | live | P0 |
| `GET` | `/api/v1/analytics/fixed-cost-trend` | live | monthly fixed/variable and essential/discretionary spend trend |
| `GET` | `/api/v1/analytics/merchant-spend` | live | P0 |
| `GET` | `/api/v1/analytics/payment-method-patterns` | live | P1 shipped |
| `GET` | `/api/v1/analytics/income-stability` | live | P1 shipped |
| `GET` | `/api/v1/analytics/recurring-payments` | live | P1 shipped |
| `PATCH` | `/api/v1/analytics/purchase-gate-candidates/{candidate_key}/review` | live | API key required, persist review status, memo, reviewed_at, cooldown_until under canonical `transaction:{transaction_id}` key |

All aggregate analytics responses above now also carry an optional `contract` object (see Metric Contract below). Existing fields keep their names and types.

### Metrics (T054 metric contract)

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/metrics/monthly-flow` | live | API key required. `start_period`/`end_period` (`YYYY-MM`). Month totals and per-row lines of `vw_monthly_flow_summary`/`vw_monthly_flow`, `month_status`, `residual_rate` (closed months only), `contract` |
| `GET` | `/api/v1/metrics/spend-cube` | live | API key required. `group_by` = comma list of `period, effective_category_major, effective_category_minor, merchant, payment_form, commitment_kind, adjustability, flow_row`; same-named equality filters; `limit` 1–2000. Reads `vw_spend_cube` |
| `GET` | `/api/v1/metrics/data-status` | live | API key required. Transaction/snapshot as-of dates, closed months, in-progress month, 미정 share, excluded non-KRW summary |
| `GET` | `/api/v1/metrics/comparison/monthly-flow` | live | API key required. T057. Optional `period` (`YYYY-MM`, default latest closed month; 422 after the transaction as-of month). Each monthly-flow measure: `target_amount`, `baseline_amount` (median), `change_amount`, `baseline_values`; `residual_rate` (target vs baseline median) for a closed target only; `comparison` basis and `contract` |
| `GET` | `/api/v1/metrics/comparison/contributions` | live | API key required. T057. `period`, `adjustability=all\|protected\|adjustable`, `level=category\|merchant` (merchant stays inside its category), optional `category`, `limit` 1–1000. Monthly `items` and 12-month-window `twelve_month_items` ordered by `abs(change_amount)` (won); view totals `target_total`/`baseline_total`/`change_total`; `twelve_month_window`; `comparison`; `contract` |

### Nature Axes (T056: 지급 형태 · 조정 가능성)

Every route requires `X-API-Key` (reads included). Writes are explicit human input only; nothing here proposes or fills a value.

T056 확인 보완: 약정 행에 `attributes_confirmed_at`, `needs_attribute_confirmation`을 추가한다. 이행 출처이고 확인 시각이 없으면 대기다. 목록은 끝난 약정까지 포함한 `pending_confirmation_count`를 준다. `/read/commitments`는 상세 행에 같은 두 필드, 요약 행에 대기 여부, data에 필터 전 대기 수를 추가한다. 확인된 빈 주기는 그대로 빈 값이며 관측·월 부담 계산은 바꾸지 않는다. `transactions.legacy_classification_edited`는 이전 manual 분류 이력을 보존하며 HTTP `is_edited`에만 더한다. 축 지정 출처는 바꾸지 않는다. 이행 전 준비된 검토는 재준비하며, 이전 컬럼 집합의 되돌리기는 목록에서 불가 표시하고 `schema_changed`로 거절한다. [상세·후속 삭제 조건](agents/t056-classification-retirement.md).

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/nature/category-defaults` | live | Category adjustability defaults (`category_minor=null` = whole major category) |
| `PUT` | `/api/v1/nature/category-defaults` | live | Upsert `{category_major, category_minor?, adjustability: protected\|adjustable}`; one row per category key |
| `DELETE` | `/api/v1/nature/category-defaults/{id}` | live | `204`; `404` when missing |
| `GET` | `/api/v1/nature/recurring-commitments` | live | Recurring-payment bundles (정기 지급) with attributes and `member_transaction_count`, `first_member_date`, `last_member_date` (effective rows resolved to the bundle) |
| `POST` | `/api/v1/nature/recurring-commitments` | live | `201`. `match_scope=merchant\|category`, `merchant` (required for merchant scope, null for category scope), `category_major`, `category_minor?`, `cycle=monthly\|yearly\|n_times\|null`, `total_count` (n_times only), `amount_kind=fixed\|variable\|null`, `adjustability=protected\|adjustable\|null`, `start_date?`, `end_date?`, `label?`, `memo?`; `origin='user'` |
| `PATCH` | `/api/v1/nature/recurring-commitments/{id}` | live | 부분 수정. 명시한 필드만 변경하고 null은 비운다. 이행 약정의 `cycle`/`amount_kind` 저장 또는 `{confirm_attributes: true}`는 현재 두 속성의 사용자 확인을 기록한다. 메모·종료는 확인하지 않는다. 허용 주기는 기존 그대로, 잘못된 값은 422. |
| `POST` | `/api/v1/nature/recurring-commitments/{id}/end` | live | `{end_date}` (not before `start_date`); later transactions stop matching |
| `DELETE` | `/api/v1/nature/recurring-commitments/{id}` | live | `204`; explicit memberships pointing to it are cleared |
| `GET` | `/api/v1/nature/transactions/{id}` | live | Resolved axes with the value at every precedence level, the commitment and how it matched (`rule`/`explicit`), flags and override source. `effective=false` (axes null) for deleted/merged/superseded rows |
| `PUT` | `/api/v1/nature/transactions/{id}/adjustability` | live | Transaction-level `{adjustability: protected\|adjustable}` (highest precedence); `422` for 수입/이체; clears `necessity_conflict` |
| `DELETE` | `/api/v1/nature/transactions/{id}/adjustability` | live | Clears the transaction-level value; the commitment or category default applies again |

### Net Worth and Transfer Purpose (T061: 재무상태와 순자산 대조)

Every route requires `X-API-Key` (reads included). Transfer purposes are written only by explicit human calls; nothing is inferred or suggested.

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/metrics/net-worth/intervals` | live | `limit` 1–200 (default 24). `snapshot_dates` per kind (`assets`, `loans`, `investments`, `insurance`, `profile`, newest first, never merged) and consecutive asset-snapshot `intervals` with `status`, `net_worth_change`, `unexplained_difference`, `transfer_undecided_share` |
| `GET` | `/api/v1/metrics/net-worth/reconciliation` | live | `start_date`/`end_date` (asset snapshot dates, both or neither; default the latest two; `422` for a non-snapshot date, a reversed pair, or only one date). `status` (`complete`, `incomplete_classification`, `transactions_not_covered`, `snapshot_dates_mismatched`, `no_snapshot_pair`), `status_reasons`, `interval`, `net_worth_start`/`net_worth_end`, `kinds[]` (loans, investments with `pair_status` `observed`/`absent`/`mismatched` and per-kind as-of dates), `other_kinds` (insurance/profile as-of), `transactions` (coverage), `flow`, `transfers`, `items`, `contract` |
| `GET` | `/api/v1/metrics/net-worth/emergency-fund` | live | `emergency_fund_months = cash_like_total ÷ monthly_protected_outflow` with `cash_like_name_rule_total`, `monthly_adjustability_undecided_outflow`, `adjustability_undecided_share`, `baseline`, `status` (`complete`, `incomplete_classification`, `no_baseline`, `no_asset_snapshot`), `legacy_surface`, `contract` |
| `GET` | `/api/v1/transfer-purposes/transactions` | live | Effective KRW 이체 with resolved purpose, largest `abs(amount)` first. `start_date`, `end_date`, `purpose` (`investment\|savings\|internal_move\|undecided`), `limit` 1–2000. Totals `total_count`, `undecided_count`, `undecided_activity_total`, `activity_total` (all before the `purpose` filter) |
| `GET` | `/api/v1/transfer-purposes/transactions/{id}` | live | Resolved `purpose`, `purpose_source` (`transaction`, `rule_merchant`, `rule_category`, `none`), the transaction-level value and the applied rule. `effective=false` for deleted/merged/superseded rows; `422` for non-이체; `404` when missing |
| `PUT` | `/api/v1/transfer-purposes/transactions/{id}` | live | `{purpose: investment\|savings\|internal_move}` (highest precedence); `422` for non-이체 |
| `DELETE` | `/api/v1/transfer-purposes/transactions/{id}` | live | Clears the transaction-level purpose; a rule or `undecided` applies again |
| `GET` | `/api/v1/transfer-purposes/rules` | live | Human rules with `matched_transfer_count` (effective 이체 currently resolved by the rule) |
| `POST` | `/api/v1/transfer-purposes/rules` | live | `201`. `match_scope=merchant` with `merchant`, or `match_scope=category` with `category_major` and optional `category_minor` (null = whole major); `purpose`; `label?`, `memo?`. `409` for an existing key, `422` for scope/field mismatch |
| `PATCH` | `/api/v1/transfer-purposes/rules/{id}` | live | Partial update; switching scope clears the other scope's fields; same validation |
| `DELETE` | `/api/v1/transfer-purposes/rules/{id}` | live | `204`; `404` when missing |

## Key Contract Notes

### Metric Contract (T054/T055)

- One calculation path. `vw_metric_transactions` (유효 거래) → `vw_transaction_nature` (T056 axes) → `vw_metric_flow_lines` → `vw_monthly_flow`, `vw_monthly_flow_summary`, `vw_spend_cube`, created by migration `20261115_0035` and recreated by `20261115_0038` (T056). The definitions live once in `backend/app/services/metric_views.py`; the newest migration stores a frozen PostgreSQL compile guarded by `tests/migrations/test_metric_views_migration.py` (which also pins 0035 so the 0038 downgrade restores it exactly). Analytics, the dashboard legacy views, the projection's observed totals and liquidity/insurance inputs read these views; they do not re-sum actuals in Python.
- Effective basis: `is_deleted = false`, `merged_into_id IS NULL`, not superseded (`source_lifecycle_status <> 'superseded'` and `superseded_by_transaction_id IS NULL`), effective category `COALESCE(category_*_user, category_*)`. Raw rows and lineage stay in `transactions` and `/api/v1/transactions`.
- Currency: every metric total is KRW only. Non-KRW effective rows are never summed with KRW; they are listed in `vw_metric_excluded_currency`, counted in `contract.non_krw_transaction_count`, and returned by `/metrics/data-status`. No FX conversion exists.
- Monthly flow rows (each won of each effective KRW transaction lands in exactly one): `income_undetermined`, `committed_loan`, `committed_installment`, `committed_recurring`, `ad_hoc_protected`, `ad_hoc_adjustable`, `undecided`, `transfer_undetermined`, `other_type`. Since T056, payment form and adjustability come from `vw_transaction_nature` (the two-axis tables), not from the old columns; definitions `monthly_flow.v2` / `spend_cube.v2`. See [Two-Axis Nature (T056)](#two-axis-nature-t056).
- Names and scope: `total_outflow` (총지급, includes loan 원리금, refunds netted), `living_spend` (생활 지출 = `total_outflow − committed_loan_total`), `adjustable_spend` (조정 가능 지출), `residual` (잔여 = `income_total − total_outflow`), `residual_rate` (현금 잔여율, closed months only), `transfer_net` (signed transfers; never income or spend). Legacy `expense`/`expense_total` keep their historical scope, stated per field in `contract.field_scopes`.
- Signs: `income_total`, `transfer_net` received-positive; spend totals paid-positive with refunds reducing them; `signed_amount`/`signed_total` keep the source sign.
- Refund attribution (T055): a refund (positive `지출`) stays in the month it was posted. A confirmed settlement allocation (`auto_confirmed`/`user_confirmed`, both sides effective KRW) only moves the classification of the allocated part to the original purchase; the unallocated remainder keeps the refund row's classification. Linking or unlinking a refund never changes a month's totals. `review_required`/`rejected` matches move nothing.
- As-of dates: `transaction_as_of` = latest effective transaction date (basis `max_effective_transaction_date`); snapshot as-of dates are separate per kind (`assets`, `loans`, `investments`, `insurance`, `profile`) and never merged. A month is `closed` when `transaction_as_of` reaches its last day; the latest uncovered month is `in_progress`.
- `contract` object on aggregate responses: `definition`, `scope`, `inclusion` (basis view, currency, exclusions, sign/refund/transfer/loan/period rules), `as_of`, `adjustability_undecided_total` and `adjustability_undecided_share` (amount basis, share of `total_outflow`), `non_krw_transaction_count`, `field_scopes`.
- Purchase-level detectors (`/analytics/recurring-payments`, the transaction detector inside `/read/review-items`) use a separate, named basis `purchase_net.v1` (`vw_metric_transactions.purchase_net_amount`): confirmed allocations net into the original purchase regardless of posting date; an unallocated refund remainder stays on the refund row. These are review signals, not monthly cashflow actuals.

### Two-Axis Nature (T056)

- Axes (plan 2.2). **지급 형태** `payment_form`: `committed` (`commitment_kind` = `loan` link, `installment` plan link, or `recurring` = member of a human-registered `recurring_commitments` bundle) or `ad_hoc`. **조정 가능성** `adjustability`: `protected`, `adjustable`, `undecided`. 수입/이체 and other types are `not_applicable` and are never `undecided`, never in 미정 totals and never in the classification queue.
- Bundle membership: same effective category (major; minor including "no minor"), same `merchant` for `match_scope='merchant'`, and the date inside `start_date..end_date` (open ends allowed). Merchant scope wins over category scope, then the lowest id. A per-transaction exclusion or explicit membership (`transaction_nature_overrides`) is used by the migration, the old-column write-through and re-import only. Cycle, amount kind (fixed/variable) and end are bundle attributes; no per-transaction recurring input exists in the new model.
- Adjustability precedence for 지출: loan/installment link (fixed `protected` while linked) > transaction-level value > commitment value > category default (exact `(major, minor)`, then whole-major) > `undecided`. `vw_transaction_nature` and `GET /api/v1/nature/transactions/{id}` expose `adjustability_source` (`fixed_loan`, `fixed_installment`, `transaction`, `commitment`, `category_default`, `none`, `not_applicable`), the value at each level, `recurring_commitment_id` and `commitment_match`. `vw_metric_flow_lines` adds `recurring_commitment_id` and `adjustability_source`; `mapping_note` is now `installment_link_unconfirmed` or `necessity_conflict` (undecided rows only). `payment_form='undetermined'` no longer exists.
- Tables (new; no existing table altered): `recurring_commitments`, `category_adjustability_defaults`, `transaction_nature_overrides` (FK to `transactions` `ON DELETE CASCADE`, to `recurring_commitments` `ON DELETE SET NULL`). Migrations: `20261115_0036` (tables), `20261115_0037` (backfill of existing human classification), `20261115_0038` (views and work queue).
- Migration of existing classification (user-approved mapping, 2026-11-15): see [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md#two-axis-nature-t056). Existing committed rows are grouped by merchant + effective category into `origin='migration'` bundles, editable/endable/deletable afterwards. Dry-run: `uv run python -m app.tools.nature_axes_migration_report` (read-only, `DATABASE_URL` from env, shares by default, `--show-amounts`, `--json`).
- Old columns (`cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`) stay, keep their API fields and filters, and still feed the legacy aggregate views (`vw_monthly_cashflow`, `vw_fixed_cost_monthly_summary`, `vw_true_spendable_monthly`, `vw_recurring_merchant_monthly`) and the legacy analytics breakdowns that have no exact counterpart in the new axes (`/analytics/fixed-cost-summary`, `/analytics/fixed-cost-trend`: fixed/variable/unclassified `cost_kind` split; `/analytics/recurring-payments`: per-merchant `recurring_payment_kind` counts and `activity_status`). They are no longer read by the metric views. Readers switched to `vw_transaction_nature` / `vw_metric_flow_lines` (same response shape; on data where the old columns and the new axes agree the bodies are identical): `/analytics/discretionary-velocity` (재량 = `adjustable`, 분류됨 = `protected`/`adjustable`), `/analytics/purchase-gate-candidates` and `/analytics/spending-review-candidates` and therefore `/read/review-items` (ad hoc + `adjustable`), and the derived required spend of `/analytics/liquidity-health` (필수 = `protected`). Response fields that echo an old column per transaction still return the stored old value. **Write-through:** because the current frontend still classifies through these columns, every old-column write — `POST/PATCH /transactions`, `PATCH /transactions/bulk-update`, category-rule apply, recurring-rule apply, recurring dry-run approval, and upload auto-apply of those rules — re-derives the new axes for the written rows with the same mapping (transaction-level adjustability from the necessity; committed rows join the matching bundle, else the newest same-key bundle explicitly, else a new same-key bundle `origin='legacy_edit'`; ad hoc rows with a payment-form signal are excluded from a matching bundle; a necessity-only edit keeps membership). New-API edits never write the old columns, so the old columns can diverge from the new axes; the new tables are authoritative.
- Work queue (`vw_unclassified_work_queue`, same columns): lists 지출 whose resolved adjustability is `undecided`, plus loan-link review. `needs_recurring_payment_kind` is always `false` (no recurring-kind work queue), `needs_cost_kind`/`needs_fixed_cost_necessity`/`needs_spend_necessity` are true only for undecided rows. Superseded and installment-linked rows are not listed.
- Import contract and rollback: no request/response shape, status value, or existing table changes. Rollback points and reviewed-import state digests enumerate all tables in `Base.metadata`, so the new tables are captured and restored automatically; a rollback point captured before migration 0036 is refused with `schema_changed`. The safe-apply replacement path moves the transaction-level row to the replacement like loan/installment links. Details: [reference](backend-api-and-metrics-reference.md#import-contract-and-rollback-impact).

### Comparison Contract (T057)

- One rule set (`comparison.v1`, `backend/app/services/comparison_service.py`) for every comparison. Amounts are SQL sums over `vw_metric_flow_lines` (same lines as the monthly flow and spend cube); Python only takes medians of those sums. No new view or migration.
- Every comparison response states its basis in a `comparison` object: `target_period`, `target_month_status`, `target_coverage` (`observed|no_data`), `target_start_date`/`target_end_date`, `baseline_method`, `baseline_periods`, `baseline_month_count`, `baseline_status` (`full|fewer_than_requested|none`), `baseline_limited_by` (`data_start|baseline_start_date`), `baseline_start_date`/`baseline_start_period`, `first_data_period(_starts_mid_month)`, `skipped_periods` (no-data months), `partial_month_handling` (`closed_month_full|same_elapsed_days`), `elapsed_day`, `ratio_metrics_available`, `previous_full_month_delta_available`, and the Korean rule texts.
- Baseline: median of the most recent 6 closed months before the target that have data (`/read/comparison/*` also accept `baseline=previous_month`: the single closed month before the target under the same rules, null with `baseline_unavailable_reason` when unusable). Fewer available months are used as they are (`fewer_than_requested`); none gives null baselines. An even count averages the middle two, rounded to the won (half away from zero). Medians are per item and are not additive across items.
- Baseline start date: the single stored setting `analytics.comparison.baseline_start_date`. Only months on or after it count (a date on the 1st includes that month, any other date starts from the next month). It changes contract comparison surfaces together: `/metrics/comparison/*`, and `/read/review-items` (the removed HTTP readers no longer have a compatibility baseline).
- In-progress target: target and every baseline month are cut to day 1 … `elapsed_day` (the transaction as-of day; a shorter month is used whole). No ratio metric and no full-previous-month delta is produced for it. An explicit `end_date` inside the as-of month is clamped to the transaction as-of date.
- No data vs zero: a month with no effective KRW transactions is skipped (listed in `skipped_periods`) and the search continues further back; a month with data but no amount for an item counts as 0. A target month with no data returns null target amounts.
- 12-month window: an item whose net spend is positive in only 1–2 of the 12 months ending at the target (all 12 months with data) is `cadence=annual_like` and compared as the 12-month total vs the preceding 12-month total (`twelve_month_items`). The baseline window must be fully covered and on/after the baseline start date, otherwise its baseline is null with `baseline_window_unavailable_reason`.
- Historical analytics migration (the category/anomaly GETs and dashboard are now removed): `spending-anomalies` uses the contract baseline (field `baseline_avg` now holds the median; anomaly score formula unchanged; `baseline_months` default 6); `category-mom` adds per-item `baseline_amount`/`baseline_change_amount` and `comparison`, and its `previous_*` fields compare the same elapsed days whenever the target month is in progress; `monthly-cashflow.savings_rate`, `fixed-cost-trend.fixed_ratio` and dashboard `monthly_cashflow.savings_rate` are null for in-progress months. Details and what is not yet migrated: [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md#comparison-contract-t057).

### Net Worth Reconciliation (T061)

- Identity (plan 2.5): `net_worth_change = residual + loan_balance_decrease + investment_valuation_change + unexplained_difference`, exact on the returned integers (each snapshot total is rounded to the won before differencing). `unexplained_difference` is left as its own item and never filled with estimated items; it is `null` only when an item cannot be computed (`snapshot_dates_mismatched`, `transactions_not_covered`).
- Interval boundary: snapshots are end-of-day balances, so the transactions of the interval are dated `start_snapshot_date + 1` … `end_snapshot_date` (start exclusive, end inclusive). Consecutive intervals never count a day twice; a transaction recorded after the export moment on the end date lands in the unexplained difference.
- Items: `net_worth_change` from `vw_net_worth_snapshots` (same definition as `/assets/snapshots`: non-negative asset rows − liabilities); `residual` = `income_total − total_outflow` over the interval as a SQL aggregate of `vw_metric_flow_lines` with the monthly-flow formulas; `loan_balance_decrease` = loans balance total at start − at end (`vw_snapshot_kind_totals`, all loan rows, no interest/principal split); `investment_valuation_change` = (investments market value at end − at start) − `investment_net_transfer_in`, with `investment_net_transfer_in = −(signed sum of 이체 legs marked investment)`.
- Comparable pairs: the interval is two asset snapshot dates. For loans and investments, `observed` = rows on both dates; `absent` = the kind has no rows in any snapshot (0 at both ends, stated); otherwise `mismatched` with the kind's own as-of dates, and its item is `null` (never aligned to a nearby date). A kind that disappears at the end date (for example a loan no longer exported) is reported as `mismatched`, because the snapshot tables cannot tell "zero" from "not exported". Insurance and profile as-of dates are reported, not used.
- Coverage: covered when the earliest effective transaction is on or before the first interval day, `transaction_as_of` is on or after the end date, and every month intersecting the interval has an effective KRW transaction (`periods_without_data`). Non-KRW rows in the interval are counted, never summed.
- State order: `no_snapshot_pair` > `snapshot_dates_mismatched` > `transactions_not_covered` > `incomplete_classification` (an undecided transfer in the interval) > `complete`. `status_reasons` lists every applicable reason in Korean.
- Transfer purpose (`vw_transfer_purpose`): `investment` (to/from a holding in the investments snapshot), `savings` (to/from a savings deposit that is not an investments row), `internal_move` (any other own-account move), `undecided` (nothing set). Precedence: transaction-level (`transfer_purpose_overrides`) > merchant rule (exact normalized `merchant`) > category rule (exact effective minor before whole-major; then lowest id) > `undecided`. Set only by a human (작업대); nothing is inferred from names or amounts.
- Netting rule: transfer legs are summed with their source sign. Both legs of a move between two ledger accounts (−X, +X) are `internal_move` and net to 0 inside that row, so they are never double counted. `investment`/`savings` marks the leg on the ledger side that pays into or receives from the holding; if the counterpart leg is also in the ledger the pair is an internal move. `undecided_share` = Σ|undecided legs| ÷ Σ|all legs| (`transfer_activity_total`).
- Monthly flow (`/metrics/monthly-flow`, `vw_monthly_flow_summary`): existing fields unchanged; `rows` still has one `transfer_undetermined` row (all transfers, key kept for compatibility). Added per month: `transfer_investment_net`, `transfer_savings_net`, `transfer_investment_savings_net` (투자·저축 이체), `transfer_internal_move_net` (그 밖의 계좌 간 이동), `transfer_undecided_net`, `transfer_undecided_activity_total`, `transfer_undecided_share`, and `transfer_rows[]` (`transfer_investment_savings`, `transfer_internal_move`, `transfer_undecided`) whose sum equals `transfer_net`. `vw_metric_flow_lines` adds `transfer_purpose` and `transfer_purpose_source` (non-null exactly for 이체 lines).
- Emergency fund (plan 3.3): `cash_like_total` is the latest asset snapshot's `vw_asset_snapshot_canonical.cash_equivalent_total` rule (human `is_cash_equivalent`/`liquidity_tier` first, the existing name rule otherwise; the name-rule part is `cash_like_name_rule_total`). `monthly_protected_outflow` = median `protected_spend` of the comparison-contract baseline months ending at the last closed month (up to 6, skipping no-data months, stopping at the data start or the baseline start date). Undecided adjustability is not treated as protected; its share is returned. `/analytics/liquidity-health` is deprecated; its values are unchanged.
- Tables and views (migration `20261116_0039`): new tables `transfer_purpose_rules`, `transfer_purpose_overrides` (FK to `transactions` `ON DELETE CASCADE`); new views `vw_transfer_purpose`, `vw_net_worth_snapshots`, `vw_snapshot_kind_totals`; trailing columns on `vw_metric_flow_lines` and `vw_monthly_flow_summary` (the metric chain, the 0035 legacy views and the 0038 work queue are recreated; downgrade restores 0038 exactly). Import contract: no request/response shape, status value or existing table changes; rollback points and review digests pick up the new tables automatically (a point captured before 0039 is refused with `schema_changed`); the safe-apply replacement path moves a transaction-level purpose to the replacement row. Details: [reference](backend-api-and-metrics-reference.md#net-worth-reconciliation-t061).

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
  - `flow_row` (T059): `income_undetermined`, `committed_loan`, `committed_installment`, `committed_recurring`, `ad_hoc_protected`, `ad_hoc_adjustable`, `undecided`, `transfer_undetermined`, `other_type`
  - `payment_form` (T059): `committed`, `ad_hoc`, `not_applicable`
  - `adjustability` (T059): `protected`, `adjustable`, `undecided`, `not_applicable`
- Monthly-flow line filters (T059, additive and optional; existing parameters and the response shape are unchanged): a transaction is kept when one of its `vw_metric_flow_lines` lines has every given value (`EXISTS` on the view; the classification is not re-derived). With `start_date`/`end_date` covering one month, `flow_row` lists exactly the transactions behind that monthly-flow line, and `total` equals the line's `transaction_count`. Consequences of reading the lines: only effective KRW transactions have lines, so any of these filters drops deleted, merged, superseded and non-KRW rows even with `include_deleted`/`include_merged`; a refund whose part is allocated to a purchase is listed under the purchase's row (and under its own row for the unallocated remainder), while `amount` stays the raw signed amount of the whole refund row. Unknown values return `422`.
- Transaction response includes live fields that matter to frontend/workbench:
  - `merchant`
  - `cost_kind`
  - `fixed_cost_necessity`
  - `spend_necessity`
  - `recurring_payment_kind`
  - `effective_category_major`
  - `effective_category_minor`
  - `is_edited`
- `type=income_expense` includes income and expense and excludes transfers; `all` still includes transfers. Raw signed `amount` is preserved.
- Single/bulk PATCH preserve omitted fields. Explicit `spend_necessity:null` clears necessity; this field takes precedence over `fixed_cost_necessity`, including when null. The compatibility fixed field is synchronized only for fixed costs. `cost_kind:null` retains the existing kind; `recurring_payment_kind:null` clears recurring classification.
- `cost_classification_source='manual'` is set only when cost kind/necessity actually changes; memo-only edits and unchanged classification values preserve the source.

### Recurring Payment Classification

- Since T056 the per-transaction `recurring_payment_kind` is a legacy input: it no longer decides the metric views directly and is not asked by the work queue; cycle is an attribute of a `recurring_commitments` bundle. Writes are written through to the two axes ([Two-Axis Nature](#two-axis-nature-t056)).
- `recurring_payment_kind` is a manual transaction-level classification.
- Supported values:
  - `installment`: installment/할부 repayment-like recurring charge
  - `monthly_recurring`: a fresh monthly recurring charge such as utilities or subscriptions
  - `not_recurring`: explicitly reviewed non-recurring merchant activity
- `GET /api/v1/analytics/recurring-payments` groups by merchant and returns transaction ids plus classification counts. The operations recurring-classification screen uses those ids for bulk updates; insights surfaces display the saved result only.
- Category rules, upload auto-apply, dry-run and approval share the same effective-category, occurrence, cadence, amount-variation and confidence gates. Fixed costs do not bypass them. Only negative valid expense observations form evidence; only unclassified recurring values are changed. Explicit contrary classifications are excluded.
- Dry-run returns `merchant`, `proposed_kind`, `confidence`, `matched_transactions`, `reason`, `category_hint`, `apply_scope_options`, `default_apply_scope`, and an evidence/settings/rule-bound `preview_token`.
- Approval requires that token and recomputes candidates. Changed evidence or proposal returns `409`. `all_matching` applies exactly the current eligible set; `reviewed_only` requires a nonempty eligible `transaction_ids` subset. Omitted scope uses effective settings. `future_only` is unsupported (`422`).
- `/analytics/recurring-payments` is a separate observation signal: `activity=all|active|history`, `recent_days`, and item `activity_status` distinguish active candidates from historical, irregular, non-positive-net and explicitly non-recurring activity. Refunds net into amounts; this does not establish a subscription contract.

### Auto Classification

- Category rules live in `category_classification_rules`.
- Category rules match effective category values, so `category_major_user/category_minor_user` take precedence over imported categories.
- Applying category rules writes `transactions.cost_kind`, `transactions.fixed_cost_necessity` for fixed rules, `transactions.spend_necessity`, and `transactions.cost_classification_source='auto'`.
- Actual cost-kind/necessity changes through transaction update/bulk-update write `cost_classification_source='manual'`; later auto-apply never overwrites those manual rows.
- New category and recurring-category rules must reference an effective expense category currently present in valid transactions (`422` otherwise). Existing invalid rules remain visible with `category_valid=false` and `validation_message`; reads do not delete them.
- Loan merchant rules live in `loan_merchant_rules` and exact-match either `transactions.merchant` or `transactions.description` according to `match_field`.
- `match_field='merchant'` means the analysis/canonical merchant value, which can be normalized by merchant alias rules or edited by the user. `match_field='description'` means the imported raw transaction description.
- `loan_merchant_rules` are unique by `(match_field, merchant)`. The `merchant` column stores the exact match value for the selected field.
- If both a merchant-based and description-based rule match the same transaction, the merchant-based rule wins.
- Applying loan merchant rules creates or updates only missing/auto loan links. Existing `loan_transaction_links.source='manual'` rows are preserved.
- Merchant alias rules live in `merchant_alias_rules`. Applying them does a case-insensitive contains match on raw `transactions.description` and writes the canonical `normalized_merchant` into `transactions.merchant`.
- Merchant alias application only updates rows whose `merchant == description`, so user-edited analysis merchants are preserved by default.
- Upload auto-apply toggles live in `auto_classification_settings`; when enabled, upload success runs the matching rule application after transaction import.

### Spend Necessity

- Since T056 these columns are legacy inputs of the two axes (written through on every write; see [Two-Axis Nature](#two-axis-nature-t056)). The metric views read `vw_transaction_nature`; the summaries below are the legacy breakdowns.
- `cost_kind` and `spend_necessity` are independent axes:
  - `cost_kind`: repeatability/predictability (`fixed` or `variable`)
  - `spend_necessity`: need/control axis (`essential` or `discretionary`)
- Creation and category-rule normalization default a variable expense's missing necessity to `discretionary`. Transaction PATCH instead preserves omission and honors an explicit null; missing necessity remains visible as unknown in analytics.
- `fixed_cost_necessity` remains a compatibility field for fixed costs. The legacy fixed-cost summaries read these columns; discretionary velocity, spending-review candidates and liquidity required spend read the resolved adjustability instead (see [Two-Axis Nature](#two-axis-nature-t056)).
- Required spend is interpreted as `essential_fixed_total + essential_variable_total + loan_repayment_total`.
- Discretionary spend is interpreted as `discretionary_fixed_total + discretionary_variable_total`.

### Installment Management

- Installment plans live in `installment_plans` and represent a user-managed ledger entry with `display_name`, `merchant`, optional `payment_method`, `total_installments`, `monthly_amount`, `first_payment_date`, `status`, and `memo`.
- `GET /api/v1/loan-transaction-links` supports `review_status=all|pending|not_candidate` and returns default `pending` when omitted.
- Installment transaction links live in `installment_transaction_links`; one transaction can link to one plan, and each `(installment_plan_id, installment_number)` can be used once.
- `GET /api/v1/installment-transaction-suggestions` returns deterministic matching candidates for active installment plans only.
- Suggestions respect payment method and can use confirmed alias continuity with exact amount evidence. Cross-plan ambiguity, competing transactions and occupied installments are flagged across all active plans before a plan filter is applied. Suggestions never create links automatically.
- Deleted/merged transaction links stay stored but are excluded from plan linked counts and observed forecasts. `inactive_installment_link` exposes `conflicting_transaction_id/state`. Explicit unlink with `require_inactive=true` requires that transaction still be inactive (`409` if restored); there is no automatic link deletion.
- `GET /api/v1/installment-transaction-links` returns expense candidates with installment classification, an existing link, or a read-only active-plan matching suggestion. It supports `linked`, date, search, plan, and pagination filters.
- The recurring-classification screen may classify a merchant group as `installment`, but the ledger, installment count, per-transaction installment number, and forecast are managed through installment plan/link APIs.
- `GET /api/v1/installments/forecast` was removed. `/read/commitments?period=YYYY-MM` returns installment `monthly_burden`, `remaining_count`, `end_date`, and observation state. No future schedule or missed-payment inference is returned.

### Purchase Gate

- Purchase gate candidates are a discretionary purchase review queue, not a final purchase allow/deny decision.
- Candidate generation reads the T056 axes from `vw_transaction_nature`: only ad hoc (`payment_form='ad_hoc'`, so no loan/installment link and no recurring-commitment membership) expenses whose resolved adjustability is `adjustable` are candidates. Protected and `undecided` rows are excluded; nothing is inferred for undecided rows. The old `cost_kind`/`spend_necessity` columns are not read.
- A transaction appears once even if it triggers multiple signals. `candidate_type` is the representative reason, while `candidate_types[]`, `reasons[]`, and namespaced `signals` carry every matched reason.
- Canonical review keys are `transaction:{transaction_id}`. Legacy reason keys such as `large_oneoff:42` are still read as fallback state, but new writes store the canonical key.
- Unconfirmed one-charge/one-refund pairs with equal date, merchant, payment method and amount can expose `possible_cancellation` and evidence ids. This is a low-confidence review hint, never a settlement write or confirmed cancellation. Response `start_date`/`end_date` state the evaluated period.

### Settlement Group Canonical Netting Boundary

- `raw` `transactions` rows preserve original import sign and amount. This includes a positive `type='지출'` refund/cancellation row, which remains positive in raw storage and raw `/api/v1/transactions` responses.
- Settlement economics are applied only in downstream read layers (`vw_metric_refund_allocations`):
  - confirmed-only states: `auto_confirmed`, `user_confirmed`
  - unconfirmed states: `review_required`, `rejected` (no allocation)
  - an allocation counts only while both participants stay in the effective basis (`type='지출'`, not deleted/merged/superseded, KRW, purchase negative, refund positive)
- Cashflow aggregates (`/api/v1/analytics/monthly-cashflow`, `category-mom`, `fixed-cost-*`, `merchant-spend`, `payment-method-patterns`, `spending-anomalies`, `/metrics/*`, dashboard views) keep every refund in its posting month; a confirmed allocation only re-attributes the allocated part's classification to the original purchase. The signed monthly net is identical whether or not a refund is linked (T055).
- `/api/v1/analytics/*` and `/api/v1/metrics/*` are read-only and never create, update or reconcile `settlement_matches`.
- Purchase-level detectors (recurring payments, discretionary velocity, purchase gate/review queue) use `purchase_net.v1`: confirmed allocations net into the original purchase; a partially allocated refund keeps its unallocated remainder (previously the whole refund was dropped).

### Snapshot Import Behavior

- 업로드는 `snapshot_date`를 필수로 받는다.
- snapshot 적재는 문서상 UPSERT처럼 보일 수 있지만, **현재 구현은 해당 `snapshot_date` 행을 먼저 삭제한 뒤 새 파싱 결과 전체를 다시 insert** 한다.
- 즉, contract는 실질적으로 “date-scoped replace”다.
- legacy `/upload`과 explicit `/upload/apply` 모두 같은 date-scoped snapshot replace를 사용한다. same-date replace는 saved asset liquidity metadata와 loan repayment metadata source를 가능한 범위에서 보존한 뒤 최신 affected loan snapshot의 linked-loan repayment estimation을 다시 실행한다.
- Asset liquidity overrides carry forward from the nearest same-or-earlier snapshot with an unambiguous `side/category/product_name` identity. Explicit `null` (automatic) and `false` are preserved; duplicate/generated-suffix identities do not receive cross-date guesses.

### Loan Repayment Metadata Source

- `loans.monthly_payment_source` and `loans.repayment_method_source` are nullable string sources exposed on loan summary and repayment metadata responses.
- Stored live values are `manual` and `estimated_from_linked_transactions`.
- Manual `PATCH /api/v1/loans/{loan_id}/repayment-metadata` marks only the supplied field sources as `manual`.
- Omission preserves a field; explicit null is a manual missing value and zero is a valid manual value. `monthly_payment_mode='automatic'` or `repayment_method_mode='automatic'` clears that manual override and recalculates the latest snapshot. A mode and its value cannot be supplied together (`422`); automatic mode on a historical snapshot returns `409`.
- `POST /loan-accounts/recalculate-estimates` accepts 1–100 `loan_account_ids` and optional `reset_invalid_manual_null` (default false). It touches only selected latest snapshots. The opt-in reset applies only to `monthly_payment_source='manual'` with a null amount; non-null manual amounts and manual repayment methods are preserved. Missing accounts return `404`; an account with no snapshot returns `409` before changes.
- Summary, metadata and recalculation responses expose `monthly_payment_missing_reason`, `monthly_payment_estimate_basis`, observation months, window and minimum observations. A missing estimate is not zero.
- After loan-link writes, linked-transaction delete/restore (single or bulk), account kind changes and snapshot imports, My Ledge refreshes latest affected loan estimates using effective `asset_liability_health.monthly_payment_estimate_*` settings. Estimation uses completed months of effective KRW loan flow lines (net of posting-month attributed refunds) only; overdraft accounts (`loan_kind='overdraft'`) use a recent completed-month average, while other loan kinds use completed-month median.
- Auto-estimation never overwrites `monthly_payment_source='manual'`. When linked observations fall below the configured minimum, stale `estimated_from_linked_transactions` monthly payments are cleared. When all observed linked repayment months use `repayment_type='mixed'`, My Ledge can auto-fill `repayment_method='principal_interest'` with `repayment_method_source='estimated_from_linked_transactions'`; stale estimated repayment methods are cleared only when linked observations no longer support an inferred method.
- Loan summary also joins the stable `loan_accounts` row by `lender + product_name` and exposes nullable `loan_kind`. If the snapshot repayment method is missing or non-manual `unknown`, compatible `loan_kind` values can be used as a read-only display fallback with `repayment_method_source='derived_from_loan_account'`; this does not write back to `loans`.

### Analytics Settings

- `GET /api/v1/settings/analytics` 와 `PATCH /api/v1/settings/analytics` 는 `X-API-Key` 인증이 필요하다.
- persisted setting 범위는 `spending_anomalies`, `discretionary_velocity`, `purchase_gate`, `recurring_dry_run`, `asset_liability_health`, `bulk_operations`, `financial_targets`, `comparison` 이다.
- 응답은 `defaults`, `saved`, `effective` 를 나눠 반환하고, `comparison_guide`(제목, 요약, `options[]`: `key`, 한국어 `label`·`description`, `editable`, 현재 값의 한국어 `value_label`)를 함께 준다. 화면은 내부 문자열 대신 이 한국어 선택지와 설명을 그대로 보여 줄 수 있다.
- `comparison` 지원 필드 (T057):
  - `baseline_start_date` default `null`(제한 없음). ISO 날짜. 저장 위치는 `app_settings`(`scope=analytics.comparison`)의 한 행이며 스키마 변경은 없다. `null`을 보내면 저장값을 지운다.
- `spending_anomalies` 지원 필드:
  - `min_delta_amount` default `100000`
  - `anomaly_threshold` default `0.5`
  - `baseline_months` default `6` (T057 이전 `3`; 비교 계약의 기본 기준 기간과 같게 바꿈)
- `PATCH` 에서 값을 지정하면 저장되고, `null` 로 보내면 해당 저장값을 삭제해 code default로 되돌린다.
- 재사용하는 이상 지출 검출 서비스의 설정 해석 순서는 `명시적 query param > persisted setting > code default` 다.
- sparse baseline에서는 `delta_pct_raw`와 user-facing `delta_pct_display`/`reason`이 분리된다. 매우 작은 baseline에서 과도한 percentage를 그대로 문장화하지 않는다.
- `discretionary_velocity` 기본값은 `baseline_months=6`, `warning_velocity_ratio=1.2`, `high_velocity_ratio=1.5`, `minimum_classification_coverage=0.7`.
- `purchase_gate` 기본값은 큰 지출 `100000`, 새 거래처 lookback 6개월, spike ratio `merchant=2.0`, `discretionary=1.5`, review cooldown 14일.
- `bulk_operations`는 preview/confirmation 기본 ON, `max_bulk_rows_without_extra_confirmation=100`.
- Recurring upload auto-apply is one effective setting shared with the legacy auto-classification settings endpoint. Recurring default scope is `all_matching|reviewed_only`; reversed interval min/max ranges are rejected.
- An unsupported historical default scope remains inspectable in `saved` while `effective` falls back to `reviewed_only`.

### Observed Values and Monthly Projection

- Dashboard canonical monthly rows remain observed values. Since `20261115_0035` the legacy aggregate views (`vw_monthly_cashflow`, `vw_true_spendable_monthly`, `vw_fixed_cost_monthly_summary`, `vw_loan_repayment_monthly`, `vw_merchant_monthly_baseline`, `vw_recurring_merchant_monthly`, `vw_category_monthly_spend`, `vw_income_monthly_by_category`) read `vw_metric_flow_lines` with unchanged columns. Dashboard `data_coverage` uses the metric basis and the response adds `metric_as_of`.
- `month_projection.observed_income`/`observed_net_expense` are SQL totals over `vw_metric_flow_lines` (same definition as `income_total`/`total_outflow`); projection input rows come from `vw_metric_transactions` (KRW, not superseded). T064 round 1 changed the forecast in three places (R3 installment occurrence by linked date, R9 possible payer rename, R10 remaining period after the upload date) and added the optional `remaining_period_start` field; see the metrics reference. T064 round 2 (no field removed or retyped, no migration): expense assumptions read the `vw_metric_flow_lines` commitment split (R6; recurring sources are registered commitments), loans without an expense line in the ledger are listed in `expense_components[].not_in_expense_commitments` instead of being added (R1), person-registered loan merchant rules and installment plan rules count as unlinked observed payments (`link_unconfirmed_count`/`link_unconfirmed_amount`, R1/R2), stopped commitments never fall back into the variable baseline and commitment end dates are followed (R5), annual-like spending and yearly commitments use the 12-month window (`twelve_month_window`, `annual_items`, R4), income continuity is per pay cycle (`cycle_anchor`, `cycle_reassigned_transaction_ids`, R7), the dashboard default as-of date is the transaction as-of date (`as_of_basis`, R11), and `remaining_expense_adjustability` shows the undecided share of the remaining spending assumption (R12). Recent closed-month replay error is the separate `GET /api/v1/canonical-views/month-projection/accuracy`. The removed dashboard no longer exposes `true_spendable_monthly`; its DB view remains. Forecasts use `/read/month-projection.data`.
- `month_projection` separates observed income/expense, remaining expected income/expense, and projected month-end net. It supplies source evidence, dates, confidence, coverage, excluded periods and missing reasons. Unknown expense components propagate null to the full expense/net forecast; null is not zero.
- Recurring components expose source-level gross payments, refunds, net actuals, baseline and remaining estimates with confidence, warnings and history. Weak current explicit recurring histories can yield a numeric low-confidence scenario. Refunds do not generate a replacement obligation; excess observed payments stay in actuals. Sources without payment evidence and genuinely unknown loan/installment/coverage inputs still propagate null.
- Remaining recurring estimates use historical payment dates after the observation cutoff, capped by the baseline less current gross payments. `warnings` mark reviewable estimates separately from `missing_reasons`; `expected|observed|review` describes projection evidence, not a confirmed contract state.
- Components retain `known_expected_remaining`; the total is `known_expected_remaining_expense`. `net_after_known_remaining_expense` subtracts only those estimated portions (including low-confidence ones) and omits unknown expense, so it is a partial calculation rather than the full month-end forecast or a cash balance.
- `GET/PATCH /settings/income-expectations` stores expected amount/day/stopped status per normalized income source. PATCH replaces all `items`; an empty list removes all overrides. Reads and projections do not write settings, transactions or links.
- Without `reference_date` the focused forecast's as-of date is the transaction as-of date (`vw_metric_as_of.transaction_as_of`, extended to the latest upload snapshot when that falls later in the same month), not today; `month_projection.as_of_basis` says which. The old dashboard queue and completeness fields were removed.
- Dashboard queue search, issue and month filters run before counting and pagination. `queue_page`, `queue_limit` (1–100), total and total-pages metadata describe the filtered queue; returned row count is not the queue total.
- Exact forecasting formulas and coverage rules are documented in [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md); consumer interpretation is in [agents/canonical-read-surface-reference.md](agents/canonical-read-surface-reference.md).

### Signed Analytics and Asset Basis

- Category month comparison exposes `reference_date`, `is_partial_period` and `comparison_basis`; a partial selected month is compared with the same day range in the previous month, including when the target month has no rows. Since T057 an in-progress target month is always partial (also when `end_date` is omitted or set past the transaction as-of date), so it is never compared with the full previous month.
- Expense refunds remain signed in recurring amounts, necessity buckets, anomalies and discretionary velocity. Anomalies include `direction`; necessity-unclassified amounts/counts are separate from cost-kind-unclassified values.
- Count fields on cashflow aggregates (`merchant-spend.count`, `payment-method-patterns.transaction_count`, `fixed-cost-*.unclassified_count`/`necessity_unclassified_count`) count distinct transactions whose amount lands in the bucket, including refunds and zero-amount rows.
- Snapshot totals, history, comparison, net-worth breakdown and liquidity health share `aggregation_basis='nonnegative_asset_rows_minus_liability_rows'`. Raw negative asset rows are preserved and excluded from asset totals; their signed sum is `negative_asset_excluded_total`.
- Liquidity defaults are anchored to the selected snapshot date. Required spend nets essential expenses and adds linked debt expense only when it is not already essential. Debt payment uses the selected loan snapshot once. Input dates, required-spend period/components and debt-payment snapshot date are returned as provenance. Transaction inputs (income, required spend, insurance premium estimate) read `vw_metric_flow_lines` (effective KRW basis).
- Asset liquidity PATCH preserves omitted fields; explicit null restores automatic/heuristic behavior and explicit false is an override.

### Investment / Loan Summary

- `snapshot_date`는 선택값이다.
- `snapshot_date`를 생략하면 latest snapshot을 사용한다.
- 문자열 `latest`를 query parameter 값으로 보내는 contract는 현재 구현에 없다.

### Assets Snapshot Endpoints

- `GET /api/v1/assets/snapshots`
- `GET /api/v1/assets/net-worth-history`
- `GET /api/v1/assets/snapshot-compare`

위 세 endpoint는 현재 `start_date` / `end_date` filter를 받지 않는다.
현재 live contract에는 asset/investment/loan raw snapshot row를 삭제, 숨김, 만기 처리, 병합하는 endpoint가 없다. `PATCH /api/v1/assets/snapshots/{asset_snapshot_id}/liquidity`는 최신 자산 row의 유동성 metadata만 수정한다. raw-data lifecycle과 multi-source provenance는 [Implentation-plan.md](../Implentation-plan.md)의 `T015`-`T019` 항목에서 관리한다.

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

- `POST /api/v1/upload`와 `POST /api/v1/upload/apply`는 성공 commit 이후 원본 업로드 파일을 `UPLOAD_DIR`에 저장한다.
- original upload 저장이 `OSError`로 실패해도 DB commit 결과는 rollback하지 않는다. explicit apply는 success를 유지하고 warning을 upload log에 남긴다.
- 두 upload 응답의 snapshot summary는 `asset_snapshots`, `insurance_contracts`, `investments`, `loans`를 포함한다. `2.현금흐름현황`은 verification evidence이며 저장하지 않는다.
- `UPLOAD_DIR` 기본값은 `/data/uploads` 이다.
- 저장 파일명은 `upload_logs.id` 기반 prefix와 안전화된 원본 파일명을 사용한다. 예: `000123-finance-sample.xlsx`
- 저장 후 같은 디렉터리의 파일은 최신 5개만 남기고 오래된 파일을 삭제한다.
- 직접 service helper를 호출하는 테스트/스크립트 경로는 `persist_upload_file=True` 를 명시한 경우에만 원본 파일을 저장한다.

### Transaction Source Lifecycle & Reconciliation Flow

- Status/의미:
  - 영속 상태:
    - `active`: 현재 업로드 윈도우에서 보존되고 최신 import 상태인 row.
    - `missing_from_latest_export`: 최신 업로드 윈도우에서 사라져 하위 상태로 보존됨(즉시 hard delete 아님).
    - `source_changed`: fallback 매칭(시간/서명/카테고리 등)으로 같은 원천 row가 `date/time/type/금액/카테고리/설명/통화/결제수단` 기준이 변경됨.
    - `superseded`: 상위/대체 row가 도입되어 현재 버전이 아닌 row. 신규 업로드가 기존 import row를 대체했을 때 정합성 추적용으로 남음.
  - preview/review용 reserve 상태:
    - `duplicate_candidate`: 동일 source hash 또는 동일 매칭 후보가 다수인 경우, 수동 판정이 필요한 후보 상태.
    - `ambiguous`: incoming row가 다수 후보와 매칭 가능해 자동 적용이 위험해 review_required로 남는 후보 상태.
  - source lineage 필드:
  - `source_row_hash`: 업로드 source signature hash.
  - `first_seen_import_id`, `last_seen_import_id`: 최초/최종 확인 upload 로그 id.
  - `source_first_seen_at`, `source_last_seen_at`: 최초/최종 확인 시각.
  - `superseded_by_transaction_id`: superseded된 경우 대체 대상 id.
- 공개 read 경계:
  - 비인증 `GET /api/v1/transactions` 응답은 `source`만 공개하고 위 lineage 필드는 포함하지 않는다.
- 업로드 흐름:
  - `POST /api/v1/upload/preview`: 파일 파싱만 수행하고 DB를 변경하지 않는 reconciliation plan(변경안)만 반환한다. 거래 sheet뿐 아니라 required snapshot sheet/marker도 함께 검증하고, workbook 구조가 맞지 않으면 `422 invalid_workbook`을 반환한다.
  - `safe` 변경(`new`, `unchanged`, `source_fields_changed`, `time_shifted`, `missing_from_latest_export`)은 기본 자동 적용 후보로 분리.
  - `review_required` 변경은 사용자 확인 필요. 이 중 `possible_replacement`만 명시 승인된 selection으로 supersession 적용 가능하며, `possible_duplicate`/`ambiguous`는 apply에서 거부하고 수동 해소 대상으로 남긴다.
  - `POST /api/v1/upload/apply`는 `UploadApplyRequest(confirmation=true)` + preview 결과 selection 중 safe change와 명시 승인된 `possible_replacement`만 반영하고, 같은 DB transaction에서 workbook snapshot을 해당 `snapshot_date`에 replace한다.
- 변경 상세:
  - 응답 change 항목은 기존 값/신규 값 차이(field_changes), 판단 근거(reason), 사용자 보존 필드 목록(preserved_user_fields), 보존 요약(preservation_summary)과 함께 보낸다.
  - `merchant_override`, `category_*_user`, `memo`, `is_deleted`, `merged_into_id` 등 사용자 관리 값은 재적용 시 보존 규칙을 따른다.
- legacy 경계:
  - 기존 `POST /api/v1/upload`은 즉시 write하는 기존 동작이며, 업로드/재적용 시 하위 계층(프리뷰+선택 apply)로 분리하지 않고 곧바로 import를 완료한다.
  - `/api/v1/upload/preview` + `/api/v1/upload/apply`는 동일한 source-matching 규약을 쓰되, preview 단계 분리와 명시적 확인을 추가한 최신 경로다.
- raw signed 보존:
  - 거래 원천 금액/서명(`amount`의 부호)은 raw import 기반 값으로 해석되며, preview/apply은 raw signed 값을 재구성하지 않고 거래별 source-관리 변경사항에 대해 결정적/재현 가능한 방식으로만 갱신한다.

### Reset / Upload Logs Semantics

- `POST /api/v1/data/reset` 는 transaction/snapshot current state만 삭제한다. `transactions_and_snapshots` includes asset, insurance, investment, and loan snapshot tables.
- `upload_logs` 는 reset 대상이 아니다.
- reset response의 `upload_logs_retained` 는 현재 항상 `true` 다.
- 따라서 작업대의 최근 업로드 이력은 “현재 남아 있는 데이터”가 아니라 “최근 import 실행 history” 로 읽어야 한다.

## Document Status

- `PRD.md`
  - 제품 요구사항 문서
  - 구현 반영은 하되, low-level contract는 이 문서가 더 직접적이다
- `../Implentation-plan.md`
  - 사용자가 보는 구현 현황과 남은 roadmap
  - live contract가 아니라 제품 방향과 남은 항목 정리 기준이다
- `docs/archive/planning/finance-advisor-analytics-expansion.md`
  - historical planning 문서
  - 현재 live backend/API SSOT나 active backlog로 사용하지 않는다
- `docs/frontend-reimplementation-wireframe-functional-requirements.md`
  - frontend contract 참고 문서
  - backend/API SSOT 문서는 아니다


## Investment source selection foundation

This contract is additive. Existing snapshot history, comparisons, `/investments/summary`, and snapshot canonical views retain their BankSalad basis. The external Toss adapter is not implemented by the selection foundation.

| Method | Path | Meaning |
|---|---|---|
| `GET` | `/api/v1/assets/source-policy` | Saved investment default, account overrides, freshness threshold, and revision. Non-investment global source stays BankSalad. |
| `POST` | `/api/v1/assets/source-policy/preview` | Authenticated preview of proposed policy, current/proposed selections, available net-worth impact, and preview token. |
| `PATCH` | `/api/v1/assets/source-policy` | Authenticated explicit confirmation of the previewed policy; stale preview must be retried. |
| `GET` | `/api/v1/investments/selected` | Selected current holdings/account source metadata and separate confirmed/estimated net worth; optional `as_of_date` limits valuation dates under the current policy/mappings, not historical knowledge. |
| `GET` | `/api/v1/assets/source-coverage` | Selected source coverage, freshness, fallbacks, and conflicts. |
| `GET` | `/api/v1/assets/source-account-mappings` | Explicit BankSalad group ↔ external account mappings. |
| `POST` | `/api/v1/assets/source-account-mappings` | Authenticated mapping with confirmation, reason, mapped asset components, and equivalent cash scope. |

Policy changes preserve historical observations. The first implementation selects complete accounts, never combines a BankSalad quantity with a Toss price, and never changes non-Toss holdings merely because the investment default is Toss. BankSalad broker groups are provisional identities, not proof that a broker has one account.

`confirmed_net_worth` remains the BankSalad same-date snapshot value. `estimated_net_worth` applies only defensible mapped account replacements and can be `null` when component/cash coverage is unknown. Source-specific basis timestamps, `mixed_dates`, and warnings accompany current estimates. A transfer between source dates can still be double counted across a stale bank account and a fresh securities account; these estimates must not be labeled investment profit, spending capacity, or a same-date confirmed total.

No successful complete mapped Toss observation means a visible BankSalad fallback. After a usable complete run exists, refresh failure/partial results preserve that complete run with freshness/failure metadata. The API collector, authentication with Toss, and automatic scheduling remain outside this contract.

`as_of_date` is a valuation cutoff under **current** source policy/mappings. Later-ingested observations whose valuation falls before the cutoff may be included. The response is not a reconstruction of what was known or configured on that date; explicit date-cutoff responses use `total_basis=valuation_cutoff_current_policy_not_known_at_history`; ordinary latest reads use `selected_current_estimate_with_source_dates`. Use the original snapshot history APIs for BankSalad history. BankSalad `valuation_precision=date` must be rendered as a date, not an invented intraday time.

`investment_total_complete=false` means the numeric investment sum is only a subtotal of known/eligible values; missing valuations or ambiguous normalized identities must be displayed as incomplete and must not produce a full net-worth estimate. Coverage counters have distinct units: `raw`, `selected`, `excluded`, `hidden` count observations; `confirmed` counts mappings; `conflicted`, `stale` count account groups. They must not be divided into one purported completeness ratio.

### 토스증권 수동 수집 (T019)

- `GET /api/v1/integrations/toss/status`: `configured`, 비밀값 없는 `last_attempt`(run_id/status/observed_at/ingested_at/error_code), `mapping_connected`, `cooldown_seconds`.
- `POST /api/v1/integrations/toss/sync`: `X-API-Key` 필요. 요청 `{ "confirm_single_account_mapping": false }`; 키/토큰/계좌번호는 요청에서 받지 않는다. 응답 run_id/status/holdings_count/mapping_connected/error_code/observed_at. 공급자 실패도 기록된 run과 안전한 error_code를 200으로 반환한다. 미설정503, 진행 중·60초 cooldown409, 인증401.
- 확인을 true로 보낼 때만 정확히 하나인 BROKERAGE 계좌와 기존 뱅샐 토스증권 그룹을 연결한다. 사용자는 동일 계좌이며 국내·미국 주식(ETF 포함)만인 그룹임을 확인한다. 비주식/알 수 없는 product_type, 다중계좌, 기존 매핑 충돌은 자동 연결/대체하지 않는다. 매핑 오류여도 조회된 관측치는 보존되며 소스 정책은 자동 변경하지 않는다.
- 완전 수집은 공식 API의 국내·미국 주식 범위에만 해당한다. 채권·옵션·예수금은 미포함이다. `marketCountry:symbol`로 종목을 식별하고 계좌 그룹 전체를 선택하므로 이름 유사도 기반 매칭은 하지 않는다. 기존 매핑 이후 뱅샐에 비주식 항목이 생겨도 `unsupported_holdings_scope`로 뱅샐을 유지한다.
- 국내/해외 금액 합계 검증, USD 원화 환산, FX 유효기간 검증을 통과해야 `success_complete`. 일부 항목 또는 FX 오류는 `success_partial`로 이전 정상 수집을 유지한다. 조회 실패는 failed이며 원문 오류/토큰을 저장하거나 응답에 넣지 않는다.
- `asset_source_runs.provenance`: `valuation_time_basis=observation_proxy`, `provider_valuation_at=null`, `holdings_scope=kr_us_stocks`, API 버전, 원통화 합계와 FX의 midRate/유효구간/조회시각. 원천 holdings에는 평가시각이 없으므로 valuation_at은 조회시각 대용이고 `valuation_precision=observation_proxy`로 반환한다. 이때 stale는 조회 경과시간이며 시세 최신성을 보장하지 않는다.
- `/investments/selected` item의 quantity/native_currency/native_market_value/exchange_rate로 원화 추정의 근거를 확인한다. FX는 별도로 조회하므로 원자적 스냅샷이 아니다. 기존 BankSalad 순자산/과거 스냅샷 API는 유지한다. 자산 component·현금 범위가 확인되지 않은 새 매핑은 현재 추정 순자산을 null로 유지한다.
- 실행 키는 backend 환경변수만 사용한다. 단일 프로세스 토큰 메모리 재사용, 고정 조회 경로, 제한된 429 재시도, 수동 새로고침만 제공한다. 자동 스케줄/주문/이체는 없다. 설정은 [toss-securities-setup.md](toss-securities-setup.md).


## Upload rollback points

- 세 가져오기 경로(`/upload`, `/upload/apply`, reviewed apply)는 원장을 쓰기 전에 같은 트랜잭션(legacy는 세션 advisory lock 아래)에서 `upload_rollback_points`에 반영 직전 상태를 저장하고, commit 직전에 post fingerprint를 기록한다. 실패한 가져오기는 지점을 남기지 않는다.
- 범위: `upload_logs`, `upload_review_operations`, `upload_rollback_points`를 제외한 모든 원장 표. 하나의 advisory lock이 가져오기와 되돌리기를 직렬화한다.
- T056의 새 표(`recurring_commitments`, `category_adjustability_defaults`, `transaction_nature_overrides`)도 이 범위에 자동으로 들어간다. 마이그레이션 0036 이전에 만든 지점은 새 표가 스냅샷에 없어 `schema_changed`로 거절된다(설계된 동작).
- 최신 10개 `ready` 지점만 상태를 보관하고 이전 지점은 `expired`(행은 유지)가 된다. 되돌리기는 restored fingerprint가 pre fingerprint와 같을 때만 commit한다. 업로드 로그와 검토 operation은 삭제하지 않는다. PostgreSQL 전용.

## Agent Read Surface (T060)

Small read responses for consulting agents (plan 3.2). Code: `backend/app/api/v1/endpoints/read_surface.py`, `backend/app/services/read_surface_service.py`, `read_commitments_service.py`, `read_review_items_service.py`, `read_surface_index.py`, schemas `backend/app/schemas/read_surface.py`. Reads only; every route requires `X-API-Key`. No migration. The seven deprecated GETs were removed with owner approval on 2026-11-17; retained financial values, import/write contracts and DB objects are unchanged. Discovery pointers move to the new projection home. Retirement plan: [agents/read-surface-migration.md](agents/read-surface-migration.md).

| Method | Path | Status | Notes |
|---|---|---|---|
| `GET` | `/api/v1/read/index` | live | Entries (`key`, `name`, `path`, `questions` Q1–Q6, `definition`, `availability=live\|reserved`, `provided_by`, `parameters`), the status vocabulary, format rules. Q5 entries point at the live `/metrics/net-worth/*` paths. |
| `GET` | `/api/v1/read/monthly-flow` | live | `start_period`/`end_period`. `data.items` = the `/metrics/monthly-flow` items unchanged. |
| `GET` | `/api/v1/read/spend-cube` | live | Same parameters as `/metrics/spend-cube`. `data`: `group_by`, `filters`, `total_amount` (before truncation), `row_count`, `truncated`, `rows` (same row model). |
| `GET` | `/api/v1/read/comparison/monthly-flow` | live | `period`. `data`: `comparison`, `measures`, `residual_rate` of `/metrics/comparison/monthly-flow`. |
| `GET` | `/api/v1/read/comparison/contributions` | live | Same parameters as `/metrics/comparison/contributions`; `data` = that response without `contract`. |
| `GET` | `/api/v1/read/review-items` | live | `period` (default latest closed month), `limit` 1–500. One post-hoc review list: purchase-level candidates (`subject=transaction`, the existing `purchase-gate-candidates` detector) and category changes (`subject=category_month`, the existing `spending-anomalies` detector). Each item has `listed_because[]` (`source`, `code`, `code_label`, the detector's own `detail` sentence and `signals`). No new score; `risk_level`, `review_priority`, `confidence`, `future_friction_suggestion` are not carried. Order: transactions by amount, then category items by absolute change. |
| `GET` | `/api/v1/read/commitments` | live | `period` (default latest closed month). Loans, installment plans, recurring bundles in one list: `monthly_burden` + `monthly_burden_basis` (`recorded_monthly_payment`, `plan_monthly_amount`, `last_observed_closed_month`, `not_available`), `cycle`, `start_date`/`end_date`, `total_count`, `remaining_count`, `linked_count`, `adjustability` + basis, `lifecycle`, last observed month, and `observation` for the period: `observed`, `expected_not_observed`, `unlinked_transaction_present`, `not_expected`, `not_determinable`, each with a `reason`. `data.totals.observed_committed_total` equals the period's `committed_total`. |
| `GET` | `/api/v1/read/month-projection` | live | Optional `reference_date`. Shared envelope with `data=MonthlyProjection`; single T064 calculation, `completeness` and separate forecast/data dates. |
| `GET` | `/api/v1/read/data-status` | live | Transaction coverage, closed periods, in-progress period, per-kind snapshots (`assets`, `loans`, `investments`, `insurance`, `profile`, each with `days_before_transaction_as_of`), classification completeness (undecided amount/share/count, uncategorized expense, installment-link-unconfirmed count, commitments without cycle/adjustability), `coverage_gaps` (imported months with zero transactions), per-period states, excluded currency, and where the month-end forecast lives. `/metrics/data-status` is unchanged. |

Envelope (every route except `index`): `surface`, `surface_label`, `read_surface_version` (`read_surface.v1`), `questions`, `status`, `status_label`, `status_reasons[]` (`code`, `label`, `periods`, `detail`), `as_of` (`transaction_as_of`, `first_transaction_date`, `last_closed_period`, `in_progress_period`, `snapshot_as_of` per kind), `period_scope` (`start_period`, `end_period`, `periods[]` with `coverage`, `month_status`, `status`, `transaction_count`, `total_outflow`, undecided total/share), `classification` (undecided total, total outflow, share, `complete`), `basis` (`definition`, `scope`, `rules`, `field_scopes`, `assumptions[]`), `labels` (English key → Korean name), `data`.

Status vocabulary:

| Status | Meaning | HTTP |
|---|---|---|
| `ok` | Data present and the scope has no undecided adjustability. | 200 |
| `classification_incomplete` | Data present, but undecided spend (or, for commitments/data status, commitments without cycle or adjustability) makes the split incomplete. | 200 |
| `no_transactions` | Period inside the imported range (first effective transaction month .. as-of month) with zero effective transactions. | 200 |
| `not_imported` | No transactions at all, or the requested periods are outside the imported range. | 200 |
| `query_failed` | The database read failed; body `ReadErrorResponse` (`surface`, `status`, `status_label`, `detail`), no values. | 503 |
| auth failure | Missing or wrong `X-API-Key`; existing body `{"detail": "Invalid API key."}`. | 401 |

Precedence: `not_imported` > `no_transactions` > `classification_incomplete` > `ok`. Every applicable reason is listed (`periods_not_imported`, `periods_without_transactions`, `in_progress_month_included`, `adjustability_undecided`, `commitment_attributes_missing`, `non_krw_excluded`). Invalid parameters return `422` in FastAPI's `HTTPValidationError` shape (see *Read surface consumer review* below); unknown query parameters are rejected.

Format rules: amounts are integer won; shares/rates are 0–1 floats (4 dp); dates ISO `YYYY-MM-DD`; periods `YYYY-MM`; stable English keys with Korean labels (sibling `*_label` on new item models, envelope `labels` for screen payloads whose shape is shared with `/metrics/*`); one basis block with assumptions as a list of Korean sentences; snapshot dates per kind, never merged.

Retired reads: the seven previously deprecated GETs now return 404. Their exact old → new field mappings are in [the migration guide](agents/read-surface-migration.md). The candidate/anomaly detector services remain behind `/read/review-items`, and the review PATCH is unchanged.

`GET /api/v1/analytics/liquidity-health` remains available with OpenAPI `deprecated: true`, `Deprecation: true`, and `Link: </api/v1/metrics/net-worth/emergency-fund>; rel="successor-version"`. Its body/status are unchanged. Import-contract endpoints and `/schema` are unchanged.

### Focused month-end projection (2026-11-17)

`GET /api/v1/read/month-projection?reference_date=YYYY-MM-DD`, API key required, `ReadMonthProjectionResponse`. The common read envelope carries **`data` = the exact former `dashboard.month_projection` object**, calculated by the single `get_monthly_projection` service. No calculation was copied or changed. `data.as_of_date` is the forecast reference date; envelope `as_of` remains the overall effective-ledger context (first date, transaction date, last closed/in-progress month, snapshots per kind). `data.coverage` describes the forecast's own observation/baseline coverage. `period_scope` and `classification` refer to the reference month, using the existing read conventions.

Without `reference_date`, the forecast follows the transaction as-of date (or a later successful upload date within the same month), with `data.as_of_basis=transaction_as_of`; explicit dates use `requested_date`, no-data defaults use `today_no_data`. Unknown query parameters and invalid dates produce HTTP 422 with the unified `detail` array. Bad enums on comparison/filter endpoints retain the same 422 convention. Authentication precedes validation; DB read failure gives 503 `query_failed`.

`data.completeness.full_projection_available` must be read independently of envelope `status`: false with a numeric value means a partial sum. `amount_scope` and `left_out[]` name the scope and omissions. Null is not zero. The accuracy endpoint `/api/v1/canonical-views/month-projection/accuracy` and income-expectations GET/PATCH retain their paths and bodies.

Changed keys in retained responses are discovery metadata only: `/read/index.entries[key=month_end_projection].{path,response_field,notes}` and `/read/data-status.data.month_end_forecast.{path,field,note}`. No other retained response keys or financial values change.

### Read surface consumer review

Changes after a consuming agent used `/api/v1/read/*` and `/api/v1/metrics/net-worth/*` as a real consumer. Additive: no field renamed, removed or retyped; with default parameters every existing value is unchanged (only lists that describe the surface grew: `/read/index` `entries`, `parameters`, `format_rules`, and the projection loan component `sources`). No migration, no view change.

| Area | Contract |
|---|---|
| 422 shape | Every 422 of `/read/*` and `/metrics/net-worth/*` is FastAPI's `HTTPValidationError`: `{"detail": [{"loc": ["query", <param>], "msg", "type", "input", "ctx"?}]}` (declared in OpenAPI). Service errors that used a plain string are converted (`app/core/validation.py`, `UniformValidationRoute`); a converted message without a known parameter has `loc: ["query"]`. |
| Unknown parameters | `/read/*` returns 422 `type=extra_forbidden`, one error per unknown name, `ctx.allowed` = the route's parameters. Checked after `X-API-Key` (401 first). |
| Enumerated filters | `/read/spend-cube`: `payment_form` ∈ `committed, ad_hoc`; `commitment_kind` ∈ `loan, installment, recurring`; `adjustability` ∈ `protected, adjustable, undecided`; `flow_row` ∈ the six expense rows (the cube holds expense lines only). `GET /transactions` `flow_row`/`payment_form`/`adjustability` were already enums (422 with `ctx.expected`). |
| Classification completeness | `classification` and `period_scope.periods[]` add `adjustability_undecided_transaction_count`, `adjustability_undecided_gross_total` (Σ\|undecided expense line\|), `expense_gross_total`, `adjustability_undecided_gross_share` (0–1). `complete` = undecided count is 0; period `status=classification_incomplete` and reason `adjustability_undecided` use the count. The existing net `adjustability_undecided_share` is signed (refunds net) and may fall outside 0–1. `/read/data-status` `data.classification` adds the gross fields and `adjustability_decided_gross_share`. |
| Month data coverage | `period_scope.periods[]` / `data.periods[]` add `data_coverage` (`full`, `partial`, `no_transactions_observed`, `outside_data`), `data_coverage_label`, `data_coverage_reasons` (`first_month_starts_mid_month`, `data_ends_before_month_end`). One rule (`MONTH_DATA_COVERAGE_RULE`) quoted in `basis.rules.month_data_coverage`, the comparison's `data_coverage_rule` (+ `target_data_coverage`, `target_data_coverage_reasons`) and `month_projection.coverage.month_coverage_rule`. `coverage_gaps[]` add `data_coverage` and `inferred=true`. `month_status` stays the calendar status. |
| Comparison baseline | `/read/comparison/monthly-flow` and `/contributions` take `baseline=median_of_recent_closed_months` (default, responses unchanged) or `previous_month`. `comparison.baseline_method`/`baseline_periods` state the one used; `basis.rules.baseline` explains it; `comparison.baseline_unavailable_reason` (`data_start`, `baseline_start_date`, `no_data`) is set whenever no baseline month was usable. `previous_full_month_delta_available` is true only when the response carries a full-month change (target closed with data, ≥1 baseline month). |
| Contributions | `data.items_summary` / `twelve_month_items_summary` (`requested`, `total_count`, `returned_count`, `truncated`, `returned_change_amount_sum`, `not_returned_change_amount_sum`, `returned_target_amount_sum`, `not_returned_target_amount_sum`, `items_without_change_count`), `sum_item_changes` (all monthly items before `limit`), `non_additive_gap` = `change_total − sum_item_changes`, `lists=both\|monthly\|twelve_month`. Items are changes against each item's own baseline, not a decomposition of the total (`basis.rules.contributions_additivity`). With `previous_month` every item (annual-like included, `window=monthly`) is in `items`, so the gap is 0; `twelve_month_items` is the unchanged 12-month view. |
| Spend cube | `data.total_group_count` (groups before `limit`), `data.returned_count`. |
| Commitments | Items add `end_date_status` (`recorded`, `open_ended`, `not_recorded`, `not_applicable`) + label + `end_date_reason` (never estimated) and `monthly_burden_origin` (`entered_by_person`, `estimated_from_linked_transactions`, `source_not_recorded`, `installment_plan_record`, `observed_closed_month`, `not_available`) + label. Parameters `status=active\|ended\|all` (default `all`) and `view=detail\|summary` (default `detail`; `summary` empties `items` and fills `item_summaries`); `data` adds `status_filter`, `view`, `total_item_count`, `returned_item_count`, `item_summaries`. Each summary row carries `commitment_key`, `kind`, `name`, `lifecycle`, `cycle`, `monthly_burden`, `monthly_burden_basis`, `monthly_burden_origin`, `adjustability`, `end_date`, `end_date_status`, `end_date_reason`, `observation_state`, `observed_amount` with the same values as the detail item. `totals` and `counts_by_state` always cover every commitment. |
| Transactions | `GET /transactions`, `GET/PATCH /transactions/{id}`, create and restore responses add `payment_form`, `payment_form_source`, `commitment_kind`, `adjustability`, `adjustability_source`, `flow_row`, `flow_rows`, `flow_row_source`, read from `vw_transaction_nature` and `vw_metric_flow_lines`. Sources: `transaction`, `commitment`, `category_default`, `loan_link`, `installment_link`, `none`, `not_applicable`, `not_effective` (deleted/merged/superseded); `flow_row_source`: `own_line`, `refund_allocated_to_purchase`, `no_flow_line`. `/read/review-items` transaction items carry the same values in `axes`. |
| Net worth | `items` add `unexplained_share_of_change` (= unexplained ÷ \|net_worth_change\|, signed, may exceed 1; null with `unexplained_share_withheld_reason` when the change is 0 or not computable), `investment_valuation_change_provisional` + `_reason` (true when the interval has undecided-purpose transfers). Intervals add both values. `status_note`: `complete` means every item was computable, not that the change is explained. |
| Month projection | `month_projection.completeness` (`status` `all_known_components` / `known_components_only` / `not_projected`, `status_label`, `full_projection_available` (true only for `all_known_components`), `amount_scope` (`all_known_components` / `known_components` = partial sum / `none` = no value), `left_out[]` with `component`, `key`, `name`, `reason_code`, `reason`, `basis`). Left out: income sources with `uncertain` or rule-`stopped` status (remaining counted as 0), loans in `not_in_expense_commitments`, components whose `expected_remaining` is null. The loan component's `sources` has one row per loan added to the assumption (`expected_monthly_amount` used, `observed_payment_amount`/`observed_net_expense` this month, `expected_remaining`, `match_method`, `loan_account_id`, `recorded_monthly_payment_source`). Nothing beyond month end. |
| Index | `/read/index` adds entries `month_end_projection` (path `/api/v1/read/month-projection`, `response_field=data`) and `month_projection_accuracy`, `entries[].response_field`, `signed_ratio_fields`, `vocabulary_mapping`, one format rule naming the signed exceptions, and the new parameters. |

Vocabulary mapping (names are kept; the meaning is the same):

| `/read/*` | `/metrics/net-worth/*` (and other metric responses) | Meaning |
|---|---|---|
| `status=classification_incomplete` | `status=incomplete_classification` | A human has not yet set an axis (adjustability, transfer purpose) for some amount. |
| `basis` (`definition`, `scope`, `rules`, `field_scopes`, `assumptions`) | `contract` (`definition`, `scope`, `inclusion`, `field_scopes`, `as_of`) | What was computed under which rules; `/read/*` carries the metric `contract` as `basis`. |
| `status_reasons[]` (`code`, `label`, `periods`, `detail`) | `status_reasons[]` (Korean sentences) | Why the status applies. |

### T054/T057 remaining acceptance (2026-11-17)

- T054 마지막 대출 실적 집계 보완: 정상 추정은 `vw_metric_flow_lines`의 대출 지급 줄을 계좌·월로 SQL 집계하며, 월 흐름표의 `committed_loan_total`과 `loan_repayment_total` 정의를 공유한다. 유효 KRW 지출만 포함하고, 확정 배분 환불은 원 상환 대출에 귀속하되 게시월에 차감한다. 환불 초과 월의 음수 실적은 보존하며 최종 추정에만 0 하한을 둔다. 외화·비지출 연결·대체된 원본의 제외, 환불 귀속과 관측월 변경 때문에 자동 추정 금액·가능 여부·상환 방식이 달라질 수 있다. 카테고리 수정만으로 연결 상환액은 달라지지 않는다.
- 업로드 검토 미리보기는 날짜·금액 변경을 먼저 적용한 CTE에 같은 SQL 정의를 실행한다. 기간 안팎 이동과 미연결 환불 변경을 포함해 적용 후 월 합계·대출 추정값과 같다. 검토·적용·롤백 계약, 수동값 보존, 저장값 갱신 시점은 유지한다. 읽기만으로 과거 저장 추정값을 소급 갱신하지 않는다. 테이블·컬럼·설치 뷰 SQL 변경과 이행 추가는 없다. [정확한 차이와 화면 경계](backend-api-and-metrics-reference.md#대출-연결-후보와-월상환-추정의-공통-실적-t054-마지막-보완)를 따른다.

- Migration `20261117_t054_t057` follows `20261116_0039`, changes views only, and is reversible. `vw_monthly_cashflow.savings_rate` is now null after `vw_metric_as_of.last_closed_period`; closed-month values stay unchanged. The home route already uses `MonthlyFlowMonth.residual_rate` from the server, with no client-side division. Settings render `comparison_guide` Korean labels/descriptions and edit `comparison.baseline_start_date`; the old free-text algorithm controls are no longer shown.
- Legacy names are retained. Additive aliases and their mappings:

  | Surface | Legacy field | Unambiguous field | Scope |
  |---|---|---|---|
  | `/analytics/fixed-cost-summary`, `fixed-cost-trend.items[]` | `expense_total` | `total_outflow` | All effective KRW expenses, including loan repayments; posting-month refunds netted |
  | `vw_monthly_cashflow`, dashboard `monthly_cashflow[]` | `expense_total` | `total_outflow` | Same total outflow |
  | Same cashflow surfaces | `non_loan_expense_total` | `living_spend` | Total outflow minus loan repayments |
  | `vw_fixed_cost_monthly_summary` | `expense_total` | `living_spend` | Effective KRW expenses excluding loan repayments |
  | Transaction bulk mutation preview, including nested delete/restore previews | `expense_total` | `selected_raw_expense_net` | Negative sum of selected raw expense amounts, net of positive refunds; includes the selected operation's deleted/merged rows and source currencies without conversion; not a canonical cashflow total |

  Analytics `contract.field_scopes`, dashboard `field_scopes`, and preview `field_scopes` map these names. The SQL view columns and the reference screen expose the corresponding explicit names. This earlier additive change preserved the old keys; the approved T060 removal later deleted the dashboard HTTP schema.
- `/read/review-items.data.comparison` now governs both detectors: recent six closed months, baseline start setting, missing months skipped, real zero months included, mid-month first month excluded, same elapsed days in progress. Purchase signals use a **different amount definition**: positive ad hoc adjustable purchase nets from `vw_metric_transactions.purchase_net_amount`, grouped in SQL. Later allocated refunds reduce the original purchase. This is not posting-month `total_outflow`. Candidate thresholds and cancellation/review logic remain detection logic in Python. Annual-like 12-month totals are available on `/read/comparison/contributions.twelve_month_items`; review detectors use monthly totals.
- Historical compatibility exception, ended by the approved T060 removal on 2026-11-17: deprecated dashboard `merchant_monthly_baseline[]` / `vw_merchant_monthly_baseline`, `/analytics/discretionary-velocity`, and `/analytics/purchase-gate-candidates` / `spending-review-candidates` keep their old baselines. Use `/read/comparison/contributions?level=merchant`, `/read/comparison/monthly-flow`, and `/read/review-items`, respectively. Their successor comparisons remain available; these HTTP endpoints are now removed and the SQL views remain. See [migration guide](agents/read-surface-migration.md#6-검증과-변경-키).

전용 전망 응답은 예전 객체의 단위를 보존한다. `data.remaining_expense_adjustability.undecided_share_pct`는 백분율(0–100)이고, 봉투의 분류·기간 비중은 0–1이다. 새 응답의 `basis.rules.projection_ratio_units`와 `labels`가 단위 예외와 열거값 한국어 이름을 밝힌다.

## T062 — 연간성 지출 참고와 월 한도

모든 새 경로는 `X-API-Key`가 필요하다. 기존 필드·endpoint·총지급 산식은 바꾸지 않는다.

| 경로 | 계약 |
|---|---|
| `GET /api/v1/read/spending-reference?period=YYYY-MM` | `ReadEnvelope`, `basis.definition=spending_reference.v1`. 생략 시 최근 마감월, 없으면 진행월. `data`에 대상 월, 기존 `total_outflow`, 12개월 창 시작·끝, `annual_items`, `comparisons`를 준다. `/read/index`에 등록됨. |
| `GET /api/v1/spending-limits` | `revisions` 전체 변경 이력, `last_closed_period`, `history_rule`. 대상별 적용 시작월 순. |
| `POST /api/v1/spending-limits` | 201. 사람이 `target_kind=category|adjustability`, `target_value`, `effective_from_period`, `amount`를 입력한다. 대분류는 정확한 문자열(빈 문자열은 미분류), 조정 가능성은 `protected|adjustable|undecided`. `amount`는 0 이상 원 단위 정수(최대 9,000,000,000,000,000), `null`은 한도 해제. 새 버전만 추가한다. |

- 연간성 관측 패턴(`source=observed_pattern`)은 **대상 마감월로 끝나는 완전한 12개월 창에서 월 순지출이 양수인 달이 정확히 1~2개인 유효 대분류·소분류 쌍**이다. `vw_metric_flow_lines`의 지출 줄에서 하나의 SQL 문으로 월별·출처별 순액을 집계한다. 유효 KRW·환불 게시월 차감·대출 포함 등 흐름표의 지출 정의를 그대로 사용한다. T057 `/read/comparison/contributions`의 값·인자는 바꾸지 않는다.
- 전체 쌍의 양수 순지출 월 수로 패턴 자격을 먼저 판정하고, 사람이 `cycle=yearly`로 지정한 약정에 귀속된 구매·환불 줄은 그 쌍의 표시 금액에서 제외한다. 남은 지출 줄이 없으면 패턴 항목을 생략한다. 줄이 남으면 0·음수 순액도 환불을 반영한 값 그대로 표시한다. 등록 약정은 관측 빈도와 관계없이 관측된 12개월 순액을 별도 출처로 표시한다(0·음수 포함). 약정 귀속은 흐름표의 `recurring_commitment_id`를 따르며 거래 제외·명시적 연결·기간·배분 환불을 다시 판정하지 않는다. 기존 이행 묶음의 주기를 사람이 편집한 경우도 포함한다. 약정 하나가 여러 유효 분류 쌍에 걸치면 약정 ID·쌍별로 나누므로 각 항목의 분류가 명확하며 줄이 중복되지 않는다. 이 규칙은 `basis.rules.annual_deduplication`에 담긴다.
- `annual_items[]`: `category`는 유효 대분류(기존 필드 유지), `category_minor`는 유효 소분류(null·빈 문자열은 null로 묶고 화면에 `소분류 없음`), `source=observed_pattern|registered_yearly_commitment`, `commitment_id`·`commitment_label`(패턴이면 null), `observed_periods`(차감 후 월 순지출이 양수인 YYYY-MM 목록, 오름차순), `active_months_in_window`(그 목록 길이), `window_amount`(환불을 포함한 12개월 순액), `monthly_equivalent`를 반환한다. 12개월 순액 내림차순, 대분류·소분류·source·약정 ID 오름차순으로 동률을 해소한다. 목록 전체를 반환하며 제한·잘림은 없다. `monthly_equivalent = ROUND_HALF_UP(window_amount / 12)`는 참고값이며 총지급·월 실적·한도에 더하거나 대체하지 않는다. 거래 분류나 주기를 자동 지정하지 않는다.
- `annual_missing_reason`: 진행월이면 `month_in_progress`, 12개월 미충족·공백·월중 시작 첫 달 포함이면 `incomplete_twelve_month_window`. 이때 목록은 비운다. 해당 항목이 없는 완전한 창은 이유 없이 빈 목록이다.
- `comparisons[]`: 대상 단위·값·한국어 이름, `actual_amount`, `limit_amount`, `limit_revision_id`, `effective_from_period`, `difference_amount`(실적 − 한도), `missing_reason`과 이름. 마감 여부와 별도로 **자료가 완전한 마감월만** 비교한다. `no_limit_set`(한도 해제 포함), `month_in_progress`, `not_imported`, `no_transactions`, `partial_month`이면 차이는 null이다. 한 달에 자료가 있지만 특정 대상 지출이 없으면 실적은 0원이다. 진행월의 실적은 관측 누적일 뿐이고 남은 예산을 내지 않는다.
- 한도는 같은 대상에서 `effective_from_period <= 대상 월`인 최신 버전이 적용된다. 이미 마감된 달의 신규 설정·변경은 422, 같은 대상의 마지막 시작월 이하로 추가하면 409다. PUT/PATCH/DELETE는 제공하지 않는다. 열린 달에 설정한 한도는 뒤에 그 달 자료가 마감되면 비교에 사용된다. 추천값·분류 기본값·한도 기본값은 없다.
- 카테고리 보기와 조정 가능성 보기는 같은 지출의 다른 절단이다. 한도와 실적을 두 보기 사이에서 합산하지 않는다. 실제 값은 기존 SQL 지출 큐브와 월 흐름표에서 읽는다.
- 새 경로의 모르는 조회 인자와 틀린 period·열거값·추가 body 필드는 422다. 읽기 조회 실패는 기존 `/read/*`와 같은 503 `query_failed` 봉투다.
- migration `20261117_0040`은 `20261117_t054_t057` 위에 빈 `spending_limit_revisions` 표만 추가한다. 기존 행·뷰·가져오기 HTTP 계약은 바꾸지 않는다. 등록된 금융 표이므로 가져오기 검토 fingerprint·되돌리기 snapshot에 포함된다. 스키마 변경 전 준비한 검토/되돌리기 지점은 기존 스키마 검사에 의해 거절될 수 있으므로 운영 이행 시 구분한다. 이 작업은 배포하지 않는다.
