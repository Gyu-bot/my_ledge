from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import AssetSnapshot, Investment
from app.models.asset_source import AssetSourceObservation, AssetSourceRun
from app.parsers.snapshots import SnapshotParseResult
from app.schemas.asset_source import (
    ExternalHoldingInput,
    ExternalRunInput,
    SourceMappingRequest,
    SourcePolicy,
    SourcePolicyApplyRequest,
)
from app.services.asset_source_service import (
    account_key,
    apply_policy,
    create_mapping,
    preview_policy,
    record_external_run,
    select_investments,
)
from app.services.upload_service import replace_snapshots


TODAY = datetime.now(timezone.utc).date()
OLD = TODAY - timedelta(days=20)


def snapshot(value="100", broker="토스증권", investments=True):
    return SnapshotParseResult(
        asset_snapshots=[
            {
                "side": "asset",
                "category": "투자",
                "product_name": "토스계좌",
                "amount": Decimal(value),
            },
            {
                "side": "asset",
                "category": "현금",
                "product_name": "은행",
                "amount": Decimal("500"),
            },
        ],
        investments=[
            {
                "broker": broker,
                "product_name": "알파벳",
                "product_type": "주식",
                "market_value": Decimal(value),
                "cost_basis": Decimal("80"),
                "return_rate": None,
            }
        ]
        if investments
        else [],
        loans=[],
        insurance_contracts=[],
    )


async def seed(db):
    await replace_snapshots(db, OLD, snapshot())
    await db.commit()


async def mapping(db, *, cash_scope="holdings_only", components=True):
    return await create_mapping(
        db,
        SourceMappingRequest(
            account_key=account_key("토스증권"),
            external_account_key="toss:account:1",
            asset_components=[
                {"side": "asset", "category": "투자", "product_name": "토스계좌"}
            ]
            if components
            else [],
            cash_scope=cash_scope,
            confirmed=True,
            reason="entire broker group is this account",
        ),
    )


async def external(
    db, *, days=1, value="150", status="success_complete", holdings=True, **kwargs
):
    run = await record_external_run(
        db,
        ExternalRunInput(
            account_key="toss:account:1",
            valuation_at=datetime.now(timezone.utc) - timedelta(days=days),
            status=status,
            holdings=[
                ExternalHoldingInput(
                    instrument_key="US:GOOG",
                    product_name="알파벳",
                    market_value=Decimal(value),
                )
            ]
            if holdings
            else [],
            **kwargs,
        ),
    )
    await db.commit()
    return run


async def test_whole_account_replacement_and_mixed_dates(db_session):
    await seed(db_session)
    await mapping(db_session)
    run = await external(db_session)
    result = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert result.investment_total == 150
    assert result.confirmed_net_worth == 600
    assert result.estimated_net_worth == 650
    assert result.mixed_dates
    assert "unobserved_cross_account_transfers_possible" in result.warnings
    assert result.accounts[0].selected_run_id == run.id
    assert result.items[0].instrument_key == "US:GOOG"
    assert await db_session.scalar(select(func.sum(AssetSnapshot.amount))) == 600


async def test_failed_partial_keep_last_complete_even_stale(db_session):
    await seed(db_session)
    await mapping(db_session)
    good = await external(db_session, days=10)
    await external(db_session, days=2, value="999", status="success_partial")
    await external(db_session, days=1, value="999", status="failed")
    result = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    account = result.accounts[0]
    assert account.selected_run_id == good.id
    assert account.is_stale
    assert account.fallback_reason is None
    assert "latest_sync_failed" in account.conflicts
    assert account.last_attempt_status == "failed"
    assert result.investment_total == 150


async def test_latest_valuation_not_late_ingestion_wins(db_session):
    await seed(db_session)
    await mapping(db_session)
    recent = await external(db_session, days=1)
    late_success = await external(db_session, days=15, value="999")
    result = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert result.accounts[0].selected_run_id == recent.id
    assert not result.accounts[0].is_stale
    account = result.accounts[0]
    assert account.ingested_at == recent.ingested_at
    assert account.last_success_at == late_success.ingested_at
    assert account.last_attempt_at == late_success.ingested_at
    assert account.last_success_at > account.ingested_at


async def test_empty_complete_run_is_zero_not_fallback(db_session):
    await seed(db_session)
    await mapping(db_session)
    await external(db_session, holdings=False)
    result = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert result.investment_total == 0
    assert result.estimated_net_worth == 500
    assert result.accounts[0].effective_source == "toss_securities_api"


async def test_mapping_and_success_required_for_fallback(db_session):
    await seed(db_session)
    policy = SourcePolicy(investment_source="toss_securities_api")
    result = await select_investments(db_session, policy=policy)
    assert result.accounts[0].fallback_reason == "account_mapping_required"
    await mapping(db_session)
    await external(db_session, status="success_partial")
    result = await select_investments(db_session, policy=policy)
    assert result.accounts[0].fallback_reason == "no_successful_complete_run"
    assert result.investment_total == 100


@pytest.mark.parametrize(
    "cash_scope,components",
    [("unknown", True), ("holdings_and_cash", True), ("holdings_only", False)],
)
async def test_unsafe_total_replacement_is_null(db_session, cash_scope, components):
    await seed(db_session)
    await mapping(db_session, cash_scope=cash_scope, components=components)
    await external(db_session)
    result = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert result.investment_total == 150
    assert result.estimated_net_worth is None
    assert result.confirmed_net_worth == 600
    assert "net_worth_replacement_scope_unconfirmed" in result.accounts[0].conflicts


async def test_cash_inclusive_component_replaced_once(db_session):
    await seed(db_session)
    await mapping(db_session, cash_scope="holdings_and_cash")
    await external(db_session, cash_balance=Decimal("20"), cash_included=True)
    result = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert result.estimated_net_worth == 670
    assert result.investment_total == 150


async def test_same_symbol_different_broker_distinct_and_policy_restricted(
    db_session, monkeypatch
):
    monkeypatch.setenv("API_KEY", "test")
    data = snapshot()
    data.investments.append({**data.investments[0], "broker": "카카오페이 증권"})
    await replace_snapshots(db_session, OLD, data)
    await db_session.commit()
    result = await select_investments(db_session)
    assert len({i.account_key for i in result.items}) == 2
    assert len({i.instrument_key for i in result.items}) == 1
    with pytest.raises(HTTPException) as error:
        await preview_policy(
            db_session,
            SourcePolicy(
                account_overrides=[
                    {"account_key": "알파벳", "source": "toss_securities_api"}
                ]
            ),
        )
    assert error.value.status_code == 422
    with pytest.raises(HTTPException):
        await preview_policy(
            db_session,
            SourcePolicy(
                account_overrides=[
                    {
                        "account_key": account_key("카카오페이 증권"),
                        "source": "toss_securities_api",
                    }
                ]
            ),
        )


async def test_reupload_append_only_and_missing_broker_zero(db_session):
    await seed(db_session)
    first = await db_session.scalar(
        select(func.count()).select_from(AssetSourceObservation)
    )
    await replace_snapshots(db_session, OLD, snapshot("120"))
    await db_session.commit()
    assert (
        await db_session.scalar(
            select(func.count()).select_from(AssetSourceObservation)
        )
        == first * 2
    )
    result = await select_investments(db_session)
    assert result.investment_total == 120
    await replace_snapshots(db_session, TODAY, snapshot(investments=False))
    await db_session.commit()
    result = await select_investments(db_session)
    assert result.investment_total == 0
    assert result.accounts[0].holdings_count == 0


async def test_historical_query_no_future_external_or_policy_leak(
    db_session, monkeypatch
):
    monkeypatch.setenv("API_KEY", "test")
    await seed(db_session)
    await mapping(db_session)
    await external(db_session)
    policy = SourcePolicy(investment_source="toss_securities_api")
    preview = await preview_policy(db_session, policy)
    await apply_policy(
        db_session,
        SourcePolicyApplyRequest(
            policy=policy, preview_token=preview.preview_token, confirmed=True
        ),
    )
    current = await select_investments(db_session)
    assert current.investment_total == 150
    historic = await select_investments(db_session, as_of_date=OLD)
    assert historic.investment_total == 100
    assert historic.accounts[0].effective_source == "banksalad_snapshot"
    assert historic.estimated_net_worth == 600


async def test_preview_invalidated_by_run_or_policy_revision(db_session, monkeypatch):
    monkeypatch.setenv("API_KEY", "test")
    await seed(db_session)
    await mapping(db_session)
    policy = SourcePolicy(investment_source="toss_securities_api")
    preview = await preview_policy(db_session, policy)
    await external(db_session)
    with pytest.raises(HTTPException) as error:
        await apply_policy(
            db_session,
            SourcePolicyApplyRequest(
                policy=policy, preview_token=preview.preview_token, confirmed=True
            ),
        )
    assert error.value.status_code == 409
    preview = await preview_policy(db_session, policy)
    request = SourcePolicyApplyRequest(
        policy=policy, preview_token=preview.preview_token, confirmed=True
    )
    saved = await apply_policy(db_session, request)
    assert saved.revision == 1
    with pytest.raises(HTTPException):
        await apply_policy(db_session, request)


async def test_future_run_rejected(db_session):
    with pytest.raises(ValueError, match="future"):
        await record_external_run(
            db_session,
            ExternalRunInput(
                account_key="toss:1",
                valuation_at=datetime.now(timezone.utc) + timedelta(days=1),
                status="success_complete",
                holdings=[],
            ),
        )


async def test_snapshot_reset_clears_selected_sources(db_session):
    from app.services.data_reset_service import reset_data

    await seed(db_session)
    await mapping(db_session)
    await external(db_session)
    await reset_data(db_session, scope="transactions_and_snapshots")
    result = await select_investments(db_session)
    assert result.accounts == []
    assert result.coverage.raw == 0
    assert (
        await db_session.scalar(select(func.count()).select_from(AssetSourceRun)) == 0
    )
    assert await db_session.scalar(select(func.count()).select_from(Investment)) == 0


async def test_out_of_order_old_upload_never_resurrects_missing_broker(db_session):
    await replace_snapshots(db_session, TODAY, snapshot(investments=False))
    await db_session.commit()
    await replace_snapshots(db_session, OLD, snapshot())
    await db_session.commit()
    result = await select_investments(db_session)
    assert result.investment_total == 0
    assert result.items == []
    assert result.confirmed_net_worth == 600


@pytest.mark.parametrize("duplicate", [False, True])
async def test_ambiguous_or_missing_values_mark_total_incomplete(db_session, duplicate):
    data = snapshot()
    if duplicate:
        data.investments.append({**data.investments[0], "broker": "토스 증권"})
    else:
        data.investments[0]["market_value"] = None
    await replace_snapshots(db_session, OLD, data)
    await db_session.commit()
    result = await select_investments(db_session)
    assert not result.investment_total_complete
    assert result.estimated_net_worth is None
    assert "investment_total_incomplete" in result.warnings
    assert len(result.accounts) == 1


async def test_legacy_empty_newer_asset_snapshot_does_not_resurrect_holdings(
    db_session,
):
    db_session.add(
        Investment(
            snapshot_date=OLD,
            broker="토스증권",
            product_name="주식",
            market_value=Decimal("100"),
        )
    )
    db_session.add(
        AssetSnapshot(
            snapshot_date=TODAY,
            side="asset",
            category="현금",
            product_name="은행",
            amount=Decimal("500"),
        )
    )
    await db_session.commit()
    result = await select_investments(db_session)
    assert result.items == []
    assert result.investment_total == 0


async def test_account_override_beats_investment_default_without_mutating_raw(
    db_session, monkeypatch
):
    monkeypatch.setenv("API_KEY", "test")
    await seed(db_session)
    await mapping(db_session)
    await external(db_session)
    count = await db_session.scalar(
        select(func.count()).select_from(AssetSourceObservation)
    )
    policy = SourcePolicy(
        investment_source="toss_securities_api",
        account_overrides=[
            {"account_key": account_key("토스증권"), "source": "banksalad_snapshot"}
        ],
    )
    preview = await preview_policy(db_session, policy)
    await apply_policy(
        db_session,
        SourcePolicyApplyRequest(
            policy=policy, preview_token=preview.preview_token, confirmed=True
        ),
    )
    result = await select_investments(db_session)
    assert result.accounts[0].configured_source_basis == "account_override"
    assert result.accounts[0].effective_source == "banksalad_snapshot"
    assert result.investment_total == 100
    assert (
        await db_session.scalar(
            select(func.count()).select_from(AssetSourceObservation)
        )
        == count
    )


async def test_as_of_is_valuation_cutoff_not_historical_known_at(db_session):
    await seed(db_session)
    await mapping(db_session)
    run = await external(db_session, days=15)
    cutoff = TODAY - timedelta(days=10)
    result = await select_investments(
        db_session,
        policy=SourcePolicy(investment_source="toss_securities_api"),
        as_of_date=cutoff,
    )
    assert result.accounts[0].selected_run_id == run.id
    assert result.accounts[0].valuation_at.date() <= cutoff
    assert result.accounts[0].ingested_at.date() > cutoff
    assert result.total_basis == "valuation_cutoff_current_policy_not_known_at_history"


async def test_transaction_only_reset_preserves_observations_and_selected_sources(
    db_session,
):
    from app.services.data_reset_service import reset_data

    await seed(db_session)
    await mapping(db_session)
    await external(db_session)
    await reset_data(db_session, scope="transactions_only")
    result = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert result.investment_total == 150
    assert result.coverage.raw == 2
