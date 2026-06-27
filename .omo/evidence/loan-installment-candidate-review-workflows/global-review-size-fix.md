# Global Review Size Fix

Date: 2026-06-27
Task: `loan-installment-candidate-review-workflows`

## Scope

- `frontend/src/features/data/InstallmentLinksTab.tsx`
- `frontend/src/features/data/InstallmentSuggestionCard.tsx`

No test file updates were required.

## Pure LOC Method

Measured with:

```bash
awk '!/^[[:space:]]*$/ && !/^[[:space:]]*(\/\/|#|--)/' frontend/src/features/data/InstallmentLinksTab.tsx | wc -l
```

- Before: `261`
- After: `250`

## Behavior Preservation Notes

- Preserved duplicate suggestion identity by keeping suggestion-row keys scoped to `transaction_id + installment_plan_id`.
- Reduced `InstallmentLinksTab.tsx` size by:
  - sharing installment link save toast/mutation logic inside the tab,
  - moving only the suggestion draft type export to `InstallmentSuggestionCard.tsx`,
  - keeping the suggestion key helper local so React Fast Refresh lint stays clean.

## Changed Files

- `frontend/src/features/data/InstallmentLinksTab.tsx`
- `frontend/src/features/data/InstallmentSuggestionCard.tsx`
- `.omo/evidence/loan-installment-candidate-review-workflows/global-review-size-fix.md`

## Command Results

### `cd frontend && npm test -- --run src/test/features/InstallmentsPage.test.tsx`

```text
> my_ledge-frontend@0.1.0 test
> node -e "const { spawnSync } = require('node:child_process'); const args = process.argv.slice(1).filter((arg) => arg !== '--runInBand'); const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'; const result = spawnSync(command, ['vitest', 'run', ...args], { stdio: 'inherit' }); process.exit(result.status ?? 1);" -- --run src/test/features/InstallmentsPage.test.tsx

 RUN  v2.1.9 /Users/gyurin/dev/my_ledge/frontend

 ✓ src/test/features/InstallmentsPage.test.tsx (4 tests) 160ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  23:40:56
   Duration  975ms (transform 103ms, setup 73ms, collect 234ms, tests 160ms, environment 291ms, prepare 37ms)
```

### `cd frontend && npm run typecheck`

```text
> my_ledge-frontend@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit
```

Exit code: `0`

### `cd frontend && npm run lint`

```text
> my_ledge-frontend@0.1.0 lint
> eslint . --max-warnings 0
```

Exit code: `0`

### `git diff --check`

```text
(no output)
```

Exit code: `0`
