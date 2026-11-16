"""Retired inputs fail loudly; ordinary writes never reclassify a transaction."""

import ast
from datetime import date, time
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models.auto_classification import (
    AutoClassificationSettings,
    CategoryClassificationRule,
    RecurringCategoryRule,
)
from app.models.nature_axes import TransactionNatureOverride
from app.models.transaction import Transaction
from app.services.auto_classification_service import (
    apply_enabled_auto_classification_after_upload,
)

OLD = (
    "cost_kind",
    "fixed_cost_necessity",
    "spend_necessity",
    "cost_classification_source",
    "recurring_payment_kind",
)
VALUES = ("fixed", "essential", "essential", "manual", "monthly_recurring")


@pytest.mark.parametrize("field,value", zip(OLD, VALUES, strict=True))
async def test_retired_transaction_inputs_are_422(
    async_client, api_headers, field, value
):
    base = {
        "date": "2026-01-05",
        "time": "12:00:00",
        "type": "지출",
        "category_major": "synthetic-category",
        "description": "synthetic-merchant",
        "amount": -100,
    }
    for method, path, payload in (
        ("POST", "/api/v1/transactions", base | {field: value}),
        ("PATCH", "/api/v1/transactions/1", {field: value}),
        ("PATCH", "/api/v1/transactions/bulk-update", {"ids": [1], field: value}),
    ):
        r = await async_client.request(method, path, json=payload, headers=api_headers)
        assert r.status_code == 422
        assert r.json()["detail"][0]["type"] == "extra_forbidden"
    r = await async_client.get("/api/v1/transactions", params={field: value})
    assert r.status_code == 422


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/analytics/fixed-cost-summary"),
        ("GET", "/analytics/fixed-cost-trend"),
        ("GET", "/analytics/recurring-payments"),
        ("GET", "/auto-classification/category-rules"),
        ("POST", "/auto-classification/category-rules"),
        ("DELETE", "/auto-classification/category-rules/1"),
        ("POST", "/auto-classification/apply/category-rules"),
        ("GET", "/auto-classification/recurring-category-rules"),
        ("POST", "/auto-classification/recurring-category-rules"),
        ("DELETE", "/auto-classification/recurring-category-rules/1"),
        ("GET", "/auto-classification/recurring-category-rules/dry-run"),
        ("POST", "/auto-classification/apply/recurring-category-rules"),
        ("POST", "/auto-classification/apply/recurring-dry-run"),
    ],
)
async def test_retired_surfaces_are_404(async_client, api_headers, method, path):
    for headers in ({}, api_headers):
        r = await async_client.request(
            method, "/api/v1" + path, json={}, headers=headers
        )
        assert r.status_code == 404


async def test_new_axis_and_ordinary_writes_leave_old_columns_frozen(
    async_client, api_headers, db_session
):
    tx = Transaction(
        date=date(2026, 1, 5),
        time=time(12),
        type="지출",
        category_major="synthetic-category",
        description="synthetic-merchant",
        merchant="synthetic-merchant",
        amount=-100,
        **dict(zip(OLD, VALUES, strict=True)),
    )
    db_session.add_all(
        [
            tx,
            AutoClassificationSettings(
                id=1,
                apply_cost_rules_on_upload=True,
                apply_recurring_rules_on_upload=True,
            ),
            CategoryClassificationRule(
                category_major="synthetic-category", cost_kind="variable"
            ),
            RecurringCategoryRule(
                category_major="synthetic-category",
                recurring_payment_kind="not_recurring",
            ),
        ]
    )
    await db_session.commit()
    before = tuple(getattr(tx, field) for field in OLD)
    r = await async_client.put(
        f"/api/v1/nature/transactions/{tx.id}/adjustability",
        json={"adjustability": "adjustable"},
        headers=api_headers,
    )
    assert r.status_code == 200
    for path, payload in [
        (f"/api/v1/transactions/{tx.id}", {"memo": "synthetic-note"}),
        (
            "/api/v1/transactions/bulk-update",
            {"ids": [tx.id], "merchant": "synthetic-normalized"},
        ),
    ]:
        r = await async_client.patch(path, json=payload, headers=api_headers)
        assert r.status_code == 200
    await apply_enabled_auto_classification_after_upload(db_session)
    await db_session.refresh(tx)
    assert tuple(getattr(tx, field) for field in OLD) == before
    override = await db_session.get(TransactionNatureOverride, tx.id)
    assert override.adjustability == "adjustable"
    r = await async_client.post(
        "/api/v1/transactions",
        json={
            "date": "2026-01-06",
            "time": "12:00",
            "type": "지출",
            "category_major": "synthetic-category",
            "description": "synthetic-new",
            "amount": -200,
        },
        headers=api_headers,
    )
    assert r.status_code == 201
    new = await db_session.get(Transaction, r.json()["id"])
    assert all(getattr(new, field) is None for field in OLD)
    assert (
        await db_session.scalar(
            select(TransactionNatureOverride).where(
                TransactionNatureOverride.transaction_id == new.id
            )
        )
        is None
    )
    assert not set(OLD) & r.json().keys()


def test_no_runtime_legacy_assignment_or_copy_path():
    root = Path(__file__).resolve().parents[2] / "app"
    for path in root.rglob("*.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            # ORM declarations are historical schema metadata, never assignments to rows.
            if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store):
                assert node.attr not in OLD, str(path)
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "Transaction"
            ):
                assert not set(OLD) & {kw.arg for kw in node.keywords}, str(path)
    copier = (
        (root / "services/upload_apply_service.py")
        .read_text()
        .split("def _copy_user_managed_fields", 1)[1]
        .split("async def _move_transaction_relationships", 1)[0]
    )
    assert not any(f'"{field}"' in copier for field in OLD)
