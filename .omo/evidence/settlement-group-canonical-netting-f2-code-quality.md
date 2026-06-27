# F2 Code Quality Review: settlement-group-canonical-netting

## Status

- codeQualityStatus: BLOCK
- recommendation: REQUEST_CHANGES
- result: FAIL
- reportPath: `.omo/evidence/settlement-group-canonical-netting-f2-code-quality.md`

## Scope Reviewed

- Root and child rules read: `AGENTS.md`, `backend/app/AGENTS.md`, `backend/tests/AGENTS.md`, `docs/AGENTS.md`.
- Required skill-perspective check ran:
  - `omo:remove-ai-slops` loaded from `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`.
  - `omo:programming` loaded from `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`.
  - Python reference loaded from `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/references/python/README.md`.
- Current diff reviewed, including untracked implementation files:
  - `backend/alembic/versions/20260627_0029_add_settlement_matches.py`
  - `backend/app/models/settlement_group.py`
  - `backend/app/services/settlement_group_matching.py`
  - `backend/app/services/settlement_group_service.py`
  - `backend/app/services/analytics_service.py`
  - modified API/service tests and docs.

## Findings

### CRITICAL

- None.

### HIGH

1. `backend/app/services/settlement_group_service.py:149` - `backend/app/services/analytics_service.py:1121`

   Confirmed settlement netting ignores canonical transaction visibility for the matched participants. `_load_confirmed_matches()` selects `SettlementMatch` rows by status only (`auto_confirmed`, `user_confirmed`) and does not join the original/refund `Transaction` rows or apply `is_deleted = false` / `merged_into_id is null`. `_load_analytics_transactions()` first loads canonical transaction rows, then applies this unfiltered match map.

   This can understate or misattribute analytics after normal transaction lifecycle operations. Example: if a confirmed refund row is later soft-deleted, canonical analytics no longer includes that refund row, but `build_confirmed_settlement_analysis_netting()` will still add its `matched_amount` back to the purchase and lower expense. If the original purchase is deleted/merged but the refund remains, the refund can be suppressed even though its original is absent. The repo has soft-delete and bulk-delete paths at `backend/app/services/transactions_service.py:379` and `backend/app/services/transactions_service.py:413`, so this is reachable, not theoretical.

   Required before approval: build the confirmed netting map from matches whose original and settlement transactions are both eligible for the same analytics/canonical basis, or invalidate/ignore matches when either participant is deleted/merged. Add regression coverage for deleted refund, deleted original, and merged participant cases.

### MEDIUM

1. `backend/app/services/settlement_group_service.py:106`

   Lifecycle safety is only enforced while creating computed matches. Once a match is persisted, the analytics read path trusts it without checking participant lifecycle status. If the intended T032 safety contract is active-only settlement economics, confirmed reads need the same participant predicate as auto-matching or an explicit documented reason why `missing_from_latest_export` / `superseded` confirmed matches remain valid.

2. `backend/app/models/settlement_group.py:42`

   `settlement_matches.status` is persisted as a plain string without a database check constraint, and `matched_amount` has no positivity/capacity constraint. The service currently writes valid constants, but analytics directly trusts persisted rows. This is not the blocking defect above, but it increases regression risk once manual confirmation/rejection APIs exist.

### LOW

1. Changed code adds to already oversized files:
   - `backend/app/services/analytics_service.py`: 1360 pure LOC
   - `backend/tests/services/test_analytics_service.py`: 1924 pure LOC
   - `backend/tests/api/test_analytics_api.py`: 1729 pure LOC
   - `backend/tests/api/test_transactions_api.py`: 764 pure LOC

   This violates the `programming` skill's 250 pure LOC preference, but the debt is largely inherited and the new settlement-specific modules are below threshold. Treat as future refactor pressure, not the immediate blocker for this F2 wave.

2. Untracked local/generated files are present in the working tree: `.DS_Store`, `.omo/.DS_Store`, `docs/.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`. These are scope hygiene issues if the branch is prepared for commit, but not code correctness blockers.

## Slop / Overfit Review

- No deletion-only tests or tests that merely verify a requested removal were found.
- New tests mostly assert observable service/API behavior using real DB sessions, not implementation-only mocks.
- No banned `object` / `Any` / `cast()` / ignore annotations were found in the changed Python implementation/test files by targeted search.
- The `TypedDict` parsing in `analytics_service.py` is justified by strict typing and avoids the earlier `object` annotation issue.
- The missing deleted/merged participant tests are a real coverage gap because they would catch the HIGH finding.

## Verification Run

- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py -q`
  - Result: `78 passed, 704 warnings in 1.90s`.
- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .`
  - Result: `All checks passed!`.
- `git diff --check`
  - Result: clean.
- `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run python -c "from app.models import Base; print('settlement_matches' in Base.metadata.tables)"`
  - Result: `True`.
- Docker state inspection was attempted but blocked by Docker socket permissions. No Docker containers or local services were started or changed.

## Blockers

- Fix confirmed settlement netting so it cannot apply matches whose original/refund transactions are excluded from the canonical analytics basis by deleted or merged state.
- Add focused regression tests for those participant visibility cases.
