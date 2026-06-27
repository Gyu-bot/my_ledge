# Task 2 Settlement Group Canonical Netting Gate Review

## recommendation
REJECT

## adversarialVerify
```json
{
  "verdict": "needs-fix",
  "confidence": "high",
  "blockers": [
    "Unauthenticated analytics GET/read paths now write settlement_matches rows by deleting and recomputing computed settlement matches.",
    "review_required and rejected settlement refunds are excluded from analytics totals even though they are not confirmed settlement economics, which contradicts current positive-expense refund semantics and can overstate spend.",
    "No Todo 2 code-review/no-slop artifact exists, and direct programming/remove-ai-slops pass found unresolved slop coverage gaps."
  ],
  "evidence": [
    "backend/app/services/analytics_service.py:1060-1086 calls build_settlement_analysis_netting from the shared analytics loader used by monthly/category/merchant and other analytics surfaces.",
    "backend/app/services/settlement_group_service.py:116-138 calls reconcile_settlement_matches, which deletes computed matches, adds new computed matches, and commits at lines 31-89.",
    "backend/app/api/v1/endpoints/analytics.py:46-115 exposes monthly/category/fixed/merchant analytics GET routes without require_api_key dependencies.",
    "docs/backend-api-ssot.md:21-33 classifies most read-only endpoints as unauthenticated and lists API-key-required endpoints separately.",
    "In-memory service probe printed before=0, after=1 settlement_matches after get_monthly_cashflow, proving read-path mutation.",
    "backend/app/services/settlement_group_service.py:124-133 adds refund ids from all snapshots, including review_required snapshots, plus rejected manual matches to excluded_refund_transaction_ids.",
    "backend/app/services/analytics_service.py:1127-1131 zeros and drops every excluded refund row.",
    "Ambiguous two-purchase probe produced expense=2000 with two review_required matches, where current documented raw positive-expense semantics would reduce spend to 1800.",
    "docs/backend-api-and-metrics-reference.md:1460-1464 says positive type='지출' refund/cancellation rows reduce monthly expense.",
    "find .omo/evidence -maxdepth 1 -type f -name '*settlement-group-canonical-netting*' shows no Task 2 code-review artifact, only Task 2 evidence."
  ],
  "repro": [
    "cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py -q -> 75 passed, 677 warnings",
    "cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check . -> All checks passed",
    "git diff --check -> exit 0, no output",
    "focused settlement analytics probes rerun twice -> 5 passed, 46 warnings each run",
    "read-mutation probe -> {'before': 0, 'after': 1, 'items': [{'period': '2026-01', 'income': 0, 'expense': 800, 'transfer': 0, 'net_cashflow': -800, 'savings_rate': None}]}",
    "review-required probe -> {'items': [{'period': '2026-01', 'income': 0, 'expense': 2000, 'transfer': 0, 'net_cashflow': -2000, 'savings_rate': None}], 'matches': [('review_required', 1, 3), ('review_required', 2, 3)]}"
  ],
  "blockers": [
    "Read-path mutation must be removed, explicitly authenticated, or moved behind an established write/reconciliation path before analytics GETs can depend on persisted computed matches.",
    "Analytics netting should only drop refund rows when the refund is confirmed into a settlement group. review_required/rejected rows need a documented and tested raw-basis behavior that does not overstate spend.",
    "Todo 2 needs a code-review/no-slop report with programming and remove-ai-slops coverage, or equivalent supported evidence, before approval."
  ]
}
```

## originalIntent
Independently verify the DoneClaim for `.omo/plans/settlement-group-canonical-netting.md` Todo 2: integrate Todo 1 settlement netting into analytics surfaces so monthly/category/merchant analysis and purchase-gate behavior use shared settlement metadata, confirmed refunds affect original transaction economics, raw transaction rows remain signed, rejected settlements do not incorrectly net, and no docs/frontend/forecasting/source-lifecycle scope creeps in.

## desiredOutcome
The user should receive a trustworthy settlement-netted analytics integration: confirmed settlement groups change analysis totals exactly once, unconfirmed or rejected statuses stay conservative and consistent with current raw/refund semantics, read-only GET endpoints do not perform hidden unauthenticated writes, raw `/transactions` responses remain signed, and evidence includes real tests plus code-review/no-slop coverage.

## userOutcomeReview
Some claimed behavior is confirmed. Monthly and merchant analytics use the shared loader and the added service tests prove confirmed partial refunds lower those totals. The purchase-gate path no longer runs the old local refund matcher and uses `settlement_refund_total` from the shared loader, so the focused no-double-net test passes. The `/transactions` API still returns raw signed rows after an analytics call.

The shipped artifact is not approvable because analytics reads now mutate the database. `_load_analytics_transactions()` calls `build_settlement_analysis_netting()` for every non-empty analytics query. That function calls `reconcile_settlement_matches()`, which deletes computed settlement rows, inserts recomputed rows, and commits. The affected analytics GET routes are not API-key protected. This conflicts with the repo contract that read-only endpoints are generally unauthenticated while write surfaces require `X-API-Key`.

The implementation also treats unconfirmed `review_required` and manually `rejected` refunds as refund rows to exclude from analytics. For ambiguous matches, this drops the positive refund row while not netting it to an original purchase. The result overstates spend compared with the current documented rule that positive expense refund/cancellation rows reduce monthly expense. The existing rejected test locks this new behavior by expecting `300` instead of the prior raw-signed `200`, but that assertion is not supported by the current docs or Todo 2 wording.

## blockers
1. Hidden unauthenticated DB write on analytics GET.
   - `backend/app/services/analytics_service.py:1060-1086` calls settlement netting inside the shared analytics loader.
   - `backend/app/services/settlement_group_service.py:31-89` deletes computed matches, adds recomputed matches, and commits.
   - `backend/app/api/v1/endpoints/analytics.py:46-115` exposes monthly/category/fixed/merchant GET routes without `require_api_key`.
   - `docs/backend-api-ssot.md:21-33` separates unauthenticated read-only endpoints from API-key write surfaces.
   - In-memory probe confirmed `settlement_matches` row count changed from `0` to `1` during `get_monthly_cashflow()`.

2. Unconfirmed settlement statuses alter spend totals as if the refund should disappear.
   - `backend/app/services/settlement_group_service.py:124-133` adds all snapshot refund IDs, including `review_required`, plus rejected manual refunds to `excluded_refund_transaction_ids`.
   - `backend/app/services/analytics_service.py:1127-1131` zeros and drops every excluded refund row.
   - Probe with two possible originals and one refund produced two `review_required` matches and monthly `expense=2000`; under existing positive-expense semantics, the raw signed total would be `1800`.
   - `docs/backend-api-and-metrics-reference.md:1460-1464` currently says positive `지출` refunds/cancellations reduce monthly expense.

3. Required Task 2 review/slop coverage is missing.
   - `find .omo/evidence -maxdepth 1 -type f -name '*settlement-group-canonical-netting*' -print` shows no Task 2 code-review artifact.
   - `.omo/evidence/task-2-settlement-group-canonical-netting.md` records test runs but does not cover Programming, Pure LOC, Overfit Review, or remove-ai-slops criteria.
   - Direct pass found modified `backend/app/services/analytics_service.py` is 1305 pure LOC and the modified analytics test files are also far above 250 pure LOC. Existing size debt may be inherited, but Todo 2 added more behavior to those modules without a split plan or explicit exception.

## checkedArtifactPaths
- `AGENTS.md`
- `backend/app/AGENTS.md`
- `backend/tests/AGENTS.md`
- `.omo/plans/settlement-group-canonical-netting.md`
- `.omo/evidence/task-2-settlement-group-canonical-netting.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting-code-review.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting-regate-review.md`
- `backend/app/api/v1/endpoints/analytics.py`
- `backend/app/api/v1/endpoints/transactions.py`
- `backend/app/services/analytics_service.py`
- `backend/app/services/settlement_group_service.py`
- `backend/app/services/settlement_group_matching.py`
- `backend/app/models/settlement_group.py`
- `backend/app/models/__init__.py`
- `backend/alembic/versions/20260627_0029_add_settlement_matches.py`
- `backend/tests/services/test_analytics_service.py`
- `backend/tests/api/test_analytics_api.py`
- `backend/tests/api/test_transactions_api.py`
- `backend/tests/services/test_settlement_group_service.py`
- `backend/tests/services/test_settlement_group_service_regression.py`
- `docs/backend-api-ssot.md`
- `docs/backend-api-and-metrics-reference.md`
- `docs/agents/canonical-read-surface-reference.md`

## commandEvidence
- `git --no-optional-locks status --short --branch`
  - branch: `codex/settlement-group-canonical-netting`
  - tracked modified: `.omo/plans/settlement-group-canonical-netting.md`, `backend/app/models/__init__.py`, `backend/app/services/analytics_service.py`, `backend/tests/api/test_analytics_api.py`, `backend/tests/api/test_transactions_api.py`, `backend/tests/services/test_analytics_service.py`
  - untracked relevant files: settlement migration/model/matching/service/tests/evidence
  - unrelated untracked files noted and left untouched: `.DS_Store`, `.omo/.DS_Store`, `.omo/boulder.json`, `.omo/start-work/`, `docs/.DS_Store`
- `git --no-optional-locks log --oneline --decorate --max-count=8 --all`
  - HEAD, `origin/main`, and local `main` all point at `b37730d`.
- `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py -q`
  - `75 passed, 677 warnings in 2.55s`
- `UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache uv run ruff check .`
  - `All checks passed!`
- `git --no-optional-locks diff --check`
  - exit 0, no output
- Focused analytics probes rerun twice:
  - `test_get_monthly_cashflow_uses_confirmed_settlement_net_amount`
  - `test_get_merchant_spend_uses_confirmed_settlement_net_amount`
  - `test_category_mom_endpoint_keeps_rejected_settlement_unnetted`
  - `test_purchase_gate_candidates_use_net_amount_for_partial_refunds`
  - `test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis`
  - both runs: `5 passed, 46 warnings`

## acceptanceReview
- Monthly confirmed partial refund: covered by `backend/tests/services/test_analytics_service.py:193-250` and API equivalent. Passes.
- Merchant confirmed partial refund: covered by `backend/tests/services/test_analytics_service.py:765-825` and API equivalent. Passes.
- Category analysis uses shared loader by code inspection, but there is no positive confirmed category-specific test. The rejected category test exists at `backend/tests/services/test_analytics_service.py:368-430`, but it locks behavior that appears inconsistent with current docs.
- Purchase-gate no-double-net: covered by `backend/tests/api/test_analytics_api.py:399-445`. Passes.
- Raw `/transactions` signed rows: covered by `backend/tests/api/test_transactions_api.py:174-221`. Passes.
- Lifecycle-safe computed matches: Todo 1 regression remains present and passing. Todo 2 calls reconciliation before analysis, so stale computed auto/review rows are deleted and recomputed.
- Read-path side effect: not acceptable as shipped. It is real and unauthenticated.
- Docs drift: Todo 3 docs are not required yet, but current docs still state positive expense refund rows reduce monthly expense. The new unconfirmed/rejected exclusion behavior contradicts that.
- Scope: no frontend/forecasting/source-lifecycle implementation drift observed. However, the shared loader changes more analytics endpoints than the claimed monthly/category/merchant scope, with no dedicated docs/tests for fixed-cost, payment-method, recurring, anomalies, or velocity surfaces.

## adversarialClasses
- `stale_state`: checked live branch, status, diffs, untracked files, and current HEAD/origin-main relationship.
- `dirty_worktree`: noted unrelated untracked files and did not modify them.
- `malformed_input`: Todo 1 malformed lifecycle/payment/currency tests remain passing; Todo 2 lacks unconfirmed-status analytics tests.
- `flaky_tests`: focused Todo 2 probes rerun twice and passed both times.
- `misleading_success_output`: inspected service code and added one-off probes instead of trusting green tests.
- `long_commands`: all commands were bounded foreground invocations.
- `prompt_injection`: N/A.
- `cancel_resume`: N/A.
- `repeated_interruptions`: N/A.

## slopOverfitReview
Direct `remove-ai-slops` and `programming` pass:
- No deletion-only tests or tests that merely assert a removal were found.
- No obvious tautological mocks were found; tests use real service/API fixtures and DB sessions.
- Test coverage is too narrow for the status matrix: confirmed and rejected are tested, but review-required analytics behavior is untested and currently wrong by contract.
- The rejected-settlement test appears overfit to the implementation's decision to hide the refund row, rather than to a documented raw/unconfirmed basis.
- No Task 2 code-review report exists to independently cover Programming, Pure LOC, and Overfit Review.
- Modified `analytics_service.py` and analytics test modules are oversized by the loaded skill's criteria; no split plan, exception, or targeted module extraction accompanies this behavior expansion.

## evidenceGaps
- No Task 2 code-review/no-slop artifact.
- No test that analytics GETs are read-only, or an explicit authenticated write contract if reconciliation is intentionally persisted.
- No test for `review_required` analytics totals. The probe shows current behavior overstates spend.
- No documented basis for excluding `rejected` refund rows from analytics rather than preserving current positive-expense raw netting.
- No docs update is required for Todo 3 yet, but Todo 2 introduced behavior that already conflicts with current docs.
