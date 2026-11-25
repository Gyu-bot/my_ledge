"""The newest migration's frozen metric-view SQL must equal the runtime definitions.

Runs without PostgreSQL: both sides are compiled/loaded as text. If this fails,
a new migration is needed for the changed view definition (never edit a
released migration). 0035 froze the T054 layer; 0038 (T056) supersedes it and
its downgrade restores 0035 exactly, so 0035 must stay byte-for-byte frozen.
0039 (T061) supersedes 0038 and its downgrade restores 0038 exactly, so 0038
is pinned the same way.
"""

import hashlib
import importlib.util
import json
import re
from pathlib import Path
from types import ModuleType

from sqlalchemy.dialects import postgresql

from app.services.metric_views import METRIC_VIEWS, compile_view_sql

VERSIONS = Path(__file__).resolve().parents[2] / "alembic" / "versions"
T054_MIGRATION = VERSIONS / "20261115_0035_metric_contract_views.py"
T056_MIGRATION = VERSIONS / "20261115_0038_nature_axes_metric_views.py"
LEGACY_RETIREMENT_MIGRATION = (
    VERSIONS / "20261117_0041_retire_legacy_classification_views.py"
)
LATEST_METRIC_MIGRATION = VERSIONS / "20261125_0046_one_off_events.py"

# sha256 of 0035's frozen METRIC_VIEW_SQL + LEGACY_VIEW_SQL, recorded when 0038
# was written. 0038's downgrade recreates exactly this SQL.
T054_FROZEN_SHA256 = "dafcddca15255c1aaaa4e8435f5e3bdb0dcf18c795d578b52b4c35d84b99d668"
# sha256 of 0038's frozen METRIC_VIEW_SQL + work-queue SQL, recorded when 0039
# was written. 0039's downgrade recreates exactly this SQL.
T056_FROZEN_SHA256 = "4e6a6807bc810b9f6e64eb4b240b6266bb1c7ef2d860eaf36281ed217b7faac8"


def _load(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(f"_frozen_{path.stem}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _normalize(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


def test_frozen_metric_view_sql_matches_runtime_definitions() -> None:
    migration = _load(LATEST_METRIC_MIGRATION)
    frozen = dict(_load(LEGACY_RETIREMENT_MIGRATION).METRIC_VIEW_SQL)
    frozen.update(migration.AFTER_VIEWS)
    frozen["vw_transaction_nature"] = _load(
        VERSIONS / "20261117_0045_recurring_merchant_prefix.py"
    ).AFTER

    assert list(frozen) == [view.name for view in METRIC_VIEWS]
    for view in METRIC_VIEWS:
        runtime = compile_view_sql(view.definition, postgresql.dialect())
        assert _normalize(frozen[view.name]) == _normalize(runtime), view.name


def test_t054_frozen_views_are_unchanged() -> None:
    migration = _load(T054_MIGRATION)
    payload = json.dumps(
        [list(item) for item in migration.METRIC_VIEW_SQL]
        + [list(item) for item in migration.LEGACY_VIEW_SQL]
    )
    assert hashlib.sha256(payload.encode()).hexdigest() == T054_FROZEN_SHA256


def test_t056_frozen_views_are_unchanged() -> None:
    migration = _load(T056_MIGRATION)
    payload = json.dumps(
        [list(item) for item in migration.METRIC_VIEW_SQL]
        + [["vw_unclassified_work_queue", migration.UNCLASSIFIED_WORK_QUEUE_SQL]]
    )
    assert hashlib.sha256(payload.encode()).hexdigest() == T056_FROZEN_SHA256


def test_legacy_aggregate_views_read_the_flow_lines_only() -> None:
    migration = _load(T054_MIGRATION)
    for name, sql in migration.LEGACY_VIEW_SQL:
        if name == "vw_true_spendable_monthly":
            assert "FROM vw_monthly_cashflow" in sql
            continue
        assert "FROM vw_metric_flow_lines" in sql, name
        assert "FROM transactions" not in sql, name
        assert "FROM vw_transactions_effective" not in sql, name


def test_metric_views_read_the_two_axis_tables() -> None:
    frozen = _load(LATEST_METRIC_MIGRATION).AFTER_VIEWS
    nature = _load(VERSIONS / "20261117_0045_recurring_merchant_prefix.py").AFTER
    for table in (
        "transaction_nature_overrides",
        "recurring_commitments",
        "category_adjustability_defaults",
    ):
        assert table in nature
    flow_lines = frozen["vw_metric_flow_lines"]
    assert "vw_transaction_nature" in flow_lines
    # Old columns are carried for the legacy views but never decide an axis.
    axes_part = flow_lines.split("FROM", 1)[0]
    assert "cost_kind =" not in flow_lines and "necessity =" not in flow_lines
    assert "payment_form" in axes_part


def test_work_queue_no_longer_asks_recurring_kind() -> None:
    # 0039 recreates the 0038 work queue unchanged.
    queue = _load(T056_MIGRATION).UNCLASSIFIED_WORK_QUEUE_SQL
    assert "FALSE AS needs_recurring_payment_kind" in queue
    where = queue.rsplit("WHERE", 1)[1]
    assert "needs_recurring_payment_kind" not in where
    # Superseded rows drop out with the effective-only nature view; installment
    # links fix both axes, so there is nothing to classify.
    assert "JOIN vw_transaction_nature n" in queue
    assert "n.installment_plan_id IS NULL" in queue


def test_t067_downgrade_uses_0045_flow_dependents():
    migration = _load(LATEST_METRIC_MIGRATION)
    prior = dict(_load(LEGACY_RETIREMENT_MIGRATION).UPGRADE_VIEWS)
    for name, sql in migration.BEFORE_VIEWS:
        assert sql == prior[name]
