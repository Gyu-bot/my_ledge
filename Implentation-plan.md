# My Ledge 사용자 로드맵

생성일: 2026-06-26
문서 성격: 사용자용 프로젝트 상태와 로드맵
상태: 활성

> 파일명은 사용자 요청의 철자 그대로 `Implentation-plan.md`를 사용한다.

## 목적

이 문서는 사용자가 현재까지 구현된 항목, 남아 있는 항목, 그리고 각 항목이 어떤 제품 방향을 뒷받침하는지 확인하기 위한 사용자용 문서다.

## 운영 방식

- 이 파일은 사람이 읽는 로드맵/상태 문서이며, 에이전트가 그대로 실행하는 OMO 작업 계획이 아니다.
- 에이전트 실행 계획은 `.omo/plans/<slug>.md` 아래에 둔다.
- 이 파일에서는 완료된 작업, 남은 작업, 우선순위, 막힌 지점, 제품 의도를 확인한다.
- 구현은 승인된 `.omo/plans/<slug>.md`에서만 시작한다. 적절한 실행 계획이 없으면 `omo:ulw-plan`으로 먼저 만든다.
- 코드와 live contract가 이 로드맵보다 우선한다. 실제 구현 상태가 다르면 사용자용 로드맵/상태 동기화로 이 파일을 갱신한다.
- API, schema, canonical view, route, component contract 변경은 가능하면 같은 PR에서 관련 source-of-truth 문서도 함께 갱신한다.
- workbook 동작에 의존하는 작업의 실데이터 검증은 `tmp/2025-05-21~2026-05-21.xlsx`를 사용한다.
- `docs/STATUS.md`는 deprecated pointer이며 더 이상 handoff 문서로 유지하지 않는다.

## 상태값

- `바로 시작 가능`: 지금 착수할 수 있다.
- `계획됨`: 유효한 백로그이지만 선행 조건이나 범위 순서가 남아 있다.
- `진행 중`: 현재 작업 중이다.
- `완료`: 완료 기준을 만족했고 검증되었다.
- `막힘`: 외부 결정, 데이터, 인증 정보, 문서가 필요하다.
- `보류`: 이후 제품/아키텍처 시점까지 의도적으로 미룬다.

## 우선순위 기준

- `P0`: 계산 정확성, 데이터 신뢰, source lifecycle, agent read contract 리스크.
- `P1`: 중요한 workflow, review, automation, advisor 품질 개선.
- `P1.5`: 핵심 P0/P1 이후에 가치 있는 hardening.
- `P2`: 더 큰 제품 확장 또는 구조 변경.

## 참고 문서

- 저장소 운영 규칙: `AGENTS.md`와 가장 가까운 하위 `AGENTS.md`
- 사용자용 로드맵/상태: `Implentation-plan.md`
- OMO 실행 계획 색인: `.omo/plans/index.md`
- OMO 실행 계획: `.omo/plans/<slug>.md`
- live API contract: `docs/backend-api-ssot.md`
- 상세 API/metric reference: `docs/backend-api-and-metrics-reference.md`
- agent canonical 값 사전: `docs/agents/canonical-read-surface-reference.md`
- frontend contract: `docs/frontend-design-tokens.md`, `docs/frontend/components-and-design-token-inventory.md`, `docs/frontend/page-wireframes.md`, `docs/frontend-reimplementation-wireframe-functional-requirements.md`
- 아카이브된 백로그 출처: `docs/archive/planning/2026-06-10-planned-work.md`
- 아카이브된 advisor 실행 출처: `docs/archive/planning/2026-06-10-advisor-canonical-gap-priority.md`
- advisor gap 분석 근거: `docs/advisor-canonical-gap-analysis.md`
- 유지할 기능 로드맵 출처: 사용자가 제공한 `my_ledge_kept_features.md`, 2026-06-25에 이 문서로 반영됨

---

## 현재 사용자용 작업 큐

1. `T012`/`T012A`와 GitHub Issue 기반 agent contract 작업 `T023`-`T029`는 `codex/ready-plan-tasks`에서 구현되었고, GitHub Issues `#7`-`#14`는 완료로 닫혔다.
2. frontend remake PR `#15`가 `main`에 반영되었다. frontend 의존 settings/smoke 작업은 이제 remake line 보류가 아니라 새 `/data/*`와 `/data/settings` 화면을 기준으로 진행할 수 있다.
3. P0 거래 신뢰도 기반 작업 `T030`-`T032`는 완료되었다: source lifecycle, upload preview/reconciliation, shared settlement groups 순서로 구현했다.
4. `T015`-`T018`과 `T016A`는 source 선택/reconciliation 실행 흐름으로 유지한다. 유지할 기능 로드맵의 세부사항은 별도 asset-source task ID로 중복하지 않고 기존 작업에 반영했다. `T019`는 공식 Toss Securities API 문서가 있어야 진행할 수 있다.
5. `T033`-`T039`와 `T041`은 거래 신뢰도 작업 이후의 automation, forecasting, decision-support, 제한적 tagging 백로그로 유지한다. 각 항목은 선행 조건이 충족된 뒤 집중된 PR로 시작한다.

---

## 기능 단위별 목차

| 기능 단위 | 관련 Task | 현재 보기 |
|---|---|---|
| 운영/로드맵 문서 전환 | `T000` | 완료 |
| 계산 정확성과 agent read contract 기반 | `T001`-`T012A` | 완료 중심 |
| 사용자 화면과 운영 확인 | `T013`-`T014` | 바로 시작 가능 |
| 자산/투자 source와 provenance | `T015`-`T019` | `T015`-`T018`/`T016A` 바로 시작 가능, `T019` 막힘 |
| 보류/제품 구조 | `T020`-`T022` | 보류/완료/계획 |
| issue 기반 agent contract 보강 | `T023`-`T029` | 완료 |
| 다음 P0 거래 신뢰도 | `T030`-`T032` | 완료 |
| 거래 신뢰 이후 자동화와 의사결정 지원 | `T033`-`T039`, `T041` | 계획됨 |

---

## 로드맵 항목

### 운영/로드맵 문서 전환

#### 작업 T000. 사용자용 roadmap/status 문서 전환
- 우선순위: P0
- 상태: 완료
- 선행 조건: 없음
- 완료 기준:
  - [x] `docs/planned-work.md`의 미구현 backlog가 사용자용 roadmap/status에 반영되어 있다.
  - [x] `docs/superpowers/plans/2026-06-10-advisor-canonical-gap-priority.md`의 advisor canonical 우선순위가 사용자용 roadmap/status에 반영되어 있다.
  - [x] 각 작업 단위가 `Priority`, `Status`, `Depends on`, `Acceptance Criteria`, `Notes` 형식으로 tracking 가능하다.
  - [x] 기존 계획 문서가 `docs/archive/planning/` 아래로 이동되어 historical reference가 된다.
  - [x] 프로젝트 시작점 문서가 `Implentation-plan.md`를 사용자용 roadmap/status 문서로 안내한다.
- 참고:
  - `docs/STATUS.md`는 2026-06-26부터 deprecated pointer로 전환되었고, mainline handoff/status snapshot 역할을 더 이상 맡지 않는다.
  - archived 문서는 참고용이며 사용자용 current roadmap 판단은 이 문서를 우선한다.
  - 에이전트 실행 지시서는 `.omo/plans/<slug>.md`에 둔다.

### 계산 정확성과 agent read contract 기반

#### 작업 T001. 음수 자산 중복 차감 제거와 canonical 순자산 정합성 보정
- 우선순위: P0
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] `vw_asset_snapshot_canonical.asset_total`이 `side='asset' AND amount >= 0`인 row만 합산한다.
  - [x] `negative_asset_excluded_total` 컬럼이 추가되어 음수 자산 row 제외분을 노출한다.
  - [x] 마이너스통장처럼 자산 측 음수 row와 부채 측 대출 row가 동시에 존재해도 순자산이 이중 차감되지 않는다.
  - [x] `GET /api/v1/analytics/net-worth-breakdown`와 `GET /api/v1/analytics/liquidity-health`의 Python 계산 경로가 canonical view 규칙과 일치한다.
  - [x] 제외가 발생한 snapshot에서는 응답 `assumptions`에 `negative_asset_rows_excluded` 또는 동등한 명시적 근거가 포함된다.
  - [x] backend regression test가 음수 자산 + 대응 부채 fixture를 포함한다.
  - [x] `docs/agents/canonical-read-surface-reference.md`와 `docs/backend-api-and-metrics-reference.md`에 새 컬럼과 해석 규칙이 문서화된다.
  - [x] 실데이터 workbook 기준 마이너스통장 중복 차감 해소분이 재현된다.
- 참고:
  - parser/raw table은 수정하지 않고 canonical/service 레이어에서 정규화한다.
  - `T002`와 같은 migration/PR로 묶어도 된다.

#### 작업 T002. 현금성 자산 fallback 휴리스틱 보강
- 우선순위: P0
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] `vw_asset_snapshot_canonical.cash_equivalent_total`이 음수 자산 row를 제외한다.
  - [x] category fallback이 `자유입출금`, `전자금융`을 포함한다.
  - [x] product fallback이 `통장`을 포함하되 `청약`, `저금통`, `보험`, `연금`, `부동산` 같은 locked/non-cash 후보를 현금성으로 오분류하지 않는다.
  - [x] `backend/app/services/assets_service.py:_is_cash_equivalent_asset`가 DB view와 같은 판단 순서를 사용한다.
  - [x] 사용자 명시값 `is_cash_equivalent`와 `liquidity_tier`는 기존처럼 휴리스틱보다 우선한다.
  - [x] 실데이터 workbook 기준 `cash_equivalent_total`이 약 `310099`로 재현된다.
  - [x] `emergency_fund_months`가 이 사용자의 실제 비상금 부족 상태를 왜곡 없이 보여준다.
  - [x] backend regression test가 자유입출금/통장/음수 asset row 사례를 포함한다.
- 참고:
  - `T001`과 같은 canonical view 재생성 migration에서 처리하는 것이 좋다.

#### 작업 T003. 대출 금리/잔액/만기 surface 문서 승격
- 우선순위: P0
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] `docs/agents/canonical-read-surface-reference.md`의 surface 선택표에 `대출 구조/금리/만기 -> GET /api/v1/loans/summary`가 추가된다.
  - [x] `/loans/summary`의 `interest_rate`, `balance`, `principal`, `monthly_payment`, `monthly_payment_source`, `repayment_method`, `maturity_date` 의미가 값 사전에 문서화된다.
  - [x] `docs/agent-integration/integration-guide.md`에서 대출 상환 부담과 대출 구조를 구분해 안내한다.
  - [x] `docs/backend-api-and-metrics-reference.md`에 금리는 snapshot 시점 값이며 상환 우선순위 판단은 agent 해석이라는 주의가 포함된다.
  - [x] 코드 변경 없이 문서 diff만 발생한다.
- 참고:
  - `GET /api/v1/loans/summary` 자체는 이미 live다.

#### 작업 T004. 뱅샐현황 고객정보 프로필 스냅샷 수집과 API 추가
- 우선순위: P1
- 상태: 완료
- 선행 조건: T001, T002
- 완료 기준:
  - [x] `backend/app/parsers/snapshots.py`가 `1.고객정보` 섹션에서 `gender`, `age`, `credit_score_kcb`를 파싱한다.
  - [x] 이름과 이메일은 저장하지 않는다.
  - [x] `1.고객정보` 섹션이 없는 workbook은 upload가 실패하지 않고 profile을 skip한다.
  - [x] `user_profile_snapshots` 테이블이 Alembic migration으로 추가된다.
  - [x] 같은 `snapshot_date` 재업로드 시 profile snapshot은 기존 snapshot replace 패턴을 따른다.
  - [x] `GET /api/v1/profile`이 최신 `gender`, `age`, `credit_score_kcb`, `snapshot_date`, `credit_score_history[]`를 반환한다.
  - [x] `GET /api/v1/schema`에서 신규 테이블 또는 API surface가 확인 가능하다.
  - [x] 실데이터 workbook 기준 `{gender: '남', age: 39, credit_score_kcb: 996}`가 반환된다.
  - [x] parser, upload service, API regression test가 추가된다.
  - [x] `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`가 갱신된다.
- 참고:
  - 나이와 신용점수는 advisor 판단 재료이며 My Ledge가 리파이낸싱 같은 조언을 생성하지 않는다.

#### 작업 T005. 대출 계좌 canonical view `vw_loan_account_canonical` 추가
- 우선순위: P1
- 상태: 완료
- 선행 조건: T003
- 완료 기준:
  - [x] Alembic migration이 `vw_loan_account_canonical`을 생성한다.
  - [x] 최신 loan snapshot 선별은 lender/product_name 또는 안정 계좌 identity 기준으로 중복 snapshot 합산을 방지한다.
  - [x] view가 `loan_account_id`, `display_name`, `lender`, `product_name`, `loan_kind`, `snapshot_date`, `principal`, `balance`, `interest_rate`, `monthly_payment`, `monthly_payment_source`, `repayment_method`, `start_date`, `maturity_date`, `estimated_monthly_interest`를 제공한다.
  - [x] `loan_accounts`에 아직 매핑되지 않은 snapshot loan도 누락되지 않는다.
  - [x] `estimated_monthly_interest`는 `round(balance * interest_rate / 100 / 12)`로 계산하고 null 입력에서는 null을 반환한다.
  - [x] `backend/app/services/canonical_views.py`와 `/schema`에 view가 등록된다.
  - [x] 실데이터 workbook 기준 4.03% 주담대 월 이자 추정치가 약 `573000`이고 5.85% 신용대출이 최고 금리 row로 식별된다.
  - [x] schema/view regression test가 추가된다.
  - [x] agent/reference 문서에 단리 근사값이며 실제 상환 스케줄이 아니라는 해석 주의가 포함된다.
- 참고:
  - dashboard API 포함은 1차 scope가 아니다. readonly SQL/canonical view와 문서 등재를 먼저 완료한다.

#### 작업 T006. canonical dashboard 데이터 커버리지와 부분월 표시 추가
- 우선순위: P1
- 상태: 완료
- 선행 조건: T001, T002
- 완료 기준:
  - [x] `GET /api/v1/canonical-views/dashboard` 최상위 응답에 `data_coverage.first_transaction_date`와 `data_coverage.last_transaction_date`가 추가된다.
  - [x] `monthly_cashflow[]` row에 `is_complete_month`가 추가된다.
  - [x] `true_spendable_monthly[]` row에 `is_complete_month`가 추가된다.
  - [x] dashboard가 노출하는 fixed cost 계열 월별 row에도 동일한 complete-month 판단이 적용된다.
  - [x] complete-month 판단은 해당 월의 시작과 끝이 전체 거래 관측 범위 안에 모두 포함되는지로 계산한다.
  - [x] 진행월의 `income_basis='estimated'`와 `is_complete_month=false`가 서로 독립적으로 표현된다.
  - [x] 실데이터 workbook 기준 `2025-05=false`, `2025-06`부터 `2026-04=true`, `2026-05=false`가 재현된다.
  - [x] API schema와 API regression test가 추가된다.
  - [x] agent 문서에 `is_complete_month=false` 월을 baseline/추세 계산에서 제외하거나 부분월임을 명시하라는 규칙이 추가된다.
- 참고:
  - DB view 원본값은 바꾸지 않고 dashboard API enrichment로 처리한다.

#### 작업 T007. 월별 수입 구성 canonical view 추가
- 우선순위: P1
- 상태: 완료
- 선행 조건: T006
- 완료 기준:
  - [x] Alembic migration이 `vw_income_monthly_by_category`를 생성한다.
  - [x] source는 `vw_transactions_effective`이고 `type='수입'`만 포함한다.
  - [x] view는 `period`, `effective_category_major`, `income_total`, `transaction_count`를 제공한다.
  - [x] category별 월 수입 합계가 같은 월의 `vw_monthly_cashflow.income_total`과 일치한다.
  - [x] 실데이터 workbook 기준 2026-02의 급여, 보험금, 기타 수입이 분리된다.
  - [x] `backend/app/services/canonical_views.py`와 `/schema`에 view가 등록된다.
  - [x] schema/view regression test가 추가된다.
  - [x] agent/reference 문서에 `급여` 카테고리는 BankSalad 또는 사용자 수정 effective category 기준이며 정기성 판단은 월별 분해를 보고 agent가 해석한다고 명시된다.
- 참고:
  - 첫 PR에서는 `vw_monthly_cashflow`에 `salary_income_total`/`non_salary_income_total`을 추가하지 않는다. 명확한 consumer가 생기면 별도 task로 승격한다.

#### 작업 T008. 보험 계약 snapshot 수집과 summary API
- 우선순위: P1.5
- 상태: 완료
- 선행 조건: T004
- 완료 기준:
  - [x] parser가 `4.보험현황`에서 보험사, 보험명, 계약상태, 총납입금, 계약일자, 만기일자를 파싱한다.
  - [x] `총계` row는 저장하지 않는다.
  - [x] `insurance_contracts` 테이블이 Alembic migration으로 추가된다.
  - [x] 같은 snapshot date 재업로드 시 보험 계약 snapshot은 replace 패턴을 따른다.
  - [x] `GET /api/v1/insurance/summary`가 최신 계약 목록을 반환한다.
  - [x] `monthly_premium_estimate`는 최근 마감월 보험 카테고리 지출 기반으로 계산하고 assumptions에 근거를 남긴다.
  - [x] 계약-거래 매핑은 제공하지 않는다고 문서화된다.
  - [x] parser, upload, API regression test가 추가된다.
  - [x] agent/reference 문서가 갱신된다.
- 참고:
  - 보험료 적정성 판단은 agent layer 해석이다. My Ledge는 계약과 추정 보험료 재료만 제공한다.

#### 작업 T009. BankSalad 현금흐름현황 기반 가져오기 정합성 강화
- 우선순위: P1.5
- 상태: 완료
- 선행 조건: T001, T002
- 완료 기준:
  - [x] `2.현금흐름현황`의 월별/카테고리별 집계 값을 저장하지 않고 검증 기준값으로만 읽는다.
  - [x] upload 또는 parity 검증 스크립트가 BankSalad 현금흐름현황과 DB 거래 재집계를 비교한다.
  - [x] 불일치는 upload 차단이 아니라 경고 리포트로 남긴다.
  - [x] 리포트에는 비교 월, category, BankSalad 값, DB 값, 차이가 포함된다.
  - [x] 수식 셀을 값으로 오독하지 않도록 숫자 값 영역만 사용한다.
  - [x] prepared workbook으로 parity smoke를 재현한다.
  - [x] 실패 시 upload log 또는 검증 리포트가 어느 row 범위를 비교했는지 남긴다.
- 참고:
  - 기존 import parity hardening 항목을 실데이터 기반 외부 기준값 검증으로 구체화한 task다.

#### 작업 T010. 최소 재무 목표 설정
- 우선순위: P1.5
- 상태: 완료
- 선행 조건: T001, T002, T006
- 완료 기준:
  - [x] `GET /api/v1/settings/analytics` 응답에 `financial_targets` 섹션이 추가된다.
  - [x] `PATCH /api/v1/settings/analytics`가 `emergency_fund_target_months`, `savings_rate_target`, `debt_strategy_preference`를 저장한다.
  - [x] `emergency_fund_target_months` 기본값은 3이다.
  - [x] `savings_rate_target` 기본값은 null이다.
  - [x] `debt_strategy_preference`는 `avalanche`, `snowball`, null만 허용한다.
  - [x] `/analytics/liquidity-health`가 `emergency_fund_target_months`와 `target_progress_ratio`를 echo한다.
  - [x] agent가 목표를 제안할 수는 있지만 저장은 사용자 명시 의사로만 한다는 규칙이 문서화된다.
  - [x] API settings regression test가 추가된다.
- 참고:
  - budgets/goals 전체 기능은 P2에 남긴다. 이 task는 advisor가 목표 대비 현재 위치를 말할 수 있게 하는 최소 선행분이다.

#### 작업 T011. 투자 집중도 보조 필드
- 우선순위: P1.5
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] `GET /api/v1/investments/summary` items에 `pct_of_investment_total`이 추가된다.
  - [x] 계산식은 `market_value / totals.market_value`이며 분모가 0이면 null을 반환한다.
  - [x] 성과/수익률/매수매도 attribution은 추가하지 않는다.
  - [x] agent/reference 문서에 snapshot 구성 비율일 뿐 투자 성과 분석이 아니라고 명시한다.
  - [x] API regression test가 추가된다.
  - [x] 실데이터 workbook 기준 알파벳 단일종목 집중도가 투자자산의 약 56%로 노출된다.
- 참고:
  - 투자 성과/상품 배분 분석은 증권사 API 이후로 미룬다는 기존 결정은 유지한다.

#### 작업 T012. 구매 검토 흐름과 결제취소 상계
- 우선순위: P1
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] `/operations/purchase-review` 또는 insights 내 review-focused section의 위치가 결정된다.
  - [x] purchase gate 후보에 review memo를 저장할 수 있다.
  - [x] 후보 review 상태에 `reviewed_at`이 기록된다.
  - [x] 후보 재노출 제어를 위한 `cooldown_until` 또는 동등한 상태가 저장된다.
  - [x] snooze/dismiss 후보의 재노출 규칙이 backend와 frontend에서 일관된다.
  - [x] 기존 purchase gate 후보 생성 규칙은 고정비, 필수지출, 대출연결, 필요성 미분류 거래를 제외한다.
  - [x] `type='지출'`이면서 양수인 결제취소/환불 row를 같은 거래처/결제수단/통화/절대금액과 근접 날짜 기준으로 원결제 row와 상계한다.
  - [x] 완전 취소되어 순액이 0인 원결제는 purchase gate 후보에서 제외한다.
  - [x] 부분 환불은 원결제 금액이 아니라 환불 차감 후 순지출 기준으로 `min_candidate_amount`, `large_purchase_threshold`, spike 신호를 판단한다.
  - [x] 자동 매칭 신뢰도가 낮은 환불 의심 케이스는 임의 제외하지 않고 `assumptions` 또는 reason/signal로 드러낸다.
  - [x] 관련 API contract 문서와 frontend wireframe 문서가 갱신된다.
  - [x] backend API test가 `-150000` 원결제와 `+150000` 결제취소 fixture를 포함하고, 완전 취소 건이 후보에서 제외됨을 검증한다.
  - [x] backend API test가 부분 환불 fixture를 포함하고, 순지출 기준 후보 판단을 검증한다.
  - [x] frontend interaction test 또는 browser smoke가 포함된다.
- 참고:
  - My Ledge는 구매 허용/금지 판단을 하지 않고 review queue와 근거만 제공한다.
  - 결제취소/환불 상계는 구매 허용/금지 판단이 아니라 관측 거래가 실제 구매로 남았는지 정규화하는 전처리다.
  - `codex/ready-plan-tasks`에서 insights 내 review-focused section을 유지하고, `7일 숨김`/`닫기` action과 refund netting을 함께 구현했다.

#### 작업 T012A. 구매 검토 이름, alias, 시점, future-friction contract 정리
- Parent Task: T012
- GitHub Issue: [#14](https://github.com/Gyu-bot/my_ledge/issues/14)
- 우선순위: P1
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] 현재 `/analytics/purchase-gate-candidates` docs가 already-posted transaction 기반 post-transaction spending review 후보임을 명시한다.
  - [x] 기존 `/analytics/purchase-gate-candidates` endpoint는 호환성을 위해 유지된다.
  - [x] preferred alias `/analytics/spending-review-candidates` 또는 동등한 이름이 추가된다.
  - [x] docs에 `purchase-gate-candidates`는 legacy naming이고 preferred name은 spending review/future-friction candidate surface임이 명시된다.
  - [x] response에 `review_timing='post_transaction'` 또는 동등한 timing field가 포함된다.
  - [x] response에 `candidate_purpose='future_friction_rule_candidate'` 또는 동등한 purpose field가 포함된다.
  - [x] response가 `future_friction_suggestion` 또는 동등한 구조로 condition/action을 표현할 수 있다.
  - [x] frontend/API client가 새 alias를 사용할지 기존 endpoint를 유지할지 결정하고, 사용자-facing label은 post-transaction review 의미로 정리한다.
  - [x] 진짜 pre-purchase gate는 planned purchase intent를 입력으로 받는 별도 issue/surface로 분리하고, 이 task 범위에서는 구현하지 않는다.
  - [x] backend API regression test가 legacy endpoint와 preferred alias가 같은 후보 contract를 반환함을 검증한다.
  - [x] 관련 API contract 문서와 agent 문서가 갱신된다.
- 참고:
  - 이 subtask는 기존 기능 제거가 아니라 현재 기능의 시점을 이름과 contract에 정확히 반영하는 작업이다.
  - `T012`의 review placement/snooze/refund netting과 같은 branch에서 처리했고, GitHub Issue #14는 completed로 close했다.

### 사용자 화면과 운영 확인

#### 작업 T013. 설정 화면
- 우선순위: P1
- 상태: 바로 시작 가능
- 선행 조건: T010
- 완료 기준:
  - [x] `/data/settings` route와 shell navigation entry가 새 frontend IA에 존재한다.
  - [x] `GET/PATCH /api/v1/settings/analytics` frontend API client와 React Query hook이 존재한다.
  - [x] `financial_targets` 재무 목표 편집 UI가 현재 backend effective/default 값을 조회하고 저장한다.
  - [x] 비상금 목표 개월, 저축률 목표, 부채 상환 전략을 편집할 수 있다.
  - [ ] 기존 재무 목표 편집 UI와 같은 화면에서 분석 파라미터 섹션별 default/saved/effective 값을 표시한다.
  - [ ] 분석 파라미터 섹션별 편집 UI를 제공한다.
  - [ ] purchase gate threshold/settings를 편집할 수 있다.
  - [ ] discretionary velocity threshold/settings를 편집할 수 있다.
  - [ ] recurring dry-run 기본값/settings를 편집할 수 있다.
  - [ ] asset-liability settings 중 `asset_liability_health` 월상환 추정/유동성 설정을 편집할 수 있다.
  - [x] reset-to-default, export/import는 일반 사용자 UI에 노출하지 않고 별도 개발/리뷰 도구로 남긴다.
  - [x] `SettingsPage` vitest가 effective 값 초기화와 저축률 `% -> ratio` PATCH 변환을 검증한다.
  - [ ] 분석 파라미터 편집까지 포함한 frontend typecheck/lint/test가 통과한다.
  - [ ] Codex 인앱 브라우저로 `/data/settings` 전체 설정 편집 흐름을 확인한다.
  - [x] frontend docs가 `/data/settings` route와 `settings/analytics` + `financial_targets` 설정 surface를 설명한다.
- 참고:
  - 상태 근거: `/data/settings` route, navigation, financial targets edit/save는 구현됐고, 분석 파라미터 섹션별 full edit UI는 바로 이어서 작업 가능하므로 바로 시작 가능하다.
  - frontend/UI 작업이므로 브라우저 또는 동등한 visual check가 필요하다.
  - Frontend remake PR `#15`에서 `/data/settings`와 재무 목표 편집은 들어왔으나, 분석 파라미터별 default/saved/effective 표시와 편집 폼은 아직 남아 있다.

#### 작업 T014. 운영 배포본 스모크 확인
- 우선순위: P1
- 상태: 바로 시작 가능
- 선행 조건: T000
- 완료 기준:
  - [ ] `/` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/spending` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/net-worth` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/signals` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/data/inbox` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/data/transactions` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/data/loans` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/data/assets` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/data/settings` 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] `/data/import`, `/data/rules`, `/data/installments`, `/data/reference`의 기본 접근성이 확인된다.
  - [ ] legacy redirect(`/analysis/spending`, `/analysis/assets`, `/analysis/insights`, `/operations/*`, `/income`)가 새 IA target으로 이동하는지 확인된다.
  - [ ] API proxy와 runtime config가 운영 환경에서 정상 동작함을 확인한다.
  - [ ] 발견된 문제는 별도 fix task 또는 issue로 분리된다.
- 참고:
  - local DOM smoke는 이미 완료된 기록이 있으므로 이 task는 운영 배포본 확인에 집중한다.
  - Frontend remake PR `#15`가 main에 머지되었으므로 새 IA 기준 운영 smoke가 가능하다.

### 자산/투자 source와 provenance

#### 작업 T015. 자산/투자 raw observation lifecycle와 selected canonical view
- 우선순위: P2
- 상태: 바로 시작 가능
- 선행 조건: T001, T002, T005
- 완료 기준:
  - [ ] raw observation은 일반 운영에서 hard delete하지 않는다.
  - [ ] 기존 BankSalad snapshot row와 외부 source row를 보존할 별도 observation table 또는 observation metadata layer가 도입된다.
  - [ ] asset/investment/loan observation에 lifecycle status 또는 별도 metadata table이 도입된다.
  - [ ] status는 최소 `active`, `hidden_by_user`, `matured_candidate`, `matured_confirmed`, `replaced`, `duplicate`, `conflict`, `stale`, `needs_review`를 표현한다.
  - [ ] `hidden_by_user`, `matured_confirmed`, `replaced`, `duplicate` observation은 raw audit에서는 보이지만 기본 canonical totals에서는 제외된다.
  - [ ] `stale`은 freshness 신호일 뿐 자동 제외 근거가 아니다.
  - [ ] 만기 지난 대출/자산은 자동 숨김이 아니라 review candidate로 제안된다.
  - [ ] selected canonical view가 raw observation 중 canonical total/API에 반영될 row를 명시한다.
  - [ ] BankSalad snapshot 기반 `asset_snapshots`, `loans`, `insurance_contracts`, `user_profile_snapshots`의 기존 동작은 유지하고, 투자 source 확장은 investment observation/canonical layer에서만 시작한다.
  - [ ] Toss Securities source는 투자 증권계좌 holdings 전용 source로 모델링하고, 일반 자산/대출/보험/profile snapshot을 대체하지 않는다.
  - [ ] BankSalad 투자 row 중 Toss Securities 계좌 항목은 우선 `broker` 정규화값으로 식별하되, 실제 workbook 값 확인 후 `broker + product_name` 또는 별도 account/source mapping으로 보강할 수 있다.
  - [ ] investment canonical identity는 `canonical_investment_key = normalized_account_key + normalized_instrument_key` 구조로 정의한다.
  - [ ] `normalized_account_key`는 Toss API 계좌 식별자 또는 BankSalad `broker` 정규화값을 사용하고, `normalized_instrument_key`는 Toss API 종목 식별자/ISIN/ticker를 우선하되 BankSalad-only row는 정규화된 `product_name`으로 fallback한다.
  - [ ] source별 sync run을 구분하고, run 상태는 최소 `pending`, `success_complete`, `success_partial`, `failed`, `rejected`를 표현한다.
  - [ ] complete sync만 canonical source 후보가 되며, partial/failed sync는 raw audit과 운영 상태에는 남기되 전체 계좌 대체에는 사용하지 않는다.
  - [ ] Toss Securities holdings는 종목별 조각이 아니라 계좌 전체 complete sync run을 선택 단위로 다루며, 수량/가격/평가액/통화/환율은 같은 source run에서 함께 선택된다.
  - [ ] preview API가 canonical total 영향, latest asset screen 영향, raw audit 보존 여부를 보여준다.
  - [ ] apply API가 explicit confirmation 후 감사 가능한 이유와 actor/source를 남긴다.
  - [ ] 관련 contract docs와 agent coverage 해석 규칙이 갱신된다.
- 참고:
  - 상태 근거: 바로 착수 가능한 backend/domain 설계 작업이다. Toss 공식 API 문서가 없어도 BankSalad observation 보존, investment canonical identity, selected view foundation은 진행할 수 있다.
  - 이 task부터는 더 큰 asset reconciliation 구조 변경이므로 advisor canonical P0/P1 완료 후 착수한다.
  - Toss Securities holdings replacement는 기존 snapshot table을 덮어쓰지 않고 selected canonical investment view에서 표현한다.
  - 샘플 workbook `tmp/2025-05-21~2026-05-21.xlsx`에서는 `broker='토스증권'` 6건과 `broker='카카오페이 증권'` 3건이 분리되며, `알파벳`/`테슬라`류 종목명이 증권사 간 중복될 수 있어 product name 단독 identity는 금지한다.

#### 작업 T016. 사용자 제어 source 우선순위 profile
- 우선순위: P2
- 상태: 바로 시작 가능
- 선행 조건: T015
- 완료 기준:
  - [ ] source priority profile 저장 모델이 추가된다.
  - [ ] global default priority를 표현할 수 있다.
  - [ ] asset class별 priority를 표현할 수 있다.
  - [ ] canonical asset key별 override를 표현할 수 있다.
  - [ ] field별 override를 표현할 수 있다.
  - [ ] 1차 profile은 `investment` asset class에서 `banksalad_snapshot`과 `toss_securities_api` 중 선택할 수 있다.
  - [ ] `toss_securities_api` 선택 시 Toss Securities 계좌에 속한 투자 항목은 BankSalad 투자 row와 field merge하지 않고 Toss API observation 값으로 완전 대체된다.
  - [ ] Toss Securities 계좌가 아닌 투자 항목과 모든 비투자 snapshot surface는 BankSalad latest snapshot을 계속 사용한다.
  - [ ] source 선택 단위는 기본값으로 `asset_class=investment` override를 제공하고, 필요 시 `canonical_asset_key` override로 특정 계좌/상품만 예외 처리할 수 있게 한다.
  - [ ] priority 변경은 historical observation을 수정하지 않고 future resolution rule로 기록된다.
  - [ ] `GET/PATCH /api/v1/assets/source-priority` 또는 동등한 API가 제공된다.
  - [ ] API 응답은 현재 적용 중인 effective priority와 override source를 설명한다.
  - [ ] source priority override key는 product name 단독이 아니라 `canonical_investment_key` 또는 `normalized_account_key` 단위로 저장된다.
  - [ ] account-level source override는 해당 계좌에만 적용되고, 적용 전 순자산 영향 preview를 제공한다.
  - [ ] frontend 설정 화면 없이도 API/agent contract로 source conflict를 해석할 수 있다.
  - [ ] agent는 source conflict를 임의로 해결하지 않고 저장된 priority와 conflict reason을 설명한다.
  - [ ] 관련 backend/API contract docs와 agent coverage 해석 규칙이 갱신된다.
- 참고:
  - 상태 근거: 구현 순서는 `T015` 이후지만 같은 source-selection backend batch로 바로 착수 가능하므로 바로 시작 가능하다.
  - 증권사/부동산/수동 valuation 같은 외부 source adapter와 연결될 기반이다.
  - 추천 기본값은 global default `banksalad_snapshot`, Toss 연동 시 investment override `toss_securities_api`, 예외 처리는 canonical asset key override 이다.
  - field-level override는 장기 확장 포인트로 남기되, Toss Securities 1차 구현은 계좌 holdings row 단위 replacement로 제한한다.
  - 이 task는 backend/API/policy scope만 다룬다. frontend settings surface는 `T016A`에서 별도로 추적한다.

#### 작업 T016A. source 우선순위 설정 화면
- Parent Task: T016
- 우선순위: P2
- 상태: 바로 시작 가능
- 선행 조건: T016
- 완료 기준:
  - [ ] 새 frontend의 `/data/settings` 또는 동등한 설정 surface에 자산 source 선택 섹션이 추가된다.
  - [ ] global default priority를 조회/저장할 수 있다.
  - [ ] asset class별 priority를 조회/저장할 수 있다.
  - [ ] canonical asset key별 override를 조회/저장할 수 있다.
  - [ ] field별 override를 조회/저장할 수 있다.
  - [ ] Toss Securities 연동을 켜면 "토스 증권계좌 투자 항목만 Toss API 값으로 대체하고, 나머지 자산/대출/보험/profile은 BankSalad snapshot을 유지한다"는 범위가 화면에서 명확하다.
  - [ ] 설정 화면은 BankSalad snapshot 기준일과 Toss API 조회/평가 기준일이 서로 다를 수 있음을 표시한다.
  - [ ] configured source, effective source, selected run, 마지막 성공 동기화, 마지막 동기화 시도, 평가 기준시각, stale 여부, fallback 이유를 표시한다.
  - [ ] priority 변경이 historical observation을 수정하지 않는 future resolution rule임을 화면 copy와 interaction으로 명확히 한다.
  - [ ] frontend typecheck/lint/test가 통과한다.
  - [ ] Codex 인앱 브라우저 또는 동등한 visual QA로 기본 조회/저장 흐름을 확인한다.
  - [ ] frontend docs가 새 settings surface 기준으로 갱신된다.
- 참고:
  - 상태 근거: frontend remake가 완료됐고 `/data/settings` surface가 있으므로 바로 시작 가능하다. 저장/조회 API는 `T016`과 같은 sequence에서 맞춘다.
  - Frontend remake가 main에 반영되었으므로 더 이상 remake branch에 막혀 있지 않다.

#### 작업 T017. 결정론적 field-level resolution과 conflict queue
- 우선순위: P2
- 상태: 바로 시작 가능
- 선행 조건: T015, T016
- 완료 기준:
  - [ ] 동일 자산 identity의 여러 source를 `canonical_asset_key + as_of_date` 또는 source별 `valuation_as_of`로 묶는다.
  - [ ] 투자 identity는 `canonical_investment_key`를 사용하며, 같은 `product_name`이라도 계좌/broker가 다르면 다른 holding으로 유지한다.
  - [ ] lifecycle에서 제외된 observation은 resolution 후보에서 제외된다.
  - [ ] field별 source priority가 적용된다.
  - [ ] tie-break 순서가 `user_confirmed`, source priority, fresher observed_at, source_confidence, ingested_at, stable row id 순으로 고정된다.
  - [ ] Toss Securities가 선택된 투자 계좌 holdings는 field-level merge 없이 Toss observation row를 selected source로 고른다.
  - [ ] Toss 계좌는 account snapshot 단위로 선택하며, BankSalad와 Toss API 값을 이중 합산하지 않는다.
  - [ ] 최신 Toss sync가 실패하면 마지막 successful complete run을 유지하고 stale/refresh failure를 표시한다.
  - [ ] Toss successful complete run이 한 번도 없을 때만 BankSalad fallback을 허용한다.
  - [ ] BankSalad snapshot 기준일과 Toss API 조회일이 다른 mixed-date canonical total은 각 row/source별 basis metadata를 함께 노출한다.
  - [ ] tolerance를 넘는 같은 우선순위 source 충돌은 conflict queue에 남긴다.
  - [ ] conflict queue가 최소 `missing_in_toss`, `missing_in_banksalad`, `value_difference`, `quantity_difference`, `currency_mismatch`, `account_mapping_ambiguous`, `instrument_mapping_ambiguous`, `stale_comparison`, `possible_duplicate`를 표현한다.
  - [ ] 차이가 있다는 이유만으로 raw 데이터를 자동 수정하지 않고, BankSalad 재업로드도 저장된 Toss source 설정을 덮어쓰지 않는다.
  - [ ] reconciliation preview가 field별 선택 이유와 conflict 정보를 보여준다.
  - [ ] apply는 explicit confirmation 후 replacement chain 또는 lifecycle decision을 저장한다.
  - [ ] `POST /api/v1/data/reset`은 대량 초기화용으로 남고 reconciliation API와 분리된다.
- 참고:
  - 상태 근거: 구현 순서는 `T015`/`T016` 이후지만 같은 reconciliation backend batch로 바로 착수 가능하므로 바로 시작 가능하다.
  - row 단위 merge보다 field 단위 resolution을 우선한다.

#### 작업 T018. provenance와 agent coverage surface
- 우선순위: P2
- 상태: 바로 시작 가능
- 선행 조건: T015, T016, T017
- 완료 기준:
  - [ ] source provenance 필드 또는 별도 table이 `source_system`, `source_run_id`, `source_file_fingerprint`, `source_row_hash`, `canonical_asset_key`, `source_confidence`, `observed_at`, `valuation_as_of`를 표현한다.
  - [ ] `source_system`은 최소 `banksalad_snapshot`과 `toss_securities_api`를 구분한다.
  - [ ] BankSalad source는 `snapshot_date`, Toss source는 API 조회 시각(`observed_at`)과 평가 기준일(`valuation_as_of` 또는 API 제공 동등값)을 분리해서 저장한다.
  - [ ] 사용자 확인/정책 적용 필드가 `is_user_confirmed`, `priority_policy_id`, `decision_reason`, `reviewed_by`, `reviewed_at`를 표현한다.
  - [ ] supersession/selection 필드가 `superseded_by_observation_id`, `selected_source_system`, `selected_observation_id`를 표현한다.
  - [ ] freshness/conflict 필드가 `freshness_sla_days`, `stale_days`, `conflict_status`를 표현한다.
  - [ ] `GET /api/v1/analytics/asset-source-coverage` 또는 `vw_asset_source_coverage`가 제공된다.
  - [ ] canonical asset coverage가 raw/selected/excluded/confirmed/derived/hidden/conflicted/stale 비율을 설명할 수 있다.
  - [ ] coverage 지표가 raw observation 수, selected observation 수, Toss selected 비율, BankSalad selected 비율, unmapped holding 수, conflict 수, stale account 수, incomplete sync 수를 포함한다.
  - [ ] investment summary와 net-worth 관련 API는 selected source, source basis date, mixed-source 여부를 agent가 설명할 수 있게 metadata를 제공한다.
  - [ ] agent 문서가 source가 섞인 자산 값을 확정 총액처럼 말하지 않도록 안내한다.
- 참고:
  - 상태 근거: 구현 순서는 `T015`-`T017` 이후지만 같은 coverage/contract hardening batch로 바로 착수 가능하므로 바로 시작 가능하다.
  - coverage surface는 외부 agent가 raw DB를 직접 재해석하지 않도록 하는 read contract다.

#### 작업 T019. Toss Securities holdings valuation 연동
- 우선순위: P2
- 상태: 막힘
- 선행 조건: T015, T016, T017, T018, 공식 Toss Securities API 문서
- 완료 기준:
  - [ ] 사용자가 제공한 Toss Securities 공식 문서 기준으로 인증, 조회 가능 holdings 필드, rate limit, 저장 가능 범위가 확인된다.
  - [ ] Toss Securities adapter는 증권계좌 투자 holdings만 조회하고 일반 자산/대출/보험/profile은 조회하거나 대체하지 않는다.
  - [ ] Toss API 조회 결과는 별도 investment observation table에 저장하며, 기존 BankSalad `investments` snapshot row를 직접 수정하지 않는다.
  - [ ] 저장 필드는 최소 broker/source account identity, product identifier/name, quantity 또는 units, cost basis if available, market value, currency, observed_at, valuation_as_of, source_run_id를 포함한다.
  - [ ] BankSalad snapshot의 Toss Securities 투자 row를 식별할 수 있는 mapping/normalization이 제공된다.
  - [ ] Toss API 종목 식별자와 BankSalad `product_name`을 연결하는 mapping은 자동 정규화 preview 후 저장하며, 불확실한 이름 매칭은 canonical replacement에 바로 사용하지 않는다.
  - [ ] source priority가 `toss_securities_api`일 때 selected canonical investment view가 Toss Securities 계좌 내 항목을 Toss API observation 값으로 완전 대체한다.
  - [ ] source priority가 `banksalad_snapshot`이거나 Toss observation이 없으면 기존 BankSalad 투자 snapshot 값으로 fallback한다.
  - [ ] `GET /api/v1/investments/summary` 또는 새 canonical investment summary API가 selected source 기준 items/totals와 source metadata를 반환한다.
  - [ ] broker/product type/product 기준 allocation ratio와 previous-snapshot delta가 제공된다.
  - [ ] 인증정보와 API 오류 detail은 로그에 민감정보를 남기지 않는다.
  - [ ] 일부 조회 실패는 `success_partial`로 기록하고 canonical source 후보에서 제외한다.
  - [ ] 수동 새로고침, pagination, rate limit, 원화/외화 평가액, 환율 기준 저장을 처리한다.
  - [ ] 기존 확정 순자산(`동일 BankSalad snapshot_date의 총자산 - 총부채`)과 현재 추정 순자산(`최신 BankSalad 비토스 자산 + selected Toss 투자자산 - 최신 BankSalad 부채`)을 구분한다.
  - [ ] API 연동 이후 일별 대표 투자 observation을 보존하되, API 연동 이전 history를 임의로 복원하지 않는다.
  - [ ] 실패한 sync가 직전 정상 observation을 덮지 않으며, 장기 stale 상태도 자동 source 전환이 아니라 경고와 수동 전환 선택지로 표현한다.
  - [ ] 1차 범위는 보유 평가액과 투자 구성 비중만이며, 매수/매도/입출금 cashflow 기반 수익률과 성과 attribution은 구현하지 않는다.
  - [ ] BankSalad snapshot만으로 투자 성과/수익률을 해석하지 않는다.
- 참고:
  - 상태 근거: 공식 Toss Securities API 문서가 제공되어야 인증, 조회 필드, 저장 가능 범위를 확정할 수 있으므로 막혀 있다.
  - 이 작업은 공식 Toss Securities API 문서가 제공될 때까지 막혀 있다.
  - 투자 성과 분석은 holdings valuation source가 안정화된 뒤 별도 task로 승격한다.

### 보류/제품 구조

#### 작업 T020. 이체 추적
- 우선순위: P2
- 상태: 보류
- 선행 조건: T006
- 완료 기준:
  - [ ] `GET /api/v1/transfers/summary` contract가 정의된다.
  - [ ] `GET /api/v1/transfers` contract가 정의된다.
  - [ ] `GET /api/v1/transfers/unmatched` contract가 정의된다.
  - [ ] raw `type='이체'` 기반 자산 이동을 먼저 다룬다.
  - [ ] 대출 원금/이자 상환처럼 `type='지출'`에 섞인 debt movement는 raw type을 바꾸지 않고 파생 레이어로만 처리한다.
  - [ ] ambiguous row는 review candidate로 남긴다.
  - [ ] 구현 전까지는 `vw_monthly_cashflow.transfer_activity_total`만 보조 값으로 유지한다.
- 참고:
  - 사용자 가치가 낮아 뒤쪽 P2로 미룬 기존 결정을 유지한다.

#### 작업 T021. frontend 재구축
- 우선순위: P1
- 상태: 완료
- 선행 조건: 없음
- 완료 기준:
  - [x] 현재 main의 live 기능, route, API contract를 기준으로 remake 범위를 다시 정의한다.
  - [x] legacy component cleanup이나 단기 theme polish를 독립 목표로 삼지 않는다.
  - [x] 새 frontend IA/wireframe이 current route별 기능을 누락하지 않는다.
  - [x] frontend docs가 remake 기준으로 갱신된다.
  - [x] 구현 시 브라우저 visual QA를 포함한다.
- 참고:
  - frontend remake PR `#15` / commit `0b71238`에서 완료됐다.
  - 새 IA는 `/`, `/spending`, `/net-worth`, `/signals`, `/data/*` route를 기준으로 한다.

#### 작업 T022. 장기 제품 확장 큐
- 우선순위: P2
- 상태: 계획됨
- 선행 조건: T001-T014
- 완료 기준:
  - [ ] 수입 분석을 별도 top-level route로 둘지, 현재 새 IA처럼 홈(`/`) 또는 신호(`/signals`) 안의 section으로 유지할지 결정한다.
  - [ ] 별도 수입 route를 만들 경우 현재 legacy `/income -> /` redirect와 충돌하지 않도록 새 route/redirect 정책을 먼저 정의한다.
  - [ ] 자동 백업 크론을 별도 infra task로 쪼갤지 결정한다.
  - [ ] 도메인 연결과 HTTPS를 별도 deployment task로 쪼갤지 결정한다.
  - [ ] budgets/goals/advice preferences 전체 기능을 `T010` 이후 별도 product task로 쪼갠다.
  - [ ] health score/personalized coaching은 My Ledge core 책임 경계와 충돌하지 않는 consumer/advisor layer 작업으로 분리한다.
- 참고:
  - 이 task는 queue placeholder가 아니라 분해 대상 tracking task다. 착수 전 더 작은 executable task로 재작성한다.
  - 현재 frontend route 기준으로 `/income`은 별도 페이지가 아니라 `/` redirect다.

### issue 기반 agent contract 보강

#### 작업 T023. 진행월 cashflow 대표 지표와 savings rate basis 명시
- GitHub Issue: [#7](https://github.com/Gyu-bot/my_ledge/issues/7)
- 우선순위: P1
- 상태: 완료
- 선행 조건: T006
- 완료 기준:
  - [x] 진행월이고 `is_complete_month=false`이며 observed income이 closed-month baseline 대비 낮은 경우, `savings_rate`가 raw observed income 기준 대표 지표로 오해되도록 노출되지 않는다.
  - [x] `CanonicalMonthlyCashflowItem` 또는 동등한 dashboard response surface에 `savings_rate_basis` 또는 equivalent field가 추가된다.
  - [x] observed cashflow 지표와 estimated cashflow/spendable 보조 지표가 응답에서 명확히 분리된다.
  - [x] `income_total` / `observed_income_total`은 관측값이고 `estimated_income_total`은 진행월 해석 보조값이라는 규칙이 API/agent 문서에 명시된다.
  - [x] agent-facing 해석은 `income_basis`, `is_complete_month`, `savings_rate_basis` 또는 equivalent field를 함께 확인해야 한다고 문서화된다.
  - [x] backend regression test가 incomplete current month, low observed income, derivable estimated income fixture를 포함한다.
  - [x] 테스트는 representative `savings_rate`가 null 또는 explicitly estimated/insufficient basis로 표시됨을 검증한다.
  - [x] frontend가 해당 field를 소비한다면 진행월 cashflow/savings rate 표시가 observed-only completed-month 지표처럼 보이지 않도록 회귀 테스트 또는 browser smoke가 포함된다.
- 참고:
  - `income_basis`, `estimated_income_total`, `excluded_income_periods`, `estimated_spendable_before_variable_spend`, `estimated_remaining_after_variable_spend`는 이미 live다.
  - 이 task의 핵심은 estimated income enrichment 존재 여부가 아니라 대표 cashflow 지표의 해석 기준이다.
  - `T024`와 closed-month income baseline utility를 공유할 수 있지만, 이 task는 dashboard/true-spendable contract 문제로 별도 완료 기준을 가진다.

#### 작업 T024. liquidity-health 기본 호출 closed-month 입력값 산출
- GitHub Issue: [#8](https://github.com/Gyu-bot/my_ledge/issues/8)
- 우선순위: P1
- 상태: 완료
- 선행 조건: T006, T010
- 완료 기준:
  - [x] `GET /api/v1/analytics/liquidity-health`를 query param 없이 호출해도 closed-month 기반 `monthly_income`이 채워진다.
  - [x] `GET /api/v1/analytics/liquidity-health`를 query param 없이 호출해도 closed-month 기반 `monthly_required_spend`가 채워진다.
  - [x] 기본 `monthly_income`은 진행월을 제외한 최근 완료월 수입의 median 또는 outlier-trimmed average로 산출된다.
  - [x] 기본 `monthly_required_spend`는 진행월을 제외한 최근 완료월의 필수지출과 대출상환을 합친 값으로 산출된다.
  - [x] 계산 가능할 때 `emergency_fund_months`, `debt_payment_ratio`, `target_progress_ratio`가 null로 남지 않는다.
  - [x] 응답에 `monthly_income_source`, `monthly_required_spend_source`, `derived_from_periods`, `manual_input_overrides` 또는 동등한 source/basis metadata가 포함된다.
  - [x] query param으로 `monthly_income` 또는 `monthly_required_spend`가 전달되면 manual value가 derived value보다 우선한다.
  - [x] 진행월 partial income은 기본 derivation에서 제외되거나 별도 basis로 명시된다.
  - [x] backend API/service regression test가 derived default와 manual override를 모두 검증한다.
  - [x] `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`에 기본값 source와 confidence 해석 규칙이 문서화된다.
- 참고:
  - 이 endpoint는 agent가 단독 호출할 가능성이 크므로, 기본 호출만으로 유동성/부채부담 판단 재료가 충분해야 한다.
  - `T023`과 baseline 계산 유틸을 공유할 수 있으나, `T024`는 liquidity-health input derivation과 source metadata에 집중한다.

#### 작업 T025. 대출 계좌 active/historical scope metadata
- GitHub Issue: [#9](https://github.com/Gyu-bot/my_ledge/issues/9)
- 우선순위: P1.5
- 상태: 완료
- 선행 조건: T005
- 완료 기준:
  - [x] `/loan-accounts` row에 `as_of_date`, `latest_snapshot_date`, `is_active`, `is_matured`, `is_stale`, `lifecycle_status` 또는 동등한 상태 필드가 추가된다.
  - [x] `as_of_date`는 명시 입력이 없으면 최신 전체 loan snapshot date를 사용한다.
  - [x] 계좌별 `latest_snapshot_date < as_of_date`이면 `is_stale=true`로 표시하고, 최신 전체 스냅샷에서 해당 대출이 사라졌음을 response만 보고 알 수 있다.
  - [x] `loan_maturity_date < as_of_date`이면 해당 row는 schedule 기준으로 `is_matured=true`로 표시한다.
  - [x] `loan_maturity_date < as_of_date`이고 `latest_snapshot_date < as_of_date`이면 `lifecycle_status='matured_and_missing_from_latest_snapshot'` 또는 동등한 상태로 표시한다.
  - [x] `loan_maturity_date < as_of_date`이고 계좌별 마지막 관측 snapshot의 `balance` 또는 `principal`이 0보다 크면 `lifecycle_status='past_maturity_with_last_observed_balance'` 또는 동등한 review 상태로 표시한다.
  - [x] 계좌별 마지막 관측 `balance`/`principal`은 현재 잔액처럼 해석되지 않도록 `last_observed_balance`, `last_observed_principal`, `last_observed_snapshot_date` 또는 동등한 필드/문서로 구분한다.
  - [x] `loan_maturity_date < as_of_date`이고 계좌별 마지막 관측 잔액이 없거나 0이면 `is_active=false`, `excluded_from_summary_reason='matured_loan'` 또는 동등한 reason으로 표시한다.
  - [x] `/loan-accounts` row에 `included_in_active_summary` 또는 `excluded_from_summary`가 추가되어 `/loans/summary` 포함 여부를 설명한다.
  - [x] `/loan-accounts` row에 `excluded_from_summary_reason`이 추가되어 만기/비활성/historical row가 active summary에서 빠지는 이유를 response만 보고 알 수 있다.
  - [x] `/loans/summary` 응답에 `summary_scope='active_loans_only'` 또는 동등한 scope metadata가 추가된다.
  - [x] `loan_account_id=null`인 row가 정상적으로 존재할 수 있는 경우 `stable_identity_status`와 `stable_identity_reason` 또는 동등한 설명 필드가 제공된다.
  - [x] 만기일이 지난 종료 대출 fixture, 만기일이 지났고 최신 전체 스냅샷에서 사라졌지만 과거 잔액이 남은 fixture, active loan fixture가 `/loan-accounts`와 `/loans/summary`에서 서로 다른 scope/status로 표현됨을 backend test가 검증한다.
  - [x] docs에 `/loan-accounts`는 historical/canonical inventory 성격이고 `/loans/summary`는 active/current loan summary라는 차이가 명시된다.
- 참고:
  - 현재 구현상 `/loans/summary`는 요청 snapshot 또는 최신 전체 `loans.snapshot_date`에 존재하는 row만 보여주므로, 최신 스냅샷에서 사라진 대출은 active summary에서 빠질 수 있다.
  - 현재 구현상 `/loan-accounts`와 `vw_loan_account_canonical`은 계좌별 마지막 관측 loan snapshot을 사용할 수 있으므로, active summary에서 빠진 historical loan도 inventory surface에는 남을 수 있다.
  - 실제 제품 기준에서 만기일은 scheduled maturity 신호다. 만기일이 지났고 최신 전체 스냅샷에서 사라졌다면 종료 가능성이 높지만, 과거 관측 잔액은 현재 잔액이 아니라 last observed value로 명시해야 한다.
  - `loan_maturity_date`가 null이면 만기 여부는 확정하지 않고 latest snapshot freshness, balance, active summary 포함 규칙을 함께 노출한다.
  - 만기 지난 계좌가 active summary에서 제외되는 동작 자체는 정상이다. historical/canonical inventory에서는 숨기지 않고 active summary 제외 이유와 stale/maturity 상태를 함께 보여준다.
  - 큰 asset lifecycle 구조 변경인 `T015` 전에 최소 metadata 보강으로 처리할 수 있다.

#### 작업 T026. sparse baseline 지출 이상치 표현 안정화
- GitHub Issue: [#10](https://github.com/Gyu-bot/my_ledge/issues/10)
- 우선순위: P1
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] baseline이 매우 작거나 sparse한 경우 user-facing `reason`에 과도한 percentage가 그대로 들어가지 않는다.
  - [x] raw 계산값은 유지하되 display/reason field와 분리된다. 예: `delta_pct_raw`, `delta_pct_display`, `delta_display_capped`.
  - [x] response item에 `anomaly_mode` 또는 `baseline_quality`가 포함된다.
  - [x] `sparse_baseline_spike` 또는 `insufficient_baseline` 같은 mode가 baseline floor 또는 baseline month count 기준으로 결정된다.
  - [x] 기존 `delta_pct` 호환성 유지 여부가 결정되고, breaking change가 있으면 contract docs에 명시된다.
  - [x] backend regression test가 tiny baseline에서 raw percent가 크게 튀는 fixture를 포함한다.
  - [x] 테스트는 sparse baseline에서 user-facing reason/display 값이 capped/null/stable expression으로 내려옴을 검증한다.
  - [x] docs에 raw score와 user-facing reason/display field의 차이가 명시된다.
- 참고:
  - anomaly 탐지 자체를 약하게 만드는 task가 아니다. 계산용 raw value와 사용자/agent가 인용할 표현을 분리하는 task다.
  - 기존 settings precedence는 `query param > persisted setting > code default`를 유지한다.

#### 작업 T027. 미분류 작업 큐 필터와 issue signal 분리
- GitHub Issue: [#11](https://github.com/Gyu-bot/my_ledge/issues/11)
- 우선순위: P1.5
- 상태: 완료
- 선행 조건: T006
- 완료 기준:
  - [x] `unclassified_work_queue` 또는 dashboard queue API에서 `issue_type`별 조회가 가능하다. 최소 type은 `cost_kind`, `spend_necessity`, `recurring_kind`, `loan_link`를 포함한다.
  - [x] 복수 `issue_type` 선택 방식이 정의된다. 예: comma-separated query param 또는 repeated query param.
  - [x] `period_from`, `period_to`, `current_only` 또는 동등한 period/current 필터가 추가된다.
  - [x] current period 중심 cleanup과 historical cleanup을 분리해서 조회할 수 있다.
  - [x] recurring-kind issue에는 `recurrence_signal`이 포함된다. 최소 `has_monthly_pattern`, `active_month_count`, `same_month_repeat_only`를 표현한다.
  - [x] priority explanation이 단일 `priority_reason` string뿐 아니라 `issues[]`와 primary issue 또는 동등한 구조로 설명 가능하다.
  - [x] backend view/API regression test가 issue type filtering, current-only filtering, recurring signal serialization을 검증한다.
  - [x] docs에 이 queue가 financial risk queue가 아니라 data-quality cleanup queue임이 명시된다.
- 참고:
  - 현재 recurring 후보 보수화는 이미 live다. 이 task는 서로 다른 cleanup issue가 하나의 priority score에 섞여 agent가 다음 액션을 고르기 어려운 문제를 푸는 작업이다.
  - DB view 확장과 dashboard API enrichment 중 어느 쪽이 source of truth가 될지 구현 전 결정한다.

#### 작업 T028. 거래 요약 집계 기준 metadata
- GitHub Issue: [#12](https://github.com/Gyu-bot/my_ledge/issues/12)
- 우선순위: P1
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] `/transactions/summary` 응답에 `basis` metadata가 포함된다.
  - [x] `basis.aggregation_surface`가 raw transactions summary인지 canonical cashflow인지 명시한다.
  - [x] `basis.amount_sign_convention`이 raw signed amount인지 normalized expense인지 명시한다.
  - [x] `basis.included_types`와 `basis.excluded_types`가 transaction type 포함/제외 기준을 명시한다.
  - [x] `basis.includes_loan_repayments`, `basis.excludes_deleted`, `basis.excludes_merged`, `basis.canonical_cashflow_equivalent` 또는 동등한 필드가 제공된다.
  - [x] loan repayment, transfer, deleted, merged row 처리 기준이 docs에 명시된다.
  - [x] canonical dashboard 숫자와 `/transactions/summary` 숫자가 다를 수 있는 이유가 response 또는 docs만으로 설명 가능하다.
  - [x] 필요한 경우 `basis=raw_transactions|canonical_cashflow|non_loan_expense` 같은 query param 도입 여부를 결정하고 구현한다.
  - [x] backend API regression test가 default summary basis metadata를 검증한다.
- 참고:
  - 현재 계산이 틀렸다는 뜻이 아니라 endpoint 이름만 보고 canonical cashflow와 같은 의미로 오해하기 쉬운 문제를 줄이는 task다.
  - `basis` query param이 scope creep이면 첫 PR은 response metadata만 구현하고 query param은 별도 후속 task로 분리해도 된다.

#### 작업 T029. 프로필/보험 empty-state metadata
- GitHub Issue: [#13](https://github.com/Gyu-bot/my_ledge/issues/13)
- 우선순위: P1
- 상태: 완료
- 선행 조건: T004, T008
- 완료 기준:
  - [x] `GET /api/v1/profile` empty state에서 `has_snapshot`, `missing_reason`, `expected_source` 또는 동등한 metadata가 제공된다.
  - [x] `GET /api/v1/insurance/summary` empty state에서 `has_contract_snapshot`, `missing_reason`, `expected_source` 또는 동등한 metadata가 제공된다.
  - [x] source section missing, source section present but parsed-null, snapshot row exists with partial null fields, intentionally blank, never imported 상태를 가능한 범위에서 구분한다.
  - [x] `monthly_premium_estimate`가 계약 snapshot 부재로 계산 불가한 경우 `basis` 또는 equivalent metadata로 이유를 명시한다.
  - [x] upload/import diagnostics와 연결할 수 있는 `last_upload_checked`, `source_section_found`, `parser_warning_count` 또는 동등한 metadata 도입 여부를 결정한다.
  - [x] backend API regression test가 profile no snapshot, insurance no snapshot, partial-null snapshot 사례를 검증한다.
  - [x] docs에 null field, missing snapshot, source section missing의 의미가 명시된다.
- 참고:
  - 이 task는 비어 있는 값을 임의로 채우는 작업이 아니다. API consumer가 empty response의 원인을 구분하게 만드는 task다.
  - parser-level diagnostics가 커지면 첫 PR은 response-level missing metadata로 제한하고 diagnostics는 별도 task로 분리해도 된다.

### 다음 P0 거래 신뢰도

#### 작업 T030. 거래 source lifecycle
- 우선순위: P0
- 상태: 완료
- 선행 조건: T000
- 완료 기준:
  - [x] BankSalad upload row와 사용자 수정 거래를 분리하는 transaction source lifecycle model이 도입된다.
  - [x] lifecycle status는 최소 `active`, `missing_from_latest_export`, `source_changed`, `superseded`를 표현하고, `duplicate_candidate`, `ambiguous`는 적용 전 검토가 필요한 review/reserved 상태로 모델에서 구분해 표현한다.
  - [x] transaction source tracking이 `source_row_hash`, `first_seen_import_id`, `last_seen_import_id`, `source_first_seen_at`, `source_last_seen_at`, `superseded_by_transaction_id` 또는 동등한 필드를 제공한다.
  - [x] 최신 파일에서 사라진 거래를 즉시 hard delete하지 않고 `missing_from_latest_export` 또는 동등한 상태로 보존한다.
  - [x] 기존 거래 수정 시 delete 후 insert보다 source field update 또는 supersession을 우선한다.
  - [x] BankSalad가 갱신할 수 있는 원본 필드와 업로드가 덮어쓰면 안 되는 사용자 필드가 코드와 contract docs에서 분리된다.
  - [x] 사용자 카테고리, 정규화 거래처, 대출 연결, 할부 연결, spending review 상태, memo가 재업로드로 손실되지 않는다.
  - [x] 거래별 source 이력 또는 import lineage를 조회할 수 있다.
  - [x] backend regression test가 missing row, changed source field, superseded transaction, preserved user override fixture를 포함한다.
  - [x] 관련 API/agent contract docs가 lifecycle status 해석 규칙을 설명한다.
- 참고:
  - Kept feature roadmap Track A의 첫 P0이다.
  - `transactions` soft delete와 upload incremental insert 동작을 유지하되, 반복 업로드에서 사용자 작업이 사라지지 않게 하는 기반이다.

#### 작업 T031. 업로드 preview와 reconciliation v2
- 우선순위: P0
- 상태: 완료
- 선행 조건: T030
- 완료 기준:
  - [x] upload apply 전에 DB를 변경하지 않는 reconciliation preview API가 제공된다.
  - [x] preview flow는 `파일 업로드 -> 파싱 -> reconciliation preview -> 안전 변경 자동 선택 -> 사용자 확인 -> apply`로 분리된다.
  - [x] preview change type은 최소 `new`, `unchanged`, `source_fields_changed`, `time_shifted`, `possible_replacement`, `missing_from_latest_export`, `possible_duplicate`, `ambiguous`를 표현한다.
  - [x] 안전하게 자동 적용할 변경과 사용자 검토가 필요한 변경이 response에서 분리된다.
  - [x] preview item이 기존 값, 신규 값, 판단 근거, 사용자 수정 보존 여부를 보여준다.
  - 제외: canonical/cashflow 영향 범위 표시는 2026-06-27 사용자 지시에 따라 T031 완료 범위에서 제외한다.
  - [x] apply API는 explicit confirmation 후 선택된 change set만 반영한다.
  - [x] apply 결과와 판단 근거가 upload log 또는 별도 reconciliation log에 기록된다.
  - [x] 기존 `POST /api/v1/upload` 호환 경로의 동작과 새 preview/apply flow의 관계가 문서화된다.
  - [x] backend API/service test가 preview no-write, safe apply, ambiguous no-auto-apply, upload log 기록을 검증한다.
  - [x] frontend surface가 포함되는 경우 `/data/import`에서 preview/apply flow를 브라우저로 확인한다.
- 참고:
  - `T030` lifecycle 없이는 replacement/missing/source-changed 판단이 불안정하므로 `T030` 이후에 착수한다.
  - 첫 PR은 backend preview/apply contract만 만들고 frontend는 후속으로 쪼갤 수 있다.

#### 작업 T032. settlement group canonical netting
- 우선순위: P0
- 상태: 완료
- 선행 조건: T030, T031
- 완료 기준:
  - [x] 원결제, 완전 취소, 부분환불, 복수 부분환불을 하나의 settlement group으로 묶는 model 또는 canonical layer가 도입된다.
  - [x] settlement status는 최소 `auto_confirmed`, `review_required`, `user_confirmed`, `rejected`를 표현한다.
  - [x] 자동 매칭은 동일/정규화 거래처, 동일 결제수단, 동일 통화, 반대 부호, 절대금액 일치 또는 원결제 이하, 근접 날짜, 원본 설명 유사도, 기존 연결 여부를 사용한다.
  - [x] 후보 원결제가 여러 개인 경우 자동 확정하지 않고 review queue로 보낸다.
  - [x] 사용자가 settlement 연결을 수정하거나 해제할 수 있다.
  - [x] 완전 취소는 실제 지출 합계에서 제외되고, 부분환불은 순액만 반영된다.
  - [x] settlement 순액은 공통 service/view로 제공되며, 현재 월간 지출, 카테고리 지출, 거래처 지출, 이상 지출, 구매 후 검토 분석에서 재사용한다. 반복결제 탐지, 예산 사용액, 현금흐름 예측 소비면은 후속 구현 시 같은 shared layer를 사용한다.
  - [x] 기존 `T012` spending review refund netting과 중복 계산하지 않고 shared settlement service/view로 수렴한다.
  - [x] backend regression test가 완전 취소, 부분환불, 복수 부분환불, 다중 원결제 후보, user rejected fixture를 포함한다.
  - [x] API/agent docs가 raw signed transaction과 settlement-netted analysis surface의 차이를 설명한다.
- 참고:
  - `T012`에서 구매 후보용 refund netting은 이미 구현됐지만, 이 task는 분석 전반에 재사용되는 공통 경제적 거래 layer로 승격하는 작업이다.

### 거래 신뢰 이후 자동화와 의사결정 지원

#### 작업 T033. 거래처 정규화 후보 엔진
- 우선순위: P1
- 상태: 계획됨
- 선행 조건: T030, T032
- 완료 기준:
  - [ ] 표기만 다른 동일 거래처를 결정론적 규칙으로 추천하는 candidate engine이 추가된다.
  - [ ] 후보 생성은 대소문자 통일, 공백 제거, 특수문자 정규화, 법인 표기 정리, 괄호/하이픈 정리, PG사 접두어 처리, 기존 alias dictionary, 문자열 유사도, 결제 패턴 비교를 사용한다.
  - [ ] 모든 추천은 confidence, reason, matched evidence, expected affected transaction count를 제공한다.
  - [ ] very high confidence는 자동 적용 가능 후보로 표시할 수 있지만, 실제 rule 저장/적용은 사용자 승인 또는 명시 설정을 따른다.
  - [ ] medium confidence는 `/data/inbox` 또는 `/data/rules` 추천으로 남기고 low confidence는 추천하지 않는다.
  - [ ] 사용자 거절 후보는 같은 근거로 반복 추천하지 않는다.
  - [ ] 승인 시 기존 merchant alias rule로 저장한다.
  - [ ] 거래별 수동 정규화 값은 자동 alias rule보다 우선한다.
  - [ ] backend test가 PG사 접두어, 법인 표기, 비슷하지만 다른 거래처, 거절 후보 재추천 방지를 검증한다.
  - [ ] frontend를 포함하는 경우 candidate review/approve/reject flow를 browser 또는 component test로 검증한다.
- 참고:
  - 기존 merchant alias rule/apply 기능은 live다. 이 task는 rule을 사람이 직접 입력하기 전 후보를 만들어주는 고도화다.
  - LLM/ML 도입 없이 deterministic rule로 시작한다.

#### 작업 T034. 승인 기반 분류 추천
- 우선순위: P1
- 상태: 계획됨
- 선행 조건: T030, T033
- 완료 기준:
  - [ ] 사용자의 과거 승인 결과를 기반으로 카테고리, 고정비/변동비, 필수/재량 추천을 생성한다.
  - [ ] 추천 우선순위는 `거래별 수동 override > 거래처 + 원본 설명 규칙 > 거래처 규칙 > 원본 소분류 규칙 > 원본 대분류 규칙 > 과거 동일 패턴의 다수 승인 결과 > 미분류`로 고정된다.
  - [ ] 거래처만으로 모호한 경우 원본 설명, 원본 소분류, 금액, 결제수단을 함께 사용한다.
  - [ ] 추천은 confidence, reason, source rule, matched historical approvals, affected count를 제공한다.
  - [ ] 단건 승인, 동일 패턴 전체 승인, 규칙 저장, 추천 거절, 기존 데이터 일괄 적용 preview를 지원한다.
  - [ ] 자동 적용 전 예상 변경 건수와 보존될 수동 override를 보여준다.
  - [ ] 거절한 추천은 동일 근거로 반복 노출하지 않는다.
  - [ ] 수동 수정은 자동 규칙보다 항상 우선한다.
  - [ ] backend test가 precedence, ambiguous merchant, rejection memory, preview count, manual override preservation을 검증한다.
  - [ ] 관련 `/data/inbox` 또는 `/data/rules` UI가 포함되면 visual/browser smoke를 수행한다.
- 참고:
  - 기존 category/recurring classification rule과 dry-run 기능을 대체하지 않고, 승인 기반 추천 queue를 얹는 작업이다.

#### 작업 T035. 반복결제 series 분리
- 우선순위: P1
- 상태: 계획됨
- 선행 조건: T032, T033
- 완료 기준:
  - [ ] 한 거래처 안에 여러 월간 결제가 존재할 때 별도 recurring series로 분리한다.
  - [ ] series key 후보는 정규화 거래처, 결제수단, 금액 클러스터, 결제일 패턴, 원본 설명 유사도를 함께 사용한다.
  - [ ] 정액 구독은 동일 금액 또는 `+-1%` 범위, 보험/통신은 안정 범위 내 변동, 공과금은 금액보다 결제일 반복 우선, 해외 결제는 외화 금액 또는 환율 변동을 고려한다.
  - [ ] 환불/취소/settlement reversal 거래는 반복 횟수와 금액 안정성 계산에서 제외된다.
  - [ ] series candidate마다 confidence, separation reason, matched transaction ids, excluded settlement ids를 제공한다.
  - [ ] 불확실한 series는 사용자 승인 대상으로 남긴다.
  - [ ] 기존 `recurring_payment_kind` 거래 단위 분류와 충돌하지 않고, series는 반복 계약 후보의 상위 grouping으로 취급한다.
  - [ ] backend test가 같은 merchant의 두 구독, 통신비 변동, 공과금, 해외 결제, 환불 제외 fixture를 포함한다.
  - [ ] agent docs가 merchant-level recurring과 series-level recurring의 차이를 설명한다.
- 참고:
  - 현재 recurring 후보 보수화와 dry-run은 live지만 merchant 단위에 가깝다. 이 task는 계약/series 단위로 분리하는 기반이다.

#### 작업 T036. 반복계약 ledger
- 우선순위: P1
- 상태: 계획됨
- 선행 조건: T035
- 완료 기준:
  - [ ] recurring series candidate를 지속 관리되는 recurring contract ledger로 승격할 수 있다.
  - [ ] contract row는 `display_name`, `merchant`, `expected_amount`, `amount_tolerance`, `expected_day`, `expected_interval`, `payment_method`, `status`, `first_observed_at`, `last_observed_at`, `next_expected_at`, `annualized_cost` 또는 동등한 필드를 가진다.
  - [ ] status는 최소 `candidate`, `active`, `paused`, `cancelled`, `ended_candidate`, `missing_payment`, `price_changed`를 표현한다.
  - [ ] 다음 결제일, 예상 금액 범위, 연간 환산 비용, 신규 반복결제, 가격 인상, 결제 누락, 종료 추정, 해지 후 재발생을 계산하거나 후보로 제안한다.
  - [ ] 실제 거래가 들어오면 예상 결제와 자동 연결하되 ambiguous match는 review 상태로 남긴다.
  - [ ] 반복계약과 할부 계획은 별도 개념으로 유지한다.
  - [ ] 사용자가 활성/종료/반복 아님 상태를 관리할 수 있다.
  - [ ] 90일 현금흐름 예측에서 confirmed/high-confidence expected outflow로 사용할 수 있는 API 또는 canonical view가 제공된다.
  - [ ] backend test가 active contract, price change, missing payment, cancelled contract, installment-not-recurring separation을 검증한다.
  - [ ] docs가 recurring contract ledger와 기존 recurring classification rule의 역할 차이를 설명한다.
- 참고:
  - `T037` cashflow calendar의 핵심 입력이므로 forecasting 전에 먼저 끝내는 것이 좋다.

#### 작업 T037. 90일 현금흐름 calendar
- 우선순위: P1
- 상태: 계획됨
- 선행 조건: T006, T010, T024, T032, T036
- 완료 기준:
  - [ ] 향후 90일 일별 예상 잔액을 계산하는 API 또는 canonical surface가 제공된다.
  - [ ] 입력은 최신 현금성 자산, 최근 급여 패턴과 급여일 설정, 대출 월상환액과 상환일, 할부 forecast, recurring contract 예상 결제, 카드 결제일, 비정기 지출 적립금, 사용자가 등록한 예정 현금 유출입을 포함할 수 있다.
  - [ ] 출력은 향후 30/60/90일 최저 잔액, 잔액 부족 예상일, 급여일까지 안전 사용 가능 금액, 확정 예정 지출, 추정 예정 지출을 포함한다.
  - [ ] 각 예상 거래는 `confirmed`, `high_confidence`, `estimated`, `manual_plan`, `unknown` 또는 동등한 confidence를 가진다.
  - [ ] 오래된 데이터에는 stale 경고를 표시한다.
  - [ ] 투자 평가액은 기본 가용 현금에 포함하지 않는다.
  - [ ] forecast는 관측 cashflow를 수정하지 않고 projection layer로만 제공된다.
  - [ ] backend test가 급여 전 잔액 부족, 반복계약, 대출상환, 할부 forecast, stale input, 투자자산 제외 fixture를 포함한다.
  - [ ] frontend surface가 포함되면 `/signals` 또는 `/data/settings` 연결 화면을 browser smoke로 확인한다.
  - [ ] docs가 forecast confidence와 observed/canonical cashflow의 차이를 설명한다.
- 참고:
  - 월간 총액 분석이 아니라 날짜별 유동성 위험을 보기 위한 surface다.
  - `T036` 없이도 최소 forecast는 가능하지만, 제품 의미가 약하므로 recurring contract ledger 이후로 둔다.

#### 작업 T038. sinking fund와 adaptive budget
- 우선순위: P1
- 상태: 계획됨
- 선행 조건: T010, T037
- 완료 기준:
  - [ ] 여행, 경조사, 자동차 유지비 같은 비정기 지출을 위한 sinking fund goal model 또는 settings section이 정의된다.
  - [ ] 월 필요 적립액은 `(목표 금액 - 현재 준비액) / 남은 개월`을 기본으로 계산한다.
  - [ ] 추천 근거는 최근 12개월 합계, 월별 중앙값, 상위 75/90 percentile, 계절성, 일회성 제외 여부, 반복된 연간 지출을 포함할 수 있다.
  - [ ] adaptive budget은 필수 월지출, 재량 월지출 한도, 비정기 지출 적립, 대출 추가상환, 장기 목표 적립을 분리해 표현한다.
  - [ ] forecast에 예정 적립액을 반영할 수 있다.
  - [ ] 적립금으로 준비한 거래를 단순 이상 지출로만 처리하지 않도록 anomaly/spending review basis가 구분된다.
  - [ ] 시스템 추천은 사용자 승인 후에만 goal/plan으로 저장된다.
  - [ ] backend test가 annual expense, seasonal expense, approved sinking fund, rejected suggestion, forecast inclusion을 검증한다.
  - [ ] agent docs가 My Ledge는 계산/추천 근거를 제공하고 최종 예산 판단은 사용자 또는 advisor layer가 수행한다고 설명한다.
- 참고:
  - 기존 `T010` financial targets는 미니멀 목표 설정이다. 이 task는 더 넓은 budgeting/product feature다.

#### 작업 T039. 대출 상환 scenario simulator
- 우선순위: P1
- 상태: 계획됨
- 선행 조건: T005, T010, T024
- 완료 기준:
  - [ ] 대출 잔액, 금리, 월상환액, 상환 방식 metadata를 기반으로 추가상환 시나리오를 비교하는 API가 제공된다.
  - [ ] 기본 시나리오는 현재 상환 유지, 월 10만원/30만원/50만원 추가, 최고금리 우선, 최저잔액 우선, 사용자 지정 순서, 금리 상승, 일부 일시상환, 리파이낸싱 가정을 포함할 수 있다.
  - [ ] 출력은 예상 완납일, 총 예상 이자, 기준안 대비 절감 이자, 상환기간 단축, 월별 현금 부담, 비상금 목표 영향을 포함한다.
  - [ ] 계산에 사용한 가정과 누락 데이터를 response basis에 명시한다.
  - [ ] 중도상환수수료, 실제 상환 스케줄, 변동금리 조건이 없으면 미반영 사실을 표시한다.
  - [ ] My Ledge는 비교 계산과 근거만 제공하고 최종 판단은 사용자 또는 외부 advisor가 수행한다.
  - [ ] backend test가 fixed-rate amortization approximation, missing fee warning, emergency fund impact, manual scenario order, rate increase assumption을 검증한다.
  - [ ] docs가 실제 금융 조언이 아니라 scenario calculator임을 명시한다.
- 참고:
  - `T025` active/historical scope metadata는 Done이므로, scenario input은 active loan summary와 canonical loan inventory의 scope 차이를 존중해야 한다.

#### 작업 T041. 제한적 다차원 거래 tag
- 우선순위: P2
- 상태: 계획됨
- 선행 조건: T030, T034
- 완료 기준:
  - [ ] 기존 카테고리와 별개로 거래 맥락을 표현하는 tag model이 도입된다.
  - [ ] 1차 tag type은 최소 `context`, `person`, `project`, `reimbursable`, `shared` 또는 동등한 제한된 set으로 시작한다.
  - [ ] 사용자가 단건 거래 또는 선택 거래에 태그를 일괄 적용할 수 있다.
  - [ ] 동일 거래처/기간 기반 추천과 승인 기반 규칙 재사용은 가능하되, 자동 태깅보다 사용자 승인 flow를 우선한다.
  - [ ] 금액 분할은 범위에 포함하지 않는다.
  - [ ] 태그는 category, spend necessity, recurring kind, loan/installment link를 대체하지 않는다.
  - [ ] export/API/agent surface에서 tag filtering 또는 tag aggregation을 제공한다.
  - [ ] backend test가 tag CRUD, bulk apply, filtered transaction list, rejected suggestion memory, category independence를 검증한다.
  - [ ] frontend가 포함되면 거래 테이블 bulk edit과 tag filter UX를 browser smoke로 확인한다.
  - [ ] 실제 사용 수요가 확인되기 전에는 tag taxonomy 자동 확장이나 split accounting을 추가하지 않는다.
- 참고:
  - Kept feature roadmap에서 `제한적 유지`로 분류된 항목이다.
  - 공동비용/환급/여행 같은 맥락 표시는 유용하지만, accounting split까지 들어가면 별도 큰 기능이 되므로 명시적으로 제외한다.

---

## 아카이브 메모

- `docs/planned-work.md`는 `docs/archive/planning/2026-06-10-planned-work.md`로 아카이브되었다.
- `docs/superpowers/plans/2026-06-10-advisor-canonical-gap-priority.md`는 `docs/archive/planning/2026-06-10-advisor-canonical-gap-priority.md`로 아카이브되었다.
- 앞으로의 에이전트는 아카이브 문서의 미체크 항목을 이 파일에 반영되어 있지 않은 한 current backlog로 보지 않는다.
