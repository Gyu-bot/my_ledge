# Gate Review: loan-installment-candidate-review-workflows todo 7

## recommendation
REJECT

## originalIntent
Verify todo 7 of `.omo/plans/loan-installment-candidate-review-workflows.md`: API docs, roadmap, and MoM regression references for the loan candidate review and installment suggestion workflows. This is a docs-only verification of the current working tree; no browser/runtime QA required.

## desiredOutcome
- New loan review endpoint documented.
- Loan list `review_status` filter documented.
- Installment suggestion endpoint documented.
- `Implentation-plan.md` updated for user-visible status/task graph.
- MoM remains regression covered; no analytics behavior rework implied.
- `docs/STATUS.md` untouched/deprecated.

## userOutcomeReview
Substantive todo-7 behavior is confirmed: current docs describe the new loan review endpoint, the `review_status=all|pending|not_candidate` loan-list filter, and the read-only installment suggestion endpoint. The documented endpoint paths, auth posture, response models, status literals, default filter behavior, advisory-only installment suggestion behavior, and 409 linked-loan conflict align with current backend endpoint/schema/service code. `Implentation-plan.md` has a user-visible queue note for the API docs and MoM regression status. Existing backend/API and frontend chart tests still assert MoM previous-month delta/ratio display behavior, and no analytics files appear in the current tracked diff. `docs/STATUS.md` has no diff.

Gate outcome is still rejected because the required task-7 review report coverage is absent: no task-7 code-review/slop report explicitly shows `remove-ai-slops` and `programming` criteria coverage. This is a process/evidence blocker, not a docs-contract blocker.

## blockers
- Missing task-7 review report with explicit `remove-ai-slops` and `programming` coverage. The only explicit coverage found was `task-5-code-quality-review.md`, which does not cover todo 7.

## checkedArtifactPaths
- `.omo/plans/loan-installment-candidate-review-workflows.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-7-docs.md`
- `docs/backend-api-ssot.md`
- `docs/backend-api-and-metrics-reference.md`
- `Implentation-plan.md`
- `backend/app/api/v1/endpoints/loan_mapping.py`
- `backend/app/api/v1/endpoints/installments.py`
- `backend/app/schemas/loan_mapping.py`
- `backend/app/schemas/installment.py`
- `backend/app/services/loan_mapping_service.py`
- `backend/app/services/installment_suggestion_service.py`
- `backend/tests/services/test_analytics_service.py`
- `backend/tests/api/test_analytics_api.py`
- `frontend/src/test/ds/charts.test.tsx`
- `docs/STATUS.md`

## exactEvidence
- Required `rg -n "loan-transaction-links/.+review|installment-transaction-suggestions|review_status|대출 후보 아님|제안 회차" docs Implentation-plan.md` returned the loan review endpoint, installment suggestion endpoint, `review_status` filter, and roadmap status lines.
- `git diff --check` exited 0.
- `git diff --exit-code -- docs/STATUS.md` exited 0.
- `docs/backend-api-ssot.md` lists `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` under API-key endpoints and live write endpoints, and lists `GET /api/v1/installment-transaction-suggestions` under live read endpoints.
- `docs/backend-api-ssot.md` states `GET /api/v1/loan-transaction-links` supports `review_status=all|pending|not_candidate` with default `pending`.
- `docs/backend-api-and-metrics-reference.md` documents `GET /api/v1/loan-transaction-links` query param `review_status: "all" | "pending" | "not_candidate"` default `pending`.
- `docs/backend-api-and-metrics-reference.md` documents `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` request/response and 409 behavior.
- `docs/backend-api-and-metrics-reference.md` documents `GET /api/v1/installment-transaction-suggestions` query params, response shape, active-plan-only/advisory behavior, matching constraints, and conflict status.
- `backend/app/api/v1/endpoints/loan_mapping.py` defines `review_status: LoanCandidateReviewFilter = Query(default="pending")` and `PATCH /loan-transaction-links/{transaction_id}/review` with API key dependency.
- `backend/app/schemas/loan_mapping.py` defines `LoanCandidateReviewStatus = Literal["pending", "not_candidate"]` and `LoanCandidateReviewFilter = Literal["all", "pending", "not_candidate"]`.
- `backend/app/services/loan_mapping_service.py` implements pending/not_candidate/all filtering and rejects linked transactions marked `not_candidate` with HTTP 409.
- `backend/app/api/v1/endpoints/installments.py` defines `GET /installment-transaction-suggestions` and returns `InstallmentTransactionSuggestionListResponse`.
- `backend/app/schemas/installment.py` defines the documented suggestion response fields, confidence literals, conflict reason literal, and `is_usable`.
- MoM regression coverage remains present in `backend/tests/services/test_analytics_service.py`, `backend/tests/api/test_analytics_api.py`, and `frontend/src/test/ds/charts.test.tsx`.

## slopAndOverfitPass
- Direct `remove-ai-slops` pass over todo-7 docs: no excessive tests, deletion-only tests, tautological tests, implementation-mirroring tests, or unnecessary production extraction introduced by the todo-7 doc diff.
- Direct `programming` pass over the code-contract surface: endpoint/schema/service literals align with docs; no code edits were made in this review.
- Required report coverage is absent for todo 7. This is a blocker under the final-gate rule even though the direct pass did not find substantive doc slop.

## evidenceGaps
- Current worktree is dirty with many tracked and untracked files from the broader feature branch. That is not a todo-7 blocker, but it means broad statements such as "code logic was not changed" are only valid for the todo-7 doc update scope, not for the entire working tree.
- The task-7 evidence `rg` excerpt includes unrelated purchase-gate `review_status` lines because the search pattern is broad. This does not invalidate the required endpoint/filter hits.
