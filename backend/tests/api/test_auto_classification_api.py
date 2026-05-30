from datetime import date, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan_account import LoanAccount
from app.models.transaction import Transaction


async def test_auto_classification_settings_requires_api_key(
    async_client: AsyncClient,
) -> None:
    response = await async_client.get("/api/v1/auto-classification/settings")

    assert response.status_code == 401


async def test_category_rule_crud_and_apply_endpoint(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add(
        Transaction(
            date=date(2026, 5, 20),
            time=time(9, 0),
            type="지출",
            category_major="통신",
            category_minor="휴대폰",
            description="통신사",
            merchant="통신사",
            amount=-80000,
            currency="KRW",
            payment_method="카드",
            source="import",
        )
    )
    await db_session.commit()

    created = await async_client.post(
        "/api/v1/auto-classification/category-rules",
        headers=api_headers,
        json={
            "category_major": "통신",
            "category_minor": "휴대폰",
            "cost_kind": "fixed",
            "fixed_cost_necessity": "essential",
        },
    )
    assert created.status_code == 201

    listed = await async_client.get(
        "/api/v1/auto-classification/category-rules",
        headers=api_headers,
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["category_major"] == "통신"

    applied = await async_client.post(
        "/api/v1/auto-classification/apply/category-rules",
        headers=api_headers,
    )
    assert applied.status_code == 200
    assert applied.json() == {"updated": 1}

    transaction = (await async_client.get("/api/v1/transactions")).json()["items"][0]
    assert transaction["cost_kind"] == "fixed"
    assert transaction["fixed_cost_necessity"] == "essential"
    assert transaction["cost_classification_source"] == "auto"


async def test_loan_merchant_rule_crud_and_apply_endpoint(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    db_session.add_all(
        [
            account,
            Transaction(
                date=date(2026, 5, 20),
                time=time(9, 0),
                type="지출",
                category_major="금융",
                category_minor="대출상환",
                description="국민은행",
                merchant="국민은행",
                amount=-650000,
                currency="KRW",
                payment_method="국민은행 계좌",
                source="import",
            ),
        ]
    )
    await db_session.commit()

    created = await async_client.post(
        "/api/v1/auto-classification/loan-merchant-rules",
        headers=api_headers,
        json={
            "merchant": "국민은행",
            "loan_account_id": account.id,
            "repayment_type": "mixed",
            "memo": "자동 원리금",
        },
    )
    assert created.status_code == 201

    listed = await async_client.get(
        "/api/v1/auto-classification/loan-merchant-rules",
        headers=api_headers,
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["display_name"] == "국민은행 주택담보대출"

    applied = await async_client.post(
        "/api/v1/auto-classification/apply/loan-merchant-rules",
        headers=api_headers,
    )
    assert applied.status_code == 200
    assert applied.json() == {"updated": 1}

    mappings = await async_client.get("/api/v1/loan-transaction-links")
    assert mappings.json()["items"][0]["link"]["display_name"] == "국민은행 주택담보대출"
    assert mappings.json()["items"][0]["link"]["source"] == "auto"


async def test_recurring_category_rule_crud_and_apply_endpoint(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            Transaction(
                date=date(2026, 1, 5),
                time=time(9, 0),
                type="지출",
                category_major="구독",
                category_minor="OTT",
                description="넷플릭스",
                merchant="넷플릭스",
                amount=-17000,
                currency="KRW",
                payment_method="카드",
                source="import",
            ),
            Transaction(
                date=date(2026, 2, 5),
                time=time(9, 0),
                type="지출",
                category_major="구독",
                category_minor="OTT",
                description="넷플릭스",
                merchant="넷플릭스",
                amount=-17000,
                currency="KRW",
                payment_method="카드",
                source="import",
            ),
        ]
    )
    await db_session.commit()

    created = await async_client.post(
        "/api/v1/auto-classification/recurring-category-rules",
        headers=api_headers,
        json={
            "category_major": "구독",
            "category_minor": None,
            "recurring_payment_kind": "monthly_recurring",
        },
    )
    assert created.status_code == 201

    listed = await async_client.get(
        "/api/v1/auto-classification/recurring-category-rules",
        headers=api_headers,
    )
    assert listed.status_code == 200
    assert listed.json()["items"][0]["category_major"] == "구독"

    applied = await async_client.post(
        "/api/v1/auto-classification/apply/recurring-category-rules",
        headers=api_headers,
    )
    assert applied.status_code == 200
    assert applied.json() == {"updated": 2}

    transactions = (await async_client.get("/api/v1/transactions")).json()["items"]
    assert {item["recurring_payment_kind"] for item in transactions} == {
        "monthly_recurring"
    }


async def test_recurring_dry_run_returns_group_proposals_and_approval_applies_scope(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            Transaction(
                date=date(2026, 1, 5),
                time=time(9, 0),
                type="지출",
                category_major="구독",
                category_minor="OTT",
                description="왓챠",
                merchant="왓챠",
                amount=-12000,
                currency="KRW",
                payment_method="카드",
                source="import",
            ),
            Transaction(
                date=date(2026, 2, 5),
                time=time(9, 0),
                type="지출",
                category_major="구독",
                category_minor="OTT",
                description="왓챠",
                merchant="왓챠",
                amount=-12000,
                currency="KRW",
                payment_method="카드",
                source="import",
            ),
        ]
    )
    await db_session.commit()
    await async_client.post(
        "/api/v1/auto-classification/recurring-category-rules",
        headers=api_headers,
        json={
            "category_major": "구독",
            "category_minor": None,
            "recurring_payment_kind": "monthly_recurring",
        },
    )

    dry_run = await async_client.get(
        "/api/v1/auto-classification/recurring-category-rules/dry-run",
        headers=api_headers,
    )

    assert dry_run.status_code == 200
    proposal = dry_run.json()["items"][0]
    assert proposal["merchant"] == "왓챠"
    assert proposal["proposed_kind"] == "monthly_recurring"
    assert proposal["confidence"] == 1.0
    assert proposal["category_hint"] == "구독"
    assert proposal["apply_scope_options"] == ["all_matching", "future_only"]
    assert len(proposal["matched_transactions"]) == 2

    applied = await async_client.post(
        "/api/v1/auto-classification/apply/recurring-dry-run",
        headers=api_headers,
        json={
            "merchant": "왓챠",
            "proposed_kind": "monthly_recurring",
            "apply_scope": "all_matching",
        },
    )

    assert applied.status_code == 200
    assert applied.json() == {"updated": 2}
    transactions = (await async_client.get("/api/v1/transactions")).json()["items"]
    assert {item["recurring_payment_kind"] for item in transactions} == {
        "monthly_recurring"
    }


async def test_recurring_dry_run_future_only_does_not_backfill_existing_rows(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    db_session.add_all(
        [
            Transaction(
                date=date(2026, 1, 5),
                time=time(9, 0),
                type="지출",
                category_major="구독",
                category_minor="OTT",
                description="티빙",
                merchant="티빙",
                amount=-12000,
                currency="KRW",
                payment_method="카드",
                source="import",
            ),
            Transaction(
                date=date(2026, 2, 5),
                time=time(9, 0),
                type="지출",
                category_major="구독",
                category_minor="OTT",
                description="티빙",
                merchant="티빙",
                amount=-12000,
                currency="KRW",
                payment_method="카드",
                source="import",
            ),
        ]
    )
    await db_session.commit()
    await async_client.post(
        "/api/v1/auto-classification/recurring-category-rules",
        headers=api_headers,
        json={
            "category_major": "구독",
            "category_minor": None,
            "recurring_payment_kind": "monthly_recurring",
        },
    )

    applied = await async_client.post(
        "/api/v1/auto-classification/apply/recurring-dry-run",
        headers=api_headers,
        json={
            "merchant": "티빙",
            "proposed_kind": "monthly_recurring",
            "apply_scope": "future_only",
        },
    )

    assert applied.status_code == 200
    assert applied.json() == {"updated": 0}
    transactions = (await async_client.get("/api/v1/transactions")).json()["items"]
    assert {item["recurring_payment_kind"] for item in transactions} == {None}


async def test_patch_auto_classification_settings(
    async_client: AsyncClient,
    api_headers: dict[str, str],
) -> None:
    patched = await async_client.patch(
        "/api/v1/auto-classification/settings",
        headers=api_headers,
        json={
            "apply_cost_rules_on_upload": True,
            "apply_loan_rules_on_upload": True,
            "apply_recurring_rules_on_upload": True,
        },
    )

    assert patched.status_code == 200
    assert patched.json() == {
        "apply_cost_rules_on_upload": True,
        "apply_loan_rules_on_upload": True,
        "apply_recurring_rules_on_upload": True,
    }
