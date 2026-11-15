"""T054 monthly-flow invariants on the shared view definitions (SQLite in CI).

The same assertions run against the migration-created PostgreSQL views in
``test_metric_views_postgresql.py``.
"""

from datetime import date

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.metric_views import AS_OF_VIEW, MONTHLY_FLOW_SUMMARY_VIEW
from metric_synthetic_ledger import (
    AS_OF,
    assert_flow_invariants,
    build_synthetic_ledger,
)


async def test_flow_rows_sum_to_effective_transactions(
    db_session: AsyncSession,
) -> None:
    ledger = await build_synthetic_ledger(db_session)
    await assert_flow_invariants(db_session, ledger)


async def test_flow_summary_matches_hand_computed_months(
    db_session: AsyncSession,
) -> None:
    await build_synthetic_ledger(db_session)
    rows = {
        row["period"]: row
        for row in (
            await db_session.execute(select(MONTHLY_FLOW_SUMMARY_VIEW))
        ).mappings()
    }

    january = rows["2026-01"]
    assert january["month_status"] == "closed"
    assert january["income_total"] == 3_000_000
    assert january["committed_loan_total"] == 500_000
    assert january["committed_installment_total"] == 100_000
    assert january["committed_recurring_total"] == 26_000
    assert january["ad_hoc_protected_total"] == 200_000
    # The 2026-02-02 refund of the 2026-01-31 purchase stays in February.
    assert january["ad_hoc_adjustable_total"] == 200_000
    assert january["undecided_total"] == 30_000
    assert january["total_outflow"] == 1_056_000
    assert january["living_spend"] == 556_000
    assert january["adjustable_spend"] == 215_000
    assert january["protected_spend"] == 800_000
    assert january["adjustability_undecided_total"] == 41_000
    assert january["residual"] == 1_944_000
    assert january["transfer_net"] == -1_000_000

    february = rows["2026-02"]
    assert february["month_status"] == "closed"
    assert february["ad_hoc_adjustable_total"] == 30_000
    assert february["ad_hoc_protected_total"] == 10_000
    assert february["undecided_total"] == 86_777
    assert february["committed_recurring_total"] == 7_000
    assert february["total_outflow"] == 133_777
    assert february["refund_total"] == 205_000
    assert february["transfer_net"] == 200_000
    assert february["residual"] == 2_866_223

    march = rows["2026-03"]
    assert march["month_status"] == "in_progress"
    assert march["total_outflow"] == 20_000


async def test_as_of_separates_transaction_and_snapshot_dates(
    db_session: AsyncSession,
) -> None:
    await build_synthetic_ledger(db_session)
    row = (await db_session.execute(select(AS_OF_VIEW))).mappings().one()

    assert date.fromisoformat(str(row["transaction_as_of"])) == AS_OF
    assert row["last_closed_period"] == "2026-02"
    assert row["in_progress_period"] == "2026-03"
    assert row["asset_snapshot_as_of"] is None
    assert row["loan_snapshot_as_of"] is None
    assert row["non_krw_transaction_count"] == 1


async def test_metric_endpoints_require_api_key(async_client: AsyncClient) -> None:
    for path in (
        "/api/v1/metrics/monthly-flow",
        "/api/v1/metrics/spend-cube",
        "/api/v1/metrics/data-status",
    ):
        response = await async_client.get(path)
        assert response.status_code == 401, path


async def test_monthly_flow_endpoint_reads_the_view(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await build_synthetic_ledger(db_session)
    response = await async_client.get(
        "/api/v1/metrics/monthly-flow",
        params={"start_period": "2026-01", "end_period": "2026-03"},
        headers=api_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    view_rows = {
        row["period"]: row
        for row in (
            await db_session.execute(select(MONTHLY_FLOW_SUMMARY_VIEW))
        ).mappings()
    }
    assert [item["period"] for item in payload["items"]] == sorted(view_rows)
    for item in payload["items"]:
        view_row = view_rows[item["period"]]
        for key, value in view_row.items():
            assert item[key] == value, (item["period"], key)
        assert sum(row["signed_amount"] for row in item["rows"]) == item["signed_total"]
    january, february, march = payload["items"]
    assert january["residual_rate"] == round(1_944_000 / 3_000_000, 4)
    assert march["residual_rate"] is None  # in-progress month: no ratio
    contract = payload["contract"]
    assert contract["definition"] == "monthly_flow.v1"
    assert contract["as_of"]["transaction_as_of"] == AS_OF.isoformat()
    assert contract["as_of"]["last_closed_period"] == "2026-02"
    assert contract["as_of"]["snapshot_as_of"] == {
        "assets": None,
        "loans": None,
        "investments": None,
        "insurance": None,
        "profile": None,
    }
    assert contract["non_krw_transaction_count"] == 1
    assert contract["inclusion"]["excluded"] == [
        "is_deleted",
        "merged_into_id",
        "superseded",
        "non_krw_currency",
    ]
    total_outflow = sum(item["total_outflow"] for item in payload["items"])
    undecided = sum(item["adjustability_undecided_total"] for item in payload["items"])
    assert contract["adjustability_undecided_total"] == undecided
    assert contract["adjustability_undecided_share"] == round(
        undecided / total_outflow, 4
    )


async def test_spend_cube_endpoint_groups_the_cube(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await build_synthetic_ledger(db_session)
    response = await async_client.get(
        "/api/v1/metrics/spend-cube",
        params={
            "start_period": "2026-02",
            "end_period": "2026-02",
            "group_by": "flow_row",
        },
        headers=api_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_amount"] == 133_777
    assert {row["flow_row"]: row["amount"] for row in payload["rows"]} == {
        "undecided": 86_777,
        "ad_hoc_adjustable": 30_000,
        "ad_hoc_protected": 10_000,
        "committed_recurring": 7_000,
    }

    bad = await async_client.get(
        "/api/v1/metrics/spend-cube",
        params={"group_by": "description"},
        headers=api_headers,
    )
    assert bad.status_code == 422


async def test_data_status_lists_excluded_currency(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await build_synthetic_ledger(db_session)
    response = await async_client.get(
        "/api/v1/metrics/data-status", headers=api_headers
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["closed_periods"] == ["2026-01", "2026-02"]
    assert payload["in_progress_period"] == "2026-03"
    assert payload["excluded_currency"] == [
        {
            "period": "2026-02",
            "currency": "USD",
            "type": "지출",
            "signed_amount": -10,
            "transaction_count": 1,
        }
    ]
