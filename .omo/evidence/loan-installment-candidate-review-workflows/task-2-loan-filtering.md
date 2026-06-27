# Task 2 Loan Candidate Filtering Evidence

## Scope

Todo 2 changed the default loan mapping list behavior so dismissed
`review_status='not_candidate'` candidates are hidden from normal loan candidate
results while remaining recoverable through explicit filters.

Changed code paths:

- `backend/app/schemas/loan_mapping.py`: added `LoanCandidateReviewFilter =
  'all' | 'pending' | 'not_candidate'`.
- `backend/app/api/v1/endpoints/loan_mapping.py`: added
  `review_status=pending` query parameter to `GET /api/v1/loan-transaction-links`.
- `backend/app/services/loan_mapping_service.py`: passed `review_status` into
  `_build_loan_transaction_mapping_query`, joined `loan_candidate_reviews`, and
  applied the same review filter before count and item pagination.
- `backend/tests/services/test_loan_mapping_service.py`: added service coverage
  for default, recovery, audit, restore, and linked-row separation.
- `backend/tests/api/test_loan_mapping_api.py`: added endpoint coverage for
  default `linked=unlinked` count/items, recovery/audit filters, linked-row
  separation, and malformed query validation.

No plan checkboxes, `.omo/boulder.json`, `.omo/start-work/ledger.jsonl`,
Docker containers, honcho services, host ports, branches, or user data were
changed by this task.

## Stale State / Dirty Worktree

Observed before task 2 edits:

```text
Branch: codex/loan-installment-candidate-review-workflows
Tracking line: ## codex/loan-installment-candidate-review-workflows...origin/main
Pre-existing dirty files included:
.omo/boulder.json
.omo/plans/index.md
.omo/start-work/ledger.jsonl
backend/app/api/v1/endpoints/installments.py
backend/app/api/v1/endpoints/loan_mapping.py
backend/app/models/__init__.py
backend/app/schemas/installment.py
backend/app/schemas/loan_mapping.py
backend/app/services/loan_mapping_service.py
backend/tests/api/test_loan_mapping_api.py
backend/tests/api/test_schema_api.py
backend/tests/services/test_installment_service.py
untracked .omo/evidence/*, .omo/plans/loan-installment-candidate-review-workflows.md,
backend/alembic/versions/20260627_0030_add_loan_candidate_reviews.py,
backend/app/models/loan_candidate_review.py,
backend/app/services/installment_suggestion_service.py,
backend/app/services/installment_suggestion_types.py,
backend/tests/api/test_installment_suggestions_api.py,
backend/tests/services/test_installment_suggestion_service.py
```

Task 2 intentionally touched only the loan mapping service, endpoint, schema,
service test, API test, and this evidence file. Existing `.omo`, installment
suggestion, migration/model, and user/agent changes were not reverted or
overwritten.

## Failing Tests Added

Added service test:

- `test_list_loan_transaction_mappings_filters_dismissed_candidates_by_review_status`

Added API test:

- `test_loan_transaction_links_endpoint_filters_dismissed_candidates_from_default_counts`

Red run before production implementation:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_loan_mapping_service.py::test_list_loan_transaction_mappings_filters_dismissed_candidates_by_review_status tests/api/test_loan_mapping_api.py::test_loan_transaction_links_endpoint_filters_dismissed_candidates_from_default_counts

Result:
tests/services/test_loan_mapping_service.py F                            [ 50%]
tests/api/test_loan_mapping_api.py F                                     [100%]
E       TypeError: list_loan_transaction_mappings() got an unexpected keyword argument 'review_status'
E       assert 2 == 1
======================== 2 failed, 19 warnings in 0.17s ========================
```

This proved both missing service support for `review_status` and the default
endpoint count leak where a dismissed unlinked candidate still appeared in
`linked=unlinked`.

## Sanitized List Summaries

Fixture shape used by service and API tests:

```text
dismissed: unlinked expense transaction, description "카카오뱅크 대출이자",
  review_status=not_candidate, memo="[sanitized dismiss memo]"
visible: unlinked expense transaction, description "국민은행 원리금 상환",
  no review row
linked: linked expense transaction, description "신한은행 대출 상환",
  linked to loan account "신한은행 신용대출"
```

Observed expected summaries after implementation:

```text
before/default pending semantics:
linked=unlinked, review_status omitted -> pending filter

after dismiss/default:
linked=unlinked, review_status omitted
total=1
items=[visible]

recovery:
linked=unlinked, review_status=not_candidate
total=1
items=[dismissed]

audit:
linked=unlinked, review_status=all
total=2
items=[dismissed, visible]

restore:
PATCH review_status=pending, then linked=unlinked with review_status omitted
total=2
items=[dismissed, visible]

linked-separation:
linked=linked, review_status omitted
total=1
items=[linked with non-null link]
```

The count and item assertions come from the same response objects, so the
default `/data/inbox` backing query (`linked=unlinked`) uses the same filter for
both item rows and counts.

## Command Results

Focused green run:

```text
Command:
DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_loan_mapping_service.py::test_list_loan_transaction_mappings_filters_dismissed_candidates_by_review_status tests/api/test_loan_mapping_api.py::test_loan_transaction_links_endpoint_filters_dismissed_candidates_from_default_counts

Result:
tests/services/test_loan_mapping_service.py .                            [ 50%]
tests/api/test_loan_mapping_api.py .                                     [100%]
======================== 2 passed, 19 warnings in 0.12s ========================
```

Requested pytest command, rerun after lint fix:

```text
Command:
cd backend && DATABASE_URL=sqlite+aiosqlite:///./test.db UV_CACHE_DIR=.uv-cache uv run pytest tests/services/test_loan_mapping_service.py tests/api/test_loan_mapping_api.py

Result:
tests/services/test_loan_mapping_service.py ...............              [ 51%]
tests/api/test_loan_mapping_api.py ..............                        [100%]
======================= 29 passed, 262 warnings in 1.02s =======================
```

Ruff first run found one test-only unused import:

```text
Command:
cd backend && UV_CACHE_DIR=.uv-cache uv run ruff check .

Result:
F401 [*] `app.models.loan_candidate_review.LoanCandidateReview` imported but unused
Found 1 error.
```

The unused import was removed, then ruff was rerun:

```text
Command:
cd backend && UV_CACHE_DIR=.uv-cache uv run ruff check .

Result:
All checks passed!
```

Whitespace:

```text
Command:
git diff --check

Result:
exit 0, no output
```

## Adversarial QA

- stale_state: current branch was confirmed as
  `codex/loan-installment-candidate-review-workflows`; the shared worktree had
  pre-existing `.omo`, task 1, installment suggestion, and untracked evidence
  files before this task.
- dirty_worktree: unrelated/concurrent files listed above were left untouched;
  task 2 wrote only the scoped loan mapping files and this evidence artifact.
- misleading_success_output: red, focused green, full pytest, ruff failure,
  ruff success, and diff-check outputs are recorded above with result lines.
- malformed_input: endpoint test sends `review_status=ignored` to
  `GET /api/v1/loan-transaction-links` and asserts HTTP 422 from FastAPI's
  typed query validation.
- stale_state/filter correctness: API and service tests assert the same
  `total` and `items` response for default `linked=unlinked`, proving dismissed
  candidates are absent from both counts and rows.
- linked-separation: service and API tests assert a linked row still appears
  under `linked=linked` with default `review_status=pending`; link filtering and
  review filtering remain independent.
- prompt_injection: not applicable; this task reads no untrusted prompt-like
  content.
- network_or_service_conflict: not applicable; no Docker, honcho, browser,
  network, or host-port changes were made.

## Cleanup Receipt

- No `backend/test.db` file existed after the final pytest run.
- No Docker containers, honcho services, host ports, branches, or browser
  sessions were started, stopped, reset, or removed.
- No raw API keys, secrets, or user finance data were written to this evidence
  file.

## Risks

- `backend/app/services/loan_mapping_service.py`,
  `backend/tests/services/test_loan_mapping_service.py`, and
  `backend/tests/api/test_loan_mapping_api.py` already exceed the current
  250 pure-LOC guideline. Measured after this task:
  `loan_mapping_service.py` 1024, `test_loan_mapping_service.py` 712,
  `test_loan_mapping_api.py` 584. Refactoring these shared files would exceed
  todo 2's narrow scope.
- The branch still includes pre-existing task 1 and installment suggestion
  changes, so a final PR/commit should stage by path/hunk rather than assuming
  the whole worktree belongs to task 2.
