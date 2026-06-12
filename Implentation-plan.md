# My Ledge Global Execution Plan

작성일: 2026-06-10
상태: Active global execution plan
이 문서는 앞으로 프로젝트의 전역 실행계획과 backlog tracking 기준 문서다.

> 파일명은 사용자 요청의 철자 그대로 `Implentation-plan.md`를 사용한다.

## How To Use

- 새 작업은 이 문서의 Task ID 기준으로 시작한다.
- feature/fix PR에서는 `docs/STATUS.md`를 직접 갱신하지 말고 PR 본문 `Status impact`에 mainline 반영 내용을 남긴다.
- 이 문서 자체를 갱신하는 작업은 docs/planning 작업으로 취급한다.
- 실제 live contract 판단은 코드와 `docs/backend-api-ssot.md`를 우선한다.
- API, schema, canonical view, frontend route가 바뀌면 관련 contract/source-of-truth 문서를 같은 PR에서 최소 범위로 갱신한다.
- 실데이터 acceptance가 있는 task는 `tmp/2025-05-21~2026-05-21.xlsx` 기준 수치를 재현해야 한다.

## Status Values

- `Ready`: 바로 착수 가능
- `Planned`: 아직 착수 전이며 선행 task가 있거나 범위 조정이 필요함
- `In Progress`: 현재 작업 중
- `Done`: acceptance criteria 충족 완료
- `Blocked`: 외부 결정/권한/데이터가 필요함
- `Paused`: 명시적으로 보류됨

## Priority Guide

- `P0`: 계산 정합성, 데이터 신뢰도, agent read contract에 즉시 영향
- `P1`: 현재 workflow 개선 또는 advisor 품질에 큰 영향
- `P1.5`: 가치가 있으나 P0/P1 이후 독립 PR로 다룰 항목
- `P2`: 큰 구조 변경, 장기 제품 방향, 별도 승인 후 진행할 항목
- `Paused`: 의도적으로 뒤로 미룬 항목

## Source Documents

- Current active plan: `Implentation-plan.md`
- Archived backlog source: `docs/archive/planning/2026-06-10-planned-work.md`
- Archived advisor execution source: `docs/archive/planning/2026-06-10-advisor-canonical-gap-priority.md`
- Advisor gap analysis evidence: `docs/advisor-canonical-gap-analysis.md`
- Current live API contract: `docs/backend-api-ssot.md`
- Detailed API/metric reference: `docs/backend-api-and-metrics-reference.md`
- Agent canonical value dictionary: `docs/agents/canonical-read-surface-reference.md`

---

## Current Priority Queue

1. `T012` remains the next focused correctness/workflow task: purchase review placement, snooze/dismiss consistency, and refund netting.
2. `T012A` should be handled as part of `T012` so purchase review naming, aliasing, timing, and future-friction semantics are clear in the same workflow PR.
3. `T023` and `T024` are the next agent-facing cashflow/liquidity contract hardening tasks; they can share closed-month baseline utilities but should close separate GitHub issues.
4. `T028` and `T029` are small, high-leverage response metadata tasks for agent interpretation stability.
5. `T026`, `T027`, and `T025` are follow-up API quality tasks for anomalies, data-quality queue filtering, and loan active/historical scope.
6. `T013` and `T014` remain planned but can run independently when frontend settings or operational smoke capture becomes the current priority.
7. Existing broad P2 asset lifecycle/source-priority work starts only after issue-backed agent contract tasks land or are explicitly reprioritized.

---

## Tasks

#### Task T000. 전역 실행계획 문서 전환
- Priority: P0
- Status: Done
- Depends on: None
- Acceptance Criteria:
  - [x] `docs/planned-work.md`의 미구현 backlog가 새 전역 계획에 반영되어 있다.
  - [x] `docs/superpowers/plans/2026-06-10-advisor-canonical-gap-priority.md`의 advisor canonical 우선순위가 새 전역 계획에 반영되어 있다.
  - [x] 각 작업 단위가 `Priority`, `Status`, `Depends on`, `Acceptance Criteria`, `Notes` 형식으로 tracking 가능하다.
  - [x] 기존 계획 문서가 `docs/archive/planning/` 아래로 이동되어 historical reference가 된다.
  - [x] 프로젝트 시작점 문서가 `Implentation-plan.md`를 전역 실행계획으로 안내한다.
- Notes:
  - `docs/STATUS.md`는 계속 mainline handoff/status snapshot 역할을 맡는다.
  - archived 문서는 참고용이며 current backlog 판단은 이 문서를 우선한다.

#### Task T001. 음수 자산 중복 차감 제거와 canonical 순자산 정합성 보정
- Priority: P0
- Status: Done
- Depends on: T000
- Acceptance Criteria:
  - [x] `vw_asset_snapshot_canonical.asset_total`이 `side='asset' AND amount >= 0`인 row만 합산한다.
  - [x] `negative_asset_excluded_total` 컬럼이 추가되어 음수 자산 row 제외분을 노출한다.
  - [x] 마이너스통장처럼 자산 측 음수 row와 부채 측 대출 row가 동시에 존재해도 순자산이 이중 차감되지 않는다.
  - [x] `GET /api/v1/analytics/net-worth-breakdown`와 `GET /api/v1/analytics/liquidity-health`의 Python 계산 경로가 canonical view 규칙과 일치한다.
  - [x] 제외가 발생한 snapshot에서는 응답 `assumptions`에 `negative_asset_rows_excluded` 또는 동등한 명시적 근거가 포함된다.
  - [x] backend regression test가 음수 자산 + 대응 부채 fixture를 포함한다.
  - [x] `docs/agents/canonical-read-surface-reference.md`와 `docs/backend-api-and-metrics-reference.md`에 새 컬럼과 해석 규칙이 문서화된다.
  - [x] 실데이터 workbook 기준 마이너스통장 중복 차감 해소분이 재현된다.
- Notes:
  - parser/raw table은 수정하지 않고 canonical/service 레이어에서 정규화한다.
  - `T002`와 같은 migration/PR로 묶어도 된다.

#### Task T002. 현금성 자산 fallback 휴리스틱 보강
- Priority: P0
- Status: Done
- Depends on: T000
- Acceptance Criteria:
  - [x] `vw_asset_snapshot_canonical.cash_equivalent_total`이 음수 자산 row를 제외한다.
  - [x] category fallback이 `자유입출금`, `전자금융`을 포함한다.
  - [x] product fallback이 `통장`을 포함하되 `청약`, `저금통`, `보험`, `연금`, `부동산` 같은 locked/non-cash 후보를 현금성으로 오분류하지 않는다.
  - [x] `backend/app/services/assets_service.py:_is_cash_equivalent_asset`가 DB view와 같은 판단 순서를 사용한다.
  - [x] 사용자 명시값 `is_cash_equivalent`와 `liquidity_tier`는 기존처럼 휴리스틱보다 우선한다.
  - [x] 실데이터 workbook 기준 `cash_equivalent_total`이 약 `310099`로 재현된다.
  - [x] `emergency_fund_months`가 이 사용자의 실제 비상금 부족 상태를 왜곡 없이 보여준다.
  - [x] backend regression test가 자유입출금/통장/음수 asset row 사례를 포함한다.
- Notes:
  - `T001`과 같은 canonical view 재생성 migration에서 처리하는 것이 좋다.

#### Task T003. 대출 금리/잔액/만기 surface 문서 승격
- Priority: P0
- Status: Done
- Depends on: T000
- Acceptance Criteria:
  - [x] `docs/agents/canonical-read-surface-reference.md`의 surface 선택표에 `대출 구조/금리/만기 -> GET /api/v1/loans/summary`가 추가된다.
  - [x] `/loans/summary`의 `interest_rate`, `balance`, `principal`, `monthly_payment`, `monthly_payment_source`, `repayment_method`, `maturity_date` 의미가 값 사전에 문서화된다.
  - [x] `docs/agent-integration/integration-guide.md`에서 대출 상환 부담과 대출 구조를 구분해 안내한다.
  - [x] `docs/backend-api-and-metrics-reference.md`에 금리는 snapshot 시점 값이며 상환 우선순위 판단은 agent 해석이라는 주의가 포함된다.
  - [x] 코드 변경 없이 문서 diff만 발생한다.
- Notes:
  - `GET /api/v1/loans/summary` 자체는 이미 live다.

#### Task T004. 뱅샐현황 고객정보 profile snapshot 수집과 API 추가
- Priority: P1
- Status: Done
- Depends on: T001, T002
- Acceptance Criteria:
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
- Notes:
  - 나이와 신용점수는 advisor 판단 재료이며 My Ledge가 리파이낸싱 같은 조언을 생성하지 않는다.

#### Task T005. 대출 계좌 canonical view `vw_loan_account_canonical` 추가
- Priority: P1
- Status: Done
- Depends on: T003
- Acceptance Criteria:
  - [x] Alembic migration이 `vw_loan_account_canonical`을 생성한다.
  - [x] 최신 loan snapshot 선별은 lender/product_name 또는 안정 계좌 identity 기준으로 중복 snapshot 합산을 방지한다.
  - [x] view가 `loan_account_id`, `display_name`, `lender`, `product_name`, `loan_kind`, `snapshot_date`, `principal`, `balance`, `interest_rate`, `monthly_payment`, `monthly_payment_source`, `repayment_method`, `start_date`, `maturity_date`, `estimated_monthly_interest`를 제공한다.
  - [x] `loan_accounts`에 아직 매핑되지 않은 snapshot loan도 누락되지 않는다.
  - [x] `estimated_monthly_interest`는 `round(balance * interest_rate / 100 / 12)`로 계산하고 null 입력에서는 null을 반환한다.
  - [x] `backend/app/services/canonical_views.py`와 `/schema`에 view가 등록된다.
  - [x] 실데이터 workbook 기준 4.03% 주담대 월 이자 추정치가 약 `573000`이고 5.85% 신용대출이 최고 금리 row로 식별된다.
  - [x] schema/view regression test가 추가된다.
  - [x] agent/reference 문서에 단리 근사값이며 실제 상환 스케줄이 아니라는 해석 주의가 포함된다.
- Notes:
  - dashboard API 포함은 1차 scope가 아니다. readonly SQL/canonical view와 문서 등재를 먼저 완료한다.

#### Task T006. canonical dashboard 데이터 커버리지와 부분월 flag 추가
- Priority: P1
- Status: Done
- Depends on: T001, T002
- Acceptance Criteria:
  - [x] `GET /api/v1/canonical-views/dashboard` 최상위 응답에 `data_coverage.first_transaction_date`와 `data_coverage.last_transaction_date`가 추가된다.
  - [x] `monthly_cashflow[]` row에 `is_complete_month`가 추가된다.
  - [x] `true_spendable_monthly[]` row에 `is_complete_month`가 추가된다.
  - [x] dashboard가 노출하는 fixed cost 계열 월별 row에도 동일한 complete-month 판단이 적용된다.
  - [x] complete-month 판단은 해당 월의 시작과 끝이 전체 거래 관측 범위 안에 모두 포함되는지로 계산한다.
  - [x] 진행월의 `income_basis='estimated'`와 `is_complete_month=false`가 서로 독립적으로 표현된다.
  - [x] 실데이터 workbook 기준 `2025-05=false`, `2025-06`부터 `2026-04=true`, `2026-05=false`가 재현된다.
  - [x] API schema와 API regression test가 추가된다.
  - [x] agent 문서에 `is_complete_month=false` 월을 baseline/추세 계산에서 제외하거나 부분월임을 명시하라는 규칙이 추가된다.
- Notes:
  - DB view 원본값은 바꾸지 않고 dashboard API enrichment로 처리한다.

#### Task T007. 월별 수입 구성 canonical view 추가
- Priority: P1
- Status: Done
- Depends on: T006
- Acceptance Criteria:
  - [x] Alembic migration이 `vw_income_monthly_by_category`를 생성한다.
  - [x] source는 `vw_transactions_effective`이고 `type='수입'`만 포함한다.
  - [x] view는 `period`, `effective_category_major`, `income_total`, `transaction_count`를 제공한다.
  - [x] category별 월 수입 합계가 같은 월의 `vw_monthly_cashflow.income_total`과 일치한다.
  - [x] 실데이터 workbook 기준 2026-02의 급여, 보험금, 기타 수입이 분리된다.
  - [x] `backend/app/services/canonical_views.py`와 `/schema`에 view가 등록된다.
  - [x] schema/view regression test가 추가된다.
  - [x] agent/reference 문서에 `급여` 카테고리는 BankSalad 또는 사용자 수정 effective category 기준이며 정기성 판단은 월별 분해를 보고 agent가 해석한다고 명시된다.
- Notes:
  - 첫 PR에서는 `vw_monthly_cashflow`에 `salary_income_total`/`non_salary_income_total`을 추가하지 않는다. 명확한 consumer가 생기면 별도 task로 승격한다.

#### Task T008. 보험 계약 snapshot 수집과 summary API
- Priority: P1.5
- Status: Done
- Depends on: T004
- Acceptance Criteria:
  - [x] parser가 `4.보험현황`에서 보험사, 보험명, 계약상태, 총납입금, 계약일자, 만기일자를 파싱한다.
  - [x] `총계` row는 저장하지 않는다.
  - [x] `insurance_contracts` 테이블이 Alembic migration으로 추가된다.
  - [x] 같은 snapshot date 재업로드 시 보험 계약 snapshot은 replace 패턴을 따른다.
  - [x] `GET /api/v1/insurance/summary`가 최신 계약 목록을 반환한다.
  - [x] `monthly_premium_estimate`는 최근 마감월 보험 카테고리 지출 기반으로 계산하고 assumptions에 근거를 남긴다.
  - [x] 계약-거래 매핑은 제공하지 않는다고 문서화된다.
  - [x] parser, upload, API regression test가 추가된다.
  - [x] agent/reference 문서가 갱신된다.
- Notes:
  - 보험료 적정성 판단은 agent layer 해석이다. My Ledge는 계약과 추정 보험료 재료만 제공한다.

#### Task T009. BankSalad 현금흐름현황 기반 import parity hardening
- Priority: P1.5
- Status: Done
- Depends on: T001, T002
- Acceptance Criteria:
  - [x] `2.현금흐름현황`의 월별/카테고리별 집계 값을 저장하지 않고 검증 기준값으로만 읽는다.
  - [x] upload 또는 parity 검증 스크립트가 BankSalad 현금흐름현황과 DB 거래 재집계를 비교한다.
  - [x] 불일치는 upload 차단이 아니라 경고 리포트로 남긴다.
  - [x] 리포트에는 비교 월, category, BankSalad 값, DB 값, 차이가 포함된다.
  - [x] 수식 셀을 값으로 오독하지 않도록 숫자 값 영역만 사용한다.
  - [x] prepared workbook으로 parity smoke를 재현한다.
  - [x] 실패 시 upload log 또는 검증 리포트가 어느 row 범위를 비교했는지 남긴다.
- Notes:
  - 기존 import parity hardening 항목을 실데이터 기반 외부 기준값 검증으로 구체화한 task다.

#### Task T010. 미니멀 financial targets settings
- Priority: P1.5
- Status: Done
- Depends on: T001, T002, T006
- Acceptance Criteria:
  - [x] `GET /api/v1/settings/analytics` 응답에 `financial_targets` 섹션이 추가된다.
  - [x] `PATCH /api/v1/settings/analytics`가 `emergency_fund_target_months`, `savings_rate_target`, `debt_strategy_preference`를 저장한다.
  - [x] `emergency_fund_target_months` 기본값은 3이다.
  - [x] `savings_rate_target` 기본값은 null이다.
  - [x] `debt_strategy_preference`는 `avalanche`, `snowball`, null만 허용한다.
  - [x] `/analytics/liquidity-health`가 `emergency_fund_target_months`와 `target_progress_ratio`를 echo한다.
  - [x] agent가 목표를 제안할 수는 있지만 저장은 사용자 명시 의사로만 한다는 규칙이 문서화된다.
  - [x] API settings regression test가 추가된다.
- Notes:
  - budgets/goals 전체 기능은 P2에 남긴다. 이 task는 advisor가 목표 대비 현재 위치를 말할 수 있게 하는 최소 선행분이다.

#### Task T011. 투자 집중도 보조 필드
- Priority: P1.5
- Status: Done
- Depends on: T000
- Acceptance Criteria:
  - [x] `GET /api/v1/investments/summary` items에 `pct_of_investment_total`이 추가된다.
  - [x] 계산식은 `market_value / totals.market_value`이며 분모가 0이면 null을 반환한다.
  - [x] 성과/수익률/매수매도 attribution은 추가하지 않는다.
  - [x] agent/reference 문서에 snapshot 구성 비율일 뿐 투자 성과 분석이 아니라고 명시한다.
  - [x] API regression test가 추가된다.
  - [x] 실데이터 workbook 기준 알파벳 단일종목 집중도가 투자자산의 약 56%로 노출된다.
- Notes:
  - 투자 성과/상품 배분 분석은 증권사 API 이후로 미룬다는 기존 결정은 유지한다.

#### Task T012. 구매 게이트 review workflow와 결제취소 상계
- Priority: P1
- Status: Ready
- Depends on: T000
- Acceptance Criteria:
  - [ ] `/operations/purchase-review` 또는 insights 내 review-focused section의 위치가 결정된다.
  - [x] purchase gate 후보에 review memo를 저장할 수 있다.
  - [x] 후보 review 상태에 `reviewed_at`이 기록된다.
  - [x] 후보 재노출 제어를 위한 `cooldown_until` 또는 동등한 상태가 저장된다.
  - [ ] snooze/dismiss 후보의 재노출 규칙이 backend와 frontend에서 일관된다.
  - [x] 기존 purchase gate 후보 생성 규칙은 고정비, 필수지출, 대출연결, 필요성 미분류 거래를 제외한다.
  - [ ] `type='지출'`이면서 양수인 결제취소/환불 row를 같은 거래처/결제수단/통화/절대금액과 근접 날짜 기준으로 원결제 row와 상계한다.
  - [ ] 완전 취소되어 순액이 0인 원결제는 purchase gate 후보에서 제외한다.
  - [ ] 부분 환불은 원결제 금액이 아니라 환불 차감 후 순지출 기준으로 `min_candidate_amount`, `large_purchase_threshold`, spike 신호를 판단한다.
  - [ ] 자동 매칭 신뢰도가 낮은 환불 의심 케이스는 임의 제외하지 않고 `assumptions` 또는 reason/signal로 드러낸다.
  - [ ] 관련 API contract 문서와 frontend wireframe 문서가 갱신된다.
  - [ ] backend API test가 `-150000` 원결제와 `+150000` 결제취소 fixture를 포함하고, 완전 취소 건이 후보에서 제외됨을 검증한다.
  - [ ] backend API test가 부분 환불 fixture를 포함하고, 순지출 기준 후보 판단을 검증한다.
  - [ ] frontend interaction test 또는 browser smoke가 포함된다.
- Notes:
  - My Ledge는 구매 허용/금지 판단을 하지 않고 review queue와 근거만 제공한다.
  - 결제취소/환불 상계는 구매 허용/금지 판단이 아니라 관측 거래가 실제 구매로 남았는지 정규화하는 전처리다.
  - backend review 저장 API는 이미 live이며, 남은 범위는 review-focused frontend placement, frontend snooze/dismiss 일관성, refund netting이다.

#### Task T012A. purchase review naming, alias, timing, and future-friction contract
- Parent Task: T012
- GitHub Issue: [#14](https://github.com/Gyu-bot/my_ledge/issues/14)
- Priority: P1
- Status: Ready
- Depends on: T000
- Acceptance Criteria:
  - [ ] 현재 `/analytics/purchase-gate-candidates` docs가 already-posted transaction 기반 post-transaction spending review 후보임을 명시한다.
  - [ ] 기존 `/analytics/purchase-gate-candidates` endpoint는 호환성을 위해 유지된다.
  - [ ] preferred alias `/analytics/spending-review-candidates` 또는 동등한 이름이 추가된다.
  - [ ] docs에 `purchase-gate-candidates`는 legacy naming이고 preferred name은 spending review/future-friction candidate surface임이 명시된다.
  - [ ] response에 `review_timing='post_transaction'` 또는 동등한 timing field가 포함된다.
  - [ ] response에 `candidate_purpose='future_friction_rule_candidate'` 또는 동등한 purpose field가 포함된다.
  - [ ] response가 `future_friction_suggestion` 또는 동등한 구조로 condition/action을 표현할 수 있다.
  - [ ] frontend/API client가 새 alias를 사용할지 기존 endpoint를 유지할지 결정하고, 사용자-facing label은 post-transaction review 의미로 정리한다.
  - [ ] 진짜 pre-purchase gate는 planned purchase intent를 입력으로 받는 별도 issue/surface로 분리하고, 이 task 범위에서는 구현하지 않는다.
  - [ ] backend API regression test가 legacy endpoint와 preferred alias가 같은 후보 contract를 반환함을 검증한다.
  - [ ] 관련 API contract 문서와 agent 문서가 갱신된다.
- Notes:
  - 이 subtask는 기존 기능 제거가 아니라 현재 기능의 시점을 이름과 contract에 정확히 반영하는 작업이다.
  - `T012`의 review placement/snooze/refund netting과 같은 PR에서 처리해 user-facing purchase review workflow를 한 번에 정리한다.

#### Task T013. Settings frontend
- Priority: P1
- Status: Planned
- Depends on: T010
- Acceptance Criteria:
  - [ ] `/settings` route가 추가된다.
  - [ ] shell navigation 또는 하단 entry에서 settings로 진입할 수 있다.
  - [ ] analytics settings panel이 현재 backend settings 값을 조회하고 저장한다.
  - [ ] purchase gate threshold/settings를 편집할 수 있다.
  - [ ] discretionary velocity threshold/settings를 편집할 수 있다.
  - [ ] recurring dry-run 기본값/settings를 편집할 수 있다.
  - [ ] asset-liability settings와 financial targets를 편집할 수 있다.
  - [ ] reset-to-default, export/import는 일반 사용자 UI가 아니라 별도 개발/리뷰 도구로 남긴다.
  - [ ] frontend typecheck/lint/test가 통과한다.
  - [ ] Codex 인앱 브라우저로 `/settings` 기본 흐름을 확인한다.
  - [ ] frontend docs가 갱신된다.
- Notes:
  - frontend/UI 작업이므로 브라우저 또는 동등한 visual check가 필요하다.

#### Task T014. 운영 배포본 smoke capture
- Priority: P1
- Status: Planned
- Depends on: T000
- Acceptance Criteria:
  - [ ] overview 화면의 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] spending 화면의 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] assets 화면의 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] insights 화면의 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] operations workbench 화면의 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] loan mapping 화면의 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] asset settings 화면의 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] installments 화면의 운영 배포본 screenshot과 console 상태가 기록된다.
  - [ ] API proxy와 runtime config가 운영 환경에서 정상 동작함을 확인한다.
  - [ ] 발견된 문제는 별도 fix task 또는 issue로 분리된다.
- Notes:
  - local DOM smoke는 이미 완료된 기록이 있으므로 이 task는 운영 배포본 확인에 집중한다.

#### Task T015. Asset raw observation lifecycle와 canonical inclusion policy
- Priority: P2
- Status: Planned
- Depends on: T001, T002, T005
- Acceptance Criteria:
  - [ ] raw observation은 일반 운영에서 hard delete하지 않는다.
  - [ ] asset/investment/loan observation에 lifecycle status 또는 별도 metadata table이 도입된다.
  - [ ] status는 최소 `active`, `hidden_by_user`, `matured_candidate`, `matured_confirmed`, `replaced`, `duplicate`, `conflict`, `stale`, `needs_review`를 표현한다.
  - [ ] `hidden_by_user`, `matured_confirmed`, `replaced`, `duplicate` observation은 raw audit에서는 보이지만 기본 canonical totals에서는 제외된다.
  - [ ] `stale`은 freshness 신호일 뿐 자동 제외 근거가 아니다.
  - [ ] 만기 지난 대출/자산은 자동 숨김이 아니라 review candidate로 제안된다.
  - [ ] preview API가 canonical total 영향, latest asset screen 영향, raw audit 보존 여부를 보여준다.
  - [ ] apply API가 explicit confirmation 후 감사 가능한 이유와 actor/source를 남긴다.
  - [ ] 관련 contract docs와 agent coverage 해석 규칙이 갱신된다.
- Notes:
  - 이 task부터는 더 큰 asset reconciliation 구조 변경이므로 advisor canonical P0/P1 완료 후 착수한다.

#### Task T016. User-controlled source priority profiles
- Priority: P2
- Status: Planned
- Depends on: T015
- Acceptance Criteria:
  - [ ] source priority profile 저장 모델이 추가된다.
  - [ ] global default priority를 표현할 수 있다.
  - [ ] asset class별 priority를 표현할 수 있다.
  - [ ] canonical asset key별 override를 표현할 수 있다.
  - [ ] field별 override를 표현할 수 있다.
  - [ ] priority 변경은 historical observation을 수정하지 않고 future resolution rule로 기록된다.
  - [ ] `/settings/assets/source-priority` 또는 동등한 설정 surface가 정의된다.
  - [ ] `GET/PATCH /api/v1/assets/source-priority` 또는 동등한 API가 제공된다.
  - [ ] agent는 source conflict를 임의로 해결하지 않고 저장된 priority와 conflict reason을 설명한다.
- Notes:
  - 증권사/부동산/수동 valuation 같은 외부 source adapter와 연결될 기반이다.

#### Task T017. Deterministic field-level resolution and conflict queue
- Priority: P2
- Status: Planned
- Depends on: T015, T016
- Acceptance Criteria:
  - [ ] 동일 자산 identity의 여러 source를 `canonical_asset_key + as_of_date`로 묶는다.
  - [ ] lifecycle에서 제외된 observation은 resolution 후보에서 제외된다.
  - [ ] field별 source priority가 적용된다.
  - [ ] tie-break 순서가 `user_confirmed`, source priority, fresher observed_at, source_confidence, ingested_at, stable row id 순으로 고정된다.
  - [ ] tolerance를 넘는 같은 우선순위 source 충돌은 conflict queue에 남긴다.
  - [ ] reconciliation preview가 field별 선택 이유와 conflict 정보를 보여준다.
  - [ ] apply는 explicit confirmation 후 replacement chain 또는 lifecycle decision을 저장한다.
  - [ ] `POST /api/v1/data/reset`은 대량 초기화용으로 남고 reconciliation API와 분리된다.
- Notes:
  - row 단위 merge보다 field 단위 resolution을 우선한다.

#### Task T018. Provenance and agent coverage surface
- Priority: P2
- Status: Planned
- Depends on: T015, T016, T017
- Acceptance Criteria:
  - [ ] source provenance 필드 또는 별도 table이 `source_system`, `source_run_id`, `source_file_fingerprint`, `source_row_hash`, `canonical_asset_key`, `source_confidence`, `observed_at`, `valuation_as_of`를 표현한다.
  - [ ] 사용자 확인/정책 적용 필드가 `is_user_confirmed`, `priority_policy_id`, `decision_reason`, `reviewed_by`, `reviewed_at`를 표현한다.
  - [ ] supersession/selection 필드가 `superseded_by_observation_id`, `selected_source_system`, `selected_observation_id`를 표현한다.
  - [ ] freshness/conflict 필드가 `freshness_sla_days`, `stale_days`, `conflict_status`를 표현한다.
  - [ ] `GET /api/v1/analytics/asset-source-coverage` 또는 `vw_asset_source_coverage`가 제공된다.
  - [ ] canonical asset coverage가 raw/selected/excluded/confirmed/derived/hidden/conflicted/stale 비율을 설명할 수 있다.
  - [ ] agent 문서가 source가 섞인 자산 값을 확정 총액처럼 말하지 않도록 안내한다.
- Notes:
  - coverage surface는 외부 agent가 raw DB를 직접 재해석하지 않도록 하는 read contract다.

#### Task T019. Investment analytics after securities source integration
- Priority: P2
- Status: Paused
- Depends on: T016, external securities source decision
- Acceptance Criteria:
  - [ ] 증권사 API/CLI 또는 동등한 holdings/cashflow source가 결정된다.
  - [ ] `GET /api/v1/analytics/investment-performance` contract가 정의된다.
  - [ ] `vw_investment_allocation_snapshot` 또는 동등한 allocation view가 정의된다.
  - [ ] broker/product type/product 기준 allocation ratio와 previous-snapshot delta가 제공된다.
  - [ ] 매수/매도/입출금 cashflow 기반 수익률과 성과 attribution 계산 방식이 문서화된다.
  - [ ] BankSalad snapshot만으로 투자 성과/수익률을 해석하지 않는다.
- Notes:
  - 현재는 `T011`의 snapshot composition 보조 필드까지만 허용한다.

#### Task T020. Transfer tracking
- Priority: P2
- Status: Paused
- Depends on: T006
- Acceptance Criteria:
  - [ ] `GET /api/v1/transfers/summary` contract가 정의된다.
  - [ ] `GET /api/v1/transfers` contract가 정의된다.
  - [ ] `GET /api/v1/transfers/unmatched` contract가 정의된다.
  - [ ] raw `type='이체'` 기반 자산 이동을 먼저 다룬다.
  - [ ] 대출 원금/이자 상환처럼 `type='지출'`에 섞인 debt movement는 raw type을 바꾸지 않고 파생 레이어로만 처리한다.
  - [ ] ambiguous row는 review candidate로 남긴다.
  - [ ] 구현 전까지는 `vw_monthly_cashflow.transfer_activity_total`만 보조 값으로 유지한다.
- Notes:
  - 사용자 가치가 낮아 뒤쪽 P2로 미룬 기존 결정을 유지한다.

#### Task T021. Frontend remake
- Priority: Paused
- Status: Paused
- Depends on: T013
- Acceptance Criteria:
  - [ ] 현재 main의 live 기능, route, API contract를 기준으로 remake 범위를 다시 정의한다.
  - [ ] legacy component cleanup이나 단기 theme polish를 독립 목표로 삼지 않는다.
  - [ ] 새 frontend IA/wireframe이 current route별 기능을 누락하지 않는다.
  - [ ] frontend docs가 remake 기준으로 갱신된다.
  - [ ] 구현 시 브라우저 visual QA를 포함한다.
- Notes:
  - 지금은 단기 미관 개선보다 전체 재구현 가능성만 계획으로 유지한다.

#### Task T022. Long-term product expansion queue
- Priority: P2
- Status: Planned
- Depends on: T001 through T014
- Acceptance Criteria:
  - [ ] 수입 분석 페이지를 별도 task로 쪼갤지 결정한다.
  - [ ] 자동 백업 크론을 별도 infra task로 쪼갤지 결정한다.
  - [ ] 도메인 연결과 HTTPS를 별도 deployment task로 쪼갤지 결정한다.
  - [ ] budgets/goals/advice preferences 전체 기능을 `T010` 이후 별도 product task로 쪼갠다.
  - [ ] health score/personalized coaching은 My Ledge core 책임 경계와 충돌하지 않는 consumer/advisor layer 작업으로 분리한다.
- Notes:
  - 이 task는 queue placeholder가 아니라 분해 대상 tracking task다. 착수 전 더 작은 executable task로 재작성한다.

#### Task T023. 진행월 cashflow 대표 지표와 savings rate basis 명시
- GitHub Issue: [#7](https://github.com/Gyu-bot/my_ledge/issues/7)
- Priority: P1
- Status: Ready
- Depends on: T006
- Acceptance Criteria:
  - [ ] 진행월이고 `is_complete_month=false`이며 observed income이 closed-month baseline 대비 낮은 경우, `savings_rate`가 raw observed income 기준 대표 지표로 오해되도록 노출되지 않는다.
  - [ ] `CanonicalMonthlyCashflowItem` 또는 동등한 dashboard response surface에 `savings_rate_basis` 또는 equivalent field가 추가된다.
  - [ ] observed cashflow 지표와 estimated cashflow/spendable 보조 지표가 응답에서 명확히 분리된다.
  - [ ] `income_total` / `observed_income_total`은 관측값이고 `estimated_income_total`은 진행월 해석 보조값이라는 규칙이 API/agent 문서에 명시된다.
  - [ ] agent-facing 해석은 `income_basis`, `is_complete_month`, `savings_rate_basis` 또는 equivalent field를 함께 확인해야 한다고 문서화된다.
  - [ ] backend regression test가 incomplete current month, low observed income, derivable estimated income fixture를 포함한다.
  - [ ] 테스트는 representative `savings_rate`가 null 또는 explicitly estimated/insufficient basis로 표시됨을 검증한다.
  - [ ] frontend가 해당 field를 소비한다면 진행월 cashflow/savings rate 표시가 observed-only completed-month 지표처럼 보이지 않도록 회귀 테스트 또는 browser smoke가 포함된다.
- Notes:
  - `income_basis`, `estimated_income_total`, `excluded_income_periods`, `estimated_spendable_before_variable_spend`, `estimated_remaining_after_variable_spend`는 이미 live다.
  - 이 task의 핵심은 estimated income enrichment 존재 여부가 아니라 대표 cashflow 지표의 해석 기준이다.
  - `T024`와 closed-month income baseline utility를 공유할 수 있지만, 이 task는 dashboard/true-spendable contract 문제로 별도 완료 기준을 가진다.

#### Task T024. liquidity-health 기본 호출 closed-month 입력값 산출
- GitHub Issue: [#8](https://github.com/Gyu-bot/my_ledge/issues/8)
- Priority: P1
- Status: Ready
- Depends on: T006, T010
- Acceptance Criteria:
  - [ ] `GET /api/v1/analytics/liquidity-health`를 query param 없이 호출해도 closed-month 기반 `monthly_income`이 채워진다.
  - [ ] `GET /api/v1/analytics/liquidity-health`를 query param 없이 호출해도 closed-month 기반 `monthly_required_spend`가 채워진다.
  - [ ] 기본 `monthly_income`은 진행월을 제외한 최근 완료월 수입의 median 또는 outlier-trimmed average로 산출된다.
  - [ ] 기본 `monthly_required_spend`는 진행월을 제외한 최근 완료월의 필수지출과 대출상환을 합친 값으로 산출된다.
  - [ ] 계산 가능할 때 `emergency_fund_months`, `debt_payment_ratio`, `target_progress_ratio`가 null로 남지 않는다.
  - [ ] 응답에 `monthly_income_source`, `monthly_required_spend_source`, `derived_from_periods`, `manual_input_overrides` 또는 동등한 source/basis metadata가 포함된다.
  - [ ] query param으로 `monthly_income` 또는 `monthly_required_spend`가 전달되면 manual value가 derived value보다 우선한다.
  - [ ] 진행월 partial income은 기본 derivation에서 제외되거나 별도 basis로 명시된다.
  - [ ] backend API/service regression test가 derived default와 manual override를 모두 검증한다.
  - [ ] `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`에 기본값 source와 confidence 해석 규칙이 문서화된다.
- Notes:
  - 이 endpoint는 agent가 단독 호출할 가능성이 크므로, 기본 호출만으로 유동성/부채부담 판단 재료가 충분해야 한다.
  - `T023`과 baseline 계산 유틸을 공유할 수 있으나, `T024`는 liquidity-health input derivation과 source metadata에 집중한다.

#### Task T025. loan account active/historical scope metadata
- GitHub Issue: [#9](https://github.com/Gyu-bot/my_ledge/issues/9)
- Priority: P1.5
- Status: Ready
- Depends on: T005
- Acceptance Criteria:
  - [ ] `/loan-accounts` row에 `as_of_date`, `latest_snapshot_date`, `is_active`, `is_matured`, `is_stale`, `lifecycle_status` 또는 동등한 상태 필드가 추가된다.
  - [ ] `as_of_date`는 명시 입력이 없으면 최신 전체 loan snapshot date를 사용한다.
  - [ ] 계좌별 `latest_snapshot_date < as_of_date`이면 `is_stale=true`로 표시하고, 최신 전체 스냅샷에서 해당 대출이 사라졌음을 response만 보고 알 수 있다.
  - [ ] `loan_maturity_date < as_of_date`이면 해당 row는 schedule 기준으로 `is_matured=true`로 표시한다.
  - [ ] `loan_maturity_date < as_of_date`이고 `latest_snapshot_date < as_of_date`이면 `lifecycle_status='matured_and_missing_from_latest_snapshot'` 또는 동등한 상태로 표시한다.
  - [ ] `loan_maturity_date < as_of_date`이고 계좌별 마지막 관측 snapshot의 `balance` 또는 `principal`이 0보다 크면 `lifecycle_status='past_maturity_with_last_observed_balance'` 또는 동등한 review 상태로 표시한다.
  - [ ] 계좌별 마지막 관측 `balance`/`principal`은 현재 잔액처럼 해석되지 않도록 `last_observed_balance`, `last_observed_principal`, `last_observed_snapshot_date` 또는 동등한 필드/문서로 구분한다.
  - [ ] `loan_maturity_date < as_of_date`이고 계좌별 마지막 관측 잔액이 없거나 0이면 `is_active=false`, `excluded_from_summary_reason='matured_loan'` 또는 동등한 reason으로 표시한다.
  - [ ] `/loan-accounts` row에 `included_in_active_summary` 또는 `excluded_from_summary`가 추가되어 `/loans/summary` 포함 여부를 설명한다.
  - [ ] `/loan-accounts` row에 `excluded_from_summary_reason`이 추가되어 만기/비활성/historical row가 active summary에서 빠지는 이유를 response만 보고 알 수 있다.
  - [ ] `/loans/summary` 응답에 `summary_scope='active_loans_only'` 또는 동등한 scope metadata가 추가된다.
  - [ ] `loan_account_id=null`인 row가 정상적으로 존재할 수 있는 경우 `stable_identity_status`와 `stable_identity_reason` 또는 동등한 설명 필드가 제공된다.
  - [ ] 만기일이 지난 종료 대출 fixture, 만기일이 지났고 최신 전체 스냅샷에서 사라졌지만 과거 잔액이 남은 fixture, active loan fixture가 `/loan-accounts`와 `/loans/summary`에서 서로 다른 scope/status로 표현됨을 backend test가 검증한다.
  - [ ] docs에 `/loan-accounts`는 historical/canonical inventory 성격이고 `/loans/summary`는 active/current loan summary라는 차이가 명시된다.
- Notes:
  - 현재 구현상 `/loans/summary`는 요청 snapshot 또는 최신 전체 `loans.snapshot_date`에 존재하는 row만 보여주므로, 최신 스냅샷에서 사라진 대출은 active summary에서 빠질 수 있다.
  - 현재 구현상 `/loan-accounts`와 `vw_loan_account_canonical`은 계좌별 마지막 관측 loan snapshot을 사용할 수 있으므로, active summary에서 빠진 historical loan도 inventory surface에는 남을 수 있다.
  - 실제 제품 기준에서 만기일은 scheduled maturity 신호다. 만기일이 지났고 최신 전체 스냅샷에서 사라졌다면 종료 가능성이 높지만, 과거 관측 잔액은 현재 잔액이 아니라 last observed value로 명시해야 한다.
  - `loan_maturity_date`가 null이면 만기 여부는 확정하지 않고 latest snapshot freshness, balance, active summary 포함 규칙을 함께 노출한다.
  - 만기 지난 계좌가 active summary에서 제외되는 동작 자체는 정상이다. historical/canonical inventory에서는 숨기지 않고 active summary 제외 이유와 stale/maturity 상태를 함께 보여준다.
  - 큰 asset lifecycle 구조 변경인 `T015` 전에 최소 metadata 보강으로 처리할 수 있다.

#### Task T026. spending anomalies sparse baseline 표현 안정화
- GitHub Issue: [#10](https://github.com/Gyu-bot/my_ledge/issues/10)
- Priority: P1
- Status: Ready
- Depends on: T000
- Acceptance Criteria:
  - [ ] baseline이 매우 작거나 sparse한 경우 user-facing `reason`에 과도한 percentage가 그대로 들어가지 않는다.
  - [ ] raw 계산값은 유지하되 display/reason field와 분리된다. 예: `delta_pct_raw`, `delta_pct_display`, `delta_display_capped`.
  - [ ] response item에 `anomaly_mode` 또는 `baseline_quality`가 포함된다.
  - [ ] `sparse_baseline_spike` 또는 `insufficient_baseline` 같은 mode가 baseline floor 또는 baseline month count 기준으로 결정된다.
  - [ ] 기존 `delta_pct` 호환성 유지 여부가 결정되고, breaking change가 있으면 contract docs에 명시된다.
  - [ ] backend regression test가 tiny baseline에서 raw percent가 크게 튀는 fixture를 포함한다.
  - [ ] 테스트는 sparse baseline에서 user-facing reason/display 값이 capped/null/stable expression으로 내려옴을 검증한다.
  - [ ] docs에 raw score와 user-facing reason/display field의 차이가 명시된다.
- Notes:
  - anomaly 탐지 자체를 약하게 만드는 task가 아니다. 계산용 raw value와 사용자/agent가 인용할 표현을 분리하는 task다.
  - 기존 settings precedence는 `query param > persisted setting > code default`를 유지한다.

#### Task T027. unclassified work queue 필터와 issue signal 분리
- GitHub Issue: [#11](https://github.com/Gyu-bot/my_ledge/issues/11)
- Priority: P1.5
- Status: Ready
- Depends on: T006
- Acceptance Criteria:
  - [ ] `unclassified_work_queue` 또는 dashboard queue API에서 `issue_type`별 조회가 가능하다. 최소 type은 `cost_kind`, `spend_necessity`, `recurring_kind`, `loan_link`를 포함한다.
  - [ ] 복수 `issue_type` 선택 방식이 정의된다. 예: comma-separated query param 또는 repeated query param.
  - [ ] `period_from`, `period_to`, `current_only` 또는 동등한 period/current 필터가 추가된다.
  - [ ] current period 중심 cleanup과 historical cleanup을 분리해서 조회할 수 있다.
  - [ ] recurring-kind issue에는 `recurrence_signal`이 포함된다. 최소 `has_monthly_pattern`, `active_month_count`, `same_month_repeat_only`를 표현한다.
  - [ ] priority explanation이 단일 `priority_reason` string뿐 아니라 `issues[]`와 primary issue 또는 동등한 구조로 설명 가능하다.
  - [ ] backend view/API regression test가 issue type filtering, current-only filtering, recurring signal serialization을 검증한다.
  - [ ] docs에 이 queue가 financial risk queue가 아니라 data-quality cleanup queue임이 명시된다.
- Notes:
  - 현재 recurring 후보 보수화는 이미 live다. 이 task는 서로 다른 cleanup issue가 하나의 priority score에 섞여 agent가 다음 액션을 고르기 어려운 문제를 푸는 작업이다.
  - DB view 확장과 dashboard API enrichment 중 어느 쪽이 source of truth가 될지 구현 전 결정한다.

#### Task T028. transactions summary aggregation basis metadata
- GitHub Issue: [#12](https://github.com/Gyu-bot/my_ledge/issues/12)
- Priority: P1
- Status: Ready
- Depends on: T000
- Acceptance Criteria:
  - [ ] `/transactions/summary` 응답에 `basis` metadata가 포함된다.
  - [ ] `basis.aggregation_surface`가 raw transactions summary인지 canonical cashflow인지 명시한다.
  - [ ] `basis.amount_sign_convention`이 raw signed amount인지 normalized expense인지 명시한다.
  - [ ] `basis.included_types`와 `basis.excluded_types`가 transaction type 포함/제외 기준을 명시한다.
  - [ ] `basis.includes_loan_repayments`, `basis.excludes_deleted`, `basis.excludes_merged`, `basis.canonical_cashflow_equivalent` 또는 동등한 필드가 제공된다.
  - [ ] loan repayment, transfer, deleted, merged row 처리 기준이 docs에 명시된다.
  - [ ] canonical dashboard 숫자와 `/transactions/summary` 숫자가 다를 수 있는 이유가 response 또는 docs만으로 설명 가능하다.
  - [ ] 필요한 경우 `basis=raw_transactions|canonical_cashflow|non_loan_expense` 같은 query param 도입 여부를 결정하고 구현한다.
  - [ ] backend API regression test가 default summary basis metadata를 검증한다.
- Notes:
  - 현재 계산이 틀렸다는 뜻이 아니라 endpoint 이름만 보고 canonical cashflow와 같은 의미로 오해하기 쉬운 문제를 줄이는 task다.
  - `basis` query param이 scope creep이면 첫 PR은 response metadata만 구현하고 query param은 별도 후속 task로 분리해도 된다.

#### Task T029. profile/insurance empty-state metadata
- GitHub Issue: [#13](https://github.com/Gyu-bot/my_ledge/issues/13)
- Priority: P1
- Status: Ready
- Depends on: T004, T008
- Acceptance Criteria:
  - [ ] `GET /api/v1/profile` empty state에서 `has_snapshot`, `missing_reason`, `expected_source` 또는 동등한 metadata가 제공된다.
  - [ ] `GET /api/v1/insurance/summary` empty state에서 `has_contract_snapshot`, `missing_reason`, `expected_source` 또는 동등한 metadata가 제공된다.
  - [ ] source section missing, source section present but parsed-null, snapshot row exists with partial null fields, intentionally blank, never imported 상태를 가능한 범위에서 구분한다.
  - [ ] `monthly_premium_estimate`가 계약 snapshot 부재로 계산 불가한 경우 `basis` 또는 equivalent metadata로 이유를 명시한다.
  - [ ] upload/import diagnostics와 연결할 수 있는 `last_upload_checked`, `source_section_found`, `parser_warning_count` 또는 동등한 metadata 도입 여부를 결정한다.
  - [ ] backend API regression test가 profile no snapshot, insurance no snapshot, partial-null snapshot 사례를 검증한다.
  - [ ] docs에 null field, missing snapshot, source section missing의 의미가 명시된다.
- Notes:
  - 이 task는 비어 있는 값을 임의로 채우는 작업이 아니다. API consumer가 empty response의 원인을 구분하게 만드는 task다.
  - parser-level diagnostics가 커지면 첫 PR은 response-level missing metadata로 제한하고 diagnostics는 별도 task로 분리해도 된다.

---

## Archive Notes

- `docs/planned-work.md` was archived into `docs/archive/planning/2026-06-10-planned-work.md`.
- `docs/superpowers/plans/2026-06-10-advisor-canonical-gap-priority.md` was archived into `docs/archive/planning/2026-06-10-advisor-canonical-gap-priority.md`.
- Future agents should not treat archived unchecked items as current backlog unless they are represented in this file.
