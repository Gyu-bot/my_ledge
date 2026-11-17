"""Synthetic T065 human confirmation, discovery and stale-review regressions."""

from datetime import date, time

import pytest
from sqlalchemy import func, select

from app.models import (
    InstallmentPlan,
    InstallmentTransactionLink,
    LoanAccount,
    LoanTransactionLink,
    RecurringCommitment,
    Transaction,
    TransactionNatureOverride,
)
from app.services.loan_account_suggestion_service import suggest_from_history


def tx(day, *, merchant="합성기기", amount=-51007, payment="합성카드", **kwargs):
    return Transaction(
        date=day,
        time=time(9),
        type="지출",
        category_major="쇼핑",
        merchant=merchant,
        description=merchant,
        amount=amount,
        currency="KRW",
        payment_method=payment,
        **kwargs,
    )


def test_history_requires_joint_evidence_and_is_ambiguous_across_accounts():
    rows = [tx(date(2031, month, 30), id=month) for month in (3, 4)]
    candidate = tx(date(2031, 6, 1), id=10)
    result = suggest_from_history(candidate, {1: rows})
    assert result["suggested_loan_account_id"] == 1
    assert result["suggestion_confidence"] == "high"
    assert set(result["suggestion_reasons"]) == {
        "same_payment_method",
        "within_day_window",
        "merchant_seen",
        "amount_within_band",
    }
    # Generic merchant never decides without method + date.
    assert suggest_from_history(tx(date(2031, 6, 14)), {1: rows}) == {}
    assert (
        suggest_from_history(tx(date(2031, 6, 1), payment="다른카드"), {1: rows}) == {}
    )
    assert (
        suggest_from_history(
            tx(date(2031, 6, 1), merchant="새거래처", amount=-91007), {1: rows}
        )
        == {}
    )
    medium = suggest_from_history(tx(date(2031, 6, 1), merchant="새거래처"), {1: rows})
    assert medium["suggestion_confidence"] == "medium"
    assert "merchant_seen" not in medium["suggestion_reasons"]
    ambiguous = suggest_from_history(candidate, {1: rows, 2: rows})
    assert ambiguous["suggestion_ambiguous"] is True
    assert "suggested_loan_account_id" not in ambiguous
    assert suggest_from_history(candidate, {1: [tx(date(2031, 7, 30), id=20)]}) == {}


async def test_history_candidates_have_prefill_and_bulk_confirmation_is_atomic(
    async_client, db_session, api_headers
):
    accounts = [
        LoanAccount(lender=f"합성기관{i}", product_name="합성상품") for i in range(2)
    ]
    db_session.add_all(accounts)
    await db_session.flush()
    candidates = []
    for index, account in enumerate(accounts):
        for month in (3, 4):
            row = tx(
                date(2031, month, 20 + index),
                payment=f"합성통장{index}",
                merchant="합성대출",
            )
            db_session.add(row)
            await db_session.flush()
            db_session.add(
                LoanTransactionLink(
                    transaction_id=row.id,
                    loan_account_id=account.id,
                    repayment_type="mixed",
                    source="manual",
                )
            )
        candidate = tx(
            date(2031, 5, 20 + index), payment=f"합성통장{index}", merchant="합성대출"
        )
        db_session.add(candidate)
        candidates.append(candidate)
    await db_session.commit()
    response = await async_client.get("/api/v1/loan-transaction-links?linked=unlinked")
    items = response.json()["items"]
    assert len(items) == 2
    assert all(
        item["suggestion_basis"] == "history"
        and item["suggestion_confidence"] == "high"
        for item in items
    )
    assert (
        await db_session.scalar(select(func.count()).select_from(LoanTransactionLink))
        == 4
    )
    payload = {
        "items": [
            {"transaction_id": row.id, "loan_account_id": account.id}
            for row, account in zip(candidates, accounts)
        ]
    }
    url = "/api/v1/transactions/loan-links/accept-suggestions"
    assert (await async_client.post(url, json=payload)).status_code == 401
    wrong = {
        "items": [
            payload["items"][0],
            {**payload["items"][1], "loan_account_id": accounts[0].id},
        ]
    }
    assert (
        await async_client.post(url, json=wrong, headers=api_headers)
    ).status_code == 409
    assert (
        await db_session.scalar(select(func.count()).select_from(LoanTransactionLink))
        == 4
    )
    accepted = await async_client.post(url, json=payload, headers=api_headers)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["updated"] == 2
    assert (
        await async_client.post(url, json=payload, headers=api_headers)
    ).status_code == 409
    assert all(
        link.source == "manual"
        for link in (await db_session.scalars(select(LoanTransactionLink))).all()
    )


async def seed_series(db_session, **kwargs):
    rows = [
        tx(day, **kwargs)
        for day in (date(2031, 1, 30), date(2031, 3, 1), date(2031, 3, 30))
    ]
    db_session.add_all(rows)
    await db_session.commit()
    return rows


async def test_discovery_rounding_boundaries_dismiss_reupload_restore_and_atomic_create(
    async_client, db_session, api_headers
):
    rows = await seed_series(db_session)
    rows[0].amount -= 2  # remainder rounding on the first observed occurrence
    await db_session.commit()
    url = "/api/v1/installment-plan-candidates"
    response = await async_client.get(url)
    assert response.status_code == 200, response.text
    candidates = response.json()["items"]
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate["observed_count"] == 3
    assert candidate["monthly_amount"] == 51007
    assert candidate["starts_at_data_window_edge"] is True
    assert "total_installments" not in candidate
    key = candidate["series_key"]
    review_url = f"{url}/{key}/review"
    assert (
        await async_client.patch(review_url, json={"review_status": "not_installment"})
    ).status_code == 401
    assert (
        await async_client.patch(
            review_url, json={"review_status": "not_installment"}, headers=api_headers
        )
    ).status_code == 200
    assert (await async_client.get(url)).json()["items"] == []
    # Replacement IDs and an appended month preserve review identity.
    for row in rows:
        row.is_deleted = True
    replacements = [tx(row.date, amount=row.amount) for row in rows] + [
        tx(date(2031, 4, 30))
    ]
    db_session.add_all(replacements)
    await db_session.commit()
    assert (await async_client.get(url)).json()["items"] == []
    dismissed = (await async_client.get(url + "?include_dismissed=true")).json()[
        "items"
    ]
    assert len(dismissed) == 1 and dismissed[0]["series_key"] == key
    assert (
        await async_client.patch(
            review_url, json={"review_status": "pending"}, headers=api_headers
        )
    ).status_code == 200
    candidate = (await async_client.get(url)).json()["items"][0]
    payload = {
        "display_name": "합성기기 할부",
        "total_installments": 3,
        "first_payment_date": candidate["first_payment_date"],
        "transaction_ids": candidate["transaction_ids"],
    }
    create_url = f"{url}/{key}/create-plan"
    assert (await async_client.post(create_url, json=payload)).status_code == 401
    assert (
        await async_client.post(create_url, json=payload, headers=api_headers)
    ).status_code == 422
    assert (
        await db_session.scalar(select(func.count()).select_from(InstallmentPlan)) == 0
    )
    payload["total_installments"] = 6
    assert (
        await async_client.post(
            create_url,
            json={**payload, "transaction_ids": candidate["transaction_ids"][:-1]},
            headers=api_headers,
        )
    ).status_code == 409
    result = await async_client.post(create_url, json=payload, headers=api_headers)
    assert result.status_code == 201, result.text
    assert result.json()["linked_installment_count"] == 4
    links = (
        await db_session.scalars(
            select(InstallmentTransactionLink).order_by(
                InstallmentTransactionLink.installment_number
            )
        )
    ).all()
    assert [link.installment_number for link in links] == [1, 2, 3, 4]
    assert all(link.source == "manual" for link in links)
    assert (await async_client.get(url)).json()["items"] == []
    assert (
        await async_client.post(create_url, json=payload, headers=api_headers)
    ).status_code == 409


@pytest.mark.parametrize(
    "exclude",
    [
        "loan",
        "installment",
        "commitment",
        "explicit_commitment",
        "noncard",
        "foreign",
        "refund",
        "deleted",
        "merged",
        "gap",
        "different_merchant",
    ],
)
async def test_discovery_exclusions(async_client, db_session, exclude):
    rows = await seed_series(db_session)
    if exclude == "loan":
        account = LoanAccount(lender="합성기관", product_name="합성상품")
        db_session.add(account)
        await db_session.flush()
        db_session.add(
            LoanTransactionLink(
                transaction_id=rows[1].id,
                loan_account_id=account.id,
                source="manual",
                repayment_type="mixed",
            )
        )
    elif exclude == "installment":
        plan = InstallmentPlan(
            display_name="합성계획",
            merchant="합성기기",
            payment_method="합성카드",
            total_installments=6,
            monthly_amount=51007,
            first_payment_date=date(2031, 1, 30),
            status="active",
        )
        db_session.add(plan)
        await db_session.flush()
        db_session.add(
            InstallmentTransactionLink(
                transaction_id=rows[1].id,
                installment_plan_id=plan.id,
                installment_number=2,
                source="manual",
            )
        )
    elif "commitment" in exclude:
        commitment = RecurringCommitment(
            match_scope="merchant",
            merchant="합성기기" if exclude == "commitment" else "다른거래처",
            category_major="쇼핑",
            origin="user",
        )
        db_session.add(commitment)
        await db_session.flush()
        if exclude == "explicit_commitment":
            db_session.add(
                TransactionNatureOverride(
                    transaction_id=rows[1].id,
                    commitment_id=commitment.id,
                    source="user",
                )
            )
    elif exclude == "noncard":
        rows[1].payment_method = "합성통장"
    elif exclude == "foreign":
        rows[1].currency = "USD"
    elif exclude == "refund":
        rows[1].amount = 51007
    elif exclude == "deleted":
        rows[1].is_deleted = True
    elif exclude == "merged":
        rows[1].merged_into_id = rows[0].id
    elif exclude == "gap":
        rows[1].date = date(2031, 6, 30)
    else:
        rows[1].merchant = rows[1].description = "다른거래처"
    await db_session.commit()
    result = await async_client.get("/api/v1/installment-plan-candidates")
    assert result.status_code == 200, result.text
    assert result.json()["items"] == []


async def test_installment_bulk_revalidates_high_conflict_free_and_preserves_manual(
    async_client, db_session, api_headers
):
    plan = InstallmentPlan(
        display_name="합성계획",
        merchant="합성기기",
        payment_method="합성카드",
        total_installments=6,
        monthly_amount=51007,
        first_payment_date=date(2031, 1, 30),
        status="active",
    )
    rows = await seed_series(db_session)
    rows[1].date = date(2031, 2, 28)
    db_session.add(plan)
    await db_session.commit()
    suggestions = (
        await async_client.get("/api/v1/installment-transaction-suggestions")
    ).json()["items"]
    assert len(suggestions) == 3
    payload = {
        "items": [
            {
                "transaction_id": item["transaction"]["transaction_id"],
                "installment_plan_id": item["installment_plan_id"],
                "installment_number": item["suggested_installment_number"],
            }
            for item in suggestions
        ]
    }
    url = "/api/v1/transactions/installment-links/accept-suggestions"
    assert (await async_client.post(url, json=payload)).status_code == 401
    # Current competing transaction invalidates the whole confirmation.
    competitor = tx(rows[0].date)
    db_session.add(competitor)
    await db_session.commit()
    assert (
        await async_client.post(url, json=payload, headers=api_headers)
    ).status_code == 409
    assert (
        await db_session.scalar(
            select(func.count()).select_from(InstallmentTransactionLink)
        )
        == 0
    )
    competitor.is_deleted = True
    await db_session.commit()
    result = await async_client.post(url, json=payload, headers=api_headers)
    assert result.status_code == 200, result.text
    assert result.json()["updated"] == 3
    assert (
        await async_client.post(url, json=payload, headers=api_headers)
    ).status_code == 409


async def test_discovery_does_not_duplicate_an_existing_active_plan(
    async_client, db_session
):
    await seed_series(db_session)
    db_session.add(
        InstallmentPlan(
            display_name="등록된 합성계획",
            merchant="합성기기",
            payment_method="합성카드",
            total_installments=6,
            monthly_amount=51007,
            first_payment_date=date(2031, 1, 30),
            status="active",
        )
    )
    await db_session.commit()
    assert (await async_client.get("/api/v1/installment-plan-candidates")).json()[
        "items"
    ] == []
    assert (
        await async_client.get("/api/v1/installment-transaction-suggestions")
    ).json()["total"] == 3


async def test_disjoint_repeated_series_has_one_stable_candidate_at_a_time(
    async_client, db_session
):
    rows = [tx(date(2031, month, 15)) for month in (1, 2, 3, 6, 7, 8)]
    db_session.add_all(rows)
    await db_session.commit()
    candidates = (await async_client.get("/api/v1/installment-plan-candidates")).json()[
        "items"
    ]
    assert len(candidates) == 1
    assert candidates[0]["observed_count"] == 3


async def test_installment_bulk_rejects_medium_confidence(
    async_client, db_session, api_headers
):
    registered = InstallmentPlan(
        display_name="합성계획",
        merchant="합성기기",
        payment_method="합성카드",
        total_installments=6,
        monthly_amount=51007,
        first_payment_date=date(2031, 1, 30),
        status="active",
    )
    row = tx(date(2031, 2, 1))
    db_session.add_all([registered, row])
    await db_session.commit()
    suggestions = (
        await async_client.get("/api/v1/installment-transaction-suggestions")
    ).json()["items"]
    assert len(suggestions) == 1 and suggestions[0]["confidence"] == "medium"
    response = await async_client.post(
        "/api/v1/transactions/installment-links/accept-suggestions",
        headers=api_headers,
        json={
            "items": [
                {
                    "transaction_id": row.id,
                    "installment_plan_id": registered.id,
                    "installment_number": 1,
                }
            ]
        },
    )
    assert response.status_code == 409
    assert (
        await db_session.scalar(
            select(func.count()).select_from(InstallmentTransactionLink)
        )
        == 0
    )


@pytest.mark.parametrize(
    "payment",
    [
        "합성",
        "합성 ",
        "  합성  ",
        "가상신용",
        "가상 Card",
        "합성 포인트카드",
        "Sample Cashback Card",
        "합성페이 신용카드",
        "Sample Money CARD",
        "합성통장카드",
        "CMA Card",
        "선불카드",
    ],
)
async def test_short_or_padded_card_names_remain_discovery_candidates(
    async_client, db_session, payment
):
    rows = await seed_series(db_session, payment=payment)
    candidates = (await async_client.get("/api/v1/installment-plan-candidates")).json()[
        "items"
    ]
    assert len(candidates) == 1
    assert candidates[0]["transaction_ids"] == [row.id for row in rows]
    # Keep the ledger spelling and existing series key/plan matching contracts.
    assert candidates[0]["payment_method"] == payment


@pytest.mark.parametrize(
    "payment",
    [
        None,
        "",
        "   ",
        "합성통장",
        "저축예금 ",
        "가상저축",
        "합성적금",
        " 합성계좌 ",
        "자유입출금",
        "cMa",
        "합성파킹",
        "간편결제",
        "합성페이",
        "Sample Pay",
        "선불결제",
        "합성머니",
        "Sample Money",
        "포인트",
        "Sample POINT",
        " 현금 ",
        "CASH",
    ],
)
async def test_non_card_payment_forms_are_excluded_from_discovery(
    async_client, db_session, payment
):
    await seed_series(db_session, payment=payment)
    assert (await async_client.get("/api/v1/installment-plan-candidates")).json()[
        "items"
    ] == []
