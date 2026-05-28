# STATUS.md

이 파일은 새 세션이 빠르게 현재 상태를 파악하기 위한 handoff 문서다.
오래된 완료 로그와 상세 결정 기록은 archive로 보낸다.

## Current State

- **Phase:** P0/P0.5 canonical read model backend/frontend dashboard 구현 완료. 반복결제 카테고리 자동분류 1차 구현 완료. 다음 초점은 source verification scope, merchant normalization, asset/liability health 후보 정리다.
- **Last Worker:** Codex (2026-05-29T00:52+0900, 범용 에이전트 canonical value reference 및 OpenClaw legacy path 정리)
- **Branch:** main
- **Archive:** [2026-05-28-status-before-diet.md](archive/status/2026-05-28-status-before-diet.md)

## Start Here

1. 현재 live backend/API contract는 [backend-api-ssot.md](backend-api-ssot.md)를 먼저 본다.
2. 아직 구현되지 않은 backlog는 [planned-work.md](planned-work.md)를 본다.
3. 상세 endpoint/metric/canonical view 계산 방식은 [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md)를 본다.
4. 외부 에이전트 연동은 [agents/README.md](agents/README.md)를 본다.
5. 현재 frontend 구조는 [frontend-design-tokens.md](frontend-design-tokens.md), [frontend/components-and-design-token-inventory.md](frontend/components-and-design-token-inventory.md), [frontend/page-wireframes.md](frontend/page-wireframes.md), [frontend-reimplementation-wireframe-functional-requirements.md](frontend-reimplementation-wireframe-functional-requirements.md)를 본다.

## Recent Completed

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
- [x] docs 역할 정리: [planned-work.md](planned-work.md)는 미구현 backlog/roadmap, `docs/STATUS.md`는 handoff/status log로 분리
- [x] 과거 advisor 제안서 정리: 루트 `docs/additional_feature.md`를 [archive/planning/finance-advisor-analytics-expansion.md](archive/planning/finance-advisor-analytics-expansion.md)로 이동
- [x] Canonical read model 확장 요구사항 정리: P0/P0.5/P1/P2 view 후보, 대출 상환 double-count 방지, true spendable, merchant baseline, unclassified work queue, as_of/threshold API 분리 원칙 반영
- [x] 대출 계좌 관리 및 대출 상환 매핑 기반 구현 완료: `loan_accounts`, `loan_transaction_links`, `/operations/loan-mapping`, canonical loan fields
- [x] 자동분류 기반 구현 완료: category classification rules, loan merchant rules, upload auto-apply settings, `/operations/auto-classification`
- [x] 고정비 월별 추이 구현 완료: `GET /api/v1/analytics/fixed-cost-trend`, `vw_fixed_cost_monthly_summary`, spending chart 반영
- [x] 반복결제 수동 분류 구현 완료: `transactions.recurring_payment_kind`, `/operations/recurring-classification`
- [x] Backend/API live contract 문서화 완료: [backend-api-ssot.md](backend-api-ssot.md), [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md)

## In Progress

- [ ] Advisor canonical read model expansion
  - 현재 상태: P0/P1 analytics endpoint 8종과 P0/P0.5 canonical DB view 5종은 live.
  - 다음 구현 후보: `vw_recurring_merchant_monthly`, `vw_asset_snapshot_canonical`, `vw_investment_allocation_snapshot`.
  - 주의: 대출 연결 거래는 일반 소비 breakdown과 분리하고, 월별 view는 `expense_total`, `loan_repayment_total`, `non_loan_expense_total`을 함께 노출해야 한다.
- [ ] Operations/data-management follow-up
  - bulk delete / bulk restore API 및 frontend 연결.
  - `description_user` / `effective_description` 기반 거래 설명 직접 수정 기능.
- [ ] Frontend follow-up
  - Settings page는 실제 사용자 기능으로 구현.
  - Token Lab은 개발/리뷰용 도구로만 유지.
  - 운영 배포본 기준 smoke capture와 redirect(`/spending`, `/assets`, `/data`) 및 `/operations/canonical-views` 브라우저 확인.
- [ ] Asset/liability health follow-up
  - `net-worth-breakdown`, `investment-performance`, `debt-burden`, `emergency-fund`는 장기 기능 후보.
  - `emergency-fund` 전 cash-equivalent/liquidity tier 분류 필요.
  - `debt-burden` 정확도를 높이려면 대출별 `monthly_payment`/상환 스케줄 출처 필요.
- [ ] Frontend v2 full reimplementation
  - `feat/frontend-v2` 브랜치 기준 Task 1-6 완료 상태였으나 현재는 보류.
  - 현재 main frontend 개선을 우선한다.

## Next Up

1. `verify_import_parity` 범위를 sample presence로 문서화할지 rolling-window overlap extra-row 검증까지 확장할지 결정.
2. Settings page와 analytics settings frontend panel 구현.
3. Merchant alias/normalization rule 방식 결정.
4. `vw_recurring_merchant_monthly` read surface 설계.
5. asset/liability health 전에 cash-equivalent/liquidity tier 분류 방식 결정.

## Key Decisions

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
- 2026-05-25: 대출 상환 거래 연결은 기존 거래 작업대 bulk edit에 섞지 않고 별도 `/operations/loan-mapping` 화면으로 분리한다.
- 2026-05-25: 반복결제의 `할부` / `매월 반복` 구분은 거래 단위 nullable `transactions.recurring_payment_kind`로 먼저 저장하고, 별도 `/operations/recurring-classification` 화면에서 관리한다.
- 2026-04-07: backend/API live contract의 문서상 SSOT는 [backend-api-ssot.md](backend-api-ssot.md)로 둔다.
- 2026-04-07: frontend current source-of-truth는 네 문서로 제한한다: `frontend-design-tokens.md`, `frontend/components-and-design-token-inventory.md`, `frontend/page-wireframes.md`, `frontend-reimplementation-wireframe-functional-requirements.md`.

## Known Issues

- `merchant_normalized` 부재로 merchant 분석 v1은 raw `merchant` 입력 품질에 영향을 받는다.
- `asset_snapshots`에는 현금성 분류 기준이 없어 emergency fund 계산은 초기에는 규칙/매핑 의존이다.
- `loans`에는 월 상환액이 없어 debt burden은 추정치(`*_est`) 계약으로만 제공 가능하다.
- 현재 실데이터 기준 대출원금상환은 raw `type='이체'`가 아니라 `type='지출'`, `category_major='금융'`에 섞여 있다. transfer tracking 구현은 expense-side 재분류를 반드시 포함해야 한다.
- 대출상환은 사용자 의도상 고정비 지출로도 해석될 수 있으므로 MVP에서는 raw `지출`을 `이체`로 바꾸지 않는다. 별도 transfer/debt movement slice는 파생 레이어로만 제공한다.
- 현재 지출 실데이터에서 `cost_kind`, `fixed_cost_necessity`가 비어 있으면 fixed-cost/essential/discretionary 진단 효용이 낮다. `vw_unclassified_work_queue`가 이 품질 문제를 먼저 드러내야 한다.
- Playwright CLI는 이 환경에서 cache/namespace 제약으로 browser launch가 불안정할 수 있다. 필요 시 Chrome headless fallback 또는 in-app browser를 사용한다.
