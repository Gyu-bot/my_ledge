# Advisor Canonical Gap Analysis And Implementation Plan

작성일: 2026-06-10
상태: historical evidence. 사용자에게 보일 roadmap 항목은 `Implentation-plan.md`로, 에이전트 실행 계획은 `.omo/plans/<slug>.md`로 승격하고, live 여부는 코드와 contract 문서에서 확인한다.

이 문서는 실제 사용자 데이터 export(`tmp/2025-05-21~2026-05-21.xlsx`, BankSalad 뱅샐현황 + 가계부 내역 1년치)를 canonical read surface에 흘려본 평가 결과다.
"AI 에이전트가 이 사용자에게 개인 재무상담을 한다"는 관점에서, **에이전트가 값을 잘못 해석하게 만드는 지점**과 **상담에 필요한데 surface에 없는 판단 재료**를 정리하고, 각 항목의 상세 구현 계획을 남긴다.

다른 에이전트가 이 문서를 읽을 때의 핵심: 아래 항목들은 추상적 기능 제안이 아니라, **실데이터에서 실제로 발생한 왜곡/누락을 근거로 한다.** 각 항목에 "잘못 해석되는 시나리오"를 함께 적었으므로, 구현 시 그 시나리오가 해소되는지를 acceptance 기준으로 삼는다.

---

## 0. 평가에 사용한 사용자 실사용 프로필 (use case 기준점)

샘플 데이터가 그리는 사용자 상황. 이 프로필이 각 항목의 "왜 고치는가"의 근거다.

- 만 39세 남성, KCB 신용점수 996 (최상위 구간)
- 월 급여 약 660만원 (단일 직장), 2026-02에 1,020만원 (보너스성 변동)
- 자산: 부동산 2.7억 (실거주 추정), 퇴직연금 DC 4,951만, 투자자산 약 2,080만 (이 중 알파벳 단일종목 1,170만 = 약 56% 집중), 주택청약 618만, **즉시 가용 현금 약 31만원**
- 부채 총 2.22억: 주택담보대출 1.709억 (4.03%, 만기 2064년 = 만 77세), 신용대출 3,210만 (4.91%) + 1,674만 (5.85%), 마이너스통장 261만 (5.04%, 한도 1,500만)
- 월 대출 상환 약 147만원 (주담대 732,713원 자동이체 + 원리금 자동이체 2건)
- 보험 2건 (실손의료비 2018년 계약, 종합건강 2023년 계약), 월 보험료 약 12.7만원
- 거래 2,357건/1년: 지출 1,886, 수입 129, 이체 342 (카드대금 39, 투자 12, 저축 11 포함)
- 메모 입력 32건 (1.4%) — 거래 맥락 기록은 거의 없음
- 2025-12부터 `데이트`(월 80~356만), `기타_혜영` 카테고리 신규 등장 — 생활 변화(파트너) 신호

이 사용자에게 의미 있는 상담 주제는 다음과 같고, 각 주제가 어느 항목에 의존하는지 표기한다.

| 상담 주제 | 필요한 판단 재료 | 의존 항목 |
|---|---|---|
| "비상금이 사실상 0원인데 어떻게 만들까" | 정확한 현금성 자산 합계, 순자산 | 1, 2 |
| "5.85% 신용대출부터 갚아야 할까" | 대출별 금리/잔액/월이자 추정, 신용점수 | 3, 4, 5 |
| "주담대 만기가 만 77세인데 괜찮은가" | 나이, 만기일 | 4, 5 |
| "저축률이 왜 이런가, 보너스 빼면 얼마인가" | 수입 구성 분해 (정기 급여 vs 일회성) | 7 |
| "데이트 지출이 늘었는데 가용액 기준 적정한가" | 부분월 왜곡 없는 월별 비교 | 6 |
| "보험료가 적정한가, 실손 전환 검토" | 보험 계약 정보 (세대/계약일/만기) | 8 |
| "목표 대비 어디까지 왔나" | 목표값 (비상금 목표 개월수 등) | 10 |

---

## 해석 원칙 (변경하지 않는 것)

`Implentation-plan.md`와 agent contract 문서의 책임 경계를 그대로 유지한다.

- My Ledge는 계산, 후보 탐지, confidence, assumptions까지만 제공한다. 아래 항목들은 모두 "판단 재료 추가/교정"이며, "조언 생성"이 아니다.
- 예: 항목 4(신용점수)는 "리파이낸싱 하라"는 판정이 아니라, 에이전트가 금리 대화를 할 때 쓸 수 있는 데이터 필드 추가다.
- 투자 성과/배분 분석을 증권사 API 이후로 미룬 결정(P2)은 유지한다. 항목 11은 그 결정 범위 안에서의 총액 수준 보조 필드만 다룬다.

---

## Group 1 — 정합성 교정 (즉시, 버그성)

계산 결과 자체가 실데이터에서 틀리게 나오는 항목. 다른 모든 상담의 신뢰 기반이므로 최우선이다.

### 1. 마이너스통장 중복 계상으로 순자산 과소 계산

**문제.** BankSalad 재무현황은 마이너스통장을 두 번 내보낸다.

- 자산 측: `우리직장인재테크 저축예금(금리우대형)` = **-2,605,548**
- 부채 측: `우리은행 마이너스 통장` = **+2,605,548**

`vw_asset_snapshot_canonical`의 `net_worth = asset_total - liability_total`은 이를 이중 차감한다. 이 샘플에서 순자산이 약 261만원 과소 계산된다.

**잘못 해석되는 시나리오.** 에이전트가 순자산 추이를 설명하거나 부채 비율(`debt_to_asset_ratio`)을 계산할 때 기준값 자체가 틀린다. 마이너스통장 사용액이 커질수록 왜곡이 커진다 (한도 1,500만 기준 최대 1,500만 왜곡 가능).

**수정 방향.** 원본 보존 원칙에 따라 parser/raw table은 건드리지 않고, canonical view 레벨에서 정규화한다.

- 자산 측 `amount < 0`인 row는 `asset_total`에서 제외하고 `negative_asset_excluded_total` 컬럼으로 별도 노출한다.
- 부채 측에 같은 잔액이 이미 있으므로 (마이너스통장은 대출현황에도 등장) 제외만으로 중복이 해소된다.
- 매칭되는 부채가 없는 음수 자산이 존재할 수 있으므로, 제외 총액을 숨기지 않고 노출해 에이전트가 assumptions으로 확인할 수 있게 한다.

**구현 계획.**

1. 새 alembic revision에서 `vw_asset_snapshot_canonical` 재생성 (`backend/alembic/versions/20260530_0022_add_asset_snapshot_canonical_view.py` 패턴 복제).
   - `asset_rows` CTE에 `CASE WHEN side='asset' AND amount < 0 THEN amount ELSE 0 END AS negative_asset_amount` 추가.
   - `asset_total`은 `side='asset' AND amount >= 0`만 합산.
   - 최종 SELECT에 `negative_asset_excluded_total` 추가.
   - 주의: 항목 2의 cash_equivalent 계산도 음수 row를 제외해야 한다 (음수 입출금 계좌가 현금성 합계를 깎는 문제 동시 해결). 항목 1과 2는 같은 migration에서 처리한다.
2. Python 미러 로직 정렬: `backend/app/services/assets_service.py`의 net worth/liquidity 계산 경로(`get_net_worth_breakdown`, `get_asset_liability_health`, `_is_cash_equivalent_asset`)가 view와 같은 규칙을 쓰는지 확인하고 동일하게 음수 자산 제외를 적용한다.
3. `/analytics/liquidity-health`와 `/analytics/net-worth-breakdown` 응답의 `assumptions`에 `negative_asset_rows_excluded` 항목을 추가해, 제외가 발생한 snapshot에서 에이전트가 인지할 수 있게 한다.
4. 문서: `docs/agents/canonical-read-surface-reference.md`의 `vw_asset_snapshot_canonical` 표에 새 컬럼과 해석 규칙("음수 자산 row는 부채 측과 중복이므로 asset_total에서 제외된다") 추가.

**검증.** 샘플 파일 업로드 후 `vw_asset_snapshot_canonical`에서 `net_worth`가 시트의 `총자산-총부채` 대비 +2,605,548 (즉, 중복 차감 해소분) 차이를 보이는지 확인. `backend/tests`에 음수 자산 row가 포함된 snapshot fixture 테스트 추가.

### 2. 현금성 자산 휴리스틱이 실계좌 대부분을 놓침 → 비상금 개월수 왜곡

**문제.** `vw_asset_snapshot_canonical`의 cash-equivalent fallback 패턴은 category `%현금%`/`%예금%`, product `%입출금%`/`%CMA%`/`%파킹%`/`%보통예금%`만 본다. 그런데 BankSalad의 입출금 계좌 카테고리는 **"자유입출금 자산"**이고 ("예금" 부분 문자열 불일치), 이 샘플의 주요 계좌들이 모두 누락된다.

- `KB국민ONE통장-저축예금` 266,918원 (가장 큰 현금 잔액) — 미매칭
- `토스뱅크 통장` 42,024원 — 미매칭
- `NH주거래우대통장`, `생활통장`, `저축예금` 등 — 미매칭

**잘못 해석되는 시나리오.** `emergency_fund_months`가 실제보다 더 낮게 나온다. 이 사용자는 실제로도 비상금이 위험 수준(약 31만원)이지만, 계산이 0원에 가깝게 나오면 에이전트의 "비상금이 전혀 없습니다"라는 설명과 사용자가 보는 통장 잔액이 어긋나 신뢰를 깎는다. 반대 방향으로, 음수 잔액 계좌가 패턴에 걸리면 현금성 합계가 음수로 떨어질 수도 있다 (항목 1과 연동).

**수정 방향.**

- category 패턴에 `%자유입출금%`, `%전자금융%` 추가. product 패턴에 `%통장%` 추가.
- BankSalad 카테고리는 enumerable하므로, 장기적으로는 부분 문자열 휴리스틱보다 **카테고리명 → liquidity_tier 명시 매핑 테이블**(코드 상수로 충분)이 안전하다. 1차는 패턴 보강, 2차는 매핑 전환을 선택지로 남긴다.
- 음수 row는 항목 1의 규칙에 따라 cash_equivalent에서도 제외한다.

**구현 계획.**

1. 항목 1과 같은 migration에서 `vw_asset_snapshot_canonical`의 `cash_equivalent_amount` CASE를 보강한다.
2. `backend/app/services/assets_service.py:_is_cash_equivalent_asset`에 동일 패턴 추가 (view와 Python 로직이 이원화되어 있으므로 반드시 양쪽 모두).
3. 패턴 오매칭 점검: `통장` 패턴이 비현금 상품(예: 청약, 저금통)과 충돌하지 않는지 샘플 데이터 상품명 전수로 확인한다. 이 샘플 기준 `주택청약종합저축`, `토스뱅크 게임 저금통`은 `통장` 미포함이라 안전하다.
4. 사용자가 `PATCH /api/v1/assets/snapshots/{id}/liquidity`로 명시 지정한 값이 항상 휴리스틱보다 우선한다는 기존 규칙은 유지한다.
5. 문서: reference 문서의 fallback 패턴 설명 갱신.

**검증.** 샘플 업로드 후 `cash_equivalent_total ≈ 310,099` (자유입출금 합계 + 현금 0)인지 확인. `emergency_fund_months`가 월 필수지출 대비 약 0.1 미만으로 나오는지 확인 (이 사용자의 실제 상태).

### 3. 대출 금리·잔액이 에이전트 값 사전에 없음 (문서 수정만으로 즉시 해소 가능한 부분)

**문제.** `GET /api/v1/loans/summary`는 대출별 `interest_rate`, `balance`, `principal`, `monthly_payment`, `maturity_date`를 이미 반환한다. 그러나 에이전트 값 사전(`docs/agents/canonical-read-surface-reference.md`)의 "대출 상환 부담" 항목은 `vw_loan_repayment_monthly`(금리/잔액 없음)만 가리키고, `/loans/summary`는 값 사전과 "어떤 surface를 먼저 쓸까" 표 어디에도 없다.

**잘못 해석되는 시나리오.** 문서를 충실히 따르는 에이전트일수록 금리를 영영 보지 못한다. 이 사용자의 핵심 상담 주제인 "5.85% 신용대출 vs 4.03% 주담대, 어디부터 갚을까"(avalanche/snowball)를 시작조차 할 수 없다. "대출 상환 월 147만원"까지만 말하고 구조(어느 대출이 비싼가)를 설명하지 못한다.

**구현 계획 (코드 변경 없음, 문서만).**

1. `docs/agents/canonical-read-surface-reference.md` "어떤 surface를 먼저 쓸까" 표에 row 추가: "대출 구조/금리/만기 → `GET /api/v1/loans/summary` (보조: `vw_loan_repayment_monthly`)".
2. Analytics API 값 사전 표에 `/loans/summary` 항목 추가: `interest_rate`(연이율 %), `balance`, `monthly_payment`, `monthly_payment_source`(manual/estimated 구분 해석 주의), `maturity_date`.
3. 해석 주의 추가: "금리는 snapshot 시점 값이다. 리파이낸싱/상환 우선순위 제안은 에이전트 해석이며, My Ledge는 금리·잔액 재료만 제공한다."

**검증.** 문서 리뷰만으로 충분.

---

## Group 2 — P1 승격 제안 (수집 격차 + canonical surface 확장)

### 4. `뱅샐현황` 1.고객정보 미수집 → 프로필 surface 신설

**문제.** `backend/app/parsers/snapshots.py`는 뱅샐현황 시트에서 3.재무현황/5.투자현황/6.대출현황만 파싱한다. **1.고객정보 (성별, 만 나이, KCB 신용점수)는 버려진다.** 백엔드 코드 전체에 고객정보/신용점수 참조가 0건이다.

**잘못 해석되는 시나리오.**

- 나이를 모르면 "주담대 만기 2064년"이 그냥 날짜다. 만 39세를 알아야 "만기 시점 만 77세"라는 상담 핵심 사실이 된다. 은퇴/생애주기 맥락의 조언이 전부 일반론이 된다.
- 신용점수 996(최상위)을 모르면 5.85% 신용대출이 "신용도 대비 비싼 금리"라는 후보 신호를 만들 재료가 없다.
- 에이전트가 매 대화에서 사용자에게 나이를 되묻는 UX 낭비가 발생한다.

**수정 방향.** 업로드 시 고객정보를 snapshot으로 저장하고 read surface를 제공한다. 업로드가 반복되면 신용점수 추이가 자연히 쌓인다. 이름은 저장하지 않는다 (식별 정보 최소화, 상담에 불필요).

**구현 계획.**

1. Parser: `snapshots.py`에 `_parse_profile(rows)` 추가. `find_table_start(rows, "1.고객정보")` 기준 marker+2가 header(이름|성별|연령|신용점수|이메일), marker+3이 값 row다. `ProfileRow` TypedDict: `gender: str | None`, `age: int | None`, `credit_score_kcb: int | None`. `SnapshotParseResult`에 `profile: ProfileRow | None` 추가. 섹션이 없는 파일(과거 포맷)을 위해 marker 미발견 시 `None`으로 graceful skip — 기존 `find_table_start`는 raise하므로 optional 버전 helper가 필요하다.
2. Model: `backend/app/models/user_profile_snapshot.py` — `id`, `snapshot_date` (unique), `gender`, `age`, `credit_score_kcb`, `created_at`. 다른 snapshot과 동일하게 같은 날짜 재업로드 시 replace.
3. Migration: 테이블 추가.
4. Upload: `backend/app/services/upload_service.py`에서 snapshot 저장 경로에 profile 저장 추가. 기존 자산/투자/대출 replace 패턴을 그대로 따른다.
5. API: `GET /api/v1/profile` — 최신 snapshot의 `gender`, `age`, `credit_score_kcb`, `snapshot_date` + `credit_score_history[]` (snapshot_date, score). 신규 endpoint 파일 `backend/app/api/v1/endpoints/profile.py`, 스키마 `backend/app/schemas/profile.py`.
6. 문서: reference 값 사전에 추가. 해석 주의: "age/credit_score는 snapshot 시점 값이다. My Ledge는 점수에 등급 label을 붙이지 않는다."
7. `GET /api/v1/schema`에 신규 테이블 노출 확인.

**검증.** 샘플 업로드 → `GET /api/v1/profile`이 `{gender: '남', age: 39, credit_score_kcb: 996}` 반환. 고객정보 섹션 없는 fixture로 graceful skip 테스트.

### 5. 대출 계좌 canonical view 신설 (`vw_loan_account_canonical`)

**문제.** 금리·잔액은 API(`/loans/summary`)에는 있지만 canonical DB view 레이어에는 없다. readonly SQL로 접근하는 에이전트, 그리고 "상환 흐름(`vw_loan_repayment_monthly`) + 계좌 속성(금리/잔액)"을 조인해야 하는 분석이 매번 raw `loans` 테이블 재해석에 의존한다. 또한 "월 상환액 중 이자 추정분"이라는 상담 단골 재료가 어디에도 없다.

**잘못 해석되는 시나리오.** 에이전트가 raw `loans`를 직접 집계하면 같은 대출의 여러 snapshot을 합산하는 실수(잔액 이중 계산)를 하기 쉽다. 실제로 `loans`는 snapshot 누적 테이블이라 latest-per-account 선별 규칙이 필요한데, 이 규칙이 canonical로 고정되어 있지 않다. 이 사용자의 경우 월 상환 147만원 중 이자 추정 약 82만원이라는 구조(원금이 거의 줄지 않는 구간) 설명이 불가능하다.

**구현 계획.**

1. Migration: `vw_loan_account_canonical` 생성.
   - source: `loan_accounts` LEFT JOIN 최신 `loans` snapshot (lender, product_name 기준, `snapshot_date` 최댓값 row).
   - 컬럼: `loan_account_id`, `display_name` (user 우선 coalesce), `lender`, `product_name`, `loan_kind`, `snapshot_date`, `principal`, `balance`, `interest_rate`, `monthly_payment`, `monthly_payment_source`, `repayment_method`, `start_date`, `maturity_date`, `estimated_monthly_interest` = `round(balance * interest_rate / 100 / 12)` (balance/rate null이면 null).
   - `loan_accounts`에 없는 snapshot 대출(아직 계좌 매핑 안 된 경우)도 누락되지 않도록 FULL OUTER 또는 별도 row로 포함하고 `loan_account_id null`로 노출한다.
2. `estimated_monthly_interest`는 이름에 `estimated`를 명시하고, 문서에 "단리 근사값이며 상환 방식(원리금/원금균등/만기일시)을 반영하지 않는다"를 적는다. 정밀 스케줄 계산은 하지 않는다 (책임 경계: 재료 제공까지).
3. `GET /api/v1/canonical-views/dashboard`에 포함할지는 선택 — 1차는 view + readonly SQL + reference 문서 등재까지. dashboard 추가는 consumer 요구가 생기면 한다.
4. 문서: reference의 Canonical DB Views 섹션에 표 추가. "대출 상환 부담" 우선 surface를 `vw_loan_repayment_monthly` + `vw_loan_account_canonical` 조합으로 갱신.

**검증.** 샘플 업로드 후 view가 4개 대출 row를 반환하고, 주담대 row의 `estimated_monthly_interest ≈ 573,000` (170,879,362 × 4.03% / 12), 신용대출 5.85% row가 최고 금리로 식별 가능한지 확인. 같은 대출의 snapshot 2개 업로드 후 latest만 잡히는지 테스트.

### 6. 데이터 커버리지 메타데이터 부재 → 부분월 오독

**문제.** 데이터가 2025-05-21에 시작하므로 2025-05는 10일짜리 부분월이다. `vw_monthly_cashflow`는 이를 구분 없이 노출한다 (식비 22.9만 vs 평월 50~90만). 진행월 보정(`income_basis='estimated'`)은 **현재 월의 수입 미관측**만 다루고, **데이터 시작 경계**는 다루지 않는다.

**잘못 해석되는 시나리오.** 에이전트가 "2025-05에는 지출이 매우 적었는데 이후 늘었다"는 거짓 추세를 만들거나, 12개월 평균에 부분월을 섞어 baseline을 낮게 잡는다. 이 사용자의 "데이트 지출 증가가 가용액 대비 적정한가" 같은 월별 비교 상담에서 시작 월이 비교군에 섞이면 왜곡이 생긴다.

**수정 방향.** DB view는 그대로 두고 (관측값 보존), dashboard API enrichment 패턴(기존 estimated income enrichment와 동일한 방식)으로 메타데이터를 붙인다.

**구현 계획.**

1. `backend/app/services/canonical_views_dashboard_service.py`:
   - 응답 최상위에 `data_coverage { first_transaction_date, last_transaction_date }` 추가 (`vw_transactions_effective`의 min/max date, 단일 쿼리).
   - `monthly_cashflow[]`, `true_spendable_monthly[]`, `fixed cost` 계열 월별 row에 `is_complete_month: bool` 추가 — 해당 월 전체가 `[first_transaction_date, last_transaction_date]` 범위에 포함되면 true. 진행월은 기존 `income_basis`와 별개로 false가 된다.
2. `backend/app/schemas/canonical_views.py`에 필드 추가.
3. 문서: reference에 "에이전트는 `is_complete_month=false`인 월을 baseline/추세 계산에 포함하지 않거나, 포함 시 부분월임을 답변에 명시한다" 해석 규칙 추가.
4. (선택) `/analytics/monthly-cashflow` 등 개별 analytics 응답에도 동일 필드를 점진 적용. 1차는 dashboard만.

**검증.** 샘플 기준 2025-05 row가 `is_complete_month=false`, 2025-06~2026-04는 true, 2026-05(마지막 거래 05-21)는 false인지 확인.

### 7. 수입 구성 분해 surface 부재 → 저축률/가용액의 기반 신뢰도 판단 불가

**문제.** `income_total`이 단일 값이라 정기 급여(약 660만)와 일회성 수입(통장이자 35건, 보험금 7건, 앱테크 등)을 구분할 수 없다. 2026-02 급여 1,020만(보너스성)도 식별 재료가 없다. `/analytics/category-mom`이 수입 필터를 지원하지만 직전 2개월 비교뿐이고, `/analytics/income-stability`는 총액 변동성만 본다.

**잘못 해석되는 시나리오.** 에이전트가 보험금 수령월(예: 2026-02 급여+보너스+보험금)을 "수입이 늘었다"로 읽고 낙관적 가용액을 말하거나, 저축률 개선을 실력으로 오독한다. true spendable의 estimated income도 일회성이 섞인 baseline으로 추정될 수 있다 (현재 median ±30% 제외가 일부 방어하지만 구성은 보이지 않는다).

**구현 계획.**

1. Migration: `vw_income_monthly_by_category` 생성 — `period`, `effective_category_major`, `income_total`, `transaction_count`. source는 `vw_transactions_effective`의 `type='수입'`.
2. (선택, 권장) `vw_monthly_cashflow`에 `salary_income_total` (effective_category_major='급여'), `non_salary_income_total` 컬럼 추가 — 에이전트가 가장 자주 쓰는 분해를 한 번에 제공.
3. API는 1차 생략 가능 (readonly SQL + dashboard 외 수요 확인 후). P2의 "수입 분석 페이지"가 이 view를 소비하는 순서로 간다.
4. 문서: reference에 view 표 추가. 해석 규칙: "'급여' 카테고리는 BankSalad 분류 기준이며, 사용자가 수정한 effective category를 따른다. 정기성 판단(이 급여가 매달 같은 금액인가)은 에이전트가 월별 분해로 직접 본다."

**검증.** 샘플 기준 2026-02 row에서 급여 10,200,240 / 보험금 33,500 / 기타 1,166이 분리되는지, 13개 월 합계가 `vw_monthly_cashflow.income_total`과 일치하는지 확인.

---

## Group 3 — P1.5~P2 제안

### 8. `뱅샐현황` 4.보험현황 미수집 → 보험 계약 snapshot

**문제.** 보험은 현재 `보험 자산`(해지환급금 1,480원)과 월 보험료 지출(보험 카테고리 42건, 월 약 12.7만원)로만 존재한다. 계약 단위 정보(보험사, 상품명, 계약상태, 총납입금, 계약일, 만기일)는 파서가 버린다.

**잘못 해석되는 시나리오.** 에이전트가 "보험료 월 12.7만원"까지만 알고, 그것이 몇 건의 어떤 계약인지(실손 1건 + 종합건강 1건), 실손이 2018년 계약(세대 구분 재료 — 전환 상담의 출발점)인지 알 수 없다. 보험료/소득 비율(이 사용자 약 1.9%, 양호) 같은 구조 설명도 계약 수 없이 부정확해진다.

**구현 계획.**

1. Parser: `_parse_insurance(rows)` — "4.보험현황" marker 기준, 컬럼 금융사|보험명|계약상태|총납입금|계약일자|만기일자. `총계` row 제외 (기존 `_parse_loans` 패턴 동일).
2. Model + migration: `insurance_contracts` — `id`, `snapshot_date`, `insurer`, `product_name`, `status`, `total_paid`, `contract_date`, `maturity_date`. snapshot replace 패턴.
3. API: `GET /api/v1/insurance/summary` — 최신 snapshot 계약 목록 + `monthly_premium_estimate` (보험 카테고리 최근 마감월 지출, `assumptions`에 추정 근거 명시).
4. 문서: reference 등재. 해석 주의: "계약-거래 매핑은 제공하지 않는다. 월 보험료는 카테고리 기준 추정이다."

### 9. `뱅샐현황` 2.현금흐름현황을 import parity 검증에 활용

**문제/기회.** BankSalad가 자체 계산한 월별 카테고리 집계가 파일 안에 있는데 버려진다. 저장할 필요는 없지만, 업로드 검증 시 "내 거래 집계 = 뱅샐 집계" 대조에 쓰면 P0의 `verify_import_parity`를 외부 기준값으로 강화할 수 있다.

**구현 계획.** 업로드 또는 `verify_import_parity` 스크립트에서 2.현금흐름현황의 월×카테고리 값과 인서트된 거래 재집계를 비교하고, 불일치를 경고 리포트로만 남긴다 (저장 안 함, 차단 안 함). 수식 셀(`=SUM(...)`)은 `data_only=False`로 읽히므로 원시 값 영역(E~Q열의 숫자 셀)만 사용한다.

### 10. 미니멀 financial targets (P2 budgets/goals의 최소 선행분)

**문제.** 목표값이 없으면 에이전트 상담이 일반론에 그친다. "비상금 31만원은 부족합니다"까지는 가능해도 "목표 3개월(약 1,350만) 대비 2.3%"라고 말할 수 없다. budgets/goals 전체는 P2 유지가 맞지만, 목표 숫자 몇 개는 기존 Advisor Settings Contract 패턴으로 충분하다.

**구현 계획.** `GET/PATCH /api/v1/settings/analytics`에 `financial_targets` 섹션 추가: `emergency_fund_target_months` (default 3), `savings_rate_target` (default null), `debt_strategy_preference` (`avalanche` | `snowball` | null, default null). 에이전트는 제안만 하고 저장은 사용자 명시 의사로 — 기존 settings 규칙 그대로. `/analytics/liquidity-health` 응답에 `emergency_fund_target_months`와 `target_progress_ratio`를 echo하면 소비가 쉬워진다.

### 11. 투자 집중도 보조 필드 (기존 P2 연기 결정 범위 내)

**문제.** 투자 분석은 증권사 API 이후로 연기됐고 그 결정은 유지한다. 다만 이미 파싱되는 snapshot만으로 "알파벳 단일종목이 투자자산의 56%"라는 총액 수준 비율은 계산 가능하다. 에이전트가 자산 구성을 설명할 때 이 정도 집중 신호는 가치가 크다.

**구현 계획 (선택).** `GET /api/v1/investments/summary` items에 `pct_of_investment_total` 필드 추가만 한다 (`market_value / totals.market_value`). 성과/수익률 해석은 계속 하지 않는다. 결정권자가 P2 연기 결정과 충돌한다고 판단하면 이 항목은 drop한다.

---

## 운영 관찰 (구현 항목 아님, 에이전트 가이드 후보)

- **메모 적재 루프.** 메모가 2,357건 중 32건뿐이다. 에이전트가 상담 중 알게 된 거래 맥락("이건 회사 경비", "이건 부모님 송금")을 `PATCH /api/v1/transactions/{id}`의 `memo`로 적재하면 다음 상담의 해석 품질이 누적 개선된다. `docs/agents/README.md`에 권장 패턴으로 추가할 가치가 있다.
- **카테고리 신규 등장 신호.** `데이트`/`기타_혜영`이 2025-12에 신규 등장했다 (생활 변화 신호). merchant 신규는 purchase gate가 잡지만 category-level first-seen은 baseline 부재로 anomaly가 비어 있을 수 있다. 수요가 확인되면 spending-anomalies에 `is_new_category` 보조 필드를 검토한다.
- **카드대금 이체와 부채 인식.** 카드 사용액은 거래 시점에 지출로 잡히고 카드대금은 이체로 분리되므로 이중 계산은 없다. 다만 "다음 달 카드 결제 예정액"이라는 단기 부채는 어느 surface에도 없다. transfer tracking이 P2 후순위로 밀린 결정과 함께 가는 주제이므로 여기서는 기록만 남긴다.

---

## 권장 실행 순서 요약

| 순서 | 항목 | 성격 | 비고 |
|---|---|---|---|
| 1 | 1, 2 | migration 1건 + service 정렬 | 정합성 버그. 같은 view라 한 번에 처리 |
| 2 | 3 | 문서 수정만 | 코드 변경 없음, 즉시 가능 |
| 3 | 4 | parser + model + API | 상담 개인화의 기반 |
| 4 | 5 | migration + 문서 | 대출 상담 재료 완성 |
| 5 | 6 | dashboard enrichment | 기존 enrichment 패턴 재사용 |
| 6 | 7 | migration (+ 선택 컬럼) | 수입 신뢰도 재료 |
| 7 | 8, 9, 10, 11 | P1.5~P2 | 수요/결정 확인 후 |

각 항목 구현 시 공통 acceptance: `tmp/2025-05-21~2026-05-21.xlsx` 업로드 기준으로 본문에 적힌 "검증" 수치가 재현되어야 하고, `docs/agents/canonical-read-surface-reference.md` 갱신을 같은 PR에 포함한다.
