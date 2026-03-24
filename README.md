# my_ledge
뱅크샐러드 내보내기 금융 마이데이터를 이용한 개인 재무 대시보드

## 개발용 PostgreSQL 빠른 시작

```bash
cp .env.example .env

docker compose up -d db
# db health가 healthy가 된 뒤 실행
cd backend && uv run alembic upgrade head
cd backend && uv run python scripts/smoke_import_transactions.py --snapshot-date 2026-03-24
```

기본 샘플 파일은 `./tmp/finance_sample.xlsx` 를 사용한다.
`DATABASE_URL` 은 호스트에서 migration/smoke script를 실행할 수 있도록 `127.0.0.1:5432` 기준으로 맞춘다.
`docker compose up -d db` 직후 바로 migration을 치면 Postgres healthcheck가 끝나기 전에 연결이 튕길 수 있으니, `docker compose ps` 등으로 `healthy` 상태를 확인하고 진행하는 게 안전하다.
