# Task 1 Settlement Group Canonical Netting Gate Review

## recommendation
REJECT

## originalIntent
Independently verify the DoneClaim for `.omo/plans/settlement-group-canonical-netting.md` Todo 1: add settlement grouping storage/service/matching for original payments, full cancellations, partial refunds, multiple partial refunds, and ambiguous multiple originals while preserving raw transaction signs and staying within Todo 1 scope.

## desiredOutcome
The shipped Todo 1 artifact should provide a trustworthy backend settlement matching layer with consistent Alembic/model wiring, deterministic conservative matching, clear status semantics (`auto_confirmed`, `review_required`, `user_confirmed`, `rejected` or equivalent), sufficient tests for the acceptance criteria and adversarial classes, and no broad analytics/API/docs Todo 2 or Todo 3 drift.

## userOutcomeReview
The core happy paths pass in fresh test runs: full cancellation, partial refund, multiple partial refunds, ambiguous multiple originals, and raw signed transaction preservation are covered by `backend/tests/services/test_settlement_group_service.py`.

The result is not ready to approve because the live implementation does not account for transaction source lifecycle state when choosing settlement candidates, even though this Todo is explicitly downstream of T030/T031 source lifecycle/reconciliation work. A stale, superseded, missing, duplicate, or ambiguous transaction can enter `_load_transactions()` as long as it is a non-deleted, non-merged expense row. There is no test or documented conservative gap for this.

The required independent code-review artifact is also absent. The only settlement evidence file found is `.omo/evidence/task-1-settlement-group-canonical-netting.md`; no settlement code-review/review artifact exists under `.omo/evidence/`. Per gate protocol, absent review coverage for the same programming and overfit/slop criteria is a blocker.

## blockers
1. Missing source lifecycle safety in matcher.
   - `backend/app/services/settlement_group_service.py:104-112` loads settlement candidate transactions with filters for `type == "지출"`, `is_deleted == false`, `merged_into_id is None`, and nonzero amount, but does not filter `Transaction.source_lifecycle_status`.
   - `Implentation-plan.md:719-733` marks T030 source lifecycle complete and defines statuses such as `active`, `missing_from_latest_export`, `source_changed`, `superseded`, `duplicate_candidate`, and `ambiguous`.
   - `.omo/plans/settlement-group-canonical-netting.md` says Todo 1 is blocked by `transaction-source-upload-reconciliation` and should match with existing-link/source-lineage safety.
   - `backend/tests/services/test_settlement_group_service.py` has no `source_lifecycle_status` fixture or assertion, confirmed by `rg -n "source_lifecycle_status" backend/tests/services/test_settlement_group_service.py` returning no matches.

2. Missing required code-review artifact coverage.
   - `find .omo/evidence -maxdepth 1 -type f \( -name '*settlement-group-canonical-netting*code-review*.md' -o -name '*settlement-group-canonical-netting*review*.md' \) -print | sort` returned no files.
   - Direct slop/overfit pass found no obvious excessive abstraction, deletion-only tests, tautological removal tests, or oversized changed production modules, but the separate report coverage required by the gate is absent.

## checkedArtifactPaths
- `AGENTS.md`
- `backend/app/AGENTS.md`
- `backend/tests/AGENTS.md`
- `.omo/plans/settlement-group-canonical-netting.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting.md`
- `Implentation-plan.md`
- `backend/alembic/versions/20260627_0029_add_settlement_matches.py`
- `backend/app/models/__init__.py`
- `backend/app/models/settlement_group.py`
- `backend/app/services/settlement_group_matching.py`
- `backend/app/services/settlement_group_service.py`
- `backend/tests/services/test_settlement_group_service.py`
- `backend/app/models/transaction.py`
- `backend/app/services/transaction_source_lifecycle_service.py`
- `backend/tests/services/test_transaction_source_lifecycle_service.py`

## commandEvidence
- `git status --short --branch`
  - `## codex/settlement-group-canonical-netting`
  - tracked modified: `backend/app/models/__init__.py`
  - untracked implementation/evidence files include the claimed settlement migration/model/services/tests and many pre-existing `.omo/evidence/transaction-source-upload-reconciliation*` files plus `.DS_Store` files.
- `git rev-parse --short HEAD` and `git rev-parse --short origin/main`
  - both `b37730d`; current branch is based on current available `origin/main`.
- `git diff --name-status HEAD`
  - only tracked diff: `M backend/app/models/__init__.py`; claimed new implementation files are untracked and were inspected directly.
- `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py -q`
  - `5 passed, 46 warnings in 0.15s`
- `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/services/test_transactions_service.py`
  - `30 passed, 272 warnings in 0.76s`
- `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .`
  - `All checks passed!`
- `git diff --check`
  - no output, exit 0
- Repeated focused flaky probe, run twice:
  - `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py::test_reconcile_settlement_matches_auto_confirms_full_cancellation -q`
  - each run: `1 passed, 10 warnings`
- `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run alembic heads`
  - `20260627_0029 (head)`
- `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run python -c "from app.models import Base; t=Base.metadata.tables['settlement_matches']; print(t.name, sorted(c.name for c in t.columns), sorted(i.name for i in t.indexes))"`
  - `settlement_matches ['created_at', 'id', 'matched_amount', 'matched_at', 'original_transaction_id', 'settlement_transaction_id', 'status', 'updated_at'] ['idx_settlement_matches_settlement_transaction_id', 'idx_settlement_matches_status']`
- Pure LOC check:
  - migration: 67
  - `backend/app/models/settlement_group.py`: 37
  - `backend/app/services/settlement_group_matching.py`: 172
  - `backend/app/services/settlement_group_service.py`: 134
  - `backend/tests/services/test_settlement_group_service.py`: 249
  - `backend/app/models/__init__.py`: 46

## acceptanceReview
- Full cancellation: covered and passing at `backend/tests/services/test_settlement_group_service.py:92-135`.
- Partial refund: covered and passing at `backend/tests/services/test_settlement_group_service.py:138-174`.
- Multiple partial refunds: covered and passing at `backend/tests/services/test_settlement_group_service.py:177-223`.
- Multiple candidate originals: covered and passing at `backend/tests/services/test_settlement_group_service.py:226-277`; persisted matches are `review_required`, not `auto_confirmed`.
- Raw `Transaction.amount` sign preservation: covered by `backend/tests/services/test_settlement_group_service.py:40-89`.
- Status values: present in `backend/app/models/settlement_group.py:10-15`, and model metadata import is wired through `backend/app/models/__init__.py:19,42-43`.
- Alembic/model registration: local static checks pass, but `alembic upgrade head` was not run to avoid changing the shared local database.
- Scope drift: no broad analytics API/docs/Todo 2/Todo 3 production changes observed in the claimed Todo 1 implementation.

## adversarialClasses
- stale_state: checked live branch/status/diff and directly inspected untracked claimed files.
- dirty_worktree: noted unrelated untracked files and did not overwrite them.
- misleading_success_output: inspected assertions and source code, not just exit codes.
- malformed_input: code skips missing/blank payment method or currency in `candidate_purchases()`, but there is no regression test for that malformed class.
- flaky_tests: focused full-cancellation test rerun twice and passed both times.
- long_commands: commands were bounded and completed.
- prompt_injection: N/A, no external untrusted content was executed as instructions.
- cancel_resume: N/A, no resumable workflow was introduced by Todo 1.
- repeated_interruptions: N/A, no interrupted command required resume handling.

## slopOverfitReview
Direct `remove-ai-slops` pass over changed production/tests found:
- No deletion-only tests or tests merely proving a removal.
- No obvious tautological mocks; tests use real service/database fixture objects.
- No oversized changed source files over 250 pure LOC.
- No broad `except Exception`, `Any`, `type: ignore`, or debug prints in changed production files.
- Remaining coverage gap: no regression test for lifecycle-filter safety and no test for missing payment/currency malformed matching.
- Required separate code-review artifact coverage is absent, which independently blocks approval.

## evidenceGaps
- No settlement code-review artifact proving programming-skill and overfit/slop criterion coverage.
- No test or evidence that stale/superseded/missing/duplicate/ambiguous transaction lifecycle rows are excluded from auto settlement matching or deliberately handled.
- No direct malformed-input test for missing/blank payment method or currency, though the code path appears conservative by inspection.
