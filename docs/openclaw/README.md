# Legacy OpenClaw Path

이 디렉터리는 과거 OpenClaw 연동 링크 호환성을 위해 남긴 legacy path다.
현재 `my_ledge`의 에이전트 대상은 OpenClaw 전용이 아니라 Hermes, Codex, Claude, OpenClaw 등 범용 에이전트다.

새 문서는 아래 경로를 기준으로 본다.

권장 읽기 순서:

1. [../agents/README.md](../agents/README.md)
   - 에이전트 공통 권한 모델
   - canonical view 우선 규칙
   - 주요 API와 작업 흐름
2. [../agents/canonical-read-surface-reference.md](../agents/canonical-read-surface-reference.md)
   - canonical view/API 값 의미와 계산식
   - 에이전트 답변 시 주의사항
3. [../agent-integration/README.md](../agent-integration/README.md)
   - 범용 에이전트 연동 문서 인덱스
4. [../agent-integration/integration-guide.md](../agent-integration/integration-guide.md)
   - API/DB 연결, 인증, readonly DB 규칙
5. [../agent-integration/skill-handoff.md](../agent-integration/skill-handoff.md)
   - 각 에이전트 runtime에서 skill/tool로 패키징할 때 필요한 규칙

참고 문서:

- 제품 요구사항: [PRD.md](../../PRD.md)
- 협업/운영 규칙: [AGENTS.md](../../AGENTS.md)
- 사용자용 구현 현황/roadmap: [Implentation-plan.md](../../Implentation-plan.md)
- OMO 실행계획: [.omo/plans/](../../.omo/plans/)
- live backend/API contract: [docs/backend-api-ssot.md](../backend-api-ssot.md)

이 디렉터리에는 새 세부 문서를 추가하지 않는다.
기존 외부 링크가 이 경로를 가리킬 때 새 범용 문서로 안내하기 위한 compatibility shim으로만 유지한다.
