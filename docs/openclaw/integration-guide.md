# OpenClaw Integration Guide

## 목적

이 문서는 OpenClaw 작업자가 `my_ledge`를 다음 두 경로로 안전하게 사용할 수 있게 하는 운영 가이드다.

- 읽기: PostgreSQL readonly 유저로 직접 SQL 조회
- 쓰기: FastAPI endpoint 호출

핵심 원칙은 하이브리드다.

- 정형 조회는 API 또는 canonical view를 우선 사용
- ad-hoc 분석은 readonly DB 직접 조회
- 업로드와 거래 수정 같은 쓰기 동작은 API만 사용

## 현재 연동 표면

### Read via API

- `GET /api/v1/schema`
- `GET /api/v1/transactions`
- `GET /api/v1/transactions/summary`
- `GET /api/v1/transactions/by-category`
- `GET /api/v1/transactions/by-category/timeline`
- `GET /api/v1/transactions/payment-methods`
- `GET /api/v1/assets/snapshots`
- `GET /api/v1/assets/net-worth-history`
- `GET /api/v1/investments/summary`
- `GET /api/v1/loans/summary`
- `GET /api/v1/upload/logs`

### Write via API

- `POST /api/v1/upload`
- `POST /api/v1/transactions`
- `PATCH /api/v1/transactions/{id}`
- `DELETE /api/v1/transactions/{id}`
- `POST /api/v1/transactions/{id}/restore`
- `PATCH /api/v1/transactions/bulk-update`

`POST /api/v1/transactions/merge` 는 현재 `501 Not Implemented` stub 이므로 실제 workflow에 넣지 않는다.

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
  - `upload_logs`

## 인증과 접속 정보

### API

다음 endpoint는 `X-API-Key` 인증이 필요하다.

- `POST /api/v1/upload`
- `GET /api/v1/schema`
- 쓰기성 거래 편집 API 전체

예시:

```bash
curl -H "X-API-Key: $API_KEY" http://localhost:8000/api/v1/schema
```

### DB readonly

OpenClaw는 읽기 전용 PostgreSQL 유저를 사용해야 한다.

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

로컬/compose 환경에서는 새 PostgreSQL 볼륨 초기화 시 `readonly` 유저와 `statement_timeout=30s` 가 자동 bootstrap 된다.
기존 볼륨에서는 아래를 수동 실행해야 한다.

```bash
docker compose exec db sh /docker-entrypoint-initdb.d/01-create-readonly-role.sh
```

## 권장 조회 순서

### 1. 스키마 파악

새로운 세션에서 쿼리를 쓰기 전 먼저 `GET /api/v1/schema` 를 본다.

목적:

- raw table과 canonical view 구조 확인
- 컬럼 타입과 의미 확인
- SQL 생성 전 용어와 read surface를 맞춤

### 2. 가능하면 canonical view 우선

거래 분석은 raw `transactions`보다 아래 뷰를 우선 사용한다.

- `vw_transactions_effective`
- `vw_category_monthly_spend`

이유:

- 삭제/병합 제외 규칙이 반영돼 있다
- 사용자 수정 카테고리 우선 규칙이 반영돼 있다
- API read path와 같은 해석층을 공유한다

### 3. raw table은 정합성 점검이나 세부 분석에만 사용

예:

- 업로드 로그 세부 확인
- snapshot 원본 값 점검
- canonical view가 감춘 내부 상태 확인

## 거래 데이터 해석 규칙

OpenClaw가 SQL을 직접 작성할 때 반드시 반영할 규칙:

```sql
WHERE is_deleted = FALSE
  AND merged_into_id IS NULL
```

카테고리는 사용자 수정값 우선:

```sql
COALESCE(category_major_user, category_major) AS category_major,
COALESCE(category_minor_user, category_minor) AS category_minor
```

타입 규칙:

- `지출`: 지출 분석 포함
- `지출` + 양수 금액: 환불/취소, 지출 상계
- `수입`: 수입 분석 포함
- `이체`: 수입/지출에서 제외, 자산이동으로 별도 해석

## 예시 워크플로우

### 월별 지출 분석

1. `GET /api/v1/schema` 로 canonical view 확인
2. 가능하면 `/api/v1/transactions/summary?type=지출`
3. 세부 drill-down 이 필요하면 readonly DB에서 `vw_transactions_effective` 조회

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

### 최근 업로드 이력 확인

```bash
curl http://localhost:8000/api/v1/upload/logs
```

현재 `upload_logs` API는 최근 10건만 제공한다. 페이지네이션은 없다.

## 실패 시 해석

### API `401`

- `X-API-Key` 누락 또는 불일치

### API `422`

- 잘못된 request payload
- `snapshot_date` 형식 오류

### API `500`

- 서버 내부 오류
- 파싱 실패 원인은 upload response `error_message` 또는 `upload_logs`에서 재확인

### DB 쿼리 실패

- readonly 권한 부족
- canonical/raw table 이름 오기
- `statement_timeout=30s` 초과

## 운영 주의사항

- 쓰기 동작은 API만 사용한다. DB 직접 수정 금지
- 대규모 탐색성 쿼리는 canonical view 기준으로 먼저 축소해서 실행한다
- `upload_logs`는 운영 이력 확인용이지 상세 감사 로그 전체를 대체하지 않는다
- 샘플 workbook는 현재 비암호화 상태지만, 운영 파일은 암호화 `.xlsx`일 수 있다
- skill 구현 시 브라우저 자동화에 의존하지 말고 API/DB 기반 흐름을 우선한다

## 이 문서가 다루지 않는 것

- OpenClaw skill의 실제 설치 경로
- OpenClaw skill 포맷별 frontmatter
- OpenClaw 내부 tool registry 등록 절차

그 부분은 [skill-handoff.md](/home/gyurin/projects/my_ledge/docs/openclaw/skill-handoff.md)와 OpenClaw 저장소 규칙에서 마무리한다.
