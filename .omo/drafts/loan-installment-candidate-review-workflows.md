---
slug: loan-installment-candidate-review-workflows
status: approved
intent: clear
pending-action: ready for execution after user approval or optional high-accuracy review
approach: backend-backed loan candidate review state, read-only installment suggestion API, frontend actions, docs, and evidence-backed QA
---

# Draft: loan-installment-candidate-review-workflows

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| id | outcome | status | evidence path |
|---|---|---|---|
| C1 | Loan candidate review persistence/API hides dismissed candidates from default inbox queries and allows recovery. | active | `.omo/evidence/loan-installment-candidate-review-workflows/backend-loan-review.md` |
| C2 | Inbox UI exposes `대출 후보 아님`, calls the review API, updates counts, and removes the row after confirmation. | active | `.omo/evidence/loan-installment-candidate-review-workflows/inbox-ui.md` |
| C3 | Installment suggestion service/API proposes existing transactions for active installment plans with proposed installment number, confidence, reasons, and conflicts. | active | `.omo/evidence/loan-installment-candidate-review-workflows/installment-suggestions-api.md` |
| C4 | Installment UI surfaces suggestions and lets the user link with the proposed 회차 without auto-linking. | active | `.omo/evidence/loan-installment-candidate-review-workflows/installment-ui.md` |
| C5 | MoM spending fix remains covered as regression only; no new analytics behavior change is bundled. | active | `.omo/evidence/loan-installment-candidate-review-workflows/mom-regression.md` |
| C6 | API docs, roadmap notes, automated tests, and browser evidence prove the full user request. | active | `.omo/evidence/loan-installment-candidate-review-workflows/final-verification.md` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Meaning of `대출 후보 아님` | Persistent, reversible `not_candidate` review state. | Hiding must survive refresh/re-import review sessions without mutating raw transactions or loan links. | Yes, restore status to `pending`. |
| Inbox disappearance scope | Hide from `/data/inbox` and default loan candidate lists; expose audit/recovery through a review-status filter. | The inbox count is backend-derived, so backend default filtering is mandatory. | Yes, use `review_status=not_candidate` or `all`. |
| Loan candidate identity | Use transaction-based key/state: `candidate_type=loan_transaction`, `transaction_id`, and derived key `loan_transaction:{transaction_id}`. | Existing candidate rows are transaction-backed, and current transaction IDs are the stable review identity in this app. | Mostly; can add external import fingerprint later if needed. |
| Installment suggestions | V1 suggests links to existing active installment plans only. | User asked about candidates after registering an installment item, not automatic plan creation. | Yes, future plan discovery can be added separately. |
| Suggested 회차 | Compute from month difference between plan `first_payment_date` and transaction date, bounded by `1..total_installments`. | Matches normal installment billing progression and gives deterministic numbering. | Yes, user can override before link. |
| Suggestion matching | Same merchant strongly preferred, same/similar amount, same billing day or small date tolerance, optional payment method boost. | Mirrors the user's stated heuristics and avoids opaque AI-style suggestions. | Yes, thresholds can be settings later. |
| MoM spending page | Treat as regression guard only; do not change backend analytics semantics unless tests prove a remaining defect. | A MoM display fix already exists on `main`; this request is to re-plan the missing original requirements. | Yes, if verification finds drift. |

## Findings (cited - path:lines)
- `frontend/src/features/data/InboxPage.tsx:150-200` renders each loan candidate with account select, repayment select, `연결`, and `대출에서 열기`; no `대출 후보 아님` action exists.
- `frontend/src/features/data/InboxPage.tsx:206-224` fetches `useLoanTransactionMappings({ linked: 'unlinked', page: 1, per_page: 20 })`; inbox count and cards depend on backend results.
- `backend/app/api/v1/endpoints/loan_mapping.py:54-128` exposes loan candidate list and link/unlink endpoints only; no candidate review/dismiss endpoint exists.
- `backend/app/services/loan_mapping_service.py:455-510` builds loan candidate rows from existing links, finance category, and text patterns; no reviewed/dismissed state is filtered.
- `backend/app/models/purchase_gate_review.py:9-25` provides an existing review-state pattern, but it is purchase-gate specific and cannot be reused directly for loan candidates.
- `frontend/src/features/data/InstallmentsPage.tsx:135-235` supports manual installment links and defaults unlinked rows to 회차 `1`; no suggestion engine or proposed 회차 is shown.
- `backend/app/api/v1/endpoints/installments.py:37-155` exposes plan CRUD, links, bulk links, and forecast; no installment transaction suggestion endpoint exists.
- `backend/app/services/installment_service.py:336-380` limits the current mapping list to existing installment-kind or linked rows; broader expected-payment suggestions need a separate query/contract.
- `frontend/src/ds/charts/MoMList.tsx` and related tests already fixed display of MoM ratio and signed delta amount on `main`; keep this under regression coverage.

## Decisions (with rationale)
- D1. Add a dedicated `loan_candidate_reviews` table instead of a frontend-only flag. The candidate list is backend-derived, and dismissed rows must disappear from counts and survive refresh.
- D2. Add `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` protected by the existing write API-key dependency. The action mutates review state, not loan links.
- D3. Extend loan candidate listing with `review_status=pending|not_candidate|all`, defaulting to `pending`; default `/data/inbox` behavior excludes `not_candidate`.
- D4. Reject or no-op safely when a candidate is linked while being dismissed; restore to `pending` is idempotent.
- D5. Add `GET /api/v1/installment-transaction-suggestions` with optional `installment_plan_id`, pagination, and conflict visibility. This avoids changing the existing manual link list semantics.
- D6. Suggestion response must include plan, transaction, `suggested_installment_number`, expected billing date, amount/day deltas, score/confidence, reason labels, and `conflict_reason`.
- D7. UI must never auto-link installment suggestions. It pre-fills the proposed 회차 and still uses the existing link mutation.
- D8. Keep MoM work scoped to tests/verification unless a fresh failing test proves current `main` still disagrees with real data.

## Scope IN
- Backend migration/model/schema/service/API for reversible loan candidate review.
- Backend filtering so dismissed loan candidates disappear from default inbox/default candidate queries.
- Frontend inbox action `대출 후보 아님`, disabled/error states, cache invalidation, and tests.
- Backend installment suggestion endpoint and deterministic matching algorithm.
- Frontend installment suggestion section/table with proposed 회차, confidence/reasons/conflicts, and connect action.
- API docs, roadmap/status notes, automated test coverage, and browser evidence.
- MoM display regression checks for percent scaling and signed previous-month delta amount.

## Scope OUT (Must NOT have)
- Do not mutate raw transactions, delete transactions, or create fake loan links when dismissing a candidate.
- Do not hide or delete loan accounts; account `is_hidden` is not a substitute for candidate review.
- Do not auto-link installment suggestions.
- Do not introduce ML/LLM matching, new chart libraries, or broad analytics refactors.
- Do not change settlement, transfer, asset, or investment logic.
- Do not push directly to `main` during execution unless the user explicitly asks again.

## Open questions
- None blocking. The plan adopts the conservative defaults above so execution can start without another clarification round.

## Approval gate
status: approved
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
