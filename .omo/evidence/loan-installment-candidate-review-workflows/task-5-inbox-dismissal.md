# Task 5 Inbox Dismissal Evidence

## Scope

- Todo: `.omo/plans/loan-installment-candidate-review-workflows.md` todo 5
- Audit date: `2026-06-27`
- Changed source scope:
  - `frontend/src/features/data/InboxPage.tsx`
  - `frontend/src/test/features/InboxPage.test.tsx`
- Evidence scope:
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-5-inbox-dismissal.md`
- Guardrails respected:
  - No backend files changed.
  - No installment UI was added here.
  - Existing unrelated dirty files in the branch were preserved.

## UI Change Evidence

- Visible loan candidate action labels in `LoanCandidateCard`:
  - `연결`
  - `대출 후보 아님`
  - `대출에서 열기`
- Action placement:
  - `대출 후보 아님` is rendered in the same visible action row as `연결`.
  - It is not hidden behind a menu, disclosure, or hover-only affordance.
- Pending/disabled handling:
  - `연결` and `대출 후보 아님` both disable while either loan-link or review mutation is pending.
  - Loan-account and repayment selects also disable during pending mutation state.
  - `대출 후보 아님` label changes to `처리 중...` while the review mutation is pending.
- Error handling:
  - Failure path uses the existing toast pattern: `대출 후보 제외 실패`.

## Exact Test Names

- `3종 카드(승인 대기·미분류·대출 연결)와 커버리지 게이지를 렌더한다`
- `탭 카운트를 표시한다 (전체 3 = 미분류1 + 승인1 + 대출1)`
- `미분류 카드에서 분류 저장 시 해당 거래를 업데이트한다`
- `대출 후보 카드에 대출 후보 아님 액션을 노출하고 클릭 시 not_candidate 리뷰를 보낸다`
- `대출 후보 아님 처리 성공 후 재조회 결과를 반영해 대출 후보 행과 카운트를 숨긴다`

## Click And Mutation Evidence

- Reviewed candidate fixture:
  - `transaction_id: 51`
  - `merchant: 국민은행 대출이자`
- Verified click target:
  - Accessible button name `대출 후보 아님`
- Verified mutation payload:

```json
{
  "transactionId": 51,
  "data": {
    "review_status": "not_candidate"
  }
}
```

- Wrong status prevention:
  - UI uses the typed `useReviewLoanTransactionCandidate` mutation only.
  - The click path hardcodes `review_status: 'not_candidate'`; no freeform status input exists in this surface.

## Row And Count Disappearance Evidence

- Test setup started with inbox counts:
  - `전체 3`
  - `대출 연결 1`
- Mocked successful review updated the loan candidate query fixture from one row to zero rows.
- After rerender/remock, assertions passed for:
  - candidate merchant `국민은행 대출이자` absent from the document
  - tab label `전체 2` present
  - tab label `대출 연결 0` present
- Interpretation:
  - This is the practical TDD proof that post-success invalidation/refetch can remove the row and default inbox count when the data source no longer returns the dismissed candidate.

## Command Results

- `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx`
  - Exit: `0`
  - Result: `1` file passed, `5` tests passed
- `cd frontend && npm run typecheck`
  - Exit: `0`
  - Result: succeeded with no diagnostics
- `git diff --check`
  - Exit: `0`
  - Result: no whitespace or patch-format errors

## Adversarial QA

- `stale_state`: covered
  - Success path uses the existing `useReviewLoanTransactionCandidate` hook, which invalidates loan mapping and canonical-view inbox queries.
  - The feature test simulates the post-invalidation refetch by rerendering with the updated fixture and confirms row/count disappearance.
- `dirty_worktree`: observed
  - The branch already contained unrelated modified and untracked files before todo 5 work began.
  - This task changed only the Inbox UI/test files plus this evidence artifact.
- `misleading_success_output`: covered
  - Verification relied on exact test assertions for visible label, payload shape, and count disappearance, not on toast text alone.
- `malformed_input/wrong status impossible via typed mutation`: covered
  - The action does not accept arbitrary status input.
  - The mutation payload is constrained to the typed literal `not_candidate` in the UI code path.
- `stale_cache/refetch`: covered
  - The review mutation reuses the existing invalidation helper for `['transactions', 'loanTransactionMappings']` and `['canonical-views']`.
  - The feature test's rerender proves the UI responds correctly once refreshed data excludes the dismissed candidate.
- `scope fidelity`: covered
  - No installment components, backend contracts, or unrelated page changes were introduced in this task step.

## Manual QA / Screenshot Status

- Browser screenshot deferred to todo 8 by scope.
- No local browser surface was started in this task step.
- This evidence file therefore records test-backed UI proof only.

## Cleanup Receipt

- No services, containers, ports, or browser processes were started or changed.
- No cleanup beyond preserving the existing dirty worktree was required.

## Residual Risks

- `frontend/src/features/data/InboxPage.tsx` was already above the 250 pure-LOC guideline before this task and now measures `280` pure LOC.
  - The diff for todo 5 stayed narrow instead of broadening into a file split, but the file remains a refactor candidate outside this scoped task.
- The row/count disappearance behavior is proven through React Query invalidation plus remocked rerender in tests, not through live browser QA yet.
  - Todo 8 should still confirm the real network/refetch path in-browser.
