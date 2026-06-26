# post-trust-automation-forecasting - Work Plan

## TL;DR (For humans)

**What you'll get:** 거래 source와 settlement 신뢰도가 확보된 뒤, 거래처 정규화, 승인 기반 분류 추천, 반복계약, 90일 현금흐름, adaptive budget, 대출 상환 시나리오, 제한적 tag를 순서대로 확장한다.

**Why this approach:** 이 기능들은 모두 신뢰할 수 있는 거래 기반이 있어야 한다. 그래서 `T030-T032` 이후에 추천/자동화, forecast, decision-support 순서로 진행한다.

**What it will NOT do:** 거래 source lifecycle이나 settlement netting을 다시 구현하지 않는다. 자동 적용보다 사용자 승인과 근거 표시를 우선한다. 금융 조언을 확정적으로 내리지 않는다.

**Effort:** XL
**Risk:** High - 여러 제품 영역을 건드리므로 작은 PR들로 순차 진행해야 한다.
**Decisions to sanity-check:** 이 plan은 장기 실행 묶음이다. 실제 시작 시에는 첫 PR을 `T033` 또는 `T034`로 좁히는 것을 권장한다.

Your next move: approve only when post-trust automation work should begin. Full execution detail follows below.

---

> TL;DR (machine): Covers roadmap T033-T039 and T041 after T030-T032.

## Scope
### Must have
- Roadmap items: `T033`, `T034`, `T035`, `T036`, `T037`, `T038`, `T039`, `T041`.
- Start only after `transaction-source-upload-reconciliation` and `settlement-group-canonical-netting`.
- Deterministic merchant normalization candidate engine.
- Approval-based classification suggestions.
- Recurring series and recurring contract ledger.
- 90-day cashflow calendar and later sinking fund/adaptive budget.
- Loan repayment scenario simulator.
- Limited multi-dimensional transaction tags.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not use LLM/ML where deterministic rules are specified.
- Do not auto-apply user-facing rules without preview/approval.
- Do not treat forecasts or loan scenarios as financial advice.
- Do not add split accounting or unbounded tag taxonomy.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after, with backend tests first and frontend/browser QA only for included UI surfaces.
- Evidence: `.omo/evidence/task-<N>-post-trust-automation-forecasting.md`.
- Required commands vary by PR:
  - `cd backend && uv run pytest`
  - `cd backend && uv run ruff check .`
  - `cd frontend && npm test`
  - `cd frontend && npm run typecheck`
  - `cd frontend && npm run lint`
  - browser QA for changed `/data/inbox`, `/data/rules`, `/signals`, or transaction UI surfaces

## Execution strategy
### Parallel execution waves
- Wave 0: confirm `T030-T032` completed and current route/API contracts.
- Wave 1: merchant normalization and approval-based classification.
- Wave 2: recurring series and contract ledger.
- Wave 3: 90-day cashflow, sinking fund/adaptive budget, loan scenario simulator.
- Wave 4: limited transaction tags and final cross-surface docs.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 0 | T030, T031, T032 | 1, 2, 3, 4 | none |
| 1 | 0 | 2, 4 | none |
| 2 | 0, 1 | 3 | none |
| 3 | 2 | 4 | loan scenario can split after inputs verified |
| 4 | 1 | final | docs updates |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 0. Verify prerequisites and split first execution PR.
  What to do / Must NOT do: Confirm `T030-T032` are done in code/docs before implementation. Pick a narrow first PR, recommended `T033` merchant normalization candidate engine.
  Parallelization: Wave 0 | Blocked by: T030-T032 incomplete | Blocks: 1-4
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:690`, `.omo/plans/transaction-source-upload-reconciliation.md`, `.omo/plans/settlement-group-canonical-netting.md`, `docs/backend-api-ssot.md`, `frontend/src/router.tsx`.
  Acceptance criteria (agent-executable): evidence maps current code to completed prerequisites or marks this plan blocked.
  QA scenarios (name the exact tool + invocation): happy: prerequisite APIs/docs exist, failure: missing settlement netting blocks automation start, Evidence `.omo/evidence/task-0-post-trust-automation-forecasting.md`.
  Commit: N | planning/evidence only

- [ ] 1. Implement deterministic merchant normalization and classification suggestions.
  What to do / Must NOT do: Build candidate engine and approval-based suggestions using deterministic rules, evidence, confidence, preview, rejection memory, and manual override precedence.
  Parallelization: Wave 1 | Blocked by: 0 | Blocks: 2, 4
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:746`, `Implentation-plan.md:765`, `backend/app/services/auto_classification_service.py`, `backend/app/schemas/auto_classification.py`, `backend/tests/services/test_auto_classification_service.py`, `frontend/src/features/data/RulesPage.tsx`, `frontend/src/features/data/InboxPage.tsx`.
  Acceptance criteria (agent-executable): tests cover PG prefix, legal suffix, ambiguous merchants, rejection memory, preview count, and manual override preservation.
  QA scenarios (name the exact tool + invocation): happy: high-confidence alias candidate can be approved, failure: rejected candidate is not re-suggested, Evidence `.omo/evidence/task-1-post-trust-automation-forecasting.md`.
  Commit: Y | `[backend][frontend] 승인 기반 분류 추천 추가 (codex)`

- [ ] 2. Implement recurring series segmentation and contract ledger.
  What to do / Must NOT do: Split recurring series under one merchant by payment method, amount cluster, date pattern, and description similarity; then promote approved candidates into recurring contract ledger.
  Parallelization: Wave 2 | Blocked by: 0, 1 | Blocks: 3
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:783`, `Implentation-plan.md:800`, `backend/app/services/analytics_service.py`, `backend/app/services/auto_classification_service.py`, `backend/tests/services/test_analytics_service.py`, `docs/agents/canonical-read-surface-reference.md`.
  Acceptance criteria (agent-executable): tests cover two subscriptions same merchant, variable telecom, utility bill, foreign payment, refund exclusion, price change, missing payment, and cancelled contract.
  QA scenarios (name the exact tool + invocation): happy: recurring contract produces next expected payment, failure: installment is not treated as recurring contract, Evidence `.omo/evidence/task-2-post-trust-automation-forecasting.md`.
  Commit: Y | `[backend] 반복계약 ledger 추가 (codex)`

- [ ] 3. Add cashflow forecast, sinking funds, adaptive budget, and loan scenario calculator.
  What to do / Must NOT do: Add forecast and scenario surfaces that expose assumptions, confidence, missing data, and non-advice boundaries. Keep projections separate from observed cashflow.
  Parallelization: Wave 3 | Blocked by: 2 | Blocks: 4
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:818`, `Implentation-plan.md:837`, `Implentation-plan.md:854`, `backend/app/services/assets_service.py`, `backend/app/services/canonical_views_dashboard_service.py`, `backend/tests/services/test_assets_service.py`, `backend/tests/services/test_analytics_service.py`.
  Acceptance criteria (agent-executable): tests cover salary-before-low-balance, recurring contract forecast, loan repayment, installment forecast, stale input, investment exclusion, annual expense, approved sinking fund, missing fee warning, and rate increase assumption.
  QA scenarios (name the exact tool + invocation): happy: 90-day forecast shows lowest balance and confidence, failure: stale inputs generate warning and do not alter observed cashflow, Evidence `.omo/evidence/task-3-post-trust-automation-forecasting.md`.
  Commit: Y | `[backend] 현금흐름 forecast와 대출 scenario 추가 (codex)`

- [ ] 4. Add limited transaction tags and cross-surface docs.
  What to do / Must NOT do: Add constrained tag model and approved bulk apply/filtering. Do not implement amount split accounting or automatic taxonomy expansion.
  Parallelization: Wave 4 | Blocked by: 1 | Blocks: final
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:870`, `backend/app/api/v1/endpoints/transactions.py`, `backend/app/services/transactions_service.py`, `frontend/src/features/data/TransactionsPage.tsx`, `backend/tests/api/test_transactions_api.py`, `frontend/src/test/features/TransactionsPage.test.tsx`.
  Acceptance criteria (agent-executable): tests cover tag CRUD, bulk apply, filtered transaction list, rejected suggestion memory, category independence, and browser QA if UI included.
  QA scenarios (name the exact tool + invocation): happy: bulk apply and filter by tag, failure: tag does not replace category/spend necessity/loan link, Evidence `.omo/evidence/task-4-post-trust-automation-forecasting.md`.
  Commit: Y | `[backend][frontend] 제한적 거래 tag 추가 (codex)`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: every `T033-T039` and `T041` item is mapped or intentionally split.
- [ ] F2. Code quality review: check deterministic rule precedence, preview/approval safety, and non-advice boundaries.
- [ ] F3. Real manual QA: browser QA for any changed user-facing workflow.
- [ ] F4. Scope fidelity: confirm no source lifecycle/settlement reimplementation or unbounded tagging/accounting split.

## Commit strategy
- Treat each wave as one or more PRs. Do not ship this whole plan as a single broad commit.
- Backend/API and directly required frontend/docs can share a PR per user-visible outcome.

## Success criteria
- Post-trust automation starts only after transaction trust prerequisites.
- Recommendations are evidence-backed and approval-based.
- Forecasts/scenarios expose assumptions and do not claim to be financial advice.
- Tags remain limited and independent of accounting categories.
