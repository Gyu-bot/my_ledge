# Frontend Reimplementation Functional Requirements

**Status:** Active
**Intent:** 현재 `frontend-remake` 구현을 다시 만들거나 후속 정렬할 때 보존해야 하는 기능 기준

## Purpose

이 문서는 시각 스타일 자체가 아니라 현재 프론트엔드의 기능 표면을 고정한다.
구 `components/pages` 기반 구현은 이 PR에서 `ds/features/shell` 기반 구현으로 대체된다.

보존 대상:

- canonical route 구조와 legacy redirect
- shell navigation과 page header 구조
- 페이지별 정보 계층
- loading, empty, error 상태
- write access와 destructive confirmation 흐름
- API 의존성 형태

보존 대상이 아닌 것:

- 구 컴포넌트 파일 구조
- 구 `/analysis/*`, `/operations/*` canonical IA
- 과거 Recharts/chartTheme 기반 차트 구현

디자인 토큰 기준은 `docs/frontend-design-tokens.md`, 화면 구성 기준은 `docs/frontend/page-wireframes.md`를 본다.

## Current Live Routes

| Route | Role |
| --- | --- |
| `/` | 월 결산 (첫 화면, T058) |
| `/analysis` | 지출 분석 (T058) |
| `/net-worth` | 자산·부채 |
| `/data/inbox` | 데이터 인박스 |
| `/data/transactions` | 거래 작업대 |
| `/data/loans` | 대출 관리 |
| `/data/installments` | 할부 관리 |
| `/data/assets` | 자산 메타 |
| `/data/rules` | 규칙 |
| `/data/settings` | 설정 |
| `/data/import` | 가져오기 |
| `/data/reference` | 데이터 사전 |

### Legacy Redirects

| Route | Target |
| --- | --- |
| `/spending` | 탭에 따라: `?lens=trend\|fixed\|income` → `/`, 그 밖(`composition`, `merchants`, `calendar`, 탭 없음) → `/analysis` (`category` 유지) |
| `/signals` | `/analysis` |
| `/analysis/spending` | `/analysis` |
| `/analysis/assets` | `/net-worth` |
| `/analysis/insights` | `/analysis` |
| `/operations/workbench` | `/data/transactions` |
| `/operations/loan-mapping` | `/data/loans` |
| `/operations/installments` | `/data/installments` |
| `/operations/asset-settings` | `/data/assets` |
| `/operations/auto-classification` | `/data/rules` |
| `/operations/canonical-views` | `/data/reference` |
| `/operations/recurring-classification` | `/data/transactions?view=groups` |
| `/assets` | `/net-worth` |
| `/income` | `/` |
| `/transfers` | `/` |
| `/data` | `/data/inbox` |
| `*` | `/` |

## App Shell Requirements

- Shell은 `left nav + route content` 구조다.
- Main nav는 월 결산, 지출 분석, 자산·부채를 노출한다 (T058). 약정 현황·작업대 재편은 T059.
- Data studio nav는 인박스, 거래, 대출, 할부, 자산 메타, 규칙, 설정, 가져오기, 데이터 사전을 노출한다.
- Page title, meta, controls는 `PageHeader`에서 처리한다.
- Route mapping은 `frontend/src/router.tsx`, nav mapping은 `frontend/src/shell/navigation.ts`가 source of truth다.

## Shared Requirements

- 모든 page/section은 loading, empty, error 상태를 분리한다.
- 서버 상태는 TanStack Query hooks를 통해 읽는다.
- write 기능은 API key가 없으면 read-only 상태를 명확히 드러낸다.
- destructive/bulk 작업은 backend preview와 settings-driven confirmation을 따른다.
- dense table은 filtering, pagination, selection state를 안정적으로 유지한다.
- legacy URL은 새 canonical route로 redirect만 제공하고 새 화면을 따로 구현하지 않는다.

## Page Requirements

### Month Close (월 결산, T058)

- 첫 화면은 가장 최근 마감월의 월 흐름표다. 마감월을 고를 수 있다(`?month=`).
- 흐름표는 수입 − 약정 지급(대출 원리금·할부 회차·정기 지급) − 수시 지출(보호·조정 가능) − 미정 = 총지급, 잔여, 잔여의 행방(투자·저축 / 계좌 간 이동 / 목적 미정), 함께 보는 값(생활 지출, 보호, 조정 가능)을 보인다. 금액은 `/metrics/monthly-flow` 값 그대로다.
- 흐름표의 모든 금액에서 산식, 포함·제외, 해당 거래 목록이 같은 자리에서 열린다.
- 최근 12개월 추이는 자료 없는 달과 가져오기 전 달을 0원과 구분한다.
- 진행월 영역은 관측 누적과 월말 순현금흐름 전망을 다른 카드로 나눈다. 전망은 관측 부분, 남은 기간 가정, 월말 값(또는 보류와 이유), 남은 지출 가정의 미정 비중, 지난 마감월 되짚기 오차를 보인다. 신뢰도는 등급 이름만으로 보이지 않고 권고가 아님을 밝힌다.
- 진행월에는 비율과 지난달 전체 대비 증감을 내지 않는다. 월말 너머의 전망은 없다.

### Spending Analysis (지출 분석, T058)

- 대상 달은 마감월(기본: 가장 최근)이나 진행월(같은 경과일 비교)이다(`?period=`).
- 카테고리 → 거래처 분해는 카테고리를 유지한다. 같은 거래처라도 카테고리가 다르면 따로 센다. 조정 가능성(보호·조정 가능·미정)으로 거를 수 있다.
- 기준 대비 변화 기여를 금액 순으로 보이고 전체·보호·조정 가능만으로 나눠 볼 수 있다. 기준 기간, 자료 없는 달, 부분월 처리를 함께 밝힌다.
- 기존 할부 회차를 뺀 지출(`총지급 − 할부 회차`)과 지급 형태별 구성을 보인다.
- 사후 검토할 거래(`/read/review-items`)를 올라온 이유와 함께 보이고, 위험도·우선순위·신뢰도 점수는 보이지 않는다. 거래는 `/data/transactions?transaction_id=`로 연결한다.
- 분류를 제안하거나 자동으로 채우지 않는다.

### Common Data Status (T058)

- 월 결산과 지출 분석 머리에 거래 기준일, 종류별 스냅샷 기준일, 조정 가능성 미정 비중을 둔다(`/metrics/data-status`).

### Net Worth

- snapshot 비교 모드를 제공한다.
- 순자산, 총자산, 총부채, 현금성 자산 KPI를 보여준다.
- 순자산 추이, 자산 구성, 유동성 health, 대출, 투자, 보험, 할부 forecast를 제공한다.
- provenance가 필요한 추정값은 출처/가정을 확인할 수 있어야 한다.

### Data Inbox

- 미분류 거래, 반복 분류 승인, 대출 연결 후보, 구매 게이트 후보를 작업 queue로 보여준다.
- 각 queue는 focused data route로 연결한다.

### Transactions

- row view와 group view를 제공한다.
- type/source/category/payment method/cost kind/necessity/recurring/deleted/edited 필터를 제공한다.
- 거래 상세 편집과 bulk update/delete/restore를 제공한다.
- bulk delete/restore는 preview와 confirmation 정책을 따른다.

### Loans

- 대출 계좌 metadata와 상환 후보 거래를 함께 보여준다.
- 단건/다건 연결, 상환 성격, 연결 메모를 관리한다.

### Installments

- 할부 계획 생성/수정, 거래 후보 검색, 회차 연결을 제공한다.
- observed/projected/missed 회차와 월별 forecast를 구분한다.

### Asset Metadata

- 최신 자산 row의 liquidity tier와 cash equivalent flag를 편집한다.
- 대출 월상환액, 상환방식, source metadata를 보강한다.

### Rules

- category classification, recurring category, merchant alias, loan merchant rule을 관리한다.
- 기존 데이터 일괄 적용과 recurring dry-run approval 흐름을 제공한다.

### Settings

- financial targets를 편집한다.
- analytics settings의 default/saved/effective 구조를 확인한다.

### Import

- BankSalad `.xlsx` 업로드와 snapshot date 입력을 제공한다.
- 업로드 이력과 reset danger zone을 제공한다.

### Reference

- schema, canonical dashboard, coverage, agent read surface를 확인한다.

## API Dependency Shape

### Read APIs

- transactions list, filter options, recurring groups
- asset snapshots, net worth history, investments, loans, profile, liquidity
- analytics cashflow, category, recurring, anomaly, purchase gate, discretionary velocity
- settings defaults/saved/effective
- upload logs and schema/canonical reference
- runtime config from `window.__MY_LEDGE_RUNTIME_CONFIG__`, then `import.meta.env`

### Write APIs

- transaction update/delete/restore/bulk update
- bulk delete/restore preview and execute
- loan transaction link/unlink
- installment plan and link management
- asset metadata and loan metadata update
- rule create/update/delete/apply
- settings update
- upload and data reset

## Source Of Truth Hierarchy

프론트엔드 현재 기준 문서는 아래 순서를 따른다.

1. 실제 frontend source: `frontend/src/**`
2. route and page composition: `docs/frontend/page-wireframes.md`
3. component inventory: `docs/frontend/components-and-design-token-inventory.md`
4. token contract: `docs/frontend-design-tokens.md`
5. remake design package: `docs/frontend-remake/**`
6. this functional requirements file

`docs/archive/frontend/` 아래 문서는 historical record이며 현재 기준이 아니다.
