# Frontend Design Tokens

**Status:** Active  
**Scope:** my_ledge frontend implementation single source of truth  
**Replaces:** legacy `docs/DESIGN.md` (removed)

## Purpose

이 문서는 my_ledge frontend 구현 시 사용해야 하는 디자인 토큰과 적용 원칙을 정의한다.

다음 작업은 이 문서를 기준으로 진행한다.

- CSS 변수 정의
- Tailwind theme 확장
- shadcn/ui primitive 스타일 정렬
- 페이지/컴포넌트 시각 스타일 구현

구현 시 더 이상 `docs/DESIGN.md`를 참조하지 않는다.

## Design Principles

- 개인 재무 도메인에 맞는 차분하고 신뢰감 있는 분석 UI를 유지한다.
- 데이터 밀도는 높게 유지하되, CRM/kanban 같은 운영 툴 분위기로 기울지 않는다.
- 상태 의미는 재무 맥락에 맞춰 정의한다.
- `positive`, `warning`, `danger`, `info`는 재무 상태와 시스템 상태에 일관되게 사용한다.
- 모바일에서는 네비게이션 깊이보다 읽기 우선 순서를 더 중요하게 다룬다.

## Token Strategy

이 토큰 시스템은 기존 `PipelinePro`에서 아래만 선별 차용했다.

- 4px base spacing scale
- radius scale
- card / input / button 밀도 규칙
- shadow hierarchy의 기본 구조

아래는 차용하지 않았다.

- pipeline / stage / kanban 전제
- won / at-risk / lost 상태 체계
- CRM 도메인 문구와 색 의미

## Color Tokens

### Brand / Surface

- `--color-canvas`: `#F8FAFC`
- `--color-surface`: `#FFFFFF`
- `--color-surface-raised`: `#FFFFFF`
- `--color-surface-muted`: `#F1F5F9`
- `--color-border`: `#E2E8F0`
- `--color-border-strong`: `#CBD5E1`

### Primary / Accent

- `--color-primary`: `#2563EB`
- `--color-primary-strong`: `#1D4ED8`
- `--color-primary-soft`: `#BFDBFE`
- `--color-secondary`: `#D97706`
- `--color-secondary-strong`: `#B45309`
- `--color-secondary-soft`: `#FFEDD5`
- `--color-accent`: `#0F766E`
- `--color-accent-strong`: `#115E59`
- `--color-accent-soft`: `#CCFBF1`

### Text

- `--color-text`: `#0F172A`
- `--color-text-muted`: `#475569`
- `--color-text-subtle`: `#64748B`
- `--color-text-inverse`: `#FFFFFF`

### State

- `--color-positive`: `#16A34A`
- `--color-positive-soft`: `#DCFCE7`
- `--color-warning`: `#D97706`
- `--color-warning-soft`: `#FEF3C7`
- `--color-danger`: `#DC2626`
- `--color-danger-soft`: `#FEE2E2`
- `--color-info`: `#7C3AED`
- `--color-info-soft`: `#EDE9FE`

### Interaction

- `--color-ring`: `#2563EB`
- `--color-selection`: `rgba(37, 99, 235, 0.18)`

## Color Usage Rules

- `primary`는 주요 네비게이션 활성 상태, 핵심 CTA, 선택 상태에 사용한다.
- `secondary`는 차트의 대비 시리즈, 보조 CTA, 비교 축 강조에 사용한다.
- `accent`는 보조 강조, 추세 비교, 보조 KPI에 사용한다.
- `positive`는 순증가, 목표 달성, 정상 상태에 사용한다.
- `warning`은 주의가 필요한 소비 패턴, 업로드 partial, 분류 미완료 상태에 사용한다.
- `danger`는 삭제, reset, 실패 상태에 사용한다.
- `orange`나 `red`를 urgency 전용으로 광범위하게 남용하지 않는다.

## Typography Tokens

### Font Families

- `--font-heading`: `"Outfit", "Inter", ui-sans-serif, system-ui, sans-serif`
- `--font-body`: `"Inter", ui-sans-serif, system-ui, sans-serif`
- `--font-mono`: `"Source Code Pro", ui-monospace, SFMono-Regular, monospace`

### Type Scale

- `--text-display`: `3.25rem` / `1.1` / `700`
- `--text-headline`: `2.25rem` / `1.2` / `700`
- `--text-subhead`: `1.5rem` / `1.3` / `600`
- `--text-body-lg`: `1.125rem` / `1.6` / `400`
- `--text-body`: `0.9375rem` / `1.6` / `400`
- `--text-body-sm`: `0.875rem` / `1.5` / `400`
- `--text-caption`: `0.75rem` / `1.4` / `500`
- `--text-overline`: `0.6875rem` / `1.2` / `700`
- `--text-code`: `0.875rem` / `1.5` / `400`

## Spacing Tokens

- base unit: `4px`
- scale: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`

추천 매핑:

- component small padding: `8px`
- component medium padding: `12px`
- component large padding: `16px`
- section gap mobile: `24px`
- section gap tablet: `40px`
- section gap desktop: `56px`

## Radius Tokens

- `--radius-xs`: `4px`
- `--radius-sm`: `8px`
- `--radius`: `12px`
- `--radius-lg`: `16px`
- `--radius-xl`: `20px`
- `--radius-full`: `9999px`

사용 규칙:

- 입력, 버튼, 작은 카드: `--radius-sm`
- 기본 카드, 아코디언, 테이블 래퍼: `--radius`
- 강조 패널, empty state: `--radius-lg`
- pill badge, segmented control indicator: `--radius-full`

## Shadow Tokens

- `--shadow-soft`: `0 1px 2px rgba(15, 23, 42, 0.06)`
- `--shadow-medium`: `0 4px 10px rgba(15, 23, 42, 0.08)`
- `--shadow-large`: `0 12px 24px rgba(15, 23, 42, 0.12)`
- `--shadow-overlay`: `0 20px 40px rgba(15, 23, 42, 0.18)`

사용 규칙:

- 기본 카드는 border 중심, shadow는 약하게 사용한다.
- hover elevation은 필요한 카드에만 제한적으로 쓴다.
- 대시보드 전체를 shadow-heavy하게 만들지 않는다.

## Component Mapping

### Buttons

- Primary: `primary` fill + inverse text
- Secondary: transparent + primary border/text
- Ghost: transparent + muted text
- Destructive: `danger` fill + inverse text
- 기본 높이:
  - small: `32px`
  - medium: `38px`
  - large: `46px`

### Inputs

- background: `surface`
- border: `border`
- focus ring: `ring`
- error border/text: `danger`
- disabled background: `surface-muted`

### Cards

- background: `surface`
- border: `border`
- default radius: `--radius`
- default shadow: none 또는 `--shadow-soft`

### Tabs / Segmented Controls

- 섹션 전환 탭은 `primary` 활성 상태를 사용한다.
- inactive는 surface + border 기반으로 유지한다.
- 모바일에서는 가로 스크롤 가능한 탭 행을 허용한다.

### Accordion

- 운영 섹션의 `업로드`, `최근 업로드 이력`, `Danger Zone`은 accordion 표면을 사용한다.
- destructive accordion은 `danger-soft` background와 `danger` text를 사용한다.

### Tables

- dense but readable
- 행 높이는 `44px` 이상 유지한다.
- hover background는 `surface-muted`
- selected row 또는 bulk selection state는 `info-soft` 계열을 사용한다.

## CSS Variable Mapping

`frontend/src/index.css` 에 최소 아래 변수를 유지한다.

```css
:root {
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  --color-canvas: #F8FAFC;
  --color-surface: #FFFFFF;
  --color-surface-raised: #FFFFFF;
  --color-surface-muted: #F1F5F9;
  --color-border: #E2E8F0;
  --color-border-strong: #CBD5E1;

  --color-primary: #2563EB;
  --color-primary-strong: #1D4ED8;
  --color-primary-soft: #BFDBFE;
  --color-secondary: #D97706;
  --color-secondary-strong: #B45309;
  --color-secondary-soft: #FFEDD5;
  --color-accent: #0F766E;
  --color-accent-strong: #115E59;
  --color-accent-soft: #CCFBF1;

  --color-text: #0F172A;
  --color-text-muted: #475569;
  --color-text-subtle: #64748B;
  --color-text-inverse: #FFFFFF;

  --color-positive: #16A34A;
  --color-positive-soft: #DCFCE7;
  --color-warning: #D97706;
  --color-warning-soft: #FEF3C7;
  --color-danger: #DC2626;
  --color-danger-soft: #FEE2E2;
  --color-info: #7C3AED;
  --color-info-soft: #EDE9FE;

  --color-ring: #2563EB;
  --color-selection: rgba(37, 99, 235, 0.18);

  --shadow-soft: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-medium: 0 4px 10px rgba(15, 23, 42, 0.08);
  --shadow-large: 0 12px 24px rgba(15, 23, 42, 0.12);
  --shadow-overlay: 0 20px 40px rgba(15, 23, 42, 0.18);
}
```

## Tailwind / Implementation Rules

- Tailwind utility를 쓰더라도 색/반경/shadow 값은 literal보다 CSS 변수로 우선 연결한다.
- 새 컴포넌트는 가능하면 `text-[color:var(--...)]`, `bg-[color:var(--...)]`, `rounded-[var(--...)]` 패턴을 유지한다.
- active / hover / selected 상태는 토큰 조합으로 표현하고, 하드코딩 hex 사용은 피한다.
- 차트 색상 팔레트는 단일 hue 계열만 쓰지 않고 `primary`, `secondary`, `accent`, `info`, `danger`, `muted` 축을 함께 사용한다.
- bar chart는 pill 형태를 피하고 거의 직각에 가까운 낮은 radius를 기본값으로 사용한다.

## Frontend Implementation Requirement

frontend 재설계 및 이후 UI 구현은 아래 문서를 함께 기준으로 삼는다.

- `docs/frontend-design-tokens.md`
- `docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md`

새 UI 구현에서 더 이상 삭제된 `docs/DESIGN.md`를 참조하지 않는다.
