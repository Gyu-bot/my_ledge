from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.auto_classification import (
    AutoClassificationApplyResponse,
    AutoClassificationSettingsPatchRequest,
    AutoClassificationSettingsResponse,
    LoanMerchantRuleListResponse,
    LoanMerchantRuleRequest,
    LoanMerchantRuleResponse,
    MerchantAliasRuleListResponse,
    MerchantAliasRuleRequest,
    MerchantAliasRuleResponse,
)
from app.services.auto_classification_service import (
    apply_loan_merchant_rules,
    apply_merchant_alias_rules,
    delete_loan_merchant_rule,
    delete_merchant_alias_rule,
    get_auto_classification_settings,
    list_loan_merchant_rules,
    list_merchant_alias_rules,
    patch_auto_classification_settings,
    upsert_loan_merchant_rule,
    upsert_merchant_alias_rule,
)

router = APIRouter(
    prefix="/auto-classification",
    dependencies=[Depends(require_api_key)],
)


@router.get("/settings", response_model=AutoClassificationSettingsResponse)
async def get_settings(
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationSettingsResponse:
    settings = await get_auto_classification_settings(db_session)
    return AutoClassificationSettingsResponse(
        apply_loan_rules_on_upload=settings.apply_loan_rules_on_upload,
    )


@router.patch("/settings", response_model=AutoClassificationSettingsResponse)
async def patch_settings(
    payload: AutoClassificationSettingsPatchRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationSettingsResponse:
    settings = await patch_auto_classification_settings(db_session, payload)
    return AutoClassificationSettingsResponse(
        apply_loan_rules_on_upload=settings.apply_loan_rules_on_upload,
    )


@router.get("/loan-merchant-rules", response_model=LoanMerchantRuleListResponse)
async def get_loan_merchant_rules(
    db_session: AsyncSession = Depends(get_db_session),
) -> LoanMerchantRuleListResponse:
    return await list_loan_merchant_rules(db_session)


@router.post(
    "/loan-merchant-rules",
    response_model=LoanMerchantRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_loan_merchant_rule(
    payload: LoanMerchantRuleRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> LoanMerchantRuleResponse:
    return await upsert_loan_merchant_rule(db_session, payload)


@router.delete("/loan-merchant-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_loan_merchant_rule_endpoint(
    rule_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    deleted = await delete_loan_merchant_rule(db_session, rule_id)
    return Response(
        status_code=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND
    )


@router.post(
    "/apply/loan-merchant-rules",
    response_model=AutoClassificationApplyResponse,
)
async def apply_loan_rules(
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationApplyResponse:
    result = await apply_loan_merchant_rules(db_session)
    return AutoClassificationApplyResponse(updated=result.updated)


@router.get("/merchant-alias-rules", response_model=MerchantAliasRuleListResponse)
async def get_merchant_alias_rules(
    db_session: AsyncSession = Depends(get_db_session),
) -> MerchantAliasRuleListResponse:
    return await list_merchant_alias_rules(db_session)


@router.post(
    "/merchant-alias-rules",
    response_model=MerchantAliasRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_merchant_alias_rule(
    payload: MerchantAliasRuleRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> MerchantAliasRuleResponse:
    return await upsert_merchant_alias_rule(db_session, payload)


@router.delete(
    "/merchant-alias-rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_merchant_alias_rule_endpoint(
    rule_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    deleted = await delete_merchant_alias_rule(db_session, rule_id)
    return Response(
        status_code=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND
    )


@router.post(
    "/apply/merchant-alias-rules",
    response_model=AutoClassificationApplyResponse,
)
async def apply_merchant_alias_rules_endpoint(
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationApplyResponse:
    result = await apply_merchant_alias_rules(db_session)
    return AutoClassificationApplyResponse(updated=result.updated)
