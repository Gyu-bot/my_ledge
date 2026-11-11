# 보안·운영 상품화 감사 — 2026-10-22

검토 기준: `9876439` (2026-10-22). 소스와 CI/배포 선언을 분석했다. 소스 확정 동작과 제품 모델에 따른 위험을 구분한다. 현재 운영이 인터넷에 노출되었다거나 실제 침해가 있었다는 주장은 아니다. [종합 보고서](README.md)의 읽기 전용 운영 관찰과 검증 결과를 함께 본다.

## 판단

현재 모델은 **동일한 신뢰 경계 안의 단일 사용자 장부**다. 개인 self-host 상품으로는 안전한 배포 기본값, 백업/복원, import 자원 제한, PostgreSQL release gate를 보강하면 이어갈 수 있다. 공용 서비스라면 사용자 인증·권한·tenant 분리가 출시 선행 조건이며 로그인 화면만 추가해서 해결되지 않는다.

이미 있는 기반: 쓰기 API의 `require_api_key`(일부는 router 단위 적용), no-key 요청 거절, 업로드 preview/명시적 confirmation, migration 완료 후 backend 시작, nginx 32MB 업로드 상한, 원본 파일명 정규화, 업로드 warning 기록, 고정 lockfile 기반 CI, 일부 migration backfill 테스트. 아래 개선은 이 기반을 유지해야 한다.

우선순위 구분: 아래 P0는 공개/상품 배포 모델의 출시 차단 조건이며 현재 개인 사설 배포의 장애 발생 주장이 아니다. reset FK 실패 등 재현된 현재 기능 결함은 backend 감사의 별도 bug 목록에서 먼저 다룬다. 현재 live health/readonly DB 성공은 정상 시점의 가용성 근거로 반영하되 OPS-04의 장애 감지 계약을 대체하지 않는다.

## SEC-01 — 브라우저 방문자가 전역 쓰기 키를 받는 구조, 개인정보 GET은 익명 접근

- 우선순위: **외부 공개/비신뢰 사용자 접근 시 P0**. 완전히 신뢰하는 단일 사용자 사설망에서는 제품 경계를 명시해야 하는 P1.
- 근거: `frontend/docker-entrypoint.d/40-runtime-config.sh:8-15`는 API key를 공개 정적 파일에 기록한다. `frontend/src/lib/apiClient.ts:16-27`은 runtime 값 또는 `VITE_API_KEY`를 모든 API 요청에 붙인다. `docker-compose.yml:64-72`, `frontend/Dockerfile:4-6`은 빌드에도 같은 키를 전달한다. `frontend/nginx.conf:18-25,47-55`에는 정적 파일·API 인증 게이트가 없다. `backend/app/main.py:8-22` 및 `api/v1/router.py:23-40`에도 공통 인증이 없고, `endpoints/transactions.py:55-75`, `profile.py:11-15`, `upload.py:43-56`은 키 없이 읽는다. `core/security.py:8-20`은 단일 공유 키 일치만 확인한다.
- 실패 조건/사용자 영향: 배포 URL에 접근할 수 있는 사람은 거래·신용점수 등 읽기 데이터를 받고 runtime config로 쓰기 키도 획득한다. 키를 얻으면 거래 변경, 설정 변경, `/data/reset` 같은 권한까지 공유된다. CORS 설정은 이 접근 통제를 대신하지 않는다.
- 해결 방향: self-host는 신뢰 프록시 인증을 포함한 명시적 배포 모델과 API 직접 접근 차단을 기본 제공. 공용 서비스는 서버 세션/사용자별 인증, 읽기/쓰기 권한, 만료·폐기 가능한 agent credential을 분리하고 전역 비밀을 bundle/runtime config에서 제거한다. 권한 badge도 키 문자열 존재가 아닌 실제 capability 응답에 연결한다.
- 완료 기준: 익명 GET/쓰기 모두 정의된 public health 외 401/403; 정적 asset/config에 쓰기 비밀 없음; 사용자 로그아웃·키 폐기 후 이전 요청 거절; 읽기 agent credential로 변경 API 거절; 프록시를 우회하는 backend 포트로 접근 불가.
- T 연계: T013 설정/권한 UX와 연관되지만 기존 완료 범위 밖. T022를 분해한 인증·배포 경계 신규 승인 task 필요.

## SEC-02 — 사용자 격리 모델이 없어 공용 DB에 두 사용자를 넣을 수 없음

- 우선순위: **멀티테넌트 상품 모델일 때 P0**, 단일 사용자 instance 제품에는 결함으로 분류하지 않음.
- 근거: `models/transaction.py:20-87`의 거래에는 소유자 키가 없다. `models/user_profile_snapshot.py:9-17`은 snapshot_date 단독 unique, `models/app_setting.py:7-16`은 scope/key 단독 unique다. `services/data_reset_service.py:22-47`은 전체 Transaction 및 선택된 snapshot 테이블을 조건 없이 삭제한다. 인증 함수는 identity를 반환하지 않는다(`core/security.py:8-20`).
- 실패 조건/영향: 로그인만 추가하고 사용자 데이터를 공용 DB에 저장하면 거래·설정·프로필 충돌, 다른 사용자 데이터 조회/변경·전체 reset이 가능하다. 현재 설계의 의도된 단일 장부 성격을 IDOR 버그로 오인하지 않아야 한다.
- 해결 방향: 먼저 1 customer = 1 isolated instance인지 shared service인지 결정한다. shared service면 tenant 소유권, unique/FK/index 범위, query scope, asset source resolution, 원본 저장 namespace, agent 권한, migration을 함께 설계한다.
- 완료 기준: A/B tenant가 같은 날짜/merchant/source/account key를 사용해도 분리; 직접 ID 요청·bulk/reset·import·canonical query·원본 저장·복원에서 교차 접근 0; 기존 단일 장부 이관 검증. instance 모델은 고객별 DB/volume/credential 및 운영 계정 분리 검증.
- T 연계: T022에서 제품 모델 결정 후 신규 architecture task. T015-T018의 source/provenance만으로 tenant 경계가 생기지 않음.

## OPS-01 — 배포 기본값이 전체 인터페이스의 DB/API 공개와 알려진 개발 키를 허용

- 우선순위: 상품 배포 기본값 **P0**, 신뢰 로컬 개발용 compose라면 별도 production profile이 필요한 P1.
- 근거: `docker-compose.yml:8-11`은 개발 DB/readonly 암호 fallback와 `5432:5432`; `43-50`은 개발 API key fallback와 `8000:8000`; `77-78`은 frontend host port다. backend와 migrate가 같은 POSTGRES_USER를 사용한다(`30,43`). `backend/app/core/config.py:17-19`에는 production key 강도/placeholder 검증이 없고 `core/security.py:12-17`은 비어 있지 않은 placeholder를 유효 구성으로 취급한다. HTTPS는 T022 미착수 항목(`Implentation-plan.md:563-564`).
- 실패 조건/영향: 배포자가 sample/default로 실행하고 네트워크에 접근 가능한 환경이면 DB/API가 직접 열리고 인증 프록시를 우회한다. 실제 운영 firewall/TLS 존재 여부는 이번 소스 감사로 단정하지 않음.
- 해결 방향: DB/API host publish 제거 또는 loopback 기본값; production secrets 필수/placeholder 부팅 실패; runtime DB role과 migration owner 분리; TLS termination 및 신뢰 프록시 배포 정의. 개발 convenience는 별도 profile로 유지.
- 완료 기준: 깨끗한 환경에서 production profile이 secret 미설정 시 기동 실패; 외부에서 DB/API 포트 도달 불가; app role의 DDL/role-management 거절; TLS 접근 및 인증 proxy 우회 테스트.
- T 연계: T022 HTTPS 항목을 배포 hardening task로 분해. T014는 사용자 확인 비구현 항목이라 이 gate를 충족하지 않음.

## OPS-02 — workbook 처리량 제한이 proxy에만 있고 async request 안에서 전체 파싱

- 우선순위: **P1**, 비신뢰 업로드를 받는 공개 서비스의 release blocker.
- 근거: `frontend/nginx.conf:6`은 body 32m 제한이 있으나 `endpoints/upload.py:69,107,157`은 `await file.read()`로 전체 byte를 메모리에 적재한다. `services/upload_preview_service.py:37-60`, `upload_service.py:49-59`, `upload_apply_service.py:49-61`은 async 요청 내부에서 동기 복호화/openpyxl 전체 파싱을 직접 실행한다. size/압축 해제 총량/row·cell·sheet 상한/worker queue·timeout이 이 경로에 없다. Compose의 backend 직접 port로 proxy 상한도 우회 가능하다.
- 실패 조건/영향: 큰 정상 workbook이나 작은 압축파일의 큰 해제량, 동시 preview/apply로 worker 메모리/CPU 점유 및 다른 사용자의 조회 지연. 실제 장애 발생 용량·지연 수치는 측정하지 않았음.
- 해결 방향: 서버 streaming byte 상한과 형식 검사, 해제 크기/worksheet 자원 예산, 제한된 parser worker/job, 취소/timeout/concurrency quota. 원본 암호화·보존 및 preview no-write 계약을 유지한다.
- 완료 기준: proxy와 direct ASGI 경로에서 초과 입력은 일관된 413/422; 합성 과다압축·과다행·동시 업로드에서 정한 peak memory/응답시간 예산 충족; 타 조회가 진행되고 실패 후 processing 상태 정리; parser 악성 입력 테스트 포함.
- T 연계: T031 후속 운영 hardening. 완료된 reconciliation 기능을 다시 미완료로 바꾸지 않고 별도 task.

## OPS-03 — 최근 5개 원본 보관은 복구 전략이 아니며 사용자 편집을 되살리지 못함

- 우선순위: **P1**, 유료 사용자 데이터를 보관하기 전 release gate.
- 근거: `services/upload_service.py:32,160-187`은 원본을 같은 uploads 디렉터리에 기록하고 최근 5개 외 삭제한다. `docker-compose.yml:12-14,61-62,88-90`은 DB와 upload named volume만 제공한다. tracked scripts/CI/compose에는 DB+원본 backup/restore 작업이 없고 T022도 자동 백업 분리 여부를 미결로 둔다(`Implentation-plan.md:563`).
- 실패 조건/영향: 볼륨 손실/오조작/불량 migration 후 원본 몇 개로는 category override, memo, loan/installment link, source policy, review decision을 복원할 수 없다. 외부 인프라 백업이 없다는 단정은 아니며, 저장소에 검증 가능한 복구 계약/실행 gate가 없다는 판정이다.
- 해결 방향: DB·원본·schema/build revision 일치 backup manifest, 분리된 저장소, 암호화 및 보존 정책, 사용자 export, 명시된 RPO/RTO, 정기 복구 drill. 원본 5개 제한은 제품 정책으로 보이게 만들고 보관/삭제 정책과 분리.
- 완료 기준: 깨끗한 격리 환경에 실제 backup을 restore해 canonical 합계뿐 아니라 사용자 override/link/source lineage/원본 hash를 대조; 복원 시간과 데이터 손실 허용치를 측정; 오래된·손상된 backup 경고와 복구 절차 문서화.
- T 연계: T022 백업을 P1 실행 단위로 분해; T030 provenance 보존 보증과 연결.

## QA-01 — CI 성공이 운영 PostgreSQL migration·import 정확성을 보증하지 않음

- 우선순위: **P1**, schema/import 변경을 판매용 release로 승격하기 전 gate.
- 근거: `.github/workflows/ci.yml:22-59`에는 PostgreSQL service나 Alembic 실행이 없고 assets API, upload API, parsers 전체, source verification, upload service 테스트를 ignore한다. `backend/tests/conftest.py:117-122`는 SQLite에 `Base.metadata.create_all`한다. `tests/migrations/test_asset_source_migration.py:38-41,132-139`은 실제 migration 일부를 SQLite에서 검증하는 좋은 기반이지만 전체 PostgreSQL revision chain을 실행하는 gate가 아니다. workbook fixture 부재 시 skip(`conftest.py:48-79`).
- 실패 조건/영향: PostgreSQL view/SQL/lock/FK 동작, 과거 revision upgrade, 실제 importer 계약의 회귀가 CI green으로 통과 가능. 예: `data_reset_service.py:33`의 parent-first delete와 ondelete 없는 link FK에 대해 현재 reset seed는 종속 link가 없어 운영 제약을 검증하지 않는다. 통합 검토에서 FK ON 격리 SQLite reset 실패를 독립 재현했다. 금융 감사 F08에 입력과 결과를 기록했다. 운영 PostgreSQL에서 reset은 실행하지 않았다.
- 해결 방향: 기존 빠른 SQLite unit suite 유지 + 격리 PostgreSQL integration job; 신규 DB 전체 Alembic chain 및 대표 이전 revision migration; 개인정보 없는 synthetic BankSalad workbook으로 필수 parser/import/reimport suite; link/reset·concurrent apply·rollback·canonical view 동등성 gate.
- 완료 기준: CI에서 제외된 핵심 경로가 synthetic fixture로 실제 실행되고 skip 0; production dialect migration/constraints 테스트 green; 예상 failure 삽입 시 gate가 red가 되는지 확인; 기존 관측된 FK/reset 위험을 회귀 fixture로 검증.
- T 연계: T009/T030/T031의 구현을 지탱할 cross-cutting release task. T014 사용자 smoke로 대체 불가.

## OPS-04 — health가 DB 장애에도 ok여서 배포/장애 신호가 사용자 경험과 분리

- 우선순위: **P1** 운영 신뢰도.
- 근거: `endpoints/health.py:11-13`은 DB·schema·storage 확인 없이 status ok만 반환. `docker-compose.yml:51-60` 및 `backend/Dockerfile:24-25`가 이를 healthcheck로 사용한다. frontend health도 정적 index만 읽음(`docker-compose.yml:79-82`). backend bootstrap(`main.py:8-22`)에는 request correlation ID/structured exception observer가 없다.
- 실패 조건/영향: 시작 후 DB 단절/connection exhaustion/schema mismatch에서 container healthy 표시를 유지하면서 금융 화면은 실패한다. 사용자 오류와 backend log를 연결하는 식별자가 없어 support 조사 비용 증가.
- 해결 방향: liveness는 그대로 단순 유지하고 readiness를 분리해 bounded DB check·필요 schema revision 검증; import error/latency·DB pool·job 상태를 지표화; 요청 ID와 privacy-redacted 구조화 오류, alert를 정의. readiness가 외부 금융 서비스 실패에 과도 종속되지 않도록 분리.
- 완료 기준: 격리 장애 주입에서 DB unavailable 시 readiness 503, liveness 200, recovery 후 readiness 자동 회복; readiness timeout 상한; UI support ID와 server event 매칭; 민감 원문 로그 금지 검증.
- T 연계: T014 완료와 별개인 신규 operational readiness task; frontend build-info provenance 기반을 backend/schema revision으로 확장 가능.

## SEC-03 — 내부 exception 문자열이 업로드 응답과 읽기 로그에 그대로 노출

- 우선순위: **P1** 외부 사용자 접근 제품, 단일 사용자 신뢰 환경에서는 P2.
- 근거: `services/upload_service.py:96-98,120-133`은 exception 문자열을 error_message로 DB에 저장하고 response에 반환한다(`146-156`). `schemas/upload.py:21-38`은 그대로 노출하며 `endpoints/upload.py:43-56`의 익명 로그 endpoint도 이 필드를 반환한다. `upload_apply_service.py:77-81`은 파일 저장 OSError 문자열을 warning으로 저장. `frontend/src/lib/apiClient.ts:30-32`는 오류 response body를 Error 메시지에 그대로 담는다.
- 실패 조건/영향: DB/파일 오류가 포함하는 SQL문·parameter·경로·원본 값이 사용자 응답/로그로 퍼질 수 있다. 어떤 비밀 값이 실제 유출되었는지는 확인하지 않았으며, 무정제 exception 전송은 확정이다. 사용자도 기술 오류문만 받아 복구 행동을 알기 어렵다.
- 해결 방향: 사용자용 stable error code/message/retryability/request ID 분리; 상세 오류는 제한된 구조화 로그로 보내고 금융값·credential redaction; 로그 조회 권한 및 보존 정책. partial upload·원본 저장 경고의 의미는 잃지 않는다.
- 완료 기준: 합성 DB exception/file OSError에 민감 marker를 넣어 response/UI/upload logs에 marker 미출력, operator event에는 진단 가능한 원인·ID 존재; 한국어 해결 안내 및 안전한 재시도 상태 표시.
- T 연계: T031 import 오류 contract 후속 + 인증/운영 task.

## 감사 범위와 확인 방식

- AGENTS/root+backend/app+backend/tests+frontend/src 및 roadmap 관련 task를 읽음.
- 코드/선언을 수동 추적하고 AST로 endpoint decorator/function key 적용을 교차 inventory. router-level dependencies도 확인하여 settings/auto-classification 쓰기를 인증 누락으로 잘못 분류하지 않음.
- 운영 배포 설정/보안 사고, 외부 백업 존재, 실제 업로드 최대 처리량은 이 로컬 소스 감사의 주장 대상이 아님. 이 제한은 위 소스 결론의 확신을 낮추는 것이 아니라 배포별 추가 검증 조건이다.
- 주요 인증·원본 보존·CI·reset 경로는 통합 검토에서 다시 확인했다. 중복 항목은 종합 보고서의 작업 묶음으로 연결했다.


## 외부 기준과의 연결

- 비공개 API는 endpoint별 접근 통제를 적용하는 것이 기준이다. 현재 공개 GET과 공유 쓰기 키 모델의 평가에 이를 적용했다. [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- FK의 기본 삭제 동작은 연결된 자식이 남으면 부모 삭제를 허용하지 않는다. 운영과 같은 dialect에서 reset/migration을 검증해야 한다. [PostgreSQL 16 Constraints](https://www.postgresql.org/docs/16/ddl-constraints.html)
