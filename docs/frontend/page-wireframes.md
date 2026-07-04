# Frontend Page Wireframes

**Status:** Active
**Scope:** Current `frontend-remake` routes only

## Route Map

### Canonical Routes

- `/`
- `/spending`
- `/net-worth`
- `/signals`
- `/data/inbox`
- `/data/transactions`
- `/data/loans`
- `/data/installments`
- `/data/assets`
- `/data/rules`
- `/data/settings`
- `/data/import`
- `/data/reference`

### Legacy Redirects

- `/analysis/spending` -> `/spending`
- `/analysis/assets` -> `/net-worth`
- `/analysis/insights` -> `/signals`
- `/operations/workbench` -> `/data/transactions`
- `/operations/loan-mapping` -> `/data/loans`
- `/operations/installments` -> `/data/installments`
- `/operations/asset-settings` -> `/data/assets`
- `/operations/auto-classification` -> `/data/rules`
- `/operations/canonical-views` -> `/data/reference`
- `/operations/recurring-classification` -> `/data/transactions?view=groups`
- `/assets` -> `/net-worth`
- `/income` -> `/`
- `/transfers` -> `/`
- `/data` -> `/data/inbox`
- `*` -> `/`

## Global Shell

```text
+---------------------------------------------------------------+
| left nav: main + data studio | page header + controls          |
+---------------------------------------------------------------+
|                              | route content                   |
|                              | cards, filters, tables, charts  |
+---------------------------------------------------------------+
```

Shell rules:

- `AppShell` owns navigation and content frame.
- `PageHeader` owns page title, meta, and page-level controls.
- Page sections are regular content bands/cards, not marketing hero sections.
- Operational pages optimize for scanning, filtering, and repeated edits.

## Home `/`

```text
[KPI: spendable] [KPI: net worth] [KPI: income] [KPI: expense/savings]

[Cashflow chart]               [Signals]

[Data quality tasks]           [Recent transactions]
```

Main blocks:

- 기준일 and current-month spendable money
- net worth, income, expense, savings rate
- recent cashflow chart
- signal summary
- data quality work queue
- recent transactions

## Spending `/spending`

```text
[range controls: 3m / 6m / 12m / start / end / include income]

[category trend]

[category MoM]                 [transaction table]

[breakdown / fixed cost / merchants / calendar tabs]
```

Main blocks:

- month range controls
- income inclusion toggle
- monthly category trend
- category month-over-month list
- transaction table for selected range
- tabs for composition, fixed cost, merchant, calendar, income

## Net Worth `/net-worth`

```text
[compare mode control]

[KPI: net worth] [KPI: assets] [KPI: liabilities] [KPI: cash]

[net-worth history]            [asset composition]

[liquidity]

[loans]

[investments]                  [insurance]

[installment forecast]
```

Main blocks:

- latest vs previous snapshot comparison mode
- net worth, total assets, total liabilities, cash-equivalent assets
- net-worth history line area
- asset/liability composition
- liquidity health and emergency target progress
- loan cards with monthly payment and interest estimate provenance
- investment composition
- insurance summary or empty state
- installment forecast link

## Signals `/signals`

```text
[KPI: savings rate] [KPI: income volatility] [KPI: anomaly count] [KPI: discretionary velocity]

[signal feed filters]

[signal feed]

[income stability / recurring / purchase gate details]
```

Main blocks:

- closed-month savings rate
- income volatility
- anomaly count
- discretionary velocity with confidence/coverage
- feed filtered by anomaly, purchase gate, status
- recurring classification read surface
- action links into spending and data pages

## Data Inbox `/data/inbox`

```text
[queue cards]

[work list]
```

Main blocks:

- unclassified transactions
- recurring review queue
- loan mapping candidates
- purchase gate candidates
- links to focused data pages

## Transactions `/data/transactions`

```text
[view switch: rows / groups]

[filter panel]

[bulk bar]

[transaction table]

[edit detail panel]
```

Main blocks:

- row view and recurring group view
- filters for type, source, category, payment method, cost kind, necessity, recurring status, deleted/edited state
- table with editable rows
- bulk update/delete/restore with settings-driven preview/confirmation
- detail panel for category, memo, merchant, cost kind, necessity, recurring metadata

## Loans `/data/loans`

```text
[loan account list]

[repayment candidates]

[linking controls]
```

Main blocks:

- stable loan account metadata
- repayment candidate transactions
- current link state
- repayment type and memo
- single and bulk linking

## Installments `/data/installments`

```text
[installment plans]

[candidate transactions]

[monthly forecast]
```

Main blocks:

- installment plan creation/editing
- candidate transaction search
- observed/projected/missed schedule
- single and bulk installment links
- monthly remaining forecast

## Asset Metadata `/data/assets`

```text
[asset rows]

[loan metadata rows]
```

Main blocks:

- latest asset row liquidity tier
- cash-equivalent flag
- loan monthly payment
- repayment method
- source and assumptions

## Rules `/data/rules`

```text
[category classification]

[recurring category]

[merchant alias]

[loan merchant]

[dry run / apply]
```

Main blocks:

- fixed/variable and necessity category rules
- recurring category rules
- merchant alias normalization
- loan merchant linking rules
- upload-time auto-apply settings
- existing-data bulk apply

## Settings `/data/settings`

```text
[financial targets]

[analytics parameters]
  [purchase_gate]              [discretionary_velocity]
  [recurring_dry_run]          [asset_liability_health]
  [spending_anomalies]         [bulk_operations]
```

Main blocks:

- financial targets editor:
  - emergency fund target months
  - savings rate target
  - debt strategy preference
- analytics settings editor:
  - default/saved/effective helper text for each visible setting
  - editable `purchase_gate` values: large purchase threshold, minimum candidate amount, new merchant lookback, spike ratios, cooldown, risk threshold, enabled candidate types, excluded categories, excluded merchants
  - editable `discretionary_velocity` values: baseline months, velocity thresholds, classification coverage, baseline/outlier mode, excluded categories, excluded merchants
  - editable `recurring_dry_run` values: occurrence/month/day thresholds, interval bounds, confidence, default apply scope, upload auto-apply
  - editable `asset_liability_health` values: emergency-fund tiers, near-liquid secondary display, monthly payment lookback/observations, user confirmation requirement
  - read-only `spending_anomalies` values for anomaly threshold, delta amount, and baseline months
  - read-only `bulk_operations` values for preview, confirmation, undo, and maximum bulk row safeguards

## Import `/data/import`

```text
[upload form]

[recent upload logs]

[danger zone]
```

Main blocks:

- BankSalad `.xlsx` upload
- required snapshot date
- upload result and recent logs
- transaction reset
- transaction + snapshot reset

## Reference `/data/reference`

```text
[coverage]

[canonical view cards]

[schema reference]
```

Main blocks:

- API/schema reference
- canonical dashboard rows
- data coverage
- agent read surface reference

## Current Frontend Replacement Contract

- The merge result should use `frontend/src/features/**` pages and `frontend/src/ds/**` primitives.
- Legacy `frontend/src/components/**`, `frontend/src/pages/**`, and `frontend/src/navigation.ts` should not exist after merge.
- Legacy routes are compatibility redirects only.
- New UI work should not reintroduce legacy page/component directories.
