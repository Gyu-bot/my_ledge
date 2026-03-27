# my_ledge

BankSalad 엑셀 내보내기를 데이터 소스로 사용하는 개인 재무 대시보드다.
거래 내역은 증분 import로 누적 적재하고, 자산/투자/대출 스냅샷은 시계열로 관리한다.
읽기 분석은 API와 canonical view를 통해 제공하고, OpenClaw 같은 외부 에이전트는 readonly DB + 업로드 API를 함께 사용한다.

## 현재 범위

- Backend: FastAPI, SQLAlchemy async, Alembic, PostgreSQL
- Frontend: Vite, React, TypeScript, Tailwind, TanStack Query
- 데이터 소스: BankSalad `.xlsx`
- 핵심 기능:
  - 엑셀 업로드 및 증분 import
  - 거래 조회/수정/삭제/복원
  - 메인 대시보드
  - 지출 분석
  - 자산 현황
  - 데이터 관리

제품 요구사항과 Phase 범위는 [PRD.md](/home/gyurin/projects/my_ledge/PRD.md), 협업 규칙은 [AGENTS.md](/home/gyurin/projects/my_ledge/AGENTS.md), 현재 작업 현황은 [STATUS.md](/home/gyurin/projects/my_ledge/STATUS.md)를 기준으로 본다.

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
- `DB_READONLY_PASSWORD`: OpenClaw 등 외부 에이전트의 readonly DB 접근에 사용
- `EXCEL_PASSWORD`: 실제 암호화된 BankSalad 파일 복호화에 사용

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
- `docker compose up -d db` 직후 바로 migration을 치면 Postgres healthcheck가 끝나기 전에 연결이 튕길 수 있으니, `docker compose ps` 등으로 `healthy` 상태를 확인하고 진행하는 게 안전하다.
- 거래 분석에서 `이체`는 수입/지출에서 제외하고 별도 자산이동으로 해석한다.
- 사용자 수정 카테고리는 원본 카테고리보다 우선한다.

## 주요 문서

- 제품 요구사항: [PRD.md](/home/gyurin/projects/my_ledge/PRD.md)
- 협업 규칙: [AGENTS.md](/home/gyurin/projects/my_ledge/AGENTS.md)
- 현재 진행 상태: [STATUS.md](/home/gyurin/projects/my_ledge/STATUS.md)
- OpenClaw 연동 문서 인덱스: [docs/openclaw/README.md](/home/gyurin/projects/my_ledge/docs/openclaw/README.md)

## OpenClaw 연동

OpenClaw 관련 문서는 `docs/openclaw/` 아래에 모아뒀다.

- 시작점: [docs/openclaw/README.md](/home/gyurin/projects/my_ledge/docs/openclaw/README.md)
- 운영/연동 규약: [docs/openclaw/integration-guide.md](/home/gyurin/projects/my_ledge/docs/openclaw/integration-guide.md)
- skill 패키징 handoff: [docs/openclaw/skill-handoff.md](/home/gyurin/projects/my_ledge/docs/openclaw/skill-handoff.md)

이 저장소에서는 OpenClaw skill 자체를 배포하지 않는다.
대신 OpenClaw 작업자가 별도 환경에서 skill을 패키징/배포할 수 있도록 필요한 API, DB, 운영 규약, 예시 흐름을 문서로 제공한다.
