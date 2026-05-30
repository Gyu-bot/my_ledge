from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.transaction import Transaction
from app.schemas.loan_mapping import (
    LoanAccountMetadataUpdateRequest,
    LoanTransactionLinkBulkUpsertRequest,
    LoanTransactionLinkUpsertRequest,
)
from app.services.loan_mapping_service import (
    bulk_upsert_transaction_loan_links,
    delete_transaction_loan_link,
    get_transaction_loan_link,
    list_loan_transaction_mappings,
    list_loan_accounts,
    update_loan_account_metadata,
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
                start_date=date(2021, 6, 1),
                maturity_date=date(2051, 5, 31),
            ),
            Loan(
                snapshot_date=date(2026, 5, 31),
                lender="국민은행",
                product_name="주택담보대출",
                balance="209500000.00",
                interest_rate="3.45",
                start_date=date(2021, 6, 1),
                maturity_date=date(2051, 5, 31),
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
    assert response.items[0].loan_kind == "unknown"
    assert response.items[0].latest_snapshot_date == date(2026, 5, 31)
    assert response.items[0].latest_balance == Decimal("209500000.00")
    assert response.items[0].loan_start_date == date(2021, 6, 1)
    assert response.items[0].loan_maturity_date == date(2051, 5, 31)


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


async def test_update_loan_account_metadata_saves_display_name_and_kind(
    db_session: AsyncSession,
) -> None:
    db_session.add(
        Loan(
            snapshot_date=date(2026, 5, 31),
            lender="국민은행",
            product_name="주택담보대출",
            balance="209500000.00",
            interest_rate="3.45",
        )
    )
    await db_session.commit()

    updated = await update_loan_account_metadata(
        db_session,
        LoanAccountMetadataUpdateRequest(
            lender="국민은행",
            product_name="주택담보대출",
            display_name_user="우리집 주담대",
            loan_kind="equal_principal_interest",
        ),
    )

    assert updated.loan_account_id is not None
    assert updated.display_name == "우리집 주담대"
    assert updated.loan_kind == "equal_principal_interest"
    accounts = await list_loan_accounts(db_session)
    assert accounts.items[0].display_name == "우리집 주담대"
    assert accounts.items[0].loan_kind == "equal_principal_interest"


async def test_list_loan_transaction_mappings_search_matches_transaction_memo(
    db_session: AsyncSession,
) -> None:
    matching = _transaction()
    matching.memo = "상환 확인 필요"
    other = _transaction()
    other.description = "카카오뱅크 대출이자"
    other.merchant = "카카오뱅크"
    other.memo = "다른 메모"
    db_session.add_all([matching, other])
    await db_session.commit()

    response = await list_loan_transaction_mappings(
        db_session,
        start_date=None,
        end_date=None,
        search="상환 확인",
        linked="all",
        loan_account_id=None,
        repayment_type=None,
        page=1,
        per_page=40,
    )

    assert response.total == 1
    assert response.items[0].memo == "상환 확인 필요"


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


async def test_upsert_transaction_loan_link_updates_latest_loan_snapshot_estimate(
    db_session: AsyncSession,
) -> None:
    march = _transaction()
    march.date = date(2026, 3, 20)
    march.amount = -300000
    april = _transaction()
    april.date = date(2026, 4, 20)
    april.amount = -500000
    older_loan = Loan(
        snapshot_date=date(2026, 4, 30),
        lender="국민은행",
        product_name="주택담보대출",
        balance=Decimal("101000000.00"),
    )
    latest_loan = Loan(
        snapshot_date=date(2026, 5, 31),
        lender="국민은행",
        product_name="주택담보대출",
        balance=Decimal("100000000.00"),
    )
    db_session.add_all(
        [
            march,
            april,
            older_loan,
            latest_loan,
            AppSetting(
                scope="analytics.asset_liability_health",
                key="monthly_payment_estimate_lookback_months",
                value="3",
            ),
            AppSetting(
                scope="analytics.asset_liability_health",
                key="monthly_payment_min_observations",
                value="2",
            ),
        ]
    )
    await db_session.commit()

    await upsert_transaction_loan_link(
        db_session,
        march.id,
        LoanTransactionLinkUpsertRequest(
            lender="국민은행",
            product_name="주택담보대출",
            repayment_type="mixed",
        ),
    )
    await upsert_transaction_loan_link(
        db_session,
        april.id,
        LoanTransactionLinkUpsertRequest(
            lender="국민은행",
            product_name="주택담보대출",
            repayment_type="mixed",
        ),
    )

    await db_session.refresh(older_loan)
    await db_session.refresh(latest_loan)

    assert latest_loan.monthly_payment == Decimal("400000.00")
    assert latest_loan.monthly_payment_source == "estimated_from_linked_transactions"
    assert latest_loan.repayment_method == "principal_interest"
    assert latest_loan.repayment_method_source == "estimated_from_linked_transactions"
    assert older_loan.monthly_payment is None


async def test_bulk_upsert_transaction_loan_links_keeps_manual_monthly_payment(
    db_session: AsyncSession,
) -> None:
    march = _transaction()
    march.date = date(2026, 3, 20)
    march.amount = -300000
    april = _transaction()
    april.date = date(2026, 4, 20)
    april.amount = -500000
    latest_loan = Loan(
        snapshot_date=date(2026, 5, 31),
        lender="국민은행",
        product_name="주택담보대출",
        balance=Decimal("100000000.00"),
        monthly_payment=Decimal("650000.00"),
        monthly_payment_source="manual",
    )
    db_session.add_all(
        [
            march,
            april,
            latest_loan,
            AppSetting(
                scope="analytics.asset_liability_health",
                key="monthly_payment_estimate_lookback_months",
                value="3",
            ),
            AppSetting(
                scope="analytics.asset_liability_health",
                key="monthly_payment_min_observations",
                value="2",
            ),
        ]
    )
    await db_session.commit()

    result = await bulk_upsert_transaction_loan_links(
        db_session,
        LoanTransactionLinkBulkUpsertRequest(
            transaction_ids=[march.id, april.id],
            lender="국민은행",
            product_name="주택담보대출",
            repayment_type="mixed",
        ),
    )

    await db_session.refresh(latest_loan)

    assert result.updated == 2
    assert latest_loan.monthly_payment == Decimal("650000.00")
    assert latest_loan.monthly_payment_source == "manual"
    assert latest_loan.repayment_method == "principal_interest"
    assert latest_loan.repayment_method_source == "estimated_from_linked_transactions"
