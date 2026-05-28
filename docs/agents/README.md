# Agent README

OpenClaw, hermes, Codex, Claude 등 외부 에이전트가 `my_ledge`를 읽기/쓰기 대상으로 사용할 때의 시작 문서다.
이 문서는 특정 에이전트 런타임이 아니라 `my_ledge`가 제공하는 안정적인 read/write surface를 설명한다.

## 먼저 읽을 것

1. 현재 live backend/API contract: [docs/backend-api-ssot.md](../backend-api-ssot.md)
2. 상세 endpoint/metric reference: [docs/backend-api-and-metrics-reference.md](../backend-api-and-metrics-reference.md)
3. 미구현 계획 backlog: [docs/planned-work.md](../planned-work.md)
4. 기존 OpenClaw 호환 연동 문서: [docs/openclaw/README.md](../openclaw/README.md)
5. 협업 규칙과 상태: [AGENTS.md](../../AGENTS.md), [docs/STATUS.md](../STATUS.md)

`PRD.md`와 과거 plan/spec 문서는 제품 의도와 배경을 볼 때만 사용한다.
live endpoint나 필드 계약이 충돌하면 backend 코드와 [docs/backend-api-ssot.md](../backend-api-ssot.md)를 우선한다.
아직 구현되지 않은 계획은 [docs/planned-work.md](../planned-work.md)에 승격된 항목만 current backlog로 본다.

## 연결 정보

에이전트 런타임에는 보통 아래 값만 넘기면 된다.

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

- 읽기: REST API 또는 PostgreSQL readonly 유저를 사용한다.
- 쓰기: 반드시 REST API만 사용한다. DB 직접 write는 금지한다.
- `GET /api/v1/schema`, 업로드, 거래 편집, 대출 연결, analytics settings, reset은 `X-API-Key`가 필요하다.
- readonly DB role은 `SELECT` 권한과 `statement_timeout=30s`를 가져야 한다.

## Canonical View 우선 규칙

거래 분석을 직접 SQL로 해야 한다면 raw `transactions` 대신 아래 canonical view를 먼저 사용한다.

- `vw_transactions_effective`: row-level 거래 분석 표준 surface
- `vw_category_monthly_spend`: 월별 카테고리 지출 aggregate 표준 surface
- `vw_fixed_cost_monthly_summary`: 월별 고정비/변동비 및 필수/비필수 고정비 aggregate surface

canonical view를 우선하는 이유:

- 삭제 거래와 병합된 거래를 기본 제외한다.
- 사용자 수정 카테고리를 원본 카테고리보다 우선한다.
- `merchant`, `cost_kind`, `fixed_cost_necessity`, `recurring_payment_kind` 같은 운영 분류 필드를 같은 방식으로 노출한다.
- 대출 상환 매핑은 nullable `loan_account_id`, `loan_lender`, `loan_product_name`, `loan_repayment_type`, `loan_link_memo` 필드로 붙는다.
- backend analytics와 frontend read path가 같은 해석층을 공유한다.

raw `transactions`를 직접 볼 수 있는 경우는 감사성 조회, import fidelity 점검, 삭제/병합 row 확인처럼 canonical view가 일부러 숨긴 내부 상태가 필요할 때다.
이때도 쓰기는 API로 되돌아가야 한다.

## 추천 작업 흐름

### 분석 요청

1. `GET /api/v1/schema`로 schema와 canonical view를 확인한다.
2. 질문이 live analytics endpoint로 해결되는지 먼저 본다.
3. 부족하면 일반 read API를 사용한다.
4. ad-hoc drill-down이 필요하면 readonly DB에서 canonical view를 조회한다.
5. raw table은 검증성/보조성 조회에만 사용한다.

### 업로드 요청

1. 업로드 기준일 `snapshot_date`를 사용자 입력 또는 파일명에서 확정한다.
2. `POST /api/v1/upload`를 `multipart/form-data`와 `X-API-Key`로 호출한다.
3. response의 `status`, `transactions`, `snapshots`, `error_message`를 확인한다.
4. 필요하면 `GET /api/v1/upload/logs`로 최근 실행 이력을 재확인한다.

### 거래 편집 요청

1. 대상 `transaction_id`를 조회로 확정한다.
2. 단건 수정은 `PATCH /api/v1/transactions/{id}`를 사용한다.
3. 여러 거래의 merchant/category/cost/recurring 분류 수정은 `PATCH /api/v1/transactions/bulk-update`를 사용한다.
4. 삭제/복원은 `DELETE /api/v1/transactions/{id}`, `POST /api/v1/transactions/{id}/restore`를 사용한다.
5. 변경 후 read API 또는 canonical view로 결과를 재확인한다.

### 대출 상환 매핑

1. 후보 거래는 `GET /api/v1/loan-transaction-links`에서 조회한다.
2. 대출 계좌 후보는 `GET /api/v1/loan-accounts`에서 조회한다.
3. 단건 연결은 `PUT /api/v1/transactions/{id}/loan-link`를 사용한다.
4. 다건 연결은 `PUT /api/v1/transactions/loan-links/bulk`를 사용한다.
5. 매핑은 원본 거래 타입/카테고리를 바꾸지 않고 canonical view의 nullable loan fields로만 노출된다.

## 자주 쓰는 API

- schema: `GET /api/v1/schema`
- 거래 목록: `GET /api/v1/transactions`
- 거래 필터 옵션: `GET /api/v1/transactions/filter-options`
- 월별/주별/일별 요약: `GET /api/v1/transactions/summary`
- 카테고리 집계: `GET /api/v1/transactions/by-category`
- 카테고리 timeline: `GET /api/v1/transactions/by-category/timeline`
- 자산 비교: `GET /api/v1/assets/snapshot-compare`
- 투자/대출 최신 snapshot: `GET /api/v1/investments/summary`, `GET /api/v1/loans/summary`
- advisor analytics: `GET /api/v1/analytics/monthly-cashflow`, `category-mom`, `fixed-cost-summary`, `merchant-spend`, `payment-method-patterns`, `income-stability`, `recurring-payments`, `spending-anomalies`
- analytics settings: `GET/PATCH /api/v1/settings/analytics`

## 해석 주의사항

- `지출`이면서 양수인 금액은 결제 취소/환불이며 지출에서 상계한다.
- `이체`는 수입/지출 분석에서 제외하고 자산 이동으로 해석한다.
- `monthly-cashflow.transfer`는 순이체가 아니라 `ABS(amount)` 기준 activity volume이다.
- `spending-anomalies` 설정 해석 순서는 `명시적 query param > persisted setting > code default`다.
- `POST /api/v1/data/reset`은 current state를 지우지만 `upload_logs`는 보존한다.
- `POST /api/v1/transactions/merge`는 현재 `501 Not Implemented` stub이다.
- 원본 업로드 파일 retention은 live backend contract가 아니라 미구현 운영 목표로 본다.

## 실패 대응

- API `401`: `X-API-Key` 누락 또는 불일치
- API `422`: query/body 형식 오류, 필수값 누락, `snapshot_date` 오류
- API `500`: response body와 `upload_logs`를 함께 확인
- DB timeout: 기간과 대상 컬럼을 좁혀 재시도
- schema/문서 충돌: backend 코드와 [docs/backend-api-ssot.md](../backend-api-ssot.md)를 우선
