"""Read-only loan suggestions. History is evidence for human confirmation only."""

from collections import defaultdict
from statistics import median

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.services.installment_service import _add_months


def _text(value: str | None) -> str:
    return " ".join((value or "").casefold().split())


def suggest_from_history(
    transaction: Transaction, history: dict[int, list[Transaction]]
) -> dict:
    qualifying = []
    for account_id, rows in history.items():
        # Only prior observations of the same payment method; no future leakage.
        recent = sorted(
            (
                row
                for row in rows
                if row.id != transaction.id
                and row.date < transaction.date
                and row.payment_method == transaction.payment_method
                and row.currency == transaction.currency
            ),
            key=lambda row: (row.date, row.id),
            reverse=True,
        )[:6]
        if not transaction.payment_method or not recent:
            continue
        close = [
            row
            for row in recent
            if min(
                abs((transaction.date - _add_months(row.date, offset)).days)
                for offset in (
                    (transaction.date.year - row.date.year) * 12
                    + transaction.date.month
                    - row.date.month
                    - 1,
                    (transaction.date.year - row.date.year) * 12
                    + transaction.date.month
                    - row.date.month,
                    (transaction.date.year - row.date.year) * 12
                    + transaction.date.month
                    - row.date.month
                    + 1,
                )
            )
            <= 3
        ]
        if not close:
            continue
        merchant_seen = any(
            (
                _text(transaction.merchant)
                and _text(transaction.merchant) == _text(row.merchant)
            )
            or (
                _text(transaction.description)
                and _text(transaction.description) == _text(row.description)
            )
            for row in close
        )
        baseline = median(abs(row.amount) for row in close)
        amount_within_band = abs(abs(transaction.amount) - baseline) <= baseline * 0.15
        if not merchant_seen and not amount_within_band:
            continue
        reasons = ["same_payment_method", "within_day_window"]
        if merchant_seen:
            reasons.append("merchant_seen")
        if amount_within_band:
            reasons.append("amount_within_band")
        qualifying.append(
            (
                account_id,
                reasons,
                "high" if merchant_seen and len(close) >= 2 else "medium",
            )
        )
    if len(qualifying) > 1:
        return {
            "suggestion_basis": "history",
            "suggestion_ambiguous": True,
            "suggestion_confidence": "low",
            "suggestion_reasons": ["multiple_accounts"],
        }
    if not qualifying:
        return {}
    account_id, reasons, confidence = qualifying[0]
    return {
        "suggested_loan_account_id": account_id,
        "suggestion_basis": "history",
        "suggestion_confidence": confidence,
        "suggestion_reasons": reasons,
    }


async def load_history_suggestions(db_session: AsyncSession) -> dict[int, dict]:
    history: dict[int, list[Transaction]] = defaultdict(list)
    result = await db_session.execute(
        select(LoanTransactionLink.loan_account_id, Transaction)
        .join(Transaction, Transaction.id == LoanTransactionLink.transaction_id)
        .where(
            Transaction.is_deleted.is_(False),
            Transaction.merged_into_id.is_(None),
            Transaction.type == "지출",
            Transaction.amount < 0,
            Transaction.currency == "KRW",
        )
    )
    for account_id, transaction in result.all():
        history[account_id].append(transaction)
    if not history:
        return {}
    transactions = await db_session.scalars(
        select(Transaction).where(
            Transaction.is_deleted.is_(False),
            Transaction.merged_into_id.is_(None),
            Transaction.type == "지출",
            Transaction.amount < 0,
            Transaction.currency == "KRW",
            ~select(LoanTransactionLink.id)
            .where(LoanTransactionLink.transaction_id == Transaction.id)
            .exists(),
            ~select(InstallmentTransactionLink.id)
            .where(InstallmentTransactionLink.transaction_id == Transaction.id)
            .exists(),
        )
    )
    suggestions = {}
    for transaction in transactions:
        suggestion = suggest_from_history(transaction, history)
        if suggestion:
            suggestions[transaction.id] = suggestion
    return suggestions
