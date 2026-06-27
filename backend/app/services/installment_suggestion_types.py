from dataclasses import dataclass
from datetime import date

from app.models.installment_plan import InstallmentPlan
from app.models.transaction import Transaction
from app.schemas.installment import (
    InstallmentSuggestionConfidence,
    InstallmentTransactionSuggestionItem,
    InstallmentSuggestionTransactionItem,
)


@dataclass(frozen=True, slots=True)
class InstallmentSuggestionCandidate:
    transaction: Transaction
    plan: InstallmentPlan
    installment_number: int
    expected_billing_date: date
    amount_delta: int
    billing_day_delta: int
    score: int
    confidence: InstallmentSuggestionConfidence
    reason_labels: list[str]
    conflict_reason: str | None


def serialize_installment_suggestion(
    suggestion: InstallmentSuggestionCandidate,
) -> InstallmentTransactionSuggestionItem:
    transaction = suggestion.transaction
    return InstallmentTransactionSuggestionItem(
        transaction=InstallmentSuggestionTransactionItem(
            transaction_id=transaction.id,
            date=transaction.date,
            time=transaction.time,
            type=transaction.type,
            effective_category_major=(
                transaction.category_major_user or transaction.category_major
            ),
            effective_category_minor=(
                transaction.category_minor_user or transaction.category_minor
            ),
            description=transaction.description,
            merchant=transaction.merchant,
            amount=transaction.amount,
            currency=transaction.currency,
            payment_method=transaction.payment_method,
            memo=transaction.memo,
            recurring_payment_kind=transaction.recurring_payment_kind,
        ),
        installment_plan_id=suggestion.plan.id,
        installment_plan_display_name=suggestion.plan.display_name,
        installment_plan_merchant=suggestion.plan.merchant,
        total_installments=suggestion.plan.total_installments,
        monthly_amount=suggestion.plan.monthly_amount,
        first_payment_date=suggestion.plan.first_payment_date,
        suggested_installment_number=suggestion.installment_number,
        expected_billing_date=suggestion.expected_billing_date,
        amount_delta=suggestion.amount_delta,
        billing_day_delta=suggestion.billing_day_delta,
        score=suggestion.score,
        confidence=suggestion.confidence,
        reason_labels=suggestion.reason_labels,
        conflict_reason=suggestion.conflict_reason,
        is_usable=suggestion.conflict_reason is None,
    )
