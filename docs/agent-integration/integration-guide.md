# Agent Integration Guide

## 목적

이 문서는 범용 에이전트가 `my_ledge`를 안전하게 사용할 수 있게 하는 운영 가이드다.

- 읽기: REST API 또는 PostgreSQL readonly 유저
- 쓰기: FastAPI endpoint only
- 값 해석: [canonical-read-surface-reference.md](../agents/canonical-read-surface-reference.md)를 우선 사용

핵심 원칙:

- 정형 조회는 API 또는 canonical view를 우선 사용한다.
- ad-hoc 분석은 readonly DB 직접 조회를 허용한다.
- 업로드, 거래 수정, 대출 연결, reset 같은 쓰기 동작은 API만 사용한다.
- 에이전트가 raw table을 재계산해서 별도 의미를 만들기보다, canonical/API 값의 정의를 먼저 따른다.
- My Ledge는 계산, 후보, 근거, settings, review state를 제공하고 최종 해석/권고/행동 제안은 에이전트가 사용자 맥락으로 판단한다.

## 연결 정보

```env
MY_LEDGE_API_BASE_URL=http://<server>:8000/api/v1
MY_LEDGE_API_KEY=<API_KEY>

MY_LEDGE_DB_HOST=<server>
MY_LEDGE_DB_PORT=5432
MY_LEDGE_DB_NAME=my_ledge
MY_LEDGE_DB_USER=readonly
MY_LEDGE_DB_PASSWORD=<DB_READONLY_PASSWORD>
```

## 권한 모델

| 작업 | 허용 경로 |
|---|---|
| schema/API/canonical dashboard 조회 | REST API |
| 거래/분석/snapshot 조회 | REST API 또는 readonly DB |
| ad-hoc SQL 분석 | PostgreSQL readonly user |
| upload, reset, settings, transaction/loan/installment/purchase-review/asset-liquidity write | REST API with `X-API-Key` |
| DB write | 금지 |

readonly DB role 요구사항:

- `public` schema `SELECT`
- `statement_timeout=30s`
- 직접 `INSERT`, `UPDATE`, `DELETE`, `DDL` 금지

## 자주 쓰는 API

### Read

- `GET /api/v1/schema`
- `GET /api/v1/canonical-views/dashboard`
- `GET /api/v1/upload/logs`
- `GET /api/v1/transactions`
- `GET /api/v1/transactions/filter-options`
- `GET /api/v1/transactions/summary`
- `GET /api/v1/transactions/by-category`
- `GET /api/v1/transactions/by-category/timeline`
- `GET /api/v1/transactions/payment-methods`
- `GET /api/v1/loan-accounts`
- `GET /api/v1/loan-transaction-links`
- `GET /api/v1/transactions/{id}/loan-link`
- `GET /api/v1/installment-plans`
- `GET /api/v1/installment-transaction-links`
- `GET /api/v1/transactions/{id}/installment-link`
- `GET /api/v1/installments/forecast`
- `GET /api/v1/assets/snapshots`
- `GET /api/v1/assets/net-worth-history`
- `GET /api/v1/assets/snapshot-compare`
- `GET /api/v1/investments/summary`
- `GET /api/v1/insurance/summary`
- `GET /api/v1/loans/summary`
- `GET /api/v1/analytics/monthly-cashflow`
- `GET /api/v1/analytics/category-mom`
- `GET /api/v1/analytics/fixed-cost-summary`
- `GET /api/v1/analytics/fixed-cost-trend`
- `GET /api/v1/analytics/merchant-spend`
- `GET /api/v1/analytics/payment-method-patterns`
- `GET /api/v1/analytics/income-stability`
- `GET /api/v1/analytics/recurring-payments`
- `GET /api/v1/analytics/discretionary-velocity`
- `GET /api/v1/analytics/purchase-gate-candidates`
- `GET /api/v1/analytics/spending-anomalies`
- `GET /api/v1/analytics/net-worth-breakdown`
- `GET /api/v1/analytics/liquidity-health`

### Write

- `POST /api/v1/upload`
- `POST /api/v1/data/reset`
- `PATCH /api/v1/settings/analytics`
- `POST /api/v1/transactions`
- `PATCH /api/v1/transactions/{id}`
- `PATCH /api/v1/transactions/bulk-update`
- `DELETE /api/v1/transactions/{id}`
- `POST /api/v1/transactions/{id}/restore`
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

`POST /api/v1/transactions/merge`는 현재 `501 Not Implemented` stub이므로 workflow에 넣지 않는다.

## 권장 조회 순서

1. `GET /api/v1/schema`로 schema와 canonical view 목록을 확인한다.
2. [canonical-read-surface-reference.md](../agents/canonical-read-surface-reference.md)에서 값 의미와 계산식을 확인한다.
3. 질문이 analytics endpoint 또는 `GET /api/v1/canonical-views/dashboard`로 해결되는지 본다.
4. 부족하면 일반 read API를 사용한다.
5. drill-down이 필요하면 readonly DB에서 canonical view를 조회한다.
6. raw table은 import fidelity, 삭제/병합 감사, snapshot 원본 확인 같은 보조 작업에만 사용한다.

## 자주 묻는 질문별 우선 조회 순서

| 질문 | 우선 조회 | 부족할 때 | 주의 |
|---|---|---|---|
| 이번 달 현금흐름/가용액 | `GET /api/v1/canonical-views/dashboard` | `vw_monthly_cashflow`, `vw_true_spendable_monthly` | `income_basis='estimated'`면 관측/예상 수입을 분리하고, `is_complete_month=false` 월은 부분월로 표시한다. |
| 특정 거래 설명/수정 | `GET /api/v1/transactions` | `vw_transactions_effective`, raw `transactions` | raw table은 감사용으로만 쓰고 수정은 API로 한다. |
| 대출 상환 부담 | `GET /api/v1/analytics/liquidity-health` | `vw_loan_repayment_monthly`, `GET /api/v1/loan-transaction-links` | 연결 부족/추정값이면 confidence와 assumptions를 같이 말한다. |
| 대출 구조/금리/만기 | `GET /api/v1/loans/summary` | `vw_loan_account_canonical` | 금리와 잔액은 snapshot 값이고, 상환 우선순위는 에이전트 해석이다. |
| 보험 계약/보험료 추정 | `GET /api/v1/insurance/summary` | raw `insurance_contracts`, 거래 API의 보험 카테고리 지출 | 보험료 적정성 판단은 에이전트 해석이며, API는 계약과 최근 마감월 보험 지출 근거만 제공한다. |
| 자산/부채 상태 | `GET /api/v1/analytics/net-worth-breakdown` | `GET /api/v1/assets/snapshots`, `vw_asset_snapshot_canonical` | `negative_asset_excluded_total`이 있으면 음수 asset row 제외를 같이 설명한다. |
| 구현 여부 확인 | [backend-api-ssot.md](../backend-api-ssot.md) | [Implentation-plan.md](../../Implentation-plan.md), `GET /api/v1/schema` | 전역 실행계획의 endpoint 후보를 live로 가정하지 않는다. |

## 판단 책임 경계

에이전트는 My Ledge의 read surface를 "판정"이 아니라 "근거가 붙은 계산/후보"로 취급한다.

| 값/표현 | 해석 규칙 |
|---|---|
| `true_spendable`, `estimated_*` | 계산상 가용액과 예상 보정이다. "써도 된다"는 구매 판단으로 단정하지 않는다. |
| `liquidity-health` | endpoint 이름은 계산 묶음 이름이다. 비상금 개월 수, 부채상환비율, confidence, assumptions를 근거로 에이전트가 해석한다. |
| `anomaly_score`, anomaly `reason` | baseline 대비 변화 후보다. 낭비/문제 지출 확정이 아니다. |
| `confidence` | 패턴 탐지 또는 데이터 완성도 신호다. 조언의 확실성 자체가 아니다. |
| `priority_score`, `priority_reason` | 데이터 품질 정리 우선순위다. 재무 위험 우선순위로 자동 변환하지 않는다. |
| `risk_level`, `review_priority` | threshold 기반 후보 강도나 검토 우선순위다. 최종 위험/허용 판정은 에이전트 해석이다. |
| `/analytics/discretionary-velocity`의 `risk_level` | 월 진행률 기준 재량 지출 속도 후보 신호다. 즉시 구매 허용/금지 결론으로 쓰지 않는다. |
| `/analytics/purchase-gate-candidates`의 `risk_level` | large/new/spike 후보 우선순위 신호다. 자동 위험 판정이 아니다. |
| `/installments/forecast`의 `projected` | 미래 현금흐름 planning 값이다. 관측된 거래/cashflow view와 이중 계산하지 않는다. |
| `/api/v1/analytics/liquidity-health` | `confidence`와 `assumptions`를 먼저 제시해 추정치 기반의 유동성 판단으로 해석하고, 최종 판단은 사용자 맥락에서 한다. |

backend가 제공하지 않은 안정/위험/구매 가능 label을 에이전트가 붙일 때는 자체 가정과 사용자 맥락 기반 해석임을 답변에 드러낸다.

## 권장 canonical SQL 대상

- `vw_transactions_effective`
- `vw_monthly_cashflow`
- `vw_true_spendable_monthly`
- `vw_loan_repayment_monthly`
- `vw_fixed_cost_monthly_summary`
- `vw_merchant_monthly_baseline`
- `vw_recurring_merchant_monthly`
- `vw_unclassified_work_queue`
- `vw_category_monthly_spend`
- `vw_asset_snapshot_canonical`

## 예시 흐름

### 월별 가용 현금 설명

1. `GET /api/v1/canonical-views/dashboard?months=12`
2. `true_spendable_monthly[]`에서 `income_basis` 확인
3. `income_basis='estimated'`면 관측 수입과 예상 수입을 분리해 설명
4. `loan_repayment_total`, `fixed_commitment_total`, `variable_total`을 각각 분리해서 원인 설명
5. `true_spendable`을 "남은 계산값"으로 설명하고, 구매/지출 가능 여부는 사용자의 예정 지출과 목표를 확인한 뒤 조언

### 대출 상환 분석

1. `vw_loan_repayment_monthly` 또는 dashboard `loan_repayment_monthly[]` 조회
2. `loan_repayment_type`별 `repayment_total` 확인
3. 필요하면 `GET /api/v1/loan-transaction-links`로 거래 drill-down
4. 연결 누락 후보는 `vw_unclassified_work_queue.needs_loan_link_review` 확인
5. `loans.monthly_payment_source`가 `estimated_from_linked_transactions`이면 My Ledge가 완료된 월의 연결 거래로 채운 추정값임을 설명한다. 마이너스 통장은 최근 완료월 평균, 그 외 대출은 완료월 중앙값을 쓰며, 최종 대출 조건 판단은 에이전트/사용자 확인 영역으로 둔다.

### 분류 품질 개선

1. `vw_unclassified_work_queue` 또는 dashboard queue 조회
2. `priority_reason` 기준으로 정렬된 상위 거래를 확인
3. 비용 성격은 transaction update/bulk-update API로 수정
4. 대출 연결은 loan-link API로 수정
5. 반복 결제 분류는 recurring classification API/화면 흐름을 사용
6. `priority_score`는 데이터 정리 우선순위로만 설명하고 재무 위험 점수처럼 말하지 않는다

### 재량 지출/구매 후보 점검

1. `GET /api/v1/analytics/discretionary-velocity`로 재량 지출 속도와 분류 커버리지를 확인한다.
2. `GET /api/v1/analytics/purchase-gate-candidates`로 거래 단위 후보를 조회한다.
3. `candidate_key`는 `transaction:{transaction_id}`이고, 같은 거래의 여러 사유는 `candidate_types[]`와 `reasons[]`로 묶여 있다.
4. 후보의 `risk_level`, `reasons`, `assumptions`를 같이 제시하고, 즉시 구매 차단/허용 결론으로 바꾸지 않는다.
5. 필요 시 `PATCH /api/v1/analytics/purchase-gate-candidates/{candidate_key}/review`로 검토 상태, memo, snooze cooldown만 반영한다.

### 할부 잔여 지출 설명

1. `GET /api/v1/installment-plans`로 활성 할부 원장을 확인한다.
2. `GET /api/v1/installments/forecast`에서 `observed`, `projected`, `missed` 회차를 분리한다.
3. 미래 월 계획에는 `monthly_summary.projected_total`을 참고하되, 이미 관측된 거래와 합산하지 않는다.
4. 거래 연결이 필요하면 `GET /api/v1/installment-transaction-links` 후보를 확인하고 단건/bulk installment-link API를 사용한다.

## 실패 대응

- API `401`: `X-API-Key` 누락 또는 불일치
- API `422`: query/body 형식 오류, 필수값 누락, `snapshot_date` 오류
- API `500`: response body와 `GET /api/v1/upload/logs`를 함께 확인
- DB timeout: 기간, group, 대상 컬럼을 좁혀 재시도
- schema/문서 충돌: backend 코드와 [backend-api-ssot.md](../backend-api-ssot.md)를 우선
