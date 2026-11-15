"""Forecast backtest tool (T064 audit) on SQLite with the metric views."""

import asyncio
import json
from datetime import date, time
from pathlib import Path

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import AppSetting, Base, Transaction
from app.services.metric_views import metric_view_ddl
from app.services.monthly_projection_service import (
    RENAMED_PAYER_MISSING_REASON,
    get_monthly_projection,
)
from app.tools.forecast_backtest import (
    DATABASE_URL_ENV,
    BacktestConfig,
    BacktestError,
    _reason_codes,
    collect_points,
    database_url,
    main,
    read_only_session,
    render_markdown,
    run_backtest,
)
from forecast_backtest_ledger import PRIVATE_STRINGS, SALARY, build_backtest_ledger

COMPONENTS = (
    "income",
    "expense",
    "net",
    "net_after_known_remaining",
    "loan",
    "installment",
    "recurring",
    "variable",
)


async def test_regular_ledger_is_reproduced_exactly_at_every_as_of_day(db_session):
    await build_backtest_ledger(db_session)
    report = await run_backtest(db_session, BacktestConfig())
    assert report["evaluated"] == {
        "months": 7,
        "points": 35,
        "first_period": "2031-04",
        "last_period": "2031-10",
    }
    for component in COMPONENTS:
        for day in ("5", "10", "15", "20", "25", "all"):
            item = report["accuracy"][component][day]
            assert item["withheld"] == 0, (component, day)
            assert item["over"] == item["under"] == 0, (component, day)
            assert item["exact"] == item["evaluated"] == item["points"]
    assert report["consistency"]["observed_mismatch_points"] == 0
    assert report["consistency"]["component_sum_mismatch_points"] == 0
    double = report["special_cases"]["double_counting"]
    for kind in ("loan", "installment", "recurring"):
        assert double[kind]["all"]["observed_then_added_again"] == 0
        assert double[kind]["all"]["remaining_over_forecast"] == 0


async def test_backtest_calls_the_live_forecast_with_the_as_of_date(db_session):
    await build_backtest_ledger(db_session)
    points = await collect_points(db_session, BacktestConfig(as_of_days=(5, 25)))
    assert {point.as_of.day for point in points} == {5, 25}
    for point in points[:4]:
        assert point.projection == await get_monthly_projection(
            db_session, reference_date=point.as_of
        )
        assert point.projection.as_of_date == point.as_of


async def test_transactions_after_the_as_of_day_never_reach_the_forecast(db_session):
    await build_backtest_ledger(db_session)
    config = BacktestConfig(from_period="2031-06", to_period="2031-06")
    before = {point.day: point for point in await collect_points(db_session, config)}
    db_session.add(
        Transaction(
            date=date(2031, 6, 22),
            time=time(12),
            type="지출",
            merchant="Synthetic Late Purchase",
            description="Synthetic Late Purchase",
            category_major="쇼핑",
            amount=-50_000,
        )
    )
    await db_session.commit()
    after = {point.day: point for point in await collect_points(db_session, config)}
    for day in (5, 10, 15, 20):
        assert after[day].forecast == before[day].forecast
        assert after[day].projection == before[day].projection
        assert after[day].actual["expense"] == before[day].actual["expense"] + 50_000
    # Once dated on or before the as-of day the purchase is observed.
    assert after[25].observed["expense"] == before[25].observed["expense"] + 50_000


async def test_default_report_prints_no_amounts_or_names(db_session):
    await build_backtest_ledger(db_session)
    report = await run_backtest(db_session, BacktestConfig())
    rendered = [json.dumps(report, ensure_ascii=False), render_markdown(report)]
    for output in rendered:
        for private in PRIVATE_STRINGS:
            assert private not in output
    assert "points" not in report
    assert "signed_error_won" not in report["accuracy"]["net"]["all"]

    shown = await run_backtest(db_session, BacktestConfig(show_amounts=True))
    shown_json = json.dumps(shown, ensure_ascii=False)
    assert str(SALARY) in shown_json
    assert len(shown["points"]) == 35
    assert shown["accuracy"]["net"]["all"]["signed_error_won"]["median"] == 0
    for name in PRIVATE_STRINGS[4:]:  # names never, even with amounts
        assert name not in shown_json
        assert name not in render_markdown(shown)


async def test_unlinked_loan_repayments_are_counted_once(db_session):
    """T064 R1: an unlinked loan is not added on top of its variable history."""
    await build_backtest_ledger(db_session, link_loans=False)
    report = await run_backtest(db_session, BacktestConfig())
    loan = report["special_cases"]["double_counting"]["loan"]
    for day in ("5", "10", "15", "20", "25"):
        assert loan[day]["remaining_without_any_linked_actual_in_month"] == 0
        assert loan[day]["unavailable"] == 0
        assert loan[day]["not_in_expense_points"] == 7
        assert report["accuracy"]["net"][day]["exact"] == 7
    assert report["withheld_reasons"]["all"] == {}
    assert report["accuracy"]["net"]["all"]["withheld"] == 0
    assert report["consistency"]["component_sum_mismatch_points"] == 0


async def test_pre_payday_and_classification_sections(db_session):
    await build_backtest_ledger(db_session)
    report = await run_backtest(db_session, BacktestConfig())
    pre = report["special_cases"]["pre_payday_income"]["all"]
    assert pre["points"] == 35
    assert pre["forecast_includes_regular_income"] == 35
    assert pre["income_source_status_counts"] == {"expected": 35}
    assert pre["expected_remaining_income_pct_of_actual_remaining"]["median"] == 100
    bias = report["special_cases"]["classification_bias"]
    # Grocery rows have no necessity, so their whole amount is undecided.
    assert bias["month_undecided_adjustability_share_pct"]["median"] > 0
    # Only the grocery tail of the remaining assumption is undecided.
    assert 0 < bias["forecast_remaining_undecided_share_pct"]["median"] < 100
    assert bias["month_unlinked_commitment_like_share_pct"]["median"] == 0
    assert set(bias["by_unlinked_commitment_like_share"]) == {"0%"}
    codes = {item["code"] for item in report["limitations"]}
    assert {
        "classification_current_state",
        "loan_snapshot_unavailable_at_as_of",
        "links_created_after_transaction_month",
        "installment_plan_status_current",
        "income_expectation_settings_current",
    } <= codes


async def test_payer_rename_reason_has_its_own_code(db_session):
    projection = await get_monthly_projection(
        db_session, reference_date=date(2031, 7, 20)
    )
    projection = projection.model_copy(
        update={"missing_reasons": [RENAMED_PAYER_MISSING_REASON]}
    )
    assert _reason_codes(projection) == ["income_source_possible_payer_rename"]


def test_database_url_errors_never_echo_the_url():
    with pytest.raises(BacktestError) as error:
        database_url("mysql://reader:very-secret@db.invalid/ledger")
    assert "very-secret" not in str(error.value)
    assert "db.invalid" not in str(error.value)
    assert database_url("postgresql://u:p@127.0.0.1/x").drivername == (
        "postgresql+asyncpg"
    )


async def _sqlite_ledger(path: Path) -> str:
    url = f"sqlite+aiosqlite:///{path}"
    engine = create_async_engine(url)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        for statement in metric_view_ddl(connection.dialect):
            await connection.exec_driver_sql(statement)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        await build_backtest_ledger(session)
    await engine.dispose()
    return url


async def test_read_only_session_refuses_writes_on_sqlite(tmp_path):
    url = await _sqlite_ledger(tmp_path / "ledger.db")
    async with read_only_session(url) as session:
        assert (await session.execute(text("PRAGMA query_only"))).scalar() == 1
        report = await run_backtest(session, BacktestConfig(as_of_days=(5,)))
        assert report["evaluated"]["points"] == 7
        session.add(AppSetting(scope="x", key="y", value="z"))
        with pytest.raises(BacktestError):
            await session.flush()
        session.expunge_all()
        with pytest.raises(OperationalError, match="readonly"):
            await session.execute(
                text(
                    "INSERT INTO app_settings (scope, key, value, created_at, updated_at)"
                    " VALUES ('x', 'y', 'z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
                )
            )
    engine = create_async_engine(url)
    async with AsyncSession(engine) as check:
        assert await check.scalar(select(func.count()).select_from(AppSetting)) == 0
    await engine.dispose()


def test_cli_writes_json_and_markdown(tmp_path, monkeypatch, capsys):
    url = asyncio.run(_sqlite_ledger(tmp_path / "ledger.db"))
    monkeypatch.delenv(DATABASE_URL_ENV, raising=False)
    assert main(["--format", "json"]) == 2
    monkeypatch.setenv(DATABASE_URL_ENV, url)
    output = tmp_path / "report.json"
    assert main(["--format", "json", "--days", "5,20", "--output", str(output)]) == 0
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["config"]["as_of_days"] == [5, 20]
    assert report["evaluated"]["points"] == 14
    capsys.readouterr()
    assert main(["--format", "markdown", "--from-period", "2031-09"]) == 0
    markdown = capsys.readouterr().out
    assert markdown.startswith("# 월말 순현금흐름 전망 되짚기 결과")
    assert "2031-09 ~ 2031-10" in markdown
    for private in PRIVATE_STRINGS:
        assert private not in markdown
