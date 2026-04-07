> Historical document. Do not use this file as the current frontend source of truth. See `docs/frontend-design-tokens.md` and related active frontend docs instead.

# 거래 작업대 일괄 수정 설계

## 목표
- 거래 편집 작업대에서 여러 거래를 체크한 뒤 한 번에 수정할 수 있게 한다.
- 수정 대상 필드는 `merchant`, `category_major_user`, `category_minor_user`, `cost_kind`, `fixed_cost_necessity`, `memo` 로 제한한다.

## UI 설계
- 각 거래 row/card에 체크박스를 추가한다.
- 하나 이상 선택되면 테이블 상단에 bulk toolbar를 노출한다.
- bulk toolbar는 다음 요소를 가진다.
  - 선택 건수 표시
  - 현재 페이지 전체 선택
  - 선택 해제
  - 거래처 / 대분류 / 소분류 / 고정비·변동비 / 고정비 필수 여부 / 메모 입력 필드
  - `일괄 수정 적용` 버튼
- bulk form에서 비어 있는 필드는 “수정 안 함”으로 취급한다.
- `cost_kind` 는 `fixed`, `variable` 두 값만 입력받는다.
- 새로 생성되는 수동 거래의 `cost_kind` 기본값은 `variable` 로 둔다.
- bulk toolbar의 `cost_kind` 기본 선택은 `수정 안 함` 으로 유지해, 선택만으로 다건 데이터가 덮어써지지 않게 한다.
- 단건 편집과 bulk 선택은 동시에 진행하지 않는다.

## API 설계
- 기존 `PATCH /api/v1/transactions/bulk-update` 를 재사용한다.
- request schema에 `merchant`, `memo`, `cost_kind`, `fixed_cost_necessity` 를 포함한다.
- `cost_kind` 입력은 `fixed | variable` 로 제한한다.
- `fixed_cost_necessity` 는 `essential | discretionary` 로 제한한다.
- backend는 `merchant` 저장 시 단건 수정과 동일한 정규화 함수를 사용한다.
- backend는 `cost_kind=variable` 인 경우 `fixed_cost_necessity` 를 자동으로 비운다.

## 검증
- backend API test: bulk update가 `merchant`, `cost_kind`, `fixed_cost_necessity`, `memo` 까지 반영하는지 검증
- frontend component test: 선택 후 bulk toolbar가 나타나고 일괄 저장 payload가 전달되는지 검증
- frontend hook test: bulk mutation 성공 시 invalidate 및 success feedback 검증

## 후속 계획
- 카테고리 기반 rule-based 분류를 추가해 `cost_kind` 와 `fixed_cost_necessity` 를 자동 추천/자동 보정하는 기능을 다음 단계 계획에 포함한다.
- 이번 턴에서는 구현하지 않고 계획 항목으로만 남긴다.
