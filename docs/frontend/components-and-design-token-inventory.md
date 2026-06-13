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
- Canonical main nav:
  - `/`
  - `/spending`
  - `/net-worth`
  - `/signals`
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
| `CashflowChart` | home monthly cashflow | `--ds-chart-income`, `--ds-chart-expense`, `--ds-chart-net` |
| `StackedBars` | spending category trend | `--ds-chart-1..11`, `--ds-chart-other` |
| `HBarList` | category, asset, investment, merchant lists | caller color or `--ds-accent-fg` |
| `LineArea` | net-worth history | `--ds-accent-fg`, `--ds-accent-bg`, `--ds-chart-grid` |
| `MoMList` | category month-over-month signal | income/expense semantic tones |
| `Treemap` | merchant/category area chart | `--ds-chart-1..11`, `--ds-chart-other` |
| `CalendarHeat` | daily spending heat grid | expense/accent semantic tones |

## Feature Pages

| Page | Source | Route |
| --- | --- | --- |
| Home | `features/home/HomePage.tsx` | `/` |
| Spending | `features/spending/SpendingPage.tsx` | `/spending` |
| Net worth | `features/networth/NetWorthPage.tsx` | `/net-worth` |
| Signals | `features/signals/SignalsPage.tsx` | `/signals` |
| Inbox | `features/data/InboxPage.tsx` | `/data/inbox` |
| Transactions | `features/data/TransactionsPage.tsx` | `/data/transactions` |
| Loans | `features/data/LoansPage.tsx` | `/data/loans` |
| Installments | `features/data/InstallmentsPage.tsx` | `/data/installments` |
| Asset metadata | `features/data/AssetMetaPage.tsx` | `/data/assets` |
| Rules | `features/data/RulesPage.tsx` | `/data/rules` |
| Settings | `features/data/SettingsPage.tsx` | `/data/settings` |
| Import | `features/data/ImportPage.tsx` | `/data/import` |
| Reference | `features/data/ReferencePage.tsx` | `/data/reference` |

## API And State Hooks

Current frontend server state is TanStack Query based.

- Analytics: `src/api/analytics.ts`, `src/hooks/useAnalytics.ts`
- Assets: `src/api/assets.ts`, `src/hooks/useAssets.ts`
- Transactions and operations: `src/api/transactions.ts`, `src/hooks/useTransactions.ts`
- Upload: `src/api/upload.ts`, `src/hooks/useUpload.ts`
- Profile: `src/api/profile.ts`, `src/hooks/useProfile.ts`
- Settings: `src/api/settings.ts`, `src/hooks/useSettings.ts`
- Schema/canonical reference: `src/api/schema.ts`, `src/api/canonicalViews.ts`, corresponding hooks

## Replacement Rules

- New frontend work should use `ds`, `features`, and `shell`.
- Do not add new files under legacy `components` or `pages`.
- Legacy URLs should be implemented as redirects in `frontend/src/router.tsx`.
- UI token changes should update `docs/frontend-design-tokens.md`.
- New shared primitives should update this inventory.
