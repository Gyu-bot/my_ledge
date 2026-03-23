# STATUS.md

## Current State
- **Phase:** Phase 1 — 기반 구축 (MVP)
- **Last Worker:** codex (2026-03-23T19:36+09:00)
- **Branch:** main (초기 설정)

## Completed
- [x] PRD 작성 (`PRD.md`)
- [x] AGENTS.md 작성
- [x] STATUS.md 초기화
- [x] 구현 전 요구사항 공백 점검 및 의사결정 반영
- [x] Phase 1 구현계획 문서 작성 (`docs/superpowers/plans/2026-03-23-phase1-mvp-foundation.md`)
- [x] Task 1 완료: backend 스캐폴딩 + `/api/v1/health` + 설정/보안 뼈대

## In Progress
- [ ] Phase 1 MVP 구현 일시중지
  - 계획 문서: `docs/superpowers/plans/2026-03-23-phase1-mvp-foundation.md`
  - 마지막 완료 작업: Task 1 `Scaffold backend project and runtime configuration`
  - 현재 상태: Task 1 리뷰 반영까지 완료, 사용자 요청으로 여기서 중단

## Blocked
- 없음

## Next Up
- [ ] Task 2 실행: SQLAlchemy 모델 + Alembic 초기 마이그레이션
- [ ] Task 3 실행: 엑셀 복호화/파서 구현
- [ ] Task 4 실행: 업로드 서비스 + incremental import + `partial` 정책
- [ ] Task 5 실행: upload/schema/assets API
- [ ] Task 6 실행: 거래 조회/편집 API (`merge`는 501 stub)
- [ ] Task 7 실행: frontend 최소 스캐폴딩 + Docker Compose
- [ ] Task 8 실행: 검증 + STATUS 갱신

## Key Decisions
- 2026-03-23: my_ledge v1을 리셋/확장하는 방향으로 결정 (완전 새 프로젝트 X)
- 2026-03-23: 중복 처리는 복합 유니크 대신 시간 커서 기반 증분 적재 방식 채택
- 2026-03-23: OpenClaw 연동은 하이브리드 (DB readonly + 업로드 API)
- 2026-03-23: 소분류 자동 분류는 다음 버전으로 미룸, 이번 버전은 수동 편집만
- 2026-03-23: 뱅샐현황은 스냅샷 시계열 누적 (덮어쓰기 X)
- 2026-03-23: 이체 타입은 수입/지출 분석에서 제외, 별도 '자산이동' tracking
- 2026-03-23: `snapshot_date`는 API 입력값 우선, 없으면 서버 업로드 날짜 사용
- 2026-03-23: 업로드는 부분 성공(`partial`) 허용, 성공분은 유지하고 실패 정보는 `upload_logs`에 기록
- 2026-03-23: 카테고리/결제수단 선택지는 `transactions` distinct 값 기반으로 조회
- 2026-03-23: 조회 API는 `is_edited`, `include_deleted`, `include_merged`, `search` 필터 포함
- 2026-03-23: 비공개/쓰기성 API는 `X-API-Key` 인증 방식 사용
- 2026-03-23: 원본 업로드 파일은 최근 5개만 보관
- 2026-03-23: 거래 병합 기능은 MVP 범위에서 제외

## Known Issues
- 엑셀 암호 미제공 상태 — `.env`에 `EXCEL_PASSWORD` 설정 필요
- openpyxl read_only 모드에서 `ws.max_row`가 None 반환될 수 있음 — iter_rows 순회 필수
- 현재 제공된 샘플 `/tmp/finance_sample.xlsx` 는 비암호화 파일이며, 실제 암호화 BankSalad 샘플 검증은 별도 필요
