# Transaction Import First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement transaction-only workbook import so parsed `가계부 내역` rows can be incrementally inserted into the database and logged in `upload_logs`.

**Architecture:** Add a focused upload service that loads workbook bytes, parses transactions, computes the last imported transaction cursor from the database, inserts only new rows, and writes an `upload_logs` record. Keep snapshot persistence out of scope so the transaction ingestion path reaches production shape first.

**Tech Stack:** Python 3.12+, FastAPI backend, SQLAlchemy 2.0 async, Alembic schema, pytest, openpyxl, msoffcrypto-tool, PostgreSQL.

---

## Planned File Structure

- Create: `backend/app/services/upload_service.py` - transaction-only import orchestration and duplicate filtering
- Create: `backend/app/services/__init__.py`
- Create: `backend/tests/services/test_upload_service.py` - async DB-backed transaction import tests
- Modify: `backend/tests/conftest.py` - async DB session fixtures and sample workbook access reuse
- Modify: `backend/app/models/upload_log.py` only if required by test expectations
- Modify: `STATUS.md` - branch, scope split, in-progress pointer, next steps

### Task 1: Add DB-backed upload service tests

**Files:**
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/services/test_upload_service.py`

- [ ] **Step 1: Write a failing test for first transaction import**

```python
result = await import_transactions_from_workbook(...)
assert result.tx_total == 2219
assert result.tx_new == 2219
assert result.tx_skipped == 0
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/services/test_upload_service.py::test_import_transactions_inserts_all_rows_on_first_upload -v`
Expected: FAIL because `upload_service` and DB fixtures do not exist yet.

- [ ] **Step 3: Add DB fixtures for async session and schema setup**

- [ ] **Step 4: Write a failing duplicate import test**

```python
first = await import_transactions_from_workbook(...)
second = await import_transactions_from_workbook(...)
assert second.tx_new == 0
assert second.tx_skipped == 2219
```

- [ ] **Step 5: Run the duplicate test to verify it fails**

Run: `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/services/test_upload_service.py::test_import_transactions_skips_rows_already_loaded -v`
Expected: FAIL because duplicate filtering is not implemented.

### Task 2: Implement transaction-only upload service

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/upload_service.py`

- [ ] **Step 1: Implement minimal import result objects and workbook loading**

- [ ] **Step 2: Implement last transaction cursor query**

- [ ] **Step 3: Implement boundary timestamp duplicate comparison using normalized transaction fields**

- [ ] **Step 4: Insert new `Transaction` rows and create `UploadLog` entry with `status='success'`**

- [ ] **Step 5: Run focused upload service tests**

Run: `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/services/test_upload_service.py -v`
Expected: PASS.

### Task 3: Verify full backend suite and real DB path

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run pytest`
Expected: PASS.

- [ ] **Step 2: If `.env` and PostgreSQL are available, run migration and one real import smoke check**

Run: `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run alembic upgrade head`
Expected: PASS if DB is available; otherwise record blocker in `STATUS.md`.

- [ ] **Step 3: Update `STATUS.md` with exact implementation point and next task**

- [ ] **Step 4: Commit**

```bash
git add backend STATUS.md docs/superpowers/specs/2026-03-24-transaction-import-design.md docs/superpowers/plans/2026-03-24-transaction-import-first.md
git commit -m "[backend] 거래 적재 우선 업로드 서비스 구현 (codex)"
```
