# Toss API integration — local implementation evidence

Date: 2026-09-24. Branch: codex/asset-source-selection (continues source foundation).

## Scope and result

User authorized existing personal-vault credential usage and implementation of Toss retrieval. Implemented backend-only SecretStr settings, existing-vault CLI reference resolution/runtime injection, fixed read-only API client, authenticated manual sync/status, append-only observations/provenance, explicit single-account/stock-scope mapping, settings refresh/status UI and source selection integration. BankSalad raw snapshots and legacy summary remain unchanged. No orders, transfers, automated polling of provider, operating-server changes or deployment.

Official contract and remaining provider limits: `task-0-toss-securities-holdings-valuation.md`. API is KR/US stocks only, no holdings timestamp or cash balance. Native subtotals are validated, USD uses separate midRate (with validity window), observations declare observation_proxy. Unsupported/unknown bank product type prevents whole-group replacement even after a previous mapping. New mapping does not guess BankSalad asset/cash components, so current estimated net worth remains unavailable until that scope is confirmed.

## Verification

- Full backend suite: **504 passed, 12 skipped** (54.31s); skips are existing PostgreSQL-only recurring concurrency tests on SQLite.
- Added durable 1Password helper tests afterward: **13 passed**. No production behavior change in that test addition.
- Parent focused verification of helper, client, service, API and migrations: **79 passed** (0.94s).
- Full frontend: **237 passed**; ESLint, TypeScript and production build passed. Existing chunk-size/Browserslist advisories remain.
- Backend Ruff full check passed; changed Python files format check passed. uv lock offline check and shell syntax check passed.
- Alembic 0032 upgrade/downgrade tested against old 0031 schema with an existing run, preserving all old values and defaulting provenance to {}. Fresh latest schema compared to models.
- MockTransport covers KR/USD, FX errors/validity, empty holdings, incomplete/duplicate/unsupported data, token reuse, rate limits, auth errors, no secret output, bounded timeout and fixed allowed endpoints. SQLite/API tests cover auth/config, cooldown/concurrency, mapping confirmation/conflict, source selection without raw mutation, last complete survival, unsupported scope fallback.
- Real supplied workbook inspected locally without printing holdings/amounts: Toss product type is 주식 and passes conservative scope guard.
- Independent review found stock-only scope and excessive Decimal quantize issues. Both fixed, regression tests added, rereview confirmed resolution and no further actionable findings.
- Parent screenshot review caught naive SQLite timestamps appearing as local Korean time in status panel. Status now normalizes observed_at/ingested_at to explicit UTC like selected surface; API timezone regression plus service suite **26 passed**. Browser final recapture is recorded in QA evidence.

## Browser QA

Aside delegated QA uses synthetic isolated SQLite and httpx.MockTransport, ports5275/8675; no real keys or provider API. It exercised unchecked collection (unmapped), explicit stock-only account confirmation, 60s cooldown, source preview/apply and persisted selected read. Synthetic selected stock total 360000 KRW = 100000 KRW + 200 USD × 1300; confirmed BankSalad net worth1300000 remains, estimated total stays unavailable. Mobile390 and desktop1280 show no document overflow. Screenshots/report are in `toss-integration-qa/`; browser-only route mocks for key-missing/401/partial were unavailable (covered by Vitest and backend mocks instead). older captures preceding UTC fix are historical, use final captures for current state.

Unrelated canonical dashboard calls return500 in the isolated SQLite QA DB because PostgreSQL-specific views are absent; source/integration APIs and tested page flows work. This is not an all-endpoints PostgreSQL or production E2E claim.

## Live credential boundary

Initial op run rejected Korean names in secret references. Fixed by resolving the named vault item to ASCII IDs in a subprocess; only references are passed to op run, never secret text in command arguments, files or model output. Durable tests cover failures and masking.

The subsequent live read-only probe could not complete 1Password desktop authentication (prior attempt timed out; helper returned a sanitized access error). User was asked to unlock/approve through the normal 1Password flow. **No actual Toss account/holdings success is claimed.** The two existing field roles remain assumed until authentication succeeds. No plaintext .env or actual holdings file was created, no operating DB was touched. Local implementation and mocked verification are complete; actual API verification and operating deployment remain distinct.
