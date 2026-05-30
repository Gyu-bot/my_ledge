from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import require_api_key
from app.schemas.auto_classification import (
    AutoClassificationApplyResponse,
    AutoClassificationSettingsPatchRequest,
    AutoClassificationSettingsResponse,
    CategoryClassificationRuleListResponse,
    CategoryClassificationRuleRequest,
    CategoryClassificationRuleResponse,
    LoanMerchantRuleListResponse,
    LoanMerchantRuleRequest,
    LoanMerchantRuleResponse,
    MerchantAliasRuleListResponse,
    MerchantAliasRuleRequest,
    MerchantAliasRuleResponse,
    RecurringCategoryRuleListResponse,
    RecurringCategoryRuleRequest,
    RecurringCategoryRuleResponse,
    RecurringDryRunApplyRequest,
    RecurringDryRunResponse,
)
from app.services.auto_classification_service import (
    apply_category_classification_rules,
    apply_loan_merchant_rules,
    apply_merchant_alias_rules,
    apply_recurring_category_rules,
    apply_recurring_dry_run,
    delete_category_classification_rule,
    delete_loan_merchant_rule,
    delete_merchant_alias_rule,
    delete_recurring_category_rule,
    dry_run_recurring_category_rules,
    get_auto_classification_settings,
    list_category_classification_rules,
    list_loan_merchant_rules,
    list_merchant_alias_rules,
    list_recurring_category_rules,
    patch_auto_classification_settings,
    upsert_category_classification_rule,
    upsert_loan_merchant_rule,
    upsert_merchant_alias_rule,
    upsert_recurring_category_rule,
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
        apply_cost_rules_on_upload=settings.apply_cost_rules_on_upload,
        apply_loan_rules_on_upload=settings.apply_loan_rules_on_upload,
        apply_recurring_rules_on_upload=settings.apply_recurring_rules_on_upload,
    )


@router.patch("/settings", response_model=AutoClassificationSettingsResponse)
async def patch_settings(
    payload: AutoClassificationSettingsPatchRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationSettingsResponse:
    settings = await patch_auto_classification_settings(db_session, payload)
    return AutoClassificationSettingsResponse(
        apply_cost_rules_on_upload=settings.apply_cost_rules_on_upload,
        apply_loan_rules_on_upload=settings.apply_loan_rules_on_upload,
        apply_recurring_rules_on_upload=settings.apply_recurring_rules_on_upload,
    )


@router.get("/category-rules", response_model=CategoryClassificationRuleListResponse)
async def get_category_rules(
    db_session: AsyncSession = Depends(get_db_session),
) -> CategoryClassificationRuleListResponse:
    return await list_category_classification_rules(db_session)


@router.post(
    "/category-rules",
    response_model=CategoryClassificationRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_category_rule(
    payload: CategoryClassificationRuleRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> CategoryClassificationRuleResponse:
    return await upsert_category_classification_rule(db_session, payload)


@router.delete("/category-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category_rule(
    rule_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    deleted = await delete_category_classification_rule(db_session, rule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)


@router.post(
    "/apply/category-rules",
    response_model=AutoClassificationApplyResponse,
)
async def apply_category_rules(
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationApplyResponse:
    result = await apply_category_classification_rules(db_session)
    return AutoClassificationApplyResponse(updated=result.updated)


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
    return Response(status_code=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)


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
    return Response(status_code=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)


@router.post(
    "/apply/merchant-alias-rules",
    response_model=AutoClassificationApplyResponse,
)
async def apply_merchant_alias_rules_endpoint(
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationApplyResponse:
    result = await apply_merchant_alias_rules(db_session)
    return AutoClassificationApplyResponse(updated=result.updated)


@router.get(
    "/recurring-category-rules",
    response_model=RecurringCategoryRuleListResponse,
)
async def get_recurring_category_rules(
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringCategoryRuleListResponse:
    return await list_recurring_category_rules(db_session)


@router.post(
    "/recurring-category-rules",
    response_model=RecurringCategoryRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_recurring_category_rule(
    payload: RecurringCategoryRuleRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringCategoryRuleResponse:
    return await upsert_recurring_category_rule(db_session, payload)


@router.get(
    "/recurring-category-rules/dry-run",
    response_model=RecurringDryRunResponse,
)
async def get_recurring_category_rules_dry_run(
    db_session: AsyncSession = Depends(get_db_session),
) -> RecurringDryRunResponse:
    return await dry_run_recurring_category_rules(db_session)


@router.delete(
    "/recurring-category-rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_recurring_category_rule_endpoint(
    rule_id: int,
    db_session: AsyncSession = Depends(get_db_session),
) -> Response:
    deleted = await delete_recurring_category_rule(db_session, rule_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT if deleted else status.HTTP_404_NOT_FOUND)


@router.post(
    "/apply/recurring-category-rules",
    response_model=AutoClassificationApplyResponse,
)
async def apply_recurring_rules(
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationApplyResponse:
    result = await apply_recurring_category_rules(db_session)
    return AutoClassificationApplyResponse(updated=result.updated)


@router.post(
    "/apply/recurring-dry-run",
    response_model=AutoClassificationApplyResponse,
)
async def apply_recurring_dry_run_endpoint(
    payload: RecurringDryRunApplyRequest,
    db_session: AsyncSession = Depends(get_db_session),
) -> AutoClassificationApplyResponse:
    result = await apply_recurring_dry_run(db_session, payload)
    return AutoClassificationApplyResponse(updated=result.updated)
