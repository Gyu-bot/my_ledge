"""Manual, authenticated collection; append observations without changing policy."""

import asyncio
from datetime import datetime, timezone
import math

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.asset_source import (
    AssetSourceMapping,
    AssetSourceRun,
    AssetSourceObservation,
)
from app.models.investment import Investment
from app.schemas.asset_source import ExternalRunInput
from app.schemas.toss import TossAttempt, TossStatus, TossSyncRequest, TossSyncResponse
from app.services.asset_source_service import (
    TOSS,
    normalized,
    record_external_run,
    select_investments,
    utc,
    stock_scope_supported,
)
from app.services.toss_client import TossError, toss_client

_sync_lock = asyncio.Lock()
COOLDOWN = 60


def configured() -> bool:
    settings = get_settings()
    return bool(
        settings.toss_client_id
        and settings.toss_client_id.get_secret_value()
        and settings.toss_client_secret
        and settings.toss_client_secret.get_secret_value()
    )


async def latest_run(db):
    return await db.scalar(
        select(AssetSourceRun)
        .where(AssetSourceRun.source == TOSS)
        .order_by(AssetSourceRun.ingested_at.desc(), AssetSourceRun.id.desc())
        .limit(1)
    )


async def connected(db, run):
    if run is None:
        return False
    return bool(
        await db.scalar(
            select(AssetSourceMapping.id)
            .where(AssetSourceMapping.external_account_key == run.account_key)
            .limit(1)
        )
    )


def cooldown(run):
    if run is None:
        return 0
    return max(
        0,
        math.ceil(
            COOLDOWN
            - (datetime.now(timezone.utc) - utc(run.ingested_at)).total_seconds()
        ),
    )


async def get_status(db: AsyncSession) -> TossStatus:
    run = await latest_run(db)
    return TossStatus(
        configured=configured(),
        mapping_connected=await connected(db, run),
        cooldown_seconds=cooldown(run),
        last_attempt=TossAttempt(
            run_id=run.id,
            status=run.status,
            observed_at=utc(run.observed_at) if run.observed_at else None,
            ingested_at=utc(run.ingested_at),
            error_code=run.error,
        )
        if run
        else None,
    )


async def _confirm_mapping(db, run):
    current = await select_investments(db)
    groups = [a for a in current.accounts if normalized(a.broker) == "토스증권"]
    if len(groups) != 1:
        return "banksalad_toss_group_required"
    bank_run = await db.scalar(
        select(AssetSourceRun)
        .where(AssetSourceRun.account_key == groups[0].account_key)
        .order_by(
            AssetSourceRun.valuation_at.desc(),
            AssetSourceRun.ingested_at.desc(),
            AssetSourceRun.id.desc(),
        )
        .limit(1)
    )
    if bank_run:
        observations = (
            await db.scalars(
                select(AssetSourceObservation).where(
                    AssetSourceObservation.run_id == bank_run.id,
                    AssetSourceObservation.kind == "investment",
                )
            )
        ).all()
        types = [o.payload.get("product_type") for o in observations]
    else:
        investments = (
            await db.scalars(
                select(Investment).where(
                    Investment.snapshot_date == current.banksalad_snapshot_date
                )
            )
        ).all()
        types = [
            i.product_type for i in investments if normalized(i.broker) == "토스증권"
        ]
    if not stock_scope_supported(types):
        return "unsupported_holdings_scope"
    existing = list(
        (
            await db.scalars(
                select(AssetSourceMapping).where(
                    (AssetSourceMapping.account_key == groups[0].account_key)
                    | (AssetSourceMapping.external_account_key == run.account_key)
                )
            )
        ).all()
    )
    if existing:
        if (
            len(existing) == 1
            and existing[0].account_key == groups[0].account_key
            and existing[0].external_account_key == run.account_key
        ):
            return None
        return "account_mapping_conflict"
    db.add(
        AssetSourceMapping(
            account_key=groups[0].account_key,
            external_account_key=run.account_key,
            asset_components=[],
            cash_scope="holdings_only",
            reason="사용자가 단일 토스 계좌와 뱅샐 토스증권 그룹의 동일성 및 국내·미국 주식 범위를 확인함",
        )
    )
    await db.flush()
    return None


async def sync(db: AsyncSession, request: TossSyncRequest) -> TossSyncResponse:
    if not configured():
        raise HTTPException(503, "credentials_not_configured")
    if _sync_lock.locked():
        raise HTTPException(409, "sync_in_progress")
    async with _sync_lock:
        # Prevent concurrent syncs across workers sharing a PostgreSQL DB. Keep
        # token ownership to one process; the deployment guide documents this.
        if db.bind and db.bind.dialect.name == "postgresql":
            locked = await db.scalar(
                text("SELECT pg_try_advisory_xact_lock(19790124, 19019)")
            )
            if not locked:
                await db.rollback()
                raise HTTPException(409, "sync_in_progress")
        last = await latest_run(db)
        if cooldown(last):
            await db.rollback()
            raise HTTPException(409, "sync_cooldown")
        settings = get_settings()
        try:
            payload = await asyncio.wait_for(
                toss_client.collect(
                    settings.toss_client_id, settings.toss_client_secret
                ),
                timeout=35,
            )
        except (TossError, TimeoutError) as exc:
            now = datetime.now(timezone.utc)
            payload = ExternalRunInput(
                account_key=last.account_key if last else "toss:connection",
                valuation_at=now,
                status="failed",
                holdings=[],
                error=exc.code if isinstance(exc, TossError) else "network_timeout",
                provenance={"valuation_time_basis": "observation_proxy"},
            )
        run = await record_external_run(db, payload)
        mapping_error = None
        if (
            request.confirm_single_account_mapping
            and payload.status == "success_complete"
        ):
            mapping_error = await _confirm_mapping(db, run)
        is_connected = await connected(db, run)
        await db.commit()
        return TossSyncResponse(
            run_id=run.id,
            status=payload.status,
            holdings_count=len(payload.holdings),
            mapping_connected=is_connected,
            error_code=payload.error or mapping_error,
            observed_at=payload.observed_at,
        )
