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

2026-05-28 기준 결정:

- 다음 단계는 운영 검증만 계속 붙잡지 않고 기능 구현으로 넘어간다.
- 업로드 원본 파일은 `UPLOAD_DIR` 기본값 `/data/uploads`에 최근 5개를 보관한다.
- 자산/투자/대출 snapshot은 우선 업로드될 때만 쌓이는 데이터로 본다. 월말/정기 snapshot 강제 운영은 지금 하지 않는다.
- My Ledge의 1차 역할은 재무 어시스턴트 자체가 아니라, 재무 어시스턴트가 믿고 쓸 canonical view/read model foundation을 제공하는 것이다.
- assistant personality, 말투, 조언 강도는 My Ledge core가 아니라 별도 assistant/consumer layer에서 결정한다.
- canonical layer는 성격을 갖지 않고 `reason`, `confidence`, `assumptions`, `risk_level`, `baseline_delta`, `is_estimated`, `needs_user_review` 같은 판단 재료를 안정적으로 제공한다.
- 어시스턴트 해석에 필요한 주요 요약은 agent가 매번 raw data로 재계산하지 않도록 backend API 또는 canonical read surface로 고정한다.

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
  - 대상: `cost_kind`, `fixed_cost_necessity`, `recurring_payment_kind`, loan-link 후보 누락
  - 우선순위 기준: 분석 영향도, 금액, 반복 가능성
  - 자동 분류를 수행하지 않고 운영 화면/agent workflow의 queue 역할만 맡음

---

## P1 — Advisor Analytics And Finance Assistant Expansion

P1은 지금 당장 구현해야 하는 기능 묶음이라기보다, P0.5 canonical view를 설계할 때 빠뜨리면 안 되는 future consumer requirements다. 즉 P1의 경고/추천/코칭 문구를 지금 만들지는 않되, P0.5 view가 나중에 P1 판단을 계산할 수 있는 재료를 제공해야 한다.

### Recurring / Velocity / Purchase Gate

- `vw_recurring_merchant_monthly`
  - 저장된 `recurring_payment_kind` 수동 분류 결과의 월별 read surface
  - 반복 탐지 confidence와 interval 판단은 API diagnostic에 유지
- discretionary spending velocity
  - 월 진행률 대비 재량 지출 속도 경고
  - 처음에는 강한 제동이 아니라 조용한 참고 신호로 제공한다.
  - `as_of_date`, baseline, threshold가 필요하므로 API/settings contract로 설계
- purchase gate candidates
  - 큰 일회성 지출, 새 거래처, discretionary spike 후보 추출
  - 처음에는 구매 차단이 아니라 후보 탐지/리뷰 흐름으로 시작한다.
  - 후보 기준은 큰 금액, 새 거래처, 평소 대비 급증을 조합한다.
  - threshold가 정책값이므로 settings와 함께 설계

### Asset / Liability Health

- `GET /api/v1/analytics/net-worth-breakdown`
- `GET /api/v1/analytics/investment-performance`
- `GET /api/v1/analytics/debt-burden` 또는 `debt-health`
- `GET /api/v1/analytics/emergency-fund` 또는 `liquidity-health`

주의:

- `GET /api/v1/assets/snapshot-compare`는 이미 live다. 과거 계획의 `/analytics/snapshot-compare`는 중복 구현하지 말고 live assets namespace와 정렬한다.
- 정확하지 않은 값은 `*_est`, `confidence`, `assumptions`를 포함한다.
- liquidity 계산 전 cash-equivalent 분류 기준이 필요하다.
- `emergency-fund` / `liquidity-health` 계산 전 `is_cash_equivalent` 또는 `liquidity_tier` 같은 현금성 자산 분류 기준을 확정한다.
- `debt-burden` / `debt-health` 정확도를 높이려면 대출별 `monthly_payment`와 상환 스케줄/상환 방식 출처가 필요하다. 이 값이 없으면 추정 필드만 제공한다.

### Snapshot Read Models

- `vw_asset_snapshot_canonical`
  - `asset_snapshots`, `loans`, `investments` 간 source-of-truth와 double-count 방지 규칙을 먼저 고정해야 함
- `vw_investment_allocation_snapshot`
  - broker/product type/product 기준 allocation ratio와 previous-snapshot delta

### Data Model Foundations

- cash-equivalent / liquidity tier 분류
  - 대상: 예금, 자유입출금, CMA, 증권 예수금처럼 비상금 계산에 포함할 수 있는 자산
  - 우선은 자동 판정보다 사용자 확인 가능한 규칙/매핑으로 시작한다.
- loan repayment metadata
  - 대상: `monthly_payment`, 상환 방식, 상환 스케줄 출처
  - 대출 snapshot balance/rate/date만으로 계산한 DTI/DSR은 추정치로만 표시한다.

### Transfer Tracking MVP

- `GET /api/v1/transfers/summary`
- `GET /api/v1/transfers`
- `GET /api/v1/transfers/unmatched`

범위:

- raw `type='이체'` 기반 자산 이동을 먼저 다룸
- 대출 원금/이자 상환처럼 `type='지출'`에 섞인 debt movement는 raw type을 바꾸지 않고 파생 레이어로만 처리
- ambiguous row는 review candidate로 남긴다.

---

## P1 — Operations And Data Management

### Merchant Normalization

- `merchant_normalized` 컬럼 또는 `merchant_alias_rules` 테이블 결정
- 결정: 자동 병합보다 수동 alias rule 기반으로 시작한다.
- 실제 데이터 기준 alias 병합/일괄 편집 방식 결정
- merchant baseline, recurring, anomaly 품질 향상을 위한 선행 작업

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

- 수입 분석 페이지
- 자산이동 페이지
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
2. P1은 feature 구현이 아니라 P0.5 view의 future consumer requirements로 계속 참조한다.
3. merchant normalization과 recurring 자동분류를 데이터 품질 개선 묶음으로 진행한다.
4. asset/liability health와 transfer tracking을 별도 feature batch로 진행한다.
5. frontend v2는 현재 main UX 안정화 이후 재개 여부를 다시 결정한다.
