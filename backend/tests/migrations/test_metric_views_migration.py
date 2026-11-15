"""The migration's frozen metric-view SQL must equal the runtime definitions.

Runs without PostgreSQL: both sides are compiled/loaded as text. If this fails,
a new migration is needed for the changed view definition (never edit 0035).
"""

import importlib.util
import re
from pathlib import Path
from types import ModuleType

from sqlalchemy.dialects import postgresql

from app.services.metric_views import METRIC_VIEWS, compile_view_sql

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "20261115_0035_metric_contract_views.py"
)


def _load_migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("_metric_views_0035", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _normalize(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


def test_frozen_metric_view_sql_matches_runtime_definitions() -> None:
    migration = _load_migration()
    frozen = dict(migration.METRIC_VIEW_SQL)

    assert list(frozen) == [view.name for view in METRIC_VIEWS]
    for view in METRIC_VIEWS:
        runtime = compile_view_sql(view.definition, postgresql.dialect())
        assert _normalize(frozen[view.name]) == _normalize(runtime), view.name


def test_legacy_aggregate_views_read_the_flow_lines_only() -> None:
    migration = _load_migration()
    for name, sql in migration.LEGACY_VIEW_SQL:
        if name == "vw_true_spendable_monthly":
            assert "FROM vw_monthly_cashflow" in sql
            continue
        assert "FROM vw_metric_flow_lines" in sql, name
        assert "FROM transactions" not in sql, name
        assert "FROM vw_transactions_effective" not in sql, name
