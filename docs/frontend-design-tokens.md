# Frontend Design Tokens

**Status:** Active
**Theme:** Ledger DS dark analytics shell
**Source files:** `frontend/src/index.css`, `frontend/tailwind.config.js`, `frontend/src/ds/**`

## Scope

이 문서는 `frontend-remake` 이후 현재 프론트엔드의 시각 토큰 source of truth다.
구 `frontend/src/components/**`, `frontend/src/pages/**`, `frontend/src/lib/chartTheme.ts` 기반 프론트는 이 PR에서 삭제되며 current surface가 아니다.

현재 구현은 아래 계층을 사용한다.

- CSS variable: `--ds-*`
- Tailwind semantic alias: `bg-*`, `text-*`, `border-*`, semantic color group
- DS primitive: `frontend/src/ds/**`
- Feature page: `frontend/src/features/**`
- Shell: `frontend/src/shell/**`

## Token Layers

1. `frontend/src/index.css`
   - 실제 CSS variable 값이 정의되는 layer
   - dark 기본값과 `[data-theme='light']` 오버라이드를 포함한다

2. `frontend/tailwind.config.js`
   - CSS variable을 Tailwind alias로 노출하는 layer
   - 실색상 source of truth가 아니라 alias map이다

3. `frontend/src/ds/**`
   - 카드, 버튼, 필드, 표, 차트 primitive가 token을 실제 UI에 적용하는 layer
   - chart primitive도 `var(--ds-chart-*)`를 직접 사용한다

## Typography

### Font Families

- `--ds-font-sans`: `Pretendard Variable`, `Pretendard`, `-apple-system`, `Segoe UI`, `system-ui`, `sans-serif`
- `--ds-font-mono`: `JetBrains Mono`, `ui-monospace`, `SFMono-Regular`, `monospace`

### Type Scale

| Token | Size | Primary usage |
| --- | ---: | --- |
| `text-display` | 32px / 38px | page-level large metric or display value |
| `text-kpi` | 24px / 30px | KPI value |
| `text-title` | 18px / 26px | page title, prominent section title |
| `text-section` | 15px / 22px | card title |
| `text-body` | 14px / 22px | primary body |
| `text-label` | 13px / 18px | nav label, field label, dense row title |
| `text-caption` | 12px / 16px | meta, helper text, badges |
| `text-micro` | 11px / 14px | table header, tiny utility text |

Rules:

- Do not scale font size with viewport width.
- Do not use negative letter spacing.
- Avoid arbitrary `text-[Npx]` unless a DS primitive explicitly needs it.
- Dense operational surfaces should prefer `text-label`, `text-caption`, and `text-micro`.

## Surface Tokens

| CSS var | Tailwind alias | Usage |
| --- | --- | --- |
| `--ds-bg-base` | `bg-bg-base` | body canvas |
| `--ds-bg-surface` | `bg-bg-surface` | shell and page bands |
| `--ds-bg-raised` | `bg-bg-raised` | raised card/dialog surface |
| `--ds-bg-inset` | `bg-bg-inset` | filter panels, nested rows, chart wells |
| `--ds-bg-selected` | `bg-bg-selected` | selected table row, selected list item |

## Border Tokens

| CSS var | Tailwind alias | Usage |
| --- | --- | --- |
| `--ds-border-subtle` | `border-border-subtle` | low-emphasis divider |
| `--ds-border-default` | `border-border` | default control/card border |
| `--ds-border-strong` | `border-border-strong` | focused or high-emphasis boundary |

## Text Tokens

| CSS var | Tailwind alias | Usage |
| --- | --- | --- |
| `--ds-text-primary` | `text-text-primary` | primary values and titles |
| `--ds-text-secondary` | `text-text-secondary` | secondary labels and row text |
| `--ds-text-muted` | `text-text-muted` | helper/meta text |
| `--ds-text-faint` | `text-text-faint` | tertiary and low-emphasis annotations |

## Semantic Tokens

| Meaning | Foreground | Background | Border |
| --- | --- | --- | --- |
| Accent | `text-accent` | `bg-accent-bg` | `border-accent-border` |
| Income | `text-income` | `bg-income-bg` | `border-income-border` |
| Expense | `text-expense` | `bg-expense-bg` | `border-expense-border` |
| Transfer | `text-transfer` | `bg-transfer-bg` | `border-transfer-border` |
| Warning | `text-warn` | `bg-warn-bg` | `border-warn-border` |
| Estimate | `text-estimate` | `bg-estimate-bg` | `border-estimate-border` |

`estimate` is reserved for estimated or inferred financial values. Do not reuse it as a generic purple accent.

## Chart Tokens

Chart primitives use CSS variables from `index.css`.

- Grid and axis: `--ds-chart-grid`, `--ds-chart-axis`
- Core series: `--ds-chart-income`, `--ds-chart-expense`, `--ds-chart-net`
- Category palette: `--ds-chart-1` ... `--ds-chart-11`, `--ds-chart-other`
- Component-local defaults:
  - `CashflowChart`: income/expense/net tokens
  - `StackedBars`: category palette tokens
  - `LineArea`: accent foreground/background
  - `HBarList`: caller color or accent foreground
  - `Treemap`: category palette tokens
  - `CalendarHeat`: expense/accent tones

## Usage Rules

- Component/page code should not hardcode raw hex values.
- Token value changes belong in `frontend/src/index.css`.
- Tailwind config should only expose aliases.
- Shared visual behavior belongs in `frontend/src/ds/**`, not feature pages.
- Use `format.ts` helpers for money, percent, dates, and em dash display.

## Documentation Cross Reference

- Current route composition: `docs/frontend/page-wireframes.md`
- Current component surface: `docs/frontend/components-and-design-token-inventory.md`
- Original remake design package: `docs/frontend-remake/**`
