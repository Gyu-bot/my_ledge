"""Provider-contract tests use synthetic responses and never real credentials."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import logging
from unittest.mock import AsyncMock

import httpx
from pydantic import SecretStr
import pytest

from app.services import toss_client as module
from app.services.toss_client import TossClient, TossError

CLIENT_ID = SecretStr("synthetic-client-id")
SECRET = SecretStr("synthetic-client-secret")
TOKEN = "synthetic-access-token"
ACCOUNT_NO = "synthetic-account-number"


def holding(country="KR", currency="KRW", value="100", **changes):
    return {
        "symbol": "005930" if country == "KR" else "AAPL",
        "name": "테스트 주식",
        "marketCountry": country,
        "currency": currency,
        "quantity": "2",
        "lastPrice": "50",
        "marketValue": {"amount": value, "purchaseAmount": "80"},
        **changes,
    }


def overview(items=None, krw="100", usd="0"):
    return {
        "marketValue": {"amount": {"krw": krw, "usd": usd}},
        "items": [holding()] if items is None else items,
    }


def fx(**changes):
    now = datetime.now(timezone.utc)
    return {
        "baseCurrency": "USD",
        "quoteCurrency": "KRW",
        "midRate": "1350.25",
        "validFrom": (now - timedelta(minutes=5)).isoformat(),
        "validUntil": (now + timedelta(minutes=5)).isoformat(),
        **changes,
    }


class Provider:
    def __init__(self, holdings=None, accounts=None, exchange=None):
        self.holdings = overview() if holdings is None else holdings
        self.accounts = (
            accounts
            if accounts is not None
            else [
                {"accountSeq": 7, "accountType": "BROKERAGE", "accountNo": ACCOUNT_NO}
            ]
        )
        self.exchange = fx() if exchange is None else exchange
        self.requests = []
        self.overrides = {}

    def __call__(self, request):
        self.requests.append(request)
        path = request.url.path
        if path in self.overrides:
            replacement = self.overrides[path]
            return replacement(request) if callable(replacement) else replacement
        if path == "/oauth2/token":
            assert request.method == "POST"
            return httpx.Response(
                200,
                json={
                    "access_token": TOKEN,
                    "token_type": "Bearer",
                    "expires_in": 3600,
                },
            )
        assert request.method == "GET"
        assert request.headers["Authorization"] == f"Bearer {TOKEN}"
        if path == "/api/v1/accounts":
            value = self.accounts
        elif path == "/api/v1/holdings":
            assert request.headers["X-Tossinvest-Account"] == "7"
            value = self.holdings
        elif path == "/api/v1/exchange-rate":
            assert dict(request.url.params) == {
                "baseCurrency": "USD",
                "quoteCurrency": "KRW",
            }
            value = self.exchange
        else:
            pytest.fail(f"Unexpected provider path {path}")
        return httpx.Response(200, json={"result": value})

    def client(self):
        return TossClient(transport=httpx.MockTransport(self))


async def test_official_kr_and_us_values_preserve_native_amounts_and_fx_basis():
    provider = Provider(
        overview([holding(), holding("US", "USD", "12.34")], usd="12.34")
    )
    run = await provider.client().collect(CLIENT_ID, SECRET)
    assert run.status == "success_complete"
    assert [h.market_value for h in run.holdings] == [
        Decimal("100.00"),
        Decimal("16662.08"),
    ]
    us = run.holdings[1]
    assert us.native_currency == "USD"
    assert us.native_market_value == Decimal("12.34")
    assert us.native_cost_basis == Decimal("80")
    assert us.exchange_rate == Decimal("1350.25")
    assert us.quantity == 2 and us.unit_price == 50
    assert run.provenance["fx"]["basis"] == "midRate"
    assert run.provenance["fx"]["rate"] == "1350.25"
    assert run.provenance["valuation_time_basis"] == "observation_proxy"
    assert run.provenance["provider_valuation_at"] is None
    assert run.provenance["cash_scope"] == "holdings_only"
    assert run.provenance["holdings_scope"] == "kr_us_stocks"
    assert run.observed_at == run.valuation_at
    assert run.account_key.startswith("toss:account:")
    serialized = run.model_dump_json()
    for private in (
        ACCOUNT_NO,
        CLIENT_ID.get_secret_value(),
        SECRET.get_secret_value(),
        TOKEN,
    ):
        assert private not in serialized
    assert {(r.method, r.url.path) for r in provider.requests} == {
        ("POST", "/oauth2/token"),
        ("GET", "/api/v1/accounts"),
        ("GET", "/api/v1/holdings"),
        ("GET", "/api/v1/exchange-rate"),
    }


async def test_empty_zero_is_complete_without_fx_request():
    provider = Provider(overview([], krw="0"))
    run = await provider.client().collect(CLIENT_ID, SECRET)
    assert run.status == "success_complete" and run.holdings == []
    assert not run.cash_included and run.cash_balance is None
    assert all(r.url.path != "/api/v1/exchange-rate" for r in provider.requests)


async def test_token_reused_between_syncs_and_changed_credentials_invalidate_it():
    provider = Provider()
    client = provider.client()
    first = await client.collect(CLIENT_ID, SECRET)
    second = await client.collect(CLIENT_ID, SECRET)
    assert first.account_key == second.account_key
    assert sum(r.url.path == "/oauth2/token" for r in provider.requests) == 1
    await client.collect(CLIENT_ID, SecretStr("another-synthetic-secret"))
    assert sum(r.url.path == "/oauth2/token" for r in provider.requests) == 2


async def test_fx_failure_retains_kr_holdings_but_marks_whole_run_partial():
    provider = Provider(overview([holding(), holding("US", "USD", "10")], usd="10"))
    provider.overrides["/api/v1/exchange-rate"] = httpx.Response(
        503, json={"private": SECRET.get_secret_value()}
    )
    run = await provider.client().collect(CLIENT_ID, SECRET)
    assert run.status == "success_partial" and run.error == "provider_error"
    assert len(run.holdings) == 1 and run.holdings[0].native_currency == "KRW"
    assert "fx" not in run.provenance


@pytest.mark.parametrize(
    "exchange",
    [
        fx(midRate="0"),
        fx(validUntil="2000-01-01T00:00:00Z"),
        fx(validFrom="2099-01-01T00:00:00Z"),
        fx(validUntil="2099-01-01T00:00:00"),
        fx(baseCurrency="KRW"),
    ],
)
async def test_invalid_fx_never_becomes_a_complete_krw_total(exchange):
    run = (
        await Provider(
            overview([holding("US", "USD", "10")], krw="0", usd="10"), exchange=exchange
        )
        .client()
        .collect(CLIENT_ID, SECRET)
    )
    assert run.status == "success_partial"
    assert run.error == "invalid_fx_response" and run.holdings == []


@pytest.mark.parametrize(
    "item",
    [
        holding("US", "KRW"),
        holding(currency="EUR"),
        holding(country="JP"),
        holding(quantity="NaN"),
        holding(marketValue={"amount": "-1", "purchaseAmount": "0"}),
        holding(symbol=""),
        {"name": "malformed"},
    ],
)
async def test_unknown_malformed_or_mismatched_holdings_fail_closed(item):
    run = await Provider(overview([item])).client().collect(CLIENT_ID, SECRET)
    assert run.status == "success_partial" and run.error == "incomplete_holdings"
    assert run.holdings == []


@pytest.mark.parametrize(
    "payload",
    [
        overview(krw="101"),
        overview([], krw="1"),
        overview([holding(), holding()], krw="200"),
    ],
)
async def test_missing_or_duplicate_holdings_and_total_mismatch_are_partial(payload):
    run = await Provider(payload).client().collect(CLIENT_ID, SECRET)
    assert run.status == "success_partial" and run.error == "incomplete_holdings"


@pytest.mark.parametrize(
    "payload", [{}, {"items": [], "marketValue": None}, overview(krw="NaN")]
)
async def test_malformed_overview_is_failed(payload):
    run = await Provider(payload).client().collect(CLIENT_ID, SECRET)
    assert run.status == "failed" and run.error == "invalid_response"


@pytest.mark.parametrize("accounts", [[], [{"accountSeq": 7}, {"accountSeq": 8}]])
async def test_multiple_or_missing_accounts_do_not_guess_or_read_holdings(accounts):
    provider = Provider(accounts=accounts)
    with pytest.raises(TossError, match="^single_account_required$"):
        await provider.client().collect(CLIENT_ID, SECRET)
    assert all(r.url.path != "/api/v1/holdings" for r in provider.requests)


@pytest.mark.parametrize(
    "status,code", [(401, "authentication_failed"), (403, "access_denied")]
)
@pytest.mark.parametrize("path", ["/oauth2/token", "/api/v1/holdings"])
async def test_auth_errors_are_redacted_and_do_not_retry(status, code, path, caplog):
    provider = Provider()
    provider.overrides[path] = httpx.Response(
        status, json={"message": f"{TOKEN} {SECRET.get_secret_value()} {ACCOUNT_NO}"}
    )
    caplog.set_level(logging.DEBUG)
    if path == "/oauth2/token":
        with pytest.raises(TossError) as caught:
            await provider.client().collect(CLIENT_ID, SECRET)
        result = str(caught.value)
        assert result == code
    else:
        run = await provider.client().collect(CLIENT_ID, SECRET)
        assert run.status == "failed" and run.error == code
        result = run.model_dump_json()
    assert sum(r.url.path == path for r in provider.requests) == 1
    for private in (
        TOKEN,
        SECRET.get_secret_value(),
        CLIENT_ID.get_secret_value(),
        ACCOUNT_NO,
    ):
        assert private not in result and private not in caplog.text


@pytest.mark.parametrize(
    "retry_after,expected_requests,expected_sleeps",
    [("1", 2, 1), ("999", 1, 0), ("garbage", 1, 0)],
)
async def test_rate_limit_retries_are_bounded(
    monkeypatch, retry_after, expected_requests, expected_sleeps
):
    provider = Provider()
    provider.overrides["/api/v1/holdings"] = httpx.Response(
        429, headers={"Retry-After": retry_after}
    )
    sleep = AsyncMock()
    monkeypatch.setattr(module.asyncio, "sleep", sleep)
    run = await provider.client().collect(CLIENT_ID, SECRET)
    assert run.status == "failed" and run.error == "rate_limited"
    assert (
        sum(r.url.path == "/api/v1/holdings" for r in provider.requests)
        == expected_requests
    )
    assert sleep.await_count == expected_sleeps


async def test_rate_limit_one_retry_can_recover(monkeypatch):
    provider = Provider()
    responses = iter(
        [
            httpx.Response(429, headers={"Retry-After": "1"}),
            httpx.Response(200, json={"result": overview()}),
        ]
    )
    provider.overrides["/api/v1/holdings"] = lambda _: next(responses)
    monkeypatch.setattr(module.asyncio, "sleep", AsyncMock())
    assert (
        await provider.client().collect(CLIENT_ID, SECRET)
    ).status == "success_complete"


async def test_transport_errors_do_not_echo_request_or_provider_details(caplog):
    provider = Provider()

    def fail(request):
        raise httpx.ConnectError(
            f"private {SECRET.get_secret_value()} {TOKEN}", request=request
        )

    provider.overrides["/api/v1/holdings"] = fail
    caplog.set_level(logging.DEBUG)
    run = await provider.client().collect(CLIENT_ID, SECRET)
    assert run.status == "failed" and run.error == "network_error"
    assert SECRET.get_secret_value() not in run.model_dump_json() + caplog.text
    assert TOKEN not in run.model_dump_json() + caplog.text


async def test_unauthorized_clears_token_before_next_manual_collection():
    provider = Provider()
    client = provider.client()
    provider.overrides["/api/v1/holdings"] = httpx.Response(401)
    failed = await client.collect(CLIENT_ID, SECRET)
    assert failed.error == "authentication_failed"
    del provider.overrides["/api/v1/holdings"]
    assert (await client.collect(CLIENT_ID, SECRET)).status == "success_complete"
    assert sum(r.url.path == "/oauth2/token" for r in provider.requests) == 2


@pytest.mark.parametrize(
    "account,code",
    [
        ({"accountSeq": 7, "accountType": "BROKERAGE"}, "invalid_response"),
        (
            {"accountSeq": 7, "accountType": "ISA", "accountNo": ACCOUNT_NO},
            "unsupported_account",
        ),
    ],
)
async def test_missing_stable_identity_or_unsupported_account_rejected(account, code):
    provider = Provider(accounts=[account])
    with pytest.raises(TossError, match=f"^{code}$"):
        await provider.client().collect(CLIENT_ID, SECRET)
    assert all(r.url.path != "/api/v1/holdings" for r in provider.requests)


async def test_huge_usd_conversion_is_partial_before_decimal_quantize_overflows():
    native_amount = "999999999999999999"
    provider = Provider(
        overview([holding(), holding("US", "USD", native_amount)], usd=native_amount),
        exchange=fx(midRate="999999999"),
    )
    run = await provider.client().collect(CLIENT_ID, SECRET)
    assert run.status == "success_partial" and run.error == "incomplete_holdings"
    assert len(run.holdings) == 1
    assert run.holdings[0].native_currency == "KRW"
    assert run.holdings[0].market_value == Decimal("100")
    assert run.provenance["holdings_scope"] == "kr_us_stocks"
