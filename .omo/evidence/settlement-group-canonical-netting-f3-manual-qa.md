# settlement-group-canonical-netting F3 Manual QA

Date: 2026-06-27
Workspace: `/Users/gyurin/dev/my_ledge`
Branch: `codex/settlement-group-canonical-netting`
Role: manual QA executor

Overall verdict: **FAIL**

Reason: Required service/API pytest smoke and `git diff --check` passed, but the feasible backend plan subset command `uv run ruff format --check .` failed with 53 files requiring formatting. No Docker/services were started.

## Invocation Log

### Preflight

Surface: git working tree

Exact invocation:

```bash
git status --short --branch
```

Observed output:

```text
## codex/settlement-group-canonical-netting
 M .omo/plans/settlement-group-canonical-netting.md
 M backend/app/models/__init__.py
 M backend/app/services/analytics_service.py
 M backend/tests/api/test_analytics_api.py
 M backend/tests/api/test_transactions_api.py
 M backend/tests/services/test_analytics_service.py
 M docs/agents/canonical-read-surface-reference.md
 M docs/backend-api-and-metrics-reference.md
 M docs/backend-api-ssot.md
?? .DS_Store
?? .omo/.DS_Store
?? .omo/boulder.json
?? .omo/evidence/
?? .omo/start-work/
?? backend/alembic/versions/20260627_0029_add_settlement_matches.py
?? backend/app/models/settlement_group.py
?? backend/app/services/settlement_group_matching.py
?? backend/app/services/settlement_group_service.py
?? backend/tests/services/test_settlement_group_service.py
?? backend/tests/services/test_settlement_group_service_regression.py
?? docs/.DS_Store
```

### Backend Service/API Pytest Smoke

Surface: backend service/API pytest, ASGI HTTP tests plus service tests

Exact invocation:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run pytest \
  tests/services/test_settlement_group_service.py \
  tests/services/test_settlement_group_service_regression.py \
  tests/services/test_analytics_service.py::test_get_monthly_cashflow_uses_confirmed_settlement_net_amount \
  tests/services/test_analytics_service.py::test_get_monthly_cashflow_does_not_create_settlement_matches \
  tests/services/test_analytics_service.py::test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis \
  tests/services/test_analytics_service.py::test_get_category_mom_keeps_rejected_settlement_on_raw_basis \
  tests/services/test_analytics_service.py::test_get_merchant_spend_uses_confirmed_settlement_net_amount \
  tests/api/test_analytics_api.py::test_purchase_gate_candidates_net_full_refunds_out_of_review_queue \
  tests/api/test_analytics_api.py::test_purchase_gate_candidates_use_net_amount_for_partial_refunds \
  tests/api/test_analytics_api.py::test_monthly_cashflow_endpoint_uses_confirmed_settlement_net_amount \
  tests/api/test_analytics_api.py::test_monthly_cashflow_endpoint_keeps_confirmed_settlement_read_only \
  tests/api/test_analytics_api.py::test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis \
  tests/api/test_analytics_api.py::test_merchant_spend_endpoint_uses_confirmed_settlement_net_amount \
  tests/api/test_transactions_api.py::test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis
```

Observed output excerpt:

```text
collected 21 items

tests/services/test_settlement_group_service.py ......                   [ 28%]
tests/services/test_settlement_group_service_regression.py ...           [ 42%]
tests/services/test_analytics_service.py .....                           [ 66%]
tests/api/test_analytics_api.py ......                                   [ 95%]
tests/api/test_transactions_api.py .                                     [100%]

======================= 21 passed, 190 warnings in 0.53s =======================
```

Verdict: PASS

### Backend Ruff Check

Surface: backend lint

Exact invocation:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run ruff check .
```

Observed output:

```text
All checks passed!
```

Verdict: PASS

### Backend Ruff Format Check

Surface: backend formatting check

Exact invocation:

```bash
cd backend
UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache \
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge \
API_KEY=test-api-key \
uv run ruff format --check .
```

Observed output excerpt:

```text
Would reformat: alembic/versions/20260323_0001_initial_schema.py
Would reformat: alembic/versions/20260326_0003_cost_classification_fields.py
Would reformat: alembic/versions/20260402_0005_add_merchant_to_transactions.py
Would reformat: alembic/versions/20260530_0019_p1_advisor_surfaces.py
Would reformat: alembic/versions/20260530_0021_add_purchase_gate_reviews.py
Would reformat: app/services/analytics_service.py
Would reformat: app/services/settlement_group_matching.py
Would reformat: tests/api/test_analytics_api.py
Would reformat: tests/api/test_transactions_api.py
Would reformat: tests/services/test_analytics_service.py
Would reformat: tests/services/test_settlement_group_service.py
Would reformat: tests/services/test_settlement_group_service_regression.py
53 files would be reformatted, 103 files already formatted
```

Exit code: 1

Verdict: FAIL

### Git Diff Whitespace Check

Surface: git diff whitespace check

Exact invocation:

```bash
git diff --check
```

Observed output:

```text
<empty output>
```

Exit code: 0

Verdict: PASS

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| F3-SVC-001 | full refund nets zero | backend service pytest | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run pytest tests/services/test_settlement_group_service.py tests/services/test_settlement_group_service_regression.py ...` | PASS | `ART-F3-MD` |
| F3-SVC-002 | partial refund lowers analytics | backend service/API pytest | same pytest invocation, including `test_get_monthly_cashflow_uses_confirmed_settlement_net_amount`, `test_get_merchant_spend_uses_confirmed_settlement_net_amount`, `test_monthly_cashflow_endpoint_uses_confirmed_settlement_net_amount`, `test_merchant_spend_endpoint_uses_confirmed_settlement_net_amount` | PASS | `ART-F3-MD` |
| F3-SVC-003 | review_required raw basis | backend service pytest | same pytest invocation, including `test_reconcile_settlement_matches_marks_multiple_candidates_for_review` and `test_get_monthly_cashflow_keeps_review_required_refund_on_raw_basis` | PASS | `ART-F3-MD` |
| F3-API-004 | rejected raw basis | backend service/API pytest | same pytest invocation, including `test_get_category_mom_keeps_rejected_settlement_on_raw_basis` and `test_category_mom_endpoint_keeps_rejected_settlement_on_raw_basis` | PASS | `ART-F3-MD` |
| F3-API-005 | raw transactions signed | backend API pytest | same pytest invocation, including `tests/api/test_transactions_api.py::test_list_transactions_preserves_raw_signed_amounts_after_settlement_analysis` | PASS | `ART-F3-MD` |
| F3-API-006 | read-only analytics no settlement_matches mutation | backend service/API pytest | same pytest invocation, including `test_get_monthly_cashflow_does_not_create_settlement_matches` and `test_monthly_cashflow_endpoint_keeps_confirmed_settlement_read_only` | PASS | `ART-F3-MD` |
| F3-API-007 | purchase-gate no double-net | backend API pytest | same pytest invocation, including `test_purchase_gate_candidates_net_full_refunds_out_of_review_queue` and `test_purchase_gate_candidates_use_net_amount_for_partial_refunds` | PASS | `ART-F3-MD` |
| F3-CMD-008 | required plan command subset: backend lint | backend ruff check | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run ruff check .` | PASS | `ART-F3-MD` |
| F3-CMD-009 | required plan command subset: backend format check | backend ruff format check | `cd backend && UV_CACHE_DIR=/private/tmp/my_ledge-uv-cache DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/my_ledge API_KEY=test-api-key uv run ruff format --check .` | FAIL | `ART-F3-MD` |
| F3-CMD-010 | requested command: git diff --check | git diff whitespace check | `git diff --check` | PASS | `ART-F3-MD` |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| F3-ADV-001 | full refund nets zero | full cancellation refund | confirmed original purchase with equal positive refund has `net_amount == 0` and does not appear in purchase-gate review queue | PASS | `ART-F3-MD` |
| F3-ADV-002 | partial refund lowers analytics | cross-date partial refund | analytics counts original purchase net of confirmed refund, not raw gross spend | PASS | `ART-F3-MD` |
| F3-ADV-003 | review_required raw basis | ambiguous original candidates | multiple possible originals are stored as `review_required`; analytics stays on raw signed basis | PASS | `ART-F3-MD` |
| F3-ADV-004 | rejected raw basis | manually rejected settlement | rejected settlement is ignored by category MoM netting and raw basis remains | PASS | `ART-F3-MD` |
| F3-ADV-005 | raw transactions signed | raw transaction read after analytics call | `/api/v1/transactions` returns raw refund positive and purchase negative amounts after analytics execution | PASS | `ART-F3-MD` |
| F3-ADV-006 | read-only analytics no mutation | analytics read side effect | monthly cashflow reads do not create or modify `settlement_matches` | PASS | `ART-F3-MD` |
| F3-ADV-007 | purchase-gate no double-net | legacy purchase-gate refund netting plus shared settlement netting | fully refunded candidate is omitted and partial refund candidate uses one netted amount with refund signal, not double subtraction | PASS | `ART-F3-MD` |
| F3-ADV-008 | command hygiene | whitespace diff check | `git diff --check` exits 0 with empty output | PASS | `ART-F3-MD` |
| F3-ADV-009 | plan subset formatting | backend format check | `uv run ruff format --check .` should exit 0 if backend formatting contract is satisfied | FAIL | `ART-F3-MD` |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| ART-F3-MD | markdown evidence | F3 manual QA matrix and exact command evidence | `.omo/evidence/settlement-group-canonical-netting-f3-manual-qa.md` |
