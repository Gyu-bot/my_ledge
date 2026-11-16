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
| `/commitments` | 약정 현황 (T059) |
| `/net-worth` | 재무상태 (스냅샷 순자산과 구성, 구간별 순자산 대조, 비상금 개월 수, T061) |
| `/data/inbox` | 작업대 · 분류 (분류 큐, 대출 연결 후보, T059) |
| `/data/transactions` | 작업대 · 거래 |
| `/data/nature` | 작업대 · 기본값·정기 지급 (T059) |
| `/data/transfers` | 작업대 · 이체 목적 (T061) |
| `/data/status` | 작업대 · 자료 현황 (T059) |
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
| `/operations/recurring-classification` | `/data/nature?tab=recurring` (T059) |
| `/data/transactions?view=groups` | `/data/nature?tab=recurring` (T059) |
| `/assets` | `/net-worth` |
| `/income` | `/` |
| `/transfers` | `/` |
| `/data` | `/data/inbox` |
| `*` | `/` |

## App Shell Requirements

- Shell은 `left nav + route content` 구조다.
- Main nav는 월 결산, 지출 분석, 약정 현황, 재무상태를 노출한다 (T058, T059, T061).
- 작업대 nav(예전 데이터 메뉴)는 분류, 거래, 기본값·정기 지급, 이체 목적(T061), 대출, 할부, 자산 메타, 규칙, 자료 현황, 가져오기, 설정, 데이터 사전을 노출한다 (T059).
- 뒤로 가기로 돌아오면 보던 스크롤 위치를 되살린다 (T059).
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
- 흐름표의 모든 금액에서 산식, 포함·제외, 해당 거래 목록이 같은 자리에서 열린다. 거래 목록은 금액과 같은 흐름표 줄 조건(`/transactions`의 `flow_row`·`payment_form`·`adjustability`)으로 거르고 목록 합계가 금액과 같은지 밝힌다 (T059).
- 최근 12개월 추이는 자료 없는 달과 가져오기 전 달을 0원과 구분한다.
- 진행월 영역은 관측 누적과 월말 순현금흐름 전망을 다른 카드로 나눈다. 전망은 관측 부분, 남은 기간 가정, 월말 값(또는 보류와 이유), 남은 지출 가정의 미정 비중, 지난 마감월 되짚기 오차를 보인다. 신뢰도는 등급 이름만으로 보이지 않고 권고가 아님을 밝힌다.
- 진행월에는 비율과 지난달 전체 대비 증감을 내지 않는다. 월말 너머의 전망은 없다.

### Spending Analysis (지출 분석, T058)

- 대상 달은 마감월(기본: 가장 최근)이나 진행월(같은 경과일 비교)이다(`?period=`).
- 카테고리 → 거래처 분해는 카테고리를 유지한다. 같은 거래처라도 카테고리가 다르면 따로 센다. 조정 가능성(보호·조정 가능·미정)으로 거를 수 있다.
- 기준 대비 변화 기여를 금액 순으로 보이고 전체·보호·조정 가능만으로 나눠 볼 수 있다. 기준 기간, 자료 없는 달, 부분월 처리를 함께 밝힌다.
- 기존 할부 회차를 뺀 지출(`총지급 − 할부 회차`)과 지급 형태별 구성을 보인다.
- 사후 검토할 거래(`/read/review-items`)를 올라온 이유와 함께 보이고, 위험도·우선순위·신뢰도 점수는 보이지 않는다. 거래는 그 자리에서 거래 고치기 패널로 연다 (T059).
- 분류를 제안하거나 자동으로 채우지 않는다.

### Common Data Status (T058)

- 월 결산, 지출 분석, 재무상태 머리에 거래 기준일, 종류별 스냅샷 기준일, 조정 가능성 미정 비중을 둔다(`/metrics/data-status`).

### Net Worth (재무상태, T061)

- snapshot 비교 모드를 제공한다.
- 순자산, 총자산, 총부채, 현금성 자산 KPI를 보여준다. 스냅샷 날짜는 종류(자산·대출·투자·보험·프로필)마다 따로 보인다.
- 순자산 대조: 이어지는 자산 스냅샷 쌍 하나(기본 최근 쌍, 주소 `?start=&end=`)에 대해 순자산 변동 = 잔여(수입 − 총지급) + 대출 잔액 감소 + 투자 평가 변동 + 설명되지 않는 차이를 응답 값 그대로 줄로 보인다. 설명되지 않는 차이는 자기 줄이며 추정으로 채우지 않는다.
- 구간 규칙(시작 스냅샷 다음 날 ~ 끝 스냅샷일)과 구간 상태(대조 완료 / 분류가 덜 됨 / 거래가 구간을 덮지 않음 / 스냅샷 날짜가 맞지 않음 / 스냅샷 쌍 없음)를 이유와 함께 쉬운 말로 보인다. 종류별 짝(두 날짜 모두 있음 / 스냅샷 없음 / 날짜가 맞지 않음)을 표로 보인다.
- API가 보류한(`null`) 값은 "계산 보류"와 이유로 보이고 화면에서 대신 계산하지 않는다.
- 잔여와 그 부분(수입, 총지급, 이체 세 줄)은 금액 근거 패널로 구간의 거래를 연다.
- 이체 목적 미정 비중과, 그 구간을 기간 필터로 넘기는 이체 목적 화면 링크를 둔다.
- 구간 목록(날짜 쌍, 상태, 순자산 변동, 설명되지 않는 차이, 이체 미정 비중)으로 구간을 옮겨 다닌다.
- 비상금 개월 수 = 현금성 자산 ÷ 월 보호 지급(`/metrics/net-worth/emergency-fund`)과 기준 기간, 미정 비중을 보이고, 기록된 비율이며 조언이 아님을 밝힌다. 예전 `liquidity-health` 값은 쓰지 않는다.
- 순자산 추이, 자산 구성, 유동성 등급별 자산(자산 메타 편집 링크), 대출(스냅샷 잔액), 투자, 보험 스냅샷을 보인다. 실시간 잔액, 시세, 이자·원금 추정, 할부 미래 예정은 두지 않는다(약정 현황 링크).

### Transfer Purpose (작업대 · 이체 목적, T061)

- 이체를 금액 큰 순으로 지금 목적과 그 출처(이 거래에서 정함 / 거래처 규칙 / 카테고리 규칙 / 정하지 않음)와 함께 보인다. 필터는 목적 미정만, 기간(주소 `?start=&end=&undecided=1`).
- 한 이체의 목적을 투자 / 저축 / 그 밖의 계좌 간 이동으로 정하거나 거래 단위 값을 지운다. 아무것도 추정하거나 미리 고르지 않는다.
- 거래처·카테고리 단위 목적 규칙을 만들고 고치고 지운다(지우기는 확인 문구). 규칙마다 지금 그 규칙으로 정해진 이체 건수를 보인다.
- 사람이 한 이체에 정한 목적을 확인 뒤 같은 거래처 규칙으로 넓힐 수 있다(같은 거래처 규칙이 있으면 그 규칙을 바꾼다).
- 목적 미정 건수와 이체 금액 중 미정 비중을 보인다. 재무상태에서 왔으면 그 구간으로 돌아가는 링크를 둔다.
- 쓰기 권한이 없으면 읽기 전용으로 보인다.

### Shared Transaction Editor (T059)

- 분석 화면·약정 현황·분류 큐·거래 화면에서 같은 거래 고치기 패널을 연다. 분석 화면에서는 화면을 떠나지 않으므로 고른 달·필터·열어 둔 근거 패널·위치가 그대로다.
- 거래처·카테고리·메모, 지출의 조정 가능성(거래 단위 값 또는 따로 정하지 않음 — 적용되는 값과 근거 표시), 이체의 목적을 고친다. 예전 고정/변동·필수/재량·반복 입력은 없다.
- 키보드만으로 열고(Enter), 저장하고(Enter·Ctrl+Enter), 닫는다(Esc). 초점은 패널 안에서 돌고 닫히면 연 버튼으로 돌아간다.

### Commitments (약정 현황, T059)

- 대출·할부·정기 지급 묶음을 한 목록으로(`/read/commitments`): 월 부담과 근거, 주기, 남은 회차와 종료 시점, 조정 가능성.
- 고른 달의 관측 상태: 관측됨 / 주기상 있어야 하는데 관측 안 됨 / 거래는 있으나 연결 미확인 / 이 달에는 예정 없음 / 판단할 기록 없음. "미납"이라는 말을 쓰지 않고, 전망이 아니라 기록된 속성임을 밝힌다.
- 연결 미확인·연결된 거래를 펼쳐 고치거나 할부 화면으로 간다. 대출·할부 편집은 기존 화면에 링크로 잇는다.

### Classification (작업대 · 분류, T059)

- 조정 가능성이 미정인 지출을 지출 큐브에서 금액 영향이 큰 묶음(카테고리·소분류·거래처 또는 카테고리)부터 보인다. 반복 여부만 빈 거래와 반복 분류 제안은 큐에 없다.
- 한 번의 조작으로 카테고리 전체 기본값(`/nature/category-defaults`)을 주거나, 그 거래처의 지금 미정인 거래에 거래 단위 값을 준다. 둘 다 되돌리기를 제공한다. 시스템은 값을 제안하거나 미리 고르지 않는다.
- 묶음을 정기 지급으로 등록하러 갈 수 있다(거래처·카테고리만 채움). 대출 연결 후보는 따로 된 탭.

### Nature Settings (기본값·정기 지급, T059)

- 카테고리·소분류의 조정 가능성 기본값을 편집하고 지운다.
- 정기 지급 묶음을 등록·고치기·끝내기(마지막 날)·지우기(확인 문구) 한다. 후보를 자동으로 등록하지 않는다.

### Data Status (자료 현황, T059)

- 무엇을 가져왔는지(최근 가져오기), 거래 기준일과 종류별 스냅샷 기준일, 거래 0건인 달, 달별 상태, 분류 상태(미정·미분류·할부 연결 미확인·주기/조정 가능성 없는 정기 지급)와 고칠 곳을 보인다(`/read/data-status`).

### Transactions

- 조회 조건(유형, 출처, 대분류, 결제수단, 지급 형태, 조정 가능성, 월 흐름표 줄, 기간, 삭제 포함, 고친 것만)을 주소에 남긴다.
- 거래 고치기 패널과 bulk update(거래처·대분류·조정 가능성)/delete/restore를 제공한다. 예전 그룹 보기는 정기 지급 묶음으로 바뀌었다.
- bulk delete/restore는 preview와 confirmation 정책을 따른다.

### Loans

- 대출 계좌 metadata와 상환 후보 거래를 함께 보여준다.
- 단건/다건 연결, 상환 성격, 연결 메모를 관리한다.

### Installments

- 할부 계획 생성/수정, 거래 후보 검색, 회차 연결을 제공한다.
- observed/projected/missed 회차와 월별 forecast를 구분한다.

### Asset Metadata

- 최신 자산 row의 liquidity tier와 cash equivalent flag를 편집한다. 재무상태의 비상금 개월 수와 유동성 등급별 자산 카드가 이 화면으로 링크한다.
- 대출 월상환액, 상환방식, source metadata를 보강한다.

### Rules

- category classification, recurring category, merchant alias, loan merchant rule을 관리한다.
- 기존 데이터 일괄 적용과 recurring dry-run approval 흐름을 제공한다.

### Settings

- financial targets를 편집한다.
- 투자 데이터 소스 아래에 선택 소스 기준 현재 자산(참고값, 스냅샷 아님)을 보인다 (T061에 재무상태에서 옮김).
- analytics settings의 default/saved/effective 구조를 확인한다.

### Import

- BankSalad `.xlsx` 업로드와 snapshot date 입력을 제공한다.
- 업로드 이력을 쉬운 상태 말로 보인다.
- 되돌리기와 초기화는 업로드 흐름과 떨어진, 닫힌 채 시작하는 "위험한 작업" 칸에만 있고 확인 문구를 거친다 (T059).

### Reference

- schema, canonical dashboard, coverage, agent read surface를 확인한다.

## API Dependency Shape

### Read APIs

- transactions list (T059 줄 필터 `flow_row`, `payment_form`, `adjustability`), filter options
- read surface `/read/commitments`, `/read/data-status`; nature axes `/nature/*`; transfer purpose per transaction
- asset snapshots, net worth history, investments, loans, profile
- net worth reconciliation `/metrics/net-worth/intervals`, `/metrics/net-worth/reconciliation`, `/metrics/net-worth/emergency-fund`; transfer purposes `/transfer-purposes/transactions`, `/transfer-purposes/rules` (T061)
- analytics cashflow, category, recurring, anomaly, purchase gate, discretionary velocity
- settings defaults/saved/effective
- upload logs and schema/canonical reference
- runtime config from `window.__MY_LEDGE_RUNTIME_CONFIG__`, then `import.meta.env`

### Write APIs

- transaction update/delete/restore/bulk update
- category adjustability defaults, recurring commitment bundles, transaction-level adjustability, transaction transfer purpose (T059)
- transfer purpose rules create/update/delete (T061)
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

### T062 — 연간성 지출 참고와 한도 대비

기존 월 결산·지출 분석에 동일한 참고 카드를 추가하고 설정에서 한도 이력을 관리한다. 자료가 완전한 12개월에서 양수 순지출 월이 1~2개인 대분류(T057)의 12개월 합계/월 환산을 별도 참고로 표시하며 총지급에는 더하지 않는다. 한도 대비는 완전한 마감월의 SQL 실적에만 내고 진행월·부분월·자료 없음·미설정은 사유로 표시한다. 카테고리와 조정 가능성은 겹치는 보기다. 한도 단위·대상·금액·시작월은 직접 입력하고 미분류도 명시적으로 지정한다. 변경/해제는 새 적용 시작월 버전을 추가하며 이전 이력은 유지한다. 초과/미만은 문장으로 구분하고 오류·읽기 전용을 처리한다.
