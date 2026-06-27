# My Ledge OMO Plan Index

Purpose: track agent-executable OMO plans. This is not the user-facing roadmap; use `../../Implentation-plan.md` for the human project overview.

## Status Values

- `drafting`: investigation or approval gate is still open in `.omo/drafts/`.
- `approved`: ready for `$start-work` or an equivalent worker handoff.
- `in-progress`: a worker is executing the plan.
- `completed`: todos and final verification evidence are complete.
- `blocked`: execution cannot continue without a user decision or external dependency.

## Active Plans

| Plan | Status | Purpose | Draft |
|---|---|---|---|
| [`settlement-group-canonical-netting.md`](settlement-group-canonical-netting.md) | `drafting` | `T032`: shared settlement group netting for refunds/cancellations. | [`../drafts/settlement-group-canonical-netting.md`](../drafts/settlement-group-canonical-netting.md) |
| [`settings-analytics-frontend.md`](settings-analytics-frontend.md) | `drafting` | `T013`: complete analytics parameter editing in `/data/settings`. | [`../drafts/settings-analytics-frontend.md`](../drafts/settings-analytics-frontend.md) |
| [`operational-smoke-capture.md`](operational-smoke-capture.md) | `drafting` | `T014`: read-only operational route/API smoke capture. | [`../drafts/operational-smoke-capture.md`](../drafts/operational-smoke-capture.md) |
| [`asset-investment-source-priority.md`](asset-investment-source-priority.md) | `drafting` | `T015-T018` + `T016A`: observation preservation, source priority, resolution, coverage, settings UI. | [`../drafts/asset-investment-source-priority.md`](../drafts/asset-investment-source-priority.md) |
| [`post-trust-automation-forecasting.md`](post-trust-automation-forecasting.md) | `drafting` | `T033-T039` + `T041`: post-trust automation, forecasting, decision support, limited tags. | [`../drafts/post-trust-automation-forecasting.md`](../drafts/post-trust-automation-forecasting.md) |

## Completed Plans

| Plan | Status | Purpose | Draft |
|---|---|---|---|
| [`loan-installment-candidate-review-workflows.md`](loan-installment-candidate-review-workflows.md) | `completed` | Inbox loan-candidate dismissal, installment transaction suggestions with proposed 회차, and MoM regression guard. | [`../drafts/loan-installment-candidate-review-workflows.md`](../drafts/loan-installment-candidate-review-workflows.md) |
| [`transaction-source-upload-reconciliation.md`](transaction-source-upload-reconciliation.md) | `completed` | `T030-T031`: transaction source lifecycle, upload preview, explicit reconciliation apply. | [`../drafts/transaction-source-upload-reconciliation.md`](../drafts/transaction-source-upload-reconciliation.md) |
| [`my-ledge-omo-plan-review.md`](my-ledge-omo-plan-review.md) | `completed` | Meta review scaffold superseded by the concrete plans above. | [`../drafts/my-ledge-omo-plan-review.md`](../drafts/my-ledge-omo-plan-review.md) |

## Blocked Plans

| Plan | Status | Purpose | Draft |
|---|---|---|---|
| [`toss-securities-holdings-valuation.md`](toss-securities-holdings-valuation.md) | `blocked` | `T019`: Toss Securities holdings valuation integration; blocked until official API docs and credentials/storage decisions are available. | [`../drafts/toss-securities-holdings-valuation.md`](../drafts/toss-securities-holdings-valuation.md) |

## Backlog Candidates

These user-facing roadmap areas still need their own OMO execution plan or decomposition before implementation:

- `T020`: transfer tracking is paused and should remain separate.
- `T022`: long-term product expansion queue must be decomposed into smaller plans before execution.
