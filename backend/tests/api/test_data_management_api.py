from datetime import date, time
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog


async def _seed_reset_rows(db_session: AsyncSession) -> None:
    db_session.add_all(
        [
            Transaction(
                date=date(2026, 3, 24),
                time=time(9, 30),
                type="지출",
                category_major="식비",
                category_minor=None,
                description="점심",
                merchant="점심",
                amount=-12000,
                currency="KRW",
                payment_method="카드 A",
                source="import",
            ),
            Transaction(
                date=date(2026, 3, 25),
                time=time(8, 0),
                type="수입",
                category_major="급여",
                category_minor=None,
                description="월급",
                merchant="월급",
                amount=3000000,
                currency="KRW",
                payment_method="계좌 A",
                source="manual",
            ),
            AssetSnapshot(
                snapshot_date=date(2026, 3, 24),
                side="asset",
                category="현금",
                product_name="입출금통장",
                amount=Decimal("1000000.00"),
            ),
            Investment(
                snapshot_date=date(2026, 3, 24),
                product_type="주식",
                broker="증권사 A",
                product_name="해외 ETF",
                cost_basis=Decimal("900000.00"),
                market_value=Decimal("950000.00"),
                return_rate=Decimal("0.0555"),
            ),
            Loan(
                snapshot_date=date(2026, 3, 24),
                loan_type="주담대",
                lender="은행 A",
                product_name="주택담보대출",
                principal=Decimal("200000000.00"),
                balance=Decimal("180000000.00"),
                interest_rate=Decimal("3.50"),
                start_date=date(2024, 1, 1),
                maturity_date=date(2054, 1, 1),
            ),
            UploadLog(
                filename="finance_sample.xlsx",
                snapshot_date=date(2026, 3, 24),
                tx_total=2,
                tx_new=2,
                tx_skipped=0,
                status="success",
                error_message=None,
            ),
        ]
    )
    await db_session.commit()


async def test_reset_data_requires_api_key(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/data/reset",
        json={"scope": "transactions_only"},
    )

    assert response.status_code == 401


async def test_reset_data_clears_transactions_only_and_retains_snapshots_and_logs(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await _seed_reset_rows(db_session)

    before_asset_snapshots = await db_session.scalar(select(func.count()).select_from(AssetSnapshot))
    before_investments = await db_session.scalar(select(func.count()).select_from(Investment))
    before_loans = await db_session.scalar(select(func.count()).select_from(Loan))
    before_upload_logs = await db_session.scalar(select(func.count()).select_from(UploadLog))

    response = await async_client.post(
        "/api/v1/data/reset",
        headers=api_headers,
        json={"scope": "transactions_only"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "scope": "transactions_only",
        "deleted": {
            "transactions": 2,
            "asset_snapshots": 0,
            "investments": 0,
            "loans": 0,
        },
        "upload_logs_retained": True,
    }

    remaining_transactions = await db_session.scalar(select(func.count()).select_from(Transaction))
    remaining_asset_snapshots = await db_session.scalar(select(func.count()).select_from(AssetSnapshot))
    remaining_investments = await db_session.scalar(select(func.count()).select_from(Investment))
    remaining_loans = await db_session.scalar(select(func.count()).select_from(Loan))
    remaining_upload_logs = await db_session.scalar(select(func.count()).select_from(UploadLog))

    assert remaining_transactions == 0
    assert remaining_asset_snapshots == before_asset_snapshots
    assert remaining_investments == before_investments
    assert remaining_loans == before_loans
    assert remaining_upload_logs == before_upload_logs


async def test_reset_data_clears_transactions_and_snapshots(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    db_session: AsyncSession,
) -> None:
    await _seed_reset_rows(db_session)

    response = await async_client.post(
        "/api/v1/data/reset",
        headers=api_headers,
        json={"scope": "transactions_and_snapshots"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "scope": "transactions_and_snapshots",
        "deleted": {
            "transactions": 2,
            "asset_snapshots": 1,
            "investments": 1,
            "loans": 1,
        },
        "upload_logs_retained": True,
    }

    remaining_transactions = await db_session.scalar(select(func.count()).select_from(Transaction))
    remaining_asset_snapshots = await db_session.scalar(select(func.count()).select_from(AssetSnapshot))
    remaining_investments = await db_session.scalar(select(func.count()).select_from(Investment))
    remaining_loans = await db_session.scalar(select(func.count()).select_from(Loan))
    remaining_upload_logs = await db_session.scalar(select(func.count()).select_from(UploadLog))

    assert remaining_transactions == 0
    assert remaining_asset_snapshots == 0
    assert remaining_investments == 0
    assert remaining_loans == 0
    assert remaining_upload_logs == 1
