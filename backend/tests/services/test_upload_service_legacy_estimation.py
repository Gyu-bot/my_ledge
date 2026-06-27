from datetime import date, datetime
from decimal import Decimal

import pytest

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.parsers.snapshots import SnapshotParseResult
from app.services import upload_service
from app.services.upload_service import import_transactions_from_workbook


async def test_import_transactions_runs_loan_estimate_hook_after_snapshot_replace(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    account = LoanAccount(lender="국민은행", product_name="주택담보대출")
    existing_loan = Loan(
        snapshot_date=date(2026, 5, 31),
        lender="국민은행",
        product_name="주택담보대출",
        balance=Decimal("100000000.00"),
        monthly_payment=Decimal("610000.00"),
        monthly_payment_source="estimated_from_linked_transactions",
    )
    march = Transaction(
        date=date(2026, 3, 20),
        time=datetime(2026, 3, 20, 9, 0).time(),
        type="지출",
        category_major="금융",
        category_minor="대출상환",
        description="국민은행 원리금",
        merchant="국민은행",
        amount=-300000,
        currency="KRW",
        payment_method="국민은행 계좌",
        source="import",
        created_at=datetime(2026, 3, 20, 9, 0),
        updated_at=datetime(2026, 3, 20, 9, 0),
    )
    april = Transaction(
        date=date(2026, 4, 20),
        time=datetime(2026, 4, 20, 9, 0).time(),
        type="지출",
        category_major="금융",
        category_minor="대출상환",
        description="국민은행 원리금",
        merchant="국민은행",
        amount=-500000,
        currency="KRW",
        payment_method="국민은행 계좌",
        source="import",
        created_at=datetime(2026, 4, 20, 9, 0),
        updated_at=datetime(2026, 4, 20, 9, 0),
    )
    db_session.add_all(
        [
            account,
            existing_loan,
            march,
            april,
            AppSetting(
                scope="analytics.asset_liability_health",
                key="monthly_payment_estimate_lookback_months",
                value="3",
            ),
            AppSetting(
                scope="analytics.asset_liability_health",
                key="monthly_payment_min_observations",
                value="2",
            ),
        ]
    )
    await db_session.commit()
    db_session.add_all(
        [
            LoanTransactionLink(
                transaction_id=march.id,
                loan_account_id=account.id,
                repayment_type="mixed",
                source="manual",
            ),
            LoanTransactionLink(
                transaction_id=april.id,
                loan_account_id=account.id,
                repayment_type="mixed",
                source="manual",
            ),
        ]
    )
    await db_session.commit()

    monkeypatch.setattr(upload_service, "parse_transactions", lambda _workbook: [])
    monkeypatch.setattr(
        upload_service,
        "parse_snapshots",
        lambda _workbook: SnapshotParseResult(
            asset_snapshots=[],
            investments=[],
            loans=[
                {
                    "loan_type": "mortgage",
                    "lender": "국민은행",
                    "product_name": "주택담보대출",
                    "principal": Decimal("120000000.00"),
                    "balance": Decimal("99000000.00"),
                    "interest_rate": Decimal("3.20"),
                    "monthly_payment": Decimal("610000.00"),
                }
            ],
        ),
    )

    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 5, 31),
    )

    replaced_loan = await db_session.scalar(
        select(Loan)
        .where(Loan.snapshot_date == date(2026, 5, 31))
        .where(Loan.lender == "국민은행")
        .where(Loan.product_name == "주택담보대출")
    )

    assert result.status == "success"
    assert replaced_loan is not None
    assert replaced_loan.balance == Decimal("99000000.00")
    assert replaced_loan.monthly_payment == Decimal("400000.00")
    assert replaced_loan.monthly_payment_source == "estimated_from_linked_transactions"
    assert replaced_loan.repayment_method == "principal_interest"
    assert replaced_loan.repayment_method_source == "estimated_from_linked_transactions"


async def test_import_transactions_rolls_back_snapshot_replace_when_estimate_hook_fails(
    db_session: AsyncSession,
    sample_workbook_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(upload_service, "parse_transactions", lambda _workbook: [])
    monkeypatch.setattr(
        upload_service,
        "parse_snapshots",
        lambda _workbook: SnapshotParseResult(
            asset_snapshots=[],
            investments=[],
            loans=[
                {
                    "loan_type": "mortgage",
                    "lender": "국민은행",
                    "product_name": "주택담보대출",
                    "principal": Decimal("120000000.00"),
                    "balance": Decimal("99000000.00"),
                    "interest_rate": Decimal("3.20"),
                }
            ],
        ),
    )

    async def _boom(
        _db_session: AsyncSession, *, loan_keys: list[tuple[str, str]]
    ) -> None:
        raise RuntimeError("estimate failed")

    monkeypatch.setattr(
        upload_service,
        "apply_loan_repayment_estimates_for_latest_snapshots",
        _boom,
    )

    result = await import_transactions_from_workbook(
        db_session=db_session,
        file_bytes=sample_workbook_bytes,
        filename="finance_sample.xlsx",
        snapshot_date=date(2026, 5, 31),
    )

    loan_count = await db_session.scalar(select(func.count()).select_from(Loan))
    upload_log = await db_session.scalar(select(UploadLog))

    assert result.status == "partial"
    assert result.loan_count == 0
    assert loan_count == 0
    assert upload_log is not None
    assert "estimate failed" in (upload_log.error_message or "")
