# OpenClaw Integration Docs

OpenClaw 작업자가 `my_ledge`를 읽기/쓰기 대상으로 연결할 때 필요한 문서를 모아둔 디렉터리다.

권장 읽기 순서:

1. [integration-guide.md](/home/gyurin/projects/my_ledge/docs/openclaw/integration-guide.md)
   - 현재 backend/API 구조
   - readonly DB 접근 규칙
   - 인증, 주요 endpoint, 예시 호출
2. [skill-handoff.md](/home/gyurin/projects/my_ledge/docs/openclaw/skill-handoff.md)
   - OpenClaw 쪽에서 실제 skill로 패키징할 때 필요한 입력값
   - 권장 tool flow
   - acceptance checklist

참고 문서:

- 제품 요구사항: [PRD.md](/home/gyurin/projects/my_ledge/PRD.md)
- 협업/운영 규칙: [AGENTS.md](/home/gyurin/projects/my_ledge/AGENTS.md)
- 현재 구현/검증 상태: [STATUS.md](/home/gyurin/projects/my_ledge/STATUS.md)

이 디렉터리의 목적은 `my_ledge` 저장소 관점에서 연동 계약을 명확히 남기는 것이다.  
실제 OpenClaw skill 생성, 설치, 배포는 OpenClaw 쪽 저장소/운영 환경에서 별도로 수행한다.
