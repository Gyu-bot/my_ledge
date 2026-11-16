"""T055 amount-conservation invariants (synthetic data only).

Each test reproduces one defect from the 2026-10-22 audit through the public
service path, then pins the corrected contract:

- F01: an approved replacement must count once, not twice.
- F02: partial or multiple refund allocation must preserve the signed net.
- F03: a refund that crosses a month boundary stays in the month it was
  posted (posting-date rule), so closed months do not change retroactively and
  the monthly cashflow agrees with the projection's observed actuals.
- F04: non-KRW amounts are never summed with KRW amounts.
"""

from datetime import date, time

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.parsers.transactions import TransactionRow
from app.schemas.settlement import SettlementMatchUpsertRequest
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services.analytics_service import (
    get_merchant_spend,
    get_monthly_cashflow,
)
from app.services.monthly_projection_service import get_monthly_projection
from app.services.settlement_match_service import upsert_manual_settlement_match
from app.services.upload_apply_service import apply_transaction_upload_from_rows
from app.services.upload_preview_service import preview_transaction_upload_from_rows


def _expense(
    *,
    tx_date: date,
    amount: int,
    merchant: str = "synthetic-shop",
    category: str = "synthetic-category",
    currency: str = "KRW",
    tx_time: time = time(12, 0),
    payment_method: str | None = "synthetic-card",
) -> Transaction:
    return Transaction(
        date=tx_date,
        time=tx_time,
        type="지출",
        category_major=category,
        category_minor=None,
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency=currency,
        payment_method=payment_method,
    )


def _expense_row(
    *, tx_date: date, amount: int, description: str, tx_time: time
) -> TransactionRow:
    return {
        "date": tx_date,
        "time": tx_time,
        "type": "지출",
        "category_major": "synthetic-category",
        "category_minor": None,
        "description": description,
        "merchant": description,
        "amount": amount,
        "currency": "KRW",
        "payment_method": "synthetic-card",
        "memo": None,
    }


async def _cashflow_by_period(db_session: AsyncSession) -> dict[str, int]:
    response = await get_monthly_cashflow(db_session, start_date=None, end_date=None)
    return {item.period: item.expense for item in response.items}


async def test_f01_approved_replacement_counts_once(db_session: AsyncSession) -> None:
    db_session.add(
        _expense(
            tx_date=date(2026, 3, 10),
            amount=-10_000,
            merchant="synthetic-old-description",
        )
    )
    await db_session.commit()
    incoming = [
        _expense_row(
            tx_date=date(2026, 3, 10),
            amount=-10_000,
            description="synthetic-new-description",
            tx_time=time(12, 0),
        )
    ]
    preview = await preview_transaction_upload_from_rows(db_session, incoming)
    change = preview.review_required_changes[0]
    assert change.change_type == "possible_replacement"

    await apply_transaction_upload_from_rows(
        db_session=db_session,
        parsed_rows=incoming,
        filename="synthetic-replacement.xlsx",
        snapshot_date=date(2026, 3, 31),
        apply_request=UploadApplyRequest(
            confirmation=True,
            selections=[
                UploadApplySelection(
                    change_type=change.change_type,
                    source_row_hash=change.source_row_hash or "",
                    existing_transaction_id=change.existing_transaction_id,
                )
            ],
        ),
    )

    assert await _cashflow_by_period(db_session) == {"2026-03": 10_000}
    merchants = await get_merchant_spend(
        db_session, start_date=None, end_date=None, tx_type="지출", limit=10
    )
    assert sum(item.amount for item in merchants.items) == 10_000


async def test_f02_partial_refund_allocation_preserves_signed_net(
    db_session: AsyncSession,
) -> None:
    purchase = _expense(tx_date=date(2026, 3, 5), amount=-10_000)
    refund = _expense(tx_date=date(2026, 3, 7), amount=8_000)
    db_session.add_all([purchase, refund])
    await db_session.commit()

    await upsert_manual_settlement_match(
        db_session,
        settlement_transaction_id=refund.id,
        payload=SettlementMatchUpsertRequest(
            original_transaction_id=purchase.id,
            status="user_confirmed",
            matched_amount=4_000,
        ),
    )

    # signed sum of the two rows is -2,000 regardless of allocation.
    assert await _cashflow_by_period(db_session) == {"2026-03": 2_000}


async def test_f02_multiple_refund_allocation_preserves_signed_net(
    db_session: AsyncSession,
) -> None:
    first = _expense(tx_date=date(2026, 3, 2), amount=-10_000, merchant="shop-a")
    second = _expense(tx_date=date(2026, 3, 3), amount=-5_000, merchant="shop-b")
    refund = _expense(tx_date=date(2026, 3, 9), amount=12_000, merchant="shop-a")
    db_session.add_all([first, second, refund])
    await db_session.commit()

    for original, allocated in ((first, 7_000), (second, 3_000)):
        await upsert_manual_settlement_match(
            db_session,
            settlement_transaction_id=refund.id,
            payload=SettlementMatchUpsertRequest(
                original_transaction_id=original.id,
                status="user_confirmed",
                matched_amount=allocated,
            ),
        )

    # 15,000 charged - 12,000 refunded; 2,000 of the refund is unallocated.
    assert await _cashflow_by_period(db_session) == {"2026-03": 3_000}
    from app.services.metrics_service import get_spend_cube

    categories = await get_spend_cube(
        db_session,
        start_period="2026-03",
        end_period="2026-03",
        group_by=["effective_category_major"],
        filters={},
        limit=200,
    )
    assert categories.total_amount == 3_000


async def test_f03_month_boundary_refund_stays_in_posting_month(
    db_session: AsyncSession,
) -> None:
    purchase = _expense(tx_date=date(2026, 2, 28), amount=-10_000)
    refund = _expense(tx_date=date(2026, 3, 2), amount=4_000)
    db_session.add_all([purchase, refund])
    await db_session.commit()

    before_link = await _cashflow_by_period(db_session)
    await upsert_manual_settlement_match(
        db_session,
        settlement_transaction_id=refund.id,
        payload=SettlementMatchUpsertRequest(
            original_transaction_id=purchase.id,
            status="user_confirmed",
        ),
    )
    after_link = await _cashflow_by_period(db_session)

    # A later confirmation must not rewrite the closed month.
    assert before_link == after_link == {"2026-02": 10_000, "2026-03": -4_000}

    projection = await get_monthly_projection(
        db_session, reference_date=date(2026, 2, 28)
    )
    assert projection.observed_net_expense == after_link["2026-02"]


async def test_f04_non_krw_amounts_are_not_summed_with_krw(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _expense(tx_date=date(2026, 3, 4), amount=-10_000),
            _expense(tx_date=date(2026, 3, 5), amount=-10, currency="USD"),
        ]
    )
    await db_session.commit()

    assert await _cashflow_by_period(db_session) == {"2026-03": 10_000}


async def test_insurance_estimate_excludes_superseded_and_non_krw_rows(
    db_session: AsyncSession,
) -> None:
    from app.services.assets_service import _estimate_monthly_insurance_premium

    old = _expense(tx_date=date(2026, 2, 10), amount=-30_000, category="보험")
    new = _expense(tx_date=date(2026, 2, 10), amount=-30_000, category="보험")
    foreign = _expense(
        tx_date=date(2026, 2, 11), amount=-20, category="보험", currency="USD"
    )
    db_session.add_all([old, new, foreign])
    await db_session.flush()
    old.source_lifecycle_status = "superseded"
    old.superseded_by_transaction_id = new.id
    await db_session.commit()

    estimate = await _estimate_monthly_insurance_premium(
        db_session, as_of_date=date(2026, 3, 5)
    )

    assert estimate.period == "2026-02"
    assert estimate.amount == 30_000
