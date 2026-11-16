"""Resolved T056 axes per transaction, read from the metric views.

``payment_form`` and ``adjustability`` come from ``vw_transaction_nature``;
the monthly-flow row comes from ``vw_metric_flow_lines``. Nothing is
re-derived here: the ``*_source`` values only rename the views' own
source columns into one vocabulary (transaction / commitment /
category_default / loan_link / installment_link / none / not_applicable).
"""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.transaction import TransactionAxes
from app.services.metric_views import FLOW_LINES_VIEW, TRANSACTION_NATURE_VIEW

ADJUSTABILITY_SOURCES = {
    "fixed_loan": "loan_link",
    "fixed_installment": "installment_link",
    "transaction": "transaction",
    "commitment": "commitment",
    "category_default": "category_default",
    "none": "none",
    "not_applicable": "not_applicable",
}
SELF_LINE_KINDS = ("transaction", "refund_remainder")


def _payment_form_source(row) -> str:  # type: ignore[no-untyped-def]
    if row.payment_form == "not_applicable":
        return "not_applicable"
    if row.commitment_kind == "loan":
        return "loan_link"
    if row.commitment_kind == "installment":
        return "installment_link"
    if row.commitment_kind == "recurring":
        # A person put this transaction in a bundle (explicit) or a bundle's
        # rule matched it.
        return "transaction" if row.commitment_match == "explicit" else "commitment"
    return "none"


async def load_transaction_axes(
    db_session: AsyncSession, transaction_ids: Iterable[int]
) -> dict[int, TransactionAxes]:
    ids = sorted({int(value) for value in transaction_ids})
    if not ids:
        return {}
    nature = TRANSACTION_NATURE_VIEW
    natures = {
        int(row.transaction_id): row
        for row in await db_session.execute(
            select(
                nature.c.transaction_id,
                nature.c.payment_form,
                nature.c.commitment_kind,
                nature.c.commitment_match,
                nature.c.adjustability,
                nature.c.adjustability_source,
            ).where(nature.c.transaction_id.in_(ids))
        )
    }
    lines = FLOW_LINES_VIEW
    own_rows: dict[int, str] = {}
    allocated_rows: dict[int, list[str]] = {}
    for row in await db_session.execute(
        select(lines.c.transaction_id, lines.c.line_kind, lines.c.flow_row)
        .where(lines.c.transaction_id.in_(ids))
        .order_by(lines.c.transaction_id, lines.c.attributed_transaction_id)
    ):
        if row.line_kind in SELF_LINE_KINDS:
            own_rows[int(row.transaction_id)] = row.flow_row
        else:
            allocated_rows.setdefault(int(row.transaction_id), []).append(row.flow_row)
    result: dict[int, TransactionAxes] = {}
    for transaction_id in ids:
        found = natures.get(transaction_id)
        own = own_rows.get(transaction_id)
        allocated = allocated_rows.get(transaction_id, [])
        flow_row = own or (allocated[0] if allocated else None)
        result[transaction_id] = TransactionAxes(
            payment_form=found.payment_form if found is not None else None,
            payment_form_source=(
                _payment_form_source(found) if found is not None else "not_effective"
            ),
            commitment_kind=found.commitment_kind if found is not None else None,
            adjustability=found.adjustability if found is not None else None,
            adjustability_source=(
                ADJUSTABILITY_SOURCES.get(found.adjustability_source, "none")
                if found is not None
                else "not_effective"
            ),
            flow_row=flow_row,
            flow_rows=sorted({*([own] if own else []), *allocated}),
            flow_row_source=(
                "own_line"
                if own is not None
                else "refund_allocated_to_purchase"
                if allocated
                else "no_flow_line"
            ),
        )
    return result
