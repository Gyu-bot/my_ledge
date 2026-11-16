"""T056 two-axis nature: precedence, write-through, and re-import (SQLite views).

Synthetic data only; no real categories or merchants.
"""

from legacy_nature_seed import legacy_transaction

from datetime import date, time

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.installment_plan import InstallmentPlan
from app.models.installment_transaction_link import InstallmentTransactionLink
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.nature_axes import (
    CategoryAdjustabilityDefault,
    RecurringCommitment,
    TransactionNatureOverride,
)
from app.models.transaction import Transaction
from app.parsers.transactions import TransactionRow
from app.schemas.upload import UploadApplyRequest, UploadApplySelection
from app.services.metric_views import (
    FLOW_LINES_VIEW,
    MONTHLY_FLOW_SUMMARY_VIEW,
    SPEND_CUBE_VIEW,
    TRANSACTION_NATURE_VIEW,
)
from metric_synthetic_ledger import build_synthetic_ledger
from app.services.upload_apply_service import apply_transaction_upload_from_rows
from app.services.upload_preview_service import preview_transaction_upload_from_rows

HEADERS = {"X-API-Key": "test-api-key"}


def tx(
    merchant: str,
    amount: int = -10_000,
    *,
    tx_date: date = date(2026, 2, 10),
    tx_type: str = "지출",
    major: str = "cat-a",
    minor: str | None = None,
    **fields: object,
) -> Transaction:
    return legacy_transaction(
        date=tx_date,
        time=time(12, 0),
        type=tx_type,
        category_major=major,
        category_minor=minor,
        description=merchant,
        merchant=merchant,
        amount=amount,
        currency="KRW",
        payment_method="card-a",
        **fields,
    )


async def nature_rows(db_session: AsyncSession) -> dict[int, dict]:
    view = TRANSACTION_NATURE_VIEW
    return {
        int(row["transaction_id"]): dict(row)
        for row in (await db_session.execute(select(view))).mappings()
    }


async def test_adjustability_precedence_and_levels(db_session: AsyncSession) -> None:
    loan = LoanAccount(lender="lender-x", product_name="product-x")
    plan = InstallmentPlan(
        display_name="plan-x",
        merchant="shop-i",
        total_installments=3,
        monthly_amount=10_000,
        first_payment_date=date(2026, 1, 1),
    )
    merchant_bundle = RecurringCommitment(
        match_scope="merchant",
        merchant="m-commit",
        category_major="cat-c",
        adjustability="protected",
        origin="user",
    )
    category_bundle = RecurringCommitment(
        match_scope="category",
        category_major="cat-c",
        adjustability="adjustable",
        origin="user",
    )
    undecided_bundle = RecurringCommitment(
        match_scope="merchant",
        merchant="m-open",
        category_major="cat-d",
        category_minor="minor-y",
        origin="user",
    )
    ended_bundle = RecurringCommitment(
        match_scope="merchant",
        merchant="m-ended",
        category_major="cat-a",
        adjustability="protected",
        start_date=date(2025, 1, 1),
        end_date=date(2026, 1, 31),
        origin="user",
    )
    db_session.add_all(
        [
            loan,
            plan,
            merchant_bundle,
            category_bundle,
            undecided_bundle,
            ended_bundle,
            CategoryAdjustabilityDefault(
                category_major="cat-d", category_minor=None, adjustability="adjustable"
            ),
            CategoryAdjustabilityDefault(
                category_major="cat-d",
                category_minor="minor-x",
                adjustability="protected",
            ),
        ]
    )
    rows = {
        "default_exact": tx("m-1", major="cat-d", minor="minor-x"),
        "default_major": tx("m-2", major="cat-d", minor="minor-z"),
        "commitment": tx("m-commit", major="cat-c"),
        "transaction_wins": tx("m-commit", major="cat-c"),
        "category_scope": tx("m-other", major="cat-c"),
        "commitment_null_falls_to_default": tx(
            "m-open", major="cat-d", minor="minor-y"
        ),
        "loan": tx("lender-x", major="cat-c"),
        "installment": tx("shop-i", major="cat-c"),
        "ended": tx("m-ended", tx_date=date(2026, 2, 10)),
        "before_end": tx("m-ended", tx_date=date(2026, 1, 10)),
        "excluded": tx("m-commit", major="cat-c"),
        "none": tx("m-none"),
        "income": tx("payer", 3_000_000, tx_type="수입"),
        "transfer": tx("own", -50_000, tx_type="이체"),
    }
    db_session.add_all(rows.values())
    await db_session.flush()
    ids = {key: row.id for key, row in rows.items()}
    db_session.add_all(
        [
            LoanTransactionLink(transaction_id=ids["loan"], loan_account_id=loan.id),
            InstallmentTransactionLink(
                transaction_id=ids["installment"],
                installment_plan_id=plan.id,
                installment_number=1,
            ),
            TransactionNatureOverride(
                transaction_id=ids["transaction_wins"],
                adjustability="adjustable",
                source="user",
            ),
            # A link fixes protected even over a transaction-level value.
            TransactionNatureOverride(
                transaction_id=ids["loan"], adjustability="adjustable", source="user"
            ),
            TransactionNatureOverride(
                transaction_id=ids["excluded"],
                excluded_from_commitments=True,
                source="user",
            ),
            # Income never becomes undecided or adjustable, whatever is stored.
            TransactionNatureOverride(
                transaction_id=ids["income"], adjustability="adjustable", source="user"
            ),
        ]
    )
    await db_session.commit()

    nature = await nature_rows(db_session)

    def axes(key: str) -> tuple:
        row = nature[ids[key]]
        return (
            row["payment_form"],
            row["commitment_kind"],
            row["recurring_commitment_id"],
            row["adjustability"],
            row["adjustability_source"],
        )

    assert axes("default_exact") == (
        "ad_hoc",
        None,
        None,
        "protected",
        "category_default",
    )
    assert axes("default_major") == (
        "ad_hoc",
        None,
        None,
        "adjustable",
        "category_default",
    )
    assert axes("commitment") == (
        "committed",
        "recurring",
        merchant_bundle.id,
        "protected",
        "commitment",
    )
    assert axes("transaction_wins") == (
        "committed",
        "recurring",
        merchant_bundle.id,
        "adjustable",
        "transaction",
    )
    # Merchant scope wins over category scope; others fall to category scope.
    assert axes("category_scope") == (
        "committed",
        "recurring",
        category_bundle.id,
        "adjustable",
        "commitment",
    )
    assert axes("commitment_null_falls_to_default") == (
        "committed",
        "recurring",
        undecided_bundle.id,
        "adjustable",
        "category_default",
    )
    assert axes("loan") == ("committed", "loan", None, "protected", "fixed_loan")
    assert axes("installment") == (
        "committed",
        "installment",
        None,
        "protected",
        "fixed_installment",
    )
    assert axes("ended") == ("ad_hoc", None, None, "undecided", "none")
    assert axes("before_end") == (
        "committed",
        "recurring",
        ended_bundle.id,
        "protected",
        "commitment",
    )
    assert axes("excluded")[:3] == ("ad_hoc", None, None)
    assert axes("none") == ("ad_hoc", None, None, "undecided", "none")
    for key in ("income", "transfer"):
        assert axes(key) == (
            "not_applicable",
            None,
            None,
            "not_applicable",
            "not_applicable",
        )
    level_row = nature[ids["transaction_wins"]]
    assert level_row["transaction_adjustability"] == "adjustable"
    assert level_row["commitment_adjustability"] == "protected"
    assert nature[ids["default_exact"]]["category_default_adjustability"] == (
        "protected"
    )

    # Income and transfers are never undecided in the flow table either.
    lines = (await db_session.execute(select(FLOW_LINES_VIEW))).mappings().all()
    for line in lines:
        if line["type"] != "지출":
            assert line["adjustability"] == "not_applicable"
            assert line["flow_section"] in {"income", "transfer"}
    summary = (await db_session.execute(select(MONTHLY_FLOW_SUMMARY_VIEW))).mappings()
    february = next(row for row in summary if row["period"] == "2026-02")
    # ended + excluded + none; the January row is inside the ended bundle.
    assert february["adjustability_undecided_total"] == 30_000
    assert february["committed_recurring_total"] == 40_000


async def test_reimport_replacement_keeps_new_classification(
    db_session: AsyncSession,
) -> None:
    existing = tx(
        "old-text", -120_000, tx_date=date(2026, 3, 29), major="cat-s", minor="m"
    )
    existing.time = time(11, 0)
    existing.source_row_hash = None
    db_session.add(existing)
    await db_session.flush()
    bundle = RecurringCommitment(
        match_scope="merchant",
        merchant="old-text",
        category_major="cat-s",
        category_minor="m",
        adjustability="protected",
        origin="user",
    )
    db_session.add(bundle)
    db_session.add(
        TransactionNatureOverride(
            transaction_id=existing.id, adjustability="adjustable", source="user"
        )
    )
    await db_session.commit()
    assert (await nature_rows(db_session))[existing.id]["recurring_commitment_id"] == (
        bundle.id
    )

    incoming: list[TransactionRow] = [
        {
            "date": date(2026, 3, 29),
            "time": time(14, 30),
            "type": "지출",
            "category_major": "cat-s",
            "category_minor": "m",
            "description": "new-text",
            "merchant": "new-text",
            "amount": -120_000,
            "currency": "KRW",
            "payment_method": "card-a",
            "memo": None,
        }
    ]
    preview = await preview_transaction_upload_from_rows(db_session, incoming)
    change = preview.review_required_changes[0]
    assert change.change_type == "possible_replacement"
    await apply_transaction_upload_from_rows(
        db_session=db_session,
        parsed_rows=incoming,
        filename="replacement.xlsx",
        snapshot_date=date(2026, 3, 29),
        apply_request=UploadApplyRequest(
            confirmation=True,
            selections=[
                UploadApplySelection(
                    change_type=change.change_type,
                    source_row_hash=change.source_row_hash or "",
                    existing_transaction_id=change.existing_transaction_id,
                )
            ],
        ),
    )
    replacement = await db_session.scalar(
        select(Transaction).where(Transaction.id != existing.id)
    )
    assert replacement is not None and replacement.merchant == "new-text"
    assert await db_session.get(TransactionNatureOverride, existing.id) is None
    nature = await nature_rows(db_session)
    assert existing.id not in nature  # superseded rows leave the views
    row = nature[replacement.id]
    # The replacement's merchant no longer matches the bundle rule, so the
    # membership is pinned explicitly; the transaction-level value moved too.
    assert row["recurring_commitment_id"] == bundle.id
    assert row["commitment_match"] == "explicit"
    assert (row["adjustability"], row["adjustability_source"]) == (
        "adjustable",
        "transaction",
    )


async def test_explain_equals_view_and_cube_sums_match(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    ledger = await build_synthetic_ledger(db_session)
    view = {
        int(row["transaction_id"]): row
        for row in (
            await db_session.execute(select(TRANSACTION_NATURE_VIEW))
        ).mappings()
    }
    for transaction_id in ledger.ids.values():
        body = (
            await async_client.get(
                f"/api/v1/nature/transactions/{transaction_id}", headers=HEADERS
            )
        ).json()
        row = view.get(transaction_id)
        assert body["effective"] == (row is not None)
        if row is None:
            assert body["adjustability"] is None
            continue
        assert body["payment_form"] == row["payment_form"]
        assert body["commitment_kind"] == row["commitment_kind"]
        assert body["adjustability"] == row["adjustability"]
        assert body["adjustability_source"] == row["adjustability_source"]
        assert (body["commitment"] or {}).get("id") == row["recurring_commitment_id"]

    cube = await async_client.get(
        "/api/v1/metrics/spend-cube",
        params={"group_by": "adjustability"},
        headers=HEADERS,
    )
    by_adjustability = {
        row["adjustability"]: row["amount"] for row in cube.json()["rows"]
    }
    view_cube: dict[str, int] = {}
    for row in (await db_session.execute(select(SPEND_CUBE_VIEW))).mappings():
        view_cube[row["adjustability"]] = view_cube.get(row["adjustability"], 0) + int(
            row["amount"]
        )
    assert by_adjustability == view_cube
    assert "not_applicable" not in by_adjustability
