from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.asset_source import (
    SelectedInvestmentsResponse,
    SourceMappingRequest,
    SourceMappingResponse,
    SourcePolicyApplyRequest,
    SourcePolicyPreviewRequest,
    SourcePolicyPreviewResponse,
    SourcePolicyResponse,
)
from app.services.asset_source_service import (
    apply_policy,
    create_mapping,
    get_policy,
    list_mappings,
    preview_policy,
    select_investments,
)

router = APIRouter()


@router.get("/assets/source-policy", response_model=SourcePolicyResponse)
async def read_policy(db: AsyncSession = Depends(get_db_session)):
    return await get_policy(db)


@router.post(
    "/assets/source-policy/preview",
    response_model=SourcePolicyPreviewResponse,
    dependencies=[Depends(require_api_key)],
)
async def preview(
    payload: SourcePolicyPreviewRequest, db: AsyncSession = Depends(get_db_session)
):
    return await preview_policy(db, payload.policy)


@router.patch(
    "/assets/source-policy",
    response_model=SourcePolicyResponse,
    dependencies=[Depends(require_api_key)],
)
async def apply(
    payload: SourcePolicyApplyRequest, db: AsyncSession = Depends(get_db_session)
):
    return await apply_policy(db, payload)


@router.get("/investments/selected", response_model=SelectedInvestmentsResponse)
@router.get("/assets/source-coverage", response_model=SelectedInvestmentsResponse)
async def selected(
    as_of_date: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await select_investments(db, as_of_date=as_of_date)


@router.get(
    "/assets/source-account-mappings", response_model=list[SourceMappingResponse]
)
async def mappings(db: AsyncSession = Depends(get_db_session)):
    return await list_mappings(db)


@router.post(
    "/assets/source-account-mappings",
    response_model=SourceMappingResponse,
    dependencies=[Depends(require_api_key)],
)
async def mapping(
    payload: SourceMappingRequest, db: AsyncSession = Depends(get_db_session)
):
    return await create_mapping(db, payload)
