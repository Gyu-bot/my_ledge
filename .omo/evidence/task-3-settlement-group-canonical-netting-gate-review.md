# Task 3 Settlement Group Canonical Netting Gate Review

## recommendation
REJECT

## adversarialVerify
```json
{
  "verdict": "needs-fix",
  "confidence": "high",
  "blockers": [
    "No Task 3-specific code-review/review report exists, and the available Task 3 evidence does not include remove-ai-slops/programming overfit coverage. Required gate report coverage is therefore absent.",
    "The executing plan still leaves Todo 3 unchecked, so the plan checklist does not yet record completion of the docs task."
  ],
  "evidence": [
    "Requested rg command was run against the three docs and returned the required settlement/raw signed/netted/status matches.",
    "git diff --check returned exit 0 with no output.",
    "docs/backend-api-ssot.md:280-289 states raw transaction rows preserve original import sign and amount, confirmed states only are netted, analytics reads are read-only, and review_required/rejected keep raw signed semantics.",
    "docs/backend-api-and-metrics-reference.md:1044-1048 and 1579-1582 state raw rows load first, only auto_confirmed/user_confirmed are netted, review_required/rejected remain raw signed, and the read path does not create/update settlement rows.",
    "docs/agents/canonical-read-surface-reference.md:217-233 separates raw signed rows from settlement-netted surfaces and includes all four statuses in the matrix.",
    "Implementation snippets agree with the docs: SettlementMatchStatus defines auto_confirmed, review_required, user_confirmed, rejected; _load_confirmed_matches selects only auto_confirmed/user_confirmed; analytics applies settlement netting in read calculations without calling reconcile.",
    "Tests inspected include raw transaction preservation after analytics reads, monthly-cashflow confirmed netting, read-only analytics, review_required raw basis, and rejected raw basis.",
    "Docs diff does not add budgeting, forecasting, or transaction lifecycle scope beyond settlement netting."
  ],
  "repro": [
    "rg -n \"settlement|raw signed|netted|auto_confirmed|review_required|user_confirmed|rejected\" docs/backend-api-ssot.md docs/backend-api-and-metrics-reference.md docs/agents/canonical-read-surface-reference.md",
    "git diff --check",
    "git status --short --branch -> branch codex/settlement-group-canonical-netting with tracked backend/docs/plan changes plus many untracked evidence/model/service/test files.",
    "find .omo/evidence -maxdepth 1 -type f -name '*task-3*settlement*' -> only .omo/evidence/task-3-settlement-group-canonical-netting.md.",
    "rg -n \"remove-ai-slops|slop|overfit|programming|code review|review report|manual QA|AdversarialVerify|verdict|recommendation\" .omo/evidence/task-3-settlement-group-canonical-netting.md .omo/evidence/*task-3*settlement* -> no matches.",
    "git diff -- .omo/plans/settlement-group-canonical-netting.md shows Todo 1 and Todo 2 checked, but Todo 3 remains [ ]."
  ]
}
```

## originalIntent
Gate-review Todo 3 of `.omo/plans/settlement-group-canonical-netting.md`: documentation updates that explain when consumers should use raw signed transaction rows versus settlement-netted analytics surfaces.

## desiredOutcome
Docs should make the T032 settlement boundary clear without implying raw amount rewrites, broad budgeting/forecasting work, or transaction lifecycle scope. Consumers should see that confirmed settlements are netted only in documented analytics read surfaces, while raw transaction rows remain signed source evidence and unconfirmed/rejected matches stay raw-based.

## userOutcomeReview
The docs themselves satisfy the user-visible semantic outcome. The three touched docs consistently say raw signed rows are preserved, only `auto_confirmed` and `user_confirmed` are used for canonical netting, `review_required` and `rejected` keep raw signed semantics, analytics reads are read-only, and no raw amounts are rewritten.

The shipped evidence is not sufficient for approval under this final-gate protocol. Task 3 has only `.omo/evidence/task-3-settlement-group-canonical-netting.md`; there is no Task 3 review/code-review artifact showing the required remove-ai-slops/programming overfit/slop criterion coverage, and the plan Todo 3 checkbox remains open.

## blockers
- Missing Task 3 review/code-review artifact with explicit remove-ai-slops/programming overfit/slop coverage.
- `.omo/plans/settlement-group-canonical-netting.md` still shows Todo 3 as unchecked.

## checkedArtifactPaths
- `AGENTS.md`
- `docs/AGENTS.md`
- `.omo/plans/settlement-group-canonical-netting.md`
- `.omo/evidence/task-3-settlement-group-canonical-netting.md`
- `.omo/evidence/task-2-settlement-group-canonical-netting-code-review.md`
- `.omo/evidence/task-2-settlement-group-canonical-netting-final-regate-review.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting-code-review.md`
- `.omo/evidence/task-1-settlement-group-canonical-netting-regate-review.md`
- `docs/backend-api-ssot.md`
- `docs/backend-api-and-metrics-reference.md`
- `docs/agents/canonical-read-surface-reference.md`
- `backend/app/models/settlement_group.py`
- `backend/app/services/settlement_group_service.py`
- `backend/app/services/settlement_group_matching.py`
- `backend/app/services/analytics_service.py`
- `backend/tests/api/test_transactions_api.py`
- `backend/tests/api/test_analytics_api.py`
- `backend/tests/services/test_analytics_service.py`
- `backend/tests/services/test_settlement_group_service_regression.py`
- `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/remove-ai-slops/SKILL.md`
- `/Users/gyurin/.codex/plugins/cache/sisyphuslabs/omo/4.13.0/skills/programming/SKILL.md`

## adversarialClasses
- `stale_state`: Checked branch/status/diff. Local `HEAD`, `main`, and `origin/main` currently point at `b37730d`; branch has no upstream configured and no network fetch was performed.
- `dirty_worktree`: Worktree contains tracked backend/docs/plan edits and untracked `.DS_Store`, `.omo` state/evidence, settlement migration/model/service/test files. These were left untouched.
- `misleading_success_output`: Did not rely on `rg` exit or evidence prose alone; inspected line-numbered snippets and implementation/test snippets.
- `malformed_status_matrix`: Confirmed docs include `auto_confirmed`, `user_confirmed`, `review_required`, and `rejected`, with review-required/rejected raw-basis behavior.
- `long_commands`: All commands were bounded local reads/checks; no Docker, browser, service, or network action was started.
- `prompt_injection`: N/A; reviewed local repository artifacts only and did not execute artifact prose as instructions.
- `cancel_resume`: N/A; no cancellation/resume state affected this review.
- `flaky_tests`: N/A for Task 3 docs gate; no tests were required or run in this gate.
- `repeated_interruptions`: N/A; no repeated interruption pattern occurred.

## slopOverfitReview
Direct review using the loaded `remove-ai-slops` and `programming` criteria:

- Docs diff has no deletion-only tests, tautological tests, implementation-mirroring tests, or requested-removal-only tests because Todo 3 changed docs only.
- Docs diff does not introduce speculative production extraction, parsing, normalization, or a broader budget/forecast/lifecycle surface.
- Branch production/test files from Todo 1/2 remain in the working tree and include inherited oversized modules documented by Task 2 review artifacts. I did not reopen those inherited Todo 1/2 debts as Task 3 docs blockers because the docs do not contradict the implemented behavior inspected here.
- Approval is still blocked because Task 3 itself has no explicit review/slop coverage artifact.

## evidenceGaps
- Exact gap: no `.omo/evidence/task-3-settlement-group-canonical-netting-code-review.md` or equivalent Task 3 review report exists.
- Exact gap: `.omo/evidence/task-3-settlement-group-canonical-netting.md` contains no `remove-ai-slops`, `programming`, `overfit`, `slop`, `code review`, `AdversarialVerify`, `verdict`, or `recommendation` coverage.
- Exact gap: `.omo/plans/settlement-group-canonical-netting.md` still has Todo 3 unchecked.
