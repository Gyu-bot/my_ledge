from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.services.transactions_service import build_transactions_effective_select, list_transactions


def _transaction(
    *,
    tx_date: date,
    tx_time: time,
    tx_type: str,
    category_major: str,
    category_minor: str | None,
    description: str,
    merchant: str | None = None,
    amount: int,
    payment_method: str | None,
    memo: str | None = None,
    category_major_user: str | None = None,
    category_minor_user: str | None = None,
    is_deleted: bool = False,
    merged_into_id: int | None = None,
) -> Transaction:
    now = datetime(2026, 3, 26, 0, 0, 0)
    return Transaction(
        date=tx_date,
        time=tx_time,
        type=tx_type,
        category_major=category_major,
        category_minor=category_minor,
        category_major_user=category_major_user,
        category_minor_user=category_minor_user,
        description=description,
        merchant=merchant or description,
        amount=amount,
        currency="KRW",
        payment_method=payment_method,
        memo=memo,
        is_deleted=is_deleted,
        merged_into_id=merged_into_id,
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_build_transactions_effective_select_excludes_deleted_and_merged_rows(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 3, 10),
                tx_time=time(12, 0),
                tx_type="지출",
                category_major="미분류",
                category_minor="미분류",
                category_major_user="식비",
                category_minor_user="배달",
                description="쿠팡이츠",
                amount=-23000,
                payment_method="카드 A",
                memo="저녁",
            ),
            _transaction(
                tx_date=date(2026, 3, 9),
                tx_time=time(9, 0),
                tx_type="지출",
                category_major="교통",
                category_minor="택시",
                description="병합 후보",
                amount=-12000,
                payment_method="카드 B",
                is_deleted=True,
                merged_into_id=99,
            ),
        ]
    )
    await db_session.commit()

    canonical = build_transactions_effective_select().subquery()
    rows = (
        await db_session.execute(select(canonical).order_by(canonical.c.date.desc(), canonical.c.time.desc()))
    ).mappings().all()

    assert len(rows) == 1
    assert rows[0]["effective_category_major"] == "식비"
    assert rows[0]["effective_category_minor"] == "배달"
    assert rows[0]["cost_kind"] is None
    assert rows[0]["fixed_cost_necessity"] is None
    assert rows[0]["is_edited"] is True
    assert rows[0]["is_deleted"] is False
    assert rows[0]["merged_into_id"] is None


async def test_build_transactions_effective_select_exposes_merchant_and_marks_merchant_edits(
    db_session: AsyncSession,
) -> None:
    db_session.add(
        _transaction(
            tx_date=date(2026, 3, 11),
            tx_time=time(8, 0),
            tx_type="지출",
            category_major="식비",
            category_minor="카페",
            description="스타벅스 리저브 종로점",
            merchant="스타벅스",
            amount=-6900,
            payment_method="카드 A",
        )
    )
    await db_session.commit()

    canonical = build_transactions_effective_select().subquery()
    row = (
        await db_session.execute(select(canonical).order_by(canonical.c.id.desc()))
    ).mappings().first()

    assert row is not None
    assert row["description"] == "스타벅스 리저브 종로점"
    assert row["merchant"] == "스타벅스"
    assert row["is_edited"] is True


async def test_list_transactions_omits_sensitive_source_lineage_fields(
    db_session: AsyncSession,
) -> None:
    transaction = _transaction(
        tx_date=date(2026, 3, 12),
        tx_time=time(7, 30),
        tx_type="지출",
        category_major="생활",
        category_minor="기타",
        description="편의점",
        amount=-3200,
        payment_method="카드 A",
    )
    transaction.source_lifecycle_status = "missing_from_latest_export"
    transaction.source_row_hash = "hash-123"
    transaction.first_seen_import_id = 5
    transaction.last_seen_import_id = 6
    transaction.source_first_seen_at = datetime(2026, 3, 12, 7, 30)
    transaction.source_last_seen_at = datetime(2026, 3, 13, 7, 30)
    transaction.superseded_by_transaction_id = 99
    db_session.add(transaction)
    await db_session.commit()

    response = await list_transactions(
        db_session,
        start_date=None,
        end_date=None,
        tx_type="all",
        source="all",
        category_major=None,
        payment_method=None,
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
        cost_kind="all",
        fixed_cost_necessity="all",
        spend_necessity="all",
        recurring_payment_kind="all",
        page=1,
        per_page=40,
    )

    assert response.total == 1
    assert response.items[0].source == "import"
    payload = response.items[0].model_dump()
    assert "source_lifecycle_status" not in payload
    assert "source_row_hash" not in payload
    assert "first_seen_import_id" not in payload
    assert "last_seen_import_id" not in payload
    assert "source_first_seen_at" not in payload
    assert "source_last_seen_at" not in payload
    assert "superseded_by_transaction_id" not in payload


async def test_build_transactions_effective_select_exposes_loan_mapping_fields(
    db_session: AsyncSession,
) -> None:
    transaction = _transaction(
        tx_date=date(2026, 5, 15),
        tx_time=time(8, 30),
        tx_type="지출",
        category_major="금융",
        category_minor="미분류",
        description="원금·이자 자동이체",
        amount=-220511,
        payment_method="토스뱅크 통장",
    )
    account = LoanAccount(lender="토스뱅크", product_name="신용대출")
    db_session.add_all([transaction, account])
    await db_session.flush()
    db_session.add(
        LoanTransactionLink(
            transaction_id=transaction.id,
            loan_account_id=account.id,
            repayment_type="mixed",
            memo="매월 상환",
        )
    )
    await db_session.commit()

    canonical = build_transactions_effective_select().subquery()
    row = (
        await db_session.execute(select(canonical).where(canonical.c.id == transaction.id))
    ).mappings().one()

    assert row["loan_account_id"] == account.id
    assert row["loan_lender"] == "토스뱅크"
    assert row["loan_product_name"] == "신용대출"
    assert row["loan_repayment_type"] == "mixed"
    assert row["loan_link_memo"] == "매월 상환"


async def test_list_transactions_search_matches_transaction_memo(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            _transaction(
                tx_date=date(2026, 5, 10),
                tx_time=time(10, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="기타",
                description="기본 설명",
                merchant="기본 거래처",
                amount=-12000,
                payment_method="카드",
                memo="세탁비 정산",
            ),
            _transaction(
                tx_date=date(2026, 5, 11),
                tx_time=time(11, 0),
                tx_type="지출",
                category_major="생활",
                category_minor="기타",
                description="다른 설명",
                merchant="다른 거래처",
                amount=-15000,
                payment_method="카드",
            ),
        ]
    )
    await db_session.commit()

    response = await list_transactions(
        db_session,
        start_date=None,
        end_date=None,
        tx_type="all",
        source="all",
        category_major=None,
        payment_method=None,
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search="세탁비",
        cost_kind="all",
        fixed_cost_necessity="all",
        spend_necessity="all",
        recurring_payment_kind="all",
        page=1,
        per_page=40,
    )

    assert response.total == 1
    assert response.items[0].memo == "세탁비 정산"
