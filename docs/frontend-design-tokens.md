# Frontend Design Tokens

**Status:** Active  
**Theme:** Current dark analytics shell  
**Source files:** `frontend/src/index.css`, `frontend/tailwind.config.js`, `frontend/src/lib/chartTheme.ts`

## Scope

이 문서는 현재 프론트엔드 구현의 시각 토큰 source of truth다.
디자인 변경 없이 현재 화면을 유지하는 범위에서 아래 토큰만 사용한다.

- base CSS variable
- Tailwind semantic alias
- chart / inline-style token reference

과거 프론트엔드 설계·계획 문서는 `docs/archive/frontend/` 아래 historical record로 보존한다.

## Token Layers

1. `frontend/src/index.css`
- 실제 값이 정의되는 CSS variable layer
- dark theme 색상, 폰트, chart palette를 선언

2. `frontend/tailwind.config.js`
- CSS variable을 class name으로 노출하는 alias layer
- `bg-surface-card`, `text-text-secondary`, `border-border-faint` 같은 semantic class를 제공

3. `frontend/src/lib/chartTheme.ts`
- Recharts / inline SVG / inline style에서 쓰는 token reference layer
- `var(--chart-*)` 문자열과 tooltip/tick style preset을 제공

## Typography

### Font families

- `--font-heading`: `-apple-system, 'Pretendard', 'Segoe UI', system-ui, sans-serif`
- `--font-body`: `-apple-system, 'Pretendard', 'Segoe UI', system-ui, sans-serif`
- `--font-mono`: `'Source Code Pro', ui-monospace, SFMono-Regular, monospace`

### Type scale

Tailwind semantic font token:

| Token | Approx px @ `html=21px` | Primary usage |
| --- | --- | --- |
| `text-nano` | 8px | badge, dense tag |
| `text-micro` | 9px | table header, timestamp |
| `text-caption` | 10px | helper text, meta |
| `text-label` | 11px | section title, nav label |
| `text-body-sm` | 12px | compact body |
| `text-body-md` | 13px | shell chrome |
| `text-body` | 14px | primary body |
| `text-kpi` | 18px | KPI value |
| `text-display` | 24px | large title |

원칙:

- 임의 `text-[Npx]` 사용 금지
- 본문은 `text-body` 또는 `text-body-sm`
- dense table/meta는 `text-caption`, `text-micro`, `text-nano`

## Surface Tokens

| CSS var | Value | Tailwind alias | Usage |
| --- | --- | --- | --- |
| `--color-surface-base` | `#060810` | `bg-surface-base` | body canvas |
| `--color-surface-panel` | `#0b0f1a` | `bg-surface-panel` | app shell background |
| `--color-surface-card` | `#0f1623` | `bg-surface-card` | card body |
| `--color-surface-bar` | `#080b12` | `bg-surface-bar` | topbar, inline badge, muted row |
| `--color-surface-section` | `#0c1320` | `bg-surface-section` | accordion body |
| `--color-surface-input` | `#0a0d13` | `bg-surface-input` | dark text input surface |
| `--color-surface-tint` | `#0a1520` | `bg-surface-tint` | info callout base |
| `--color-surface-selected` | `#0a1a2a` | `bg-surface-selected` | selected table row |
| `--color-surface-edited` | `#08180e` | `bg-surface-edited` | edited row |
| `--color-surface-danger` | `#120a0a` | `bg-surface-danger` | danger accordion header |
| `--color-surface-danger-muted` | `#0c0808` | `bg-surface-danger-muted` | danger accordion body |
| `--color-surface-danger-strong` | `#1a0a0a` | `bg-surface-danger-strong` | active destructive selection |

## Border Tokens

| CSS var | Value | Tailwind alias | Usage |
| --- | --- | --- | --- |
| `--color-border-default` | `#1a2035` | `border-border` | default border |
| `--color-border-subtle` | `#111827` | `border-border-subtle` | card header divider |
| `--color-border-strong` | `#1f2937` | `border-border-strong` | input outline, inline panel |
| `--color-border-faint` | `#0d1117` | `border-border-faint` | dense table row divider |
| `--color-border-info` | `#1e3a5f` | `border-info-muted` | info selection panel |

## Accent / State Tokens

### Accent

| CSS var | Value | Tailwind alias |
| --- | --- | --- |
| `--color-accent-default` | `#10b981` | `text-accent`, `bg-accent` |
| `--color-accent-strong` | `#059669` | `bg-accent-strong` |
| `--color-accent-dim` | `#0d2b1e` | `bg-accent-dim` |
| `--color-accent-muted` | `#1a3b2e` | `border-accent-muted` |
| `--color-accent-bright` | `#6ee7b7` | `text-accent-bright` |

### Danger

| CSS var | Value | Tailwind alias |
| --- | --- | --- |
| `--color-danger-default` | `#f87171` | `text-danger`, `bg-danger` |
| `--color-danger-dim` | `#2d1a1a` | `bg-danger-dim` |
| `--color-danger-muted` | `#3b2020` | `text-danger-muted`, `border-danger-muted` |

### Warning

| CSS var | Value | Tailwind alias |
| --- | --- | --- |
| `--color-warn-default` | `#f59e0b` | `text-warn`, `bg-warn` |
| `--color-warn-dim` | `#2a1f0a` | `bg-warn-dim` |
| `--color-warn-muted` | `#3b2d10` | `border-warn-muted` |

### Info

| CSS var | Value | Tailwind alias |
| --- | --- | --- |
| `--color-info-default` | `#60a5fa` | `text-info-default` |
| `--color-info-bright` | `#a78bfa` | `text-info-bright` |
| `--color-info-dim` | `#0a1520` | `bg-info-dim` |
| `--color-info-soft` | `#1e40af` | `bg-info-soft`, chart ratio accent |
| `--color-info-muted` | `#1e3a5f` | `border-info-muted` |

## Text Tokens

| CSS var | Value | Tailwind alias |
| --- | --- | --- |
| `--color-text-primary` | `#d1d5db` | `text-text-primary` |
| `--color-text-secondary` | `#9ca3af` | `text-text-secondary` |
| `--color-text-muted` | `#6b7280` | `text-text-muted` |
| `--color-text-faint` | `#4b5563` | `text-text-faint` |
| `--color-text-ghost` | `#374151` | `text-text-ghost` |
| `--color-text-inverse` | `#ffffff` | `text-text-inverse` |

## Chart Tokens

### Core chart tokens

- `--chart-accent`
- `--chart-accent-muted`
- `--chart-accent-bright`
- `--chart-danger`
- `--chart-danger-muted`
- `--chart-neutral`
- `--chart-neutral-muted`
- `--chart-info`
- `--chart-info-soft`
- `--chart-warning`
- `--chart-tooltip-bg`
- `--chart-tooltip-border`
- `--chart-axis-text`
- `--chart-label-strong`
- `--chart-label-muted`

### Category palette

- `--chart-category-food`
- `--chart-category-transport`
- `--chart-category-subscription`
- `--chart-category-shopping`
- `--chart-category-housing`
- `--chart-category-medical`
- `--chart-category-insurance`
- `--chart-category-other`
- `--chart-category-fallback`

### Treemap palette

- `--chart-treemap-1` ... `--chart-treemap-8`

## Usage Rules

- raw hex를 component/page 내부에 직접 쓰지 않는다
- Recharts 색상은 `frontend/src/lib/chartTheme.ts`를 통해 참조한다
- page-specific 강조 배경도 가능한 한 `surface`, `info`, `danger`, `accent` semantic alias로 표현한다
- token 값 변경은 `index.css`에서만 수행한다
- `tailwind.config.js` 는 token alias만 노출하고 실색상 source of truth 역할을 하지 않는다

## Current Exceptions

아래는 허용되는 raw value다.

- CSS variable 값 정의 자체에 들어가는 hex
- chart opacity를 위한 `rgba(255, 255, 255, ...)` label token
- 브라우저 기본 black overlay (`bg-black/60`) 같은 non-brand utility
