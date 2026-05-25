# Agent Integration Docs

OpenClaw/hermes 및 기타 에이전트가 `my_ledge`를 읽기/쓰기 대상으로 연결할 때 필요한 문서를 모아둔 디렉터리다.
디렉터리 이름은 기존 OpenClaw 연동 경로와 호환성을 위해 유지한다.

새 에이전트 세션의 시작점은 [docs/agents/README.md](../agents/README.md)다.
이 디렉터리는 기존 OpenClaw 문서를 확장한 세부 운영/skill handoff 참고 문서로 사용한다.

권장 읽기 순서:

1. [../agents/README.md](../agents/README.md)
   - 에이전트 공통 권한 모델
   - canonical view 우선 규칙
   - 주요 API와 작업 흐름
2. [integration-guide.md](integration-guide.md)
   - 현재 backend/API 구조
   - readonly DB 접근 규칙
   - 인증, 주요 endpoint, 예시 호출
3. [skill-handoff.md](skill-handoff.md)
   - OpenClaw/hermes 쪽에서 실제 skill/tool로 패키징할 때 필요한 입력값
   - 권장 tool flow
   - acceptance checklist

참고 문서:

- 제품 요구사항: [PRD.md](../../PRD.md)
- 협업/운영 규칙: [AGENTS.md](../../AGENTS.md)
- 현재 구현/검증 상태: [docs/STATUS.md](../STATUS.md)
- live backend/API contract: [docs/backend-api-ssot.md](../backend-api-ssot.md)

이 디렉터리의 목적은 `my_ledge` 저장소 관점에서 연동 계약을 명확히 남기는 것이다.
실제 에이전트 skill/tool 생성, 설치, 배포는 각 에이전트 쪽 저장소/운영 환경에서 별도로 수행한다.
