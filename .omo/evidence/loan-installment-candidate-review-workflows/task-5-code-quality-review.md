# Task 5 Code Quality Review: Inbox Loan Candidate Dismissal

## Verdict

- verdict: `pass`
- codeQualityStatus: `WATCH`
- recommendation: `APPROVE`
- blockers: none

This review approves todo 5 as a task-specific frontend change. The previous gate rejection was valid about the missing review artifact, but I do not treat the line-count issue as a todo-5 behavioral blocker. It is a real policy caveat that should be tracked or handled in a focused refactor, not a reason to reject this narrow dismissal action by itself.

## Scope Reviewed

- Plan: `.omo/plans/loan-installment-candidate-review-workflows.md`
- Evidence:
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-5-inbox-dismissal.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows-task-5-gate-review.md`
  - `.omo/evidence/loan-installment-candidate-review-workflows/task-4-frontend-contracts.md`
- Source:
  - `frontend/src/features/data/InboxPage.tsx`
  - `frontend/src/test/features/InboxPage.test.tsx`
  - `frontend/src/hooks/useTransactions.ts`
  - `frontend/src/api/transactions.ts`
  - `frontend/src/types/transaction.ts`
  - `frontend/src/test/api/contracts.test.ts`
  - `frontend/src/hooks/useCanonicalViews.ts`
  - `frontend/src/AGENTS.md`

## Skill-Perspective Check

- `remove-ai-slops`: loaded and applied. Checked for duplicated logic, broad refactor, deletion-only tests, tautological tests, implementation-mirroring tests, unnecessary abstraction, and oversized modules.
- `programming`: loaded with TypeScript reference and code-smells reference. Checked strict typing, React Query boundary shape, no `any`/`@ts-ignore`, type assertions, overbroad parsing/validation, brittle tests, and the 250 pure-LOC rule.
- Result: no CRITICAL/HIGH issue remains for todo 5. The diff carries a real 250-LOC caveat, but it is pre-existing in `InboxPage.tsx` and broader in `useTransactions.ts` from todo 4.

## Findings By Severity

### CRITICAL

None.

### HIGH

None.

### MEDIUM

1. `frontend/src/features/data/InboxPage.tsx` is oversized, but not newly caused by todo 5.
   - Current pure LOC: `280`
   - `HEAD` pure LOC: `263`
   - `origin/main` pure LOC: `263`
   - Todo 5 added lines to an already-oversized file, so it violates the strict letter of the `remove-ai-slops` / `programming` 250 pure-LOC rule. I do not treat it as an approval blocker for this task because the file was already past the limit, the task diff is tightly scoped, and forcing a split now would broaden a simple UI action into component topology work.
   - If the team wants to enforce the rule now, the smallest refactor is exact and low-risk: extract `LoanCandidateCard` from `frontend/src/features/data/InboxPage.tsx:151` plus `accountValue` from `frontend/src/features/data/InboxPage.tsx:39` into `frontend/src/features/data/InboxLoanCandidateCard.tsx`, then import it back into `InboxPage.tsx`. That would likely move roughly 60 pure LOC out of `InboxPage.tsx` and bring it below 250 without touching other cards.

### LOW

1. `frontend/src/hooks/useTransactions.ts` remains oversized and contains todo-4 contract/hook work, not todo-5 UI work.
   - Current pure LOC: `444`
   - `HEAD` / `origin/main` pure LOC: `406`
   - The loan review hook at `frontend/src/hooks/useTransactions.ts:302` is necessary for todo 5, and its invalidation at `frontend/src/hooks/useTransactions.ts:312` correctly refreshes `['transactions', 'loanTransactionMappings']` and `['canonical-views']`. This file should not block todo 5; any split should be owned by todo 4/final code-quality cleanup.

2. The component test simulates the refreshed loan-candidate query by mutating a fixture and rerendering, rather than driving a real QueryClient refetch.
   - This is acceptable for todo 5 because `frontend/src/test/api/contracts.test.ts` separately verifies the review hook invalidates the relevant query prefixes, and todo 8 remains responsible for browser/manual refetch evidence.

## Behavioral Review

- Visible action: pass. `frontend/src/features/data/InboxPage.tsx:214` renders `연결`, and `frontend/src/features/data/InboxPage.tsx:215` renders a visible secondary `대출 후보 아님` button in the same action row.
- Mutation payload: pass. `frontend/src/features/data/InboxPage.tsx:183` sends `{ review_status: 'not_candidate' }` through `useReviewLoanTransactionCandidate`.
- Pending state: pass. `frontend/src/features/data/InboxPage.tsx:163` disables account, repayment, link, and dismiss controls while link or review mutation is pending; `frontend/src/features/data/InboxPage.tsx:216` shows `처리 중...`.
- Error state: pass for local patterns. `frontend/src/features/data/InboxPage.tsx:190` uses the same toast error pattern already used by nearby actions.
- Stale cache: pass. `frontend/src/hooks/useTransactions.ts:59` invalidates loan mapping queries, and `frontend/src/hooks/useTransactions.ts:61` matches `useCanonicalViewsDashboard`'s `['canonical-views', 'dashboard']` prefix from `frontend/src/hooks/useCanonicalViews.ts:6`.
- Discoverability: pass. The dismissal action is not hidden in a menu, hover-only affordance, or secondary page.
- Scope control: pass for todo 5. No installment UI was added in `InboxPage.tsx`; `useTransactions.ts` changes are todo-4 contract work.

## Test Quality Review

- `frontend/src/test/features/InboxPage.test.tsx:134` verifies the visible button and mutation payload. This is not tautological because it observes the component boundary rather than checking implementation constants directly.
- `frontend/src/test/features/InboxPage.test.tsx:150` verifies the dismissed candidate disappears and the tab counts update after refreshed data. It does not prove the network refetch by itself, but it does prove the Inbox UI consumes refreshed query data correctly.
- `frontend/src/test/api/contracts.test.ts:324` verifies the hook invalidates loan mapping and canonical-view query prefixes after successful review mutation.
- No deletion-only tests, prompt tests, brittle snapshot assertions, or tests that only mirror a production constant were introduced for todo 5.

## Verification Re-Run

- `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx`
  - pass: `1` file, `5` tests
- `cd frontend && npm test -- --run src/test/api/contracts.test.ts`
  - pass: `1` file, `8` tests
- `cd frontend && npm run typecheck`
  - pass
- `git diff --check`
  - pass

## Final Recommendation

Approve todo 5. Do not block it on `useTransactions.ts`, because that file's changes belong to todo 4 and the relevant invalidation behavior is covered. Do not require an immediate `InboxPage.tsx` split unless the project owner wants literal enforcement of the 250 pure-LOC rule before any further frontend task work. If that enforcement is chosen, extract only `LoanCandidateCard` into `InboxLoanCandidateCard.tsx`.
