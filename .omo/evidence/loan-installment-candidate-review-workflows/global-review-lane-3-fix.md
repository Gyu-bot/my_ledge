# Global Review Lane 3 Fix

Date: 2026-06-27
Branch: `codex/loan-installment-candidate-review-workflows`
Scope: installment suggestion row/draft identity collision in the new installment review workflow.

## Failing Before

- Added a regression to `frontend/src/test/features/InstallmentsPage.test.tsx` with two active installment plans emitting suggestions for the same `transaction_id`.
- Before the fix, the test failed with the wrong link payload:
  - expected `installment_plan_id: 7`
  - received `installment_plan_id: 3`
- React also emitted duplicate key warnings for suggestion rows keyed only by `transaction_id`.

## Fix

- `frontend/src/features/data/InstallmentSuggestionCard.tsx`
  - suggestion row React keys now use `transaction_id:installment_plan_id`
  - suggestion draft lookup/write now uses the same composite key
- `frontend/src/features/data/InstallmentLinksTab.tsx`
  - added suggestion-only draft state separate from mapping-table row drafts
  - suggestion save path now resolves its payload from the composite suggestion key
- `frontend/src/test/features/InstallmentsPage.test.tsx`
  - added regression coverage for duplicate suggestions on one transaction across two active plans

## Verification

1. `cd frontend && npm test -- --run src/test/features/InstallmentsPage.test.tsx`
   - PASS
   - `Test Files  1 passed (1)`
   - `Tests  4 passed (4)`

2. `cd frontend && npm run typecheck`
   - PASS

3. `cd frontend && npm run lint`
   - PASS

4. `git diff --check`
   - PASS

## Cleanup

- No Docker/services/browser sessions started.
- No plan checkbox or boulder/ledger updates made.

## Residual Risk

- This fix scopes suggestion identity to `transaction_id + installment_plan_id`, which matches the blocker and current backend contract.
- If the backend later emits multiple concurrent suggestion candidates for the same transaction and same plan under different suggested numbers, the UI identity would need to include `suggested_installment_number` as well.
- No browser-based visual QA was run for this logic-only table-state fix.
