# 에이전트 읽기 표면 이전 안내 (T060)

작성: 2026-11-15
상태: 새 읽기 표면 제공 중. 기존 엔드포인트는 하나도 지우지 않았다.

이 문서는 상담 에이전트의 읽기 도구가 지금 쓰는 엔드포인트와 필드를 새 읽기 표면(`/api/v1/read/*`)의 무엇으로 바꾸면 되는지, 아직 바꿀 곳이 없는 것은 무엇인지, 기존 엔드포인트를 언제 어떤 순서로 정리할지를 적는다. 계약의 자세한 내용은 [backend-api-ssot.md](../backend-api-ssot.md#agent-read-surface-t060)와 [canonical-read-surface-reference.md](canonical-read-surface-reference.md#에이전트-읽기-표면-t060)에 있다.

## 1. 원칙

- **지우지 않는다.** 기존 엔드포인트는 소비하는 에이전트 쪽 전환이 끝나고 사용자가 승인한 뒤에만 지운다. 이번 단계는 새 표면을 더하고, 정리 대상에 "폐기 예정" 표시만 붙였다.
- **본문과 상태 코드는 그대로다.** 폐기 예정 표시는 OpenAPI의 `deprecated: true`와 응답 헤더 두 개(`Deprecation: true`, `Link: <대체 경로>; rel="successor-version"`)뿐이다. 같은 합성 장부에서 기존 GET 엔드포인트 71개 호출의 본문이 바뀌기 전후 바이트 단위로 같음을 확인했다(`backend/tests/tools/read_surface_body_snapshot.py`).
- **가져오기 계약은 건드리지 않는다.** 아래 엔드포인트는 외부 가져오기 자동화가 엄격하게 검증하므로 표시도, 변경도 하지 않았다.
  - `POST /api/v1/upload`, `POST /api/v1/upload/preview`, `POST /api/v1/upload/apply`
  - `POST /api/v1/upload/review/prepare`, `GET /api/v1/upload/review/{operation_id}`, `POST /api/v1/upload/review/{operation_id}/decisions`, `POST /api/v1/upload/review/{operation_id}/apply`
  - `GET /api/v1/upload/rollback-points`, `POST /api/v1/upload/{upload_id}/rollback`
  - `GET /api/v1/upload/logs`
- 화면(프론트엔드)도 아직 폐기 예정 엔드포인트 일부를 쓴다(`canonical-views/dashboard`, `discretionary-velocity`, `purchase-gate-candidates`·`spending-review-candidates`, `spending-anomalies`, `category-mom`, `installments/forecast`). 화면 재편(`T058`, `T059`)이 끝나기 전에는 지울 수 없다.

## 2. 새 읽기 표면

모든 경로는 `X-API-Key`가 필요하고 읽기 전용이다. `GET /api/v1/read/index`가 아래 목록을 그대로 돌려준다.

| 이름 | 경로 | 답하는 질문 | 정의 |
|---|---|---|---|
| 색인 | `/api/v1/read/index` | — | `read_surface.v1` |
| 월 흐름표 | `/api/v1/read/monthly-flow` | Q1 | `monthly_flow.v2` |
| 지출 큐브 질의 | `/api/v1/read/spend-cube` | Q1, Q3 | `spend_cube.v2` |
| 월 흐름표 비교 | `/api/v1/read/comparison/monthly-flow` | Q1, Q2 | `comparison.v1` |
| 변화 기여 | `/api/v1/read/comparison/contributions` | Q2, Q3 | `comparison.v1` |
| 사후 검토할 거래 | `/api/v1/read/review-items` | Q2, Q3 | `review_items.v1` |
| 약정 목록 | `/api/v1/read/commitments` | Q4 | `commitments.v1` |
| 순자산 대조 | (예약됨) | Q5 | `T061`이 제공 |
| 자료 현황 | `/api/v1/read/data-status` | Q6 | `data_status.v1` |

## 3. 지금 읽기 도구가 기대하는 것과 바꿀 곳

읽기 도구의 요약 단계는 큰 대시보드 응답의 구역 이름(목록마다 `count`와 앞쪽 몇 줄)과, 자산·대출·투자·보험·프로필 응답의 스냅샷 날짜를 따로 읽는다. 아래 표는 엔드포인트와 필드 단위로 바꿀 곳을 적는다. "대체 없음"은 아직 새 표면에 자리가 없다는 뜻이며, 그 엔드포인트는 계속 쓴다.

### 3.1 큰 대시보드 `GET /api/v1/canonical-views/dashboard` (폐기 예정)

| 지금 쓰는 구역·필드 | 새 표면 | 비고 |
|---|---|---|
| `data_coverage`, `reference_date`, `generated_at` | `/read/data-status`의 `as_of`(거래 기준일, 마감월, 진행월, 종류별 스냅샷 기준일), `data.transaction_coverage`, `data.coverage_gaps` | 모든 새 응답이 같은 `as_of`를 싣는다. 생성 시각은 싣지 않는다. |
| `monthly_cashflow[]` | `/read/monthly-flow`의 `data.items[]` | 이름이 바뀐다: `expense_total` → `total_outflow`(대출 포함 총지급), `non_loan_expense_total` → `living_spend`, `loan_repayment_total` → `committed_loan_total`, `net_cashflow` → `residual`, `savings_rate` → `residual_rate`(마감월만), `unclassified_expense_total` → `adjustability_undecided_total`. 고정비·변동비 합계는 `committed_total`과 수시 지출 줄로 대신한다. |
| `true_spendable_monthly[]` | 대체 없음(정리 대상). `residual`과 `adjustable_spend`로 대신한다. | 계획 3.3. |
| `loan_repayment_monthly[]` | `/read/commitments`의 대출 항목(기간별 `observation.observed_amount`), `/read/monthly-flow`의 `committed_loan_total` | 상환 유형(원금·이자) 구분 합계는 새 표면에 없다. 원리금을 나누지 않는다는 계획 2.3을 따른다. |
| `merchant_monthly_baseline[]` | `/read/comparison/contributions?level=merchant` | 3개월 평균 대신 비교 계약(최근 마감월 중앙값). |
| `recurring_merchant_monthly[]` | `/read/commitments`의 정기 지급 항목 | 사람이 등록한 묶음만 나온다. 등록되지 않은 반복 거래처를 찾아 주는 목록은 없다(추천 금지). |
| `unclassified_work_queue[]` | `/read/data-status`의 `data.classification`(미정 금액·비중·건수) | 거래별 작업 목록은 작업대 기능이라 읽기 표면에 두지 않는다. 목록이 필요하면 이 구역을 계속 쓴다. |
| `month_projection`, 진행월 예상 수입 필드(`income_basis` 등) | 대체 없음 | 월말 순현금흐름 전망은 유지 대상이다. 수정 단계(`T064`)가 승인되기 전까지 이 응답에만 있다. 이 때문에 대시보드는 전망이 옮겨질 때까지 지울 수 없다. |

### 3.2 분석 엔드포인트

| 지금 | 새 표면 | 폐기 예정 표시 |
|---|---|---|
| `GET /analytics/discretionary-velocity` | `/read/comparison/monthly-flow`(진행월은 같은 경과일 누적 비교) | 표시함 |
| `GET /analytics/spending-anomalies` | `/read/review-items`의 `subject=category_month` 항목, `/read/comparison/contributions` | 표시함 |
| `GET /analytics/purchase-gate-candidates`, `GET /analytics/spending-review-candidates` | `/read/review-items`의 `subject=transaction` 항목 | 표시함. 검토 상태를 쓰는 `PATCH .../review`는 쓰기라 그대로 둔다. |
| `GET /analytics/category-mom` | `/read/comparison/contributions` | 표시함(분석별 기준선 정리) |
| `GET /installments/forecast` | `/read/commitments`의 할부 항목 | 표시함. `missed`는 관측 여부 상태로 바뀐다. 앞으로의 회차(`projected`)는 내지 않는다(전망 아님). 남은 회차와 마지막 회차 예정일은 `remaining_count`, `end_date`로 읽는다. |
| `GET /analytics/liquidity-health` | 대체 없음 | 표시하지 않음. 계획 3.3에 따라 재무상태(`T061`)로 옮겨진 뒤 표시한다. |
| `GET /analytics/monthly-cashflow` | `/read/monthly-flow` | 표시하지 않음(3.3 목록 밖). 다음 정리 단계에서 정한다. |
| `GET /analytics/fixed-cost-summary`, `GET /analytics/fixed-cost-trend` | `/read/monthly-flow`의 약정 지급 줄 | 표시하지 않음. "고정비"의 뜻이 약정 지급으로 바뀌어 값이 같지 않다. |
| `GET /analytics/merchant-spend` | `/read/spend-cube?group_by=effective_category_major,merchant` | 표시하지 않음 |
| `GET /analytics/recurring-payments` | 부분: `/read/commitments`(등록된 묶음) | 표시하지 않음. 반복 탐지 목록은 대체 없음. |
| `GET /analytics/income-stability` | 대체 없음 | 표시하지 않음. 수입의 정기·비정기 구분 근거가 아직 없다. |
| `GET /analytics/payment-method-patterns` | 대체 없음 | 표시하지 않음. 지출 큐브에 결제 수단 차원이 없다. |

### 3.3 스냅샷·약정 원천 엔드포인트

| 지금 | 새 표면 | 비고 |
|---|---|---|
| `GET /loans/summary`, `GET /loan-accounts` | 부분: `/read/commitments`의 대출 항목(월 부담, 만기, 진행·종료), `/read/data-status`의 대출 스냅샷 기준일 | 잔액과 금리는 재무상태 쪽(`T061`). 계속 쓴다. |
| `GET /assets/snapshot-compare`, `GET /assets/snapshots`, `GET /assets/net-worth-history`, `GET /analytics/net-worth-breakdown`, `GET /investments/summary`, `GET /insurance/summary`, `GET /profile` | 대체 없음(Q5는 `T061`). 종류별 기준일만 `/read/data-status`의 `data.snapshots[]` | 계속 쓴다. |
| `GET /installment-plans`, `GET /installment-transaction-links`, `GET /loan-transaction-links` | 부분: `/read/commitments` | 연결 단위 목록은 작업대 용도로 남는다. |
| `GET /transactions` 및 `/transactions/summary` 등 | 집계는 `/read/monthly-flow`, `/read/spend-cube` | 거래 목록 자체는 특정 거래를 확인할 때만 쓴다. 전체 수집은 더 필요 없다. |
| `GET /schema`, `GET /health`, `GET /settings/analytics`, `GET /auto-classification/settings` | 해당 없음 | 분석 값이 아니다. 그대로 쓴다. |
| `GET /upload/logs` | 해당 없음 | 가져오기 계약. 그대로 쓴다. |

## 4. 기존 응답의 형식 불일치(고치지 않고 기록만)

새 표면 밖의 기존 응답은 필드 이름과 타입을 바꾸지 않았다. 새 표면으로 옮기면 아래가 해소된다.

- 금액 타입이 섞여 있다. 대출·스냅샷 응답의 `Decimal` 필드(예: `latest_balance`, `latest_interest_rate`, 스냅샷 금액)는 JSON에서 문자열로 나가고, 거래 집계는 정수다.
- 비율 표기가 섞여 있다. 대부분 0–1 비율이지만 `spending-anomalies`의 `delta_pct`는 백분율 값이다.
- 가정 표기가 섞여 있다. `spending-anomalies`의 `assumptions`는 문자열 하나, 다른 분석은 문자열 목록이다.
- 기준일 이름이 제각각이다: `reference_date`, `as_of_date`, `transaction_as_of`, `snapshot_date`.
- 기간 파라미터가 둘이다: 분석은 `start_date`/`end_date`, 지표는 `start_period`/`end_period`.
- 언어가 섞여 있다. 영문 열거값(`risk_level`, `baseline_quality`, `status`)에 한국어 이름이 없거나, 한국어 문장(`reason`)만 있고 안정 키가 없다.
- 할부 전망의 `missed`는 "연결 미확인"인데 이름이 미납처럼 읽힌다.
- 목록 형식이 둘이다: `total/page/per_page` 페이지와 `limit`.
- 상태 구분이 없다. 자료가 없을 때 빈 목록이나 0을 돌려주는 응답이 많아, 가져오지 않은 기간과 거래 0건인 기간과 분류 미완을 구분할 수 없다.
- 인증이 섞여 있다. 많은 분석 읽기가 `X-API-Key` 없이 열린다(정리는 `T063`).

## 5. 정리 순서(제안)

1. **지금**: 새 표면 제공, 정리 대상 7개에 폐기 예정 표시. 아무것도 지우지 않는다.
2. **읽기 도구 전환**: 상담 에이전트의 요약 단계를 `index` → `data-status` → `monthly-flow` → `commitments` → `review-items` → `comparison/contributions` 순으로 바꾼다. 가져오기·검토·되돌리기 도구는 바꾸지 않는다. 전환 뒤 폐기 예정 경로 호출이 남지 않았는지 응답 헤더(`Deprecation`)나 서버 로그로 확인한다.
3. **화면 전환**: `T058`, `T059`에서 화면이 폐기 예정 경로를 더는 부르지 않게 한다.
4. **재무상태**: `T061`의 순자산 대조가 들어오면 색인의 예약 항목을 채우고 `liquidity-health`에 폐기 예정 표시를 단다.
5. **전망 자리 정하기**: `T064` 수정 단계가 승인되면 월말 순현금흐름 전망을 읽을 자리를 정한다. 그 전에는 대시보드를 지우지 않는다.
6. **제거**: 위가 끝난 묶음부터 사용자 승인을 받아 한 묶음씩 지운다. 순서는 (가) `discretionary-velocity`, (나) `purchase-gate-candidates`·`spending-review-candidates`·`spending-anomalies`, (다) `category-mom`, (라) `installments/forecast`, (마) 큰 대시보드.

## 6. 바꾸면서 확인할 것

- 새 응답의 `status`가 `ok`가 아니면 그 이유(`status_reasons`)를 답에 함께 밝힌다. 특히 `classification_incomplete`는 보호·조정 가능 합계가 미정 금액만큼 덜 잡혔다는 뜻이다.
- 진행월은 부분 기록이다. 비율 지표와 전월 전체 대비 증감을 내지 않는다.
- 약정 목록의 "관측 안 됨"은 연결된 거래가 기록에 없다는 뜻이다. 지급하지 않았다는 증거로 쓰지 않는다.
- 스냅샷 기준일은 종류마다 다르다. 하나로 합치지 않는다.
