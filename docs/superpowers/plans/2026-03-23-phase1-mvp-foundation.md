# Phase 1 MVP Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 MVP foundation for `my_ledge`: project scaffolding, database schema, upload pipeline, initial analytics APIs, transaction editing APIs, and Docker-based local runtime.

**Architecture:** The backend is an async FastAPI service backed by PostgreSQL and Alembic. Excel upload is handled as an application service that decrypts when needed, parses the `가계부 내역` and `뱅샐현황` sheets, applies incremental transaction import plus snapshot upserts, and records the result in `upload_logs`. The frontend is limited to minimal Vite scaffolding in this phase so backend/API delivery is not blocked, with Docker Compose wiring frontend, backend, and db together. For analysis and future finance-agent integration, add a first canonical analysis layer on top of `transactions` so API consumers and agents can share one stable interpretation layer before more specialized views are introduced. First-pass scope includes both a row-level effective transaction view and a monthly-by-category aggregate view.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, Pydantic v2, pytest, httpx, `msoffcrypto-tool`, `openpyxl`, PostgreSQL 16, Vite, React, TypeScript, Tailwind CSS, Docker Compose.

---

## Planned File Structure

### Backend runtime and configuration
- Create: `backend/pyproject.toml` — backend dependencies, pytest and ruff configuration, `uv` entrypoint metadata.
- Create: `backend/app/main.py` — FastAPI application factory, router registration, health endpoint, middleware.
- Create: `backend/app/core/config.py` — environment settings (`DATABASE_URL`, `EXCEL_PASSWORD`, `API_KEY`, `CORS_ORIGINS`).
- Create: `backend/app/core/database.py` — async engine, sessionmaker, dependency injection.
- Create: `backend/app/core/security.py` — `X-API-Key` validation dependency.
- Create: `backend/app/core/logging.py` — request/upload logging helpers if needed.

### Database models and migrations
- Create: `backend/app/models/base.py` — declarative base and shared timestamp mixins.
- Create: `backend/app/models/transaction.py`
- Create: `backend/app/models/asset_snapshot.py`
- Create: `backend/app/models/investment.py`
- Create: `backend/app/models/loan.py`
- Create: `backend/app/models/upload_log.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/20260323_0001_initial_schema.py`
- Create: later migrations for canonical analysis views (first scope: `vw_transactions_effective`, `vw_category_monthly_spend`)

### Schemas and API layer
- Create: `backend/app/schemas/common.py` — pagination/shared responses.
- Create: `backend/app/schemas/upload.py`
- Create: `backend/app/schemas/transaction.py`
- Create: `backend/app/schemas/asset.py`
- Create: `backend/app/schemas/schema_doc.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/v1/__init__.py`
- Create: `backend/app/api/v1/router.py`
- Create: `backend/app/api/v1/endpoints/health.py`
- Create: `backend/app/api/v1/endpoints/upload.py`
- Create: `backend/app/api/v1/endpoints/transactions.py`
- Create: `backend/app/api/v1/endpoints/assets.py`
- Create: `backend/app/api/v1/endpoints/schema.py`

### Services and parsers
- Create: `backend/app/parsers/decrypt.py`
- Create: `backend/app/parsers/transactions.py`
- Create: `backend/app/parsers/snapshots.py`
- Create: `backend/app/services/upload_service.py`
- Create: `backend/app/services/transaction_query_service.py`
- Create: `backend/app/services/transaction_edit_service.py`
- Create: `backend/app/services/schema_service.py`
- Modify: transaction query/schema services later so the first canonical analysis view can be reused by APIs and agent-facing schema docs

### Backend tests
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/factories/__init__.py`
- Create: `backend/tests/test_health.py`
- Create: `backend/tests/parsers/test_transactions_parser.py`
- Create: `backend/tests/parsers/test_snapshots_parser.py`
- Create: `backend/tests/services/test_upload_service.py`
- Create: `backend/tests/api/test_upload_api.py`
- Create: `backend/tests/api/test_transactions_api.py`
- Create: `backend/tests/api/test_assets_api.py`
- Create: `backend/tests/api/test_schema_api.py`

### Frontend and infra
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/pages/PlaceholderApp.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/Dockerfile`
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `README.md`
- Modify: `STATUS.md`

---

### Task 1: Scaffold backend project and runtime configuration

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/main.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`
- Create: `backend/app/core/security.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/v1/__init__.py`
- Create: `backend/app/api/v1/router.py`
- Create: `backend/app/api/v1/endpoints/health.py`
- Test: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing health test**

```python
from httpx import AsyncClient


async def test_health_check(async_client: AsyncClient) -> None:
    response = await async_client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: FAIL because the backend app and route do not exist yet.

- [ ] **Step 3: Write minimal backend scaffolding**

```python
app = FastAPI()
api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router)
```

- [ ] **Step 4: Add config, DB session, and API key dependency skeletons**

```python
class Settings(BaseSettings):
    database_url: str
    excel_password: str | None = None
    api_key: str
    cors_origins: list[str] = []
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend README.md
git commit -m "[backend] 백엔드 초기 스캐폴딩 구성 (codex)"
```

### Task 2: Define SQLAlchemy models and initial Alembic migration

**Files:**
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/transaction.py`
- Create: `backend/app/models/asset_snapshot.py`
- Create: `backend/app/models/investment.py`
- Create: `backend/app/models/loan.py`
- Create: `backend/app/models/upload_log.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/20260323_0001_initial_schema.py`
- Test: `backend/tests/api/test_schema_api.py`

- [ ] **Step 1: Write a failing schema metadata test**

```python
from app.models import Base


def test_expected_tables_exist() -> None:
    table_names = set(Base.metadata.tables)

    assert table_names == {
        "transactions",
        "asset_snapshots",
        "investments",
        "loans",
        "upload_logs",
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/api/test_schema_api.py::test_expected_tables_exist -v`
Expected: FAIL because model metadata is incomplete.

- [ ] **Step 3: Implement ORM models with constraints from PRD**

```python
class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date]
    time: Mapped[time]
    type: Mapped[str] = mapped_column(String(10))
    amount: Mapped[int]
    is_deleted: Mapped[bool] = mapped_column(default=False, server_default=false())
```

- [ ] **Step 4: Write the initial Alembic migration**

Run: `cd backend && uv run alembic revision -m "initial schema"`
Expected: revision file created, then replace autogenerated contents with explicit schema matching the models and indexes.

- [ ] **Step 5: Run the schema test**

Run: `cd backend && uv run pytest tests/api/test_schema_api.py::test_expected_tables_exist -v`
Expected: PASS.

- [ ] **Step 6: Verify migration upgrades cleanly**

Run: `cd backend && uv run alembic upgrade head`
Expected: PASS against local Postgres once Docker db is available.

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "[db] 초기 스키마와 Alembic 마이그레이션 추가 (codex)"
```

### Task 3: Implement Excel decryption and parser modules

**Files:**
- Create: `backend/app/parsers/decrypt.py`
- Create: `backend/app/parsers/transactions.py`
- Create: `backend/app/parsers/snapshots.py`
- Test: `backend/tests/parsers/test_transactions_parser.py`
- Test: `backend/tests/parsers/test_snapshots_parser.py`

- [ ] **Step 1: Write a failing transaction parser test using the sample workbook**

```python
def test_parse_transactions_extracts_rows(sample_workbook_bytes: bytes) -> None:
    parsed = parse_transactions(load_workbook(io.BytesIO(sample_workbook_bytes), data_only=True))

    assert parsed
    assert {"date", "time", "type", "category_major", "description", "amount"} <= set(parsed[0])
```

- [ ] **Step 2: Run the transaction parser test**

Run: `cd backend && uv run pytest tests/parsers/test_transactions_parser.py -v`
Expected: FAIL because parser functions do not exist yet.

- [ ] **Step 3: Implement decryption helper with pass-through for non-encrypted sample files**

```python
def open_excel_bytes(file_bytes: bytes, password: str | None) -> io.BytesIO:
    try:
        return decrypt_excel(file_bytes=file_bytes, password=password)
    except FileFormatError:
        buffer = io.BytesIO(file_bytes)
        buffer.seek(0)
        return buffer
```

- [ ] **Step 4: Implement transaction parser with normalized field names**

```python
def parse_transactions(workbook: Workbook) -> list[TransactionRow]:
    worksheet = workbook["가계부 내역"]
    rows = worksheet.iter_rows(values_only=True)
    header = next(rows)
    return [normalize_transaction_row(dict(zip(header, row))) for row in rows if row[0] is not None]
```

- [ ] **Step 5: Implement snapshot parser with marker-based table discovery**

```python
def find_table_start(rows: list[tuple[object, ...]], marker: str) -> int:
    for index, row in enumerate(rows):
        if len(row) > 1 and row[1] and str(row[1]).strip() == marker:
            return index
    raise ValueError(f"Missing marker: {marker}")
```

- [ ] **Step 6: Run parser tests**

Run: `cd backend && uv run pytest tests/parsers/test_transactions_parser.py tests/parsers/test_snapshots_parser.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/tests backend/app/parsers
git commit -m "[backend] 엑셀 파서와 복호화 헬퍼 구현 (codex)"
```

### Task 4: Implement upload service with incremental import and partial success handling

**Files:**
- Create: `backend/app/services/upload_service.py`
- Create: `backend/app/schemas/upload.py`
- Modify: `backend/app/models/upload_log.py`
- Test: `backend/tests/services/test_upload_service.py`

- [ ] **Step 1: Write a failing upload service test for transaction cursor filtering**

```python
async def test_upload_service_imports_only_new_transactions(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
) -> None:
    result = await service.import_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 3, 23),
    )

    assert result.transactions.new >= 0
    assert result.status in {"success", "partial"}
```

- [ ] **Step 2: Run the upload service test**

Run: `cd backend && uv run pytest tests/services/test_upload_service.py -v`
Expected: FAIL because service implementation does not exist.

- [ ] **Step 3: Implement upload orchestration**

```python
async def import_workbook(...) -> UploadResult:
    workbook = load_workbook(open_excel_bytes(file_bytes, settings.excel_password), data_only=True)
    tx_result = await import_transactions(...)
    snapshot_result = await import_snapshots(...)
    return persist_upload_log(tx_result=tx_result, snapshot_result=snapshot_result, ...)
```

- [ ] **Step 4: Encode partial success rules**

```python
if tx_error and snapshot_error:
    status = "failed"
elif tx_error or snapshot_error:
    status = "partial"
else:
    status = "success"
```

- [ ] **Step 5: Run the upload service tests**

Run: `cd backend && uv run pytest tests/services/test_upload_service.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services backend/app/schemas backend/tests/services
git commit -m "[backend] 업로드 서비스와 partial 정책 구현 (codex)"
```

### Task 5: Expose upload, schema, and assets APIs

**Files:**
- Create: `backend/app/api/v1/endpoints/upload.py`
- Create: `backend/app/api/v1/endpoints/assets.py`
- Create: `backend/app/api/v1/endpoints/schema.py`
- Create: `backend/app/schemas/asset.py`
- Create: `backend/app/schemas/schema_doc.py`
- Create: `backend/app/services/schema_service.py`
- Test: `backend/tests/api/test_upload_api.py`
- Test: `backend/tests/api/test_assets_api.py`
- Test: `backend/tests/api/test_schema_api.py`

- [ ] **Step 1: Write failing API tests for auth and happy paths**

```python
async def test_upload_requires_api_key(async_client: AsyncClient) -> None:
    response = await async_client.post("/api/v1/upload")
    assert response.status_code == 401
```

```python
async def test_schema_endpoint_returns_tables(async_client: AsyncClient, api_headers: dict[str, str]) -> None:
    response = await async_client.get("/api/v1/schema", headers=api_headers)
    assert response.status_code == 200
    assert "transactions" in response.text
```

- [ ] **Step 2: Run API tests to verify they fail**

Run: `cd backend && uv run pytest tests/api/test_upload_api.py tests/api/test_assets_api.py tests/api/test_schema_api.py -v`
Expected: FAIL because routes and auth are incomplete.

- [ ] **Step 3: Implement authenticated upload and schema routes**

```python
@router.post("/upload", dependencies=[Depends(require_api_key)])
async def upload_file(...) -> UploadResponse:
    return await upload_service.import_workbook(...)
```

```python
@router.get("/schema", dependencies=[Depends(require_api_key)])
async def get_schema_document() -> SchemaDocumentResponse:
    return build_schema_document(Base.metadata)
```

- [ ] **Step 4: Implement asset snapshot and net-worth read endpoints**

```python
@router.get("/assets/net-worth-history")
async def get_net_worth_history(...) -> NetWorthHistoryResponse:
    ...
```

- [ ] **Step 5: Run API tests**

Run: `cd backend && uv run pytest tests/api/test_upload_api.py tests/api/test_assets_api.py tests/api/test_schema_api.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api backend/app/schemas backend/app/services backend/tests/api
git commit -m "[backend] 업로드 자산 스키마 API 추가 (codex)"
```

### Task 6: Implement transaction query and edit APIs for MVP scope

**Files:**
- Create: `backend/app/api/v1/endpoints/transactions.py`
- Create: `backend/app/schemas/transaction.py`
- Create: `backend/app/schemas/common.py`
- Create: `backend/app/services/transaction_query_service.py`
- Create: `backend/app/services/transaction_edit_service.py`
- Test: `backend/tests/api/test_transactions_api.py`

- [ ] **Step 1: Write failing tests for summary, list filters, and edit actions**

```python
async def test_list_transactions_supports_edit_filters(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    response = await async_client.get(
        "/api/v1/transactions",
        headers=api_headers,
        params={"is_edited": "all", "include_deleted": "false", "include_merged": "false"},
    )
    assert response.status_code == 200
```

```python
async def test_patch_transaction_updates_user_categories(...) -> None:
    response = await async_client.patch(...)
    assert response.status_code == 200
```

- [ ] **Step 2: Run the transaction API tests**

Run: `cd backend && uv run pytest tests/api/test_transactions_api.py -v`
Expected: FAIL because the routes and services do not exist.

- [ ] **Step 3: Implement read endpoints**

```python
GET /api/v1/transactions
GET /api/v1/transactions/summary
GET /api/v1/transactions/by-category
GET /api/v1/transactions/payment-methods
```

- [ ] **Step 4: Implement write endpoints in MVP scope**

```python
POST /api/v1/transactions
PATCH /api/v1/transactions/{id}
DELETE /api/v1/transactions/{id}
POST /api/v1/transactions/{id}/restore
PATCH /api/v1/transactions/bulk-update
```

- [ ] **Step 5: Explicitly leave merge unimplemented for MVP**

```python
@router.post("/transactions/merge")
async def merge_transactions() -> None:
    raise HTTPException(status_code=501, detail="Merge is out of MVP scope")
```

- [ ] **Step 6: Run transaction API tests**

Run: `cd backend && uv run pytest tests/api/test_transactions_api.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/endpoints/transactions.py backend/app/schemas backend/app/services backend/tests/api/test_transactions_api.py
git commit -m "[backend] 거래 조회 및 편집 API 구현 (codex)"
```

### Task 6A: Add the first canonical transaction analysis layer

**Files:**
- Create: `backend/alembic/versions/<timestamp>_add_vw_transactions_effective.py`
- Create: `backend/alembic/versions/<timestamp>_add_vw_category_monthly_spend.py`
- Modify: `backend/app/services/schema_service.py`
- Modify: `backend/tests/api/test_schema_api.py`
- Modify: transaction query layer as needed to keep analysis rules aligned with the view definitions

- [ ] **Step 1: Write a failing schema/view metadata test**

```python
def test_schema_document_lists_vw_transactions_effective(...) -> None:
    ...
```

- [ ] **Step 2: Add migration for `vw_transactions_effective`**

Scope of `vw_transactions_effective`:
- row-level canonical read surface for transaction analysis
- expose raw and effective categories together
- use `COALESCE(category_major_user, category_major)` and `COALESCE(category_minor_user, category_minor)`
- exclude `is_deleted = TRUE`
- exclude rows with `merged_into_id IS NOT NULL`
- add simple analysis helpers such as `year_month`, `is_edited`, and normalized expense/income/transfer flags

- [ ] **Step 3: Add migration for `vw_category_monthly_spend`**

Scope of `vw_category_monthly_spend`:
- monthly aggregate built from `vw_transactions_effective`
- group by `year_month`, effective category, and transaction type as needed
- expose at least `year_month`, `category_major_effective`, `category_minor_effective`, `spend_total`, and `tx_count`
- default spending analysis should treat transfer rows separately so category spend advice does not silently mix asset movement into expense totals

- [ ] **Step 4: Document both views in the schema layer**

`GET /api/v1/schema` should describe:
- `vw_transactions_effective` as the default row-level read surface for agent-driven transaction analysis
- `vw_category_monthly_spend` as the default monthly/category aggregate surface for dashboards and finance advice

- [ ] **Step 5: Keep only later derived views out of first scope**

Do **not** implement `vw_monthly_cashflow`, recurring-merchant views, or other derived views yet. Record them as future expansion once the first canonical layer is proven useful.

- [ ] **Step 6: Run focused schema/API tests**

Run: `cd backend && uv run pytest tests/api/test_schema_api.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend docs/superpowers/plans/2026-03-23-phase1-mvp-foundation.md
git commit -m "[db] 거래 canonical analysis layer 1차 추가 (codex)"
```

### Task 7: Add frontend minimal scaffold and Docker runtime

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/pages/PlaceholderApp.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/Dockerfile`
- Create: `backend/Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Write a failing container/runtime smoke checklist**

Run: `docker compose config`
Expected: FAIL because service files do not exist yet.

- [ ] **Step 2: Create frontend scaffold with a placeholder shell**

```tsx
export function PlaceholderApp() {
  return <main>my_ledge Phase 1 API bootstrap</main>;
}
```

- [ ] **Step 3: Create backend and frontend Dockerfiles**

```dockerfile
FROM python:3.12-slim AS runtime
...
HEALTHCHECK CMD wget --spider -q http://localhost:8000/api/v1/health || exit 1
```

- [ ] **Step 4: Create docker-compose and example env**

```yaml
services:
  db:
    image: postgres:16-alpine
  backend:
    build: ./backend
  frontend:
    build: ./frontend
```

- [ ] **Step 5: Run compose validation**

Run: `docker compose config`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend backend/Dockerfile frontend/Dockerfile docker-compose.yml .env.example README.md
git commit -m "[infra] 개발 실행 환경과 프론트 초기 구성 추가 (codex)"
```

### Task 8: Verify end-to-end MVP foundation and update project status

**Files:**
- Modify: `STATUS.md`
- Modify: `README.md`

- [ ] **Step 1: Run backend test suite**

Run: `cd backend && uv run pytest`
Expected: PASS.

- [ ] **Step 2: Run backend lint and format checks**

Run: `cd backend && uv run ruff check . && uv run ruff format --check .`
Expected: PASS.

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: PASS.

- [ ] **Step 4: Run container config validation**

Run: `docker compose config`
Expected: PASS.

- [ ] **Step 5: Update STATUS.md with exact execution state**

```markdown
## In Progress
- [ ] Phase 1 MVP implementation execution
  - Plan: `docs/superpowers/plans/2026-03-23-phase1-mvp-foundation.md`
  - Last completed task: ...
  - Current task: ...
```

- [ ] **Step 6: Commit**

```bash
git add STATUS.md README.md docs/superpowers/plans/2026-03-23-phase1-mvp-foundation.md
git commit -m "[docs] Phase 1 구현 계획과 상태 연동 갱신 (codex)"
```

---

## STATUS.md Integration Rules

When executing this plan, keep `STATUS.md` synchronized with task progress:

- Move `In Progress` from `없음` to the current task name before starting implementation.
- Add the plan path `docs/superpowers/plans/2026-03-23-phase1-mvp-foundation.md` under `In Progress`.
- Mirror task completion in `Completed` using user-visible milestones, not internal substeps.
- Keep `Next Up` aligned to the next unchecked task in this plan.
- Record any implementation-time architectural decision in `Key Decisions` with a date.
- Record verification blockers, missing secrets, or sample file gaps in `Known Issues`.

## Notes for the Implementer

- Use repository-local `./tmp/finance_sample.xlsx` as the parser fixture for non-encrypted workbook coverage.
- Do not persist the provided Excel password or API secrets in tracked files.
- Honor MVP scope: merge stays stubbed, not implemented.
- Prefer explicit SQLAlchemy query helpers for the transaction filters `is_edited`, `include_deleted`, `include_merged`, and `search`.
- Treat parser normalization as a boundary: parser output should already use backend field names rather than raw Excel headers.
- First analysis-layer scope includes two canonical views: `vw_transactions_effective` (row-level canonical read surface) and `vw_category_monthly_spend` (monthly/category aggregate). Future analysis views such as monthly cashflow, recurring merchants, and other advice-oriented derivatives are intentionally deferred until after these two views are in use.
