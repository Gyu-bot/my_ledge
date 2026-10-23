# BankSalad exact reviewed imports (T052)

This adds an authenticated human-review lane **beside**, not instead of, the existing safe upload APIs. Possession of the shared API key authenticates a technical caller, not a human approval or a separate profile ACL. An owner-scoped client must verify the real human's current conversation/admission and the exact displayed plan before applying. Implementation/deployment approval is never approval of financial decisions.

## HTTP contract

Every route requires `X-API-Key`.

| Route | Request | Result |
|---|---|---|
| `POST /api/v1/upload/review/prepare` | Multipart `file`, `snapshot_date`, JSON `context` | Stored prepared operation and full exact plan; no financial mutations |
| `GET /api/v1/upload/review/{operation_id}` | Exact operation ID | Durable plan/status/result, not the ten-most-recent upload window |
| `POST /api/v1/upload/review/{operation_id}/decisions` | JSON `plan_digest`, complete ordered `decisions` | Revised version/digest; old displayed approval no longer matches |
| `POST /api/v1/upload/review/{operation_id}/apply` | Multipart same file/date and JSON `apply_request` | Atomic approved batch, or rejection with no partial financial mutation |

Context is exactly `owner_profile:"finance"`, SHA256 `account_hash` of the configured account string, lowercase Gmail `message_id`, and encrypted archive SHA256 `archive_hash`. File SHA256 and snapshot date are bound independently. Do not put real identifiers or plan payloads in public logs.

Each decision is `{entry_id,action,target_id}`. The server requires every entry exactly once in plan order. `keep`/`add` require a null target; `update` requires an exact active candidate ID. Entry IDs represent source occurrences, not a possibly repeated/colliding source hash.

Apply requires `confirmation:true`, current `plan_digest`, exact context, complete unchanged decisions, `snapshot_effect_ack:true` and a nonempty exact canonical `approval_reference`. There is no general ambiguous-row bypass. A technical API caller remains responsible for authentic human evidence; server validation does not certify that an arbitrary locator is human-authored.

## Plan and actions

The response exposes all eight change classes, full existing/incoming source fields, field deltas, candidate sources, allowed actions, defaults and exact decisions. Matching retains the pre-reservation candidate graph so competing rows cannot become false-safe additions. Repeated workbook rows retain separate occurrence IDs.

- New: default add unless there is matching/overlap uncertainty.
- Unchanged: default keep.
- Unique source-field/time change: default source-only update of the existing ID; shared targets default keep.
- Replacement/duplicate/ambiguous: default keep, never silently safe; a human may explicitly add a distinct occurrence or select a permitted target.
- Missing from latest export: **keep exactly unchanged**, not deletion or retirement.

Update preserves user category overrides, memo, normalized merchant overrides, classification and stable transaction ID. Loan/installment/settlement/review relationships are therefore retained rather than moved to a replacement row. Deleted/merged/superseded targets, duplicate update targets and targets protected by kept entries are rejected.

The owner UI/helper may summarize explicit `new→add`, `unchanged→keep`, `missing→keep` dispositions by complete stable ID ranges, but ranges never replace the full source/candidate comparison for **any** entry. Complete per-entry detail and snapshot effects must be available in the exact approval-bound display; an incomplete/truncated display must hold approval. Per-item human changes require a newly displayed version and new approval. The API's full response alone is not proof the helper displayed it or verified human intent.

## Snapshot effects

The plan discloses current/incoming counts and latest dates for the selected date's asset, insurance, investment, loan and customer-profile tables. The reviewed apply replaces only that date, appends BankSalad source evidence, carries forward matching user metadata and recomputes relevant latest loan repayment estimates while respecting user overrides. An absent optional profile is preserved, not silently deleted. Older-than-existing snapshot uploads are refused; same-day refresh is explicitly disclosed. The original safe automation may retain its stricter strictly-newer gate.

`snapshot_effects.value_detail` version 1 binds full typed selected-date `before`, current `latest`, normalized `incoming`, and exact projected `after` rows for all five tables. All semantic columns are explicit, including nulls; Decimal/date tags retain types. Raw parser evidence, asset metadata sources and chosen linked-transaction date/amount effects are included. Generated IDs/timestamps are excluded and labelled as generated at apply, not forecast values. This extends the existing effects dictionary, not a new endpoint, top-level response field or migration.

The read-only projection reuses the actual replacement metadata and loan-estimate rules; preparation/revision do not write financial tables or consume their sequences. A changed decision recalculates the final effect and plan digest. Apply recalculates under its existing lock, then compares every final stored semantic value (including user metadata and repayment estimates), as well as source semantics and counts, before `snapshot_verified` is stored. Missing-detail pre-upgrade prepared plans are refused, while historical applied GET/exact replay remain compatible. The helper requires full typed detail for populated state, exact complete display and new human approval; it never substitutes count-based risk acceptance. Its existing strictly-newer date preflight remains stricter than the backend's same-day review capability.

The result also identifies each applied entry/action/transaction, kept entries, decision digest and approval locator. Original workbook retention is outside the financial transaction: a retention warning does not authorize a duplicate import.

## Atomicity and stale/timeout behavior

Migration `20261023_0033` adds only `upload_review_operations`. It does not alter/delete financial rows or existing columns; old application code remains compatible with the extra table. Do not downgrade/drop the table as an application rollback: retained approvals/results are audit and deduplication state.

PostgreSQL acquires a fixed sorted `SHARE ROW EXCLUSIVE` lock set on registered finance tables and review operations before reading state. Ordinary reads remain available; ordinary INSERT/UPDATE/DELETE writers conflict even without cooperation. Lock acquisition has a five-second timeout. Existing multi-table writers can deadlock; the entire operation rolls back rather than partially applying. SQLite uses a write reservation for fixture verification, not as evidence of PostgreSQL locks.

A typed canonical full-content digest covers registered finance tables, user metadata/links/settings/snapshots/evidence, excluding operations. This deliberately invalidates more plans than strictly necessary. A changed state makes an operation stale; new preparation/display/approval is required. Identical preparation preserves a revised current plan. Apply checks source hash/date/context/digest/decisions under the same lock, then commits financial changes, upload audit and exact canonical result once. An identical repeated applied request returns its stored result; any changed request is rejected.

The internal durable `binding_digest` additionally binds the complete typed parser interpretation: ordered rows including kept occurrences, all raw snapshot/evidence sections, and normalized snapshot values. Equal workbook bytes and snapshot counts are not enough if a parser/normalizer upgrade changes their meaning. Apply recomputes this under the lock before creating any financial audit/mutation; a mismatch returns `409 parsed_source_changed`, persists `stale`, and requires explicit fresh preparation/display/approval. Stored payload integrity is also checked before revision/application so revision cannot silently sign a corrupted plan.

No public route, request/response field or migration changes are required for this stronger binding. **Preupgrade prepared operations lack this binding and fail closed on apply**; do not silently upgrade their approval or replay the current pending export. Reprepare/display/reapproval is a separate authorized action. Existing applied operation GET and exact replay remain read-only and compatible, including previously accepted internal-whitespace approval locators. New applications reject a locator containing any whitespace with `422 invalid_approval_reference`; no trimming/normalization is performed.

On lost apply response, **GET the same operation**. A prepared GET may coexist with an in-flight writer and is not proof of failure; do not create a new operation or blindly repost. A stored applied result is durable independent of recent upload-log rollover. A client with uncertain outcome must retain its applying/review hold until exact evidence settles it.

## Verification and operations

Focused tests cover auth and strict confirmation, bindings, all classes, occurrence/hash edge cases, stale changes, atomic rejection, preserved user fields/relationships, all snapshot sections, repeated apply/readback and real TCP HTTP. Opt-in PostgreSQL tests use only per-test loopback schemas via `REVIEW_TEST_DATABASE_URL`, proving concurrent prepare/once apply, ordinary-writer locking and additive migration upgrade/downgrade in synthetic data.

The T052 follow-up contract tests add same-byte parser/normalizer drift, complete ordered decisions, changed binding replay, post-prepare candidate deletion/merge, exact single-keep versus ambiguous-keep protection, whole registered-finance-state rollback, stored plan tampering and old-operation compatibility. PostgreSQL also exercises the actual HTTP apply route under a real ordinary-writer five-second lock timeout (`409 database_conflict`, sanitized body, no partial changes), plus late-failure rollback read back in a new session. These backend tests do not establish complete Bot Chat display, authentic human admission, delivery, or the original safe API's cross-client snapshot preconditions; those remain separate integration gates.

The finance integration additionally uses synthetic authenticated archive fixtures, native SessionDB human admissions, the real importer/cron/helper entrypoints, actual FastAPI/PostgreSQL and one-time completion/notice bindings. No real pending financial rows are approved by tests. Keep private verification evidence and deployment backups outside the public repository.

For rollout: retain the running image by immutable ID/tag, take a consistent scoped database dump, prove restore/content parity and migration compatibility in isolation, deploy the merged exact source as backend/migrate only and keep database/frontend volumes and unrelated services unchanged. Application rollback uses the prior backend image and leaves the additive audit table intact. Preparing the current review is authorized separately from applying its decisions; actual financial approval still belongs to the human.
