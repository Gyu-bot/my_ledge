# Final F2 Revalidation After Stale Manual-Match Fix

## Verdict

- result: FAIL
- codeQualityStatus: BLOCK
- recommendation: REQUEST_CHANGES
- reportPath: `.omo/evidence/settlement-group-canonical-netting-f2-final-after-stale-fix.md`
- blockers:
  - Full backend pytest fails because `tests/api/test_schema_api.py::test_expected_tables_exist` was not updated for the new `settlement_matches` table.
  - Settlement-match API write capacity checks still count stale `user_confirmed` matches whose counterpart has left the canonical basis, so a valid later confirm can return `422` instead of ignoring the stale row.

## Scope Reviewed

- Workspace: `/Users/gyurin/dev/my_ledge`
- Branch: `codex/settlement-group-canonical-netting`
- `HEAD`, `main`, and `origin/main`: `b37730d42ed04b7688430851a4c95d9751e9956e`
- Upstream: none configured for the current branch.
- Notepad path: not provided.
- Existing evidence consulted as untrusted context:
  - `.omo/evidence/settlement-group-canonical-netting-f2-final.md`
  - `.omo/evidence/settlement-group-canonical-netting-f2-code-quality.md`
  - `.omo/evidence/settlement-group-canonical-netting-f2-regate.md`
  - `.omo/evidence/settlement-group-canonical-netting-stale-manual-match-fix.md`

## Skill-Perspective Check

- Ran the required `remove-ai-slops` perspective by loading `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`.
- Ran the required `programming` perspective by loading `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`.
- Loaded relevant Python references:
  - `references/python/README.md`
  - `references/python/fastapi-stack.md`
  - `references/python/data-modeling.md`
  - `references/python/error-handling.md`
- Skill-perspective result:
  - No deletion-only, tautological, brittle prompt, or implementation-constant-only settlement tests found in the focused stale-manual coverage.
  - The stale-manual tests cover the previous `KeyError` failure class, but they miss stale matches sharing the same active original/refund capacity axis.
  - The programming perspective is violated by a full-suite schema regression and by capacity validation using persisted manual rows without reapplying the canonical participant basis.

## Findings

### CRITICAL

- None.

### HIGH

1. `backend/tests/api/test_schema_api.py:9`

   Full backend pytest fails because the new `settlement_matches` table is imported into `Base.metadata` through `backend/app/models/__init__.py:19`, but `test_expected_tables_exist()` still asserts the old exact table set.

   Evidence:

   - Command: `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key uv run pytest -q`
   - Result: `1 failed, 257 passed, 2252 warnings in 35.60s`
   - Failure: extra item in the left table set: `settlement_matches`.

   Required before approval: update schema metadata coverage for `settlement_matches` and rerun the full backend suite.

2. `backend/app/services/settlement_match_service.py:159` and `backend/app/services/settlement_match_service.py:215`

   The stale manual-match fix filters manual rows before reconciliation/snapshot construction, so the prior `KeyError` path is fixed. However, the API write path has an independent capacity query in `_load_other_manual_allocations()`. That query sums all other `user_confirmed` settlement matches for the same original or same refund without joining participant transactions or filtering `is_deleted = false` / `merged_into_id is null`.

   A stale confirmed refund that was later deleted still consumes the original purchase capacity. A later valid confirm for the same active original and a new active refund returns `422 Settlement match has no remaining allocatable amount.` This is not the prior `KeyError`, but it means stale manual matches elsewhere can still break a settlement-match write path.

   Probe evidence:

   - Created purchase `-120000`, stale refund `120000`, and new refund `120000`.
   - Inserted `user_confirmed` match for purchase -> stale refund.
   - Soft-deleted the stale refund.
   - Called `upsert_manual_settlement_match()` for purchase -> new refund.
   - Result: `HTTPException 422 Settlement match has no remaining allocatable amount.`

   Required before approval: make `_load_other_manual_allocations()` use the same canonical participant basis as reconciliation/confirmed netting, or otherwise exclude stale manual rows from write capacity calculations. Add a regression where the stale row shares the same original or settlement side as the new write.

### MEDIUM

- None.

### LOW

1. Worktree hygiene: untracked `.DS_Store`, `.omo/.DS_Store`, `docs/.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, and many prior evidence artifacts are present. This is not the requested code-quality blocker, but they should not be committed accidentally.

2. Inherited oversized modified files remain:
   - `backend/app/services/analytics_service.py`: 1360 pure LOC
   - `backend/tests/api/test_analytics_api.py`: 1780 pure LOC
   - `backend/tests/api/test_transactions_api.py`: 777 pure LOC
   - `backend/tests/services/test_analytics_service.py`: 1952 pure LOC

   The new settlement-focused modules and tests are under the 250 pure-LOC threshold.

## Previous Blocker Recheck

- PASS for the original `KeyError` class.
- `backend/app/services/settlement_group_service.py:33` now filters manual matches to the current transaction basis before manual allocations, rejected-pair suppression, manually confirmed refund suppression, and `build_snapshots()`.
- `backend/tests/services/test_settlement_group_service_stale_manual.py:41` parametrizes stale confirmed matches where original/refund participants are deleted or merged.
- `backend/tests/api/test_settlement_match_api_stale_manual.py:40` covers PUT with a stale deleted-refund match elsewhere for `user_confirmed` and `rejected`.
- `backend/tests/api/test_settlement_match_api_unlink.py:122` covers DELETE/unlink with a stale deleted-refund match elsewhere.

## Verification

| Check | Result | Evidence |
|---|---:|---|
| Focused F2 tests | PASS | `95 passed, 857 warnings in 2.47s` |
| Full backend pytest | FAIL | `1 failed, 257 passed, 2252 warnings in 35.60s`; missing schema test update for `settlement_matches` |
| Ruff | PASS | `uv run ruff check .` -> `All checks passed!` |
| Format | PASS | `uv run ruff format --check ...22 changed/new Python files...` -> `22 files already formatted` |
| Diff check | PASS | `git diff --check` produced no output |
| Tracked diff stat | REVIEWED | `10 files changed, 1997 insertions(+), 1064 deletions(-)` |
| Stale write-path probe | FAIL | Same-original stale confirmed deleted refund still causes later confirm to return `422` |

Focused test command:

```bash
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_group_service_stale_manual.py tests/services/test_settlement_match_service.py tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py -q
```

## Pure LOC

| file | pure LOC |
|---|---:|
| `backend/app/api/v1/router.py` | 32 |
| `backend/app/models/__init__.py` | 46 |
| `backend/app/services/analytics_service.py` | 1360 |
| `backend/tests/api/test_analytics_api.py` | 1780 |
| `backend/tests/api/test_transactions_api.py` | 777 |
| `backend/tests/services/test_analytics_service.py` | 1952 |
| `backend/alembic/versions/20260627_0029_add_settlement_matches.py` | 67 |
| `backend/app/api/v1/endpoints/settlement_matches.py` | 41 |
| `backend/app/models/settlement_group.py` | 37 |
| `backend/app/schemas/settlement.py` | 22 |
| `backend/app/services/settlement_group_matching.py` | 179 |
| `backend/app/services/settlement_group_service.py` | 200 |
| `backend/app/services/settlement_match_service.py` | 216 |
| `backend/tests/api/test_settlement_match_api.py` | 177 |
| `backend/tests/api/test_settlement_match_api_errors.py` | 79 |
| `backend/tests/api/test_settlement_match_api_stale_manual.py` | 109 |
| `backend/tests/api/test_settlement_match_api_unlink.py` | 200 |
| `backend/tests/services/test_settlement_group_service.py` | 109 |
| `backend/tests/services/test_settlement_group_service_regression.py` | 193 |
| `backend/tests/services/test_settlement_group_service_regression_edges.py` | 239 |
| `backend/tests/services/test_settlement_group_service_stale_manual.py` | 101 |
| `backend/tests/services/test_settlement_match_service.py` | 158 |

## Final Status

FAIL. The stale manual-match `KeyError` blocker is fixed, but the branch cannot be approved while the full backend suite fails and stale confirmed matches can still corrupt API write capacity checks.
