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

## 어떤 surface를 먼저 쓸까

| 질문 유형 | 우선 surface | 보조 surface |
|---|---|---|
| 최근 canonical row를 화면처럼 보고 싶다 | `GET /api/v1/canonical-views/dashboard` | readonly DB의 `vw_*` |
| 거래 drill-down이 필요하다 | `vw_transactions_effective` 또는 `GET /api/v1/transactions` | raw `transactions` |
| 월별 현금흐름/저축률 | `vw_monthly_cashflow` 또는 `GET /api/v1/analytics/monthly-cashflow` | `GET /api/v1/canonical-views/dashboard` |
| 고정비/변동비 구조 | `vw_fixed_cost_monthly_summary` 또는 fixed-cost analytics endpoints | `vw_unclassified_work_queue` |
| 대출 상환 부담 | `vw_loan_repayment_monthly` | `GET /api/v1/loan-transaction-links` |
| 실제 가용 현금 | `vw_true_spendable_monthly` | dashboard endpoint의 estimated enrichment |
| 거래처 baseline 변화 | `vw_merchant_monthly_baseline` | `GET /api/v1/analytics/merchant-spend` |
| 분류 품질 개선 대상 | `vw_unclassified_work_queue` | operations APIs |
| schema 탐색 | `GET /api/v1/schema` | 이 문서와 backend reference |

## `GET /api/v1/canonical-views/dashboard`

P0/P0.5 canonical view의 실제 row 값을 한 번에 반환하는 dashboard API다. 임의 SQL 실행 surface가 아니며, allowlist된 view만 읽는다.

Query:

| 파라미터 | 의미 |
|---|---|
| `months` | 최근 몇 개월의 월별 row를 가져올지. 기본 `12`, 범위 `1..36`. |
| `merchant_limit` | 거래처 baseline row 최대 개수. 기본 `10`, 범위 `1..50`. |
| `queue_limit` | 분류 품질 queue row 최대 개수. 기본 `10`, 범위 `1..50`. |

Response groups:

| 필드 | 출처 | 의미 |
|---|---|---|
| `monthly_cashflow[]` | `vw_monthly_cashflow` | 월별 수입, 지출, 대출상환, 이체 활동, 고정/변동 지출, 저축률. |
| `true_spendable_monthly[]` | `vw_true_spendable_monthly` + API enrichment | 대출 상환과 고정 지출을 뺀 실제 가용 현금. 진행월 수입이 아직 관측되지 않았을 때 예상 수입 필드를 추가할 수 있다. |
| `loan_repayment_monthly[]` | `vw_loan_repayment_monthly` | 대출 계좌와 상환 유형별 월 상환액. |
| `merchant_monthly_baseline[]` | `vw_merchant_monthly_baseline` | 거래처별 월 지출과 직전 3개 active month baseline 대비 변화. |
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

예상 수입은 현재 월 row에서 관측 수입이 최근 수입 baseline의 50% 미만일 때만 붙는다. DB view 원본 값은 바꾸지 않는다.

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
| `description` | 원본 거래 설명. |
| `merchant` | 분석용 거래처명. 기본은 `description`에서 시작하고 사용자가 수정할 수 있다. |
| `amount`, `currency`, `payment_method` | 원본 금액, 통화, 결제수단. |
| `cost_kind` | `fixed`, `variable`, 또는 `null`. 고정비/변동비 분류다. |
| `fixed_cost_necessity` | `essential`, `discretionary`, 또는 `null`. 고정비일 때 필수/비필수 성격이다. |
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
| `unclassified_total` | `cost_kind is null`인 일반 지출 금액. |
| `unclassified_count` | `cost_kind is null`인 일반 지출 건수. |

### `vw_merchant_monthly_baseline`

거래처별 월 지출 baseline surface다.

| 컬럼 | 의미/계산 |
|---|---|
| `period` | `YYYY-MM`. |
| `merchant` | canonical 거래처명. 아직 alias/정규화 모델은 없다. |
| `effective_category_major`, `effective_category_minor` | 사용자 수정 우선 카테고리. |
| `monthly_spend` | 일반 지출의 `-amount` 월합계. 대출 연결 상환 제외. |
| `transaction_count` | 해당 월/거래처/category group 거래 건수. |
| `baseline_month_count` | 같은 거래처/category group의 직전 active month 개수. 최대 3. |
| `trailing_3_month_avg` | 직전 3개 active month의 `monthly_spend` 평균. 기준 부족 시 `null`. |
| `baseline_delta` | `monthly_spend - trailing_3_month_avg`. |
| `baseline_delta_pct` | `baseline_delta / trailing_3_month_avg`. baseline이 없거나 0이면 `null`. |

주의: 없는 달을 0으로 채우는 rolling calendar baseline이 아니라, 해당 거래처/category가 발생한 active month 기준 window다.

### `vw_unclassified_work_queue`

분류 품질 개선이 필요한 거래 queue다. “분석 결과”라기보다 “다음에 정리하면 좋은 데이터 품질 작업”으로 해석한다.

| 컬럼 | 의미/계산 |
|---|---|
| `transaction_id`, `date`, `type`, `merchant`, `effective_category_*`, `amount` | 후보 거래 기본 정보. |
| `amount_abs` | `abs(amount)`. 우선순위 점수에 사용한다. |
| `needs_cost_kind` | 일반 지출인데 `cost_kind`가 비어 있음. |
| `needs_fixed_cost_necessity` | `cost_kind='fixed'`인데 `fixed_cost_necessity`가 비어 있음. |
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
| `/analytics/fixed-cost-summary` | `expense_total`, `fixed_total`, `variable_total`, `fixed_ratio`, `essential_fixed_total`, `discretionary_fixed_total`, `unclassified_total`, `unclassified_count` | 기간 전체의 고정비/변동비/미분류 구조. |
| `/analytics/fixed-cost-trend` | monthly fixed/variable/essential/discretionary/unclassified fields | 월별 고정비 구조 추이. |
| `/analytics/merchant-spend` | `merchant`, `amount`, `count`, `avg_amount`, `last_seen_at` | 거래처별 총액, 빈도, 평균 금액, 마지막 거래일. |
| `/analytics/payment-method-patterns` | `payment_method`, `total_amount`, `transaction_count`, `avg_amount`, `pct_of_total` | 결제수단별 소비 비중. |
| `/analytics/income-stability` | `avg`, `stdev`, `coefficient_of_variation`, `is_partial_period`, `assumptions` | 월별 수입 변동성. backend는 숫자만 제공하고 안정/불안정 label은 frontend 해석이다. |
| `/analytics/recurring-payments` | `interval_type`, `avg_interval_days`, `confidence`, `recurring_payment_kind`, kind counts, `transaction_ids` | 거래처별 반복 후보와 저장된 반복분류 상태. |
| `/analytics/spending-anomalies` | `amount`, `baseline_avg`, `delta_pct`, `anomaly_score` | 기준 월과 baseline window의 category 지출 차이. 설정 우선순위는 query > persisted setting > code default. |

## 에이전트 답변 시 주의사항

- 진행월 값에 `income_basis='estimated'`가 붙으면 “관측값”과 “예상값”을 분리해 말한다.
- 대출 상환은 일반 소비와 분리한다. 같은 금액을 고정비와 대출 부담에 이중으로 더하지 않는다.
- `merchant`는 아직 정규화되지 않았다. 같은 실거래처가 여러 표기로 갈라질 수 있다.
- `not_recurring`은 “반복 아님으로 검토됨”이지 “거래가 사라짐”이 아니다.
- `unclassified_work_queue`는 지출 규모가 큰 미분류 거래를 우선 노출하므로, 전체 오류 목록이 아니라 개선 우선순위다.
- backend가 label을 제공하지 않는 지표에 임의 등급을 붙일 때는 자체 가정임을 밝힌다.
