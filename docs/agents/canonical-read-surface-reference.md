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
| 원천 우선순위 | 현재는 사용자 보강값(`liquidity_tier`, `is_cash_equivalent`, 대출 `monthly_payment`/`repayment_method`)이 raw import metadata보다 우선한다. multi-source 우선순위와 source confidence는 planned work다. |

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

P0/P0.5 canonical view의 실제 row 값을 한 번에 반환하는 dashboard API다. 임의 SQL 실행 surface가 아니며, allowlist된 view만 읽는다.

Query:

| 파라미터 | 의미 |
|---|---|
| `months` | 최근 몇 개월의 월별 row를 가져올지. 기본 `12`, 범위 `1..36`. |
| `merchant_limit` | 거래처 baseline row 최대 개수. 기본 `10`, 범위 `1..50`. |
| `queue_limit` | 분류 품질 queue row 최대 개수. 기본 `10`, 범위 `1..50`. |
| `reference_date` | `true_spendable_monthly`의 진행월 기준 추정 보정을 고정할 기준일. 생략 시 `오늘 날짜` 기준. |

Response groups:

| 필드 | 출처 | 의미 |
|---|---|---|
| `monthly_cashflow[]` | `vw_monthly_cashflow` | 월별 수입, 지출, 대출상환, 이체 활동, 고정/변동 지출, 저축률. |
| `true_spendable_monthly[]` | `vw_true_spendable_monthly` + API enrichment | 대출 상환과 고정 지출을 뺀 실제 가용 현금. 진행월 수입이 아직 관측되지 않았을 때 예상 수입 필드를 추가할 수 있다. |
| `loan_repayment_monthly[]` | `vw_loan_repayment_monthly` | 대출 계좌와 상환 유형별 월 상환액. |
| `merchant_monthly_baseline[]` | `vw_merchant_monthly_baseline` | 거래처별 월 지출과 직전 3개 active month baseline 대비 변화. |
| `recurring_merchant_monthly[]` | `vw_recurring_merchant_monthly` | 저장된 반복결제 분류별 거래처 월 지출. |
| `unclassified_work_queue[]` | `vw_unclassified_work_queue` | 분석 신뢰도를 낮추는 미분류/검토 필요 거래 우선순위. |

진행월 예상 수입 enrichment:

| 필드 | 의미 |
|---|---|
| `observed_income_total` | DB view에서 관측된 실제 수입. 없으면 `income_total`과 같다. |
| `income_basis` | `observed` 또는 `estimated`. 화면/에이전트 답변에서는 이 값을 반드시 명시한다. |
| `is_income_estimated` | 현재 row가 예상 수입 보정으로 해석됐는지 여부. |
| `estimated_income_total` | 최근 마감월 기준으로 추정한 진행월 수입. |
| `income_estimate_month_count` | 추정에 사용한 마감월 수. |
| `income_estimate_source` | `trailing_6_closed_month_avg`, `trailing_6_outlier_adjusted_avg`, `trailing_6_income_median` 중 하나. |
| `excluded_income_periods` | median 기준 ±30% 밖이라 제외된 월. 환급/보너스성 수입이 섞인 월일 수 있다. |
| `estimated_spendable_before_variable_spend` | 예상 수입 기준 `estimated_income_total - loan_repayment_total - fixed_commitment_total`. |
| `estimated_remaining_after_variable_spend` | 예상 수입 기준 `estimated_income_total - loan_repayment_total - fixed_commitment_total - variable_total`. |

주의: `estimated_*`는 `vw_true_spendable_monthly`의 관측값을 대체하지 않고 enrichment으로만 추가된다. `income_total`은 그대로 관측 수입 합계로 유지되어야 하며, 설명 시 observed와 estimated를 분리해야 한다.

예상 수입은 현재 월 row에서 관측 수입이 최근 수입 baseline의 50% 미만일 때만 붙는다. DB view 원본 값은 바꾸지 않는다.
`true_spendable_monthly`는 계산상 가용액을 보여주는 surface다. 에이전트는 이 값을 "지금 써도 되는 돈"으로 단정하지 않고, 사용자의 목표/현금흐름/예정 지출을 함께 물어본 뒤 해석한다.

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
| `spend_necessity` | `essential`, `discretionary`, 또는 `null`. 고정/변동과 무관한 필수/재량 축이다. 재량 지출 계산은 이 값을 우선한다. `cost_kind='variable'` 저장/규칙 적용 시 미지정 값은 `discretionary`로 정규화된다. |
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
| `created_at`, `updated_at` | DB row 생성/수정 시각. |

주의: 삭제/병합 row까지 봐야 하는 감사성 작업은 raw table이나 transaction API include flag를 사용한다.

### `vw_monthly_cashflow`

월별 현금흐름 foundation이다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `income_total` | `type='수입'`의 `amount` 합계. |
| `expense_total` | `type='지출'`의 `-amount` 합계. 대출 상환도 포함한 총 지출이다. |
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

### `vw_true_spendable_monthly`

월별 실제 가용 현금 계산 surface다.

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
| `discretionary_variable_total` | `variable`이면서 `spend_necessity='discretionary'`인 금액. 변동비 필요성 미지정분은 backend에서 이 값으로 정규화된다. |
| `required_spend_total` | `essential_fixed_total + essential_variable_total`. 이 view는 대출 상환을 일반 지출에서 제외하므로 대출 부담은 `vw_loan_repayment_monthly` 또는 `vw_monthly_cashflow.loan_repayment_total`과 따로 본다. |
| `discretionary_spend_total` | `discretionary_fixed_total + discretionary_variable_total`. |
| `unclassified_total` | `cost_kind is null`인 일반 지출 금액. |
| `unclassified_count` | `cost_kind is null`인 일반 지출 건수. |

### `vw_asset_snapshot_canonical`

snapshot 단위 자산/부채/유동성/월상환액 표준 surface다. My Ledge가 sparse snapshot 원본과 사용자 보강 metadata를 합쳐 계산 근거를 제공하고, 에이전트는 confidence와 assumptions를 보고 최종 해석을 붙인다.

| 컬럼 | 의미/계산 |
|---|---|
| `snapshot_date` | snapshot 기준일. 업로드 시 지정한 날짜다. |
| `asset_total` | 자산 row 총액. |
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
| `/analytics/category-mom` | `current_amount`, `previous_amount`, `delta_amount`, `delta_pct` | 선택 window의 마지막 월과 직전 달을 category별 비교한다. |
| `/analytics/fixed-cost-summary` | `expense_total`, `fixed_total`, `variable_total`, `fixed_ratio`, `essential_fixed_total`, `discretionary_fixed_total`, `essential_variable_total`, `discretionary_variable_total`, `required_spend_total`, `discretionary_spend_total`, `unclassified_total`, `unclassified_count` | 기간 전체의 고정비/변동비/필수/재량/미분류 구조. |
| `/analytics/fixed-cost-trend` | monthly fixed/variable/essential/discretionary/unclassified fields | 월별 고정비 구조 추이. |
| `/analytics/merchant-spend` | `merchant`, `amount`, `count`, `avg_amount`, `last_seen_at` | 거래처별 총액, 빈도, 평균 금액, 마지막 거래일. |
| `/analytics/payment-method-patterns` | `payment_method`, `total_amount`, `transaction_count`, `avg_amount`, `pct_of_total` | 결제수단별 소비 비중. |
| `/analytics/income-stability` | `avg`, `stdev`, `coefficient_of_variation`, `is_partial_period`, `assumptions` | 월별 수입 변동성. backend는 숫자만 제공한다. 안정/불안정 label과 생활 안정성 평가는 에이전트 해석이다. |
| `/analytics/discretionary-velocity` | `period`, `discretionary_spend`, `baseline_monthly_spend`, `velocity_ratio`, `risk_level`, `classification_coverage_ratio`, `assumptions`, `reasons` | 월 진행률 기준 재량 지출 속도 신호. `risk_level`은 최종 구매 허용 판단이 아니라 후보 강도와 분류 신뢰도 안내용이다. |
| `/analytics/spending-review-candidates` | `items[]`, `candidate_key`, `candidate_type`, `candidate_types[]`, `risk_level`, `review_status`, `review_memo`, `reviewed_at`, `cooldown_until`, `review_timing`, `candidate_purpose`, `future_friction_suggestion`, `assumptions`, `reasons` | preferred name for post-transaction discretionary review queue. Legacy `/analytics/purchase-gate-candidates` is kept for compatibility. Fully refunded purchases are excluded and partial refunds are scored by net spend. |
| `/analytics/recurring-payments` | `interval_type`, `avg_interval_days`, `confidence`, `recurring_payment_kind`, kind counts, `transaction_ids` | 거래처별 반복 후보와 저장된 반복분류 상태. `confidence`는 반복 패턴 신호이며 구독 해지/낭비 판단이 아니다. |
| `/installments/forecast` | `items[]`, `monthly_summary[]`, `status` | 할부 원장 기준 회차별 예측. `observed`는 이미 거래가 연결된 회차, `projected`는 미래/현재 미연결 회차, `missed`는 지난 미연결 회차다. projected total은 미래 계획용이며 관측 거래와 이중 계산하지 않는다. |
| `/analytics/spending-anomalies` | `amount`, `baseline_avg`, `delta_pct`, `delta_pct_raw`, `delta_pct_display`, `baseline_quality`, `anomaly_mode`, `anomaly_score` | 기준 월과 baseline window의 category 지출 차이. sparse baseline에서는 raw percent와 표시용 percent를 구분한다. anomaly는 변화 후보이지 문제 지출 확정이 아니다. |
| `/analytics/net-worth-breakdown` | `asset_total`, `liability_total`, `net_worth`, `items[]` | 최신 또는 지정 snapshot의 자산/부채 구성. |
| `/analytics/liquidity-health` | `cash_equivalent_total`, `emergency_fund_months`, `emergency_fund_target_months`, `target_progress_ratio`, `monthly_debt_payment`, `debt_payment_ratio`, `debt_to_asset_ratio`, `confidence`, `assumptions` | 현금성 자산, 비상금 개월 수, 목표 대비 진행률, 부채 부담 추정. `health`는 계산 묶음 이름이며, 실제 재무 건강/위험 판정은 에이전트 해석이다. 입력/분류가 부족하면 confidence와 assumptions를 확인한다. |

## 에이전트 답변 시 주의사항

- 진행월 값에 `income_basis='estimated'`가 붙으면 “관측값”과 “예상값”을 분리해 말한다.
- 대출 상환은 일반 소비와 분리한다. 같은 금액을 고정비와 대출 부담에 이중으로 더하지 않는다.
- `fixed_cost_necessity`는 고정비 호환 필드이고, 필수/재량 분석은 `spend_necessity`를 우선한다.
- 변동비는 별도 필수 지정이 없으면 `discretionary`로 본다. 필수 변동비는 사용자가 `essential`로 명시한 경우만 해당한다.
- `merchant`는 alias rule 적용 전에는 같은 실거래처가 여러 표기로 갈라질 수 있다. 거래처 분석 전 `/operations/auto-classification`의 거래처 정규화 규칙 적용 여부를 확인한다. 정규화 규칙은 raw `description`을 기준으로 `merchant`를 채우며, 수동 수정으로 보이는 `merchant != description` row는 덮어쓰지 않는다. 원본 문구 기준으로 대출 상환을 잡아야 하면 `description` 기준 대출 매칭 규칙을 사용한다.
- 자산이동/이체 별도 tracking은 뒤로 미뤘다. 현재는 월별 현금흐름의 `transfer_activity_total`만 보조 값으로 쓴다.
- `not_recurring`은 “반복 아님으로 검토됨”이지 “거래가 사라짐”이 아니다.
- `unclassified_work_queue`는 지출 규모가 큰 미분류 거래를 우선 노출하므로, 전체 오류 목록이 아니라 개선 우선순위다.
- `health`, `anomaly`, `confidence`, `risk_level`, `priority_score`, `true_spendable` 같은 단어를 사용자 조언으로 바로 번역하지 않는다. 먼저 계산 기준과 데이터 품질 신호로 설명한다.
- `risk_level`은 `/analytics/discretionary-velocity`, `/analytics/purchase-gate-candidates`, `/analytics/liquidity-health`에서 후보 강도/분류 신호를 의미하며 최종 위험 판정이 아니다.
- `/installments/forecast`는 현금흐름 관측치가 아니라 계획/예측 레이어다. projected 구간을 현금흐름 합계에 바로 더하면 이중 계산이 발생한다.
- backend가 label을 제공하지 않는 지표에 임의 등급을 붙일 때는 자체 가정임을 밝힌다.
