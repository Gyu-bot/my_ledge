# Final Verification F2 Code Quality Review

## Verdict

- verdict: `confirmed`
- codeQualityStatus: `WATCH`
- recommendation: `APPROVE`
- reportPath: `.omo/evidence/loan-installment-candidate-review-workflows-final-f2-code-review.md`
- blockers: none

## Scope Reviewed

- Plan: `.omo/plans/loan-installment-candidate-review-workflows.md`
- Evidence:
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-1-backend-loan-review-api.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-1-backend-loan-review-api-fix.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-2-loan-filtering.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-3-installment-suggestions-api.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-4-frontend-contracts.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-5-code-quality-review.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-5-inbox-dismissal.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-6-installment-suggestions.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-7-code-quality-review.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md`
  - `.omo/evidence/d2efe02-original-goal-code-review.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows-task-5-gate-review.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows-task-6-gate-review.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows-task-7-docs-gate-review.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows-task-7-regate-gate-review.md`
- Backend:
  - `backend/alembic/versions/20260627_0030_add_loan_candidate_reviews.py`
  - `backend/app/models/loan_candidate_review.py`
  - `backend/app/api/v1/endpoints/loan_mapping.py`
  - `backend/app/api/v1/endpoints/installments.py`
  - `backend/app/schemas/loan_mapping.py`
  - `backend/app/schemas/installment.py`
  - `backend/app/services/loan_mapping_service.py`
  - `backend/app/services/installment_suggestion_service.py`
  - `backend/app/services/installment_suggestion_types.py`
  - focused backend API/service/schema tests
- Frontend:
  - `frontend/src/types/transaction.ts`
  - `frontend/src/api/transactions.ts`
  - `frontend/src/hooks/useTransactions.ts`
  - `frontend/src/features/data/InboxPage.tsx`
  - `frontend/src/features/data/InstallmentsPage.tsx`
  - `frontend/src/features/data/InstallmentLinksTab.tsx`
  - `frontend/src/features/data/InstallmentSuggestionCard.tsx`
  - `frontend/src/features/data/InstallmentMappingsSection.tsx`
  - focused frontend contract/page tests

## Skill-Perspective Check

- `remove-ai-slops`: loaded and applied to production and test changes. I checked for deletion-only tests, tests that merely prove a removal, tautological tests, implementation-constant-only tests, unnecessary data extraction/parsing, broad defensive code, dead code, and needless abstraction.
- `programming`: loaded with Python and TypeScript reference material. I applied the strict typing, boundary parsing, no untyped escape hatch, no needless abstraction, migration safety, and test-shape criteria to the changed Python/TypeScript surfaces.
- Result: no CRITICAL or HIGH violation remains. The diff has known WATCH-level debt around existing oversized modules and pragmatic local typing patterns, but the branch does not introduce a blocker under the current plan scope.

## Findings By Severity

### CRITICAL

None.

### HIGH

None.

### MEDIUM

1. Full `alembic upgrade head` evidence remains blocked on the repo's older SQLite-incompatible migrations, so the new migration is approved by inspection and offline SQL evidence rather than a real isolated Postgres upgrade.
   - Code inspected: `backend/alembic/versions/20260627_0030_add_loan_candidate_reviews.py:1`
   - Evidence inspected: `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md`
   - The new revision itself is downgrade-safe: it only creates `loan_candidate_reviews` in `upgrade()` and drops the same table in `downgrade()`, with a valid `down_revision` pointing to `20260627_0029`.
   - Not a blocker for F2 because the failure is in prior PostgreSQL-specific view SQL under SQLite, operational honcho Postgres was intentionally not mutated, and the new migration has no asymmetric data rewrite or irreversible operation.

2. `backend/app/services/installment_suggestion_service.py` uses an in-memory cross-product over all active plans and all unlinked expense transactions.
   - Code inspected: `backend/app/services/installment_suggestion_service.py:42`, `backend/app/services/installment_suggestion_service.py:122`
   - This is acceptable for the current personal-finance scope and is bounded by response pagination after scoring, but pagination happens after matching. If transaction volume grows, the query should add a coarse date/merchant prefilter or plan-scoped candidate window.

3. Several changed/touched source files remain over the 250 pure-LOC policy threshold.
   - Measured pure LOC: `backend/app/services/loan_mapping_service.py` 1024, `frontend/src/hooks/useTransactions.ts` 444, `frontend/src/features/data/InboxPage.tsx` 280.
   - The task-specific code reviews already treated this as WATCH because these files were already oversized before the narrow changes. New extracted installment components are below threshold.
   - This is maintenance debt, not a blocker for this plan, because forcing a service/hook split now would be a broad refactor outside the requested workflows.

### LOW

1. `frontend/src/features/data/InstallmentSuggestionCard.tsx:104` exposes backend reason labels such as `same_merchant` directly in the UI.
   - This is not a code-quality blocker and is consistent with the current evidence, but a later UX pass should map these labels to Korean display text.

2. The TypeScript contract layer mirrors backend response interfaces manually rather than using generated schemas or runtime Zod parsing.
   - This is consistent with the existing local pattern in `frontend/src/types/transaction.ts`.
   - No `any`, `@ts-ignore`, `@ts-expect-error`, or non-null assertion was found in the changed plan files.

3. Some tests assert exact endpoint paths, invalidation prefixes, or metadata shape.
   - The tests still exercise observable API/UI behavior: auth, 409 linked dismissals, default/recovery filtering, read-only suggestions, conflict disabling, mutation payloads, and cache refresh.
   - I did not find deletion-only, tautological, prompt-string, or requested-removal-only tests.

## Contract And Auth Review

- `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` is API-key protected and uses the typed `LoanCandidateReviewPatchRequest`.
- Linked transactions cannot be dismissed as `not_candidate`; dismiss-before-link now restores stale review rows to `pending` for both single and bulk link APIs.
- Default `GET /api/v1/loan-transaction-links` review filtering hides `not_candidate` rows, while `review_status=not_candidate` and `review_status=all` support recovery/audit.
- `GET /api/v1/installment-transaction-suggestions` is read-only, unauthenticated like neighboring read endpoints, and does not create links.
- Installment link mutations invalidate suggestion, mapping, forecast, and transaction query prefixes; loan review invalidates loan mappings and canonical-view inbox surfaces.

## Verification Reviewed

- `git diff --check`: passed in this review.
- Evidence reports passing focused backend suite: 44 tests.
- Evidence reports passing focused frontend tests: 24 tests.
- Evidence reports `ruff check`, frontend `typecheck`, frontend `lint`, and frontend `build` passed after one fixed unused import.
- I did not rerun the full test suites in this review to avoid mutating caches or service state; I inspected the saved outputs and reran `git diff --check`.

## Blockers

None.
