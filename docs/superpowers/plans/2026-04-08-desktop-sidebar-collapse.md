# Desktop Sidebar Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크톱 왼쪽 사이드바를 기본 icon-only 상태로 시작시키고 클릭 토글로 펼침/접힘을 전환한다.

**Architecture:** `AppLayout` 이 collapse 상태를 소유하고 `AppSidebar` 는 표시만 담당한다. 모바일 drawer 는 그대로 유지하고, 데스크톱 shell 테스트로 기본 접힘과 토글 동작을 고정한다.

**Tech Stack:** React, React Router, Vitest, Testing Library, Tailwind utility classes

---

### Task 1: Write the failing UI behavior tests

**Files:**
- Modify: `frontend/src/test/components/layout/AppSidebar.test.tsx`
- Modify: `frontend/src/test/components/layout/AppLayout.test.tsx`

- [ ] 기본 collapsed 사이드바에서 라벨/section text 가 노출되지 않는 테스트를 추가한다.
- [ ] 토글 버튼 클릭 후 라벨이 다시 보이는 테스트를 추가한다.
- [ ] 대상 테스트만 먼저 실행해 현재 구현이 실패하는지 확인한다.

### Task 2: Implement layout state and sidebar toggle

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/components/layout/AppSidebar.tsx`

- [ ] `AppLayout` 에 `sidebarCollapsed` 상태와 토글 함수를 추가한다.
- [ ] `AppSidebar` 에 `collapsed`, `onToggle` prop 을 추가한다.
- [ ] collapsed 상태에서 폭/정렬/텍스트 렌더링을 분기한다.
- [ ] nav link `aria-label` 과 `title` 은 유지한다.

### Task 3: Verify and document

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/daily/2026-04-08/codex.md`

- [ ] 관련 layout 테스트를 재실행해 green 상태를 확인한다.
- [ ] frontend lint/typecheck 를 실행해 영향 범위를 확인한다.
- [ ] STATUS 와 daily log 에 변경 내용과 검증 결과를 남긴다.
