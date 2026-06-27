# SIZE_OK Scope Waiver

Task: `loan-installment-candidate-review-workflows`
Date: 2026-06-27
Reviewer: root orchestrator

## Verdict

SIZE_OK for this task scope.

The final gate flagged large changed production files. The oversized files below are pre-existing shared modules, shared API/type contract surfaces, or narrowly touched pages where splitting during this user-visible workflow would materially increase regression risk. This waiver applies only to this branch and does not bless future growth of these files.

## Current File Sizes

Measured as pure LOC by counting non-empty lines that do not start with `#` or `//`.

```text
$ omo sparkshell python3 - <<'PY'
from pathlib import Path
paths = [
    "backend/app/services/loan_mapping_service.py",
    "frontend/src/hooks/useTransactions.ts",
    "frontend/src/features/data/InboxPage.tsx",
    "frontend/src/api/transactions.ts",
    "frontend/src/types/transaction.ts",
    "frontend/src/features/data/InstallmentLinksTab.tsx",
]
for path in paths:
    count = 0
    for line in Path(path).read_text().splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and not stripped.startswith("//"):
            count += 1
    print(f"{count}\t{path}")
PY
1036    backend/app/services/loan_mapping_service.py
444     frontend/src/hooks/useTransactions.ts
280     frontend/src/features/data/InboxPage.tsx
362     frontend/src/api/transactions.ts
522     frontend/src/types/transaction.ts
261     frontend/src/features/data/InstallmentLinksTab.tsx
```

Follow-up: `InstallmentLinksTab.tsx` is a new task-owned file and is being reduced under the 250 pure-LOC threshold instead of relying on this waiver.

## Diff Scope

```text
$ omo sparkshell git diff --numstat
110  1  backend/app/services/loan_mapping_service.py
42   0  frontend/src/hooks/useTransactions.ts
21   3  frontend/src/features/data/InboxPage.tsx
14   0  frontend/src/api/transactions.ts
67   0  frontend/src/types/transaction.ts
```

## Rationale

- `backend/app/services/loan_mapping_service.py` was already the shared service for loan candidate discovery/linking. The task adds review-state behavior to the same transaction boundary instead of creating a parallel service with duplicated query logic.
- `frontend/src/hooks/useTransactions.ts` is the existing transaction API hook aggregation point. The additions expose new typed hooks around the existing API client pattern and do not introduce new UI behavior inside the hook file.
- `frontend/src/features/data/InboxPage.tsx` received a small visible action and mutation integration in the existing inbox row workflow. Extracting the row during this fix would have mixed a broad component refactor into the requested candidate-dismissal repair.
- `frontend/src/api/transactions.ts` is the existing transaction REST contract client. This task adds only typed client calls/params for the new review/suggestion surfaces.
- `frontend/src/types/transaction.ts` is the existing shared transaction domain type file. This task adds response/request types needed by API, hooks, and contract tests; splitting the domain contract during this workflow would create churn across many imports.
- Larger frontend installment UI code was split into dedicated components: `InstallmentLinksTab.tsx`, `InstallmentMappingsSection.tsx`, and `InstallmentSuggestionCard.tsx`. The new task-owned `InstallmentLinksTab.tsx` is excluded from this waiver once reduced below threshold.

## Follow-Up Debt

Future cleanup can split the loan mapping service into review, candidate listing, and link mutation modules; split the transaction API/type contract files by domain; and split inbox candidate rows into a focused child component. That should be scheduled separately from this bug/feature workflow so it can be covered by dedicated regression tests.
