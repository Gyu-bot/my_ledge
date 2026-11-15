# Frontend Page Wireframes

**Status:** Active
**Scope:** Current `frontend-remake` routes only

## Route Map

### Canonical Routes

- `/` — 월 결산 (T058)
- `/analysis` — 지출 분석 (T058)
- `/net-worth`
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

- `/spending` (예전 지출 6탭) -> 탭(`lens`)에 따라: `trend`·`fixed`·`income` -> `/`, `composition`·`merchants`·`calendar`·탭 없음 -> `/analysis` (`category`가 있으면 `/analysis?category=…`로 넘긴다). 구현: `shell/LegacySpendingRedirect.tsx`
- `/signals` -> `/analysis`
- `/analysis/spending` -> `/analysis`
- `/analysis/assets` -> `/net-worth`
- `/analysis/insights` -> `/analysis`
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

## 공통: 자료 현황 띠와 금액 근거 패널 (T058)

모든 분석 화면(월 결산, 지출 분석)의 머리, `PageHeader` 바로 아래에 자료 현황 띠(`features/analysis/DataStatusStrip.tsx`, `/metrics/data-status`)를 둔다.

```text
[거래 기준일] [가장 최근 마감월] [진행월 · 부분 기록] [스냅샷 기준일: 자산 · 대출 · 투자 · 보험 · 프로필 (종류별, 합치지 않음)]
[조정 가능성 미정 비중: 보고 있는 달 x% · 전체 기간 y% · 분류하러 가기] [원화 외 n건 제외]
```

금액 근거 패널(`features/analysis/AmountDrilldown.tsx`)은 금액을 누르면 그 금액 바로 아래, 같은 자리에서 열린다(덮는 패널이 아니다).

```text
[이름 금액 · 달 · 마감월/진행월 배지 · n건]                       [닫기]
산식            정의 문장 + 이 달 값으로 쓴 식 (응답 값을 나란히 놓을 뿐 다시 계산하지 않음)
포함하는 것     유효 거래, 원화만, 거래일 귀속, 환불 처리, 원화 외 n건
빼는 것         이체·수입 등 그 금액에 들어가지 않는 것
기준 기간과 비교 최근 마감월 중앙값, 차이, 기준 기간, 자료 없는 달, 부분월 처리 (/metrics/comparison/monthly-flow)
구성과 거래     지출 큐브의 카테고리 × 거래처 칸(10칸 + 더 보기) → 칸을 누르면 그 칸의 원본 거래 목록
                (거래마다 "열기" → /data/transactions?transaction_id=…)
```

- 지출 금액의 구성은 `/metrics/spend-cube`를 그 줄의 조건(`flow_row`, `payment_form`, `adjustability`)으로 읽는다. 생활 지출은 흐름표 줄별로 보여 주고 대출 줄을 "빠짐"으로 표시한다. 잔여는 수입·총지급으로 옮겨 가는 버튼을 준다.
- 수입은 `/transactions?type=수입`, 이체 세 줄과 이체 순액은 `/transfer-purposes/transactions`에서 거래를 읽는다.
- `/transactions`에는 흐름표 줄(지급 형태·조정 가능성) 필터가 없다. 그래서 칸의 거래 목록은 "그 달 그 카테고리·거래처의 지출 거래 전체"이고, 그 칸이 흐름표 여러 줄에 걸치면 패널이 그 사실과 줄별 금액(지출 큐브 `group_by=flow_row`)을 함께 알린다.

## Month Close `/` (월 결산, 첫 화면)

```text
[PageHeader: 월 결산 | 마감월 선택]
[자료 현황 띠]

[선택한 마감월의 월 흐름표]            [진행월 지금까지 · 부분 기록]
  수입                                   관측 누적 (수입, 약정, 수시·보호,
  − 약정 지급 (대출 원리금/할부/정기)      수시·조정 가능, 미정, 총지급, 잔여)
  − 수시 지출 (보호/조정 가능)           [월말 순현금흐름 전망 · 추정]
  − 미정                                   ① 관측 (거래 기준일까지)
  = 총지급                                 ② 남은 기간의 가정 (시작일~월말,
  = 잔여                                      정기 수입, 대출·할부·정기·그 밖의 지출,
  잔여의 행방: 투자·저축 / 계좌 간 이동 /      남은 지출 가정의 미정 비중, 근거)
     목적 미정 / 이체 순액                 ③ 월말 값 또는 "전망 보류" + 보류 이유
  함께 보는 값: 생활 지출, 보호, 조정 가능   신뢰도 표시(권고 아님), 확인할 점, 한계
  현금 잔여율(마감월만), 미정 비중, 환불   지난 마감월 되짚기 오차 (기준일 구간별
                                             부호 오차 중앙값, 수입 대비, 비교·보류 횟수)
[최근 12개월: 수입·총지급·잔여 차트 + 표 (자료 없음 / 가져오기 전 구분, 마감월 행을 누르면 선택)]
```

- Sources: `/metrics/data-status`, `/metrics/monthly-flow`(전체 달), `/canonical-views/dashboard`의 `month_projection`(진행월 전망, 후속 경로 없음), `/canonical-views/month-projection/accuracy`.
- 선택한 마감월은 URL `?month=YYYY-MM`. 기본은 가장 최근 마감월. 진행월은 흐름표 대상으로 고를 수 없다.
- 진행월 영역은 관측 누적 카드와 전망 카드로 나뉜다. 전망 카드만 추정 색(`estimate`)을 쓰고, 관측 값을 가리거나 대체하지 않는다. 진행월에는 비율과 지난달 전체 대비 증감을 내지 않는다.
- 데스크톱(xl)은 왼쪽 흐름표·추이, 오른쪽 진행월. 모바일은 흐름표 → 진행월 → 추이 순서.

## Spending Analysis `/analysis` (지출 분석)

```text
[PageHeader: 지출 분석 | 대상 달 선택 (마감월 + 진행월 · 부분 기록)]
[자료 현황 띠]
[진행월이면: 같은 경과일 비교 안내]

[어디에 썼나]                          [무엇이 변했나]
  조정 가능성 거르기: 전체/보호/          보기: 전체 지출 / 보호만 / 조정 가능만
    조정 가능/미정                        이번 달 · 기준(중앙값) · 차이
  보기: 카테고리 → 거래처 /               비교 기준 (기준 기간, 자료 없는 달, 부분월)
    거래처 순 (카테고리 유지)             카테고리별 변화 기여 (금액 순) → 거래처별
  카테고리 → 거래처(10곳 + 더 보기)       해마다 한두 번 나가는 지출 (12개월 합계 비교)
    → 금액 근거 패널
[기존 할부 회차를 뺀 지출]              [다시 볼 만한 거래]
  총지급 − 할부 회차 = 값                 거래 / 카테고리·월, 올라온 이유(검출기 문장)
  지급 형태별 구성: 약정이 아닌 지출,      거래 화면에서 열기, 봤음으로 표시/14일 뒤 다시/넘기기
    대출 원리금, 정기 지급, 할부(빠짐)      (쓰기 키가 있을 때)
    → 금액 근거 패널
```

- Sources: `/metrics/spend-cube`, `/metrics/comparison/contributions`, `/metrics/monthly-flow`(대상 달), `/read/review-items`, `PATCH /analytics/purchase-gate-candidates/{key}/review`(검토 상태만).
- 대상 달은 URL `?period=YYYY-MM`, 처음 펼칠 카테고리는 `?category=`.
- 거래처는 언제나 카테고리 안에서 센다. 같은 거래처라도 카테고리가 다르면 다른 줄이다.
- "기존 할부 회차를 뺀 지출"은 읽기 색인(`/read/index`)이 적은 정의 그대로 `total_outflow − committed_installment_total`이고, 구성은 지출 큐브 `group_by=commitment_kind`다.
- 사후 검토 목록은 위험도·우선순위·신뢰도·점수를 싣지 않는다.

## Net Worth `/net-worth`

The selected investment source panel is distinct from BankSalad snapshot history and investment detail. It shows the selected holdings value, a separately labeled estimated net worth (or its unavailable reason), per-account configured/effective sources and basis dates, and mixed-date/transfer-risk warnings. A source switch never rewrites the historical chart.

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

Investment source settings provide BankSalad/Toss default selection and account-group overrides. Show the configured choice separately from effective fallback, account mapping conflicts, basis time, freshness and last sync attempt. Preview the impact before explicit save; editing the draft invalidates the preview. Without write access, the section remains readable. The interface explains that selecting Toss does not itself connect or synchronize a real account.

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
