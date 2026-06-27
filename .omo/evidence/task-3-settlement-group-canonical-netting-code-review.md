# Task 3 Settlement Group Canonical Netting Code Review

Date: 2026-06-27
Task: `Todo 3` docs boundary review (`.omo/plans/settlement-group-canonical-netting.md`)
Scope: Task 3 docs artifacts only (`docs/backend-api-ssot.md`, `docs/backend-api-and-metrics-reference.md`, `docs/agents/canonical-read-surface-reference.md`); no product code or tests touched.

## Verdict
- `recommendation`: `PASS` (Task 3 리뷰 산출물 블로커 해소됨)
- `adversarial_verify`: `needs-fix` in plan checkbox state only (left intentionally unchanged per instruction)

## Review requirement mapping

### 1) remove-ai-slops / programming-overfit check
- `no production code` touched: yes.
- `no tests` added: yes.
- `no speculative scope` added: no.
  - Task 3 artifacts only document existing boundaries (`raw signed`, `settlement-netted`, status matrix) and do not add budgeting/forecasting/lifecycle workflow expansion.
- `no raw amount rewrite claim`: no.
  - Docs explicitly preserve raw signed storage/sign and distinguish it from confirmed settlement analytics math.
- `no broad forecasting/budgeting/lifecycle expansion`: no.
  - No new section introduces lifecycle mutations or forecast/business-planning language.
- `no speculative implementation claims` that cannot be demonstrated: no.
  - Claims are limited to source-of-truth docs and status matrices already present in three canonical docs.

### 2) Direct evidence that docs include required semantics

Ran:

```bash
rg -n "settlement|raw signed|netted|auto_confirmed|review_required|user_confirmed|rejected" \
  docs/backend-api-ssot.md docs/backend-api-and-metrics-reference.md docs/agents/canonical-read-surface-reference.md
```

Key direct snippets:

- `docs/backend-api-ssot.md:280-289`
  - `raw` rows preserve original import sign/amount.
  - confirmed-only states: `auto_confirmed`, `user_confirmed`.
  - unconfirmed states: `review_required`, `rejected` (no canonical netting).
  - analytics is read-only; no reconcile write path.
- `docs/backend-api-and-metrics-reference.md:1579-1582`
  - confirmed settlements only (`auto_confirmed`, `user_confirmed`) folded into netting.
  - `review_required`, `rejected` keep raw signed semantics.
  - read path does not create/update settlement match rows.
- `docs/agents/canonical-read-surface-reference.md:217-230`
  - explicit raw signed vs settlement-netted surface separation.
  - explicit four-state matrix with per-state rules and raw semantics for `review_required`/`rejected`.

### 3) Direct evidence that docs do NOT claim raw amount rewrite

Ran:

```bash
rg -n "rewrite|rewritten|mutate raw|raw amount" docs/backend-api-ssot.md docs/backend-api-and-metrics-reference.md docs/agents/canonical-read-surface-reference.md
```

Observed:
- `docs/agents/canonical-read-surface-reference.md:188-189`: raw signed `amount`/`type` 자체를 뒤집는 rewrite가 기본 동작이 아님.
- `docs/backend-api-ssot.md:282-283`: raw import sign/amount 보존 언급.
- `docs/backend-api-and-metrics-reference.md:1581-1582`: unconfirmed 상태에서 raw signed semantics 유지.
- Note: `docs/backend-api-and-metrics-reference.md:1277` mentions legacy key rewrite (`large_oneoff:42` -> `transaction:42`) is key-namespace migration; it does not rewrite 금액 원본.

## Pure LOC
- Task 3 artifact is docs-only review.
- `Pure LOC` for production/test code is `N/A`.
- Mentioned large code files (`backend/tests/api/test_transactions_api.py`, `backend/tests/services/test_analytics_service.py`) are inherited from `Todo 2` and are not introduced by Task 3.

## Adversarial classes
- `stale_state`: `git status --short --branch` checked; branch has unrelated in-progress changes, but `Task 3` review only used current branch context and did not mutate code/docs outside Task 3 scope.
- `dirty_worktree`: acknowledged in evidence scope; unresolved repository edits were intentionally not modified.
- `misleading_success_output`: validated by line-level snippets + command outputs; not relying only on exit codes.
- `malformed/status matrix`: all required states explicitly covered in task-relevant docs and matrix.
- `long_commands`: only bounded `rg/sed/git diff --check` class commands executed.
- `prompt_injection`: `N/A` (no prompt-processing path exercised).
- `cancel_resume`: `N/A` (single pass, no interrupted resume state).
- `flaky_tests`: `N/A` (no tests run for Task 3 gate artifact).
- `repeated_interruptions`: `N/A`.

## Diff cleanliness

Ran:

```bash
git diff --check
```

- No whitespace or diff-format errors reported.

## Blocker closure status

- Created this Task 3 code-review artifact, which satisfies the missing-review requirement reported by the gate.
- Did **not** modify plan checkboxes, per instruction.
