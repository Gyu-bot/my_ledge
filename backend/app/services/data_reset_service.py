from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.transaction import Transaction
from app.schemas.data_management import DataResetCounts, DataResetResponse, DataResetScope


async def reset_data(
    db_session: AsyncSession,
    *,
    scope: DataResetScope,
) -> DataResetResponse:
    transaction_count = await _count_rows(db_session, Transaction)
    asset_snapshot_count = 0
    investment_count = 0
    loan_count = 0

    await db_session.execute(delete(Transaction))

    if scope == "transactions_and_snapshots":
        asset_snapshot_count = await _count_rows(db_session, AssetSnapshot)
        investment_count = await _count_rows(db_session, Investment)
        loan_count = await _count_rows(db_session, Loan)
        await db_session.execute(delete(AssetSnapshot))
        await db_session.execute(delete(Investment))
        await db_session.execute(delete(Loan))

    await db_session.commit()

    return DataResetResponse(
        scope=scope,
        deleted=DataResetCounts(
            transactions=transaction_count,
            asset_snapshots=asset_snapshot_count,
            investments=investment_count,
            loans=loan_count,
        ),
    )


async def _count_rows(db_session: AsyncSession, model: type[object]) -> int:
    return await db_session.scalar(select(func.count()).select_from(model)) or 0
