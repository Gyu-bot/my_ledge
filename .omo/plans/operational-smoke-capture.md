# operational-smoke-capture - Work Plan

## TL;DR (For humans)

**What you'll get:** 운영 배포본의 주요 화면, legacy redirect, API proxy/runtime config가 실제 브라우저에서 깨지지 않는지 증거를 남긴다.

**Why this approach:** frontend remake는 main에 반영됐지만 운영 배포본 확인은 별도이다. 구현 변경보다 관찰/증거 수집이 핵심이다.

**What it will NOT do:** 운영 서비스를 임의로 재배포하거나 Docker/network/host 설정을 바꾸지 않는다. 발견된 버그를 이 plan에서 즉시 고치지 않고 별도 fix task로 분리한다.

**Effort:** Quick
**Risk:** Low - read-only 확인이지만 운영 접근/환경 차이로 막힐 수 있다.
**Decisions to sanity-check:** 배포 URL 또는 실행 중인 local target이 필요하다. 없으면 plan은 blocked evidence를 남긴다.

Your next move: provide/confirm the target when starting work. Full execution detail follows below.

---

> TL;DR (machine): Executes roadmap T014 operational smoke capture without service mutation.

## Scope
### Must have
- Roadmap item: `T014`.
- Capture screenshot/console status for `/`, `/spending`, `/net-worth`, `/signals`, `/data/inbox`, `/data/transactions`, `/data/loans`, `/data/assets`, `/data/settings`.
- Confirm basic accessibility for `/data/import`, `/data/rules`, `/data/installments`, `/data/reference`.
- Confirm legacy redirects.
- Confirm API proxy/runtime config enough to load data or expected empty/error states.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not change Docker, network, host, or deployment settings.
- Do not stop honcho services.
- Do not fix bugs in this plan; file separate plan/issue notes.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: none for code; browser/manual QA evidence only.
- Evidence: `.omo/evidence/task-<N>-operational-smoke-capture.md` plus screenshots under `.omo/evidence/operational-smoke-capture/` if tracked intentionally.
- Required checks:
  - inspect current service/port state before opening targets
  - browser console/network capture for each required route
  - `git diff --check` if evidence docs are edited

## Execution strategy
### Parallel execution waves
- Wave 1: target discovery and safety checks.
- Wave 2: page/redirect/API smoke capture.
- Wave 3: evidence summary and follow-up issue list.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | target URL | 2 | none |
| 2 | 1 | 3 | none |
| 3 | 2 | final | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Discover target and inspect local service state.
  What to do / Must NOT do: Confirm the deployment or local URL. If local, normalize to `http://...` and inspect Docker/process/ports before starting anything. Do not mutate services.
  Parallelization: Wave 1 | Blocked by: target URL unavailable | Blocks: 2
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:331`, `AGENTS.md`, `frontend/src/router.tsx`, `docs/STATUS.md`.
  Acceptance criteria (agent-executable): evidence records target URL, service state, and whether checks are operating against deployment or local build.
  QA scenarios (name the exact tool + invocation): happy: target loads root route, failure: no target available records blocked status, Evidence `.omo/evidence/task-1-operational-smoke-capture.md`.
  Commit: N | evidence-only unless user asks to commit evidence

- [ ] 2. Capture required routes and redirects.
  What to do / Must NOT do: Use Codex in-app browser first. Capture screenshots and console status for all T014 routes. Do not use external browser unless in-app browser cannot complete.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
  References (executor has NO interview context - be exhaustive): `frontend/src/router.tsx`, `frontend/src/features/**`, `Implentation-plan.md:331`.
  Acceptance criteria (agent-executable): every route has pass/fail/blocked status and console summary.
  QA scenarios (name the exact tool + invocation): happy: each route renders expected shell/page signal, failure: redirect or blank/error page recorded with URL and console output, Evidence `.omo/evidence/task-2-operational-smoke-capture.md`.
  Commit: N | evidence-only unless user asks to commit evidence

- [ ] 3. Summarize API proxy/runtime config and split follow-up issues.
  What to do / Must NOT do: Record whether API calls succeed, are empty by design, or fail due to config/runtime. List fixes separately; do not implement them here.
  Parallelization: Wave 3 | Blocked by: 2 | Blocks: final
  References (executor has NO interview context - be exhaustive): `frontend/src/lib`, `frontend/src/api`, `frontend/src/hooks`, `Implentation-plan.md:331`.
  Acceptance criteria (agent-executable): evidence summary has route table, API/runtime status, and follow-up list.
  QA scenarios (name the exact tool + invocation): happy: no console/runtime blockers, failure: runtime config/API failure documented with reproduction URL, Evidence `.omo/evidence/task-3-operational-smoke-capture.md`.
  Commit: N | evidence-only unless user asks to commit evidence

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: every `T014` route/check is accounted for.
- [ ] F2. Code quality review: not applicable unless docs/evidence committed.
- [ ] F3. Real manual QA: browser screenshots/console are the primary artifact.
- [ ] F4. Scope fidelity: confirm no service mutation or bugfix implementation occurred.

## Commit strategy
- Default: no commit. If evidence is meant to be durable, commit a small evidence/doc summary only after user approval.

## Success criteria
- Operational smoke status is observable and reproducible.
- Failures are separated into follow-up tasks instead of mixed into smoke capture.
