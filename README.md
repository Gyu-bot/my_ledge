# my_ledge
뱅크샐러드 내보내기 금융 마이데이터를 이용한 개인 재무 대시보드

## 전체 개발 스택 실행

```bash
cp .env.example .env
docker compose up -d --build
```

기동 후 확인 경로:
- frontend: `http://localhost:3000`
- backend health: `http://localhost:8000/api/v1/health`

`docker compose ps` 기준으로 `db`, `backend`, `frontend` 가 모두 `healthy` 상태여야 한다.

## 백엔드 단독 실행

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

## 프론트엔드 단독 실행

```bash
cd frontend
npm install
npm run dev
```

검증 명령:

```bash
cd frontend
npm test
npm run lint
npm run typecheck
npm run build
```

메모:
- 기본 샘플 파일은 `./tmp/finance_sample.xlsx` 를 사용한다.
- `.env.example` 의 `DATABASE_URL` 은 호스트에서 migration/smoke script를 실행할 수 있도록 `127.0.0.1:5432` 기준으로 둔다.
- 컨테이너 내부 `backend` 서비스는 compose에서 `db:5432` 기준 `DATABASE_URL` 을 별도 주입한다.
- `docker compose up -d db` 직후 바로 migration을 치면 Postgres healthcheck가 끝나기 전에 연결이 튕길 수 있으니, `docker compose ps` 등으로 `healthy` 상태를 확인하고 진행하는 게 안전하다.
