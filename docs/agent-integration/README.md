# Agent Integration Docs

Hermes, Codex, Claude, OpenClaw 등 범용 에이전트가 `my_ledge`를 읽기/쓰기 대상으로 연결할 때 필요한 문서를 모아둔 디렉터리다.

시작점:

1. [../agents/README.md](../agents/README.md)
   - 에이전트 공통 권한 모델
   - canonical read surface 우선 규칙
   - 추천 작업 흐름
2. [../agents/canonical-read-surface-reference.md](../agents/canonical-read-surface-reference.md)
   - API와 canonical view 값의 의미
   - 계산식과 null/비율/금액 해석 규칙
   - My Ledge 계산/후보와 에이전트 최종 해석의 책임 경계
   - 에이전트 답변 시 주의사항
3. [integration-guide.md](integration-guide.md)
   - API/DB 연결 정보
   - readonly DB 접근 규칙
   - 일반 운영 flow
4. [skill-handoff.md](skill-handoff.md)
   - 각 에이전트 runtime에서 skill/tool로 패키징할 때 넣어야 할 규칙
   - 최소 검증 시나리오

참고 문서:

- 제품 요구사항: [../../PRD.md](../../PRD.md)
- 협업/운영 규칙: [../../AGENTS.md](../../AGENTS.md)
- 현재 구현/검증 상태: [../STATUS.md](../STATUS.md)
- live backend/API contract: [../backend-api-ssot.md](../backend-api-ssot.md)
- 상세 endpoint/metric reference: [../backend-api-and-metrics-reference.md](../backend-api-and-metrics-reference.md)

기존 `docs/openclaw/` 경로는 과거 호환용 alias로만 유지한다. 새 문서는 이 디렉터리를 기준으로 갱신한다.
