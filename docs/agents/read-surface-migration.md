# 에이전트 읽기 표면 이전 안내 (T060)

## T056 승인된 컬럼 삭제 (2026-11-17, PR B)

이 절이 PR A의 원시 컬럼 보관 설명보다 우선한다. `20261117_0042`는 `20261117_0041` 뒤에서 `transactions.cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`, `cost_classification_source`를 삭제한다. `/schema` 원시 거래 표에서도 이 다섯 필드는 사라진다. 뷰 제거·투영 제거는 PR A에서 끝났으며 B는 뷰를 바꾸지 않는다. 과거 규칙 표와 설정 기록은 동결 보관한다.

[영향 분석](t056-drop-impact.md)과 [건수 전용 SQL](t056-drop-preflight.sql)을 따른다. 삭제는 새 축에 보존되지 않은 이전 사람 분류의 건수가 하나라도 있으면 거절된다. pending/processing 가져오기도 거절한다. 준비 검토는 stale, 기존 ready 되돌리기 지점은 expired가 되어 재사용할 수 없다(강제 복원도 불가). 스냅샷·지문·업로드 로그·원본 증거는 보관하며 새로 준비한 검토와 이행 뒤 만든 되돌리기 지점은 새 구조를 쓴다. HTTP 입력·응답 구조와 상태코드는 기존 계약을 유지한다.

downgrade는 nullable 컬럼만 재생성하고 삭제한 값이나 이전 승인·되돌리기 유효성은 복원하지 않는다. 새 축과 `/read/*`·흐름표·큐브의 값은 유지한다. 외부 에이전트 되돌리기 도우미와 SQL 소비자는 이름 변경 목록을 검토자가 점검해야 한다. 이 문서의 구현은 검토·병합 전이며 배포하지 않았다.


## T056 입력·이전 읽기 표면 제거 (2026-11-17, PR A)

이 절이 아래의 이전 분류 호환 설명보다 우선한다. [전체 경로별 결정과 뷰 변경 목록](t056-classification-retirement.md)을 따른다. `cost_kind`, `fixed_cost_necessity`, `spend_necessity`, `recurring_payment_kind`, `cost_classification_source`는 거래 응답·생성·단건/일괄 수정에서 제거되며 옛 입력과 필터는 422다. `/nature/transactions/{id}.legacy`와 할부 응답의 `recurring_payment_kind`도 제거된다. 변동비·재량·반복 아님을 기본 저장하지 않는다.

GET `analytics/fixed-cost-summary`, `analytics/fixed-cost-trend`, `analytics/recurring-payments` 및 category/recurring 자동 분류 규칙 CRUD·apply·dry-run은 404다. 후속은 `/read/monthly-flow`, `/read/spend-cube`, `/read/commitments`와 사람이 입력하는 `/nature/*`다. 같은 이름으로 근사값을 내지 않는다. 자동 분류 설정에는 대출 규칙만 남고, `settings/analytics`의 `recurring_dry_run`은 읽기 보관용이며 수정은 422다. 거래처 정규화와 대출 연결은 유지한다.

`20261117_0041`은 가역적인 뷰 전용 이행이다. 원시 거래의 이전 컬럼은 legacy/frozen 보관이며 아직 삭제하지 않는다. `/schema`는 이를 표시하고 폐기된 뷰 필드는 더 열거하지 않는다. 아래의 옛 필드·산식·입력 설명은 이행 배경 기록이며 현재 계약이 아니다. 가져오기 HTTP 계약과 새 축·흐름표·큐브·`/read/*` 금융 값은 유지한다. 배포하지 않았다.


작성: 2026-11-15 · 최종 상태: 2026-11-17 승인된 제거 구현, PR 검토·병합 전. 이 문서는 저장소 계약이며 배포 완료를 뜻하지 않는다.

소비 에이전트 전환과 소유자 승인이라는 T060 제거 조건이 충족되어, 폐기 예고했던 GET 7개를 제거했다. 가져오기·검토 적용·되돌리기·쓰기·`/schema` 계약, DB 뷰와 컬럼은 그대로다. 기존 값의 정의를 새 값과 같다고 가정하지 않는다.

## 1. 제거된 경로와 후속 표면

모두 `/api/v1` 아래다. 제거된 경로는 인증 여부와 관계없이 404다. 구현 순서는 재량 속도 → 후보·이상 지출 → 카테고리 전월비 → 할부 전망 → 큰 대시보드다.

| 제거된 GET | 후속 GET | 읽을 값과 차이 |
|---|---|---|
| `/analytics/discretionary-velocity` | `/read/comparison/monthly-flow` | `data.comparison`, `data.measures[]`. 진행월은 같은 경과일 누적 비교. 예전 구매 순액의 월평균 속도 비율과 같지 않다. |
| `/analytics/purchase-gate-candidates` | `/read/review-items` | `data.items[]`, `subject=transaction`, `listed_because[]`. 사후 검토 이유이며 구매 허용 판단이 아니다. |
| `/analytics/spending-review-candidates` | `/read/review-items` | 위와 같다. `candidate_key`로 검토 상태를 쓸 때의 PATCH 경로는 유지한다. |
| `/analytics/spending-anomalies` | `/read/review-items`, `/read/comparison/contributions` | 카테고리 항목은 `subject=category_month`. 상세 변화는 `data.items[]`, `data.twelve_month_items[]`. 검출 서비스는 재사용하므로 보존했다. |
| `/analytics/category-mom` | `/read/comparison/contributions?baseline=previous_month` | `data.comparison.baseline_periods`, `data.items[].target_amount/baseline_amount/change_amount`. 기본은 최근 마감월 중앙값이다. |
| `/installments/forecast` | `/read/commitments?period=YYYY-MM` | `data.items[kind=installment]`: `monthly_burden`, `remaining_count`, `end_date`, `observation`. 앞으로의 회차별 출금 전망은 제거했다. 관측 안 됨·연결 미확인은 미납 증거가 아니다. |
| `/canonical-views/dashboard` | `/read/index`로 필요한 작은 표면 탐색 | 아래 필드 대응표. 전망도 전용 표면으로 옮겼으므로 큰 응답이 더 필요 없다. |

## 2. 큰 대시보드의 필드 대응

| 예전 필드 | 현재 위치 | 의미 |
|---|---|---|
| `month_projection` | `GET /api/v1/read/month-projection`의 **`data`** | 동일한 `MonthlyProjection` 객체. 단일 `get_monthly_projection` 계산을 그대로 호출한다. |
| `metric_as_of` | 같은 응답의 `as_of` | 거래 기준일·첫 거래일·마감월·진행월·종류별 스냅샷 날짜. `transaction_as_of_basis`도 그대로 `as_of` 안에 보존했다. |
| `data_coverage.first_transaction_date` | 같은 응답의 `as_of.first_transaction_date` 또는 `/read/data-status.data.transaction_coverage.first_transaction_date` | 전체 유효 자료의 첫 날짜. |
| `data_coverage.last_transaction_date` | 같은 응답의 `as_of.transaction_as_of` 또는 `/read/data-status.data.transaction_coverage.transaction_as_of` | 이름이 바뀐다. 사이 기간의 수집 완전성을 보증하지 않는다. |
| `monthly_cashflow[]` | `/read/monthly-flow.data.items[]` | `expense_total` → `total_outflow`, `non_loan_expense_total` → `living_spend`, `loan_repayment_total` → `committed_loan_total`, `net_cashflow` → `residual`, `savings_rate` → `residual_rate`(마감월만). 고정/변동 분해 대신 약정/수시와 보호/조정 가능/미정을 쓴다. |
| `true_spendable_monthly[]` | 제거. `/read/monthly-flow.data.items[].residual`, `adjustable_spend` | 실제 잔액·구매 가능액으로 대응시키지 않는다. |
| `loan_repayment_monthly[]`, `recurring_merchant_monthly[]` | `/read/commitments.data.items[]` | 등록한 약정과 선택 월의 관측. 대출의 원금·이자를 추정해서 나누지 않는다. |
| `merchant_monthly_baseline[]` | `/read/comparison/contributions?level=merchant`의 `data.items[]` | 카테고리를 유지한 거래처 비교. 예전 앞선 3행 평균과 정의가 다르다. |
| `unclassified_work_queue[]`와 페이지 정보 | `/read/data-status.data.classification`, 작업대 `/metrics/spend-cube?adjustability=undecided`, 필요 거래 `/transactions` | 옛 분류 큐는 제거. 사람이 분류하며 시스템이 값을 제안하거나 미리 고르지 않는다. |
| `generated_at` | 없음 | 요청 생성 시각을 자료 기준일로 쓰지 않는다. |

## 3. 전용 월말 전망 계약

`GET /api/v1/read/month-projection?reference_date=YYYY-MM-DD`는 `X-API-Key`가 필요하며 읽기 전용이다. `ReadMonthProjectionResponse`는 `/read/*`와 같은 봉투(`surface`, `status`, `status_reasons`, `as_of`, `period_scope`, `classification`, `basis`, `labels`, `data`)를 쓴다.

- `reference_date`를 주면 `data.as_of_basis=requested_date`. 생략하면 기존과 같이 거래 기준일을 따르고, 같은 달의 더 늦은 성공 업로드 기준일이 있으면 그날까지다. 자료가 없으면 `today_no_data`다.
- **`data.as_of_date`는 전망 기준일**, 봉투 `as_of`는 전체 반영 자료의 기준일이다. 과거 날짜 요청으로 현재 분류·연결 설정까지 과거로 되돌리지는 않는다.
- `data.coverage`는 전망 근거 기간과 관측 범위다. `period_scope.periods[].data_coverage`는 달 전체/부분/거래 기록 없음(추정)/범위 밖을 구분한다.
- `status=ok`는 전체 전망 보증이 아니다. 반드시 `data.completeness.full_projection_available`, `amount_scope`, `left_out[]`를 함께 읽는다. `false`인데 숫자가 있으면 일부 구성 요소만의 합이다. `null`은 0원이 아니다.
- 같은 관측·가정·누락 이유·분류 미정 비중을 보존했다. 두 번째 전망 계산은 없다. 전망은 해당 월말을 넘지 않는다.
- 인증 실패 401, 조회 실패 503(`status=query_failed`), 잘못된 날짜·알 수 없는 인자 422. 422는 다른 읽기 표면과 같은 `detail` 오류 배열이다. 비교의 틀린 `baseline` 등 열거값도 같은 배열로 거절한다.
- `GET /api/v1/canonical-views/month-projection/accuracy`는 **폐기 대상이 아니며 경로와 본문을 그대로 유지**했다.

## 4. 남긴 표면

`GET /api/v1/analytics/liquidity-health`는 제거하지 않았다. 화면이 `/metrics/net-worth/emergency-fund`를 쓰므로 이번에 OpenAPI `deprecated: true`, `Deprecation: true`, `Link: </api/v1/metrics/net-worth/emergency-fund>; rel="successor-version"`를 붙였다. 본문과 상태 코드는 그대로다. 후속의 분모는 월 보호 지급이며 예전 분모와 같지 않다.

정리 대상 밖의 분석·스냅샷·원천 조회, 소득 예상 설정 GET/PATCH, 검토 상태 PATCH는 유지했다. `/upload/*`의 요청·응답과 상태값, `/schema`와 모든 쓰기 API는 변경하지 않았다. DB 뷰·컬럼 제거와 인증 경계(T063)는 후속 범위다.

## 5. 에이전트 클라이언트가 바꿀 것

1. `/canonical-views/dashboard` → `/read/month-projection`. `response.month_projection` → **`response.data`**. `reference_date`는 그대로 전달한다.
2. `response.metric_as_of` → `response.as_of`; `response.data_coverage.first_transaction_date` → `response.as_of.first_transaction_date`; `response.data_coverage.last_transaction_date` → `response.as_of.transaction_as_of`.
3. `/canonical-views/month-projection/accuracy`는 그대로 호출한다.
4. 남은 옛 명령은 1절의 작은 표면으로 바꾸거나 삭제한다. import/review/approval/rollback/mail/cron 작업은 이 PR의 변경 대상이 아니다. 외부 에이전트 저장소는 별도 검토자가 처리한다.
5. 봉투 상태와 전망 완성도는 서로 다른 사실이다. 부분 합계·누락 이유, 진행월 부분 기록, 비중 보류 사유를 답에 함께 밝힌다. 순자산 `status=complete`도 모든 차이가 설명되었다는 뜻은 아니다.

## 6. 검증과 변경 키

합성 장부로 제거 전후 GET 응답을 비교한다(`backend/tests/tools/read_surface_body_snapshot.py`). 제거된 경로는 404를 확인하고, 남은 응답은 바이트 동등성을 확인한다. 허용한 본문 차이는 금융 값이 아닌 다음 발견용 메타데이터뿐이다.

- `/read/index.entries[key=month_end_projection]`: `path`, `response_field`, `notes`.
- `/read/data-status.data.month_end_forecast`: `path`, `field`, `note`.
- 새 경로의 `data`는 제거 전 `dashboard.month_projection` 객체와 같다. 정확도와 나머지 금융 값은 바꾸지 않았다.

예전 폐기 예고 시점(2026-11-15)의 71회 본문 동등성 검증과 T054/T057의 기준선 호환 예외는 당시 이력이다. 이번 제거로 HTTP 호환 예외는 끝났고, 남겨 둔 SQL 뷰는 그대로다.
