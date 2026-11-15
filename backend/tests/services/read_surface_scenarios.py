"""Q1–Q6 answered from the agent read surface alone (T060).

``answer_questions`` plays the consuming agent: it may call only
``/api/v1/read/*`` and records every request so tests can assert that no raw
transaction listing was needed. Shared by the SQLite API tests and the
PostgreSQL test on the realistic-size ledger.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from httpx import AsyncClient, Request

from read_surface_ledger import (
    AS_OF,
    GAP_PERIOD,
    IN_PROGRESS_PERIOD,
    INSTALLMENT_FLAGGED_PERIOD,
    INSTALLMENT_MISSING_PERIOD,
    INSTALLMENT_MONTHLY,
    LAST_CLOSED_PERIOD,
    LOAN_GAP_PERIOD,
    LOAN_MONTHLY_PAYMENT,
    SNAPSHOT_DATES,
    SPIKE_PERIOD,
)

HEADERS = {"X-API-Key": "test-api-key"}
RAW_TRANSACTION_PREFIXES = ("/api/v1/transactions", "/api/v1/installment-transaction")


@dataclass
class RequestLog:
    paths: list[str] = field(default_factory=list)

    async def __call__(self, request: Request) -> None:
        self.paths.append(request.url.path)


def recording_hook(client: AsyncClient) -> RequestLog:
    log = RequestLog()
    client.event_hooks["request"].append(log)
    return log


async def _get(client: AsyncClient, path: str, **params: object) -> dict:
    response = await client.get(
        f"/api/v1/read/{path}",
        params={key: str(value) for key, value in params.items()},
        headers=HEADERS,
    )
    assert response.status_code == 200, (path, response.status_code, response.text)
    return response.json()


def _item(items: list[dict], key: str) -> dict:
    matches = [item for item in items if item["commitment_key"] == key]
    assert matches, key
    return matches[0]


async def answer_q1(client: AsyncClient) -> None:
    """Where did the money go in the last closed months?"""
    flow = await _get(client, "monthly-flow", start_period="2026-05")
    assert flow["surface"] == "monthly_flow"
    assert flow["status"] == "classification_incomplete"
    months = {item["period"]: item for item in flow["data"]["items"]}
    closed = months[LAST_CLOSED_PERIOD]
    assert closed["month_status"] == "closed"
    rows = {row["row"]: row["amount"] for row in closed["rows"]}
    spend_rows = [
        "committed_loan",
        "committed_installment",
        "committed_recurring",
        "ad_hoc_protected",
        "ad_hoc_adjustable",
        "undecided",
    ]
    assert sum(rows.get(row, 0) for row in spend_rows) == closed["total_outflow"]
    assert closed["committed_loan_total"] == LOAN_MONTHLY_PAYMENT
    assert closed["residual"] == closed["income_total"] - closed["total_outflow"]
    assert closed["residual_rate"] is not None
    in_progress = months[IN_PROGRESS_PERIOD]
    assert in_progress["month_status"] == "in_progress"
    assert in_progress["residual_rate"] is None
    assert flow["labels"]["flow_row.committed_loan"]
    assert any(
        reason["code"] == "in_progress_month_included"
        for reason in flow["status_reasons"]
    )
    cube = await _get(
        client,
        "spend-cube",
        group_by="effective_category_major",
        start_period=LAST_CLOSED_PERIOD,
        end_period=LAST_CLOSED_PERIOD,
    )
    assert cube["data"]["total_amount"] == closed["total_outflow"]
    assert cube["data"]["truncated"] is False


async def answer_q2(client: AsyncClient) -> None:
    """What changed and how much did each item contribute?"""
    comparison = await _get(client, "comparison/monthly-flow", period=SPIKE_PERIOD)
    assert comparison["data"]["comparison"]["target_period"] == SPIKE_PERIOD
    assert comparison["data"]["comparison"]["baseline_month_count"] >= 1
    measures = {item["key"]: item for item in comparison["data"]["measures"]}
    assert measures["total_outflow"]["change_amount"] is not None
    contributions = await _get(client, "comparison/contributions", period=SPIKE_PERIOD)
    items = contributions["data"]["items"]
    assert items, "contributions must list items"
    changes = [abs(item["change_amount"] or 0) for item in items]
    assert changes == sorted(changes, reverse=True)
    assert items[0]["category"] == "category-08"


async def answer_q3(client: AsyncClient) -> None:
    """How much spend is adjustable and where is it?"""
    flow = await _get(
        client,
        "monthly-flow",
        start_period=LAST_CLOSED_PERIOD,
        end_period=LAST_CLOSED_PERIOD,
    )
    month = flow["data"]["items"][0]
    cube = await _get(
        client,
        "spend-cube",
        group_by="adjustability,effective_category_major",
        adjustability="adjustable",
        start_period=LAST_CLOSED_PERIOD,
        end_period=LAST_CLOSED_PERIOD,
    )
    assert cube["data"]["total_amount"] == month["adjustable_spend"]
    assert {row["adjustability"] for row in cube["data"]["rows"]} == {"adjustable"}
    assert (
        flow["classification"]["adjustability_undecided_total"]
        == (month["adjustability_undecided_total"])
    )
    review = await _get(client, "review-items", period=SPIKE_PERIOD)
    big = [
        item for item in review["data"]["items"] if item["merchant"] == "merchant-big"
    ]
    assert big and big[0]["subject"] == "transaction"
    codes = {entry["code"] for entry in big[0]["listed_because"]}
    assert "large_oneoff" in codes
    category = [
        item
        for item in review["data"]["items"]
        if item["subject"] == "category_month" and item["category"] == "category-08"
    ]
    assert category and category[0]["listed_because"][0]["source"] == "spending_anomaly"
    for item in review["data"]["items"]:
        assert item["listed_because"], "every item states why it is listed"
        assert "risk_level" not in item


async def answer_q4(client: AsyncClient) -> None:
    """What is committed every month and when does it end?"""
    closed = await _get(client, "commitments")
    assert closed["data"]["period"] == LAST_CLOSED_PERIOD
    items = closed["data"]["items"]
    loan = _item(items, "loan:1")
    assert loan["monthly_burden"] == LOAN_MONTHLY_PAYMENT
    assert loan["end_date"] == "2030-01-01"
    assert loan["adjustability"] == "protected"
    installment = _item(items, "installment:1")
    assert installment["monthly_burden"] == INSTALLMENT_MONTHLY
    assert installment["end_date"] == "2026-08-15"
    assert installment["total_count"] == 6
    assert installment["remaining_count"] == 1
    assert installment["observation"]["period"] == INSTALLMENT_MISSING_PERIOD
    assert installment["observation"]["state"] == "expected_not_observed"
    assert (
        sum(item["observation"]["observed_amount"] for item in items)
        == (closed["data"]["totals"]["observed_committed_total"])
    )
    flagged = await _get(client, "commitments", period=INSTALLMENT_FLAGGED_PERIOD)
    installment = _item(flagged["data"]["items"], "installment:1")
    assert installment["observation"]["state"] == "unlinked_transaction_present"
    assert installment["observation"]["transaction_ids"]
    loan_gap = await _get(client, "commitments", period=LOAN_GAP_PERIOD)
    assert _item(loan_gap["data"]["items"], "loan:1")["observation"]["state"] == (
        "expected_not_observed"
    )
    yearly = _item(loan_gap["data"]["items"], "recurring:2")
    assert yearly["observation"]["state"] == "not_expected"
    assert yearly["cycle"] == "yearly"
    uncycled = _item(loan_gap["data"]["items"], "recurring:3")
    assert uncycled["observation"]["state"] == "not_determinable"
    assert loan_gap["status"] == "classification_incomplete"
    gap = await _get(client, "commitments", period=GAP_PERIOD)
    assert gap["status"] == "no_transactions"
    assert {
        item["observation"]["reason"]
        for item in gap["data"]["items"]
        if item["observation"]["state"] == "not_determinable"
    } >= {"period_without_transactions"}
    for body in (closed, flagged, loan_gap, gap):
        text = str(body).lower()
        assert "missed" not in text and "미납" not in text


async def answer_q5(client: AsyncClient) -> None:
    """Net-worth reconciliation is reserved for T061 in the index."""
    index = await _get(client, "index")
    entry = [
        item for item in index["entries"] if item["key"] == "net_worth_reconciliation"
    ]
    assert entry and entry[0]["availability"] == "reserved"
    assert entry[0]["provided_by"] == "T061"
    assert entry[0]["questions"] == ["Q5"]


async def answer_q6(client: AsyncClient) -> None:
    """Until when is the data, and how complete is the classification?"""
    status = await _get(client, "data-status")
    assert status["as_of"]["transaction_as_of"] == AS_OF.isoformat()
    assert status["as_of"]["last_closed_period"] == LAST_CLOSED_PERIOD
    assert status["as_of"]["in_progress_period"] == IN_PROGRESS_PERIOD
    snapshots = {item["kind"]: item for item in status["data"]["snapshots"]}
    for kind, snapshot_date in SNAPSHOT_DATES.items():
        assert snapshots[kind]["as_of"] == snapshot_date.isoformat()
        assert status["as_of"]["snapshot_as_of"][kind] == snapshot_date.isoformat()
    assert len({item["as_of"] for item in snapshots.values()}) == len(SNAPSHOT_DATES)
    assert [gap["period"] for gap in status["data"]["coverage_gaps"]] == [GAP_PERIOD]
    classification = status["data"]["classification"]
    assert 0 < classification["adjustability_undecided_share"] < 1
    assert classification["installment_link_unconfirmed_transaction_count"] == 1
    assert classification["commitments_without_cycle"] == 1
    assert status["data"]["non_krw_transaction_count"] == 1
    assert status["status"] == "classification_incomplete"


QUESTIONS: list[Callable[[AsyncClient], Awaitable[None]]] = [
    answer_q1,
    answer_q2,
    answer_q3,
    answer_q4,
    answer_q5,
    answer_q6,
]


async def answer_questions(client: AsyncClient) -> RequestLog:
    log = recording_hook(client)
    for question in QUESTIONS:
        await question(client)
    assert all(path.startswith("/api/v1/read/") for path in log.paths), log.paths
    assert not any(path.startswith(RAW_TRANSACTION_PREFIXES) for path in log.paths)
    return log
