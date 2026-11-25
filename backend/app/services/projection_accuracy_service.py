"""Recent closed-month replay error of the month-end forecast (T064 R12).

The production forecast (``get_monthly_projection``) is replayed at a few
in-month as-of days of the most recent closed months before the forecast
month and compared with those months' monthly-flow actuals
(``vw_metric_flow_lines``). Read-only: nothing is stored or cached. The window
is bounded (``ACCURACY_MONTHS`` x ``ACCURACY_DAYS`` replays), and the result is
grouped by as-of day band with medians and point counts, so accuracy is shown
as measured error instead of a confidence grade alone.

Same replay limits as ``app.tools.forecast_backtest``: classifications, links,
installment plan status and income expectations are their current values, and
every transaction dated on or before an as-of day is assumed known then.
"""

from datetime import date
from statistics import median

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.income_projection import (
    MonthlyProjection,
    ProjectionAccuracy,
    ProjectionAccuracyActual,
    ProjectionAccuracyBand,
)
from app.services.metric_views import (
    FLOW_LINES_VIEW,
    flow_summary_columns,
)
from app.services.monthly_projection_service import (
    _month_end,
    _period,
    _shift_month,
    covered_evaluation_periods,
    get_monthly_projection,
)

ACCURACY_MONTHS = 3
ACCURACY_DAYS = (5, 10, 15, 20, 25)
BANDS = (
    ("day_01_10", 1, 10),
    ("day_11_20", 11, 20),
    ("day_21_31", 21, 31),
)
DEFINITION = (
    "최근 마감월(전망 월 직전 최대 3개월)마다 5·10·15·20·25일을 기준일로 같은 전망 코드를 "
    "다시 돌려, 월말 순현금흐름 전망과 그 달 흐름표 잔여(residual)를 비교한 오차. "
    "첫 부분월과 거래 관측 공백이 있는 달, 자료가 월말에 닿지 않은 최근 월은 제외한다. "
    "부호 오차 = 전망 - 실제(양수 = 과대 전망), 원 단위 중앙값. 보류된 점은 오차에서 빼고 "
    "점 수로만 센다."
)
LIMITATIONS = [
    "현재 일회성 묶음 소속으로 과거를 재생함. 일회성은 관측 변동 실적에 포함하고 남은 지출 가정에서 제외함",
    "분류·조정 가능성·대출·할부 연결·할부 계획 상태·수입 예상 설정은 이력이 없어 현재 값으로 재생함",
    "기준일 이전 날짜의 거래는 그때 이미 알려졌다고 가정함(업로드 지연 미반영)",
    "마감월이 적거나 이력이 짧으면 점이 적고, 점이 적은 중앙값은 대표성이 낮음",
]


def _band(day: int) -> str:
    return next(name for name, low, high in BANDS if low <= day <= high)


def _median(values: list[float]) -> float | None:
    return median(values) if values else None


async def _actual_month(
    db_session: AsyncSession, start: date, end: date
) -> dict[str, int]:
    lines = FLOW_LINES_VIEW
    row = (
        (
            await db_session.execute(
                select(*flow_summary_columns(lines)).where(
                    lines.c.date >= start, lines.c.date <= end
                )
            )
        )
        .mappings()
        .one()
    )
    return {
        "income": int(row["income_total"] or 0),
        "expense": int(row["total_outflow"] or 0),
        "net": int(row["residual"] or 0),
        "variable_ongoing_actual": int(
            row["total_outflow"] - row["committed_total"] - row["one_off_total"]
        ),
    }


async def get_projection_accuracy(
    db_session: AsyncSession,
    *,
    reference_date: date,
    months: int = ACCURACY_MONTHS,
    days: tuple[int, ...] = ACCURACY_DAYS,
) -> ProjectionAccuracy:
    month_start = reference_date.replace(day=1)
    periods = await covered_evaluation_periods(
        db_session,
        [
            _period(_shift_month(month_start, -offset))
            for offset in range(months, 0, -1)
        ],
        reference_date=reference_date,
    )
    actuals: list[ProjectionAccuracyActual] = []
    points: list[tuple[int, MonthlyProjection, dict[str, int]]] = []
    for period in periods:
        start = date.fromisoformat(f"{period}-01")
        end = _month_end(start)
        actual = await _actual_month(db_session, start, end)
        actuals.append(
            ProjectionAccuracyActual(
                period=period,
                variable_ongoing_actual=actual["variable_ongoing_actual"],
            )
        )
        for day in days:
            if day > end.day:
                continue
            projection = await get_monthly_projection(
                db_session, reference_date=start.replace(day=day)
            )
            points.append((day, projection, actual))
    bands: list[ProjectionAccuracyBand] = []
    for name, low, high in BANDS:
        members = [item for item in points if low <= item[0] <= high]
        if not members:
            continue
        net_errors = [
            projection.projected_month_end_net - actual["net"]
            for _, projection, actual in members
            if projection.projected_month_end_net is not None
        ]
        expense_errors = [
            projection.projected_month_expense - actual["expense"]
            for _, projection, actual in members
            if projection.projected_month_expense is not None
        ]
        of_income = [
            (projection.projected_month_end_net - actual["net"])
            / actual["income"]
            * 100
            for _, projection, actual in members
            if projection.projected_month_end_net is not None and actual["income"] > 0
        ]
        signed = _median([float(value) for value in net_errors])
        absolute = _median([float(abs(value)) for value in net_errors])
        expense = _median([float(value) for value in expense_errors])
        pct = _median(of_income)
        bands.append(
            ProjectionAccuracyBand(
                band=name,  # type: ignore[arg-type]
                as_of_days=sorted({item[0] for item in members}),
                points=len(members),
                withheld_points=len(members) - len(net_errors),
                evaluated_points=len(net_errors),
                net_median_signed_error=None if signed is None else round(signed),
                net_median_absolute_error=None if absolute is None else round(absolute),
                net_median_signed_error_pct_of_income=None
                if pct is None
                else round(pct, 1),
                expense_median_signed_error=None if expense is None else round(expense),
            )
        )
    return ProjectionAccuracy(
        definition=DEFINITION,
        reference_period=_period(reference_date),
        evaluated_periods=[item.period for item in actuals],
        actuals=actuals,
        as_of_days=list(days),
        current_band=_band(reference_date.day),  # type: ignore[arg-type]
        bands=bands,
        limitations=LIMITATIONS,
    )
