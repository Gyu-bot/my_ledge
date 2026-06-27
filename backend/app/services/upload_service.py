from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path
import re

from openpyxl import load_workbook
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_snapshot import AssetSnapshot
from app.models.insurance_contract import InsuranceContract
from app.models.investment import Investment
from app.models.loan import Loan
from app.models.upload_log import UploadLog
from app.models.user_profile_snapshot import UserProfileSnapshot
from app.parsers.decrypt import open_excel_bytes
from app.parsers.snapshots import SnapshotParseResult, parse_snapshots
from app.parsers.transactions import parse_transactions
from app.services.auto_classification_service import (
    apply_enabled_auto_classification_after_upload,
)
from app.services.loan_mapping_service import (
    apply_loan_repayment_estimates_for_latest_snapshots,
)
from app.services.transaction_source_lifecycle_service import (
    reconcile_transaction_source_lifecycle,
)


UPLOAD_RETENTION_COUNT = 5


@dataclass(slots=True)
class TransactionImportResult:
    upload_id: int
    tx_total: int
    tx_new: int
    tx_skipped: int
    asset_snapshot_count: int
    insurance_contract_count: int
    investment_count: int
    loan_count: int
    status: str
    error_message: str | None = None


async def import_transactions_from_workbook(
    db_session: AsyncSession,
    file_bytes: bytes,
    filename: str,
    snapshot_date: date,
    excel_password: str | None = None,
    persist_upload_file: bool = False,
    upload_dir: Path | None = None,
) -> TransactionImportResult:
    workbook_buffer = open_excel_bytes(file_bytes, password=excel_password)
    workbook = load_workbook(BytesIO(workbook_buffer.read()), data_only=True)
    upload_log = UploadLog(
        filename=filename,
        snapshot_date=snapshot_date,
        status="processing",
    )
    db_session.add(upload_log)
    await db_session.commit()
    await db_session.refresh(upload_log)
    upload_id = upload_log.id

    tx_total = 0
    tx_new = 0
    tx_skipped = 0
    asset_snapshot_count = 0
    insurance_contract_count = 0
    investment_count = 0
    loan_count = 0
    tx_success = False
    snapshot_success = False
    errors: list[str] = []

    try:
        parsed_rows = parse_transactions(workbook)
        tx_total = len(parsed_rows)
        lifecycle_result = await reconcile_transaction_source_lifecycle(
            db_session,
            parsed_rows,
            upload_log,
        )
        tx_new = lifecycle_result.tx_new
        tx_skipped = lifecycle_result.tx_skipped
        await db_session.commit()
        await apply_enabled_auto_classification_after_upload(db_session)
        await db_session.commit()

        tx_success = True
    except Exception as exc:
        await db_session.rollback()
        errors.append(f"transactions: {exc}")

    try:
        parsed_snapshots = parse_snapshots(workbook)
        await _replace_snapshots(db_session, snapshot_date, parsed_snapshots)
        await db_session.flush()
        await apply_loan_repayment_estimates_for_latest_snapshots(
            db_session,
            loan_keys=[
                (str(row["lender"]), str(row["product_name"]))
                for row in normalize_snapshots_for_storage(parsed_snapshots).loans
            ],
        )
        await db_session.commit()

        asset_snapshot_count = len(parsed_snapshots.asset_snapshots)
        insurance_contract_count = len(parsed_snapshots.insurance_contracts)
        investment_count = len(parsed_snapshots.investments)
        loan_count = len(parsed_snapshots.loans)
        snapshot_success = True
    except Exception as exc:
        await db_session.rollback()
        errors.append(f"snapshots: {exc}")

    status = _resolve_status(tx_success=tx_success, snapshot_success=snapshot_success)
    error_message = "\n".join(errors) if errors else None

    persisted_upload_log = await db_session.get(UploadLog, upload_id)
    assert persisted_upload_log is not None
    persisted_upload_log.tx_total = tx_total
    persisted_upload_log.tx_new = tx_new
    persisted_upload_log.tx_skipped = tx_skipped
    persisted_upload_log.status = status
    persisted_upload_log.error_message = error_message
    await db_session.commit()

    if persist_upload_file:
        if upload_dir is None:
            raise ValueError("upload_dir is required when persist_upload_file=True")
        _save_original_upload(
            upload_dir=upload_dir,
            upload_id=upload_id,
            filename=filename,
            file_bytes=file_bytes,
        )
        _prune_original_uploads(upload_dir=upload_dir, keep=UPLOAD_RETENTION_COUNT)

    return TransactionImportResult(
        upload_id=upload_id,
        tx_total=tx_total,
        tx_new=tx_new,
        tx_skipped=tx_skipped,
        asset_snapshot_count=asset_snapshot_count,
        insurance_contract_count=insurance_contract_count,
        investment_count=investment_count,
        loan_count=loan_count,
        status=status,
        error_message=error_message,
    )


def _save_original_upload(
    *,
    upload_dir: Path,
    upload_id: int,
    filename: str,
    file_bytes: bytes,
) -> Path:
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved_path = upload_dir / f"{upload_id:06d}-{_safe_upload_filename(filename)}"
    saved_path.write_bytes(file_bytes)
    return saved_path


def _safe_upload_filename(filename: str) -> str:
    basename = Path(filename).name.strip()
    if not basename:
        return "upload.xlsx"
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", basename).strip(".-")
    return safe_name or "upload.xlsx"


def _prune_original_uploads(*, upload_dir: Path, keep: int) -> None:
    if keep < 1:
        return
    saved_files = sorted(path for path in upload_dir.iterdir() if path.is_file())
    for path in saved_files[:-keep]:
        path.unlink()


async def _replace_snapshots(
    db_session: AsyncSession,
    snapshot_date: date,
    parsed_snapshots: SnapshotParseResult,
) -> None:
    normalized_snapshots = normalize_snapshots_for_storage(parsed_snapshots)
    existing_assets = (
        (
            await db_session.execute(
                select(AssetSnapshot).where(
                    AssetSnapshot.snapshot_date == snapshot_date
                )
            )
        )
        .scalars()
        .all()
    )
    existing_loans = (
        (
            await db_session.execute(
                select(Loan).where(Loan.snapshot_date == snapshot_date)
            )
        )
        .scalars()
        .all()
    )
    asset_metadata = {
        (row.side, row.category, row.product_name): {
            "liquidity_tier": row.liquidity_tier,
            "is_cash_equivalent": row.is_cash_equivalent,
        }
        for row in existing_assets
        if row.liquidity_tier is not None or row.is_cash_equivalent is not None
    }
    loan_metadata = {
        (row.lender, row.product_name): {
            "monthly_payment": row.monthly_payment,
            "repayment_method": row.repayment_method,
            "monthly_payment_source": row.monthly_payment_source,
            "repayment_method_source": row.repayment_method_source,
        }
        for row in existing_loans
        if (
            row.monthly_payment is not None
            or row.repayment_method is not None
            or row.monthly_payment_source is not None
            or row.repayment_method_source is not None
        )
    }

    await db_session.execute(
        delete(AssetSnapshot).where(AssetSnapshot.snapshot_date == snapshot_date)
    )
    await db_session.execute(
        delete(UserProfileSnapshot).where(
            UserProfileSnapshot.snapshot_date == snapshot_date
        )
    )
    await db_session.execute(
        delete(InsuranceContract).where(
            InsuranceContract.snapshot_date == snapshot_date
        )
    )
    await db_session.execute(
        delete(Investment).where(Investment.snapshot_date == snapshot_date)
    )
    await db_session.execute(delete(Loan).where(Loan.snapshot_date == snapshot_date))

    asset_rows = []
    for row in normalized_snapshots.asset_snapshots:
        stored_row = dict(row)
        metadata = asset_metadata.get(
            (
                str(stored_row["side"]),
                str(stored_row["category"]),
                str(stored_row["product_name"]),
            )
        )
        if metadata:
            stored_row.update(metadata)
        asset_rows.append(AssetSnapshot(snapshot_date=snapshot_date, **stored_row))
    db_session.add_all(asset_rows)
    db_session.add_all(
        InsuranceContract(snapshot_date=snapshot_date, **row)
        for row in normalized_snapshots.insurance_contracts
    )
    db_session.add_all(
        Investment(snapshot_date=snapshot_date, **row)
        for row in normalized_snapshots.investments
    )
    loan_rows = []
    for row in normalized_snapshots.loans:
        stored_row = dict(row)
        metadata = loan_metadata.get(
            (str(stored_row["lender"]), str(stored_row["product_name"]))
        )
        if metadata:
            stored_row.update(metadata)
        loan_rows.append(Loan(snapshot_date=snapshot_date, **stored_row))
    db_session.add_all(loan_rows)
    if normalized_snapshots.user_profile is not None:
        db_session.add(
            UserProfileSnapshot(
                snapshot_date=snapshot_date,
                **normalized_snapshots.user_profile,
            )
        )


def _resolve_status(*, tx_success: bool, snapshot_success: bool) -> str:
    if tx_success and snapshot_success:
        return "success"
    if tx_success or snapshot_success:
        return "partial"
    return "failed"


def normalize_snapshots_for_storage(
    parsed_snapshots: SnapshotParseResult,
) -> SnapshotParseResult:
    return SnapshotParseResult(
        user_profile=parsed_snapshots.user_profile,
        cashflow_benchmarks=parsed_snapshots.cashflow_benchmarks,
        asset_snapshots=_deduplicate_named_rows(
            parsed_snapshots.asset_snapshots,
            key_fields=("side", "category"),
        ),
        insurance_contracts=_deduplicate_named_rows(
            parsed_snapshots.insurance_contracts,
            key_fields=("insurer",),
        ),
        investments=_deduplicate_named_rows(
            parsed_snapshots.investments,
            key_fields=("broker",),
        ),
        loans=_deduplicate_named_rows(
            parsed_snapshots.loans,
            key_fields=("lender",),
        ),
    )


def _deduplicate_named_rows(
    rows: list[dict[str, object]],
    key_fields: tuple[str, ...],
) -> list[dict[str, object]]:
    seen: dict[tuple[object, ...], int] = {}
    normalized_rows: list[dict[str, object]] = []

    for row in rows:
        product_name = str(row["product_name"])
        base_key = tuple(row.get(field) for field in key_fields) + (product_name,)
        occurrence = seen.get(base_key, 0) + 1
        seen[base_key] = occurrence

        if occurrence == 1:
            normalized_rows.append(row)
            continue

        normalized_row = dict(row)
        normalized_row["product_name"] = f"{product_name} ({occurrence})"
        normalized_rows.append(normalized_row)

    return normalized_rows
