# Live 화면·DB 교차 검토

관측일: 2026-10-22. [종합 판단과 코드 감사](README.md)의 추가 근거다. 실제 발생한 문제, 의도된 보호 동작의 UX 부족, 검토 후보, 합성 재현된 잠재 결함을 구분한다.

## 조사 방법과 보호 범위

13개 route를 실제 배포 화면에서 직접 열었다. 데스크톱 1440×900의 DOM과 화면을 확인했고 거래 상세, 대출·할부·규칙의 하위 탭도 살폈다. 거래 상세의 focus를 별도로 확인했다. 쓰기 버튼의 성공 여부는 검증하지 않았다. 모바일 viewport API가 없어 모바일 렌더는 미검증이다.

DB는 readonly 역할, `default_transaction_read_only=on`, `BEGIN READ ONLY`, 10초 statement timeout으로 조회하고 ROLLBACK했다. 대표 집계는 분야별 검토와 통합 검토에서 각각 실행해 같은 결과를 얻었다. API는 서비스의 조회 전용 경로를 확인한 뒤 필요한 GET만 사용했다. refresh·연결 변경·분류·업로드·초기화는 실행하지 않았다.

이 문서는 재현에 필요한 건수·비율·상태·기준일만 기록한다. 운영 주소·개인 금액·계좌명·거래처·행 ID·비밀·원본 화면은 보관하지 않는다. 아래 관측은 해당 시점의 장부 상태이며 전체 고객에게 발생하는 비율이 아니다.

## 13개 화면별 관찰과 개선 방향

| 화면 | 직접 확인한 범위 | 개선 방향 및 관련 근거 |
|---|---|---|
| 홈 `/` | 관측/전망, 낮은 신뢰도 표시, 긴 전망 근거, 하단 품질 작업 | 관측 기준일·현재 상태·해결할 작업을 먼저. 전망 상세는 접기. 전체 검토 큐와 분류율의 분모 분리(L02). |
| 지출 `/spending` | 지출 분석과 렌즈 화면 | 현금흐름·구매 순액·대출 제외 기준을 일관되게 명시. 환불 월 귀속은 F03 계약 확정 후 반영. 화면이 열렸다는 사실로 수치 정확성을 보증하지 않음. |
| 자산·부채 `/net-worth` | 순자산·자산/부채 요약 | 확정값과 추정 불가 이유, 서로 다른 평가일을 한곳에서 설명. 자산 매핑 해결 흐름으로 연결(L03/L04). |
| 신호 `/signals` | 주의·데이터 품질 신호 화면 | 문제 나열에서 관련 원본/수정 화면으로 이어지게 설계. 신호를 최종 금융 판단으로 표현하지 않음. |
| 인박스 `/data/inbox` | 긴 거래 카드 큐, 반복 성격 미지정, 100% 커버리지 | issue별 큐와 기간 선택, series 단위 처리, 실제 미입력 항목만 강조. L02. |
| 거래 `/data/transactions` | 목록·필터·선택, 상세 열기/닫기와 focus | 명시적 키보드 편집 진입, dialog focus 경계, 편집 초안·조회 맥락 보존. FE-06/07/09. |
| 대출 `/data/loans` | 계좌·거래 연결·규칙 탭 | 추정과 계약값 구분, 유형/연결 범위 검토 후보(L05), 필터 변경 시 숨은 선택 제거(FE-04). 규칙을 같은 패턴으로 다시 저장해야 하는 흐름 대신 명시적 편집 진입. |
| 할부 `/data/installments` | 계획·전망 탭 | 계획 금액/실제 연결 거래/남은 전망의 근거와 차이 설명. 연결 상태와 조회 필터 보존을 함께 검증할 것. |
| 자산 메타 `/data/assets` | 최신 스냅샷의 유동성·현금성 설정 폼 | 자동/포함/제외의 의미와 적용 기준일 설명, 변경 초안 이탈 보호. 소스 선택·교체 범위 안내는 자산·부채 및 설정에서 연결(L03/L04). |
| 규칙 `/data/rules` | 분류·별칭·반복 규칙 탭 | 전체 적용 전 변경 대상·사용자 override 처리·되돌림 범위를 preview. 반복 후보를 곧바로 계약으로 간주하지 않음(FE-08/F10). |
| 설정 `/data/settings` | 분석·소스 정책 등 설정 폼 | 내부 알고리즘 문자열 자유입력을 한국어 선택지·예시로 전환. source preview/token 기반 승인은 다른 화면의 기준으로 재사용. |
| 가져오기 `/data/import` | 파일·기준일 입력과 미리보기 생성 진입 UI, 최근 이력, 초기화 영역 | 거래+스냅샷 영향 승인, 파일/날짜 race 방지, 원본 준비 안내, 단계별 이력과 과거 실패 조회(L06). |
| 데이터 사전 `/data/reference` | canonical 관측 실적·전망·기준 설명 | 진행월의 과도한 저축률 대표 표시를 실제 확인(L01). 전문 사전과 일상 사용의 탐색 우선순위를 분리. |

표의 개선 방향 중 사용자 평가가 필요한 재배치·정보 밀도 제안은 UX 가설이다. 클릭률·작업시간 향상을 이미 실측한 결과가 아니다.

## 현재 데이터에서 확인한 문제와 검토 과제

### L01 · P1 — 진행월의 저축률 대표값이 T023 계약과 어긋남

데이터 사전의 대표 카드에서 과도한 음수 저축률을 확인했다. DB에서도 진행월 수입은 양수지만 최근 6개 마감월 수입 중앙값의 절반 미만이고, 저축률 절대값이 10을 초과했다. 개인 원금액과 원비율은 기록하지 않았다.

`backend/app/services/canonical_views_dashboard_service.py:66–82`는 수입이 양수이면 진행월에도 `observed_partial_month`를 부여하고 비율을 유지한다. `frontend/src/features/data/ReferencePage.tsx:82–87`은 이를 대표 카드로 표시한다. frontend에 `insufficient_partial_month_income` 설명은 있지만 이 backend 경로는 해당 basis를 만들지 않는다. 기존 T023은 이런 진행월 대표값을 null 또는 estimated/insufficient basis로 표현하도록 요구한다. 홈의 마감월 중심 표시와도 소비 기준이 다르다.

**개선·완료 기준:** raw 관측 비율은 상세 근거로 보존하고, 대표 저축률은 수입 수집 충분성을 판정한 뒤 제공한다. 수입 0/적은 양수/평상 수준/마감월 fixture에서 home·reference·agent API의 basis 계약이 일치해야 한다. 임의로 0%로 보정하지 않는다. T045에 포함한다.

### L02 · P1 — “미분류”와 “커버리지 100%”가 다른 작업을 뜻함

인박스는 2,143행이고 1,912행(89.2%)은 반복 성격만 미지정이다. 전체 반복 flag 2,087행, 고정/변동 누락 133행, 고정비 필요도 44행, 지출 필요도 45행, 대출 연결 검토 53행이며 flag는 중복된다. 이번 달 큐는 79행, 1년 이상 지난 큐는 639행이다.

반복 성격만 남은 큐의 대부분은 변동비이며 환불·0금액도 포함한다. DB view는 동일 거래처에 지출이 두 번 이상 있으면 후보로 포함한다. 1,912개의 반복계약이 발견되었다는 뜻이 아니다. 실제 화면에서는 이미 채워진 분류와 필요도까지 함께 노출돼 무엇을 해결해야 하는지 흐려진다.

반면 `analytics_service.py:789–909`의 coverage는 **이번 달 비대출 지출액의 필요도 분류 비율**이다. DB 재계산은 0.9991이었고 화면은 정수 백분율 100%로 표시한다. 재계산은 기본 제외 목록 기준이며 API 개별 설정의 추가 제외까지 재현한 값은 아니다. 어느 경우에도 전기간 큐 완료율과 같은 분모가 아니다.

**개선·완료 기준:** `이번 달 지출액 필요도 분류율`로 이름·기간·분모를 표시하고 정확히 1일 때만 완료 100%로 표현한다. 인박스는 같은 필터의 처리 행/미처리 행으로 별도 완료율을 제공한다. issue별 count·중복, 실제 미입력 필드, 비반복으로 확인/기억, series 묶음 검토를 제공한다. 환불·0금액 큐 정책을 명시한다. T048 및 기존 T035/T036에 연결한다.

### L03 · P1 — 최신 파일을 넣어도 선택된 투자 소스는 오래된 상태

선택된 외부 투자 평가일은 9월 25일이고 최신 파일 snapshot은 10월 17일이다. 관측일 기준 외부 평가는 27일 전이며 정책의 stale 기준은 7일이다. 선택 계좌 2개 중 stale 1개, conflict 1개, mixed dates가 있다. 외부 run은 2개 모두 성공했지만 이후 새 ingestion은 없다.

API는 날짜 차이와 stale 경고를 제공하므로 단순 계산 오류가 아니다. `asset_source_service.py:464–491`의 정책에 따른 선택이다. 최근 파일 업로드가 선택 소스까지 갱신한다는 사용자 기대와 차이가 생길 수 있다.

**개선·완료 기준:** 최신 성공/최근 시도/선택 이유와 `수집 재시도`, `정책 유지`, `다른 소스 검토`를 연결한다. 완전성 complete와 freshness를 분리한다. 오래된 계좌에서 한 번의 이동으로 해당 소스의 진단에 도달하고, 갱신 실패 때 마지막 성공과 실패 시각을 구분한다. 감사 중 새 수집은 실행하지 않았다. 조용한 fallback은 제안하지 않는다. T048/T016A/T018 연계.

### L04 · P1 — 수집·계좌 연결 완료와 순자산 적용 완료가 다름

API에서 `investment_total_complete=true`, 확정 순자산 존재, 추정 순자산 null이다. 확인된 mapping 1개가 `holdings_only`이지만 교체 자산 component 배열이 비어 있다. `net_worth_replacement_scope_unconfirmed` 상태와 DB가 일치한다. coverage의 raw 129/selected 10/excluded 119는 역사 관측·비선택 소스를 포함하므로 손실률로 해석하면 안 된다.

`asset_source_service.py:492–528`의 null 처리는 중복 순자산을 막는 올바른 보호 장치다. 문제는 사용자가 연결을 마쳤다고 생각한 뒤에도 무엇이 남았는지 파악하기 어렵다는 것이다.

**개선·완료 기준:** 인증→수집→계좌 연결→자산/예수금 교체 범위→추정 가능의 단계를 표시한다. 현재 상태를 `수집 완료 / 순자산 적용 미완료`로 구분하고 component 편집·영향 preview로 연결한다. 중복 component, 미존재 자산, cash scope 미확정은 계속 차단한다. T048/T046 및 기존 T015–T018 연계.

### L05 · P1 — 대출 값이 채워져 있어도 검토할 추정 전제가 남음

최신 대출 4개는 모두 연결 거래에서 월상환액을 추정하며 금리·만기·월상환액 누락은 없다. 그중 1개는 원본에 한도대출을 시사하는 표현이 있으나 kind는 `other`이고, 월상환 추정이 현재 잔액·금리의 단순 월이자보다 작다. 이는 과거 사용잔액·일할 계산·이자만 연결한 범위 등으로 설명될 수 있으므로 부족상환이나 잘못된 금리로 단정하지 않는다.

`loan_mapping_service.py:1027–1127`은 kind에 따라 관측월 중앙값 또는 최근 평균을 사용한다. 종류·연결 범위의 불확실성이 존재할 때 값이 있다는 사실만으로 확인이 끝난 것으로 표현하지 않아야 한다.

또한 과거 snapshot의 manual 표기가 이후 자동 추정으로 바뀐 흔적은 있지만, `20260531_0024_add_loan_repayment_metadata_sources.py:29–40`가 이전 값을 manual로 일괄 backfill한다. 이것만으로 실제 사용자 입력 유실을 증명할 수 없다. F05 합성 재현과 분리한다.

**개선·완료 기준:** kind/이자·원금 연결 범위 확인 후보를 만들고 자동 교정하지 않는다. 기준일과 추정 window를 보여준다. persistent override와 유효기간, user edit/import/estimate/legacy backfill의 출처 이력을 구분한다. 신규 날짜 import에서 보존·만료·교체 이유를 설명할 수 있어야 한다. T046/T048, 기존 T042 연계.

### L06 · P1 — 과거 부분 실패를 업로드 화면에서 다시 찾을 수 없음

업로드는 21건이며 성공 20건, snapshot 단계 부분 실패 1건이다. 부분 실패가 최근 10건 밖에 있어 현재 목록에 나타나지 않는다. 1시간 이상 processing과 원본 저장 실패 warning은 없다.

`backend/app/api/v1/endpoints/upload.py:43–50`은 최근 10건으로 제한하며 pagination/filter가 없다. `ImportPage.tsx:192–219`도 단계별 복구 관계를 제공하지 않는다. 후속 정상 업로드가 과거 실패를 복구했을 수 있으므로 현재 손실을 단정하지 않는다.

**개선·완료 기준:** cursor 기반 전체 이력, 상태 필터, 거래/자산/프로필 단계별 결과, 정제된 오류 code, 후속 재시도와 해결 상태를 제공한다. 21건 fixture에서 11번째 이후 partial도 찾아 원인과 후속 처리를 추적할 수 있어야 한다. raw exception을 그대로 노출하지 않는다. T046/T051, FE-12/SEC-03 연계.

### L07 · P2 — 원본에서 빠진 거래와 과거 lineage 공백을 검토할 경로

4,004 유효 거래 중 `missing_from_latest_export`가 61건이며 같은 날짜/금액/통화/수단의 active 대응 행은 없다. source hash 또는 첫/마지막 import lineage가 없는 행은 498건이다. 동일 source signature 그룹 1개도 있지만 실제 중복 여부는 원본 행수 근거 없이는 확정할 수 없다.

missing 거래를 유지하는 것은 자동 삭제를 피하는 보존 정책과 부합한다. 데이터가 틀렸다는 결론이 아니라, 출처 불확실성을 사용자에게 설명할 작업이 남아 있다는 뜻이다.

**개선·완료 기준:** lifecycle·마지막 관측 import·누락 시점·원본 diff·집계 포함 이유를 보여주고 유지/대체/삭제를 선택 승인하게 한다. 과거 출처가 없으면 `legacy/unknown`으로 표시하며 연결 근거를 발명하지 않는다. T046/T048, 기존 T030/T031 연계.

### L08 · P2 — 환불은 존재하지만 연결 검토 경험이 필요함

양수 지출 환불은 144행이며 저장된 settlement match는 0건이다. 거래처·수단·통화·기간·금액 조건을 이용한 보수적 14일 후보 조회에서는 후보를 가진 환불 103건, 단일 후보 66건, 다중 후보 37건, 월 경계 후보 16건이었다. 후보 조회는 처리 순서·누적 capacity·설명 점수까지 재현하지 않았으므로 자동 연결 가능 수가 아니다. match가 없는 이유도 현재 조회만으로 확정할 수 없다.

**개선·완료 기준:** F02/F03의 금액 보존·월 귀속 계약을 먼저 고친 후 원본 근거, 남은 환불/결제 잔액, before/after를 검토하는 흐름을 제공한다. 거절·취소·부분 배분을 지원하고 승인 없이 과거 연결을 만들지 않는다. T045 및 기존 정산 검토 기능과 연계한다.

## 현재 발현하지 않은 결함과 정상 확인

| 확인 | 관측 및 해석 |
|---|---|
| F01 대체 중복 | superseded 0건. 현재 중복 집계가 발현했다는 증거 없음. 합성 재현 결함은 별도로 유효. |
| F02/F03 환불 배분 | settlement match 0건. 현재 부분 배분 소실·확정 환불 월 소급이 적용된 상태는 아님. |
| F04 통화 혼합 | 비KRW 유효 거래 0건. 현재 외화 혼합 집계를 관측한 것은 아님. |
| F06 프로필 누락 | 프로필 최초 등장 이후 snapshot 날짜의 프로필 누락 0. 합성 손실 경로와 현재 상태 구분. |
| F08 초기화 | 실제 거래 참조 FK 7개 모두 NO ACTION, 대출 연결 84·할부 연결 11 존재. parent-first 삭제 실패의 전제는 있음. 운영 reset은 실행하지 않음. |
| canonical 정합성 | 삭제/병합 제외 위반 0, user override COALESCE 불일치 0. |
| 연결 상태 | 삭제/병합/superseded/missing 거래를 가리키는 대출·할부 연결 0. |
| 수집 범위 | 최근 6개 마감월이 현재 날짜 coverage heuristic을 통과. 모든 금융계좌 수집 완료를 증명하지는 않음. |
| source 보존 | 미래 평가/관측/ingestion 및 orphan observation 0. date-only 원본의 observed_at 누락을 오류로 세지 않음. |

## 재검증용 SQL

다음은 대표 집계를 재실행하는 최소 SQL이다. 접속정보 없이 count/boolean/ratio와 source 날짜만 출력한다. 실제 검증은 별도 readonly 역할과 세션 timeout 10초를 함께 사용했다. 현재 월 기준 조건은 실행일에 따라 달라진다.

### 거래·큐·저축률·FK

```sql
BEGIN READ ONLY;
SELECT current_setting('transaction_read_only');
SELECT count(*) AS rows,
 count(*) FILTER(WHERE source_lifecycle_status='superseded'
   AND NOT is_deleted AND merged_into_id IS NULL) AS superseded_effective,
 count(*) FILTER(WHERE currency<>'KRW' AND NOT is_deleted
   AND merged_into_id IS NULL) AS non_krw
FROM transactions;
SELECT status,count(*) FROM settlement_matches GROUP BY status;
SELECT count(*) AS queue_total,
 count(*) FILTER(WHERE needs_cost_kind) AS missing_cost_kind,
 count(*) FILTER(WHERE needs_fixed_cost_necessity) AS missing_fixed_necessity,
 count(*) FILTER(WHERE needs_spend_necessity) AS missing_spend_necessity,
 count(*) FILTER(WHERE needs_recurring_payment_kind) AS recurring,
 count(*) FILTER(WHERE needs_loan_link_review) AS loan_review,
 count(*) FILTER(WHERE needs_recurring_payment_kind AND NOT needs_cost_kind
   AND NOT needs_fixed_cost_necessity AND NOT needs_spend_necessity
   AND NOT needs_loan_link_review) AS recurring_only
FROM vw_unclassified_work_queue;
SELECT round(sum(CASE WHEN amount<0 AND spend_necessity IN
 ('essential','discretionary') THEN -amount ELSE 0 END)::numeric /
 nullif(sum(CASE WHEN amount<0 THEN -amount ELSE 0 END),0),4) AS ratio
FROM vw_transactions_effective
WHERE type='지출' AND loan_account_id IS NULL
 AND date>=date_trunc('month',CURRENT_DATE) AND date<=CURRENT_DATE;
WITH closed AS (
 SELECT income_total FROM vw_monthly_cashflow
 WHERE period<to_char(CURRENT_DATE,'YYYY-MM') ORDER BY period DESC LIMIT 6
), baseline AS (
 SELECT percentile_cont(0.5) WITHIN GROUP(ORDER BY income_total) AS median,
 count(*) AS periods FROM closed
)
SELECT abs(c.savings_rate)>10 AS large_abs_ratio,
 c.savings_rate<0 AS negative,c.income_total>0 AS income_positive,
 c.income_total<b.median*0.5 AS low_income,b.periods
FROM vw_monthly_cashflow c CROSS JOIN baseline b
WHERE c.period=to_char(CURRENT_DATE,'YYYY-MM');
SELECT count(*) AS fk_count,count(*) FILTER(WHERE confdeltype='a') AS no_action
FROM pg_constraint WHERE contype='f' AND confrelid='transactions'::regclass;
ROLLBACK;
```

### 업로드·소스·대출·프로필

```sql
BEGIN READ ONLY;
-- Q1. 상태와 숨겨진 부분 실패
SELECT status, reconciliation_mode, count(*) AS uploads,
       count(*) FILTER (WHERE error_message IS NOT NULL) AS with_error,
       count(*) FILTER (WHERE error_message LIKE '%snapshots:%') AS snapshot_stage_error
FROM upload_logs GROUP BY status,reconciliation_mode;
WITH ranked AS (
 SELECT status, row_number() OVER(ORDER BY uploaded_at DESC,id DESC) AS recent_rank
 FROM upload_logs
)
SELECT count(*) FILTER(WHERE status='partial' AND recent_rank>10) AS hidden_partial
FROM ranked;
-- Q2. source dates and mapping readiness, names/keys excluded
SELECT source,status,count(*) AS runs,min(valuation_at)::date AS first_valuation,
       max(valuation_at)::date AS latest_valuation,max(ingested_at)::date AS latest_ingestion
FROM asset_source_runs GROUP BY source,status;
SELECT cash_scope,count(*) AS mappings,
       count(*) FILTER(WHERE json_array_length(asset_components)=0) AS empty_components
FROM asset_source_mappings GROUP BY cash_scope;
-- Q3. latest loan cross-check only emits counts
SELECT a.loan_kind,count(*) AS latest_loans,
 count(*) FILTER(WHERE l.monthly_payment IS NOT NULL AND l.interest_rate>0 AND l.balance>0
                 AND l.monthly_payment<l.balance*l.interest_rate/1200) AS below_simple_interest,
 count(*) FILTER(WHERE (l.product_name LIKE '%마이너스%' OR l.loan_type LIKE '%마이너스%')
                 AND a.loan_kind IS DISTINCT FROM 'overdraft') AS name_kind_review_candidates
FROM loans l LEFT JOIN loan_accounts a ON a.lender=l.lender AND a.product_name=l.product_name
WHERE l.snapshot_date=(SELECT max(snapshot_date) FROM loans) GROUP BY a.loan_kind;
-- Q4. metadata continuity: source label transitions, not inferred user actions
WITH ordered AS (
 SELECT monthly_payment_source,repayment_method_source,
 lag(monthly_payment_source) OVER(PARTITION BY lender,product_name ORDER BY snapshot_date) AS prior_payment_source,
 lag(repayment_method_source) OVER(PARTITION BY lender,product_name ORDER BY snapshot_date) AS prior_method_source
 FROM loans
)
SELECT count(*) FILTER(WHERE monthly_payment_source='manual' OR repayment_method_source='manual') AS manual_label_rows,
 count(*) FILTER(WHERE prior_payment_source='manual' AND monthly_payment_source IS DISTINCT FROM 'manual') AS payment_transition,
 count(*) FILTER(WHERE prior_method_source='manual' AND repayment_method_source IS DISTINCT FROM 'manual') AS method_transition
FROM ordered;
-- Q5. profile completeness since actual first profile appearance
WITH dates AS (SELECT DISTINCT snapshot_date FROM asset_snapshots)
SELECT count(*) AS snapshot_dates,count(*) FILTER(WHERE p.id IS NOT NULL) AS with_profile,
 count(*) FILTER(WHERE p.id IS NULL AND d.snapshot_date >= (SELECT min(snapshot_date) FROM user_profile_snapshots)) AS missing_since_profile_start,
 max(d.snapshot_date) AS latest_asset_snapshot,max(p.snapshot_date) AS latest_profile_snapshot
FROM dates d LEFT JOIN user_profile_snapshots p USING(snapshot_date);
ROLLBACK;
```
