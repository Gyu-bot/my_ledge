"""Human-set transfer purpose (T061): writes, explanation and the work list.

Every value here is written only by an explicit API call from a person (the
작업대). Nothing is inferred or suggested: a transfer nobody marked, directly
or by a rule the person registered, stays ``undecided``. Resolution
(precedence transaction > merchant rule > category rule) lives in SQL:
``vw_transfer_purpose``.
"""

from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.transaction import Transaction
from app.models.transfer_purpose import TransferPurposeOverride, TransferPurposeRule
from app.schemas.transfer_purpose import (
    TransferPurposeListResponse,
    TransferPurposeResponse,
    TransferPurposeRuleCreateRequest,
    TransferPurposeRuleListResponse,
    TransferPurposeRuleResponse,
    TransferPurposeRuleUpdateRequest,
    check_rule_scope,
)
from app.services.metric_views import METRIC_CURRENCY, TRANSFER, TRANSFER_PURPOSE_VIEW

_VIEW = TRANSFER_PURPOSE_VIEW


# --------------------------------------------------------------------------
# Transaction-level purpose.
# --------------------------------------------------------------------------


async def _transaction_or_404(
    db_session: AsyncSession, transaction_id: int
) -> Transaction:
    transaction = await db_session.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    return transaction


async def set_transfer_purpose(
    db_session: AsyncSession, transaction_id: int, purpose: str
) -> TransferPurposeResponse:
    transaction = await _transaction_or_404(db_session, transaction_id)
    if transaction.type != TRANSFER:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Transfer purpose applies only to 이체 transactions",
        )
    override = await db_session.get(TransferPurposeOverride, transaction_id)
    if override is None:
        override = TransferPurposeOverride(transaction_id=transaction_id)
        db_session.add(override)
    override.purpose = purpose
    await db_session.commit()
    return await explain_transfer(db_session, transaction_id)


async def clear_transfer_purpose(
    db_session: AsyncSession, transaction_id: int
) -> TransferPurposeResponse:
    await _transaction_or_404(db_session, transaction_id)
    override = await db_session.get(TransferPurposeOverride, transaction_id)
    if override is not None:
        await db_session.delete(override)
        await db_session.commit()
    return await explain_transfer(db_session, transaction_id)


async def move_transfer_purpose_override(
    db_session: AsyncSession,
    *,
    old_transaction_id: int,
    new_transaction_id: int,
) -> None:
    """Carry a human transfer purpose to a re-import replacement row.

    Called by the safe-apply replacement path next to the loan/installment
    link and T056 nature moves; rules need no move (they match by key).
    """
    override = await db_session.get(TransferPurposeOverride, old_transaction_id)
    if override is None:
        return
    target = await db_session.get(TransferPurposeOverride, new_transaction_id)
    if target is None:
        target = TransferPurposeOverride(transaction_id=new_transaction_id)
        db_session.add(target)
    target.purpose = override.purpose
    await db_session.delete(override)
    await db_session.flush()


def _as_date(value: object) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _from_view_row(row) -> TransferPurposeResponse:  # type: ignore[no-untyped-def]
    return TransferPurposeResponse(
        transaction_id=row["transaction_id"],
        effective=True,
        date=_as_date(row["date"]),
        amount=int(row["amount"]),
        currency=row["currency"],
        merchant=row["merchant"],
        description=row["description"],
        effective_category_major=row["effective_category_major"],
        effective_category_minor=row["effective_category_minor"],
        purpose=row["purpose"],
        purpose_source=row["purpose_source"],
        transaction_purpose=row["transaction_purpose"],
        rule_id=row["rule_id"],
        rule_purpose=row["rule_purpose"],
    )


async def explain_transfer(
    db_session: AsyncSession, transaction_id: int
) -> TransferPurposeResponse:
    transaction = await _transaction_or_404(db_session, transaction_id)
    await db_session.refresh(transaction)
    if transaction.type != TRANSFER:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Transfer purpose applies only to 이체 transactions",
        )
    row = (
        (
            await db_session.execute(
                select(_VIEW).where(_VIEW.c.transaction_id == transaction_id)
            )
        )
        .mappings()
        .one_or_none()
    )
    if row is not None:
        return _from_view_row(row)
    override = await db_session.get(TransferPurposeOverride, transaction_id)
    return TransferPurposeResponse(
        transaction_id=transaction.id,
        effective=False,
        date=transaction.date,
        amount=transaction.amount,
        currency=transaction.currency,
        merchant=transaction.merchant,
        description=transaction.description,
        effective_category_major=transaction.category_major_user
        or transaction.category_major,
        effective_category_minor=transaction.category_minor_user
        if transaction.category_minor_user is not None
        else transaction.category_minor,
        purpose=None,
        purpose_source=None,
        transaction_purpose=override.purpose if override is not None else None,  # type: ignore[arg-type]
        rule_id=None,
        rule_purpose=None,
    )


async def list_transfers(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    purpose: str | None,
    limit: int,
) -> TransferPurposeListResponse:
    """Effective KRW 이체 in range, largest |amount| first (금액 영향 순)."""
    filters: list[ColumnElement[bool]] = [
        func.upper(_VIEW.c.currency) == METRIC_CURRENCY
    ]
    if start_date is not None:
        filters.append(_VIEW.c.date >= start_date)
    if end_date is not None:
        filters.append(_VIEW.c.date <= end_date)
    totals = (
        await db_session.execute(
            select(
                func.count().label("total_count"),
                func.coalesce(
                    func.sum(case((_VIEW.c.purpose == "undecided", 1), else_=0)), 0
                ).label("undecided_count"),
                func.coalesce(
                    func.sum(
                        case(
                            (_VIEW.c.purpose == "undecided", func.abs(_VIEW.c.amount)),
                            else_=0,
                        )
                    ),
                    0,
                ).label("undecided_activity_total"),
                func.coalesce(func.sum(func.abs(_VIEW.c.amount)), 0).label(
                    "activity_total"
                ),
            ).where(and_(*filters))
        )
    ).one()
    if purpose is not None:
        filters.append(_VIEW.c.purpose == purpose)
    rows = (
        await db_session.execute(
            select(_VIEW)
            .where(and_(*filters))
            .order_by(
                func.abs(_VIEW.c.amount).desc(), _VIEW.c.date, _VIEW.c.transaction_id
            )
            .limit(limit)
        )
    ).mappings()
    return TransferPurposeListResponse(
        total_count=int(totals.total_count),
        undecided_count=int(totals.undecided_count),
        undecided_activity_total=int(totals.undecided_activity_total),
        activity_total=int(totals.activity_total),
        items=[_from_view_row(row) for row in rows],
    )


# --------------------------------------------------------------------------
# Human-registered rules.
# --------------------------------------------------------------------------


async def _rule_counts(db_session: AsyncSession) -> dict[int, int]:
    query = (
        select(_VIEW.c.rule_id, func.count())
        .where(_VIEW.c.purpose_source.in_(["rule_merchant", "rule_category"]))
        .group_by(_VIEW.c.rule_id)
    )
    return {
        int(rule_id): int(count)
        for rule_id, count in (await db_session.execute(query)).all()
    }


def _serialize_rule(
    row: TransferPurposeRule, counts: dict[int, int]
) -> TransferPurposeRuleResponse:
    return TransferPurposeRuleResponse(
        id=row.id,
        match_scope=row.match_scope,  # type: ignore[arg-type]
        merchant=row.merchant,
        category_major=row.category_major,
        category_minor=row.category_minor,
        purpose=row.purpose,  # type: ignore[arg-type]
        label=row.label,
        memo=row.memo,
        matched_transfer_count=counts.get(row.id, 0),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def list_rules(db_session: AsyncSession) -> TransferPurposeRuleListResponse:
    rows = (
        await db_session.scalars(
            select(TransferPurposeRule).order_by(TransferPurposeRule.id)
        )
    ).all()
    counts = await _rule_counts(db_session)
    return TransferPurposeRuleListResponse(
        items=[_serialize_rule(row, counts) for row in rows]
    )


def _clean(value: str | None) -> str | None:
    return (value or "").strip() or None


async def _ensure_unique_key(
    db_session: AsyncSession, row: TransferPurposeRule
) -> None:
    query = select(TransferPurposeRule.id).where(
        TransferPurposeRule.match_scope == row.match_scope,
        TransferPurposeRule.merchant.is_not_distinct_from(row.merchant),
        TransferPurposeRule.category_major.is_not_distinct_from(row.category_major),
        TransferPurposeRule.category_minor.is_not_distinct_from(row.category_minor),
    )
    if row.id is not None:
        query = query.where(TransferPurposeRule.id != row.id)
    duplicate = await db_session.scalar(query.limit(1))
    if duplicate is not None:
        await db_session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"A transfer purpose rule for this key already exists (id {duplicate})",
        )


async def _respond(
    db_session: AsyncSession, row: TransferPurposeRule
) -> TransferPurposeRuleResponse:
    await db_session.commit()
    await db_session.refresh(row)
    return _serialize_rule(row, await _rule_counts(db_session))


async def create_rule(
    db_session: AsyncSession, payload: TransferPurposeRuleCreateRequest
) -> TransferPurposeRuleResponse:
    row = TransferPurposeRule(
        match_scope=payload.match_scope,
        merchant=_clean(payload.merchant),
        category_major=_clean(payload.category_major),
        category_minor=_clean(payload.category_minor),
        purpose=payload.purpose,
        label=payload.label,
        memo=payload.memo,
    )
    await _ensure_unique_key(db_session, row)
    db_session.add(row)
    return await _respond(db_session, row)


async def _rule_or_404(db_session: AsyncSession, rule_id: int) -> TransferPurposeRule:
    row = await db_session.get(TransferPurposeRule, rule_id)
    if row is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Transfer purpose rule not found"
        )
    return row


async def update_rule(
    db_session: AsyncSession, rule_id: int, payload: TransferPurposeRuleUpdateRequest
) -> TransferPurposeRuleResponse:
    row = await _rule_or_404(db_session, rule_id)
    changes = payload.model_dump(exclude_unset=True)
    for required in ("match_scope", "purpose"):
        if changes.get(required, "set") is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, f"{required} cannot be null"
            )
    for field, value in changes.items():
        if field in ("merchant", "category_major", "category_minor"):
            value = _clean(value)
        setattr(row, field, value)
    if row.match_scope == "merchant":
        row.category_major = None
        row.category_minor = None
    else:
        row.merchant = None
    try:
        check_rule_scope(
            row.match_scope, row.merchant, row.category_major, row.category_minor
        )
    except ValueError as exc:
        await db_session.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    await _ensure_unique_key(db_session, row)
    return await _respond(db_session, row)


async def delete_rule(db_session: AsyncSession, rule_id: int) -> None:
    row = await _rule_or_404(db_session, rule_id)
    await db_session.delete(row)
    await db_session.commit()
