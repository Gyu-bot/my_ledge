from collections import Counter, defaultdict
from dataclasses import replace
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_classification import MerchantAliasRule
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
from app.services.installment_service import _add_months, _inactive_transaction_state

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
    suggestions = await load_installment_suggestion_candidates(db_session)
    if installment_plan_id is not None:
        suggestions = [
            item for item in suggestions if item.plan.id == installment_plan_id
        ]
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


async def load_installment_suggestion_candidates(
    db_session: AsyncSession,
) -> list[InstallmentSuggestionCandidate]:
    """Read-only candidates with conflicts computed across every active plan."""
    plans = await _load_active_plans(db_session, None)
    if not plans:
        return []
    transactions = await _load_unlinked_expense_transactions(db_session)
    occupied_numbers = await _load_occupied_plan_numbers(db_session, plans)
    linked_result = await db_session.execute(
        select(InstallmentTransactionLink.installment_plan_id, Transaction)
        .join(Transaction, Transaction.id == InstallmentTransactionLink.transaction_id)
        .where(
            InstallmentTransactionLink.installment_plan_id.in_(
                [plan.id for plan in plans]
            )
        )
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(Transaction.type == "지출")
        .where(Transaction.amount < 0)
    )
    linked_evidence: dict[int, list[Transaction]] = defaultdict(list)
    for plan_id, transaction in linked_result.all():
        linked_evidence[plan_id].append(transaction)
    alias_rules = list((await db_session.scalars(select(MerchantAliasRule))).all())
    return _build_suggestions(
        plans=plans,
        transactions=transactions,
        occupied_numbers=occupied_numbers,
        linked_evidence=linked_evidence,
        alias_rules=alias_rules,
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
        .where(Transaction.currency == "KRW")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(InstallmentTransactionLink.id.is_(None))
        .order_by(Transaction.date, Transaction.time, Transaction.id)
    )
    return list(result.scalars().all())


async def _load_occupied_plan_numbers(
    db_session: AsyncSession,
    plans: list[InstallmentPlan],
) -> dict[tuple[int, int], tuple[int, str | None]]:
    result = await db_session.execute(
        select(
            InstallmentTransactionLink.installment_plan_id,
            InstallmentTransactionLink.installment_number,
            Transaction,
        )
        .join(Transaction, Transaction.id == InstallmentTransactionLink.transaction_id)
        .where(
            InstallmentTransactionLink.installment_plan_id.in_(
                [plan.id for plan in plans]
            )
        )
    )
    return {
        (plan_id, number): (transaction.id, _inactive_transaction_state(transaction))
        for plan_id, number, transaction in result.all()
    }


def _build_suggestions(
    *,
    plans: list[InstallmentPlan],
    transactions: list[Transaction],
    occupied_numbers: dict[tuple[int, int], tuple[int, str | None]],
    linked_evidence: dict[int, list[Transaction]],
    alias_rules: list[MerchantAliasRule],
) -> list[InstallmentSuggestionCandidate]:
    suggestions: list[InstallmentSuggestionCandidate] = []
    for plan in plans:
        for transaction in transactions:
            suggestion = _match_transaction_to_plan(
                transaction=transaction,
                plan=plan,
                occupied_numbers=occupied_numbers,
                linked_evidence=linked_evidence.get(plan.id, []),
                alias_rules=alias_rules,
            )
            if suggestion is not None:
                suggestions.append(suggestion)
    plans_per_transaction = Counter(item.transaction.id for item in suggestions)
    transactions_per_slot = Counter(
        (item.plan.id, item.installment_number) for item in suggestions
    )
    for index, item in enumerate(suggestions):
        if item.conflict_reason is not None:
            continue
        conflict_reason = None
        if plans_per_transaction[item.transaction.id] > 1:
            conflict_reason = "ambiguous_plan_match"
        elif transactions_per_slot[(item.plan.id, item.installment_number)] > 1:
            conflict_reason = "competing_transactions"
        if conflict_reason is not None:
            suggestions[index] = replace(
                item, conflict_reason=conflict_reason, confidence="low"
            )
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
    occupied_numbers: dict[tuple[int, int], tuple[int, str | None]],
    linked_evidence: list[Transaction],
    alias_rules: list[MerchantAliasRule],
) -> InstallmentSuggestionCandidate | None:
    if plan.payment_method and transaction.payment_method != plan.payment_method:
        return None
    merchant_reason = _merchant_continuity_reason(
        transaction, plan, linked_evidence=linked_evidence, alias_rules=alias_rules
    )
    if merchant_reason is None:
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
    if merchant_reason != "same_merchant":
        reason_labels[0] = merchant_reason
        score = min(score, 89)
        confidence = "medium"
    conflicting = occupied_numbers.get((plan.id, installment_number))
    conflict_reason = None
    if conflicting is not None:
        conflict_reason = (
            "inactive_installment_link"
            if conflicting[1] is not None
            else "installment_number_already_linked"
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
        conflicting_transaction_id=conflicting[0] if conflicting is not None else None,
        conflicting_transaction_state=conflicting[1]
        if conflicting is not None
        else None,
    )


def _merchant_continuity_reason(
    transaction: Transaction,
    plan: InstallmentPlan,
    *,
    linked_evidence: list[Transaction],
    alias_rules: list[MerchantAliasRule],
) -> str | None:
    if transaction.merchant == plan.merchant:
        return "same_merchant"
    # Alias/description continuity is only evidence for review. Require exact
    # amount and an observed payment method; loose text similarity is insufficient.
    if abs(transaction.amount) != plan.monthly_amount or not transaction.payment_method:
        return None
    matching_evidence = [
        linked
        for linked in linked_evidence
        if linked.payment_method == transaction.payment_method
        and linked.currency == transaction.currency
        and abs(linked.amount) == plan.monthly_amount
    ]
    if transaction.description.strip() and any(
        linked.description.strip().casefold()
        == transaction.description.strip().casefold()
        for linked in matching_evidence
    ):
        return "same_linked_description"
    if any(linked.merchant == transaction.merchant for linked in matching_evidence):
        return "confirmed_merchant_alias"
    normalized_merchants = {
        rule.normalized_merchant
        for rule in alias_rules
        if rule.alias_pattern.strip()
        and rule.alias_pattern.casefold() in transaction.description.casefold()
    }
    if (
        normalized_merchants == {plan.merchant}
        and plan.payment_method == transaction.payment_method
    ):
        return "merchant_alias_rule"
    return None


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
