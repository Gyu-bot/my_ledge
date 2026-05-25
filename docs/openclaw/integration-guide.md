# Agent Integration Guide

## 목적

이 문서는 OpenClaw/hermes 및 기타 에이전트가 `my_ledge`를 다음 두 경로로 안전하게 사용할 수 있게 하는 운영 가이드다.

- 읽기: REST API 또는 PostgreSQL readonly 유저
- 쓰기: FastAPI endpoint

핵심 원칙은 하이브리드다.

- 정형 조회는 API 또는 canonical view를 우선 사용한다.
- ad-hoc 분석은 readonly DB 직접 조회를 허용한다.
- 업로드, 거래 수정, 대출 연결, reset 같은 쓰기 동작은 API만 사용한다.

새 세션에서는 먼저 [docs/agents/README.md](../agents/README.md)를 읽고, low-level contract는 [docs/backend-api-ssot.md](../backend-api-ssot.md)를 기준으로 확인한다.

## 현재 연동 표면

### Read via API

- `GET /api/v1/health`
- `GET /api/v1/schema`
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
- `GET /api/v1/settings/analytics`
- `GET /api/v1/analytics/monthly-cashflow`
- `GET /api/v1/analytics/category-mom`
- `GET /api/v1/analytics/fixed-cost-summary`
- `GET /api/v1/analytics/merchant-spend`
- `GET /api/v1/analytics/payment-method-patterns`
- `GET /api/v1/analytics/income-stability`
- `GET /api/v1/analytics/recurring-payments`
- `GET /api/v1/analytics/spending-anomalies`

### Write via API

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

`POST /api/v1/transactions/merge`는 현재 `501 Not Implemented` stub이므로 실제 workflow에 넣지 않는다.

### Read via DB

PostgreSQL readonly 유저로 직접 조회한다.

권장 읽기 대상:

- canonical row view: `vw_transactions_effective`
- canonical aggregate view: `vw_category_monthly_spend`
- raw tables:
  - `transactions`
  - `asset_snapshots`
  - `investments`
  - `loans`
  - `loan_accounts`
  - `loan_transaction_links`
  - `app_settings`
  - `upload_logs`

## 인증과 접속 정보

### API

다음 endpoint는 `X-API-Key` 인증이 필요하다.

- `GET /api/v1/schema`
- `GET /api/v1/settings/analytics`
- `PATCH /api/v1/settings/analytics`
- `POST /api/v1/upload`
- 거래 생성/수정/삭제/복원/일괄 수정 API
- 대출 상환 매핑 write API
- `POST /api/v1/data/reset`

예시:

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:8000/api/v1/schema
```

### DB readonly

에이전트는 읽기 전용 PostgreSQL 유저를 사용해야 한다.

요구사항:

- 유저명 예시: `readonly`
- 권한: `public` schema의 `SELECT`만 허용
- `statement_timeout=30s`

운영 시 확인할 항목:

```sql
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
ALTER ROLE readonly SET statement_timeout = '30s';
```

환경 변수 예시:

```env
DB_READONLY_PASSWORD=...
```

로컬/compose 환경에서는 새 PostgreSQL 볼륨 초기화 시 `readonly` 유저와 `statement_timeout=30s`가 자동 bootstrap 된다.
기존 볼륨에서는 아래를 수동 실행해야 한다.

```bash
docker compose exec db sh /docker-entrypoint-initdb.d/01-create-readonly-role.sh
```

## 권장 조회 순서

### 1. 스키마 파악

새로운 세션에서 쿼리를 쓰기 전 먼저 `GET /api/v1/schema`를 본다.

목적:

- raw table과 canonical view 구조 확인
- 컬럼 타입과 의미 확인
- SQL 생성 전 용어와 read surface를 맞춤

### 2. 가능하면 canonical view 우선

거래 분석은 raw `transactions`보다 아래 뷰를 우선 사용한다.

- `vw_transactions_effective`
- `vw_category_monthly_spend`

이유:

- 삭제/병합 제외 규칙이 반영돼 있다.
- 사용자 수정 카테고리 우선 규칙이 반영돼 있다.
- `merchant`, `cost_kind`, `fixed_cost_necessity`, `recurring_payment_kind`를 같은 read model로 제공한다.
- 대출 상환 매핑을 nullable loan fields로 제공한다.
- API read path와 analytics가 같은 해석층을 공유한다.

주의:

- `vw_transactions_effective`는 canonical 분석 surface라서 삭제/병합 row를 기본 노출하지 않는다.
- 삭제/병합 상태를 포함한 감사성 조회가 필요하면 raw `transactions`를 직접 보거나 `GET /api/v1/transactions?include_deleted=true&include_merged=true`를 사용한다.
- `vw_category_monthly_spend`는 schema 문서에 등록된 canonical aggregate surface다. 세부 지표는 현재 backend service가 `vw_transactions_effective` 기반으로 직접 계산하는 경우가 있다.

### 3. raw table은 정합성 점검이나 세부 분석에만 사용

예:

- 업로드 로그 세부 확인
- snapshot 원본 값 점검
- canonical view가 감춘 내부 상태 확인
- `app_settings` 저장값 확인

## 거래 데이터 해석 규칙

에이전트가 SQL을 직접 작성할 때 반드시 반영할 규칙:

```sql
WHERE is_deleted = FALSE
  AND merged_into_id IS NULL
```

카테고리는 사용자 수정값 우선:

```sql
COALESCE(category_major_user, category_major) AS category_major,
COALESCE(category_minor_user, category_minor) AS category_minor
```

canonical view를 쓰면 위 규칙이 이미 반영된 `effective_category_major`, `effective_category_minor`를 사용할 수 있다.

타입 규칙:

- `지출`: 지출 분석 포함
- `지출` + 양수 금액: 환불/취소, 지출 상계
- `수입`: 수입 분석 포함
- `이체`: 수입/지출에서 제외, 자산이동으로 별도 해석

## 예시 워크플로우

### 월별 지출 분석

1. `GET /api/v1/schema`로 canonical view 확인
2. 가능하면 `/api/v1/transactions/summary?type=지출` 또는 `/api/v1/analytics/monthly-cashflow` 사용
3. 세부 drill-down이 필요하면 readonly DB에서 `vw_transactions_effective` 조회

### advisor analytics 우선 사용

에이전트가 아래 질문을 바로 처리해야 할 때는 raw SQL 조합보다 analytics endpoint를 먼저 사용한다.

- 월별 현금흐름: `GET /api/v1/analytics/monthly-cashflow`
- 전월 대비 카테고리 변화: `GET /api/v1/analytics/category-mom`
- 고정비 구조 요약: `GET /api/v1/analytics/fixed-cost-summary`
- 상위 거래처 지출 집중도: `GET /api/v1/analytics/merchant-spend`
- 결제수단 패턴: `GET /api/v1/analytics/payment-method-patterns`
- 수입 안정성: `GET /api/v1/analytics/income-stability`
- 반복 결제 후보와 수동 분류 집계: `GET /api/v1/analytics/recurring-payments`
- 이상 지출: `GET /api/v1/analytics/spending-anomalies`

주의:

- `monthly-cashflow.transfer`는 순이체가 아니라 activity volume이다.
- `merchant-spend`는 canonical `merchant` 기준이다. alias 정규화 모델은 아직 없다.
- `spending-anomalies` 설정 해석 순서는 `명시적 query param > persisted setting > code default`다.

### ad-hoc category 분석

```sql
SELECT
  date_trunc('month', date)::date AS month,
  effective_category_major,
  SUM(amount) AS amount
FROM vw_transactions_effective
WHERE type = '지출'
GROUP BY 1, 2
ORDER BY 1, 2;
```

### 업로드 실행

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -F "snapshot_date=2026-03-26" \
  -F "file=@/path/to/file.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  http://localhost:8000/api/v1/upload
```

현재 `snapshot_date`는 필수다. snapshot 적재는 실질적으로 date-scoped replace로 동작한다.

### 최근 업로드 이력 확인

```bash
curl http://localhost:8000/api/v1/upload/logs
```

현재 `upload_logs` API는 최근 10건만 제공한다. 페이지네이션은 없다.
`POST /api/v1/data/reset` 이후에도 `upload_logs`는 보존된다.

### 대출 상환 거래 연결

```bash
curl http://localhost:8000/api/v1/loan-transaction-links
curl http://localhost:8000/api/v1/loan-accounts
```

단건 연결:

```bash
curl -X PUT \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"loan_account_id": 1, "repayment_type": "principal_interest", "memo": "manual mapping"}' \
  http://localhost:8000/api/v1/transactions/123/loan-link
```

매핑은 원본 거래 타입/카테고리를 바꾸지 않고 canonical view의 nullable loan fields로만 노출된다.

## 실패 시 해석

### API `401`

- `X-API-Key` 누락 또는 불일치

### API `422`

- 잘못된 request payload
- `snapshot_date` 형식 오류 또는 필수값 누락
- `selected_snapshot_vs_baseline_snapshot` 모드에서 snapshot pair 누락

### API `500`

- 서버 내부 오류
- 파싱 실패 원인은 upload response `error_message` 또는 `upload_logs`에서 재확인

### DB 쿼리 실패

- readonly 권한 부족
- canonical/raw table 이름 오기
- `statement_timeout=30s` 초과

## 운영 주의사항

- 쓰기 동작은 API만 사용한다. DB 직접 수정 금지.
- 대규모 탐색성 쿼리는 canonical view 기준으로 먼저 축소해서 실행한다.
- `upload_logs`는 운영 이력 확인용이지 현재 데이터 존재 여부를 의미하지 않는다.
- 샘플 workbook은 현재 비암호화 상태지만, 운영 파일은 암호화 `.xlsx`일 수 있다.
- 원본 업로드 파일 retention은 live backend에서 확인되지 않은 운영 목표다.
- skill/tool 구현 시 브라우저 자동화에 의존하지 말고 API/DB 기반 흐름을 우선한다.

## 이 문서가 다루지 않는 것

- 에이전트 skill/tool의 실제 설치 경로
- 에이전트별 skill 포맷 frontmatter
- 각 에이전트 내부 tool registry 등록 절차

그 부분은 [skill-handoff.md](skill-handoff.md)와 각 에이전트 저장소 규칙에서 마무리한다.
