# Loan Transaction Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend support for manually linking expense transactions to stable loan account identities.

**Architecture:** Add `loan_accounts` for stable identity and `loan_transaction_links` for transaction-level mapping. Keep `loans` as snapshot observations and use lender/product pairs to seed account candidates.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Pydantic v2, pytest/httpx.

---

### Task 1: Persistence Models And Migration

**Files:**
- Create: `backend/app/models/loan_account.py`
- Create: `backend/app/models/loan_transaction_link.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/20260524_0007_add_loan_transaction_mapping.py`

- [ ] Write failing tests that import new models through `app.models`.
- [ ] Add SQLAlchemy models with uniqueness on `(lender, product_name)` and `transaction_id`.
- [ ] Add Alembic tables and indexes.

### Task 2: Schemas And Service

**Files:**
- Create: `backend/app/schemas/loan_mapping.py`
- Create: `backend/app/services/loan_mapping_service.py`
- Test: `backend/tests/services/test_loan_mapping_service.py`

- [ ] Write failing service tests for deduped account candidates and transaction link upsert.
- [ ] Implement candidate loading from `loan_accounts` union `loans`.
- [ ] Implement upsert, lookup, and delete link helpers.

### Task 3: API Endpoints

**Files:**
- Create: `backend/app/api/v1/endpoints/loan_mapping.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/api/test_loan_mapping_api.py`

- [ ] Write failing API tests for read/write/delete and auth.
- [ ] Add FastAPI routes and wire the router.
- [ ] Return `404` for unknown transactions and unknown account IDs.

### Task 4: Docs And Status

**Files:**
- Modify: `docs/backend-api-ssot.md`
- Modify: `docs/backend-api-and-metrics-reference.md`
- Modify: `PRD.md`
- Modify: `docs/STATUS.md`

- [ ] Document new endpoints and data contract.
- [ ] Update project status handoff.
- [ ] Run focused backend tests.

