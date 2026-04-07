# Desktop Sidebar Collapse Design

## Goal

데스크톱 네비게이션 사이드바를 기본적으로 아이콘만 보이는 축약 상태로 시작하게 하고, 사용자가 필요할 때 클릭으로 펼쳐서 전체 라벨을 볼 수 있게 만든다.

## Scope

- 대상은 현재 왼쪽 데스크톱 `AppSidebar` 이다.
- 모바일 `MobileDrawer` 동작은 유지한다.
- 새 페이지나 새 라우트는 추가하지 않는다.

## Design

### State ownership

- `AppLayout` 이 데스크톱 사이드바의 `collapsed` 상태를 소유한다.
- 초기값은 `true` 로 둬서 앱 진입 시 기본이 icon-only 상태가 되게 한다.
- 상태는 레이아웃 세션 내에서 유지하고, 이번 변경에서는 localStorage persistence 는 추가하지 않는다.

### Sidebar behavior

- `AppSidebar` 는 `collapsed` 와 `onToggle` prop 을 받는다.
- `collapsed=true` 일 때 폭은 좁게(`w-20`) 유지하고 아이콘만 보이게 한다.
- 브랜드 서브텍스트, section label, nav item label 은 접힘 상태에서 렌더링하지 않는다.
- nav item 은 `aria-label` 과 `title` 을 유지해 icon-only 상태에서도 의미가 드러나게 한다.
- active/hover 색상과 기존 navigation source 는 그대로 재사용한다.

### Toggle affordance

- 토글 버튼은 데스크톱 사이드바 헤더 우측에 둔다.
- 버튼은 chevron 아이콘으로 현재 상태를 표현하고, 클릭 시 고정 펼침/접힘을 전환한다.
- 모바일 topbar 의 메뉴 버튼과 역할이 다르므로 topbar 에 새 토글은 추가하지 않는다.

### Testing

- `AppSidebar` 에서 기본 collapsed 렌더 시 라벨이 숨겨지는지 검증한다.
- `AppLayout` 에서 토글 버튼 클릭 후 라벨이 나타나는지 검증한다.
- 기존 breadcrumb/topbar 렌더 계약은 유지되는지 회귀 확인한다.

## Risks

- 텍스트를 단순 hidden 처리하면 테스트와 접근성에서 혼동이 생길 수 있으므로, 접힘 상태에서는 불필요한 label 텍스트를 렌더링하지 않는 편이 낫다.
- 폭 전환 시 레이아웃 점프가 커질 수 있으므로 transition 은 짧게만 적용한다.
