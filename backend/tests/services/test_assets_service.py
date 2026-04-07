from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.schemas.asset import SnapshotComparisonMode
from app.services import assets_service


async def _seed_asset_snapshot(
    db_session: AsyncSession,
    *,
    snapshot_date: date,
    asset_total: str,
    liability_total: str,
) -> None:
    db_session.add_all(
        [
            AssetSnapshot(
                snapshot_date=snapshot_date,
                side="asset",
                category="현금",
                product_name=f"asset-{snapshot_date.isoformat()}",
                amount=Decimal(asset_total),
            ),
            AssetSnapshot(
                snapshot_date=snapshot_date,
                side="liability",
                category="부채",
                product_name=f"liability-{snapshot_date.isoformat()}",
                amount=Decimal(liability_total),
            ),
        ]
    )
    await db_session.commit()


async def test_get_asset_snapshot_comparison_uses_latest_available_pair_and_partial_label(
    db_session: AsyncSession,
) -> None:
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 3, 31),
        asset_total="1000.00",
        liability_total="200.00",
    )
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 4, 7),
        asset_total="1300.00",
        liability_total="250.00",
    )

    result = await assets_service.get_asset_snapshot_comparison(db_session)

    assert result.comparison_mode == SnapshotComparisonMode.LATEST_AVAILABLE_VS_PREVIOUS_AVAILABLE
    assert result.current.snapshot_date == date(2026, 4, 7)
    assert result.baseline is not None
    assert result.baseline.snapshot_date == date(2026, 3, 31)
    assert result.comparison_days == 7
    assert result.is_partial is True
    assert result.is_stale is False
    assert result.can_compare is True
    assert result.comparison_label == "부분 기간"
    assert result.delta is not None
    assert result.delta.asset_total == Decimal("300.00")
    assert result.delta.liability_total == Decimal("50.00")
    assert result.delta.net_worth == Decimal("250.00")
    assert result.delta.asset_total_pct == 0.3
    assert result.delta.liability_total_pct == 0.25
    assert result.delta.net_worth_pct == 0.3125


async def test_get_asset_snapshot_comparison_uses_closed_month_pair_when_requested(
    db_session: AsyncSession,
) -> None:
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 2, 28),
        asset_total="900.00",
        liability_total="300.00",
    )
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 3, 31),
        asset_total="1000.00",
        liability_total="200.00",
    )
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 4, 7),
        asset_total="1300.00",
        liability_total="250.00",
    )

    result = await assets_service.get_asset_snapshot_comparison(
        db_session,
        comparison_mode=SnapshotComparisonMode.LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH,
    )

    assert result.comparison_mode == SnapshotComparisonMode.LAST_CLOSED_MONTH_VS_PREVIOUS_CLOSED_MONTH
    assert result.current.snapshot_date == date(2026, 3, 31)
    assert result.baseline is not None
    assert result.baseline.snapshot_date == date(2026, 2, 28)
    assert result.comparison_days == 31
    assert result.is_partial is False
    assert result.is_stale is False
    assert result.can_compare is True
    assert result.comparison_label == "마감월 기준"


async def test_get_asset_snapshot_comparison_marks_stale_snapshot_based_on_today_threshold(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 1, 31),
        asset_total="900.00",
        liability_total="300.00",
    )
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 2, 28),
        asset_total="1000.00",
        liability_total="200.00",
    )

    monkeypatch.setattr(assets_service, "_today", lambda: date(2026, 4, 20))

    result = await assets_service.get_asset_snapshot_comparison(db_session)

    assert result.current.snapshot_date == date(2026, 2, 28)
    assert result.is_stale is True
    assert result.comparison_label == "최신 스냅샷 기준 / stale snapshot"


async def test_get_asset_snapshot_comparison_returns_latest_state_only_when_baseline_is_missing(
    db_session: AsyncSession,
) -> None:
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 4, 7),
        asset_total="1300.00",
        liability_total="250.00",
    )

    result = await assets_service.get_asset_snapshot_comparison(db_session)

    assert result.current.snapshot_date == date(2026, 4, 7)
    assert result.baseline is None
    assert result.delta is None
    assert result.comparison_days is None
    assert result.can_compare is False
    assert result.comparison_label == "비교 기준 부족"


async def test_get_asset_snapshot_comparison_supports_selected_snapshot_pair(
    db_session: AsyncSession,
) -> None:
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 3, 24),
        asset_total="950.00",
        liability_total="250.00",
    )
    await _seed_asset_snapshot(
        db_session,
        snapshot_date=date(2026, 4, 7),
        asset_total="1300.00",
        liability_total="250.00",
    )

    result = await assets_service.get_asset_snapshot_comparison(
        db_session,
        comparison_mode=SnapshotComparisonMode.SELECTED_SNAPSHOT_VS_BASELINE_SNAPSHOT,
        snapshot_date=date(2026, 4, 7),
        baseline_snapshot_date=date(2026, 3, 24),
    )

    assert result.comparison_mode == SnapshotComparisonMode.SELECTED_SNAPSHOT_VS_BASELINE_SNAPSHOT
    assert result.current.snapshot_date == date(2026, 4, 7)
    assert result.baseline is not None
    assert result.baseline.snapshot_date == date(2026, 3, 24)
    assert result.comparison_days == 14
    assert result.can_compare is True
