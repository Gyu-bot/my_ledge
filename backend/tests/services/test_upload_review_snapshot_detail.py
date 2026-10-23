"""B1 value-level approval proof, synthetic SQLite and disposable PostgreSQL only."""

from copy import deepcopy
from datetime import date
from decimal import Decimal
import os
from uuid import uuid4

import pytest
from sqlalchemy import event, func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.models import Base
from app.models.asset_snapshot import AssetSnapshot
from app.models.loan import Loan
from app.models.loan_account import LoanAccount
from app.models.loan_transaction_link import LoanTransactionLink
from app.models.transaction import Transaction
from app.models.upload_log import UploadLog
from app.models.upload_review_operation import UploadReviewOperation
from app.models.user_profile_snapshot import UserProfileSnapshot
from app.parsers.snapshots import SnapshotParseResult
from app.schemas.upload import UploadPreviewSourceRow
from app.schemas.upload_review import ReviewDecision, ReviewRevision
from app.services import loan_mapping_service as loans
from app.services import upload_review_service as svc
from app.services.upload_service import replace_snapshots
from test_upload_review_service import (
    DAY,
    apply as backend_apply,
    apply_request,
    prepare as backend_prepare,
    row,
    tx,
    workbook,
)

SYNTHETIC_WORKBOOK = workbook()


async def prepare(db):
    # Keep identical XLSX bytes: ZIP timestamps change across workbook() calls.
    return await backend_prepare(db, SYNTHETIC_WORKBOOK)


async def apply(db, plan, tmp_path, **kwargs):
    return await backend_apply(db, plan, tmp_path, SYNTHETIC_WORKBOOK, **kwargs)


@pytest.fixture(autouse=True)
def synthetic_settings(monkeypatch):
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    monkeypatch.setenv("API_KEY", "test-api-key")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    get_settings.cache_clear()


@pytest.fixture(params=["sqlite", "postgresql"])
async def detail_db(request, db_session):
    if request.param == "sqlite":
        yield db_session
        return
    url = os.getenv("REVIEW_TEST_DATABASE_URL")
    if not url:
        pytest.skip("disposable synthetic PostgreSQL URL not supplied")
    parsed = make_url(url)
    assert parsed.host in {"localhost", "127.0.0.1", "::1"}
    assert parsed.port not in {None, 5432}
    assert parsed.username == parsed.database == "review_synthetic"
    schema = "review_detail_" + uuid4().hex
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(
        url, connect_args={"server_settings": {"search_path": schema}}
    )
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            yield db
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()


def snapshots():
    return SnapshotParseResult(
        asset_snapshots=[
            dict(
                side="asset",
                category="cash",
                product_name="bank",
                amount=Decimal("120"),
            )
        ],
        insurance_contracts=[
            dict(
                insurer="insurer",
                product_name="policy",
                contract_status="active",
                total_paid=Decimal("200"),
                contract_date=date(2025, 1, 1),
                maturity_date=None,
            )
        ],
        investments=[
            dict(
                product_type="stock",
                broker="broker",
                product_name="fund",
                cost_basis=Decimal("300"),
                market_value=Decimal("330"),
                return_rate=Decimal("10.1234"),
            )
        ],
        loans=[
            dict(
                loan_type="loan",
                lender="lender",
                product_name="loan",
                principal=Decimal("1000"),
                balance=Decimal("800"),
                interest_rate=Decimal("3.5"),
                start_date=date(2025, 1, 1),
                maturity_date=date(2030, 1, 1),
            )
        ],
        user_profile=dict(gender=None, age=30, credit_score_kcb=800),
    )


def source(monkeypatch, incoming, rows=None):
    values = rows if rows is not None else [row()]
    monkeypatch.setattr(
        svc,
        "parse_upload_workbook_contents",
        lambda **_: (deepcopy(values), deepcopy(incoming)),
    )


async def seed(db, incoming, day=DAY):
    await replace_snapshots(db, day, incoming)
    await db.commit()


async def assert_after(db, plan):
    for name, model in svc.SNAPSHOT_MODELS.items():
        actual = [
            svc.snapshot_semantic_row(model, r)
            for r in (
                await db.execute(
                    select(model.__table__).where(model.snapshot_date == DAY)
                )
            ).mappings()
        ]
        assert (
            svc.canonical(sorted(actual, key=svc.encoded))
            == plan.snapshot_effects["value_detail"]["tables"][name]["after"]
        )


async def sequence_state(db):
    if db.bind.dialect.name != "postgresql":
        return {}
    names = list(
        (
            await db.scalars(
                text(
                    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname=current_schema()"
                )
            )
        ).all()
    )
    return {
        name: tuple(
            (
                await db.execute(text(f'SELECT last_value, is_called FROM "{name}"'))
            ).one()
        )
        for name in names
    }


@pytest.mark.parametrize("manual_payment", [Decimal("777"), None])
async def test_same_count_all_values_metadata_and_no_prepare_writes(
    detail_db, monkeypatch, tmp_path, manual_payment
):
    db = detail_db
    incoming = snapshots()
    old = snapshots()
    old.asset_snapshots[0]["amount"] = Decimal("10")
    old.insurance_contracts[0]["total_paid"] = Decimal("20")
    old.investments[0]["market_value"] = Decimal("30")
    old.loans[0]["balance"] = Decimal("40")
    old.user_profile["age"] = 20
    await seed(db, old)
    await db.execute(
        update(AssetSnapshot).values(liquidity_tier="locked", is_cash_equivalent=False)
    )
    await db.execute(
        update(Loan).values(
            monthly_payment=manual_payment,
            monthly_payment_source="manual",
            repayment_method="bullet",
            repayment_method_source="manual",
        )
    )
    await db.commit()
    source(monkeypatch, incoming)
    before = await svc.state_digest(db)
    sequences = await sequence_state(db)
    statements = []

    def capture(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement.lower())

    event.listen(db.bind.sync_engine, "before_cursor_execute", capture)
    try:
        plan = await prepare(db)
    finally:
        event.remove(db.bind.sync_engine, "before_cursor_execute", capture)
    assert await svc.state_digest(db) == before
    assert await sequence_state(db) == sequences
    assert not any(
        "savepoint" in statement or "nextval" in statement for statement in statements
    )
    mutations = [
        s
        for s in statements
        if s.lstrip().startswith(("insert ", "update ", "delete "))
    ]
    assert mutations and all("upload_review_operations" in s for s in mutations)
    effects = plan.snapshot_effects
    assert (
        effects["existing_counts"]
        == effects["incoming_counts"]
        == effects["final_counts"]
        == {name: 1 for name in svc.SNAPSHOT_MODELS}
    )
    detail = effects["value_detail"]
    assert detail["version"] == 1
    for name, model in svc.SNAPSHOT_MODELS.items():
        table = detail["tables"][name]
        assert table["fields"] == [
            c.name
            for c in model.__table__.columns
            if c.name not in {"id", "created_at", "updated_at"}
        ]
        for phase in ("before", "latest", "incoming", "after"):
            assert all(set(r) == set(table["fields"]) for r in table[phase])
        assert table["before"] == table["latest"]
        assert table["before"] != table["after"]
        assert table["after"][0]["snapshot_date"] == {
            "$type": "date",
            "$value": str(DAY),
        }
    asset = detail["tables"]["asset_snapshots"]
    assert asset["incoming"][0]["liquidity_tier"] is None
    assert asset["after"][0]["liquidity_tier"] == "locked"
    assert asset["after"][0]["is_cash_equivalent"] is False
    loan = detail["tables"]["loans"]
    assert loan["incoming"][0]["monthly_payment"] is None
    assert loan["after"][0]["monthly_payment"] == svc.canonical(manual_payment)
    assert loan["after"][0]["repayment_method_source"] == "manual"
    done = await apply(db, plan, tmp_path)
    assert done.result.snapshot_verified
    await assert_after(db, plan)
    assert (
        await svc.get_review(db, plan.operation_id)
    ).model_dump() == done.model_dump()


@pytest.mark.parametrize("same_day", [True, False])
async def test_zero_replacement_optional_profile_latest_and_prior_metadata(
    detail_db, monkeypatch, tmp_path, same_day
):
    db = detail_db
    prior = DAY if same_day else date(2026, 9, 23)
    await seed(db, snapshots(), prior)
    source(
        monkeypatch, SnapshotParseResult(asset_snapshots=[], investments=[], loans=[])
    )
    plan = await prepare(db)
    for name, table in plan.snapshot_effects["value_detail"]["tables"].items():
        assert len(table["latest"]) == 1
        assert table["latest"][0]["snapshot_date"] == svc.canonical(prior)
        assert len(table["before"]) == int(same_day)
        assert table["incoming"] == []
        assert len(table["after"]) == int(name == "user_profile_snapshots" and same_day)
    done = await apply(db, plan, tmp_path)
    assert done.result.snapshot_counts["user_profile_snapshots"] == int(same_day)
    await assert_after(db, plan)
    assert await db.scalar(select(func.count()).select_from(UserProfileSnapshot)) == 1


async def test_prior_asset_metadata_and_duplicate_raw_evidence(
    detail_db, monkeypatch, tmp_path
):
    db = detail_db
    old = snapshots()
    await seed(db, old, date(2026, 8, 23))
    await db.execute(
        update(AssetSnapshot).values(liquidity_tier="locked", is_cash_equivalent=True)
    )
    # Nearest explicit null/false wins, never resurrect older user values.
    await seed(db, old, date(2026, 9, 23))
    await db.execute(
        update(AssetSnapshot)
        .where(AssetSnapshot.snapshot_date == date(2026, 9, 23))
        .values(liquidity_tier=None, is_cash_equivalent=False)
    )
    await db.commit()
    incoming = snapshots()
    source(monkeypatch, incoming)
    plan = await prepare(db)
    table = plan.snapshot_effects["value_detail"]["tables"]["asset_snapshots"]
    assert table["before"] == [] and table["after"][0]["liquidity_tier"] is None
    assert table["after"][0]["is_cash_equivalent"] is False
    await apply(db, plan, tmp_path)
    await assert_after(db, plan)
    # Raw occurrences remain disclosed; normalized duplicate names are not identities.
    incoming.asset_snapshots.append(deepcopy(incoming.asset_snapshots[0]))
    source(monkeypatch, incoming)
    # Use the same selected day so exact stored names follow the legacy same-day policy.
    duplicate = await prepare(db)
    detail = duplicate.snapshot_effects["value_detail"]
    assert [r["product_name"] for r in detail["raw_snapshots"]["asset_snapshots"]] == [
        "bank",
        "bank",
    ]
    assert {
        r["product_name"] for r in detail["tables"]["asset_snapshots"]["incoming"]
    } == {"bank", "bank (2)"}
    await apply(db, duplicate, tmp_path)
    await assert_after(db, duplicate)


@pytest.mark.parametrize("change", ["amount", "date_out", "date_in"])
async def test_revision_reprojects_linked_loan_effects(
    detail_db, monkeypatch, tmp_path, change
):
    db = detail_db
    incoming = snapshots()
    account = LoanAccount(lender="lender", product_name="loan", loan_kind="overdraft")
    transactions = [
        tx(name=f"repayment-{m}", amount=-(m - 6) * 100, date=date(2026, m, 10))
        for m in (7, 8, 9)
    ]
    if change == "date_in":
        transactions[-1].date = date(2026, 10, 10)
    db.add_all([account, *transactions])
    await db.flush()
    db.add_all(
        [
            LoanTransactionLink(
                transaction_id=t.id, loan_account_id=account.id, repayment_type="mixed"
            )
            for t in transactions
        ]
    )
    await db.commit()
    target = transactions[-1].id
    changed = row(
        "repayment-9",
        amount=-600 if change == "amount" else -300,
        date=date(2026, 10, 10) if change == "date_out" else date(2026, 9, 10),
    )
    source(monkeypatch, incoming, [changed])
    # Explicit synthetic candidate graph isolates apply/revision overlay wiring.
    # Production matching is unchanged and need not offer a date/amount correction.
    from app.schemas.upload_review import ReviewEntry

    async def candidate_graph(_db, _rows):
        return [
            ReviewEntry(
                entry_id="1",
                change_type="possible_replacement",
                reason="synthetic explicit candidate",
                existing_source=UploadPreviewSourceRow.model_validate(
                    row("repayment-9", date=date(2026, 9, 10))
                ).model_dump(),
                incoming_source=UploadPreviewSourceRow.model_validate(
                    changed
                ).model_dump(),
                candidates=[
                    {
                        "transaction_id": target,
                        "source": UploadPreviewSourceRow.model_validate(
                            row("repayment-9", date=date(2026, 9, 10))
                        ).model_dump(),
                    }
                ],
                field_changes=[],
                allowed_actions=["keep", "add", "update"],
                recommended_action="keep",
                recommended_target_id=None,
            )
        ]

    monkeypatch.setattr(svc, "build_review_entries", candidate_graph)
    plan = await prepare(db)
    before = plan.snapshot_effects["value_detail"]["tables"]["loans"]["after"][0]
    assert before["monthly_payment"] == svc.canonical(
        Decimal("150") if change == "date_in" else Decimal("200")
    )
    state = await svc.state_digest(db)
    sequences = await sequence_state(db)
    revised = await svc.revise_review(
        db,
        plan.operation_id,
        ReviewRevision(
            plan_digest=plan.plan_digest,
            decisions=[ReviewDecision(entry_id="1", action="update", target_id=target)],
        ),
    )
    assert await svc.state_digest(db) == state
    assert await sequence_state(db) == sequences
    assert revised.version == 2 and revised.plan_digest != plan.plan_digest
    after = revised.snapshot_effects["value_detail"]["tables"]["loans"]["after"][0]
    assert after["monthly_payment"] == svc.canonical(
        {
            "amount": Decimal("300"),
            "date_out": Decimal("150"),
            "date_in": Decimal("200"),
        }[change]
    )
    assert after["repayment_method"] == "principal_interest"
    assert revised.snapshot_effects != plan.snapshot_effects
    assert (await prepare(db)).model_dump() == revised.model_dump()
    with pytest.raises(svc.ReviewError):
        await apply(db, plan, tmp_path)
    done = await apply(db, revised, tmp_path)
    assert done.result.snapshot_verified
    await assert_after(db, revised)
    stored = await db.get(Transaction, target, populate_existing=True)
    assert stored.amount == changed["amount"] and stored.date == changed["date"]


@pytest.mark.parametrize("corruption", ["source", "asset_metadata", "loan_estimate"])
async def test_actual_same_count_corruption_rolls_back(
    detail_db, monkeypatch, tmp_path, corruption
):
    db = detail_db
    source(monkeypatch, snapshots())
    plan = await prepare(db)
    state = await svc.state_digest(db)
    original = svc.apply_loan_repayment_estimates_for_latest_snapshots

    async def corrupt(db, **kwargs):
        await original(db, **kwargs)
        if corruption == "source":
            await db.execute(update(AssetSnapshot).values(amount=999))
        elif corruption == "asset_metadata":
            await db.execute(update(AssetSnapshot).values(liquidity_tier="locked"))
        else:
            await db.execute(
                update(Loan).values(
                    monthly_payment=999,
                    monthly_payment_source="estimated_from_linked_transactions",
                )
            )

    monkeypatch.setattr(
        svc, "apply_loan_repayment_estimates_for_latest_snapshots", corrupt
    )
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db, plan, tmp_path)
    assert exc.value.code == "snapshot_verification_failed"
    assert await svc.state_digest(db) == state
    assert (await svc.get_review(db, plan.operation_id)).status == "prepared"
    assert await db.scalar(select(func.count()).select_from(UploadLog)) == 0


async def test_projection_drift_and_old_prepared_fail_closed_historical_replay(
    detail_db, monkeypatch, tmp_path
):
    db = detail_db
    source(monkeypatch, snapshots())
    plan = await prepare(db)
    original = svc.project_loan_repayment_estimates

    async def drift(*args, **kwargs):
        rows = await original(*args, **kwargs)
        rows[0]["monthly_payment"] = Decimal("999")
        return rows

    monkeypatch.setattr(svc, "project_loan_repayment_estimates", drift)
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db, plan, tmp_path)
    assert exc.value.code == "snapshot_policy_changed"
    monkeypatch.setattr(svc, "project_loan_repayment_estimates", original)
    op = await db.get(UploadReviewOperation, plan.operation_id)
    payload = deepcopy(op.payload)
    payload["snapshot_effects"].pop("value_detail")
    payload["plan_digest"] = svc.plan_digest(payload, op.state_digest)
    op.payload, op.plan_digest = payload, payload["plan_digest"]
    await db.commit()
    old = await svc.get_review(db, plan.operation_id)
    with pytest.raises(svc.ReviewError) as exc:
        await apply(db, old, tmp_path)
    assert exc.value.code == "snapshot_detail_required"
    with pytest.raises(svc.ReviewError) as exc:
        await svc.revise_review(
            db,
            old.operation_id,
            ReviewRevision(plan_digest=old.plan_digest, decisions=old.decisions),
        )
    assert exc.value.code == "snapshot_detail_required"
    new = await prepare(db)
    assert new.operation_id != old.operation_id
    done = await apply(db, new, tmp_path)
    # Historical applied no-detail GET and exact replay remain available.
    op = await db.get(UploadReviewOperation, done.operation_id)
    payload = deepcopy(op.payload)
    payload["snapshot_effects"].pop("value_detail")
    op.payload = payload
    await db.commit()
    historical = await svc.get_review(db, done.operation_id)
    assert historical.status == "applied"
    assert (
        await apply(db, new, tmp_path, request=apply_request(new))
    ).model_dump() == historical.model_dump()


async def test_numeric_storage_scale_is_disclosed_and_verified(
    detail_db, monkeypatch, tmp_path
):
    incoming = snapshots()
    incoming.asset_snapshots[0]["amount"] = Decimal("120.125")
    incoming.insurance_contracts[0]["total_paid"] = Decimal("200.125")
    incoming.investments[0]["return_rate"] = Decimal("10.12345")
    incoming.loans[0]["interest_rate"] = Decimal("3.555")
    source(monkeypatch, incoming)
    plan = await prepare(detail_db)
    for name, field, before, after in (
        ("asset_snapshots", "amount", "120.125", "120.13"),
        ("insurance_contracts", "total_paid", "200.125", "200.13"),
        ("investments", "return_rate", "10.12345", "10.1235"),
        ("loans", "interest_rate", "3.555", "3.56"),
    ):
        table = plan.snapshot_effects["value_detail"]["tables"][name]
        assert table["incoming"][0][field] == svc.canonical(Decimal(before))
        assert table["after"][0][field] == svc.canonical(Decimal(after))
    done = await apply(detail_db, plan, tmp_path)
    assert done.result.snapshot_verified
    await assert_after(detail_db, plan)


def test_shared_loan_manual_null_and_estimate_clear_rules():
    none = dict(monthly_totals=[], monthly_types=[], observation_months=[])
    current = dict(
        monthly_payment=None,
        monthly_payment_source="manual",
        repayment_method="bullet",
        repayment_method_source="manual",
    )
    assert (
        loans.loan_repayment_estimate_values(
            current, none, min_observations=3, loan_kind=None
        )
        == current
    )
    estimated = dict(
        monthly_payment=Decimal("200"),
        monthly_payment_source="estimated_from_linked_transactions",
        repayment_method="principal_interest",
        repayment_method_source="estimated_from_linked_transactions",
    )
    assert loans.loan_repayment_estimate_values(
        estimated, none, min_observations=3, loan_kind=None
    ) == dict.fromkeys(estimated)
