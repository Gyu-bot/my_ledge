# Frontend Components And Token Inventory

**Status:** Active
**Source files:** `frontend/src/ds/**`, `frontend/src/features/**`, `frontend/src/shell/**`

## Scope

이 문서는 `frontend-remake` 이후 현재 프론트엔드 구현에 존재하는 UI surface를 정리한다.
구 `frontend/src/components/**`, `frontend/src/pages/**`, `frontend/src/navigation.ts`, `frontend/src/lib/chartTheme.ts`는 PR 머지 시 삭제되는 legacy surface이며 current source of truth가 아니다.

## Shell

### `AppShell`

- Source: `frontend/src/shell/AppShell.tsx`
- Responsibility:
  - left navigation + main content frame
  - 분석 메뉴와 작업대 메뉴 표시 (모바일은 하단 탭 + 작업대 칩)
  - route outlet host
  - 뒤로 가기로 돌아온 기록 항목의 스크롤 위치 되살리기(창과 모바일 본문 모두, T059)
- Token usage:
  - `bg-bg-base`, `bg-bg-surface`, `bg-bg-inset`
  - `border-border`, `border-border-subtle`
  - `text-text-primary`, `text-text-secondary`, `text-text-muted`

### `PageHeader`

- Source: `frontend/src/shell/PageHeader.tsx`
- Responsibility:
  - page title, meta, right-side controls
  - feature page의 first visible section header
- Token usage:
  - `text-title`, `text-caption`
  - `text-text-primary`, `text-text-muted`

### `navigation`

- Source: `frontend/src/shell/navigation.ts`
- Canonical main nav (T058, T059, T061):
  - `/` 월 결산
  - `/analysis` 지출 분석
  - `/commitments` 약정 현황
  - `/net-worth` 재무상태 (T061, 예전 이름 자산·부채)
- 작업대 nav (예전 "데이터", T059, T061):
  - `/data/inbox` 분류
  - `/data/transactions` 거래
  - `/data/nature` 기본값·정기 지급
  - `/data/transfers` 이체 목적 (T061)
  - `/data/loans`
  - `/data/installments`
  - `/data/assets`
  - `/data/rules`
  - `/data/status` 자료 현황
  - `/data/import`
  - `/data/settings`
  - `/data/reference`

### `LegacySpendingRedirect`

- Source: `frontend/src/shell/LegacySpendingRedirect.tsx`
- 예전 `/spending?lens=…` 주소를 탭에 따라 `/` 또는 `/analysis`로 보낸다. 라우트 등록은 `router.tsx`에 있다.

## DS Primitives

### Layout And States

| Component | Responsibility | Main tokens |
| --- | --- | --- |
| `Card` | section/card shell with title, meta, action slot | `bg-bg-surface`, `border-border`, `text-section` |
| `Skeleton` variants | loading placeholders | `bg-bg-inset`, `border-border-subtle` |
| `States` | empty/error states | `text-text-muted`, `border-border` |
| `DetailPanel` | side/detail editing panel shell. 열리면 첫 입력에 초점, Tab은 패널 안에서만, Esc로 닫으면 연 요소로 초점을 돌려준다(T059) | `bg-bg-surface`, `border-border` |
| `BulkBar` | selected-row bulk action bar | `bg-bg-inset`, `border-border-strong` |
| `ConfirmDanger` | destructive confirmation pattern | `bg-expense-bg`, `border-expense-border` |

### Controls

| Component | Responsibility | Main tokens |
| --- | --- | --- |
| `Button` | primary/secondary/ghost/destructive commands | semantic foreground/background tokens |
| `Field` | label, input, select, helper text composition | `bg-bg-inset`, `border-border`, `text-caption` |
| `RangeControl` | month/range controls | `bg-bg-inset`, `border-border` |
| `SegmentedControl` | mutually exclusive mode switching | `bg-bg-inset`, `bg-bg-selected` |
| `Pagination` | previous/next/page state | `text-caption`, `border-border` |

### Data Display

| Component | Responsibility | Main tokens |
| --- | --- | --- |
| `Badge` | status/risk/type tags (글자 크기 `text-micro` 고정) | semantic tone tokens |
| `CoverageGauge` | ratio/coverage bar | `bg-bg-inset`, `bg-accent` |
| `Provenance` | source/assumption popover | `text-text-muted`, `border-border` |
| `SegmentedBar` | proportional breakdown bar | caller semantic color tokens |
| `Sparkline` | compact inline trend | `--ds-chart-*` |
| `Stat` | KPI label/value/sub/badge | `text-kpi`, `text-display`, semantic sub tones |
| `toast` / `toastStore` | transient feedback | semantic tone tokens |

## Chart Primitives

| Component | Current usage | Token source |
| --- | --- | --- |
| `CashflowChart` | month close 12-month trend (수입·총지급·잔여; optional `labels` prop for legend names) | `--ds-chart-income`, `--ds-chart-expense`, `--ds-chart-net` |
| `StackedBars` | currently unused by a page (former spending trend) | `--ds-chart-1..11`, `--ds-chart-other` |
| `HBarList` | net-worth asset and investment lists | caller color or `--ds-accent-fg` |
| `LineArea` | net-worth history | `--ds-accent-fg`, `--ds-accent-bg`, `--ds-chart-grid` |
| `MoMList` | currently unused by a page (former category MoM) | income/expense semantic tones |
| `Treemap` | currently unused by a page (former merchant treemap) | `--ds-chart-1..11`, `--ds-chart-other` |
| `CalendarHeat` | currently unused by a page (former spending calendar) | expense/accent semantic tones |

## Feature Pages

| Page | Source | Route |
| --- | --- | --- |
| Month close (월 결산) | `features/monthclose/MonthClosePage.tsx` (+ `FlowTable`, `ForecastCard`, `TrendCard`) | `/` |
| Spending analysis (지출 분석) | `features/spending-analysis/SpendingAnalysisPage.tsx` (+ `CategoryBreakdownCard`, `ContributionsCard`, `NewPurchaseCard`, `ReviewItemsCard`) | `/analysis` |
| Net worth (재무상태, T061) | `features/networth/NetWorthPage.tsx` (+ `SnapshotDatesCard`, `ReconciliationSection`, `EmergencyFundCard`) | `/net-worth` |
| Commitments (약정 현황) | `features/commitments/CommitmentsPage.tsx` | `/commitments` |
| Classification (작업대 · 분류) | `features/workbench/ClassificationPage.tsx` (+ `ClassificationQueue`, `LoanCandidateCard`) | `/data/inbox` |
| Transactions | `features/data/TransactionsPage.tsx` | `/data/transactions` |
| Nature settings (기본값·정기 지급) | `features/workbench/NatureSettingsPage.tsx` (+ `CategoryDefaultsEditor`, `RecurringCommitmentsEditor`) | `/data/nature` |
| Transfer purpose (작업대 · 이체 목적, T061) | `features/workbench/TransferPurposePage.tsx` | `/data/transfers` |
| Data status (자료 현황) | `features/workbench/DataStatusPage.tsx` | `/data/status` |
| Loans | `features/data/LoansPage.tsx` | `/data/loans` |
| Installments | `features/data/InstallmentsPage.tsx` | `/data/installments` |
| Asset metadata | `features/data/AssetMetaPage.tsx` | `/data/assets` |
| Rules | `features/data/RulesPage.tsx` | `/data/rules` |
| Settings | `features/data/SettingsPage.tsx` | `/data/settings` |
| Import | `features/data/ImportPage.tsx` | `/data/import` |
| Reference | `features/data/ReferencePage.tsx` | `/data/reference` |

### Shared analysis pieces (T058)

| Piece | Source | Responsibility | Main tokens |
| --- | --- | --- | --- |
| `DataStatusStrip` | `features/analysis/DataStatusStrip.tsx` | 화면 머리의 자료 현황: 거래 기준일, 마감월·진행월, 종류별 스냅샷 기준일, 미정 비중(보는 달·전체), 원화 외 제외 건수 | `bg-bg-surface`, `border-border`, `warn` badge |
| `AmountDrilldown` | `features/analysis/AmountDrilldown.tsx` | 금액 아래에 그 자리에서 열리는 근거 패널: 산식, 포함·제외, 기준 비교, 카테고리 × 거래처 구성, 금액과 같은 흐름표 줄로 거른 거래 목록(합계 대조)과 그 자리 고치기. T061: 스냅샷 구간(`kind='interval'`)은 달 대신 날짜 범위로 거래를 연다 | `bg-bg-raised`, `border-accent-border`, `shadow-raised` |
| `flowMeasures` | `features/analysis/flowMeasures.ts` | 월 흐름표 금액별 이름·산식·포함/제외 문장과 내역을 여는 조회 조건(`lineFiltersFor`: 금액 조건 → 거래 목록 줄 필터). 값은 응답에서 그대로 읽는다 | — |
| `FlowTable` | `features/monthclose/FlowTable.tsx` | 월 흐름표 줄(연산 기호 −, = 를 글자로 표시해 색에만 의존하지 않음), 전체/간단(진행월) 두 모양 | `text-label`, `bg-bg-selected` |
| `ForecastCard` | `features/monthclose/ForecastCard.tsx` | 진행월 월말 순현금흐름 전망 전용 카드. 추정 색은 이 카드의 가정·전망 값에만 | `border-t-estimate`, `bg-estimate-bg`, `text-estimate` |

### 재무상태 pieces (T061)

| Piece | Source | Responsibility | Main tokens |
| --- | --- | --- | --- |
| `ReconciliationSection` | `features/networth/ReconciliationSection.tsx` | 순자산 대조 카드(구간 선택, 상태 배지 ✓/!와 이유, 구간 규칙, 대조식 줄 — 앞 기호 =, + 를 글자로, 보류 값은 "계산 보류" 배지와 보류 이유, 잔여의 행방, 이체 미정 비중과 이체 목적 링크, 종류별 짝 표)와 스냅샷 구간 목록 | `bg-bg-inset`, `bg-bg-selected`, `warn`/`accent` badge |
| `EmergencyFundCard` | `features/networth/EmergencyFundCard.tsx` | 비상금 개월 수 = 현금성 자산 ÷ 월 보호 지급, 기준 기간·미정 비중·근거와 한계, "조언이 아님" 문장 | `text-kpi`, `bg-bg-inset` |
| `SnapshotDatesCard` | `features/networth/SnapshotDatesCard.tsx` | 종류별 스냅샷 날짜(합치지 않음)와 대조에 쓰는지 | `bg-bg-inset` |
| `intervalMeasures` | `features/networth/intervalMeasures.ts` | 구간 금액(잔여·수입·총지급·이체 세 줄)의 이름·산식·포함/제외 문장과 거래를 여는 조회. 값은 대조 응답에서 그대로 | — |
| `netWorthText`, `pairs` | `features/networth/netWorthText.ts`, `features/networth/pairs.ts` | 상태·종류·짝 상태의 화면 말, 구조화된 응답에서 만든 이유 문장, 대조 구간과 이체 목적 화면 사이의 주소 규칙 | — |

추정 색(`estimate`)은 재무상태와 이체 목적 화면에 쓰지 않는다(추정 값이 없다).

### Shared classification pieces (T059)

| Piece | Source | Responsibility | Main tokens |
| --- | --- | --- | --- |
| `TransactionEditor` | `features/transactions/TransactionEditor.tsx` | 거래 고치기 패널(`DetailPanel`): 거래처·카테고리·메모, 지출의 조정 가능성(거래 단위 값/따로 정하지 않음, 근거 표시), 이체 목적. 분석 화면에서도 화면을 떠나지 않고 열린다 | `DetailPanel`, `Field` |
| `TransactionRows`, `TransactionIdRows` | `features/transactions/TransactionRows.tsx` | 거래 목록(날짜·거래처·금액·"고치기")과 거래 번호 목록 불러오기 | `bg-bg-inset`, `border-border` |
| `labels` | `features/classification/labels.ts` | 조정 가능성·근거·약정 종류·주기·금액 종류·이체 목적의 화면 말 (영어 키를 화면에 내지 않음) | — |
| `uploadLabels` | `features/workbench/uploadLabels.ts` | 업로드 상태값의 쉬운 말과 배지 색 | semantic tone tokens |

### Settings Page Composition

- `SettingsPage` preserves the financial targets editor for emergency fund months, savings rate, and debt strategy.
- `AnalyticsSettingsEditor` renders the sectioned analytics settings editor inside `/data/settings`.
- Editable analytics sections: `purchase_gate`, `discretionary_velocity`, `recurring_dry_run`, `asset_liability_health`.
- Read-only analytics sections: `spending_anomalies`, `bulk_operations`.
- Each analytics field presents default, saved, and effective values in helper text before saving only changed user settings.
- Current primitive usage stays within existing DS components: `Card`, `Field`, `TextInput`, `Select`, `Toggle`, `Button`, `ListSkeleton`, `ErrorState`, and `toast`.

## API And State Hooks

Current frontend server state is TanStack Query based.

- Analytics: `src/api/analytics.ts`, `src/hooks/useAnalytics.ts`
- Assets: `src/api/assets.ts`, `src/hooks/useAssets.ts`
- Transactions and operations: `src/api/transactions.ts`, `src/hooks/useTransactions.ts`
- Upload: `src/api/upload.ts`, `src/hooks/useUpload.ts`
- Profile: `src/api/profile.ts`, `src/hooks/useProfile.ts`
- Settings: `src/api/settings.ts`, `src/hooks/useSettings.ts`
- Schema/canonical reference: `src/api/schema.ts`, `src/api/canonicalViews.ts`, corresponding hooks
- Metric contract (T058): `src/api/metrics.ts`, `src/hooks/useMetrics.ts`, `src/types/metrics.ts` — `/metrics/data-status`, `/metrics/monthly-flow`, `/metrics/spend-cube`, `/metrics/comparison/*`, `/read/review-items`, `/canonical-views/month-projection/accuracy`, `/transfer-purposes/transactions`; T059: `/read/commitments`, `/read/data-status` (`src/types/readSurface.ts`)
- Nature axes and transfer purpose (T059): `src/api/nature.ts`, `src/hooks/useNature.ts`, `src/types/nature.ts` — `/nature/category-defaults`, `/nature/recurring-commitments`, `/nature/transactions/{id}(/adjustability)`, `/transfer-purposes/transactions/{id}`. 쓰기가 성공하면 `nature`·`metrics`·`read`·`transactions`·`canonical-views`·`analytics`·`transfer-purposes` 질의를 다시 읽는다. 거래 단위 조정 가능성을 한꺼번에 쓰는 API가 없어 `useBulkTransactionAdjustability`가 거래마다 6개씩 동시에 쓴다.
- Net worth (T061): `src/api/netWorth.ts`, `src/hooks/useNetWorth.ts`, `src/types/netWorth.ts` — `/metrics/net-worth/intervals`, `/metrics/net-worth/reconciliation`, `/metrics/net-worth/emergency-fund`. 질의 키가 `metrics`로 시작해 분류(이체 목적·조정 가능성)를 바꾸면 같이 다시 읽힌다.
- Transfer purpose rules (T061): `natureApi.transferRules|createTransferRule|updateTransferRule|deleteTransferRule`, `useTransferPurposeRules`, `useCreate|Update|DeleteTransferPurposeRule` — `/transfer-purposes/rules(/{id})`. 목록은 `useTransferPurposeList`(`/transfer-purposes/transactions`, 기간 선택적, `purpose_source`·`transaction_purpose`·`rule_id` 포함).
- Transactions list (T059): `TransactionListParams`에 `flow_row`, `payment_form`, `adjustability` (백엔드 줄 필터)
- `lib/utils.ts`의 `cn`은 tailwind-merge에 디자인 글자 크기(`display`…`micro`)를 알려 `text-micro`와 `text-text-*` 색이 서로 지워지지 않게 한다(T059)

## Replacement Rules

- New frontend work should use `ds`, `features`, and `shell`.
- Do not add new files under legacy `components` or `pages`.
- Legacy URLs should be implemented as redirects in `frontend/src/router.tsx`.
- UI token changes should update `docs/frontend-design-tokens.md`.
- New shared primitives should update this inventory.
