# settlement-group-canonical-netting - Work Plan

## TL;DR (For humans)

**What you'll get:** 원결제, 결제취소, 부분환불을 하나의 경제적 거래 단위로 묶어 지출 분석 전반에서 순액 기준을 재사용할 수 있게 만든다.

**Why this approach:** `T012`의 구매 검토용 refund netting은 이미 있지만, 분석 전반에서 쓰려면 shared settlement layer가 필요하다. `T030-T031`이 먼저 끝난 뒤 source lineage를 근거로 안전하게 연결한다.

**What it will NOT do:** raw signed transaction을 없애지 않는다. 다중 후보를 자동 확정하지 않는다. 거래 source lifecycle 작업을 이 plan에서 다시 구현하지 않는다.

**Effort:** Medium
**Risk:** Medium - 분석 숫자가 바뀔 수 있어 명확한 basis와 docs가 필요하다.
**Decisions to sanity-check:** 처음에는 backend canonical/service layer로 시작하고, 사용자 수정 UI는 최소 API로 제한한다.

Your next move: approve this plan after `transaction-source-upload-reconciliation` is complete. Full execution detail follows below.

---

> TL;DR (machine): Implements roadmap T032 settlement group canonical netting after T030-T031.

## Scope
### Must have
- Roadmap item: `T032`.
- Settlement grouping for original payment, full cancellation, partial refund, and multiple partial refunds.
- Status values: `auto_confirmed`, `review_required`, `user_confirmed`, `rejected` or equivalent.
- Shared service/view that downstream analysis can use without duplicating `T012` logic.
- Backend tests and API/agent docs that distinguish raw signed transactions from settlement-netted analysis.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not mutate raw transaction amount/sign.
- Do not auto-confirm when multiple original-payment candidates exist.
- Do not implement broad budgeting/forecast features here.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after with backend service/API tests.
- Evidence: `.omo/evidence/task-<N>-settlement-group-canonical-netting.md`.
- Required commands:
  - `cd backend && uv run pytest tests/services/test_analytics_service.py tests/api/test_analytics_api.py tests/api/test_transactions_api.py`
  - `cd backend && uv run ruff check .`
  - `git diff --check`

## Execution strategy
### Parallel execution waves
- Wave 1: settlement model/service and matching rules.
- Wave 2: API/canonical integration and user override/reject path.
- Wave 3: docs and final verification.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | T030, T031 | 2, 3 | none |
| 2 | 1 | 3 | docs draft |
| 3 | 1, 2 | final | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Add settlement grouping model/service and matching algorithm.
  What to do / Must NOT do: Add storage or canonical layer for settlement groups. Match by normalized merchant, payment method, currency, opposite sign, amount/full-or-partial relationship, date proximity, description similarity, and existing links. Do not change raw transaction signs.
  Parallelization: Wave 1 | Blocked by: `transaction-source-upload-reconciliation` | Blocks: 2, 3
  References (executor has NO interview context - be exhaustive): `Implentation-plan.md:728`, `backend/app/models/transaction.py`, `backend/app/services/analytics_service.py`, `backend/app/services/transactions_service.py`, `backend/tests/services/test_analytics_service.py`, `backend/tests/services/test_transactions_service.py`.
  Acceptance criteria (agent-executable): backend test covers full refund, partial refund, multiple partial refunds, and multiple candidate originals.
  QA scenarios (name the exact tool + invocation): happy: exact full cancellation nets to zero, failure: two possible originals results in review-required, Evidence `.omo/evidence/task-1-settlement-group-canonical-netting.md`.
  Commit: Y | `[backend] settlement group 모델 추가 (codex)`

- [ ] 2. Integrate settlement netting into analysis surfaces.
  What to do / Must NOT do: Provide a shared service/view for settlement-netted spend. Ensure purchase review refund netting does not double-net with the shared layer.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 3
  References (executor has NO interview context - be exhaustive): `backend/app/api/v1/endpoints/analytics.py`, `backend/app/services/analytics_service.py`, `backend/app/services/canonical_views_dashboard_service.py`, `backend/tests/api/test_analytics_api.py`, `docs/backend-api-and-metrics-reference.md`.
  Acceptance criteria (agent-executable): tests prove monthly/category/merchant analysis uses net amount where documented and raw transaction endpoints still expose signed rows.
  QA scenarios (name the exact tool + invocation): happy: partial refund lowers analysis total, failure: rejected settlement leaves original raw analysis basis unchanged where applicable, Evidence `.omo/evidence/task-2-settlement-group-canonical-netting.md`.
  Commit: Y | `[backend] settlement netting 분석 반영 (codex)`

- [ ] 3. Document settlement basis and agent interpretation.
  What to do / Must NOT do: Update API/agent docs so consumers know when to use raw signed rows vs settlement-netted surface.
  Parallelization: Wave 3 | Blocked by: 1, 2 | Blocks: final
  References (executor has NO interview context - be exhaustive): `docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`, `Implentation-plan.md:728`.
  Acceptance criteria (agent-executable): docs mention settlement status, raw signed transaction, and settlement-netted analysis surface.
  QA scenarios (name the exact tool + invocation): happy: `rg -n "settlement|raw signed|netted" docs`, failure: docs do not claim raw amounts are rewritten, Evidence `.omo/evidence/task-3-settlement-group-canonical-netting.md`.
  Commit: Y | `[docs] settlement netting 기준 문서화 (codex)`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: every `T032` acceptance criterion mapped to code/test/docs.
- [ ] F2. Code quality review: ensure matching rules are deterministic and review-required cases are not auto-confirmed.
- [ ] F3. Real manual QA: run API/service smoke using refund fixtures.
- [ ] F4. Scope fidelity: confirm no transaction lifecycle or forecasting scope is bundled.

## Commit strategy
- Keep model/service and docs in separate commits if the diff is large.
- Keep tests with the behavior they protect.

## Success criteria
- Settlement groups preserve raw evidence while exposing reusable net spend.
- Ambiguous matches require review.
- Analytics and docs clearly state raw-vs-netted basis.
