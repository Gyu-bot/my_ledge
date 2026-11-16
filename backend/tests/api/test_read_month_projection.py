"""The focused forecast read wraps the same T064 service without recalculation."""

import sys
from datetime import date
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

from app.services.monthly_projection_service import (  # noqa: E402
    get_monthly_projection,
    resolve_projection_reference_date,
)
from read_surface_ledger import AS_OF, build_read_surface_ledger  # noqa: E402

PATH = "/api/v1/read/month-projection"


@pytest.mark.parametrize("reference_date", [None, date(2026, 7, 15), AS_OF])
async def test_projection_object_is_identical_to_single_service(
    async_client: AsyncClient,
    db_session: AsyncSession,
    api_headers: dict[str, str],
    reference_date: date | None,
):
    await build_read_surface_ledger(db_session)
    if reference_date is None:
        resolved, basis = await resolve_projection_reference_date(db_session)
    else:
        resolved, basis = reference_date, "requested_date"
    expected = await get_monthly_projection(
        db_session, reference_date=resolved, as_of_basis=basis
    )
    response = await async_client.get(
        PATH,
        headers=api_headers,
        params={"reference_date": reference_date.isoformat()} if reference_date else {},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"] == expected.model_dump(mode="json")
    assert body["as_of"]["transaction_as_of"] == AS_OF.isoformat()
    assert body["as_of"]["transaction_as_of_basis"] == "max_effective_transaction_date"
    assert body["data"]["as_of_date"] == resolved.isoformat()
    assert body["data"]["as_of_basis"] == basis
    assert body["data"]["completeness"] is not None
    assert body["period_scope"]["start_period"] == resolved.strftime("%Y-%m")
    assert body["basis"]["definition"] == "monthly_projection (T064)"
    assert "deprecation" not in response.headers


async def test_projection_empty_ledger_has_read_envelope(
    async_client: AsyncClient, api_headers: dict[str, str]
):
    response = await async_client.get(PATH, headers=api_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "not_imported"
    assert response.json()["data"]["as_of_basis"] == "today_no_data"


@pytest.mark.parametrize(
    "params",
    [
        {"unexpected": "x"},
        {"baseline": "wrong"},
        {"reference_date": "2026-02-30"},
        {"reference_date": "not-a-date"},
    ],
)
async def test_projection_unified_422_and_auth_first(
    async_client: AsyncClient, api_headers: dict[str, str], params: dict[str, str]
):
    assert (await async_client.get(PATH, params=params)).status_code == 401
    response = await async_client.get(PATH, params=params, headers=api_headers)
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert isinstance(errors, list) and errors
    assert all({"loc", "type", "msg"} <= error.keys() for error in errors)
