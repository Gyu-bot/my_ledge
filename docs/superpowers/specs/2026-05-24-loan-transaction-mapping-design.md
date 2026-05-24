# Loan Transaction Mapping Design

## Goal

지출 거래를 변동 가능한 loan snapshot row가 아니라 안정적인 대출 계좌 식별자에 연결한다. 사용자는 프론트엔드에서 특정 거래가 어떤 대출의 원금, 이자, 원리금 혼합 상환인지 직접 지정할 수 있어야 한다.

## Architecture

`loan_accounts`는 `lender + product_name`을 기준으로 대출 계좌 identity를 보관한다. `loans`는 계속 snapshot observation으로 남고, 최신 또는 과거 스냅샷의 같은 lender/product pair를 계좌 후보로 보여주는 데 사용한다.

`loan_transaction_links`는 거래 1건을 대출 계좌 1개에 연결한다. 매핑에는 `repayment_type`을 둬서 `principal`, `interest`, `mixed`, `unknown` 중 하나로 표시하고, 추후 세부 원금/이자 금액 분해가 필요하면 이 테이블을 확장한다.

## API Contract

- `GET /api/v1/loan-accounts`: 계좌 후보 목록. 기존 매핑 계좌와 `loans` snapshot에서 발견된 lender/product pair를 함께 반환한다.
- `GET /api/v1/transactions/{id}/loan-link`: 특정 거래의 대출 상환 매핑을 조회한다.
- `PUT /api/v1/transactions/{id}/loan-link`: 특정 거래의 매핑을 생성 또는 갱신한다. `X-API-Key`가 필요하다.
- `DELETE /api/v1/transactions/{id}/loan-link`: 특정 거래의 매핑을 해제한다. `X-API-Key`가 필요하다.

## Data Rules

- 연결 대상 거래는 삭제 또는 병합된 row여도 audit 차원에서는 링크 row를 보존할 수 있다. 일반 UI에서는 기본 거래 목록 필터가 삭제/병합 row를 숨긴다.
- `PUT` 요청은 `loan_account_id`를 받거나 `lender + product_name`을 받아 계좌를 upsert할 수 있다.
- 동일 거래에는 하나의 active loan link만 허용한다.
- `loans.id`에는 직접 FK를 걸지 않는다.

## Testing

- API 테스트는 계좌 후보 조회, lender/product upsert 매핑, 기존 계좌 ID 매핑, 매핑 해제, 인증 요구를 검증한다.
- 서비스 테스트는 snapshot row가 여러 날짜에 중복되어도 계좌 후보가 lender/product pair 기준으로 dedupe되는지 검증한다.

