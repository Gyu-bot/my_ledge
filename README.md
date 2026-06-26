# my_ledge

BankSalad 엑셀 내보내기를 데이터 소스로 사용하는 개인 재무 대시보드다.
거래 내역은 증분 import로 누적 적재하고, 자산/투자/대출 스냅샷은 시계열로 관리한다.
읽기 분석은 API와 canonical view를 통해 제공하고, Hermes, Codex, Claude, OpenClaw 같은 외부 에이전트는 readonly DB + API를 함께 사용한다.

## 현재 범위

- Backend: FastAPI, SQLAlchemy async, Alembic, PostgreSQL
- Frontend: Vite, React, TypeScript, Tailwind, TanStack Query
- 데이터 소스: BankSalad `.xlsx`
- 핵심 기능:
  - 엑셀 업로드 및 증분 import
  - BankSalad 고객정보/재무/보험/투자/대출 snapshot import
  - 거래 조회/수정/삭제/복원
  - 데이터 관리 초기화: 거래만 또는 거래+스냅샷 reset
  - 대출 상환 거래 매핑
  - 할부 원장/거래 연결/잔여 회차 forecast
  - 자산 유동성/현금성, 대출 월상환/상환방식 metadata 보강
  - 고정비/변동비, 필수/재량 지출, 반복 결제 분류
  - 카테고리 기반 고정비/반복결제 자동분류, 거래처 정규화, 거래처 기반 대출 자동연결 규칙
  - advisor용 canonical view, 재량 지출 속도, 구매 게이트, 유동성 health, import parity 검증
  - 홈 대시보드
  - 지출 분석
  - 자산·부채
  - 신호
  - 데이터 인박스
  - 거래 작업대
  - 대출 관리
  - 할부 관리
  - 자산 메타
  - 규칙
  - 설정
  - 가져오기
  - 데이터 사전

제품 요구사항과 Phase 범위는 [PRD.md](PRD.md), repo 운영 규칙은 [AGENTS.md](AGENTS.md), 사용자용 구현 현황/로드맵은 [Implentation-plan.md](Implentation-plan.md)를 기준으로 본다.
에이전트가 실행할 OMO 계획은 [.omo/plans/](.omo/plans/) 아래에 둔다.
`docs/STATUS.md`는 더 이상 handoff/status surface로 유지하지 않는 deprecated pointer다.
현재 live backend/API contract는 [docs/backend-api-ssot.md](docs/backend-api-ssot.md)를 우선 참조한다.
에이전트 연동 시에는 [docs/agents/README.md](docs/agents/README.md)와 [docs/agents/canonical-read-surface-reference.md](docs/agents/canonical-read-surface-reference.md)를 먼저 읽고, 운영/skill 패키징은 [docs/agent-integration/README.md](docs/agent-integration/README.md)를 이어서 본다.

## 무엇을 할 수 있나

My Ledge는 BankSalad 엑셀 파일을 개인 재무 분석용 DB로 바꾸고, 같은 데이터를 프론트엔드 화면과 외부 에이전트용 canonical read model에서 함께 읽을 수 있게 한다.

| 영역 | 할 수 있는 일 | 볼 수 있는 항목 |
|---|---|---|
| 데이터 적재 | 암호화된 BankSalad `.xlsx` 업로드, 거래 증분 import, 고객정보/자산/보험/투자/대출 snapshot date 기준 교체 적재 | 업로드 성공/부분 성공/실패, 신규/스킵 거래 수, profile/snapshot 적재 건수, 최근 업로드 이력 |
| 거래 관리 | 거래 검색, 필터, 수동 거래 추가, 카테고리/거래처/메모/비용 성격 수정, soft delete/restore | 원본 카테고리와 사용자 수정 우선 effective category, 결제수단, 거래처, 고정비/변동비, 필수/비필수, 반복분류 |
| 지출 분석 | 월 범위별 지출 구조 분석, 수입 포함 여부 전환, 거래처/카테고리 drill-down | 월별 카테고리 추이, 대분류/소분류 지출, 고정비/변동비 비율, 필수 고정비, 거래처별 지출, 일별 지출 달력, 거래 내역 |
| 자산 분석 | 업로드된 snapshot 기반 자산/부채/투자/대출/보험 현황 확인 | 순자산, 총자산, 총부채, 음수 자산 제외분, 현금성 자산, 유동성 health, 투자 평가액/비중, 보험 계약/추정 보험료, 대출 잔액/금리/상품 |
| 인사이트 | 최근 현금흐름과 이상 징후를 한 화면에서 확인 | 저축률, 수입 변동성, 이상 지출, 재량 지출 속도, 구매 게이트 후보, 반복 결제 후보, 거래처 Top 5, 카테고리 전월 대비 |
| 대출 연결 | 지출 거래 중 대출 상환 성격의 거래를 안정적인 대출 계좌에 직접 연결 | 연결/미연결 후보, 대출 기관/상품/표시명, 신규일/만기일, 상환 유형(원금/이자/원리금/미정), 연결 메모 |
| 할부 관리 | 할부 원장을 만들고 관측 거래를 회차별로 연결 | 활성 할부 항목, 연결/미연결 후보, 단건/일괄 연결, observed/projected/missed 회차, 월별 잔여 forecast |
| 자산 설정 | 최신 자산 row의 유동성/현금성 분류와 대출 월상환 metadata를 보강 | `liquidity_tier`, `is_cash_equivalent`, 대출 `monthly_payment`, `repayment_method`, 수동/추정 source |
| 자동분류 | 카테고리 기반 고정비/변동비 규칙, 반복결제 카테고리 규칙, 거래처 정규화 규칙, 거래처 기반 대출 연결 규칙 관리 | 업로드 후 자동 적용 토글, 기존 데이터 일괄 적용 결과, category/recurring/merchant alias/loan merchant rule 목록, recurring dry-run 승인 |
| 반복 결제 분류 | 거래처별 반복 결제 후보를 수동으로 `할부`, `매월 반복`, `반복 아님`으로 분류 | 반복 후보 그룹, 평균 금액, 발생 횟수, interval/confidence, 그룹 내 거래 id, 저장된 분류 상태 |
| 에이전트/SQL 분석 | Hermes, Codex, Claude, OpenClaw 같은 외부 에이전트가 readonly DB와 API를 함께 사용 | raw table schema, canonical view schema, canonical value dictionary, analytics endpoint, stable loan/account/profile/insurance read surfaces |

## 프론트엔드 화면과 주요 지표

| 경로 | 화면 | 핵심 표시 항목 |
|---|---|---|
| `/` | 개요 | 순자산, 이번 달 지출, 이번 달 수입, 저축률, 최근 6개월 현금흐름, 이상 지출/반복 결제/수입 안정성 주의 신호, 이번 달 카테고리 Top 5, 최근 거래 |
| `/spending` | 지출 | 월별 카테고리 추이, 범위 선택, 수입 포함 전환, 카테고리/소분류 breakdown, 고정비/변동비 요약, 거래처 treemap, 일별 달력, 거래 테이블 |
| `/net-worth` | 자산·부채 | 순자산/총자산/총부채/현금성 KPI, 순자산 시계열, 자산 구성, 유동성 health, 대출 카드, 투자 구성, 보험/할부 요약 |
| `/signals` | 신호 | 저축률, 수입 변동성, 이상 지출, 재량 지출 속도, 구매 게이트 후보, 반복 결제, 거래처/카테고리 신호 |
| `/data/inbox` | 데이터 인박스 | 미분류 거래, 반복 분류 승인 대기, 대출 연결 후보, 구매 게이트 후보 등 운영 queue |
| `/data/transactions` | 거래 | 필터, 행 보기/그룹 보기, 거래 편집, bulk update/delete/restore, 반복 그룹 작업 |
| `/data/loans` | 대출 | 대출 계좌 metadata, 상환 거래 후보, 연결/해제, 다건 연결, 상환 성격 관리 |
| `/data/installments` | 할부 | 할부 계획 생성/수정, 거래 후보 검색, 회차 연결, 월별 forecast |
| `/data/assets` | 자산 메타 | 최신 자산 row의 유동성 tier/현금성 여부 편집, 대출 월상환액/상환방식 metadata 보강 |
| `/data/rules` | 규칙 | category/recurring/merchant alias/loan merchant rule 관리와 일괄 적용 |
| `/data/settings` | 설정 | 재무 목표와 분석 파라미터 effective/default/saved 값 확인 |
| `/data/import` | 가져오기 | BankSalad 엑셀 업로드, 업로드 이력, 거래/스냅샷 초기화 |
| `/data/reference` | 데이터 사전 | canonical/dashboard/schema read surface와 데이터 coverage reference |

호환용 redirect는 구 `/analysis/*`, `/operations/*`, `/assets`, `/income`, `/transfers`, `/data` 경로를 새 IA의 canonical route로 보낸다.

## 주요 지표 의미

| 지표 | 의미 | 계산/해석 기준 |
|---|---|---|
| 순자산 | 보유 자산에서 부채를 뺀 현재 재무 상태 | `asset_snapshots`의 snapshot 기준 `asset_total - liability_total` |
| 월간 수입 | 월별 수입 거래 합계 | `type='수입'` 거래의 양수 금액 합계 |
| 월간 지출 | 월별 지출 거래 합계 | `type='지출'` 거래를 `-amount`로 정규화한다. 양수 지출은 환불/취소로 보아 지출을 줄인다 |
| 이체 활동 | 수입/지출과 분리한 자산 이동 규모 | `type='이체'` 거래의 절댓값 합계이며 순현금흐름에는 직접 더하지 않는다 |
| 순현금흐름 | 해당 월에 남은 현금흐름 | `income - expense` |
| 저축률 | 수입 대비 남은 현금흐름 비율 | `net_cashflow / income`, 수입이 없으면 계산 불가 |
| 카테고리 MoM | 현재 월과 직전 월의 카테고리별 증감 | 선택 기간 내 마지막 월을 current, 그 전 달을 previous로 비교 |
| 고정비 비율 | 전체 지출 중 고정비로 분류된 금액 비중 | `cost_kind='fixed'` 지출 / 전체 지출. 대출 연결 거래는 ordinary fixed/variable 합계에서 분리한다 |
| 필수 고정비 | 고정비 중 생계/계약상 필수 성격의 금액 | `fixed_cost_necessity='essential'` |
| 비필수 고정비 | 고정비 중 구독/선택 소비 성격의 금액 | `fixed_cost_necessity='discretionary'` |
| 미분류 지출 | 비용 성격이나 필수 여부가 아직 정리되지 않은 지출 | `cost_kind`, `fixed_cost_necessity`, `recurring_payment_kind`, 대출 연결 검토 필요 여부로 work queue 우선순위를 만든다 |
| 거래처 지출 | 거래처별 소비 규모와 빈도 | `merchant` 기준 합계, 건수, 평균 금액, 마지막 거래일 |
| 결제수단 패턴 | 결제수단별 소비 비중 | `payment_method`별 총액, 건수, 평균, 전체 대비 비중 |
| 수입 안정성 | 월별 수입 변동성 | 월별 수입 평균, 표준편차, `coefficient_of_variation = stdev / avg` |
| 반복 결제 | 주기적으로 발생하는 거래처별 지출 후보 | 거래처별 발생 간격으로 monthly/weekly/irregular와 confidence를 계산하고, 사용자가 `할부`/`매월 반복`/`반복 아님`을 저장한다. 자동분류 규칙은 반복 후보이거나 고정비인 거래만 카테고리 기준으로 채운다 |
| 이상 지출 | 기준 기간 대비 특정 카테고리가 유난히 커진 경우 | 직전 마감월 또는 지정 기준일을 baseline window와 비교하고 `min_delta_amount`, `anomaly_threshold`로 필터링 |
| 재량 지출 속도 | 월 진행률 대비 재량 지출이 빠른지 보는 후보 신호 | 최근 마감월 baseline과 현재 월 진행률을 비교한다. `risk_level`은 최종 구매 허용/금지 판단이 아니라 검토 강도다 |
| 구매 게이트 | 검토가 필요한 재량 구매 후보 queue | 고정비, 필수지출, 대출연결, 필요성 미분류 거래를 제외하고 큰 일회성/새 거래처/거래처 급증/재량 급증 신호를 거래 1건당 1줄로 묶는다 |
| 대출 상환액 | 일반 소비와 분리해 볼 대출 연결 지출 | `loan_transaction_links`로 연결된 거래를 대출 계좌/상환 유형별로 집계 |
| true spendable | 대출 상환과 고정 지출을 뺀 후의 가용 현금 | 수입에서 대출 상환과 fixed commitments를 먼저 제외하고, 변동 지출 전/후 잔액을 나눠 본다. 진행 중인 월의 수입이 최근 6개 마감월의 이상치 제외 baseline보다 크게 낮으면 dashboard API가 예상 수입/예상 가용액을 별도 태그로 함께 제공한다 |
| 유동성 health | 현금성 자산과 부채 부담을 함께 보는 계산 묶음 | 현금성 자산, 비상금 개월 수, 목표 대비 진행률, 월상환액, 부채비율, confidence/assumptions를 반환한다. 실제 건강/위험 평가는 에이전트 해석이다 |
| 할부 forecast | 할부 원장 기준 잔여 회차 계획 | 연결된 회차는 `observed`, 미연결 미래/현재 회차는 `projected`, 지난 미연결 회차는 `missed`로 구분한다. projected 값은 관측 cashflow와 이중 계산하지 않는다 |
| 보험료 추정 | 보험 계약 snapshot과 최근 보험 지출을 함께 보는 보조 값 | `4.보험현황` 계약 목록과 최근 마감월 보험 카테고리 순지출을 근거로 제공한다. 보험료 적정성 판단은 에이전트 해석이다 |
| 투자 구성 비중 | snapshot 내 투자 평가액 구성 | `pct_of_investment_total = market_value / total market value`이며 투자 성과나 수익률 attribution이 아니다 |

## Canonical view와 에이전트용 read surface

Canonical view는 raw table을 직접 다시 해석하지 않아도 같은 기준으로 거래와 월별 지표를 읽게 하는 read surface다. `/api/v1/canonical-views/dashboard`는 주요 view의 실제 row 값을 프론트엔드 대시보드에 제공하고, 관측 거래 범위인 `data_coverage`와 월별 `is_complete_month`를 함께 반환한다. 진행 중인 월에는 최근 6개 마감월에서 환급/보너스성 이상치를 제외한 수입 baseline 기반 예상값을 명확히 태그해 함께 보여줄 수 있다. `/api/v1/schema`는 raw table과 함께 아래 view schema를 문서화한다. 외부 에이전트는 가능하면 raw `transactions`보다 이 계층을 우선 사용한다.

| View | 용도 | 주요 항목 |
|---|---|---|
| `vw_transactions_effective` | 거래 분석의 기본 read surface | 삭제/병합 기본 제외, 사용자 수정 카테고리 우선, `effective_category_*`, `is_edited`, 거래처/메모/비용 성격, 대출 연결 필드 |
| `vw_category_monthly_spend` | 월별 카테고리 지출 schema 문서화 | `period`, 대분류, 소분류, 금액 |
| `vw_fixed_cost_monthly_summary` | 월별 고정비 분석용 canonical aggregate | 전체 지출, 고정비, 변동비, 필수/비필수 고정비, 미분류 금액/건수. 대출 연결 상환은 일반 고정비 합계에서 제외 |
| `vw_monthly_cashflow` | advisor용 월별 현금흐름 foundation | 수입, 지출, 대출 제외 지출, 이체 활동, 대출 상환, 고정/변동 지출, 미분류 지출, 순현금흐름, 저축률 |
| `vw_loan_repayment_monthly` | 대출 상환 부담 추적 | 월별 상환액, 대출 계좌 id, 표시명, 기관, 상품, 대출 종류, 만기일, 상환 유형 |
| `vw_true_spendable_monthly` | 실제 가용 현금 파악 | 대출 상환과 고정 지출 차감 후 변동 지출 전 가용액, 변동 지출 후 잔액 |
| `vw_merchant_monthly_baseline` | 거래처별 baseline과 증감 확인 | 월별 거래처 지출/건수, 직전 3개월 마감월 baseline, delta field |
| `vw_recurring_merchant_monthly` | 저장된 반복분류 기반 월별 반복 거래처 지출 | 월별 거래처, 반복분류 종류, 지출 합계, 거래 수, 첫/마지막 거래일 |
| `vw_asset_snapshot_canonical` | 자산/부채 snapshot 표준값 | 총자산/부채/순자산, 음수 자산 제외분, 현금성/준유동/비유동 자산, 대출 잔액, 월상환액 |
| `vw_loan_account_canonical` | 대출 구조/금리/만기 표준값 | 안정 loan identity, 기관/상품/종류, 잔액/금리/월상환액/source, 신규일/만기일, 단순 월 이자 추정 |
| `vw_income_monthly_by_category` | 월별 수입 구성 | 월, effective 수입 카테고리, 수입 합계, 거래 수 |
| `vw_unclassified_work_queue` | 분류 품질 개선 우선순위 | 비용 성격/필수 여부/월 단위 반복분류/대출 연결 검토가 필요한 거래와 우선순위. 같은 날 분할 구매처럼 월 반복성이 없는 거래는 반복분류 후보로 보지 않는다 |

아직 구현되지 않은 항목은 [Implentation-plan.md](Implentation-plan.md)를 기준으로 확인한다.

## 빠른 시작

### 전체 개발 스택 실행

```bash
cp .env.example .env
docker compose up -d --build
```

기동 후 확인 경로:
- frontend: `http://localhost:3000`
- backend health: `http://localhost:8000/api/v1/health`

`docker compose ps` 기준으로 `db`, `backend`, `frontend` 가 모두 `healthy` 상태여야 한다.
`migrate` 서비스는 one-shot 으로 실행된 뒤 `Exited (0)` 상태가 정상이다.

새 PostgreSQL 볼륨에서는 `readonly` 유저와 `statement_timeout=30s` 가 init script로 자동 구성된다.
compose 전체 기동 시에는 `migrate` 서비스가 Alembic migration을 자동 적용하므로, 운영에서는 별도 수동 migration 없이 `docker compose up -d --build` 한 번으로 배포할 수 있다.

## 운영 서버 설치

운영 서버에서도 기본 절차는 동일하다. 차이는 `.env`에 개발 기본값 대신 실제 운영 비밀값과 도메인 설정을 넣는 점이다.

### 1. 서버 준비

- Docker Engine과 Docker Compose plugin 설치
- 80/443 또는 현재 사용할 reverse proxy / frontend port 정책 결정
- 이 저장소를 서버에 clone

예시:

```bash
git clone <repo-url>
cd my_ledge
```

### 2. 운영용 `.env` 작성

```bash
cp .env.example .env
```

운영 배포 전 최소한 아래 값은 실제 값으로 교체한다.

```env
DB_PASSWORD=
DB_READONLY_PASSWORD=
API_KEY=
EXCEL_PASSWORD=
CORS_ORIGINS=
```

권장:

- `DB_PASSWORD`: PostgreSQL 앱 계정 비밀번호
- `DB_READONLY_PASSWORD`: Hermes, Codex, Claude, OpenClaw 등 readonly DB 접근용 비밀번호
- `API_KEY`: 업로드, 스키마 조회, 거래 편집 API 인증용 비밀값
- `API_KEY`: backend write API 인증용 비밀값이며, compose/frontend container 시작 시 `runtime-config.js`로도 같은 값이 주입된다
- `EXCEL_PASSWORD`: 실제 BankSalad 암호화 파일을 사용할 경우 필요
- `CORS_ORIGINS`: 실제 프론트엔드 도메인으로 설정

랜덤값 생성 예시:

```bash
openssl rand -hex 32
```

### 3. 컨테이너 기동

```bash
docker compose up -d --build
```

상태 확인:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs migrate
```

정상 기준:

- `db`, `backend`, `frontend` 가 모두 `healthy`
- `migrate` 는 `Exited (0)` 상태
- backend health endpoint 응답:

```bash
curl http://localhost:8000/api/v1/health
```

### 4. readonly 계정 bootstrap 확인

새 PostgreSQL 데이터 볼륨이라면 `readonly` 유저와 `statement_timeout=30s` 가 자동으로 적용된다.

기존 `pgdata` 볼륨을 재사용하는 서버에서 `DB_READONLY_PASSWORD`를 새로 넣었거나 바꿨다면 아래를 한 번 실행한다.

```bash
docker compose exec db sh /docker-entrypoint-initdb.d/01-create-readonly-role.sh
```

### 5. 에이전트 연동에 전달할 값

운영 서버에서 Hermes, Codex, Claude, OpenClaw 등 분석/운영 에이전트에 넘겨야 하는 최소 정보:

```env
MY_LEDGE_API_BASE_URL=http://<server>:8000/api/v1
MY_LEDGE_API_KEY=<API_KEY>

MY_LEDGE_DB_HOST=<server>
MY_LEDGE_DB_PORT=5432
MY_LEDGE_DB_NAME=my_ledge
MY_LEDGE_DB_USER=readonly
MY_LEDGE_DB_PASSWORD=<DB_READONLY_PASSWORD>
```

함께 전달할 문서:

- [docs/agents/README.md](docs/agents/README.md)
- [docs/agents/canonical-read-surface-reference.md](docs/agents/canonical-read-surface-reference.md)
- [docs/agent-integration/README.md](docs/agent-integration/README.md)
- [docs/agent-integration/integration-guide.md](docs/agent-integration/integration-guide.md)
- [docs/agent-integration/skill-handoff.md](docs/agent-integration/skill-handoff.md)

### 6. 업데이트 절차

애플리케이션 코드 업데이트:

```bash
git pull
docker compose up -d --build
```

이 명령은 이미지 재빌드와 migration 자동 적용까지 포함한다.

환경 변수만 바뀐 경우에도 관련 서비스는 재기동하는 편이 안전하다.

```bash
docker compose up -d --build db migrate backend frontend
```

주의:

- `API_KEY` 값을 바꾼 경우 frontend는 재빌드까지는 필요 없고, container 재시작으로 `runtime-config.js`를 다시 생성하면 된다
- `POST /api/v1/upload` 는 `snapshot_date` 를 필수로 받는다. 업로드 시 기준일을 반드시 함께 보내야 한다

### 백엔드 단독 실행

```bash
cp .env.example .env

docker compose up -d db
# db health가 healthy가 된 뒤 실행
cd backend && uv run alembic upgrade head
cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

백엔드 smoke import 예시:

```bash
cd backend && uv run python scripts/smoke_import_transactions.py --snapshot-date 2026-03-24
```

### 프론트엔드 단독 실행

```bash
cd frontend
npm install
npm run dev
```

프론트엔드 단독 실행으로 데이터 관리 write 기능까지 테스트하려면 backend `API_KEY`와 같은 값을 `VITE_API_KEY`로 넘겨야 한다.

```bash
cd frontend
VITE_API_KEY=<API_KEY> npm run dev
```

## 주요 환경 변수

```env
DB_PASSWORD=
DB_READONLY_PASSWORD=
DATABASE_URL=

EXCEL_PASSWORD=

API_KEY=
CORS_ORIGINS=
```

- `API_KEY`: 업로드, 스키마 조회, 거래 편집 API 인증에 사용
- `API_KEY`: compose 배포 시 frontend container 시작 시점의 `runtime-config.js`에도 같은 값이 자동 주입된다
- `DB_READONLY_PASSWORD`: 외부 에이전트의 readonly DB 접근에 사용
- `EXCEL_PASSWORD`: 실제 암호화된 BankSalad 파일 복호화에 사용

## PostgreSQL readonly 계정

`docker compose up -d` 로 새 DB를 초기화할 때 아래가 자동 적용된다.

- `readonly` 로그인 role 생성
- `public` schema `SELECT` 권한 부여
- 이후 생성 테이블/시퀀스에 대한 default privileges 설정
- `ALTER ROLE readonly SET statement_timeout = '30s'`

주의:

- 이 자동 bootstrap은 **새 PostgreSQL 데이터 볼륨 초기화 시점**에만 실행된다.
- 이미 생성된 `pgdata` 볼륨을 계속 쓰는 환경에서는 init script가 다시 자동 실행되지 않는다.
- 기존 DB에 다시 적용하려면 아래처럼 수동 실행한다.

```bash
docker compose exec db sh /docker-entrypoint-initdb.d/01-create-readonly-role.sh
```

## 검증 명령

### Backend

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

### Frontend

```bash
cd frontend
npm test
npm run lint
npm run typecheck
npm run build
```

## 데이터/도메인 메모

- 기본 샘플 파일은 `./tmp/finance_sample.xlsx` 를 사용한다.
- 현재 저장소 샘플은 비암호화 파일이지만, 복호화 fallback 코드는 유지한다.
- `.env.example` 의 `DATABASE_URL` 은 호스트에서 migration/smoke script를 실행할 수 있도록 `127.0.0.1:5432` 기준으로 둔다.
- 컨테이너 내부 `backend` 서비스는 compose에서 `db:5432` 기준 `DATABASE_URL` 을 별도 주입한다.
- compose 전체 기동 시에는 `migrate` 서비스가 `db` healthcheck 이후 자동 실행되므로 별도 수동 migration은 필요 없다.
- 기존 `pgdata` 볼륨을 재사용 중이면 `readonly` 계정 bootstrap은 자동 재실행되지 않는다. 이 경우 `docker compose exec db sh /docker-entrypoint-initdb.d/01-create-readonly-role.sh` 로 수동 적용한다.
- 거래 분석에서 `이체`는 수입/지출에서 제외하고 별도 자산이동으로 해석한다.
- 사용자 수정 카테고리는 원본 카테고리보다 우선한다.

## 주요 문서

- 제품 요구사항: [PRD.md](PRD.md)
- repo 운영 규칙: [AGENTS.md](AGENTS.md)
- 사용자용 구현 현황 / roadmap: [Implentation-plan.md](Implentation-plan.md)
- OMO 실행계획 index: [.omo/plans/index.md](.omo/plans/index.md)
- Backend/API live contract: [docs/backend-api-ssot.md](docs/backend-api-ssot.md)
- Backend 상세 reference: [docs/backend-api-and-metrics-reference.md](docs/backend-api-and-metrics-reference.md)
- 에이전트용 canonical README: [docs/agents/README.md](docs/agents/README.md)
- 에이전트용 canonical/API 값 사전: [docs/agents/canonical-read-surface-reference.md](docs/agents/canonical-read-surface-reference.md)
- 범용 에이전트 연동 문서 인덱스: [docs/agent-integration/README.md](docs/agent-integration/README.md)
- Legacy OpenClaw 호환 안내: [docs/openclaw/README.md](docs/openclaw/README.md)

`Implentation-plan.md`는 사용자가 현재까지 구현된 항목과 남은 roadmap을 확인하기 위한 문서다. 에이전트 실행계획은 `.omo/plans/<slug>.md`에 둔다. `docs/STATUS.md`는 deprecated pointer로만 남긴다. 과거 plan/spec/archive 문서의 미체크 항목은 `Implentation-plan.md` 또는 `.omo/plans/`에 승격되어 있지 않으면 current work로 보지 않는다.

## 에이전트 연동

Hermes, Codex, Claude, OpenClaw 등 외부 에이전트는 읽기에는 API 또는 PostgreSQL readonly 계정을, 쓰기에는 API만 사용한다.
거래 분석은 raw `transactions`보다 canonical view와 analytics endpoint를 우선한다.

- 시작점: [docs/agents/README.md](docs/agents/README.md)
- 값 의미/계산식 reference: [docs/agents/canonical-read-surface-reference.md](docs/agents/canonical-read-surface-reference.md)
- 운영/연동 규약: [docs/agent-integration/integration-guide.md](docs/agent-integration/integration-guide.md)
- skill 패키징 handoff: [docs/agent-integration/skill-handoff.md](docs/agent-integration/skill-handoff.md)
- OpenClaw legacy path: [docs/openclaw/README.md](docs/openclaw/README.md)

이 저장소에서는 에이전트 skill 자체를 배포하지 않는다.
대신 에이전트 런타임에서 skill/tool을 패키징할 수 있도록 필요한 API, DB, canonical view, 운영 규약, 예시 흐름을 문서로 제공한다.
