# STATUS

## Current Objective
P0 advisor analytics 4종 구현을 완료했고, 다음 우선순위인 P1 rule-based diagnostics 설계/구현으로 넘어간다.

## Current State
- phase: Phase 4A P0 advisor analytics 구현 완료, Phase 4B diagnostics 대기
- last update: 2026-03-31T20:05+0900
- branch: main
- summary: `vw_transactions_effective` 기반으로 P0 advisor analytics 4종(`monthly-cashflow`, `category-mom`, `fixed-cost-summary`, `merchant-spend`)을 구현했고 backend 서비스/API 테스트를 통과시켰다. 다음 작업은 OpenClaw 실사용을 염두에 둔 P1 heuristic endpoint 설계와 fixture 보강이다.

---

## Progress
- Phase 1, Phase 2 핵심 기능 구현 완료
- OpenClaw handoff 문서와 canonical read contract 정리 완료
- OpenClaw readonly DB / `schema` API / upload-read flow 실검증 완료
- advisor analytics 확장 요구사항 feasibility review 완료
- `PRD.md`와 advisor analytics 구현 계획 문서 동기화 완료
- P0 advisor analytics 4종 endpoint 구현 완료
- backend targeted test 통과: `tests/services/test_analytics_service.py`, `tests/api/test_analytics_api.py`
- backend 전체 test suite 통과: `cd backend && uv run pytest -q` (`45 passed`)

---

## Short-term TODO
- P1 rule-based diagnostics endpoint contract 구현
- merchant normalization / liquidity mapping / loan repayment metadata 필요성 재판단
- 데이터 관리 bulk edit v1 구현

---

## Next Step
`GET /api/v1/analytics/payment-method-patterns` 또는 `income-stability` 부터 P1 diagnostics 설계를 시작한다.

---

## Long-term Plan
- OpenClaw 연동 완료
- advisor analytics P0 -> P1 -> P2 순차 구현
- 데이터 관리 후속 기능 확장
- Phase 2 UI/성능 polish 정리

---

## Decisions
- 2026-03-30: `docs/STATUS.md`를 루트 `STATUS.md`의 concise mirror로 유지한다. 상위 지침에서 docs 경로를 요구하므로 에이전트 진입점 혼선을 줄이는 쪽이 안전하다.
- 2026-03-30: 데이터 관리 후속 기능은 `reset 기능`과 `bulk edit 기능`을 분리해 진행한다. 특히 설명 일괄 수정은 단순 UI 변경이 아니라 `description_user`와 canonical read path 보강이 필요하므로 별도 단계로 떼는 편이 안전하다.
- 2026-03-30: reset 기능은 `POST /api/v1/data/reset` 단일 endpoint + `scope` 분기 방식으로 구현하고, `upload_logs`는 유지한다.
- 2026-03-30: `vw_transactions_effective` 는 canonical 분석 surface로서 기본적으로 삭제/병합 row를 제외한다. 삭제/병합 상태가 필요한 조회는 raw `transactions` 또는 `GET /api/v1/transactions?include_deleted=true&include_merged=true` 로 우회한다.
- 2026-03-31: advisor analytics는 P0/P1/P2로 분리해 rollout한다. P0는 현재 스키마만으로 구현하고, P1은 rule-based heuristic, P2는 `*_est`/mapping 전제를 둔 자산·부채 건강도 API로 설계한다.
- 2026-03-31: `merchant_normalized`, cash-equivalent 분류, loan repayment metadata는 P0 blocker가 아니다. 실제 OpenClaw 사용에서 품질 부족이 확인되면 Phase 4B/4C에서 schema enrichment로 보강한다.
- 2026-03-31: OpenClaw 환경의 readonly DB, `/api/v1/schema`, upload/read 흐름 검증은 완료된 것으로 간주하고, Phase 3의 남은 문서 작업은 별도 blocker가 없는 한 끝낸다.
- 2026-03-31: `monthly-cashflow.transfer` 는 자산이동 activity volume 으로 해석해 `ABS(amount)` 합계로 반환한다. 순현금흐름에는 포함하지 않는다.

---

## Risks / Blockers
- `merchant_normalized`가 없어 recurring/anomaly/merchant aggregation 품질은 raw `description` alias에 영향을 받는다.
- `asset_snapshots`에는 현금성 분류 기준이 없어 emergency fund 계산은 초기에는 규칙/매핑 의존이다.
- `loans`에는 월 상환액이 없어 debt burden은 추정치(`*_est`)로만 제공 가능하다.
