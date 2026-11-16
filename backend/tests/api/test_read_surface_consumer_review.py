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
from app.models.asset_snapshot import AssetSnapshot  # noqa: E402
from app.models.investment import Investment  # noqa: E402
from app.models.loan import Loan  # noqa: E402
from app.models.nature_axes import (  # noqa: E402
    CategoryAdjustabilityDefault,
    RecurringCommitment,
)
from app.models.transaction import Transaction  # noqa: E402
from app.services.monthly_projection_service import (  # noqa: E402
    get_monthly_projection,
)
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


# --------------------------------------------------------------------------
# Finding 9: end-date status and the origin of a loan's monthly payment.
# --------------------------------------------------------------------------


async def test_commitment_end_date_status_and_burden_origin(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await build_read_surface_ledger(db_session)
    db_session.add(
        RecurringCommitment(
            label="n-times-a",
            match_scope="merchant",
            merchant="service-n",
            category_major="category-10",
            cycle="n_times",
            total_count=3,
            origin="user",
        )
    )
    await db_session.commit()
    items = {
        item["commitment_key"]: item
        for item in (
            await async_client.get("/api/v1/read/commitments", headers=api_headers)
        ).json()["data"]["items"]
    }
    loan = items["loan:1"]
    assert loan["end_date_status"] == "recorded"
    assert loan["monthly_burden_basis"] == "recorded_monthly_payment"
    assert loan["monthly_burden_origin"] == "entered_by_person"
    assert loan["monthly_burden_origin_label"]
    assert items["installment:1"]["end_date_status"] == "recorded"
    assert items["installment:1"]["monthly_burden_origin"] == "installment_plan_record"
    monthly = items["recurring:1"]
    assert monthly["end_date"] is None
    assert monthly["end_date_status"] == "open_ended"
    assert monthly["monthly_burden_origin"] == "observed_closed_month"
    n_times = items["recurring:4"]
    assert n_times["end_date"] is None
    assert n_times["end_date_status"] == "not_applicable"
    for item in items.values():
        assert item["end_date_status_label"] and item["end_date_reason"]

    # A later snapshot whose monthly payment was estimated, without maturity.
    db_session.add(
        Loan(
            snapshot_date=date(2026, 7, 31),
            lender="lender-a",
            product_name="loan-product-a",
            balance=Decimal("1"),
            monthly_payment=Decimal(450_000),
            monthly_payment_source="estimated_from_linked_transactions",
        )
    )
    await db_session.commit()
    loan = [
        item
        for item in (
            await async_client.get("/api/v1/read/commitments", headers=api_headers)
        ).json()["data"]["items"]
        if item["kind"] == "loan"
    ][0]
    assert loan["monthly_burden_basis"] == "recorded_monthly_payment"
    assert loan["monthly_burden_source"] == "estimated_from_linked_transactions"
    assert loan["monthly_burden_origin"] == "estimated_from_linked_transactions"


# --------------------------------------------------------------------------
# Finding 12: response size switches; defaults unchanged.
# --------------------------------------------------------------------------


async def test_commitments_status_filter_and_summary_view(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await build_read_surface_ledger(db_session)
    db_session.add(
        RecurringCommitment(
            label="ended-a",
            match_scope="merchant",
            merchant="service-ended",
            category_major="category-11",
            cycle="monthly",
            end_date=date(2025, 6, 30),
            origin="user",
        )
    )
    await db_session.commit()
    path = "/api/v1/read/commitments"
    default = (await async_client.get(path, headers=api_headers)).json()["data"]
    explicit = (
        await async_client.get(
            path, headers=api_headers, params={"status": "all", "view": "detail"}
        )
    ).json()["data"]
    assert explicit == default
    assert default["item_summaries"] is None
    assert (
        default["returned_item_count"]
        == default["total_item_count"]
        == len(default["items"])
    )
    ended = (
        await async_client.get(path, headers=api_headers, params={"status": "ended"})
    ).json()["data"]
    assert [item["name"] for item in ended["items"]] == ["ended-a"]
    assert ended["counts_by_state"] == default["counts_by_state"]
    assert ended["totals"] == default["totals"]
    active = (
        await async_client.get(path, headers=api_headers, params={"status": "active"})
    ).json()["data"]
    assert all(item["lifecycle"] == "active" for item in active["items"])
    summary = await async_client.get(
        path, headers=api_headers, params={"view": "summary"}
    )
    body = summary.json()["data"]
    assert body["items"] == []
    assert len(body["item_summaries"]) == default["total_item_count"]
    assert len(summary.content) < len(
        (await async_client.get(path, headers=api_headers)).content
    )
    bad = await async_client.get(path, headers=api_headers, params={"status": "x"})
    assert bad.status_code == 422


async def test_spend_cube_reports_group_counts(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await build_read_surface_ledger(db_session)
    path = "/api/v1/read/spend-cube"
    full = (
        await async_client.get(
            path, headers=api_headers, params={"group_by": "merchant", "limit": 2000}
        )
    ).json()["data"]
    cut = (
        await async_client.get(
            path, headers=api_headers, params={"group_by": "merchant", "limit": 3}
        )
    ).json()["data"]
    assert cut["total_group_count"] == full["total_group_count"] == len(full["rows"])
    assert cut["returned_count"] == cut["row_count"] == 3
    assert cut["truncated"] is True


# --------------------------------------------------------------------------
# Finding 6: "complete" does not read as "explained".
# --------------------------------------------------------------------------


async def _seed_net_worth(db_session: AsyncSession, *, undecided_transfer: bool):
    for month in (4, 5, 6):
        for day in range(1, 29, 3):
            db_session.add(_tx(date(2026, month, day), -1_000, category="category-a"))
    db_session.add(_tx(date(2026, 6, 30), -1_000, category="category-a"))
    if undecided_transfer:
        transfer = _tx(date(2026, 5, 10), -300_000, category="transfer-a")
        transfer.type = "이체"
        db_session.add(transfer)
    for snapshot_date, cash in (
        (date(2026, 4, 30), 1_000_000),
        (date(2026, 6, 30), 5_000_000),
    ):
        db_session.add_all(
            [
                AssetSnapshot(
                    snapshot_date=snapshot_date,
                    side="asset",
                    category="cash-a",
                    product_name="account-a",
                    amount=Decimal(cash),
                ),
                Loan(
                    snapshot_date=snapshot_date,
                    lender="lender-b",
                    product_name="loan-b",
                    balance=Decimal("100"),
                ),
                Investment(
                    snapshot_date=snapshot_date,
                    broker="broker-b",
                    product_name="fund-b",
                    market_value=Decimal("100"),
                ),
            ]
        )
    await db_session.commit()


async def test_complete_interval_states_unexplained_share(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await _seed_net_worth(db_session, undecided_transfer=False)
    body = (
        await async_client.get(
            "/api/v1/metrics/net-worth/reconciliation", headers=api_headers
        )
    ).json()
    assert body["status"] == "complete"
    assert body["status_reasons"] == []
    items = body["items"]
    assert items["net_worth_change"] == 4_000_000
    assert items["unexplained_difference"] == 4_021_000
    assert items["unexplained_share_of_change"] == round(4_021_000 / 4_000_000, 4)
    assert items["unexplained_share_withheld_reason"] is None
    assert items["investment_valuation_change_provisional"] is False
    assert "설명되었다는 뜻이 아니다" in body["status_note"]
    intervals = (
        await async_client.get(
            "/api/v1/metrics/net-worth/intervals", headers=api_headers
        )
    ).json()
    interval = intervals["intervals"][0]
    assert interval["status"] == "complete"
    assert (
        interval["unexplained_share_of_change"] == items["unexplained_share_of_change"]
    )
    assert intervals["status_note"] == body["status_note"]


async def test_undecided_transfers_make_valuation_change_provisional(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await _seed_net_worth(db_session, undecided_transfer=True)
    body = (
        await async_client.get(
            "/api/v1/metrics/net-worth/reconciliation", headers=api_headers
        )
    ).json()
    assert body["status"] == "incomplete_classification"
    items = body["items"]
    assert items["investment_valuation_change"] is not None
    assert items["investment_valuation_change_provisional"] is True
    assert "목적 미정 이체" in items["investment_valuation_change_provisional_reason"]
    interval = (
        await async_client.get(
            "/api/v1/metrics/net-worth/intervals", headers=api_headers
        )
    ).json()["intervals"][0]
    assert interval["investment_valuation_change_provisional"] is True


async def test_unexplained_share_is_withheld_when_net_worth_does_not_change(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    await _seed_net_worth(db_session, undecided_transfer=False)
    snapshot = await db_session.get(AssetSnapshot, 2)
    snapshot.amount = Decimal(1_000_000)
    await db_session.commit()
    items = (
        await async_client.get(
            "/api/v1/metrics/net-worth/reconciliation", headers=api_headers
        )
    ).json()["items"]
    assert items["net_worth_change"] == 0
    assert items["unexplained_share_of_change"] is None
    assert items["unexplained_share_withheld_reason"] == "net_worth_change_zero"


# --------------------------------------------------------------------------
# Finding 7: month-end projection completeness and loan rows.
# --------------------------------------------------------------------------


async def test_projection_lists_income_left_out_of_the_total(
    db_session: AsyncSession,
):
    for month, payday in zip(range(1, 7), (3, 25, 5, 27, 4, 26), strict=True):
        for day in (2, 5, 9, 13, 17, 21, 25, 28):
            db_session.add(
                _tx(date(2031, month, day), -100, category="food-a", merchant="grocer")
            )
        income = _tx(
            date(2031, month, payday), 100_000, category="급여", merchant="payer"
        )
        income.type = "수입"
        db_session.add(income)
    db_session.add(_tx(date(2031, 7, 20), -100, category="food-a", merchant="grocer"))
    await db_session.commit()
    projection = await get_monthly_projection(
        db_session, reference_date=date(2031, 7, 20)
    )
    (source,) = projection.income_sources
    assert source.status == "uncertain" and source.remaining_amount == 0
    assert projection.projected_month_end_net is not None
    completeness = projection.completeness
    assert completeness is not None
    assert completeness.status == "known_components_only"
    (left_out,) = completeness.left_out
    assert left_out.component == "income_source"
    assert left_out.reason_code == "income_source_uncertain"
    assert left_out.key == source.source_key


async def test_projection_loan_component_has_one_row_per_loan(
    db_session: AsyncSession,
):
    await build_read_surface_ledger(db_session)
    projection = await get_monthly_projection(
        db_session, reference_date=date(2026, 8, 14)
    )
    loan = next(c for c in projection.expense_components if c.kind == "loan")
    (row,) = loan.sources
    assert row.loan_account_id is not None
    assert row.expected_monthly_amount == 450_000
    assert row.observed_net_expense == 450_000
    assert row.expected_remaining == 0
    assert row.match_method == "loan_link"
    assert row.recorded_monthly_payment_source == "manual"
    assert loan.expected_remaining == sum(
        r.expected_remaining or 0 for r in loan.sources
    )
    assert projection.completeness is not None
    assert projection.completeness.status in {
        "all_known_components",
        "known_components_only",
        "not_projected",
    }
    if projection.projected_month_end_net is None:
        assert projection.completeness.status == "not_projected"


# --------------------------------------------------------------------------
# Finding 11 / 13: the index points at the projection and states exceptions.
# --------------------------------------------------------------------------


async def test_index_lists_projection_and_signed_ratio_fields(
    async_client: AsyncClient, api_headers: dict[str, str]
):
    body = (await async_client.get("/api/v1/read/index", headers=api_headers)).json()
    entries = {entry["key"]: entry for entry in body["entries"]}
    projection = entries["month_end_projection"]
    assert projection["path"] == "/api/v1/canonical-views/dashboard"
    assert projection["response_field"] == "month_projection"
    assert projection["definition"] and projection["notes"]
    accuracy = entries["month_projection_accuracy"]
    assert accuracy["path"] == "/api/v1/canonical-views/month-projection/accuracy"
    assert "오차" in accuracy["definition"]
    assert "adjustability_undecided_share" in body["signed_ratio_fields"]
    assert "residual_rate" in body["signed_ratio_fields"]
    pairs = {
        (item["read_surface"], item["net_worth_metrics"])
        for item in body["vocabulary_mapping"]
    }
    assert (
        "status=classification_incomplete",
        "status=incomplete_classification",
    ) in pairs
    assert "baseline" in entries["comparison_monthly_flow"]["parameters"]
    assert {"status", "view"} <= set(entries["commitments"]["parameters"])
    schema = app.openapi()["paths"]
    for entry in body["entries"]:
        assert entry["path"] in schema, entry["path"]
        declared = {
            param["name"]
            for param in schema[entry["path"]]["get"].get("parameters", [])
        }
        assert set(entry["parameters"]) <= declared, (entry["key"], declared)


# --------------------------------------------------------------------------
# Finding 8: transactions carry the resolved axes and where they came from.
# --------------------------------------------------------------------------


async def test_transactions_return_resolved_axes_and_sources(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    ledger = await build_read_surface_ledger(db_session)

    async def listing(**params: str) -> list[dict]:
        response = await async_client.get(
            "/api/v1/transactions", headers=api_headers, params=params
        )
        assert response.status_code == 200, response.text
        return response.json()["items"]

    loan = (await listing(flow_row="committed_loan", per_page="1"))[0]
    assert loan["payment_form"] == "committed"
    assert loan["payment_form_source"] == "loan_link"
    assert loan["adjustability"] == "protected"
    assert loan["adjustability_source"] == "loan_link"
    assert loan["flow_row"] == "committed_loan"
    assert loan["flow_row_source"] == "own_line"
    assert loan["cost_kind"] is None or isinstance(loan["cost_kind"], str)  # kept

    subscription = (await listing(flow_row="committed_recurring", per_page="1"))[0]
    assert subscription["payment_form_source"] == "commitment"
    assert subscription["adjustability"] == "adjustable"
    assert subscription["adjustability_source"] == "commitment"

    ad_hoc = await listing(flow_row="ad_hoc_adjustable", per_page="200")
    sources = {item["adjustability_source"] for item in ad_hoc}
    # category-05 default (category_default) and rows a person marked
    # discretionary (transaction).
    assert {"category_default", "transaction"} <= sources
    assert {item["payment_form_source"] for item in ad_hoc} == {"none"}

    undecided = (await listing(flow_row="undecided", per_page="1"))[0]
    assert undecided["adjustability"] == "undecided"
    assert undecided["adjustability_source"] == "none"

    income = (await listing(type="수입", per_page="1"))[0]
    assert income["payment_form"] == "not_applicable"
    assert income["adjustability_source"] == "not_applicable"
    assert income["flow_row"] == "income_undetermined"

    deleted = [
        item
        for item in await listing(include_deleted="true", per_page="200")
        if item["is_deleted"]
    ][0]
    assert deleted["payment_form"] is None
    assert deleted["payment_form_source"] == "not_effective"
    assert deleted["flow_row_source"] == "no_flow_line"

    detail = (
        await async_client.get(
            f"/api/v1/transactions/{loan['id']}", headers=api_headers
        )
    ).json()
    assert detail["flow_row"] == "committed_loan"
    flagged = (
        await async_client.get(
            f"/api/v1/transactions/{ledger.flagged_installment_tx_id}",
            headers=api_headers,
        )
    ).json()
    assert flagged["payment_form"] == "ad_hoc"

    review = (
        await async_client.get(
            "/api/v1/read/review-items",
            headers=api_headers,
            params={"period": "2026-07"},
        )
    ).json()["data"]["items"]
    big = next(item for item in review if item["merchant"] == "merchant-big")
    assert big["axes"]["adjustability"] == "adjustable"
    assert big["axes"]["flow_row"] == "ad_hoc_adjustable"
    category_items = [item for item in review if item["subject"] == "category_month"]
    assert all(item["axes"] is None for item in category_items)
