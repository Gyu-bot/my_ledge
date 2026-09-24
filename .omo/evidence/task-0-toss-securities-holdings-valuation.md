# T019 official contract and scope — 2026-09-24

User authorized using the existing 1Password credential item to implement Toss API retrieval. The prior source-selection scope remains intact; this extends it with a manual holdings collector. No operational deployment is implied.

Official sources checked: https://openapi.tossinvest.com/openapi-docs/latest/openapi.json (v1.2.17), https://openapi.tossinvest.com/openapi-docs/faq.md and https://developers.tossinvest.com/.

- OAuth2 client_credentials form POST /oauth2/token, plain OAuth response (not result envelope). One active token per client; replacement invalidates the prior token. Cache in one backend process, no simultaneous local/production consumers.
- GET /api/v1/accounts returns result array of accountNo/accountSeq/accountType. Exactly one BROKERAGE required. Persist only hashed account identity; no raw account number or token.
- GET /api/v1/holdings with X-Tossinvest-Account, no symbol filter. No pagination in this contract; domestic and US stocks only, not an all-products/cash account balance.
- Items: symbol/name/marketCountry/currency/quantity/lastPrice/marketValue.amount/purchaseAmount. Canonical identity marketCountry:symbol, whole-account replacement after explicit mapping (no speculative name matches).
- marketValue.amount.krw is domestic KRW subtotal, NOT converted overseas valuation. Validate native item subtotals against overview; invalid/missing rows exclude the run from complete-source selection.
- GET /api/v1/exchange-rate USD→KRW; use midRate for our valuation estimate, preserve rate/validFrom/validUntil/observed_at. Holdings and FX are separate requests, not an atomic snapshot.
- Provider omits holdings valuation time. valuation_at uses observed_at only with explicit observation_proxy provenance/precision and UI warning. Stale checks then measure retrieval age, not underlying quote age.
- No cash balance endpoint. Buying power is not cash balance. Never collect it or add it to holdings. Net-worth replacement remains unavailable without explicitly confirmed asset components/cash scope.
- Groups: AUTH5, ACCOUNT1, ASSET5, MARKET_INFO3 TPS; response limits authoritative. 429 bounded retry once for <=2s Retry-After, otherwise manual retry after 60s cooldown. No token reissue loop on401.
- API error text/body excluded from persistence/UI/log output; use application-owned error codes only.
- FAQ restricts data to personal usage and no third-party redistribution. No documented retention period or sandbox found; neither is claimed as verified.

Credential workflow: existing vault item remains in place; CLI resolves references and injects process environment. No plaintext .env copy, no secret values in evidence or code. Stored observations contain holdings and valuation provenance only.
