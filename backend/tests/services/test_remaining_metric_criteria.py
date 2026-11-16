"""Synthetic parity checks for the three remaining T054 consumers."""

from datetime import date, time

from sqlalchemy import func, select

from app.models.transaction import Transaction
from app.models.nature_axes import TransactionNatureOverride
from app.services.analytics_service import (
    _load_purchase_net_rows,
    _purchase_review_totals,
    get_purchase_gate_candidates,
)
from app.services.loan_mapping_service import list_loan_transaction_mappings
from app.services.metric_views import (
    METRIC_TRANSACTIONS_VIEW,
    MONTHLY_FLOW_SUMMARY_VIEW,
)
from app.services.monthly_projection_service import get_monthly_projection
from app.services.read_review_items_service import read_review_items
from app.services.settings_service import (
    get_analytics_settings,
    patch_analytics_settings,
)
from metric_synthetic_ledger import AS_OF, build_synthetic_ledger


async def scenario_remaining_actuals_equal_views(session):
    ledger = await build_synthetic_ledger(session)
    tx = METRIC_TRANSACTIONS_VIEW
    rows = await _load_purchase_net_rows(
        session, start_date=None, end_date=AS_OF, tx_type="지출"
    )
    view_nets = dict(
        (await session.execute(select(tx.c.id, tx.c.purchase_net_amount))).all()
    )
    assert all(row["amount"] == view_nets[row["id"]] for row in rows)
    assert not (set(row["id"] for row in rows) & ledger.excluded_ids)
    # The detector's monthly aggregates have a narrower scope than cashflow.
    totals = await _purchase_review_totals(
        session, start_date=date(2026, 1, 1), end_date=AS_OF
    )
    eligible = [
        row
        for row in rows
        if row["commitment_kind"] is None
        and row["loan_account_id"] is None
        and row["adjustability"] == "adjustable"
        and row["amount"] < 0
    ]
    for row in totals:
        assert int(row["amount"]) == sum(
            -item["amount"]
            for item in eligible
            if item["date"].strftime("%Y-%m") == row["period"]
            and (
                item["merchant"]
                if row["dimension"] == "merchant"
                else item["effective_category_major"]
            )
            == row["key"]
        )
    summary = (
        (
            await session.execute(
                select(MONTHLY_FLOW_SUMMARY_VIEW).where(
                    MONTHLY_FLOW_SUMMARY_VIEW.c.period == "2026-03"
                )
            )
        )
        .mappings()
        .one()
    )
    projection = await get_monthly_projection(session, reference_date=AS_OF)
    assert projection.observed_income == summary["income_total"]
    assert projection.observed_net_expense == summary["total_outflow"]
    assert projection.observed_net_cashflow == summary["residual"]
    # Loan link candidate detection is a row predicate, not a monthly aggregate.
    # Linked rows are always candidates. No classification or link is written.
    mappings = await list_loan_transaction_mappings(
        session,
        start_date=None,
        end_date=AS_OF,
        search=None,
        linked="linked",
        loan_account_id=None,
        repayment_type=None,
        review_status="all",
        page=1,
        per_page=100,
    )
    for item in mappings.items:
        raw = await session.scalar(
            select(tx.c.amount).where(tx.c.id == item.transaction_id)
        )
        assert item.amount == raw
    assert sum(
        -item.amount
        for item in mappings.items
        if item.date.strftime("%Y-%m") == "2026-01"
    ) == await session.scalar(
        select(func.sum(MONTHLY_FLOW_SUMMARY_VIEW.c.committed_loan_total)).where(
            MONTHLY_FLOW_SUMMARY_VIEW.c.period == "2026-01"
        )
    )


async def test_remaining_actuals_equal_views(db_session):
    await scenario_remaining_actuals_equal_views(db_session)


async def scenario_review_comparison(session):
    # Mid-month first month; no-data February; April has data but no purchases.
    # May's large payment is after the target's elapsed day, so it is excluded.
    rows = []
    for month, day, amount in [
        (1, 15, -900_000),
        (3, 1, -10_000),
        (3, 20, -200_000),
        (4, 1, 1),
        (5, 1, -30_000),
        (5, 20, -300_000),
        (6, 10, -100_000),
    ]:
        row = Transaction(
            date=date(2026, month, day),
            time=time(12),
            type="지출" if amount < 0 else "수입",
            amount=amount,
            currency="KRW",
            category_major="synthetic-category",
            description="synthetic-merchant",
            merchant="synthetic-merchant",
        )
        session.add(row)
        rows.append(row)
    await session.flush()
    session.add_all(
        TransactionNatureOverride(
            transaction_id=row.id, adjustability="adjustable", source="manual"
        )
        for row in rows
        if row.type == "지출"
    )
    await session.commit()
    result = await read_review_items(session, period="2026-06", limit=100)
    basis = result.data.comparison
    assert basis.target_start_date == date(2026, 6, 1)
    assert basis.target_end_date == date(2026, 6, 10)
    assert basis.baseline_periods == ["2026-03", "2026-04", "2026-05"]
    assert basis.partial_month_handling == "same_elapsed_days"
    assert not basis.ratio_metrics_available
    purchase = next(item for item in result.data.items if item.subject == "transaction")
    spikes = [
        reason for reason in purchase.listed_because if reason.code.endswith("spike")
    ]
    assert spikes
    for reason in spikes:
        assert (
            reason.signals[f"{reason.code}_baseline_avg"] == 10_000
        )  # median(10k, 0, 30k)
        assert reason.signals[f"{reason.code}_current_total"] == 100_000
        assert f"{reason.code}_ratio" not in reason.signals
    settings = (await get_analytics_settings(session)).effective.purchase_gate
    legacy = await get_purchase_gate_candidates(
        session,
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 10),
        settings=settings,
    )
    assert "merchant_spike" not in legacy.items[0].candidate_types
    await patch_analytics_settings(
        session,
        spending_anomalies={},
        comparison={"baseline_start_date": date(2026, 5, 1)},
    )
    changed = await read_review_items(session, period="2026-06", limit=100)
    assert changed.data.comparison.baseline_periods == ["2026-05"]
    signals = next(
        item for item in changed.data.items if item.subject == "transaction"
    ).listed_because
    assert any(
        reason.signals.get(f"{reason.code}_baseline_avg") == 30_000
        for reason in signals
    )
    # Deprecated endpoint ignores the new baseline-start setting until removal.
    unchanged = await get_purchase_gate_candidates(
        session,
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 10),
        settings=settings,
    )
    assert unchanged.model_dump() == legacy.model_dump()


async def test_review_comparison(db_session):
    await scenario_review_comparison(db_session)
