"""T061 net worth reconciliation on the shared view definitions (SQLite in CI).

The same scenario runs against migration-created PostgreSQL views in
``test_net_worth_postgresql.py``.
"""

import random
from datetime import date, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.transfer_purpose import TransferPurposeOverride, TransferPurposeRule
from app.services.metric_views import MONTHLY_FLOW_SUMMARY_VIEW
from app.services.net_worth_service import _interval_flow
from net_worth_scenarios import (
    D0,
    D1,
    D2,
    asset_rows,
    build_net_worth_scenario,
    investment_row,
    loan_row,
    tx,
)

PATH = "/api/v1/metrics/net-worth/reconciliation"


def _identity_holds(items: dict) -> bool:
    return items["net_worth_change"] == (
        items["residual"]
        + items["loan_balance_decrease"]
        + items["investment_valuation_change"]
        + items["unexplained_difference"]
    )


async def _reconcile(
    client: AsyncClient, headers: dict[str, str], start: date, end: date
) -> dict:
    response = await client.get(
        PATH,
        params={"start_date": start.isoformat(), "end_date": end.isoformat()},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_complete_interval_matches_hand_computed_items(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await build_net_worth_scenario(db_session)
    payload = await _reconcile(async_client, api_headers, D0, D1)

    assert payload["status"] == "complete"
    interval = payload["interval"]
    assert interval["transaction_start_date"] == "2026-02-01"
    assert interval["transaction_end_date"] == "2026-02-28"
    assert payload["net_worth_start"]["net_worth"] == -2_000_000
    assert payload["net_worth_start"]["negative_asset_excluded_total"] == -5_000
    assert payload["net_worth_end"]["net_worth"] == 500_000
    expected_items = {
        "net_worth_change": 2_500_000,
        # The D0 row (−50,000) is outside; the D1 row (−20,000) is inside.
        "residual": 1_880_000,
        "loan_balance_decrease": 500_000,
        "investment_valuation_change": 150_000,
        "unexplained_difference": -30_000,
        "investment_value_change": 1_150_000,
        "investment_net_transfer_in": 1_000_000,
    }
    assert {key: payload["items"][key] for key in expected_items} == expected_items
    # Added fields (consumer review): the unexplained share of the change.
    assert payload["items"]["unexplained_share_of_change"] == round(
        -30_000 / 2_500_000, 4
    )
    assert payload["items"]["investment_valuation_change_provisional"] is False
    assert _identity_holds(payload["items"])
    transfers = payload["transfers"]
    assert transfers["investment_net"] == -1_000_000
    assert transfers["savings_net"] == -300_000
    assert transfers["investment_savings_net"] == -1_300_000
    # Both legs of the internal move are present and net to zero, once.
    assert transfers["internal_move_net"] == 0
    assert transfers["undecided_net"] == 0
    assert transfers["transfer_net"] == -1_300_000
    assert transfers["activity_total"] == 2_700_000
    assert transfers["undecided_share"] == 0
    assert {kind["kind"]: kind["pair_status"] for kind in payload["kinds"]} == {
        "loans": "observed",
        "investments": "observed",
    }
    assert payload["transactions"]["covered"] is True
    assert payload["flow"]["committed_loan_total"] == 600_000
    contract = payload["contract"]
    assert contract["definition"] == "net_worth_reconciliation.v1"
    assert contract["as_of"]["snapshot_as_of"]["assets"] == D2.isoformat()
    # 100,000 of the 1,120,000 interval spend has undecided adjustability.
    assert contract["adjustability_undecided_total"] == 100_000


async def test_default_pair_is_latest_two_and_undecided_transfer_is_incomplete(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    scenario = await build_net_worth_scenario(db_session)
    response = await async_client.get(PATH, headers=api_headers)
    payload = response.json()

    assert payload["interval"]["start_snapshot_date"] == D1.isoformat()
    assert payload["interval"]["end_snapshot_date"] == D2.isoformat()
    assert payload["status"] == "incomplete_classification"
    assert payload["transfers"]["undecided_net"] == -200_000
    assert payload["transfers"]["undecided_share"] == 1.0
    items = payload["items"]
    assert items["net_worth_change"] == 1_780_000
    assert items["residual"] == 1_399_999
    assert items["investment_valuation_change"] == -150_000
    assert items["unexplained_difference"] == 30_001
    assert _identity_holds(items)

    # A human marks the transfer at the 작업대: the result becomes complete,
    # and what the mark says changes only the investment item.
    put = await async_client.put(
        f"/api/v1/transfer-purposes/transactions/{scenario.ids['mar_unmarked']}",
        json={"purpose": "investment"},
        headers=api_headers,
    )
    assert put.status_code == 200
    assert put.json()["purpose_source"] == "transaction"
    payload = (await async_client.get(PATH, headers=api_headers)).json()
    assert payload["status"] == "complete"
    assert payload["items"]["investment_net_transfer_in"] == 200_000
    assert payload["items"]["investment_valuation_change"] == -350_000
    assert payload["items"]["unexplained_difference"] == 230_001
    assert _identity_holds(payload["items"])


async def test_consecutive_intervals_never_count_a_day_twice(
    db_session: AsyncSession,
) -> None:
    await build_net_worth_scenario(db_session)
    first = await _interval_flow(db_session, D0, D1)
    second = await _interval_flow(db_session, D1, D2)
    whole = await _interval_flow(db_session, D0, D2)
    for key in ("residual", "transfer_net", "income_total", "total_outflow"):
        assert first[key] + second[key] == whole[key], key
    # With month-end snapshots the interval equals the calendar months.
    months = {
        row["period"]: row
        for row in (
            await db_session.execute(select(MONTHLY_FLOW_SUMMARY_VIEW))
        ).mappings()
    }
    assert first["residual"] == months["2026-02"]["residual"]
    assert second["residual"] == months["2026-03"]["residual"]


async def test_internal_move_legs_do_not_double_count(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    scenario = await build_net_worth_scenario(db_session)
    before = await _reconcile(async_client, api_headers, D0, D1)

    # Marking both legs of the internal move as investment would cancel them
    # (the pair never left the ledger), so valuation and the gap are unchanged.
    for key in ("feb_move_out", "feb_move_in"):
        response = await async_client.put(
            f"/api/v1/transfer-purposes/transactions/{scenario.ids[key]}",
            json={"purpose": "investment"},
            headers=api_headers,
        )
        assert response.status_code == 200
    both_invest = await _reconcile(async_client, api_headers, D0, D1)
    assert both_invest["transfers"]["investment_net"] == -1_000_000
    assert both_invest["items"] == before["items"]

    # Only one leg marked: the other is undecided, and the one-sided mark
    # moves 700,000 between valuation and the unexplained difference.
    await async_client.delete(
        f"/api/v1/transfer-purposes/transactions/{scenario.ids['feb_move_in']}",
        headers=api_headers,
    )
    rule = (
        await db_session.execute(
            select(TransferPurposeRule).where(
                TransferPurposeRule.match_scope == "category"
            )
        )
    ).scalar_one()
    await async_client.delete(
        f"/api/v1/transfer-purposes/rules/{rule.id}", headers=api_headers
    )
    one_leg = await _reconcile(async_client, api_headers, D0, D1)
    assert one_leg["status"] == "incomplete_classification"
    assert one_leg["transfers"]["undecided_net"] == 700_000
    assert one_leg["transfers"]["undecided_activity_total"] == 700_000
    assert one_leg["transfers"]["undecided_share"] == round(700_000 / 2_700_000, 4)
    assert one_leg["items"]["investment_valuation_change"] == 150_000 - 700_000
    assert one_leg["items"]["residual"] == before["items"]["residual"]
    assert _identity_holds(one_leg["items"])


async def test_mismatched_kind_dates_are_reported_not_aligned(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await build_net_worth_scenario(db_session)
    d3 = date(2026, 4, 30)
    # Loans and assets exist at D3; the investments snapshot does not.
    db_session.add_all(
        [
            *asset_rows(
                d3,
                cash=6_000_000,
                savings=1_300_000,
                investments=3_000_000,
                loan=8_500_000,
            ),
            loan_row(d3, 8_500_000),
            tx(date(2026, 4, 30), -10_000, category="cat-protected"),
        ]
    )
    await db_session.commit()
    payload = await _reconcile(async_client, api_headers, D2, d3)

    assert payload["status"] == "snapshot_dates_mismatched"
    kinds = {kind["kind"]: kind for kind in payload["kinds"]}
    assert kinds["loans"]["pair_status"] == "observed"
    assert kinds["loans"]["change"] == -500_000
    investments = kinds["investments"]
    assert investments["pair_status"] == "mismatched"
    assert investments["start_as_of"] == D2.isoformat()
    assert investments["end_as_of"] == D2.isoformat()
    assert investments["change"] is None
    assert payload["items"]["investment_valuation_change"] is None
    assert payload["items"]["unexplained_difference"] is None
    assert payload["items"]["loan_balance_decrease"] == 500_000
    assert any("investments" in reason for reason in payload["status_reasons"])


async def test_interval_the_transactions_do_not_cover(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await build_net_worth_scenario(db_session)
    early = date(2025, 11, 30)
    db_session.add_all(
        [
            *asset_rows(
                early,
                cash=4_000_000,
                savings=1_000_000,
                investments=2_000_000,
                loan=10_500_000,
            ),
            loan_row(early, 10_500_000),
            investment_row(early, 2_000_000),
        ]
    )
    await db_session.commit()
    payload = await _reconcile(async_client, api_headers, early, D0)

    assert payload["status"] == "transactions_not_covered"
    coverage = payload["transactions"]
    assert coverage["covered"] is False
    assert coverage["first_transaction_date"] == "2026-01-01"
    assert coverage["periods_without_data"] == ["2025-12"]
    assert payload["items"]["unexplained_difference"] is None
    assert payload["items"]["net_worth_change"] == -2_000_000 - (-3_500_000)


async def test_no_snapshot_pair_and_bad_dates(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    empty = (await async_client.get(PATH, headers=api_headers)).json()
    assert empty["status"] == "no_snapshot_pair"
    assert empty["items"] is None
    db_session.add_all(asset_rows(D0, cash=1, savings=1, investments=1, loan=1))
    await db_session.commit()
    one = (await async_client.get(PATH, headers=api_headers)).json()
    assert one["status"] == "no_snapshot_pair"

    await build_net_worth_scenario_without_d0(db_session)
    bad = await async_client.get(
        PATH,
        params={"start_date": "2026-02-01", "end_date": D1.isoformat()},
        headers=api_headers,
    )
    assert bad.status_code == 422
    reversed_pair = await async_client.get(
        PATH,
        params={"start_date": D1.isoformat(), "end_date": D0.isoformat()},
        headers=api_headers,
    )
    assert reversed_pair.status_code == 422
    only_one = await async_client.get(
        PATH, params={"start_date": D0.isoformat()}, headers=api_headers
    )
    assert only_one.status_code == 422


async def build_net_worth_scenario_without_d0(db_session: AsyncSession) -> None:
    db_session.add_all(asset_rows(D1, cash=1, savings=1, investments=1, loan=1))
    await db_session.commit()


async def test_absent_kinds_count_as_zero(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    """No loans/investments snapshot ever: both ends are 0, stated as absent."""
    db_session.add_all(
        [
            AssetSnapshot(
                snapshot_date=D0,
                side="asset",
                category="asset-cash",
                product_name="account-a",
                amount=Decimal(1_000_000),
            ),
            AssetSnapshot(
                snapshot_date=D1,
                side="asset",
                category="asset-cash",
                product_name="account-a",
                amount=Decimal(1_200_000),
            ),
            tx(date(2026, 1, 1), 100, tx_type="수입"),
            tx(date(2026, 2, 10), 250_000, tx_type="수입"),
            tx(date(2026, 2, 28), -40_000),
        ]
    )
    await db_session.commit()
    payload = await _reconcile(async_client, api_headers, D0, D1)

    assert payload["status"] == "complete"
    assert [kind["pair_status"] for kind in payload["kinds"]] == ["absent", "absent"]
    assert payload["items"]["loan_balance_decrease"] == 0
    assert payload["items"]["investment_valuation_change"] == 0
    assert payload["items"]["unexplained_difference"] == 200_000 - 210_000
    assert payload["transfers"]["undecided_share"] is None


async def test_identity_holds_for_random_snapshot_pairs(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    """Whatever the numbers, the four items plus the gap equal the change."""
    rng = random.Random(61)
    dates = [
        date(2026, 1, 1) + timedelta(days=offset) for offset in (0, 17, 45, 46, 90)
    ]
    # The ledger spans the first to the last snapshot date.
    db_session.add_all(
        [tx(dates[0], 1, tx_type="수입"), tx(dates[-1], -1, merchant="last")]
    )
    for snapshot_date in dates:
        db_session.add_all(
            [
                *asset_rows(
                    snapshot_date,
                    cash=rng.randint(0, 9_000_000),
                    savings=rng.randint(0, 3_000_000),
                    investments=rng.randint(0, 5_000_000),
                    loan=rng.randint(0, 20_000_000),
                ),
                loan_row(snapshot_date, rng.randint(0, 20_000_000)),
                investment_row(snapshot_date, rng.randint(0, 5_000_000)),
                investment_row(snapshot_date, None, name="fund-missing"),
            ]
        )
    purposes = ["investment", "savings", "internal_move", None]
    day = dates[0]
    while day <= dates[-1]:
        kind = rng.choice(["수입", "지출", "지출", "이체"])
        amount = rng.randint(1, 900_000) * (
            1 if kind == "수입" else rng.choice([-1, 1])
        )
        row = tx(day, amount, tx_type=kind, merchant=f"m-{rng.randint(1, 5)}")
        db_session.add(row)
        await db_session.flush()
        purpose = rng.choice(purposes)
        if kind == "이체" and purpose is not None:
            db_session.add(
                TransferPurposeOverride(transaction_id=row.id, purpose=purpose)
            )
        day += timedelta(days=rng.randint(0, 2))
    await db_session.commit()

    checked = 0
    for start, end in zip(dates, dates[1:], strict=False):
        payload = await _reconcile(async_client, api_headers, start, end)
        assert payload["status"] in ("complete", "incomplete_classification")
        assert _identity_holds(payload["items"])
        kinds = {kind["kind"]: kind for kind in payload["kinds"]}
        assert kinds["investments"]["missing_value_row_count"] == 2
        checked += 1
    assert checked == 4

    intervals = (
        await async_client.get(
            "/api/v1/metrics/net-worth/intervals", headers=api_headers
        )
    ).json()
    assert [item["end_snapshot_date"] for item in intervals["intervals"]] == [
        value.isoformat() for value in reversed(dates[1:])
    ]
    assert intervals["snapshot_dates"]["assets"] == [
        value.isoformat() for value in reversed(dates)
    ]


async def test_intervals_list_states_per_pair(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
) -> None:
    await build_net_worth_scenario(db_session)
    payload = (
        await async_client.get(
            "/api/v1/metrics/net-worth/intervals", headers=api_headers
        )
    ).json()
    assert payload["snapshot_dates"]["loans"] == [
        D2.isoformat(),
        D1.isoformat(),
        D0.isoformat(),
    ]
    assert payload["snapshot_dates"]["insurance"] == []
    assert [
        (item["start_snapshot_date"], item["status"], item["unexplained_difference"])
        for item in payload["intervals"]
    ] == [
        (D1.isoformat(), "incomplete_classification", 30_001),
        (D0.isoformat(), "complete", -30_000),
    ]


async def test_net_worth_endpoints_require_api_key(async_client: AsyncClient) -> None:
    for path in (
        "/api/v1/metrics/net-worth/intervals",
        PATH,
        "/api/v1/metrics/net-worth/emergency-fund",
        "/api/v1/transfer-purposes/rules",
        "/api/v1/transfer-purposes/transactions",
    ):
        response = await async_client.get(path)
        assert response.status_code == 401, path
    put = await async_client.put(
        "/api/v1/transfer-purposes/transactions/1", json={"purpose": "savings"}
    )
    assert put.status_code == 401
