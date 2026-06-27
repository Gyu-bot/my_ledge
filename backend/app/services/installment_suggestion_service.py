from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.transaction import Transaction
from app.schemas.installment import (
    InstallmentSuggestionConfidence,
    InstallmentTransactionSuggestionListResponse,
)
from app.services.installment_suggestion_types import (
    InstallmentSuggestionCandidate,
    serialize_installment_suggestion,
)
from app.services.installment_service import _add_months

_BILLING_DATE_TOLERANCE_DAYS = 3
_AMOUNT_TOLERANCE_RATIO = 0.10
_AMOUNT_TOLERANCE_FLOOR = 10_000

async def list_installment_transaction_suggestions(
    db_session: AsyncSession,
    *,
    installment_plan_id: int | None,
    page: int,
    per_page: int,
) -> InstallmentTransactionSuggestionListResponse:
    if installment_plan_id is not None:
        await _ensure_plan_exists(db_session, installment_plan_id)
    plans = await _load_active_plans(db_session, installment_plan_id)
    if not plans:
        return InstallmentTransactionSuggestionListResponse(
            total=0,
            page=page,
            per_page=per_page,
            items=[],
        )

    transactions = await _load_unlinked_expense_transactions(db_session)
    occupied_numbers = await _load_occupied_plan_numbers(db_session, plans)
    suggestions = _build_suggestions(
        plans=plans,
        transactions=transactions,
        occupied_numbers=occupied_numbers,
    )
    start = (page - 1) * per_page
    end = start + per_page
    return InstallmentTransactionSuggestionListResponse(
        total=len(suggestions),
        page=page,
        per_page=per_page,
        items=[
            serialize_installment_suggestion(item) for item in suggestions[start:end]
        ],
    )


async def _ensure_plan_exists(
    db_session: AsyncSession,
    installment_plan_id: int,
) -> None:
    plan = await db_session.get(InstallmentPlan, installment_plan_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Installment plan not found.",
        )


async def _load_active_plans(
    db_session: AsyncSession,
    installment_plan_id: int | None,
) -> list[InstallmentPlan]:
    query = select(InstallmentPlan).where(InstallmentPlan.status == "active")
    if installment_plan_id is not None:
        query = query.where(InstallmentPlan.id == installment_plan_id)
    result = await db_session.execute(
        query.order_by(InstallmentPlan.first_payment_date, InstallmentPlan.id)
    )
    return list(result.scalars().all())


async def _load_unlinked_expense_transactions(
    db_session: AsyncSession,
) -> list[Transaction]:
    result = await db_session.execute(
        select(Transaction)
        .outerjoin(
            InstallmentTransactionLink,
            InstallmentTransactionLink.transaction_id == Transaction.id,
        )
        .where(Transaction.type == "지출")
        .where(Transaction.amount < 0)
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(InstallmentTransactionLink.id.is_(None))
        .order_by(Transaction.date, Transaction.time, Transaction.id)
    )
    return list(result.scalars().all())


async def _load_occupied_plan_numbers(
    db_session: AsyncSession,
    plans: list[InstallmentPlan],
) -> set[tuple[int, int]]:
    result = await db_session.execute(
        select(
            InstallmentTransactionLink.installment_plan_id,
            InstallmentTransactionLink.installment_number,
        ).where(
            InstallmentTransactionLink.installment_plan_id.in_(
                [plan.id for plan in plans]
            )
        )
    )
    return {(plan_id, number) for plan_id, number in result.all()}


def _build_suggestions(
    *,
    plans: list[InstallmentPlan],
    transactions: list[Transaction],
    occupied_numbers: set[tuple[int, int]],
) -> list[InstallmentSuggestionCandidate]:
    suggestions: list[InstallmentSuggestionCandidate] = []
    for plan in plans:
        for transaction in transactions:
            suggestion = _match_transaction_to_plan(
                transaction=transaction,
                plan=plan,
                occupied_numbers=occupied_numbers,
            )
            if suggestion is not None:
                suggestions.append(suggestion)
    return sorted(
        suggestions,
        key=lambda item: (
            item.expected_billing_date,
            item.plan.display_name,
            item.transaction.date,
            item.transaction.id,
        ),
    )


def _match_transaction_to_plan(
    *,
    transaction: Transaction,
    plan: InstallmentPlan,
    occupied_numbers: set[tuple[int, int]],
) -> InstallmentSuggestionCandidate | None:
    if transaction.merchant != plan.merchant:
        return None
    installment_number = _suggest_installment_number(
        first_payment_date=plan.first_payment_date,
        transaction_date=transaction.date,
    )
    if installment_number < 1 or installment_number > plan.total_installments:
        return None
    expected_billing_date = _add_months(
        plan.first_payment_date,
        installment_number - 1,
    )
    amount_delta = abs(abs(transaction.amount) - plan.monthly_amount)
    if amount_delta > _amount_tolerance(plan.monthly_amount):
        return None
    billing_day_delta = abs((transaction.date - expected_billing_date).days)
    if billing_day_delta > _BILLING_DATE_TOLERANCE_DAYS:
        return None
    score, confidence, reason_labels = _score_match(
        transaction=transaction,
        plan=plan,
        amount_delta=amount_delta,
        billing_day_delta=billing_day_delta,
    )
    conflict_reason = (
        "installment_number_already_linked"
        if (plan.id, installment_number) in occupied_numbers
        else None
    )
    return InstallmentSuggestionCandidate(
        transaction=transaction,
        plan=plan,
        installment_number=installment_number,
        expected_billing_date=expected_billing_date,
        amount_delta=amount_delta,
        billing_day_delta=billing_day_delta,
        score=score,
        confidence=confidence,
        reason_labels=reason_labels,
        conflict_reason=conflict_reason,
    )


def _suggest_installment_number(
    *,
    first_payment_date: date,
    transaction_date: date,
) -> int:
    return (
        (transaction_date.year - first_payment_date.year) * 12
        + transaction_date.month
        - first_payment_date.month
        + 1
    )


def _amount_tolerance(monthly_amount: int) -> int:
    return max(int(monthly_amount * _AMOUNT_TOLERANCE_RATIO), _AMOUNT_TOLERANCE_FLOOR)


def _score_match(
    *,
    transaction: Transaction,
    plan: InstallmentPlan,
    amount_delta: int,
    billing_day_delta: int,
) -> tuple[int, InstallmentSuggestionConfidence, list[str]]:
    score = 70
    reason_labels = ["same_merchant", "similar_amount"]
    if billing_day_delta == 0:
        score += 15
        reason_labels.append("same_billing_day")
    else:
        score += 8
        reason_labels.append("near_billing_day")
    if amount_delta == 0:
        score += 5
        reason_labels.append("same_amount")
    if (
        plan.payment_method is not None
        and transaction.payment_method == plan.payment_method
    ):
        score += 5
        reason_labels.append("same_payment_method")
    capped_score = min(score, 100)
    if capped_score >= 90:
        confidence: InstallmentSuggestionConfidence = "high"
    elif capped_score >= 80:
        confidence = "medium"
    else:
        confidence = "low"
    return capped_score, confidence, reason_labels
