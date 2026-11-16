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


# --------------------------------------------------------------------------
# Finding 1: completeness measures that payments and refunds cannot cancel.
# --------------------------------------------------------------------------


async def _seed_offsetting_undecided(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            CategoryAdjustabilityDefault(
                category_major="cat-protected", adjustability="protected"
            ),
            _tx(date(2026, 1, 31), -10_000, category="cat-protected"),
            # 2026-02: undecided refunds exceed undecided payments.
            _tx(date(2026, 2, 3), -1_000, category="cat-undecided", merchant="m-u"),
            _tx(date(2026, 2, 4), 5_000, category="cat-undecided", merchant="m-u"),
            _tx(date(2026, 2, 5), -20_000, category="cat-protected"),
            # 2026-03: an undecided payment and refund offset each other.
            _tx(date(2026, 3, 3), -7_000, category="cat-undecided2", merchant="m-v"),
            _tx(date(2026, 3, 4), 7_000, category="cat-undecided2", merchant="m-v"),
            _tx(date(2026, 3, 5), -20_000, category="cat-protected"),
            _tx(date(2026, 3, 31), -1_000, category="cat-protected"),
        ]
    )
    await db_session.commit()


async def test_offsetting_undecided_rows_never_read_as_complete(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await _seed_offsetting_undecided(db_session)

    async def flow(period: str) -> dict:
        response = await async_client.get(
            "/api/v1/read/monthly-flow",
            headers=api_headers,
            params={"start_period": period, "end_period": period},
        )
        assert response.status_code == 200, response.text
        return response.json()

    march = await flow("2026-03")
    classification = march["classification"]
    assert classification["adjustability_undecided_total"] == 0  # net, unchanged
    assert classification["adjustability_undecided_transaction_count"] == 2
    assert classification["adjustability_undecided_gross_total"] == 14_000
    assert classification["expense_gross_total"] == 35_000
    assert classification["adjustability_undecided_gross_share"] == 0.4
    assert classification["complete"] is False
    assert march["status"] == "classification_incomplete"
    state = march["period_scope"]["periods"][0]
    assert state["status"] == "classification_incomplete"
    assert state["adjustability_undecided_transaction_count"] == 2

    february = await flow("2026-02")
    # The net share stays signed (documented); the gross share is 0–1.
    assert february["classification"]["adjustability_undecided_share"] < 0
    assert 0 < february["classification"]["adjustability_undecided_gross_share"] <= 1
    assert "classification_completeness" in february["basis"]["rules"]

    status = (
        await async_client.get("/api/v1/read/data-status", headers=api_headers)
    ).json()
    completeness = status["data"]["classification"]
    assert completeness["adjustability_undecided_transaction_count"] == 4
    assert completeness["adjustability_undecided_gross_total"] == 20_000
    assert 0 <= completeness["adjustability_undecided_gross_share"] <= 1
    assert 0 <= completeness["adjustability_decided_gross_share"] <= 1
    assert status["classification"]["complete"] is False

    cube = (
        await async_client.get(
            "/api/v1/read/spend-cube",
            headers=api_headers,
            params={"start_period": "2026-03", "end_period": "2026-03"},
        )
    ).json()
    assert cube["classification"]["complete"] is False
    assert cube["classification"]["adjustability_undecided_transaction_count"] == 2


# --------------------------------------------------------------------------
# Finding 3 / 5 / 12 (contributions): truncation is visible, sums are stated,
# and one list can be requested alone.
# --------------------------------------------------------------------------


async def test_contribution_lists_state_truncation_and_remainder(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await build_read_surface_ledger(db_session)
    path = "/api/v1/read/comparison/contributions"
    full = (
        await async_client.get(
            path, headers=api_headers, params={"period": "2026-07", "limit": 1000}
        )
    ).json()["data"]
    cut = (
        await async_client.get(
            path, headers=api_headers, params={"period": "2026-07", "limit": 2}
        )
    ).json()["data"]
    total = len(full["items"])
    assert total > 2
    summary = cut["items_summary"]
    assert summary["requested"] is True
    assert summary["total_count"] == total
    assert summary["returned_count"] == len(cut["items"]) == 2
    assert summary["truncated"] is True
    changes = [item["change_amount"] or 0 for item in full["items"]]
    assert summary["returned_change_amount_sum"] == sum(changes[:2])
    assert summary["not_returned_change_amount_sum"] == sum(changes[2:])
    targets = [item["target_amount"] for item in full["items"]]
    assert summary["returned_target_amount_sum"] == sum(targets[:2])
    assert summary["not_returned_target_amount_sum"] == sum(targets[2:])
    assert full["items_summary"]["truncated"] is False
    twelve = cut["twelve_month_items_summary"]
    assert twelve["total_count"] == len(full["twelve_month_items"])

    # Finding 5: per-item changes are not a decomposition of the total.
    assert cut["sum_item_changes"] == sum(changes)
    assert cut["non_additive_gap"] == cut["change_total"] - sum(changes)
    body = (
        await async_client.get(path, headers=api_headers, params={"period": "2026-07"})
    ).json()
    assert "자신의 기준값" in body["basis"]["rules"]["contributions_additivity"]

    only_monthly = (
        await async_client.get(
            path,
            headers=api_headers,
            params={"period": "2026-07", "lists": "monthly"},
        )
    ).json()["data"]
    assert only_monthly["twelve_month_items"] == []
    assert only_monthly["twelve_month_items_summary"]["requested"] is False
    assert only_monthly["items"] == body["data"]["items"]
    only_twelve = (
        await async_client.get(
            path,
            headers=api_headers,
            params={"period": "2026-07", "lists": "twelve_month"},
        )
    ).json()["data"]
    assert only_twelve["items"] == []
    assert only_twelve["items_summary"]["requested"] is False
    assert only_twelve["items_summary"]["total_count"] == total
    bad = await async_client.get(path, headers=api_headers, params={"lists": "bogus"})
    assert bad.status_code == 422


# --------------------------------------------------------------------------
# Finding 4: data coverage per month next to the calendar status.
# --------------------------------------------------------------------------


async def test_month_data_coverage_separates_mid_month_start_and_gaps(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await _seed_offsetting_undecided(db_session)  # first transaction 2026-01-31
    status = (
        await async_client.get("/api/v1/read/data-status", headers=api_headers)
    ).json()
    periods = {item["period"]: item for item in status["data"]["periods"]}
    january = periods["2026-01"]
    assert january["month_status"] == "closed"  # calendar status unchanged
    assert january["data_coverage"] == "partial"
    assert january["data_coverage_reasons"] == ["first_month_starts_mid_month"]
    assert periods["2026-03"]["data_coverage"] == "full"
    assert "month_data_coverage" in status["basis"]["rules"]
    assert status["labels"]["data_coverage.partial"]

    comparison = (
        await async_client.get(
            "/api/v1/read/comparison/monthly-flow",
            headers=api_headers,
            params={"period": "2026-01"},
        )
    ).json()["data"]["comparison"]
    assert comparison["target_coverage"] == "observed"  # unchanged meaning
    assert comparison["target_data_coverage"] == "partial"
    assert (
        comparison["data_coverage_rule"]
        == status["basis"]["rules"]["month_data_coverage"]
    )


async def test_gap_month_is_marked_as_inferred(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await build_read_surface_ledger(db_session)
    status = (
        await async_client.get("/api/v1/read/data-status", headers=api_headers)
    ).json()
    periods = {item["period"]: item for item in status["data"]["periods"]}
    assert periods["2025-09"]["data_coverage"] == "no_transactions_observed"
    assert periods["2026-08"]["data_coverage"] == "partial"
    assert periods["2026-08"]["data_coverage_reasons"] == ["data_ends_before_month_end"]
    assert periods["2025-01"]["data_coverage"] == "full"
    (gap,) = status["data"]["coverage_gaps"]
    assert gap["inferred"] is True
    assert gap["data_coverage"] == "no_transactions_observed"
    future = (
        await async_client.get(
            "/api/v1/read/monthly-flow",
            headers=api_headers,
            params={"start_period": "2026-09", "end_period": "2026-09"},
        )
    ).json()
    assert future["period_scope"]["periods"][0]["data_coverage"] == "outside_data"


# --------------------------------------------------------------------------
# Finding 13 / 14: the full-month flag and the previous-month baseline.
# --------------------------------------------------------------------------


async def test_full_month_flag_is_false_without_baseline(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await _seed_offsetting_undecided(db_session)
    comparison = (
        await async_client.get(
            "/api/v1/read/comparison/monthly-flow",
            headers=api_headers,
            params={"period": "2026-01"},
        )
    ).json()["data"]["comparison"]
    assert comparison["baseline_month_count"] == 0
    assert comparison["previous_full_month_delta_available"] is False
    assert comparison["baseline_unavailable_reason"] == "data_start"


async def test_previous_month_baseline_equals_difference_of_two_months(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await build_read_surface_ledger(db_session)
    path = "/api/v1/read/comparison/monthly-flow"
    default = (
        await async_client.get(path, headers=api_headers, params={"period": "2026-07"})
    ).json()
    explicit = (
        await async_client.get(
            path,
            headers=api_headers,
            params={"period": "2026-07", "baseline": "median_of_recent_closed_months"},
        )
    ).json()
    assert explicit == default
    previous = (
        await async_client.get(
            path,
            headers=api_headers,
            params={"period": "2026-07", "baseline": "previous_month"},
        )
    ).json()
    comparison = previous["data"]["comparison"]
    assert comparison["baseline_method"] == "previous_month"
    assert comparison["baseline_periods"] == ["2026-06"]
    assert comparison["previous_full_month_delta_available"] is True
    assert "previous_month" in previous["basis"]["rules"]["baseline"]
    flow = (
        await async_client.get(
            "/api/v1/read/monthly-flow",
            headers=api_headers,
            params={"start_period": "2026-06", "end_period": "2026-07"},
        )
    ).json()
    months = {item["period"]: item for item in flow["data"]["items"]}
    for measure in previous["data"]["measures"]:
        key = measure["key"]
        assert measure["target_amount"] == months["2026-07"][key], key
        assert measure["baseline_amount"] == months["2026-06"][key], key
        assert measure["change_amount"] == (
            months["2026-07"][key] - months["2026-06"][key]
        )

    contributions = (
        await async_client.get(
            "/api/v1/read/comparison/contributions",
            headers=api_headers,
            params={"period": "2026-07", "baseline": "previous_month", "limit": 1000},
        )
    ).json()["data"]
    cube = (
        await async_client.get(
            "/api/v1/read/spend-cube",
            headers=api_headers,
            params={"group_by": "period,effective_category_major", "limit": 2000},
        )
    ).json()["data"]["rows"]
    by_month = {
        (row["period"], row["effective_category_major"]): row["amount"] for row in cube
    }
    for item in contributions["items"]:
        assert item["target_amount"] == by_month.get(("2026-07", item["category"]), 0)
        assert item["baseline_amount"] == by_month.get(("2026-06", item["category"]), 0)
    assert contributions["change_total"] == sum(
        amount for (period, _), amount in by_month.items() if period == "2026-07"
    ) - sum(amount for (period, _), amount in by_month.items() if period == "2026-06")
    assert contributions["sum_item_changes"] == contributions["change_total"]
    assert contributions["non_additive_gap"] == 0


async def test_previous_month_baseline_is_withheld_when_unusable(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await build_read_surface_ledger(db_session)
    path = "/api/v1/read/comparison/monthly-flow"
    after_gap = (
        await async_client.get(
            path,
            headers=api_headers,
            params={"period": "2025-10", "baseline": "previous_month"},
        )
    ).json()["data"]
    comparison = after_gap["comparison"]
    assert comparison["baseline_periods"] == []
    assert comparison["baseline_status"] == "none"
    assert comparison["baseline_unavailable_reason"] == "no_data"
    assert [item["period"] for item in comparison["skipped_periods"]] == ["2025-09"]
    assert comparison["previous_full_month_delta_available"] is False
    assert all(item["baseline_amount"] is None for item in after_gap["measures"])
    assert all(item["change_amount"] is None for item in after_gap["measures"])
    first = (
        await async_client.get(
            path,
            headers=api_headers,
            params={"period": "2025-01", "baseline": "previous_month"},
        )
    ).json()["data"]["comparison"]
    assert first["baseline_unavailable_reason"] == "data_start"
    in_progress = (
        await async_client.get(
            path,
            headers=api_headers,
            params={"period": "2026-08", "baseline": "previous_month"},
        )
    ).json()["data"]["comparison"]
    assert in_progress["baseline_periods"] == ["2026-07"]
    assert in_progress["partial_month_handling"] == "same_elapsed_days"
    assert in_progress["previous_full_month_delta_available"] is False
    bad = await async_client.get(path, headers=api_headers, params={"baseline": "x"})
    assert bad.status_code == 422
    assert bad.json()["detail"][0]["loc"] == ["query", "baseline"]
