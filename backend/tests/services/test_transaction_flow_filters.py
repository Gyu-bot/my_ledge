"""T059: ``GET /api/v1/transactions`` monthly-flow line filters (SQLite in CI).

``flow_row``, ``payment_form`` and ``adjustability`` are additive, optional
filters that keep a transaction when one of its ``vw_metric_flow_lines`` lines
has every given value. The same assertions run on the migration-created
PostgreSQL views in ``test_metric_views_postgresql.py``.
"""

import calendar
from collections import defaultdict
from datetime import date

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.metric_views import FLOW_LINES_VIEW, MONTHLY_FLOW_VIEW
from metric_synthetic_ledger import build_synthetic_ledger

HEADERS = {"X-API-Key": "test-api-key"}
FLOW_ROWS = (
    "income_undetermined",
    "committed_loan",
    "committed_installment",
    "committed_recurring",
    "ad_hoc_protected",
    "ad_hoc_adjustable",
    "undecided",
    "transfer_undetermined",
    "other_type",
)
PAYMENT_FORMS = ("committed", "ad_hoc", "not_applicable")
ADJUSTABILITIES = ("protected", "adjustable", "undecided", "not_applicable")


async def list_ids(client: AsyncClient, **params: object) -> tuple[list[int], int]:
    """All ids of a filtered listing (every page) and the reported total."""
    ids: list[int] = []
    page = 1
    while True:
        response = await client.get(
            "/api/v1/transactions",
            params={**params, "page": page, "per_page": 200},
            headers=HEADERS,
        )
        assert response.status_code == 200, response.text
        body = response.json()
        ids.extend(item["id"] for item in body["items"])
        if page * body["per_page"] >= body["total"]:
            return ids, body["total"]
        page += 1


def _month_bounds(period: str) -> tuple[str, str]:
    year, month = (int(part) for part in period.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1).isoformat(), date(year, month, last_day).isoformat()


async def assert_listing_matches_flow_lines(
    client: AsyncClient, session: AsyncSession
) -> None:
    """Each filter lists exactly the transactions behind the flow lines."""
    lines = (await session.execute(select(FLOW_LINES_VIEW))).mappings().all()
    by_period_row: dict[tuple[str, str], set[int]] = defaultdict(set)
    by_form: dict[str, set[int]] = defaultdict(set)
    by_adjustability: dict[str, set[int]] = defaultdict(set)
    by_row_and_adjustability: dict[tuple[str, str], set[int]] = defaultdict(set)
    for line in lines:
        tx_id = int(line["transaction_id"])
        by_period_row[(line["period"], line["flow_row"])].add(tx_id)
        by_form[line["payment_form"]].add(tx_id)
        by_adjustability[line["adjustability"]].add(tx_id)
        by_row_and_adjustability[(line["flow_row"], line["adjustability"])].add(tx_id)
    flow_counts = {
        (row["period"], row["flow_row"]): int(row["transaction_count"])
        for row in (await session.execute(select(MONTHLY_FLOW_VIEW))).mappings()
    }
    assert flow_counts, "the ledger must produce monthly-flow rows"

    # One monthly-flow line (period x row): same transactions, same count as
    # the monthly flow reports for that line.
    for period in sorted({period for period, _ in flow_counts}):
        start, end = _month_bounds(period)
        for flow_row in FLOW_ROWS:
            ids, total = await list_ids(
                client, flow_row=flow_row, start_date=start, end_date=end
            )
            expected = by_period_row.get((period, flow_row), set())
            assert set(ids) == expected, (period, flow_row)
            assert len(ids) == total == len(expected)
            assert total == flow_counts.get((period, flow_row), 0), (period, flow_row)

    for form in PAYMENT_FORMS:
        ids, _ = await list_ids(client, payment_form=form)
        assert set(ids) == by_form.get(form, set()), form
    for value in ADJUSTABILITIES:
        ids, _ = await list_ids(client, adjustability=value)
        assert set(ids) == by_adjustability.get(value, set()), value
    # Combined filters must hold on the same line.
    for flow_row in FLOW_ROWS:
        for value in ADJUSTABILITIES:
            ids, _ = await list_ids(client, flow_row=flow_row, adjustability=value)
            assert set(ids) == by_row_and_adjustability.get((flow_row, value), set()), (
                flow_row,
                value,
            )


async def test_flow_filters_list_exactly_the_flow_line_transactions(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    await build_synthetic_ledger(db_session)
    await assert_listing_matches_flow_lines(async_client, db_session)


async def test_flow_filters_drop_rows_outside_the_metric_basis(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    ledger = await build_synthetic_ledger(db_session)
    for value in ADJUSTABILITIES:
        ids, _ = await list_ids(
            async_client,
            adjustability=value,
            include_deleted=True,
            include_merged=True,
        )
        # Deleted, merged, superseded and non-KRW rows have no flow line.
        assert not set(ids) & ledger.excluded_ids, value


async def test_refund_part_follows_the_purchase_line(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    ledger = await build_synthetic_ledger(db_session)
    ids = ledger.ids
    # partial_refund: 40,000 allocated to an adjustable purchase, the 40,000
    # remainder keeps its own (undecided) classification. The refund row is
    # listed under both lines, like the monthly flow counts it in both rows.
    adjustable, _ = await list_ids(
        async_client,
        flow_row="ad_hoc_adjustable",
        start_date="2026-02-01",
        end_date="2026-02-28",
    )
    undecided, _ = await list_ids(
        async_client,
        flow_row="undecided",
        start_date="2026-02-01",
        end_date="2026-02-28",
    )
    assert ids["partial_refund"] in adjustable
    assert ids["partial_refund"] in undecided
    # A boundary refund stays in its posting month (February), with the
    # January purchase's classification.
    january, _ = await list_ids(
        async_client,
        flow_row="ad_hoc_adjustable",
        start_date="2026-01-01",
        end_date="2026-01-31",
    )
    assert ids["boundary_refund"] in adjustable
    assert ids["boundary_refund"] not in january


async def test_flow_filters_combine_with_existing_filters_and_keep_the_shape(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    ledger = await build_synthetic_ledger(db_session)
    plain = await async_client.get(
        "/api/v1/transactions", params={"per_page": 200}, headers=HEADERS
    )
    assert plain.status_code == 200
    filtered = await async_client.get(
        "/api/v1/transactions",
        params={"per_page": 200, "flow_row": "committed_loan"},
        headers=HEADERS,
    )
    assert filtered.status_code == 200
    assert (
        set(filtered.json())
        == set(plain.json())
        == {
            "total",
            "page",
            "per_page",
            "items",
        }
    )
    assert set(filtered.json()["items"][0]) == set(plain.json()["items"][0])
    assert [item["id"] for item in filtered.json()["items"]] == [
        ledger.ids["loan_payment"]
    ]

    # Existing filters still apply on top: category, search, type, dates.
    ids, _ = await list_ids(
        async_client, adjustability="adjustable", search="diner", type="지출"
    )
    assert set(ids) == {
        ledger.ids["dining"],
        ledger.ids["unallocated_refund"],
        ledger.ids["in_progress_spend"],
    }
    ids, _ = await list_ids(
        async_client,
        adjustability="adjustable",
        search="diner",
        end_date="2026-02-28",
    )
    assert ledger.ids["in_progress_spend"] not in ids
    ids, _ = await list_ids(
        async_client, payment_form="committed", category_major="category-b"
    )
    assert ids == []
    # Income is never adjustability-classified.
    ids, _ = await list_ids(async_client, adjustability="not_applicable", type="수입")
    assert set(ids) == {ledger.ids["salary_jan"], ledger.ids["salary_feb"]}


async def test_flow_filters_reject_unknown_values(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    await build_synthetic_ledger(db_session)
    for params in (
        {"flow_row": "committed"},
        {"payment_form": "undetermined"},
        {"adjustability": "decided"},
    ):
        response = await async_client.get(
            "/api/v1/transactions", params=params, headers=HEADERS
        )
        assert response.status_code == 422, params
