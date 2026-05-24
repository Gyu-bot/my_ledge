from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.transaction import Transaction
from app.schemas.loan_mapping import (
    LoanTransactionLinkBulkUpsertRequest,
    LoanTransactionLinkUpsertRequest,
)
from app.services.loan_mapping_service import (
    bulk_upsert_transaction_loan_links,
    delete_transaction_loan_link,
    get_transaction_loan_link,
    list_loan_accounts,
    upsert_transaction_loan_link,
)


def _transaction() -> Transaction:
    now = datetime(2026, 5, 24, 0, 0, 0)
    return Transaction(
        date=date(2026, 5, 20),
        time=time(9, 0),
        type="지출",
        category_major="금융",
        category_minor="대출상환",
        description="국민은행 대출이자",
        merchant="국민은행",
        amount=-350000,
        currency="KRW",
        payment_method="국민은행 계좌",
        source="import",
        created_at=now,
        updated_at=now,
    )


async def test_list_loan_accounts_dedupes_snapshot_rows_by_lender_and_product(
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            Loan(
                snapshot_date=date(2026, 4, 30),
                lender="국민은행",
                product_name="주택담보대출",
                balance="210000000.00",
                interest_rate="3.50",
            ),
            Loan(
                snapshot_date=date(2026, 5, 31),
                lender="국민은행",
                product_name="주택담보대출",
                balance="209500000.00",
                interest_rate="3.45",
            ),
            Loan(
                snapshot_date=date(2026, 5, 31),
                lender="카카오뱅크",
                product_name="신용대출",
                balance="15000000.00",
                interest_rate="5.20",
            ),
        ]
    )
    await db_session.commit()

    response = await list_loan_accounts(db_session)

    assert [(item.lender, item.product_name) for item in response.items] == [
        ("국민은행", "주택담보대출"),
        ("카카오뱅크", "신용대출"),
    ]
    assert response.items[0].loan_account_id is None
    assert response.items[0].latest_snapshot_date == date(2026, 5, 31)
    assert response.items[0].latest_balance == Decimal("209500000.00")


async def test_upsert_transaction_loan_link_creates_account_from_lender_product(
    db_session: AsyncSession,
) -> None:
    transaction = _transaction()
    db_session.add(transaction)
    await db_session.commit()

    linked = await upsert_transaction_loan_link(
        db_session,
        transaction.id,
        LoanTransactionLinkUpsertRequest(
            lender="국민은행",
            product_name="주택담보대출",
            repayment_type="mixed",
            memo="원리금 자동이체",
        ),
    )

    assert linked.transaction_id == transaction.id
    assert linked.lender == "국민은행"
    assert linked.product_name == "주택담보대출"
    assert linked.repayment_type == "mixed"
    assert linked.memo == "원리금 자동이체"

    fetched = await get_transaction_loan_link(db_session, transaction.id)
    assert fetched.link is not None
    assert fetched.link.loan_account_id == linked.loan_account_id


async def test_upsert_transaction_loan_link_replaces_existing_account_mapping(
    db_session: AsyncSession,
) -> None:
    transaction = _transaction()
    first_account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    second_account = LoanAccount(lender="카카오뱅크", product_name="신용대출")
    db_session.add_all([transaction, first_account, second_account])
    await db_session.commit()

    await upsert_transaction_loan_link(
        db_session,
        transaction.id,
        LoanTransactionLinkUpsertRequest(
            loan_account_id=first_account.id,
            repayment_type="interest",
        ),
    )
    linked = await upsert_transaction_loan_link(
        db_session,
        transaction.id,
        LoanTransactionLinkUpsertRequest(
            loan_account_id=second_account.id,
            repayment_type="principal",
        ),
    )

    assert linked.loan_account_id == second_account.id
    assert linked.repayment_type == "principal"

    deleted = await delete_transaction_loan_link(db_session, transaction.id)
    assert deleted is True
    fetched = await get_transaction_loan_link(db_session, transaction.id)
    assert fetched.link is None


async def test_bulk_upsert_transaction_loan_links_maps_many_transactions_to_one_account(
    db_session: AsyncSession,
) -> None:
    transactions = [_transaction(), _transaction()]
    account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    db_session.add_all([*transactions, account])
    await db_session.commit()

    result = await bulk_upsert_transaction_loan_links(
        db_session,
        LoanTransactionLinkBulkUpsertRequest(
            transaction_ids=[transaction.id for transaction in transactions],
            loan_account_id=account.id,
            repayment_type="mixed",
            memo="매월 원리금",
        ),
    )

    assert result.updated == 2
    for transaction in transactions:
        fetched = await get_transaction_loan_link(db_session, transaction.id)
        assert fetched.link is not None
        assert fetched.link.loan_account_id == account.id
        assert fetched.link.repayment_type == "mixed"
