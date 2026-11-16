# T056 이전 분류 입력과 읽기 표면 정리

2026-11-17 · 저장소 계약. T056 새 축은 2026-11-16부터 라이브에 반영되었다. 이 문서의 추가 정리는 별도 PR이며 배포 완료를 뜻하지 않는다.

## PR A: 입력 제거, 컬럼 보관

기준 컬럼은 `transactions.cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`, 분류 출처 `cost_classification_source`다. 대출·할부 연결과 카테고리 체계는 유지한다. 사람이 새 축을 고치는 `/nature/*`만 분류 입력으로 사용하며, 생성 시에도 값을 미리 선택하거나 추정하지 않는다.

| 발견한 읽기·쓰기 경로 | 결정 |
|---|---|
| 거래 POST, 단건·일괄 PATCH, 정규화 기본값, legacy write-through | 이전 네 분류 필드와 출처를 요청·응답에서 제거. 요청의 모르는 필드는 `extra=forbid`로 422. 생성 시 변동비/재량/반복 아님을 기본 저장하던 동작도 제거. |
| 거래 목록·검색·bulk 클라이언트 타입 | 이전 분류 필터 제거. 옛 인자를 보내면 422. 기존 `flow_row`, `payment_form`, `adjustability` 필터를 사용. `is_edited`는 남은 메타데이터 수정 또는 새 축의 `user`/`legacy_edit` 거래 지정으로 판단. |
| `/nature/transactions/{id}` 설명 | `legacy` 객체 제거. 현재 값·출처·수준별 지정은 유지. |
| 고정비 summary/trend GET | 정확한 새 축 대응 없음. 화면 소비자가 없고 `/read/monthly-flow`, `/read/spend-cube`가 후속 표면이므로 두 GET 제거(404). 고정비 이름으로 약정 총액을 대신 내지 않는다. |
| 반복 결제 후보 GET | 거래별 반복 구분과 자동 후보 탐지 폐기. 화면 소비자가 없고 `/read/commitments` 및 사람이 등록하는 정기 지급이 후속이므로 GET 제거(404). |
| `auto-classification` category/recurring 규칙 CRUD·apply·dry-run | 경로와 실행 코드를 제거(404). 반복 후보 제안도 제거. 저장된 과거 규칙 표는 legacy/frozen 보관이며 적용하지 않는다. 거래처 정규화·대출 연결 규칙은 유지. |
| `auto-classification/settings` | `apply_loan_rules_on_upload`만 입력·응답에 유지. 옛 cost/recurring 설정 입력은 422. 과거 저장값은 적용하지 않는다. |
| `/settings/analytics` 반복 dry-run 설정 | GET의 과거 설정값은 보관. PATCH에 `recurring_dry_run`을 넣으면 422. 설정 화면에서 해당 입력을 제거. 다른 설정의 읽기·저장은 유지. |
| 규칙 화면·API hooks/types·설정 draft | 고정/변동·필수/재량·거래별 반복 및 자동 반복 설정 입력 제거. 기존 작업대의 조정 가능성 기본값과 약정 현황으로 연결. 정규화·대출 규칙은 유지. |
| 할부 목록의 옛 installment 구분 | 정확한 후속인 `transaction_nature_overrides.installment_link_unconfirmed`와 실제 연결을 읽는다. 목록·제안 응답에서 `recurring_payment_kind` 제거. |
| 분석 구매 순액 행 | 사용하지 않던 이전 분류 필드를 내부 행에서 제거. 보호·조정 가능과 약정 판단은 계속 새 축에서 읽는다. |
| 전망 backtest 보조 검토 건수 | 거래별 installment 문자열 대신 새 축의 `installment_link_unconfirmed` 표시를 읽는다. 전망 계산 자체는 유지. |
| 가져오기 파서·preview | 원본 `TransactionRow`에 이전 분류 필드가 없다. 카테고리/금액/원본 설명 등 원본 해석은 변경 없음. |
| 재가져오기 apply | 이전 컬럼 복사를 제거. 원본 행은 보존되고 새 분류는 기존 `move_nature_override`로 교체 거래에 이동한다. 규칙 일치가 끊기면 기존 정기 지급 소속을 명시적으로 고정한다. 대출·할부 관계 이동도 유지. |
| 업로드 후 규칙 실행 | cost/recurring 실행을 제거. 옛 설정이 켜져 있어도 분류하지 않는다. 기존 대출 규칙 실행은 유지. |
| 검토 준비·적용과 구조 지문 | PR A는 표 구조·표 범위를 바꾸지 않는다. HTTP 요청/응답, 결정·digest 검증은 유지. 새 축 세 표도 이미 지문 범위에 포함된다. |
| 되돌리기 캡처·복원 | PR A는 구조를 보존. 일반 분류 쓰기는 없다. 가져오기 계약상 정확한 과거 상태 복원만 전체 행의 동결된 이전 값도 함께 복원한다. 별도의 분류 입력이나 자동 분류가 아니다. |
| `/schema` | 뷰에서 폐기한 필드를 제거. 원시 표에 남은 이전 분류 컬럼에는 `legacy/frozen` 설명을 붙인다. |
| 이전 이행 보고 도구·대응표·과거 Alembic | 삭제 전 대조와 과거 이행 재현용으로 보관. 운영 분류 쓰기 경로는 없다. 테스트 합성 장부용 변환은 `tests/legacy_nature_seed.py`로 이동하여 앱 코드에서 접근하지 않는다. |

### 제거된 경로

모두 `/api/v1` 아래며 인증 유무와 관계없이 404다.

- GET `/analytics/fixed-cost-summary`, `/analytics/fixed-cost-trend`, `/analytics/recurring-payments`
- GET/POST `/auto-classification/category-rules`, DELETE `/auto-classification/category-rules/{id}`, POST `/auto-classification/apply/category-rules`
- GET/POST `/auto-classification/recurring-category-rules`, DELETE `/auto-classification/recurring-category-rules/{id}`, GET `/auto-classification/recurring-category-rules/dry-run`
- POST `/auto-classification/apply/recurring-category-rules`, `/auto-classification/apply/recurring-dry-run`

### 가역적 뷰 이행 `20261117_0041`

직전 head `20261117_0040`에서 이어진다. 표·행·인덱스·제약은 건드리지 않는다. 의존하는 뷰만 순서대로 다시 만들며 CASCADE를 사용하지 않는다. downgrade는 직전 계약을 복원한다.

| 뷰 | 제거되는 컬럼 또는 뷰 |
|---|---|
| `vw_transactions_effective` | 이전 분류 5개와 그 컬럼에 의존하던 legacy 파생 `is_edited`. HTTP 거래의 `is_edited`는 새 축 입력 기준으로 유지. |
| `vw_metric_transactions`, `vw_metric_flow_lines` | `cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind` 전달 컬럼. 축 계산에는 원래부터 사용하지 않음. |
| `vw_monthly_cashflow` | `fixed_total`, `variable_total`, `essential_fixed_total`, `discretionary_fixed_total`, `essential_variable_total`, `discretionary_variable_total`, `required_spend_total`, `discretionary_spend_total`, `unclassified_expense_total` |
| `vw_fixed_cost_monthly_summary` | 위 고정/변동·필수/재량 8개 합계, `unclassified_total`, `unclassified_count`. `period`, `expense_total`, `living_spend` 유지. |
| `vw_true_spendable_monthly` | `fixed_commitment_total`, `variable_total`, `required_variable_total`, `discretionary_variable_total`, `spendable_before_variable_spend`, `remaining_after_variable_spend`. `period`, `income_total`, `loan_repayment_total` 유지. |
| `vw_recurring_merchant_monthly` | 전체 폐기. 이전 반복 구분별 표는 새 약정과 같은 값이 아니므로 같은 이름으로 대체하지 않음. |
| `vw_unclassified_work_queue` | `needs_cost_kind`, `needs_fixed_cost_necessity`, `needs_recurring_payment_kind`와 그 분류에 따른 `priority_score`, `priority_reason` 제거. `needs_spend_necessity`는 정확한 뜻인 `needs_adjustability`로 이름 변경. 거래 식별·금액·대출 연결 확인·거래처 건수 유지. |

월 흐름표·큐브·비교·`/read/*`는 새 축을 그대로 읽는다. 합성 장부에서 모든 해당 GET과 유지되는 뷰 투영의 이행 전후 동일성, downgrade/upgrade, 원본 표 무변경을 검증한다. 이전 분류의 금액 구획은 후속 축의 값과 같다고 주장하지 않는다.

PR A 검증: 백엔드 829 passed / 55 skipped / 2 xfailed, ruff 통과. 프론트엔드 326 passed 및 typecheck/lint/build 통과. 실제 컴포넌트·빌드 CSS를 격리한 브라우저에서 390/1280px로 확인했고 가로 넘침이 없었다. 18개 read/metric GET의 변경 전 응답 대조와 합성 PostgreSQL 뷰 왕복 검증을 수행했다. 원시 QA 로그나 개인 자료는 커밋하지 않는다.

## 이행 약정 확인과 수동 편집 이력 보존

PR #49는 병합되었다. 컬럼 삭제를 담은 PR #50은 병합하지 않고 닫았다. 기존 삭제 이행의 `20261117_0042` 대신, 이번 `20261117_0042`는 `0041` 뒤에 사용자 확인 시각과 편집 이력만 추가한다. 이전 다섯 컬럼은 유지한다. 닫힌 삭제 브랜치를 재사용하거나 병합하지 않는다.

### 사람이 확인하는 약정 속성

- `recurring_commitments.attributes_confirmed_at`은 nullable 시각이다. `origin='migration'`이면서 시각이 없으면 확인 대기다. 주기가 매월로 채워져 있어도 이행 자체를 사용자 확인으로 취급하지 않는다. 끝난 약정도 포함한다.
- 기존 `PATCH /nature/recurring-commitments/{id}`에 `cycle` 또는 `amount_kind`를 명시해 저장하면 확인 시각을 기록한다. `{confirm_attributes: true}`는 현재 두 속성을 그대로 확인한다. 메모만 수정하거나 조회·종료·가져오기를 실행해도 확인하지 않는다. 출처 `origin`은 바꾸지 않는다.
- 허용 주기는 기존 `monthly`, `yearly`, `n_times`, `null` 그대로다. 빈 주기를 의도적으로 유지해도 확인할 수 있다. 빈 값이 매월이나 다른 값으로 바뀌지 않으며, 확인이 관측·월 부담 계산을 보완하지 않는다. 금액 종류도 `fixed`, `variable`, `null` 그대로다.
- 기존 약정 현황에 확인 대기 수·배지·필터와 편집 링크를 추가한다. 기존 작업대의 정기 지급 목록에서 확인 대기만 보거나, 속성을 고쳐 저장하거나, 현재 주기·금액을 그대로 확인한다. 새 등록값과 추천값을 미리 고르지 않고, 모두 확인하는 동작은 없다. 편집 폼에는 현재 저장값만 표시한다.
- 읽기 응답은 추가만 한다. `/nature/recurring-commitments`는 각 행의 확인 시각·대기 여부와 목록의 `pending_confirmation_count`를 준다. `/read/commitments`도 상세 행의 시각·대기 여부, 요약 행의 대기 여부, 필터 전 전체 대기 수를 준다. 대출·할부의 대기 여부는 false다. 쓰기는 기존대로 `X-API-Key`가 필요하며, 소비 에이전트는 사람의 명시적 결정을 전달할 때만 확인 요청을 보낸다. 직접 DB 쓰기는 금지한다.

### 이전 수동 편집 표시

`transactions.legacy_classification_edited`를 별도 불리언으로 보존한다. 이행에서 이전 출처가 `manual`인 모든 거래와 교체·병합 계보의 후속 거래에 true를 기록한다. 이전 값이 모두 비었거나 새 축 지정 행이 없는 거래도 포함한다. 나머지는 false다. HTTP `is_edited` 판정에 이 기록을 더한다. 새 거래 분류 입력으로 노출하지 않는다.

지정 출처를 `legacy_edit`로 바꾸지 않는다. 출처는 거래 설명(`override_source`), 재가져오기 이동, 편집 표시, 삭제 사전 검사의 명시적 후속 결정 판정에서 읽힌다. 출처를 바꾸면 사전 검사가 실제 분류 결정으로 오해할 수 있다. SQL 축 우선순위는 출처 문자열에 의존하지 않지만, 별도 이력으로 모든 기존 지정·출처·설명과 계산을 그대로 보존한다. 새 지정 행도 만들지 않는다. 교체 거래에는 기존 사용자 메타데이터와 함께 이 표시를 복사한다.

이행은 기존 행의 분류값·출처·수정 시각을 바꾸지 않는다. downgrade는 새 두 컬럼만 제거하여 직전 상태를 복원한다. 이후 사람이 저장한 새 확인 기록은 downgrade 때 사라진다. 합성 장부의 모든 정적 `/read/*`, `/analytics/*`, `/metrics/*` GET과 약정 요약 응답을 편집 이력 복원 전후 바이트 단위로 비교하고, 모든 뷰의 정의·값 및 기존 행을 왕복 대조한다. 응답에서 바뀌는 기존 필드는 거래의 `is_edited`뿐이다. 확인 메타데이터는 추가 필드다.

### 가져오기 계약과 준비된 작업

기존 검토 digest는 모든 재무 표의 모든 컬럼을, 되돌리기는 전체 행 JSON을 포함한다. 새 확인 시각과 편집 이력도 자동으로 그 범위에 들어간다. 새 구조에서 준비·적용·되돌리기를 수행하면 두 기록을 정확히 보존한다. 사용자 확인 뒤에는 이미 준비된 검토의 상태 digest가 달라지므로 다시 준비해야 한다.

이행 전 준비한 검토는 다시 준비해야 한다. 이전 구조의 ready 되돌리기 지점은 새 컬럼을 잃을 수 있어 사용할 수 없다. 목록의 `can_rollback=false`, 복원 요청은 `schema_changed`로 데이터 변경 전에 거절한다. 과거 스냅샷·검토 증거 자체는 삭제하지 않는다. 진행 중인 가져오기가 없을 때 이행한다.

### 후속 컬럼 삭제 사전 검사

[읽기 전용 SQL](t056-drop-preflight.sql)은 닫힌 삭제 브랜치에서 옮긴 도구이며, 이번 이행에서는 실행하지 않는다. 이름·식별자·금액 없이 아홉 건수만 반환한다. 기존 여덟 검사에 `hand_edit_mark_not_preserved_count`를 더해 원본 수동 편집 이력과 계보 끝의 표시가 모두 남았는지 확인한다.

`commitment_attribute_only_in_legacy_count`는 사람이 속성을 확인한 약정을 제외한다. `payment_form_only_in_legacy_count`도 현재 묶음을 열어 그 속성을 확인한 결정이 있으면 이전 거래별 반복 구분과 달라도 막지 않는다. 확인은 거래 단위 조정 가능성 결정이나 충돌·할부 연결 확인을 대신하지 않으므로 다른 보존 검사는 계속 적용한다. `origin`을 바꾸거나 확인 기록 없이 값을 추정해 검사만 통과시키지 않는다.

컬럼 삭제는 소유자가 라이브 화면에서 이행 약정의 확인 대기를 처리한 뒤 별도 변경으로 진행한다. 그 변경은 최신 head에 다시 연결하고 준비된 가져오기 검토와 ready 되돌리기 지점을 만료시켜야 한다. 아홉 검사 통과와 대기 약정 처리 확인은 삭제 승인을 대신하지 않는다. 이번 PR은 라이브 접속·배포·컬럼 삭제를 하지 않는다.
