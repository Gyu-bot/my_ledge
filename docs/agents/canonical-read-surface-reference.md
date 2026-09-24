# Agent Canonical Read Surface Reference

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
| settlement canonical | analytics 집계는 확인된 settlement만 netting 대역으로 재해석한다. |
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
| 최근 canonical row를 화면처럼 보고 싶다 | `GET /api/v1/canonical-views/dashboard` | readonly DB의 `vw_*` |
| 거래 drill-down이 필요하다 | `vw_transactions_effective` 또는 `GET /api/v1/transactions` | raw `transactions` |
| 월별 현금흐름/저축률 | `vw_monthly_cashflow` 또는 `GET /api/v1/analytics/monthly-cashflow` | `GET /api/v1/canonical-views/dashboard` |
| 고정비/변동비 구조 | `vw_fixed_cost_monthly_summary` 또는 fixed-cost analytics endpoints | `vw_unclassified_work_queue` |
| 대출 상환 부담 | `vw_loan_repayment_monthly` | `GET /api/v1/loan-transaction-links` |
| 대출 구조/금리/만기 | `GET /api/v1/loans/summary` 또는 `vw_loan_account_canonical` | 숨김 계좌 복구/감사는 `GET /api/v1/loan-accounts?include_hidden=true`, schema 확인은 `GET /api/v1/schema` |
| 보험 계약/추정 보험료 | `GET /api/v1/insurance/summary` | raw `insurance_contracts`; 보험 적정성 판단은 에이전트 해석이다. |
| 할부 잔여 현금흐름 | `GET /api/v1/installments/forecast` | `/operations/installments`. canonical cashflow view는 관측 거래만 유지하고, 할부 예측은 별도 projection surface로 읽는다. |
| 수입 구성 | `vw_income_monthly_by_category` | `vw_monthly_cashflow`, `GET /api/v1/canonical-views/dashboard` |
| 실제 가용 현금 | `vw_true_spendable_monthly` | dashboard endpoint의 estimated enrichment. 구매 가능 판단이 아니라 계산 surface다. |
| 거래처 baseline 변화 | `vw_merchant_monthly_baseline` | `GET /api/v1/analytics/merchant-spend` |
| 반복 거래처 월별 지출 | `vw_recurring_merchant_monthly` | `GET /api/v1/canonical-views/dashboard` |
| 분류 품질 개선 대상 | `vw_unclassified_work_queue` 또는 dashboard `unclassified_work_queue[]` | operations APIs. `issue_types[]`와 `recurrence_signal`을 보고 정리 작업을 고르며, 재무 위험 우선순위로 말하지 않는다. |
| 자산/부채 snapshot 표준값 | `vw_asset_snapshot_canonical` | `GET /api/v1/analytics/net-worth-breakdown`, `GET /api/v1/analytics/liquidity-health` |
| 유동성/부채 health | `GET /api/v1/analytics/liquidity-health` | `GET /api/v1/analytics/net-worth-breakdown`. 기본 호출은 closed-month spend/income을 산출하고 source metadata를 함께 반환한다. health라는 이름은 계산 묶음 이름이며 최종 상태 판정이 아니다. |
| schema 탐색 | `GET /api/v1/schema` | 이 문서와 backend reference |

권장 조회 순서:

1. `GET /api/v1/schema`로 사용 가능한 view/endpoint를 확인한다.
2. 질문별로 analytics 또는 dashboard로 결론을 먼저 내려도 되는지 판단한다.
3. 부족하면 readonly DB의 canonical view를 조회한다.
4. raw `transactions`는 삭제/병합/수정 이력 같은 감사성 목적으로만 추가 조회한다.

## `GET /api/v1/canonical-views/dashboard`

관측 canonical row와 기준월 전망을 함께 반환한다. `X-API-Key`가 필요하며 GET은 설정·거래·연결을 저장하지 않는다. 임의 SQL 실행 surface가 아니다.

| 파라미터 | 의미 |
|---|---|
| `months` | 월별 row 범위. 기본 `12`, 범위 `1..36`. |
| `merchant_limit` | 거래처 baseline/반복분류 row 상한. 기본 `10`, 범위 `1..50`. |
| `queue_limit`, `queue_page` | queue 페이지 크기(기본 10, 1–100), 페이지(기본 1). |
| `search` | queue 거래처/effective category 검색, 최대 200자. |
| `issue_types` | `cost_kind,spend_necessity,recurring_kind,loan_link` 중 쉼표로 구분한 OR 필터. |
| `period_from`, `period_to`, `current_only` | queue 월 범위(`YYYY-MM`), 또는 기준일이 속한 월만 선택. |
| `reference_date` | 전망과 현재 월 필터의 기준일. 기본 서버 날짜. canonical 전체를 과거 시점으로 복원하는 옵션은 아니다. |

| 응답 | 의미 |
|---|---|
| `monthly_cashflow[]` | `vw_monthly_cashflow`의 관측 월별 수입/순지출/상환/이체 활동/저축률. |
| `true_spendable_monthly[]` | `vw_true_spendable_monthly`의 관측 수입에서 상환·고정/변동 지출을 뺀 계산값. 실제 은행 잔액이 아니다. |
| `loan_repayment_monthly[]` | 대출 계좌·상환 유형별 관측 월상환액. |
| `merchant_monthly_baseline[]`, `recurring_merchant_monthly[]` | 제한된 거래처 baseline/저장 반복분류 row. 각각의 `_total`은 제한 전 view row 수이며 distinct 거래처 수가 아니다. |
| `unclassified_work_queue[]` | 필터링·페이지 적용된 검토 거래와 현재 nullable 비용/필수성/반복 분류값. |
| `unclassified_work_queue_total`, `_page`, `_per_page`, `_total_pages` | 필터 후 전체 queue 크기와 페이지 정보. 배열 길이와 전체 건수를 혼동하지 않는다. |
| `data_coverage` | 전체 유효 거래의 최초/최종 관측일. 두 날짜 사이의 수집 완전성을 보장하지 않는다. |
| `month_projection` | 아래의 독립적인 기준월 수입·지출 시나리오. |

Queue 필터는 count/limit/offset 전에 적용된다. 월별 두 관측 배열의 `is_complete_month`는 같은 거래 관측밀도 기준으로 계산된다: 마감월에 관측일 8개 이상, 첫 주/마지막 주 관측, 관측일 사이 최대 공백 10일 이하. 반환된 월 범위를 평가하며 전망의 6개월 학습 범위와 별개다. 이는 수집 완료 인증이 아니다. 현재 월은 false이고 `savings_rate_basis`는 `no_income|observed_closed_month|observed_partial_month`다.

기존 true-spendable forecast 필드는 호환용으로 남아 있지만 새 예상값을 채우지 않는다. `income_basis='observed'`, `is_income_estimated=false`, `observed_income_total=income_total`이며 `estimated_*`/`income_estimate_source`는 null이다. `income_estimate_month_count`는 0, `excluded_income_periods`는 빈 배열이다. 기존 `income_total`을 예상수입으로 바꾸거나 null 예상 필드를 0으로 해석하지 않는다.

### `month_projection`: 관측값과 전망 분리

| 필드 | 의미/계산 |
|---|---|
| `period`, `as_of_date`, `observed_through` | 기준월, 기준일, 기준일까지의 최종 관측일. |
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
| `income_sources[]` | 출처 key/거래처, 예상·관측·잔여 금액, `expected_day`와 예상일/범위, 상태, confidence, 관측/제외 월, 매칭 거래 ids, 이유. |
| `expense_components[]` | `kind=loan|installment|recurring|variable`, nullable `expected_remaining`, `known_expected_remaining`, 기준·missing reasons·confidence·warnings. 반복 지출은 거래처별 `sources`도 제공한다. 알려진 부분합에도 낮은 신뢰도의 추정이 포함되며 확정 청구액이 아니다. |
| `expense_components[].sources[]` | 거래처별 월 기준액, 실제 총결제액·환급·순지출, 잔여 예상액, 기준초과 결제액, `expected|observed|review` 상태, confidence, 근거·사용/제외 월·warnings. |
| `coverage`, `included_periods`, `excluded_periods` | 최근 6개 마감월의 관측밀도·누락/제외와 업로드 기준일. |
| `confidence`, `warnings`, `missing_reasons`, `limitations` | 낮은 신뢰도로 추정 가능한 사유와 실제 산출 불가 사유를 구분한다. null은 0이 아니다. |

- 급여 카테고리/정규화된 지급처를 기준으로 최근 6개월 중 충분히 관측된 최소 3개월의 안정적인 중앙값을 학습한다. 보너스·보험금·환급·중고판매·소액 정산은 자동 정기수입에서 제외하지만 관측 수입은 보존한다. 예상일은 과거 입금일/월말 패턴을 사용한다.
- `expected|received|partial|late|stopped|uncertain`을 구분한다. 과거 분할 입금 횟수에 미달하거나 사용자 기대값보다 덜 들어오면 차액만 유지한다. 그 외에는 실제 수령이 예상의 80% 이상이면 예상수입을 다시 더하지 않는다. 지연은 예상일 뒤까지 실제 관측된 경우에만 표시한다. 사용자 예상액/입금일/중단 설정이 자동 학습보다 우선한다.
- `expected_day=31`은 월말 패턴이며 `expected_date`는 해당 월 일수로 조정한 날짜다. 수동 기대값으로 복사할 때 2월 28일 같은 개별 날짜 대신 `expected_day`를 유지해야 다른 달에도 월말이 보존된다. 기대일 미확정이면 null이다.
- 잔여 지출은 대출 → 할부 → 안정적 반복 지출 → 나머지 변동·미분류·비정기 고정 지출 순서로 분리해 중복을 막는다. 이미 관측된 납부액을 차감하고, 지난 미연결 할부를 미래 채무로 더하지 않는다. 반복 근거가 없는 일반 고정비는 잔여일 패턴에 포함한다. 이번 달 관측이 있는 명시적 반복 지출은 짧거나 불연속적인 이력도 낮은 신뢰도로 추정하고 근거를 표시한다. 직전 달 전체 관측이 부족하면 마지막 충분 관측월까지의 안정 이력을 낮은 신뢰도로 유지하며 결제 중단으로 단정하지 않는다. 환급만 있고 결제 근거가 전혀 없으면 미확정으로 남긴다.
- 반복 지출은 환급을 빼기 전 총결제액으로 기준을 학습한다. 잔여액은 과거 동일 잔여 날짜 총결제액 중앙값과 `월 기준액 - 이번 달 총결제액` 중 작은 값이며 0 미만이 되지 않는다. 과거 31일은 현재 월말로 보정한다. 환급은 실제 순지출에만 반영하고 재청구를 가정하지 않는다. 기준초과 결제는 실제 지출에만 포함하며 일회성이라고 단정하지 않는다. 과거 근거 없이 이번 달 결제만 있으면 추가 예상 0인 낮은 신뢰도 시나리오임을 밝힌다.
- 잔여일 추정은 오늘이 아니라 현재 월 마지막 관측일 이후의 과거 동일 일자 구간을 사용한다. 최종 거래가 기준일보다 7일 초과 오래됐거나 일부 지출에 실제로 추정 근거가 없으면 완전한 월말 전망은 null이다. 반복 지출의 경고만 있는 경우 숫자를 유지하고 신뢰도를 낮춘다. 알려진 부분합이 있어도 누락 비용과 새 지출은 보장되지 않는다.
- `GET/PATCH /settings/income-expectations`는 인증이 필요하다. `{items: [...]}` 전체 목록을 교체하며, source key는 `income:` + casefold/공백 정규화 merchant다. 각 항목은 예상액·1–31일 입금일·중단 여부를 저장한다. `items:[]`는 모든 수동 기대값을 해제한다. GET/전망 계산은 학습 결과를 저장하지 않는다.

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
| `spend_necessity` | `essential`, `discretionary`, 또는 `null`. 고정/변동과 무관한 필수/재량 축이다. 재량 지출 계산은 이 값을 우선한다. 생성/규칙 적용은 variable 미지정을 `discretionary`로 정규화하지만, PATCH는 생략을 보존하고 명시적 null을 해제 값으로 취급한다. |
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
| `expense_total` | `type='지출'`의 `-amount` 합계. 기본은 raw signed 합계이되, 확정 settlement가 있는 경우 economics는 confirmed net amount 기준으로 노출될 수 있다. 대출 상환도 포함한 총 지출이다. |
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
| `savings_rate` | `net_cashflow / income_total`. 수입이 0이면 `null`. |

### Raw signed vs settlement-netted surfaces

- Raw signed rows:
  - `GET /api/v1/transactions`와 `vw_transactions_effective`가 `amount` 원본 부호를 그대로 제공합니다.
  - 환불/취소는 raw positive `type='지출'` 행으로 유지되어 raw signed 월별 expense에 그대로 반영됩니다.
- settlement-netted surfaces:
  - `/api/v1/analytics/monthly-cashflow`, `/api/v1/analytics/category-mom`, `/api/v1/analytics/fixed-cost-summary`, `/api/v1/analytics/spending-review-candidates`는 확인된 결제/환불 묶음을 netted economics로 소비합니다.

| 상태 | 분석 의미 | 상태별 규칙 |
|---|---|---|
| `auto_confirmed` | 확정 | raw signed를 묶음 net amount로 치환해 반영 |
| `user_confirmed` | 확정 | raw signed를 묶음 net amount로 치환해 반영 |
| `review_required` | 미확정 | raw signed semantics 유지, settlement netting 미적용 |
| `rejected` | 미확정 | raw signed semantics 유지, settlement netting 미적용 |

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

진행월 수입 미관측 보정은 DB view가 아니라 dashboard API의 `estimated_*` 필드로만 제공된다.

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

`vw_asset_snapshot_canonical`은 자산 상태를 계산한 표준값이지 "건강/위험" 최종 label이 아니다. 유동성 판단은 `/analytics/liquidity-health`의 `confidence`, `assumptions`, 사용자 목표/예정 지출과 함께 해석한다.

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

분류 품질 개선이 필요한 거래 queue다. “분석 결과”라기보다 “다음에 정리하면 좋은 데이터 품질 작업”으로 해석한다.

| 컬럼 | 의미/계산 |
|---|---|
| `transaction_id`, `date`, `type`, `merchant`, `effective_category_*`, `amount` | 후보 거래 기본 정보. |
| `amount_abs` | `abs(amount)`. 우선순위 점수에 사용한다. |
| `needs_cost_kind` | 일반 지출인데 `cost_kind`가 비어 있음. |
| `needs_fixed_cost_necessity` | `cost_kind='fixed'`인데 `fixed_cost_necessity`가 비어 있음. |
| `needs_spend_necessity` | 일반 지출인데 `spend_necessity`가 비어 있음. |
| `needs_recurring_payment_kind` | 반복/고정 성격인데 `recurring_payment_kind`가 비어 있음. 현재 반복 후보는 최소 2개 월, 최소 2개 거래일, 거래처 금액 CV `<= 0.5` 또는 fixed cost 조건을 본다. |
| `needs_loan_link_review` | 금융/대출/상환/이자/원리금 키워드 또는 금융 카테고리인데 대출 연결 검토가 필요한 일반 지출. |
| `merchant_expense_count` | 같은 거래처의 일반 지출 건수. |
| `priority_score` | `min(amount_abs, 1000000)`에 loan/cost/fixed/recurring/repeat 보너스를 더한 정렬 점수. |
| `priority_reason` | 최우선 사유. `loan_link_review`, `missing_cost_kind`, `missing_fixed_necessity`, `missing_recurring_kind`, `review`. |

DB queue의 `needs_recurring_payment_kind`는 검토 필요 신호다. 실제 반복규칙 승인 가능 여부는 별도의 dry-run에서 effective 설정·cadence·confidence를 평가하므로 queue flag를 승인 대상으로 그대로 변환하지 않는다.

### `vw_category_monthly_spend`

월별 카테고리 지출 aggregate schema다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `category_major`, `category_minor` | effective category 기준 category. |
| `amount` | 지출 정규화 금액 합계. |

현재 일부 analytics code는 이 DB view를 직접 조회하지 않고 `vw_transactions_effective`와 같은 semantics로 Python에서 계산한다. 에이전트는 schema reference로 사용하되, live API 결과가 필요하면 analytics endpoint도 확인한다.

## Analytics API 값 사전

| Endpoint | 주요 값 | 의미 |
|---|---|---|
| `/analytics/monthly-cashflow` | `income`, `expense`, `transfer`, `net_cashflow`, `savings_rate` | 월별 수입/지출/이체 활동량과 저축률. `transfer`는 `abs(amount)` 활동량이다. |
| `/analytics/category-mom` | `current_amount`, `previous_amount`, `delta_amount`, `delta_pct` | `reference_date`, `is_partial_period`, `comparison_basis`로 비교 범위를 밝힌다. 명시적 부분월은 이전 달의 같은 날짜 구간과 비교하며 빈 대상 월도 유지한다. |
| `/analytics/fixed-cost-summary` | `expense_total`, `fixed_total`, `variable_total`, `fixed_ratio`, `essential_fixed_total`, `discretionary_fixed_total`, `essential_variable_total`, `discretionary_variable_total`, `required_spend_total`, `discretionary_spend_total`, `unclassified_total`, `unclassified_count` | 기간 전체의 고정비/변동비/필수/재량/미분류 구조. `necessity_unclassified_total/count`는 cost kind 미분류와 다른 축이며 중복될 수 있다. 환급은 순액에 반영된다. |
| `/analytics/fixed-cost-trend` | monthly fixed/variable/essential/discretionary/unclassified fields | 월별 고정비 구조 추이. |
| `/analytics/merchant-spend` | `merchant`, `amount`, `count`, `avg_amount`, `last_seen_at` | 거래처별 총액, 빈도, 평균 금액, 마지막 거래일. |
| `/analytics/payment-method-patterns` | `payment_method`, `total_amount`, `transaction_count`, `avg_amount`, `pct_of_total` | 결제수단별 소비 비중. |
| `/analytics/income-stability` | `avg`, `stdev`, `coefficient_of_variation`, `is_partial_period`, `assumptions` | 관측된 수입월의 변동성. 누락 월을 0으로 채우거나 완전한 수집으로 가정하지 않는다. backend는 숫자만 제공한다. 안정/불안정 label과 생활 안정성 평가는 에이전트 해석이다. |
| `/analytics/discretionary-velocity` | `period`, `discretionary_spend`, `baseline_monthly_spend`, `velocity_ratio`, `risk_level`, `classification_coverage_ratio`, `assumptions`, `reasons` | 환급을 반영한 순액 지출 속도이며 coverage는 양의 결제 기준이다. nonpositive baseline이면 ratio는 null이다. `risk_level`은 최종 구매 허용 판단이 아니라 후보 강도와 분류 신뢰도 안내용이다. |
| `/analytics/spending-review-candidates` | `items[]`, `candidate_key`, `candidate_type`, `candidate_types[]`, `risk_level`, `review_status`, `review_memo`, `reviewed_at`, `cooldown_until`, `review_timing`, `candidate_purpose`, `future_friction_suggestion`, `assumptions`, `reasons` | preferred name for post-transaction discretionary review queue. Legacy `/analytics/purchase-gate-candidates` is kept for compatibility. Confirmed refunds use net spend. `possible_cancellation`/`cancellation_evidence_transaction_ids`는 미확정 취소 검토 힌트이며 조회로 settlement를 만들지 않는다. |
| `/analytics/recurring-payments` | `interval_type`, `avg_interval_days`, `confidence`, `recurring_payment_kind`, kind counts, `transaction_ids` | 거래처별 순지출/반복분류와 `activity_status`. `activity=active`는 active candidate만 반환하고 historical/irregular/non_positive/not_recurring과 구분한다. `confidence`는 반복 패턴 신호이며 구독 해지/낭비 판단이 아니다. |
| `/installments/forecast` | `items[]`, `monthly_summary[]`, `status` | 할부 원장 기준 회차별 예측. `observed`는 이미 거래가 연결된 회차, `projected`는 미래/현재 미연결 회차, `missed`/`past_unconfirmed_total`은 지난 미연결 회차이며 미납 확정이 아니다. `is_future_obligation`을 구분하고 projected total은 미래 계획용이며 관측 거래와 이중 계산하지 않는다. |
| `/analytics/spending-anomalies` | `amount`, `baseline_avg`, `delta_pct`, `delta_pct_raw`, `delta_pct_display`, `baseline_quality`, `anomaly_mode`, `anomaly_score` | 기준 월과 baseline window의 category 지출 차이. `direction`은 signed delta의 증가/감소를 구분하고 sparse baseline에서는 raw percent와 표시용 percent를 구분한다. 환급 순감소를 증가로 말하지 않는다. anomaly는 변화 후보이지 문제 지출 확정이 아니다. |
| `/analytics/net-worth-breakdown` | `asset_total`, `liability_total`, `net_worth`, `items[]` | 최신 또는 지정 snapshot의 자산/부채 구성. snapshot/history/compare/health와 공통의 `aggregation_basis` 및 `negative_asset_excluded_total`을 제공한다. |
| `/analytics/liquidity-health` | `cash_equivalent_total`, `emergency_fund_months`, `emergency_fund_target_months`, `target_progress_ratio`, `monthly_debt_payment`, `debt_payment_ratio`, `debt_to_asset_ratio`, `confidence`, `assumptions` | 현금성 자산, 비상금 개월 수, 목표 대비 진행률, 부채 부담 추정. `health`는 계산 묶음 이름이며, 실제 재무 건강/위험 판정은 에이전트 해석이다. `input_as_of_date`, `required_spend_period`, 필수/추가상환 금액, `debt_payment_snapshot_date`를 확인한다. 선택 snapshot 이후 거래를 섞지 않으며 이미 필수인 상환을 다시 더하지 않는다. |

## 에이전트 답변 시 주의사항

- 월별 canonical은 관측값, `month_projection`은 전망으로 구분한다. 일부만 알려진 `net_after_known_remaining_expense`를 전체 월말 순수입이나 현금 잔액으로 말하지 않는다.
- 대출 상환은 일반 소비와 분리한다. 같은 금액을 고정비와 대출 부담에 이중으로 더하지 않는다.
- `fixed_cost_necessity`는 고정비 호환 필드이고, 필수/재량 분석은 `spend_necessity`를 우선한다.
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
