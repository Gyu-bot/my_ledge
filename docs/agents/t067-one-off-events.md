# T067 일회성 지출 묶음 — 확정 설계

상태: 확정 (2026-11-25). 외부 설계 검토(GPT Astra 6.2 xhigh) 반영, 사용자 결정 2건 확정.

## 1. 문제

차량 구매처럼 드물게 크게 나가는 지출이 월별 추이, 비교 기준선, 변화 기여, 연간성 패턴(T062 월 환산), 월말 전망의 변동 지출 기준선(T064), 사후 검토 탐지를 흔든다. 지출 자체(총지급, 잔여, 순자산 대조)에는 그대로 들어가야 하지만, 경상 흐름을 볼 때는 따로 떼어 봐야 한다.

## 2. 원칙 (변경 불가)

- 사람이 표시한다. 금액·빈도로 자동 판정하거나 후보를 추천하지 않는다 (`Implentation-plan.md` 1.2-2). 전망의 수입 휴리스틱 `_oneoff`/`ONEOFF_WORDS`(비정기 수입 판별)는 이 기능과 무관하며 재사용하지 않는다. 이름 충돌을 피하려 새 코드는 `one_off_event` 접두를 쓴다.
- 원본 거래 행을 바꾸지 않는다. 묶음은 거래를 합치지 않는다 (`merged_into_id` 사용 금지). 묶음은 이름표와 소속 연결뿐이다.
- 같은 이름은 같은 값이다. 기존 `flow_row`, `flow_section`, `total_outflow`와 기존 합계 열의 정의는 바꾸지 않는다. 일회성을 뺀 값은 새 이름으로 낸다.
- 일회성은 조정 가능성(보호/조정 가능/미정)과 별개 속성이다. 일회성이면서 미정인 거래는 분류 큐와 미정 비중에 계속 남는다.

### 2.1 소속 0건일 때의 호환 조건

바이트 동일은 약속하지 않는다(측정 배열에 항목이 늘고 설명 문구가 바뀐다). 대신 아래를 회귀 테스트로 고정한다.

- 기존 측정 키별 숫자·순서, `null`/0 구분, 기존 목록 항목·잘림·가산성 값이 동일하다.
- 허용되는 변화: 새 필드, 측정 배열 끝의 새 항목, `basis` 설명 문구.

## 3. 데이터 모델 (Alembic 가산 이행, 0045 다음)

```
one_off_events
  id             PK
  name           text, not null, 공백 정리 후 1–100자
  note           text, null
  created_at, updated_at

one_off_event_members
  transaction_id PK, FK transactions.id ON DELETE CASCADE   -- 거래 하나는 최대 한 묶음 (직접 소속)
  event_id       FK one_off_events.id ON DELETE CASCADE
  created_at
```

- `schema_service`의 표 설명에 두 표를 추가한다.

## 4. 직접 소속과 금액 귀속

두 개념을 분리한다.

- **직접 소속**: `one_off_event_members`의 행. 사람이 넣고 뺀다. 거래 응답의 `one_off_event_id`/`one_off_event_name`은 직접 소속을 뜻한다. 수정·해제는 직접 소속에만 허용한다.
- **금액 귀속**: 흐름 줄(`vw_metric_flow_lines`)의 `one_off_event_id`. 줄의 뜻을 가진 거래(`attributed_transaction_id`)의 직접 소속을 따른다.
  - 일반 줄·환불 잔액 줄(`transaction`, `refund_remainder`): 그 거래 자신의 소속.
  - 확정 배분 환불 줄(`refund_allocation`): 원 구매의 소속. 환불 게시월에 반영된다.
  - 예: 환불 10만 원 중 6만 원이 묶음 A의 원구매에 배분되고 환불 거래 자체가 묶음 B에 직접 소속이면, 환불 게시월에 A −6만 원, B −4만 원. 전액 배분이면 환불 자체 줄이 없어 B 반영액은 0원.
- 귀속 조건: `type = 지출`, KRW 줄, 그리고 그 줄의 `commitment_kind IS NULL`. 아니면 NULL.

### 4.1 소속 자격 (쓰기 시점 검증, 요청 단위 전부 아니면 전무)

- 유효 거래(삭제·병합·대체 아님), `type = 지출`, KRW.
- 부호 무관. 일회성 구매의 환불(양수 지출)도 넣을 수 있다.
- `vw_transaction_nature.commitment_kind`가 NULL이 아니면(대출·할부 연결, 정기 지급 소속; 사람의 명시적 제외와 규칙 우선순위 반영) 422 `committed`. 할부 회차는 경상 부담이다.
- 같은 묶음에 이미 있으면 멱등 성공. 다른 묶음에 있으면 409 `in_other_event`(암묵 이동 없음). 동시 추가의 PK 충돌도 409로 바꾸고 요청 전체를 롤백한다.

### 4.2 소속 상태 (`member_status`, 집계 시점)

| 상태 | 뜻 |
|---|---|
| `counted` | 자기 흐름 줄이 있고 일회성으로 집계됨 |
| `fully_allocated` | 전액 배분 환불이라 자기 줄이 없음. 금액은 원 구매 쪽으로 귀속 |
| `committed_now` | 소속 뒤 약정이 됨. 약정이 이기며 소속은 보존. 약정이 풀리면 다시 집계 |
| `inactive` | 삭제·병합·대체됨, 또는 원본 갱신으로 비지출·비KRW가 됨. 사유(`inactive_reason`)를 함께 낸다. 복원되면 다시 집계 |

## 5. 계산 경로 (SQL 뷰 계층, `metric_views.py`)

### 5.1 `vw_metric_flow_lines`

- 새 열 `one_off_event_id`(4절 귀속 규칙). **기존 `flow_row`, `flow_section`, `adjustability`는 그대로**다. 새 흐름 줄 값을 만들지 않는다.
- 열은 기존 열 뒤에 붙인다.

### 5.2 `flow_summary_columns` / `vw_monthly_flow_summary`

새 참고 열만 더한다. 기존 열의 순서와 값은 그대로다(`month_status` 위치 보존 포함).

| 이름 | 정의 | 한국어 |
|---|---|---|
| `one_off_total` | `one_off_event_id IS NOT NULL` 지출 줄 합 (환불 차감, 게시월) | 총지급 중 일회성 |
| `ongoing_outflow` | `total_outflow − one_off_total` | 경상 지급 |
| `ongoing_living_spend` | `living_spend − one_off_total` | 경상 생활 지출 |

`residual`, `residual_rate`, 순자산 대조(T061)는 총지급 기준 그대로다.

### 5.3 `vw_spend_cube`

변경하지 않는다(건수 재집계 의미가 흔들리므로). 묶음별 금액은 흐름 줄에서 직접 집계한다.

### 5.4 PostgreSQL 이행

- 기준은 0041 동결본 + 0045의 `vw_transaction_nature`. downgrade는 0045 상태(거래처 접두 매칭 포함)로 정확히 복원한다.
- 열 순서가 바뀌는 뷰는 `CREATE OR REPLACE`로 끼우지 말고 의존 뷰 역순 제거 → 정순 생성(0041 패턴).
- `tests/migrations` 동결 SQL 가드를 갱신하고, PostgreSQL 왕복(upgrade/downgrade/upgrade) 검증을 별도로 한다. SQLite 서비스 테스트는 `create_all` + 런타임 DDL 경로다.

## 6. 소비자별 규칙

적용 대상은 아래에 열거한 것뿐이다. "모든 기준선"이 아니다.

| 표면 | 규칙 |
|---|---|
| 월 흐름표 (`/metrics/monthly-flow`, `/read/monthly-flow`) | 새 합계 열 3개와 한국어 라벨. 흐름 줄 목록은 불변. 화면에서는 참고 행 "총지급 중 일회성", "경상 지급"으로 표시. |
| 흐름 비교 (`get_monthly_flow_comparison`) | 측정 배열 끝에 `one_off_total`, `ongoing_outflow`, `ongoing_living_spend`. 경상 기준값은 **월별로 일회성을 뺀 뒤 중앙값**(총지급 중앙값 − 일회성 중앙값 아님). 자료 없는 달은 `null`, 일회성만 있는 달의 경상은 0. |
| 변화 기여 (`get_change_contributions`, `/read/comparison/contributions`) | 새 인자 `one_off=exclude|include`, **기본 `exclude`**. exclude면 대상·기준·12개월 집계 모두 같은 조건(`one_off_event_id IS NULL`)으로 거르고 `change_total = 경상 대상액 − 경상 기준액`. 기존 `sum_item_changes`, `non_additive_gap`, 잘림 요약을 그대로 유지(전월 비교에서 잘리기 전 항목 변화 합 = `change_total`, 중앙값 비교에서는 차이 정상). 응답에 `one_off` 참고 블록: 같은 카테고리·조정 가능성·동일 경과일 조건에서 대상 기간 묶음별 금액과 합계, 기준 달별 일회성 금액. `basis`에 어느 지출을 비교하는지 밝힌다. |
| T062 연간성 월 환산 (`spending_limits_service`, 12개월 항목) | **첫 월별 SQL 집계 전에** 일회성 줄을 제외한 뒤 기존 양수월 판정과 등록 연간 약정 분리를 수행. |
| T062 한도 대비 | **실적에 포함(사용자 결정)**. 같은 응답과 카드에 `one_off_amount`("그중 일회성")를 함께 낸다. `difference_amount` 정의 불변. |
| 월말 전망 (`monthly_projection_service`) | `_load_expense_lines`에 `one_off_event_id` 추가. `_partition_lines`에서 **유효 일회성 줄을 미확정 매칭(대출 거래처 규칙, 할부 계획 매칭, 미확인 할부 표시)보다 먼저** `one_off` 부분으로 뗀다. 과거 기준월의 변동 기준선, 잔여일 중앙값, 연간성 후보, 조정 가능성 가중치, "대출 관련 미연결" 경고에서 제외. 진행월에 관측된 일회성은 관측 총액에 한 번 포함되고 남은 기간 가정에 외삽되지 않는다. 공개 구성요소 네 종류는 유지하며, 관측 쪽에서 일회성은 `variable` 실적에 포함됨을 문서화한다. 약정이 되어 귀속이 NULL이 되면 기존 경로로 복귀. |
| 되짚기 (`forecast_backtest.py`, `projection_accuracy_service`) | 일회성은 미래 가정에서만 제외, 관측 총액·구성요소 실적 합에는 보존. 관측 지출 일치·구성요소 합 일치 검사 유지. 별도 지표 `variable_ongoing_actual = variable_actual − one_off_actual` 추가. "현재 소속으로 과거를 재생한다"는 한계를 CLI 출력과 화면용 정확도 양쪽에 기록. |
| 사후 검토 (`/read/review-items`: 구매 후보·카테고리 이상) | 구매 후보: 원구매 기준 `purchase_net_amount` 후보 입력과 별도 거래처·카테고리 현재/과거 합계 SQL **양쪽에서** 일회성 소속 거래 제외. 카테고리 이상: 게시월 흐름 줄 기준으로 대상·기준 양쪽에서 유효 일회성 줄 제외. 두 탐지기의 기존 환불 기준 유지. |
| 순자산 대조 (T061), 비상금 개월 수 | 변경 없음. |

## 7. API

### 7.1 쓰기 (`X-API-Key` 필수)

```
POST   /api/v1/one-off-events                     {name, note?, transaction_ids?: [..]}  생성과 최초 추가를 한 트랜잭션 → 201
PATCH  /api/v1/one-off-events/{id}                {name?, note?}
DELETE /api/v1/one-off-events/{id}                소속만 지움, 거래 불변 → 204
POST   /api/v1/one-off-events/{id}/members        {transaction_ids: [..]}  전부 아니면 전무
DELETE /api/v1/one-off-events/{id}/members        {transaction_ids: [..]}  직접 소속만
```

- 실패 응답은 거래별 사유를 담는다: `not_found`, `inactive`, `not_expense`, `non_krw`, `committed`, `in_other_event`.

### 7.2 읽기

```
GET /api/v1/one-off-events          목록: id, name, note, direct_member_count, counted_total, first/last date, periods
GET /api/v1/one-off-events/{id}     상세: 직접 소속 거래(날짜, 거래처, 원문, 카테고리, 원 금액, member_status, inactive_reason),
                                    월별 귀속 금액(흐름 줄 기준, 다른 거래에서 배분돼 들어온 환불 포함), counted_total
GET /api/v1/read/one-off-events     에이전트 읽기 표면 — 같은 정의, read surface 공통 형식(basis, as_of, status). /read/index에 등록
```

- 거래 목록·상세 응답에 `one_off_event_id`, `one_off_event_name`(직접 소속).
- 거래 목록 필터: `one_off_event_id`, `one_off=true|false`. 금액→거래 드릴다운은 기존 `EXISTS` 방식으로 같은 흐름 줄에 모든 조건을 함께 적용한다.

## 8. 재가져오기와 되돌리기

- 교체 행(`possible_replacement`): `_move_transaction_relationships`에서 직접 소속을 새 거래로 옮긴다(성격 축·이체 목적과 같은 방식).
- 확정 환불 배분은 교체 때 옮겨지지 않는 기존 동작이다(이번 범위 밖). 원구매 교체와 환불 교체를 각각 테스트하고, 배분이 풀리면 상세 화면의 월별 귀속도 그 결과를 따른다는 것만 확인한다.
- 업로드 되돌리기는 `Base.metadata.sorted_tables`를 따르므로 이행 뒤 만든 PostgreSQL 복원점부터 새 표를 포함한다. 인수 조건: 이행 전 복원점은 `schema_changed`, 업로드 뒤 묶음 편집은 `ledger_changed`, 검토 업로드 준비와 적용 사이의 묶음 편집은 digest 불일치로 계획 무효, 정상 복원 시 소속 복원.

## 9. 프런트엔드

- **거래 화면** (`/data/transactions`): 기존 공용 체크박스 선택은 그대로 두고, "일회성 묶음에 추가" 동작(기존 묶음 선택 또는 새 이름으로 생성+추가)을 일괄 동작에 더한다. 자격 없는 거래가 섞이면 그 동작에만 사유를 표시한다. 거래 편집기에 직접 소속 표시와 빼기. URL 허용 목록에 새 필터.
- **작업대 새 화면** (`/data/one-off`, 내비게이션 "일회성 지출"): 묶음 목록·생성·이름/메모 변경·삭제, 상세(직접 소속 표와 `member_status` 배지, 월별 귀속 금액, 합계), 해당 거래 목록으로 이동.
- **월 결산**: 마감월·진행월 흐름표 양쪽에 참고 행 "총지급 중 일회성", "경상 지급". 흐름 줄 목록과 순자산 드릴다운은 불변.
- **최근 12개월 추이** (`TrendCard`, 사용자 결정): 기본은 **경상 지급** 막대, "일회성 포함" 전환 시 기존 수입·총지급·잔여. 경상 보기에서 실제 `residual`을 경상 막대의 차액처럼 그리지 않는다. 표에는 일회성 열과 "총지급 기준 잔여"를 둔다. 환불만 있는 달(음수 지출)의 부호 표시 확인(`CashflowChart`의 `Math.abs`).
- **지출 분석**: 변화 기여 카드는 기본 경상 비교, 아래에 일회성 참고 블록(묶음 이름, 금액). 한도 카드에 "그중 일회성".
- 묶음 편집 뒤 거래·월 흐름·비교·전망·검토·한도·묶음 쿼리를 무효화한다.
- 색만으로 뜻을 전하지 않는다(라벨 "일회성" 배지). 기존 Ledger DS 사용, 새 차트 라이브러리 없음.

## 10. 하지 않는 것

자동 탐지·추천, 거래 병합, 원본 행 수정, 새 `flow_row` 값, 스펜드 큐브 차원 추가, 내용연수 상각 배분, 아직 일어나지 않은 목돈의 계획 입력, 정산 배분의 교체 승계, 순자산 대조·비상금 지표 변경, 라이브 배포.

## 11. 구현 순서 (한 브랜치, 단계별 커밋, PR 하나)

1. 소속 표·쓰기/상세 API·흐름 줄 귀속·교체 이동·SQL 이행. 통과 조건: 두 묶음에 나뉜 환불, 전액 배분, 약정 전환, 동시 추가 409, 0045 왕복 복원.
2. 경상 지표·비교·기여·T062·사후 검토·읽기 표면. 일회성만 있는 달, 자료 없는 달, 전월 가산성, 월별 차감 뒤 중앙값, 동일 경과일, 잘림 전 합계를 SQLite·PostgreSQL 합성 사례로.
3. 전망·되짚기. 핵심: 진행월 계약금이 총지급에 한 번 포함되고 변동 지출이나 대출 상환으로 외삽되지 않음.
4. 프런트엔드 전체 흐름: 거래 다중 선택 → 묶음 생성·추가 → 상세에서 환불 반영 확인 → 제거 → 월 결산·지출 분석 즉시 반영.

## 12. 검증

- 위 단계별 합성 사례 + 소속 0건 회귀(2.1).
- 백엔드 `uv run pytest`, `ruff check`, `ruff format --check`. PostgreSQL 왕복 이행.
- 프런트엔드 `npm test`, `lint`, `typecheck`, `build`. 390·1280px 화면 확인.
- 개인 금융 값은 PR·문서에 싣지 않는다.
