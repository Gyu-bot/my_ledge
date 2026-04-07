# Backend/API SSOT Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the backend/API as it actually exists today, promote that documentation to the project SSOT, update `PRD.md` to match shipped behavior, and identify/archive stale documents that no longer match the live system.

**Architecture:** Treat backend code as truth, derive SSOT docs from implemented endpoints and flows, then update higher-level product docs to align. Do not invent features not present in code.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy, Markdown documentation

---

## File Structure

- Read: `backend/app/api/v1/**/*.py`
- Read: `backend/app/schemas/**/*.py`
- Read: `backend/app/services/**/*.py`
- Modify or create: `docs/backend-api-ssot.md`
  - API and behavior SSOT derived from backend implementation.
- Modify: `PRD.md`
  - Align feature/endpoint/product expectations with shipped behavior.
- Modify: `README.md`
  - Update high-level usage/setup references if they conflict with the code.
- Modify: `docs/STATUS.md`
  - Record what documentation is now the SSOT.
- Modify: `docs/archive/` or add archive notes
  - Move or mark stale docs that conflict with the live backend/API.

## Task 1: Inventory implemented backend/API behavior from code

**Files:**
- Read: `backend/app/api/v1/**/*.py`
- Read: `backend/app/schemas/**/*.py`
- Read: `backend/app/services/**/*.py`

- [ ] **Step 1: Produce a code-derived inventory**

List:
- all live `/api/v1` endpoints
- request/response shapes
- auth requirements
- known MVP exclusions/stubs
- upload/read/edit/reset flows actually implemented

- [ ] **Step 2: Cross-check existing docs**

Compare the inventory against:
- `PRD.md`
- `README.md`
- `docs/frontend-reimplementation-wireframe-functional-requirements.md`
- any API/schema docs already present

- [ ] **Step 3: Note stale docs and mismatches**

Capture every stale or conflicting document before editing.

## Task 2: Create the backend/API SSOT document

**Files:**
- Create or modify: `docs/backend-api-ssot.md`

- [ ] **Step 1: Write the SSOT doc**

The document must include:
- purpose and scope
- canonical route inventory
- auth matrix
- upload pipeline summary
- transaction read/edit behavior
- asset/analytics behavior
- explicit non-goals/stubs
- source-of-truth note saying backend code wins over older docs

- [ ] **Step 2: Verify against code**

Re-read each endpoint section against backend code before moving on.

- [ ] **Step 3: Commit**

```bash
git add docs/backend-api-ssot.md
git commit -m "[docs] add backend api ssot (codex)"
```

## Task 3: Align PRD and high-level docs with shipped behavior

**Files:**
- Modify: `PRD.md`
- Modify: `README.md`

- [ ] **Step 1: Update PRD**

Adjust any outdated feature promises, endpoint references, workflow descriptions, and MVP exclusions to match current implementation.

- [ ] **Step 2: Update README if needed**

Only fix items that are now contradicted by shipped behavior or the new SSOT doc.

- [ ] **Step 3: Commit**

```bash
git add PRD.md README.md
git commit -m "[docs] align prd and readme with shipped api (codex)"
```

## Task 4: Mark or archive stale documents

**Files:**
- Modify or move: stale files identified in Task 1
- Modify: `docs/archive/README.md` if needed

- [ ] **Step 1: Mark stale docs**

For docs that are useful only as historical record, move them under `docs/archive/` or add a clear historical warning.

- [ ] **Step 2: Remove ambiguity**

Ensure no stale doc looks like current SSOT when it is not.

- [ ] **Step 3: Commit**

```bash
git add docs/archive
git commit -m "[docs] archive stale backend documentation (codex)"
```

## Task 5: Verify and update project state

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-07/codex.md`

- [ ] **Step 1: Verify documentation consistency**

Check that:
- `docs/backend-api-ssot.md` matches backend code
- `PRD.md` references shipped behavior
- stale docs are either archived or marked

- [ ] **Step 2: Update project state**

Record the new SSOT document and remaining documentation gaps in `docs/STATUS.md` and the daily log.

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md docs/daily/2026-04-07/codex.md
git commit -m "[docs] record backend api documentation sync (codex)"
```
