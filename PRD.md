# my_ledge — 개인 재무 대시보드 + Advisor Analytics PRD

> **Version:** 1.1.0-draft
> **Last Updated:** 2026-03-31
> **Author:** 민규 + Claude (PM/Dev Partner)
> **Status:** Draft — 리뷰 후 확정

---

## 1. 개요

### 1.1 프로젝트 정의

my_ledge는 BankSalad 엑셀 내보내기를 데이터 소스로 사용하는 **개인 재무 대시보드이자 OpenClaw용 advisor analytics backend**다.
BankSalad에서 내보낸 엑셀 파일을 데이터 소스로 사용하여 지출 분석과 자산 변동 tracking을 수행하고, OpenClaw 멀티에이전트 시스템이 재무 어드바이저처럼 동작할 수 있도록 안정적인 해석용 API와 canonical read surface를 제공한다.

### 1.2 목표

1. 월별 수입/지출 추이를 카테고리별로 시각화·분석
2. 자산(부동산, 투자, 대출 등) 변동을 시계열로 tracking
3. OpenClaw 에이전트가 DB에 직접 접근하여 ad-hoc 심층 분석 수행 가능
4. 셀프호스팅 환경에서 안정적으로 운영
5. OpenClaw가 여러 raw query를 조합하지 않고도 현금흐름, 지출 변화, 반복지출, 자산/부채 건강도를 직접 읽을 수 있는 advisor analytics surface 제공

### 1.3 비목표 (Out of Scope)

- 실시간 금융 데이터 연동 (API 스크래핑, 오픈뱅킹 등)
- 다중 사용자 지원
- LLM을 이 서비스에 직접 통합 (분석은 OpenClaw가 수행)
- 완전 자동화된 투자/소비 추천 엔진 (health score, personalized coaching은 후속 단계)
- 뱅샐현황 중 2.현금흐름현황(가계부 내역과 중복), 4.보험현황

---

## 2. 데이터 소스

### 2.1 소스 파일

| 항목 | 값 |
|---|---|
| 형식 | `.xlsx` (엑셀), 암호화됨 |
| 출처 | BankSalad 내보내기 |
| 업로드 방식 | 수동 업로드 또는 OpenClaw 에이전트가 파일을 받아 업로드 API 호출 |
| 업로드 주기 | 비정기 (수동) |
| 암호 관리 | `.env` 환경변수 (`EXCEL_PASSWORD`) |
| 복호화 도구 | `msoffcrypto-tool` → 복호화 후 `openpyxl`로 파싱 |

개발/검증용 샘플:
- 현재 로컬 샘플 파일은 저장소 내부 `./tmp/finance_sample.xlsx` 이며 비암호화 상태다.
- 실제 BankSalad 암호화 파일 검증은 별도 샘플 확보 후 추가 수행한다.

### 2.2 시트 구조

#### 2.2.1 `가계부 내역` 시트

개별 거래 내역. 업로드 시 **이전 데이터가 포함**되어 들어오므로 중복 제거 필수.

| 컬럼 | 타입 | 설명 | 예시 |
|---|---|---|---|
| 날짜 | `date` | 거래 날짜 | 2026-03-11 |
| 시간 | `time` | 거래 시각 (초 단위) | 18:05:39 |
| 타입 | `string` | `지출` / `수입` / `이체` | 지출 |
| 대분류 | `string` | 1차 카테고리 (∼30종) | 식비, 구독, 금융 |
| 소분류 | `string` | 2차 카테고리 | OTT, 게임, 데이팅앱 |
| 내용 | `string` | 결제처/수입처 | SK텔레콤-자동납부 |
| 금액 | `integer` | 지출=음수, 수입=양수, 취소/환불=부호 반전 | -106600 |
| 화폐 | `string` | 항상 `KRW` | KRW |
| 결제수단 | `string` | 카드/계좌 이름 (∼20종) | 카드 A |
| 메모 | `string?` | 사용자 메모 (대부분 null) | — |

**데이터 특성:**
- 현재 데이터: 2,219건 (2025-03-12 ∼ 2026-03-11, 약 12개월)
- 타입 분포: 지출 1,730건 / 수입 124건 / 이체 365건
- 대분류 ∼30종, 소분류 ∼12종 (대부분 "미분류")
- 결제수단 ∼20종 (상위 5개가 전체의 73%)

#### 2.2.2 `뱅샐현황` 시트

스냅샷 형태의 재무 요약. **테이블 헤더는 동일하나 테이블 위치가 유동적**이므로 헤더 텍스트 기반 파싱 필요.

사용 테이블:

| 번호 | 테이블명 | 용도 | 주요 필드 |
|---|---|---|---|
| 3 | 재무현황 | 자산/부채 스냅샷 | 항목, 상품명, 금액 (자산측) / 항목, 상품명, 금액 (부채측) |
| 5 | 투자현황 | 투자 상세 | 종류, 금융사, 상품명, 투자원금, 평가금액, 수익률, 가입일 |
| 6 | 대출현황 | 대출 상세 | 종류, 금융사, 상품명, 대출원금, 대출잔액, 금리, 신규일, 만기일 |

**미사용 테이블:** 1.고객정보, 2.현금흐름현황(가계부와 중복), 4.보험현황

---

## 3. 데이터 모델

### 3.1 핵심 테이블

```
┌─────────────────────────────────────────┐
│ transactions (가계부 내역)                │
├─────────────────────────────────────────┤
│ id              SERIAL PK               │
│ date            DATE NOT NULL            │
│ time            TIME NOT NULL            │
│ type            VARCHAR(10) NOT NULL     │  -- '지출','수입','이체'
│ category_major  VARCHAR(50) NOT NULL     │  -- 대분류 (원본)
│ category_minor  VARCHAR(50)              │  -- 소분류 (원본)
│ category_major_user VARCHAR(50)          │  -- 대분류 (사용자 수정, NULL=원본 사용)
│ category_minor_user VARCHAR(50)          │  -- 소분류 (사용자 수정, NULL=원본 사용)
│ description     VARCHAR(500) NOT NULL    │  -- 내용
│ amount          INTEGER NOT NULL         │  -- 원본 부호 유지
│ currency        VARCHAR(5) DEFAULT 'KRW' │
│ payment_method  VARCHAR(100)             │  -- 결제수단
│ memo            TEXT                     │
│ is_deleted      BOOLEAN DEFAULT FALSE    │  -- 소프트 삭제
│ merged_into_id  INTEGER REFERENCES       │  -- 병합 시 대상 거래 ID
│                 transactions(id)         │
│ source          VARCHAR(10) DEFAULT      │
│                 'import'                 │  -- 'import' | 'manual'
│ created_at      TIMESTAMPTZ DEFAULT NOW()│
│ updated_at      TIMESTAMPTZ DEFAULT NOW()│
│ INDEX idx_tx_datetime (date, time)       │  -- 중복 필터링용 인덱스
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ asset_snapshots (재무현황 스냅샷)         │
├─────────────────────────────────────────┤
│ id              SERIAL PK               │
│ snapshot_date   DATE NOT NULL            │  -- 업로드 API 필수 입력값
│ side            VARCHAR(10) NOT NULL     │  -- 'asset' / 'liability'
│ category        VARCHAR(50) NOT NULL     │  -- 자유입출금, 투자성, 부동산, 장기대출 등
│ product_name    VARCHAR(200) NOT NULL    │
│ amount          NUMERIC(15,2) NOT NULL   │  -- 소수점 있는 해외주식 평가액
│ created_at      TIMESTAMPTZ DEFAULT NOW()│
│ UNIQUE(snapshot_date, side, category,    │
│        product_name)                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ investments (투자현황 스냅샷)             │
├─────────────────────────────────────────┤
│ id              SERIAL PK               │
│ snapshot_date   DATE NOT NULL            │
│ product_type    VARCHAR(20)              │  -- 펀드, 주식
│ broker          VARCHAR(50)              │  -- 금융사
│ product_name    VARCHAR(200) NOT NULL    │
│ cost_basis      NUMERIC(15,2)            │  -- 투자원금
│ market_value    NUMERIC(15,2)            │  -- 평가금액
│ return_rate     NUMERIC(8,4)             │  -- 수익률(%)
│ created_at      TIMESTAMPTZ DEFAULT NOW()│
│ UNIQUE(snapshot_date, broker,            │
│        product_name)                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ loans (대출현황 스냅샷)                   │
├─────────────────────────────────────────┤
│ id              SERIAL PK               │
│ snapshot_date   DATE NOT NULL            │
│ loan_type       VARCHAR(30)              │  -- 은행 대출, 할부금융 등
│ lender          VARCHAR(50)              │  -- 금융사
│ product_name    VARCHAR(200) NOT NULL    │
│ principal       NUMERIC(15,2)            │  -- 대출원금
│ balance         NUMERIC(15,2)            │  -- 대출잔액
│ interest_rate   NUMERIC(5,2)             │  -- 대출금리(%)
│ start_date      DATE                     │
│ maturity_date   DATE                     │
│ created_at      TIMESTAMPTZ DEFAULT NOW()│
│ UNIQUE(snapshot_date, lender,            │
│        product_name)                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ upload_logs (업로드 이력)                 │
├─────────────────────────────────────────┤
│ id              SERIAL PK               │
│ uploaded_at     TIMESTAMPTZ DEFAULT NOW()│
│ filename        VARCHAR(200)             │
│ snapshot_date   DATE                     │  -- 업로드 API 입력값 기록
│ tx_total        INTEGER                  │  -- 가계부 전체 행 수
│ tx_new          INTEGER                  │  -- 신규 INSERT 건수
│ tx_skipped      INTEGER                  │  -- 중복 SKIP 건수
│ status          VARCHAR(20)              │  -- 'success','partial','failed'
│ error_message   TEXT                     │
└─────────────────────────────────────────┘
```

### 3.2 중복 방지 전략

**가계부 내역: 시간 커서 기반 증분 적재**

파일 내 데이터는 중복이 없다 (초 단위까지 구분). 문제는 파일 간 중복 — 새 파일에 이전 스냅샷의 누적 데이터가 포함되어 들어온다는 점이다.

전략:
1. 업로드 시 DB에서 `SELECT MAX(date || time) FROM transactions` 로 마지막 거래 시점 조회
2. 새 파일의 거래 중 **마지막 시점 이후 건만** INSERT
3. 경계 시점 거래 처리: 같은 초에 복수 거래가 있을 수 있으므로, 경계 시점(=마지막 시점)의 거래는 **이미 DB에 존재하는 건과 비교**하여 미존재 건만 추가
4. 업로드 결과로 전체/신규/스킵 건수를 `upload_logs`에 기록

```
기존 DB 데이터:  [───────────────────|] ← max datetime
새 파일 데이터:  [───────────────────|──────────] ← 이전 + 신규
                                     ↑ 여기부터만 INSERT
```

**뱅샐현황 (스냅샷):** `INSERT ... ON CONFLICT DO UPDATE`
- 복합키에 `snapshot_date` 포함
- 같은 날짜에 재업로드하면 금액 등 값 업데이트
- `snapshot_date` 결정 규칙:
  1. 업로드 API는 `snapshot_date`를 필수로 받는다
  2. 전달된 값을 `asset_snapshots`, `investments`, `loans`, `upload_logs.snapshot_date`에 동일하게 기록한다
  3. 서버 업로드 날짜 fallback은 허용하지 않는다

**부분 성공(`partial`) 정책**
- 가계부 내역 적재와 뱅샐현황 스냅샷 적재는 논리적으로 분리한다.
- 한쪽이 성공하고 다른 한쪽이 실패하면 성공한 쪽은 유지하고 `upload_logs.status='partial'`로 기록한다.
- 실패 원인은 `error_message`에 저장하고 API 응답에도 노출한다.

### 3.3 거래 타입 처리 규칙

| 타입 | 처리 | 분석 포함 여부 |
|---|---|---|
| `지출` (금액 < 0) | 지출 분석 대상 | ✅ 지출 분석 |
| `지출` (금액 > 0) | 결제 취소/환불 → 해당 월 지출에서 상계 | ✅ 지출 분석 (상계) |
| `수입` | 수입 분석 대상 | ✅ 수입 분석 |
| `이체` | 자산 이동으로 분류 | ❌ 수입/지출 제외, 별도 '자산이동' tracking |

### 3.4 어드바이저 확장용 데이터 모델 계획

현재 advisor analytics 구현의 출발점은 기존 스키마다. 다만 아래 항목은 후속 정밀도 향상을 위해 단계적으로 보강한다.

| 구분 | 현재 상태 | 계획 | 용도 |
|---|---|---|---|
| 거래처 정규화 | `transactions.description` 기반 | `merchant_normalized` nullable 컬럼 또는 `merchant_alias_rules` 테이블 추가 검토 | recurring / anomaly / merchant aggregation 품질 향상 |
| 고정비 분류 | `cost_kind`, `fixed_cost_necessity` 컬럼 존재 | bulk edit 및 규칙 보강으로 coverage 확대 | fixed/variable, essential/discretionary 진단 |
| 현금성 자산 분류 | `asset_snapshots.category` 문자열만 존재 | category-to-liquidity 매핑 테이블 또는 `is_cash_equivalent` / `liquidity_tier` 추가 검토 | emergency fund / liquidity runway 계산 |
| 대출 상환 메타데이터 | `balance`, `interest_rate`, `start_date`, `maturity_date` 존재 | `monthly_payment`, `repayment_type` 보강 검토 | debt burden / DTI / DSR 정밀도 향상 |
| 목표 계층 | 없음 | `budgets`, `financial_goals`, `advice_preferences` 후속 검토 | personalized coaching, goal-based advice |

원칙:

- P0 analytics는 **새 스키마 없이** 현재 canonical layer 위에서 구현한다.
- schema enrichment가 필요한 항목은 먼저 **추정치 API**로 출시하고, 응답 필드명에 `*_est`, `confidence`, `assumptions`를 포함해 과신을 막는다.

---

## 4. 시스템 아키텍처

### 4.1 기술 스택

| 레이어 | 기술 | 비고 |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | 공통 UI는 점진적으로 shadcn/ui primitive로 정리, 차트는 shadcn/ui chart 패턴 우선 검토 |
| Backend | FastAPI (Python) | `uv` 패키지 관리, Pydantic v2 |
| Database | PostgreSQL 16+ | Alembic 마이그레이션 |
| 파일 파싱 | `msoffcrypto-tool` + `openpyxl` (data_only=True) | 암호 해제 + 파싱 |
| 인프라 | Docker Compose | 개인 서버 셀프호스팅 |
| 도메인 | 별도 도메인 연결 (리버스 프록시) | Caddy 또는 Traefik |

### 4.2 컨테이너 구성

```yaml
# docker-compose.yml 개요
services:
  frontend:
    # React SPA (Nginx serving)
    ports: ["3000:80"]

  backend:
    # FastAPI
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [db]

  db:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: my_ledge
      POSTGRES_USER: my_ledge
      POSTGRES_PASSWORD: ${DB_PASSWORD}

volumes:
  pgdata:
```

### 4.3 OpenClaw 연동 아키텍처

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  OpenClaw    │     │  my_ledge    │     │  PostgreSQL  │
│  에이전트     │     │  Backend     │     │              │
│              │     │  (FastAPI)   │     │              │
│  ┌────────┐  │     │              │     │              │
│  │파일업로드├──┼────▶│ POST /upload │────▶│  INSERT      │
│  └────────┘  │     │              │     │              │
│              │     │              │     │              │
│  ┌────────┐  │     │              │     │              │
│  │SQL 분석 ├──┼─────┼──────────────┼────▶│  SELECT      │
│  └────────┘  │     │              │     │  (readonly)  │
│              │     │              │     │              │
│  ┌────────┐  │     │              │     │              │
│  │API 조회 ├──┼────▶│ GET /api/*   │────▶│  SELECT      │
│  └────────┘  │     │              │     │  (views)     │
└──────────────┘     └──────────────┘     └──────────────┘
```

**연동 방식: 하이브리드**

| 기능 | 경로 | 설명 |
|---|---|---|
| 데이터 업로드 (쓰기) | REST API 전용 | `POST /api/v1/upload` — 파일 수신 → 복호화 → 파싱 → 중복 제거 → 적재 |
| 정형 분석 (읽기) | REST API | 월별 요약, 카테고리 합계 등 자주 쓰는 뷰. 거래 분석 계층은 canonical view (`vw_transactions_effective`, `vw_category_monthly_spend`)를 공통 read surface로 사용한다 |
| 어드바이저 해석 (읽기) | REST API | OpenClaw가 직접 소비하는 해석용 aggregate endpoint. 월별 현금흐름, MoM 변화량, 반복지출, 자산/부채 건강도 같은 계산을 백엔드가 책임진다 |
| Ad-hoc 분석 (읽기) | DB 직접 접근 | `readonly` PostgreSQL 유저, `statement_timeout=30s` |

**DB 접근 보안:**
- `readonly` 유저: `GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;`
- `statement_timeout`: `ALTER ROLE readonly SET statement_timeout = '30s';`
- OpenClaw 에이전트 TOOLS.md에 스키마 문서 포함

---

## 5. API 설계

### 5.1 데이터 업로드

```
POST /api/v1/upload
Content-Type: multipart/form-data

Parameters:
  file: xlsx 파일 (암호화된 상태)
  snapshot_date: string (required, YYYY-MM-DD)

Headers:
  X-API-Key: <api_key>

Response 200:
{
  "status": "success",
  "upload_id": 42,
  "transactions": {
    "total": 2219,
    "new": 150,
    "skipped": 2069
  },
  "snapshots": {
    "asset_snapshots": 38,
    "investments": 11,
    "loans": 5
  }
}
```

업로드 응답 규칙:
- 전체 성공 시 `status='success'`
- 거래/스냅샷 중 일부만 반영되면 `status='partial'`
- 둘 다 실패하면 `status='failed'`
- `partial`, `failed` 시 `error_message` 또는 errors 배열에 실패 구간을 포함한다.

### 5.2 지출 분석 API

```
GET /api/v1/transactions/summary
  ?start_date=2025-04-01
  &end_date=2026-03-31
  &group_by=month          # month | week | day
  &type=지출               # 지출 | 수입 | 이체 | all

GET /api/v1/transactions/by-category
  ?start_date=2025-04-01
  &end_date=2026-03-31
  &level=major             # major | minor
  &type=지출

GET /api/v1/transactions/by-category/timeline
  ?start_date=2025-04-01
  &end_date=2026-03-31
  &level=major             # major | minor
  &type=지출

GET /api/v1/transactions
  ?start_date=2026-03-01
  &end_date=2026-03-31
  &category_major=식비
  &payment_method=카드 A
  &is_edited=true          # true | false | all
  &include_deleted=false
  &include_merged=false
  &search=배달
  &page=1&per_page=50

GET /api/v1/transactions/payment-methods
  ?start_date=2025-04-01
  &end_date=2026-03-31
```

구현 규칙:
- 거래 조회/분석 API는 canonical analysis layer를 공통 해석 기준으로 사용한다.
- row-level 해석은 `vw_transactions_effective` 기준으로 맞추고, 월별 카테고리 지출 집계는 `vw_category_monthly_spend`를 우선 사용한다.
- 이 레이어는 `is_deleted = FALSE`, `merged_into_id IS NULL`, 사용자 수정 카테고리 우선(`COALESCE(category_*_user, category_*)`) 규칙을 API별로 중복 구현하지 않도록 하는 목적을 가진다.

### 5.3 거래 데이터 편집 API

업로드된 거래 데이터를 사용자가 직접 편집할 수 있다.

```
# 카테고리 수정 (대분류/소분류)
PATCH /api/v1/transactions/{id}
Body:
{
  "category_major_user": "식비",     // 사용자 지정 대분류
  "category_minor_user": "배달",     // 사용자 지정 소분류
  "memo": "쿠팡이츠 배달음식"        // 메모 수정
}

# 거래 삭제 (소프트 삭제)
DELETE /api/v1/transactions/{id}
→ is_deleted = TRUE (원본 보존, 분석에서 제외)

# 삭제 복원
POST /api/v1/transactions/{id}/restore
→ is_deleted = FALSE

# 거래 병합 (중복 or 분할 건 통합)
POST /api/v1/transactions/merge
Body:
{
  "source_ids": [101, 102],         // 병합할 거래 ID 목록
  "target": {                       // 병합 결과 거래
    "date": "2026-03-09",
    "time": "06:10:00",
    "type": "지출",
    "category_major": "데이트",
    "category_minor": "데이팅앱",
    "description": "헥토파이낸셜 (병합)",
    "amount": -270000,
    "payment_method": "카드 B"
  }
}
→ source 거래들은 merged_into_id가 설정되고 is_deleted = TRUE

# 수동 거래 추가
POST /api/v1/transactions
Body:
{
  "date": "2026-03-15",
  "time": "12:00:00",
  "type": "지출",
  "category_major": "식비",
  "category_minor": "외식",
  "description": "현금 결제 식당",
  "amount": -15000,
  "payment_method": "현금",
  "source": "manual"
}

# 일괄 카테고리 수정
PATCH /api/v1/transactions/bulk-update
Body:
{
  "ids": [101, 102, 103],
  "category_major_user": "식비",
  "category_minor_user": "배달"
}
```

**카테고리 표시 규칙:**
- `category_major_user`가 NOT NULL이면 사용자 수정값 사용
- NULL이면 원본 `category_major` 사용
- SQL: `COALESCE(category_major_user, category_major)`
- 원본 카테고리는 항상 보존 (되돌리기 가능)
- 편집 UI의 카테고리/결제수단 드롭다운은 `transactions` 테이블의 distinct 값으로 구성한다.

**분석 시 필터 규칙:**
- `is_deleted = TRUE`인 건은 모든 분석에서 제외
- `merged_into_id IS NOT NULL`인 건도 분석에서 제외 (병합 대상에 포함됨)

**MVP 범위 제외:**
- 거래 병합(`POST /api/v1/transactions/merge`)은 API 정의를 유지하되 MVP 구현 범위에서는 제외한다.
- 병합 해제, 병합 원본 복원, 병합 target/원본 간 편집 규칙도 MVP 이후로 미룬다.

### 5.4 자산 분석 API

```
GET /api/v1/assets/snapshots
  ?start_date=2025-01-01
  &end_date=2026-03-31

GET /api/v1/assets/net-worth-history
  # 스냅샷 시점별 총자산-총부채 시계열

GET /api/v1/investments/summary
  ?snapshot_date=latest     # latest 또는 특정 날짜

GET /api/v1/loans/summary
  ?snapshot_date=latest
```

### 5.5 OpenClaw 전용

```
GET /api/v1/schema
  # DB 스키마 문서 반환 (테이블, 컬럼, 타입, 설명)
  # OpenClaw 에이전트가 SQL 쿼리 작성 시 참조
```

보안 규칙:
- `POST /api/v1/upload` 와 `GET /api/v1/schema` 는 `X-API-Key` 헤더 기반 인증을 요구한다.
- 쓰기성 거래 편집 API도 동일한 API key 인증을 적용한다.

### 5.6 Advisor Analytics API (Planned)

이 레이어의 목적은 OpenClaw가 여러 raw endpoint와 SQL을 조합해 매번 계산하지 않도록, 재무 해석 결과를 백엔드에서 안정적으로 제공하는 것이다.

#### P0 — 현재 스키마로 바로 구현 가능한 핵심 해석 API

| Endpoint | 핵심 출력 | 데이터 소스 | 구현 가능성 |
|---|---|---|---|
| `GET /api/v1/analytics/monthly-cashflow` | `income`, `expense`, `transfer`, `net_cashflow`, `savings_rate` | `vw_transactions_effective` | 즉시 구현 가능 |
| `GET /api/v1/analytics/category-mom` | `category`, `current_amount`, `previous_amount`, `delta_amount`, `delta_pct` | `vw_transactions_effective` 또는 `vw_category_monthly_spend` | 즉시 구현 가능 |
| `GET /api/v1/analytics/fixed-cost-summary` | `fixed_total`, `variable_total`, `essential_fixed_total`, `discretionary_fixed_total`, `unclassified_*` | `vw_transactions_effective.cost_kind`, `fixed_cost_necessity` | 즉시 구현 가능. 단, 미분류 규모를 반드시 노출 |
| `GET /api/v1/analytics/merchant-spend` | `merchant`, `amount`, `count`, `avg_amount`, `last_seen_at` | `vw_transactions_effective.description` | 즉시 구현 가능(v1) |

P0 설계 규칙:

- `monthly-cashflow`의 `net_cashflow = income - expense`
- `savings_rate = (income - expense) / income`, `income = 0`이면 `null`
- `category-mom`은 `previous_amount = 0`일 때 `delta_pct = null`
- `fixed-cost-summary`는 데이터 공백을 숨기지 않고 `unclassified_total`, `unclassified_count`를 함께 노출
- `merchant-spend` v1은 raw `description` 기준으로 시작하고, alias/정규화는 후속 단계로 분리

#### P1 — rule-based diagnostics

| Endpoint | 핵심 출력 | 현재 구현 전략 | 제약 |
|---|---|---|---|
| `GET /api/v1/analytics/recurring-payments` | `merchant`, `typical_amount`, `detected_cycle`, `occurrences`, `confidence` | description/merchant 그룹 + 날짜 간격 휴리스틱 | `merchant_normalized` 부재로 precision 저하 가능 |
| `GET /api/v1/analytics/spending-anomalies` | `baseline_amount`, `anomaly_score`, `reason` | 최근 N개월 baseline + category/merchant rule | rule-based v1, `confidence` 또는 `reason` 노출 필요 |
| `GET /api/v1/analytics/payment-method-patterns` | 결제수단별 총액, 건수, 상위 카테고리 | `payment_method` + effective category 집계 | 즉시 구현 가능 |
| `GET /api/v1/analytics/income-stability` | 월 수입 시계열 + `avg`, `stdev`, `coefficient_of_variation` | 월별 수입 집계 후 통계 계산 | 표본 수 적을 때 해석 제한 |

P1 설계 규칙:

- heuristic 결과는 `confidence`, `reason`, `assumptions` 중 최소 하나를 응답에 포함한다.
- OpenClaw는 P1 결과를 그대로 설명에 사용하고, drill-down이 필요할 때만 raw transaction 조회로 내려간다.

#### P2 — 자산/부채 건강도 API

| Endpoint | 핵심 출력 | 현재 구현 전략 | 제약 |
|---|---|---|---|
| `GET /api/v1/analytics/net-worth-breakdown` | 자산/부채 카테고리별 구성 | `asset_snapshots` latest snapshot 집계 | 즉시 구현 가능 |
| `GET /api/v1/analytics/investment-performance` | snapshot별 `cost_basis`, `market_value`, `unrealized_pnl`, `return_rate` | `investments` history 집계 | 즉시 구현 가능 |
| `GET /api/v1/analytics/debt-burden` | `balance`, `estimated_monthly_payment`, `dti_est`, `dsr_est` | `loans` + `income-stability` 기반 추정 | 정확 상환액 데이터 부재 |
| `GET /api/v1/analytics/emergency-fund` | `cash_equivalent_assets`, `monthly_essential_spend`, `runway_months` | `asset_snapshots` + essential fixed spend 기반 계산 | cash-equivalent 분류 규칙 필요 |

P2 설계 규칙:

- 정확히 측정할 수 없는 값은 `*_est` suffix를 사용한다.
- debt/emergency APIs는 계산에 사용한 기준과 누락 데이터를 `assumptions`로 함께 돌려준다.

#### 권장 canonical aggregate layer

| View | 목적 | 우선순위 |
|---|---|---|
| `vw_monthly_cashflow` | 월별 income/expense/transfer/net_cashflow/savings_rate canonical aggregate | 높음 |
| `vw_category_monthly_mom` | category별 current/previous/delta aggregate | 중간 |
| `vw_fixed_cost_monthly_summary` | fixed/variable/essential/discretionary/unclassified 집계 | 중간 |
| `vw_merchant_monthly_spend` | merchant 기준 월별 집계 | 높음 |
| `vw_investment_performance_history` | snapshot별 cost basis / market value / pnl history | 중간 |

권장 구현 순서:

1. P0 endpoint 4종 + `vw_monthly_cashflow`, `vw_merchant_monthly_spend`
2. P1 heuristic endpoint 4종
3. P2 asset/loan health endpoint 4종
4. schema enrichment (`merchant_normalized`, liquidity mapping, loan repayment metadata)

---

## 6. 대시보드 UI

### 6.1 페이지 구성

#### 6.1.1 메인 대시보드 (`/`)

- **이번 달 요약 카드**: 총수입, 총지출, 순수입, 전월 대비 변동
- **월별 수입/지출 추이**: 라인+바 차트 (최근 12개월)
- **카테고리별 지출 비중**: 도넛 차트 (대분류 기준, 당월)
- **최근 거래 내역**: 최근 10건 테이블

#### 6.1.2 지출 분석 (`/spending`)

- **월별 카테고리 누적 영역 차트** (대분류)
  - dual-thumb month-range slider로 기간 선택
- **월별 고정비/변동비 추이**
  - 월별 카테고리 추이와 같은 기간 범위를 공유
  - 분류 데이터가 비어 있으면 placeholder/empty-state 표시
- **공용 기간 필터**
  - `카테고리별 지출`, `하위 카테고리별 지출`, `결제수단별 지출`, `거래처별 Tree Map`, `거래 내역`에 함께 적용
- **카테고리별 지출** (상위 카테고리 bar chart)
- **하위 카테고리별 지출** (bar chart)
  - 상위 카테고리 필터 제공
  - 표는 두지 않고 차트 중심으로 유지
- **결제수단별 지출 분포** (파이 차트)
- **거래처별 Tree Map**
  - 별도 거래처 필드가 생기기 전까지는 `description` 기준 집계로 우선 제공
- **거래 내역**
  - 카테고리/결제수단/검색 필터 적용
  - 기본 접힘 아코디언
  - 최대 20행 페이지네이션

#### 6.1.3 수입 분석 (`/income`)

- **월별 수입 추이** (급여 vs 기타 수입)
- **수입원별 분포**

#### 6.1.4 자산이동 (`/transfers`)

- **이체 타입별 월간 추이** (카드대금, 저축, 투자 등)
- **이체 내역 테이블**

#### 6.1.5 자산 현황 (`/assets`)

- **순자산 시계열 차트** (스냅샷 기준)
- **자산 구성 트리맵** (자유입출금, 투자성, 부동산, 연금 등)
- **부채 구성**: 대출별 잔액 + 금리 비교
- **투자 포트폴리오**: 종목별 평가액, 수익률
- **대출 상환 진행률**: 원금 대비 잔액

#### 6.1.6 데이터 관리 (`/data`)

- **파일 업로드 UI**: 엑셀 파일 드래그&드롭, 업로드 결과 표시 (신규/스킵 건수)
- **거래 내역 편집 테이블**:
  - 인라인 편집: 대분류/소분류 드롭다운 수정, 메모 편집
  - 행 선택 → 일괄 카테고리 변경
  - 소프트 삭제 + 복원
  - 수동 거래 추가 폼
  - 원본/수정값 비교 표시 (수정된 셀 하이라이트)
  - 필터: 날짜 범위, 카테고리, 결제수단, 수정 여부(`원본만`/`수정됨만`/`전체`)
- **업로드 이력**: upload_logs 테이블 조회

향후 확장:
- 현재 거래내역 초기화 기능: `거래내역만 초기화` 와 `스냅샷까지 모두 초기화` 를 분리된 옵션으로 제공
- 거래 편집 고급 기능: 설명, 카테고리명, 상태, 메모 등을 다건 선택 후 일괄 편집

MVP에서는 거래 병합 UI를 제공하지 않는다.

### 6.2 추가 분석 제안

데이터 기반으로 다음 분석을 추가 제공:

| 분석 | 설명 | 필요 데이터 |
|---|---|---|
| **고정비 vs 변동비 분류** | 거래 단위 `cost_kind` (`fixed`/`variable`) 수동 또는 규칙 기반 분류 | transactions.cost_kind |
| **고정비 필수/비필수 분류** | 고정비 거래에 대해 `fixed_cost_necessity` (`essential`/`discretionary`) 분류 | transactions.fixed_cost_necessity |
| **전월 대비 카테고리별 변동** | 각 카테고리 MoM 증감율 및 이상치 탐지 | transactions |
| **요일별/시간대별 소비 패턴** | 주중 vs 주말, 시간대별 지출 분포 | date + time |
| **결제수단별 사용 패턴** | 카드별 월 이용액, 주 사용 카테고리 | payment_method |
| **DTI/DSR 추정** | 월 급여 대비 월 대출 상환액 비율 | 급여 + loans |
| **투자 수익률 시계열** | 스냅샷 간 평가액 변동 추적 | investments |
| **저축률 추이** | (수입 - 지출) / 수입 × 100, 월별 | transactions |

---

## 7. 파일 파싱 상세

### 7.1 엑셀 복호화

```python
import msoffcrypto
import io

def decrypt_excel(file_bytes: bytes, password: str) -> io.BytesIO:
    encrypted = io.BytesIO(file_bytes)
    decrypted = io.BytesIO()
    ms_file = msoffcrypto.OfficeFile(encrypted)
    ms_file.load_key(password=password)
    ms_file.decrypt(decrypted)
    decrypted.seek(0)
    return decrypted
```

### 7.2 가계부 내역 파싱

```python
from openpyxl import load_workbook

def parse_transactions(wb) -> list[dict]:
    ws = wb['가계부 내역']
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]  # ('날짜','시간','타입','대분류','소분류','내용','금액','화폐','결제수단','메모')
    return [dict(zip(header, row)) for row in rows[1:] if row[0] is not None]
```

### 7.3 뱅샐현황 파싱 (위치 유동적 대응)

**핵심: 테이블 번호 헤더 텍스트(`3.재무현황`, `5.투자현황`, `6.대출현황`)를 검색하여 시작 위치를 동적으로 찾는다.**

```python
def find_table_start(rows: list, marker: str) -> int:
    """'3.재무현황' 같은 마커 텍스트로 테이블 시작 행 인덱스 반환"""
    for i, row in enumerate(rows):
        if row[1] and str(row[1]).strip() == marker:
            return i
    raise ValueError(f"Table marker '{marker}' not found")
```

각 테이블의 파싱 종료 조건: 다음 테이블 마커 또는 시트 끝.

---

## 8. 배포 및 운영

### 8.1 인프라

| 항목 | 값 |
|---|---|
| 서버 | Intel N100, 16GB RAM, Proxmox |
| 네트워크 | 1Gbps 광랜 |
| 스토리지 | 1TB SSD + HDD (ZFS) |
| 컨테이너 | Docker Compose |
| 리버스 프록시 | Caddy (자동 HTTPS) |
| 도메인 | 별도 연결 예정 |

### 8.2 환경변수 (`.env`)

```env
# Database
DB_PASSWORD=<postgres_password>
DB_READONLY_PASSWORD=<readonly_user_password>

# Excel
EXCEL_PASSWORD=<banksalad_excel_password>

# App
SECRET_KEY=<app_secret>
API_KEY=<internal_api_key>
CORS_ORIGINS=https://my-ledge.example.com
```

### 8.3 백업

- PostgreSQL: `pg_dump` 일간 크론 → ZFS 스냅샷
- 업로드된 원본 엑셀 파일: `/data/uploads/` 디렉토리에 최근 5개만 보관

---

## 9. 개발 규칙 (AGENTS.md 호환)

코딩 에이전트 (Codex, OpenClaw 등)가 참조하는 개발 규칙:

### 9.1 공통

- **패키지 관리**: `uv` 사용 (pip 금지)
- **인코딩**: UTF-8-SIG (한글 데이터)
- **Python**: 3.12+, Pydantic v2, `openpyxl`은 `data_only=True`
- **DB 마이그레이션**: Alembic
- **컴포넌트 방향**: Tailwind 기반 공통 primitive를 유지하되, 점진적으로 shadcn/ui 스타일의 재사용 컴포넌트 구조로 정리
- **차트 라이브러리**: shadcn/ui chart 패턴을 우선 검토하고, 커버되지 않는 시각화는 Recharts로 구현
- **카테고리 하드코딩 금지**: DB에서 동적으로 카테고리 목록 조회
- **CLI 프로그램**: importable module 설계 (향후 FastAPI 통합 대비)

### 9.2 프론트엔드

- React + Vite + Tailwind CSS
- 상태관리: React Query (TanStack Query) — 서버 상태 중심
- 라우팅: React Router v6+
- 컴포넌트: 함수형 컴포넌트 + Hooks
- 공통 UI: shadcn/ui 스타일 primitive 도입 우선
- 차트: shadcn/ui chart 패턴 우선, 필요 시 Recharts 사용

### 9.3 백엔드

- FastAPI + `uvicorn`
- `uv` 기반 의존성 관리 (`pyproject.toml`)
- Pydantic v2 모델 for request/response
- SQLAlchemy 2.0 (async) + Alembic
- 엔드포인트 버전: `/api/v1/`

### 9.4 Docker

- 멀티스테이지 빌드 (프론트엔드: node → nginx, 백엔드: python:3.12-slim)
- `docker compose up -d` 로 원커맨드 실행
- healthcheck 포함

---

## 10. 마일스톤

### Phase 1 — 기반 구축 (MVP)

- [ ] DB 스키마 생성 + Alembic 초기 마이그레이션
- [ ] 엑셀 파싱 파이프라인 (복호화 → 파싱 → 시간 커서 기반 증분 적재)
- [ ] 업로드 API (`POST /api/v1/upload`)
- [ ] 기본 조회 API (transactions summary, by-category)
- [ ] canonical analysis layer 1차 (`vw_transactions_effective`, `vw_category_monthly_spend`) + 기존 조회 read path 연결
- [ ] 거래 편집 API (PATCH, DELETE, POST, merge, bulk-update)
- [ ] Docker Compose 구성
- [ ] 데이터 검증: 파싱 결과 vs 원본 엑셀 크로스체크

### Phase 2 — 대시보드 Core

- [ ] 메인 대시보드 (요약 카드 + 월별 추이 + 도넛 차트)
- [ ] 지출 분석 페이지 (누적 영역, 기간 분리, 파이 차트, Tree Map, 아코디언 거래 내역)
- [ ] 자산 현황 페이지 (순자산 시계열, 투자/대출)
- [ ] 데이터 관리 페이지 (업로드 UI + 거래 편집 테이블 + 인라인 카테고리 수정)

### Phase 3 — OpenClaw 연동

- [ ] readonly DB 유저 설정 + 스키마 문서 API
- [ ] OpenClaw TOOLS.md에 my_ledge DB 접근 스킬 추가
- [ ] OpenClaw 에이전트 → 업로드 API 연동 테스트

### Phase 4 — 고급 분석 + 운영 안정화

- [x] Phase 4A — advisor analytics foundation
  - [x] `GET /api/v1/analytics/monthly-cashflow`
  - [x] `GET /api/v1/analytics/category-mom`
  - [x] `GET /api/v1/analytics/fixed-cost-summary`
  - [x] `GET /api/v1/analytics/merchant-spend`
  - [ ] canonical aggregate view 보강 (`vw_monthly_cashflow`, `vw_merchant_monthly_spend`)
- [ ] Phase 4B — advisor diagnostics
  - [ ] `GET /api/v1/analytics/recurring-payments`
  - [ ] `GET /api/v1/analytics/spending-anomalies`
  - [ ] `GET /api/v1/analytics/payment-method-patterns`
  - [ ] `GET /api/v1/analytics/income-stability`
  - [ ] merchant normalization 전략 확정 (`description` only vs alias rule table)
- [ ] Phase 4C — asset/liability health
  - [ ] `GET /api/v1/analytics/net-worth-breakdown`
  - [ ] `GET /api/v1/analytics/investment-performance`
  - [ ] `GET /api/v1/analytics/debt-burden`
  - [ ] `GET /api/v1/analytics/emergency-fund`
  - [ ] liquidity classification / loan repayment metadata 설계 고정
- [ ] 수입 분석 / 자산이동 페이지
- [ ] 자동 백업 크론
- [ ] 도메인 연결 + HTTPS

---

## 11. 열린 질문 / 향후 검토

| 항목 | 상태 | 비고 |
|---|---|---|
| BankSalad 외 데이터 소스 추가 | 미정 | 카드사 직접 연동, Toss 등 |
| 예산 설정 기능 | 미정 | 카테고리별 월 예산 → 초과 알림 |
| 자산이동 자동 분류 규칙 | Phase 4 | 이체 대분류(카드대금/저축/투자) 기반 자동태깅 |
| 소분류 자동 분류 개선 | 다음 버전 | 현재 85%가 "미분류" — 이번 버전은 수동 편집만, 다음 버전에서 description 기반 규칙 매핑 or ML 도입 |
| 모바일 반응형 | Phase 2+ | Tailwind 기반 반응형 우선 |
| 알림 시스템 | 미정 | 이상 지출 탐지 → Discord/Telegram 알림 |
| 현재 거래내역 초기화 기능 | 다음 버전 | `거래내역만 초기화` 와 `스냅샷까지 모두 초기화` 를 분리 옵션으로 제공 |
| 거래 편집 고급 일괄 편집 | 다음 버전 | 설명, 카테고리명, 상태, 메모 등 다건 선택 후 일괄 수정 지원 |
| 거래처 정규화 모델 | Phase 4B | recurring/anomaly 품질을 위해 `merchant_normalized` 또는 alias rule 테이블 필요 |
| 현금성 자산 분류 기준 | Phase 4C | emergency fund 계산 정확도를 위해 liquidity mapping 필요 |
| 대출 월 상환액 메타데이터 | Phase 4C | 정확 DTI/DSR 대신 초기에는 `*_est` 추정치만 제공 |
| 예산/목표/선호도 계층 | 장기 | health score, personalized coaching을 위한 기준 데이터 |

---

## 부록 A: 익명화된 데이터 분포 예시

### 대분류 (type=지출, 상위 10)

| 대분류 | 건수 | 비중 |
|---|---|---|
| 미분류 | 300대 | 약 15% |
| 식비 | 300대 | 약 14% |
| 생활/잡화 | 180대 | 약 8% |
| 구독 | 150대 | 약 7% |
| 문화/여가 | 140대 | 약 7% |
| 데이트 | 120대 | 약 5% |
| 금융 | 100대 | 약 5% |
| 자동차 | 100대 | 약 5% |
| 여행/숙박 | 70대 | 약 4% |
| 교통 | 60대 | 약 3% |

### 결제수단 (상위 5)

| 결제수단 | 건수 | 비중 |
|---|---|---|
| 카드 A | 500대 | 약 26% |
| 카드 B | 290대 | 약 13% |
| 계좌 A | 250대 | 약 12% |
| 카드 C | 240대 | 약 11% |
| 카드 D | 230대 | 약 11% |

## 부록 B: 익명화된 재무현황 구조 예시

### 자산 측

| 카테고리 | 항목 수 | 합계(원) |
|---|---|---|
| 자유입출금 자산 | 10 | 약 100만대 |
| 저축성 자산 | 1 | 약 600만대 |
| 전자금융 자산 | 4 | 0 또는 미미 |
| 투자성 자산 | 16 | 약 1천만대 |
| 부동산 | 1 | 약 수억대 |
| 보험 자산 | 2 | 미미 |
| 연금 자산 | 1 | 약 수천만대 |
| **총자산** | | **약 3억대** |

### 부채 측

| 카테고리 | 항목 수 | 합계(원) |
|---|---|---|
| 장기대출 | 1 | 약 1억대 |
| 신용대출 | 2 | 약 5천만대 |
| 할부금융 | 1 | 약 700만대 |
| 마이너스 통장 | 1 | 약 600만대 |
| **총부채** | | **약 2억대** |

**순자산: 약 1억대**
