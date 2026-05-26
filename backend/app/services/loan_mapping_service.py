from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.schemas.loan_mapping import (
    LoanAccountCandidateResponse,
    LoanAccountMetadataUpdateRequest,
    LoanAccountsResponse,
    LoanLinkStateFilter,
    LoanTransactionLinkBulkUpsertRequest,
    LoanTransactionLinkBulkUpsertResponse,
    LoanTransactionLinkItem,
    LoanTransactionMappingItem,
    LoanTransactionMappingListResponse,
    LoanTransactionLinkUpsertRequest,
    TransactionLoanLinkResponse,
)


async def list_loan_accounts(db_session: AsyncSession) -> LoanAccountsResponse:
    accounts = await _load_persisted_accounts(db_session)
    latest_snapshots = await _load_latest_loan_snapshots(db_session)

    account_by_key = {
        _account_key(account.lender, account.product_name): account
        for account in accounts
    }
    snapshot_by_key = {
        _account_key(snapshot["lender"], snapshot["product_name"]): snapshot
        for snapshot in latest_snapshots
    }
    all_keys = sorted(
        set(account_by_key) | set(snapshot_by_key),
        key=lambda key: (key[0], key[1]),
    )

    return LoanAccountsResponse(
        items=[
            _build_account_candidate(
                account=account_by_key.get(key),
                snapshot=snapshot_by_key.get(key),
                lender=key[0],
                product_name=key[1],
            )
            for key in all_keys
        ]
    )


async def update_loan_account_metadata(
    db_session: AsyncSession,
    payload: LoanAccountMetadataUpdateRequest,
) -> LoanAccountCandidateResponse:
    account = await _resolve_metadata_account(db_session, payload)
    account.display_name_user = _normalize_optional_text(payload.display_name_user)
    account.loan_kind = None if payload.loan_kind == "unknown" else payload.loan_kind
    await db_session.commit()
    await db_session.refresh(account)
    snapshot = await _load_latest_loan_snapshot_for_key(
        db_session,
        account.lender,
        account.product_name,
    )
    return _build_account_candidate(
        account=account,
        snapshot=snapshot,
        lender=account.lender,
        product_name=account.product_name,
    )


async def get_transaction_loan_link(
    db_session: AsyncSession,
    transaction_id: int,
) -> TransactionLoanLinkResponse:
    await _get_transaction_or_404(db_session, transaction_id)
    link = await _load_link_item(db_session, transaction_id)
    return TransactionLoanLinkResponse(link=link)


async def list_loan_transaction_mappings(
    db_session: AsyncSession,
    *,
    start_date: date | None,
    end_date: date | None,
    search: str | None,
    linked: LoanLinkStateFilter,
    loan_account_id: int | None,
    repayment_type: str | None,
    page: int,
    per_page: int,
) -> LoanTransactionMappingListResponse:
    base_query = _build_loan_transaction_mapping_query(
        start_date=start_date,
        end_date=end_date,
        search=search,
        linked=linked,
        loan_account_id=loan_account_id,
        repayment_type=repayment_type,
    )
    total = await db_session.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    result = await db_session.execute(
        base_query
        .order_by(Transaction.date.desc(), Transaction.time.desc(), Transaction.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return LoanTransactionMappingListResponse(
        total=total,
        page=page,
        per_page=per_page,
        items=[
            _serialize_mapping_row(row)
            for row in result.mappings().all()
        ],
    )


async def upsert_transaction_loan_link(
    db_session: AsyncSession,
    transaction_id: int,
    payload: LoanTransactionLinkUpsertRequest,
) -> LoanTransactionLinkItem:
    await _get_transaction_or_404(db_session, transaction_id)
    account = await _resolve_account(db_session, payload)
    link = await db_session.scalar(
        select(LoanTransactionLink).where(
            LoanTransactionLink.transaction_id == transaction_id,
        )
    )
    if link is None:
        link = LoanTransactionLink(
            transaction_id=transaction_id,
            loan_account_id=account.id,
        )
        db_session.add(link)
    else:
        link.loan_account_id = account.id

    link.repayment_type = payload.repayment_type
    link.source = "manual"
    link.memo = payload.memo
    await db_session.commit()
    return await _load_link_item_or_500(db_session, transaction_id)


async def bulk_upsert_transaction_loan_links(
    db_session: AsyncSession,
    payload: LoanTransactionLinkBulkUpsertRequest,
) -> LoanTransactionLinkBulkUpsertResponse:
    transactions = await _load_transactions_by_ids_or_404(
        db_session,
        payload.transaction_ids,
    )
    account = await _resolve_account(db_session, payload)
    existing_result = await db_session.execute(
        select(LoanTransactionLink).where(
            LoanTransactionLink.transaction_id.in_(payload.transaction_ids),
        )
    )
    existing_links = {
        link.transaction_id: link for link in existing_result.scalars().all()
    }

    for transaction in transactions:
        link = existing_links.get(transaction.id)
        if link is None:
            link = LoanTransactionLink(
                transaction_id=transaction.id,
                loan_account_id=account.id,
            )
            db_session.add(link)
        else:
            link.loan_account_id = account.id
        link.repayment_type = payload.repayment_type
        link.source = "manual"
        link.memo = payload.memo

    await db_session.commit()
    return LoanTransactionLinkBulkUpsertResponse(updated=len(transactions))


async def delete_transaction_loan_link(
    db_session: AsyncSession,
    transaction_id: int,
) -> bool:
    await _get_transaction_or_404(db_session, transaction_id)
    link = await db_session.scalar(
        select(LoanTransactionLink).where(
            LoanTransactionLink.transaction_id == transaction_id,
        )
    )
    if link is None:
        return False
    await db_session.delete(link)
    await db_session.commit()
    return True


async def _load_persisted_accounts(db_session: AsyncSession) -> list[LoanAccount]:
    result = await db_session.execute(
        select(LoanAccount).order_by(LoanAccount.lender, LoanAccount.product_name)
    )
    return list(result.scalars().all())


async def _load_latest_loan_snapshots(
    db_session: AsyncSession,
) -> list[dict[str, object]]:
    latest_date_subquery = (
        select(
            Loan.lender.label("lender"),
            Loan.product_name.label("product_name"),
            func.max(Loan.snapshot_date).label("latest_snapshot_date"),
        )
        .group_by(Loan.lender, Loan.product_name)
        .subquery()
    )
    result = await db_session.execute(
        select(
            Loan.lender,
            Loan.product_name,
            Loan.snapshot_date,
            Loan.balance,
            Loan.interest_rate,
        )
        .join(
            latest_date_subquery,
            (Loan.lender == latest_date_subquery.c.lender)
            & (Loan.product_name == latest_date_subquery.c.product_name)
            & (Loan.snapshot_date == latest_date_subquery.c.latest_snapshot_date),
        )
        .order_by(Loan.lender, Loan.product_name)
    )
    return [
        {
            "lender": lender,
            "product_name": product_name,
            "latest_snapshot_date": snapshot_date,
            "latest_balance": balance,
            "latest_interest_rate": interest_rate,
        }
        for lender, product_name, snapshot_date, balance, interest_rate in result.all()
    ]


async def _load_latest_loan_snapshot_for_key(
    db_session: AsyncSession,
    lender: str,
    product_name: str,
) -> dict[str, object] | None:
    result = await db_session.execute(
        select(
            Loan.lender,
            Loan.product_name,
            Loan.snapshot_date,
            Loan.balance,
            Loan.interest_rate,
        )
        .where(Loan.lender == lender)
        .where(Loan.product_name == product_name)
        .order_by(Loan.snapshot_date.desc())
        .limit(1)
    )
    row = result.one_or_none()
    if row is None:
        return None
    snapshot_lender, snapshot_product_name, snapshot_date, balance, interest_rate = row
    return {
        "lender": snapshot_lender,
        "product_name": snapshot_product_name,
        "latest_snapshot_date": snapshot_date,
        "latest_balance": balance,
        "latest_interest_rate": interest_rate,
    }


def _build_loan_transaction_mapping_query(
    *,
    start_date: date | None,
    end_date: date | None,
    search: str | None,
    linked: LoanLinkStateFilter,
    loan_account_id: int | None,
    repayment_type: str | None,
):
    effective_category_major = func.coalesce(
        Transaction.category_major_user,
        Transaction.category_major,
    ).label("effective_category_major")
    effective_category_minor = func.coalesce(
        Transaction.category_minor_user,
        Transaction.category_minor,
    ).label("effective_category_minor")
    candidate_patterns = ["대출", "상환", "이자", "원리금", "원금·이자", "원금 이자"]
    text_columns = (
        effective_category_major,
        effective_category_minor,
        Transaction.description,
        Transaction.merchant,
        Transaction.payment_method,
    )
    candidate_conditions = [
        LoanTransactionLink.transaction_id.is_not(None),
        effective_category_major == "금융",
    ]
    for pattern in candidate_patterns:
        like_pattern = f"%{pattern}%"
        candidate_conditions.extend(
            column.ilike(like_pattern)
            for column in text_columns
        )

    query = (
        select(
            Transaction.id.label("transaction_id"),
            Transaction.date,
            Transaction.time,
            Transaction.type,
            effective_category_major,
            effective_category_minor,
            Transaction.description,
            Transaction.merchant,
            Transaction.amount,
            Transaction.currency,
            Transaction.payment_method,
            Transaction.memo.label("transaction_memo"),
            LoanTransactionLink.loan_account_id,
            LoanTransactionLink.repayment_type,
            LoanTransactionLink.source.label("link_source"),
            LoanTransactionLink.memo.label("link_memo"),
            LoanTransactionLink.created_at.label("link_created_at"),
            LoanTransactionLink.updated_at.label("link_updated_at"),
            LoanAccount.lender,
            LoanAccount.product_name,
            LoanAccount.display_name_user,
            LoanAccount.loan_kind,
        )
        .select_from(Transaction)
        .outerjoin(
            LoanTransactionLink,
            LoanTransactionLink.transaction_id == Transaction.id,
        )
        .outerjoin(
            LoanAccount,
            LoanAccount.id == LoanTransactionLink.loan_account_id,
        )
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(or_(*candidate_conditions))
    )
    if start_date is not None:
        query = query.where(Transaction.date >= start_date)
    if end_date is not None:
        query = query.where(Transaction.date <= end_date)
    if linked == "linked":
        query = query.where(LoanTransactionLink.transaction_id.is_not(None))
    elif linked == "unlinked":
        query = query.where(LoanTransactionLink.transaction_id.is_(None))
    if loan_account_id is not None:
        query = query.where(LoanTransactionLink.loan_account_id == loan_account_id)
    if repayment_type is not None:
        query = query.where(LoanTransactionLink.repayment_type == repayment_type)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            or_(
                Transaction.description.ilike(pattern),
                Transaction.merchant.ilike(pattern),
                Transaction.memo.ilike(pattern),
                Transaction.payment_method.ilike(pattern),
                LoanAccount.lender.ilike(pattern),
                LoanAccount.product_name.ilike(pattern),
                LoanAccount.display_name_user.ilike(pattern),
            )
        )
    return query


def _serialize_mapping_row(row) -> LoanTransactionMappingItem:
    link = None
    if row["loan_account_id"] is not None:
        link = LoanTransactionLinkItem(
            transaction_id=row["transaction_id"],
            loan_account_id=row["loan_account_id"],
            lender=row["lender"],
            product_name=row["product_name"],
            display_name_user=row["display_name_user"],
            display_name=_display_name(
                row["lender"],
                row["product_name"],
                row["display_name_user"],
            ),
            loan_kind=row["loan_kind"] or "unknown",
            repayment_type=row["repayment_type"],
            source=row["link_source"],
            memo=row["link_memo"],
            created_at=row["link_created_at"],
            updated_at=row["link_updated_at"],
        )
    return LoanTransactionMappingItem(
        transaction_id=row["transaction_id"],
        date=row["date"],
        time=row["time"],
        type=row["type"],
        effective_category_major=row["effective_category_major"],
        effective_category_minor=row["effective_category_minor"],
        description=row["description"],
        merchant=row["merchant"],
        amount=row["amount"],
        currency=row["currency"],
        payment_method=row["payment_method"],
        memo=row["transaction_memo"],
        link=link,
    )


async def _resolve_account(
    db_session: AsyncSession,
    payload: LoanTransactionLinkUpsertRequest,
) -> LoanAccount:
    if payload.loan_account_id is not None:
        account = await db_session.get(LoanAccount, payload.loan_account_id)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan account not found.",
            )
        return account

    lender = _normalize_required_text(payload.lender)
    product_name = _normalize_required_text(payload.product_name)
    account = await db_session.scalar(
        select(LoanAccount).where(
            LoanAccount.lender == lender,
            LoanAccount.product_name == product_name,
        )
    )
    if account is not None:
        return account

    account = LoanAccount(
        lender=lender,
        product_name=product_name,
    )
    db_session.add(account)
    await db_session.flush()
    return account


async def _resolve_metadata_account(
    db_session: AsyncSession,
    payload: LoanAccountMetadataUpdateRequest,
) -> LoanAccount:
    if payload.loan_account_id is not None:
        account = await db_session.get(LoanAccount, payload.loan_account_id)
        if account is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan account not found.",
            )
        return account

    lender = _normalize_required_text(payload.lender)
    product_name = _normalize_required_text(payload.product_name)
    account = await db_session.scalar(
        select(LoanAccount).where(
            LoanAccount.lender == lender,
            LoanAccount.product_name == product_name,
        )
    )
    if account is not None:
        return account

    account = LoanAccount(lender=lender, product_name=product_name)
    db_session.add(account)
    await db_session.flush()
    return account


async def _get_transaction_or_404(
    db_session: AsyncSession,
    transaction_id: int,
) -> Transaction:
    transaction = await db_session.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found.",
        )
    return transaction


async def _load_transactions_by_ids_or_404(
    db_session: AsyncSession,
    transaction_ids: list[int],
) -> list[Transaction]:
    unique_ids = list(dict.fromkeys(transaction_ids))
    result = await db_session.execute(
        select(Transaction).where(Transaction.id.in_(unique_ids))
    )
    transactions = list(result.scalars().all())
    found_ids = {transaction.id for transaction in transactions}
    missing_ids = [
        transaction_id
        for transaction_id in unique_ids
        if transaction_id not in found_ids
    ]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transactions not found: {missing_ids}",
        )
    return transactions


async def _load_link_item_or_500(
    db_session: AsyncSession,
    transaction_id: int,
) -> LoanTransactionLinkItem:
    link = await _load_link_item(db_session, transaction_id)
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Loan transaction link was not persisted.",
        )
    return link


async def _load_link_item(
    db_session: AsyncSession,
    transaction_id: int,
) -> LoanTransactionLinkItem | None:
    result = await db_session.execute(
        select(LoanTransactionLink, LoanAccount)
        .join(LoanAccount, LoanTransactionLink.loan_account_id == LoanAccount.id)
        .where(LoanTransactionLink.transaction_id == transaction_id)
    )
    row = result.first()
    if row is None:
        return None
    link, account = row
    return LoanTransactionLinkItem(
        transaction_id=link.transaction_id,
        loan_account_id=account.id,
        lender=account.lender,
        product_name=account.product_name,
        display_name_user=account.display_name_user,
        display_name=_display_name(
            account.lender,
            account.product_name,
            account.display_name_user,
        ),
        loan_kind=account.loan_kind or "unknown",
        repayment_type=link.repayment_type,
        source=link.source,
        memo=link.memo,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


def _build_account_candidate(
    *,
    account: LoanAccount | None,
    snapshot: dict[str, object] | None,
    lender: str,
    product_name: str,
) -> LoanAccountCandidateResponse:
    latest_snapshot_date = None
    latest_balance = None
    latest_interest_rate = None
    if snapshot is not None:
        latest_snapshot_date = snapshot["latest_snapshot_date"]
        latest_balance = snapshot["latest_balance"]
        latest_interest_rate = snapshot["latest_interest_rate"]

    return LoanAccountCandidateResponse(
        loan_account_id=account.id if account is not None else None,
        lender=lender,
        product_name=product_name,
        display_name_user=account.display_name_user if account is not None else None,
        display_name=_display_name(
            lender,
            product_name,
            account.display_name_user if account is not None else None,
        ),
        loan_kind=account.loan_kind if account is not None and account.loan_kind else "unknown",
        latest_snapshot_date=latest_snapshot_date
        if isinstance(latest_snapshot_date, date)
        else None,
        latest_balance=latest_balance if isinstance(latest_balance, Decimal) else None,
        latest_interest_rate=latest_interest_rate
        if isinstance(latest_interest_rate, Decimal)
        else None,
    )


def _account_key(lender: str, product_name: str) -> tuple[str, str]:
    return (lender, product_name)


def _display_name(
    lender: str,
    product_name: str,
    display_name_user: str | None = None,
) -> str:
    if display_name_user:
        return display_name_user
    return f"{lender} {product_name}"


def _normalize_required_text(value: str | None) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="lender and product_name must not be blank.",
        )
    return normalized


def _normalize_optional_text(value: str | None) -> str | None:
    normalized = (value or "").strip()
    return normalized or None
