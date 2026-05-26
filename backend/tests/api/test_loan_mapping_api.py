from datetime import date, datetime, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.transaction import Transaction


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


async def test_loan_accounts_endpoint_returns_snapshot_candidates(
    async_client: AsyncClient,
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
        ]
    )
    await db_session.commit()

    response = await async_client.get("/api/v1/loan-accounts")

    assert response.status_code == 200
    assert response.json()["items"] == [
        {
            "loan_account_id": None,
            "lender": "국민은행",
            "product_name": "주택담보대출",
            "display_name_user": None,
            "display_name": "국민은행 주택담보대출",
            "loan_kind": "unknown",
            "latest_snapshot_date": "2026-05-31",
            "latest_balance": "209500000.00",
            "latest_interest_rate": "3.45",
        }
    ]


async def test_loan_account_metadata_endpoint_updates_display_name_and_kind(
    async_client: AsyncClient,
    api_headers: dict[str, str],
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

    unauthorized = await async_client.patch(
        "/api/v1/loan-accounts",
        json={
            "lender": "국민은행",
            "product_name": "주택담보대출",
            "display_name_user": "우리집 주담대",
            "loan_kind": "equal_principal_interest",
        },
    )
    assert unauthorized.status_code == 401

    response = await async_client.patch(
        "/api/v1/loan-accounts",
        headers=api_headers,
        json={
            "lender": "국민은행",
            "product_name": "주택담보대출",
            "display_name_user": "우리집 주담대",
            "loan_kind": "equal_principal_interest",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["loan_account_id"] is not None
    assert body["display_name_user"] == "우리집 주담대"
    assert body["display_name"] == "우리집 주담대"
    assert body["loan_kind"] == "equal_principal_interest"

    fetched = await async_client.get("/api/v1/loan-accounts")
    assert fetched.status_code == 200
    assert fetched.json()["items"][0]["display_name"] == "우리집 주담대"
    assert fetched.json()["items"][0]["loan_kind"] == "equal_principal_interest"


async def test_transaction_loan_link_endpoints_require_auth_and_support_crud(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    transaction = _transaction()
    account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    db_session.add_all([transaction, account])
    await db_session.commit()

    unauthorized = await async_client.put(
        f"/api/v1/transactions/{transaction.id}/loan-link",
        json={"loan_account_id": account.id, "repayment_type": "interest"},
    )
    assert unauthorized.status_code == 401

    created = await async_client.put(
        f"/api/v1/transactions/{transaction.id}/loan-link",
        headers=api_headers,
        json={
            "loan_account_id": account.id,
            "repayment_type": "interest",
            "memo": "이자 자동이체",
        },
    )
    assert created.status_code == 200
    assert created.json()["loan_account_id"] == account.id
    assert created.json()["repayment_type"] == "interest"
    assert created.json()["memo"] == "이자 자동이체"

    fetched = await async_client.get(f"/api/v1/transactions/{transaction.id}/loan-link")
    assert fetched.status_code == 200
    assert fetched.json()["link"]["lender"] == "국민은행"

    updated = await async_client.put(
        f"/api/v1/transactions/{transaction.id}/loan-link",
        headers=api_headers,
        json={
            "lender": "국민은행",
            "product_name": "주택담보대출",
            "repayment_type": "mixed",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["repayment_type"] == "mixed"

    deleted = await async_client.delete(
        f"/api/v1/transactions/{transaction.id}/loan-link",
        headers=api_headers,
    )
    assert deleted.status_code == 204

    fetched_after_delete = await async_client.get(
        f"/api/v1/transactions/{transaction.id}/loan-link"
    )
    assert fetched_after_delete.status_code == 200
    assert fetched_after_delete.json() == {"link": None}


async def test_bulk_transaction_loan_link_endpoint_maps_selected_transactions(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    transactions = [_transaction(), _transaction()]
    account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    db_session.add_all([*transactions, account])
    await db_session.commit()

    response = await async_client.put(
        "/api/v1/transactions/loan-links/bulk",
        headers=api_headers,
        json={
            "transaction_ids": [transaction.id for transaction in transactions],
            "loan_account_id": account.id,
            "repayment_type": "mixed",
            "memo": "매월 원리금",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"updated": 2}

    fetched = await async_client.get(
        f"/api/v1/transactions/{transactions[1].id}/loan-link"
    )
    assert fetched.status_code == 200
    assert fetched.json()["link"]["loan_account_id"] == account.id
    assert fetched.json()["link"]["repayment_type"] == "mixed"


async def test_loan_transaction_links_endpoint_lists_expense_candidates_with_link_state(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    linked = _transaction()
    linked.description = "국민은행 원리금 상환"
    linked.merchant = "국민은행"
    unlinked = _transaction()
    unlinked.date = date(2026, 5, 19)
    unlinked.description = "카카오뱅크 대출이자"
    unlinked.merchant = "카카오뱅크"
    income = _transaction()
    income.date = date(2026, 5, 18)
    income.type = "수입"
    income.description = "급여"
    income.merchant = "회사"
    unrelated_food = _transaction()
    unrelated_food.date = date(2026, 5, 17)
    unrelated_food.category_major = "식비"
    unrelated_food.category_minor = "외식"
    unrelated_food.description = "점심"
    unrelated_food.merchant = "식당"
    finance_without_keyword = _transaction()
    finance_without_keyword.date = date(2026, 5, 16)
    finance_without_keyword.category_major = "금융"
    finance_without_keyword.category_minor = "미분류"
    finance_without_keyword.description = "이니시스_선승인"
    finance_without_keyword.merchant = "이니시스_선승인"
    unrelated_donation = _transaction()
    unrelated_donation.date = date(2026, 5, 15)
    unrelated_donation.category_major = "기부/후원"
    unrelated_donation.category_minor = "미분류"
    unrelated_donation.description = "후원금"
    unrelated_donation.merchant = "후원금"
    account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    db_session.add_all([
        linked,
        unlinked,
        income,
        unrelated_food,
        finance_without_keyword,
        unrelated_donation,
        account,
    ])
    await db_session.commit()

    link_response = await async_client.put(
        f"/api/v1/transactions/{linked.id}/loan-link",
        headers=api_headers,
        json={
            "loan_account_id": account.id,
            "repayment_type": "mixed",
            "memo": "매월 자동이체",
        },
    )
    assert link_response.status_code == 200

    response = await async_client.get("/api/v1/loan-transaction-links")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert [item["transaction_id"] for item in body["items"]] == [
        linked.id,
        unlinked.id,
        finance_without_keyword.id,
    ]
    assert body["items"][0]["merchant"] == "국민은행"
    assert body["items"][0]["effective_category_minor"] == "대출상환"
    assert body["items"][0]["link"]["display_name"] == "국민은행 주택담보대출"
    assert body["items"][0]["link"]["repayment_type"] == "mixed"
    assert body["items"][1]["link"] is None

    linked_only = await async_client.get("/api/v1/loan-transaction-links?linked=linked")
    assert linked_only.status_code == 200
    assert linked_only.json()["total"] == 1
    assert linked_only.json()["items"][0]["transaction_id"] == linked.id

    unlinked_only = await async_client.get("/api/v1/loan-transaction-links?linked=unlinked")
    assert unlinked_only.status_code == 200
    assert unlinked_only.json()["total"] == 2
    assert [item["transaction_id"] for item in unlinked_only.json()["items"]] == [
        unlinked.id,
        finance_without_keyword.id,
    ]
