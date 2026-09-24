"""Read-only Toss v1.2.17 client. No arbitrary paths, orders, or raw error logging."""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal, DecimalException
import hashlib
import time
from typing import Annotated, Literal

import httpx
from pydantic import BaseModel, Field, SecretStr, ValidationError

from app.schemas.asset_source import ExternalHoldingInput, ExternalRunInput

BASE_URL = "https://openapi.tossinvest.com"
Amount = Annotated[Decimal, Field(ge=0, lt=Decimal("1e18"), allow_inf_nan=False)]


class TossError(Exception):
    """Only an application-owned code, never a provider body/URL/token."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class Account(BaseModel):
    accountSeq: int = Field(gt=0, strict=True)
    accountType: Literal["BROKERAGE"]


class MarketValue(BaseModel):
    amount: Amount
    purchaseAmount: Amount


class Holding(BaseModel):
    symbol: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    marketCountry: Literal["KR", "US"]
    currency: Literal["KRW", "USD"]
    quantity: Amount
    lastPrice: Amount
    marketValue: MarketValue


class CurrencyAmounts(BaseModel):
    krw: Amount
    usd: Amount | None = None


class OverviewValue(BaseModel):
    amount: CurrencyAmounts


class Overview(BaseModel):
    marketValue: OverviewValue
    items: list[dict] = Field(max_length=10000)


class ExchangeRate(BaseModel):
    baseCurrency: Literal["USD"]
    quoteCurrency: Literal["KRW"]
    midRate: Decimal = Field(gt=0, lt=Decimal("1e9"), allow_inf_nan=False)
    validFrom: datetime
    validUntil: datetime


class Token(BaseModel):
    access_token: SecretStr = Field(min_length=1)
    token_type: Literal["Bearer"]
    expires_in: int = Field(gt=0, le=31536000)


class TossClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self.transport = transport
        self._token: SecretStr | None = None
        self._expires = 0.0
        self._credential_digest: bytes | None = None

    async def _request(self, client, method, path, **kwargs):
        # The methods below are the only callers. Never accept a caller-supplied URL.
        for attempt in range(2):
            try:
                response = await client.request(method, path, **kwargs)
            except httpx.HTTPError:
                raise TossError("network_error") from None
            if response.status_code == 429 and attempt == 0:
                retry = response.headers.get("Retry-After", "1")
                if retry.isdigit() and int(retry) <= 2:
                    await asyncio.sleep(max(1, int(retry)))
                    continue
            if response.status_code != 200:
                code = {
                    401: "authentication_failed",
                    403: "access_denied",
                    429: "rate_limited",
                }.get(response.status_code, "provider_error")
                if response.status_code == 401:
                    self._token = None
                raise TossError(code)
            try:
                body = response.json()
                if not isinstance(body, dict) or "error" in body:
                    raise ValueError
                return body
            except (ValueError, TypeError):
                raise TossError("invalid_response") from None
        raise TossError("rate_limited")

    async def _authorize(self, client, client_id: SecretStr, secret: SecretStr):
        digest = hashlib.sha256(
            (client_id.get_secret_value() + "\0" + secret.get_secret_value()).encode()
        ).digest()
        if (
            self._token is None
            or self._credential_digest != digest
            or time.monotonic() >= self._expires
        ):
            body = await self._request(
                client,
                "POST",
                "/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id.get_secret_value(),
                    "client_secret": secret.get_secret_value(),
                },
            )
            try:
                token = Token.model_validate(body)
            except ValidationError:
                raise TossError("invalid_response") from None
            self._token = token.access_token
            self._expires = time.monotonic() + max(0, token.expires_in - 60)
            self._credential_digest = digest
        client.headers["Authorization"] = "Bearer " + self._token.get_secret_value()

    async def _result(self, client, path, **kwargs):
        body = await self._request(client, "GET", path, **kwargs)
        if "result" not in body:
            raise TossError("invalid_response")
        return body["result"]

    async def collect(
        self, client_id: SecretStr, secret: SecretStr
    ) -> ExternalRunInput:
        async with httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=8,
            follow_redirects=False,
            trust_env=False,
            transport=self.transport,
        ) as client:
            await self._authorize(client, client_id, secret)
            accounts = await self._result(client, "/api/v1/accounts")
            if not isinstance(accounts, list):
                raise TossError("invalid_response")
            if len(accounts) != 1:
                raise TossError("single_account_required")
            try:
                account = Account.model_validate(accounts[0])
            except ValidationError:
                raise TossError("unsupported_account") from None
            # Stable identity is the provider account number hashed, not accountSeq
            # alone (which may be only scoped to a particular API client).
            number = accounts[0].get("accountNo")
            if not isinstance(number, str) or not number.strip():
                raise TossError("invalid_response")
            key = "toss:account:" + hashlib.sha256(number.encode()).hexdigest()
            now = datetime.now(timezone.utc)
            run = ExternalRunInput(
                account_key=key,
                valuation_at=now,
                observed_at=now,
                status="failed",
                holdings=[],
                provenance={
                    "valuation_time_basis": "observation_proxy",
                    "provider_valuation_at": None,
                    "api_version": "1.2.17",
                    "cash_scope": "holdings_only",
                    "holdings_scope": "kr_us_stocks",
                },
            )
            try:
                raw = await self._result(
                    client,
                    "/api/v1/holdings",
                    headers={"X-Tossinvest-Account": str(account.accountSeq)},
                )
                observed = datetime.now(timezone.utc)
                run.observed_at = run.valuation_at = observed
                overview = Overview.model_validate(raw)
                holdings = []
                invalid = False
                for item in overview.items:
                    try:
                        holding = Holding.model_validate(item)
                        if (holding.marketCountry, holding.currency) not in {
                            ("KR", "KRW"),
                            ("US", "USD"),
                        }:
                            raise ValueError
                        holdings.append(holding)
                    except (ValidationError, ValueError):
                        invalid = True
                fx = None
                fx_error = None
                if any(h.currency == "USD" for h in holdings):
                    try:
                        fx = ExchangeRate.model_validate(
                            await self._result(
                                client,
                                "/api/v1/exchange-rate",
                                params={"baseCurrency": "USD", "quoteCurrency": "KRW"},
                            )
                        )
                        fx_observed = datetime.now(timezone.utc)
                        if (
                            not fx.validFrom.tzinfo
                            or not fx.validUntil.tzinfo
                            or not fx.validFrom <= fx_observed < fx.validUntil
                        ):
                            raise ValueError
                        run.provenance["fx"] = {
                            "basis": "midRate",
                            "rate": str(fx.midRate),
                            "base_currency": "USD",
                            "quote_currency": "KRW",
                            "valid_from": fx.validFrom.isoformat(),
                            "valid_until": fx.validUntil.isoformat(),
                            "observed_at": fx_observed.isoformat(),
                        }
                    except (
                        TossError,
                        ValidationError,
                        ValueError,
                        DecimalException,
                    ) as exc:
                        fx = None
                        fx_error = (
                            exc.code
                            if isinstance(exc, TossError)
                            else "invalid_fx_response"
                        )
                totals = {"KRW": Decimal(0), "USD": Decimal(0)}
                seen = set()
                for h in holdings:
                    totals[h.currency] += h.marketValue.amount
                    identity = f"{h.marketCountry}:{h.symbol}"
                    if identity in seen:
                        invalid = True
                        continue
                    seen.add(identity)
                    if h.currency == "USD" and fx is None:
                        continue
                    rate = fx.midRate if h.currency == "USD" else Decimal(1)
                    value = h.marketValue.amount * rate
                    if value >= Decimal("1e18"):
                        invalid = True
                        continue
                    value = value.quantize(Decimal("0.01"))
                    run.holdings.append(
                        ExternalHoldingInput(
                            instrument_key=identity,
                            product_name=h.name,
                            market_value=value,
                            quantity=h.quantity,
                            unit_price=h.lastPrice,
                            exchange_rate=rate,
                            native_currency=h.currency,
                            native_market_value=h.marketValue.amount,
                            native_cost_basis=h.marketValue.purchaseAmount,
                        )
                    )
                amount = overview.marketValue.amount
                tolerance = Decimal("0.01") * max(1, len(holdings))
                if (
                    abs(totals["KRW"] - amount.krw) > tolerance
                    or abs(totals["USD"] - (amount.usd or Decimal(0))) > tolerance
                ):
                    invalid = True
                run.status = (
                    "success_partial" if invalid or fx_error else "success_complete"
                )
                run.error = fx_error or ("incomplete_holdings" if invalid else None)
                run.provenance["native_totals"] = {
                    "KRW": str(amount.krw),
                    "USD": str(amount.usd) if amount.usd is not None else None,
                }
            except (TossError, ValidationError, ValueError, DecimalException) as exc:
                run.status = "failed"
                run.error = (
                    exc.code if isinstance(exc, TossError) else "invalid_response"
                )
            return run


# Single API process owns token reuse. Never persist token or include it in a result.
toss_client = TossClient()
