# Task 4 Frontend Contracts Evidence

## Scope

- Todo: `.omo/plans/loan-installment-candidate-review-workflows.md` todo 4
- Audit date: `2026-06-27`
- Write scope respected:
  - `frontend/src/types/transaction.ts`
  - `frontend/src/api/transactions.ts`
  - `frontend/src/hooks/useTransactions.ts`
  - `frontend/src/test/api/contracts.test.ts`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-4-frontend-contracts.md`
- No backend files changed by this task implementation step.
- Result of working-tree inspection: existing frontend contract-layer changes already satisfied todo 4; no source fixes were required in this pass.

## Execution Boundary

- Contract types: `frontend/src/types/transaction.ts`
- HTTP adapter layer: `frontend/src/api/transactions.ts`
- React Query key and mutation invalidation layer: `frontend/src/hooks/useTransactions.ts`
- Contract and invalidation verification: `frontend/src/test/api/contracts.test.ts`
- Out-of-scope-but-inspected file: `frontend/src/test/features/InstallmentsPage.test.tsx`
  - Current contents are hook/query contract checks, not page-UI behavior.
  - This logically belongs with todo 4 coverage, but it lives in the todo 6 feature test file path.
  - Left untouched because it passes and moving/deleting it would broaden scope.

## Exact Test Names

- `maps month-based analytics queries to backend start_date/end_date`
- `replaces missing daily-spend endpoint with transactions list query`
- `builds subcategory drill-down data from transactions filtered to the selected major category`
- `maps asset and loan metadata patches to the health contract endpoints`
- `maps loan candidate review and installment suggestion adapters to backend contracts`
- `fetches installment suggestions through the typed query hook`
- `invalidates loan mapping and inbox queries after loan candidate review succeeds`
- `invalidates installment suggestions when installment plans or links change`

## Endpoint Contract Evidence

### Loan candidate review

- Path: `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`
- Verified request path fragment: `/loan-transaction-links/51/review`
- Verified method: `PATCH`
- Verified request body:

```json
{
  "review_status": "not_candidate",
  "memo": "수동 검토"
}
```

- Verified response fields exercised in test:
  - `candidate_key`
  - `candidate_type`
  - `transaction_id`
  - `review_status`
  - `memo`
  - `reviewed_at`

### Installment suggestions

- Path: `GET /api/v1/installment-transaction-suggestions`
- Verified query string fields:
  - `installment_plan_id=3`
  - `page=2`
  - `per_page=10`
- Verified response fields exercised in test:
  - `transaction`
  - `installment_plan_id`
  - `installment_plan_display_name`
  - `installment_plan_merchant`
  - `total_installments`
  - `monthly_amount`
  - `first_payment_date`
  - `suggested_installment_number`
  - `expected_billing_date`
  - `amount_delta`
  - `billing_day_delta`
  - `score`
  - `confidence`
  - `reason_labels`
  - `conflict_reason`
  - `is_usable`

## Invalidation Summary

### Loan candidate review mutation

- Hook: `useReviewLoanTransactionCandidate`
- Confirmed invalidation keys:
  - `['transactions', 'loanTransactionMappings']`
  - `['canonical-views']`
- Rationale: refreshes loan candidate list and inbox/dashboard surfaces derived from canonical views.

### Installment plan/link mutations

- Hooks covered:
  - `useCreateInstallmentPlan`
  - `useLinkTransactionToInstallment`
- Confirmed invalidation keys:
  - `txKeys.installmentPlans()`
  - `['transactions', 'installmentForecast']`
  - `['transactions', 'installmentTransactionMappings']`
  - `['transactions', 'installmentTransactionSuggestions']`
- Existing implementation also routes suggestion invalidation through:
  - `usePatchInstallmentPlan`
  - `useUnlinkTransactionFromInstallment`
  - `useBulkLinkTransactionsToInstallment`

## Command Results

- `cd frontend && npm test -- --run src/test/api/contracts.test.ts`
  - Exit: `0`
  - Result: `1` file passed, `8` tests passed
- `cd frontend && npm run typecheck`
  - Exit: `0`
  - Result: succeeded with no diagnostic output
- `git diff --check`
  - Exit: `0`
  - Result: no whitespace or patch formatting errors
- Optional scope-safety check: `cd frontend && npm test -- --run src/test/features/InstallmentsPage.test.tsx`
  - Exit: `0`
  - Result: `1` file passed, `3` tests passed
  - Interpretation: the misplaced feature-test file does not currently break todo 4 verification.

## Adversarial QA

- `stale_state`: covered
  - Loan review mutation invalidates both loan mapping queries and inbox-relevant canonical view queries.
  - Installment plan/link mutations invalidate suggestion queries so stale suggestions do not persist after link/plan changes.
- `stale_cache`: covered
  - Suggestion query key `['transactions', 'installmentTransactionSuggestions', params]` is explicitly invalidated by plan/link mutations.
- `dirty_worktree`: observed
  - The branch already contained unrelated dirty and untracked files before this task step.
  - This task did not reset, discard, or rewrite unrelated changes.
- `misleading_success_output`: covered
  - Verification used command exit codes plus explicit test assertions on path, method, body, query, and invalidation keys.
- `malformed_input`: non-applicable
  - No new runtime parsing or UI form handling was added in scope.
  - This task only defined TS contracts and transport hooks against backend-owned schemas.
- `TS/contract-level malformed_input`: non-applicable
  - Contract types mirror backend enums/literals directly and no frontend-side coercion layer was introduced.

## Cleanup Receipt

- No services, containers, or host settings were changed.
- No browser/UI verification was required because todo 4 is contract-layer only and has no UI changes.
- No cleanup was needed beyond preserving the existing dirty worktree as-is.

## Residual Risks

- `frontend/src/test/features/InstallmentsPage.test.tsx` currently contains contract-level hook coverage instead of page-UI assertions.
  - It passes today, but keeping todo 4 coverage under a todo 6-oriented filename can mislead later workers about what remains for the actual installments UI task.
- Loan review invalidation uses the broad prefix `['canonical-views']`.
  - This is functionally correct for inbox refresh, but it is broader than a single dashboard key and could refetch more canonical-view queries if more are added later.
