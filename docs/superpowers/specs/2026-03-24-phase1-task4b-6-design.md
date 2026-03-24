# Phase 1 Task 4B-6 Design

**Scope:** Phase 1의 남은 backend 핵심 범위인 `Task 4B`, `Task 5`, `Task 6`을 순차적으로 구현한다. 각 Task 완료 시점마다 `STATUS.md`를 갱신하고 별도 커밋을 남긴다.

## Goal

거래 적재만 가능한 현재 backend를 BankSalad workbook의 snapshot 적재, 업로드/API 자산 조회, 거래 조회/편집 API까지 확장해 Phase 1 MVP의 backend 범위를 실사용 가능한 수준으로 끌어올린다.

## Product Direction

- 1차 목적은 내부 운영과 OpenClaw 연동을 위한 안정적인 backend API를 갖추는 것이다.
- 쓰기 경로는 API 중심으로 유지한다.
- 정형화된 조회는 REST API로 제공한다.
- OpenClaw의 ad-hoc 심층 분석은 후속 Phase에서 PostgreSQL readonly 계정으로 DB를 직접 조회하는 하이브리드 모델을 유지한다.

## Scope

- 포함:
  - workbook upload service의 snapshot/investment/loan 적재
  - `partial` / `failed` upload status 반영
  - `POST /api/v1/upload`
  - `GET /api/v1/schema`
  - 자산 관련 조회 API
  - 거래 조회/수정/삭제/복원/일괄수정 API
  - `POST /api/v1/transactions/merge`의 `501 Not Implemented` stub
- 제외:
  - frontend 화면 구현
  - OpenClaw TOOLS.md 및 readonly DB 계정 설정
  - transaction merge 실제 병합 로직

## Architecture

### Task 4B

- `upload_service.py`를 전체 workbook import orchestration 계층으로 확장한다.
- service는 workbook 로드 후 `parse_transactions()` 와 `parse_snapshots()` 를 모두 수행한다.
- transaction 적재와 snapshot 적재는 논리적으로 분리해 각각 예외를 캡처한다.
- 결과는 단일 `UploadLog`로 남기되, 성공/부분 성공/실패 상태를 명확히 기록한다.
- snapshot 적재는 `snapshot_date` 기준 upsert로 구현한다.

### Task 5

- API 계층에는 업로드, schema, assets 전용 endpoint 모듈을 추가한다.
- Pydantic v2 schema를 명시적으로 두고 request/response를 고정한다.
- `POST /api/v1/upload` 와 `GET /api/v1/schema` 는 `X-API-Key` 인증을 사용한다.
- assets 계열 API는 DB 집계 결과를 바로 반환하는 thin endpoint + service 구조를 사용한다.

### Task 6

- 거래 API는 조회(read)와 편집(write)를 한 endpoint 모듈에서 관리하되, 집계/목록/수정 로직은 service 함수로 분리한다.
- 조회 쿼리는 항상 `is_deleted = FALSE` 와 `merged_into_id IS NULL` 기본 규칙을 따르되, include 플래그로 override 가능하게 둔다.
- 카테고리는 항상 사용자 수정값 우선 규칙 `COALESCE(category_*_user, category_*)` 를 적용한다.
- 쓰기성 거래 API는 모두 `X-API-Key` 인증을 요구한다.

## Data Rules

- `snapshot_date`는 request 값 우선, 없으면 서버 업로드 날짜를 사용한다.
- asset/investment/loan snapshot은 동일 날짜 재업로드 시 update 된다.
- transaction 분석/조회 기본값은 삭제/병합 제외다.
- `지출` 양수는 refund/cancel로 간주하되, 원본 부호를 그대로 저장한다.
- `이체`는 수입/지출 summary에서 제외한다.

## Testing

- Task 4B:
  - 첫 업로드에서 transaction + snapshot 모두 적재되는지 검증
  - snapshot 파싱/적재만 실패하는 경우 `partial` 기록과 transaction 보존 검증
  - 양쪽 모두 실패하는 경우 `failed` 기록 검증
  - 동일 `snapshot_date` 재업로드 시 upsert 검증
- Task 5:
  - upload endpoint 인증/응답/status 분기 검증
  - schema endpoint 인증/문서 반환 검증
  - assets API의 snapshot 조회 및 기본 집계 검증
- Task 6:
  - 거래 목록 필터/검색/페이지네이션 검증
  - summary/by-category/payment-method 집계 검증
  - manual create, patch, soft delete, restore, bulk update 검증
  - merge endpoint `501` 검증

## Risks

- 현재 parser는 snapshot parse 결과만 있고 DB 적재 계층이 없어 4B에서 서비스 책임이 커질 수 있다. 필요하면 snapshot persistence helper를 분리한다.
- SQLite test 환경과 PostgreSQL 실환경의 upsert 문법 차이를 흡수해야 한다.
- 거래 조회 API는 필터 조합이 많아서 서비스 함수 경계가 흐려지기 쉽다. read/query helper를 먼저 분리하는 편이 안전하다.
