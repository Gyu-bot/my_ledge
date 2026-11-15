# 월말 순현금흐름 전망 점검 (T064 점검 단계)

작성: 2026-11-15
범위: `Implentation-plan.md` 2.6과 `T064`의 점검 단계. 알고리즘은 바꾸지 않았다.
기준 코드: `feat/t064-forecast-audit` 브랜치의 `c6602de`(T054·T055·T057 위). 아래 `파일:줄`은 이 커밋 기준이다. 다른 작업이 같은 파일을 고치면 줄 번호가 밀릴 수 있다.

이 문서는 공개 저장소에 있다. 개인 금융 값, 실제 거래처·카테고리 이름은 쓰지 않는다. 예시는 모두 합성 값이다.

## 0. 요약

- 전망은 하나다: `get_monthly_projection` (`backend/app/services/monthly_projection_service.py:725`). 대시보드 응답의 `month_projection`으로만 나간다.
- 구성은 "관측(그 달 1일 ~ 기준일)"과 "남은 기간의 가정" 두 부분이다. 가정은 정기 수입 하나와 지출 넷(대출, 할부, 반복 지출, 변동·미분류)으로 나뉜다.
- 지출 가정 중 하나라도 계산할 수 없으면 월말 값 전체가 `null`이 된다. 수입 쪽 문제는 값을 지우지 않고 신뢰도만 낮춘다.
- 코드를 읽어 찾은 결함과 위험은 16건이다(5절). 그중 11건은 이번에 추가한 합성 시나리오로 재현했고(7절), 2건(F-C5, F-O2)은 기존 테스트가 동작을 덮으며, 3건(F-P1, F-R2, F-V1)은 코드 판독과 요구사항 대비로만 정리했다. F-V1은 실제 자료로 크기를 재야 하는 위험이다. 가장 영향이 큰 것은 **연결되지 않은 대출 상환의 이중 반영(F-C1)**, **지출 기록과 상관없이 스냅샷 월상환액을 더하는 대출 구성요소(F-C4)**, **월말 급여가 한 번 다음 달 1일로 넘어가면 정기 수입이 석 달간 빠지는 문제(F-I1)**, **연 1회 지출 미반영(F-E1)** 이다.
- 대부분의 결함은 지출을 과대 전망해 월말 순현금흐름을 낮게(비관적으로) 만든다. 반대 방향은 연 1회 지출(F-E1), 이름이 바뀐 급여 입금처(F-I2), 변동 지출의 중앙값 사용(F-V1)이다.
- 실제 자료의 오차는 아직 재지 않았다. 측정 도구(6절)를 만들었고, 실제 자료 실행은 사용자 쪽에서 한다.
- 점검 단계에서는 수정하지 않았다. 8절의 수정 제안 R1–R12는 두 차례로 나눠 승인됐고, 1차(R3, R9, R10)를 적용했다(8.1절). 1–7절의 `파일:줄`과 "현재" 설명은 점검 기준 커밋의 동작이며, 1차에서 바뀐 곳은 해당 항목에 "1차 수정"으로 적었다.

## 1. 전망이 나오는 곳

| 단계 | 위치 | 내용 |
|---|---|---|
| HTTP | `backend/app/api/v1/endpoints/canonical_views.py:22`, `:40` | `GET /api/v1/canonical-views/dashboard`. `reference_date`는 선택 쿼리 값이다. |
| 기준일 결정 | `backend/app/services/canonical_views_dashboard_service.py:211` | `reference_date`가 없으면 **오늘 날짜**를 쓴다. 화면은 이 값을 넘기지 않는다(`frontend/src/features/home/HomePage.tsx:201`, `:213`). |
| 전망 호출 | `canonical_views_dashboard_service.py:315`, `:379` | `get_monthly_projection(reference_date=기준일)` 결과를 `month_projection`에 싣는다. |
| 응답 형식 | `backend/app/schemas/income_projection.py:104` (`MonthlyProjection`), `:93` (`ExpenseProjectionComponent`), `:58` (`IncomeProjectionSource`), `:76` (`RecurringExpenseProjectionSource`), `:48` (`ProjectionCoverage`) | |
| 수입 예상 설정 | `backend/app/services/income_expectations_service.py:10`, `GET/PATCH /settings/income-expectations` | 입금처별 금액·입금일·중단 여부. 이력 없이 현재 값만 있다. |

관련하지만 이 점검의 대상이 아닌 표면: `GET /installments/forecast`(`backend/app/services/installment_service.py:301`)는 할부 일정표를 여러 달 앞까지 보여 준다. 월말 순현금흐름 전망과 계산을 공유하지 않는다. 그 `missed` 상태는 `T059`에서 관측 여부 표시로 바뀔 예정이다.

## 2. 공통 입력과 규칙

### 2.1 읽는 기록과 기간

`monthly_projection_service.py:725-780`

| 입력 | 읽는 범위 | 근거 |
|---|---|---|
| 거래 | `vw_metric_transactions` 중 원화, 날짜가 `[기준월 1일 − 6개월, 기준일]` | `:729`, `:732-738` |
| 업로드 기록 | 성공한 업로드 중 `snapshot_date ≤ 기준일`의 최신 1건. 표시(`coverage.latest_upload_date`)에만 쓴다 | `:740-748` |
| 수입 예상 설정 | 현재 값 전부 | `:750` |
| 대출 | `snapshot_date ≤ 기준일`인 가장 최근 스냅샷 날짜의 대출 행 전부, 대출 계좌(`loan_accounts`)와 기관·상품명으로 연결 | `:752-769` |
| 할부 계획 | 현재 상태가 `active`인 계획 전부. 날짜 조건 없음 | `:770-776` |
| 할부 연결 | 전부 | `:777` |
| 관측 수입·지출 | `vw_metric_flow_lines`에서 그 달 1일 ~ 기준일. 월 흐름표의 `income_total`, `total_outflow`와 같은 정의 | `:781-799` |

거래의 유효 기준(삭제·병합·대체 제외, 원화만)은 지표 뷰와 같다. 전망의 내부 계산은 뷰가 아니라 `vw_metric_transactions`의 원래 금액(환불은 양수 지출 행)을 거래 단위로 읽는다.

### 2.2 "충분히 관측된 달" 판정

`covered_periods` (`:106-130`), `_coverage` (`:133-149`)

- 기준월 직전 6개월 각각에 대해, 어떤 종류든 거래가 있는 날짜가 8일 이상이고, 첫 거래가 7일 이전, 마지막 거래가 말일 6일 전 이후, 거래일 사이 공백이 10일 이하이면 "충분히 관측된 달"이다.
- 모든 기준선(수입, 반복 지출, 변동 지출)은 이 달들만 쓴다. 3개월 미만이면 변동 지출을 계산할 수 없어 월말 값이 `null`이 된다(`:671-685`).
- 이 판정은 거래 활동으로 짐작한 것이며, 모든 계좌가 수집됐음을 보장하지 않는다(응답 `coverage.basis`).

### 2.3 "이미 관측된 날"

`observed_day` (`:528-533`): 기준월 안에서 **마지막 거래가 있는 날**(종류 무관). 기준월에 거래가 없으면 0. 남은 기간은 이 날의 다음 날부터 말일까지다. 기준일이나 업로드 날짜가 아니다(F-O1).

1차 수정(R10): 기준월 안의 마지막 거래일과 기준일 이하 최신 업로드 날짜(`coverage.latest_upload_date`, 기준월 안일 때만) 중 늦은 날을 쓴다(`_covered_day`). 남은 기간 시작일은 응답의 새 필드 `remaining_period_start`로 나간다(한 달이 다 덮였으면 `null`). 변동 기준선, 반복 지출의 남은 날짜, 지난 예정일 할부 판정이 모두 이 날을 쓴다. 7일 보류 규칙은 그대로 마지막 거래일 기준이다.

### 2.4 보류 규칙

- 지출 구성요소 하나에 `missing_reasons`가 생기면 그 구성요소의 `expected_remaining`이 `null`이 되고(`:709`), 그러면 `expected_remaining_expense`, `projected_month_expense`, `projected_month_end_net`이 모두 `null`이다(`:822-838`).
- 마지막 관측 거래가 기준일보다 7일 넘게 오래되면 지출 쪽을 보류한다(`:814-821`). 수입 쪽 값은 그대로 나간다.
- 수입 쪽의 확인 필요 상태(`uncertain`, `late`, `partial`, `stopped`)는 사유만 더하고 값을 지우지 않는다(`:809-813`).
- `null`과 별개로 `known_expected_remaining_expense`(계산된 구성요소만 더한 값)와 `net_after_known_remaining_expense`는 항상 숫자다(`:832-834`, `:849-851`).

### 2.5 응답의 가정·신뢰도 필드

| 필드 | 뜻 |
|---|---|
| `confidence` | `unavailable`(월말 값 없음), `low`(사유나 경고가 하나라도 있음), `medium`(그 밖). `high`는 수입 설정에서 사용자가 중단한 경우의 출처 단위에만 나온다(`:857-861`). |
| `included_periods`, `excluded_periods`, `coverage.*` | 2.2의 판정 결과. |
| `missing_reasons`, `warnings` | 고정 문구. 반복 지출 관련 문구 앞에는 거래처 이름이 붙는다(`:664-665`, `:699-705`). |
| `limitations` | 고정 문구 4개(`:866-871`). |
| `income_sources[]` | 출처별 예상액, 관측액, 남은 액, 예상일·범위, 상태, 신뢰도, 근거 달, 제외 달, 대조한 거래 id, 사유. |
| `expense_components[]` | 구성요소별 남은 액, 알려진 남은 액, 근거 문구(`basis`), 사유, 신뢰도, 반복 지출의 거래처별 근거. |

조정 가능성 미정 비중이나 지난 달들로 잰 오차는 응답에 없다(F-R1, F-R2).

## 3. 구성요소별 산식

표기: `M` = 기준월, `d` = `observed_day`, `P` = 충분히 관측된 직전 달들(최대 6개).

### 3.1 예상 정기 수입

`_income_sources` (`:194-367`), `_stable_history` (`:152-191`)

- **대상 거래**: 종류 `수입`, 금액 > 0, 일회성 단어(보너스, 상여, 성과급, 보험금, 환급, 중고, 정산 등; `:41-51`)가 카테고리나 원문에 없을 것, 그리고 (유효 카테고리에 급여 단어(`급여`, `월급`, `근로` 등; `:52`)가 있거나 수입 예상 설정에 등록된 입금처) (`:205-210`). 입금처 단위로 묶는다. 묶는 키는 정규화한 `merchant` 문자열이다(`:81-82`).
- **기준액**: `P`의 달별 합계 중 양수인 달이 3개 이상이고, 그 중앙값의 ±30% 안에 드는 달이 3개 이상이면 그 달들 합계의 중앙값(`:174-191`). 달 안에서 그 달 최대 입금의 중앙값 × 10% 미만인 소액은 뺀다(`:160-169`). 사용자 설정이 있으면 설정 금액이 우선한다(`:225`).
- **예상일**: 기준액에 쓴 달마다 마지막 입금일이 모두 말일 4일 이내면 말일, 아니면 그 날짜들의 중앙값(`:229-243`). 예상 범위는 첫 입금일 − 4일 ~ 예상일 + 4일(`:245-255`).
- **이미 관측된 것**: 이번 달 같은 입금처의 입금 중 기준액의 10% 이상인 것을 합친다(`:256-261`). 남은 액 = max(기준액 − 관측액, 0) (`:262`). 관측액이 기준액의 80% 이상이면 `received`로 보고 0을 더한다(`:327-336`). 0보다 크고 80% 미만이면 `partial`로 차액을 더한다(`:324-326`, `:337-339`).
- **0을 더하는 경우**(남은 액을 0으로 바꿈):
  - 기준액을 못 구함 → `uncertain`/`unavailable` (`:286-288`)
  - 사용자 중단 → `stopped` (`:289-291`)
  - `P`의 가장 최근 달에 이 입금처 입금이 없고 이번 달도 없음 → `stopped`/`low` (`:292-294`)
  - 가장 최근 달이 기준액에 쓰이지 않았고 그 달 정기 범위 입금 합계가 70% 미만 → `uncertain` (`:295-303`)
  - 기준액에 쓰인 달이 `P`의 75% 미만이고 직전 세 달이 모두 쓰이지는 않음 → `uncertain` "불연속" (`:304-313`)
  - 입금일 편차가 8일 초과이고 말일 급여가 아님 → `uncertain` (`:314-323`)
- **늦어진 입금**: 예상 범위가 지났는데도 아직 `expected`/`partial`이면 `late`로 바꾸지만 **남은 액은 그대로 더한다**(`:340-347`).
- **새 입금처 급여(1차 수정, R9)**: 이번 달에 조회 창 안 이전 입금이 없고 설정에도 없는 입금처의 급여 분류 입금이 있고, 그 합이 기존 출처 예상액의 10% 이상이며, 기존 출처가 이번 달 아직 받은 것이 없는 `expected`/`late`이면, 기존 출처를 `uncertain`/`low`, 남은 액 0으로 두고 사유를 "입금처 이름이 바뀐 같은 급여일 수 있음"으로 바꾼다. 응답 `missing_reasons`에 입금처 이름 변경 확인 사유가 더해진다. 수입 쪽 사유이므로 월말 값은 지우지 않는다(2.4). 새 입금처를 수입 예상 설정에 등록하면 별도 수입으로 본다.
- **월 수입 전망** = 이번 달 관측 수입 전체(일회성·이자 포함) + 출처별 남은 액 합(`:800`, `:835`).
- **가정·신뢰도 필드**: 출처마다 `history_periods`(근거 달), `excluded_periods`, `status`, `confidence`, `reason`. 출처가 없으면 사유 "정기 수입을 식별할 … 없음"(`:805-808`).

계획 점검 (a) "급여일 전에도 정기 수입을 반영하는가": **반영한다.** 단, 위 0을 더하는 조건에 걸리지 않고 급여 카테고리이거나 설정에 등록된 입금처일 때만이다. 걸리는 대표 사례는 F-I1, F-I3이다.

### 3.2 대출 상환

`_expense_components` (`:546-547`, `:573-587`)

- **대상**: 기준일 이전 최신 스냅샷의 대출 중 잔액이 0 이하가 아닌 것(잔액이 비어 있으면 포함).
- **산식**: 대출마다 max(round(월상환액) − 이번 달 그 대출 계좌에 **연결된** 상환 합, 0)을 더한다.
- **이미 관측된 것**: 대출 연결(`loan_transaction_links`)이 있는 이번 달 거래만 뺀다. 연결이 없으면 관측된 상환도 빼지 않는다(F-C1).
- **보류**: 월상환액이 비어 있는 대출이 있으면(`:584-585`), 또는 이번 달에 카테고리에 `대출`이 들어간 미연결 지출이 있으면(`:561-571`) 대출 구성요소가 `null` → 월말 값 `null`.
- **상환일**: 쓰지 않는다. 기준일이 상환일 전이든 후든 같은 식이다(`basis` 문구도 "상환일 정보는 없음").
- **월상환액의 출처**: 스냅샷 원본 값이거나, 연결 거래로 추정해 최신 스냅샷 행에 써 넣은 값이다(`backend/app/services/loan_mapping_service.py:365`, `:1180`, `:1204`). 추정치는 연결을 바꿀 때 최신 스냅샷에만 기록된다.
- **지출 기록과의 관계**: 대출 구성요소는 이 장부에 상환이 지출로 기록되는지 보지 않는다. 상환이 `이체`로 기록되거나 아예 다른 계좌에서 나가 장부에 없으면, 실제 월 흐름표의 지출에는 없는 금액을 더한다(F-C4).
- **과거 상환 기록**: 연결된 과거 상환은 변동 기준선에서 빠진다. 연결되지 않은 과거 상환은 변동 기준선에 남는다(F-C1).
- **가정·신뢰도 필드**: `basis`에 스냅샷 날짜. 출처별 근거는 없다.

### 3.3 할부 회차

`_plan_matches` (`:370-381`), `_expense_components` (`:548-555`, `:588-643`)

- **대상**: 현재 `active`인 계획 중 기준월이 첫 납부월 ~ 마지막 회차 월 안에 있는 것(`:590-597`). 기준월의 회차 번호 = 첫 납부월부터의 달 수 + 1, 예정일 = 첫 납부일을 그만큼 민 날.
- **이미 관측된 것**: 그 계획의 **바로 그 회차 번호**로 연결된 거래(조회 창 안)가 있으면 그것을 쓴다(`:600-607`). 1차 수정(R3) 뒤에는 먼저 그 계획에 연결된 거래 중 **날짜가 이번 달인 것**을 쓰고, 그 연결의 회차 번호가 계산과 다르면 할부 구성요소 `warnings`에 계획 이름을 붙인 경고만 더한다(신뢰도 `low`, 값은 유지). 이번 달 날짜의 연결이 없을 때만 계산한 회차 번호의 연결(조회 창 안 아무 달)을 쓴다. 없으면 연결되지 않은 이번 달 거래 중 금액이 정확히 같고, 정규화한 거래처가 같고, 결제수단이 같으며(계획에 있으면), 예정일 ±7일인 것이 정확히 한 건이면 그것을 쓴다(읽기 전용 대조, `:613-632`). 둘 이상이면 보류.
- **산식**: 관측이 있으면 max(월 금액 − 관측 합, 0). 관측이 없고 예정일이 `d` 이전이면 보류("예정일이 지난 미연결 할부", `:638-641`). 그 밖에는 월 금액 전체(`:642-643`).
- **분할 규칙**: 할부 연결이 있거나 어느 활성 계획과 정확히 일치하는 거래, 또는 `recurring_payment_kind = installment`인 거래는 할부 몫으로 분리되어 변동 기준선에서 빠진다(`:548-555`). 연결도 정확한 일치도 없는 할부 결제는 변동 기준선에 남는다(F-C2).
- **종료월**: 마지막 회차 월까지 더하고, 그 다음 달부터는 더하지 않는다. 연결되었거나 정확히 일치하는 과거 결제는 종료 뒤에도 변동 기준선에 들어가지 않는다(테스트 `test_linked_installment_after_final_month_is_not_assumed`).
- **가정·신뢰도 필드**: `basis` 고정 문구. 계획별 근거는 없다.

### 3.4 반복 지출

`_expense_components` (`:539-544`, `:556-557`, `:645-668`), `_recurring_source` (`:384-515`)

- **대상 거래처**: 조회 창 안의 지출 중 한 건이라도 `cost_kind = fixed` 또는 `recurring_payment_kind = monthly_recurring`인 거래처. 그 거래처의 **모든** 지출(대출·할부 몫 제외)이 반복 지출 몫이 된다(`:539-544`). 행 단위가 아니라 거래처 단위다.
- **기준액**: 거래처의 `P` 달별 결제 합(환불 제외)으로 3.1과 같은 ±30% 안정 판정(`:399-402`).
- **활성 판정**: 직전 달이 기준액에 쓰였으면 활성(`:403-404`). 직전 달이 충분히 관측되지 않았고 마지막 관측 달은 쓰였으면 낮은 신뢰도로 활성(`:405-422`). 그 밖에는 이번 달 결제가 있고 그 거래처에 `monthly_recurring` 표시가 있을 때만 낮은 신뢰도로 쓴다(`:423-449`). 둘 다 아니면 출처를 만들지 않는다.
- **출처를 만들지 않은 거래처**: `monthly_recurring` 표시가 없으면 그 거래 전부를 변동 몫으로 옮긴다(`:650-661`). 표시가 있으면 어디에도 넣지 않는다(해지된 구독을 버리는 효과).
- **이미 관측된 것**: 이번 달 결제 합 `paid`. 남은 액 = min(max(기준액 − paid, 0), 근거 달들에서 `d` 이후 날짜에 결제된 금액의 중앙값) (`:469-478`). 그래서 평소 결제일이 지났는데 결제가 없으면 0을 더하고 경고만 남긴다(`:483-488`). 환불은 관측 순지출에만 반영하고 남은 액을 늘리지 않는다(`:451`, `:490-493`).
- **보류**: 기준액도 이번 달 결제도 없는 거래처(예: 환불만 있는 새 거래처)가 있으면 반복 지출 구성요소가 `null`(`:459-467`, `:663-666`).
- **가정·신뢰도 필드**: 거래처별 `expected_monthly_amount`, `history_periods`, `excluded_periods`, `status`, `confidence`, `warnings`, `basis`.

### 3.5 남은 기간의 변동·미분류 지출

`_expense_components` (`:558-559`, `:670-685`)

- **대상**: 대출·할부·반복 지출 몫이 아닌 모든 지출(환불 포함). 조정 가능성, 필수·재량 값은 읽지 않는다.
- **산식**: `P`의 각 달에서 일(日)이 `d`보다 큰 거래의 순지출 합(이번 달보다 긴 달의 날짜는 이번 달 말일로 접어서 비교)을 구하고, 그 **중앙값**(음수면 0) (`:671-681`).
- **이미 관측된 것**: 날짜로 자른다. 이번 달 `d`까지의 지출은 관측으로만 들어가고, 남은 기간 가정은 과거 같은 날짜 구간의 금액이다. 이번 달에 이미 나간 일회성 지출을 빼는 단계는 없다(같은 날짜 구간이 아니면 겹치지 않는다).
- **조회 기간**: 6개월. 해마다 한두 번 나가는 지출은 보지 못한다(F-E1).
- **가정·신뢰도 필드**: `basis` 고정 문구, 위 `included_periods`.

### 3.6 합계

`:800-861`

```
월 수입 전망   = 관측 수입(1일~기준일, 흐름표) + Σ 출처별 남은 정기 수입
월 지출 전망   = 관측 지출(1일~기준일, 흐름표) + 대출 + 할부 + 반복 + 변동   (하나라도 null이면 null)
월말 순현금흐름 = 월 수입 전망 − 월 지출 전망
```

## 4. 계획 2.6 요구사항 대비

| 2.6 요구 | 현재 | 판단 |
|---|---|---|
| 관측과 남은 기간 가정을 나눠 금액을 보임 | `observed_*`, `expected_remaining_*`가 따로 있다 | 충족 |
| 가정이 2.3 흐름표 줄과 같은 단위 | 전망의 구분(거래처 단위 반복 지출, 금액 일치 할부)이 흐름표의 `commitment_kind`(행 단위, 연결 기준)와 다르다 | 미충족 (F-P1) |
| 약정은 기록된 약정 속성에서 읽고 관측 회차를 다시 더하지 않음 | 연결된 대출·할부는 대체로 지킨다. 미연결·번호 불일치·이체 기록에서 다시 더한다 | 부분 (F-C1–F-C4) |
| 각 가정의 근거 달과 조정 가능성 미정 비중 | 근거 달은 수입·반복 지출 출처와 전체 `included_periods`에 있다. 미정 비중은 없다 | 부분 (F-R1) |
| 정확도는 지난 마감월로 잰 오차로 보임 | 신뢰도 등급 이름만 있다 | 미충족 (F-R2). 측정 도구는 이번에 추가 |

## 5. 결함과 위험

심각도: **높음** = 흔한 자료에서 월말 값을 정기 지급 한 건 이상 틀리게 만듦, **중간** = 특정 조건에서 같은 크기로 틀림 또는 전망을 자주 보류함, **낮음** = 드물거나 영향이 작음. 방향은 월말 순현금흐름 기준이다(과소 = 실제보다 낮게 전망).

각 항목의 합성 시나리오는 `backend/tests/services/test_forecast_audit_scenarios.py`에 있다. "현재 동작" 테스트는 지금의 결과를 고정하고, "기대 동작" 테스트는 `xfail(strict=True)`로 결함을 기록한다.

### F-C1. 연결되지 않은 대출 상환의 이중 반영 — 높음, 과소

- 코드: 대출 몫은 연결 거래만 뺀다(`:577-583`). 보류는 이번 달 미연결 거래의 카테고리에 `대출`이 들어갈 때만 한다(`:561-571`). 과거의 미연결 상환은 변동 몫에 남는다(`:545-560`).
- 시나리오 1: 월상환액 2,000. 이번 달 5일에 카테고리 `금융`인 미연결 상환 2,000이 관측됨. 20일 기준 전망은 대출 남은 액 2,000을 더한다. 관측 지출에 이미 2,000이 있으므로 같은 상환이 두 번 들어간다. (`test_current_unlinked_observed_repayment_is_added_again`, xfail `test_expected_unlinked_observed_repayment_not_added_again`)
- 시나리오 2: 과거 여섯 달 25일에 카테고리 `대출`인 미연결 상환 2,000. 20일 기준(상환일 전)에는 대출 남은 액 2,000에 더해 변동 기준선에도 2,000이 들어가 남은 지출이 4,300이 된다(맞는 값 2,300). 상환이 관측된 뒤에는 전망 전체가 보류된다. 즉 미연결 상환이 있는 달은 상환일 전에는 이중 반영, 후에는 보류다. (`test_current_unlinked_repayment_history_counts_loan_twice_before_payday`, xfail `test_expected_unlinked_repayment_history_counts_loan_once`)
- 되짚기 도구에서는 대출의 `remaining_without_any_linked_actual_in_month`와 보류 사유 `loan_observed_without_account_link`로 드러난다.

### F-C4. 지출 기록과 상관없이 더하는 대출 월상환액 — 높음, 과소

- 코드: 대출 몫은 스냅샷 월상환액만 본다(`:574-587`). 실제 값(흐름표)은 지출로 기록되고 연결된 상환만 대출 줄에 넣는다(`backend/app/services/metric_views.py:410`).
- 시나리오: 상환이 장부에 `이체`로 기록된다(또는 장부에 없는 계좌에서 나간다). 전망은 매달 2,000을 지출로 더하지만 실제 월 흐름표의 지출에는 그 돈이 없다. (`test_current_repayment_booked_as_transfer_is_added_to_expense`, xfail `test_expected_repayment_booked_as_transfer_not_added_to_expense`)
- 대출이 여럿이면 대출마다 같은 크기로 쌓인다.

### F-I1. 월말 급여가 한 번 다음 달 1일로 넘어가면 정기 수입이 빠짐 — 높음, 과소

- 코드: 달력 월 단위 합계와 연속성 규칙(`:304-313`).
- 시나리오: 1–4월, 6월은 말일에 100,000. 5월분이 6월 1일에 들어옴. 5월은 0, 6월은 200,000이 되어 둘 다 기준에서 빠지고, 기준 달이 6개 중 4개라 "불연속"으로 판정된다. 7월 20일 전망은 정기 수입을 0으로 둔다. 같은 판정이 이후 약 석 달 이어진다(직전 세 달이 모두 기준에 들어갈 때까지). (`test_current_month_end_salary_crossing_boundary_drops_regular_income`, xfail `test_expected_month_end_salary_crossing_boundary_keeps_regular_income`)
- 대조: 매달 말일에 들어오는 급여는 급여일 전에도 정상 반영된다(`test_month_end_salary_is_expected_before_payday`).

### F-E1. 연 1회 지출 미반영 — 높음(그 달), 과대

- 코드: 조회 기간이 6개월(`:39`, `:729`)이고 변동 기준선은 중앙값(`:681`).
- 시나리오: 작년 7월 15일에 50,000을 낸 연회비. 올해 7월 10일 전망의 남은 지출은 500(식비 기준선)뿐이다. 계획 2.4는 이런 지출을 12개월 창으로 보라고 한다. (`test_current_annual_expense_is_not_in_remaining_assumption`, xfail `test_expected_annual_expense_is_in_remaining_assumption`)

### F-E2. 고정비로만 표시된 해지 지출이 변동 기준선에 남음 — 중간, 과소

- 코드: 출처를 만들지 않은 반복 거래처는 `monthly_recurring` 표시가 없으면 변동 몫으로 옮겨진다(`:650-661`).
- 시나리오: `cost_kind = fixed`만 표시된 5,000 구독이 1–4월에 나가고 해지됨. 7월 20일 전망은 변동 기준선(4/6달에 5,000 포함)의 중앙값 때문에 남은 지출 5,300을 낸다(맞는 값 300). 같은 지출에 `monthly_recurring`까지 표시돼 있으면 버려져 300이 된다. (`test_current_cancelled_fixed_cost_falls_back_to_variable_baseline`, xfail `test_expected_cancelled_fixed_cost_is_not_assumed`, 대조 `test_cancelled_explicit_monthly_recurring_is_not_assumed`)
- 이번 달에 해지되어 평소 결제일 전인 경우는 기록에 해지 사실이 없으므로 결함이 아니라 한계다. 평소 결제일이 지나면 0을 더하고 경고를 남긴다(`test_recurring_cancelled_this_month_is_still_assumed_before_its_day`).

### F-C2. 연결도 정확한 일치도 없는 할부 결제의 이중 반영 — 중간, 과소

- 코드: 할부 몫 분리는 연결 또는 정확 일치(금액·거래처·결제수단·±7일)만 인정한다(`:370-381`, `:548-549`).
- 시나리오: 계획 거래처는 `Example Device`인데 카드 명세에는 다른 이름으로 1,000씩 찍힘(미연결). 7월 10일 전망은 할부 1,000을 더하고 변동 기준선에도 같은 결제가 들어가 남은 지출이 2,500이 된다(맞는 값 1,500). 마지막 회차가 끝난 다음 달에도 변동 기준선에 남아 1,000을 계속 더한다. (`test_current_unmatched_installment_counted_in_schedule_and_variable`, `test_current_unmatched_installment_after_final_month_still_assumed`, 각각의 xfail)
- 첫 회차 금액이 다른 할부(나머지 원 단위가 첫 회차에 붙는 경우)도 그 회차는 정확 일치가 안 된다.

### F-C3. 연결된 이번 달 회차를 번호가 다르다는 이유로 다시 더함 — 중간, 과소

- 코드: 연결은 계산한 회차 번호로만 찾는다(`:600-607`). 번호가 다르면 정확 일치 후보에서도 연결된 거래는 빠진다(`:618-621`).
- 시나리오: 계획의 첫 납부월이 실제 청구월보다 한 달 이르게 입력됨. 7월 8일 결제가 7회차로 연결돼 있지만 전망은 7월을 8회차로 보고 1,000을 더한다.
- **1차 수정(R3)으로 해결.** 이번 달 날짜의 연결 결제를 이번 달 회차로 보고, 번호 차이는 경고로만 남긴다. (`test_installment_link_number_mismatch_only_warns`, `test_expected_linked_installment_of_this_month_not_added_again`, 대조 `test_linked_installment_of_this_month_with_matching_number_has_no_warning`, `test_installment_link_number_mismatch_before_this_month_payment`)

### F-I2. 이름이 바뀐 급여 입금처의 이중 반영 — 중간, 과대

- 코드: 수입 출처는 정규화한 입금처 문자열로 묶인다(`:81-82`, `:208`).
- 시나리오: 이번 달 급여가 새 이름으로 15일에 들어옴. 예전 이름 출처는 `expected`로 100,000을 더하고, 새 이름 출처는 이력이 없어 `uncertain`이지만 관측 수입에는 이미 들어 있다. 월 수입 전망이 200,000이 된다.
- **1차 수정(R9)으로 해결.** 예전 이름 출처를 확인 필요(`uncertain`, 남은 액 0)로 보류하고 사유를 단다. 월 수입 전망은 100,000. (`test_renamed_salary_payer_withholds_pending_old_source`, `test_expected_renamed_salary_payer_not_counted_twice`, 대조 `test_second_salary_payer_with_history_is_not_treated_as_rename`, `test_new_payer_registered_in_settings_is_not_treated_as_rename`, `test_tiny_new_salary_category_deposit_does_not_withhold`)
- 반복 지출 거래처 이름이 바뀐 경우에도 같은 구조로 이중 반영될 수 있다(코드 판독, 테스트 없음).

### F-I3. 급여 카테고리가 아닌 정기 수입은 전망하지 않음 — 중간, 과소

- 코드: 출처 후보는 급여 단어 카테고리나 사용자 설정 입금처뿐이다(`:205-210`).
- 시나리오: 매달 28일 같은 입금처에서 들어오는 100,000이 `기타수입` 카테고리. 출처가 없고 남은 수입이 0이다. (`test_current_regular_income_outside_salary_category_is_not_forecast`, 현재 동작만 기록)
- 분류는 사람이 한다는 원칙상 시스템이 자동으로 정기 수입을 찾는 것은 답이 아니다. 사람이 정기 수입을 지정하는 축(`T056`)이나 기존 수입 예상 설정으로 해결한다. 그래서 기대 동작 테스트를 두지 않았다.

### F-O1. 업로드가 덮은 조용한 날도 남은 기간으로 봄 — 낮음, 과소

- 코드: 남은 기간은 마지막 거래일 다음 날부터다(`:528-533`). 업로드 날짜는 표시에만 쓴다(`:740-748`).
- 시나리오: 업로드는 7월 26일까지를 덮지만 마지막 거래는 20일. 26일 기준 전망은 21–26일의 과거 지출(300)까지 더한다(맞는 값 100).
- **1차 수정(R10)으로 해결.** 남은 기간이 27일부터라 100. (`test_quiet_days_inside_export_are_observed`, `test_expected_quiet_days_inside_export_are_not_assumed_again`, 대조 `test_upload_before_last_transaction_keeps_transaction_day`, `test_upload_after_as_of_or_in_previous_month_is_ignored`, `test_fully_covered_month_has_no_remaining_period`)

### F-O2. 전망 기준일이 자료 기준일이 아니라 오늘 — 중간, 보류 증가

- 코드: `canonical_views_dashboard_service.py:211`, 보류 규칙 `monthly_projection_service.py:814-821`.
- 시나리오: 마지막 업로드가 열흘 전이면 화면의 전망은 항상 보류된다. 자료가 지난달 28일까지이고 오늘이 이번 달 2일이면, 자료상 진행월(지난달)이 아니라 관측이 0인 이번 달을 전망한다. 계획 2.1은 진행월을 자료 기준으로 정의한다.
- 수동 업로드 도구에서 이 규칙은 전망이 보이는 날을 업로드 직후 일주일로 제한한다. 테스트는 기존 `test_no_data_and_stale_partial_coverage_withhold_month_end`가 보류 규칙을 덮는다.

### F-P1. 전망 구분과 흐름표 구분의 단위 불일치 — 중간, 방향 없음

- 코드: 전망은 거래처 단위 반복 판정(`:539-544`), 금액 일치 할부(`:548`)를 쓴다. 흐름표는 행 단위 `cost_kind`, 연결만으로 약정을 정한다(`metric_views.py:406-422`).
- 영향: 고정비로 한 번 표시된 거래처의 다른 지출까지 반복 지출 가정에 들어가고, 연결 없이 금액만 맞는 할부 결제는 전망에서는 할부, 실제에서는 수시·미정 줄이 된다. 그래서 구성요소별 오차의 일부는 정의 차이다. 월말 합계에는 영향이 없다. 되짚기 도구의 구성요소별 표는 이 차이를 포함한 값이다.

### F-C5. 지난 예정일의 미연결 할부가 전망 전체를 보류 — 낮음, 보류 증가

- 코드: `:638-641`.
- 시나리오: 카드 청구가 예정일 뒤 8일 넘게 늦거나 금액이 달라 정확 일치가 안 되면, 예정일이 지난 날부터 월말 값이 `null`이다(기존 테스트 `test_past_unlinked_installment_and_overlapping_links_are_not_future_obligations`).

### F-V1. 변동 지출에 중앙값 사용 — 위험(측정 필요), 과대 가능

- 코드: `:681`.
- 큰 지출이 가끔 있는 달 구조에서는 남은 기간 금액의 중앙값이 평균보다 작다. 그러면 지출을 과소, 순현금흐름을 과대 전망한다. 실제 크기는 되짚기의 `variable` 부호 오차로 확인해야 한다. 점검 결과 없이 바꾸지 않는다.

### F-R1. 조정 가능성 미정 비중을 보이지 않음 — 중간(요구 미충족)

- 응답에 미정 비중이 없다(`income_projection.py:104-126`). 전망 계산도 조정 가능성을 읽지 않는다. (xfail `test_expected_projection_reports_undecided_adjustability_share`)

### F-R2. 정확도를 등급 이름으로만 보임 — 중간(요구 미충족)

- `confidence`는 사유·경고 유무로 정한 등급이다(`:857-861`). 지난 마감월로 잰 오차가 응답에 없다. 측정은 6절 도구로 가능해졌다.

### 그 밖의 관찰 (낮음)

- 대출 만기일을 보지 않는다. 만기가 지났어도 새 스냅샷이 오기 전까지는 월상환액을 더한다(`:574-587`).
- 반복 지출 판정이 거래처 단위라, 한 거래만 고정비로 표시해도 그 거래처 지출 전체가 반복 지출 가정이 된다(`:539-544`). 안정적이면 결과는 변동 기준선과 비슷하다.
- `late` 급여는 남은 액을 계속 더한다(`:340-347`). 급여가 끊긴 첫 달에는 월말까지 과대 전망한다. 다음 달에는 자동으로 `stopped`가 된다.
- 관측 범위 판정이 활동 기반이라, 거래가 적은 달이 많으면 전망이 자주 보류된다(`:106-130`).

### 계획 점검 항목에 대한 답

| 점검 | 답 |
|---|---|
| (a) 급여일 전 정기 수입 반영 | 반영한다. 다만 급여 카테고리나 설정 입금처일 것, 달력 월 기준 연속성이 유지될 것이 조건이다. 조건이 깨지는 F-I1, F-I3에서는 0으로 둔다. |
| (b) 관측된 약정 회차·대출 상환의 재가산 | 연결된 대출, 정확한 번호로 연결되거나 정확히 일치하는 할부, 같은 거래처 이름의 반복 지출은 다시 더하지 않는다. 미연결 대출(F-C1), 장부에 지출로 없는 대출(F-C4), 미연결·불일치 할부(F-C2), 번호가 다른 연결(F-C3), 이름이 바뀐 입금처(F-I2)에서는 다시 더한다. |
| (c) 조정 가능성·약정 연결이 비었을 때 | 조정 가능성은 계산에 쓰이지 않아 값에는 직접 영향이 없고, 비중도 응답에 없다(F-R1). 약정 연결이 비면 대출·할부가 이중 반영되어 지출 과대, 순현금흐름 과소로 치우친다. 이번 달에 `대출` 카테고리 미연결 거래가 나타나면 그 뒤로는 보류된다. 비중은 되짚기 도구가 월별로 잰다. |

## 6. 되짚기 도구

위치: `backend/app/tools/forecast_backtest.py`. 테스트: `backend/tests/tools/`.

### 6.1 실행

```bash
cd backend
FORECAST_BACKTEST_DATABASE_URL='postgresql+asyncpg://<읽기 계정>@<호스트>/<DB>' \
  uv run python -m app.tools.forecast_backtest --format markdown
```

| 옵션 | 기본값 | 뜻 |
|---|---|---|
| `--format json|markdown` | `markdown` | 출력 형식 |
| `--days 5,10,15,20,25` | 5,10,15,20,25 | 각 달의 as-of 일(1–28) |
| `--min-history-months N` | 3 | 첫 거래 달 뒤 N개월째 달부터 평가 |
| `--from-period`, `--to-period` | 없음 | 평가할 달 범위(`YYYY-MM`) |
| `--show-amounts` | 꺼짐 | 시점별 원 단위 금액을 붙인다(이름은 여전히 내지 않음) |
| `--output 경로` | 표준 출력 | 파일로 쓰기 |

URL은 출력하지 않는다. PostgreSQL과 SQLite만 받는다. 앱 설정(`API_KEY`, `DATABASE_URL`)은 필요 없다.

### 6.2 읽기 전용 보장

- PostgreSQL: 연결 옵션 `default_transaction_read_only=on`, 첫 문장 `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`, `SHOW transaction_read_only`가 `on`인지 확인한 뒤에만 조회한다. SQLite: `PRAGMA query_only = ON`을 확인한다. 확인이 안 되면 중단한다.
- 세션의 ORM flush는 막혀 있고, 트랜잭션은 항상 롤백한다. 임시 테이블이나 뷰를 만들지 않는다.
- 검증: `test_read_only_backtest_matches_and_refuses_writes`(PostgreSQL), `test_read_only_session_refuses_writes_on_sqlite`. 쓰기 시도는 `cannot execute INSERT in a read-only transaction`으로 실패하고 행 수가 바뀌지 않는다.

### 6.3 무엇을 비교하나

- 평가 대상: 첫 거래 달 + `min-history-months` ~ 마지막 마감월(`vw_metric_as_of.last_closed_period`). 각 달의 as-of 일마다 한 점.
- 전망: 실제 함수 `get_monthly_projection(reference_date=as-of)`를 그대로 호출한다. 이 함수는 원래 `날짜 ≤ 기준일`인 거래, 기준일 이전 최신 대출 스냅샷, 기준일 이전 업로드만 읽는다. 그래서 전망 함수에 새 인자를 더하지 않았고, 기존 동작은 바뀌지 않았다(코드 변경 없음). 도구가 같은 함수를 부른다는 것은 `test_backtest_calls_the_live_forecast_with_the_as_of_date`, as-of 뒤 거래가 전망에 새지 않는다는 것은 `test_transactions_after_the_as_of_day_never_reach_the_forecast`로 확인한다.
- 구성요소별 월 전망 = as-of까지의 흐름표 관측(그 구성요소 줄) + 전망의 남은 기간 가정. 실제 = 마감월 흐름표 합계.
  - `income` = `income_total`, `expense` = `total_outflow`, `net` = `residual`
  - `loan`/`installment`/`recurring` = `committed_loan/installment/recurring_total`
  - `variable` = `total_outflow − committed_total`
  - `net_after_known_remaining` = 응답의 `net_after_known_remaining_expense`(보류돼도 숫자인 값)를 실제 잔여와 비교
- 오차: 부호 오차 % = (전망 − 실제) / |실제| × 100(양수 = 과대). 실제가 0이면 비율 대신 `zero_actual`로 센다. 순현금흐름처럼 0에 가까운 값을 위해 그 달 실제 수입 대비 % 도 낸다. as-of 일별과 전체로 점 수, 보류 수, 과대·과소·일치 수, 평균·중앙값·p90을 낸다.
- 정합성 확인: 전망 응답의 관측 수입·지출이 흐름표 as-of 합계와 다른 점의 수(`consistency.observed_mismatch_points`). 0이어야 한다.

### 6.4 계획 점검 항목 출력

- (a) `special_cases.pre_payday_income`: 그 달 실제 수입의 50% 이상이 as-of 뒤에 들어온 점에서, 전망이 정기 수입을 포함한 점 수, 수입원이 없던 점 수, 출처 상태 분포, 남은 수입 전망 ÷ 실제 남은 수입(%), 수입 오차.
- (b) `special_cases.double_counting.{loan,installment,recurring}`: 그 줄이 as-of까지 관측됐는데 전망이 남은 금액을 더했고 실제로는 뒤에 더 없었던 점(`observed_then_added_again`), 남은 금액 과대 점, 그 달 흐름표에 연결된 실제가 전혀 없는데 더한 점(`remaining_without_any_linked_actual_in_month`; F-C1, F-C4 신호), 초과분 ÷ 그 달 지출(%).
- (c) `special_cases.classification_bias`: 달마다 지출 중 조정 가능성 미정 비중, 약정처럼 보이나 미연결인 비중(카테고리에 `대출`이 있거나 `recurring_payment_kind = installment`인데 연결 없음), 약정 비중, 전망의 남은 지출 중 변동 가정 비중. 미정 비중 구간(<10%, 10–30%, ≥30%)과 미연결 비중(0%, >0%)별 오차 중앙값.
- `withheld_reasons`: 보류된 점의 사유를 고정 코드로 센다(반복 지출 사유 앞의 거래처 이름은 복사하지 않는다).

### 6.5 재생의 한계 (출력의 `limitations`에도 수와 함께 나온다)

| 코드 | 내용 |
|---|---|
| `classification_current_state` | 카테고리 재지정, `cost_kind`, `recurring_payment_kind`, 필수·재량은 이력이 없어 현재 값으로 재생한다. |
| `transaction_availability` | as-of 이전 날짜의 거래는 그때 이미 알려졌다고 가정한다(업로드 지연 미반영). 삭제·병합·대체 상태와 환불 배분도 현재 값이다. 따라서 F-O1과 F-O2는 재생으로 측정되지 않는다. |
| `loan_snapshot_unavailable_at_as_of` | as-of 이전 대출 스냅샷이 없으면 대출 몫은 0으로 재생된다. 해당 점 수를 낸다. |
| `loan_monthly_payment_current_estimate` | 연결 거래로 추정한 월상환액은 최신 스냅샷 행에만 기록된다. 과거 스냅샷 행은 비어 있을 수 있고, 그러면 그 시점 전망은 보류된다. |
| `links_created_after_transaction_month` | 대출·할부 연결은 현재 상태다. 거래가 속한 달이 끝난 뒤 만든 연결 수를 낸다(그 달의 실시간 전망에는 없었던 연결). |
| `installment_plan_status_current` | 현재 `active`인 계획만 읽는다. 완료·취소로 바뀐 계획은 과거 재생에서도 빠진다. 그 수를 낸다. |
| `income_expectation_settings_current` | 수입 예상 설정은 이력이 없어 현재 값을 모든 시점에 쓴다. 항목 수를 낸다. |

### 6.6 출력의 개인정보

기본 출력은 비율, 건수, 방향, 평가한 달(`YYYY-MM`)만 담는다. 원 단위 금액은 `--show-amounts`일 때만 시점별로 붙고, 거래처·카테고리 이름은 어떤 경우에도 내지 않는다(`test_default_report_prints_no_amounts_or_names`). 결과를 PR이나 이 문서에 옮길 때는 기본 출력만 쓴다.

## 7. 특성 테스트

`backend/tests/services/test_forecast_audit_scenarios.py`

| 테스트 | 시나리오 | 결과 |
|---|---|---|
| `test_month_end_salary_is_expected_before_payday` | 월말 급여, 급여일 전 | 현재 동작이 맞음 |
| `test_current_/expected_month_end_salary_crossing_boundary_*` | 월말 급여가 한 번 다음 달 1일 | 현재 고정 + xfail (F-I1) |
| `test_current_regular_income_outside_salary_category_is_not_forecast` | 급여 카테고리 아닌 정기 수입 | 현재 고정 (F-I3) |
| `test_renamed_salary_payer_withholds_pending_old_source`, `test_expected_renamed_salary_payer_not_counted_twice` 외 대조 3개 | 이름이 바뀐 급여 입금처 | 1차 수정(R9)으로 통과 (F-I2) |
| `test_current_/expected_annual_expense_*` | 연 1회 지출 | 현재 고정 + xfail (F-E1) |
| `test_cancelled_explicit_monthly_recurring_is_not_assumed` | 해지된 월 반복 표시 지출 | 현재 동작이 맞음 |
| `test_current_/expected_cancelled_fixed_cost_*` | 고정비로만 표시된 해지 지출 | 현재 고정 + xfail (F-E2) |
| `test_recurring_cancelled_this_month_is_still_assumed_before_its_day` | 이번 달 해지 | 한계로 기록 |
| `test_quiet_days_inside_export_are_observed`, `test_expected_quiet_days_inside_export_are_not_assumed_again` 외 대조 3개 | 업로드가 덮은 조용한 날 | 1차 수정(R10)으로 통과 (F-O1) |
| `test_linked_installment_last_month_and_after_end`, `test_linked_installment_after_final_month_is_not_assumed` | 할부 종료월과 그 다음 달(연결됨) | 현재 동작이 맞음 |
| `test_current_/expected_unmatched_installment_*` (2쌍) | 미연결·불일치 할부, 종료월과 그 다음 달 | 현재 고정 + xfail (F-C2) |
| `test_installment_link_number_mismatch_only_warns`, `test_expected_linked_installment_of_this_month_not_added_again` 외 대조 2개 | 회차 번호 불일치 | 1차 수정(R3)으로 통과 (F-C3) |
| `test_current_/expected_unlinked_observed_repayment_*` | 관측된 미연결 상환 | 현재 고정 + xfail (F-C1) |
| `test_current_/expected_unlinked_repayment_history_*` | 과거 미연결 상환, 상환일 전 | 현재 고정 + xfail (F-C1) |
| `test_current_/expected_repayment_booked_as_transfer_*` | 이체로 기록된 상환 | 현재 고정 + xfail (F-C4) |
| `test_expected_projection_reports_undecided_adjustability_share` | 응답의 미정 비중 | xfail (F-R1) |

xfail은 모두 `strict=True`다. 수정되어 통과하기 시작하면 테스트가 실패하므로, 고칠 때 xfail 표시를 함께 지운다. 1차 수정 뒤 남은 xfail은 9개(F-I1, F-E1, F-E2, F-C2 2개, F-C1 2개, F-C4, F-R1)다.

## 8. 수정 제안

R1–R12는 승인됐다(두 차례로 나눔). R13은 승인되지 않았다. 적용 현황은 8.1절.

| # | 대상 | 제안 | 선행 | 되짚기에서 보일 개선 |
|---|---|---|---|---|
| R1 | F-C1, F-C4 | 대출 몫을 스냅샷 월상환액이 아니라 등록된 약정(대출)에서 읽고, 이번 달 관측 상환은 연결뿐 아니라 사람이 등록한 약정 규칙(기관·거래처·카테고리)에 맞는 거래까지 뺀다. 같은 규칙에 맞는 과거 거래는 변동 기준선에서 뺀다. 최근 마감월 흐름표에 그 대출의 지출 줄이 없으면(이체 기록이나 장부 밖 계좌) 지출 가정에 더하지 않고 "장부에 지출로 나타나지 않는 약정"으로 따로 보인다. | `T056` 약정 등록·주기 속성 | 대출 `remaining_without_any_linked_actual_in_month`와 `observed_then_added_again` 0, 보류 사유 `loan_observed_without_account_link` 감소, `expense` 과대 비율 감소 |
| R2 | F-C2 | 할부 계획에 연결되지 않았지만 같은 계획 규칙에 맞는 거래는 변동 기준선에서 빼고 "연결 미확인"으로 표시한다. 분리 기준을 흐름표의 약정 구분과 같게 한다(R6). | `T056` | 할부 종료 다음 달의 `variable` 과대 감소, 할부 `remaining_over_forecast` 감소 |
| R3 | F-C3 | 이번 달 회차는 "그 계획에 연결된 거래 중 날짜가 이번 달인 것"으로 찾고, 번호가 계산과 다르면 경고만 남긴다. | 없음 | 할부 `observed_then_added_again` 0 |
| R4 | F-E1 | 해마다 한두 번 나가는 지출을 12개월 창으로 본다. 사람이 연 주기로 등록한 약정은 그 달에 더하고, 등록되지 않은 연간성 지출은 비교 계약의 12개월 창 규칙으로 "작년 같은 달에 있었음"을 가정 근거와 함께 보인다. | `T056` 주기 속성, `T057` 12개월 창 | 13개월 이상 자료에서 연간 지출이 있는 달의 `expense` 과소·`net` 과대 감소 |
| R5 | F-E2 | 약정으로 표시됐던 거래처가 끊기면 그 이력을 변동 기준선에 넣지 않는다. 약정 종료 속성이 있으면 그것을 따른다. | `T056` 약정 종료 속성 | 해지 뒤 몇 달의 `variable` 과대 감소 |
| R6 | F-P1 | 전망의 구분을 `vw_metric_flow_lines`의 약정 구분과 흐름 줄에서 읽어, 남은 기간 가정이 2.3 줄과 같은 단위가 되게 한다. 그러면 구성요소 오차가 정의 차이 없이 시점 차이만 남는다. | `T056` (성격 축), `T054` 완료 | 구성요소별 오차가 합계 오차와 맞물림(구성요소 합 = 총지급) |
| R7 | F-I1 | 수입 연속성을 달력 월이 아니라 지급 주기로 본다. 월 경계 전후 며칠의 입금은 가까운 주기로 배정한다. 사람이 정기 수입으로 지정한 입금처(`T056` 수입 축, 기존 수입 예상 설정)는 연속성 판정 없이 예상한다. | `T056` 수입 정기/비정기 | (a)의 `forecast_includes_regular_income` 비율 증가, 수입 과소 감소 |
| R8 | F-I3 | 정기 수입 후보를 급여 단어가 아니라 사람이 지정한 정기 수입 축에서 읽는다. 자동 추천은 하지 않는다. | `T056` | (a)의 `no_income_source_identified` 감소 |
| R9 | F-I2 | 이번 달에 기존 출처가 아직 대기 중인데 새 급여 카테고리 입금이 들어오면, 둘 다 더하지 않고 확인 필요로 보류한다. | 없음 | 수입 과대 점 감소 |
| R10 | F-O1 | 남은 기간 시작을 max(마지막 거래일, 기준일 이하의 업로드 날짜)의 다음 날로 한다. | 없음 | 재생으로는 측정 안 됨(6.5). 특성 테스트로 확인 |
| R11 | F-O2 | 대시보드 전망 기준일을 오늘이 아니라 거래 기준일과 2.1의 진행월로 정한다. | `T057` 진행월 처리 | 재생 대상 아님. API 테스트로 확인 |
| R12 | F-R1, F-R2 | 응답에 지출 가정의 조정 가능성 미정 비중(금액 기준)과, 최근 마감월 되짚기 오차(as-of 일 구간별 중앙값과 점 수)를 싣는다. 신뢰도 등급만으로 표시하지 않는다. | `T056`(미정 정의), 이 도구 | 해당 없음(표시 요구) |
| R13 | F-V1 | 실제 자료 되짚기에서 `variable` 부호 오차가 한쪽으로 치우치면 중앙값 대신 다른 대표값(예: 절사 평균)을 비교 실험한다. 결과 없이 바꾸지 않는다. | 실제 자료 되짚기 결과 | `variable` 부호 오차 중앙값이 0에 가까워짐 |

권장 순서: 실제 자료로 되짚기 실행 → 사용자 검토 → R3, R9, R10처럼 선행 없는 것 → `T056` 뒤 R1, R2, R5–R8 → `T057` 뒤 R4, R11 → R12 → 같은 되짚기로 오차 변화 확인.

### 8.1 적용 현황

| # | 상태 | 바뀐 동작 | 응답 변화 |
|---|---|---|---|
| R3 | 1차 적용 | 이번 달 회차 = 그 계획에 연결된 거래 중 날짜가 이번 달인 것. 번호가 다르면 경고만 남기고 다시 더하지 않음. 이번 달 날짜의 연결이 없으면 예전처럼 계산한 번호의 연결을 씀 | 할부 구성요소 `warnings`에 경고 문구(계획 이름 접두), 그 구성요소와 전체 `confidence`가 `low` |
| R9 | 1차 적용 | 새 입금처(창 안 이전 입금·설정 없음)의 급여 분류 입금이 기존 예상액의 10% 이상이고 기존 출처가 이번 달 아직 받은 것이 없으면, 기존 출처를 `uncertain`·남은 액 0으로 보류 | 출처 `reason` 문구, `missing_reasons`에 입금처 이름 변경 확인 사유. 되짚기 사유 코드 `income_source_possible_payer_rename` 추가 |
| R10 | 1차 적용 | 남은 기간 시작 = max(이번 달 마지막 거래일, 기준일 이하 최신 업로드 날짜)의 다음 날 | 새 필드 `remaining_period_start`(nullable). 기존 필드 이름·형식은 그대로 |
| R1, R2, R4–R8, R11, R12 | 2차 대상 | 미적용 | — |
| R13 | 미승인 | — | — |

기존 응답 필드는 지우거나 이름·형식을 바꾸지 않았다. 마이그레이션은 없다.
