"""Execute the real migration against a private in-memory database."""

import importlib.util
from datetime import date, datetime
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models import Base
from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan


def _migration():
    path = (
        Path(__file__).resolve().parents[2]
        / "alembic/versions/20260924_0031_asset_source_selection.py"
    )
    spec = importlib.util.spec_from_file_location("asset_source_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _legacy_schema(connection):
    metadata = sa.MetaData()
    for model in (AssetSnapshot, Investment, Loan):
        model.__table__.to_metadata(metadata)
    metadata.create_all(connection)
    return metadata.tables


def _read(connection, name):
    table = sa.Table(name, sa.MetaData(), autoload_with=connection)
    return list(connection.execute(sa.select(table).order_by(table.c.id)).mappings())


def test_backfill_preserves_evidence_dates_conflicts_and_empty_accounts():
    migration = _migration()
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        tables = _legacy_schema(connection)
        first, second = date(2026, 4, 1), date(2026, 5, 1)
        first_ingested = datetime(2026, 4, 3, 10, 30)
        second_ingested = datetime(2026, 5, 5, 9, 15)
        connection.execute(
            tables["investments"].insert(),
            [
                dict(
                    snapshot_date=first,
                    broker="토스 증권",
                    product_name="ＡＢＣ",
                    cost_basis="80.50",
                    market_value="100.25",
                    created_at=first_ingested,
                ),
                dict(
                    snapshot_date=first,
                    broker="토스증권",
                    product_name="abc",
                    cost_basis="70.50",
                    market_value="90.25",
                    created_at=first_ingested,
                ),
            ],
        )
        connection.execute(
            tables["asset_snapshots"].insert(),
            [
                dict(
                    snapshot_date=first,
                    side="asset",
                    category="투자",
                    product_name="증권",
                    amount="190.50",
                    created_at=first_ingested,
                ),
                dict(
                    snapshot_date=second,
                    side="asset",
                    category="예금",
                    product_name="예금",
                    amount="190.50",
                    created_at=second_ingested,
                ),
            ],
        )
        connection.execute(
            tables["loans"].insert(),
            dict(
                snapshot_date=first,
                lender="은행",
                product_name="만기대출",
                balance="25.10",
                maturity_date=date(2026, 3, 31),
                created_at=first_ingested,
            ),
        )
        before = {name: _read(connection, name) for name in tables}
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        runs = _read(connection, "asset_source_runs")
        observations = _read(connection, "asset_source_observations")
        broker_runs = [r for r in runs if r["account_key"] != "banksalad:snapshot"]
        assert len(runs) == 4
        assert len(broker_runs) == 2
        assert len({r["account_key"] for r in broker_runs}) == 1
        assert broker_runs[0]["account_key"].startswith("banksalad:broker:")
        assert len(broker_runs[0]["account_key"].split(":")[-1]) == 24
        assert broker_runs[0]["valuation_at"] == datetime(2026, 4, 1)
        assert broker_runs[0]["ingested_at"] == first_ingested
        assert broker_runs[1]["ingested_at"] == second_ingested
        assert all(r["observed_at"] is None and not r["cash_included"] for r in runs)
        assert all(r["status"] == "success_complete" for r in runs)
        assert not any(o["run_id"] == broker_runs[1]["id"] for o in observations)
        holdings = [o for o in observations if o["kind"] == "investment"]
        assert len(holdings) == 2
        assert len({o["canonical_key"] for o in holdings}) == 1
        assert all(o["lifecycle_status"] == "conflict" for o in holdings)
        assert holdings[0]["payload"]["market_value"] == "100.25"
        loan = next(o for o in observations if o["kind"] == "loan")
        assert loan["lifecycle_status"] == "matured_candidate"
        assert loan["payload"]["maturity_date"] == "2026-03-31"
        assert {name: _read(connection, name) for name in tables} == before
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert set(sa.inspect(connection).get_table_names()) == set(tables)
        assert {name: _read(connection, name) for name in tables} == before
    engine.dispose()


def test_empty_database_schema_matches_models():
    migration = _migration()
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        _legacy_schema(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        inspector = sa.inspect(connection)
        for name in (
            "asset_source_runs",
            "asset_source_observations",
            "asset_source_mappings",
            "asset_source_policy_revisions",
        ):
            model = Base.metadata.tables[name]
            actual = {c["name"]: c for c in inspector.get_columns(name)}
            assert set(actual) == set(model.columns.keys())
            for column in model.columns:
                assert actual[column.name]["nullable"] == column.nullable
                assert str(actual[column.name]["type"]) == str(column.type)
            expected_unique = {
                tuple(c.columns.keys())
                for c in model.constraints
                if isinstance(c, sa.UniqueConstraint)
            }
            assert {
                tuple(c["column_names"]) for c in inspector.get_unique_constraints(name)
            } == expected_unique
            assert {tuple(i["column_names"]) for i in inspector.get_indexes(name)} == {
                tuple(i.columns.keys()) for i in model.indexes
            }
            assert _read(connection, name) == []
        assert (
            inspector.get_foreign_keys("asset_source_observations")[0]["referred_table"]
            == "asset_source_runs"
        )
    engine.dispose()
