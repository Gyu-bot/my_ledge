# STATUS.md

## Current State
- **Phase:** Phase 1 — 기반 구축 (MVP)
- **Last Worker:** 민규 (2026-03-23, PRD + AGENTS.md 작성)
- **Branch:** main (초기 설정)

## Completed
- [x] PRD 작성 (`PRD.md`)
- [x] AGENTS.md 작성
- [x] STATUS.md 초기화

## In Progress
- 없음 (Phase 1 개발 시작 전)

## Blocked
- 없음

## Next Up
- [ ] 프로젝트 초기 scaffolding (디렉토리 구조, pyproject.toml, package.json)
- [ ] Docker Compose 초기 구성 (backend + frontend + db)
- [ ] DB 스키마 생성 + Alembic 초기 마이그레이션
- [ ] 엑셀 파싱 파이프라인 구현 (복호화 → 파싱 → 적재)
- [ ] 업로드 API (`POST /api/v1/upload`)
- [ ] 기본 조회 API (transactions summary, by-category)
- [ ] 거래 편집 API (PATCH, DELETE, POST, merge, bulk-update)

## Key Decisions
- 2026-03-23: my_ledge v1을 리셋/확장하는 방향으로 결정 (완전 새 프로젝트 X)
- 2026-03-23: 중복 처리는 복합 유니크 대신 시간 커서 기반 증분 적재 방식 채택
- 2026-03-23: OpenClaw 연동은 하이브리드 (DB readonly + 업로드 API)
- 2026-03-23: 소분류 자동 분류는 다음 버전으로 미룸, 이번 버전은 수동 편집만
- 2026-03-23: 뱅샐현황은 스냅샷 시계열 누적 (덮어쓰기 X)
- 2026-03-23: 이체 타입은 수입/지출 분석에서 제외, 별도 '자산이동' tracking

## Known Issues
- 엑셀 암호 미제공 상태 — `.env`에 `EXCEL_PASSWORD` 설정 필요
- openpyxl read_only 모드에서 `ws.max_row`가 None 반환될 수 있음 — iter_rows 순회 필수
