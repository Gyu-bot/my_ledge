# 2026-04-08 Codex

## Desktop Sidebar Collapse

- 사용자 요청
  - 오른쪽 사이드바처럼 느껴지는 데스크톱 네비게이션을 평소에는 icon-only 로 접고 필요할 때 클릭으로 펼치게 바꿔 달라는 요청

### 판단

- 실제 코드에는 별도 right rail 이 없고, `AppSidebar` 가 왼쪽 데스크톱 shell navigation 역할을 하고 있었음
- 새 화면이나 새 route 를 만들지 않고 기존 `AppLayout` + `AppSidebar` 연결만 수정하는 것이 맞다고 판단
- persistence 는 이번 턴 범위에서 제외하고, 앱 진입 시 기본값만 collapsed 로 두기로 결정

### 문서화

- `docs/superpowers/specs/2026-04-08-desktop-sidebar-collapse-design.md`
- `docs/superpowers/plans/2026-04-08-desktop-sidebar-collapse.md`

### TDD

- red:
  - `frontend/src/test/components/layout/AppSidebar.test.tsx`
  - `frontend/src/test/components/layout/AppLayout.test.tsx`
  - 기본 collapsed 상태에서 라벨이 숨겨지고, 토글 후 라벨이 다시 보이는 테스트를 추가
  - 실행 결과: 실패 확인
- green:
  - `frontend/src/components/layout/AppLayout.tsx`
  - `frontend/src/components/layout/AppSidebar.tsx`
  - `AppLayout` 이 `sidebarCollapsed` 상태를 소유
  - `AppSidebar` 가 `collapsed`, `onToggle` 을 받아 폭/브랜드/section label/nav label 렌더링을 분기
  - nav icon-only 상태에서도 `aria-label`, `title` 유지

### 실행한 명령

- `cd frontend && npm test -- --runInBand src/test/components/layout/AppSidebar.test.tsx src/test/components/layout/AppLayout.test.tsx src/test/components/layout/AppTopbar.test.tsx`
  - 결과: `6 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과

### 결과

- 데스크톱 shell 은 기본 icon-only 상태로 시작
- sidebar header 의 chevron 버튼 클릭 시 full-width 로 펼쳐지고 다시 접을 수 있음
- 모바일 drawer 와 topbar breadcrumb 계약은 그대로 유지

## Validation Sweep

- 사용자 요청
  - 필요한 검증을 모두 진행해 달라는 요청

### 실행 기준

- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋 기준으로 남아 있던 validation scope를 재확인
- `AGENTS.md` 에서 full build는 사전 확인 대상이라 이번 턴에서는 제외
- 대신 아래 검증을 필수 세트로 실행:
  - backend 전체 회귀
  - frontend 전체 회귀
  - upload/read/edit/reset/assets/source parity 관련 운영 플로우 검증

### 실행한 명령

- `cd backend && uv run pytest -q`
  - 결과: `74 passed`
- `cd frontend && npm test -- --runInBand`
  - 결과: `39 passed`
- `cd frontend && npm run lint`
  - 결과: 통과
- `cd frontend && npm run typecheck`
  - 결과: 통과
- `cd backend && uv run pytest tests/api/test_upload_api.py tests/api/test_transactions_api.py tests/api/test_data_management_api.py tests/api/test_assets_api.py tests/services/test_source_verification.py -q`
  - 결과: `27 passed`

### 해석

- backend 전체 회귀와 frontend 전체 회귀는 모두 green
- upload → read → edit → reset → assets compare → source parity까지 이어지는 핵심 운영 플로우도 테스트 기준으로 재검증 완료
- 현재 남은 검증성 TODO는 코드 레벨이 아니라 운영 배포본 smoke capture 쪽이다

### 문서 반영

- `docs/STATUS.md`
  - Last Worker / 검증 완료 상태 / 남은 TODO 정리
