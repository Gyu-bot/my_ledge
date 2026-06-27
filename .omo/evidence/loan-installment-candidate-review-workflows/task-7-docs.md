# Task 7 Docs/roadmap/회귀 참조 업데이트 증적

## 수정 섹션 요약
- `docs/backend-api-ssot.md`
  - `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`를 API key 필수 목록에 추가.
  - live endpoint 테이블에 `GET /api/v1/installment-transaction-suggestions`와 `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`를 반영.
  - Installment 관리 항목에 `loan-transaction-links`의 `review_status=all|pending|not_candidate` 지원과 `installment-transaction-suggestions` 동작을 추가.
  - 동일 `PATCH` 엔트리가 중복된 라인을 정리하여 1회만 남김.
- `docs/backend-api-and-metrics-reference.md`
  - 인증 목록에 `GET /api/v1/installment-transaction-suggestions`, `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` 반영.
  - `GET /api/v1/loan-transaction-links` 쿼리에 `review_status: all|pending|not_candidate` 추가.
  - `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` 엔드포인트 계약(요청/응답/409 충돌 조건 포함) 추가.
  - `GET /api/v1/installment-transaction-suggestions` 전용 섹션 추가(필터, 응답 형태, 매칭/정렬/거래 제약).
- `Implentation-plan.md`
  - 사용자-visible 작업 큐 항목 6으로 loan 후보 review 상태/할부 제안 API 문서 반영 완료 및 지출 MoM 회귀 커버리지 유지 보강 노트를 반영.

## 명령어 결과 발췌
```text
$ rg -n "loan-transaction-links/.+review|installment-transaction-suggestions|review_status|대출 후보 아님|제안 회차" docs Implentation-plan.md
Implentation-plan.md:64:6. 대출 후보 `review_status` 및 할부 제안 API는 문서 계약이 SSOT/레퍼런스에 반영되었고, `Implentation-plan.md` 사용자-visible task graph에는 기존 MoM 회귀 커버리지 유지 상태만 보강 노트로 반영되었다.
docs/backend-api-and-metrics-reference.md:51:- `GET /api/v1/installment-transaction-suggestions`
docs/backend-api-and-metrics-reference.md:97:- `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`
docs/backend-api-and-metrics-reference.md:615:  - `review_status: "all" | "pending" | "not_candidate"` default `pending`
docs/backend-api-and-metrics-reference.md:633:#### `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`
docs/backend-api-and-metrics-reference.md:639:  - `review_status: "pending" | "not_candidate"`
docs/backend-api-and-metrics-reference.md:652:  - `review_status`
docs/backend-api-and-metrics-reference.md:749:#### `GET /api/v1/installment-transaction-suggestions`
docs/backend-api-and-metrics-reference.md:1316:  - `review_status`
docs/backend-api-and-metrics-reference.md:1324:- Response: saved canonical `candidate_key`, `candidate_type`, `transaction_id`, `review_status`, `memo`, `reviewed_at`, and `cooldown_until`.
docs/backend-api-ssot.md:70:  - `PATCH /api/v1/loan-transaction-links/{transaction_id}/review`
docs/backend-api-ssot.md:133:| `GET` | `/api/v1/installment-transaction-suggestions` | live | suggested installment transaction links for active plans |
docs/backend-api-and-metrics-reference.md:1323:- Request: `review_status` as `pending`, `reviewed`, `ignored`, `snoozed`, or `dismissed`, plus optional `memo` and `cooldown_days`.
docs/backend-api-and-metrics-reference.md:1324:- Response: saved canonical `candidate_key`, `candidate_type`, `transaction_id`, `review_status`, `memo`, `reviewed_at`, and `cooldown_until`.
docs/backend-api-ssot.md:158:| `PATCH` | `/api/v1/loan-transaction-links/{transaction_id}/review` | live | API key required, set loan candidate review status |
docs/backend-api-ssot.md:272:- `GET /api/v1/loan-transaction-links` supports `review_status=all|pending|not_candidate` and returns default `pending` when omitted.
docs/backend-api-ssot.md:274:- `GET /api/v1/installment-transaction-suggestions` returns deterministic matching candidates for active installment plans only.
```

## MoM 회귀 노트
- 이번 작업은 분석/카테고리 MoM 계산 로직을 건드리지 않음.
- `docs/STATUS.md`는 deprecated로 유지하고, 이번 업데이트에 대한 참조나 수정 없이 문서 계약 업데이트만 수행함.

## 클린업 리시트
- SSOT 인증-required endpoint 목록에서 `PATCH /api/v1/loan-transaction-links/{transaction_id}/review` 중복 행 1건 제거.
- `docs/STATUS.md` 미수정.
- 사용자-visible 경로/코드 계약 위주로 변경하고 기능 코드 로직은 수정하지 않음.

## 역량 점검(Adversarial QA)
- stale_state: 작업 시작 시점에 pre-existing 변경사항이 다수 존재했으며, task7은 `docs/*`와 `Implentation-plan.md`에 한정하여 편집.
- dirty_worktree: `git status --short`에서 다수 미변경/미추적 파일이 남아 있으나 task7 변경 파일만 추적 검토.
- misleading_success_output: `rg` 결과는 요청된 키워드 라인 포함을 확인했고, `git diff --check`는 whitespace 문제 없음.
- docs drift/code-contract alignment: SSOT/레퍼런스/plan 모두 실제 엔드포인트/필터/스키마와 정합되도록 업데이트.
- deprecated docs guard: `docs/STATUS.md`는 접근/수정하지 않음.
- scope fidelity: 코드 변경 없이 계약 문서/로드맵 상태 보강만 수행.
