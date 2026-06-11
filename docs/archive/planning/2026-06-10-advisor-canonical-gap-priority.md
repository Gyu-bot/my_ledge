# Advisor Canonical Gap Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real-data findings in `docs/advisor-canonical-gap-analysis.md` the top implementation priority so AI advisors read corrected, complete canonical finance evidence before older P2 work resumes.

**Architecture:** Keep My Ledge responsible for calculations, canonical read surfaces, confidence, and assumptions only. Implement the Group 1 correctness fixes first, then add narrow canonical/API surfaces for profile, loans, data coverage, and income composition. Do not fold this into the larger P2 asset source-priority redesign.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy async, Alembic PostgreSQL views, pytest/httpx, existing docs under `docs/agents/` and `docs/backend-api-*`.

---

## Review Summary

`docs/advisor-canonical-gap-analysis.md` is newer and more specific than the current backlog. Treat it as the priority source for the next advisor/canonical batch.

Current-state checks:

- The repo is on `main...origin/main`.
- Untracked local files exist: `.DS_Store`, `docs/.DS_Store`, and `docs/advisor-canonical-gap-analysis.md`.
- `docs/STATUS.md` says P0/P0.5/P1 are otherwise complete, with investment analysis and transfer tracking deferred.
- `docs/planned-work.md` still has broad P2 asset lifecycle/source-priority work. That should stay behind this new gap plan.
- `vw_asset_snapshot_canonical` currently includes all asset rows in `asset_total` and does not expose `negative_asset_excluded_total`.
- `_is_cash_equivalent_asset()` currently misses `자유입출금` and `전자금융`, and does not reject negative asset rows before heuristic matching.
- `GET /api/v1/loans/summary` is live, but the agent canonical value dictionary does not make it a first-choice surface for loan rate/balance/maturity questions.
- `parse_snapshots()` currently parses only 3.재무현황, 5.투자현황, and 6.대출현황.
- `GET /api/v1/canonical-views/dashboard` currently returns monthly rows without `data_coverage` or `is_complete_month`.

## Execution Policy

- Start implementation from latest `origin/main` in a dedicated worktree.
- Do not directly edit `docs/STATUS.md` or `docs/planned-work.md` in feature/fix PRs.
- Include `Status impact`, `Planned-work impact`, and `Contract docs` in each PR body.
- Update contract/source-of-truth docs in the same PR as behavior changes, limited to changed surfaces.
- Before any Docker or local service changes, inspect `docker ps` and bound ports. Avoid conflicts with honcho bindings on 8000, 6379, and 5432.
- Every implementation PR should verify with `tmp/2025-05-21~2026-05-21.xlsx` when the acceptance criteria depends on the real workbook.

## File Map

Primary backend files:

- `backend/alembic/versions/`: add migrations for canonical view changes and new tables/views.
- `backend/app/parsers/snapshots.py`: add profile and later insurance parsing.
- `backend/app/services/upload_service.py`: persist new snapshot-derived records during upload.
- `backend/app/services/assets_service.py`: align Python asset/liquidity logic with canonical DB view logic.
- `backend/app/services/canonical_views.py`: register new canonical DB views for `/schema`.
- `backend/app/services/canonical_views_dashboard_service.py`: add dashboard data coverage enrichment.
- `backend/app/api/v1/endpoints/`: add profile endpoint and wire new routers when needed.
- `backend/app/schemas/`: add or extend Pydantic response models.
- `backend/app/models/`: add snapshot models.
- `backend/tests/`: add regression tests at parser, service, API, and schema levels.

Primary docs:

- `docs/agents/canonical-read-surface-reference.md`
- `docs/backend-api-ssot.md`
- `docs/backend-api-and-metrics-reference.md`
- PR body `Status impact` and `Planned-work impact`

## Priority Order

1. Task 1: items 1 and 2 from `advisor-canonical-gap-analysis.md`
2. Task 2: item 3 documentation-only loan summary exposure
3. Task 3: item 4 profile snapshot parsing and API
4. Task 4: item 5 `vw_loan_account_canonical`
5. Task 5: item 6 dashboard data coverage metadata
6. Task 6: item 7 income composition canonical view
7. Task 7: items 8 to 11 triage into later PRs

## Task 1: Correct Negative Asset And Cash Equivalent Canonical Logic

**Files:**

- Modify: `backend/alembic/versions/<new_revision>_fix_asset_canonical_negative_cash.py`
- Modify: `backend/app/services/assets_service.py`
- Modify: `backend/app/services/canonical_views.py`
- Modify: `backend/app/schemas/asset.py`
- Test: `backend/tests/services/test_assets_service.py`
- Test: `backend/tests/api/test_schema_api.py`
- Docs: `docs/agents/canonical-read-surface-reference.md`
- Docs: `docs/backend-api-and-metrics-reference.md`

- [ ] **Step 1: Create a failing service regression test for negative asset exclusion**

Add a test that creates one asset row with `amount=-2605548`, a matching liability row with `amount=2605548`, and a positive cash account. Assert that net worth is not double reduced and that cash equivalents do not include the negative row.

Expected assertion shape:

```python
assert response.net_worth == Decimal("1000000.00") - Decimal("2605548.00")
assert response.cash_equivalent_total == Decimal("310099.00")
assert "negative_asset_rows_excluded" in response.assumptions
```

- [ ] **Step 2: Run the targeted test and confirm failure**

Run:

```bash
cd backend
uv run pytest tests/services/test_assets_service.py -k "negative_asset or cash_equivalent" -vv
```

Expected: failure showing current logic includes the negative asset row in one or more totals.

- [ ] **Step 3: Add an Alembic view migration**

Create a revision after `20260530_0022` that recreates `vw_asset_snapshot_canonical`.

Required SQL behavior:

```sql
CASE
  WHEN side = 'asset' AND amount < 0 THEN amount
  ELSE 0
END AS negative_asset_amount
```

Required totals:

```sql
SUM(CASE WHEN side = 'asset' AND amount >= 0 THEN amount ELSE 0 END) AS asset_total,
SUM(CASE WHEN side = 'liability' THEN amount ELSE 0 END) AS liability_total,
SUM(negative_asset_amount) AS negative_asset_excluded_total
```

Required cash heuristic changes:

```sql
WHEN side = 'asset'
 AND amount >= 0
 AND (
   is_cash_equivalent IS TRUE
   OR liquidity_tier IN ('immediate', 'cash', 'cash_equivalent')
   OR (
     is_cash_equivalent IS NULL
     AND liquidity_tier IS NULL
     AND (
       category ILIKE '%현금%'
       OR category ILIKE '%예금%'
       OR category ILIKE '%자유입출금%'
       OR category ILIKE '%전자금융%'
       OR product_name ILIKE '%입출금%'
       OR product_name ILIKE '%통장%'
       OR product_name ILIKE '%CMA%'
       OR product_name ILIKE '%파킹%'
       OR product_name ILIKE '%보통예금%'
     )
   )
 )
THEN amount
```

- [ ] **Step 4: Align Python service logic**

Update `_is_cash_equivalent_asset()` so negative asset rows are never cash equivalent:

```python
def _is_cash_equivalent_asset(asset: AssetSnapshot) -> bool:
    if asset.side == "asset" and asset.amount < 0:
        return False
    if asset.is_cash_equivalent is not None:
        return asset.is_cash_equivalent
    if asset.liquidity_tier in {"cash", "cash_equivalent", "immediate"}:
        return True
    if asset.liquidity_tier in {"near_liquid", "locked", "illiquid"}:
        return False
    text = f"{asset.category} {asset.product_name}".casefold()
    cash_markers = (
        "현금",
        "예금",
        "자유입출금",
        "전자금융",
        "입출금",
        "통장",
        "cma",
        "파킹",
        "보통예금",
    )
    locked_markers = ("부동산", "전세", "보증금", "연금", "보험", "청약", "저금통")
    if any(marker in text for marker in locked_markers):
        return False
    return any(marker in text for marker in cash_markers)
```

Also make `get_asset_liability_health()` append an assumption when excluded negative asset rows exist:

```python
assumptions.append("negative_asset_rows_excluded")
```

- [ ] **Step 5: Register and document the new column**

Add `negative_asset_excluded_total` to `backend/app/services/canonical_views.py`, schema documentation tests, and the agent/reference docs.

- [ ] **Step 6: Verify**

Run:

```bash
cd backend
uv run pytest tests/services/test_assets_service.py tests/api/test_schema_api.py -vv
uv run ruff check .
```

Real workbook acceptance:

- After importing `tmp/2025-05-21~2026-05-21.xlsx`, `cash_equivalent_total` should be about `310099`.
- `negative_asset_excluded_total` should expose the excluded minus-account amount.
- `net_worth` should no longer double subtract the minus-account balance.

## Task 2: Promote `GET /api/v1/loans/summary` In Agent Documentation

**Files:**

- Modify: `docs/agents/canonical-read-surface-reference.md`
- Modify: `docs/agent-integration/integration-guide.md`
- Modify: `docs/backend-api-and-metrics-reference.md`

- [ ] **Step 1: Add the loan structure row to the surface selection table**

Add a row with this meaning:

```markdown
| 대출 구조/금리/만기 | `GET /api/v1/loans/summary` | `vw_loan_repayment_monthly`, future `vw_loan_account_canonical` |
```

- [ ] **Step 2: Add value dictionary fields**

Document:

- `interest_rate`: annual percent from the snapshot
- `balance`: current outstanding amount
- `principal`: original principal when provided by BankSalad
- `monthly_payment`: manual or estimated monthly payment
- `monthly_payment_source`: `manual`, `estimated_from_linked_transactions`, or null
- `repayment_method`: user-confirmed or estimated repayment method
- `maturity_date`: maturity date from the snapshot

- [ ] **Step 3: Verify**

Run:

```bash
git diff -- docs/agents/canonical-read-surface-reference.md docs/agent-integration/integration-guide.md docs/backend-api-and-metrics-reference.md
```

Expected: documentation-only diff. No backend test is required for this task.

## Task 3: Parse And Expose Profile Snapshot

**Files:**

- Modify: `backend/app/parsers/snapshots.py`
- Create: `backend/app/models/user_profile_snapshot.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/<new_revision>_add_user_profile_snapshots.py`
- Modify: `backend/app/services/upload_service.py`
- Create: `backend/app/schemas/profile.py`
- Create: `backend/app/api/v1/endpoints/profile.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/parsers/test_snapshots.py`
- Test: `backend/tests/services/test_upload_service.py`
- Test: `backend/tests/api/test_profile_api.py`
- Docs: `docs/backend-api-ssot.md`
- Docs: `docs/backend-api-and-metrics-reference.md`
- Docs: `docs/agents/canonical-read-surface-reference.md`

- [ ] **Step 1: Write parser tests**

Add a workbook fixture with `1.고객정보`. Assert:

```python
assert result.profile == {
    "gender": "남",
    "age": 39,
    "credit_score_kcb": 996,
}
```

Add a workbook without `1.고객정보`. Assert:

```python
assert result.profile is None
```

- [ ] **Step 2: Add optional marker helper and profile parser**

Add:

```python
class ProfileRow(TypedDict):
    gender: str | None
    age: int | None
    credit_score_kcb: int | None
```

Extend:

```python
@dataclass(slots=True)
class SnapshotParseResult:
    asset_snapshots: list[AssetSnapshotRow]
    investments: list[InvestmentRow]
    loans: list[LoanRow]
    profile: ProfileRow | None = None
```

Add:

```python
def find_optional_table_start(rows: list[tuple[object, ...]], marker: str) -> int | None:
    for index, row in enumerate(rows):
        if len(row) > 1 and row[1] and str(row[1]).strip() == marker:
            return index
    return None
```

Parse only gender, age, and KCB score. Do not store name or email.

- [ ] **Step 3: Add model and migration**

Create `user_profile_snapshots` with:

- `id`
- `snapshot_date`, unique
- `gender`
- `age`
- `credit_score_kcb`
- `created_at`

- [ ] **Step 4: Persist during upload**

In `upload_service.py`, store profile snapshots using the same same-date replace behavior as assets, investments, and loans.

- [ ] **Step 5: Add API**

Expose:

```http
GET /api/v1/profile
```

Response shape:

```json
{
  "snapshot_date": "2026-05-21",
  "gender": "남",
  "age": 39,
  "credit_score_kcb": 996,
  "credit_score_history": [
    {"snapshot_date": "2026-05-21", "credit_score_kcb": 996}
  ]
}
```

- [ ] **Step 6: Verify**

Run:

```bash
cd backend
uv run pytest tests/parsers/test_snapshots.py tests/services/test_upload_service.py tests/api/test_profile_api.py -vv
uv run pytest tests/api/test_schema_api.py -vv
uv run ruff check .
```

Real workbook acceptance:

- `GET /api/v1/profile` returns gender `남`, age `39`, and KCB score `996`.
- Upload still succeeds for a workbook without the customer info section.

## Task 4: Add `vw_loan_account_canonical`

**Files:**

- Create: `backend/alembic/versions/<new_revision>_add_loan_account_canonical_view.py`
- Modify: `backend/app/services/canonical_views.py`
- Test: `backend/tests/api/test_schema_api.py`
- Test: `backend/tests/services/test_canonical_views.py` or nearest existing canonical view test file
- Docs: `docs/agents/canonical-read-surface-reference.md`
- Docs: `docs/backend-api-and-metrics-reference.md`

- [ ] **Step 1: Write view registration/schema tests**

Assert `/api/v1/schema` includes `vw_loan_account_canonical` and these columns:

```python
expected = {
    "loan_account_id",
    "display_name",
    "lender",
    "product_name",
    "loan_kind",
    "snapshot_date",
    "principal",
    "balance",
    "interest_rate",
    "monthly_payment",
    "monthly_payment_source",
    "repayment_method",
    "start_date",
    "maturity_date",
    "estimated_monthly_interest",
}
```

- [ ] **Step 2: Create view**

Latest snapshot selection must pick the newest `loans.snapshot_date` per stable lender/product key. Include loans that do not yet have `loan_accounts` rows.

`estimated_monthly_interest` formula:

```sql
ROUND(balance * interest_rate / 100 / 12)
```

Return null when `balance` or `interest_rate` is null.

- [ ] **Step 3: Document interpretation**

Document that `estimated_monthly_interest` is a simple monthly interest approximation. It does not model amortization schedules or actual bank billing.

- [ ] **Step 4: Verify**

Run:

```bash
cd backend
uv run pytest tests/api/test_schema_api.py -vv
uv run ruff check .
```

Real workbook acceptance:

- The view returns the expected latest loan rows.
- The 4.03 percent mortgage row estimates monthly interest around `573000`.
- The 5.85 percent credit loan can be found as the highest-rate row.

## Task 5: Add Dashboard Data Coverage And Complete-Month Flags

**Files:**

- Modify: `backend/app/services/canonical_views_dashboard_service.py`
- Modify: `backend/app/schemas/canonical_views.py`
- Test: `backend/tests/api/test_canonical_views_api.py`
- Docs: `docs/agents/canonical-read-surface-reference.md`
- Docs: `docs/backend-api-and-metrics-reference.md`

- [ ] **Step 1: Write API test**

Create transactions spanning `2025-05-21` to `2026-05-21`. Assert dashboard response includes:

```python
assert body["data_coverage"] == {
    "first_transaction_date": "2025-05-21",
    "last_transaction_date": "2026-05-21",
}
assert may_2025["is_complete_month"] is False
assert june_2025["is_complete_month"] is True
assert may_2026["is_complete_month"] is False
```

- [ ] **Step 2: Add schema fields**

Add:

```python
class DataCoverage(BaseModel):
    first_transaction_date: date | None
    last_transaction_date: date | None
```

Add `data_coverage` to `CanonicalViewsDashboardResponse`. Add `is_complete_month` to monthly row schemas that are returned in dashboard arrays.

- [ ] **Step 3: Implement coverage query**

Use `vw_transactions_effective`:

```sql
SELECT MIN(date) AS first_transaction_date, MAX(date) AS last_transaction_date
FROM vw_transactions_effective
```

Complete-month rule:

- month start must be on or after first transaction date
- month end must be on or before last transaction date

- [ ] **Step 4: Verify**

Run:

```bash
cd backend
uv run pytest tests/api/test_canonical_views_api.py -vv
uv run ruff check .
```

Real workbook acceptance:

- `2025-05` is incomplete.
- `2025-06` through `2026-04` are complete.
- `2026-05` is incomplete.

## Task 6: Add Income Composition Canonical View

**Files:**

- Create: `backend/alembic/versions/<new_revision>_add_income_monthly_by_category.py`
- Modify: `backend/app/services/canonical_views.py`
- Test: `backend/tests/api/test_schema_api.py`
- Test: nearest canonical SQL/view test file
- Docs: `docs/agents/canonical-read-surface-reference.md`
- Docs: `docs/backend-api-and-metrics-reference.md`

- [ ] **Step 1: Write view tests**

Create income transactions with effective categories `급여`, `보험금`, and `기타`. Assert category rows sum to the monthly cashflow income total.

Expected shape:

```python
assert rows_by_period_category[("2026-02", "급여")].income_total == Decimal("10200240")
assert rows_by_period_category[("2026-02", "보험금")].income_total == Decimal("33500")
```

- [ ] **Step 2: Create view**

Source:

```sql
vw_transactions_effective
```

Filter:

```sql
WHERE type = '수입'
```

Columns:

- `period`
- `effective_category_major`
- `income_total`
- `transaction_count`

- [ ] **Step 3: Decide whether to extend `vw_monthly_cashflow`**

Default decision for the first PR: create only `vw_income_monthly_by_category`. Add `salary_income_total` and `non_salary_income_total` to `vw_monthly_cashflow` only if a consumer immediately needs them.

- [ ] **Step 4: Verify**

Run:

```bash
cd backend
uv run pytest tests/api/test_schema_api.py -vv
uv run ruff check .
```

Real workbook acceptance:

- 2026-02 separates salary, insurance payout, and other income.
- Sum of category income rows equals `vw_monthly_cashflow.income_total` for each period.

## Task 7: Triage Items 8 To 11 Into Later Focused PRs

**Files:**

- No immediate code change.
- Future docs-sync only after PRs merge into main: `docs/planned-work.md`

- [ ] **Step 1: Keep insurance parsing as P1.5**

Insurance contract parsing is valuable but should follow Tasks 1 to 6. It creates a new table and API and should be a focused PR.

- [ ] **Step 2: Keep BankSalad cashflow parity as P1.5/P2 hardening**

Use `2.현금흐름현황` for import parity reports only. Do not store these rows as live data until there is a clear product use.

- [ ] **Step 3: Keep financial targets as a settings PR**

Implement `financial_targets` only after Task 1 makes emergency fund calculations trustworthy. This belongs with settings contract and later settings frontend work.

- [ ] **Step 4: Keep investment concentration optional**

Do not add performance or allocation analysis before the securities source decision. A small `pct_of_investment_total` field can be considered if it is framed as snapshot composition only.

## Suggested PR Split

1. `fix/advisor-asset-canonical-cash`: Task 1
2. `docs/advisor-loan-summary-surface`: Task 2
3. `feature/advisor-profile-snapshot`: Task 3
4. `feature/advisor-loan-account-canonical`: Task 4
5. `feature/advisor-dashboard-coverage`: Task 5
6. `feature/advisor-income-composition`: Task 6

Tasks 1 and 2 can be adjacent, but Task 1 should land first because other advisor work depends on corrected asset/liquidity values.

## Final Validation For Each Code PR

Run the relevant targeted tests first, then:

```bash
cd backend
uv run pytest
uv run ruff check .
```

If frontend or dashboard rendering changes are added later, also run the relevant frontend tests and inspect the affected browser route with the Codex in-app browser.

## Plan Self-Review

Spec coverage:

- Advisor gap items 1 and 2 are covered by Task 1.
- Item 3 is covered by Task 2.
- Item 4 is covered by Task 3.
- Item 5 is covered by Task 4.
- Item 6 is covered by Task 5.
- Item 7 is covered by Task 6.
- Items 8 to 11 are intentionally deferred by Task 7, with ordering rules.

Placeholder scan:

- This plan intentionally avoids generic "add tests" steps. Each task names specific files, expected assertions, commands, and acceptance criteria.

Type consistency:

- Profile fields use `credit_score_kcb` consistently.
- Dashboard coverage uses `data_coverage`, `first_transaction_date`, `last_transaction_date`, and `is_complete_month` consistently.
- Loan account view uses `estimated_monthly_interest` consistently.
