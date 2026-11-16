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

PR B의 별도 승인 삭제 단계는 [영향 분석](t056-drop-impact.md)과 [0건 사전 검사](t056-drop-preflight.sql)를 따른다. 위의 컬럼 보관 설명은 PR A 단계의 계약이다.
