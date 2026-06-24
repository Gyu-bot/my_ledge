import calendar
from datetime import date
from decimal import Decimal
from statistics import median

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.insurance_contract import InsuranceContract
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.transaction import Transaction
from app.schemas.asset import (
    AssetSnapshotTotalsResponse,
    AssetSnapshotComparisonDeltaResponse,
    AssetSnapshotComparisonResponse,
    AssetLiabilityHealthResponse,
    AssetLiquidityPatchRequest,
    AssetSnapshotItemResponse,
    AssetSnapshotsResponse,
    InvestmentItemResponse,
    InvestmentSummaryResponse,
    InvestmentTotalsResponse,
    InsuranceContractItemResponse,
    InsurancePremiumEstimateResponse,
    InsuranceSummaryResponse,
    LoanItemResponse,
    LoanRepaymentMetadataPatchRequest,
    LoanRepaymentMetadataResponse,
    LoanSummaryResponse,
    LoanTotalsResponse,
    NetWorthHistoryResponse,
    NetWorthPointResponse,
    NetWorthBreakdownItemResponse,
    NetWorthBreakdownResponse,
    SnapshotComparisonMode,
)
from app.services.settings_service import get_analytics_settings


async def list_asset_snapshots(db_session: AsyncSession) -> AssetSnapshotsResponse:
    items = await _load_asset_snapshot_totals(db_session)
    asset_items = await _load_asset_snapshot_items(db_session)
    return AssetSnapshotsResponse(items=items, asset_items=asset_items)


async def get_asset_snapshot_comparison(
    db_session: AsyncSession,
    *,
    comparison_mode: SnapshotComparisonMode = SnapshotComparisonMode.LATEST_AVAILABLE_VS_PREVIOUS_AVAILABLE,
    snapshot_date: date | None = None,
    baseline_snapshot_date: date | None = None,
) -> AssetSnapshotComparisonResponse:
    snapshots = await _load_asset_snapshot_totals(db_session)
    current, baseline = _resolve_comparison_pair(
        snapshots,
        comparison_mode=comparison_mode,
        snapshot_date=snapshot_date,
        baseline_snapshot_date=baseline_snapshot_date,
    )
    if current is None:
        return AssetSnapshotComparisonResponse(
            comparison_mode=comparison_mode,
            current=None,
            baseline=None,
            delta=None,
            comparison_days=None,
            is_partial=False,
            is_stale=False,
            can_compare=False,
            comparison_label="비교 기준 부족",
        )

    is_stale = _is_stale_snapshot(current.snapshot_date)
    if baseline is None:
        return AssetSnapshotComparisonResponse(
            comparison_mode=comparison_mode,
            current=current,
            baseline=None,
            delta=None,
            comparison_days=None,
            is_partial=False,
            is_stale=is_stale,
            can_compare=False,
            comparison_label="비교 기준 부족",
        )

    is_partial = (
        comparison_mode
        != SnapshotComparisonMode.LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH
        and not _is_month_end(current.snapshot_date)
    )
    return AssetSnapshotComparisonResponse(
        comparison_mode=comparison_mode,
        current=current,
        baseline=baseline,
        delta=AssetSnapshotComparisonDeltaResponse(
            asset_total=current.asset_total - baseline.asset_total,
            liability_total=current.liability_total - baseline.liability_total,
            net_worth=current.net_worth - baseline.net_worth,
            asset_total_pct=_safe_ratio(
                current.asset_total - baseline.asset_total, baseline.asset_total
            ),
            liability_total_pct=_safe_ratio(
                current.liability_total - baseline.liability_total,
                baseline.liability_total,
            ),
            net_worth_pct=_safe_ratio(
                current.net_worth - baseline.net_worth, baseline.net_worth
            ),
        ),
        comparison_days=(current.snapshot_date - baseline.snapshot_date).days,
        is_partial=is_partial,
        is_stale=is_stale,
        can_compare=True,
        comparison_label=_build_comparison_label(
            comparison_mode=comparison_mode,
            is_partial=is_partial,
            is_stale=is_stale,
        ),
    )


async def _load_asset_snapshot_totals(
    db_session: AsyncSession,
) -> list[AssetSnapshotTotalsResponse]:
    asset_case = case((AssetSnapshot.side == "asset", AssetSnapshot.amount), else_=0)
    liability_case = case(
        (AssetSnapshot.side == "liability", AssetSnapshot.amount), else_=0
    )
    result = await db_session.execute(
        select(
            AssetSnapshot.snapshot_date,
            func.sum(asset_case).label("asset_total"),
            func.sum(liability_case).label("liability_total"),
        )
        .group_by(AssetSnapshot.snapshot_date)
        .order_by(AssetSnapshot.snapshot_date)
    )

    items = []
    for snapshot_date, asset_total, liability_total in result.all():
        asset_value = Decimal(asset_total or 0)
        liability_value = Decimal(liability_total or 0)
        items.append(
            AssetSnapshotTotalsResponse(
                snapshot_date=snapshot_date,
                asset_total=asset_value,
                liability_total=liability_value,
                net_worth=asset_value - liability_value,
            )
        )
    return items


async def _load_asset_snapshot_items(
    db_session: AsyncSession,
) -> list[AssetSnapshotItemResponse]:
    latest_snapshot_date = await db_session.scalar(
        select(func.max(AssetSnapshot.snapshot_date)).where(
            AssetSnapshot.side == "asset"
        )
    )
    if latest_snapshot_date is None:
        return []
    result = await db_session.execute(
        select(AssetSnapshot)
        .where(AssetSnapshot.side == "asset")
        .where(AssetSnapshot.snapshot_date == latest_snapshot_date)
        .order_by(
            AssetSnapshot.category.asc(),
            AssetSnapshot.product_name.asc(),
            AssetSnapshot.id.asc(),
        )
    )
    return [
        AssetSnapshotItemResponse.model_validate(row, from_attributes=True)
        for row in result.scalars()
    ]


async def get_net_worth_history(db_session: AsyncSession) -> NetWorthHistoryResponse:
    snapshots = await list_asset_snapshots(db_session)
    return NetWorthHistoryResponse(
        items=[
            NetWorthPointResponse(
                snapshot_date=item.snapshot_date,
                net_worth=item.net_worth,
            )
            for item in snapshots.items
        ]
    )


async def get_net_worth_breakdown(
    db_session: AsyncSession,
    snapshot_date: date | None = None,
) -> NetWorthBreakdownResponse:
    resolved_snapshot_date = await _resolve_snapshot_date(
        db_session,
        AssetSnapshot.snapshot_date,
        snapshot_date,
    )
    if resolved_snapshot_date is None:
        return NetWorthBreakdownResponse(
            snapshot_date=None,
            asset_total=Decimal("0"),
            negative_asset_excluded_total=Decimal("0"),
            liability_total=Decimal("0"),
            net_worth=Decimal("0"),
            items=[],
        )

    result = await db_session.execute(
        select(
            AssetSnapshot.side,
            AssetSnapshot.category,
            AssetSnapshot.amount,
        )
        .where(AssetSnapshot.snapshot_date == resolved_snapshot_date)
        .order_by(AssetSnapshot.side, AssetSnapshot.category)
    )
    raw_rows = result.all()
    asset_total = sum(
        Decimal(amount or 0)
        for side, _category, amount in raw_rows
        if side == "asset" and Decimal(amount or 0) >= 0
    )
    negative_asset_excluded_total = sum(
        Decimal(amount or 0)
        for side, _category, amount in raw_rows
        if side == "asset" and Decimal(amount or 0) < 0
    )
    liability_total = sum(
        Decimal(amount or 0)
        for side, _category, amount in raw_rows
        if side == "liability"
    )
    grouped_rows: dict[tuple[str, str], Decimal] = {}
    for side, category, amount in raw_rows:
        amount_value = Decimal(amount or 0)
        if side == "asset" and amount_value < 0:
            continue
        key = (side, category)
        grouped_rows[key] = grouped_rows.get(key, Decimal("0")) + amount_value
    rows = [
        (side, category, amount)
        for (side, category), amount in sorted(grouped_rows.items())
    ]
    return NetWorthBreakdownResponse(
        snapshot_date=resolved_snapshot_date,
        asset_total=asset_total,
        negative_asset_excluded_total=negative_asset_excluded_total,
        liability_total=liability_total,
        net_worth=asset_total - liability_total,
        items=[
            NetWorthBreakdownItemResponse(
                side=side,
                category=category,
                amount=Decimal(amount or 0),
                ratio=_safe_ratio(
                    Decimal(amount or 0),
                    asset_total if side == "asset" else liability_total,
                ),
            )
            for side, category, amount in rows
        ],
    )


async def get_asset_liability_health(
    db_session: AsyncSession,
    *,
    monthly_required_spend: Decimal | None = None,
    monthly_income: Decimal | None = None,
    snapshot_date: date | None = None,
) -> AssetLiabilityHealthResponse:
    analytics_settings = await get_analytics_settings(db_session)
    emergency_fund_target_months = (
        analytics_settings.effective.financial_targets.emergency_fund_target_months
    )
    breakdown = await get_net_worth_breakdown(db_session, snapshot_date)
    manual_input_overrides: list[str] = []
    if monthly_required_spend is not None:
        manual_input_overrides.append("monthly_required_spend")
    if monthly_income is not None:
        manual_input_overrides.append("monthly_income")
    derived_defaults = await _derive_liquidity_health_defaults(db_session)
    required_spend = (
        monthly_required_spend
        if monthly_required_spend is not None
        else derived_defaults["monthly_required_spend"]
    )
    income = (
        monthly_income
        if monthly_income is not None
        else derived_defaults["monthly_income"]
    )
    money_scale = Decimal("0.01")
    required_spend = required_spend.quantize(money_scale)
    income = income.quantize(money_scale)
    monthly_required_spend_source = (
        "manual_query_param"
        if monthly_required_spend is not None
        else derived_defaults["monthly_required_spend_source"]
    )
    monthly_income_source = (
        "manual_query_param"
        if monthly_income is not None
        else derived_defaults["monthly_income_source"]
    )
    if breakdown.snapshot_date is None:
        return AssetLiabilityHealthResponse(
            snapshot_date=None,
            cash_equivalent_total=Decimal("0"),
            asset_total=Decimal("0"),
            negative_asset_excluded_total=Decimal("0"),
            liability_total=Decimal("0"),
            net_worth=Decimal("0"),
            monthly_required_spend=required_spend,
            monthly_required_spend_source=monthly_required_spend_source,
            emergency_fund_months=None,
            emergency_fund_target_months=emergency_fund_target_months,
            target_progress_ratio=None,
            monthly_debt_payment=Decimal("0"),
            monthly_income=income,
            monthly_income_source=monthly_income_source,
            derived_from_periods=derived_defaults["derived_from_periods"],
            manual_input_overrides=manual_input_overrides,
            debt_payment_ratio=None,
            debt_to_asset_ratio=None,
            confidence="low",
            assumptions=["asset snapshot is missing"],
        )

    cash_result = await db_session.execute(
        select(AssetSnapshot)
        .where(AssetSnapshot.snapshot_date == breakdown.snapshot_date)
        .where(AssetSnapshot.side == "asset")
    )
    assets = list(cash_result.scalars())
    cash_equivalent_total = sum(
        (
            asset.amount
            for asset in assets
            if asset.amount >= 0 and _is_cash_equivalent_asset(asset)
        ),
        Decimal("0"),
    )

    loan_result = await db_session.execute(
        select(func.sum(Loan.monthly_payment)).where(
            Loan.snapshot_date == breakdown.snapshot_date
        )
    )
    monthly_debt_payment = Decimal(loan_result.scalar_one_or_none() or 0)
    assumptions = [
        "cash equivalents use user-confirmed flags first and conservative category/name heuristics when missing",
        "debt burden uses loan monthly_payment when available",
    ]
    if breakdown.negative_asset_excluded_total < 0:
        assumptions.append("negative_asset_rows_excluded")
    confidence = "medium" if required_spend > 0 and monthly_debt_payment > 0 else "low"
    emergency_fund_months = _safe_ratio(cash_equivalent_total, required_spend)
    return AssetLiabilityHealthResponse(
        snapshot_date=breakdown.snapshot_date,
        cash_equivalent_total=cash_equivalent_total,
        asset_total=breakdown.asset_total,
        negative_asset_excluded_total=breakdown.negative_asset_excluded_total,
        liability_total=breakdown.liability_total,
        net_worth=breakdown.net_worth,
        monthly_required_spend=required_spend,
        monthly_required_spend_source=monthly_required_spend_source,
        emergency_fund_months=emergency_fund_months,
        emergency_fund_target_months=emergency_fund_target_months,
        target_progress_ratio=_safe_ratio(
            Decimal(str(emergency_fund_months or 0)),
            Decimal(emergency_fund_target_months),
        )
        if emergency_fund_months is not None
        else None,
        monthly_debt_payment=monthly_debt_payment,
        monthly_income=income,
        monthly_income_source=monthly_income_source,
        derived_from_periods=derived_defaults["derived_from_periods"],
        manual_input_overrides=manual_input_overrides,
        debt_payment_ratio=_safe_ratio(monthly_debt_payment, income),
        debt_to_asset_ratio=_safe_ratio(
            breakdown.liability_total, breakdown.asset_total
        ),
        confidence=confidence,
        assumptions=assumptions,
    )


async def get_insurance_summary(
    db_session: AsyncSession,
    snapshot_date: date | None,
) -> InsuranceSummaryResponse:
    resolved_snapshot_date = await _resolve_snapshot_date(
        db_session,
        InsuranceContract.snapshot_date,
        snapshot_date,
    )
    if resolved_snapshot_date is None:
        return InsuranceSummaryResponse(
            snapshot_date=None,
            has_contract_snapshot=False,
            missing_reason="never_imported",
            items=[],
            monthly_premium_estimate=InsurancePremiumEstimateResponse(
                period=None,
                amount=None,
                assumptions=["insurance contract snapshot is missing"],
                basis={
                    "is_estimated": False,
                    "missing_reason": "insurance_contract_snapshot_missing",
                    "expected_source": "transactions effective category 보험",
                },
            ),
        )

    result = await db_session.execute(
        select(InsuranceContract)
        .where(InsuranceContract.snapshot_date == resolved_snapshot_date)
        .order_by(
            InsuranceContract.insurer.asc(),
            InsuranceContract.product_name.asc(),
            InsuranceContract.id.asc(),
        )
    )
    items = [
        InsuranceContractItemResponse.model_validate(row, from_attributes=True)
        for row in result.scalars().all()
    ]
    return InsuranceSummaryResponse(
        snapshot_date=resolved_snapshot_date,
        has_contract_snapshot=True,
        missing_reason=None,
        items=items,
        monthly_premium_estimate=await _estimate_monthly_insurance_premium(
            db_session,
        ),
    )


async def patch_asset_liquidity(
    db_session: AsyncSession,
    asset_snapshot_id: int,
    payload: AssetLiquidityPatchRequest,
) -> AssetSnapshotItemResponse:
    asset = await db_session.get(AssetSnapshot, asset_snapshot_id)
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset snapshot not found.",
        )
    update_fields = payload.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(asset, field, value)
    await db_session.commit()
    await db_session.refresh(asset)
    return AssetSnapshotItemResponse.model_validate(asset, from_attributes=True)


async def patch_loan_repayment_metadata(
    db_session: AsyncSession,
    loan_id: int,
    payload: LoanRepaymentMetadataPatchRequest,
) -> LoanRepaymentMetadataResponse:
    loan = await db_session.get(Loan, loan_id)
    if loan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan snapshot not found.",
        )
    update_fields = payload.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(loan, field, value)
    if "monthly_payment" in update_fields:
        loan.monthly_payment_source = "manual"
    if "repayment_method" in update_fields:
        loan.repayment_method_source = "manual"
    await db_session.commit()
    await db_session.refresh(loan)
    return LoanRepaymentMetadataResponse.model_validate(loan, from_attributes=True)


async def get_investment_summary(
    db_session: AsyncSession,
    snapshot_date: date | None,
) -> InvestmentSummaryResponse:
    resolved_snapshot_date = await _resolve_snapshot_date(
        db_session,
        Investment.snapshot_date,
        snapshot_date,
    )
    if resolved_snapshot_date is None:
        return InvestmentSummaryResponse(
            snapshot_date=None,
            items=[],
            totals=InvestmentTotalsResponse(
                cost_basis=Decimal("0"),
                market_value=Decimal("0"),
            ),
        )

    result = await db_session.execute(
        select(Investment)
        .where(Investment.snapshot_date == resolved_snapshot_date)
        .order_by(Investment.broker, Investment.product_name)
    )
    raw_items = [
        InvestmentItemResponse.model_validate(row, from_attributes=True)
        for row in result.scalars()
    ]
    market_value_total = sum((item.market_value or Decimal("0")) for item in raw_items)
    items = [
        item.model_copy(
            update={
                "pct_of_investment_total": _safe_ratio(
                    item.market_value or Decimal("0"),
                    market_value_total,
                )
            }
        )
        for item in raw_items
    ]
    return InvestmentSummaryResponse(
        snapshot_date=resolved_snapshot_date,
        items=items,
        totals=InvestmentTotalsResponse(
            cost_basis=sum((item.cost_basis or Decimal("0")) for item in items),
            market_value=sum((item.market_value or Decimal("0")) for item in items),
        ),
    )


async def get_loan_summary(
    db_session: AsyncSession,
    snapshot_date: date | None,
) -> LoanSummaryResponse:
    resolved_snapshot_date = await _resolve_snapshot_date(
        db_session,
        Loan.snapshot_date,
        snapshot_date,
    )
    if resolved_snapshot_date is None:
        return LoanSummaryResponse(
            snapshot_date=None,
            items=[],
            totals=LoanTotalsResponse(
                principal=Decimal("0"),
                balance=Decimal("0"),
            ),
        )

    result = await db_session.execute(
        select(Loan, LoanAccount.loan_kind, LoanAccount.is_hidden)
        .outerjoin(
            LoanAccount,
            and_(
                LoanAccount.lender == Loan.lender,
                LoanAccount.product_name == Loan.product_name,
            ),
        )
        .where(Loan.snapshot_date == resolved_snapshot_date)
        .order_by(Loan.lender, Loan.product_name)
    )
    rows = result.all()
    items = [
        _loan_item_response_with_account_kind(loan, loan_kind)
        for loan, loan_kind, is_hidden in rows
        if not is_hidden
    ]
    return LoanSummaryResponse(
        snapshot_date=resolved_snapshot_date,
        as_of_date=resolved_snapshot_date,
        summary_scope="active_loans_only",
        excluded_historical_count=sum(
            1 for _loan, _loan_kind, is_hidden in rows if is_hidden
        ),
        items=items,
        totals=LoanTotalsResponse(
            principal=sum((item.principal or Decimal("0")) for item in items),
            balance=sum((item.balance or Decimal("0")) for item in items),
        ),
    )


def _loan_item_response_with_account_kind(
    loan: Loan,
    loan_kind: str | None,
) -> LoanItemResponse:
    item = LoanItemResponse.model_validate(loan, from_attributes=True)
    item.loan_kind = loan_kind
    if item.repayment_method and item.repayment_method != "unknown":
        return item
    if item.repayment_method_source == "manual":
        return item
    derived_method = _repayment_method_from_loan_kind(loan_kind)
    if derived_method is None:
        return item
    item.repayment_method = derived_method
    item.repayment_method_source = "derived_from_loan_account"
    return item


def _repayment_method_from_loan_kind(loan_kind: str | None) -> str | None:
    return {
        "equal_principal_interest": "principal_interest",
        "equal_principal": "principal_equal",
        "bullet": "interest_only",
    }.get(loan_kind or "")


async def _estimate_monthly_insurance_premium(
    db_session: AsyncSession,
) -> InsurancePremiumEstimateResponse:
    latest_transaction_date = await db_session.scalar(
        select(func.max(Transaction.date))
    )
    if latest_transaction_date is None:
        return InsurancePremiumEstimateResponse(
            period=None,
            amount=None,
            assumptions=["no transaction history is available"],
        )

    period_start, period_end = _recent_closed_month_bounds(latest_transaction_date)
    result = await db_session.execute(
        select(Transaction.amount)
        .where(Transaction.date >= period_start)
        .where(Transaction.date <= period_end)
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(
            func.coalesce(
                Transaction.category_major_user,
                Transaction.category_major,
            )
            == "보험"
        )
    )
    net_spend = sum(
        (Decimal(-amount) for amount in result.scalars().all()), Decimal("0")
    )
    return InsurancePremiumEstimateResponse(
        period=f"{period_start:%Y-%m}",
        amount=net_spend,
        assumptions=[
            "monthly_premium_estimate uses the latest closed month insurance-category spending",
            "effective category uses category_major_user before category_major",
            "refunds and cancellations offset the estimate through net spend",
        ],
        basis={
            "is_estimated": True,
            "source": "latest_closed_month_insurance_spend",
            "expected_source": "transactions effective category 보험",
        },
    )


async def _derive_liquidity_health_defaults(
    db_session: AsyncSession,
) -> dict[str, object]:
    latest_transaction_date = await db_session.scalar(
        select(func.max(Transaction.date))
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
    )
    if latest_transaction_date is None:
        return {
            "monthly_income": Decimal("0"),
            "monthly_income_source": "missing_transaction_history",
            "monthly_required_spend": Decimal("0"),
            "monthly_required_spend_source": "missing_transaction_history",
            "derived_from_periods": [],
        }

    current_period = latest_transaction_date.strftime("%Y-%m")
    income_rows = await db_session.execute(
        select(Transaction.date, Transaction.amount)
        .where(Transaction.type == "수입")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
    )
    income_by_period: dict[str, Decimal] = {}
    for tx_date, amount in income_rows.all():
        period = tx_date.strftime("%Y-%m")
        if period >= current_period:
            continue
        income_by_period[period] = income_by_period.get(period, Decimal("0")) + Decimal(
            amount or 0
        )
    monthly_income = (
        Decimal(str(median(income_by_period.values())))
        if income_by_period
        else Decimal("0")
    )
    _, closed_month_end = _recent_closed_month_bounds(latest_transaction_date)
    closed_period = closed_month_end.strftime("%Y-%m")
    required_spend_result = await db_session.execute(
        select(func.sum(-Transaction.amount))
        .where(Transaction.type == "지출")
        .where(Transaction.is_deleted.is_(False))
        .where(Transaction.merged_into_id.is_(None))
        .where(
            Transaction.date >= date(closed_month_end.year, closed_month_end.month, 1)
        )
        .where(Transaction.date <= closed_month_end)
        .where(Transaction.spend_necessity == "essential")
    )
    essential_spend = Decimal(required_spend_result.scalar_one_or_none() or 0)
    monthly_debt_payment = Decimal(
        await db_session.scalar(select(func.sum(Loan.monthly_payment))) or 0
    )
    derived_periods = sorted(set(income_by_period) | {closed_period})
    money_scale = Decimal("0.01")
    return {
        "monthly_income": monthly_income.quantize(money_scale),
        "monthly_income_source": "closed_month_income_median"
        if income_by_period
        else "missing_closed_month_income",
        "monthly_required_spend": (essential_spend + monthly_debt_payment).quantize(
            money_scale
        ),
        "monthly_required_spend_source": "closed_month_required_spend",
        "derived_from_periods": derived_periods,
    }


def _recent_closed_month_bounds(value: date) -> tuple[date, date]:
    if _is_month_end(value):
        year = value.year
        month = value.month
    elif value.month == 1:
        year = value.year - 1
        month = 12
    else:
        year = value.year
        month = value.month - 1
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


async def _resolve_snapshot_date(
    db_session: AsyncSession,
    model_field,
    requested_snapshot_date: date | None,
) -> date | None:
    if requested_snapshot_date is not None:
        return requested_snapshot_date
    return await db_session.scalar(select(func.max(model_field)))


def _resolve_comparison_pair(
    snapshots: list[AssetSnapshotTotalsResponse],
    *,
    comparison_mode: SnapshotComparisonMode,
    snapshot_date: date | None,
    baseline_snapshot_date: date | None,
) -> tuple[AssetSnapshotTotalsResponse | None, AssetSnapshotTotalsResponse | None]:
    if not snapshots:
        return None, None

    snapshot_map = {item.snapshot_date: item for item in snapshots}

    if comparison_mode == SnapshotComparisonMode.LATEST_AVAILABLE_VS_PREVIOUS_AVAILABLE:
        current = snapshots[-1]
        baseline = snapshots[-2] if len(snapshots) > 1 else None
        return current, baseline

    if (
        comparison_mode
        == SnapshotComparisonMode.LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH
    ):
        closed_months = [
            item for item in snapshots if _is_month_end(item.snapshot_date)
        ]
        current = closed_months[-1] if closed_months else None
        baseline = closed_months[-2] if len(closed_months) > 1 else None
        return current, baseline

    if comparison_mode == SnapshotComparisonMode.SELECTED_SNAPSHOT_VS_BASELINE_SNAPSHOT:
        if snapshot_date is None or baseline_snapshot_date is None:
            raise ValueError("snapshot_date and baseline_snapshot_date are required")
        current = snapshot_map.get(snapshot_date)
        baseline = snapshot_map.get(baseline_snapshot_date)
        if current is None or baseline is None:
            raise ValueError("requested snapshot pair does not exist")
        return current, baseline

    raise ValueError(f"unsupported comparison mode: {comparison_mode}")


def _is_month_end(value: date) -> bool:
    return value.day == calendar.monthrange(value.year, value.month)[1]


def _build_comparison_label(
    *,
    comparison_mode: SnapshotComparisonMode,
    is_partial: bool,
    is_stale: bool,
) -> str:
    if (
        comparison_mode
        == SnapshotComparisonMode.LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH
    ):
        base_label = "마감월 기준"
    elif is_partial:
        base_label = "부분 기간"
    elif (
        comparison_mode == SnapshotComparisonMode.SELECTED_SNAPSHOT_VS_BASELINE_SNAPSHOT
    ):
        base_label = "선택 스냅샷 기준"
    else:
        base_label = "최신 스냅샷 기준"

    if is_stale:
        return f"{base_label} / stale snapshot"
    return base_label


def _today() -> date:
    return date.today()


def _is_stale_snapshot(snapshot_date: date) -> bool:
    return (_today() - snapshot_date).days > 35


def _safe_ratio(numerator: Decimal, denominator: Decimal) -> float | None:
    if denominator == 0:
        return None
    return round(float(numerator / denominator), 4)


def _is_cash_equivalent_asset(asset: AssetSnapshot) -> bool:
    if asset.amount < 0:
        return False
    if asset.is_cash_equivalent is not None:
        return asset.is_cash_equivalent
    if asset.liquidity_tier in {"cash", "cash_equivalent", "immediate"}:
        return True
    if asset.liquidity_tier in {"near_liquid", "locked", "illiquid"}:
        return False
    text = f"{asset.category} {asset.product_name}".casefold()
    cash_markers = (
        "현금",
        "예금",
        "입출금",
        "자유입출금",
        "전자금융",
        "cma",
        "파킹",
        "보통예금",
        "통장",
    )
    locked_markers = ("부동산", "전세", "보증금", "연금", "보험", "청약", "저금통")
    if any(marker in text for marker in locked_markers):
        return False
    return any(marker in text for marker in cash_markers)
