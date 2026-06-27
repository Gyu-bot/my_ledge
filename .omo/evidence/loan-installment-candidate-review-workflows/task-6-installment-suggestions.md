# Task 6 - Installment Suggestion UI Evidence

## Scope

- Todo: `.omo/plans/loan-installment-candidate-review-workflows.md` todo 6
- Branch: `codex/loan-installment-candidate-review-workflows`
- Request boundary kept:
  - frontend only
  - no backend files modified
  - no inbox UI modified

## Changed UI Path

- Route: `/data/installments`
- Surface: `거래 연결` tab
- Added section: `추천 연결 제안`

## Changed Files

- `frontend/src/features/data/InstallmentsPage.tsx`
- `frontend/src/features/data/InstallmentLinksTab.tsx`
- `frontend/src/features/data/InstallmentSuggestionCard.tsx`
- `frontend/src/features/data/InstallmentMappingsSection.tsx`
- `frontend/src/test/features/InstallmentsPage.test.tsx`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-6-installment-suggestions.md`

## Visible UI Evidence

- Suggestion card title is visible as `추천 연결 제안`
- Suggested installment label is visible as `제안 회차`
- Suggested number is rendered as `1회차`
- Conflict rows are labelled with `회차 충돌`
- Conflict explanation is visible as `이미 연결된 회차`
- Suggestion rows show:
  - plan name
  - merchant/date
  - `금액 차이`
  - billing-day delta text
  - confidence badge
  - reason badges

## Linking Evidence

- Suggestion rows reuse the existing installment link mutation
- Default quick-link input is prefilled from `suggested_installment_number`
- The suggestion connect action remains manual only; no auto-link path was added
- After a successful link:
  - the linked suggestion row disappears from the suggestion list
  - React Query invalidation hits suggestion, mapping list, and forecast keys
  - active queries refetch through the existing hooks

## Test Evidence

- Added page-level red/green tests in `frontend/src/test/features/InstallmentsPage.test.tsx`
- Covered scenarios:
  - suggestion row displays `제안 회차` and `N회차`
  - default link input uses the suggested number
  - conflict row is clearly labelled and disabled
  - successful link calls the existing mutation and refetches suggestions/list/forecast

## Exact Commands

- `cd frontend && npm test -- --run src/test/features/InstallmentsPage.test.tsx`
  - exit `0`
  - result: `1` file passed, `3` tests passed
- `cd frontend && npm run typecheck`
  - exit `0`
  - result: succeeded with no diagnostics
- `git diff --check`
  - exit `0`
  - result: no whitespace or patch formatting issues

## Adversarial QA

- `stale_state`: covered
  - page test proves link success refetches suggestions, mapping list, and forecast
- `stale_cache`: covered
  - refetch is exercised through the existing invalidation hooks, not a local optimistic-only shortcut
- `dirty_worktree`: observed
  - pre-existing dirty and untracked files were preserved
  - this task only touched the files listed above
- `misleading_success_output`: covered
  - assertions verify visible labels, disabled conflict action, mutation payload, and post-link refetch
- `malformed_input`: covered at UI level
  - unusable conflict rows cannot trigger the connect action
- `scope fidelity`: covered
  - no backend changes
  - no inbox changes
  - no auto-link behavior introduced

## Manual QA / Browser

- Browser screenshot intentionally deferred to todo 8 as allowed by the task brief
- No new local app server or Docker stack was started in this task step
- No safe isolated browser surface was created here

## Cleanup Receipt

- No services, Docker containers, ports, or host settings changed
- No `honcho-*` container/service touched
- No cleanup beyond preserving the shared dirty worktree state was required

## Residual Risks

- Reason badges currently expose backend reason labels verbatim such as `same_merchant`
- Browser-level visual QA is still pending todo 8
- The top summary stat `연결 후보` still reflects the existing mapping query, not suggestion count; this task did not broaden that semantics
