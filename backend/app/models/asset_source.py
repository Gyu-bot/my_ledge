"""Append-only source evidence, account mappings, and versioned selection policy."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AssetSourceRun(Base):
    __tablename__ = "asset_source_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40))
    account_key: Mapped[str] = mapped_column(String(180), index=True)
    broker: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30))
    valuation_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    snapshot_date: Mapped[date | None] = mapped_column(Date)
    currency: Mapped[str] = mapped_column(String(3), default="KRW")
    cash_balance: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    cash_included: Mapped[bool] = mapped_column(default=False)
    error: Mapped[str | None] = mapped_column(Text)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")


class AssetSourceObservation(Base):
    __tablename__ = "asset_source_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("asset_source_runs.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    canonical_key: Mapped[str] = mapped_column(String(400))
    instrument_key: Mapped[str | None] = mapped_column(String(180))
    lifecycle_status: Mapped[str] = mapped_column(String(30), default="active")
    payload: Mapped[dict] = mapped_column(JSON)


class AssetSourceMapping(Base):
    __tablename__ = "asset_source_mappings"
    id: Mapped[int] = mapped_column(primary_key=True)
    account_key: Mapped[str] = mapped_column(String(180), unique=True)
    external_account_key: Mapped[str] = mapped_column(String(180), unique=True)
    asset_components: Mapped[list] = mapped_column(JSON, default=list)
    cash_scope: Mapped[str] = mapped_column(String(30))
    confirmed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reason: Mapped[str] = mapped_column(Text)


class AssetSourcePolicyRevision(Base):
    __tablename__ = "asset_source_policy_revisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    policy: Mapped[dict] = mapped_column(JSON)
    reason: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(50), default="api_key_user")
    confirmed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
