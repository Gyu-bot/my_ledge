# Finance Advisor Analytics Expansion Plan

> Historical planning document. Do not use this file as the current backend/API source of truth.
> Current live contract: [docs/backend-api-ssot.md](/home/gyurin/projects/my_ledge/docs/backend-api-ssot.md)
> Product-level requirement reference: [PRD.md](/home/gyurin/projects/my_ledge/PRD.md)

## 목적

`my_ledge`를 단순 조회/대시보드 수준에서 끝내지 않고, **개인 재무 어드바이저** 역할까지 수행할 수 있도록 분석 read surface를 확장한다.

이 문서는 현재 이미 구현된 분석 표면과, 추가로 구현해야 할 API/view/데이터 보강 항목을 구분해 정리한다.

핵심 방향:

- 기존 하이브리드 원칙 유지
  - 정형 분석: API 우선
  - ad-hoc drill-down: readonly DB + canonical view
- 어드바이저 응답 품질을 위해 **해석용 aggregate endpoint**를 추가
- OpenClaw/AI skill이 여러 endpoint를 조합해 계산하는 대신, **백엔드가 안정적인 재무 해석 결과를 직접 제공**하도록 범위를 확장

---

## 현재 이미 구현된 기반

아래는 현재 코드 기준으로 이미 존재하는 read surface다.

### 거래/지출 분석

- `GET /api/v1/transactions`
- `GET /api/v1/transactions/summary`
- `GET /api/v1/transactions/by-category`
- `GET /api/v1/transactions/by-category/timeline`
- `GET /api/v1/transactions/payment-methods`

### 자산/부채/투자

- `GET /api/v1/assets/snapshots`
- `GET /api/v1/assets/net-worth-history`
- `GET /api/v1/investments/summary`
- `GET /api/v1/loans/summary`

### 스키마/운영 보조

- `GET /api/v1/schema`
- `GET /api/v1/upload/logs`

### 현재 데이터 모델에 이미 있는 분석 재료

- `transactions.cost_kind`
- `transactions.fixed_cost_necessity`
- `transactions.date`, `transactions.time`
- `transactions.payment_method`
- `asset_snapshots`
- `investments`
- `loans`

즉, 기초 재무 분석을 위한 원천 데이터는 어느 정도 갖춰져 있다. 부족한 것은 **어드바이저용 해석 API와 canonical aggregate layer**다.

---

## 이번 확장의 목표

이번 확장에서 필요한 것은 아래 4가지다.

1. **월별 현금흐름 분석**
   - 수입/지출/이체/순현금흐름/저축률
2. **지출 변화 진단**
   - 카테고리별 전월 대비 증감
   - 이상 급증 항목 탐지
3. **고정비/반복지출 진단**
   - 고정비 vs 변동비
   - 필수 고정비 vs 선택 고정비
   - 반복 결제/구독성 패턴
4. **자산/부채 기반 재무 건강 진단**
   - 투자 성과 추이
   - 대출 부담 추정
   - 비상금/유동성 커버력

---

## 구현 가능성 평가 (2026-03-31)

현재 코드/스키마 기준 구현 가능성은 아래처럼 정리한다.

| 항목 | 구현 가능성 | 판단 근거 | 전제 / 주의사항 |
|---|---|---|---|
| `monthly-cashflow` | 바로 구현 가능 | `transactions.type`, `amount`, canonical read path로 월별 집계 가능 | `transfer`는 별도 합계로 노출하되 `net_cashflow` 계산에는 포함하지 않는다 |
| `category-mom` | 바로 구현 가능 | effective category + 월별 지출 집계가 이미 가능 | `previous_amount=0`일 때 `delta_pct=null` 계약 고정 필요 |
| `fixed-cost-summary` | 조건부 즉시 구현 가능 | `cost_kind`, `fixed_cost_necessity` 컬럼과 canonical view 노출이 이미 있음 | 실제 데이터 공백이 클 수 있으므로 `unclassified_*`를 반드시 함께 노출해야 한다 |
| `merchant-spend` | 바로 구현 가능(v1) | `description` 기준 그룹핑만으로도 상위 거래처 집계 가능 | merchant 정규화 전에는 alias가 분산돼 품질이 제한된다 |
| `recurring-payments` | 규칙 기반 v1 구현 가능 | description/merchant 기준 그룹핑과 날짜 간격 휴리스틱으로 탐지 가능 | `merchant_normalized` 부재로 precision/recall이 낮을 수 있어 `confidence` 필드가 필요하다 |
| `spending-anomalies` | 규칙 기반 v1 구현 가능 | merchant/category 기준 최근 N개월 baseline 계산 가능 | 점수는 추정치이므로 reason/assumptions를 응답에 포함해야 한다 |
| `payment-method-patterns` | 바로 구현 가능 | `payment_method`, effective category, amount 모두 현재 데이터로 집계 가능 | 기존 `/transactions/payment-methods`보다 상위 카테고리 breakdown을 추가로 제공하면 충분하다 |
| `income-stability` | 바로 구현 가능 | 월별 수입 합계와 분산 통계 계산이 현재 데이터로 가능 | 표본 수가 적을 때는 stats 해석이 불안정할 수 있다 |
| `net-worth-breakdown` | 바로 구현 가능 | `asset_snapshots.side/category/amount`로 최신 snapshot 구성 집계 가능 | 카테고리명 normalization 정책만 문서화하면 된다 |
| `investment-performance` | 바로 구현 가능 | `investments` snapshot history로 cost basis / market value 추이 계산 가능 | 시계열이 sparse할 수 있어 missing snapshot gap을 허용해야 한다 |
| `debt-burden` | 추정치로 구현 가능 | `loans.balance`, `interest_rate`, `start_date`, `maturity_date` 기반 추정 가능 | `monthly_payment` 부재로 정확값이 아니라 `*_est`만 제공해야 한다 |
| `emergency-fund` | 조건부 구현 가능 | `asset_snapshots` + 필수지출 기반 runway 계산 자체는 가능 | `cash-equivalent` 분류 기준이 없어 초기에는 규칙/매핑 테이블을 별도 정의해야 한다 |

정리하면:

- **P0**는 현재 스키마와 canonical layer만으로 구현 가능하다.
- **P1**는 rule-based v1로 시작할 수 있으나, merchant normalization이 들어가야 품질이 올라간다.
- **P2**는 일부 구현 가능하지만, `cash-equivalent` 분류와 대출 상환 메타데이터가 없어서 정확한 진단이 아니라 추정 API로 설계해야 한다.

---

## 구현이 필요한 항목 요약

### P0 — 바로 필요한 핵심 API

#### 1) `GET /api/v1/analytics/monthly-cashflow`

목적:

- 월별 수입/지출/이체/순현금흐름을 한 번에 제공
- 어드바이저 응답의 기본 뼈대가 되는 API

예시 쿼리:

```http
GET /api/v1/analytics/monthly-cashflow?start_date=2025-04-01&end_date=2026-03-31
```

예시 응답:

```json
{
  "items": [
    {
      "period": "2026-03",
      "income": 4200000,
      "expense": 2650000,
      "transfer": 480000,
      "net_cashflow": 1550000,
      "savings_rate": 0.3690
    }
  ]
}
```

반영 규칙:

- `type=수입` → income
- `type=지출` → expense
- `type=이체` → transfer
- `net_cashflow = income - expense`
- `savings_rate = (income - expense) / income`
- income가 0이면 `savings_rate=null`

비고:

- 이 API는 기존 `transactions/summary`를 여러 번 호출해서 조합할 수도 있지만, 어드바이저 품질과 계약 안정성을 위해 전용 endpoint로 분리하는 편이 낫다.

---

#### 2) `GET /api/v1/analytics/category-mom`

목적:

- 카테고리별 전월 대비 증감 분석
- "지난달보다 뭐가 늘었는지"를 바로 설명하기 위한 API

예시 쿼리:

```http
GET /api/v1/analytics/category-mom?start_date=2026-02-01&end_date=2026-03-31&level=major&type=지출
```

예시 응답:

```json
{
  "items": [
    {
      "period": "2026-03",
      "previous_period": "2026-02",
      "category": "식비",
      "current_amount": 540000,
      "previous_amount": 390000,
      "delta_amount": 150000,
      "delta_pct": 0.3846
    }
  ]
}
```

반영 규칙:

- `level=major|minor`
- 기본 `type=지출`
- `delta_amount = current_amount - previous_amount`
- `delta_pct = delta_amount / previous_amount`
- `previous_amount = 0`이면 `delta_pct=null`

비고:

- 이 API가 있으면 어드바이저가 카테고리 급증 원인을 먼저 짚고, 이후 상세 거래 조회로 내려갈 수 있다.

---

#### 3) `GET /api/v1/analytics/fixed-cost-summary`

목적:

- 고정비/변동비 구조를 요약
- 고정비 부담과 절감 여지를 빠르게 판단

예시 쿼리:

```http
GET /api/v1/analytics/fixed-cost-summary?start_date=2026-01-01&end_date=2026-03-31
```

예시 응답:

```json
{
  "expense_total": 7800000,
  "fixed_total": 3100000,
  "variable_total": 4700000,
  "fixed_ratio": 0.3974,
  "essential_fixed_total": 2200000,
  "discretionary_fixed_total": 900000,
  "unclassified_total": 1800000,
  "unclassified_count": 42
}
```

반영 규칙:

- 지출 거래만 대상
- `cost_kind=fixed|variable`
- `fixed_cost_necessity=essential|discretionary`
- 분류되지 않은 값은 `unclassified_*`로 별도 집계

비고:

- 현재 컬럼은 이미 있으나, 이를 요약하는 분석 endpoint가 없다.
- 실제 운영에서 값이 대부분 `NULL`일 수 있으므로, 미분류 규모를 같이 노출해야 한다.

---

#### 4) `GET /api/v1/analytics/merchant-spend`

목적:

- 거래처/가맹점 기준 지출 집중도 확인
- 반복적으로 큰 돈이 나가는 지점을 빠르게 찾음

예시 쿼리:

```http
GET /api/v1/analytics/merchant-spend?start_date=2026-01-01&end_date=2026-03-31&type=지출&limit=20
```

예시 응답:

```json
{
  "items": [
    {
      "merchant": "쿠팡",
      "amount": 420000,
      "count": 11,
      "avg_amount": 38181.82,
      "last_seen_at": "2026-03-28T21:14:00"
    }
  ]
}
```

반영 규칙:

- 우선 구현은 `description` 기반 정규화 없이 시작 가능
- 다만 후속 단계에서 `merchant_normalized` 도입을 전제해야 함

비고:

- 프론트에서 `description` 기준 묶음은 가능하지만, 백엔드 read surface로 승격해 두는 편이 AI 어드바이저에 유리하다.

---

## P1 — 어드바이저 품질을 높이는 분석 API

### 5) `GET /api/v1/analytics/recurring-payments`

목적:

- 구독/정기결제/반복 지출 탐지
- "자동으로 새는 돈"을 식별

예시 응답 필드:

```json
{
  "items": [
    {
      "merchant": "넷플릭스",
      "typical_amount": 17000,
      "detected_cycle": "monthly",
      "occurrences": 6,
      "last_paid_at": "2026-03-14T10:11:00",
      "confidence": 0.92
    }
  ]
}
```

판정 아이디어:

- merchant 또는 normalized description 기준 그룹핑
- 금액 편차 허용 범위
- 25~35일 간격이면 monthly 후보
- 6~8일 간격이면 weekly 후보

비고:

- 단순 query보다 heuristic이 섞인 API이므로, AI가 매번 직접 계산하지 않게 백엔드에서 책임지는 편이 낫다.

---

### 6) `GET /api/v1/analytics/spending-anomalies`

목적:

- 평소 패턴 대비 이상 지출 탐지
- "이번 달 왜 유독 많이 썼는지" 설명할 때 사용

예시 응답 필드:

```json
{
  "items": [
    {
      "date": "2026-03-22",
      "category": "식비",
      "merchant": "배달의민족",
      "amount": 68000,
      "baseline_amount": 29000,
      "anomaly_score": 2.34,
      "reason": "same-merchant amount spike"
    }
  ]
}
```

판정 아이디어:

- 동일 merchant 또는 category 기준
- 최근 N개월 평균 대비 편차
- 또는 거래당 금액 분포 대비 z-score류 점수

비고:

- v1에서는 단순 규칙 기반으로 시작해도 충분하다.

---

### 7) `GET /api/v1/analytics/payment-method-patterns`

목적:

- 결제수단별 총액뿐 아니라 사용 패턴까지 제공

예시 응답 필드:

```json
{
  "items": [
    {
      "payment_method": "카드 A",
      "amount": 1450000,
      "count": 73,
      "top_categories": [
        {"category": "식비", "amount": 420000},
        {"category": "교통", "amount": 180000}
      ]
    }
  ]
}
```

비고:

- 현재 `/transactions/payment-methods` 는 총액 수준이라, 어드바이저 응답에는 정보량이 부족하다.

---

### 8) `GET /api/v1/analytics/income-stability`

목적:

- 월 수입 변동성 분석
- 급여형 수입인지, 변동성이 큰지 판단

예시 응답 필드:

```json
{
  "items": [
    {
      "period": "2026-03",
      "income": 4200000
    }
  ],
  "stats": {
    "avg_income": 4050000,
    "stdev_income": 180000,
    "coefficient_of_variation": 0.0444
  }
}
```

비고:

- 대출 부담/저축 계획 해석의 기반으로 유용하다.

---

## P2 — 자산/부채 관점 어드바이저 API

### 9) `GET /api/v1/analytics/net-worth-breakdown`

목적:

- 순자산 총액이 아니라 구성 비중까지 제공
- 자산 편중/부채 편중을 설명 가능하게 함

예시 응답 필드:

```json
{
  "snapshot_date": "2026-03-26",
  "assets": [
    {"category": "현금성", "amount": 12000000},
    {"category": "투자", "amount": 8500000}
  ],
  "liabilities": [
    {"category": "학자금", "amount": 3000000}
  ]
}
```

비고:

- 현재는 총 순자산 history는 가능하지만, 구성 분석은 별도 구현이 필요하다.

---

### 10) `GET /api/v1/analytics/investment-performance`

목적:

- 투자 손익/평가액 추이를 제공
- 투자 성과를 어드바이저가 따로 계산하지 않게 함

예시 응답 필드:

```json
{
  "items": [
    {
      "snapshot_date": "2026-03-26",
      "cost_basis": 7400000,
      "market_value": 8500000,
      "unrealized_pnl": 1100000,
      "return_rate": 0.1486
    }
  ]
}
```

비고:

- 현재 `investments/summary`는 단일 snapshot 요약만 제공한다.

---

### 11) `GET /api/v1/analytics/debt-burden`

목적:

- 대출 상환 부담을 요약
- 저축/투자보다 상환 우선이 필요한지 판단

예시 응답 필드:

```json
{
  "snapshot_date": "2026-03-26",
  "totals": {
    "balance": 5200000,
    "estimated_monthly_payment": 310000,
    "dti_est": 0.0738,
    "dsr_est": 0.0738
  },
  "items": [
    {
      "lender": "은행 A",
      "product_name": "학자금대출",
      "balance": 5200000,
      "interest_rate": 2.7,
      "estimated_monthly_payment": 310000
    }
  ]
}
```

비고:

- 정확한 DTI/DSR은 상환 스케줄 데이터가 없으면 추정치로만 제공해야 한다.
- 응답 필드명에도 `*_est` 를 붙여 과신을 막는다.

---

### 12) `GET /api/v1/analytics/emergency-fund`

목적:

- 비상금/유동성 커버력 판단
- 생활비 몇 개월 버틸 수 있는지 계산

예시 응답 필드:

```json
{
  "snapshot_date": "2026-03-26",
  "cash_equivalent_assets": 6300000,
  "monthly_essential_spend": 1750000,
  "runway_months": 3.6
}
```

비고:

- 이 API는 현금성 자산 분류 기준이 필요하다.
- 자산 카테고리만으로 부족하면 별도 분류 규칙 또는 매핑 테이블이 필요할 수 있다.

---

## 보조적으로 필요한 canonical layer / view

API만 늘리는 것보다, 아래 canonical aggregate view가 있으면 구현과 유지보수가 쉬워진다.

### 권장 추가 view

- `vw_monthly_cashflow`
  - 월별 income / expense / transfer / net_cashflow / savings_rate
- `vw_category_monthly_mom`
  - category별 current / previous / delta
- `vw_fixed_cost_monthly_summary`
  - fixed / variable / essential / discretionary / unclassified
- `vw_merchant_monthly_spend`
  - merchant 기준 월별 집계
- `vw_investment_performance_history`
  - snapshot별 cost_basis / market_value / pnl / return_rate

비고:

- 전부를 반드시 view로 만들 필요는 없다.
- 다만 AI/readonly DB drill-down까지 고려하면, 적어도 `monthly_cashflow` 와 `merchant` 계열은 canonical layer가 있는 편이 좋다.

---

## 데이터 모델 보강이 필요한 항목

### 1) merchant 정규화

현재 상태:

- 거래처 분석은 사실상 `description` 기반이다.

권장 보강:

- `merchant_raw`
- `merchant_normalized`

또는 정규화 룰 테이블:

- `merchant_alias_rules`

이유:

- `쿠팡`, `쿠팡페이`, `Coupang`, `쿠팡(주)` 같은 변형을 하나로 묶을 수 있어야 recurring/anomaly 분석 품질이 올라간다.

---

### 2) 현금성 자산 분류

현재 상태:

- `asset_snapshots.category` 만으로는 emergency fund 계산에 부족할 수 있다.

권장 보강:

- `is_cash_equivalent`
- 또는 `liquidity_tier`

이유:

- CMA, 예금, 증권 예수금, 체크계좌 등을 한 묶음으로 판단해야 한다.

---

### 3) 대출 상환 정보

현재 상태:

- `loans`에는 balance / rate / dates는 있으나 월 상환액이 없다.

권장 보강:

- `monthly_payment`
- `repayment_type`

이유:

- DTI/DSR 추정 정밀도를 높일 수 있다.

---

### 4) 예산/목표 계층

후속 단계에서 필요:

- `budgets`
- `financial_goals`
- `advice_preferences`

이유:

- 진짜 어드바이저처럼 행동하려면 "현재 소비가 목표 대비 어떤지"를 판단할 기준이 필요하다.

---

## 구현 우선순위 제안

### 1차 묶음 (가장 추천)

- `GET /api/v1/analytics/monthly-cashflow`
- `GET /api/v1/analytics/category-mom`
- `GET /api/v1/analytics/fixed-cost-summary`
- `GET /api/v1/analytics/merchant-spend`

이 4개만 있어도:

- 최근 현금흐름
- 무엇이 늘었는지
- 고정비 부담
- 어디에 많이 쓰는지

를 한 번에 설명할 수 있어서, 어드바이저 품질이 크게 올라간다.

### 2차 묶음

- `GET /api/v1/analytics/recurring-payments`
- `GET /api/v1/analytics/spending-anomalies`
- `GET /api/v1/analytics/payment-method-patterns`
- `GET /api/v1/analytics/income-stability`

### 3차 묶음

- `GET /api/v1/analytics/net-worth-breakdown`
- `GET /api/v1/analytics/investment-performance`
- `GET /api/v1/analytics/debt-burden`
- `GET /api/v1/analytics/emergency-fund`

### 4차 묶음 (장기)

- budget / goal / preference 기반 코칭 레이어
- advisor score / health score
- personalized recommendation engine

---

## 구현 범위에서 명시할 주의사항

- write API 추가보다 **read/analysis layer 확장**을 우선한다.
- 어드바이저 해석에 필요한 계산은 가능하면 백엔드 endpoint로 고정한다.
- 추정값은 `*_est`, confidence, assumptions를 함께 노출한다.
- 반복지출/이상탐지는 초기에 rule-based로 시작하고, 나중에 정교화한다.
- readonly DB에서 AI가 재계산해야 하는 부담을 줄이기 위해, 주요 요약은 API surface로 승격한다.

---

## Acceptance 기준

아래가 가능해지면, `my_ledge`는 단순 조회를 넘어서 어드바이저형 스킬을 붙일 수 있다.

- 월별 현금흐름을 한 API로 읽을 수 있다.
- 카테고리별 전월 대비 증가/감소를 직접 읽을 수 있다.
- 고정비/변동비/필수고정비 구조를 직접 읽을 수 있다.
- 거래처 기준 상위 지출과 반복 결제를 식별할 수 있다.
- 이상지출을 규칙 기반이라도 탐지할 수 있다.
- 투자 성과와 대출 부담을 별도 계산 없이 읽을 수 있다.
- 비상금 커버 개월 수를 계산할 수 있다.

---

## 한 줄 결론

현재 `my_ledge`는 **거래 조회와 기본 대시보드 분석은 구현됨**.
개인 재무 어드바이저 역할까지 가려면, 다음 단계의 핵심은 **현금흐름 / 변화량 / 반복지출 / 이상탐지 / 자산부채 해석용 analytics API**를 추가하는 것이다.
