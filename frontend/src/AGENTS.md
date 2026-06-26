# frontend/src Knowledge

Scope: Vite React application source under `frontend/src`.

## Where To Look

| Task | Path |
|---|---|
| App provider shell | `App.tsx` |
| Routes and redirects | `router.tsx` |
| Layout/navigation | `shell/` |
| Feature pages | `features/` |
| API clients | `api/` |
| React Query hooks | `hooks/` |
| Ledger DS primitives | `ds/` |
| Shared utilities | `lib/` |
| Shared types | `types/` |

## Rules

- Keep TypeScript strict. Do not use `any`, `@ts-ignore`, or class components.
- Put server-state access behind API clients and React Query hooks.
- Keep route definitions and legacy redirects centralized in `router.tsx`.
- Use `shell/navigation.ts` for nav labels and active-state behavior.
- Prefer existing Ledger DS primitives before adding page-local UI.
- Do not add a new CSS framework.
- For charts, use existing DS/Recharts patterns already in the app.

## UI Contract

- Operational screens should be dense, scannable, and work-focused.
- Preserve visible signs/labels for financial meaning; do not rely on color alone.
- Use estimate tokens only for estimates.
- Keep dangerous actions behind preview/confirmation flows.
- Frontend changes need Vitest/lint/typecheck and a browser or equivalent visual check when feasible.

## Runtime

- API calls normally go through the Vite proxy or deployed `/api` proxy.
- `VITE_API_KEY` may come from runtime config or env fallback.
- Local browser targets must use explicit `http://...` URLs.
