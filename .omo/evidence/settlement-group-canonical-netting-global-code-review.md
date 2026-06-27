# Global Code Quality Review: settlement-group-canonical-netting

## Verdict

- result: PASS
- codeQualityStatus: WATCH
- recommendation: APPROVE
- reportPath: `.omo/evidence/settlement-group-canonical-netting-global-code-review.md`
- blockers: []

## Scope Reviewed

- Workspace: `/Users/gyurin/dev/my_ledge`
- Branch: `codex/settlement-group-canonical-netting`
- Current status: no committed branch diff from `origin/main`; review surface is the dirty working tree plus untracked files.
- Reviewed tracked source/test/docs diffs and untracked settlement implementation/test files.
- Prior evidence files were treated as untrusted context and checked against live source plus fresh commands.
- Notepad path: not provided in the task.

## Skill-Perspective Check

- Ran the required `remove-ai-slops` perspective by loading `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`.
- Ran the required `programming` perspective by loading `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`.
- Loaded relevant programming references:
  - `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/references/python/README.md`
  - `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/references/python/fastapi-stack.md`
  - `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/references/python/error-handling.md`
  - `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/references/python/data-modeling.md`
  - `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/references/code-smells.md`
- Result: no CRITICAL/HIGH/MEDIUM violations from either perspective remain. The tests are behavioral DB/API tests, not deletion-only, tautological, prompt-string, or implementation-constant-only tests. New settlement files stay under the explicit 250 pure-LOC gate.

## Findings

### CRITICAL

- None.

### HIGH

- None.

### MEDIUM

- None.

### LOW

1. `backend/app/models/settlement_group.py:34` and `backend/alembic/versions/20260627_0029_add_settlement_matches.py:19`

   `settlement_matches.status` and `matched_amount` rely on service/API validation rather than database check constraints. The project contract forbids direct DB writes and the authenticated API validates manual payloads, so this is hardening debt rather than a blocker.

2. Inherited oversized modified files remain:

   - `backend/app/services/analytics_service.py`
   - `backend/tests/api/test_analytics_api.py`
   - `backend/tests/api/test_schema_api.py`
   - `backend/tests/api/test_transactions_api.py`
   - `backend/tests/services/test_analytics_service.py`

   This is real review pressure under the `programming` perspective, but it is inherited. The new settlement source/test files are all below 250 pure LOC; largest is `backend/tests/services/test_settlement_group_service_regression_edges.py` at 239 pure LOC.

3. Worktree hygiene: untracked local artifacts remain, including `.DS_Store`, `.omo/.DS_Store`, `docs/.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, and prior evidence files. Do not stage them with the source/test/docs changes.

## Requested Focus Checks

| Check | Result | Notes |
|---|---:|---|
| Deterministic matching | PASS | `candidate_purchases()` orders candidates by score, date, and id. Multiple candidates remain `review_required`, not auto-confirmed. |
| Canonical participant guards | PASS | Confirmed analytics netting joins both participant transactions and filters type, delete/merge state, and sign. Manual confirmation rejects deleted/merged participants. |
| Stale manual match handling | PASS | Reconcile filters manual matches to current transaction basis before snapshots; allocation queries ignore stale deleted/merged participants. |
| Settlement-match API auth/validation/rollback | PASS | PUT/DELETE use `require_api_key`; schemas and service validate status, shape, amount capacity, and distinct rows; IntegrityError paths rollback and return 409. |
| Async correctness | PASS | Uses async SQLAlchemy session calls; no sync DB access or fire-and-forget work introduced. |
| Type strictness | WATCH | No `Any`, `cast`, `type: ignore`, or broad exception patterns in new settlement implementation. Some enum/literal status branches use direct `if` checks consistent with nearby project style, though stricter `match` would align better with the programming skill. |
| No oversized new settlement modules/tests | PASS | All new settlement files are under 250 pure LOC. |
| No double-netting | PASS | Purchase-gate candidates consume `settlement_refund_total` from shared analytics netting; the old independent refund matching pass was removed. |
| No raw mutation | PASS | Netting is applied to analytics row copies. A targeted scan found no `Transaction.amount` assignment in settlement/analytics changes. Raw `/transactions` behavior is covered by tests. |

## Verification

- `env UV_CACHE_DIR=/Users/gyurin/dev/my_ledge/.uv-cache DATABASE_URL=sqlite+aiosqlite:///./test.db API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service_regression_edges.py tests/services/test_settlement_group_service_stale_manual.py tests/services/test_settlement_match_service.py tests/api/test_settlement_match_api.py tests/api/test_settlement_match_api_errors.py tests/api/test_settlement_match_api_stale_manual.py tests/api/test_settlement_match_api_unlink.py tests/api/test_transactions_api.py tests/api/test_analytics_api.py tests/services/test_analytics_service.py -q`
  - Result: `97 passed, 875 warnings in 2.54s`.
- `env UV_CACHE_DIR=/Users/gyurin/dev/my_ledge/.uv-cache uv run ruff check .`
  - Result: `All checks passed!`.
- `env UV_CACHE_DIR=/Users/gyurin/dev/my_ledge/.uv-cache uv run ruff format --check <changed settlement/backend test files>`
  - Result: `23 files already formatted`.
- `git diff --check`
  - Result: clean.

## Final Status

PASS. Approval is reasonable with LOW/WATCH items for DB hardening, inherited oversized files, and untracked local artifacts. No blockers remain.
