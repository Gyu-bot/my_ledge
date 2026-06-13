# 05. 세부 디자인 스펙

> 페이지·섹션별 상세: 데이터 소스(기존 API/훅), 상태, 인터랙션, 반응형.
> 컴포넌트 명칭은 [04-design-system.md](04-design-system.md) 기준. 데이터 소스는 현재 `frontend/src/hooks/*` 기준 — 백엔드 변경 없음.

## 공통 규약

- **로딩:** 모든 섹션은 형태 보존 `Skeleton`. 페이지 단위 스피너 금지.
- **에러:** 섹션 단위 `ErrorState`(재시도). 페이지 전체 실패 시에만 페이지 ErrorState.
- **빈 상태:** 원인+해결 액션 (예: "고정비 분류 데이터가 없습니다 → 인박스에서 분류 시작").
- **쓰기 결과:** `Toast` (성공: "N건 반영", 실패: 사유). 페이지 상단 AlertBanner 패턴 폐지.
- **URL 상태:** 기간/탭/필터/선택 모드는 query string 직렬화. 뒤로가기로 필터 복원.
- **read-only:** `useWriteAccess` false → 쓰기 컨트롤 disabled + 툴팁. 배너 없음.

---

## 1. 홈 `/`

| 섹션 | 데이터 | 세부 |
|---|---|---|
| 히어로 Stat "이번 달 쓸 수 있는 돈" | `useCanonicalViewsDashboard` → `true_spendable_monthly` 최신 | 값=`remaining_after_variable_spend`(진행월·추정 가능 시 `estimated_*`). `예상` 배지 → ProvenancePopover: `income_estimate_source` 라벨, `excluded_income_periods`, 관측값. 스파크=최근 6개월 |
| 보조 Stat 4 | 순자산: `useAssetSnapshots` 최신(+기준일) / 수입·지출: `useMonthlyCashflow(6)` 최신 월 / 저축률: **마지막 `is_complete_month=true` 월** 기준(휴리스틱 폐기), 목표는 `settings/analytics.financial_targets.savings_rate_target`(미설정 시 목표 줄 숨김) | 지출 MoM 델타는 직전 월 대비 계산 |
| 현금흐름 12개월 | `useMonthlyCashflow(12)` + canonical `is_complete_month` | dual bar + net 라인. 미완성 월 바는 반투명+빗금. 카드 헤더 ▸지출 |
| 주의 신호 | `useSpendingAnomalies(per_page:1)`·`useRecurringPayments(1,1)`·`useIncomeStability`·`useDiscretionaryVelocity` | 4행 요약. 기준 모드는 신호 페이지와 공유(전역 설정, localStorage). 각 행 ▸신호 해당 섹션 anchor |
| 해야 할 일 | 인박스와 동일 3쿼리의 count만 | 미분류 N(고정비 후보 N)/승인 대기 N/대출 연결 후보 N + `CoverageGauge`. ▸인박스 탭 딥링크 |
| 최근 거래 | `useTransactionList({per_page:5, type:'all'})` | read-only 리스트, ▸데이터·거래 |

상태: 스냅샷 없음 → 히어로 대신 "가져오기에서 업로드 시작" EmptyState (첫 사용 흐름).

## 2. 지출 `/spending`

**PageHeader:** `RangeControl`(프리셋 3/6/12 + 커스텀 월범위, 기본 6) + `수입 포함` 토글. 모든 렌즈·거래 내역에 적용.

| 렌즈 | 데이터 | 인터랙션 |
|---|---|---|
| 추이 | `useCategoryTimeline` | 스택 바, 범례 클릭=시리즈 토글. 바 클릭 → 거래 내역 필터(월+카테고리). 하단에 `useCategoryMoM`(기준월 기본=종료월, 로컬 예외 ●) |
| 구성 | `useCategoryBreakdown(level:major)` + `useSubcategoryBreakdown` | 좌: 대분류 bar 목록(클릭=선택, 선택=진하게) / 우: 선택 대분류의 소분류. 행 클릭 → 거래 내역 필터 |
| 고정비 | `useFixedCostTrend` + `useFixedCostSummary` | SegmentedControl `고정/변동 ↔ 필수/재량`. 추이 차트 + 비율 segmented bar + 금액 카드. 미분류: `unclassified_total/count` → "미분류 ₩X·N건" 게이지 + ▸인박스(`?tab=unclassified&hint=cost_kind`) |
| 거래처 | `useMerchantTreemap` | nested treemap, 노드 클릭 → 거래 내역 필터(거래처). 우측 Top N 목록(`useMerchantSpend`) |
| 달력 | `useDailySpend(month)` | 월 선택(로컬 예외 ●), 일 클릭 → 거래 내역 필터(일) |
| 수입 | `useCategoryBreakdown`/`useCategoryTimeline`의 `type=수입` 변형 (백엔드 `vw_income_monthly_by_category` REST 노출 시 교체) | 월별 수입 카테고리 스택 바 + 카테고리 합계 목록. 행 클릭 → 거래 내역 필터(수입) |

**거래 내역 패널 (하단 공통):** `useTransactionList`(전역 기간+렌즈 선택 필터, 20행). 칼럼: 날짜/거래처/카테고리/금액. 활성 필터 칩 표시+개별 해제. 행 클릭 → `/data/transactions`에서 열기 딥링크.

## 3. 자산·부채 `/net-worth`

**PageHeader:** 스냅샷 기준일 + 비교 메타(`useAssetSnapshotCompare`: baseline 날짜·경과일) + 비교 모드 select(`latest_available_vs_previous_available` 기본 / `last_closed_month_vs_previous_closed_month`). `is_stale` → amber 배지 + 툴팁("스냅샷이 오래되었습니다 — 새 업로드 권장 ▸가져오기").

| 섹션 | 데이터 | 세부 |
|---|---|---|
| KPI 4 | `useAssetSnapshots`·`useLiquidityHealth` | 현금성 Stat 보조=비상금 N개월 (목표 대비 — 아래 유동성 보드 참조), 총자산 ⓘ=`negative_asset_excluded_total`(음수 자산 제외분) Provenance 행 |
| 순자산 추이 | `useNetWorthHistory` | line+area. 포인트 hover=자산/부채/순자산 |
| 순자산 구성 | `useNetWorthBreakdown` | 수평 bar, 부채는 `부채 ·` 접두 + expense색. ⓘ에 음수 자산 제외 표기 |
| 신용점수 카드 | `useProfile` (신규 훅 — `GET /profile`) | KCB 점수 + `credit_score_history` 스파크라인 + 나이·성별 메타. ⓘ="BankSalad 고객정보 스냅샷, 이름·이메일 비저장". 데이터 없으면 카드 자체 숨김 |
| 유동성 보드 | `useLiquidityHealth` + `useAssetSnapshots.asset_items` | 등급별 합계 3카드 + **비상금 목표 게이지**(`emergency_fund_months` / `emergency_fund_target_months`, `target_progress_ratio` — CoverageGauge 재사용, 목표 편집 ▸설정) + 자산별 목록(등급·현금성 배지). 미지정 자산 ⚠ 상단 + ▸자산 메타 편집 |
| 대출 보드 | `useLoanSummary` | 총원금/총잔액 + 대출 카드: 표시명·금융사·loan_kind, 잔액·금리, 월상환(ⓘ=`monthly_payment_source`), **월 이자 추정**(`estimated_monthly_interest`, ⓘ="잔액×금리/12 단리 추정 — 상환 스케줄 아님"), 상환 방식, 진행률 바=1-잔액/원금, 만기일. 정렬: `debt_strategy_preference`(avalanche=금리 내림차순/snowball=잔액 오름차순/미설정=잔액 내림차순) + 정렬 기준 ⓘ. ▸대출 관리 |
| 투자 보드 | `useInvestmentSummary` | 종목별 평가액·수익률·비중(`pct_of_investment_total`) 수평 bar. 총평가액 0이면 비중 `—` |
| 보험 보드 | `useInsuranceSummary` (신규 훅 — `GET /insurance/summary`) | 계약 목록(보험사/상품/상태/총납입/계약일·만기일) + 월 보험료 추정(`monthly_premium_estimate` — ⓘ에 `assumptions[]` 전체). **evidence만 표시** — 적정성 판단 문구 금지(백엔드 계약). 계약 없으면 보드 숨김 |
| 할부 잔여 | `useInstallmentForecast(6)` 요약 | Remaining 합계 + Missed 합계(⚠) 1행. ▸할부 관리 |

## 4. 신호 `/signals`

**PageHeader:** 기준 모드 SegmentedControl `직전 마감월 | 부분 기간`(+date picker). 전역 설정으로 저장(홈 주의 신호 공유).

| 섹션 | 데이터 | 세부 |
|---|---|---|
| KPI 3 | cashflow/incomeStability/anomalies | 저축률 / 수입 변동성(CV → 안정·보통·불안정, ⓘ=CV 수치) / 이상 카테고리 수 |
| 재량 지출 속도 | `useDiscretionaryVelocity(as_of=오늘)` | ratio 대형 수치 + 심각도 배지(`risk_level` 4단계 매핑) + 현재 vs 기준선 + 진행률·커버리지·confidence 칩 + reasons[0]. ⓘ 팝오버에 전체 reasons |
| 신호 피드 | 합성: ① 클라이언트 인사이트 룰(저축률/안정성 — 목표는 `financial_targets`) ② `useSpendingAnomalies`(페이지네이션) ③ `usePurchaseGateCandidates(pending)` | `SignalCard` 통일, 심각도 내림차순. 타입 필터 칩 `전체|이상 지출|구매 후보|상태`. 이상 지출 카드 액션: ▸지출 구성(카테고리 선택) / ▸거래 내역. 구매 게이트 카드: 후보 타입 배지 + signals kv ⓘ + **리뷰 액션**(검토함/무시/스누즈 N일(기본 14)/메모 → `useReviewPurchaseGateCandidate` 신규 훅, `PATCH .../review`). 스누즈 카드는 `cooldown_until`까지 숨김, "스누즈됨 N건" 접힘 행. assumptions는 피드 헤더 ⓘ 1곳 |
| 반복 결제 현황 | `useRecurringPayments` | 조회 전용 테이블(거래처/저장 분류+분포/주기/평균/횟수) + 진단 기준 ⓘ. 헤더 액션 `분류 바꾸기 ▸데이터·거래(그룹 보기)` |
| 비교 | `useCategoryMoM` / `useMerchantSpend` | 탭 전환, 각자 기간 컨트롤(MoM 기준월, 거래처 1/3/6/12개월) |

## 5. 데이터 공통 (`/data/*`)

- 서브 내비(좌측 또는 모바일 상단 칩) + 공통 헤더에 `CoverageGauge`(고정비/필수·재량/반복/대출 연결 — `useFixedCostSummary.unclassified_*`와 큐·미연결 count로 근사 계산).
- 모든 쓰기 액션 → Toast("N건 반영"), 목록 invalidate.

### 5.1 인박스 `/data/inbox`

- 데이터: ① `useCanonicalViewsDashboard.unclassified_work_queue` ② `useRecurringCategoryRulesDryRun` ③ `useLoanTransactionMappings({linked:'unlinked', per_page:…})`
- 탭 칩: `전체 N | 미분류 N | 승인 대기 N | 대출 연결 N` (count 실시간).
- 카드 타입별 인라인 액션:
  - **미분류:** 거래 요약(거래처/일자/금액) + `priority_reason` ⓘ + 고정·변동/필수·재량/반복 select + 저장(`useUpdateTransaction`) + ▸거래에서 열기.
  - **승인 대기(dry-run):** 제안 분류·confidence·reason·category_hint + 매칭 거래 칩 + 적용 범위 select(`all_matching` 우선) + 승인 적용(`useApplyRecurringDryRun`) + 무시(세션 dismiss). 제안이 `할부`면 `▸할부 연결` prefill 링크.
  - **대출 연결:** 계좌 select + 상환 성격 select + 연결(`useBulkLinkTransactionsToLoan` 단건) + ▸대출에서 열기.
- 처리 완료 카드는 200ms 페이드아웃 후 제거, 게이지 갱신.
- 빈 상태: "처리할 항목이 없습니다 — 분류 커버리지 N%" (긍정 강화).

### 5.2 거래 `/data/transactions`

- **뷰 토글:** `행 보기 | 그룹 보기` (query `view=rows|groups`).
- **행 보기:**
  - FilterBar: 기존 12필터 전부 (검색/유형/출처/대분류/결제수단/고정·변동/고정비 필수/필수·재량/반복/날짜범위/삭제 포함/수정만). draft→적용.
  - DataTable 40행: ☑/날짜/원본 설명(text-faint, truncate)/거래처/대분류·소분류/성격(고정·변동+필수·재량 결합 표시+출처 점: 수동=없음·자동=blue 점 ⓘ)/반복/메모/상태/금액.
  - 행 클릭 → `DetailPanel`: 원본 설명 전체, 출처 체인(import→수동/자동), 편집 폼(거래처/대분류→소분류 종속/고정·변동/필수·재량/반복/메모), 저장·삭제·복원. (인라인 셀 편집 폐지 — 01 인벤토리의 편집 필드 동일)
  - 선택 → `BulkBar`: 일괄 필드 적용(`useBulkUpdateTransactions`) / 삭제·복원 preview(`useBulkDelete/RestorePreview`: 건수·기간·합계·대표 거래처) → 실행 → Toast에 `방금 삭제 복원` undo(`useBulkRestoreTransactions`).
- **그룹 보기 (기존 반복 결제 분류 흡수):**
  - 데이터: `useRecurringPayments(page, 20)`.
  - 테이블: ☑/거래처/카테고리/주기/평균금액/횟수/현재 분류(+분포 요약)/분류 select(변경 즉시 `useBulkUpdateTransactions(transaction_ids)` — 실패 시 롤백+Toast).
  - 선택 → BulkBar: 분류 select + `선택 그룹 적용`.
  - `할부` 분류 그룹: 행에 `▸할부 연결` (prefill: search/merchant/amount — 기존 URL 계약 유지).

### 5.3 대출 `/data/loans` — 탭 `계좌 | 거래 연결 | 규칙`

- **계좌:** `useLoanAccounts` + `useLoanSummary` 병합 카드. 스냅샷 메타(스냅샷일/신규일/만기일/잔액/금리) + 표시명 입력 + loan_kind select(`useUpdateLoanAccountMetadata`) + 상환 메타 블록: 연결 거래 추정값(산출 기준 라벨) 표시, 수동 월상환액 입력 + 상환 방식 select → `수동 확정`(`usePatchLoanRepaymentMetadata`). 저장 버튼 1개로 두 API 순차 호출(변경된 쪽만).
- **거래 연결:** 기존 LoanMapping 동일 — FilterBar(검색/연결 상태/계좌/성격/기간) + DataTable(날짜/원본 설명/거래처/분류/연결 대출 또는 미연결 ⚠/성격/금액/연결 메모) + BulkBar(계좌+성격+메모 → `useBulkLinkTransactionsToLoan`).
- **규칙:** 대출 매칭 규칙 폼(매칭 기준: 거래처|원본 설명, 매칭 값, 계좌, 성격, 메모 → `useUpsertLoanMerchantRule`) + 목록 + `일괄 적용`(`useApplyLoanMerchantRules`). "수동 연결은 덮지 않음" 고정 안내. 업로드 자동 적용 토글 위치는 ▸규칙 페이지로 링크.

### 5.4 할부 `/data/installments` — 탭 `계획 | 거래 연결 | 예측`

- KPI 4 (탭 위 고정): Active/Candidates/Remaining/Missed — 기존 계산식 유지.
- **계획:** 새 계획 폼(7필드, 필수 검증 메시지 명세 유지) + 계획 카드(상태 배지 3종, 메타, 표시명·메모 편집 저장).
- **거래 연결:** 필터(검색/연결 상태/계획/기간) + 테이블(날짜/원본 설명+거래처/결제수단/현재 연결: 계획명·n/m회차·메모 또는 미연결 ⚠/금액). 행 클릭 → DetailPanel 빠른 연결(계획/회차/메모, 연결·해제 — `useLink/UnlinkTransactionToInstallment`). BulkBar: 계획+시작 회차(연속 배정 설명)+메모(`useBulkLinkTransactionsToInstallment`). URL prefill 계약 유지(`search/linked/prefill_merchant/prefill_amount`).
- **예측:** 기준일+개월(1~24) 컨트롤 → 월별 테이블(Observed/Projected/Missed/Remaining) + 회차 카드(상태 3종 배지, 예정일, 기준 월, 연결 거래 링크).

### 5.5 자산 메타 `/data/assets`

- 최신 스냅샷 자산 행 목록(이름/카테고리/금액): 유동성 select(즉시/단기/비유동/미지정) + 현금성 체크 → 저장(`usePatchAssetLiquidity`). 미지정 ⚠ 상단 정렬. 헤더에 기준일.

### 5.6 규칙 `/data/rules` — 탭 `카테고리 | 거래처 정규화 | 반복결제`

- 상단 자동 적용 패널: 토글 3종(`usePatchAutoClassificationSettings`).
- 각 탭: 등록 폼 + 규칙 목록 + `일괄 적용`(결과 "N건 반영" Toast). 기존 게이트·보존 규칙 안내문 유지:
  - 카테고리: 대분류·소분류(종속) → 비용 성격 + 필수/재량. 일괄 적용 시 작성 중 폼 자동 저장 후 적용(기존 동작 유지).
  - 정규화: 포함 패턴 → 정규 거래처. "수동 수정된 분석용 거래처는 보존".
  - 반복결제: 카테고리 → 반복 성격. "반복 후보/고정비 게이트 통과 거래만".
- 대출 매칭 규칙은 교차 링크 카드(`▸대출 > 규칙`).

### 5.6b 설정 `/data/settings` (신규 — 07 동기화)

- 데이터: `useAnalyticsSettings` / `usePatchAnalyticsSettings` (신규 훅 — `GET/PATCH /settings/analytics`).
- **재무 목표 카드**: 비상금 목표 개월(1~120, 기본 3) / 저축률 목표(0~1, nullable — 비우면 각 화면의 목표 표기 숨김) / 부채 상환 전략(avalanche·snowball·미설정 라디오) → 저장.
- **분석 파라미터 아코디언**: 백엔드 섹션 구조 그대로(`spending_anomalies`/`discretionary_velocity`/`purchase_gate`/`recurring_dry_run`/`asset_liability_health`(월상환 추정 lookback 1~24)/`bulk_operations`).
- 각 필드는 default(흐림 placeholder)·saved(입력값)·effective(적용값 뱃지) 3값 구분 — 백엔드 응답 구조 그대로 표현.
- 저장 → Toast + 목표를 소비하는 화면(홈/자산·부채/신호) 쿼리 invalidate.

### 5.7 가져오기 `/data/import`

- 업로드 카드: 드래그&드롭(xlsx, 20MB) + 스냅샷 기준일(필수, 비면 실행 비활성+사유) → 실행(`useUploadFile`). 결과 인라인: success/partial/failed + 거래 신규/스킵 + **스냅샷 4종 카운트(자산/보험/투자/대출 — `snapshots.insurance_contracts` 포함)** + partial 사유(`error_message`).
- 관측 데이터 범위 행: canonical `data_coverage`(first/last transaction date) — "이 범위 밖 월은 미완성으로 표시됩니다" ⓘ.
- 이력 테이블 10건(`useUploadLogs`).
- Danger Zone(기본 접힘, expense 보더): 범위 라디오(거래만 / 거래+스냅샷 — **자산·보험·투자·대출 스냅샷 포함** 문구) + 확인 문구 타이핑 + 실행(`useResetData`) → `ConfirmDanger` 패턴. "업로드 이력은 보존" 안내.

### 5.8 데이터 사전 `/data/reference`

- canonical KPI 4 + 월별 현금흐름 테이블(**`is_complete_month=false` 행에 〔진행중〕 배지**) + 실질 가용액 월별 카드(예상 배지·출처·제외 월·관측 — 홈 히어로와 동일 데이터의 검증 뷰) + 대출 상환/반복 거래처/거래처 기준선/분류 품질 큐 4열(`useCanonicalViewsDashboard`).
- 헤더에 관측 범위(`data_coverage`) 표기.
- View reference(`useSchemaDocument`): view명(mono)/라벨/컬럼/AI 권장 — `vw_loan_account_canonical`, `vw_income_monthly_by_category` 등 신규 view 라벨 추가.
- import parity 검증 노트: `2.현금흐름현황` 벤치마크는 검증 증거 전용(비저장)이며 불일치는 경고로만 기록됨 — 경고 노출 UI는 백엔드 표면 확정 후 후속.
- 헤더 설명: "외부 에이전트가 보는 것과 같은 canonical 수치입니다."
- 큐 항목 ▸인박스 딥링크 (기존 작업 연결 카드 대체).

---

## 6. 반응형 요약

| 패턴 | 데스크톱 | 모바일 |
|---|---|---|
| 내비 | 사이드바 | 하단 탭 5 + 데이터 상단 칩 |
| KPI 그리드 | 4열 | 2열 (히어로는 전폭) |
| DetailPanel | 우측 380px | 풀스크린 시트 |
| BulkBar | 하단 고정 바 | 하단 고정(탭바 위) 축약형 — 필드는 시트로 |
| DataTable | 전체 칼럼 | 핵심 3칼럼(날짜·제목·금액) + 행 탭=상세 시트 |
| FilterBar | 인라인 칩 | "필터 (N)" 버튼 → 시트 |
| 차트 | 高 220~280 | 高 180, 가로 스크롤 허용(스택 바) |

## 7. 마이그레이션 노트 (참고)

1. 토큰/컴포넌트 파운데이션 → 2. 셸+홈 → 3. 지출/자산·부채/신호 → 4. 데이터 스튜디오(인박스 마지막) 순이 의존성상 자연스럽다. 레거시 redirect는 1단계부터 유지. 상세 계획은 이 초안 승인 후 별도 작성.
