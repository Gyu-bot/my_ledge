"""T061 migration 0039: frozen SQL equals the runtime definitions.

Runs without PostgreSQL (text only). The metric chain part is covered by
``test_metric_views_migration.py``; this module covers the snapshot-side
views and the shape guarantees 0039 makes for existing view columns.
"""

import importlib.util
import re
from pathlib import Path
from types import ModuleType

from sqlalchemy.dialects.postgresql.asyncpg import dialect as asyncpg_dialect

from app.services.metric_views import (
    FLOW_LINES_DEFINITION,
    MONTHLY_FLOW_SUMMARY_DEFINITION,
    compile_view_sql,
)
from app.services.net_worth_views import NET_WORTH_VIEWS

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
T061_MIGRATION = VERSIONS / "20261116_0039_transfer_purpose_net_worth_views.py"
T056_MIGRATION = VERSIONS / "20261115_0038_nature_axes_metric_views.py"


def _load(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(f"_frozen_{path.stem}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _normalize(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


def test_frozen_net_worth_view_sql_matches_runtime_definitions() -> None:
    frozen = dict(_load(T061_MIGRATION).NET_WORTH_VIEW_SQL)
    assert list(frozen) == [view.name for view in NET_WORTH_VIEWS]
    for view in NET_WORTH_VIEWS:
        runtime = compile_view_sql(view.definition, asyncpg_dialect())
        assert _normalize(frozen[view.name]) == _normalize(runtime), view.name
        assert "%%" not in frozen[view.name]


def _top_level_columns(sql: str) -> list[str]:
    """Output column names of a compiled ``SELECT ... FROM`` (depth-aware)."""
    head = sql.strip().removeprefix("SELECT ").split("\nFROM", 1)[0]
    items, depth, current = [], 0, ""
    for char in head:
        depth += char == "("
        depth -= char == ")"
        if char == "," and depth == 0:
            items.append(current.strip())
            current = ""
        else:
            current += char
    items.append(current.strip())
    names = []
    for item in items:
        match = re.search(r"(?: AS |\.)(\w+)$", item)
        assert match is not None, item
        names.append(match.group(1))
    return names


def test_existing_view_columns_keep_their_position() -> None:
    """New flow columns are appended; every 0038 column keeps its place."""
    t056 = dict(_load(T056_MIGRATION).METRIC_VIEW_SQL)
    t061 = dict(_load(T061_MIGRATION).METRIC_VIEW_SQL)
    assert list(t061) == [
        *list(t056)[:3],
        "vw_transfer_purpose",
        *list(t056)[3:],
    ]
    for name in t056:
        if name in ("vw_metric_flow_lines", "vw_monthly_flow_summary"):
            continue
        assert _normalize(t056[name]) == _normalize(t061[name]), name

    old_columns = _top_level_columns(t056["vw_metric_flow_lines"])
    new_columns = [column.name for column in FLOW_LINES_DEFINITION.selected_columns]
    assert new_columns[: len(old_columns)] == old_columns
    assert new_columns[len(old_columns) :] == [
        "transfer_purpose",
        "transfer_purpose_source",
    ]
    summary = [c.name for c in MONTHLY_FLOW_SUMMARY_DEFINITION.selected_columns]
    assert summary[-7:] == [
        "transfer_investment_net",
        "transfer_savings_net",
        "transfer_investment_savings_net",
        "transfer_internal_move_net",
        "transfer_undecided_net",
        "transfer_undecided_activity_total",
        "month_status",
    ]
