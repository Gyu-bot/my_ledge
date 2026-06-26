# asset-investment-source-priority - Work Plan

## TL;DR (For humans)

**What you'll get:** BankSalad snapshot과 외부 source를 raw observation으로 보존하고, 어떤 source를 canonical 값으로 쓸지 사용자/정책이 결정할 수 있는 기반을 만든다.

**Why this approach:** Toss 연동 자체보다 먼저 observation 보존, source priority, deterministic resolution, provenance/coverage가 있어야 외부 투자 source를 안전하게 받아들일 수 있다.

**What it will NOT do:** Toss API adapter를 구현하지 않는다. BankSalad raw snapshot을 덮어쓰지 않는다. 투자 성과/수익률 분석을 만들지 않는다.

**Effort:** XL
**Risk:** High - 자산/투자 canonical total과 agent 해석을 바꾸는 기반 작업이다.
**Decisions to sanity-check:** 첫 실행은 backend/API/contract 중심으로 하고, `T016A` 설정 화면은 API가 안정된 뒤 같은 sequence의 후반부에서 처리한다.

Your next move: approve this plan only after deciding to start the asset/investment source foundation work. Full execution detail follows below.

---

> TL;DR (machine): Covers roadmap T015, T016, T016A, T017, T018 without Toss adapter implementation.

## Scope
### Must have
- Roadmap items: `T015`, `T016`, `T016A`, `T017`, `T018`.
- Raw observation preservation for asset/investment/loan-related source rows, starting with investment source identity.
- Selected canonical view or service defining which observation contributes to totals.
- User-controlled source priority profile API.
- Deterministic field/source resolution and conflict queue.
- Provenance and asset-source coverage surface for agents.
- Settings frontend section only after backend API is stable.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not implement Toss Securities API adapter here; that is `toss-securities-holdings-valuation`.
- Do not rewrite historical BankSalad snapshots.
- Do not identify holdings by `product_name` alone.
- Do not merge BankSalad and Toss fields inside one holding row when a complete source run should be selected.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with backend API/service tests, then frontend tests for `T016A`.
- Evidence: `.omo/evidence/task-<N>-asset-investment-source-priority.md`.
- Required commands:
  - `cd backend && uv run pytest tests/services/test_assets_service.py tests/api/test_assets_api.py tests/api/test_schema_api.py`
  - `cd frontend && npm test -- SettingsPage`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
  - `git diff --check`

## Execution strategy
### Parallel execution waves
- Wave 1: observation/provenance model and canonical identity.
- Wave 2: selected canonical view, priority API, deterministic resolution.
- Wave 3: coverage surface, docs, frontend settings section.
- Wave 4: realistic workbook/source fixture validation.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3 | docs inventory |
| 2 | 1 | 3, 4 | none |
| 3 | 1, 2 | 4, 5 | none |
| 4 | 2, 3 | 5 | docs update |
| 5 | 3, 4 | final | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Add observation/provenance model and stable investment identity.
  What to do / Must NOT do: Introduce observation metadata/table and canonical identity for investment holdings using normalized account key plus normalized instrument key. Do not use product name alone.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:353`, `backend/app/models/asset_snapshot.py`, `backend/app/models/investment.py`, `backend/app/models/loan.py`, `backend/app/services/assets_service.py`, `docs/backend-api-ssot.md`.
  Acceptance criteria (agent-executable): backend test proves `토스증권` and another broker with same product name remain distinct holdings.
  QA scenarios (name the exact tool + invocation): happy: two brokers same product are distinct canonical keys, failure: product-name-only collision is rejected or flagged ambiguous, Evidence `.omo/evidence/task-1-asset-investment-source-priority.md`.
  Commit: Y | `[backend] 투자 observation identity 추가 (codex)`

- [ ] 2. Add selected canonical source view/service and source priority API.
  What to do / Must NOT do: Add source priority profile storage/API with global, asset-class, account/canonical-key, and future field-level extension points. Keep first implementation focused on investment source selection.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3, 4
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:383`, `backend/app/api/v1/endpoints/assets.py`, `backend/app/schemas/asset.py`, `backend/app/services/assets_service.py`, `backend/tests/api/test_assets_api.py`.
  Acceptance criteria (agent-executable): API test shows default `banksalad_snapshot`, investment override `toss_securities_api`, and account/key override are stored without changing raw observations.
  QA scenarios (name the exact tool + invocation): happy: priority preview shows net-worth impact, failure: override using product name alone is rejected, Evidence `.omo/evidence/task-2-asset-investment-source-priority.md`.
  Commit: Y | `[backend] source priority API 추가 (codex)`

- [ ] 3. Add deterministic resolution and conflict queue.
  What to do / Must NOT do: Resolve selected source by user confirmation, priority, freshness, source confidence, ingested time, stable id. Add conflict reasons for missing/difference/currency/account/instrument ambiguity/stale.
  Parallelization: Wave 2 | Blocked by: 1, 2 | Blocks: 4
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:434`, `backend/app/services/assets_service.py`, `backend/app/services/canonical_views.py`, `backend/tests/services/test_assets_service.py`.
  Acceptance criteria (agent-executable): tests prove complete Toss-selected account replaces BankSalad holdings for that account without double-counting, and failed/stale source keeps last successful complete run semantics.
  QA scenarios (name the exact tool + invocation): happy: selected complete run updates investment summary metadata, failure: partial/failed run is not selected for canonical total, Evidence `.omo/evidence/task-3-asset-investment-source-priority.md`.
  Commit: Y | `[backend] 자산 source resolution 추가 (codex)`

- [ ] 4. Add provenance/coverage surface and contract docs.
  What to do / Must NOT do: Add `asset-source-coverage` API or view with raw/selected/excluded/confirmed/hidden/conflicted/stale counts and source basis metadata.
  Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 5
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:459`, `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`, `backend/app/api/v1/endpoints/assets.py`.
  Acceptance criteria (agent-executable): docs and tests show agent can explain mixed-source totals and stale/conflicted coverage.
  QA scenarios (name the exact tool + invocation): happy: coverage includes Toss selected ratio and stale account count, failure: mixed-source total lacks basis metadata and test fails, Evidence `.omo/evidence/task-4-asset-investment-source-priority.md`.
  Commit: Y | `[docs] 자산 source coverage 문서화 (codex)`

- [ ] 5. Add source-priority settings frontend.
  What to do / Must NOT do: Extend `/data/settings` with source priority section after backend API stabilizes. Show BankSalad/Toss scope, source dates, selected run, stale/fallback reason, and historical-observation non-mutation copy.
  Parallelization: Wave 3 | Blocked by: 2, 4 | Blocks: final
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:412`, `frontend/src/features/data/SettingsPage.tsx`, `frontend/src/api/settings.ts`, `frontend/src/api/assets.ts`, `frontend/src/test/features/SettingsPage.test.tsx`, `docs/frontend/page-wireframes.md`.
  Acceptance criteria (agent-executable): frontend test covers load/save and copy explaining "Toss 투자 항목만 대체, 나머지는 BankSalad 유지".
  QA scenarios (name the exact tool + invocation): happy: settings save account-level override, failure: stale/fallback reason is visible when API reports it, Evidence `.omo/evidence/task-5-asset-investment-source-priority.md`.
  Commit: Y | `[frontend] source priority 설정 화면 추가 (codex)`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: verify `T015`, `T016`, `T016A`, `T017`, `T018` bullets are mapped.
- [ ] F2. Code quality review: inspect identity/resolution for double counting and product-name-only matching.
- [ ] F3. Real manual QA: validate against `tmp/2025-05-21~2026-05-21.xlsx` and `/data/settings`.
- [ ] F4. Scope fidelity: confirm no Toss adapter or investment performance analysis slipped in.

## Commit strategy
- Expect multiple commits: backend observation/identity, source priority/resolution, coverage/docs, frontend settings.
- Keep migrations with backend commits.

## Success criteria
- Raw observations are preserved.
- Selected canonical values are explainable and auditable.
- Source priority can be stored and previewed.
- Agents can explain mixed-source, stale, conflicted, and coverage states.
