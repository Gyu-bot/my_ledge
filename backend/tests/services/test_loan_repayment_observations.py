"""Synthetic parity of loan observations, monthly flow and import overrides."""

from datetime import date, time
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction
from app.services.loan_mapping_service import (
    _estimate_monthly_payment,
    _load_linked_repayment_observations,
)
from app.services.metric_views import MONTHLY_FLOW_SUMMARY_VIEW
from test_upload_review_snapshot_detail import (
    detail_db as detail_db,
    synthetic_settings as synthetic_settings,
)


def transaction(amount=-100, month=7, **fields):
    return Transaction(
        **{
            "date": date(2026, month, 10),
            "time": time(12),
            "amount": amount,
            "type": "지출",
            "currency": "KRW",
            "category_major": "합성 분류",
            "description": "합성 거래",
            "merchant": "합성 거래처",
            **fields,
        }
    )


async def seed(db, rows, *, types=None):
    account = LoanAccount(lender="합성 기관", product_name="합성 대출")
    db.add_all([account, *rows])
    await db.flush()
    db.add_all(
        LoanTransactionLink(
            transaction_id=row.id,
            loan_account_id=account.id,
            repayment_type=types[i] if types else "mixed",
        )
        for i, row in enumerate(rows)
    )
    await db.commit()
    return account


async def observations(db, overrides=None):
    return await _load_linked_repayment_observations(
        db,
        lender="합성 기관",
        product_name="합성 대출",
        reference_date=date(2026, 10, 10),
        lookback_months=4,
        transaction_overrides=overrides,
    )


async def assert_flow(db, actual):
    summary = MONTHLY_FLOW_SUMMARY_VIEW
    expected = dict(
        (
            await db.execute(
                select(summary.c.period, summary.c.committed_loan_total)
                .where(summary.c.period.between("2026-07", "2026-09"))
                .order_by(summary.c.period)
            )
        ).all()
    )
    assert dict(
        zip(actual["observation_months"], actual["monthly_totals"], strict=True)
    ) == {
        period: Decimal(str(expected[period]))
        for period in actual["observation_months"]
    }
    assert all(
        total == 0 or period in actual["observation_months"]
        for period, total in expected.items()
    )


@pytest.mark.parametrize(
    "fields",
    [
        {"currency": "USD"},
        {"type": "수입"},
        {"type": "이체"},
        {"type": "기타"},
        {"source_lifecycle_status": "superseded"},
        {"is_deleted": True},
        {"merged_into_id": "anchor"},
        {"superseded_by_transaction_id": "anchor"},
    ],
)
async def test_ineligible_raw_links_do_not_enter_observations(detail_db, fields):
    db = detail_db
    anchor = transaction()
    db.add(anchor)
    await db.flush()
    fields = {k: anchor.id if v == "anchor" else v for k, v in fields.items()}
    await seed(
        db, [anchor, transaction(-900, month=8, **fields)], types=["mixed", "interest"]
    )
    actual = await observations(db)
    assert actual == {
        "monthly_totals": [Decimal("100")],
        "monthly_types": [{"mixed"}],
        "observation_months": ["2026-07"],
    }
    await assert_flow(db, actual)


async def test_refunds_currency_case_and_user_fields(detail_db):
    db = detail_db
    await seed(
        db,
        [
            transaction(-100, currency="krw", category_major_user="합성 수정 분류"),
            transaction(20),
            transaction(70, month=8),
            transaction(
                -40, month=9, source_lifecycle_status="missing_from_latest_export"
            ),
            transaction(-10, month=9, source_lifecycle_status="source_changed"),
            transaction(-10, month=9, source_lifecycle_status="duplicate_candidate"),
        ],
    )
    actual = await observations(db)
    assert actual["monthly_totals"] == [Decimal("80"), Decimal("-70"), Decimal("60")]
    await assert_flow(db, actual)
    assert (
        _estimate_monthly_payment([Decimal("-70")], min_observations=1, loan_kind=None)
        == 0
    )
    assert _estimate_monthly_payment(
        actual["monthly_totals"], min_observations=2, loan_kind="overdraft"
    ) == Decimal("23.33")


async def test_allocated_refund_follows_original_account_and_type(detail_db):
    db = detail_db
    original = transaction(-100)
    await seed(db, [original])
    other = LoanAccount(lender="다른 합성 기관", product_name="다른 합성 대출")
    refund = transaction(80, month=8)
    db.add_all([other, refund])
    await db.flush()
    db.add(
        LoanTransactionLink(
            transaction_id=refund.id,
            loan_account_id=other.id,
            repayment_type="interest",
        )
    )
    db.add(
        SettlementMatch(
            original_transaction_id=original.id,
            settlement_transaction_id=refund.id,
            status="user_confirmed",
            matched_amount=60,
        )
    )
    await db.commit()
    actual = await observations(db)
    assert actual["monthly_totals"] == [Decimal("100"), Decimal("-60")]
    assert actual["monthly_types"] == [{"mixed"}, {"mixed"}]
    summary = MONTHLY_FLOW_SUMMARY_VIEW
    assert (
        await db.scalar(
            select(summary.c.committed_loan_total).where(summary.c.period == "2026-08")
        )
        == -80
    )
    other_totals = await _load_linked_repayment_observations(
        db,
        lender=other.lender,
        product_name=other.product_name,
        reference_date=date(2026, 10, 10),
        lookback_months=4,
    )
    assert other_totals["monthly_totals"] == [Decimal("-20")]


@pytest.mark.parametrize("change", ["amount", "date_in", "date_out", "refund_sign"])
async def test_preview_totals_equal_post_apply_totals_without_writes(detail_db, change):
    db = detail_db
    rows = [transaction(-100), transaction(-200, month=8), transaction(-300, month=9)]
    await seed(db, rows)
    refund = transaction(60, month=9)  # unlinked, but attributed to the linked purchase
    db.add(refund)
    await db.flush()
    db.add(
        SettlementMatch(
            original_transaction_id=rows[0].id,
            settlement_transaction_id=refund.id,
            status="user_confirmed",
            matched_amount=60,
        )
    )
    if change == "date_in":
        rows[0].date, refund.date = date(2026, 6, 10), date(2026, 10, 10)
    await db.commit()
    overrides = {
        "amount": {rows[1].id: {"amount": -500}, refund.id: {"amount": 90}},
        "date_in": {
            rows[0].id: {"date": date(2026, 7, 10)},
            refund.id: {"date": date(2026, 9, 10)},
        },
        "date_out": {
            rows[0].id: {"date": date(2026, 6, 10)},
            refund.id: {"date": date(2026, 10, 10)},
        },
        "refund_sign": {refund.id: {"amount": -60}},
    }[change]
    before = await observations(db)
    preview = await observations(db, overrides)
    assert await observations(db) == before
    assert preview != before
    for transaction_id, fields in overrides.items():
        row = await db.get(Transaction, transaction_id)
        for field, value in fields.items():
            setattr(row, field, value)
    await db.commit()
    applied = await observations(db)
    assert preview == applied
    await assert_flow(db, applied)


async def test_recalculated_value_reaches_loan_cards_and_commitments(detail_db):
    from app.models.loan import Loan
    from app.services.assets_service import get_loan_summary
    from app.services.loan_mapping_service import (
        apply_loan_repayment_estimates_for_latest_snapshots,
    )
    from app.services.read_commitments_service import read_commitments

    db = detail_db
    account = await seed(
        db, [transaction(-100), transaction(-200, month=8), transaction(60, month=9)]
    )
    account.loan_kind = "overdraft"
    loan = Loan(
        snapshot_date=date(2026, 9, 30),
        lender=account.lender,
        product_name=account.product_name,
        balance=Decimal("1000"),
        monthly_payment=Decimal("900"),
        monthly_payment_source="estimated_from_linked_transactions",
    )
    db.add(loan)
    await db.commit()
    await apply_loan_repayment_estimates_for_latest_snapshots(
        db, loan_keys=[(account.lender, account.product_name)]
    )
    await db.commit()
    assert loan.monthly_payment == Decimal("80")
    summary = await get_loan_summary(db, None)
    assert summary.items[0].monthly_payment == loan.monthly_payment
    assert summary.items[0].monthly_payment_observation_months == [
        "2026-07",
        "2026-08",
        "2026-09",
    ]
    commitments = await read_commitments(db, period="2026-09")
    item = next(item for item in commitments.data.items if item.kind == "loan")
    assert item.monthly_burden == loan.monthly_payment
    assert item.monthly_burden_source == "estimated_from_linked_transactions"
    assert item.observation.observed_amount == -60
