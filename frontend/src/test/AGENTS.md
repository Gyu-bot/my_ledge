# frontend/src/test Knowledge

Scope: Vitest and Testing Library tests under `frontend/src/test`.

## Where To Look

| Task | Path |
|---|---|
| Test setup | `setup.ts` |
| Router coverage | `router.test.tsx` |
| Feature page tests | `features/` |
| API contract tests | `api/` |
| DS tests | `ds/` |
| Hook tests | `hooks/` |
| Utility tests | `lib/` |

## Test Contract

- Run with `cd frontend && npm test`.
- Use Vitest, jsdom, Testing Library, and `@testing-library/jest-dom`.
- Use `vi.mock` for API hooks and expensive dependencies.
- Use `MemoryRouter`, `createMemoryRouter`, or small render helpers that match the component under test.
- Disable React Query retries in route/page tests when the test owns the query client.
- API contract tests should stub `fetch` and assert URL, method, body, and headers.

## What To Test

- Route availability and legacy redirects.
- User-visible state, labels, filters, previews, and confirmation flows.
- API adapter request/response mapping.
- Financial UI semantics such as signs, source/basis labels, and missing-state messages.
- Regression cases for transaction editing, loan mapping, installments, settings, and data inbox workflows.
