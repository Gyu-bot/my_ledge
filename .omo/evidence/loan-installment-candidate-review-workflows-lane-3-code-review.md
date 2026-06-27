# Global Review-Work Lane 3: Code Quality Review

Date: 2026-06-27
Scope: final backend/frontend/docs diff and untracked task files for `loan-installment-candidate-review-workflows`.

## Verdict

- verdict: `FAIL`
- codeQualityStatus: `BLOCK`
- recommendation: `REQUEST_CHANGES`
- reportPath: `.omo/evidence/loan-installment-candidate-review-workflows-lane-3-code-review.md`
- blockers:
  - `frontend/src/features/data/InstallmentSuggestionCard.tsx` stores suggestion draft state and React row keys by `transaction_id` only, but the backend can return multiple suggestions for the same transaction across different active installment plans. Editing one duplicate row can make another row submit the wrong `installment_plan_id`.

## Skill-Perspective Check

- `remove-ai-slops`: loaded and applied to production and test changes. Checked for overfit tests, deletion-only tests, tautological tests, implementation-constant-only tests, needless abstraction, dead code, hidden production complexity, and oversized-module pressure.
- `programming`: loaded and applied with Python and TypeScript reference material. Checked strict typing, API boundary contracts, no `any`/`@ts-ignore`, query invalidation, migration symmetry, auth, and test shape.
- Result: the diff violates both perspectives through a HIGH behavioral state-keying bug in the new installment suggestion UI. Other concerns are WATCH/LOW and not independently blocking.

## Findings By Severity

### CRITICAL

None.

### HIGH

1. Installment suggestion rows are keyed and drafted by `transaction_id` only, which can submit the wrong plan when one transaction matches multiple active plans.
   - `backend/app/services/installment_suggestion_service.py:129` loops every active plan over every unlinked transaction and appends every matching suggestion; there is no uniqueness guarantee by transaction.
   - `frontend/src/features/data/InstallmentSuggestionCard.tsx:79` reads `rowDrafts[item.transaction.transaction_id]`, `frontend/src/features/data/InstallmentSuggestionCard.tsx:88` uses `key={item.transaction.transaction_id}`, and `frontend/src/features/data/InstallmentSuggestionCard.tsx:133` writes drafts by transaction id.
   - `frontend/src/features/data/InstallmentLinksTab.tsx:56` then derives the link payload from that shared draft and sends `installment_plan_id` at `frontend/src/features/data/InstallmentLinksTab.tsx:65`.
   - Why this blocks: overlapping installments at the same merchant are plausible in this app. If the backend returns two suggestions for the same transaction under two active plans, React gets duplicate keys and both rows share one draft. Editing the proposed number in one row can change the draft plan/number used by the other row, so the UI may link a transaction to the wrong installment plan. Existing tests cover one plan only and do not catch this.
   - Required fix: key suggestion rows and draft state by a stable suggestion identity including at least `transaction_id` and `installment_plan_id` (and likely `suggested_installment_number` if the API can emit multiple plan-number candidates), then add a regression test with two active matching plans for the same transaction.

### MEDIUM

1. Several touched source files remain over the 250 pure-LOC review threshold.
   - Measured current pure LOC: `backend/app/services/loan_mapping_service.py` 1024, `frontend/src/hooks/useTransactions.ts` 444, `frontend/src/features/data/InboxPage.tsx` 280.
   - This is not the lane blocker because the largest files were already oversized and broad splitting would exceed this workflow's scope, but it is real maintenance debt under the loaded skill perspectives.

2. `backend/app/services/installment_suggestion_service.py` computes suggestions with an in-memory active-plan x unlinked-transaction cross product.
   - Current pure LOC is 223, and tests pass, but matching and pagination happen after building all candidates. This is acceptable for the current personal-finance scale; if data volume grows, add coarse SQL prefilters by merchant/date window.

### LOW

1. `docs/backend-api-ssot.md:272` documents the loan `review_status` filter under `Installment Management`.
   - The statement is true, but the section placement is confusing. It is also documented in the endpoint tables/reference, so this is not blocking.

2. Untracked `.DS_Store`, `.omo/.DS_Store`, and `docs/.DS_Store` files are present.
   - These are scope hygiene issues, not code behavior blockers. They should not be committed.

3. UI displays backend reason labels like `same_merchant` directly in `frontend/src/features/data/InstallmentSuggestionCard.tsx:104`.
   - This is consistent with the current evidence and tests, but a later UX polish pass should map them to reader-facing Korean labels.

## Verification Run In This Review

- `git diff --check`: pass
- `cd backend && UV_CACHE_DIR=.uv-cache uv run ruff check .`: pass
- `cd frontend && npm run typecheck`: pass
- `cd frontend && npm run lint`: pass
- `cd backend && DATABASE_URL=sqlite+aiosqlite:////private/tmp/my_ledge-lane3-review.db API_KEY=test-api-key UV_CACHE_DIR=.uv-cache PYTHONDONTWRITEBYTECODE=1 uv run pytest -p no:cacheprovider tests/services/test_loan_mapping_service.py tests/api/test_loan_mapping_api.py tests/services/test_installment_service.py tests/services/test_installment_suggestion_service.py tests/api/test_installments_api.py tests/api/test_installment_suggestions_api.py tests/api/test_schema_api.py`: pass, 44 passed
- `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx src/test/features/InstallmentsPage.test.tsx src/test/features/SpendingPage.test.tsx src/test/ds/charts.test.tsx src/test/api/contracts.test.ts`: pass, 24 passed

## Notes On Prior Evidence

- Prior F2 reported WATCH/APPROVE. I independently inspected the diff, reran focused static and test gates, and do not accept PASS because the duplicate suggestion state bug remains uncovered.
- Prior Alembic Postgres evidence claims `alembic upgrade head` passed against disposable Postgres. I did not rerun Docker/Postgres in this lane, but the new migration is symmetric by inspection: `upgrade()` creates `loan_candidate_reviews`; `downgrade()` drops it.

## Final Recommendation

REQUEST_CHANGES. Fix the suggestion identity/draft-state bug and add a focused regression test before approving the final diff.
