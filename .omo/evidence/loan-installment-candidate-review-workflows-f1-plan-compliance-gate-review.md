# F1 Gate Review: loan-installment-candidate-review-workflows

## recommendation

REJECT

## adversarialVerify

- verdict: `needs-fix`

## originalIntent

Final Verification F1 for `.omo/plans/loan-installment-candidate-review-workflows.md`: verify completed todos 1-8, all evidence under `.omo/evidence/loan-installment-candidate-review-workflows/`, every Must have / Must NOT have item, and explicitly reject if loan candidate dismissal is frontend-only, installment suggestions auto-link, or browser evidence is missing.

## desiredOutcome

The user should receive a confirmed plan-compliance result only if the current working tree and evidence prove:

- loan candidates can be persistently dismissed and restored through backend/API state, not frontend state only;
- default inbox loan candidates hide dismissed rows and update row/count;
- installment suggestions are read-only/advisory and never auto-link;
- `/data/inbox`, `/data/installments`, and MoM behavior have saved browser evidence;
- todos 1-8 are checked and each has evidence.

## userOutcomeReview

Core implementation behavior is mostly confirmed:

- Todos 1-8 are checked in `.omo/plans/loan-installment-candidate-review-workflows.md`.
- Task evidence files exist for todos 1-8 under `.omo/evidence/loan-installment-candidate-review-workflows/`.
- Backend persistence exists via `backend/app/models/loan_candidate_review.py`, migration `backend/alembic/versions/20260627_0030_add_loan_candidate_reviews.py`, and protected `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`.
- Default loan candidate filtering is backend-side in `backend/app/services/loan_mapping_service.py`, with `review_status=pending|not_candidate|all`; it is not just frontend state.
- Frontend inbox action sends `{ review_status: 'not_candidate' }` through the review mutation and invalidates loan mapping/canonical queries.
- Installment suggestions are served by read-only `GET /api/v1/installment-transaction-suggestions`; the service does not create links. Frontend suggestion rows call the existing link mutation only from a user click.
- Installment suggestion UI evidence and MoM screenshot are present and visually support the claimed outcomes.

The gate still fails because required evidence is incomplete/insufficient.

## blockers

1. Browser evidence for the inbox dismissal click target is insufficient.
   - F1 says to reject if browser evidence is missing.
   - `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-before-dismiss.png` and `task-8-inbox-after-restore.png` do not visibly show the `대출 후보 아님` button; the page content is squeezed into a narrow left column and the actionable controls are not captured.
   - `task-8-inbox-after-dismiss.png` proves the empty state after dismissal, but it does not prove the required before-click visible action.
   - `task-8-integrated-qa.md` claims the button was visible/clicked, but the referenced screenshot artifact does not support that claim.

2. Required migration-upgrade verification is not confirmed.
   - Todo 8 required the backend command set including Alembic upgrade.
   - `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md` records `alembic upgrade head` exits `1` for both async and sync SQLite attempts.
   - The report explains this as pre-existing SQLite/PostgreSQL migration incompatibility and avoids honcho Postgres, but there is no isolated PostgreSQL `alembic upgrade head` success evidence for the final working tree.

3. Direct `remove-ai-slops` / `programming` pass found unresolved changed-file size defects and fragmented review coverage.
   - Current changed production files over the 250 pure-LOC rule include `backend/app/services/loan_mapping_service.py` (1024), `frontend/src/features/data/InboxPage.tsx` (280), `frontend/src/hooks/useTransactions.ts` (444), and `frontend/src/api/transactions.ts` (362).
   - Task-specific slop/programming reports exist for task 5 and task 7, but there is no overall F1-ready code-quality report covering the full current diff and all changed Python/TypeScript production paths.
   - This does not change the functional findings above, but it blocks approval under the final-gate reviewer criteria.

## checkedArtifactPaths

- `.omo/plans/loan-installment-candidate-review-workflows.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-1-backend-loan-review-api.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-1-backend-loan-review-api-fix.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-2-loan-filtering.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-3-installment-suggestions-api.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-4-frontend-contracts.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-5-inbox-dismissal.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-5-code-quality-review.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-6-installment-suggestions.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-7-docs.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-7-code-quality-review.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-integrated-qa.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-before-dismiss.png`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-after-dismiss.png`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-inbox-after-restore.png`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-installments-before-link.png`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-installments-after-link.png`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-8-spending-mom.png`
- `backend/app/models/loan_candidate_review.py`
- `backend/alembic/versions/20260627_0030_add_loan_candidate_reviews.py`
- `backend/app/api/v1/endpoints/loan_mapping.py`
- `backend/app/services/loan_mapping_service.py`
- `backend/app/api/v1/endpoints/installments.py`
- `backend/app/services/installment_suggestion_service.py`
- `frontend/src/features/data/InboxPage.tsx`
- `frontend/src/features/data/InstallmentLinksTab.tsx`
- `frontend/src/features/data/InstallmentSuggestionCard.tsx`
- `frontend/src/hooks/useTransactions.ts`
- `frontend/src/api/transactions.ts`
- `docs/backend-api-ssot.md`
- `docs/backend-api-and-metrics-reference.md`
- `Implentation-plan.md`
- `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`
- `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`

## exactEvidence

- `rg -n "\[ \] [1-8]\." .omo/plans/loan-installment-candidate-review-workflows.md` returned no unchecked todo 1-8 boxes.
- `rg -n "^- \[[x ]\] [1-8]\." .omo/plans/loan-installment-candidate-review-workflows.md` showed tasks 1-8 checked.
- `find .omo/evidence/loan-installment-candidate-review-workflows -maxdepth 3 -type f` showed task evidence files and task 8 screenshots.
- `git status --short --branch` showed branch `codex/loan-installment-candidate-review-workflows...origin/main` with the feature diff and evidence artifacts uncommitted.
- Code inspection confirmed loan candidate dismissal writes `LoanCandidateReview`, not `LoanAccount.is_hidden`.
- Code inspection confirmed installment suggestion GET builds response data only and the frontend link mutation is click-driven.
- Visual inspection confirmed `task-8-installments-before-link.png`, `task-8-installments-after-link.png`, and `task-8-spending-mom.png` support the installment/MoM claims.
- Visual inspection did not confirm `대출 후보 아님` in the inbox before/restore screenshots.
- `git diff --check` exited 0.

## evidenceGaps

- Need a refreshed in-app browser screenshot or trace for `/data/inbox` before dismissal showing the candidate row and visible `대출 후보 아님` button.
- Need refreshed restore browser evidence showing the candidate and action visible again after restore, or a trace/snapshot artifact that supports the claim.
- Need migration evidence on an isolated PostgreSQL target or an explicitly accepted final-gate waiver for the pre-existing SQLite Alembic blocker.
- Need full-diff slop/programming review coverage, or accepted exceptions/refactor evidence for oversized changed production files.
