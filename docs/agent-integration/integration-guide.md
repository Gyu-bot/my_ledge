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
| upload, reset, settings, transaction write, loan-link write | REST API with `X-API-Key` |
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
- `GET /api/v1/assets/snapshots`
- `GET /api/v1/assets/net-worth-history`
- `GET /api/v1/assets/snapshot-compare`
- `GET /api/v1/investments/summary`
- `GET /api/v1/loans/summary`
- `GET /api/v1/analytics/monthly-cashflow`
- `GET /api/v1/analytics/category-mom`
- `GET /api/v1/analytics/fixed-cost-summary`
- `GET /api/v1/analytics/fixed-cost-trend`
- `GET /api/v1/analytics/merchant-spend`
- `GET /api/v1/analytics/payment-method-patterns`
- `GET /api/v1/analytics/income-stability`
- `GET /api/v1/analytics/recurring-payments`
- `GET /api/v1/analytics/spending-anomalies`

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

`POST /api/v1/transactions/merge`는 현재 `501 Not Implemented` stub이므로 workflow에 넣지 않는다.

## 권장 조회 순서

1. `GET /api/v1/schema`로 schema와 canonical view 목록을 확인한다.
2. [canonical-read-surface-reference.md](../agents/canonical-read-surface-reference.md)에서 값 의미와 계산식을 확인한다.
3. 질문이 analytics endpoint 또는 `GET /api/v1/canonical-views/dashboard`로 해결되는지 본다.
4. 부족하면 일반 read API를 사용한다.
5. drill-down이 필요하면 readonly DB에서 canonical view를 조회한다.
6. raw table은 import fidelity, 삭제/병합 감사, snapshot 원본 확인 같은 보조 작업에만 사용한다.

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

backend가 제공하지 않은 안정/위험/구매 가능 label을 에이전트가 붙일 때는 자체 가정과 사용자 맥락 기반 해석임을 답변에 드러낸다.

## 권장 canonical SQL 대상

- `vw_transactions_effective`
- `vw_monthly_cashflow`
- `vw_true_spendable_monthly`
- `vw_loan_repayment_monthly`
- `vw_fixed_cost_monthly_summary`
- `vw_merchant_monthly_baseline`
- `vw_unclassified_work_queue`
- `vw_category_monthly_spend`

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

### 분류 품질 개선

1. `vw_unclassified_work_queue` 또는 dashboard queue 조회
2. `priority_reason` 기준으로 정렬된 상위 거래를 확인
3. 비용 성격은 transaction update/bulk-update API로 수정
4. 대출 연결은 loan-link API로 수정
5. 반복 결제 분류는 recurring classification API/화면 흐름을 사용
6. `priority_score`는 데이터 정리 우선순위로만 설명하고 재무 위험 점수처럼 말하지 않는다

## 실패 대응

- API `401`: `X-API-Key` 누락 또는 불일치
- API `422`: query/body 형식 오류, 필수값 누락, `snapshot_date` 오류
- API `500`: response body와 `GET /api/v1/upload/logs`를 함께 확인
- DB timeout: 기간, group, 대상 컬럼을 좁혀 재시도
- schema/문서 충돌: backend 코드와 [backend-api-ssot.md](../backend-api-ssot.md)를 우선
