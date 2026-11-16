"""Agent read surface (T060): contracts, states, scenarios, deprecation marks."""

import sys
from datetime import date, time
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

from app.main import app  # noqa: E402
from app.models.loan import Loan  # noqa: E402
from app.models.nature_axes import CategoryAdjustabilityDefault  # noqa: E402
from app.models.transaction import Transaction  # noqa: E402
from read_surface_ledger import (  # noqa: E402
    GAP_PERIOD,
    LAST_CLOSED_PERIOD,
    build_read_surface_ledger,
)
from read_surface_scenarios import answer_questions  # noqa: E402

READ_PATHS = [
    "/api/v1/read/index",
    "/api/v1/read/monthly-flow",
    "/api/v1/read/spend-cube",
    "/api/v1/read/comparison/monthly-flow",
    "/api/v1/read/comparison/contributions",
    "/api/v1/read/review-items",
    "/api/v1/read/commitments",
    "/api/v1/read/data-status",
]
ENVELOPE_PATHS = READ_PATHS[1:]
ENVELOPE_KEYS = {
    "surface",
    "surface_label",
    "read_surface_version",
    "questions",
    "status",
    "status_label",
    "status_reasons",
    "as_of",
    "period_scope",
    "classification",
    "basis",
    "labels",
    "data",
}
DATA_KEYS = {
    "/api/v1/read/monthly-flow": {"items"},
    "/api/v1/read/spend-cube": {
        "group_by",
        "filters",
        "total_amount",
        "row_count",
        "truncated",
        "rows",
    },
    "/api/v1/read/comparison/monthly-flow": {"comparison", "measures", "residual_rate"},
    "/api/v1/read/comparison/contributions": {
        "comparison",
        "adjustability",
        "level",
        "category",
        "ordering",
        "target_total",
        "baseline_total",
        "change_total",
        "items",
        "twelve_month_window",
        "twelve_month_items",
    },
    "/api/v1/read/review-items": {
        "period",
        "start_date",
        "end_date",
        "ordering",
        "total",
        "truncated",
        "items",
        "comparison",
    },
    "/api/v1/read/commitments": {
        "period",
        "period_month_status",
        "totals",
        "counts_by_state",
        "items",
    },
    "/api/v1/read/data-status": {
        "transaction_coverage",
        "closed_periods",
        "in_progress_period",
        "snapshots",
        "classification",
        "coverage_gaps",
        "periods",
        "excluded_currency",
        "non_krw_transaction_count",
        "month_end_forecast",
    },
}
AS_OF_KEYS = {
    "transaction_as_of",
    "first_transaction_date",
    "last_closed_period",
    "in_progress_period",
    "snapshot_as_of",
}
SNAPSHOT_KINDS = {"assets", "loans", "investments", "insurance", "profile"}
PERIOD_STATE_KEYS = {
    "period",
    "coverage",
    "coverage_label",
    "month_status",
    "status",
    "status_label",
    "transaction_count",
    "total_outflow",
    "adjustability_undecided_total",
    "adjustability_undecided_share",
}
COMMITMENT_KEYS = {
    "commitment_key",
    "kind",
    "kind_label",
    "source_id",
    "name",
    "lifecycle",
    "lifecycle_label",
    "lifecycle_detail",
    "cycle",
    "cycle_label",
    "monthly_burden",
    "monthly_burden_basis",
    "monthly_burden_basis_label",
    "monthly_burden_source",
    "start_date",
    "end_date",
    "total_count",
    "remaining_count",
    "linked_count",
    "adjustability",
    "adjustability_label",
    "adjustability_basis",
    "last_observed_period",
    "last_observed_amount",
    "observation",
}
OBSERVATION_KEYS = {
    "period",
    "state",
    "state_label",
    "reason",
    "reason_label",
    "observed_amount",
    "observed_transaction_count",
    "transaction_ids",
}
REVIEW_ITEM_KEYS = {
    "subject",
    "subject_label",
    "period",
    "date",
    "transaction_id",
    "category",
    "merchant",
    "amount",
    "baseline_amount",
    "change_amount",
    "review_status",
    "listed_because",
}
STATUS_VALUES = {"ok", "classification_incomplete", "no_transactions", "not_imported"}


@pytest.fixture
async def ledger(db_session: AsyncSession):
    return await build_read_surface_ledger(db_session)


def _assert_ints(value: object, path: str = "") -> None:
    """Amount-like keys are integers (never strings or floats)."""
    if isinstance(value, dict):
        for key, item in value.items():
            if (
                key.endswith(("_total", "_amount", "amount", "_burden"))
                and item is not None
                and not isinstance(item, dict)
            ):
                assert isinstance(item, int) and not isinstance(item, bool), (
                    f"{path}.{key}={item!r}"
                )
            _assert_ints(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _assert_ints(item, f"{path}[{index}]")


# --------------------------------------------------------------------------
# Auth, shape contracts, formats.
# --------------------------------------------------------------------------


@pytest.mark.parametrize("path", READ_PATHS)
async def test_read_surface_requires_api_key(async_client: AsyncClient, path: str):
    missing = await async_client.get(path)
    wrong = await async_client.get(path, headers={"X-API-Key": "wrong"})
    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert missing.json() == {"detail": "Invalid API key."}


@pytest.mark.parametrize("path", ENVELOPE_PATHS)
async def test_envelope_and_data_shapes_are_frozen(
    async_client: AsyncClient, api_headers: dict[str, str], ledger, path: str
):
    response = await async_client.get(path, headers=api_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) >= ENVELOPE_KEYS
    assert body["read_surface_version"] == "read_surface.v1"
    assert body["status"] in STATUS_VALUES
    assert body["status_label"]
    assert set(body["as_of"]) == AS_OF_KEYS
    assert set(body["as_of"]["snapshot_as_of"]) == SNAPSHOT_KINDS
    assert set(body["basis"]) == {
        "definition",
        "scope",
        "rules",
        "field_scopes",
        "assumptions",
    }
    assert all(isinstance(item, str) for item in body["basis"]["assumptions"])
    assert set(body["data"]) >= DATA_KEYS[path]
    for state in (body["period_scope"] or {}).get("periods", []):
        assert set(state) >= PERIOD_STATE_KEYS
        assert len(state["period"]) == 7 and state["period"][4] == "-"
    for reason in body["status_reasons"]:
        assert set(reason) == {"code", "label", "periods", "detail"}
    for key, label in body["labels"].items():
        assert "." in key and isinstance(label, str) and label
    _assert_ints(body["data"], path)


async def test_commitment_and_review_item_shapes(
    async_client: AsyncClient, api_headers: dict[str, str], ledger
):
    commitments = (
        await async_client.get("/api/v1/read/commitments", headers=api_headers)
    ).json()
    for item in commitments["data"]["items"]:
        assert set(item) >= COMMITMENT_KEYS
        assert set(item["observation"]) >= OBSERVATION_KEYS
        assert item["kind_label"] and item["observation"]["state_label"]
    review = (
        await async_client.get(
            "/api/v1/read/review-items",
            headers=api_headers,
            params={"period": "2026-07"},
        )
    ).json()
    assert review["data"]["items"]
    for item in review["data"]["items"]:
        assert set(item) >= REVIEW_ITEM_KEYS
        for entry in item["listed_because"]:
            assert set(entry) == {
                "source",
                "source_label",
                "code",
                "code_label",
                "detail",
                "signals",
            }


async def test_index_lists_surface_with_questions_and_versions(
    async_client: AsyncClient, api_headers: dict[str, str]
):
    body = (await async_client.get("/api/v1/read/index", headers=api_headers)).json()
    paths = {entry["path"] for entry in body["entries"] if entry["path"]}
    net_worth = {
        f"/api/v1/metrics/net-worth/{name}"
        for name in ("intervals", "reconciliation", "emergency-fund")
    }
    projection = {
        "/api/v1/canonical-views/dashboard",
        "/api/v1/canonical-views/month-projection/accuracy",
    }
    assert paths == set(ENVELOPE_PATHS) | net_worth | projection
    covered = {question for entry in body["entries"] for question in entry["questions"]}
    assert covered == {"Q1", "Q2", "Q3", "Q4", "Q5", "Q6"}
    assert all(entry["definition"] for entry in body["entries"])
    assert set(body["status_vocabulary"]) >= STATUS_VALUES | {"query_failed"}
    assert body["format_rules"]


def test_openapi_declares_read_surface_and_error_body():
    schema = app.openapi()
    for path in READ_PATHS:
        operation = schema["paths"][path]["get"]
        assert "deprecated" not in operation
        assert "503" in operation["responses"]
        assert "401" in operation["responses"]
    assert "ReadErrorResponse" in schema["components"]["schemas"]


# --------------------------------------------------------------------------
# Distinct states.
# --------------------------------------------------------------------------


@pytest.mark.parametrize("path", ENVELOPE_PATHS)
async def test_empty_ledger_is_not_imported(
    async_client: AsyncClient, api_headers: dict[str, str], path: str
):
    response = await async_client.get(path, headers=api_headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "not_imported"
    assert body["status_reasons"][0]["code"] == "no_transactions_imported"
    assert body["as_of"]["transaction_as_of"] is None


async def test_period_states_distinguish_not_imported_zero_and_incomplete(
    async_client: AsyncClient, api_headers: dict[str, str], ledger
):
    def get(**params: str):
        return async_client.get(
            "/api/v1/read/monthly-flow", headers=api_headers, params=params
        )

    future = (await get(start_period="2027-01", end_period="2027-02")).json()
    assert future["status"] == "not_imported"
    assert future["data"]["items"] == []
    gap = (await get(start_period=GAP_PERIOD, end_period=GAP_PERIOD)).json()
    assert gap["status"] == "no_transactions"
    assert gap["period_scope"]["periods"][0]["coverage"] == "imported"
    closed = (
        await get(start_period=LAST_CLOSED_PERIOD, end_period=LAST_CLOSED_PERIOD)
    ).json()
    assert closed["status"] == "classification_incomplete"
    assert closed["classification"]["complete"] is False
    mixed = (await get(start_period="2026-07", end_period="2026-09")).json()
    states = {
        state["period"]: state["status"] for state in mixed["period_scope"]["periods"]
    }
    assert states["2026-09"] == "not_imported"
    assert states["2026-07"] == "classification_incomplete"
    assert {reason["code"] for reason in mixed["status_reasons"]} >= {
        "periods_not_imported",
        "in_progress_month_included",
        "adjustability_undecided",
    }


async def test_fully_classified_period_is_ok(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    db_session.add_all(
        [
            CategoryAdjustabilityDefault(
                category_major="category-a", adjustability="protected"
            ),
            Transaction(
                date=date(2026, 1, 31),
                time=time(9, 0),
                type="지출",
                category_major="category-a",
                description="shop-a",
                merchant="shop-a",
                amount=-10_000,
                currency="KRW",
            ),
        ]
    )
    await db_session.commit()
    body = (
        await async_client.get("/api/v1/read/monthly-flow", headers=api_headers)
    ).json()
    assert body["status"] == "ok"
    assert body["classification"]["complete"] is True
    assert body["period_scope"]["periods"][0]["month_status"] == "closed"


async def test_query_failure_returns_503_with_status(
    async_client: AsyncClient,
    api_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
):
    async def broken(*args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("database unavailable"))

    import app.api.v1.endpoints.read_surface as endpoints

    monkeypatch.setattr(endpoints, "read_data_status", broken)
    response = await async_client.get("/api/v1/read/data-status", headers=api_headers)
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "query_failed"
    assert body["surface"] == "data_status"
    assert "database unavailable" not in body["detail"]


async def test_stale_ledger_keeps_its_own_as_of_dates(
    async_client: AsyncClient, api_headers: dict[str, str], db_session: AsyncSession
):
    db_session.add_all(
        [
            Transaction(
                date=date(2021, 3, day),
                time=time(9, 0),
                type="지출",
                category_major="category-a",
                description="shop-a",
                merchant="shop-a",
                amount=-5_000,
                currency="KRW",
            )
            for day in (1, 10)
        ]
        + [
            Loan(
                snapshot_date=date(2020, 12, 31),
                lender="lender-a",
                product_name="loan-a",
                balance=1,
            )
        ]
    )
    await db_session.commit()
    status = (
        await async_client.get("/api/v1/read/data-status", headers=api_headers)
    ).json()
    assert status["as_of"]["transaction_as_of"] == "2021-03-10"
    assert status["as_of"]["in_progress_period"] == "2021-03"
    assert status["as_of"]["last_closed_period"] == "2021-02"
    loans = [item for item in status["data"]["snapshots"] if item["kind"] == "loans"][0]
    assert loans["as_of"] == "2020-12-31"
    assert loans["days_before_transaction_as_of"] == 69
    assert status["data"]["transaction_coverage"]["last_period"] == "2021-03"
    # The surface never pretends to know the current month.
    today = date.today().strftime("%Y-%m")
    recent = (
        await async_client.get(
            "/api/v1/read/monthly-flow",
            headers=api_headers,
            params={"start_period": today, "end_period": today},
        )
    ).json()
    assert recent["status"] == "not_imported"
    commitments = (
        await async_client.get(
            "/api/v1/read/commitments", headers=api_headers, params={"period": today}
        )
    ).json()
    assert commitments["status"] == "not_imported"
    assert {item["observation"]["state"] for item in commitments["data"]["items"]} <= {
        "not_determinable"
    }


# --------------------------------------------------------------------------
# Same views as the screens; scenarios.
# --------------------------------------------------------------------------


async def test_wrapped_payloads_equal_the_screen_endpoints(
    async_client: AsyncClient, api_headers: dict[str, str], ledger
):
    pairs = [
        ("monthly-flow", {}, ["items"]),
        ("spend-cube", {"group_by": "period,adjustability"}, ["rows", "total_amount"]),
        ("comparison/monthly-flow", {}, ["comparison", "measures", "residual_rate"]),
        (
            "comparison/contributions",
            {"adjustability": "adjustable"},
            ["comparison", "items", "twelve_month_items", "target_total"],
        ),
    ]
    for path, params, keys in pairs:
        screen = (
            await async_client.get(
                f"/api/v1/metrics/{path}", headers=api_headers, params=params
            )
        ).json()
        read = (
            await async_client.get(
                f"/api/v1/read/{path}", headers=api_headers, params=params
            )
        ).json()
        for key in keys:
            assert read["data"][key] == screen[key], (path, key)
        assert read["basis"]["definition"] == screen["contract"]["definition"]
        assert read["as_of"] == {
            key: screen["contract"]["as_of"][key] for key in AS_OF_KEYS
        }


async def test_q1_to_q6_answered_without_raw_transactions(
    async_client: AsyncClient, ledger
):
    log = await answer_questions(async_client)
    assert len(log.paths) <= 16
