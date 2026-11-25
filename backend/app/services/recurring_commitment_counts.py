"""Payment counts shared by the recurring commitment list and forecast."""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nature_axes import RecurringCommitment
from app.services.metric_views import EXPENSE, FLOW_LINES_VIEW


def recurring_payment_count():
    lines = FLOW_LINES_VIEW
    # Refunds affect observed spend, but do not fulfill a payment occurrence.
    return func.count(lines.c.transaction_id.distinct()).filter(
        lines.c.commitment_kind == "recurring", lines.c.amount < 0
    )


def remaining_recurring_count(
    commitment: RecurringCommitment, payment_count: int
) -> int | None:
    if commitment.cycle == "n_times" and commitment.total_count is not None:
        return max(commitment.total_count - payment_count, 0)
    return None


async def exhausted_recurring_commitments(
    db_session: AsyncSession,
    commitments: dict[int, RecurringCommitment],
    reference_date: date,
) -> set[int]:
    finite = {
        item.id: item
        for item in commitments.values()
        if item.cycle == "n_times" and item.total_count is not None
    }
    if not finite:
        return set()
    lines = FLOW_LINES_VIEW
    counts = await db_session.execute(
        select(lines.c.recurring_commitment_id, recurring_payment_count())
        .where(
            lines.c.type == EXPENSE,
            lines.c.recurring_commitment_id.in_(finite),
            lines.c.date <= reference_date,
        )
        .group_by(lines.c.recurring_commitment_id)
    )
    return {
        commitment_id
        for commitment_id, count in counts
        if remaining_recurring_count(finite[commitment_id], count) == 0
    }
