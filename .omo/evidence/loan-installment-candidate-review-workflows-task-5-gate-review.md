# Task 5 Gate Review: Inbox Loan Candidate Dismissal

## recommendation

REJECT

## originalIntent

Independently verify `.omo/plans/loan-installment-candidate-review-workflows.md` todo 5: `/data/inbox` loan candidate cards expose a visible `대출 후보 아님` action that sends `review_status: 'not_candidate'`, refreshes the affected inbox data so row/count disappear, uses existing pending/error/disabled patterns, and does not bundle installment UI.

## desiredOutcome

The user should be able to see `대출 후보 아님` directly beside the loan-link action on each loan candidate card, click it, and have the default inbox data refresh so the dismissed candidate and loan count are removed. Todo 8 remains responsible for browser screenshot QA.

## userOutcomeReview

Functional todo-5 evidence is mostly confirmed:

- `frontend/src/features/data/InboxPage.tsx:214-218` renders a visible secondary button labelled `대출 후보 아님` in the same action row as `연결`, not in a hidden menu.
- `frontend/src/features/data/InboxPage.tsx:183-188` calls `review.mutateAsync({ transactionId, data: { review_status: 'not_candidate' } })`.
- `frontend/src/hooks/useTransactions.ts:302-315` invalidates `['transactions', 'loanTransactionMappings']` and `['canonical-views']` after review success.
- `frontend/src/features/data/InboxPage.tsx:163-164` disables controls while link or review mutation is pending; `frontend/src/features/data/InboxPage.tsx:190-192` uses the existing toast error pattern.
- `frontend/src/test/features/InboxPage.test.tsx:134-166` asserts the visible action, mutation payload, and post-refresh disappearance/count update against the component fixture.
- No installment UI was added inside `frontend/src/features/data/InboxPage.tsx`.
- The current shared working tree does contain separate installment UI changes (`frontend/src/features/data/InstallmentsPage.tsx`, `frontend/src/features/data/InstallmentLinksTab.tsx`, and `frontend/src/test/features/InstallmentsPage.test.tsx`). They were treated as dirty-worktree context, not as todo-5 proof.

Browser QA is not treated as a blocker for this todo because the supplied gating model explicitly defers final browser QA to todo 8.

## blockers

1. Missing required code review report artifact for this gate.
   - Checked `.omo/evidence/loan-installment-candidate-review-workflows/` and related `.omo/evidence/*task-5*` paths.
   - Found only `task-5-inbox-dismissal.md`, not a code review report that explicitly covers the `remove-ai-slops` overfit/slop criteria and `programming` TypeScript criteria.
   - The final gate instructions require rejecting when that report coverage is absent or unsupported.

2. Unresolved programming/remove-ai-slops oversized-file defect in current changed production files.
   - `frontend/src/features/data/InboxPage.tsx` is 280 pure LOC now and was 263 pure LOC at `HEAD`; todo 5 adds production lines to an already oversized file.
   - `frontend/src/hooks/useTransactions.ts` is 444 pure LOC now and was 406 pure LOC at `HEAD`; it is part of the current working-tree hook path used by this feature.
   - The `programming` and `remove-ai-slops` criteria treat source files over 250 pure LOC as defects requiring modular refactoring or an explicit accepted exception. No such exception or split evidence is present.

## checkedArtifactPaths

- `.omo/plans/loan-installment-candidate-review-workflows.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-5-inbox-dismissal.md`
- `frontend/src/features/data/InboxPage.tsx`
- `frontend/src/test/features/InboxPage.test.tsx`
- `frontend/src/hooks/useTransactions.ts`
- `frontend/src/api/transactions.ts`
- `frontend/src/types/transaction.ts`
- `frontend/src/test/api/contracts.test.ts`
- `frontend/src/hooks/useCanonicalViews.ts`
- `frontend/src/AGENTS.md`
- `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`
- `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`
- `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/references/typescript/README.md`

## commandEvidence

- `git status --short --branch`: current working tree used; branch `codex/loan-installment-candidate-review-workflows...origin/main` with many unrelated modified/untracked files.
- `cd frontend && npm test -- --run src/test/features/InboxPage.test.tsx`: pass, 1 file, 5 tests.
- `cd frontend && npm run typecheck`: pass.
- `git diff --check`: pass.
- Additional invalidation contract check: `cd frontend && npm test -- --run src/test/api/contracts.test.ts`: pass, 1 file, 8 tests.

## adversarialProbeResults

- `stale_state`: current working tree inspected directly.
- `dirty_worktree`: dirty unrelated files observed, including separate installment UI files; not used as proof of todo 5.
- `misleading_success_output`: direct command outputs inspected.
- `stale_cache/refetch`: hook invalidation and component rerender-after-refreshed-fixture proof present.
- `scope fidelity`: no installment UI in the Inbox component; broader unrelated installment hook/UI/test changes exist in the shared working tree and remain outside this todo-5 verification.
- `visual discoverability`: visible button label in card action row confirmed.
- `malformed_input`: UI hardcodes the typed `not_candidate` payload; no freeform status input on this surface.

## exactEvidenceGaps

- No explicit task-5 code review report with `remove-ai-slops` and `programming` coverage.
- No accepted exception or refactor evidence for the current >250 pure-LOC TypeScript source files touched by this working-tree change.
- Plan todo remains unchecked (`- [ ] 5...`) even though the implementation/evidence claims completion.
