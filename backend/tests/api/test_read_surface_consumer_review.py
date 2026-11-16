"""Consumer review of the read surface: one regression test per finding.

Synthetic ledgers only. Each test failed on the code before the fix.
"""

import sys
from datetime import date, time
from decimal import Decimal
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

from app.main import app  # noqa: E402
from app.models.nature_axes import CategoryAdjustabilityDefault  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from read_surface_ledger import build_read_surface_ledger  # noqa: E402

READ_PATHS = [
    "/api/v1/read/index",
    "/api/v1/read/monthly-flow",
    "/api/v1/read/spend-cube",
    "/api/v1/read/comparison/monthly-flow",
    "/api/v1/read/comparison/contributions",
    "/api/v1/read/review-items",
    "/api/v1/read/commitments",
    "/api/v1/read/data-status",
]
NET_WORTH_PATHS = [
    "/api/v1/metrics/net-worth/intervals",
    "/api/v1/metrics/net-worth/reconciliation",
    "/api/v1/metrics/net-worth/emergency-fund",
]


def _tx(on: date, amount: int, *, category: str, merchant: str = "shop-a"):
    return Transaction(
        date=on,
        time=time(12, 0),
        type="지출",
        category_major=category,
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency="KRW",
    )


def _assert_validation_body(body: dict) -> None:
    """FastAPI HTTPValidationError shape: detail = [{loc, msg, type, ...}]."""
    assert isinstance(body["detail"], list) and body["detail"], body
    for error in body["detail"]:
        assert isinstance(error["loc"], list) and error["loc"][0] == "query"
        assert isinstance(error["msg"], str) and error["msg"]
        assert isinstance(error["type"], str) and error["type"]


# --------------------------------------------------------------------------
# Finding 2: wrong filter values and unknown parameters are rejected.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "params",
    [
        {"adjustability": "bogus"},
        {"payment_form": "bogus"},
        {"commitment_kind": "bogus"},
        {"flow_row": "bogus"},
        {"adjustability": "not_applicable"},
    ],
)
async def test_spend_cube_rejects_unknown_filter_values(
    async_client: AsyncClient, api_headers: dict[str, str], params: dict[str, str]
):
    response = await async_client.get(
        "/api/v1/read/spend-cube", headers=api_headers, params=params
    )
    assert response.status_code == 422, response.text
    body = response.json()
    _assert_validation_body(body)
    (name,) = params
    assert body["detail"][0]["loc"] == ["query", name]
    assert "Input should be" in body["detail"][0]["msg"]


@pytest.mark.parametrize(
    ("path", "params", "unknown"),
    [
        (
            "/api/v1/read/monthly-flow",
            {"start_date": "2026-03-01", "end_date": "2026-03-31"},
            ["end_date", "start_date"],
        ),
        ("/api/v1/read/data-status", {"period": "2026-01"}, ["period"]),
        ("/api/v1/read/index", {"verbose": "1"}, ["verbose"]),
        ("/api/v1/read/commitments", {"limit": "5"}, ["limit"]),
    ],
)
async def test_read_surface_rejects_unknown_query_parameters(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    path: str,
    params: dict[str, str],
    unknown: list[str],
):
    response = await async_client.get(path, headers=api_headers, params=params)
    assert response.status_code == 422, response.text
    body = response.json()
    _assert_validation_body(body)
    assert [error["loc"][1] for error in body["detail"]] == unknown
    assert all(error["type"] == "extra_forbidden" for error in body["detail"])
    assert all("allowed" in error["ctx"] for error in body["detail"])


async def test_unknown_parameter_check_runs_after_authentication(
    async_client: AsyncClient,
):
    response = await async_client.get(
        "/api/v1/read/monthly-flow", params={"start_date": "2026-03-01"}
    )
    assert response.status_code == 401


async def test_transaction_axis_filters_reject_unknown_values(
    async_client: AsyncClient,
):
    for name in ("flow_row", "payment_form", "adjustability"):
        response = await async_client.get(
            "/api/v1/transactions", params={name: "bogus"}
        )
        assert response.status_code == 422, (name, response.text)
        error = response.json()["detail"][0]
        assert error["loc"] == ["query", name]
        assert error["ctx"]["expected"]


async def test_frontend_read_calls_still_pass_validation(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    """The parameters frontend/src/api sends to /read/* stay accepted."""
    await build_read_surface_ledger(db_session)
    calls = [
        ("/api/v1/read/review-items", {"period": "2026-07", "limit": "50"}),
        ("/api/v1/read/review-items", {}),
        ("/api/v1/read/commitments", {"period": "2026-07"}),
        ("/api/v1/read/commitments", {}),
        ("/api/v1/read/data-status", {}),
    ]
    for path, params in calls:
        response = await async_client.get(path, headers=api_headers, params=params)
        assert response.status_code == 200, (path, response.text)


# --------------------------------------------------------------------------
# Finding 10: every 422 of /read/* and /metrics/net-worth/* has one shape.
# --------------------------------------------------------------------------


async def test_all_read_and_net_worth_422_bodies_share_one_shape(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    db_session.add(_tx(date(2026, 1, 15), -1_000, category="category-a"))
    await db_session.commit()
    cases = [
        ("/api/v1/read/spend-cube", {"group_by": "bogus"}, "group_by"),
        ("/api/v1/read/monthly-flow", {"start_period": "bad"}, "start_period"),
        (
            "/api/v1/read/monthly-flow",
            {"start_period": "2026-03", "end_period": "2026-01"},
            "end_period",
        ),
        ("/api/v1/read/comparison/monthly-flow", {"period": "2030-01"}, None),
        (
            "/api/v1/metrics/net-worth/reconciliation",
            {"start_date": "2026-01-01"},
            "end_date",
        ),
        (
            "/api/v1/metrics/net-worth/reconciliation",
            {"start_date": "2026-01-01", "end_date": "2026-02-01"},
            "start_date",
        ),
        ("/api/v1/metrics/net-worth/intervals", {"limit": "0"}, "limit"),
    ]
    for path, params, param in cases:
        response = await async_client.get(path, headers=api_headers, params=params)
        assert response.status_code == 422, (path, params, response.text)
        body = response.json()
        _assert_validation_body(body)
        if param is not None:
            assert body["detail"][0]["loc"] == ["query", param], (path, body)


def test_openapi_declares_validation_error_for_read_and_net_worth_paths():
    schema = app.openapi()
    for path in READ_PATHS + NET_WORTH_PATHS:
        responses = schema["paths"][path]["get"]["responses"]
        assert "422" in responses, path
        ref = responses["422"]["content"]["application/json"]["schema"]["$ref"]
        assert ref.endswith("/HTTPValidationError"), (path, ref)
    error = schema["components"]["schemas"]["ValidationError"]
    assert {"loc", "msg", "type"} <= set(error["required"])


__all__ = ["CategoryAdjustabilityDefault", "Decimal"]
