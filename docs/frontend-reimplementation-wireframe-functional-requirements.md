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
| `/` | 홈 대시보드 |
| `/spending` | 지출 분석 |
| `/net-worth` | 자산·부채 |
| `/signals` | 신호 |
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
| `/analysis/spending` | `/spending` |
| `/analysis/assets` | `/net-worth` |
| `/analysis/insights` | `/signals` |
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
- Main nav는 홈, 지출, 자산·부채, 신호를 노출한다.
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

### Home

- 현재 기준일과 spendable money를 보여준다.
- 순자산, 수입, 지출, 저축률 KPI를 보여준다.
- 현금흐름, 주의 신호, 데이터 품질 작업, 최근 거래를 한 화면에서 스캔 가능하게 배치한다.

### Spending

- 월 범위 quick controls와 start/end select를 제공한다.
- 수입 포함 여부를 전환할 수 있다.
- 카테고리 추이, category MoM, breakdown, fixed cost, merchant, calendar, transaction table을 제공한다.
- 거래 편집은 `/data/transactions`로 연결한다.

### Net Worth

- snapshot 비교 모드를 제공한다.
- 순자산, 총자산, 총부채, 현금성 자산 KPI를 보여준다.
- 순자산 추이, 자산 구성, 유동성 health, 대출, 투자, 보험, 할부 forecast를 제공한다.
- provenance가 필요한 추정값은 출처/가정을 확인할 수 있어야 한다.

### Signals

- 저축률, 수입 변동성, 이상 지출, 재량 지출 속도 KPI를 보여준다.
- 신호 피드는 severity/status/type 기준으로 스캔 가능해야 한다.
- 반복 결제, 이상 지출, 구매 게이트 후보는 관련 data/spending route로 연결한다.

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
