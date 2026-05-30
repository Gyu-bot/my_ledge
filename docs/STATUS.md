# STATUS.md

이 파일은 새 세션이 빠르게 현재 상태를 파악하기 위한 handoff 문서다.
오래된 완료 로그와 상세 결정 기록은 archive로 보낸다.

## Current State

- **Phase:** P2 제외 P0/P0.5/P1 구현 완료. advisor/operations API, canonical views, frontend 연결, contract docs, regression tests가 정렬됨. 투자 분석과 자산이동/이체 tracking은 P2 이후로 보류.
- **Last Worker:** Codex (2026-05-31T02:48+0900, 대출 성격 기반 상환 방식 조회 연계)
- **Branch:** feature/loan-kind-repayment-link
- **Archive:** [2026-05-28-status-before-diet.md](archive/status/2026-05-28-status-before-diet.md)

## Start Here

1. 현재 live backend/API contract는 [backend-api-ssot.md](backend-api-ssot.md)를 먼저 본다.
2. 아직 구현되지 않은 backlog는 [planned-work.md](planned-work.md)를 본다.
3. 상세 endpoint/metric/canonical view 계산 방식은 [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md)를 본다.
4. 외부 에이전트 연동은 [agents/README.md](agents/README.md)를 본다.
5. 현재 frontend 구조는 [frontend-design-tokens.md](frontend-design-tokens.md), [frontend/components-and-design-token-inventory.md](frontend/components-and-design-token-inventory.md), [frontend/page-wireframes.md](frontend/page-wireframes.md), [frontend-reimplementation-wireframe-functional-requirements.md](frontend-reimplementation-wireframe-functional-requirements.md)를 본다.

## Recent Completed

- [x] 자산 현황 대출 요약 연계: `GET /api/v1/loans/summary`가 `loan_accounts.loan_kind`를 함께 노출하고, 수동 상환 방식이 없을 때 호환되는 대출 성격을 읽기 전용 `repayment_method` fallback으로 표시한다.
- [x] 대출 월상환 자동 추정·저장 backend 구현: 수동 `PATCH /api/v1/loans/{loan_id}/repayment-metadata`는 `monthly_payment_source` / `repayment_method_source`를 `manual`로 저장하고, 대출 연결 단건/일괄 저장 및 snapshot import 후 latest loan snapshot에 최근 관측월 median 기반 `monthly_payment`와 mixed-link 기반 `repayment_method='principal_interest'`를 자동 보강
- [x] 구매게이트 정리: 고정비/필수/대출 연결/필요성 미분류 거래를 제외하고, 같은 거래의 여러 사유는 `transaction:{id}` 후보 1줄과 `candidate_types[]`/`reasons[]`로 통합
- [x] STATUS 다이어트: 기존 긴 `docs/STATUS.md` 전체를 archive로 보존하고, 현재 파일은 handoff 중심 요약으로 축약
- [x] 범용 에이전트 문서 정리: API/canonical view 값 의미와 계산식을 [agents/canonical-read-surface-reference.md](agents/canonical-read-surface-reference.md)에 추가하고, 운영/skill handoff 문서를 [agent-integration/](agent-integration/)로 이동
- [x] README 기능 설명 보강: 프론트엔드 화면별 표시 항목, 주요 지표 의미, canonical view/read surface 목록 정리
- [x] P0 upload retention 구현: `POST /api/v1/upload` 원본 파일을 `UPLOAD_DIR` 기본값 `/data/uploads`에 저장하고 최신 5개만 유지
- [x] P0/P0.5 canonical read model 구현: `vw_monthly_cashflow`, `vw_loan_repayment_monthly`, `vw_true_spendable_monthly`, `vw_merchant_monthly_baseline`, `vw_unclassified_work_queue`
- [x] Canonical view dashboard 구현: `/api/v1/canonical-views/dashboard`로 P0/P0.5 view 실제 row 값을 제공하고, `/operations/canonical-views`에서 월별 현금흐름/true spendable/대출 상환/거래처 baseline/분류 품질 큐를 KPI·차트·테이블로 표시
- [x] 분류 품질 큐 반복 후보 기준 보수화: `vw_unclassified_work_queue`의 `missing_recurring_kind`는 같은 거래처 2건만으로 판단하지 않고, 서로 다른 월/날짜와 금액 안정성이 있는 경우에만 표시
- [x] 반복결제 카테고리 자동분류 1차 구현: `recurring_category_rules`, 반복 후보/고정비 gate, `not_recurring`, `/operations/auto-classification` 규칙 UI와 `/operations/recurring-classification` 수동 선택지 반영
- [x] 자동분류 일괄 적용 UX 수정: 고정비/변동비 규칙 폼에 입력 중인 값이 있으면 먼저 저장한 뒤 일괄 적용해 `fixed_cost_necessity` 변경이 누락되지 않도록 함
- [x] 진행월 true spendable 예상 표시: 현재 월 수입이 최근 6개 마감월의 이상치 제외 수입 baseline의 50% 미만이면 dashboard API가 `estimated_*` 필드와 `excluded_income_periods`를 제공하고, frontend가 `예상` 태그/관측값/제외 월을 함께 표시
- [x] `vw_fixed_cost_monthly_summary`를 loan-linked repayment 제외 기준으로 정렬
- [x] Planned backlog 보강: 투자 성과 시계열 view는 제외하고, cash-equivalent/liquidity tier 분류, 대출 `monthly_payment`/상환 메타데이터, agent 재계산 방지를 위한 backend API/canonical read surface 고정 원칙을 [planned-work.md](planned-work.md)에 반영
- [x] P1 1-4 구현: `spend_necessity`, `merchant_alias_rules`, `vw_recurring_merchant_monthly`, `GET /api/v1/analytics/net-worth-breakdown`, `GET /api/v1/analytics/liquidity-health`
- [x] P1 frontend 노출: `/operations/workbench` 필수/재량 편집/필터, `/operations/auto-classification` 거래처 정규화/필수·재량 규칙, `/operations/canonical-views` 반복 거래처, `/analysis/assets` 유동성 Health
- [x] 대출 매칭 규칙 기준 선택 구현: `/operations/auto-classification`에서 분석용 거래처(`merchant`) 또는 원본 설명(`description`)을 선택해 대출 상환 자동 연결 규칙을 저장/적용
- [x] 프론트엔드 거래처 표기 정리: 작업대/대출 연결/지출/인사이트/반복분류 화면에서 `merchant`는 분석용 거래처, `description`은 원본 설명으로 구분
- [x] 거래처 정규화 기준 보정: alias rule은 원본 설명(`description`)을 매칭해 분석용 거래처(`merchant`)에 반영하고, `merchant != description`인 수동 수정 추정 row는 보존
- [x] Advisor 책임 경계 문서화: My Ledge는 계산/후보/근거/settings/review state를 맡고, 에이전트는 사용자 맥락 기반 최종 해석과 조언을 맡도록 [planned-work.md](planned-work.md)에 반영
- [x] 에이전트 문서 판단 경계 보강: `health`, `anomaly`, `confidence`, `priority_score`, `true_spendable`을 My Ledge의 최종 조언이 아니라 계산/후보/데이터 품질 신호로 해석하도록 [agents/](agents/)와 [agent-integration/](agent-integration/) 문서에 반영
- [x] Advisor 다음 구현 기본값 정리: 재량 지출 속도, 구매 게이트, 반복결제 dry-run, 현금성 자산 tier, 대출 월상환액 보강, bulk 안전장치와 settings 조정 항목을 [planned-work.md](planned-work.md)에 반영
- [x] `description_user` / `effective_description` 계획 제외: 원본 설명은 `description`, 분석명은 `merchant`, 사용자 부가 설명은 `memo`로 유지
- [x] Sidebar/favicon 공용 brand mark 추가: 이미지 생성 툴로 만든 `frontend/public/brand-mark.png`를 favicon과 desktop sidebar 상단 아이콘에 연결
- [x] 반복결제 dry-run 승인 흐름 frontend 연결: `/operations/recurring-classification`에서 후보 근거/매칭 거래/apply scope를 확인하고 그룹 단위로 승인 적용
- [x] 변동비 기본 재량화 및 할부 관리 구현: `cost_kind='variable'` 미지정 필요성은 `spend_necessity='discretionary'`로 정규화하고, `installment_plans`/`installment_transaction_links`, `/api/v1/installments/forecast`, `/operations/installments`를 추가
- [x] 에이전트 문서/API·canonical surface 정합성 보강: 현재 구현된 `vw_asset_snapshot_canonical`, recurring dry-run, 할부 forecast, purchase gate, liquidity health, 변동비 재량 기본값과 My Ledge/에이전트 판단 경계를 [agents/](agents/)와 [agent-integration/](agent-integration/) 문서에 반영
- [x] P1 advisor/operations batch 구현: discretionary velocity, purchase gate candidates/review state, recurring dry-run apply scope, bulk delete/restore, asset liquidity/loan repayment metadata, `vw_asset_snapshot_canonical`과 관련 frontend 연결
- [x] P2 제외 구현 batch hardening: 구매 게이트 frontend/backend contract 정렬, same-date snapshot 재업로드 시 자산/대출 사용자 메타데이터 보존, 최신 asset row만 편집 UI에 노출, `liquidity_tier='immediate'` cash-equivalent 의미 정렬, bulk delete undo와 preview 대상 고정, topbar/redirect/bulk 회귀 테스트 보강
- [x] 검증 완료: backend 전체 pytest 140 passed, backend ruff, frontend vitest 112 passed, frontend lint/typecheck, Codex 인앱 브라우저 local smoke(`/operations/auto-classification`, `/operations/workbench`, `/operations/installments`)
- [x] frontend asset/installment UX 정렬: 반복결제 목록에 할부 관리 CTA 추가, `/operations/installments` query prefill/label helper 지원, `/analysis/assets` 조회 전용 전환과 `/operations/asset-settings` 분리, 구매게이트 다중 사유 badge 렌더링 및 관련 vitest 회귀 추가
- [x] 우선순위 조정: 투자 관련 분석은 증권사 API 이후로, 자산이동/이체 tracking은 가장 뒤쪽 P2로 이동
- [x] docs 역할 정리: [planned-work.md](planned-work.md)는 미구현 backlog/roadmap, `docs/STATUS.md`는 handoff/status log로 분리
- [x] 과거 advisor 제안서 정리: 루트 `docs/additional_feature.md`를 [archive/planning/finance-advisor-analytics-expansion.md](archive/planning/finance-advisor-analytics-expansion.md)로 이동
- [x] Canonical read model 확장 요구사항 정리: P0/P0.5/P1/P2 view 후보, 대출 상환 double-count 방지, true spendable, merchant baseline, unclassified work queue, as_of/threshold API 분리 원칙 반영
- [x] 대출 계좌 관리 및 대출 상환 매핑 기반 구현 완료: `loan_accounts`, `loan_transaction_links`, `/operations/loan-mapping`, canonical loan fields
- [x] 자동분류 기반 구현 완료: category classification rules, loan merchant rules, upload auto-apply settings, `/operations/auto-classification`
- [x] 고정비 월별 추이 구현 완료: `GET /api/v1/analytics/fixed-cost-trend`, `vw_fixed_cost_monthly_summary`, spending chart 반영
- [x] 반복결제 수동 분류 구현 완료: `transactions.recurring_payment_kind`, `/operations/recurring-classification`
- [x] Backend/API live contract 문서화 완료: [backend-api-ssot.md](backend-api-ssot.md), [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md)

## In Progress

- 없음. 대출 성격 기반 상환 방식 조회 연계와 관련 문서 정합성 보강은 완료했다.

## Next Up

1. P2 범위로 남긴 항목만 재개한다: Settings page, frontend v2 full reimplementation, 투자 분석, 자산이동/이체 tracking.
2. 운영 배포본 screenshot capture는 별도 환경 검증 항목으로만 남긴다. local DOM smoke와 console error 확인은 완료했다.
3. 구매 게이트 별도 review 화면이 필요해지면 `memo`/`reviewed_at`/`cooldown_until` 같은 확장 상태를 그때 추가한다.

## Key Decisions

- 2026-05-31: `loan_accounts.loan_kind`는 안정 계좌 메타데이터로 유지하고 `loans.repayment_method` 스냅샷 값을 직접 덮어쓰지 않는다. 자산 현황 대출 요약에서는 `lender + product_name`으로 계좌를 조인해 `loan_kind`를 노출하고, 수동 상환 방식이 없을 때만 `derived_from_loan_account` 출처의 읽기 전용 fallback을 표시한다.
- 2026-05-31: latest loan snapshot의 `monthly_payment` 자동 추정은 `loan_accounts(lender + product_name)` 안정 식별자 기준 linked repayment 거래만 사용한다. `monthly_payment_source='manual'`은 덮어쓰지 않고, same-date snapshot 재업로드 후에도 추정 hook을 다시 실행해 `estimated_from_linked_transactions` 값만 최신 linked 거래 median으로 재계산한다.
- 2026-05-31: 구매게이트는 재량 구매 검토 queue로 정의한다. My Ledge는 후보 생성/사유/검토상태만 제공하고, 고정비·필수지출·대출연결·필요성 미분류 거래는 후보에서 제외한다.
- 2026-05-28: `docs/STATUS.md`는 handoff 요약만 유지한다. 오래된 완료 로그와 상세 결정 기록은 `docs/archive/status/`로 옮기고, 현재 파일에는 archive 링크와 최신 핵심만 남긴다.
- 2026-05-28: `POST /api/v1/upload` 원본 파일 retention은 API upload 경로에서만 opt-in 저장한다. service helper 직접 호출은 `persist_upload_file=True`일 때만 저장해 테스트/스크립트 부작용을 줄인다.
- 2026-05-28: P0/P0.5 canonical view는 DB view를 source of truth로 유지하되, 프론트엔드 대시보드에는 allowlist 기반 `GET /api/v1/canonical-views/dashboard`로 실제 row 값을 제공한다. `/schema`는 reference/registry 역할로 유지한다.
- 2026-05-28: 진행 중인 월의 월급 입금 전 왜곡은 DB view 원본을 바꾸지 않고 dashboard API enrichment로 처리한다. `income_total`은 관측값으로 유지하고, 예상 수입/예상 가용액은 `estimated_*`와 `income_basis='estimated'`로 구분한다.
- 2026-05-28: 진행월 예상 수입은 최근 3개월 단순 평균 대신 최근 6개 마감월의 median 기준 ±30% 밖 수입 월을 제외한 baseline으로 계산한다. 연말정산 환급/보너스처럼 월급과 같이 입금되어 거래 단위 분리가 어려운 수입은 `excluded_income_periods`로 표시한다.
- 2026-05-28: `vw_unclassified_work_queue`의 반복결제 미분류 신호는 같은 거래처 2건만으로 판단하지 않는다. 같은 날 분할 구매를 제외하기 위해 최소 2개 월, 최소 2개 거래일, 금액 변동계수 `<= 0.5`를 만족하는 거래처만 `missing_recurring_kind` 후보로 본다.
- 2026-05-28: 반복결제 카테고리 자동분류는 전체 거래를 단순 카테고리로 덮지 않는다. 기존 `recurring_payment_kind`를 보존하고, 반복 후보 gate(최소 2개 월/2개 거래일/CV `<= 0.5`) 또는 `cost_kind='fixed'`인 거래에만 `recurring_category_rules`를 적용한다. `not_recurring`은 reviewed non-recurring 상태를 명시하기 위한 값으로 추가했다.
- 2026-05-28: `docs/planned-work.md`는 미구현 backlog/roadmap으로 유지하고 `docs/STATUS.md`와 분리한다.
- 2026-05-28: My Ledge core는 재무 어시스턴트의 말투/성격을 결정하지 않는다. 재무 어시스턴트가 사용할 canonical read model foundation과 `reason`/`confidence`/`assumptions`/`risk_level` 같은 판단 재료를 제공한다.
- 2026-05-28: 다음 작업은 운영 검증만 계속 붙잡지 않고 기능 구현으로 넘어가되, 운영 smoke와 contract 검증은 각 구현 batch의 acceptance check로 유지한다.
- 2026-05-28: 자산/투자/대출 snapshot은 우선 업로드될 때만 쌓이는 sparse 데이터로 본다.
- 2026-05-27: Advisor canonical 확장은 API 중복 구현이 아니라 readonly SQL/외부 에이전트용 read model 안정화로 본다.
- 2026-05-27: 월별 현금흐름 view는 `expense_total`, `loan_repayment_total`, `non_loan_expense_total`을 함께 노출해 대출 상환과 일반 소비의 double count를 막는다.
- 2026-05-30: `cost_kind`는 고정/변동 축, `spend_necessity`는 필수/재량 축으로 분리한다. `fixed_cost_necessity`는 고정비 호환 필드로 유지한다.
- 2026-05-30: 변동비의 `spend_necessity`는 명시적으로 `essential`을 선택하지 않으면 `discretionary`로 저장한다. 할부는 관측 cashflow view를 바꾸지 않고 원장/거래 연결/forecast API로 별도 projection surface를 제공한다.
- 2026-05-30: merchant normalization은 자동 병합이 아니라 `merchant_alias_rules` 포함 패턴 기반 일괄 정규화로 시작한다.
- 2026-05-30: merchant normalization의 매칭 기준은 raw `description`이다. 결과는 `merchant`에 쓰고, `merchant != description`인 row는 수동 수정 또는 기존 정규화로 보고 덮어쓰지 않는다.
- 2026-05-30: 대출 매칭 규칙은 `match_field='merchant'|'description'`으로 기준을 명시한다. `merchant`는 분석용/정규화 가능 값이고 `description`은 raw import 원문이다.
- 2026-05-30: 재량 지출 속도와 구매 게이트에서 My Ledge는 최종 구매 판단을 하지 않는다. My Ledge는 재현 가능한 계산, 후보, 근거, confidence, assumptions, settings, review state를 제공하고, 에이전트가 사용자 맥락 기반 최종 해석과 조언을 맡는다.
- 2026-05-30: 현재 구현된 canonical/API surface에서도 `health`, `anomaly`, `confidence`, `priority_score`, `true_spendable`은 최종 재무 조언이 아니라 계산/후보/데이터 품질 신호로 해석한다. 에이전트가 안정/위험/구매 가능 label을 붙이면 자체 가정과 사용자 맥락 기반 해석임을 밝혀야 한다.
- 2026-05-30: `description_user` / `effective_description`은 구현하지 않는다. 원본 설명은 `description`, 분석/집계용 거래처명은 `merchant`, 사용자 부가 설명은 `memo`로 충분하다고 본다.
- 2026-05-30: 다음 advisor 기능 기본값은 보수적으로 시작하고 settings로 조정 가능하게 한다. 재량 지출 속도는 최근 6개 마감월 baseline, `1.2x/1.5x`, coverage `0.7`; 구매 게이트는 100,000원, 새 거래처 6개월, cooldown 14일; 반복결제 dry-run 자동 적용은 기본 OFF다.
- 2026-05-30: 반복결제 dry-run 기본 적용 범위는 실제 기존 row를 바꾸는 `all_matching`으로 둔다. `future_only`는 별도 future-rule 저장 모델이 생기기 전까지 기존 거래를 변경하지 않는 명시적 no-op 선택지다.
- 2026-05-30: same-date snapshot 재업로드는 파싱 row를 교체하되, 같은 안정 row identity의 `asset_snapshots.liquidity_tier` / `is_cash_equivalent`와 `loans.monthly_payment` / `repayment_method` 사용자 확인값은 보존한다.
- 2026-05-30: 투자 분석은 증권사 API 이후, 자산이동/이체 tracking은 최후순위 P2로 미룬다.
- 2026-05-25: 대출 상환 거래 연결은 기존 거래 작업대 bulk edit에 섞지 않고 별도 `/operations/loan-mapping` 화면으로 분리한다.
- 2026-05-25: 반복결제의 `할부` / `매월 반복` 구분은 거래 단위 nullable `transactions.recurring_payment_kind`로 먼저 저장하고, 별도 `/operations/recurring-classification` 화면에서 관리한다.
- 2026-04-07: backend/API live contract의 문서상 SSOT는 [backend-api-ssot.md](backend-api-ssot.md)로 둔다.
- 2026-04-07: frontend current source-of-truth는 네 문서로 제한한다: `frontend-design-tokens.md`, `frontend/components-and-design-token-inventory.md`, `frontend/page-wireframes.md`, `frontend-reimplementation-wireframe-functional-requirements.md`.

## Known Issues

- 거래처 정규화는 alias rule을 적용한 이후부터 품질이 좋아진다. 기존 raw `merchant` 표기는 사용자가 규칙을 적용하기 전까지 남아 있을 수 있다. 이미 `merchant != description`인 row는 자동 정규화가 덮어쓰지 않는다.
- `asset_snapshots`의 현금성 분류 기준이 비어 있는 기존 데이터는 초기 emergency fund 계산에서 service heuristic과 assumptions에 의존한다. 사용자가 `immediate` / `near_liquid` / `illiquid`와 cash-equivalent를 저장하면 해당 값이 우선한다.
- `loans.monthly_payment`는 대출 연결 거래가 충분하면 자동 추정된다. 연결 거래가 부족하거나 수동 확정이 필요한 대출은 사용자 보강 전까지 debt burden confidence가 낮을 수 있다.
- 현재 실데이터 기준 대출원금상환은 raw `type='이체'`가 아니라 `type='지출'`, `category_major='금융'`에 섞여 있다. transfer tracking 구현은 expense-side 재분류를 반드시 포함해야 한다.
- 대출상환은 사용자 의도상 고정비 지출로도 해석될 수 있으므로 MVP에서는 raw `지출`을 `이체`로 바꾸지 않는다. 별도 transfer/debt movement slice는 파생 레이어로만 제공한다.
- 현재 지출 실데이터에서 `cost_kind`, `fixed_cost_necessity`가 비어 있으면 fixed-cost/essential/discretionary 진단 효용이 낮다. `vw_unclassified_work_queue`가 이 품질 문제를 먼저 드러내야 한다.
- Playwright CLI는 이 환경에서 cache/namespace 제약으로 browser launch가 불안정할 수 있다. 필요 시 Chrome headless fallback 또는 in-app browser를 사용한다.
