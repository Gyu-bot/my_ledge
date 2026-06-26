# docs Knowledge

Scope: project documentation under `docs`.

## Source Types

| Type | Files | Rule |
|---|---|---|
| Live backend/API contract | `backend-api-ssot.md` | Keep aligned with current code |
| Detailed formulas/reference | `backend-api-and-metrics-reference.md` | Use for implementer/reviewer details |
| Agent docs | `agents/**`, `agent-integration/**` | Preserve read/write boundary and value semantics |
| Frontend contract | `frontend-design-tokens.md`, `frontend/**`, `frontend-reimplementation-wireframe-functional-requirements.md` | Keep aligned with current frontend |
| Deprecated status | `STATUS.md` | Pointer only; do not revive as handoff |
| Archive/history | `archive/**`, `daily/**`, `superpowers/**`, `frontend-remake/**` | Reference only |

## Rules

- Do not treat archived checklists as active work. Promote relevant user-facing work into `../Implentation-plan.md`, and executor-ready work into `../.omo/plans/`.
- Contract docs should change with code when endpoint, schema, canonical value, route, or component behavior changes.
- Broad planning/governance changes should update `../AGENTS.md`, user-facing status in `../Implentation-plan.md`, and execution plans under `../.omo/plans/` when relevant.
- Keep agent docs clear that direct DB writes are forbidden and write actions use authenticated APIs.
- Never document secrets, API keys, DB passwords, or Excel passwords.

## OMO Plan Linkage

- `../Implentation-plan.md` owns the user-facing roadmap/status.
- `../.omo/plans/` owns agent-executable plan status and sequencing.
- `STATUS.md` is deprecated and should only point readers to current sources.
- PRs should describe plan impact when they complete, split, block, or discover work packages.
