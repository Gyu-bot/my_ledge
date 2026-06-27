# F2 Code Quality Regate: settlement-group-canonical-netting

## Verdict

- result: PASS
- codeQualityStatus: WATCH
- recommendation: APPROVE
- reportPath: `.omo/evidence/settlement-group-canonical-netting-f2-regate.md`
- blockers: []

## Scope Reviewed

- Goal: re-run F2 code quality after API, canonical participant guard, and format fixes.
- Previous blocker: confirmed settlement netting must ignore matches whose original/refund participants are deleted, merged, or outside the documented canonical analytics basis.
- Changed/new implementation reviewed:
  - `backend/alembic/versions/20260627_0029_add_settlement_matches.py`
  - `backend/app/api/v1/endpoints/settlement_matches.py`
  - `backend/app/api/v1/router.py`
  - `backend/app/models/__init__.py`
  - `backend/app/models/settlement_group.py`
  - `backend/app/schemas/settlement.py`
  - `backend/app/services/analytics_service.py`
  - `backend/app/services/settlement_group_matching.py`
  - `backend/app/services/settlement_group_service.py`
  - `backend/app/services/settlement_match_service.py`
  - settlement/analytics/transactions API and service tests
  - settlement API/agent docs and OMO plan status
- Notepad path: not provided in prompt. Existing evidence consulted:
  - `.omo/evidence/settlement-group-canonical-netting-f2-code-quality.md`
  - `.omo/evidence/settlement-group-canonical-netting-f1-f2-fix.md`

## Skill-Perspective Check

- Ran `remove-ai-slops` perspective by loading `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`.
- Ran `programming` perspective by loading `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`.
- Loaded Python reference plus relevant FastAPI/data-modeling/error/type guidance:
  - `references/python/README.md`
  - `references/python/fastapi-stack.md`
  - `references/python/data-modeling.md`
  - `references/python/error-handling.md`
  - `references/python/type-patterns.md`
- Skill result:
  - No CRITICAL/HIGH slop, overfit test, brittle prompt-test, untyped escape-hatch, or needless production parsing issue found in the settlement API/service diff.
  - Minor programming-perspective violations remain as LOW findings: one new test file is just over the 250 pure-LOC threshold, and the new DB table relies on service validation rather than DB check constraints.

## Findings

### CRITICAL

- None.

### HIGH

- None.

### MEDIUM

- None.

### LOW

1. `backend/tests/services/test_settlement_group_service.py:1` - This new test file measures 254 pure LOC, slightly above the `programming` skill's 250 pure-LOC threshold. The tests are behavior-relevant and not tautological, so this is not approval-blocking, but the next settlement-service test addition should split the file by responsibility.

2. `backend/app/models/settlement_group.py:42` and `backend/alembic/versions/20260627_0029_add_settlement_matches.py:19` - `settlement_matches.status` and `matched_amount` are not protected by DB check constraints. The public API/service validates status, signs, canonical participant state, and allocation capacity, and direct DB writes are forbidden by repo contract, so this is a hardening item rather than a blocker.

3. Worktree hygiene: `.DS_Store`, `.omo/.DS_Store`, `docs/.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, and many older evidence artifacts are untracked. Not a code-quality blocker for this regate, but branch cleanup should avoid accidentally committing local/generated files.

## Previous Blocker Recheck

- Fixed. `backend/app/services/settlement_group_service.py:150` now loads confirmed matches by joining both participant `Transaction` aliases.
- The confirmed read path filters:
  - settlement status in `auto_confirmed`, `user_confirmed`
  - original transaction `type == "지출"`, not deleted, not merged, negative amount
  - settlement/refund transaction `type == "지출"`, not deleted, not merged, positive amount
- Regression coverage exists at `backend/tests/services/test_settlement_group_service_regression.py:221`, parametrizing deleted original, deleted refund, merged original, and merged refund. It asserts both confirmed netting maps stay empty.
- Manual API validation also rejects deleted/merged participant confirmation at `backend/app/services/settlement_match_service.py:192`, covered by `backend/tests/api/test_settlement_match_api.py:279`.

## API / Service Review

- Auth: both write routes use `dependencies=[Depends(require_api_key)]` in `backend/app/api/v1/endpoints/settlement_matches.py:15` and `:32`; PUT unauthorized behavior is covered in `test_put_settlement_match_requires_api_key_and_preserves_raw_signed_transactions`.
- Async behavior: endpoints are async, services use `AsyncSession`, `await db_session.flush()`, and the shared reconcile service commits after recomputing computed matches.
- Validation: `SettlementMatchUpsertRequest` uses Pydantic field constraints and status/matched_amount validator; service validates distinct rows, expense type/sign shape, canonical participant state, remaining allocation, and conflicts.
- Rollback: `IntegrityError` paths call rollback and translate to `409`; targeted service test covers rollback invocation. Other validation failures occur before flush/commit and do not persist writes through the request session.
- Raw preservation: API tests assert `/api/v1/transactions` keeps original signed purchase/refund rows while analytics consumes settlement-netted economics.
- Scope control: no broad budget/forecast/frontend work was added; docs were limited to API/agent settlement semantics.

## Slop / Overfit Review

- No deletion-only tests, tests that merely verify a requested removal, prompt-string tests, or tautological implementation-constant tests found.
- Settlement tests assert observable behavior through HTTP responses, DB rows, analytics totals, and service return values.
- The rollback test uses monkeypatching, but it is narrowly scoped to an error path the API cannot easily force and is backed by higher-level behavior tests.
- Targeted escape-hatch search found only a pre-existing broad `except Exception` in `backend/app/services/analytics_service.py:1082`, blamed to `c40f221d` and not introduced by this diff.

## Verification

- Targeted pytest:
  - Command: `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/api/test_settlement_match_api.py tests/services/test_settlement_match_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_group_service.py tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py -q`
  - Result: `88 passed, 794 warnings in 2.12s`
  - Warnings are pytest-asyncio/Python 3.14 deprecations plus one pre-existing FastAPI status constant deprecation.
- Lint:
  - Command: `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .`
  - Result: `All checks passed!`
- Diff hygiene:
  - Command: `git diff --check`
  - Result: clean.
- Format:
  - Command: `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff format --check app/api/v1/router.py app/models/__init__.py app/services/analytics_service.py app/api/v1/endpoints/settlement_matches.py app/models/settlement_group.py app/schemas/settlement.py app/services/settlement_group_matching.py app/services/settlement_group_service.py app/services/settlement_match_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/api/test_settlement_match_api.py tests/services/test_analytics_service.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py tests/services/test_settlement_match_service.py alembic/versions/20260627_0029_add_settlement_matches.py`
  - Result: `17 files already formatted`
  - Repository-wide `ruff format --check .` still fails on 46 unrelated pre-existing files outside this settlement diff, so I did not treat that as a blocker for this regate.

## Final Status

PASS. The previous F2 blocker is fixed and covered by focused regression tests. Approval is reasonable with WATCH for minor file-size/hardening/worktree-hygiene follow-ups.
