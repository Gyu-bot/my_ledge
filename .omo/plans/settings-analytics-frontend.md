# settings-analytics-frontend - Work Plan

## TL;DR (For humans)

**What you'll get:** `/data/settings`에서 재무 목표뿐 아니라 분석 파라미터의 default/saved/effective 값을 보고 편집할 수 있게 만든다.

**Why this approach:** backend `settings/analytics` contract와 현재 `SettingsPage`가 이미 있으므로, 남은 일은 기존 API/client/hook 패턴을 유지하며 화면과 테스트를 확장하는 것이다.

**What it will NOT do:** reset-to-default, export/import 같은 개발자 도구를 일반 사용자 UI에 노출하지 않는다. 새 CSS framework나 별도 상태관리 라이브러리를 추가하지 않는다.

**Effort:** Medium
**Risk:** Medium - 설정값 단위 변환과 저장 우선순위가 틀리면 분석 결과가 오해될 수 있다.
**Decisions to sanity-check:** UI는 `/data/settings` 한 화면 안에서 섹션별 편집으로 유지한다.

Implementation status: completed in PR #20 (`codex/settings-analytics-frontend`).

Next implementation:
1. Run [`operational-smoke-capture.md`](operational-smoke-capture.md) for `T014` once this PR is merged or when the target URL is confirmed. This is read-only operational/browser evidence work and should not mutate services.
2. After `T014`, start [`asset-investment-source-priority.md`](asset-investment-source-priority.md) for the next product implementation sequence: `T015` observation/source foundation first, then `T016` source priority API, then `T016A` `/data/settings` source-priority UI only after the backend contract is stable.

Full execution detail follows below.

---

> TL;DR (machine): Completes roadmap T013 analytics settings frontend.

## Scope
### Must have
- Roadmap item: `T013`.
- Show analytics setting sections with default/saved/effective values.
- Edit purchase gate, discretionary velocity, recurring dry-run, and asset-liability settings exposed by current backend contract.
- Preserve existing financial targets editing.
- Add frontend tests and browser/visual check.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not expose reset-to-default or export/import as normal user UI.
- Do not add Redux/Zustand or a new CSS framework.
- Do not change backend settings semantics unless the existing contract is insufficient, and then document the contract change.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with Vitest and browser QA.
- Evidence: `.omo/evidence/task-<N>-settings-analytics-frontend.md`.
- Required commands:
  - `cd frontend && npm test -- SettingsPage`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
  - browser or equivalent visual QA for `/data/settings`

## Execution strategy
### Parallel execution waves
- Wave 1: contract inventory and typed API/client updates.
- Wave 2: UI sections and validation/copy.
- Wave 3: tests, docs, browser QA.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2 | none |
| 2 | 1 | 3 | docs draft |
| 3 | 2 | final | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Inventory and type the current analytics settings contract.
  What to do / Must NOT do: Read backend schemas/service and frontend API/hook. Add/adjust frontend types only for fields that backend actually returns. Do not invent settings unsupported by backend.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:306`, `backend/app/api/v1/endpoints/settings.py`, `backend/app/schemas/settings.py`, `backend/app/services/settings_service.py`, `frontend/src/api/settings.ts`, `frontend/src/hooks/useSettings.ts`.
  Acceptance criteria (agent-executable): TypeScript types model default/saved/effective values for all editable analytics sections.
  QA scenarios (name the exact tool + invocation): happy: mocked settings response renders all sections in a test, failure: missing optional saved value falls back to effective/default display without crash, Evidence `.omo/evidence/task-1-settings-analytics-frontend.md`.
  Commit: Y | `[frontend] settings analytics 타입 확장 (codex)`

- [x] 2. Build sectioned `/data/settings` editing UI.
  What to do / Must NOT do: Extend `SettingsPage` using existing Ledger DS patterns. Include explicit labels for default/saved/effective and unit conversion for percentages/amounts. Keep dangerous/dev tools hidden.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
  References (executor has NO interview context - be exhaustive): `frontend/src/features/data/SettingsPage.tsx`, `frontend/src/ds/`, `frontend/src/test/features/SettingsPage.test.tsx`, `frontend/src/AGENTS.md`.
  Acceptance criteria (agent-executable): User can edit and save all T013 remaining settings in tests; financial targets existing tests still pass.
  QA scenarios (name the exact tool + invocation): happy: edit purchase threshold and recurring dry-run default then assert PATCH payload, failure: invalid percent or negative amount shows validation state and does not PATCH, Evidence `.omo/evidence/task-2-settings-analytics-frontend.md`.
  Commit: Y | `[frontend] 분석 설정 편집 화면 완성 (codex)`

- [x] 3. Update frontend docs and run visual QA.
  What to do / Must NOT do: Update current frontend contract docs only for the changed route/section behavior. Start/inspect local frontend only after checking service/port state.
  Parallelization: Wave 3 | Blocked by: 2 | Blocks: final
  References (executor has NO interview context - be exhaustive): `docs/frontend/page-wireframes.md`, `docs/frontend/components-and-design-token-inventory.md`, `docs/frontend-design-tokens.md`, `frontend/src/test/features/SettingsPage.test.tsx`.
  Acceptance criteria (agent-executable): `npm test -- SettingsPage`, `npm run typecheck`, `npm run lint`, and browser visual QA pass or document pre-existing blockers.
  QA scenarios (name the exact tool + invocation): happy: `/data/settings` loads and saves mocked/real dev settings, failure: network/API error leaves visible error/retry state, Evidence `.omo/evidence/task-3-settings-analytics-frontend.md`.
  Commit: Y | `[docs] 설정 화면 contract 갱신 (codex)`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit: verify all unchecked `T013` bullets are satisfied.
- [x] F2. Code quality review: ensure strict TypeScript and no `any`.
- [x] F3. Real manual QA: browser check `/data/settings` desktop/mobile if feasible.
- [x] F4. Scope fidelity: confirm no backend source-priority or unrelated UI work slipped in.

## Commit strategy
- One frontend commit is acceptable if API types, page UI, and tests are tightly coupled.
- Docs may be same commit if the diff is small; otherwise split docs.

## Success criteria
- `/data/settings` is a complete user-facing analytics settings editor for current backend fields.
- Existing financial target behavior still works.
- Tests, typecheck, lint, and visual QA evidence exist.
