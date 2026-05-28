from pathlib import Path


def test_unclassified_work_queue_requires_monthly_recurring_signal() -> None:
    migration = (
        Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "20260528_0017_tighten_unclassified_queue_recurring_signal.py"
    )

    sql = migration.read_text()
    needs_recurring_start = sql.index("if require_monthly_signal:")
    needs_recurring_end = sql.index("else:", needs_recurring_start)
    needs_recurring_sql = sql[needs_recurring_start:needs_recurring_end]

    assert "merchant_active_month_count >= 2" in needs_recurring_sql
    assert "merchant_active_date_count >= 2" in needs_recurring_sql
    assert "merchant_amount_cv <= 0.5" in needs_recurring_sql
    assert "merchant_expense_count >= 2" not in needs_recurring_sql
