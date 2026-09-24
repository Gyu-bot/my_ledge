from datetime import date, time

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import MerchantAliasRule
from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.transaction import Transaction
from app.services.installment_service import (
    get_installment_forecast,
    list_installment_transaction_mappings,
)
from app.services.installment_suggestion_service import (
    list_installment_transaction_suggestions,
)


def _plan(merchant: str = "쇼핑몰", first: date = date(2026, 4, 30)) -> InstallmentPlan:
    return InstallmentPlan(
        display_name="기기 할부",
        merchant=merchant,
        payment_method="카드",
        total_installments=12,
        monthly_amount=120000,
        first_payment_date=first,
    )


def _tx(
    tx_date: date,
    merchant: str = "쇼핑몰(간편결제)",
    description: str = "쇼핑몰(간편결제)",
) -> Transaction:
    return Transaction(
        date=tx_date,
        time=time(9),
        type="지출",
        category_major="쇼핑",
        category_minor="전자기기",
        description=description,
        merchant=merchant,
        amount=-120000,
        currency="KRW",
        payment_method="카드",
    )


async def test_confirmed_raw_description_exposes_unclassified_next_payments_without_linking(
    db_session: AsyncSession,
) -> None:
    plan = _plan()
    linked = _tx(date(2026, 4, 30), merchant="쇼핑몰")
    next_payments = [_tx(date(2026, month, 30)) for month in [5, 6, 7]]
    unrelated = _tx(date(2026, 6, 30), description="다른 일반구매")
    wrong_method = _tx(date(2026, 8, 30))
    wrong_method.payment_method = "다른카드"
    wrong_amount = _tx(date(2026, 8, 30))
    wrong_amount.amount = -119000
    wrong_day = _tx(date(2026, 8, 15))
    db_session.add_all(
        [plan, linked, *next_payments, unrelated, wrong_method, wrong_amount, wrong_day]
    )
    await db_session.flush()
    db_session.add(
        InstallmentTransactionLink(
            transaction_id=linked.id,
            installment_plan_id=plan.id,
            installment_number=1,
            source="manual",
        )
    )
    await db_session.commit()
    response = await list_installment_transaction_suggestions(
        db_session,
        installment_plan_id=plan.id,
        page=1,
        per_page=40,
    )
    assert response.total == 3
    assert [item.suggested_installment_number for item in response.items] == [2, 3, 4]
    assert all(
        item.reason_labels[0] == "same_linked_description" for item in response.items
    )
    assert all(
        item.is_usable and item.confidence == "medium" for item in response.items
    )
    assert all(
        item.transaction.recurring_payment_kind is None for item in response.items
    )
    mappings = await list_installment_transaction_mappings(
        db_session,
        start_date=None,
        end_date=None,
        search=None,
        linked="unlinked",
        installment_plan_id=plan.id,
        page=1,
        per_page=2,
    )
    assert mappings.total == 3
    assert len(mappings.items) == 2
    assert {item.transaction_id for item in mappings.items}.issubset(
        {tx.id for tx in next_payments}
    )
    assert (
        await db_session.scalar(
            select(func.count()).select_from(InstallmentTransactionLink)
        )
        == 1
    )
    assert all(tx.recurring_payment_kind is None for tx in next_payments)


async def test_alias_rules_are_review_evidence_and_conflicting_alias_targets_are_rejected(
    db_session: AsyncSession,
) -> None:
    plan = _plan()
    tx = _tx(date(2026, 5, 30))
    rule = MerchantAliasRule(alias_pattern="간편결제", normalized_merchant="쇼핑몰")
    db_session.add_all([plan, tx, rule])
    await db_session.commit()
    response = await list_installment_transaction_suggestions(
        db_session, installment_plan_id=None, page=1, per_page=40
    )
    assert response.total == 1
    assert response.items[0].reason_labels[0] == "merchant_alias_rule"
    assert response.items[0].confidence == "medium"
    db_session.add(
        MerchantAliasRule(alias_pattern="쇼핑몰", normalized_merchant="다른몰")
    )
    await db_session.commit()
    ambiguous = await list_installment_transaction_suggestions(
        db_session, installment_plan_id=None, page=1, per_page=40
    )
    assert ambiguous.total == 0


async def test_competing_plan_candidates_remain_ambiguous_when_plan_filter_is_applied(
    db_session: AsyncSession,
) -> None:
    plans = [_plan(), _plan()]
    tx = _tx(date(2026, 5, 30), merchant="쇼핑몰")
    db_session.add_all([*plans, tx])
    await db_session.commit()
    response = await list_installment_transaction_suggestions(
        db_session,
        installment_plan_id=plans[0].id,
        page=1,
        per_page=40,
    )
    assert response.total == 1
    assert response.items[0].is_usable is False
    assert response.items[0].conflict_reason == "ambiguous_plan_match"
    assert (
        await db_session.scalar(
            select(func.count()).select_from(InstallmentTransactionLink)
        )
        == 0
    )


async def test_two_transactions_for_one_slot_are_not_usable_recommendations(
    db_session: AsyncSession,
) -> None:
    plan = _plan()
    transactions = [_tx(date(2026, 5, 30), merchant="쇼핑몰") for _ in range(2)]
    transactions[1].time = time(11)
    db_session.add_all([plan, *transactions])
    await db_session.commit()
    response = await list_installment_transaction_suggestions(
        db_session, installment_plan_id=None, page=1, per_page=40
    )
    assert response.total == 2
    assert all(
        not item.is_usable and item.conflict_reason == "competing_transactions"
        for item in response.items
    )
    assert {item.transaction.time for item in response.items} == {time(9), time(11)}


async def test_deleted_link_is_not_continuity_evidence_or_observed_forecast(
    db_session: AsyncSession,
) -> None:
    plan = _plan()
    linked = _tx(date(2026, 4, 30), merchant="쇼핑몰")
    linked.is_deleted = True
    candidate = _tx(date(2026, 5, 30))
    db_session.add_all([plan, linked, candidate])
    await db_session.flush()
    db_session.add(
        InstallmentTransactionLink(
            transaction_id=linked.id, installment_plan_id=plan.id, installment_number=1
        )
    )
    await db_session.commit()
    response = await list_installment_transaction_suggestions(
        db_session, installment_plan_id=None, page=1, per_page=40
    )
    assert response.total == 0
    forecast = await get_installment_forecast(
        db_session, as_of_date=date(2026, 5, 15), months=1
    )
    assert forecast.items[0].status == "missed"
    assert forecast.items[0].transaction_id is None


async def test_full_schedule_separates_unconfirmed_past_from_future_obligations(
    db_session: AsyncSession,
) -> None:
    plan = _plan(first=date(2026, 1, 30))
    linked = _tx(date(2026, 1, 30), merchant="쇼핑몰")
    db_session.add_all([plan, linked])
    await db_session.flush()
    db_session.add(
        InstallmentTransactionLink(
            transaction_id=linked.id, installment_plan_id=plan.id, installment_number=1
        )
    )
    await db_session.commit()
    forecast = await get_installment_forecast(
        db_session, as_of_date=date(2026, 9, 24), months=6
    )
    assert len(forecast.items) == 12
    assert [
        item.installment_number for item in forecast.items if item.is_future_obligation
    ] == [9, 10, 11, 12]
    assert (
        sum(month.projected_total for month in forecast.monthly_summary) == 4 * 120000
    )
    assert (
        sum(month.past_unconfirmed_total for month in forecast.monthly_summary)
        == 7 * 120000
    )
    assert all(
        month.past_unconfirmed_total == month.missed_total
        for month in forecast.monthly_summary
    )
    assert all(
        item.status_label == "과거 연결 미확인"
        for item in forecast.items
        if item.status == "missed"
    )
    assert all(
        not item.is_future_obligation
        for item in forecast.items
        if item.status != "projected"
    )
