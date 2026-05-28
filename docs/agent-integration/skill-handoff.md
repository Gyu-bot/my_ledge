# Agent Skill Handoff

## 목적

이 문서는 Hermes, Codex, Claude, OpenClaw 등 에이전트 작업자가 `my_ledge`용 skill/tool을 별도 저장소나 runtime 환경에서 패키징할 때 필요한 규칙과 검증 흐름을 정리한다.

이 저장소는 skill package를 직접 배포하지 않는다.
대신 각 에이전트 runtime에서 아래 규칙을 옮겨 담을 수 있도록 API, DB, canonical read surface, 실패 대응 기준을 제공한다.

## Skill의 책임 범위

권장 책임:

- `my_ledge` 연결 정보와 인증 방식 안내
- 읽기/쓰기 권한 분리 강제
- canonical view와 analytics endpoint 우선 사용
- API/canonical view 값의 의미를 [canonical-read-surface-reference.md](../agents/canonical-read-surface-reference.md) 기준으로 해석
- 업로드, 거래 편집, 대출 연결, reset API 호출 절차 안내
- 실패 시 재확인 경로 안내

책임지지 않아야 하는 범위:

- 앱 비즈니스 로직 재구현
- DB write
- raw table 기반 재계산을 기본값으로 삼는 분석
- 브라우저 자동화를 기본 write 경로로 사용하는 흐름
- 특정 에이전트 런타임에만 맞춘 하드코딩

## 최소 입력값

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
MY_LEDGE_CANONICAL_DASHBOARD_ENDPOINT=/canonical-views/dashboard
MY_LEDGE_UPLOAD_ENDPOINT=/upload
MY_LEDGE_UPLOAD_LOGS_ENDPOINT=/upload/logs
```

## Skill에 넣어야 할 규칙

### Read 규칙

- 새 세션 첫 조회는 `GET /api/v1/schema` 또는 cached schema freshness 확인으로 시작한다.
- 값 의미와 계산식은 `docs/agents/canonical-read-surface-reference.md`를 따른다.
- advisor/분석 질문은 analytics endpoint 또는 `GET /api/v1/canonical-views/dashboard`를 먼저 사용한다.
- SQL이 필요하면 raw table보다 canonical view를 우선 사용한다.
- 거래 category는 `effective_category_major`, `effective_category_minor` 기준이다.
- 거래처 집계는 canonical `merchant` 기준이다. alias/정규화는 아직 없다.
- `이체`는 수입/지출에서 제외하고 활동량으로만 해석한다.
- 삭제/병합 거래는 기본 제외다.
- 삭제/병합 상태까지 봐야 하면 raw `transactions` 또는 `GET /api/v1/transactions?include_deleted=true&include_merged=true`를 사용한다.
- 대출 상환은 원본 거래 타입/카테고리를 바꾸지 않고 nullable loan fields로 해석한다.
- `income_basis='estimated'`인 dashboard row는 관측값과 예상값을 분리해 답한다.
- `monthly-cashflow.transfer`는 `abs(amount)` 기준 activity volume이며 `net_cashflow` 계산에는 포함하지 않는다.
- `spending-anomalies` 설정 해석 순서는 `명시적 query param > persisted setting > code default`다.

### Write 규칙

- 모든 write는 REST API만 사용한다.
- DB write는 금지한다.
- write endpoint에는 `X-API-Key`를 사용한다.
- 거래 수정 후에는 read API 또는 canonical view로 결과를 재확인한다.
- `POST /api/v1/transactions/merge`는 현재 `501 Not Implemented` stub이므로 사용하지 않는다.

### 보안 규칙

- DB는 readonly 유저만 사용한다.
- reset, upload, settings, loan-link, transaction write는 사용자 의도가 명확할 때만 실행한다.
- 에이전트 응답에 API key, DB password, 파일 암호를 노출하지 않는다.
- DB timeout이 나면 query 범위를 줄인다. timeout을 무작정 늘리는 방식은 기본값으로 삼지 않는다.

## 권장 tool 단위

- `my_ledge_get_schema`
- `my_ledge_get_canonical_dashboard`
- `my_ledge_query_readonly_sql`
- `my_ledge_get_transactions`
- `my_ledge_get_analytics`
- `my_ledge_upload_workbook`
- `my_ledge_update_transaction`
- `my_ledge_bulk_update_transactions`
- `my_ledge_delete_transaction`
- `my_ledge_restore_transaction`
- `my_ledge_get_loan_accounts`
- `my_ledge_get_loan_transaction_links`
- `my_ledge_update_loan_link`
- `my_ledge_get_analytics_settings`
- `my_ledge_patch_analytics_settings`

## 행동 흐름

### 분석 요청

1. schema/canonical reference 확인
2. analytics endpoint 또는 canonical dashboard로 해결 가능한지 판단
3. 부족하면 read API 사용
4. 그래도 부족하면 readonly DB에서 canonical view 조회
5. raw table이 필요하면 왜 필요한지 명시

### 업로드 요청

1. 파일 경로/파일 객체 확보
2. `snapshot_date` 확정
3. `POST /api/v1/upload` 호출
4. response `status`, `transactions`, `snapshots`, `error_message` 확인
5. 필요 시 `/api/v1/upload/logs` 재확인

### 거래 편집 요청

1. 대상 transaction id 확인
2. 수정/삭제/복원/일괄 수정 중 어떤 동작인지 명시
3. 해당 write endpoint 호출
4. 후속 조회로 상태 재확인

### 대출 연결 요청

1. `GET /api/v1/loan-transaction-links`로 후보 거래 확인
2. `GET /api/v1/loan-accounts`로 대출 계좌 후보 확인
3. 단건 또는 bulk loan-link endpoint 호출
4. canonical view 또는 read API로 nullable loan fields 반영 확인

## Acceptance Checklist

- `GET /api/v1/schema`를 읽을 수 있다.
- `GET /api/v1/canonical-views/dashboard`를 읽을 수 있다.
- readonly DB로 `SELECT`가 된다.
- readonly role에 `statement_timeout=30s`가 걸려 있다.
- canonical read surface 값 의미를 skill 문서에 포함했다.
- 진행월 estimated income row를 관측값과 분리해 설명하도록 했다.
- 업로드 API를 `X-API-Key`로 호출할 수 있다.
- 거래 수정/삭제/복원 API를 호출할 수 있다.
- 대출 연결 write API를 호출할 수 있다.
- analytics settings API를 호출할 수 있다.
- `merchant` 정규화 부재와 `merge` endpoint stub 상태를 명시했다.
- 실패 시 재확인 경로가 적혀 있다.

## 최소 검증 시나리오

1. `GET /api/v1/schema`
2. `GET /api/v1/canonical-views/dashboard`
3. `GET /api/v1/analytics/monthly-cashflow`
4. `GET /api/v1/analytics/category-mom`
5. `GET /api/v1/analytics/fixed-cost-summary`
6. `GET /api/v1/analytics/recurring-payments`
7. `GET /api/v1/assets/snapshot-compare`
8. readonly DB로 `vw_transactions_effective` 조회
9. readonly DB로 `vw_true_spendable_monthly` 조회
10. `GET /api/v1/transactions/summary?type=지출`
11. `POST /api/v1/upload`
12. `GET /api/v1/upload/logs`
13. `PATCH /api/v1/transactions/{id}`
14. `GET /api/v1/loan-accounts`
15. `PUT /api/v1/transactions/{id}/loan-link`
