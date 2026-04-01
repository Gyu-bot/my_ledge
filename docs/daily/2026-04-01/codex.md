# 2026-04-01 Codex Log

## Summary
- `AGENTS.md`, `docs/STATUS.md`, 최근 커밋, 현재 git 상태를 먼저 확인했다.
- `.env` 가 현재 git tracked 상태이고, `.gitignore` 에 누락되어 있음을 확인했다.
- `.env` 경로 이력이 최신 커밋 하나에만 존재함을 확인해 전체 filter-rewrite 대신 latest commit rewrite 전략을 선택했다.
- `.gitignore` 에 `.env` 를 추가하고 `docs/STATUS.md` 를 현재 작업 기준으로 갱신했다.
- 오늘 턴의 로컬 history 정리 후 remote 반영에는 force-push가 필요하므로 이를 후속 조치로 남긴다.

## Git Hygiene Update
- `git ls-files .env` → tracked 확인
- `git rev-list --all -- .env` → latest commit 1건만 매칭
- 조치:
  - `.gitignore` 에 `.env` 추가
  - `git rm --cached .env` 로 인덱스에서만 제거
  - latest commit amend 로 로컬 history 에서 `.env` 제거

## Verification
- `git log --oneline -- .env`
- `git ls-files .env`
- `git status --short --branch`

## Follow-up
- remote `origin/main` 에는 기존 커밋이 남아 있을 수 있으므로 반영하려면 force-push가 필요하다.

## Frontend Redesign Wireframe
- 현재 frontend 라우트, 페이지 구성, hook 조합, backend API/analytics surface를 검토했다.
- 현재 구현은 `/`, `/assets`, `/spending`, `/data` 4개 화면만 활성화되어 있고, backend advisor analytics 8종 endpoint는 아직 frontend에서 사용하지 않음을 확인했다.
- visual companion을 사용해 IA 3안(A 균등형 / B 혼합형 / C workspace 중심)을 비교했고, 사용자와 함께 `Option B`를 선택했다.
- 선택된 방향:
  - 전역 구조는 `개요 | 분석 | 운영`
  - `분석` 내부에 `지출 | 자산 | 인사이트`
  - `운영` 내부에 `업로드 | 거래 작업대`
  - `income` / `transfers`는 독립 페이지보다 홈의 월간 현금흐름과 인사이트 surface로 흡수
- 후속 승인 반영:
  - 운영 섹션은 `거래 작업대`가 기본 화면
  - `업로드`, `최근 업로드 이력`, `Danger Zone`은 작업대 아래 접힌 아코디언
- 산출물:
  - `docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md`
  - `.gitignore` 에 `.superpowers/` 추가
- 다음 단계는 spec 리뷰 승인 후 구현 계획 문서로 전환하는 것이다.

## DESIGN.md Review
- `docs/DESIGN.md` 를 검토했다.
- 결론:
  - 기술적으로 일부 토큰은 도입 가능하다.
  - 하지만 문서 전체를 as-is 디자인 시스템으로 채택하는 것은 부적합하다.
- 주요 이유:
  - CRM / sales pipeline 전용 도메인 언어가 강하다.
  - kanban / stage / won-risk-lost 상태 모델이 재무 대시보드와 맞지 않는다.
  - 현재 확정된 frontend IA(`개요 | 분석 | 운영`)보다 pipeline workspace 가정을 더 강하게 전제한다.
- 적용 가능하다고 본 범위:
  - spacing scale
  - radius scale
  - card / input / button의 기본 밀도 규칙
- 적용 비추천 범위:
  - 브랜드명/컨셉 문구
  - pipeline stage 색 의미
  - won / risk / lost 상태 chip
  - kanban 전제 do/don't

## Design Token Rewrite
- 사용자 결정:
  - legacy `docs/DESIGN.md` 는 archive 없이 제거
  - 새 기준 문서는 `docs/frontend-design-tokens.md`
- 조치:
  - `docs/frontend-design-tokens.md` 작성
  - `docs/superpowers/specs/2026-04-01-frontend-redesign-wireframe-design.md` 에 새 토큰 문서 참조 추가
  - `docs/STATUS.md` 를 새 기준에 맞게 갱신
  - legacy `docs/DESIGN.md` 삭제
- 새 문서 원칙:
  - 4px spacing, radius, density, input/button/card 기본 규칙은 유지
  - pipeline / stage / won-risk-lost 의미 체계는 제거
  - 재무 도메인에 맞는 blue / teal / semantic state palette로 재정의

## Frontend Redesign Implementation Plan
- `writing-plans` 기준으로 구현 계획 문서를 작성했다.
- 산출물:
  - `docs/superpowers/plans/2026-04-01-frontend-redesign-implementation.md`
- 계획 범위:
  - 새 토큰 적용과 shell foundation
  - 새 route map 및 legacy redirect
  - overview page 구현
  - analysis section의 spending/assets migration
  - insights page 구현
  - operations workbench 재구성
  - 회귀 테스트와 문서 마무리
