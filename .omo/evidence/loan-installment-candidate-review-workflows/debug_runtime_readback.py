from __future__ import annotations

import asyncio
import sys

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models.loan_candidate_review import LoanCandidateReview


async def main() -> None:
    transaction_id = int(sys.argv[1])
    engine = create_async_engine("sqlite+aiosqlite:////tmp/myledge-audit-api.db")
    session_factory = async_sessionmaker(engine)
    async with session_factory() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(LoanCandidateReview)
            .where(LoanCandidateReview.transaction_id == transaction_id)
        )
        print(count)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
