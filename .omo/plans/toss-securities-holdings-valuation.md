# toss-securities-holdings-valuation - Work Plan

## TL;DR (For humans)

**What you'll get:** Toss Securities 공식 API 문서가 확인된 뒤, 토스 증권계좌 투자 holdings 평가액을 별도 source로 수집하고 selected investment summary에 반영한다.

**Why this approach:** 이 작업은 인증/조회 필드/저장 가능 범위가 공식 문서에 의해 결정된다. 그래서 지금은 blocked plan으로 두고, source-priority foundation이 끝난 뒤 시작한다.

**What it will NOT do:** 일반 자산, 대출, 보험, profile snapshot을 Toss로 대체하지 않는다. BankSalad `investments` raw row를 직접 수정하지 않는다. 투자 성과/수익률 분석을 만들지 않는다.

**Effort:** Large
**Risk:** High - 외부 API, 인증, 민감정보, stale/failure 처리 리스크가 있다.
**Decisions to sanity-check:** 공식 문서와 인증 방식이 확인되기 전에는 실행하지 않는다.

Your next move: keep this plan blocked until official Toss Securities API docs and credentials/storage decisions are available. Full execution detail follows below.

---

> TL;DR (machine): Blocked roadmap T019; execute only after official Toss docs and asset-investment source foundation.

## Scope
### Must have
- Roadmap item: `T019`.
- Official Toss Securities API documentation reviewed before implementation.
- Adapter fetches only securities-account investment holdings.
- Store Toss results as separate investment observations, never by mutating BankSalad snapshots.
- Map Toss instruments/accounts to canonical investment identity.
- Selected summary uses source priority from `asset-investment-source-priority`.
- Handle pagination, rate limits, currency/FX basis, partial failures, stale runs, and secret redaction.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not implement before official docs and credential/storage policy are confirmed.
- Do not infer API fields from memory or unofficial sources.
- Do not log tokens, account secrets, or raw auth payloads.
- Do not build performance attribution, realized P/L, or transaction cashflow analysis.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with mocked Toss client, no live network in unit tests.
- Evidence: `.omo/evidence/task-<N>-toss-securities-holdings-valuation.md`.
- Required commands after unblocked:
  - `cd backend && uv run pytest tests/services/test_assets_service.py tests/api/test_assets_api.py`
  - `cd backend && uv run ruff check .`
  - `git diff --check`

## Execution strategy
### Parallel execution waves
- Wave 0: unblock by reviewing official docs and credential/storage decisions.
- Wave 1: adapter/client and observation persistence.
- Wave 2: mapping, selected summary integration, failure/stale handling.
- Wave 3: docs, tests, realistic dry-run evidence.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 0 | official docs | 1, 2, 3 | none |
| 1 | 0, asset source foundation | 2 | docs draft |
| 2 | 1 | 3 | none |
| 3 | 1, 2 | final | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 0. Unblock with official Toss Securities API docs.
  What to do / Must NOT do: Review `https://developers.tossinvest.com/docs` or user-provided official docs at execution time. Confirm auth, holdings endpoint fields, pagination, rate limits, allowed storage, sandbox/live behavior, and error semantics. Do not start adapter coding until this is documented.
  Parallelization: Wave 0 | Blocked by: official docs/access | Blocks: 1, 2, 3
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:479`, `.omo/plans/asset-investment-source-priority.md`, official Toss docs.
  Acceptance criteria (agent-executable): evidence file cites official doc URLs/sections and lists confirmed fields plus unknowns.
  QA scenarios (name the exact tool + invocation): happy: docs confirm holdings valuation fields, failure: docs omit required valuation/account identity field and plan remains blocked, Evidence `.omo/evidence/task-0-toss-securities-holdings-valuation.md`.
  Commit: N | docs/evidence only unless user asks

- [ ] 1. Build Toss holdings adapter and observation persistence.
  What to do / Must NOT do: Implement a backend client with mocked tests. Store source run and observations separately from BankSalad `investments`. Redact secrets from logs.
  Parallelization: Wave 1 | Blocked by: 0 and asset source foundation | Blocks: 2
  References (executor has NO interview context - be exhaustive): `backend/app/services/assets_service.py`, `backend/app/models/investment.py`, `backend/app/schemas/asset.py`, `backend/tests/services/test_assets_service.py`.
  Acceptance criteria (agent-executable): mocked test stores complete run, partial run, failed run, and no secret appears in captured logs.
  QA scenarios (name the exact tool + invocation): happy: complete holdings response persists observations, failure: API error records failed run and preserves previous successful run, Evidence `.omo/evidence/task-1-toss-securities-holdings-valuation.md`.
  Commit: Y | `[backend] Toss holdings adapter 추가 (codex)`

- [ ] 2. Map Toss observations into selected investment summary.
  What to do / Must NOT do: Use source priority and canonical investment identity. Toss-selected accounts replace BankSalad holdings for that account; never double count.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
  References (executor has NO interview context - be exhaustive): `.omo/plans/asset-investment-source-priority.md`, `backend/app/api/v1/endpoints/assets.py`, `backend/app/services/assets_service.py`, `backend/tests/api/test_assets_api.py`.
  Acceptance criteria (agent-executable): API test proves selected summary returns items/totals/source metadata and BankSalad fallback only when no successful complete Toss run exists.
  QA scenarios (name the exact tool + invocation): happy: selected Toss source changes investment items with basis metadata, failure: partial Toss run excluded from canonical candidate, Evidence `.omo/evidence/task-2-toss-securities-holdings-valuation.md`.
  Commit: Y | `[backend] Toss selected investment summary 반영 (codex)`

- [ ] 3. Document sync/stale/failure semantics and run verification.
  What to do / Must NOT do: Update API/agent docs with confirmed/current net-worth distinction, stale behavior, and scope limits. Do not describe this as investment performance analysis.
  Parallelization: Wave 3 | Blocked by: 1, 2 | Blocks: final
  References (executor has NO interview context - be exhaustive): `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`, `Implentation-plan.md:479`.
  Acceptance criteria (agent-executable): docs state Toss is investment holdings only, BankSalad raw rows remain, failed sync does not overwrite prior success, and performance attribution is out of scope.
  QA scenarios (name the exact tool + invocation): happy: docs/source metadata explain latest selected source, failure: docs imply Toss replaces loans/assets/profile and review fails, Evidence `.omo/evidence/task-3-toss-securities-holdings-valuation.md`.
  Commit: Y | `[docs] Toss holdings source contract 문서화 (codex)`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: verify `T019` bullets are mapped after official docs.
- [ ] F2. Code quality review: inspect secret handling, retry/failure behavior, and no double counting.
- [ ] F3. Real manual QA: run a mocked/sandbox sync; live sync only with explicit credentials approval.
- [ ] F4. Scope fidelity: confirm no non-investment Toss replacement or performance attribution slipped in.

## Commit strategy
- Keep official-doc evidence separate if committed.
- Backend adapter, summary integration, and docs can be separate commits.

## Success criteria
- Plan remains blocked until official docs are confirmed.
- Once unblocked, Toss holdings are stored as separate observations.
- Selected investment summary can use Toss source without mutating BankSalad rows or double counting.
