# Agent Canonical Read Surface Reference

## T056 승인된 컬럼 삭제 (2026-11-17, PR B)

이 절이 PR A의 원시 컬럼 보관 설명보다 우선한다. `20261117_0042`는 `20261117_0041` 뒤에서 `transactions.cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`, `cost_classification_source`를 삭제한다. `/schema` 원시 거래 표에서도 이 다섯 필드는 사라진다. 뷰 제거·투영 제거는 PR A에서 끝났으며 B는 뷰를 바꾸지 않는다. 과거 규칙 표와 설정 기록은 동결 보관한다.

[영향 분석](t056-drop-impact.md)과 [건수 전용 SQL](t056-drop-preflight.sql)을 따른다. 삭제는 새 축에 보존되지 않은 이전 사람 분류의 건수가 하나라도 있으면 거절된다. pending/processing 가져오기도 거절한다. 준비 검토는 stale, 기존 ready 되돌리기 지점은 expired가 되어 재사용할 수 없다(강제 복원도 불가). 스냅샷·지문·업로드 로그·원본 증거는 보관하며 새로 준비한 검토와 이행 뒤 만든 되돌리기 지점은 새 구조를 쓴다. HTTP 입력·응답 구조와 상태코드는 기존 계약을 유지한다.

downgrade는 nullable 컬럼만 재생성하고 삭제한 값이나 이전 승인·되돌리기 유효성은 복원하지 않는다. 새 축과 `/read/*`·흐름표·큐브의 값은 유지한다. 외부 에이전트 되돌리기 도우미와 SQL 소비자는 이름 변경 목록을 검토자가 점검해야 한다. 이 문서의 구현은 검토·병합 전이며 배포하지 않았다.


## T056 입력·이전 읽기 표면 제거 (2026-11-17, PR A)

이 절이 아래의 이전 분류 호환 설명보다 우선한다. [전체 경로별 결정과 뷰 변경 목록](t056-classification-retirement.md)을 따른다. `cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`, `cost_classification_source`는 거래 응답·생성·단건/일괄 수정에서 제거되며 옛 입력과 필터는 422다. `/nature/transactions/{id}.legacy`와 할부 응답의 `recurring_payment_kind`도 제거된다. 변동비·재량·반복 아님을 기본 저장하지 않는다.

GET `analytics/fixed-cost-summary`, `analytics/fixed-cost-trend`, `analytics/recurring-payments` 및 category/recurring 자동 분류 규칙 CRUD·apply·dry-run은 404다. 후속은 `/read/monthly-flow`, `/read/spend-cube`, `/read/commitments`와 사람이 입력하는 `/nature/*`다. 같은 이름으로 근사값을 내지 않는다. 자동 분류 설정에는 대출 규칙만 남고, `settings/analytics`의 `recurring_dry_run`은 읽기 보관용이며 수정은 422다. 거래처 정규화와 대출 연결은 유지한다.

`20261117_0041`은 가역적인 뷰 전용 이행이다. 원시 거래의 이전 컬럼은 legacy/frozen 보관이며 아직 삭제하지 않는다. `/schema`는 이를 표시하고 폐기된 뷰 필드는 더 열거하지 않는다. 아래의 옛 필드·산식·입력 설명은 이행 배경 기록이며 현재 계약이 아니다. 가져오기 HTTP 계약과 새 축·흐름표·큐브·`/read/*` 금융 값은 유지한다. 배포하지 않았다.


이 문서는 Hermes, Codex, Claude, OpenClaw 등 범용 에이전트가 `my_ledge`의 API와 canonical view 값을 해석할 때 쓰는 값 사전이다.
목표는 에이전트가 raw table을 임의로 재계산하지 않고, 이미 정의된 read surface의 의미와 계산 기준을 그대로 재사용하게 하는 것이다.

## 우선순위

1. Live backend 코드: `backend/app/api/v1/**`, `backend/app/services/**`, `backend/app/schemas/**`
2. Contract 요약: [backend-api-ssot.md](../backend-api-ssot.md)
3. 이 문서
4. 상세 구현 reference: [backend-api-and-metrics-reference.md](../backend-api-and-metrics-reference.md)
5. `PRD.md` 및 과거 planning 문서

## 공통 해석 규칙

| 항목 | 의미 |
|---|---|
| `period` | 월 단위 문자열 `YYYY-MM`이다. 월말 날짜가 아니라 집계 bucket label이다. |
| `amount` | 원본 거래 금액이다. BankSalad 원본 기준으로 `지출`은 보통 음수, `수입`은 보통 양수다. |
| 지출 정규화 | 지출 집계에서는 `-amount`를 사용한다. `지출`인데 양수인 건은 환불/취소로 보고 지출 합계에서 차감된다. |
| settlement canonical | 월 집계(현금흐름·카테고리·거래처·대시보드 view)에서 환불은 게시월에 남는다. 확정 settlement는 배분된 부분의 분류(카테고리·거래처 등)만 원거래로 옮긴다. 구매 단위 검토 후보만 `purchase_net.v1`로 원거래에 차감한다. 상세: [backend-api-and-metrics-reference.md](../backend-api-and-metrics-reference.md#metric-contract-t054t055). |
| 집계 기준 | 삭제·병합·대체(superseded) 행 제외, KRW만 합산. 원화 외 통화는 합산하지 않고 `vw_metric_excluded_currency`로 따로 보인다. |
| 성격 두 축 (T056) | **지급 형태** `payment_form`: `committed`(대출 연결·할부 연결·사람이 등록한 정기 지급 묶음 `recurring_commitments`의 거래, `commitment_kind`=`loan`/`installment`/`recurring`) 또는 `ad_hoc`(수시). **조정 가능성** `adjustability`: `protected`(보호)/`adjustable`(조정 가능)/`undecided`(미정). 지출에만 있다. 수입·이체는 `not_applicable`이며 미정이나 분류 큐에 들어가지 않는다. 우선순위: 대출·할부 연결(보호 고정) > 거래 지정 > 약정(묶음) 지정 > 카테고리 기본값 > 미정. 어느 단계가 값을 줬는지는 `adjustability_source`로 읽는다. 값은 사람이 정한 것이며 시스템이 추천하거나 채우지 않는다. |
| 기존 분류 컬럼 | `cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`는 남아 있고 기존 API 필드·legacy view(`vw_monthly_cashflow`의 `fixed_total` 등)·고정비 요약(`/analytics/fixed-cost-summary`, `fixed-cost-trend`)·반복 결제 후보(`/analytics/recurring-payments`)에 그대로 쓰인다. 월 흐름표·지출 큐브·비교와 재량 지출 속도(`/analytics/discretionary-velocity`), 사후 검토 후보(`spending-review-candidates`, `purchase-gate-candidates`, `/read/review-items`), 유동성 필수 지출(`/analytics/liquidity-health`)은 이 컬럼이 아니라 `vw_transaction_nature`를 읽는다(재량 ↔ `adjustable`, 필수 ↔ `protected`, 비어 있음 ↔ `undecided`, 고정비 ↔ 약정(정기 지급 묶음)). 기존 컬럼을 고치면 같은 대응표로 새 축에 반영되고(write-through), 새 API로 고친 값은 기존 컬럼에 반영되지 않으므로 둘이 다르면 새 축이 기준이다. |
| `type='이체'` | 수입/지출 분석에서 제외한다. `transfer_activity_total`처럼 별도 활동량으로만 본다. |
| `effective_category_*` | 사용자 수정 카테고리가 있으면 사용자 값을, 없으면 원본 import 카테고리를 쓴다. |
| 삭제/병합 거래 | canonical transaction surface는 기본적으로 `is_deleted=false`, `merged_into_id is null`만 노출한다. 감사성 조회는 raw table 또는 transaction API의 include flag를 쓴다. |
| 대출 연결 거래 | 원본 거래 타입/카테고리를 바꾸지 않는다. `loan_transaction_links`와 canonical nullable loan field로 파생 의미를 붙인다. |
| 금액 단위 | 정수 원화 기준이다. 투자/대출 snapshot 일부 원본 필드는 decimal일 수 있지만 canonical cashflow/expense 값은 integer다. |
| 비율 값 | backend 값은 보통 `0.25 = 25%` 형태다. UI 표시 시 퍼센트로 변환한다. |
| `null` | 계산 불가, 기준 부족, 미분류, 또는 사용자가 아직 입력하지 않은 상태를 의미한다. `0`과 다르게 해석한다. |

## 자산/부채 원천값 해석 규칙

현재 live 자산 surface는 BankSalad snapshot row와 사용자 보강 metadata를 그대로 읽는 보수적 surface다. 에이전트는 자산/부채 값을 임의로 재분류하지 말고, 아래 우선순위로 해석한다.

| 항목 | 현재 해석 |
|---|---|
| `asset_snapshots.side` | `asset`이면 자산, `liability`이면 부채 row로 집계한다. |
| 음수 자산 row | canonical/API 계산에서는 `side='asset' AND amount < 0` row를 `asset_total`과 현금성 합계에서 제외하고 `negative_asset_excluded_total`로 노출한다. raw row를 부채로 이동하지는 않으므로, 마이너스 통장처럼 실질 부채로 보이는 row는 사용자 확인 대상으로 설명한다. |
| `liquidity_tier` | 사용자가 저장한 값이 있으면 우선한다. 없으면 health service가 category/name heuristic을 사용하고 assumptions에 남긴다. |
| `is_cash_equivalent` | 명시값이 있으면 `liquidity_tier`보다 우선해 현금성 포함 여부를 결정한다. 값이 없으면 `liquidity_tier='immediate'` 또는 보수적 category/name heuristic을 사용한다. |
| 만기/소멸/중복 자산 | 자산 snapshot은 아직 삭제/숨김/병합 API가 없으므로 latest snapshot/API에 남을 수 있다. 에이전트는 이를 live 값으로 단정하지 말고, snapshot 날짜와 raw source 한계를 함께 말한다. |
| 사용자 숨김 대출 계좌 | `loan_accounts.is_hidden=true`인 stable loan account는 기본 `/loan-accounts`와 `/loans/summary` active summary에서 제외된다. 감사/복구 목적이면 `/loan-accounts?include_hidden=true`를 사용하고 `lifecycle_status='user_hidden'`를 확인한다. |
| 원천 우선순위 | 현재는 사용자 보강값(`liquidity_tier`, `is_cash_equivalent`, 대출 `monthly_payment`/`repayment_method`)이 raw import metadata보다 우선한다. 투자 소스 선택은 `/assets/source-policy`와 `/investments/selected`에서 별도로 조회한다. 기존 snapshot canonical view는 뱅샐 기준을 유지한다. |

## My Ledge / Agent 판단 책임 경계

My Ledge는 재현 가능한 계산, 후보 추출, 근거 필드, 데이터 품질 신호, 사용자 settings, review state를 제공한다.
에이전트는 이 값을 사용자 맥락과 대화 목적에 맞게 해석하고, 최종 조언/권고/행동 제안을 책임진다.

| 신호 | My Ledge가 제공하는 것 | 에이전트가 판단할 것 |
|---|---|---|
| `health` endpoint | 유동성/부채 부담 계산값, confidence, assumptions. | 재무 상태가 실제로 위험한지, 어떤 행동이 필요한지. |
| `anomaly_score`, `reason` | baseline 대비 변화 후보와 계산 근거. | 낭비/문제/정상 이벤트/계절성 지출 여부. |
| `confidence` | 패턴 탐지 또는 데이터 완성도 신호. | 조언 강도, 추가 확인 필요성, 사용자에게 물어볼 질문. |
| `priority_score`, `priority_reason` | 데이터 정리/검토 우선순위. | 재무 위험 우선순위로 볼지 여부. 기본은 데이터 품질 queue로만 해석한다. |
| `true_spendable`, `estimated_*` | 관측/예상 수입과 지출 차감 후 계산값. | "써도 된다"는 구매 판단이나 예산 행동 권고. |
| `risk_level`, `review_priority` | threshold 기반 후보 강도 또는 검토 우선순위. | 최종 위험 판정, 구매/지출 허용 여부, 사용자별 대응. |

에이전트는 My Ledge가 명시적으로 제공하지 않은 label을 붙일 수 있지만, 그 label은 에이전트의 해석이며 My Ledge의 확정 판정이 아님을 답변에 드러낸다.

## 어떤 surface를 먼저 쓸까

| 질문 유형 | 우선 surface | 보조 surface |
|---|---|---|
| 최근 월 흐름표·전망 | `/read/monthly-flow`, `/read/month-projection` | `/read/index`로 필요한 작은 응답 탐색 |
| 거래 drill-down이 필요하다 | `vw_transactions_effective` 또는 `GET /api/v1/transactions` | raw `transactions` |
| 월별 현금흐름/저축률 | `vw_monthly_cashflow` 또는 `GET /api/v1/analytics/monthly-cashflow` | `GET /api/v1/read/monthly-flow` |
| 고정비/변동비 구조 | `vw_fixed_cost_monthly_summary` 또는 fixed-cost analytics endpoints | `vw_unclassified_work_queue` |
| 대출 상환 부담 | `vw_loan_repayment_monthly` | `GET /api/v1/loan-transaction-links` |
| 대출 구조/금리/만기 | `GET /api/v1/loans/summary` 또는 `vw_loan_account_canonical` | 숨김 계좌 복구/감사는 `GET /api/v1/loan-accounts?include_hidden=true`, schema 확인은 `GET /api/v1/schema` |
| 보험 계약/추정 보험료 | `GET /api/v1/insurance/summary` | raw `insurance_contracts`; 보험 적정성 판단은 에이전트 해석이다. |
| 할부 속성과 관측 | `/read/commitments`의 `kind=installment` | 남은 회차·마지막 회차일·월 부담·선택월 관측. 미래 출금 전망은 제거. |
| 수입 구성 | `vw_income_monthly_by_category` | `vw_monthly_cashflow`, `GET /api/v1/read/monthly-flow` |
| 잔여와 조정 가능 지출 | `/read/monthly-flow` | `residual`, `adjustable_spend`; 은행 잔액이나 구매 가능액이 아니다. |
| 거래처 baseline 변화 | `vw_merchant_monthly_baseline` | `GET /api/v1/analytics/merchant-spend` |
| 반복 거래처 월별 지출 | `vw_recurring_merchant_monthly` | `GET /api/v1/read/monthly-flow` |
| 분류 품질 개선 대상 | `/read/data-status.data.classification`, `/metrics/spend-cube?adjustability=undecided` | 작업대에서 사람이 정한다. |
| 거래 한 건의 지급 형태·조정 가능성과 그 근거 | `GET /api/v1/nature/transactions/{id}` 또는 `vw_transaction_nature` | `GET /api/v1/nature/recurring-commitments`(정기 지급 묶음과 주기·금액 고정/변동·종료), `GET /api/v1/nature/category-defaults`. 모두 `X-API-Key` 필요. 에이전트는 쓰기 API를 쓰지 않는다. |
| 약정 지급·수시·미정 월 합계 | `GET /api/v1/metrics/monthly-flow` 또는 `vw_monthly_flow_summary` | `GET /api/v1/metrics/spend-cube`(`group_by=payment_form,adjustability` 등) |
| 자산/부채 snapshot 표준값 | `vw_asset_snapshot_canonical` | `GET /api/v1/analytics/net-worth-breakdown`, `GET /api/v1/analytics/liquidity-health` |
| 유동성/부채 health | `GET /api/v1/analytics/liquidity-health` | `GET /api/v1/analytics/net-worth-breakdown`. 기본 호출은 closed-month spend/income을 산출하고 source metadata를 함께 반환한다. health라는 이름은 계산 묶음 이름이며 최종 상태 판정이 아니다. |
| schema 탐색 | `GET /api/v1/schema` | 이 문서와 backend reference |

권장 조회 순서:

1. `GET /api/v1/schema`로 사용 가능한 view/endpoint를 확인한다.
2. 질문별로 질문에 맞는 작은 읽기 표면로 결론을 먼저 내려도 되는지 판단한다.
3. 부족하면 readonly DB의 canonical view를 조회한다.
4. raw `transactions`는 삭제/병합/수정 이력 같은 감사성 목적으로만 추가 조회한다.

## `GET /api/v1/read/month-projection`

소유자 승인으로 2026-11-17에 큰 대시보드 GET을 제거했다. 전용 읽기 응답의 **`data`가 예전 `month_projection`과 같은 객체**다. `X-API-Key`, 선택 인자 `reference_date=YYYY-MM-DD`, 공통 읽기 봉투와 422 `detail` 배열을 쓴다. 단일 `get_monthly_projection` 서비스가 계산하며 거래·설정·연결을 저장하지 않는다.

봉투 `as_of`는 전체 거래·종류별 스냅샷 기준일이다. 전망 기준일은 `data.as_of_date`, 전망 근거 범위는 `data.coverage`다. 인자 생략 시 거래 기준일(같은 달의 더 늦은 성공 업로드일 포함), 명시하면 요청 날짜를 쓴다. `status`와 `completeness`는 별도로 읽는다. 일부 구성 요소가 빠졌는데 값이 있으면 부분 합계다. 정확도는 기존 `/canonical-views/month-projection/accuracy`에서 그대로 읽는다.

제거된 7개 경로와 필드별 이행은 [최종 이전 안내](read-surface-migration.md)에 있다. 가져오기·쓰기·`/schema`, DB 뷰·컬럼은 그대로다. `/analytics/liquidity-health`는 제거하지 않고 비상금 개월 수 후속 경로로 폐기 예고했다.

### `month_projection`: 관측값과 전망 분리

| 필드 | 의미/계산 |
|---|---|
| `period`, `as_of_date`, `observed_through` | 기준월, 기준일, 기준일까지의 최종 관측일. |
| `as_of_basis` | 기준일을 정한 방법(`T064` R11). `requested_date`(요청의 `reference_date`), `transaction_as_of`(요청 없이 거래 기준일을 씀. 같은 달 안에서 더 늦은 업로드 날짜가 있으면 그 날), `today_no_data`(거래 없음). 예전에는 요청이 없으면 오늘이었다. |
| `remaining_period_start` | 남은 기간 가정이 시작하는 날. 이번 달의 마지막 관측 거래일과 기준일 이하 최신 업로드 날짜 중 늦은 날의 다음 날이다. 한 달이 다 관측됐으면 null. |
| `observed_income` | 기준월에 실제 관측된 수입 전체. |
| `expected_remaining_income` | 급여 출처별 예상에서 실제 수령을 반영한 잔여 수입. |
| `projected_month_income` | `observed_income + expected_remaining_income`. |
| `observed_net_expense` | 기준월 지출의 `-amount` 합. 양수 지출 행인 환급/취소는 차감한다. |
| `expected_remaining_expense` | 대출·할부·반복·잔여 지출 모두 추정 가능할 때의 합. 불명확하거나 관측이 오래됐으면 null. |
| `known_expected_remaining_expense` | 불명확한 항목이 있어도 확인 가능한 각 컴포넌트 부분합. |
| `projected_month_expense` | `observed_net_expense + expected_remaining_expense`; 불명확하면 null. |
| `observed_net_cashflow` | `observed_income - observed_net_expense`. |
| `projected_month_end_net` | `projected_month_income - projected_month_expense`; 불명확하면 null. 월간 순수입 시나리오이며 월말 은행 잔액이 아니다. |
| `net_after_known_remaining_expense` | 예상수입 - 관측순지출 - 알려진 잔여지출. 미확정 지출이 빠진 부분 계산이며 월말 전망/사용 가능 금액이 아니다. |
| `income_sources[]` | 출처 key/거래처, 예상·관측·잔여 금액, `expected_day`와 예상일/범위, 상태, confidence, 관측/제외 월, 매칭 거래 ids, 이유. `cycle_anchor`(`calendar_month|month_end|month_start`)와 `cycle_reassigned_transaction_ids`는 월 경계 입금을 가까운 지급 주기로 배정한 결과다(`T064` R7). 근거 월·관측액은 지급 주기 단위다. |
| `expense_components[]` | `kind=loan|installment|recurring|variable`, nullable `expected_remaining`, `known_expected_remaining`, 기준·missing reasons·confidence·warnings. 반복 지출은 등록된 정기 지급 묶음별 `sources`도 제공한다. 알려진 부분합에도 낮은 신뢰도의 추정이 포함되며 확정 청구액이 아니다. `link_unconfirmed_count`/`link_unconfirmed_amount`(대출·할부: 사람이 등록한 대출 거래처 규칙·할부 계획 규칙으로 이번 달 상환으로 본 미연결 결제), `not_in_expense_commitments[]`(대출: 장부에 지출 줄이 없어 지출 가정에 더하지 않은 대출과 `reason_code`=`no_expense_line_in_recent_month|no_loan_account`), `twelve_month_window`·`annual_items[]`(변동: 12개월 창과 연간성 카테고리)가 붙는다. |
| `completeness` | 월말 값(`projected_month_end_net`)이 알려진 구성 요소를 모두 반영했는지: `all_known_components`, `known_components_only`(빠진 것이 있음), `not_projected`(월말 값 없음). `full_projection_available`이 `false`인데 월말 값이 있으면 그 값은 일부 구성 요소만의 합이고, `amount_scope`(`all_known_components`, `known_components`, `none`)가 값이 덮는 범위를 준다. `left_out[]`에 빠진 것과 이유가 있다: 남은 금액을 0으로 둔 수입 출처(`income_source_uncertain`, 규칙으로 자동 중단된 `income_source_stopped_by_rule`), 지출 가정에 넣지 않은 대출(`no_expense_line_in_recent_month`, `no_loan_account`), 추정하지 못한 지출 구성 요소(`component_not_estimated`). 합계 숫자만 읽고 전체 전망으로 받아들이지 않는다. |
| `expense_components[kind=loan].sources[]` | 지출 가정에 넣은 대출마다 한 행: 쓴 월상환액(`expected_monthly_amount`, 출처 `recorded_monthly_payment_source`), 이번 달 관측 상환(`observed_payment_amount`, `observed_net_expense`), 남은 금액(`expected_remaining`), 찾은 방법(`match_method`: `loan_link`, `loan_merchant_rule_unconfirmed`, 둘 다, `no_repayment_this_month`), `loan_account_id`. |
| `expense_components[].sources[]` | 정기 지급 묶음(`commitment_id`, `cycle`, `end_date`)별 월 기준액, 실제 총결제액·환급·순지출, 잔여 예상액, 기준초과 결제액, `expected|observed|review` 상태, confidence, 근거·사용/제외 월·warnings. |
| `remaining_expense_adjustability` | 알려진 남은 지출 가정을 근거 줄의 조정 가능성 금액 비율로 나눈 값(`T064` R12): 보호·조정 가능·미정 금액, 합계(= `known_expected_remaining_expense`), 미정 비중(%). 미정은 보호나 조정 가능으로 추정하지 않는다. |
| `coverage`, `included_periods`, `excluded_periods` | 최근 6개 마감월의 관측밀도·누락/제외와 업로드 기준일. |
| `confidence`, `warnings`, `missing_reasons`, `limitations` | 낮은 신뢰도로 추정 가능한 사유와 실제 산출 불가 사유를 구분한다. null은 0이 아니다. |

- 급여 카테고리/정규화된 지급처를 기준으로 최근 6개월 중 충분히 관측된 최소 3개월의 안정적인 중앙값을 학습한다. 월은 달력 월이 아니라 지급 주기다: 과거 입금이 대부분 월말 쪽이면 다음 달 1–4일 입금은 앞 주기, 대부분 월초 쪽이면 전달 마지막 5일 입금은 다음 주기로 센다(R7). 사람이 정기 수입을 지정하는 축은 아직 없어 급여 단어 기준은 그대로이며, 수입 예상 설정에 등록한 입금처는 카테고리와 상관없이 예상한다(R8 일부). 자동 추천은 없다. 보너스·보험금·환급·중고판매·소액 정산은 자동 정기수입에서 제외하지만 관측 수입은 보존한다. 예상일은 과거 입금일/월말 패턴을 사용한다.
- 이번 달 기존 급여 출처가 아직 입금되지 않았는데, 창 안에 이전 입금이 없고 설정에도 없는 새 입금처의 급여 분류 입금(기존 예상액의 10% 이상)이 들어오면 입금처 이름이 바뀐 같은 급여일 수 있어 기존 출처를 `uncertain`, 잔여 0으로 두고 확인 필요 사유를 단다. 두 금액을 함께 더하지 않는다. 새 입금처가 별도 수입이면 수입 예상 설정에 등록하면 된다.
- `expected|received|partial|late|stopped|uncertain`을 구분한다. 과거 분할 입금 횟수에 미달하거나 사용자 기대값보다 덜 들어오면 차액만 유지한다. 그 외에는 실제 수령이 예상의 80% 이상이면 예상수입을 다시 더하지 않는다. 지연은 예상일 뒤까지 실제 관측된 경우에만 표시한다. 사용자 예상액/입금일/중단 설정이 자동 학습보다 우선한다.
- `expected_day=31`은 월말 패턴이며 `expected_date`는 해당 월 일수로 조정한 날짜다. 수동 기대값으로 복사할 때 2월 28일 같은 개별 날짜 대신 `expected_day`를 유지해야 다른 달에도 월말이 보존된다. 기대일 미확정이면 null이다.
- 잔여 지출은 월 흐름표와 같은 줄(`vw_metric_flow_lines`)과 약정 구분에서 읽는다(`T064` R6). 대출 연결 → 할부 연결 → 사람이 등록한 대출 거래처 규칙 → 할부 계획 규칙 일치 → 등록된 정기 지급 묶음 → 사람이 할부로 표시한 미연결 결제 → 나머지 변동 순서로 한 줄을 한 곳에만 넣는다. 대출은 최근 충분히 관측된 마감월이나 이번 달 흐름표에 그 대출의 지출 줄(연결 또는 규칙)이 있을 때만 더하고, 없으면 `not_in_expense_commitments`에 따로 보인다(R1: 이체 기록·장부 밖 계좌·미연결이면 이미 변동 기준선에 있거나 지출이 아니다). 끝난 정기 지급 묶음의 이력은 변동 기준선으로 옮기지 않고, 묶음의 종료일 뒤 결제는 가정하지 않는다(R5). 연 주기로 등록된 묶음은 작년 같은 달에 낸 금액을 그 달에만 더한다. 12개월 창(직전 12개 마감월이 모두 자료가 있고 자료 시작·기준 구간 시작일 뒤)을 쓸 수 있으면 12개월 중 1–2개월에만 지출이 있는 카테고리를 6개월 중앙값에서 빼고 작년 같은 달의 남은 날짜 금액을 더한다(R4, `annual_items`). 변동 지출의 대표값은 여전히 중앙값이다.
- 이미 관측된 납부액을 차감하고, 지난 미연결 할부를 미래 채무로 더하지 않는다. 할부의 이번 달 회차는 그 계획에 연결된 거래 중 날짜가 이번 달인 것으로 찾으며, 연결 회차 번호가 계산과 다르면 할부 구성요소 `warnings`만 남기고 예정액을 다시 더하지 않는다. 반복 근거가 없는 정기 지급 묶음은 더하지 않으며 변동 잔여일 패턴으로도 옮기지 않는다. 이번 달 관측이 있고 매월 주기로 등록된 묶음은 짧거나 불연속적인 이력도 낮은 신뢰도로 추정하고 근거를 표시한다. 직전 달 전체 관측이 부족하면 마지막 충분 관측월까지의 안정 이력을 낮은 신뢰도로 유지하며 결제 중단으로 단정하지 않는다. 환급만 있고 결제 근거가 전혀 없으면 미확정으로 남긴다.
- 반복 지출은 환급을 빼기 전 총결제액으로 기준을 학습한다. 잔여액은 과거 동일 잔여 날짜 총결제액 중앙값과 `월 기준액 - 이번 달 총결제액` 중 작은 값이며 0 미만이 되지 않는다. 과거 31일은 현재 월말로 보정한다. 환급은 실제 순지출에만 반영하고 재청구를 가정하지 않는다. 기준초과 결제는 실제 지출에만 포함하며 일회성이라고 단정하지 않는다. 과거 근거 없이 이번 달 결제만 있으면 추가 예상 0인 낮은 신뢰도 시나리오임을 밝힌다.
- 잔여일 추정은 오늘이 아니라 `remaining_period_start`(이번 달 마지막 관측 거래일과 기준일 이하 최신 업로드 날짜 중 늦은 날의 다음 날)부터의 과거 동일 일자 구간을 사용한다. 업로드가 덮은 거래 없는 날은 관측된 날로 본다. 최종 거래가 기준일보다 7일 초과 오래됐거나 일부 지출에 실제로 추정 근거가 없으면 완전한 월말 전망은 null이다. 반복 지출의 경고만 있는 경우 숫자를 유지하고 신뢰도를 낮춘다. 알려진 부분합이 있어도 누락 비용과 새 지출은 보장되지 않는다.
- `GET/PATCH /settings/income-expectations`는 인증이 필요하다. `{items: [...]}` 전체 목록을 교체하며, source key는 `income:` + casefold/공백 정규화 merchant다. 각 항목은 예상액·1–31일 입금일·중단 여부를 저장한다. `items:[]`는 모든 수동 기대값을 해제한다. GET/전망 계산은 학습 결과를 저장하지 않는다.

- 정확도는 신뢰도 등급만으로 보지 않는다. `GET /api/v1/canonical-views/month-projection/accuracy`(인증, 읽기 전용)가 직전 최대 3개 마감월의 5·10·15·20·25일을 같은 전망 코드로 다시 돌려 as-of 일 구간(`day_01_10|day_11_20|day_21_31`)별 순현금흐름 오차 중앙값(원, 부호 = 전망 − 실제)과 점·보류 점 수를 준다. 분류·연결·설정은 현재 값으로 재생한 값이다. 전망을 15번 다시 계산하므로 대시보드 응답에는 싣지 않는다(`T064` R12).

정확한 임계값·입력 제한·공식은 [상세 API 문서](../backend-api-and-metrics-reference.md#monthly-projection-month_projection)를 따른다. 이 값으로 지출 가능 여부를 단정하지 않는다.

## Canonical DB Views

### `vw_transactions_effective`

거래 분석의 row-level 표준 surface다. 에이전트가 거래 SQL을 직접 작성해야 할 때는 raw `transactions`보다 이 view를 우선한다.

| 컬럼 | 의미/계산 |
|---|---|
| `id`, `date`, `time`, `type` | 원본 거래 식별자와 거래 시점, 거래 타입. |
| `category_major`, `category_minor` | BankSalad import 원본 카테고리. |
| `category_major_user`, `category_minor_user` | 사용자가 수정한 카테고리. 없으면 `null`. |
| `effective_category_major` | `coalesce(category_major_user, category_major)`. |
| `effective_category_minor` | `coalesce(category_minor_user, category_minor)`. |
| `description` | 원본 거래 설명. BankSalad import 원문이며 자동분류 대출 규칙에서 `match_field='description'`을 선택하면 이 값을 exact match한다. |
| `merchant` | 분석용 거래처명. 기본은 `description`에서 시작하고 사용자가 수정하거나 alias rule로 정규화할 수 있다. alias rule은 원본 `description`을 매칭해 이 값을 갱신하며, 이미 `merchant != description`인 row는 보존한다. 대출 규칙에서 `match_field='merchant'`를 선택하면 이 값을 exact match한다. |
| `amount`, `currency`, `payment_method` | 원본 금액, 통화, 결제수단. |
| `cost_kind` | `fixed`, `variable`, 또는 `null`. 고정비/변동비 분류다. |
| `fixed_cost_necessity` | `essential`, `discretionary`, 또는 `null`. 고정비 전용 legacy/호환 필드다. |
| `spend_necessity` | `essential`, `discretionary`, 또는 `null`. 고정/변동과 무관한 필수/재량 축이다. 저장된 값을 그대로 돌려주며, 재량 지출 계산은 이 값이 아니라 조정 가능성(`vw_transaction_nature.adjustability`)을 읽는다. 생성/규칙 적용은 variable 미지정을 `discretionary`로 정규화하지만, PATCH는 생략을 보존하고 명시적 null을 해제 값으로 취급한다. |
| `cost_classification_source` | `manual`, `auto`, 또는 `null`. 비용 성격 분류 출처다. |
| `recurring_payment_kind` | `installment`, `monthly_recurring`, `not_recurring`, 또는 `null`. 반복결제 수동/규칙 분류 결과다. |
| `memo` | 사용자 메모. |
| `loan_account_id` | 연결된 안정 대출 계좌 id. 없으면 일반 지출로 본다. |
| `loan_lender`, `loan_product_name`, `loan_display_name`, `loan_kind` | 연결된 대출 계좌의 기관, 상품, 표시명, 대출 성격. |
| `loan_start_date`, `loan_maturity_date` | 최신 대출 snapshot에서 가져온 신규일/만기일. |
| `loan_repayment_type` | `principal`, `interest`, `mixed`, `unknown` 중 하나. 원금/이자/원리금/미정 상환 유형. |
| `loan_link_memo` | 대출 연결 메모. |
| `is_deleted`, `merged_into_id` | canonical view에서는 기본 제외된 row의 상태 필드다. 이 view 결과에서는 보통 `false`/`null`이다. |
| `is_edited` | 카테고리 사용자 수정, `merchant != description`, memo 존재, 비용/반복 분류 등 사용자가 손댄 의미가 있으면 true다. |
| `source` | `import` 또는 `manual`. |
| `source_lifecycle_status` | import row의 reconciliation 상태 (`active`, `missing_from_latest_export`, `source_changed`, `superseded`, `duplicate_candidate`, `ambiguous`). `duplicate_candidate`/`ambiguous`는 preview/review-required reserve 상태로 해석해야 한다. |
| `source_row_hash` | 업로드 source signature hash. 동일 row의 재업로드 관측 연결에 사용. |
| `first_seen_import_id`, `last_seen_import_id` | 최초/최종 확인된 업로드 로그 id. |
| `source_first_seen_at`, `source_last_seen_at` | 최초/최종 확인 시각. |
| `superseded_by_transaction_id` | 대체/버전 이동 시 신규 transaction id를 가리킬 수 있는 역추적 필드. |
| `created_at`, `updated_at` | DB row 생성/수정 시각. |

### 업로드 reconciliation 해석

- raw 거래 행과 lifecycle 상태를 분리해서 본다.
  - `description`, `amount`, `payment_method`는 source signature 계산의 입력값이다.
  - `source_lifecycle_status`는 최신 윈도우에서의 생명주기 상태다.
- 상태 의미:
  - `active`: 최신 업로드 윈도우에서 유효한 import row.
  - `missing_from_latest_export`: 최신 윈도우에서 사라졌지만 hard delete되지 않고 보존된 상태.
  - `source_changed`: fallback 매칭으로 원천 필드 drift가 감지된 경우.
  - `superseded`: 최신 row로 대체되거나 버전 체인이 이어진 row.
  - `duplicate_candidate`: hash 중복/동일 후보 중복 가능성으로 review가 필요한 reserve 상태.
  - `ambiguous`: 후보 매칭이 모호하여 review-required인 reserve 상태.
- preview/apply 해석:
  - `POST /api/v1/upload/preview`는 DB write 없이 `safe_changes`와 `review_required_changes`를 반환한다.
  - `preserved_user_fields`는 재업로드 시 `category_*_user`, `memo`, merchant override, `is_deleted`, `merged_into_id`가 보존된다는 신호다.
  - review-required 항목(`possible_replacement`, `possible_duplicate`, `ambiguous`)은 승인된 적용 selection 없이 변경되지 않는다.
  - `POST /api/v1/upload/apply`는 `confirmation=true` 기반으로 선택된 safe change를 반영하고, 명시 승인된 `possible_replacement`만 supersession으로 적용할 수 있다. `possible_duplicate`/`ambiguous`는 적용하지 않는다.
- 감사/추적:
  - 적용 결과는 업로드 로그의 `reconciliation_mode`/`reconciliation_audit`에서 판단 근거를 추적할 수 있다.
  - 에이전트는 raw table/직접 DB DML이 아닌, `schema`, API, 업로드 로그를 이용해 해석해야 한다.
- raw signed 보존:
  - raw signed `amount`/`type` 자체를 뒤집는 rewrite가 기본 동작이 아니며, `Transaction`의 사용자 관리 필드는 먼저 안전성 룰에서 보존된다.

주의: 삭제/병합 row까지 봐야 하는 감사성 작업은 raw table이나 transaction API include flag를 사용한다.

### `vw_monthly_cashflow`

월별 현금흐름 foundation이다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `income_total` | `type='수입'`의 `amount` 합계. |
| `expense_total` | `type='지출'`의 `-amount` 합계(게시월 기준, 환불 차감). 대출 상환도 포함한 총 지출이며 `vw_monthly_flow_summary.total_outflow`와 같다. |
| `non_loan_expense_total` | `type='지출'`이고 `loan_account_id is null`인 일반 지출 합계. |
| `transfer_activity_total` | `type='이체'`의 `abs(amount)` 합계. 순증감이 아니라 활동량이다. |
| `loan_repayment_total` | `type='지출'`이고 대출 계좌에 연결된 거래의 `-amount` 합계. |
| `fixed_total` | 일반 지출 중 `cost_kind='fixed'`인 금액 합계. 대출 상환 제외. |
| `variable_total` | 일반 지출 중 `cost_kind='variable'`인 금액 합계. 대출 상환 제외. |
| `essential_fixed_total` | 일반 고정비 중 `fixed_cost_necessity='essential'`. |
| `discretionary_fixed_total` | 일반 고정비 중 `fixed_cost_necessity='discretionary'`. |
| `essential_variable_total` | 일반 변동비 중 `spend_necessity='essential'`. 식비/교통처럼 변동하지만 필수인 지출을 분리한다. |
| `discretionary_variable_total` | 일반 변동비 중 `spend_necessity='discretionary'`. |
| `required_spend_total` | `essential_fixed_total + essential_variable_total + loan_repayment_total`. |
| `discretionary_spend_total` | `discretionary_fixed_total + discretionary_variable_total`. |
| `unclassified_expense_total` | 일반 지출 중 `cost_kind is null`인 금액 합계. |
| `net_cashflow` | `income_total - expense_total`. 대출 상환은 expense에 이미 포함된다. |
| `savings_rate` | `net_cashflow / income_total`. 수입이 0이면 `null`. DB 뷰에서도 진행월은 null이다(T054/T057). 대시보드 GET은 제거됐다. |

### Raw signed vs settlement-netted surfaces

- Raw signed rows:
  - `GET /api/v1/transactions`와 `vw_transactions_effective`가 `amount` 원본 부호를 그대로 제공합니다.
  - 환불/취소는 raw positive `type='지출'` 행으로 유지되어 raw signed 월별 expense에 그대로 반영됩니다.
- 월 집계 surfaces (`/api/v1/analytics/monthly-cashflow`, `category-mom`, `fixed-cost-*`, `merchant-spend`, `payment-method-patterns`, `spending-anomalies`, `/api/v1/metrics/*`, 대시보드 view):
  - 환불은 게시월에서 차감한다. 확정 settlement가 있어도 월 합계는 바뀌지 않고, 배분된 부분의 분류만 원거래를 따른다.
- 구매 단위 surfaces (`recurring-payments`, `discretionary-velocity`, `spending-review-candidates`): `purchase_net.v1`로 확정 배분액을 원거래에서 차감하고, 미배분 환불 잔액은 환불 행에 남긴다.

| 상태 | 분석 의미 | 상태별 규칙 |
|---|---|---|
| `auto_confirmed` | 확정 | 배분액만큼 분류를 원거래로 귀속(월 집계) / 원거래에서 차감(구매 단위) |
| `user_confirmed` | 확정 | 위와 같음 |
| `review_required` | 미확정 | 배분 없음 |
| `rejected` | 미확정 | 배분 없음 |

- `GET /api/v1/analytics/*`는 read-only라서 조회 시 settlement write나 reconcile 작업을 수행하지 않는다.
- 구매 게이트/리뷰 후보는 같은 settlement metadata를 공유해, confirmed partial refund를 분석 파이프라인에서 이중 계산하지 않는다.

### `vw_true_spendable_monthly`

관측 월수입에서 분류된 지출을 차감한 계산 surface다. 실제 은행 잔액이나 지출 허용 한도가 아니다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `income_total` | 관측된 월 수입. |
| `loan_repayment_total` | 대출 상환 총액. |
| `fixed_commitment_total` | 일반 고정비 총액. 현재는 `vw_monthly_cashflow.fixed_total`. |
| `variable_total` | 일반 변동비 총액. |
| `required_variable_total` | 변동비 중 `spend_necessity='essential'`. |
| `discretionary_variable_total` | 변동비 중 `spend_necessity='discretionary'`. |
| `spendable_before_variable_spend` | `income_total - loan_repayment_total - fixed_commitment_total`. |
| `remaining_after_variable_spend` | `income_total - loan_repayment_total - fixed_commitment_total - variable_total`. |

DB view는 관측값이다. 진행월 수입 가정은 `/read/month-projection.data`에만 있다. 옛 대시보드 `estimated_*` 필드는 제거됐다.

### `vw_loan_repayment_monthly`

대출 상환 분석 surface다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `loan_account_id` | 안정 대출 계좌 id. |
| `loan_display_name` | 사용자 표시명이 있으면 그 값, 없으면 기관+상품 기반 표시명. |
| `loan_lender`, `loan_product_name`, `loan_kind`, `loan_maturity_date` | 대출 계좌/최신 snapshot metadata. |
| `loan_repayment_type` | `principal`, `interest`, `mixed`, `unknown`. |
| `repayment_total` | 연결된 지출 거래의 `-amount` 합계. |
| `transaction_count` | 해당 group의 거래 건수. |

### `vw_fixed_cost_monthly_summary`

월별 고정비/변동비 집계 surface다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `expense_total` | 일반 지출 금액 합계. 대출 연결 상환 제외. |
| `fixed_total` | `cost_kind='fixed'` 합계. |
| `variable_total` | `cost_kind='variable'` 합계. |
| `essential_fixed_total` | `fixed`이면서 `essential`인 금액. |
| `discretionary_fixed_total` | `fixed`이면서 `discretionary`인 금액. |
| `essential_variable_total` | `variable`이면서 `spend_necessity='essential'`인 금액. 사용자가 명시한 필수 변동비만 포함한다. |
| `discretionary_variable_total` | `variable`이면서 `spend_necessity='discretionary'`인 금액. PATCH로 비운 필요성 값은 이 합계에 임의로 포함하지 않는다. |
| `required_spend_total` | `essential_fixed_total + essential_variable_total`. 이 view는 대출 상환을 일반 지출에서 제외하므로 대출 부담은 `vw_loan_repayment_monthly` 또는 `vw_monthly_cashflow.loan_repayment_total`과 따로 본다. |
| `discretionary_spend_total` | `discretionary_fixed_total + discretionary_variable_total`. |
| `unclassified_total` | `cost_kind is null`인 일반 지출 금액. |
| `unclassified_count` | `cost_kind is null`인 일반 지출 건수. |

### `vw_asset_snapshot_canonical`

snapshot 단위 자산/부채/유동성/월상환액 표준 surface다. My Ledge가 sparse snapshot 원본과 사용자 보강 metadata를 합쳐 계산 근거를 제공하고, 에이전트는 confidence와 assumptions를 보고 최종 해석을 붙인다.

| 컬럼 | 의미/계산 |
|---|---|
| `snapshot_date` | snapshot 기준일. 업로드 시 지정한 날짜다. |
| `asset_total` | 음수 asset row를 제외한 자산 총액. |
| `negative_asset_excluded_total` | asset-side 음수 row 제외분. `asset_total`, `net_worth`, `cash_equivalent_total`에는 포함하지 않는다. |
| `liability_total` | 부채 row 총액. |
| `net_worth` | `asset_total - liability_total`. |
| `cash_equivalent_total` | 즉시 현금성으로 확인된 자산 합계. `is_cash_equivalent=true` 또는 미지정 상태의 `liquidity_tier='immediate'`를 포함한다. 휴리스틱은 `자유입출금`, `전자금융`, `통장`을 포함하되 `청약`, `저금통`, `보험`, `연금`, `부동산` 후보와 음수 asset row는 제외한다. |
| `near_liquid_total` | `liquidity_tier='near_liquid'` 자산 합계. 기본 비상금 계산에는 바로 더하지 않는다. |
| `illiquid_total` | `liquidity_tier='illiquid'` 자산 합계. |
| `loan_balance_total` | 최신 대출 snapshot 기준 잔액 합계. |
| `monthly_debt_payment_total` | `loans.monthly_payment` 합계. `monthly_payment_source='manual'`이면 사용자 확정값이고, `estimated_from_linked_transactions`이면 My Ledge가 완료된 월의 대출 연결 거래로 보강한 추정값이다. 마이너스 통장(`loan_kind='overdraft'`)은 최근 완료월 평균, 그 외 대출은 완료월 중앙값을 사용한다. |
| `asset_row_count`, `loan_row_count` | snapshot 원천 row 수. 데이터 완성도 확인용이다. |

`vw_asset_snapshot_canonical`은 자산 상태를 계산한 표준값이지 "건강/위험" 최종 label이 아니다. 비상금 개월 수는 `/metrics/net-worth/emergency-fund`의 산식·미정 비중·기준일과 함께 해석한다.

### `vw_merchant_monthly_baseline`

거래처별 월 지출 baseline surface다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `merchant` | canonical 거래처명. `merchant_alias_rules`를 적용하면 정규화된 값이 들어간다. |
| `effective_category_major`, `effective_category_minor` | 사용자 수정 우선 카테고리. |
| `monthly_spend` | 일반 지출의 `-amount` 월합계. 대출 연결 상환 제외. |
| `transaction_count` | 해당 월/거래처/category group 거래 건수. |
| `baseline_month_count` | 같은 거래처/category group의 직전 active month 개수. 최대 3. |
| `trailing_3_month_avg` | 직전 3개 active month의 `monthly_spend` 평균. 기준 부족 시 `null`. |
| `baseline_delta` | `monthly_spend - trailing_3_month_avg`. |
| `baseline_delta_pct` | `baseline_delta / trailing_3_month_avg`. baseline이 없거나 0이면 `null`. |

주의: 없는 달을 0으로 채우는 rolling calendar baseline이 아니라, 해당 거래처/category가 발생한 active month 기준 window다.

### `vw_recurring_merchant_monthly`

저장된 반복결제 분류 결과를 월별로 읽는 surface다. 반복 후보 탐지 자체는 `/analytics/recurring-payments`가 담당하고, 이 view는 이미 저장된 `recurring_payment_kind`를 기준으로 한다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `merchant` | 정규화 규칙이 적용된 canonical 거래처명. |
| `recurring_payment_kind` | `installment`, `monthly_recurring`, `not_recurring`. |
| `monthly_spend` | 해당 월/거래처/반복분류의 일반 지출 합계. 대출 연결 상환 제외. |
| `transaction_count` | 해당 group 거래 건수. |
| `first_date`, `last_date` | group 내 최초/최종 거래일. |

### `vw_unclassified_work_queue`

분류 품질 개선이 필요한 거래 queue다. “분석 결과”라기보다 “다음에 정리하면 좋은 데이터 품질 작업”으로 해석한다. T056부터 조정 가능성이 `undecided`(미정)인 지출과 대출 연결 검토 대상만 올린다. 컬럼 구성은 그대로다.

| 컬럼 | 의미/계산 |
|---|---|
| `transaction_id`, `date`, `type`, `merchant`, `effective_category_*`, `amount` | 후보 거래 기본 정보. 유효 지출만이며 대체(superseded)·대출 연결·할부 연결 거래는 없다. 수입·이체는 올라오지 않는다. |
| `amount_abs` | `abs(amount)`. 우선순위 점수에 사용한다. |
| `needs_spend_necessity` | 조정 가능성이 미정. 거래·약정·카테고리 기본값 어디에도 값이 없다. |
| `needs_cost_kind` | 미정이면서 기존 `cost_kind`도 비어 있음. |
| `needs_fixed_cost_necessity` | 미정이면서 기존 `cost_kind='fixed'`. |
| `needs_recurring_payment_kind` | 항상 `false`. 거래 단위 반복 여부는 더 묻지 않는다(주기는 정기 지급 묶음의 속성). |
| `needs_loan_link_review` | 금융/대출/상환 키워드 또는 금융 카테고리인데 대출 연결이 없는 지출. |
| `merchant_expense_count` | 같은 거래처의 queue 기반 지출 건수. |
| `priority_score` | `min(amount_abs, 1000000)`에 loan/cost/fixed/necessity/repeat 보너스를 더한 정렬 점수. |
| `priority_reason` | 최우선 사유. `loan_link_review`, `missing_cost_kind`, `missing_fixed_necessity`, `missing_spend_necessity`, `review`. |

### `vw_transaction_nature` (T056)

유효 거래 한 건마다 두 축과 근거를 준다. 월 흐름표·지출 큐브는 이 view를 거래(환불 배분분은 원거래) 기준으로 읽는다.

| 컬럼 | 의미 |
|---|---|
| `payment_form` | `committed`, `ad_hoc`, `not_applicable`(수입·이체 등). |
| `commitment_kind` | `loan`, `installment`, `recurring`, 또는 `null`. |
| `recurring_commitment_id`, `commitment_match` | 속한 정기 지급 묶음과 연결 방식(`rule`: 거래처·카테고리·기간 규칙, `explicit`: 이행·재가져오기에서 고정된 소속). |
| `adjustability`, `adjustability_source` | 해석된 조정 가능성과 그 값을 준 단계(`fixed_loan`, `fixed_installment`, `transaction`, `commitment`, `category_default`, `none`, `not_applicable`). |
| `transaction_adjustability`, `commitment_adjustability`, `category_default_adjustability` | 단계별로 사람이 정한 값. |
| `installment_link_unconfirmed` | 기존에 할부로 표시됐지만 할부 계획에 연결되지 않은 지출(연결 미확인). 수시로 집계된다. |
| `necessity_conflict` | 기존 고정비 행의 두 필요성 값이 서로 달라 미정으로 둔 행. |

### `vw_category_monthly_spend`

월별 카테고리 지출 aggregate schema다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `category_major`, `category_minor` | effective category 기준 category. |
| `amount` | 지출 정규화 금액 합계. |

현재 일부 analytics code는 이 DB view를 직접 조회하지 않고 `vw_transactions_effective`와 같은 semantics로 Python에서 계산한다. 에이전트는 schema reference로 사용하되, live API 결과가 필요하면 analytics endpoint도 확인한다.

## 재무상태와 순자산 대조 (T061)

질문 Q5("남은 돈은 어디로 갔고 순자산은 왜 변했나")에 답하는 읽기 표면이다. 모두 `X-API-Key`가 필요하다.

| 표면 | 쓰임 |
|---|---|
| `GET /api/v1/metrics/net-worth/intervals` | 종류별 스냅샷 날짜 목록(자산·대출·투자·보험·프로필, 합치지 않음)과 이어지는 자산 스냅샷 구간마다 상태, 순자산 변화, 설명되지 않은 차이, 이체 미정 비중. |
| `GET /api/v1/metrics/net-worth/reconciliation?start_date=&end_date=` | 한 구간의 대조. 날짜를 생략하면 최근 두 자산 스냅샷. |
| `GET /api/v1/metrics/net-worth/emergency-fund` | 비상금 개월 수 = 현금성 자산 ÷ 월 보호 지급, 미정 비중과 함께. |
| `GET /api/v1/transfer-purposes/transactions` | 이체와 사람이 정한 목적. 미정 이체를 금액 큰 순으로 찾을 때 쓴다(읽기). |
| `vw_transfer_purpose`, `vw_net_worth_snapshots`, `vw_snapshot_kind_totals` | 같은 값을 읽기 전용 DB에서 볼 때. |

대조식은 `순자산 변화 = 잔여 + 대출 잔액 감소분 + 투자 평가 변동 + 설명되지 않은 차이`이고 응답의 정수 값에서 정확히 맞는다.

| 값 | 의미 |
|---|---|
| `interval.transaction_start_date` … `transaction_end_date` | 스냅샷은 그날 끝의 잔액이다. 구간 거래는 시작 스냅샷 다음 날부터 끝 스냅샷일까지(시작 제외, 끝 포함). 이어진 구간이 같은 날을 두 번 세지 않는다. |
| `items.net_worth_change` | 끝 순자산 − 시작 순자산. 순자산은 `/assets/snapshots`와 같은 정의(음수 자산 행 제외 자산 − 부채). |
| `items.residual` | 구간의 잔여 = 수입 − 총지급(환불 차감, 대출 원리금 포함). 월 흐름표와 같은 식이다. |
| `items.loan_balance_decrease` | 대출 스냅샷 잔액 감소분. 이자·원금을 추정으로 나누지 않는다. 잔여에 들어간 원리금 중 원금이 여기서 되돌아온다. |
| `items.investment_valuation_change` | 투자 평가액 변화 − 순투자 유입. 순투자 유입(`investment_net_transfer_in`)은 사람이 `investment`로 표시한 이체의 부호 반대 합이다. |
| `items.unexplained_difference` | 나머지. 추정 항목으로 채우지 않는다. 기록되지 않은 수수료, 추적하지 않는 계좌로 보낸 돈, 이체로 들어온 새 대출, 저축 이자, 스냅샷 시각 차이 등이 여기에 남는다. 계산할 수 없는 상태에서는 `null`. |
| `transfers.*` | 잔여의 행방. `investment_savings_net`(투자·저축 이체), `internal_move_net`(그 밖의 계좌 간 이동), `undecided_net`, `undecided_share`(미정 이체 금액 ÷ 전체 이체 금액, 절댓값 기준). 이체는 부호대로 더하므로 장부 안의 두 계좌 사이 이동은 두 다리가 0으로 상쇄되어 두 번 세지 않는다. |
| `kinds[]` | 대출·투자 스냅샷. `observed`(두 날짜 모두 있음), `absent`(그 종류 스냅샷이 한 번도 없음, 양 끝 0), `mismatched`(그 종류의 날짜가 구간과 다름, 값 `null`, 가까운 날짜로 맞추지 않음). |
| `status` | `complete`, `incomplete_classification`(목적 미정 이체가 있어 투자 평가 변동이 불완전), `transactions_not_covered`(거래 기록이 구간을 덮지 않음), `snapshot_dates_mismatched`, `no_snapshot_pair`. `status_reasons`가 이유를 모두 적는다. |

이체 목적(`investment`, `savings`, `internal_move`)은 사람이 작업대에서 거래 단위로, 또는 거래처·카테고리 규칙으로 정한다. 시스템은 이름이나 금액으로 목적을 추정하거나 제안하지 않는다. 정해지지 않은 이체는 `undecided`이며 그대로 보인다. 에이전트는 미정 이체를 투자로 가정해 평가 변동을 다시 계산해서 결과로 말하지 않는다. 필요하면 "미정 이체가 투자였다면"처럼 가정을 밝히고 별도로 말한다.

월 흐름표(`/metrics/monthly-flow`)는 기존 값을 그대로 두고 `transfer_rows`(투자·저축 이체 / 그 밖의 계좌 간 이동 / 목적 미정 이체, 합 = `transfer_net`)와 목적별 순액 필드를 더했다. `rows`의 `transfer_undetermined` 줄은 이름이 그대로지만 "이체 전체"를 뜻한다.

비상금 개월 수(`/metrics/net-worth/emergency-fund`)는 최신 자산 스냅샷의 현금성 자산(`vw_asset_snapshot_canonical`과 같은 규칙, 이름 규칙으로만 판단한 금액은 `cash_like_name_rule_total`로 따로)을 최근 마감월(최대 6개, 비교 계약과 같은 기준 구간 규칙) 보호 지급 중앙값으로 나눈 값이다. 조정 가능성 미정 지출은 보호로 가정하지 않으므로 미정 비중이 있으면 개월 수가 실제보다 클 수 있다. 자산 스냅샷 기준일과 거래 기준일은 따로 표시한다. `/analytics/liquidity-health`의 `emergency_fund_months`는 legacy이며 다른 분모를 쓴다.

## Analytics API 값 사전

아래에서 제거된 GET은 이전 값의 설명만 남긴 것이다. 현재 호출은 [이전 안내](read-surface-migration.md)의 후속 경로를 쓴다. 검토 PATCH와 폐기 예고한 liquidity-health는 유지한다.

| Endpoint | 주요 값 | 의미 |
|---|---|---|
| `/analytics/monthly-cashflow` | `income`, `expense`, `transfer`, `net_cashflow`, `savings_rate` | 월별 수입/지출/이체 활동량과 저축률. `transfer`는 `abs(amount)` 활동량이다. `savings_rate`는 마감월에만 내고 진행월은 `null`(T057). |
| `/analytics/category-mom` | `current_amount`, `previous_amount`, `delta_amount`, `delta_pct`, `baseline_amount`, `baseline_change_amount` | `reference_date`, `is_partial_period`, `comparison_basis`로 비교 범위를 밝힌다. 명시적 부분월과 진행월은 이전 달의 같은 날짜 구간과 비교하며(진행월을 전월 전체와 비교하지 않음) 빈 대상 월도 유지한다. `baseline_*`와 `comparison`은 T057 비교 계약(최근 마감월 중앙값) 기준이다. |
| `/analytics/fixed-cost-summary` | `expense_total`, `fixed_total`, `variable_total`, `fixed_ratio`, `essential_fixed_total`, `discretionary_fixed_total`, `essential_variable_total`, `discretionary_variable_total`, `required_spend_total`, `discretionary_spend_total`, `unclassified_total`, `unclassified_count` | 기간 전체의 고정비/변동비/필수/재량/미분류 구조. `necessity_unclassified_total/count`는 cost kind 미분류와 다른 축이며 중복될 수 있다. 환급은 순액에 반영된다. |
| `/analytics/fixed-cost-trend` | monthly fixed/variable/essential/discretionary/unclassified fields | 월별 고정비 구조 추이. |
| `/analytics/merchant-spend` | `merchant`, `amount`, `count`, `avg_amount`, `last_seen_at` | 거래처별 총액, 빈도, 평균 금액, 마지막 거래일. |
| `/analytics/payment-method-patterns` | `payment_method`, `total_amount`, `transaction_count`, `avg_amount`, `pct_of_total` | 결제수단별 소비 비중. |
| `/analytics/income-stability` | `avg`, `stdev`, `coefficient_of_variation`, `is_partial_period`, `assumptions` | 관측된 수입월의 변동성. 누락 월을 0으로 채우거나 완전한 수집으로 가정하지 않는다. backend는 숫자만 제공한다. 안정/불안정 label과 생활 안정성 평가는 에이전트 해석이다. |
| `/analytics/discretionary-velocity` | `period`, `discretionary_spend`, `baseline_monthly_spend`, `velocity_ratio`, `risk_level`, `classification_coverage_ratio`, `assumptions`, `reasons` | 환급을 반영한 순액 지출 속도이며 coverage는 양의 결제 기준이다. 재량 = 조정 가능성 `adjustable`, 분류됨 = `protected` 또는 `adjustable`(`vw_transaction_nature`). `undecided`는 미분류 지출로 남는다. nonpositive baseline이면 ratio는 null이다. `risk_level`은 최종 구매 허용 판단이 아니라 후보 강도와 분류 신뢰도 안내용이다. |
| `/analytics/spending-review-candidates` | `items[]`, `candidate_key`, `candidate_type`, `candidate_types[]`, `risk_level`, `review_status`, `review_memo`, `reviewed_at`, `cooldown_until`, `review_timing`, `candidate_purpose`, `future_friction_suggestion`, `assumptions`, `reasons` | preferred name for post-transaction discretionary review queue. 후보는 지급 형태 수시(대출·할부 연결이나 정기 지급 묶음이 아님)이고 조정 가능성이 `adjustable`인 지출뿐이다(`vw_transaction_nature`). 두 GET 경로는 제거됐고 `/read/review-items`에서 검출기를 재사용한다. Confirmed refunds use net spend. `possible_cancellation`/`cancellation_evidence_transaction_ids`는 미확정 취소 검토 힌트이며 조회로 settlement를 만들지 않는다. |
| `/analytics/recurring-payments` | `interval_type`, `avg_interval_days`, `confidence`, `recurring_payment_kind`, kind counts, `transaction_ids` | 거래처별 순지출/반복분류와 `activity_status`. `activity=active`는 active candidate만 반환하고 historical/irregular/non_positive/not_recurring과 구분한다. `confidence`는 반복 패턴 신호이며 구독 해지/낭비 판단이 아니다. |
| `/installments/forecast` | `items[]`, `monthly_summary[]`, `status` | 할부 원장 기준 회차별 예측. `observed`는 이미 거래가 연결된 회차, `projected`는 미래/현재 미연결 회차, `missed`/`past_unconfirmed_total`은 지난 미연결 회차이며 미납 확정이 아니다. `is_future_obligation`을 구분하고 projected total은 미래 계획용이며 관측 거래와 이중 계산하지 않는다. |
| `/analytics/spending-anomalies` | `amount`, `baseline_avg`, `delta_pct`, `delta_pct_raw`, `delta_pct_display`, `baseline_quality`, `anomaly_mode`, `anomaly_score` | 기준 월과 비교 계약 기준 기간(T057: 자료 있는 최근 마감월 최대 6개의 중앙값, 기준 구간 시작일 적용, 진행월은 같은 경과일)의 category 지출 차이. `baseline_avg`는 이름과 달리 중앙값이다. `direction`은 signed delta의 증가/감소를 구분하고 sparse baseline에서는 raw percent와 표시용 percent를 구분한다. 환급 순감소를 증가로 말하지 않는다. anomaly는 변화 후보이지 문제 지출 확정이 아니다. |
| `/analytics/net-worth-breakdown` | `asset_total`, `liability_total`, `net_worth`, `items[]` | 최신 또는 지정 snapshot의 자산/부채 구성. snapshot/history/compare/health와 공통의 `aggregation_basis` 및 `negative_asset_excluded_total`을 제공한다. |
| `/analytics/liquidity-health` | `cash_equivalent_total`, `emergency_fund_months`, `emergency_fund_target_months`, `target_progress_ratio`, `monthly_debt_payment`, `debt_payment_ratio`, `debt_to_asset_ratio`, `confidence`, `assumptions` | 현금성 자산, 비상금 개월 수, 목표 대비 진행률, 부채 부담 추정. `health`는 계산 묶음 이름이며, 실제 재무 건강/위험 판정은 에이전트 해석이다. `input_as_of_date`, `required_spend_period`, 필수/추가상환 금액, `debt_payment_snapshot_date`를 확인한다. 필수 지출은 조정 가능성 `protected`인 지출이며 대출 연결 상환은 항상 `protected`라 `required_spend_additional_debt_total`은 0이다. `undecided` 지출은 필수로 가정하지 않는다. 선택 snapshot 이후 거래를 섞지 않으며 이미 필수인 상환을 다시 더하지 않는다. 비상금 개월 수는 legacy이고, 이 GET은 폐기 예고했으나 본문은 바뀌지 않았다. 새 값은 `/metrics/net-worth/emergency-fund`. |

## 에이전트 답변 시 주의사항

- 월별 canonical은 관측값, `month_projection`은 전망으로 구분한다. 일부만 알려진 `net_after_known_remaining_expense`를 전체 월말 순수입이나 현금 잔액으로 말하지 않는다.
- 대출 상환은 일반 소비와 분리한다. 같은 금액을 고정비와 대출 부담에 이중으로 더하지 않는다.
- `fixed_cost_necessity`는 고정비 호환 필드다. 필수/재량 분석은 legacy 고정비 요약을 빼면 조정 가능성(`protected`/`adjustable`/`undecided`)을 읽는다. 기존 컬럼과 새 축이 다르면 새 축이 기준이다.
- 생성/규칙의 변동비 기본값과 PATCH의 null 해제를 구분한다. 분류가 비어 있으면 필수/재량 어느 쪽으로도 임의 대입하지 않고 필요성 미분류를 설명한다.
- `merchant`는 alias rule 적용 전에는 같은 실거래처가 여러 표기로 갈라질 수 있다. 거래처 분석 전 `/operations/auto-classification`의 거래처 정규화 규칙 적용 여부를 확인한다. 정규화 규칙은 raw `description`을 기준으로 `merchant`를 채우며, 수동 수정으로 보이는 `merchant != description` row는 덮어쓰지 않는다. 원본 문구 기준으로 대출 상환을 잡아야 하면 `description` 기준 대출 매칭 규칙을 사용한다.
- 자산이동/이체 별도 tracking은 뒤로 미뤘다. 현재는 월별 현금흐름의 `transfer_activity_total`만 보조 값으로 쓴다.
- `not_recurring`은 “반복 아님으로 검토됨”이지 “거래가 사라짐”이 아니다.
- `unclassified_work_queue`는 지출 규모가 큰 미분류 거래를 우선 노출하므로, 전체 오류 목록이 아니라 개선 우선순위다.
- `health`, `anomaly`, `confidence`, `risk_level`, `priority_score`, `true_spendable` 같은 단어를 사용자 조언으로 바로 번역하지 않는다. 먼저 계산 기준과 데이터 품질 신호로 설명한다.
- `risk_level`은 `/analytics/discretionary-velocity`, `/analytics/purchase-gate-candidates`, `/analytics/liquidity-health`에서 후보 강도/분류 신호를 의미하며 최종 위험 판정이 아니다.
- `/installments/forecast`는 현금흐름 관측치가 아니라 계획/예측 레이어다. projected 구간을 현금흐름 합계에 바로 더하면 이중 계산이 발생한다.
- backend가 label을 제공하지 않는 지표에 임의 등급을 붙일 때는 자체 가정임을 밝힌다.

### 연결·수동값을 해석할 때

- 대출 월추정상환은 `monthly_payment_source`와 `monthly_payment_missing_reason`, observation months/window/minimum을 함께 읽는다. Manual null은 자동추정을 막는 수동 미확정값이고 0과 다르다. 최신 snapshot의 `*_mode='automatic'`으로 수동값을 해제하거나 명시한 계좌만 재계산할 수 있다. 재계산은 인증된 POST이고 GET으로 복구하지 않는다.
- 자산 유동성 PATCH는 생략을 보존하고 null은 자동 판정으로 돌린다. `is_cash_equivalent=false`는 자동 판정과 다른 명시적 제외다. 가장 가까운 과거의 확실한 동일 자산만 override를 이어받는다.
- 삭제/병합 거래의 할부 링크는 감사/복원을 위해 남지만 관측 회차·연결 건수에서 제외한다. `inactive_installment_link`, `conflicting_transaction_id/state`가 나타나면 해당 거래를 확인한다. 명시적 해제 `DELETE .../installment-link?require_inactive=true`는 여전히 비활성일 때만 실행되고 이미 복원됐으면 `409`다.
- 반복 분류 dry-run 승인에는 `preview_token`이 필요하다. `all_matching`과 `reviewed_only` 범위를 구분하고 stale preview의 `409`는 재조회 후 다시 검토한다. 카테고리/고정비만으로 관측 근거를 우회하지 않는다. `category_valid=false`인 기존 규칙은 표시용 경고이며 조회가 규칙을 삭제하지 않는다.


## 투자 소스 선택과 서로 다른 기준시각

- 기존 `vw_asset_snapshot_canonical`, 순자산 history/compare, `/investments/summary`는 뱅샐 스냅샷 근거다. 현재 소스 정책과 선택된 투자 항목은 `/assets/source-policy`, `/investments/selected`, `/assets/source-coverage`를 사용한다.
- `configured_source`는 사용자 설정이고 `effective_source`는 실제 선택 결과다. 토스를 설정했다는 사실만으로 API 연동이나 최신 토스 평가액이 존재한다고 말하지 않는다. fallback 이유, 선택 run, 평가 기준시각, 마지막 조회 성공/시도와 stale 상태를 함께 확인한다.
- `confirmed_net_worth`는 뱅샐 동일 스냅샷 기준, `estimated_net_worth`는 확인된 계좌 범위를 교체한 별도 추정값이다. `null`은 0이 아니라 계좌 매핑/예수금 범위 등 필요한 근거가 부족한 상태다.
- `mixed_dates`일 때 소스별 기준일을 사용자에게 설명한다. 소스 시점 사이에 은행→증권 이체가 있었다면 오래된 은행 잔액과 최신 증권 잔액에 동일 자금이 잡힐 수 있다. 이것은 투자 수익이나 같은 날 확정 순자산이 아니며 가용 현금 판단에 그대로 사용하지 않는다.
- 뱅샐 증권사 그룹은 실제 계좌번호를 의미하지 않는다. 매핑이 불명확하면 에이전트가 이름만으로 임의 연결하거나 원천 금액을 수정하지 않는다. 정책 저장과 계좌 매핑은 인증된 API를 사용하고 직접 DB 쓰기는 금지한다.
- 실제 토스 API 수집기는 별도 연동 작업이다. 소스 선택 기반의 테스트 성공을 실계좌 연결 또는 운영 배포 증거로 설명하지 않는다.

- `/investments/selected?as_of_date=...`는 현재 정책·매핑으로 해당 날짜 이하의 평가값을 선택한다. 나중에 업로드된 과거 평가값도 포함할 수 있어 “그날 알고 있던 값”을 복원하는 API가 아니다. 응답의 `total_basis`를 함께 설명한다.
- `investment_total_complete=false`이면 투자 합계는 불완전한 부분합이다. 누락값을 0으로 해석하지 않고, 계좌/종목 충돌 이유를 함께 표시한다. coverage의 관측 건수와 계좌 그룹 건수는 단위가 다르므로 하나의 완성률로 계산하지 않는다.

### Toss 수동 수집의 시점·범위

`/investments/selected`의 Toss 항목은 국내·미국 주식(ETF 포함) 범위다. 채권/옵션/예수금을 포함하는 전체 계좌 잔액으로 해석하지 않는다. `valuation_precision=observation_proxy`이면 공급자 평가시각은 미제공이며 `valuation_at`은 조회시각 대용이다. stale=false도 실시간 시세임을 증명하지 않는다. USD→KRW는 별도로 조회한 midRate를 곱한 추정이고 quantity/native_currency/native_market_value/exchange_rate로 확인한다.

수동 `POST /integrations/toss/sync`는 인증된 수집 쓰기 API다. 읽기 전용 소비자는 `/integrations/toss/status`와 selected surface만 읽는다. 실패·부분 수집은 직전 정상치를 보존하고 자동으로 BankSalad 전환하지 않는다. 최초 정상치가 없거나 비주식 scope가 충돌하면 명시적 fallback 사유를 따른다. 계좌 연결은 소스 적용과 별도이며, 소스 정책은 미리보기 후 확인해야 바뀐다. 자산 component/현금 범위가 미확정이면 전체 추정 순자산은 null이다.

## 에이전트 읽기 표면 (T060)

상담 에이전트는 Q1–Q6을 답할 때 `/api/v1/read/*`를 먼저 쓴다. 원시 거래 목록을 전부 받아 다시 집계할 필요가 없다. 계약 요약은 [backend-api-ssot.md](../backend-api-ssot.md#agent-read-surface-t060), 기존 엔드포인트에서 옮기는 방법은 [read-surface-migration.md](read-surface-migration.md)에 있다.

| 질문 | 먼저 읽을 곳 |
|---|---|
| Q1 지난 달들에 돈이 어디로 갔나 | `/read/monthly-flow`, 필요하면 `/read/spend-cube` |
| Q2 무엇이 변했고 얼마씩 기여했나 | `/read/comparison/monthly-flow`, `/read/comparison/contributions` |
| Q3 조정할 수 있는 지출은 얼마이고 어디에 있나 | `/read/spend-cube?adjustability=adjustable`, `/read/comparison/contributions?adjustability=adjustable`, `/read/review-items` |
| Q4 매달 묶여 있는 지급은 얼마이고 언제 끝나나 | `/read/commitments` |
| Q5 남은 돈은 어디로 갔고 순자산은 왜 변했나 | `/api/v1/metrics/net-worth/intervals`, `/reconciliation`, `/emergency-fund` (`T061`, 색인에 실려 있음) |
| Q6 언제까지의 자료이고 분류는 얼마나 되었나 | `/read/data-status`, 그리고 모든 응답의 `as_of`·`classification` |

값의 뜻:

| 항목 | 의미 |
|---|---|
| `status` | `ok`, `classification_incomplete`(미정 지출이나 주기·조정 가능성이 빈 약정 때문에 나눔이 불완전), `no_transactions`(가져온 기간 안인데 거래 0건: 자료 공백과 구분할 수 없음), `not_imported`(가져오지 않은 기간). 조회 실패는 HTTP 503 본문의 `query_failed`, 인증 실패는 HTTP 401이다. 이유는 `status_reasons`에 모두 적힌다. |
| `period_scope.periods[]` | 요청한 달마다 가져왔는지(`coverage`), 마감월·진행월, 거래 수, 미정 비중. 가져온 기간은 첫 유효 거래의 달부터 거래 기준일의 달까지다(업로드 기록에 파일 범위가 없어서). |
| `as_of` | 거래 기준일과 종류별 스냅샷 기준일. 스냅샷 날짜는 종류마다 다르며 합치지 않는다. 자료가 오래되었는지는 판단하지 않고 날짜만 준다. `data-status`는 종류별로 거래 기준일과의 차이(일)를 준다. |
| `classification` | 그 응답 범위의 조정 가능성 미정 금액(순액)과 총지급, 순액 미정 비중, 그리고 상쇄되지 않는 미정 거래 수·미정 절댓값 합·지출 절댓값 합·절댓값 비중(0–1). `complete`는 미정 거래가 0건일 때만 true다. 순액 비중(`adjustability_undecided_share`)은 환불이 섞이면 음수가 될 수 있어 완성도 판단에 쓰지 않는다. `complete=false`이면 보호·조정 가능 합계가 미정만큼 덜 잡혀 있다. |
| `basis` | 정의 이름과 범위, 부호·환불·이체·대출·기간 귀속 규칙, 가정(한국어 문장 목록). 다른 형식의 가정 표기는 없다. |
| `labels` | 응답에 나오는 영문 키의 한국어 이름(`flow_row.committed_loan` → "약정 지급 · 대출 원리금" 등). |
| 약정 `observation.state` | `observed`(그 달 약정에 속한 지출이 있음), `expected_not_observed`(마감월이고 기록된 주기상 있어야 하는데 연결된 거래가 없음), `unlinked_transaction_present`(할부 회차 달에 같은 거래처의 '할부 연결 미확인' 표시 거래가 있음), `not_expected`(시작 전·종료 뒤·주기 밖·총 횟수 모두 관측), `not_determinable`(주기나 시작이 기록되지 않음, 진행월, 거래 0건 달, 가져오지 않은 기간). "관측 안 됨"은 기록에 연결된 거래가 없다는 뜻이지 지급하지 않았다는 증거가 아니다. |
| 약정 `monthly_burden` | 기록된 월 부담이다: 대출 스냅샷의 월 상환액, 할부 계획의 월 금액, 매월 묶음은 최근 마감월에 관측된 합계. 매년·회차 묶음은 월 부담을 내지 않는다(월 환산은 `T062`). 근거는 `monthly_burden_basis`. 전망이 아니다. |
| 대출의 주기 | 대출에는 주기 기록이 없다. 최신 스냅샷에 월 상환액이 있을 때만 매월로 보고, 없으면 `cycle=null`, 관측 판단은 `not_determinable`이다. |
| 사후 검토 `listed_because` | 어느 검출기가 어떤 사유 코드로 올렸는지와 비교 계약에 맞춘 기준값·금액 차이 설명. 새 점수나 위험 등급이 아니다. 이미 일어난 거래의 사후 검토용이며 구매 전 판단이 아니다. 구매 단위 후보 검출기는 지급 형태 수시이고 조정 가능성이 `adjustable`인 거래만 본다(`vw_transaction_nature`). 미정 거래는 후보가 아니다. |
| 월말 순현금흐름 전망 | 읽기 표면은 다시 계산하지 않는다. `/read/month-projection.data`에서 같은 단일 계산으로 읽는다(`T064` 2차 수정 반영). 최근 마감월 되짚기 오차는 `GET /api/v1/canonical-views/month-projection/accuracy`. |

### 소비자 검토 반영 (읽기 표면 보강)

실제 소비 에이전트가 읽기 표면을 쓰며 찾은 문제를 고친 내용이다. 기존 필드 이름과 뜻은 그대로이고 필드만 더했다. 기본 인자의 응답에서 기존 값은 바뀌지 않는다. 자세한 계약은 [backend-api-ssot.md](../backend-api-ssot.md#read-surface-consumer-review).

| 항목 | 읽는 법 |
|---|---|
| 422 | `/read/*`, `/metrics/net-worth/*`의 422 본문은 모두 `detail` 배열(`loc`, `msg`, `type`)이다. `/read/*`는 선언하지 않은 조회 인자(예: `start_date`)를 이름과 함께 거부하고, 지출 큐브 필터는 지출 줄이 가질 수 있는 값만 받는다. 0행 응답은 이제 "값이 틀렸다"가 아니라 "해당 거래가 없다"는 뜻이다. |
| 분류 완성도 | 위 `classification` 행. 기간별(`period_scope.periods[]`)에도 같은 값이 있다. |
| 달별 자료 범위 | `data_coverage`: `full`(달력상 범위가 달 전체를 덮음. 모든 계좌 수집의 확인은 아님), `partial`(첫 거래일이 1일이 아닌 첫 달, 또는 거래 기준일이 말일 전인 달), `no_transactions_observed`(범위 안 거래 0건: 거래가 없었다는 확인이 아니라 기록이 없다는 추정), `outside_data`. `month_status`(마감·진행)는 달력 상태로 따로 읽는다. 같은 규칙 문장이 자료 현황·비교(`data_coverage_rule`, `target_data_coverage`)·월말 전망(`coverage.month_coverage_rule`)에 있다. |
| 비교 기준 | `/read/comparison/*`의 `baseline=previous_month`이면 직전 마감월 한 달과 비교한다(기본은 최근 마감월 중앙값). 쓸 수 없으면 기준값이 null이고 `comparison.baseline_unavailable_reason`이 이유다. `previous_full_month_delta_available`은 이 응답에 월 전체끼리의 증감이 실제로 있을 때만 true다. |
| 변화 기여 | 항목 변화는 각 항목 자기 기준값에 대한 변화이지 전체 변화의 분해가 아니다. `sum_item_changes`와 `non_additive_gap`(= `change_total − sum_item_changes`)으로 차이를 본다. `baseline=previous_month`이면 항목이 더해져 차이는 0이다. `items_summary`·`twelve_month_items_summary`는 잘린 항목 수와 반환하지 않은 합을 준다. `lists=monthly|twelve_month`로 한 목록만 받을 수 있다. |
| 약정 | `end_date_status`가 `end_date=null`의 이유를 준다: `open_ended`(정기 지급 묶음은 끝이 정해지지 않음), `not_recorded`(대출 만기 등 기록 없음), `not_applicable`(회차 약정은 횟수로 끝남). 종료일은 추정하지 않는다. `monthly_burden_origin`은 월 부담 값을 사람이 넣었는지(`entered_by_person`) 연결 거래로 추정해 저장했는지(`estimated_from_linked_transactions`) 등을 구분한다. `status=active|ended`, `view=summary`로 응답을 줄일 수 있다. 요약 행에도 `cycle`, `monthly_burden_basis`, `adjustability`, `end_date_reason`이 있어, "매달 나가는 약정이 몇 건"처럼 주기별로 세는 일은 요약만으로 할 수 있다. |
| 거래 | `GET /transactions`와 사후 검토 거래 항목(`axes`)이 지급 형태·조정 가능성·흐름표 줄과 각 출처를 준다(`vw_transaction_nature`, `vw_metric_flow_lines` 값 그대로). 출처 `none`은 아무도 정하지 않았다는 뜻이다. |
| 순자산 대조 | `status=complete`는 항목을 모두 계산할 수 있었다는 뜻이지 변화가 설명되었다는 뜻이 아니다. `unexplained_share_of_change`(설명되지 않은 차이 ÷ 순자산 변화의 절댓값)로 크기를 본다. 목적 미정 이체가 있으면 `investment_valuation_change_provisional=true`: 그 이체가 투자 입금일 수 있어 투자 평가 변동이 잠정값이다. |
| 색인 | `/read/index`에 월말 전망(`/read/month-projection.data`)과 오차 경로 항목, 부호가 있어 0–1 밖일 수 있는 비율 목록(`signed_ratio_fields`), 어휘 대응표(`vocabulary_mapping`)가 있다. |

같은 뜻 다른 이름(이름은 바꾸지 않는다):

| `/read/*` | 지표 응답(`/metrics/net-worth/*` 등) | 뜻 |
|---|---|---|
| `status=classification_incomplete` | `status=incomplete_classification` | 사람이 아직 정하지 않은 분류(조정 가능성, 이체 목적)가 있어 불완전함 |
| `basis` | `contract` | 무엇을 어떤 규칙으로 계산했는지. `/read/*`는 지표의 `contract`를 `basis`로 옮겨 싣는다 |
| `status_reasons[]`(코드·이름) | `status_reasons[]`(문장) | 상태의 이유 |

## T054/T057 보완 (2026-11-17)

`/read/review-items.data.comparison`은 거래 후보와 카테고리 변화 양쪽의 대상월·실제 기준월 목록·기준 구간 시작일·부분월 처리 방식을 설명한다. 기본은 최근 6개 마감월 중앙값이며, 진행월은 같은 경과일까지, 자료 없는 달과 월중 시작 첫 달은 기준에서 뺀다. 자료 있는 달에 구매가 없으면 0원이다. 거래 후보의 금액은 뷰가 계산한 **구매 순액**(확정 환불을 원구매에 차감)이고 카테고리 변화는 **게시월 지출**이므로 금액 정의가 다르다. 거래 후보의 급증 기준값과 현재 합계는 SQL로 집계한 수시·조정 가능 구매 순액이다. Python은 임계값 판정과 취소 증거·검토 상태를 처리한다. 진행월 거래 후보의 계산된 비율 신호는 내지 않고 차액으로 이유를 설명한다. 연간성 지출의 12개월 비교는 `/read/comparison/contributions.data.twelve_month_items`에서 읽는다.

기존 `expense_total`은 유지한다. 명확한 이름은 분석의 고정비 요약·추이와 대시보드 월 흐름에서는 `total_outflow`, 대출을 제외하는 `vw_fixed_cost_monthly_summary`에서는 `living_spend`다. 대시보드의 `non_loan_expense_total`도 `living_spend`를 함께 준다. 거래 작업 미리보기의 `expense_total`은 `selected_raw_expense_net`(선택 원본 지출 순액, 원통화 그대로)이며 월 흐름표 총지급으로 쓰면 안 된다. 응답 `contract.field_scopes` 또는 `field_scopes`가 이 대응을 명시한다. [전체 대응표](../backend-api-ssot.md#t054t057-remaining-acceptance-2026-11-17)를 따른다.

`vw_monthly_cashflow.savings_rate`는 이제 진행월에 null이다. 홈은 서버의 `residual_rate`를 표시한다. 예전 기준선의 HTTP 호환 경로는 승인 후 제거했다. SQL 뷰는 남아 있다. 아래 [이전 안내](read-surface-migration.md#6-검증과-변경-키)의 후속 경로를 사용한다.


## 2026-11-17 제거 후 읽기 규칙

위의 Analytics 값 사전 중 `category-mom`, `discretionary-velocity`, 구매 후보 GET 두 개, `spending-anomalies`, `installments/forecast`는 **제거된 이전 계약 설명**이다. 현재 호출 경로가 아니다. 대시보드와 함께 총 7개 GET이 404다. 현재 대체 경로·필드는 [이전 안내](read-surface-migration.md#1-제거된-경로와-후속-표면)를 따른다. 재사용하는 검출기의 내부 값은 남아 있고 공개 HTTP 목록은 `/read/review-items`로 통합했다.

에이전트의 전망 읽기는 `/canonical-views/dashboard.month_projection` → `/read/month-projection.data`, `metric_as_of` → `as_of`, `data_coverage.last_transaction_date` → `as_of.transaction_as_of`로 바꾼다. 최초 날짜는 `as_of.first_transaction_date`. 정확도 경로는 유지한다. 색인의 `month_end_projection`과 자료 현황의 `month_end_forecast`도 이 새 위치를 가리킨다. 금액·비율·분류는 클라이언트가 다시 계산하지 않는다.

전용 전망 응답은 예전 객체의 단위를 보존한다. `data.remaining_expense_adjustability.undecided_share_pct`는 백분율(0–100)이고, 봉투의 분류·기간 비중은 0–1이다. 새 응답의 `basis.rules.projection_ratio_units`와 `labels`가 단위 예외와 열거값 한국어 이름을 밝힌다.

## T062 — 연간성 지출 참고와 사람이 정한 한도

`GET /api/v1/read/spending-reference?period=YYYY-MM` (`X-API-Key`, `/read/index`의 `spending_reference`)를 쓴다. 기본은 최근 마감월이며 없으면 진행월이다. 기간·기준일·미정 비중·조회 상태는 공통 봉투, 정의는 `basis.definition=spending_reference.v1`이다.

- `data.total_outflow`: 기존 월 흐름표의 총지급. `annual_items[].monthly_equivalent`를 더하지 않는다.
- `annual_items`: 대상 마감월로 끝나는 완전한 12개월 창에서 월 순지출이 양수인 달이 정확히 1~2개인 유효 대분류·소분류 쌍(`observed_pattern`)과 사람이 주기를 매년으로 지정한 등록 약정(`registered_yearly_commitment`)을 구분한다. 전체 쌍의 양수 순지출 월 수로 패턴 자격을 먼저 판정하고, 사람이 `cycle=yearly`로 지정한 약정에 귀속된 구매·환불 줄은 그 쌍의 표시 금액에서 제외한다. 남은 지출 줄이 없으면 패턴 항목을 생략한다. 줄이 남으면 0·음수 순액도 환불을 반영한 값 그대로 표시한다. 등록 약정은 관측 빈도와 관계없이 관측된 12개월 순액을 별도 출처로 표시한다(0·음수 포함). 약정 귀속은 흐름표의 `recurring_commitment_id`를 따르며 거래 제외·명시적 연결·기간·배분 환불을 다시 판정하지 않는다. 기존 이행 묶음의 주기를 사람이 편집한 경우도 포함한다. 약정은 ID·쌍별로 나뉜다. `category`는 유효 대분류(기존 필드 유지), `category_minor`는 유효 소분류(null·빈 문자열은 null로 묶고 화면에 `소분류 없음`), `source=observed_pattern|registered_yearly_commitment`, `commitment_id`·`commitment_label`(패턴이면 null), `observed_periods`(차감 후 월 순지출이 양수인 YYYY-MM 목록, 오름차순), `active_months_in_window`(그 목록 길이), `window_amount`(환불을 포함한 12개월 순액), `monthly_equivalent`를 반환한다. 12개월 순액 내림차순, 대분류·소분류·source·약정 ID 오름차순으로 동률을 해소한다. 목록 전체를 반환하며 제한·잘림은 없다. `window_amount / 12`를 원 단위 사사오입한 값은 참고값이며 합계·한도에 넣지 않는다. 자동 분류나 전망이 아니다. 창은 `window_start_period`, `window_end_period`다. 진행월·불완전한 창은 빈 목록과 `annual_missing_reason`/한국어 이유를 읽는다. T057 기여 응답은 종전 정의 그대로다.
- `comparisons`: 대상 월 실적과 그 달에 적용된 사람이 정한 월 한도를 비교한다. 차이(`difference_amount`)는 실적 − 한도. `limit_revision_id`, `effective_from_period`가 실제 적용 이력을 가리킨다. 카테고리·조정 가능성 두 보기를 서로 더하면 이중 계산이다.
- 차이가 null이면 `missing_reason`을 먼저 읽는다. `no_limit_set`은 미설정/해제, `month_in_progress`는 진행월, `partial_month`는 월중 시작, `no_transactions`는 거래 없는 달, `not_imported`는 아직 가져오지 않은 기간이다. **미설정을 0원 한도로 간주하지 않는다.** 진행월 실적이 있어도 한도 대비나 남은 예산을 계산하지 않는다.
- 사람이 설정하는 API는 별도 `GET/POST /api/v1/spending-limits`다. 모든 쓰기는 인증 API로만 하며 직접 DB 쓰기는 금지다. `target_kind=category|adjustability`, 정확한 `target_value`(미분류는 빈 문자열), `effective_from_period`, `amount`를 사람이 입력한다. `null`은 한도 해제, 0은 실제 0원 한도다. 시스템은 한도·분류를 미리 고르거나 추천하지 않는다.
- 한도 이력은 추가만 가능하다. 이미 마감된 월에는 설정/변경할 수 없고, 같은 대상의 마지막 적용 시작월보다 뒤인 월이어야 한다. 각 마감월은 자기 월 이하의 최신 버전을 읽는다. 한도 미만·초과는 기록 비교이며 최종 조언이나 건강/위험 판정이 아니다.
