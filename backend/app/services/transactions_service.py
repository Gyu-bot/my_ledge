from collections import defaultdict
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.schemas.transaction import (
    CategorySummaryItem,
    CategorySummaryResponse,
    PaymentMethodSummaryItem,
    PaymentMethodSummaryResponse,
    TransactionBulkUpdateRequest,
    TransactionBulkUpdateResponse,
    TransactionCreateRequest,
    TransactionGroupBy,
    TransactionListResponse,
    TransactionResponse,
    TransactionSummaryItem,
    TransactionSummaryResponse,
    TransactionTypeFilter,
    TransactionUpdateRequest,
)


async def list_transactions(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    category_major: str | None,
    payment_method: str | None,
    is_edited: str,
    include_deleted: bool,
    include_merged: bool,
    search: str | None,
    page: int,
    per_page: int,
) -> TransactionListResponse:
    base_query = _build_transaction_query(
        start_date=start_date,
        end_date=end_date,
        category_major=category_major,
        payment_method=payment_method,
        tx_type="all",
        is_edited=is_edited,
        include_deleted=include_deleted,
        include_merged=include_merged,
        search=search,
    )
    total = await db_session.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    result = await db_session.execute(
        base_query
        .order_by(Transaction.date.desc(), Transaction.time.desc(), Transaction.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return TransactionListResponse(
        total=total,
        page=page,
        per_page=per_page,
        items=[_serialize_transaction(row) for row in result.scalars().all()],
    )


async def summarize_transactions(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    group_by: TransactionGroupBy,
    tx_type: TransactionTypeFilter,
) -> TransactionSummaryResponse:
    transactions = await _load_filtered_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        category_major=None,
        payment_method=None,
        tx_type=tx_type,
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
    )

    grouped: dict[str, int] = defaultdict(int)
    for transaction in transactions:
        grouped[_period_key(transaction.date, group_by)] += transaction.amount

    return TransactionSummaryResponse(
        items=[
            TransactionSummaryItem(period=period, amount=amount)
            for period, amount in sorted(grouped.items())
        ]
    )


async def summarize_by_category(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    level: str,
    tx_type: TransactionTypeFilter,
) -> CategorySummaryResponse:
    transactions = await _load_filtered_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        category_major=None,
        payment_method=None,
        tx_type=tx_type,
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
    )
    grouped: dict[str, int] = defaultdict(int)
    for transaction in transactions:
        category = (
            _effective_category_major(transaction)
            if level == "major"
            else _effective_category_minor(transaction)
        )
        grouped[category or "미분류"] += transaction.amount

    items = [
        CategorySummaryItem(category=category, amount=amount)
        for category, amount in sorted(grouped.items(), key=lambda item: (item[1], item[0]))
    ]
    return CategorySummaryResponse(items=items)


async def summarize_by_payment_method(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
) -> PaymentMethodSummaryResponse:
    transactions = await _load_filtered_transactions(
        db_session,
        start_date=start_date,
        end_date=end_date,
        category_major=None,
        payment_method=None,
        tx_type="all",
        is_edited="all",
        include_deleted=False,
        include_merged=False,
        search=None,
    )
    grouped: dict[str | None, int] = defaultdict(int)
    for transaction in transactions:
        grouped[transaction.payment_method] += transaction.amount

    return PaymentMethodSummaryResponse(
        items=[
            PaymentMethodSummaryItem(payment_method=payment_method, amount=amount)
            for payment_method, amount in sorted(grouped.items(), key=lambda item: (item[1], item[0] or ""))
        ]
    )


async def create_transaction(
    db_session: AsyncSession,
    payload: TransactionCreateRequest,
) -> TransactionResponse:
    transaction = Transaction(
        **payload.model_dump(),
        source="manual",
    )
    db_session.add(transaction)
    await db_session.commit()
    await db_session.refresh(transaction)
    return _serialize_transaction(transaction)


async def update_transaction(
    db_session: AsyncSession,
    transaction_id: int,
    payload: TransactionUpdateRequest,
) -> TransactionResponse:
    transaction = await _get_transaction_or_404(db_session, transaction_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(transaction, field, value)
    await db_session.commit()
    await db_session.refresh(transaction)
    return _serialize_transaction(transaction)


async def soft_delete_transaction(
    db_session: AsyncSession,
    transaction_id: int,
) -> None:
    transaction = await _get_transaction_or_404(db_session, transaction_id)
    transaction.is_deleted = True
    await db_session.commit()


async def restore_transaction(
    db_session: AsyncSession,
    transaction_id: int,
) -> TransactionResponse:
    transaction = await _get_transaction_or_404(db_session, transaction_id)
    transaction.is_deleted = False
    await db_session.commit()
    await db_session.refresh(transaction)
    return _serialize_transaction(transaction)


async def bulk_update_transactions(
    db_session: AsyncSession,
    payload: TransactionBulkUpdateRequest,
) -> TransactionBulkUpdateResponse:
    result = await db_session.execute(
        select(Transaction).where(Transaction.id.in_(payload.ids))
    )
    transactions = result.scalars().all()
    update_fields = payload.model_dump(exclude={"ids"}, exclude_unset=True)
    for transaction in transactions:
        for field, value in update_fields.items():
            setattr(transaction, field, value)
    await db_session.commit()
    return TransactionBulkUpdateResponse(updated=len(transactions))


async def _load_filtered_transactions(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    category_major: str | None,
    payment_method: str | None,
    tx_type: TransactionTypeFilter,
    is_edited: str,
    include_deleted: bool,
    include_merged: bool,
    search: str | None,
) -> list[Transaction]:
    result = await db_session.execute(
        _build_transaction_query(
            start_date=start_date,
            end_date=end_date,
            category_major=category_major,
            payment_method=payment_method,
            tx_type=tx_type,
            is_edited=is_edited,
            include_deleted=include_deleted,
            include_merged=include_merged,
            search=search,
        ).order_by(Transaction.date.asc(), Transaction.time.asc(), Transaction.id.asc())
    )
    return result.scalars().all()


def _build_transaction_query(
    *,
    start_date: date | None,
    end_date: date | None,
    category_major: str | None,
    payment_method: str | None,
    tx_type: TransactionTypeFilter,
    is_edited: str,
    include_deleted: bool,
    include_merged: bool,
    search: str | None,
) -> Select[tuple[Transaction]]:
    query = select(Transaction)
    if not include_deleted:
        query = query.where(Transaction.is_deleted.is_(False))
    if not include_merged:
        query = query.where(Transaction.merged_into_id.is_(None))
    if start_date is not None:
        query = query.where(Transaction.date >= start_date)
    if end_date is not None:
        query = query.where(Transaction.date <= end_date)
    if payment_method is not None:
        query = query.where(Transaction.payment_method == payment_method)
    if category_major is not None:
        query = query.where(
            func.coalesce(Transaction.category_major_user, Transaction.category_major)
            == category_major
        )
    if tx_type != "all":
        query = query.where(Transaction.type == tx_type)

    edited_clause = or_(
        Transaction.category_major_user.is_not(None),
        Transaction.category_minor_user.is_not(None),
        Transaction.memo.is_not(None),
    )
    if is_edited == "true":
        query = query.where(edited_clause)
    elif is_edited == "false":
        query = query.where(~edited_clause)

    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Transaction.description.ilike(pattern),
                Transaction.memo.ilike(pattern),
                Transaction.payment_method.ilike(pattern),
            )
        )
    return query


async def _get_transaction_or_404(
    db_session: AsyncSession,
    transaction_id: int,
) -> Transaction:
    transaction = await db_session.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found.")
    return transaction


def _serialize_transaction(transaction: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=transaction.id,
        date=transaction.date,
        time=transaction.time,
        type=transaction.type,
        category_major=transaction.category_major,
        category_minor=transaction.category_minor,
        category_major_user=transaction.category_major_user,
        category_minor_user=transaction.category_minor_user,
        effective_category_major=_effective_category_major(transaction),
        effective_category_minor=_effective_category_minor(transaction),
        description=transaction.description,
        amount=transaction.amount,
        currency=transaction.currency,
        payment_method=transaction.payment_method,
        memo=transaction.memo,
        is_deleted=transaction.is_deleted,
        merged_into_id=transaction.merged_into_id,
        is_edited=_is_edited(transaction),
        source=transaction.source,
        created_at=transaction.created_at,
        updated_at=transaction.updated_at,
    )


def _effective_category_major(transaction: Transaction) -> str:
    return transaction.category_major_user or transaction.category_major


def _effective_category_minor(transaction: Transaction) -> str | None:
    return transaction.category_minor_user or transaction.category_minor


def _is_edited(transaction: Transaction) -> bool:
    return any(
        value is not None
        for value in (
            transaction.category_major_user,
            transaction.category_minor_user,
            transaction.memo,
        )
    )


def _period_key(tx_date: date, group_by: TransactionGroupBy) -> str:
    if group_by == "day":
        return tx_date.isoformat()
    if group_by == "week":
        iso_year, iso_week, _ = tx_date.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return tx_date.strftime("%Y-%m")
