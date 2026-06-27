# F4 Scope Fidelity Evidence

Task: `loan-installment-candidate-review-workflows`
Date: 2026-06-27
Reviewer: root orchestrator

## Verdict

PASS.

The implemented work stays within the user's requested scope:

- Inbox loan candidates can now be explicitly dismissed as `대출 후보 아님`.
- Dismissed loan candidates disappear from the default inbox/count surfaces while remaining recoverable/auditable through explicit review filters.
- Installment transaction suggestions are read-only recommendations derived from plan/link evidence and expose proposed installment numbers.
- Spending category month-over-month values now use signed previous-month deltas and percent changes, with regression evidence for `+₩5만`, `+50.0%`.
- No automatic installment linking was introduced.
- No destructive transaction, loan snapshot, asset, investment, or raw upload cleanup was introduced.
- No loan-account hide/deactivate substitute was introduced for this task.
- `docs/STATUS.md` remains untouched.

## Current Scope Checks

Command evidence:

```text
$ omo sparkshell git diff -- docs/STATUS.md
<no output>
```

Tracked changed files are limited to the active OMO state/plan/evidence references, the user-facing implementation plan, backend API/model/schema/service/tests for loan/installment workflows, backend API docs, and frontend transaction/inbox/installment/spending contract surfaces.

Known unrelated untracked clutter remains intentionally unstaged and must not be swept into the final commit:

- `.DS_Store`
- `.omo/.DS_Store`
- `docs/.DS_Store`
- older `.omo/evidence/transaction-source-upload-reconciliation*`
- `.omo/evidence/original-frontend-requirements-manual-qa/`

## Evidence Cross-References

- Functional backend and filtering evidence: `task-1-backend-loan-review-api.md`, `task-1-backend-loan-review-api-fix.md`, `task-2-loan-filtering.md`, `task-3-installment-suggestions-api.md`
- Frontend behavior evidence: `task-4-frontend-contracts.md`, `task-5-inbox-dismissal.md`, `task-6-installment-suggestions.md`
- Integrated browser/API QA evidence: `task-8-integrated-qa.md`, `task-8-f1-fixes.md`, `task-8-alembic-postgres-upgrade.md`, `f3-real-manual-qa.md`
- Final global QA/security/context lanes: `global-review-lane-2-qa-verification.md`, plus the lane security and context reviewer final reports in thread history.
