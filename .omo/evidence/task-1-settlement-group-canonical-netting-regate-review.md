# Task 1 Settlement Group Canonical Netting Re-Gate Review

## recommendation
APPROVE

## adversarialVerify
```json
{
  "verdict": "confirmed",
  "confidence": "high",
  "blockers": [],
  "evidence": [
    "Live worktree checked on branch codex/settlement-group-canonical-netting at HEAD b37730d, origin/main b37730d.",
    "Previous blocker is fixed in code: reconcile_settlement_matches filters auto-match inputs through _is_auto_match_lifecycle_safe before splitting purchases/refunds.",
    "Lifecycle-safe rows are active or null only; non-active statuses are excluded by exact allow-list membership.",
    "Local lifecycle schema makes null compatibility safe: backend/alembic/versions/20260626_0027_add_transaction_source_lifecycle.py adds source_lifecycle_status nullable=False server_default='active', and backend/app/models/transaction.py also has nullable=False with default/server_default active.",
    "Behavior tests prove a superseded purchase and a missing_from_latest_export refund produce no groups and no stored computed matches.",
    "Malformed blank payment method and blank currency cases produce no groups and no stored computed matches; code inspection shows purchase-side blanks also fail candidate equality checks.",
    "Regression tests still cover full cancellation, partial refund, multiple partial refunds, ambiguous multiple originals, and raw signed amount preservation.",
    "Evidence artifacts now exist: task-1-settlement-group-canonical-netting-fix.md and task-1-settlement-group-canonical-netting-code-review.md.",
    "Code-review artifact explicitly covers Programming / No-Slop Checks, Pure LOC, and Overfit Review."
  ],
  "repro": [
    "cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py -q -> 9 passed, 82 warnings",
    "cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/services/test_transactions_service.py -> 30 passed, 272 warnings",
    "cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check . -> All checks passed",
    "git diff --check -> exit 0, no output",
    "cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py -q -k \"non_active or malformed or blank_currency\" -> 4 passed, 2 deselected, 37 warnings",
    "repeat same focused lifecycle/malformed probe -> 4 passed, 2 deselected, 37 warnings",
    "cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run alembic heads -> 20260627_0029 (head)",
    "cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run python -c \"from app.models import Base; table=Base.metadata.tables['settlement_matches']; print(table.name, sorted(column.name for column in table.columns), sorted(index.name for index in table.indexes))\" -> settlement_matches with expected columns and indexes"
  ]
}
```

## originalIntent
Re-gate `.omo/plans/settlement-group-canonical-netting.md` Todo 1 after the lifecycle-safety fix. Todo 1 is only the settlement grouping model/service/matching layer: original payments, full cancellations, partial refunds, multiple partial refunds, ambiguous multiple originals, status semantics, and raw signed transaction preservation. The re-gate specifically needed to verify that the previous lifecycle blocker and missing review artifact blocker were genuinely fixed without slipping into Todo 2 analytics/API/docs work.

## desiredOutcome
The user should be able to treat Todo 1 as ready: computed settlement auto-matching only uses lifecycle-safe transactions, malformed payment/currency inputs remain conservative, existing refund/cancellation acceptance paths still pass, raw transaction amount/signs stay unchanged, and evidence/code-review artifacts include Programming and no-slop/overfit coverage.

## userOutcomeReview
The lifecycle blocker is fixed for computed settlement matching. `backend/app/services/settlement_group_service.py:18-23` builds `matchable_transactions` only from transactions passing `_is_auto_match_lifecycle_safe`, and `backend/app/services/settlement_group_service.py:27-28` derives both purchases and refunds from that filtered list. The allow-list at `backend/app/services/settlement_group_service.py:160-164` admits only `TransactionSourceLifecycleStatus.ACTIVE.value` and `None`, so all named non-active statuses in `TransactionSourceLifecycleStatus` are excluded from computed auto-matching.

The behavior tests are not merely comment or implementation assertions. `backend/tests/services/test_settlement_group_service.py:134-169` creates a `superseded` purchase with an otherwise matching active refund and asserts `groups == []` plus `stored_matches == []`. `backend/tests/services/test_settlement_group_service.py:172-207` does the same for a `missing_from_latest_export` refund. Reverting the lifecycle filter would allow those rows back into candidate matching.

Null lifecycle compatibility is acceptable by local schema context even without a dedicated null fixture: `backend/alembic/versions/20260626_0027_add_transaction_source_lifecycle.py:20-29` added the column as `nullable=False` with `server_default="active"`, and `backend/app/models/transaction.py:66-70` keeps the ORM column non-null with default/server_default active. The `None` allowance is therefore a conservative legacy/backfill guard, not a normal persisted state.

Malformed payment/currency remains conservative. `backend/app/services/settlement_group_matching.py:31-34` returns no candidates when refund payment method or currency normalizes to `None`; purchase-side blanks also fail the equality checks at `backend/app/services/settlement_group_matching.py:47-50`. Tests at `backend/tests/services/test_settlement_group_service.py:210-244` and `backend/tests/services/test_settlement_group_service.py:247-282` prove blank payment method and blank currency cases create no groups or stored matches.

The broader Todo 1 behavior still passes: full cancellation and netting map at `backend/tests/services/test_settlement_group_service.py:49-92`, partial refund at `backend/tests/services/test_settlement_group_service.py:95-131`, multiple partial refunds at `backend/tests/services/test_settlement_group_service_regression.py:93-139`, ambiguous originals at `backend/tests/services/test_settlement_group_service_regression.py:142-192`, and raw signed amount preservation at `backend/tests/services/test_settlement_group_service_regression.py:41-90`.

No Todo 2 analytics/API/docs implementation drift was observed in changed settlement files. The live status shows the new Todo 1 implementation files are still untracked plus one tracked model registration edit; unrelated `.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, and prior evidence artifacts remain untouched.

## blockers
None.

## checkedArtifactPaths
- `AGENTS.md`
- `backend/app/AGENTS.md`
- `backend/tests/AGENTS.md`
- `.omo/plans/settlement-group-canonical-netting.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting-gate-review.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting-fix.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting-code-review.md`
- `backend/alembic/versions/20260626_0027_add_transaction_source_lifecycle.py`
- `backend/alembic/versions/20260627_0029_add_settlement_matches.py`
- `backend/app/models/__init__.py`
- `backend/app/models/settlement_group.py`
- `backend/app/models/transaction.py`
- `backend/app/services/settlement_group_matching.py`
- `backend/app/services/settlement_group_service.py`
- `backend/app/services/transaction_source_lifecycle_service.py`
- `backend/app/services/upload_apply_service.py`
- `backend/tests/services/test_settlement_group_service.py`
- `backend/tests/services/test_settlement_group_service_regression.py`

## liveWorktree
- `git status --short --branch`: `## codex/settlement-group-canonical-netting`; tracked modified `backend/app/models/__init__.py`; untracked settlement migration/model/services/tests/evidence plus unrelated `.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, and prior evidence artifacts.
- `git diff --stat`: only tracked diff is `backend/app/models/__init__.py | 3 +++`; the settlement implementation files are untracked and were inspected directly.
- `git rev-parse --short HEAD`: `b37730d`
- `git rev-parse --short origin/main`: `b37730d`

## slopOverfitReview
Direct `remove-ai-slops` and `programming` pass over production, tests, and reports:
- No deletion-only tests, tests that merely prove a requested removal, tautological mocks, or implementation-mirroring private-helper assertions found.
- Tests exercise observable service outputs and stored DB rows (`groups`, `stored_matches`, raw transaction response amounts, statuses, IDs, totals).
- No `Any`, `cast`, `type: ignore`, broad exception handling, debug prints, raw SQL, or added sync DB access in changed production files.
- Pure LOC: settlement service 144, matching 172, model 37, migration 67, main service test 246, regression test 174, model `__init__` 46. No changed file exceeds the 250 pure LOC defect threshold.
- The code-review artifact supports the same perspective: it contains `Programming / No-Slop Checks`, `Pure LOC`, and `Overfit Review`, and states that tests are behavior-based, lifecycle tests cover two distinct non-active statuses, malformed inputs cover two shapes, and Todo 1 scope was not broadened.
- Non-blocking smell noted: `candidate_purchases` has five keyword-only inputs, but the inputs are cohesive matching state and no speculative abstraction was introduced. This does not create false confidence or scope drift for the lifecycle fix.

## adversarialClasses
- `stale_state`: verified current live branch/status/diff; untracked settlement files were read directly because `git diff --name-status` only reports the tracked `models/__init__.py` edit.
- `dirty_worktree`: noted unrelated untracked files and left them untouched.
- `misleading_success_output`: inspected source lines and assertions, not only command exits.
- `malformed_input`: verified tests and code for blank payment method/currency; purchase-side malformed values are conservative by source inspection.
- `flaky_tests`: reran the focused lifecycle/malformed subset twice; both runs passed.
- `long_commands`: all commands were bounded foreground invocations and completed.
- `prompt_injection`: N/A; no external promptable content was executed as instructions.
- `cancel_resume`: N/A; this review did not resume an interrupted state machine or alter execution state.
- `repeated_interruptions`: N/A; no interruption occurred during verification.

## evidenceGaps
- No blocking evidence gaps remain.
- Residual non-blocking risk: `build_confirmed_refund_netting_map()` trusts stored confirmed matches and does not itself join back to lifecycle-safe transactions. Todo 1's lifecycle fix is valid for computed matching because `reconcile_settlement_matches()` deletes and recomputes computed matches, but Todo 2 integration should either call reconciliation before analysis use or add lifecycle-safe guarding at the analysis/netting boundary.
