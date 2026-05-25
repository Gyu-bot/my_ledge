# Agent Skill Handoff

## 목적

이 문서는 OpenClaw/hermes 및 기타 에이전트 작업자가 `my_ledge`용 skill/tool을 별도 저장소나 runtime 환경에서 패키징할 때 필요한 입력값과 흐름을 정리한 handoff 문서다.

이 저장소는 skill package를 직접 배포하지 않는다.
대신 아래 내용을 그대로 옮기거나 변형해 각 에이전트의 skill/tool로 포장할 수 있게 만드는 것이 목표다.

## Skill의 책임 범위

권장 skill 책임:

- `my_ledge` 스키마/연동 방식 안내
- readonly DB 접속 시 canonical view 우선 사용 강제
- analytics endpoint와 read API 우선 사용 유도
- 업로드 API, 거래 편집 API, 대출 연결 API 호출 절차 안내
- 에러 해석 규칙 안내

skill이 직접 책임지지 않아야 하는 범위:

- 앱 비즈니스 로직 재구현
- 서버 내부 로컬 파일 경로에 대한 강한 가정
- DB write
- 브라우저 자동화를 기본 write 경로로 사용하는 흐름

## 권장 Skill 구조

### 1. 시작 안내

세션 시작 시 skill은 다음 순서로 유도하는 것이 좋다.

1. `GET /api/v1/schema` 확인
2. 읽기 작업인지 쓰기 작업인지 분기
3. 읽기면 analytics endpoint, read API, readonly DB 순서로 사용
4. 쓰기면 `X-API-Key` 기반 REST API 사용
5. SQL이 필요하면 raw table보다 canonical view 우선 사용

### 2. Read workflow

권장 우선순위:

1. `GET /api/v1/schema`
2. advisor 질문이면 analytics endpoint 우선 사용
3. 정형 endpoint 사용 가능 여부 판단
4. 필요 시 readonly DB로 `vw_transactions_effective` 또는 `vw_category_monthly_spend` 조회
5. raw table은 검증성/보조성 조회에만 사용

### 3. Write workflow

권장 우선순위:

1. 업로드: `POST /api/v1/upload`
2. 거래 생성: `POST /api/v1/transactions`
3. 거래 수정: `PATCH /api/v1/transactions/{id}`
4. 거래 일괄 수정: `PATCH /api/v1/transactions/bulk-update`
5. 삭제: `DELETE /api/v1/transactions/{id}`
6. 복원: `POST /api/v1/transactions/{id}/restore`
7. 대출 연결: `PUT /api/v1/transactions/{id}/loan-link` 또는 `PUT /api/v1/transactions/loan-links/bulk`
8. analytics 설정: `PATCH /api/v1/settings/analytics`
9. reset: `POST /api/v1/data/reset`

`POST /api/v1/transactions/merge`는 현재 `501 Not Implemented` stub이므로 workflow에 넣지 않는다.

## Skill 입력값

에이전트 skill/tool 배포 시 최소 입력값:

```env
MY_LEDGE_API_BASE_URL=http://localhost:8000/api/v1
MY_LEDGE_API_KEY=...

MY_LEDGE_DB_HOST=...
MY_LEDGE_DB_PORT=5432
MY_LEDGE_DB_NAME=my_ledge
MY_LEDGE_DB_USER=readonly
MY_LEDGE_DB_PASSWORD=...
```

선택 입력값:

```env
MY_LEDGE_SCHEMA_ENDPOINT=/schema
MY_LEDGE_UPLOAD_ENDPOINT=/upload
MY_LEDGE_UPLOAD_LOGS_ENDPOINT=/upload/logs
```

## Skill에 넣어야 할 규칙

### 분석 규칙

- live contract 우선순위는 backend 코드, `docs/backend-api-ssot.md`, `docs/agents/README.md`, `docs/openclaw/*`, `PRD.md` 순서다.
- 거래 분석은 canonical view 우선이다.
- advisor용 해석은 가능하면 analytics endpoint 우선이다.
- category는 `effective_category_major`, `effective_category_minor` 기준이다.
- 거래처 집계는 canonical `merchant` 기준이다.
- `이체`는 수입/지출에서 제외한다.
- 사용자 카테고리 수정값 우선이다.
- 삭제/병합 건 제외가 기본이다.
- 삭제/병합 상태까지 봐야 하면 canonical view 대신 raw `transactions` 또는 `GET /api/v1/transactions?include_deleted=true&include_merged=true`를 사용한다.
- `cost_kind`, `fixed_cost_necessity`, `recurring_payment_kind`는 수동 분류값이다. 자동 분류가 있다고 가정하지 않는다.
- 대출 상환 매핑은 원본 거래 타입/카테고리를 바꾸지 않고 canonical view의 nullable loan fields로만 해석한다.
- `monthly-cashflow.transfer`는 `ABS(amount)` 기준 activity volume이며 `net_cashflow` 계산에는 포함하지 않는다.
- `spending-anomalies` 설정 해석 순서는 `명시적 query param > persisted setting > code default`다.
- `POST /api/v1/data/reset`은 current state를 삭제하지만 `upload_logs`는 보존한다.

### 보안 규칙

- DB는 readonly 유저만 사용한다.
- 쓰기 작업은 API만 사용한다.
- API key가 필요한 endpoint와 그렇지 않은 endpoint를 구분한다.
- reset, settings, loan-link, upload, 거래 write는 항상 `X-API-Key`를 사용한다.

### 실패 대응 규칙

- `401`: credential 재확인
- `422`: payload/query 재구성
- `500`: 응답 body와 `upload_logs` 재확인
- DB timeout: 더 좁은 기간/범위로 재시도
- schema/문서 충돌: backend 코드와 `docs/backend-api-ssot.md` 우선

## 권장 프롬프트/행동 흐름

skill은 대략 아래 행동을 강제하면 된다.

### 분석 요청 시

1. `schema`를 먼저 확인했는가
2. analytics endpoint로 바로 해결 가능한가
3. 아니면 일반 read API로 해결 가능한가
4. 아니면 readonly DB에서 canonical view로 해결할 수 있는가
5. raw table이 정말 필요한가

### 업로드 요청 시

1. 파일 경로/파일 객체 확보
2. `snapshot_date` 확정
3. `POST /api/v1/upload` 호출
4. response `status`, `transactions`, `snapshots`, `error_message` 확인
5. 필요 시 `/api/v1/upload/logs` 재확인

### 거래 편집 요청 시

1. 대상 transaction id 확인
2. 수정/삭제/복원/일괄 수정 중 어떤 동작인지 명시
3. 해당 write endpoint 호출
4. 후속 조회로 상태 재확인

### 대출 연결 요청 시

1. `GET /api/v1/loan-transaction-links`로 후보 거래 확인
2. `GET /api/v1/loan-accounts`로 대출 계좌 후보 확인
3. 단건 또는 bulk loan-link endpoint 호출
4. canonical view 또는 read API로 nullable loan fields 반영 확인

## 예시 도구 흐름

### Skill-only 방식

- HTTP client
- PostgreSQL client
- 표준 텍스트 응답

### 이후 MCP/tool 서버로 승격할 때의 자연스러운 도구 이름

- `my_ledge_get_schema`
- `my_ledge_query_sql`
- `my_ledge_upload_workbook`
- `my_ledge_update_transaction`
- `my_ledge_bulk_update_transactions`
- `my_ledge_delete_transaction`
- `my_ledge_restore_transaction`
- `my_ledge_get_upload_logs`
- `my_ledge_get_loan_accounts`
- `my_ledge_get_loan_transaction_links`
- `my_ledge_update_loan_link`
- `my_ledge_get_analytics_settings`
- `my_ledge_patch_analytics_settings`

지금 단계에서는 위 이름을 실제로 구현할 필요는 없다.
다만 skill 설계 시 이 정도의 책임 단위로 나뉘도록 작성하면 이후 MCP/tool 서버 승격이 쉽다.

## Acceptance Checklist

에이전트 작업자는 skill/tool 패키징 전 아래를 확인해야 한다.

- `schema` API를 읽을 수 있다.
- readonly DB로 `SELECT`가 된다.
- readonly role에 `statement_timeout=30s`가 걸려 있다.
- 업로드 API를 `X-API-Key`로 호출할 수 있다.
- 거래 수정/삭제/복원 API를 호출할 수 있다.
- 대출 연결 write API를 호출할 수 있다.
- analytics settings API를 호출할 수 있다.
- canonical view를 우선 사용하도록 skill 문구가 들어가 있다.
- `merchant-spend`가 canonical `merchant` 기준임을 명시했다.
- `merge` endpoint는 MVP 범위 밖임을 명시했다.
- 실패 시 재확인 경로(`upload_logs`, HTTP status, DB timeout 축소)가 적혀 있다.

## 구현 후 검증 시나리오

최소 검증 시나리오:

1. `GET /api/v1/schema`
2. `GET /api/v1/analytics/monthly-cashflow`
3. `GET /api/v1/analytics/category-mom`
4. `GET /api/v1/analytics/fixed-cost-summary`
5. `GET /api/v1/analytics/merchant-spend`
6. `GET /api/v1/analytics/recurring-payments`
7. `GET /api/v1/assets/snapshot-compare`
8. readonly DB로 `vw_transactions_effective` 조회
9. `GET /api/v1/transactions/summary?type=지출`
10. `POST /api/v1/upload`
11. `GET /api/v1/upload/logs`
12. `PATCH /api/v1/transactions/{id}`
13. `DELETE /api/v1/transactions/{id}`
14. `POST /api/v1/transactions/{id}/restore`
15. `GET /api/v1/loan-accounts`
16. `PUT /api/v1/transactions/{id}/loan-link`

## 참고 문서

- 에이전트 시작점: [docs/agents/README.md](../agents/README.md)
- 연동 규약: [integration-guide.md](integration-guide.md)
- live backend/API contract: [docs/backend-api-ssot.md](../backend-api-ssot.md)
- 프로젝트 요구사항: [PRD.md](../../PRD.md)
- 운영 상태: [docs/STATUS.md](../STATUS.md)
