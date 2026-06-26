# backend/tests Knowledge

Scope: backend pytest suite under `backend/tests`.

## Where To Look

| Task | Path |
|---|---|
| Common fixtures | `conftest.py` |
| API tests | `api/` |
| Service tests | `services/` |
| Parser tests | `parsers/` |
| Migration tests | `migrations/` |

## Test Contract

- Use `uv run pytest` from `backend/`.
- Prefer async tests; pytest is configured with `asyncio_mode = "auto"`.
- Reuse `async_client`, `db_session`, `api_headers`, and workbook fixtures from `conftest.py`.
- API tests should exercise HTTP contracts, auth behavior, and response shape.
- Service tests should cover edge cases and domain calculations without duplicating endpoint tests.
- Parser tests should use workbook fixtures and confirm marker-based parsing.

## Fixtures

- `api_headers` carries the test `X-API-Key`.
- Workbook fixtures look for sample files under `tmp/` and may skip when absent.
- Use `tmp_path` and `monkeypatch` for upload retention, env, and filesystem behavior.
- Do not make tests depend on the developer's real `.env` or local database.

## Coverage Priorities

- Upload/re-import lifecycle and raw evidence preservation.
- Canonical cashflow/net-worth calculations.
- Transaction filters, category overrides, refund netting, and source lifecycle.
- Loan mapping, installment linking, asset liquidity metadata, and agent-facing missing-reason metadata.
