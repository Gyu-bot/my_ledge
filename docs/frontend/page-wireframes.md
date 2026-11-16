# Frontend Page Wireframes

**Status:** Active
**Scope:** Current `frontend-remake` routes only

## Route Map

### Canonical Routes

- `/` — 월 결산 (T058)
- `/analysis` — 지출 분석 (T058)
- `/commitments` — 약정 현황 (T059)
- `/net-worth`
- `/data/inbox` — 작업대 · 분류 (T059: 분류 큐 + 대출 연결 후보)
- `/data/transactions`
- `/data/nature` — 작업대 · 기본값·정기 지급 (T059)
- `/data/status` — 작업대 · 자료 현황 (T059)
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
- `/operations/recurring-classification` -> `/data/nature?tab=recurring` (T059: 거래마다 반복 여부를 묻지 않고 정기 지급 묶음으로 등록)
- `/data/transactions?view=groups` (예전 반복 결제 그룹 보기) -> `/data/nature?tab=recurring`
- `/assets` -> `/net-worth`
- `/income` -> `/`
- `/transfers` -> `/`
- `/data` -> `/data/inbox`
- `*` -> `/`

## Global Shell

```text
+---------------------------------------------------------------+
| left nav: 분석 + 작업대      | page header + controls          |
+---------------------------------------------------------------+
|                              | route content                   |
|                              | cards, filters, tables, charts  |
+---------------------------------------------------------------+
```

Shell rules:

- `AppShell` owns navigation and content frame. 분석 메뉴: 월 결산, 지출 분석, 약정 현황, 자산·부채. 작업대 메뉴: 분류, 거래, 기본값·정기 지급, 대출, 할부, 자산 메타, 규칙, 자료 현황, 가져오기, 설정, 데이터 사전 (모바일 하단 탭의 "작업대"는 `/data/inbox`).
- 뒤로 가기로 돌아오면 그 기록 항목에서 보던 스크롤 위치(데스크톱은 창, 모바일은 본문)를 되살리고, 다른 화면으로 새로 갈 때는 맨 위에서 시작한다. 같은 화면에서 필터만 바뀌는 주소 교체(replace)는 위치를 그대로 둔다.
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
                (거래마다 "고치기" → 이 화면 위에 거래 고치기 패널이 열린다. 화면을 떠나지 않는다)
```

- 지출 금액의 구성은 `/metrics/spend-cube`를 그 줄의 조건(`flow_row`, `payment_form`, `adjustability`)으로 읽는다. 생활 지출은 흐름표 줄별로 보여 주고 대출 줄을 "빠짐"으로 표시한다. 잔여는 수입·총지급으로 옮겨 가는 버튼을 준다.
- 수입은 `/transactions?type=수입&flow_row=income_undetermined`, 이체 세 줄과 이체 순액은 `/transfer-purposes/transactions`에서 거래를 읽는다.
- T059부터 칸의 거래 목록은 금액과 같은 흐름표 줄 조건으로 거른다: `/transactions?type=지출&category_major=…&search=거래처&start_date…&end_date…`에 그 금액의 `flow_row`·`payment_form`·`adjustability`(`commitment_kind`는 `flow_row=committed_*`로)를 더하고, 거래처 이름이 정확히 같은 거래만 남긴다. 목록 위에 "아래 n건의 합계가 이 금액과 같습니다"를 보이고, 다르면(환불 일부만 이 줄에 들어간 경우, 다른 카테고리로 기록된 환불이 이 구매에 연결된 경우) 차이와 이유를 쓴다. 200건이 넘으면 같은 조건의 거래 화면 링크를 준다.

## 공통: 거래 고치기 패널 (T059)

`features/transactions/TransactionEditor.tsx` (`DetailPanel` 위). 금액 근거 패널, 사후 검토 목록, 약정 현황, 분류 큐, 거래 화면에서 같은 패널을 연다.

```text
[거래처 · 날짜 시각 · 금액 · 카테고리]                                   [닫기]
결제수단 · 원본 설명 · 유형 · 출처(가져오기/직접 추가 → 고친 적 있음)
분석용 거래처 [입력]       (열리면 여기로 초점)
대분류 [선택]  소분류 [선택]
(지출) 조정 가능성: ( ) 이 거래에서 따로 정하지 않음 — 적용되는 값: 정기 지급/카테고리 기본값/미정
                    ( ) 보호   ( ) 조정 가능          지급 형태·지금 값·근거 표시. 대출·할부 연결이면 보호 고정
(이체) 이체 목적 [따로 정하지 않음 / 투자 / 저축 / 그 밖의 계좌 간 이동]
메모 [입력]
[지우기(거래 화면에서만)]                                         [닫기] [저장]
```

- 저장: 거래처·카테고리·메모는 `PATCH /transactions/{id}`, 조정 가능성은 `PUT|DELETE /nature/transactions/{id}/adjustability`, 이체 목적은 `PUT|DELETE /transfer-purposes/transactions/{id}`. 바뀐 것만 보낸다. 예전 고정/변동·필수/재량·반복 입력은 없다(2.2).
- 키보드: 열리면 첫 입력에 초점, Enter(입력칸)·Ctrl/⌘+Enter로 저장, Esc로 닫기, Tab은 패널 안에서만 돈다. 닫히면 연 버튼으로 초점이 돌아간다. 분석 화면에서는 화면을 떠나지 않으므로 고른 달, 열어 둔 근거 패널, 스크롤 위치가 그대로다.

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

## Commitments `/commitments` (약정 현황, T059)

```text
[PageHeader: 약정 현황 · 관측을 볼 달(마감월·진행월)]
[자료 현황 띠]
[안내: 기록된 속성이며 전망이 아님 · "관측 안 됨"은 연결된 거래가 기록에 없다는 뜻]
[이 달 관측된 약정 지급 (월 흐름표 약정 지급과 같은 거래)] [기록된 월 부담 합계 (진행 중 약정)]
[기록이 덜 된 약정 안내 → 기본값·정기 지급]
[약정 목록: 종류 거르기 · 관측 상태 거르기(건수) · 끝난 약정도 보기]
  [종류 배지 · 이름 · (끝남)                     대출/할부 화면에서 열기 | 정기 지급 고치기]
  월 부담 + 근거 | 주기 | 남은 회차·종료 시점 | 조정 가능성
  [달 · 관측 상태 배지(아이콘+말) · 이유 · 관측 금액·건수 · 연결된/연결 미확인 거래 n건 보기]
```

- 자료: `GET /read/commitments?period=` (대출·할부·정기 지급 묶음 한 목록). 주소 `?period=&kind=&state=&ended=1`로 조건이 남는다.
- 관측 상태 표기: 관측됨 / 주기상 있어야 하는데 관측 안 됨 / 거래는 있으나 연결 미확인 / 이 달에는 예정 없음 / 판단할 기록 없음. "미납"이라는 말을 쓰지 않는다. 색만이 아니라 아이콘과 말로 구분한다.
- 연결 미확인·연결된 거래는 그 자리에서 펼치고(`GET /transactions/{id}`), 거래마다 거래 고치기 패널을 연다. 연결 미확인 할부 거래는 할부 화면(`/data/installments?linked=unlinked`)으로 가서 사람이 연결한다.
- 대출·할부 화면은 그대로 두고 링크로 잇는다. 정기 지급은 `/data/nature?tab=recurring&edit={id}`로 간다.

## Classification `/data/inbox` (작업대 · 분류, T059)

```text
[PageHeader: 작업대 · 분류 · 조정 가능성 미정 비중]
[탭: 분류할 지출 | 대출 연결 후보 n]
[분류할 지출: 묶는 방법(카테고리·거래처별 | 카테고리별) · 기간(모든 기간 | 최근 12개월)]
  미정 지출 합계 · 묶음 수 · 전체 지출 대비 비중
  1. 거래처 [카테고리/소분류]  미정 금액 · n건 · 미정 금액의 x%           [거래 보기]
     카테고리 '…' 전체의 기본값: [보호] [조정 가능]
     이 거래처의 미정 거래 n건만: [보호] [조정 가능]   정기 지급으로 등록
     (펼치면) 미정 거래 50건까지: 날짜 · 거래처 · 금액 · [보호] [조정 가능] [고치기]
  [쪽 넘기기: 25묶음씩]
```

- 큐: `GET /metrics/spend-cube?adjustability=undecided&group_by=effective_category_major,effective_category_minor,merchant&limit=2000` (카테고리별이면 `group_by=effective_category_major`). 금액(미정 순지출)이 큰 묶음부터. 조정 가능성이 미정인 지출만 오르고, 반복 여부만 빈 거래와 예전 반복 제안(승인 대기)은 오르지 않는다. 시스템이 값을 제안하거나 미리 고르지 않는다.
- 카테고리 기본값 버튼: `PUT /nature/category-defaults` (대분류 전체, `category_minor=null`). 지난 거래와 앞으로 가져올 거래에 적용되고, 거래·정기 지급 단위 값이 먼저다. 알림의 "되돌리기"는 만든 기본값을 지운다.
- 거래처 버튼: 그 묶음(같은 대분류·소분류·거래처, 고른 기간)의 지금 미정인 거래를 `/transactions?type=지출&adjustability=undecided&category_major=…&search=…`로 모두 모아 거래마다 `PUT /nature/transactions/{id}/adjustability` (한꺼번에 쓰는 API가 없어 6개씩 동시에). 진행 건수를 보이고, 알림의 "되돌리기"는 쓴 거래의 거래 단위 값을 지운다. 새로 가져올 거래에는 적용되지 않는다고 밝힌다(거래처 단위 기본값 API가 없다).
- "정기 지급으로 등록"은 묶음의 대분류·소분류·거래처만 채워 `/data/nature?tab=recurring&new=1…`로 보낸다.
- 대출 연결 후보 탭: 예전 인박스의 대출 연결 카드(`/loan-transaction-links?linked=unlinked`).
- 주소 `?view=&range=&page=&tab=`로 조건이 남는다.

## Nature Settings `/data/nature` (작업대 · 기본값·정기 지급, T059)

```text
[탭: 카테고리 기본값 | 정기 지급 묶음]
[카테고리 기본값: 찾기 · 보호/조정 가능 뜻]
  대분류  미정 ₩…          [정하지 않음(미정) | 보호 | 조정 가능]
    소분류 n개 · 따로 정한 것 n개 ▸ (펼치면) 소분류 [대분류 값 따름(…) | 보호 | 조정 가능]
  지금 거래에 없는 카테고리에 남은 기본값 [지우기]
[정기 지급 묶음: 새 정기 지급 등록 · 진행 중/끝난 것/모두 · 찾기]
  이름 [거래처 단위|카테고리 단위] [예전 분류에서 옮김]   [고치기] [끝내기] [지우기]
  카테고리 · 주기 · 금액 · 조정 가능성 / 기간 · 속한 거래 n건(처음~마지막)
  (등록·고치기 폼) 이름 · 묶는 기준 · 거래처 · 대분류 · 소분류(소분류까지 같은 거래만 묶임) · 주기 · 전체 횟수 · 금액 · 조정 가능성 · 시작일 · 종료일 · 메모
```

- 기본값: `GET|PUT /nature/category-defaults`, `DELETE /nature/category-defaults/{id}`(선택을 "정하지 않음"으로 돌릴 때, 알림에서 되돌리기). 카테고리 목록은 `/transactions/filter-options`, 미정 금액은 지출 큐브. 카테고리 이름은 바꾸지 않는다.
- 묶음: `GET|POST /nature/recurring-commitments`, `PATCH …/{id}`, `POST …/{id}/end`(마지막 날), `DELETE …/{id}`(확인 문구 "지우기"). 끝남 여부는 오늘이 아니라 거래 기준일로 본다. 등록 폼의 값은 비어서 시작한다(분류 큐에서 넘어온 거래처·카테고리만 채움). 주소 `?tab=recurring&new=1&merchant=&category_major=&category_minor=`, `&edit={id}`.

## Data Status `/data/status` (작업대 · 자료 현황, T059)

```text
[상태 안내: 정상이 아니면 이유 (달 목록은 3개까지, 많으면 n개월)]
[거래 자료: 첫 거래일 · 거래 기준일 · 가져온 달 · 마감월/진행월]
[스냅샷 기준일(종류별, 거래 기준일과의 차이)] [최근 가져오기(파일·상태·새 거래·스냅샷 기준일)]
[분류 상태: 미정 지출 · 미분류 지출 · 할부 연결 미확인 · 주기 없는 정기 지급 · 조정 가능성 없는 정기 지급 — 남은 것은 고칠 곳 링크]
[원화 외 n건 제외]
[달별 상태 표: 달 · 마감월/진행월/거래 0건 · 거래 수 · 총지급 · 미정 비중, 거래 0건인 달 안내]
```

- 자료: `GET /read/data-status`, `GET /upload/logs`. 업로드 상태는 쉬운 말(반영됨, 일부만 반영, 실패, 처리 중, 되돌림)로 보인다.

## Transactions `/data/transactions`

```text
[조회 조건 (주소에 남음)]

[transaction table: 날짜 · 거래처(버튼) · 카테고리 · 유형 · 상태 · 금액]

[bulk bar]

[거래 고치기 패널]
```

Main blocks:

- 조회 조건: 찾기, 유형, 출처, 대분류, 결제수단, 지급 형태(약정/수시), 조정 가능성(보호/조정 가능/미정), 월 흐름표 줄, 기간, 삭제 포함, 고친 것만. 적용하면 주소(`?search=&type=&…&flow_row=&payment_form=&adjustability=&page=`)에 남아, 다른 화면에 다녀와도 같은 조건과 쪽으로 돌아온다. 지급 형태·조정 가능성·흐름표 줄로 거르면 분석에 들어가는 원화 거래만 나온다.
- 거래처 버튼(Tab으로 가서 Enter)이나 행을 누르면 거래 고치기 패널. `?transaction_id=`로 목록 밖의 거래도 연다.
- 일괄: 거래처, 대분류(`PATCH /transactions/bulk-update`), 조정 가능성(지출만, 거래마다 nature API), 삭제·복원(설정에 따른 미리보기·확인).
- 예전 반복 결제 그룹 보기와 거래마다 묻던 고정/변동·필수/재량·반복 입력은 없다(`?view=groups`는 정기 지급 묶음으로 간다).

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

[recent upload logs (되돌리기 버튼 없음)]

---- 위험한 작업 (닫힌 채 시작, "위험한 작업 열기") ----
[가장 최근 업로드 되돌리기]  [자료 초기화: 범위 선택 · 초기화 실행]
```

Main blocks:

- BankSalad `.xlsx` upload
- required snapshot date
- upload result and recent logs (상태는 쉬운 말)
- 위험한 작업(T059): 평소 업로드 흐름과 떼어 점선 아래 닫힌 칸에 둔다. 열어야 되돌리기·초기화 버튼이 보인다. 되돌리기는 확인 문구, 반영 뒤 바뀐 표가 있으면 두 번째 확인 문구를 거친다. 초기화는 범위를 고르고 확인 문구를 입력해야 실행된다. 쓰기 권한이 없으면 잠긴다.

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
