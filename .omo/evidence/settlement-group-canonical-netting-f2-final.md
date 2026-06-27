# Final F2 Code Quality Revalidation: settlement-group-canonical-netting

## Verdict

- result: FAIL
- codeQualityStatus: BLOCK
- recommendation: REQUEST_CHANGES
- reportPath: `.omo/evidence/settlement-group-canonical-netting-f2-final.md`
- blockers:
  - `reconcile_settlement_matches()` can still crash on a persisted manual confirmed match after the refund participant is later deleted or merged, and the new settlement-match API calls that reconciliation path after writes.

## Scope Reviewed

- Workspace: `/Users/gyurin/dev/my_ledge`
- Branch: `codex/settlement-group-canonical-netting`
- `HEAD` and `origin/main`: `b37730d42ed04b7688430851a4c95d9751e9956e`
- Notepad path: not provided.
- Prior evidence inspected as untrusted context:
  - `.omo/evidence/settlement-group-canonical-netting-f2-code-quality.md`
  - `.omo/evidence/settlement-group-canonical-netting-f2-regate.md`
  - `.omo/evidence/settlement-group-canonical-netting-test-split.md`
  - `.omo/evidence/settlement-group-canonical-netting-f3-regate.md`
  - `.omo/evidence/settlement-group-canonical-netting-f3-format-triage.md`
  - `.omo/evidence/settlement-group-canonical-netting-f4-scope-fidelity.md`

## Skill-Perspective Check

- Ran the required `remove-ai-slops` perspective by loading `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`.
- Ran the required `programming` perspective by loading `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`.
- Loaded relevant Python programming references:
  - `references/python/README.md`
  - `references/python/fastapi-stack.md`
  - `references/python/data-modeling.md`
  - `references/python/error-handling.md`
  - `references/python/type-patterns.md`
- Skill-perspective result:
  - Production/API diff violates the programming reliability perspective through an unhandled expected lifecycle state in reconciliation.
  - Settlement tests do not include deletion-only, tautological, prompt, or implementation-constant-only tests.
  - New settlement-focused test files now satisfy the 250 pure-LOC split requirement.

## Findings

### CRITICAL

- None.

### HIGH

1. `backend/app/services/settlement_group_service.py:136` and `backend/app/services/settlement_group_matching.py:89`

   `_load_manual_matches()` loads all `user_confirmed` and `rejected` manual matches without joining/filtering participant transactions against the current canonical basis. `reconcile_settlement_matches()` then passes those stale manual matches to `build_snapshots()`. If a previously valid confirmed refund is later soft-deleted or merged, `build_snapshots()` keeps the still-active original purchase, then sorts refund matches through `transactions_by_id[match.settlement_transaction_id]`, which raises `KeyError` because the refund was excluded from `_load_transactions()`.

   This is reachable through normal product behavior: `backend/app/services/transactions_service.py:379` soft-deletes transactions by setting `is_deleted = True`, and settlement matches are not invalidated there. The new API write path calls reconciliation at `backend/app/services/settlement_match_service.py:62` and `backend/app/services/settlement_match_service.py:100`, catching only `IntegrityError`, so a stale manual match can turn an unrelated settlement-match PUT/DELETE into a 500.

   Probe evidence:

   - Temporary in-memory SQLite script created an active purchase/refund, inserted a `user_confirmed` match, soft-deleted the refund, then called `reconcile_settlement_matches(session)`.
   - Result: `KeyError 2`.

   Required before approval: filter or ignore manual matches whose original/refund participants no longer satisfy the same canonical reconciliation basis before snapshot construction and manual allocation, or invalidate those matches when participants are deleted/merged. Add a regression test for a previously confirmed manual match whose refund is later deleted/merged and then reconciliation/API write runs.

### MEDIUM

- None.

### LOW

1. `backend/app/models/settlement_group.py:42` and `backend/alembic/versions/20260627_0029_add_settlement_matches.py:19`

   `settlement_matches.status` and `matched_amount` are service-validated but not DB-constrained. Given the repo contract forbids direct DB writes and the API/service validates payloads, this is hardening debt rather than a blocker.

2. Inherited oversized files remain modified:

   - `backend/app/services/analytics_service.py`: 1360 pure LOC
   - `backend/tests/api/test_analytics_api.py`: 1780 pure LOC
   - `backend/tests/api/test_transactions_api.py`: 777 pure LOC
   - `backend/tests/services/test_analytics_service.py`: 1952 pure LOC

   The new settlement-specific files are under threshold, so this is noted as inherited debt, not the final F2 blocker.

3. Worktree hygiene: untracked `.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, and older evidence artifacts are present. This is not a code-quality blocker for the requested F2 revalidation, but should not be committed accidentally.

## Requested Checks

| Check | Result | Evidence |
|---|---:|---|
| No HIGH/MEDIUM blockers | FAIL | One HIGH stale manual-match reconciliation/API blocker remains. |
| Deleted/merged guard still fixed | PARTIAL | Analytics confirmed-netting guard is fixed in `_load_confirmed_matches()` with joined participant filters, but reconciliation/snapshot manual-match guard is still unsafe. |
| New API safe | FAIL | Auth and request validation are present, but PUT/DELETE can hit the stale-match reconciliation crash. |
| Changed/new settlement test files <=250 pure LOC | PASS | Largest split settlement test file is `backend/tests/services/test_settlement_group_service_regression_edges.py` at 239 pure LOC. |
| Changed-file format clean | PASS | `ruff format --check` reported `20 files already formatted`. |
| Ruff evidence | PASS | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .` -> `All checks passed!`. |
| Test evidence | PASS | Targeted settlement/analytics/transactions pytest -> `88 passed, 794 warnings in 2.30s`. |
| Diff evidence | PASS | `git diff --check` produced no output; untracked new-file `git diff --no-index --check` pass produced no output. |

## Pure LOC Evidence

New/changed settlement-focused test files:

| file | pure LOC |
|---|---:|
| `backend/tests/api/test_settlement_match_api.py` | 177 |
| `backend/tests/api/test_settlement_match_api_errors.py` | 79 |
| `backend/tests/api/test_settlement_match_api_unlink.py` | 110 |
| `backend/tests/services/test_settlement_group_service.py` | 109 |
| `backend/tests/services/test_settlement_group_service_regression.py` | 193 |
| `backend/tests/services/test_settlement_group_service_regression_edges.py` | 239 |
| `backend/tests/services/test_settlement_match_service.py` | 158 |

New settlement implementation files:

| file | pure LOC |
|---|---:|
| `backend/alembic/versions/20260627_0029_add_settlement_matches.py` | 67 |
| `backend/app/api/v1/endpoints/settlement_matches.py` | 41 |
| `backend/app/models/settlement_group.py` | 37 |
| `backend/app/schemas/settlement.py` | 22 |
| `backend/app/services/settlement_group_matching.py` | 179 |
| `backend/app/services/settlement_group_service.py` | 185 |
| `backend/app/services/settlement_match_service.py` | 216 |

## Verification Commands

- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check ...20 changed/new Python files...`
  - `20 files already formatted`
- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .`
  - `All checks passed!`
- `git diff --check`
  - clean
- `git diff --no-index --check /dev/null ...new Python files...`
  - no whitespace/check output
- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_match_service.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py -q`
  - `88 passed, 794 warnings in 2.30s`
- Temporary stale-match probe:
  - valid purchase/refund + `user_confirmed` match, then `refund.is_deleted = True`, then `reconcile_settlement_matches(session)`
  - `KeyError 2`

## Final Status

FAIL. The test split, format, lint, targeted tests, and analytics deleted/merged netting guard are good, but the new API/reconciliation path still has a reachable HIGH lifecycle blocker.
