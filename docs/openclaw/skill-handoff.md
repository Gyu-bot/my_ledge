# OpenClaw Skill Handoff

## 목적

이 문서는 OpenClaw 작업자가 `my_ledge`용 skill을 별도 저장소나 runtime 환경에서 패키징할 때 필요한 입력값과 흐름을 정리한 handoff 문서다.

이 저장소는 skill package를 직접 배포하지 않는다.  
대신 아래 내용을 그대로 옮기거나 변형해 OpenClaw skill로 포장할 수 있게 만드는 것이 목표다.

## Skill의 책임 범위

권장 skill 책임:

- `my_ledge` 스키마/연동 방식 안내
- readonly DB 접속 시 canonical view 우선 사용 강제
- 업로드 API와 편집 API 호출 절차 안내
- 에러 해석 규칙 안내

skill이 직접 책임지지 않아야 하는 범위:

- 앱 비즈니스 로직 재구현
- 서버 내부 로컬 파일 경로에 대한 강한 가정
- DB write

## 권장 Skill 구조

### 1. 시작 안내

세션 시작 시 skill은 다음 순서로 유도하는 것이 좋다.

1. `schema` API 확인
2. 읽기 작업인지 쓰기 작업인지 분기
3. 읽기면 API 또는 readonly DB 사용
4. 쓰기면 `X-API-Key` 기반 REST API 사용

### 2. Read workflow

권장 우선순위:

1. `GET /api/v1/schema`
2. 정형 endpoint 사용 가능 여부 판단
3. advisor 질문이면 analytics endpoint 우선 사용
4. 필요 시 readonly DB로 `vw_transactions_effective` 또는 `vw_category_monthly_spend` 조회
4. raw table은 검증성/보조성 조회에만 사용

### 3. Write workflow

권장 우선순위:

1. 업로드: `POST /api/v1/upload`
2. 거래 수정: `PATCH /api/v1/transactions/{id}`
3. 삭제: `DELETE /api/v1/transactions/{id}`
4. 복원: `POST /api/v1/transactions/{id}/restore`

## Skill 입력값

OpenClaw skill 배포 시 최소 입력값:

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

- 거래 분석은 canonical view 우선
- advisor용 해석은 가능하면 analytics endpoint 우선
- `이체`는 수입/지출에서 제외
- 사용자 카테고리 수정값 우선
- 삭제/병합 건 제외
- 삭제/병합 상태까지 봐야 하면 canonical view 대신 raw `transactions` 또는 `GET /api/v1/transactions?include_deleted=true&include_merged=true` 사용
- `monthly-cashflow.transfer` 는 `ABS(amount)` 기준 activity volume 이며 `net_cashflow` 계산에는 포함하지 않음
- `merchant-spend` v1은 raw `description` 기준이라 alias 분산 가능성이 있음

### 보안 규칙

- DB는 readonly 유저만 사용
- 쓰기 작업은 API만 사용
- API key가 필요한 endpoint와 그렇지 않은 endpoint를 구분

### 실패 대응 규칙

- `401`: credential 재확인
- `422`: payload 재구성
- `500`: 응답 body와 `upload_logs` 재확인
- DB timeout: 더 좁은 기간/범위로 재시도

## 권장 프롬프트/행동 흐름

skill은 대략 아래 행동을 강제하면 된다.

### 분석 요청 시

1. `schema`를 먼저 확인했는가
2. analytics endpoint로 바로 해결 가능한가
3. 아니면 일반 read API로 해결 가능한가
4. 아니면 readonly DB에서 canonical view로 해결할 수 있는가
4. raw table이 정말 필요한가

### 업로드 요청 시

1. 파일 경로/파일 객체 확보
2. `POST /api/v1/upload` 호출
3. response `status`, `transactions`, `error_message` 확인
4. 필요 시 `/api/v1/upload/logs` 재확인

### 거래 편집 요청 시

1. 대상 transaction id 확인
2. 수정/삭제/복원 중 어떤 동작인지 명시
3. 해당 write endpoint 호출
4. 후속 조회로 상태 재확인

## 예시 도구 흐름

### Skill-only 방식

- HTTP client
- PostgreSQL client
- 표준 텍스트 응답

### 이후 MCP로 승격할 때의 자연스러운 도구 이름

- `my_ledge_get_schema`
- `my_ledge_query_sql`
- `my_ledge_upload_workbook`
- `my_ledge_update_transaction`
- `my_ledge_delete_transaction`
- `my_ledge_restore_transaction`
- `my_ledge_get_upload_logs`

지금 단계에서는 위 이름을 실제로 구현할 필요는 없다.  
다만 skill 설계 시 이 정도의 책임 단위로 나뉘도록 작성하면 이후 MCP 승격이 쉬워진다.

## Acceptance Checklist

OpenClaw 작업자는 skill 패키징 전 아래를 확인해야 한다.

- `schema` API를 읽을 수 있다
- readonly DB로 `SELECT`가 된다
- readonly role에 `statement_timeout=30s`가 걸려 있다
- 업로드 API를 `X-API-Key`로 호출할 수 있다
- 거래 수정/삭제/복원 API를 호출할 수 있다
- canonical view를 우선 사용하도록 skill 문구가 들어가 있다
- `merge` endpoint는 MVP 범위 밖임을 명시했다
- 실패 시 재확인 경로(`upload_logs`, HTTP status, DB timeout 축소)가 적혀 있다

## 구현 후 검증 시나리오

최소 검증 시나리오:

1. `GET /api/v1/schema`
2. `GET /api/v1/analytics/monthly-cashflow`
3. `GET /api/v1/analytics/category-mom`
4. `GET /api/v1/analytics/fixed-cost-summary`
5. `GET /api/v1/analytics/merchant-spend`
6. readonly DB로 `vw_transactions_effective` 조회
7. `GET /api/v1/transactions/summary?type=지출`
8. `POST /api/v1/upload`
9. `GET /api/v1/upload/logs`
10. `PATCH /api/v1/transactions/{id}`
11. `DELETE /api/v1/transactions/{id}`
12. `POST /api/v1/transactions/{id}/restore`

## 참고 문서

- 연동 규약: [integration-guide.md](/home/gyurin/projects/my_ledge/docs/openclaw/integration-guide.md)
- 프로젝트 요구사항: [PRD.md](/home/gyurin/projects/my_ledge/PRD.md)
- 운영 상태: [STATUS.md](/home/gyurin/projects/my_ledge/STATUS.md)
