# AGENTS.md

개인 재무 대시보드. BankSalad 엑셀 내보내기를 데이터 소스로 사용하여 지출 분석과 자산 변동 tracking을 수행한다.
상세 요구사항은 `PRD.md`를 참조한다.

---

## Project Layout

```
my_ledge/
├── AGENTS.md                # 이 파일
├── PRD.md                   # 상세 요구사항 문서
├── STATUS.md                # 작업 현황 (모든 작업자가 읽고 갱신)
├── docker-compose.yml
├── .env                     # 환경변수 (DB_PASSWORD, EXCEL_PASSWORD 등)
├── backend/
│   ├── pyproject.toml       # uv 기반 의존성
│   ├── alembic/             # DB 마이그레이션
│   ├── app/
│   │   ├── main.py          # FastAPI 진입점
│   │   ├── api/v1/          # 라우터
│   │   ├── models/          # SQLAlchemy 모델
│   │   ├── schemas/         # Pydantic v2 스키마
│   │   ├── services/        # 비즈니스 로직
│   │   └── parsers/         # 엑셀 파싱 로직
│   └── tests/
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── pages/           # 라우트별 페이지 컴포넌트
        ├── components/      # 재사용 컴포넌트
        ├── hooks/           # 커스텀 훅 (React Query 등)
        ├── api/             # API 호출 함수
        └── types/           # TypeScript 타입
```

---

## Core Commands

```bash
# 개발 환경 실행
docker compose up -d

# 백엔드 단독 실행 (개발)
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 프론트엔드 단독 실행 (개발)
cd frontend
npm run dev

# DB 마이그레이션
cd backend
uv run alembic upgrade head          # 적용
uv run alembic revision --autogenerate -m "description"  # 새 마이그레이션 생성

# 테스트
cd backend && uv run pytest
cd frontend && npm test

# 린트/포맷
cd backend && uv run ruff check . && uv run ruff format .
cd frontend && npm run lint
```

---

## Tech Stack & Constraints

### Backend (Python)

- **Runtime:** Python 3.12+
- **Framework:** FastAPI + uvicorn
- **패키지 관리:** `uv` 사용. **pip 사용 금지.** `pyproject.toml`에 의존성 선언.
- **ORM:** SQLAlchemy 2.0 (async), Alembic 마이그레이션
- **Validation:** Pydantic v2 — 모든 request/response에 적용
- **DB:** PostgreSQL 16+
- **엑셀 파싱:** `openpyxl` (반드시 `data_only=True`), 암호화 파일은 `msoffcrypto-tool`로 복호화 후 파싱
- **인코딩:** 한글 데이터 처리 시 UTF-8-SIG
- **API 버전:** `/api/v1/` prefix
- **테스트:** pytest + httpx (AsyncClient)

### Frontend (React)

- **빌드:** Vite + TypeScript
- **UI:** Tailwind CSS — 별도 CSS 프레임워크 사용 금지
- **차트:** Recharts only — 다른 차트 라이브러리(Chart.js, D3, Nivo 등) 사용 금지
- **상태관리:** TanStack Query (React Query) — 서버 상태 중심, Redux/Zustand 불필요
- **라우팅:** React Router v6+
- **컴포넌트:** 함수형 컴포넌트 + Hooks only, class 컴포넌트 사용 금지

### Docker

- 멀티스테이지 빌드 (frontend: node → nginx, backend: python:3.12-slim)
- `docker compose up -d` 로 원커맨드 실행
- 각 서비스에 healthcheck 포함

---

## Coding Rules

### NEVER

- pip, pip install, requirements.txt 사용 → `uv`와 `pyproject.toml` 사용
- 카테고리 목록 하드코딩 → DB에서 동적 조회
- Recharts 외 차트 라이브러리 사용
- `openpyxl` 사용 시 `data_only=True` 누락
- 프론트엔드에서 `any` 타입 사용 (TypeScript strict)
- DB 스키마 직접 수정 → Alembic 마이그레이션으로만 변경
- `\n`으로 줄바꿈 (Python docstring 제외) → 명시적 구조 사용

### ALWAYS

- 새 엔드포인트 추가 시 Pydantic v2 request/response 스키마 정의
- DB 모델 변경 시 Alembic 마이그레이션 생성
- API 응답에 적절한 HTTP 상태 코드 사용 (200, 201, 400, 404, 422, 500)
- 한글 문자열 처리 시 인코딩 확인 (UTF-8-SIG)
- 새 컴포넌트 생성 시 TypeScript 타입 정의
- 비동기 DB 작업에 async/await 사용

---

## Database Schema Overview

5개 핵심 테이블. 상세 스키마는 PRD 섹션 3.1 참조.

| 테이블 | 용도 | 주요 특성 |
|---|---|---|
| `transactions` | 가계부 거래 내역 | 소프트 삭제(`is_deleted`), 사용자 카테고리 수정(`category_*_user`), 병합(`merged_into_id`), 출처(`source`: import/manual) |
| `asset_snapshots` | 재무현황 스냅샷 | `snapshot_date` 기준 시계열 누적, UPSERT |
| `investments` | 투자현황 스냅샷 | `snapshot_date` 기준 시계열 누적, UPSERT |
| `loans` | 대출현황 스냅샷 | `snapshot_date` 기준 시계열 누적, UPSERT |
| `upload_logs` | 업로드 이력 | 파싱 결과 기록 (전체/신규/스킵 건수) |

### 거래 데이터 쿼리 규칙

분석 쿼리에서 **반드시** 적용해야 할 필터:

```sql
-- 삭제/병합된 건 제외
WHERE is_deleted = FALSE
  AND merged_into_id IS NULL

-- 카테고리는 사용자 수정값 우선
SELECT COALESCE(category_major_user, category_major) AS category_major,
       COALESCE(category_minor_user, category_minor) AS category_minor
```

### 거래 타입 처리

| 타입 | 분석 포함 | 비고 |
|---|---|---|
| `지출` (amount < 0) | ✅ 지출 분석 | — |
| `지출` (amount > 0) | ✅ 지출 분석 | 결제 취소/환불, 상계 처리 |
| `수입` | ✅ 수입 분석 | — |
| `이체` | ❌ 수입/지출 제외 | 별도 '자산이동' tracking |

---

## Data Upload Pipeline

엑셀 업로드 → 적재 흐름. `POST /api/v1/upload`

```
1. 파일 수신 (multipart/form-data)
2. msoffcrypto-tool로 복호화 (EXCEL_PASSWORD 환경변수)
3. openpyxl로 파싱 (data_only=True)
4. 가계부 내역:
   a. DB에서 MAX(date, time) 조회 → 마지막 거래 시점
   b. 새 파일에서 마지막 시점 이후 건만 필터
   c. 경계 시점 건은 기존 DB와 비교하여 미존재 건만 추가
   d. INSERT
5. 뱅샐현황 (3.재무/5.투자/6.대출):
   a. 테이블 마커 텍스트로 시작 위치 동적 검색 (위치 유동적)
   b. snapshot_date 기준 UPSERT
6. upload_logs에 결과 기록
```

**뱅샐현황 파싱 주의:** 테이블 위치가 유동적이므로, 행을 순회하며 `'3.재무현황'`, `'5.투자현황'`, `'6.대출현황'` 마커 텍스트를 검색하여 시작점을 찾는다. 절대 행 번호를 하드코딩하지 않는다.

---

## API Endpoints Summary

### 업로드

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/v1/upload` | 엑셀 파일 업로드 + 파싱 + 적재 |

### 거래 조회

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/transactions` | 거래 목록 (필터, 페이지네이션) |
| GET | `/api/v1/transactions/summary` | 기간별 수입/지출 요약 |
| GET | `/api/v1/transactions/by-category` | 카테고리별 집계 |
| GET | `/api/v1/transactions/payment-methods` | 결제수단별 집계 |

### 거래 편집

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/v1/transactions` | 수동 거래 추가 (source='manual') |
| PATCH | `/api/v1/transactions/{id}` | 카테고리/메모 수정 |
| DELETE | `/api/v1/transactions/{id}` | 소프트 삭제 |
| POST | `/api/v1/transactions/{id}/restore` | 삭제 복원 |
| POST | `/api/v1/transactions/merge` | 거래 병합 |
| PATCH | `/api/v1/transactions/bulk-update` | 일괄 카테고리 수정 |

### 자산

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/assets/snapshots` | 자산/부채 스냅샷 목록 |
| GET | `/api/v1/assets/net-worth-history` | 순자산 시계열 |
| GET | `/api/v1/investments/summary` | 투자 포트폴리오 |
| GET | `/api/v1/loans/summary` | 대출 현황 |

### 시스템

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/v1/schema` | DB 스키마 문서 (OpenClaw용) |

---

## Frontend Pages

| 경로 | 페이지 | 핵심 컴포넌트 |
|---|---|---|
| `/` | 메인 대시보드 | 요약 카드, 월별 추이 차트, 도넛 차트, 최근 거래 |
| `/spending` | 지출 분석 | 카테고리 누적 영역, 히트맵, 결제수단 바, 필터, 거래 테이블 |
| `/income` | 수입 분석 | 월별 수입 추이, 수입원 분포 |
| `/transfers` | 자산이동 | 이체 타입별 추이, 이체 내역 테이블 |
| `/assets` | 자산 현황 | 순자산 시계열, 트리맵, 투자/대출 상세 |
| `/data` | 데이터 관리 | 파일 업로드, 거래 편집 테이블, 업로드 이력 |

---

## Environment Variables

```env
# Database
DB_PASSWORD=           # PostgreSQL 비밀번호
DB_READONLY_PASSWORD=  # readonly 유저 비밀번호 (OpenClaw용)
DATABASE_URL=          # postgresql+asyncpg://my_ledge:${DB_PASSWORD}@db:5432/my_ledge

# Excel
EXCEL_PASSWORD=        # BankSalad 엑셀 암호

# App
SECRET_KEY=
API_KEY=               # 내부 API 인증용 (X-API-Key)
CORS_ORIGINS=          # 프론트엔드 도메인
```

---

## Gotchas & Domain Knowledge

- **BankSalad 엑셀은 암호화됨** — `openpyxl`이 직접 못 열어서 `msoffcrypto-tool`로 먼저 복호화해야 한다.
- **가계부 파일은 누적 데이터** — 새 파일에 이전 데이터가 포함되어 있다. 시간 커서 기반으로 기존 데이터 이후 건만 INSERT.
- **뱅샐현황 테이블 위치가 유동적** — 행 번호 하드코딩 금지. `'3.재무현황'` 등 마커 텍스트로 검색.
- **소분류 85%가 "미분류"** — 이번 버전에서는 수동 편집만 제공. 자동 분류는 다음 버전.
- **이체 = 자산이동** — 수입/지출 분석에서 제외, 별도 tracking.
- **지출인데 양수인 건** — 결제 취소/환불. 해당 월 지출에서 상계.
- **마이너스 통장 자산 표기** — 자유입출금 자산에 음수로 잡힐 수 있다. 실질적으로는 부채로 해석해야 한다.
- **해외주식 평가액** — 소수점 값이 포함될 수 있다. `NUMERIC(15,2)` 사용.
- **OpenClaw 연동** — 쓰기는 API 전용, 읽기는 PostgreSQL readonly 유저로 직접 SQL 실행 가능 (statement_timeout=30s).
- `snapshot_date`는 API 입력값 우선, 없으면 서버 업로드 날짜를 사용한다.
- 업로드는 부분 성공(`partial`)을 허용한다. 한쪽 적재가 성공하면 성공분은 유지하고 실패 원인을 `upload_logs`에 남긴다.
- 카테고리/결제수단 드롭다운은 `transactions`의 distinct 값으로 조회한다.
- 조회 API는 `is_edited`, `include_deleted`, `include_merged`, `search` 필터를 지원해야 한다.
- `POST /api/v1/upload`, `GET /api/v1/schema`, 쓰기성 거래 편집 API는 `X-API-Key` 인증을 사용한다.
- 원본 업로드 파일은 `/data/uploads/`에 최근 5개만 보관한다.
- 거래 병합 기능은 엔드포인트 정의만 유지하고 MVP 구현 범위에서는 제외한다.

---

## Collaboration Protocol

이 프로젝트는 **사람과 복수의 AI 에이전트(Codex, OpenClaw, Claude 등)가 협업**한다.
누가 작업하든 컨텍스트가 끊기지 않도록 아래 프로토콜을 **반드시** 따른다.

### Subagent Policy

- Codex는 이 저장소에서 **사용자 추가 확인 없이** 서브에이전트를 스폰할 수 있다.
- 사용자가 세션 중 이 권한을 명시적으로 재확인한 경우, 이후 turn에서도 별도 허가를 다시 묻지 않고 필요 시 바로 서브에이전트를 사용할 수 있다.
- 허용 조건:
  - 서로 독립적인 하위 작업이 2개 이상 있고 병렬 처리 이점이 분명할 때
  - 메인 작업의 즉시 다음 단계가 막히지 않는 조사/구현/검증 작업일 때
  - 각 서브에이전트의 책임 범위와 수정 파일 집합을 분리할 수 있을 때
- 금지 조건:
  - 즉시 결과가 필요한 크리티컬 패스 작업
  - 같은 파일이나 강하게 결합된 모듈을 동시에 수정할 가능성이 큰 작업
  - 단순 탐색만을 위한 과도한 위임
- 서브에이전트를 사용한 경우 Codex는 commentary에 위임 범위와 책임을 짧게 공유한다.

### STATUS.md — 프로젝트 상태 파일

프로젝트 루트의 `STATUS.md`는 **작업 시작 전 반드시 읽고, 작업 완료 후 반드시 갱신**하는 파일이다.

```markdown
# STATUS.md

## Current State
- **Phase:** Phase 1 — 기반 구축
- **Last Worker:** codex (2026-03-24T14:30+09:00)
- **Branch:** feat/upload-pipeline

## Completed
- [x] DB 스키마 설계 (alembic init + 첫 마이그레이션)
- [x] transactions 모델 구현

## In Progress
- [ ] 엑셀 파싱 파이프라인 (backend/app/parsers/)
  - msoffcrypto 복호화 완료
  - 가계부 내역 파싱 완료
  - **뱅샐현황 파싱 진행 중** ← 현재 작업 지점

## Blocked
- 없음

## Next Up
- 시간 커서 기반 증분 적재 로직
- 업로드 API 엔드포인트

## Key Decisions
- 2026-03-24: 뱅샐현황 파싱은 정규식 대신 마커 텍스트 순회 방식 채택 (정규식은 셀 병합 때문에 불안정)
- 2026-03-24: transactions 테이블 amount는 INTEGER 유지 (원 단위, 소수점 불필요)

## Known Issues
- openpyxl read_only 모드에서 max_row가 None 반환 — iter_rows로 순회 필요
```

### 작업 규칙

**작업 시작 시:**
1. `STATUS.md`를 읽고 현재 상태 파악
2. `git log --oneline -10`으로 최근 커밋 확인
3. In Progress 항목 중 자신이 이어받을 작업 확인

**작업 중:**
- 커밋 메시지 형식: `[영역] 작업 내용 (작업자)`
  - 예: `[backend] 가계부 파싱 로직 구현 (codex)`
  - 예: `[frontend] 지출 분석 페이지 레이아웃 (민규)`
  - 예: `[infra] docker-compose 초기 설정 (openclaw)`
- 영역 태그: `[backend]`, `[frontend]`, `[infra]`, `[docs]`, `[db]`
- **설계 결정이 발생하면** Key Decisions에 날짜와 함께 기록 (무엇을, 왜, 대안은 뭐였는지)

**작업 완료 시:**
1. `STATUS.md` 갱신:
   - Last Worker, 시간 업데이트
   - 완료 항목을 Completed로 이동
   - In Progress 현재 지점 업데이트
   - 새로 발견한 이슈는 Known Issues에 추가
   - 다음 작업자가 해야 할 일은 Next Up에 추가
2. `STATUS.md` 변경도 커밋에 포함

**핸드오프 시 (다른 작업자에게 넘길 때):**
- In Progress에 **현재 작업 지점을 구체적으로** 표시 (파일명, 함수명, 어디까지 했는지)
- Blocked가 있으면 원인과 해결 방향 기록
- "context가 code에만 있고 STATUS.md에 없으면 핸드오프 실패"라고 간주

### git 브랜치 전략

```
main                    ← 안정 버전, 직접 커밋 금지
├── feat/upload-pipeline   ← Phase 1 기능
├── feat/dashboard-core    ← Phase 2 기능
├── feat/openclaw-integration ← Phase 3 기능
└── fix/xxx                ← 버그 수정
```

- 기능 단위로 브랜치 생성, 완료 후 main에 머지
- 머지 시 STATUS.md도 함께 업데이트
