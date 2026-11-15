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
  - main nav와 data studio nav 표시
  - route outlet host
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
- Canonical main nav (T058):
  - `/` 월 결산
  - `/analysis` 지출 분석
  - `/net-worth` 자산·부채
- Canonical data nav:
  - `/data/inbox`
  - `/data/transactions`
  - `/data/loans`
  - `/data/installments`
  - `/data/assets`
  - `/data/rules`
  - `/data/settings`
  - `/data/import`
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
| `DetailPanel` | side/detail editing panel shell | `bg-bg-surface`, `border-border` |
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
| `Badge` | status/risk/type tags | semantic tone tokens |
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
| Net worth | `features/networth/NetWorthPage.tsx` | `/net-worth` |
| Inbox | `features/data/InboxPage.tsx` | `/data/inbox` |
| Transactions | `features/data/TransactionsPage.tsx` | `/data/transactions` |
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
| `AmountDrilldown` | `features/analysis/AmountDrilldown.tsx` | 금액 아래에 그 자리에서 열리는 근거 패널: 산식, 포함·제외, 기준 비교, 카테고리 × 거래처 구성, 거래 목록과 거래 화면 링크 | `bg-bg-raised`, `border-accent-border`, `shadow-raised` |
| `flowMeasures` | `features/analysis/flowMeasures.ts` | 월 흐름표 금액별 이름·산식·포함/제외 문장과 내역을 여는 조회 조건. 값은 응답에서 그대로 읽는다 | — |
| `FlowTable` | `features/monthclose/FlowTable.tsx` | 월 흐름표 줄(연산 기호 −, = 를 글자로 표시해 색에만 의존하지 않음), 전체/간단(진행월) 두 모양 | `text-label`, `bg-bg-selected` |
| `ForecastCard` | `features/monthclose/ForecastCard.tsx` | 진행월 월말 순현금흐름 전망 전용 카드. 추정 색은 이 카드의 가정·전망 값에만 | `border-t-estimate`, `bg-estimate-bg`, `text-estimate` |

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
- Metric contract (T058): `src/api/metrics.ts`, `src/hooks/useMetrics.ts`, `src/types/metrics.ts` — `/metrics/data-status`, `/metrics/monthly-flow`, `/metrics/spend-cube`, `/metrics/comparison/*`, `/read/review-items`, `/canonical-views/month-projection/accuracy`, `/transfer-purposes/transactions`

## Replacement Rules

- New frontend work should use `ds`, `features`, and `shell`.
- Do not add new files under legacy `components` or `pages`.
- Legacy URLs should be implemented as redirects in `frontend/src/router.tsx`.
- UI token changes should update `docs/frontend-design-tokens.md`.
- New shared primitives should update this inventory.
