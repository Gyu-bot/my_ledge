"""Whole-account selection. Historical BankSalad tables are never rewritten here.

BankSalad has broker groups, not real account IDs. Only an explicit mapping can
assert that an external account covers the entire group and its asset component.
"""

import hashlib
import hmac
import json
import unicodedata
from collections import defaultdict
from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.asset_source import (
    AssetSourceMapping,
    AssetSourceObservation,
    AssetSourcePolicyRevision,
    AssetSourceRun,
)
from app.schemas.asset_source import (
    ExternalRunInput,
    SelectedInvestmentsResponse,
    SourceAccountStatus,
    SourceCoverageCounts,
    SourceHolding,
    SourceMappingRequest,
    SourceMappingResponse,
    SourcePolicy,
    SourcePolicyApplyRequest,
    SourcePolicyPreviewResponse,
    SourcePolicyResponse,
)

BANKSALAD = "banksalad_snapshot"
TOSS = "toss_securities_api"
EXCLUDED = {"hidden_by_user", "matured_confirmed", "replaced", "duplicate"}


def normalized(value: str) -> str:
    return "".join(unicodedata.normalize("NFKC", value).casefold().split())


def account_key(broker: str) -> str:
    return (
        "banksalad:broker:"
        + hashlib.sha256(normalized(broker).encode()).hexdigest()[:24]
    )


def instrument_key(name: str) -> str:
    return "name:" + hashlib.sha256(normalized(name).encode()).hexdigest()[:24]


def utc(value: datetime) -> datetime:
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def serializable(value):
    return json.loads(json.dumps(value, default=str, ensure_ascii=False))


async def preserve_banksalad(db: AsyncSession, snapshot_date: date, snapshots) -> None:
    """Append raw evidence before the legacy replace operation (same transaction)."""
    now = datetime.now(timezone.utc)
    # Date-only BankSalad valuation: do not invent intraday precision.
    valuation = datetime.combine(snapshot_date, time.min, timezone.utc)
    broker_rows = defaultdict(list)
    broker_names = {}
    for row in snapshots.investments:
        broker = str(row.get("broker") or "unknown")
        key = account_key(broker)
        broker_names.setdefault(key, broker)
        broker_rows[key].append(row)
    # Explicit empty groups supersede prior holdings at a later complete upload.
    prior_brokers = (
        await db.scalars(
            select(AssetSourceRun.broker)
            .where(
                AssetSourceRun.source == BANKSALAD,
                AssetSourceRun.account_key != "banksalad:snapshot",
            )
            .distinct()
        )
    ).all()
    for broker in prior_brokers:
        key = account_key(broker)
        broker_names.setdefault(key, broker)
        broker_rows.setdefault(key, [])
    for key, rows in broker_rows.items():
        broker = broker_names[key]
        run = AssetSourceRun(
            source=BANKSALAD,
            account_key=key,
            broker=broker,
            status="success_complete",
            valuation_at=valuation,
            ingested_at=now,
            snapshot_date=snapshot_date,
            currency="KRW",
            cash_included=False,
        )
        db.add(run)
        await db.flush()
        counts = defaultdict(int)
        for row in rows:
            counts[instrument_key(row["product_name"])] += 1
        for row in rows:
            instrument = instrument_key(row["product_name"])
            db.add(
                AssetSourceObservation(
                    run_id=run.id,
                    kind="investment",
                    canonical_key=f"{key}/{instrument}",
                    instrument_key=instrument,
                    lifecycle_status="conflict" if counts[instrument] > 1 else "active",
                    payload=serializable(row),
                )
            )
    run = AssetSourceRun(
        source=BANKSALAD,
        account_key="banksalad:snapshot",
        broker="",
        status="success_complete",
        valuation_at=valuation,
        ingested_at=now,
        snapshot_date=snapshot_date,
        currency="KRW",
        cash_included=False,
    )
    db.add(run)
    await db.flush()
    for kind, rows in (("asset", snapshots.asset_snapshots), ("loan", snapshots.loans)):
        for index, row in enumerate(rows):
            maturity = row.get("maturity_date")
            lifecycle = (
                "matured_candidate"
                if maturity and maturity < snapshot_date
                else "active"
            )
            db.add(
                AssetSourceObservation(
                    run_id=run.id,
                    kind=kind,
                    canonical_key=f"banksalad:{kind}:{run.id}:{index}",
                    lifecycle_status=lifecycle,
                    payload=serializable(row),
                )
            )


async def record_external_run(
    db: AsyncSession, payload: ExternalRunInput
) -> AssetSourceRun:
    """Internal future-adapter boundary. No public credential or ingestion endpoint."""
    now = datetime.now(timezone.utc)
    if utc(payload.valuation_at) > now:
        raise ValueError("future valuation is not allowed")
    if payload.observed_at and (
        payload.observed_at.tzinfo is None or utc(payload.observed_at) > now
    ):
        raise ValueError("observed_at must be a timezone-aware past timestamp")
    run = AssetSourceRun(
        source=TOSS,
        account_key=payload.account_key,
        broker="토스증권",
        valuation_at=utc(payload.valuation_at),
        observed_at=payload.observed_at,
        ingested_at=now,
        status=payload.status,
        currency="KRW",
        cash_balance=payload.cash_balance,
        cash_included=payload.cash_included,
        error=payload.error,
    )
    db.add(run)
    await db.flush()
    for holding in payload.holdings:
        db.add(
            AssetSourceObservation(
                run_id=run.id,
                kind="investment",
                canonical_key=f"{payload.account_key}/{holding.instrument_key}",
                instrument_key=holding.instrument_key,
                lifecycle_status="active",
                payload=holding.model_dump(mode="json"),
            )
        )
    await db.flush()
    return run


async def get_policy(
    db: AsyncSession, cutoff: datetime | None = None
) -> SourcePolicyResponse:
    query = select(AssetSourcePolicyRevision)
    if cutoff:
        query = query.where(AssetSourcePolicyRevision.confirmed_at <= cutoff)
    revision = await db.scalar(
        query.order_by(AssetSourcePolicyRevision.id.desc()).limit(1)
    )
    return SourcePolicyResponse(
        **(revision.policy if revision else {}), revision=revision.id if revision else 0
    )


async def _bank_groups(db, cutoff, snapshot_date=None):
    # Existing installs are backfilled by migration; fallback also supports legacy fixtures.
    legacy = (
        await db.scalars(
            select(Investment).where(Investment.snapshot_date <= cutoff.date())
        )
    ).all()
    groups = defaultdict(list)
    if legacy:
        latest = snapshot_date or max(row.snapshot_date for row in legacy)
        for row in legacy:
            if row.snapshot_date == latest:
                groups[account_key(row.broker)].append(row)
    return groups


async def select_investments(
    db: AsyncSession,
    *,
    policy: SourcePolicy | None = None,
    as_of_date: date | None = None,
) -> SelectedInvestmentsResponse:
    today = datetime.now(timezone.utc).date()
    if as_of_date and as_of_date > today:
        raise HTTPException(422, "as_of_date cannot be in the future")
    cutoff = (
        datetime.combine(as_of_date, time.max, timezone.utc)
        if as_of_date
        else datetime.now(timezone.utc)
    )
    if policy is None:
        effective = await get_policy(db)
        policy = SourcePolicy(**effective.model_dump(exclude={"revision"}))
    all_runs = list(
        (
            await db.scalars(
                select(AssetSourceRun).where(
                    AssetSourceRun.valuation_at <= cutoff,
                    # as_of_date is a valuation cutoff, not a known-at reconstruction.
                )
            )
        ).all()
    )
    observations = (
        list(
            (
                await db.scalars(
                    select(AssetSourceObservation).where(
                        AssetSourceObservation.run_id.in_([r.id for r in all_runs])
                    )
                )
            ).all()
        )
        if all_runs
        else []
    )
    by_run = defaultdict(list)
    for obs in observations:
        by_run[obs.run_id].append(obs)
    mappings = list((await db.scalars(select(AssetSourceMapping))).all())
    mapping_by_key = {m.account_key: m for m in mappings}
    bank_runs = defaultdict(list)
    external_runs = defaultdict(list)
    for run in all_runs:
        if run.account_key == "banksalad:snapshot":
            continue
        (bank_runs if run.source == BANKSALAD else external_runs)[
            run.account_key
        ].append(run)
    manifests = [
        r
        for r in all_runs
        if r.account_key == "banksalad:snapshot" and r.status == "success_complete"
    ]
    latest_bank_date = max((r.snapshot_date for r in manifests), default=None)
    legacy = await _bank_groups(db, cutoff, latest_bank_date)
    assets = list(
        (
            await db.scalars(
                select(AssetSnapshot).where(
                    AssetSnapshot.snapshot_date <= cutoff.date()
                )
            )
        ).all()
    )
    snapshot = max((a.snapshot_date for a in assets), default=None)
    if latest_bank_date is None and snapshot is not None:
        latest_bank_date = snapshot
        legacy = await _bank_groups(db, cutoff, latest_bank_date)
    keys = sorted(set(bank_runs) | set(legacy))
    assets = [a for a in assets if a.snapshot_date == snapshot]
    confirmed = (
        (
            sum(
                (a.amount for a in assets if a.side == "asset" and a.amount >= 0),
                Decimal(0),
            )
            - sum((a.amount for a in assets if a.side == "liability"), Decimal(0))
        )
        if snapshot
        else None
    )
    estimate = confirmed
    overrides = {o.account_key: o.source for o in policy.account_overrides}
    accounts, items, warnings = [], [], []
    selected_ids = set()
    dates = {snapshot} if snapshot else set()
    used_components = set()
    for key in keys:
        bank = sorted(
            bank_runs[key],
            key=lambda r: (utc(r.valuation_at), utc(r.ingested_at), r.id),
            reverse=True,
        )
        bank_run = next(
            (
                r
                for r in bank
                if r.status == "success_complete"
                and (latest_bank_date is None or r.snapshot_date == latest_bank_date)
            ),
            None,
        )
        old = legacy.get(key, [])
        broker = (
            bank_run.broker if bank_run else old[0].broker if old else bank[0].broker
        )
        configured = overrides.get(
            key,
            policy.investment_source if normalized(broker) == "토스증권" else BANKSALAD,
        )
        basis = (
            "account_override"
            if key in overrides
            else "investment_default"
            if normalized(broker) == "토스증권"
            else "global_default"
        )
        selected = bank_run
        fallback, conflicts = None, []
        mapping = mapping_by_key.get(key)
        external = sorted(
            external_runs.get(mapping.external_account_key, []) if mapping else [],
            key=lambda r: (utc(r.valuation_at), utc(r.ingested_at), r.id),
            reverse=True,
        )
        complete = next((r for r in external if r.status == "success_complete"), None)
        attempts = sorted(
            external, key=lambda r: (utc(r.ingested_at), r.id), reverse=True
        )
        if configured == TOSS:
            if not mapping:
                fallback = "account_mapping_required"
                conflicts.append("account_mapping_ambiguous")
            elif complete is None:
                fallback = "no_successful_complete_run"
                conflicts.append("missing_in_toss")
            else:
                selected = complete
                if attempts and attempts[0].status != "success_complete":
                    conflicts.append("latest_sync_" + attempts[0].status)
        effective_source = selected.source if selected else BANKSALAD if old else None
        selected_obs = (
            [
                o
                for o in by_run[selected.id]
                if o.kind == "investment" and o.lifecycle_status not in EXCLUDED
            ]
            if selected
            else []
        )
        if any(
            o.lifecycle_status in {"conflict", "needs_review"} for o in selected_obs
        ):
            conflicts.append("instrument_mapping_ambiguous")
        selected_ids.update(o.id for o in selected_obs)
        rows = (
            [(o.instrument_key, o.payload) for o in selected_obs]
            if selected
            else [
                (
                    instrument_key(o.product_name),
                    {"product_name": o.product_name, "market_value": o.market_value},
                )
                for o in old
            ]
        )
        account_items = [
            SourceHolding(
                account_key=key,
                instrument_key=i,
                product_name=p["product_name"],
                market_value=p.get("market_value"),
                currency=p.get("currency", "KRW"),
                source=effective_source,
            )
            for i, p in rows
        ]
        if any(item.market_value is None for item in account_items):
            conflicts.append("missing_valuation")
        if any(item.currency != "KRW" for item in account_items):
            conflicts.append("currency_mismatch")
        total = sum(
            (
                i.market_value
                for i in account_items
                if i.market_value is not None and i.currency == "KRW"
            ),
            Decimal(0),
        )
        valuation = (
            utc(selected.valuation_at)
            if selected
            else datetime.combine(old[0].snapshot_date, time.min, timezone.utc)
            if old
            else None
        )
        stale = (
            valuation is not None
            and (cutoff.date() - valuation.date()).days > policy.stale_after_days
        )
        if stale:
            conflicts.append("stale_comparison")
        if valuation:
            dates.add(valuation.date())
        if effective_source == TOSS:
            if bank_run and bank_run.valuation_at != selected.valuation_at:
                conflicts.append("different_valuation_dates")
            bank_values = (
                [
                    o.payload.get("market_value")
                    for o in by_run[bank_run.id]
                    if o.kind == "investment"
                ]
                if bank_run
                else []
            )
            if (
                bank_values
                and all(v is not None for v in bank_values)
                and sum((Decimal(str(v)) for v in bank_values), Decimal(0)) != total
            ):
                conflicts.append("value_difference")
            components = [
                (c["side"], c["category"], c["product_name"])
                for c in mapping.asset_components
            ]
            matches = [
                a for a in assets if (a.side, a.category, a.product_name) in components
            ]
            safe = (
                components
                and len(matches) == len(components)
                and len(set(components)) == len(components)
                and not (set(components) & used_components)
                and all(a.amount >= 0 for a in matches)
                and mapping.cash_scope != "unknown"
                and "instrument_mapping_ambiguous" not in conflicts
                and "missing_valuation" not in conflicts
                and "currency_mismatch" not in conflicts
                and (
                    mapping.cash_scope != "holdings_and_cash"
                    or (selected.cash_included and selected.cash_balance is not None)
                )
            )
            if safe:
                used_components.update(components)
                if estimate is not None:
                    estimate += (
                        total
                        + (
                            selected.cash_balance
                            if mapping.cash_scope == "holdings_and_cash"
                            else Decimal(0)
                        )
                        - sum((a.amount for a in matches), Decimal(0))
                    )
            else:
                estimate = None
                conflicts.append("net_worth_replacement_scope_unconfirmed")
        accounts.append(
            SourceAccountStatus(
                account_key=key,
                broker=broker,
                configured_source=configured,
                configured_source_basis=basis,
                effective_source=effective_source,
                selected_run_id=selected.id if selected else None,
                valuation_at=valuation,
                valuation_precision="date"
                if effective_source == BANKSALAD
                else "timestamp",
                ingested_at=utc(selected.ingested_at) if selected else None,
                observed_at=utc(selected.observed_at)
                if selected and selected.observed_at
                else None,
                last_success_at=next(
                    (
                        utc(r.ingested_at)
                        for r in attempts
                        if r.status == "success_complete"
                    ),
                    None,
                ),
                last_attempt_at=utc(attempts[0].ingested_at) if attempts else None,
                last_attempt_status=attempts[0].status if attempts else None,
                is_stale=stale,
                fallback_reason=fallback,
                conflicts=conflicts,
                holdings_count=len(account_items),
                market_value=total,
            )
        )
        items.extend(account_items)
    investment_observations = [o for o in observations if o.kind == "investment"]
    incomplete = any(
        set(a.conflicts)
        & {"missing_valuation", "currency_mismatch", "instrument_mapping_ambiguous"}
        for a in accounts
    )
    if incomplete:
        warnings.append("investment_total_incomplete")
        estimate = None
    mixed = len(dates) > 1
    if mixed:
        warnings.extend(
            ["mixed_valuation_dates", "unobserved_cross_account_transfers_possible"]
        )
    if any(a.effective_source == TOSS for a in accounts):
        warnings.append("current_estimate_not_confirmed_history_or_performance")
    if any(a.fallback_reason for a in accounts):
        warnings.append("configured_source_fallback")
    if any(a.conflicts for a in accounts):
        warnings.append("source_conflicts_require_review")
    if any(
        r.account_key not in {m.external_account_key for m in mappings}
        for runs in external_runs.values()
        for r in runs
    ):
        warnings.append("unmapped_external_accounts_excluded")
    return SelectedInvestmentsResponse(
        as_of_date=cutoff.date(),
        total_basis="valuation_cutoff_current_policy_not_known_at_history"
        if as_of_date
        else "selected_current_estimate_with_source_dates",
        banksalad_snapshot_date=snapshot,
        investment_total=sum((a.market_value for a in accounts), Decimal(0)),
        investment_total_complete=not incomplete,
        confirmed_net_worth=confirmed,
        estimated_net_worth=estimate,
        mixed_dates=mixed,
        warnings=warnings,
        accounts=accounts,
        items=items,
        coverage=SourceCoverageCounts(
            raw=len(investment_observations),
            selected=len(selected_ids),
            excluded=len(investment_observations) - len(selected_ids),
            confirmed=len(mappings),
            hidden=sum(o.lifecycle_status in EXCLUDED for o in investment_observations),
            conflicted=sum(bool(a.conflicts) for a in accounts),
            stale=sum(a.is_stale for a in accounts),
        ),
    )


async def validate_policy(db: AsyncSession, policy: SourcePolicy) -> None:
    current = await select_investments(db)
    accounts = {a.account_key: a for a in current.accounts}
    for override in policy.account_overrides:
        if override.account_key not in accounts:
            raise HTTPException(
                422,
                "unknown normalized account key; product-name keys are not accepted",
            )
        if (
            override.source == TOSS
            and normalized(accounts[override.account_key].broker) != "토스증권"
        ):
            raise HTTPException(422, "Toss source applies only to Toss broker groups")


async def preview_policy(
    db: AsyncSession, policy: SourcePolicy
) -> SourcePolicyPreviewResponse:
    await validate_policy(db, policy)
    current = await select_investments(db)
    proposed = await select_investments(db, policy=policy)
    revision = await get_policy(db)
    mapping_rows = list(
        (
            await db.scalars(select(AssetSourceMapping).order_by(AssetSourceMapping.id))
        ).all()
    )
    basis = {
        "revision": revision.revision,
        "policy": policy.model_dump(),
        "current": current.model_dump(mode="json"),
        "proposed": proposed.model_dump(mode="json"),
        "mappings": [
            {
                "id": m.id,
                "account": m.account_key,
                "external": m.external_account_key,
                "components": m.asset_components,
                "cash": m.cash_scope,
            }
            for m in mapping_rows
        ],
    }
    secret = get_settings().api_key
    if not secret:
        raise HTTPException(503, "API key must be configured before previewing changes")
    token = hmac.new(
        secret.encode(),
        json.dumps(basis, sort_keys=True, ensure_ascii=False).encode(),
        hashlib.sha256,
    ).hexdigest()
    delta = (
        proposed.estimated_net_worth - current.estimated_net_worth
        if proposed.estimated_net_worth is not None
        and current.estimated_net_worth is not None
        else None
    )
    return SourcePolicyPreviewResponse(
        policy=policy,
        current=current,
        proposed=proposed,
        net_worth_delta=delta,
        preview_token=token,
    )


async def apply_policy(
    db: AsyncSession, request: SourcePolicyApplyRequest
) -> SourcePolicyResponse:
    preview = await preview_policy(db, request.policy)
    if not hmac.compare_digest(preview.preview_token, request.preview_token):
        raise HTTPException(409, "source data or policy changed; preview again")
    revision = await get_policy(db)
    db.add(
        AssetSourcePolicyRevision(
            id=revision.revision + 1,
            policy=request.policy.model_dump(mode="json"),
            reason=request.reason,
            actor="api_key_user",
        )
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "policy changed; preview again") from exc
    return await get_policy(db)


async def list_mappings(db: AsyncSession) -> list[SourceMappingResponse]:
    rows = (
        await db.scalars(select(AssetSourceMapping).order_by(AssetSourceMapping.id))
    ).all()
    return [
        SourceMappingResponse(
            id=r.id,
            account_key=r.account_key,
            external_account_key=r.external_account_key,
            asset_components=r.asset_components,
            cash_scope=r.cash_scope,
            confirmed=True,
            reason=r.reason,
        )
        for r in rows
    ]


async def create_mapping(
    db: AsyncSession, payload: SourceMappingRequest
) -> SourceMappingResponse:
    current = await select_investments(db)
    account = next(
        (a for a in current.accounts if a.account_key == payload.account_key), None
    )
    if account is None or normalized(account.broker) != "토스증권":
        raise HTTPException(422, "mapping requires a known Toss BankSalad broker group")
    existing = await list_mappings(db)
    if any(
        m.account_key == payload.account_key
        or m.external_account_key == payload.external_account_key
        for m in existing
    ):
        raise HTTPException(
            409, "mapping already exists; ambiguous account replacement requires review"
        )
    component_keys = {tuple(c.model_dump().values()) for c in payload.asset_components}
    if len(component_keys) != len(payload.asset_components):
        raise HTTPException(422, "duplicate asset components")
    if any(
        component_keys & {tuple(c.model_dump().values()) for c in m.asset_components}
        for m in existing
    ):
        raise HTTPException(409, "asset component is already mapped")
    row = AssetSourceMapping(
        account_key=payload.account_key,
        external_account_key=payload.external_account_key,
        asset_components=[c.model_dump() for c in payload.asset_components],
        cash_scope=payload.cash_scope,
        reason=payload.reason,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, "account mapping already exists") from exc
    return SourceMappingResponse(id=row.id, **payload.model_dump())
