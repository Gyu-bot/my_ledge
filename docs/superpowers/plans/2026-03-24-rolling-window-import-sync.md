# Rolling Window Import Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make transaction import converge to the latest rolling-window workbook instead of assuming each upload is a strict cumulative superset.

**Architecture:** Keep snapshot import behavior unchanged and replace transaction-only max-datetime append logic with window reconciliation. For each uploaded workbook, parse the full transaction set, determine its transaction datetime window, load existing imported rows in that window, preserve editable user fields for rows that still logically exist, and replace the imported rows in that window with the workbook’s rows. Manual rows remain untouched.

**Tech Stack:** Python 3.12+, FastAPI service layer, SQLAlchemy 2.0 async, pytest, openpyxl.

---

### Task 1: Lock in rolling-window behavior with failing tests

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/services/test_upload_service.py`

- [ ] **Step 1: Write a failing test for `finance_sample.xlsx -> sample_260324.xlsx` re-sync**
- [ ] **Step 2: Run the focused test and verify it fails under current max-datetime logic**
- [ ] **Step 3: Write a failing test showing user-edited fields survive a logical row match across window re-sync**
- [ ] **Step 4: Run the focused tests and verify failure**

### Task 2: Implement window reconciliation for imported rows

**Files:**
- Modify: `backend/app/services/upload_service.py`

- [ ] **Step 1: Add transaction window calculation and load existing imported rows inside that window**
- [ ] **Step 2: Build workbook rows for the window while carrying forward editable fields from logically matching imported rows**
- [ ] **Step 3: Delete only imported rows inside the workbook window, keep manual rows untouched, then insert reconciled workbook rows**
- [ ] **Step 4: Re-run focused tests and make them pass**

### Task 3: Verify and document

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Run `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/services/test_upload_service.py -v`**
- [ ] **Step 2: Run `cd backend && UV_CACHE_DIR=/tmp/uv-cache uv run pytest tests/services/test_source_verification.py -v`**
- [ ] **Step 3: Update `STATUS.md` with rolling-window reconciliation results and remaining follow-up**
