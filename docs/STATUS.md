# STATUS

## Current Objective
Phase 3 실제 연동 검증을 진행하고 OpenClaw read contract를 안정화한다.

## Current State
- phase: Phase 3 준비 완료, 실제 연동 대기
- last update: 2026-03-30T17:01+0900
- branch: main
- summary: 핵심 화면과 데이터 관리 기본 흐름은 완료됐고, 현재 최우선 과제는 OpenClaw skill 패키징과 `schema` API, readonly DB, `upload` API의 end-to-end 검증이다. OpenClaw가 지적한 `vw_transactions_effective` 문서/구현 불일치는 수정했고, canonical view는 이제 기본적으로 삭제/병합 row를 제외한다. 이번 migration 반영은 compose 기준 `docker compose up -d --build`로 충분하다.

---

## Progress
- Phase 1, Phase 2 핵심 기능 구현 완료
- 운영 배포용 compose/migrate/frontend proxy hotfix 반영 완료
- OpenClaw handoff 문서 작성 완료
- `vw_transactions_effective` canonical contract 수정 완료

---

## Short-term TODO
- OpenClaw 쪽 skill 패키징/배포
- OpenClaw -> `schema` API / readonly DB / `upload` API end-to-end 검증
- 데이터 관리 bulk edit v1 구현
- 데이터 관리 bulk edit v2 설계 고정

---

## Next Step
OpenClaw 환경에서 readonly DB 접속과 `/api/v1/schema` 조회를 먼저 실검증한다.

---

## Long-term Plan
- OpenClaw 연동 완료
- 데이터 관리 후속 기능 확장
- Phase 2 UI/성능 polish 정리

---

## Decisions
- 2026-03-30: `docs/STATUS.md`를 루트 `STATUS.md`의 concise mirror로 유지한다. 상위 지침에서 docs 경로를 요구하므로 에이전트 진입점 혼선을 줄이는 쪽이 안전하다.
- 2026-03-30: 데이터 관리 후속 기능은 `reset 기능`과 `bulk edit 기능`을 분리해 진행한다. 특히 설명 일괄 수정은 단순 UI 변경이 아니라 `description_user`와 canonical read path 보강이 필요하므로 별도 단계로 떼는 편이 안전하다.
- 2026-03-30: reset 기능은 `POST /api/v1/data/reset` 단일 endpoint + `scope` 분기 방식으로 구현하고, `upload_logs`는 유지한다.
- 2026-03-30: `vw_transactions_effective` 는 canonical 분석 surface로서 기본적으로 삭제/병합 row를 제외한다. 삭제/병합 상태가 필요한 조회는 raw `transactions` 또는 `GET /api/v1/transactions?include_deleted=true&include_merged=true` 로 우회한다.

---

## Risks / Blockers
- 저장소에 backend 샘플 workbook fixture(`tmp/finance_sample.xlsx`, `tmp/sample_260324.xlsx`)가 없어 전체 `pytest`는 아직 통과시키지 못했다.
