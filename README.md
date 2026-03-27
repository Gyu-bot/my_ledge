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
- `DB_READONLY_PASSWORD`: OpenClaw 등 readonly DB 접근용 비밀번호
- `API_KEY`: 업로드, 스키마 조회, 거래 편집 API 인증용 비밀값
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

### 5. OpenClaw 연동에 전달할 값

운영 서버에서 OpenClaw 쪽에 넘겨야 하는 최소 정보:

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

- [docs/openclaw/README.md](/home/gyurin/projects/my_ledge/docs/openclaw/README.md)
- [docs/openclaw/integration-guide.md](/home/gyurin/projects/my_ledge/docs/openclaw/integration-guide.md)
- [docs/openclaw/skill-handoff.md](/home/gyurin/projects/my_ledge/docs/openclaw/skill-handoff.md)

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
