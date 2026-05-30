# Planned Work

이 문서는 현재 코드에는 아직 없지만 문서나 계획에 남아 있는 작업을 한 곳에 모은 backlog다.

우선순위 기준:

- **P0:** 기존 기능의 신뢰도, 운영 검증, 에이전트 read contract 안정성에 직접 영향
- **P1:** 재무 어시스턴트 기능 확장에 필요하지만 현재 live 기능을 막지는 않음
- **P2:** 큰 구조 변경, 장기 제품 방향, 또는 별도 승인 후 진행할 실험
- **Paused:** 명시적으로 보류된 작업
- **Stale:** 과거 계획 문서에 남아 있지만 현재 live 상태 기준 backlog로 보지 않는 항목

현재 live contract는 코드와 `docs/backend-api-ssot.md`가 우선한다. `PRD.md`와 `docs/superpowers/plans/**`는 제품/실행 계획으로 참고하되, live 여부 판단에는 사용하지 않는다.

## Product Direction Decisions

2026-05-30 기준 결정:

- 다음 단계는 운영 검증만 계속 붙잡지 않고 기능 구현으로 넘어간다.
- 업로드 원본 파일은 `UPLOAD_DIR` 기본값 `/data/uploads`에 최근 5개를 보관한다.
- 자산/투자/대출 snapshot은 우선 업로드될 때만 쌓이는 데이터로 본다. 월말/정기 snapshot 강제 운영은 지금 하지 않는다.
- My Ledge의 1차 역할은 재무 어시스턴트 자체가 아니라, 재무 어시스턴트가 믿고 쓸 canonical view/read model foundation을 제공하는 것이다.
- assistant personality, 말투, 조언 강도는 My Ledge core가 아니라 별도 assistant/consumer layer에서 결정한다.
- canonical layer는 성격을 갖지 않고 `reason`, `confidence`, `assumptions`, `risk_level`, `baseline_delta`, `is_estimated`, `needs_user_review` 같은 판단 재료를 안정적으로 제공한다.
- 어시스턴트 해석에 필요한 주요 요약은 agent가 매번 raw data로 재계산하지 않도록 backend API 또는 canonical read surface로 고정한다.
- My Ledge는 구매/소비에 대한 최종 규범적 판단을 내리지 않는다. 재현 가능한 계산, threshold 적용, 후보 탐지, 근거, confidence, assumptions, review workflow 상태까지만 책임지고, 에이전트가 사용자 맥락을 반영해 최종 해석과 조언을 만든다.
- `risk_level`은 "사지 마라/사도 된다" 같은 최종 결정이 아니라 데이터 신호 강도 또는 검토 우선순위로 해석한다. 사용자에게 전달되는 말투, 개입 강도, 행동 제안은 에이전트/consumer layer 책임이다.
- 투자 성과/상품 배분/수익률 분석은 증권사 API 연동 이후로 미룬다.
- 자산이동/이체 tracking은 현재 사용자 가치가 낮으므로 우선순위를 가장 뒤로 미룬다. `transfer_activity_total` 같은 기존 현금흐름 보조 값만 유지하고 별도 transfer 화면/API는 P2 뒤쪽으로 둔다.

---

## My Ledge / Agent Responsibility Boundary

재무 어시스턴트 기능을 구현할 때 My Ledge와 외부 에이전트의 책임을 다음처럼 나눈다.

### My Ledge가 책임지는 것

- 재현 가능한 계산과 canonical read surface 제공.
- baseline, threshold, 진행률, outlier/partial-period 처리 같은 반복 계산.
- `spend_necessity`, 대출 상환 연결, true spendable, 거래처 baseline 등 이미 정의된 canonical 의미 적용.
- 검토 후보 탐지와 후보가 된 근거 제공.
- `risk_level` 또는 `review_priority` 같은 데이터 신호 강도 산출.
- `confidence`, `assumptions`, `classification_coverage_ratio`, `unclassified_*`처럼 값의 신뢰도를 판단할 수 있는 재료 제공.
- threshold/settings 저장과 적용. 에이전트별 memory에 정책값을 흩뜨리지 않는다.
- 후보 review workflow 상태 저장. 예: `pending`, `reviewed`, `ignored`, `snoozed`, `approved`, `dismissed`, `memo`, `reviewed_at`, `cooldown_until`.

### My Ledge가 하지 않는 것

- "사라", "사지 마라", "괜찮다" 같은 최종 구매/소비 판단.
- 사용자 대화 맥락, 업무상 필요성, 감정 상태, 말투, 개입 강도 추론.
- assistant personality 반영.
- raw transaction을 임의로 재해석해 조언 문장을 생성하는 일.

### 에이전트가 책임지는 것

- My Ledge API 결과를 사용자 맥락에 맞게 해석.
- 대화 맥락, 현재 목표, 업무상 필요, 최근 소비 의도, 심리적 부담을 반영한 최종 조언.
- 구매 decision memo 작성.
- 사용자에게 가볍게 알릴지, 질문으로 유도할지, 강하게 제동할지 결정.
- settings 변경이 필요하면 제안할 수 있지만, 실제 기준값은 My Ledge settings API를 통해 명시적으로 저장한다.

요약하면 My Ledge는 "이 거래/지표는 이런 이유로 검토 후보입니다"까지 제공하고, 에이전트는 "그래서 지금 사용자에게 어떤 의미인지"를 판단한다.

---

## Recently Implemented

2026-05-28 구현 완료:

- 업로드 원본 파일 retention
  - `POST /api/v1/upload` 경로에서 원본 파일을 `UPLOAD_DIR`에 저장한다.
  - 저장 후 최신 5개만 남기고 오래된 원본 파일을 삭제한다.
- P0/P0.5 canonical read model expansion
  - `vw_monthly_cashflow`
  - `vw_loan_repayment_monthly`
  - `vw_true_spendable_monthly`
  - `vw_merchant_monthly_baseline`
  - `vw_unclassified_work_queue`
  - `vw_fixed_cost_monthly_summary`는 loan-linked repayment를 ordinary fixed/variable total에서 제외하도록 정렬했다.
- 반복결제 카테고리 규칙 1차 구현
  - `recurring_category_rules`와 `/api/v1/auto-classification/recurring-category-rules`를 추가했다.
  - 기존 `recurring_payment_kind`를 덮지 않고, 반복 후보 또는 고정비 거래에만 카테고리 기반 반복결제 성격을 채운다.
  - `/operations/auto-classification`에서 저장, 일괄 적용, 업로드 후 자동 적용을 제공한다.

2026-05-30 구현 완료:

- P1 advisor surface 1-4
  - 모든 일반 지출에 적용 가능한 `spend_necessity` 축을 추가했다. `cost_kind`는 고정/변동, `spend_necessity`는 필수/재량을 의미한다.
  - `category_classification_rules`가 `spend_necessity`를 저장/적용하고, `/operations/auto-classification`과 `/operations/workbench`에서 필수/재량을 볼 수 있다.
  - `merchant_alias_rules`와 거래처 정규화 API/UI를 추가했다.
  - `vw_recurring_merchant_monthly`와 canonical dashboard 반복 거래처 섹션을 추가했다.
  - `GET /api/v1/analytics/net-worth-breakdown`, `GET /api/v1/analytics/liquidity-health`와 자산 화면 유동성 Health 섹션을 추가했다.
  - 투자 성과/배분 UI는 증권사 API 이후 보강한다는 안내만 남기고 우선순위에서 내렸다.

---

## P0 — Stabilization And Contract Hygiene

### 운영/검증 방침

- 새 기능 구현으로 넘어가되, 아래 운영 검증은 구현 batch의 acceptance check로 유지한다.
- 운영 배포본 기준 smoke capture 수집
  - 대상: overview, spending, assets, insights, operations workbench, loan mapping
  - 확인: API proxy, runtime config, 주요 chart/table 렌더링, console error
- `GET /api/v1/assets/snapshot-compare` 소비 화면 smoke 또는 screenshot 확보
- legacy redirect 브라우저 확인
  - `/spending` -> `/analysis/spending`
  - `/assets` -> `/analysis/assets`
  - `/data` -> `/operations/workbench`

### 문서/운영 contract 정리

- `verify_import_parity` 범위 결정
  - 현재 sample presence 검증 수준으로 문서화할지
  - rolling-window overlap extra-row 검증까지 확장할지 결정
- 자산/투자/대출 snapshot coverage 운영 방식 결정
  - 결정: 우선 업로드될 때만 쌓이는 sparse snapshot으로 본다.
  - 월별/마감일 기준 snapshot 확보는 지금 운영 절차로 강제하지 않는다.

### Frontend 검증 보강

- Workbench bulk toolbar / mutation success-error 흐름 테스트 추가
- topbar meta lifecycle 및 canonical route metadata 테스트 추가
- 운영 배포본 기준 mobile/desktop smoke capture 최신화

---

## P0.5 — Canonical Read Model Expansion

상태: 2026-05-28 구현 완료. 아래 내용은 live contract 요약과 향후 consumer가 지켜야 할 해석 기준이다.

목적은 API를 중복 구현하는 것이 아니라, readonly SQL과 외부 에이전트가 같은 재무 해석 기준을 재사용하도록 DB read model을 안정화하는 것이다.

공통 규칙:

- source는 `vw_transactions_effective` semantics를 따른다.
- 지출은 `-amount`로 양수화한다.
- `type='지출'` 이면서 양수인 환불/취소 row는 월별 지출을 줄이는 값으로 처리한다.
- 대출 연결 거래는 일반 소비 breakdown과 분리한다.
- 월별 view는 `expense_total`, `loan_repayment_total`, `non_loan_expense_total`을 함께 노출해 double count를 막는다.
- `fixed_total`, `variable_total`, `essential_fixed_total`, `discretionary_fixed_total`은 기본적으로 `loan_account_id IS NULL`인 지출만 대상으로 한다.
- `as_of_date`, threshold, baseline 개월 수가 필요한 판단은 plain DB view가 아니라 API/settings contract로 둔다.

확정된 제품 해석:

- 대출 상환은 일반 소비와 분리한다.
- “이번 달 쓸 수 있는 돈”은 두 값을 모두 제공한다.
  - 변동비 쓰기 전 가용액
  - 변동비까지 쓴 뒤 남은액
- 거래처 baseline은 최근 3개월 평균과 증감을 포함한다.
- 미분류 queue 우선순위는 분석 영향도, 금액, 반복 가능성을 함께 본다.

### P0 Aggregate Views

- `vw_monthly_cashflow`
  - 월별 수입, 지출, 이체 활동, 대출 상환, fixed/variable, 순현금흐름
  - 핵심 필드: `income_total`, `expense_total`, `non_loan_expense_total`, `transfer_activity_total`, `loan_repayment_total`, `fixed_total`, `variable_total`, `unclassified_expense_total`, `net_cashflow`, `savings_rate`
- `vw_loan_repayment_monthly`
  - `loan_transaction_links` 기준으로 연결 완료된 대출 상환만 집계
  - 미연결 후보는 이 view에 섞지 않고 work queue에서 다룸
- `vw_true_spendable_monthly`
  - `spendable_before_variable_spend`: 수입에서 대출 상환과 fixed commitments를 뺀 금액
  - `remaining_after_variable_spend`: observed variable spending까지 반영한 잔여 금액
- `vw_merchant_monthly_baseline`
  - canonical `merchant`, effective category 기준 월별 baseline
  - 최근 3개월 trailing closed-month average와 delta를 제공
  - current partial month 비교는 API metadata에서 처리

### P0.5 Data Quality View

- `vw_unclassified_work_queue`
  - 분석 품질을 떨어뜨리는 거래를 우선순위별로 노출
  - 대상: `cost_kind`, `fixed_cost_necessity`, 월 단위 반복 신호가 있는 `recurring_payment_kind`, loan-link 후보 누락
  - 반복분류 후보는 같은 거래처 2건만으로 판단하지 않고, 서로 다른 월/날짜와 금액 안정성을 요구해 같은 날 분할 구매를 제외
  - 우선순위 기준: 분석 영향도, 금액, 반복 가능성
  - 자동 분류를 수행하지 않고 운영 화면/agent workflow의 queue 역할만 맡음

---

## P1 — Next Implementation: Advisor Analytics And Finance Assistant Expansion

P1은 투자 성과/배분을 제외하고 다음 구현 우선순위로 올린다. 목표는 조언 문구를 먼저 만드는 것이 아니라, advisor가 계산을 재사용할 수 있도록 고정/변동과 필수/재량을 독립 축으로 정리하고, 반복/속도/구매후보/유동성/부채 read surface를 안정화하는 것이다.

투자 관련 분석은 증권사 API가 준비된 뒤 보강한다. 현재 업로드 snapshot의 투자 값은 순자산 계산에서 필요하면 총액 수준의 참고값으로만 쓰고, 투자 성과/상품 배분/수익률 판단은 P2로 미룬다.

### Recurring / Velocity / Purchase Gate

- `vw_recurring_merchant_monthly` — live
  - 저장된 `recurring_payment_kind` 수동 분류 결과의 월별 read surface
  - 반복 탐지 confidence와 interval 판단은 API diagnostic에 유지
- discretionary spending velocity
  - 월 진행률 대비 재량 지출 속도 경고
  - 처음에는 강한 제동이 아니라 조용한 참고 신호로 제공한다.
  - `as_of_date`, baseline, threshold가 필요하므로 API/settings contract로 설계
  - 재량 지출은 `cost_kind='variable'` 전체가 아니라 `spend_necessity='discretionary'`인 지출을 기준으로 계산한다.
  - 필수 변동비는 재량 속도 경고에서 제외한다.
  - endpoint 후보는 `GET /api/v1/analytics/discretionary-velocity`.
  - `baseline_spend_at_same_progress`는 1차 구현에서 trailing closed-month 재량 지출 baseline에 `month_progress_ratio`를 곱한 prorated 값으로 시작하고, daily cumulative baseline은 후속 고도화로 둔다.
  - 응답에는 `period`, `as_of_date`, `month_progress_ratio`, `discretionary_spend`, `baseline_spend_at_same_progress`, `velocity_ratio`, `risk_level` 또는 `review_priority`, `confidence`, `reasons`, `assumptions`를 포함한다.
  - 분류 품질이 낮을 때 해석이 흔들리지 않도록 `unclassified_spend`, `classification_coverage_ratio`를 포함한다.
  - 진행월 수입이 estimated라면 `income_basis`나 assumptions로 명시한다.
- purchase gate candidates
  - 큰 일회성 지출, 새 거래처, discretionary spike 후보 추출
  - 처음에는 구매 차단이 아니라 후보 탐지/리뷰 흐름으로 시작한다.
  - 후보 기준은 큰 금액, 새 거래처, 평소 대비 급증을 조합한다.
  - threshold가 정책값이므로 settings와 함께 설계
  - endpoint는 후보 중심의 `GET /api/v1/analytics/purchase-gate-candidates`를 우선한다. `should-i-buy`처럼 최종 판단처럼 보이는 이름은 쓰지 않는다.
  - API는 "구매 금지/허용"이 아니라 `candidate_type`, `transaction_id`, `candidate_key`, `signals`, `risk_level` 또는 `review_priority`, `confidence`, `suggested_review_window`, `reasons`, `assumptions`를 제공한다.
  - `candidate_key`는 review 상태 저장을 위해 안정적으로 만들어야 한다. 1차 후보는 `(candidate_type, transaction_id)` 기반으로 충분하다.
  - 후보 상태 저장은 My Ledge 책임이다. 사용자가 후보를 무시/보류/승인/검토 완료한 이력과 cooldown은 에이전트 memory가 아니라 backend data로 둔다.
  - 최종 구매 조언, 보류 권유, 대체안 제안, 말투/개입 강도는 에이전트가 맡는다.

### Advisor Settings Contract

- velocity / purchase gate threshold와 정책값은 `GET/PATCH /api/v1/settings/analytics` 확장으로 관리한다.
- 에이전트별 memory에 threshold를 저장하지 않는다. frontend, backend, agent가 같은 기준을 공유해야 한다.
- 설정은 섹션별로 나누는 방향이 좋다.
  - `discretionary_velocity`: baseline months, warning threshold, high threshold, minimum classification coverage.
  - `purchase_gate`: large purchase threshold, min candidate amount, new merchant lookback months, review cooldown period, candidate risk threshold.
  - 공통 제외 규칙: excluded categories, excluded merchants.
- 에이전트는 설정 변경을 제안할 수 있지만, 실제 변경은 사용자의 명시적 의사와 settings API 저장을 통해 처리한다.

### Asset / Liability Health

- `GET /api/v1/analytics/net-worth-breakdown` — live
- `GET /api/v1/analytics/liquidity-health` — live
- 별도 `debt-burden` endpoint는 만들지 않고, 현재는 `liquidity-health` 응답의 `monthly_debt_payment`, `debt_payment_ratio`, `debt_to_asset_ratio`로 부채 부담을 함께 제공한다.

주의:

- `GET /api/v1/assets/snapshot-compare`는 이미 live다. 과거 계획의 `/analytics/snapshot-compare`는 중복 구현하지 말고 live assets namespace와 정렬한다.
- 정확하지 않은 값은 `*_est`, `confidence`, `assumptions`를 포함한다.
- liquidity 계산 전 cash-equivalent 분류 기준이 필요하다.
- `emergency-fund` / `liquidity-health`는 `is_cash_equivalent` 또는 `liquidity_tier`를 우선 사용하고, 기존 데이터가 비어 있으면 보수적 추정과 assumptions를 제공한다.
- `debt-burden` / `debt-health` 정확도를 높이려면 대출별 `monthly_payment`와 상환 스케줄/상환 방식 출처가 필요하다. 이 값이 없으면 추정 필드만 제공한다.
- 투자 성과/상품 배분/수익률은 증권사 API 연동 이후 P2에서 다룬다.

### Snapshot Read Models

- `vw_asset_snapshot_canonical`
  - `asset_snapshots`, `loans` 중심의 source-of-truth와 double-count 방지 규칙을 먼저 고정해야 함
  - 투자 snapshot은 총액 참고값으로만 취급하고, 상품별 성과/배분 view는 P2로 미룸

### Data Model Foundations

- expense necessity axis — live
  - 현재 `fixed_cost_necessity`는 고정비에만 필수/재량을 붙이므로 변동비 필수 지출을 표현하지 못한다.
  - canonical 축은 `spend_necessity`로 두고 `essential` / `discretionary`를 모든 일반 지출에 적용한다.
  - `cost_kind`는 반복성/예측성(`fixed` / `variable`)만 표현하고, `spend_necessity`는 필요성/통제가능성을 표현한다.
  - `fixed_cost_necessity`는 기존 API/UI 호환 필드로 남기되, 장기적으로는 `spend_necessity`에서 파생하거나 migration한다.
  - 재량 지출 계산은 `discretionary_fixed_total + discretionary_variable_total`을 기본으로 한다.
  - 필수 지출 계산은 `essential_fixed_total + essential_variable_total + loan_repayment_total`을 기본으로 한다.
- cash-equivalent / liquidity tier 분류 — live foundation
  - 대상: 예금, 자유입출금, CMA, 증권 예수금처럼 비상금 계산에 포함할 수 있는 자산
  - `asset_snapshots.liquidity_tier`, `asset_snapshots.is_cash_equivalent`를 저장한다. 값이 없으면 service가 자산 타입/카테고리명으로 보수적으로 추정하고 `confidence`/`assumptions`에 남긴다.
- loan repayment metadata — live foundation
  - 대상: `monthly_payment`, 상환 방식, 상환 스케줄 출처
  - 대출 snapshot balance/rate/date만으로 계산한 DTI/DSR은 추정치로만 표시한다.
  - `loans.monthly_payment`, `loans.repayment_method`를 저장한다. 월상환액이 없으면 `liquidity-health`는 monthly debt payment를 0으로 두고 assumptions에 남긴다.

### Transfer Tracking MVP

- `GET /api/v1/transfers/summary`
- `GET /api/v1/transfers`
- `GET /api/v1/transfers/unmatched`

상태: 사용자 요청으로 P2 뒤쪽으로 이동. 지금은 별도 구현하지 않는다.

범위:

- raw `type='이체'` 기반 자산 이동을 먼저 다룸
- 대출 원금/이자 상환처럼 `type='지출'`에 섞인 debt movement는 raw type을 바꾸지 않고 파생 레이어로만 처리
- ambiguous row는 review candidate로 남긴다.

---

## P1 — Operations And Data Management

### Merchant Normalization

상태: live.

- `merchant_alias_rules` 테이블 기반으로 시작한다.
- 원본 설명(`description`)의 포함 패턴(`alias_pattern`)을 분석용 거래처(`merchant`)의 canonical 거래처명(`normalized_merchant`)으로 일괄 반영한다.
- `merchant != description`인 row는 사용자가 이미 분석용 거래처를 수정한 것으로 보고 자동 정규화에서 보존한다.
- `/operations/auto-classification`에서 저장/일괄 적용한다.
- merchant baseline, recurring, anomaly 품질 향상을 위한 선행 작업이다.

### Classification Automation

이미 live:

- category -> `cost_kind` / `fixed_cost_necessity` 자동분류 규칙
- merchant -> loan account 자동연결 규칙

미구현:

- `recurring_payment_kind` 자동분류
- 반복 후보 그룹 탐지 결과와 카테고리 힌트를 함께 쓰는 dry-run contract
- 자동 저장하지 않고 dry-run 후보를 먼저 보여준다.
- 사용자가 승인한 뒤 bulk 반영하는 운영 화면

### Bulk Operations

- bulk delete / bulk restore API 및 frontend 연결
- bulk 기능은 허용하되, 백업/복구 안전장치를 전제로 한다.
- bulk mutation success/error 흐름 테스트 보강

### Description Override

- `description_user` nullable 컬럼 추가
- `effective_description` canonical read path 추가
- rolling import 시 사용자 수정 설명 이월
- 설명 단건/다건 수정 UI와 회귀 테스트
- 거래 설명 직접 수정 기능은 제품 범위에 포함한다.

---

## P2 — Frontend And UX Follow-Up

### Settings / Token Lab

이미 live:

- persisted analytics settings backend
- `GET/PATCH /api/v1/settings/analytics`
- `spending-anomalies` 설정 precedence: query param > persisted setting > code default

미구현:

- `/settings` route와 shell 하단 settings entry
  - Settings는 실제 사용자 기능으로 만든다.
- analytics settings frontend panel
- temporary token lab
  - Token Lab은 개발/리뷰용 도구로 둔다.
- token preset export/import/reset
- frontend token lab 문서화

### Frontend v2 Full Reimplementation

상태:

- `feat/frontend-v2` 브랜치 기준 Task 1-6 완료
- 사용자 요청으로 보류

남은 작업:

- Task 7: 개요 페이지
- Task 8: 지출 분석 페이지
- Task 9: 자산 현황 페이지
- Task 10: 인사이트 페이지
- Task 11: 거래 작업대
- Task 12: 최종 검증과 STATUS 업데이트

판단:

- 현재 main frontend가 live 기능을 제공하므로, v2는 active blocker가 아니라 paused rewrite다.
- 프론트엔드는 v2 전면 재구현보다 현재 main 기준 개선을 우선한다.

### Frontend Cleanup / Polish

- legacy 컴포넌트 정리
- 운영 배포본 smoke capture 최신화
- bundle/chunk warning 정리
- `npm audit` moderate 취약점 5건 후속 검토
- 다크모드/테마 시스템 확장 여부 결정

---

## P2 — Product Expansion

- 증권사 API 연동 이후 투자 분석 보강
  - `GET /api/v1/analytics/investment-performance`
  - `vw_investment_allocation_snapshot`
  - broker/product type/product 기준 allocation ratio와 previous-snapshot delta
  - 매수/매도/입출금 cashflow 기반 수익률과 성과 attribution
- 수입 분석 페이지
- 자산이동/이체 tracking 및 화면
  - 현재 우선순위는 가장 뒤쪽이다.
  - 구현 전까지는 `vw_monthly_cashflow.transfer_activity_total`만 보조 값으로 유지한다.
- 자동 백업 크론
- 도메인 연결 + HTTPS
- budgets / financial goals / advice preferences
- health score / personalized coaching

이 항목들은 제품 방향으로는 남아 있지만, 현재 안정화나 advisor canonical read model 구현의 선행 조건은 아니다.
예산, 목표, 조언 선호도는 장기 제품 범위에 포함한다.

---

## Stale Or Historical Items

아래 항목은 문서에 남아 있어도 현재 backlog로 보지 않는다.

- 과거 `PRD.md` Phase 1-3 unchecked milestone 항목
  - 현재 PRD는 `docs/planned-work.md`를 가리키도록 정리했다.
  - 남아 있는 과거 diff나 archive의 Phase 1-3 unchecked task는 current backlog가 아니다.
- `docs/archive/planning/finance-advisor-analytics-expansion.md`
  - historical planning 문서다.
  - 현재 live backend/API 판단은 `docs/backend-api-ssot.md`를 따른다.
- `docs/archive/**`
  - archive된 frontend spec/plan의 unchecked task는 현재 backlog가 아니다.
- `docs/superpowers/plans/2026-03-23-*`, `2026-03-24-*`, `2026-03-26-*`
  - Phase 1/2 구현 당시 계획이다.
  - 미체크 박스가 남아 있어도 현재 live 상태와 다를 수 있다.

---

## Recommended Execution Order

1. 기능 구현으로 넘어가되, P0 운영 검증과 contract 정리는 각 구현 batch의 acceptance check로 수행한다.
2. 투자 분석과 자산이동/이체 tracking은 뒤로 미룬다.
3. 다음 batch는 discretionary spending velocity와 purchase gate candidates를 우선 검토한다.
4. recurring 자동분류 dry-run/승인 흐름을 별도 batch로 진행한다.
5. bulk delete/restore, description override 같은 operations 후속을 진행한다.
6. frontend v2는 현재 main UX 안정화 이후 재개 여부를 다시 결정한다.
