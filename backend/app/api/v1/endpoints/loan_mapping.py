from datetime import date

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.loan_mapping import (
    LoanAccountCandidateResponse,
    LoanAccountMetadataUpdateRequest,
    LoanAccountsResponse,
    LoanLinkStateFilter,
    LoanTransactionLinkBulkUpsertRequest,
    LoanTransactionLinkBulkUpsertResponse,
    LoanTransactionLinkItem,
    LoanTransactionMappingListResponse,
    LoanTransactionLinkUpsertRequest,
    RepaymentType,
    TransactionLoanLinkResponse,
)
from app.services.loan_mapping_service import (
    bulk_upsert_transaction_loan_links,
    delete_transaction_loan_link,
    get_transaction_loan_link,
    list_loan_accounts,
    list_loan_transaction_mappings,
    update_loan_account_metadata,
    upsert_transaction_loan_link,
)

router = APIRouter()


@router.get("/loan-accounts", response_model=LoanAccountsResponse)
async def get_loan_accounts(
    db_session: AsyncSession = Depends(get_db_session),
) -> LoanAccountsResponse:
    return await list_loan_accounts(db_session)


@router.patch(
    "/loan-accounts",
    response_model=LoanAccountCandidateResponse,
    dependencies=[Depends(require_api_key)],
)
async def patch_loan_account_metadata(
    payload: LoanAccountMetadataUpdateRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> LoanAccountCandidateResponse:
    return await update_loan_account_metadata(db_session, payload)


@router.get(
    "/loan-transaction-links",
    response_model=LoanTransactionMappingListResponse,
)
async def get_loan_transaction_links(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    search: str | None = Query(default=None),
    linked: LoanLinkStateFilter = Query(default="all"),
    loan_account_id: int | None = Query(default=None),
    repayment_type: RepaymentType | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=40, ge=1, le=200),
    db_session: AsyncSession = Depends(get_db_session),
) -> LoanTransactionMappingListResponse:
    return await list_loan_transaction_mappings(
        db_session,
        start_date=start_date,
        end_date=end_date,
        search=search,
        linked=linked,
        loan_account_id=loan_account_id,
        repayment_type=repayment_type,
        page=page,
        per_page=per_page,
    )


@router.get(
    "/transactions/{transaction_id}/loan-link",
    response_model=TransactionLoanLinkResponse,
)
async def get_loan_link_for_transaction(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> TransactionLoanLinkResponse:
    return await get_transaction_loan_link(db_session, transaction_id)


@router.put(
    "/transactions/loan-links/bulk",
    response_model=LoanTransactionLinkBulkUpsertResponse,
    dependencies=[Depends(require_api_key)],
)
async def put_loan_links_for_transactions(
    payload: LoanTransactionLinkBulkUpsertRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> LoanTransactionLinkBulkUpsertResponse:
    return await bulk_upsert_transaction_loan_links(db_session, payload)


@router.put(
    "/transactions/{transaction_id}/loan-link",
    response_model=LoanTransactionLinkItem,
    dependencies=[Depends(require_api_key)],
)
async def put_loan_link_for_transaction(
    transaction_id: int,
    payload: LoanTransactionLinkUpsertRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> LoanTransactionLinkItem:
    return await upsert_transaction_loan_link(db_session, transaction_id, payload)


@router.delete(
    "/transactions/{transaction_id}/loan-link",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key)],
)
async def delete_loan_link_for_transaction(
    transaction_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    await delete_transaction_loan_link(db_session, transaction_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
