# PROJECT KNOWLEDGE BASE

Generated: 2026-06-26
Mode: OMO-first repo governance
Workspace: `/Users/gyurin/dev/my_ledge`

## Overview

My Ledge is a personal finance dashboard backed by BankSalad Excel exports. It tracks transactions, net worth, assets, loans, installments, recurring payments, and agent-facing canonical read surfaces.

Core stack:

- Backend: FastAPI, Pydantic v2, SQLAlchemy async, Alembic, PostgreSQL, `uv`
- Frontend: Vite, React, TypeScript strict, Tailwind, TanStack Query, Vitest
- Data source: encrypted BankSalad workbook, decrypted with `msoffcrypto-tool`, parsed with `openpyxl(data_only=True)`

## Operating Contract

- Respond in Korean when the user writes in Korean.
- Keep edits scoped to the request. Do not add unrelated cleanup.
- Use subagents proactively for independent research, implementation slices, and review passes when their file ownership can stay separate.
- Before changing Docker, local services, network, host ports, or browser targets, inspect current state first.
- Preserve active `honcho-*` services. Avoid host conflicts with `127.0.0.1:8000`, `127.0.0.1:6379`, and `127.0.0.1:5432`.
- For UI/frontend changes, verify in the Codex in-app browser or equivalent visual check when feasible.
- Normalize local browser URLs to explicit `http://...`.
- Do not overwrite, reset, or discard existing user/agent changes.

## Source Of Truth

| Need | Source | Rule |
|---|---|---|
| Repo operating rules | `AGENTS.md` hierarchy | Start here, then nearest child `AGENTS.md` |
| User-facing roadmap/status | `Implentation-plan.md` | Human-readable project status and remaining work; filename spelling is intentional |
| OMO execution plans | `.omo/plans/` | Agent-executable plans with todos, references, acceptance criteria, QA, and commit strategy |
| Live backend/API contract | `docs/backend-api-ssot.md` | Code wins if docs drift |
| Detailed metric/API formulas | `docs/backend-api-and-metrics-reference.md` | Use for implementation/review details |
| Agent read values | `docs/agents/canonical-read-surface-reference.md` | Agent-facing value semantics |
| Frontend UI contract | `docs/frontend-design-tokens.md`, `docs/frontend/components-and-design-token-inventory.md`, `docs/frontend/page-wireframes.md`, `docs/frontend-reimplementation-wireframe-functional-requirements.md` | Current frontend truth |
| Historical context | `docs/archive/**`, `docs/daily/**`, `docs/superpowers/**`, `docs/frontend-remake/**` | Reference only; promote into `Implentation-plan.md` for user visibility or `.omo/plans/` for execution before treating as active |

`docs/STATUS.md` is deprecated. Do not maintain it as a handoff surface.

## OMO Workflow

1. Read this file and the nearest child `AGENTS.md`.
2. Check `git status --short --branch` and protect existing changes.
3. Read `Implentation-plan.md` for user-facing project context: what is done, what remains, and why it matters.
4. For execution, use `.omo/plans/index.md` to choose the relevant `.omo/plans/<slug>.md`; if no suitable plan exists, create one with `omo:ulw-plan` and wait for user approval before execution.
5. For code changes, inspect the live code path before editing. Do not rely on plan text alone.
6. For project work, prefer a focused branch or worktree from latest `origin/main` unless the user explicitly asks for local/mainline edits.
7. Capture completed work in the executing `.omo/plans/<slug>.md` evidence/checklist first; update `Implentation-plan.md` only when the user-facing roadmap/status should change.
8. Feature/fix PR bodies should carry `Summary`, `Verification`, `Plan impact`, and `Contract docs` when relevant.
9. Do not merge PRs or push to `main` without explicit user approval.

## Git And Worktrees

- Before git work, inspect branch, working tree, remote tracking, and latest `origin/main`.
- Base new feature/fix worktrees on latest `origin/main`.
- One session = one worktree = one branch = one PR when practical.
- Split unrelated changes into focused branches. Keep backend/frontend/docs together only when they serve the same user-visible outcome.
- Mainline coordination now flows through `.omo/plans/` for execution and `Implentation-plan.md` for user-facing status, not `docs/STATUS.md`.
- Clean up worktrees/branches only after their PRs are merged and no active session needs them.

Generated/foreign paths to ignore for governance generation: `.git`, `.claude/worktrees`, `.codex`, `.venv`, `.uv-cache`, `node_modules`, `dist`, `build`, `__pycache__`, `.pytest_cache`, `.ruff_cache`.

## Entry Points

| Surface | Path | Notes |
|---|---|---|
| Backend app | `backend/app/main.py` | `create_app()`, CORS, API router |
| Backend router | `backend/app/api/v1/router.py` | `/api/v1` fan-out |
| Backend services | `backend/app/services/` | Core business logic; endpoints should stay thin |
| Backend parsers | `backend/app/parsers/` | BankSalad workbook parsing |
| Frontend app | `frontend/src/App.tsx` | Query client + router provider |
| Frontend router | `frontend/src/router.tsx` | Current IA and legacy redirects |
| Frontend shell | `frontend/src/shell/` | Navigation, layout, theme, write-access badge |
| Frontend DS | `frontend/src/ds/` | Ledger design primitives and charts |

## Commands

```bash
# backend
cd backend && uv run pytest
cd backend && uv run ruff check .
cd backend && uv run ruff format --check .
cd backend && uv run alembic upgrade head

# frontend
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run typecheck
cd frontend && npm run build

# full stack, only after checking honcho/ports
docker compose up -d --build
docker compose ps
```

Backend tests often need a writable local `UV_CACHE_DIR` and test `DATABASE_URL`. Realistic workbook validation should use `tmp/2025-05-21~2026-05-21.xlsx` when present.

## Backend Rules

- Use `uv`; never use `pip`, `pip install`, or `requirements.txt`.
- Schema changes require Alembic migrations. Do not mutate DB schema directly.
- New endpoints require Pydantic v2 request/response schemas.
- Use async DB access with `async/await`.
- Excel parsing must use `openpyxl(..., data_only=True)`.
- Encrypted workbooks must be decrypted before parsing.
- Upload tables are marker-driven; never hardcode BankSalad section row numbers.
- `POST /api/v1/upload`, `GET /api/v1/schema`, and write APIs require `X-API-Key`.
- External agents may read through REST or readonly PostgreSQL. Direct DB writes are forbidden.

## Finance Rules

- Analysis queries exclude deleted and merged transactions: `is_deleted = FALSE` and `merged_into_id IS NULL`.
- Effective category uses user override first: `COALESCE(category_*_user, category_*)`.
- `merchant` is normalized analysis merchant; `description` is raw import text; `memo` is user note.
- `이체` is excluded from income/expense analysis and handled as asset movement.
- Positive `지출` rows are refunds/cancellations and must net against expense where applicable.
- Raw loan, asset, investment, insurance, and upload evidence should be preserved unless the user explicitly requests destructive cleanup.

## Frontend Rules

- TypeScript strict stays on. Do not use `any`, `@ts-ignore`, or class components.
- Use Tailwind and existing Ledger DS primitives. Do not add another CSS framework.
- Prefer shadcn-style chart patterns; use Recharts only where existing patterns require it. Do not add Chart.js, D3, or Nivo.
- Use route/page conventions from `frontend/src/router.tsx` and `frontend/src/features/**`.
- Write UI tests with Vitest, Testing Library, `vi.mock`, and the existing render/query patterns.
- Visual meaning cannot rely on color alone; include sign, icon, or label.
- Estimate color tokens are estimate-only.

## API And Agent Contract

- Live code and `docs/backend-api-ssot.md` beat PRD or archived plans.
- Agent-facing canonical values must explain basis, scope, source, missing reason, and confidence where available.
- My Ledge provides reproducible calculations, candidates, assumptions, settings, and review state. Final financial advice belongs to the consuming agent/user context.
- Do not present `health`, `risk_level`, `confidence`, `priority_score`, or `true_spendable` as final advice without stating the assumptions.

## Child Knowledge Files

Nearest child `AGENTS.md` overrides only within its subtree and must not contradict this root file.

- `backend/app/AGENTS.md`
- `backend/tests/AGENTS.md`
- `frontend/src/AGENTS.md`
- `frontend/src/test/AGENTS.md`
- `docs/AGENTS.md`
