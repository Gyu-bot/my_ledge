# Task 6 Gate Review - Installment Suggestion UI

recommendation: APPROVE

blockers: []

originalIntent: Verify todo 6 for `/data/installments` installment suggestion UI with proposed 회차 linking. Final browser QA is deferred to todo 8; todo 6 needs component/test proof and no obvious UI omission.

desiredOutcome: The current working tree should show an installment suggestion section/table using the suggestion hook, display plan/merchant/deltas/confidence/reasons/proposed 회차/conflict state, link manually through the existing installment link mutation using the suggested number with override support, avoid auto-linking, disable or label conflict rows, and invalidate/refetch enough state after linking.

userOutcomeReview: Confirmed for todo 6 implementation proof. The UI is present under the `/data/installments` 거래 연결 tab, uses `useInstallmentTransactionSuggestions`, renders the requested columns/labels, disables conflict/unusable rows, and manually calls `useLinkTransactionToInstallment` with the suggested installment number. The tests exercise no auto-link, conflict disabled state, mutation payload, suggestion/list/forecast invalidation, and refetch after link. Browser QA remains intentionally deferred to todo 8.

checkedArtifactPaths:
- `.omo/plans/loan-installment-candidate-review-workflows.md`
- `.omo/evidence/loan-installment-candidate-review-workflows/task-6-installment-suggestions.md`
- `frontend/src/features/data/InstallmentsPage.tsx`
- `frontend/src/features/data/InstallmentLinksTab.tsx`
- `frontend/src/features/data/InstallmentSuggestionCard.tsx`
- `frontend/src/features/data/InstallmentMappingsSection.tsx`
- `frontend/src/test/features/InstallmentsPage.test.tsx`
- `frontend/src/hooks/useTransactions.ts`
- `frontend/src/api/transactions.ts`
- `frontend/src/types/transaction.ts`
- `frontend/src/AGENTS.md`
- `frontend/src/test/AGENTS.md`

verificationCommands:
- `cd frontend && npm test -- --run src/test/features/InstallmentsPage.test.tsx`: PASS, 3 tests.
- `cd frontend && npm run typecheck`: PASS.
- `git diff --check`: PASS.

adversarialProbes:
- stale_state: PASS. Test asserts post-link suggestion row disappears after refetch.
- dirty_worktree: HUMAN-CONTEXT. Current tree has many modified/untracked files from other todos, including backend and Inbox work; todo 6-specific files are identifiable, but the branch is not isolated.
- misleading_success_output: PASS. Executor claims matched direct command reruns and source inspection.
- malformed_input_conflict_unusable_row: PASS. `!is_usable` or `conflict_reason` marks the row as conflict and disables input/action.
- stale_cache_after_link: PASS. Link success invalidates `transactions`, `installmentTransactionMappings`, `installmentForecast`, and `installmentTransactionSuggestions`; test proves active refetches occur.
- no_auto_link_read_only_ui: PASS. Link mutation is only called from click handlers; suggestion controls disable under `!hasWrite`.
- scope_fidelity_no_inbox_backend_changes: MIXED. Current working tree includes backend and Inbox changes, but those are outside the claimed todo 6 changed file set and appear related to other plan todos.
- visual_clarity_reason_labels_summary_stat: ACCEPTED_RISK. Reason badges expose backend labels such as `same_merchant`; the top `연결 후보` stat still reflects mapping total, not suggestion total. Neither is an obvious todo 6 omission because the suggestion card itself has its own count and reason badges.

slopAndProgrammingReview:
- No `any`, `@ts-ignore`, `@ts-expect-error`, debug `console.log`, or empty catch found in todo 6 changed TypeScript files.
- Pure LOC checks were under the 250-line threshold for the new/extracted files inspected.
- Tests are behavior-oriented, not deletion-only or tautological: visible labels, disabled conflict action, mutation payload, invalidation keys, and refetch outcomes are asserted.

evidenceGaps:
- Browser screenshot and post-link visual QA are not present here, but explicitly deferred to todo 8 by the user's gating model.
- Override is visible in code through the editable proposed 회차 input, but no test changes the default value before linking.
- The plan checkbox for todo 6 is still unchecked in `.omo/plans/loan-installment-candidate-review-workflows.md`; this is a status artifact gap, not a component/test blocker.
