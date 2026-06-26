# backend/app Knowledge

Scope: FastAPI application code under `backend/app`.

## Where To Look

| Task | Path |
|---|---|
| App bootstrap | `main.py` |
| API router fan-out | `api/v1/router.py` |
| Endpoint handlers | `api/v1/endpoints/` |
| Request/response contracts | `schemas/` |
| ORM models | `models/` |
| Business logic | `services/` |
| BankSalad parsing | `parsers/` |
| Auth/config | `core/` |

## Rules

- Keep endpoints thin. Put domain behavior in `services/`.
- Every new or changed endpoint needs Pydantic v2 schemas.
- Preserve async SQLAlchemy patterns; do not introduce sync DB access.
- Schema changes require Alembic migrations outside this subtree.
- Write APIs and schema/upload surfaces must respect `X-API-Key`.
- Do not write raw SQL that skips transaction filters unless the task is explicitly about raw evidence.
- Use canonical/read-model services for agent-facing values instead of duplicating formulas in endpoints.

## Finance Gotchas

- Effective transaction category is user override first.
- Exclude deleted and merged transactions from analysis surfaces.
- Positive expense rows are refunds/cancellations, not income.
- Preserve raw upload evidence and user-managed metadata during re-import flows.
- My Ledge returns calculations, candidates, basis, assumptions, and review state; final advice belongs outside the backend.

## Parsing

- Use `openpyxl(..., data_only=True)`.
- BankSalad section positions are marker-driven. Do not hardcode row numbers.
- Missing optional workbook sections should degrade to skipped metadata, not a failed upload, unless the requested feature requires the section.
