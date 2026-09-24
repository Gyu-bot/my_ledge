"""Preserve source observations and version account source selection."""

import hashlib
import json
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, time, timezone

import sqlalchemy as sa
from alembic import op

revision = "20260924_0031"
down_revision = "20260627_0030"
branch_labels = None
depends_on = None


def _key(prefix, value):
    normalized = "".join(unicodedata.normalize("NFKC", value).casefold().split())
    return prefix + hashlib.sha256(normalized.encode()).hexdigest()[:24]


def _backfill():
    bind = op.get_bind()
    metadata = sa.MetaData()
    tables = {
        name: sa.Table(name, metadata, autoload_with=bind)
        for name in (
            "asset_snapshots",
            "investments",
            "loans",
            "asset_source_runs",
            "asset_source_observations",
        )
    }
    dates = defaultdict(lambda: defaultdict(list))
    for kind, name in (
        ("asset", "asset_snapshots"),
        ("investment", "investments"),
        ("loan", "loans"),
    ):
        for row in bind.execute(sa.select(tables[name]).order_by(tables[name].c.id)):
            payload = dict(row._mapping)
            dates[payload["snapshot_date"]][kind].append(payload)
    brokers = {}
    now = datetime.now(timezone.utc)

    def ingestion(rows, fallback):
        values = [r["created_at"] for r in rows if r.get("created_at")]
        return max(values) if values else fallback

    def run(snapshot_date, key, broker, ingested_at):
        result = bind.execute(
            tables["asset_source_runs"]
            .insert()
            .values(
                source="banksalad_snapshot",
                account_key=key,
                broker=broker,
                status="success_complete",
                valuation_at=datetime.combine(snapshot_date, time.min, timezone.utc),
                observed_at=None,
                ingested_at=ingested_at,
                snapshot_date=snapshot_date,
                currency="KRW",
                cash_included=False,
            )
        )
        return result.inserted_primary_key[0]

    def observation(run_id, kind, canonical_key, row, lifecycle, instrument=None):
        bind.execute(
            tables["asset_source_observations"]
            .insert()
            .values(
                run_id=run_id,
                kind=kind,
                canonical_key=canonical_key,
                instrument_key=instrument,
                lifecycle_status=lifecycle,
                payload=json.loads(json.dumps(row, default=str, ensure_ascii=False)),
            )
        )

    for snapshot_date, kinds in sorted(dates.items()):
        date_ingested = ingestion([r for rows in kinds.values() for r in rows], now)
        groups = defaultdict(list)
        for row in kinds["investment"]:
            key = _key("banksalad:broker:", row["broker"])
            brokers.setdefault(key, row["broker"])
            groups[key].append(row)
        # An empty group is positive evidence of omission in a later full snapshot.
        for key, broker in brokers.items():
            rows = groups[key]
            run_id = run(snapshot_date, key, broker, ingestion(rows, date_ingested))
            counts = Counter(_key("name:", r["product_name"]) for r in rows)
            for row in rows:
                instrument = _key("name:", row["product_name"])
                observation(
                    run_id,
                    "investment",
                    f"{key}/{instrument}",
                    row,
                    "conflict" if counts[instrument] > 1 else "active",
                    instrument,
                )
        run_id = run(snapshot_date, "banksalad:snapshot", "", date_ingested)
        for kind in ("asset", "loan"):
            for index, row in enumerate(kinds[kind]):
                maturity = row.get("maturity_date")
                observation(
                    run_id,
                    kind,
                    f"banksalad:{kind}:{run_id}:{index}",
                    row,
                    "matured_candidate"
                    if maturity and maturity < snapshot_date
                    else "active",
                )


def upgrade():
    op.create_table(
        "asset_source_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("account_key", sa.String(180), nullable=False),
        sa.Column("broker", sa.String(100), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("valuation_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("snapshot_date", sa.Date(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("cash_balance", sa.Numeric(20, 2), nullable=True),
        sa.Column("cash_included", sa.Boolean(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_asset_source_runs_account_key", "asset_source_runs", ["account_key"]
    )
    op.create_table(
        "asset_source_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "run_id",
            sa.Integer(),
            sa.ForeignKey("asset_source_runs.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("canonical_key", sa.String(400), nullable=False),
        sa.Column("instrument_key", sa.String(180), nullable=True),
        sa.Column("lifecycle_status", sa.String(30), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index(
        "ix_asset_source_observations_run_id", "asset_source_observations", ["run_id"]
    )
    op.create_table(
        "asset_source_mappings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_key", sa.String(180), nullable=False, unique=True),
        sa.Column("external_account_key", sa.String(180), nullable=False, unique=True),
        sa.Column("asset_components", sa.JSON(), nullable=False),
        sa.Column("cash_scope", sa.String(30), nullable=False),
        sa.Column(
            "confirmed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("reason", sa.Text(), nullable=False),
    )
    op.create_table(
        "asset_source_policy_revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("policy", sa.JSON(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("actor", sa.String(50), nullable=False),
        sa.Column(
            "confirmed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    _backfill()


def downgrade():
    op.drop_table("asset_source_policy_revisions")
    op.drop_table("asset_source_mappings")
    op.drop_table("asset_source_observations")
    op.drop_table("asset_source_runs")
