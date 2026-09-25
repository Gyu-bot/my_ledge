from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

from fastapi import HTTPException
from pydantic import SecretStr
import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.models import AssetSnapshot, Investment
from app.models.asset_source import (
    AssetSourceMapping,
    AssetSourceObservation,
    AssetSourceRun,
)
from app.parsers.snapshots import SnapshotParseResult
from app.schemas.asset_source import (
    ExternalHoldingInput,
    ExternalRunInput,
    SourcePolicy,
)
from app.schemas.toss import TossSyncRequest
from app.services import toss_service
from app.services.asset_source_service import account_key, select_investments
from app.services.toss_client import TossError
from app.services.upload_service import replace_snapshots


@pytest.fixture(autouse=True)
def synthetic_credentials(monkeypatch):
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        TOSS_CLIENT_ID="synthetic-client",
        TOSS_CLIENT_SECRET="synthetic-secret",
    )
    monkeypatch.setattr(toss_service, "get_settings", lambda: settings)
    return settings


def payload(status="success_complete", value="150"):
    now = datetime.now(timezone.utc)
    return ExternalRunInput(
        account_key="toss:account:synthetic-hash",
        valuation_at=now,
        observed_at=now,
        status=status,
        error="provider_error" if status == "failed" else None,
        holdings=[
            ExternalHoldingInput(
                instrument_key="KR:005930",
                product_name="주식",
                market_value=Decimal(value),
                native_currency="KRW",
                native_market_value=Decimal(value),
            )
        ]
        if status != "failed"
        else [],
        provenance={
            "valuation_time_basis": "observation_proxy",
            "cash_scope": "holdings_only",
            "holdings_scope": "kr_us_stocks",
        },
    )


async def seed_bank(db, broker="토스증권", *, product_type="주식", days_ago=10):
    await replace_snapshots(
        db,
        datetime.now(timezone.utc).date() - timedelta(days=days_ago),
        SnapshotParseResult(
            asset_snapshots=[
                {
                    "side": "asset",
                    "category": "투자",
                    "product_name": "계좌",
                    "amount": Decimal("100"),
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
                    "product_name": "주식",
                    "product_type": product_type,
                    "market_value": Decimal("100"),
                    "cost_basis": Decimal("80"),
                    "return_rate": None,
                }
            ],
            loans=[],
            insurance_contracts=[],
        ),
    )
    await db.commit()


async def reset_cooldown(db):
    last = await toss_service.latest_run(db)
    last.ingested_at = datetime.now(timezone.utc) - timedelta(minutes=2)
    await db.commit()


async def test_explicit_mapping_then_source_selection_replaces_once_and_preserves_raw(
    db_session, monkeypatch
):
    await seed_bank(db_session)
    mock = AsyncMock(side_effect=lambda *_: payload())
    monkeypatch.setattr(toss_service.toss_client, "collect", mock)
    first = await toss_service.sync(db_session, TossSyncRequest())
    assert not first.mapping_connected
    assert await db_session.scalar(select(func.count(AssetSourceMapping.id))) == 0
    await reset_cooldown(db_session)
    second = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    assert second.mapping_connected and second.error_code is None
    mapping = await db_session.scalar(select(AssetSourceMapping))
    assert mapping.account_key == account_key("토스증권")
    assert mapping.asset_components == [] and mapping.cash_scope == "holdings_only"
    # Collection and identity confirmation do not silently enable a source policy.
    default = await select_investments(db_session)
    assert default.investment_total == 100
    selected = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert selected.investment_total == 150 and len(selected.items) == 1
    assert selected.accounts[0].selected_run_id == second.run_id
    assert selected.accounts[0].valuation_precision == "observation_proxy"
    assert selected.confirmed_net_worth == 600
    assert (
        selected.estimated_net_worth is None
    )  # holdings mapping cannot replace cash-inclusive bank asset
    assert await db_session.scalar(select(func.sum(Investment.market_value))) == 100
    assert await db_session.scalar(select(func.sum(AssetSnapshot.amount))) == 600
    run = await db_session.get(AssetSourceRun, second.run_id)
    assert run.provenance["valuation_time_basis"] == "observation_proxy"
    observation = await db_session.scalar(
        select(AssetSourceObservation).where(AssetSourceObservation.run_id == run.id)
    )
    assert observation.payload["native_currency"] == "KRW"


async def test_failed_and_partial_attempts_keep_prior_complete_selection(
    db_session, monkeypatch
):
    await seed_bank(db_session)
    monkeypatch.setattr(
        toss_service.toss_client, "collect", AsyncMock(side_effect=lambda *_: payload())
    )
    good = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    for status in ("success_partial", "failed"):
        await reset_cooldown(db_session)
        monkeypatch.setattr(
            toss_service.toss_client,
            "collect",
            AsyncMock(return_value=payload(status, "999")),
        )
        result = await toss_service.sync(
            db_session, TossSyncRequest(confirm_single_account_mapping=True)
        )
        assert result.status == status
        selected = await select_investments(
            db_session, policy=SourcePolicy(investment_source="toss_securities_api")
        )
        assert selected.investment_total == 150
        assert selected.accounts[0].selected_run_id == good.run_id
        assert selected.accounts[0].last_attempt_status == status
    assert await db_session.scalar(select(func.count(AssetSourceMapping.id))) == 1


@pytest.mark.parametrize("status", ["success_partial", "failed"])
async def test_unsuccessful_initial_run_cannot_create_mapping(
    db_session, monkeypatch, status
):
    await seed_bank(db_session)
    monkeypatch.setattr(
        toss_service.toss_client, "collect", AsyncMock(return_value=payload(status))
    )
    result = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    assert not result.mapping_connected
    assert await db_session.scalar(select(func.count(AssetSourceMapping.id))) == 0
    selected = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert selected.investment_total == 100


@pytest.mark.parametrize("broker", [None, "다른증권"])
async def test_absent_bank_toss_group_never_guesses_mapping(
    db_session, monkeypatch, broker
):
    if broker:
        await seed_bank(db_session, broker)
    monkeypatch.setattr(
        toss_service.toss_client, "collect", AsyncMock(return_value=payload())
    )
    result = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    assert result.status == "success_complete"
    assert (
        not result.mapping_connected
        and result.error_code == "banksalad_toss_group_required"
    )
    selected = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert selected.investment_total == (100 if broker else 0)
    assert "unmapped_external_accounts_excluded" in selected.warnings
    assert await db_session.scalar(select(func.count(AssetSourceMapping.id))) == 0


async def test_existing_different_account_mapping_is_not_overwritten(
    db_session, monkeypatch
):
    await seed_bank(db_session)
    db_session.add(
        AssetSourceMapping(
            account_key=account_key("토스증권"),
            external_account_key="toss:account:existing",
            cash_scope="holdings_only",
            asset_components=[],
            reason="previous confirmation",
        )
    )
    await db_session.commit()
    monkeypatch.setattr(
        toss_service.toss_client, "collect", AsyncMock(return_value=payload())
    )
    result = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    assert (
        result.error_code == "account_mapping_conflict" and not result.mapping_connected
    )
    mapping = await db_session.scalar(select(AssetSourceMapping))
    assert mapping.external_account_key == "toss:account:existing"


async def test_cooldown_blocks_second_network_call(db_session, monkeypatch):
    collect = AsyncMock(return_value=payload())
    monkeypatch.setattr(toss_service.toss_client, "collect", collect)
    await toss_service.sync(db_session, TossSyncRequest())
    status = await toss_service.get_status(db_session)
    assert 0 < status.cooldown_seconds <= 60
    with pytest.raises(HTTPException) as caught:
        await toss_service.sync(db_session, TossSyncRequest())
    assert caught.value.status_code == 409 and caught.value.detail == "sync_cooldown"
    assert collect.await_count == 1


@pytest.mark.parametrize(
    "error,code",
    [
        (TossError("single_account_required"), "single_account_required"),
        (TimeoutError(), "network_timeout"),
    ],
)
async def test_pre_account_failure_is_audited_without_mapping(
    db_session, monkeypatch, error, code
):
    monkeypatch.setattr(
        toss_service.toss_client, "collect", AsyncMock(side_effect=error)
    )
    result = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    assert result.status == "failed" and result.error_code == code
    assert not result.mapping_connected
    run = await db_session.get(AssetSourceRun, result.run_id)
    assert run.account_key == "toss:connection"
    assert (await toss_service.get_status(db_session)).last_attempt.error_code == code


async def test_missing_credentials_rejects_without_network_or_run(
    db_session, monkeypatch, synthetic_credentials
):
    synthetic_credentials.toss_client_secret = None
    collect = AsyncMock()
    monkeypatch.setattr(toss_service.toss_client, "collect", collect)
    assert not (await toss_service.get_status(db_session)).configured
    with pytest.raises(HTTPException) as caught:
        await toss_service.sync(db_session, TossSyncRequest())
    assert (
        caught.value.status_code == 503
        and caught.value.detail == "credentials_not_configured"
    )
    collect.assert_not_awaited()
    assert await db_session.scalar(select(func.count(AssetSourceRun.id))) == 0


@pytest.mark.parametrize("secret", ["", "   ", SecretStr(" ")])
def test_empty_credentials_are_not_configured(secret):
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        TOSS_CLIENT_ID="synthetic",
        TOSS_CLIENT_SECRET=secret,
    )
    assert settings.toss_client_secret is None


async def test_in_process_overlap_rejects_without_second_provider_call(
    db_session, monkeypatch
):
    collect = AsyncMock()
    monkeypatch.setattr(toss_service.toss_client, "collect", collect)
    async with toss_service._sync_lock:
        with pytest.raises(HTTPException) as caught:
            await toss_service.sync(db_session, TossSyncRequest())
    assert caught.value.status_code == 409 and caught.value.detail == "sync_in_progress"
    collect.assert_not_awaited()


async def test_pre_account_failure_after_success_keeps_existing_account_identity(
    db_session, monkeypatch
):
    await seed_bank(db_session)
    monkeypatch.setattr(
        toss_service.toss_client, "collect", AsyncMock(return_value=payload())
    )
    good = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    await reset_cooldown(db_session)
    monkeypatch.setattr(
        toss_service.toss_client,
        "collect",
        AsyncMock(side_effect=TossError("access_denied")),
    )
    failed = await toss_service.sync(db_session, TossSyncRequest())
    assert failed.status == "failed" and failed.mapping_connected
    selected = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert selected.accounts[0].selected_run_id == good.run_id
    assert selected.accounts[0].last_attempt_status == "failed"
    assert selected.investment_total == 150


@pytest.mark.parametrize("product_type", [None, "채권", "알 수 없음"])
async def test_stock_only_provider_cannot_confirm_unknown_or_bond_bank_group(
    db_session, monkeypatch, product_type
):
    await seed_bank(db_session, product_type=product_type)
    monkeypatch.setattr(
        toss_service.toss_client, "collect", AsyncMock(return_value=payload())
    )
    result = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    assert result.status == "success_complete"
    assert result.error_code == "unsupported_holdings_scope"
    assert not result.mapping_connected
    assert await db_session.scalar(select(func.count(AssetSourceMapping.id))) == 0
    selected = await select_investments(
        db_session, policy=SourcePolicy(investment_source="toss_securities_api")
    )
    assert selected.investment_total == 100
    assert selected.accounts[0].effective_source == "banksalad_snapshot"


@pytest.mark.parametrize("product_type", [None, "채권", "알 수 없음"])
async def test_new_unsupported_bank_snapshot_disables_existing_stock_only_replacement(
    db_session, monkeypatch, product_type
):
    await seed_bank(db_session)
    monkeypatch.setattr(
        toss_service.toss_client, "collect", AsyncMock(return_value=payload())
    )
    good = await toss_service.sync(
        db_session, TossSyncRequest(confirm_single_account_mapping=True)
    )
    assert good.mapping_connected
    policy = SourcePolicy(investment_source="toss_securities_api")
    before = await select_investments(db_session, policy=policy)
    assert before.investment_total == 150
    assert before.accounts[0].selected_run_id == good.run_id

    # A previously confirmed broker identity does not confirm future product scope.
    await seed_bank(db_session, product_type=product_type, days_ago=0)
    after = await select_investments(db_session, policy=policy)
    assert after.investment_total == 100
    assert after.accounts[0].effective_source == "banksalad_snapshot"
    assert after.accounts[0].fallback_reason == "unsupported_holdings_scope"
    assert "unsupported_holdings_scope" in after.accounts[0].conflicts
    assert after.accounts[0].selected_run_id != good.run_id
    assert await db_session.scalar(select(func.count(AssetSourceMapping.id))) == 1
    assert await db_session.scalar(select(func.sum(Investment.market_value))) == 200
    assert (
        await db_session.get(AssetSourceRun, good.run_id)
    ).status == "success_complete"
