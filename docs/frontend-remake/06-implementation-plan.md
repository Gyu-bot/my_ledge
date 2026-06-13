# 06. 구현 계획 — 토큰/컴포넌트 파운데이션 → 전 화면

> **전제:** 바닥부터 재구축. 기존 페이지/컴포넌트/레이아웃은 보존·호환을 고려하지 않고 교체한다.
> 데이터 레이어(`api/`, `hooks/`, `types/`, `lib/apiClient·queryClient·utils·dateRange`)는 백엔드 계약 그대로 재사용한다.

## 진행 현황 (2026-06-12)

| Phase | 상태 | 커밋 |
|---|---|---|
| Phase 0 — 파운데이션 | ✅ 완료 | `bd04a22` |
| Phase 1 — 홈 | ✅ 완료 | `bd04a22` |
| Phase 1.5 — 백엔드 계약 동기화 | ✅ 완료 | `092846a` |
| Phase 2 — 지출/자산·부채/신호 | ✅ 완료 | `36578d6` |
| Phase 3 — 데이터 스튜디오 9화면 | ✅ 완료 | `058dc66` |

전 화면 구현 완료. 백엔드 무변경, 테스트 81개 통과. 남은 후속은 §리스크의 백엔드 요청 항목(분류 커버리지 집계 endpoint, settings 섹션별 편집 폼, parity 경고 표면)뿐.

## Phase 0 — 파운데이션 (이번 커밋)

| 작업 | 내용 |
|---|---|
| 토큰 | `index.css` 전면 교체: Ledger DS 시맨틱 토큰(`--ds-*`), 다크 기본 + `[data-theme="light"]` 듀얼, 차트 12색 팔레트. html 21px rem 스케일 폐지 → 16px 표준 |
| Tailwind | `tailwind.config.js` 전면 교체: DS 타입 스케일(display 32 ~ micro 11), 시맨틱 컬러(`bg/border/text/accent/income/expense/transfer/warn/estimate` — 각 `-bg/-border` 파생), radius(sm 6/md 10/lg 16), shadow-raised |
| 폰트 | `index.html`에 Pretendard Variable 로드, `tabular-nums` 유틸 |
| DS 컴포넌트 (`src/ds/`) | `format.ts`(금액·날짜 표기 계약), `Badge`, `Card`, `Stat`(hero 변형), `Provenance`(출처 팝오버 — radix popover), `Skeleton`, `EmptyState`/`ErrorState`, `Sparkline`, `CoverageGauge`, `charts/CashflowChart`(커스텀 SVG dual bar + net 라인) |
| 셸 (`src/shell/`) | `navigation.ts`(새 IA 5+8), `AppShell`(사이드바 + 모바일 하단 탭 + 데이터 서브 칩 + 테마 토글 + read-only 표시), `PageHeader`(페이지가 직접 렌더하는 sticky 헤더 — 기존 metaBadge 컨텍스트 플럼빙 폐지) |
| 라우팅 | `router.tsx` 교체: 새 IA 경로 + 레거시 redirect 전체. 미구현 페이지는 `PlaceholderPage`(설계 문서 §참조 + 예정 섹션 목록) |
| 구코드 제거 | `pages/`, `components/`, `navigation.ts`, `lib/chartTheme.ts` 및 해당 테스트 삭제 (main에 보존됨) |
| 테스트 | DS format/Stat, AppShell 내비, 라우터 redirect, HomePage 스모크 — 기존 데이터 레이어 테스트(api contracts, apiClient, utils, useWriteAccess)는 유지 |

## Phase 1 — 홈 프로토타입 (이번 커밋, `/`)

[05-detail-design.md §1](05-detail-design.md) 스펙 구현. 데이터는 전부 기존 훅:

| 섹션 | 데이터 소스 |
|---|---|
| 히어로 "이번 달 쓸 수 있는 돈" | `useCanonicalViewsDashboard().true_spendable_monthly` 최신 — 예상/관측 분기, Provenance(추정 출처·제외 월·관측값), 스파크라인 |
| 보조 KPI (순자산/수입/지출/저축률) | `useAssetSnapshots`, `useMonthlyCashflow(12)` |
| 현금흐름 12개월 | `useMonthlyCashflow(12)` → `CashflowChart` |
| 주의 신호 | `useSpendingAnomalies(per_page:1)`, `useRecurringPayments(1,1)`, `useIncomeStability`, `useDiscretionaryVelocity` |
| 해야 할 일 | canonical `unclassified_work_queue` + `useRecurringCategoryRulesDryRun` + `useLoanTransactionMappings({linked:'unlinked'})` count + `CoverageGauge`(velocity의 classification_coverage_ratio) |
| 최근 거래 | `useTransactionList({per_page:5, type:'all'})` |

상태 규약: 섹션별 Skeleton(형태 보존) / ErrorState(재시도) / EmptyState(해결 액션). 스냅샷·현금흐름이 모두 비면 첫 사용 EmptyState("가져오기에서 업로드 시작").

## Phase 1.5 — 백엔드 동기화 후속 (main `8c77fed` 반영, [07 문서](07-backend-sync-20260611.md))

> **선행 조건: `frontend-remake`에 main merge** (backend 코드·docs 동기화).

| 작업 | 내용 |
|---|---|
| api/hooks 신규 | `useProfile`, `useInsuranceSummary`, `useAnalyticsSettings`/`usePatchAnalyticsSettings`(financial_targets 포함), `useReviewPurchaseGateCandidate`(status·memo·cooldown) |
| 타입 갱신 | `canonicalViews.ts`(`data_coverage`, `is_complete_month`), `asset.ts`(`pct_of_investment_total`, `negative_asset_excluded_total`, `emergency_fund_target_months`/`target_progress_ratio`, insurance 타입), `analytics.ts`(purchase gate review 필드), `upload.ts`(`insurance_contracts`) |
| 홈 수정 | 저축률 마감월 선택을 `is_complete_month` 기반으로 교체(현재 추정월 휴리스틱), 목표 50% 하드코딩 → `savings_rate_target`, 현금흐름 차트 미완성 월 표시 |
| mock-api 갱신 | 신규 endpoint(profile/insurance/settings) + canonical 신규 필드 반영 |

## Phase 2 — 읽기 화면 (다음)

`/spending`(렌즈 탭 — **수입 렌즈 포함** + 공유 거래 내역 패널), `/net-worth`(**신용점수·투자·보험 보드, 비상금 목표 게이지, 월 이자 추정, 비교 모드**), `/signals`(SignalCard 피드 + **구매 게이트 서버 영속 리뷰**). 추가 DS: `FilterChip`, `RangeControl`, `SegmentedControl`, `DataTable`(읽기), 차트(스택 바, 수평 bar, treemap, 달력 heat, MoM diverging).

## Phase 3 — 데이터 스튜디오 (다음)

`/data/inbox` → `transactions`(행/그룹 뷰 + DetailPanel + BulkBar) → `loans`/`installments`/`assets`/`rules`/**`settings`(분석 파라미터 + 재무 목표)**/`import`(스냅샷 4종 카운트 + data_coverage)/`reference`. 추가 DS: `DetailPanel`, `BulkBar`(preview 단계), `Toast`, `ConfirmDanger`, 폼 컨트롤 세트.

## 리스크 / 결정 기록

- **recharts 미사용(현재):** 프로토타입 차트는 경량 커스텀 SVG. Phase 2에서 복잡 차트(treemap 등)는 recharts 재도입 여부 결정.
- **분류 커버리지 근사:** 전용 endpoint가 없어 `discretionary-velocity.classification_coverage_ratio`를 사용. 02 문서의 "백엔드 요청" 후보.
- **기준 모드(직전 마감월/부분 기간):** 홈은 기본값(직전 마감월) 고정, 모드 전환 UI는 Phase 2 `/signals` 헤더에서 전역 설정으로 구현. "마감월" 판정은 canonical `is_complete_month`가 단일 기준.
- **수입 렌즈 데이터 소스:** `vw_income_monthly_by_category`는 아직 REST 미노출 — 기존 `by-category(type=수입)`로 1차 구현, 노출 시 교체 (02 §6 백엔드 요청).
- **보험 보드 문구:** 백엔드 계약대로 evidence만 표시 — 적정성 판단 문구 금지.
