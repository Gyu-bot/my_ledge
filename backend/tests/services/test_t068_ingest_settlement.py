from datetime import date, time
from io import BytesIO

import pytest
from openpyxl import load_workbook
from sqlalchemy import select

from app.models.settlement_group import SettlementMatch
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services.metric_views import FLOW_LINES_VIEW, METRIC_TRANSACTIONS_VIEW
from app.services.source_verification import verify_import_parity
from app.services.upload_apply_models import UploadApplySelectionError
from app.services.upload_apply_service import apply_transaction_upload_from_rows
from app.services.upload_preview_service import preview_transaction_upload_from_rows
from app.services.upload_service import import_transactions_from_workbook
from test_upload_review_service import DAY, row, tx, workbook


async def _apply_replacements(db, incoming):
    preview = await preview_transaction_upload_from_rows(db, incoming)
    changes = preview.review_required_changes
    assert [change.change_type for change in changes] == ["possible_replacement"] * len(
        incoming
    )
    return await apply_transaction_upload_from_rows(
        db,
        parsed_rows=incoming,
        filename="replacement.xlsx",
        snapshot_date=DAY,
        apply_request=UploadApplyRequest(
            confirmation=True,
            selections=[
                UploadApplySelection(
                    change_type=change.change_type,
                    source_row_hash=change.source_row_hash,
                    existing_transaction_id=change.existing_transaction_id,
                )
                for change in changes
            ],
        ),
    )


@pytest.mark.parametrize("match_status", ["user_confirmed", "auto_confirmed"])
async def test_replacements_keep_cross_month_refund_attribution(
    db_session, match_status
):
    purchase_day = date(2026, 2, 28)
    refund_day = date(2026, 3, 1)
    purchase = tx(name="old purchase", date=purchase_day, category_major="purchase")
    purchase.category_major_user = "user category"
    refund = tx(name="old refund", amount=30, date=refund_day, category_major="refund")
    unrelated = tx(name="unrelated", amount=-70, date=purchase_day)
    db_session.add_all([purchase, refund, unrelated])
    await db_session.flush()
    confirmed = SettlementMatch(
        original_transaction_id=purchase.id,
        settlement_transaction_id=refund.id,
        status=match_status,
        matched_amount=30,
    )
    rejected = SettlementMatch(
        original_transaction_id=unrelated.id,
        settlement_transaction_id=refund.id,
        status="rejected",
        matched_amount=30,
    )
    db_session.add_all([confirmed, rejected])
    await db_session.commit()

    lines = FLOW_LINES_VIEW.c
    flow_query = (
        select(lines.period, lines.effective_category_major, lines.amount)
        .where(lines.effective_category_major != "기타")
        .order_by(lines.period)
    )
    expected = [("2026-02", "user category", -100), ("2026-03", "user category", 30)]
    assert (await db_session.execute(flow_query)).all() == expected
    result = await _apply_replacements(
        db_session,
        [
            row(
                "new purchase",
                date=purchase_day,
                category_major="other source category",
            ),
            row("new refund", amount=30, date=refund_day, category_major="refund"),
        ],
    )

    assert result.applied_change_count == 2
    assert confirmed.original_transaction_id == purchase.superseded_by_transaction_id
    assert confirmed.settlement_transaction_id == refund.superseded_by_transaction_id
    assert (confirmed.status, confirmed.matched_amount) == (match_status, 30)
    assert rejected.settlement_transaction_id == confirmed.settlement_transaction_id
    assert rejected.status == "rejected"
    assert (await db_session.execute(flow_query)).all() == expected
    metric = METRIC_TRANSACTIONS_VIEW.c
    assert (
        await db_session.scalar(
            select(metric.purchase_net_amount).where(
                metric.id == confirmed.original_transaction_id
            )
        )
        == -70
    )


async def test_replacement_conflict_rolls_back_all_selected_edits(db_session):
    purchase = tx(name="old purchase")
    refunds = [tx(name=f"refund {index}", amount=60, seconds=index) for index in (1, 2)]
    db_session.add_all([purchase, *refunds])
    await db_session.flush()
    purchase_id = purchase.id
    db_session.add_all(
        SettlementMatch(
            original_transaction_id=purchase_id,
            settlement_transaction_id=refund.id,
            status="user_confirmed",
            matched_amount=60,
        )
        for refund in refunds
    )
    await db_session.commit()

    with pytest.raises(UploadApplySelectionError) as caught:
        await _apply_replacements(db_session, [row("new purchase")])

    assert caught.value.code == "settlement_replacement_conflict"
    assert caught.value.selection_index == 0
    assert await db_session.scalar(select(UploadLog.id)) is None
    assert (
        await db_session.get(Transaction, purchase_id)
    ).superseded_by_transaction_id is None
    assert list(
        await db_session.scalars(select(SettlementMatch.original_transaction_id))
    ) == [purchase_id, purchase_id]


@pytest.mark.parametrize("invalid_role", ["original", "refund"])
@pytest.mark.parametrize(
    "invalidity",
    [
        "foreign_currency",
        "both_foreign_currencies",
        "superseded_link",
        "superseded_status",
    ],
)
async def test_legacy_invalid_settlement_does_not_reserve_capacity(
    async_client, api_headers, db_session, invalid_role, invalidity
):
    purchase = tx(name="purchase")
    refund = tx(name="refund", amount=100, seconds=1)
    is_original = invalid_role == "original"
    invalid = tx(name="invalid", amount=-100 if is_original else 100, seconds=2)
    db_session.add_all([purchase, refund, invalid])
    await db_session.flush()
    original_id = invalid.id if is_original else purchase.id
    refund_id = refund.id if is_original else invalid.id
    if invalidity in {"foreign_currency", "both_foreign_currencies"}:
        invalid.currency = "USD"
    elif invalidity == "superseded_link":
        invalid.superseded_by_transaction_id = purchase.id if is_original else refund.id
    else:
        invalid.source_lifecycle_status = "superseded"
    matching_other = refund if is_original else purchase
    if invalidity == "both_foreign_currencies":
        matching_other.currency = "USD"
    await db_session.commit()

    response = await async_client.put(
        f"/api/v1/transactions/{refund_id}/settlement-match",
        headers=api_headers,
        json={"status": "user_confirmed", "original_transaction_id": original_id},
    )
    assert response.status_code == 422
    assert await db_session.scalar(select(SettlementMatch.id)) is None

    # Restore the valid side to KRW and simulate a historical invalid confirmation.
    matching_other.currency = "krw"
    invalid_match = SettlementMatch(
        original_transaction_id=original_id,
        settlement_transaction_id=refund_id,
        status="user_confirmed",
        matched_amount=100,
    )
    db_session.add(invalid_match)
    await db_session.commit()
    response = await async_client.put(
        f"/api/v1/transactions/{refund.id}/settlement-match",
        headers=api_headers,
        json={"status": "user_confirmed", "original_transaction_id": purchase.id},
    )
    assert response.status_code == 200
    assert response.json()["matched_amount"] == 100
    assert (
        await db_session.get(SettlementMatch, invalid_match.id)
    ).status == "user_confirmed"

    response = await async_client.delete(
        f"/api/v1/transactions/{refund_id}/settlement-match",
        headers=api_headers,
        params={"original_transaction_id": original_id},
    )
    assert response.status_code == 204
    assert await db_session.get(SettlementMatch, invalid_match.id) is None


async def test_legacy_window_matches_edge_drift_without_expanding_missing_scope(
    db_session,
):
    original = [
        row("outside early", seconds=0),
        row("first", seconds=1),
        row("inside missing", seconds=30),
        row("last", time=time(12, 2, 58)),
        row("outside late", time=time(12, 2, 59)),
    ]
    await import_transactions_from_workbook(
        db_session, workbook(original), "old.xlsx", DAY
    )
    first_result = await db_session.execute(
        select(Transaction.description, Transaction.id)
    )
    first_ids = dict(first_result.all())
    latest = [row("first", seconds=20), row("last", time=time(12, 2, 0))]
    result = await import_transactions_from_workbook(
        db_session, workbook(latest), "new.xlsx", DAY
    )
    stored = {
        item.description: item for item in await db_session.scalars(select(Transaction))
    }

    assert (result.status, result.tx_new, result.tx_skipped) == ("success", 0, 2)
    assert {name: item.id for name, item in stored.items()} == first_ids
    assert stored["first"].time == latest[0]["time"]
    assert stored["last"].time == latest[1]["time"]
    assert (
        stored["inside missing"].source_lifecycle_status == "missing_from_latest_export"
    )
    assert stored["outside early"].source_lifecycle_status == "active"
    assert stored["outside late"].source_lifecycle_status == "active"


async def test_legacy_upload_api_preserves_partial_transaction_result(
    async_client, api_headers, db_session, tmp_path, monkeypatch
):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    wb = load_workbook(BytesIO(workbook()))
    del wb["뱅샐현황"]
    stream = BytesIO()
    wb.save(stream)

    response = await async_client.post(
        "/api/v1/upload",
        headers=api_headers,
        files={"file": ("synthetic.xlsx", stream.getvalue())},
        data={"snapshot_date": str(DAY)},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "partial"
    assert result["transactions"] == {"total": 1, "new": 1, "skipped": 0}
    assert result["error_message"].startswith("snapshots:")
    assert await db_session.scalar(select(Transaction.description)) == "synthetic"
    assert (
        tmp_path / "uploads" / f"{result['upload_id']:06d}-synthetic.xlsx"
    ).read_bytes() == stream.getvalue()


async def test_parity_uses_source_category_currency_and_posting_refund_sign(db_session):
    period = DAY.strftime("%Y-%m")
    wb = load_workbook(
        BytesIO(workbook([row("purchase"), row("refund", amount=20, seconds=1)]))
    )
    snap = wb["뱅샐현황"]
    snap.insert_rows(1, 4)
    snap["B1"] = "2.현금흐름현황"
    snap["B2"], snap["E2"] = "항목", period
    snap["B3"] = "월수입 총계"
    snap["B4"], snap["E4"] = "기타", 80
    stream = BytesIO()
    wb.save(stream)
    data = stream.getvalue()
    await import_transactions_from_workbook(db_session, data, "benchmark.xlsx", DAY)
    purchase = await db_session.scalar(
        select(Transaction).where(Transaction.description == "purchase")
    )
    purchase.category_major_user = "user override"
    unrelated = [
        tx(name="foreign", currency="USD"),
        tx(name="other category", category_major="unrelated"),
        tx(name="transfer", type="이체"),
        tx(name="superseded flag"),
        tx(name="superseded id"),
        tx(name="manual"),
    ]
    unrelated[3].source_lifecycle_status = "superseded"
    unrelated[4].superseded_by_transaction_id = purchase.id
    unrelated[5].source = "manual"
    db_session.add_all(unrelated)
    await db_session.commit()

    report = await verify_import_parity(db_session, data, DAY)
    assert report.cashflow_benchmarks.compared_rows == 1
    assert not report.has_mismatches
    refund = await db_session.scalar(
        select(Transaction).where(Transaction.description == "refund")
    )
    refund.amount = 10
    await db_session.commit()
    report = await verify_import_parity(db_session, data, DAY)
    assert report.has_mismatches
    assert report.transaction.missing_sample_indices == [1]
    [mismatch] = report.cashflow_benchmarks.mismatches
    assert (mismatch.expected_amount, mismatch.db_amount, mismatch.delta) == (
        80,
        90,
        10,
    )
