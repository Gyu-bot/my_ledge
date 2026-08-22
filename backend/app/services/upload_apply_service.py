import logging
from dataclasses import asdict
from datetime import date
import json
from pathlib import Path
from typing import assert_never

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.purchase_gate_review import PurchaseGateReview
from app.models.transaction import Transaction
from app.models.transaction import TransactionSourceLifecycleStatus
from app.models.upload_log import UploadLog
from app.parsers.snapshots import SnapshotParseResult
from app.parsers.transactions import TransactionRow
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services.upload_apply_models import TransactionUploadApplyResult
from app.services.upload_apply_models import UploadApplyAuditRecord
from app.services.upload_apply_models import UploadApplyAuditSelection
from app.services.upload_apply_models import UploadApplySelectionError
from app.services import upload_preview_change_builder as preview_builder
from app.services.transaction_source_lifecycle_service import (
    LifecycleTouch,
    apply_source_managed_row_update,
    build_imported_transaction,
    mark_missing_from_latest_export,
    touch_transaction_source_lifecycle,
)
from app.services.upload_preview_models import UploadPreviewChangeCounts
from app.services.upload_preview_models import UploadPreviewChangeData
from app.services.upload_preview_models import UploadPreviewChangeTypeValue
from app.services.upload_preview_models import UploadPreviewPlanEntry
from app.services.upload_preview_models import UploadPreviewSelectionKey
from app.services.upload_preview_service import (
    parse_upload_workbook_contents,
    build_transaction_upload_preview_plan_from_rows,
)
from app.services.loan_mapping_service import (
    apply_loan_repayment_estimates_for_latest_snapshots,
)
from app.services.upload_service import persist_original_upload, replace_snapshots

logger = logging.getLogger(__name__)


async def apply_transaction_upload_workbook(
    db_session: AsyncSession,
    file_bytes: bytes,
    filename: str,
    snapshot_date: date,
    apply_request: UploadApplyRequest,
    upload_dir: Path,
    excel_password: str | None = None,
) -> TransactionUploadApplyResult:
    parsed_rows, parsed_snapshots = parse_upload_workbook_contents(
        file_bytes=file_bytes,
        excel_password=excel_password,
    )
    result = await apply_transaction_upload_from_rows(
        db_session=db_session,
        parsed_rows=parsed_rows,
        parsed_snapshots=parsed_snapshots,
        filename=filename,
        snapshot_date=snapshot_date,
        apply_request=apply_request,
    )
    try:
        persist_original_upload(
            upload_dir=upload_dir,
            upload_id=result.upload_id,
            filename=filename,
            file_bytes=file_bytes,
        )
    except OSError as exc:
        await _record_original_upload_warning(
            db_session=db_session,
            upload_id=result.upload_id,
            message=f"warning: original upload not saved: {exc}",
        )
    return result


async def apply_transaction_upload_from_rows(
    db_session: AsyncSession,
    parsed_rows: list[TransactionRow],
    filename: str,
    snapshot_date: date,
    apply_request: UploadApplyRequest,
    parsed_snapshots: SnapshotParseResult | None = None,
) -> TransactionUploadApplyResult:
    preview_plan = await build_transaction_upload_preview_plan_from_rows(
        db_session=db_session,
        parsed_rows=parsed_rows,
    )
    selected_entries = _select_apply_entries(
        preview_plan.entries, apply_request.selections
    )
    asset_snapshot_count = (
        len(parsed_snapshots.asset_snapshots) if parsed_snapshots else 0
    )
    insurance_contract_count = (
        len(parsed_snapshots.insurance_contracts) if parsed_snapshots else 0
    )
    investment_count = len(parsed_snapshots.investments) if parsed_snapshots else 0
    loan_count = len(parsed_snapshots.loans) if parsed_snapshots else 0

    try:
        async with db_session.begin_nested():
            upload_log = UploadLog(
                filename=filename,
                snapshot_date=snapshot_date,
                status="processing",
                reconciliation_mode="explicit_apply",
            )
            db_session.add(upload_log)
            await db_session.flush()
            await db_session.refresh(upload_log)

            created_transaction_count = 0
            for entry in selected_entries:
                created_transaction_count += await _apply_selected_plan_entry(
                    db_session=db_session,
                    upload_log=upload_log,
                    entry=entry,
                )

            if parsed_snapshots is not None:
                normalized_snapshots = await replace_snapshots(
                    db_session, snapshot_date, parsed_snapshots
                )
                await db_session.flush()
                await apply_loan_repayment_estimates_for_latest_snapshots(
                    db_session,
                    loan_keys=[
                        (str(row["lender"]), str(row["product_name"]))
                        for row in normalized_snapshots.loans
                    ],
                )

            applied_changes = tuple(entry.change for entry in selected_entries)
            change_type_counts = preview_builder.build_change_counts(applied_changes)
            tx_new = created_transaction_count
            upload_log.tx_total = preview_plan.preview.parsed_transaction_count
            upload_log.tx_new = tx_new
            upload_log.tx_skipped = len(applied_changes) - tx_new
            upload_log.reconciliation_audit = _build_reconciliation_audit(
                apply_request=apply_request,
                applied_changes=applied_changes,
                change_type_counts=change_type_counts,
            )
            upload_log.status = "success"
        await db_session.commit()
    except Exception:
        await db_session.rollback()
        raise

    return TransactionUploadApplyResult(
        upload_id=upload_log.id,
        parsed_transaction_count=preview_plan.preview.parsed_transaction_count,
        selected_change_count=len(selected_entries),
        applied_change_count=len(applied_changes),
        change_type_counts=change_type_counts,
        applied_changes=applied_changes,
        tx_new=tx_new,
        tx_skipped=len(applied_changes) - tx_new,
        asset_snapshot_count=asset_snapshot_count,
        insurance_contract_count=insurance_contract_count,
        investment_count=investment_count,
        loan_count=loan_count,
    )


async def _record_original_upload_warning(
    *,
    db_session: AsyncSession,
    upload_id: int,
    message: str,
) -> None:
    logger.warning("upload_id=%s %s", upload_id, message)
    try:
        upload_log = await db_session.get(UploadLog, upload_id)
        if upload_log is None:
            return
        upload_log.error_message = (
            f"{upload_log.error_message}\n{message}"
            if upload_log.error_message
            else message
        )
        await db_session.commit()
    except Exception:
        await db_session.rollback()
        logger.warning(
            "upload_id=%s failed to persist non-fatal upload warning",
            upload_id,
            exc_info=True,
        )


def _select_apply_entries(
    preview_entries: tuple[UploadPreviewPlanEntry, ...],
    selections: list[UploadApplySelection],
) -> tuple[UploadPreviewPlanEntry, ...]:
    entry_by_key = {entry.selection_key: entry for entry in preview_entries}
    selected_entries: list[UploadPreviewPlanEntry] = []
    for index, selection in enumerate(selections):
        key = UploadPreviewSelectionKey(
            change_type=selection.change_type.value,
            source_row_hash=selection.source_row_hash,
            existing_transaction_id=selection.existing_transaction_id,
        )
        entry = entry_by_key.get(key)
        if entry is None:
            raise UploadApplySelectionError(
                code="invalid_selection",
                message="The requested selection does not match the latest preview state.",
                selection_index=index,
            )
        if not _supports_explicit_apply(entry.change.change_type):
            raise UploadApplySelectionError(
                code="review_required_selection",
                message=(
                    "Review-required preview changes cannot be applied via the safe "
                    "apply flow."
                ),
                selection_index=index,
            )
        selected_entries.append(entry)
    return tuple(selected_entries)


async def _apply_selected_plan_entry(
    db_session: AsyncSession,
    upload_log: UploadLog,
    entry: UploadPreviewPlanEntry,
) -> int:
    change = entry.change
    if upload_log.uploaded_at is None:
        raise AssertionError("upload log uploaded_at must be populated before apply")

    match change.change_type:
        case "new":
            if entry.incoming_row is None:
                raise AssertionError("new change requires an incoming row")
            db_session.add(
                build_imported_transaction(
                    entry.incoming_row,
                    _lifecycle_touch(
                        upload_log=upload_log,
                        row_hash=change.source_row_hash,
                        lifecycle_status=TransactionSourceLifecycleStatus.ACTIVE,
                    ),
                )
            )
            return 1
        case "unchanged":
            transaction = await _get_existing_transaction(db_session, change)
            touch_transaction_source_lifecycle(
                transaction,
                _lifecycle_touch(
                    upload_log=upload_log,
                    row_hash=change.source_row_hash,
                    lifecycle_status=TransactionSourceLifecycleStatus.ACTIVE,
                ),
            )
            return 0
        case "source_fields_changed" | "time_shifted":
            transaction = await _get_existing_transaction(db_session, change)
            if entry.incoming_row is None:
                raise AssertionError("matched safe change requires an incoming row")
            apply_source_managed_row_update(transaction, entry.incoming_row)
            touch_transaction_source_lifecycle(
                transaction,
                _lifecycle_touch(
                    upload_log=upload_log,
                    row_hash=change.source_row_hash,
                    lifecycle_status=TransactionSourceLifecycleStatus.SOURCE_CHANGED,
                ),
            )
            return 0
        case "missing_from_latest_export":
            transaction = await _get_existing_transaction(db_session, change)
            mark_missing_from_latest_export(transaction)
            return 0
        case "possible_replacement":
            transaction = await _get_existing_transaction(db_session, change)
            if entry.incoming_row is None:
                raise AssertionError("possible replacement requires an incoming row")
            replacement = build_imported_transaction(
                entry.incoming_row,
                _lifecycle_touch(
                    upload_log=upload_log,
                    row_hash=change.source_row_hash,
                    lifecycle_status=TransactionSourceLifecycleStatus.ACTIVE,
                ),
            )
            _copy_user_managed_fields(transaction, replacement)
            db_session.add(replacement)
            await db_session.flush()
            transaction.source_lifecycle_status = (
                TransactionSourceLifecycleStatus.SUPERSEDED.value
            )
            transaction.superseded_by_transaction_id = replacement.id
            await _move_transaction_relationships(
                db_session,
                old_transaction_id=transaction.id,
                new_transaction_id=replacement.id,
            )
            return 1
        case "possible_duplicate" | "ambiguous":
            raise AssertionError(
                "review-required changes must be rejected before apply"
            )
        case unreachable:
            assert_never(unreachable)


def _supports_explicit_apply(
    change_type: UploadPreviewChangeTypeValue,
) -> bool:
    match change_type:
        case "new" | "unchanged" | "source_fields_changed" | "time_shifted":
            return True
        case "missing_from_latest_export" | "possible_replacement":
            return True
        case "possible_duplicate" | "ambiguous":
            return False
        case unreachable:
            assert_never(unreachable)


def _copy_user_managed_fields(
    existing: Transaction,
    replacement: Transaction,
) -> None:
    for field_name in (
        "category_major_user",
        "category_minor_user",
        "cost_kind",
        "fixed_cost_necessity",
        "spend_necessity",
        "cost_classification_source",
        "recurring_payment_kind",
        "memo",
        "is_deleted",
        "merged_into_id",
    ):
        setattr(replacement, field_name, getattr(existing, field_name))
    if existing.merchant != existing.description:
        replacement.merchant = existing.merchant


async def _move_transaction_relationships(
    db_session: AsyncSession,
    *,
    old_transaction_id: int,
    new_transaction_id: int,
) -> None:
    for link_model in (InstallmentTransactionLink, LoanTransactionLink):
        link = await db_session.scalar(
            select(link_model).where(link_model.transaction_id == old_transaction_id)
        )
        if link is not None:
            link.transaction_id = new_transaction_id
    reviews = list(
        (
            await db_session.scalars(
                select(PurchaseGateReview).where(
                    PurchaseGateReview.transaction_id == old_transaction_id
                )
            )
        ).all()
    )
    for review in reviews:
        review.transaction_id = new_transaction_id
        review.candidate_key = f"transaction:{new_transaction_id}"


def _lifecycle_touch(
    *,
    upload_log: UploadLog,
    row_hash: str | None,
    lifecycle_status: TransactionSourceLifecycleStatus,
) -> LifecycleTouch:
    if row_hash is None:
        raise AssertionError("safe apply change missing source_row_hash")
    uploaded_at = upload_log.uploaded_at
    if uploaded_at is None:
        raise AssertionError("upload log uploaded_at must be populated before apply")
    return LifecycleTouch(
        row_hash=row_hash,
        upload_log_id=upload_log.id,
        uploaded_at=uploaded_at,
        lifecycle_status=lifecycle_status,
    )


async def _get_existing_transaction(
    db_session: AsyncSession,
    change: UploadPreviewChangeData,
) -> Transaction:
    if change.existing_transaction_id is None:
        raise AssertionError("selected change missing existing transaction id")
    transaction = await db_session.get(Transaction, change.existing_transaction_id)
    if transaction is None:
        raise AssertionError("selected transaction no longer exists")
    return transaction


def _build_reconciliation_audit(
    *,
    apply_request: UploadApplyRequest,
    applied_changes: tuple[UploadPreviewChangeData, ...],
    change_type_counts: UploadPreviewChangeCounts,
) -> str:
    audit_record = UploadApplyAuditRecord(
        confirmation=apply_request.confirmation,
        selected_change_count=len(apply_request.selections),
        applied_change_count=len(applied_changes),
        selected_changes=tuple(
            UploadApplyAuditSelection(
                change_type=change.change_type,
                source_row_hash=change.source_row_hash or "",
                existing_transaction_id=change.existing_transaction_id,
                reason=change.reason,
                preserved_user_fields=change.preserved_user_fields,
            )
            for change in applied_changes
        ),
        change_type_counts=change_type_counts,
    )
    return json.dumps(asdict(audit_record), ensure_ascii=False, sort_keys=True)
