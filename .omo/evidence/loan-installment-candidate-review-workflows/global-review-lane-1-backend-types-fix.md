# Global Review Lane 1 Backend Types Fix

Date: 2026-06-27
Task: `loan-installment-candidate-review-workflows`

## Scope

- Edited: `backend/app/services/loan_mapping_service.py`
- Added evidence: `.omo/evidence/loan-installment-candidate-review-workflows/global-review-lane-1-backend-types-fix.md`
- Tests changed: none

## Code Change

- Added internal `TypedDict` aliases:
  - `LoanSnapshotRecord`
  - `LinkedRepaymentObservations`
- Replaced the imprecise annotations in `backend/app/services/loan_mapping_service.py`:
  - `_load_latest_loan_snapshots(...) -> list[LoanSnapshotRecord]`
  - `_load_latest_loan_snapshot_for_key(...) -> LoanSnapshotRecord | None`
  - `_load_linked_repayment_observations(...) -> LinkedRepaymentObservations`
  - `_build_account_candidate(..., snapshot: LoanSnapshotRecord | None, ...)`

## Command Results

### Targeted tests

Command:

```bash
cd backend && UV_CACHE_DIR=.uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge uv run pytest tests/services/test_loan_mapping_service.py tests/api/test_loan_mapping_api.py
```

Result:

```text
======================= 29 passed, 262 warnings in 0.87s =======================
```

### Ruff

Command:

```bash
cd backend && UV_CACHE_DIR=.uv-cache uv run ruff check app/services/loan_mapping_service.py tests/api/test_loan_mapping_api.py tests/services/test_loan_mapping_service.py
```

Result:

```text
All checks passed!
```

### git diff --check

Command:

```bash
git diff --check
```

Result:

```text
(no output; exit 0)
```

## Additional validation

### Persistence no-write path smoke

Command:

```bash
cd backend && UV_CACHE_DIR=.uv-cache uv run python - <<'PY'
from datetime import date, datetime, time
from pathlib import Path
import tempfile

import anyio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base
from app.models.loan_account import LoanAccount
from app.models.loan_candidate_review import LoanCandidateReview
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.schemas.loan_mapping import LoanCandidateReviewPatchRequest
from app.services.loan_mapping_service import update_loan_candidate_review


async def main() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_path = Path(tmp_dir) / "rollback-check.db"
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        async with session_factory() as session:
            now = datetime(2026, 6, 27, 0, 0, 0)
            transaction = Transaction(
                date=date(2026, 5, 20),
                time=time(9, 0),
                type="지출",
                category_major="금융",
                category_minor="대출상환",
                description="국민은행 대출이자",
                merchant="국민은행",
                amount=-350000,
                currency="KRW",
                payment_method="국민은행 계좌",
                source="import",
                created_at=now,
                updated_at=now,
            )
            account = LoanAccount(lender="국민은행", product_name="주택담보대출")
            session.add_all([transaction, account])
            await session.flush()
            session.add(
                LoanTransactionLink(
                    transaction_id=transaction.id,
                    loan_account_id=account.id,
                    repayment_type="mixed",
                    source="manual",
                )
            )
            await session.commit()

            try:
                await update_loan_candidate_review(
                    session,
                    transaction.id,
                    LoanCandidateReviewPatchRequest(review_status="not_candidate"),
                )
            except HTTPException as exc:
                reviews = await session.scalars(
                    select(LoanCandidateReview).where(
                        LoanCandidateReview.transaction_id == transaction.id
                    )
                )
                print(f"status={exc.status_code}")
                print(f"detail={exc.detail}")
                print(f"persisted_reviews={len(list(reviews))}")
            else:
                raise AssertionError("Expected HTTPException was not raised")

        await engine.dispose()


anyio.run(main)
PY
```

Result:

```text
status=409
detail=Linked loan transaction cannot be dismissed.
persisted_reviews=0
```

## Notes

- OpenAPI delta: none
- Async/transaction semantics changed: none
- The file already had unrelated in-flight branch changes; this task only narrowed the four imprecise annotations called out in the review request.
