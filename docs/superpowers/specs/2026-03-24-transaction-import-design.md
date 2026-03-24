# Transaction Import Design

**Scope:** Phase 1 Task 4를 `transactions` 적재에 한정해 먼저 구현한다. `asset_snapshots`, `investments`, `loans` 적재와 `partial` 상태의 전체 구현은 후속 작업으로 분리한다.

## Goal

비암호화 또는 복호화된 BankSalad workbook에서 `가계부 내역`만 읽어 실제 PostgreSQL `transactions` 테이블과 `upload_logs`에 적재할 수 있게 한다.

## Boundaries

- 이번 범위에 포함:
  - workbook bytes 입력
  - transaction parser 결과 기반 적재
  - 시간 커서 기반 incremental import
  - 동일 `(date, time)` 경계 시점 중복 비교
  - `upload_logs`에 transaction 기준 적재 결과 기록
- 이번 범위에서 제외:
  - snapshot 테이블 적재
  - `/api/v1/upload` 엔드포인트
  - snapshot 실패를 포함한 `partial` 분기

## Architecture

- `upload_service.py` 에 transaction import orchestration을 둔다.
- service는 `open_excel_bytes()` 와 `parse_transactions()` 를 호출해 normalized row 목록을 만든다.
- DB에서는 `transactions` 의 마지막 거래 시점 `(date, time)` 을 조회한다.
- 마지막 시점보다 뒤의 row는 모두 신규 후보로 본다.
- 마지막 시점과 같은 `(date, time)` row는 기존 DB row와 핵심 필드 비교로 중복 여부를 판정한다.
- 신규 row만 `Transaction` 모델로 insert 하고, 결과 카운트를 `UploadLog` 에 남긴다.

## Duplicate Rule

중복 판정 키는 이번 범위에서 다음 필드 조합으로 둔다.

- `date`
- `time`
- `type`
- `category_major`
- `category_minor`
- `description`
- `amount`
- `currency`
- `payment_method`
- `memo`

복합 unique 제약은 추가하지 않고, 서비스 계층에서 경계 시점 비교로 처리한다. 이는 기존 PRD와 동일한 방향이다.

## Testing

- service 테스트는 실제 async SQLAlchemy session을 사용한다.
- 첫 import 시 전체 거래가 insert 되는지 검증한다.
- 동일 파일 재적재 시 `tx_new=0` 과 `tx_skipped=전체건수` 를 검증한다.
- 동일 초 다건 경계 케이스가 샘플에서 보존되는지 검증한다.
- `upload_logs` 에 filename, tx counts, status가 기록되는지 검증한다.

## Risks

- 현재 저장소에는 docker compose와 `.env.example` 이 없어 실제 DB 환경은 이미 떠 있는 Postgres 또는 별도 `.env`에 의존한다.
- 암호화된 실파일 복호화 end-to-end 검증은 아직 샘플이 없다.
