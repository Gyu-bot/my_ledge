# 프론트엔드 상품화 감사 (2026-10-22)

검토 기준: `9876439` (2026-10-22). 13개 route의 코드와 기존 테스트를 검토했다. 아래 **확정**은 소스의 분기·상태 전이에서 확인한 동작이며, 운영 데이터에 쓰기를 수행했다는 뜻이 아니다. 브라우저 관찰·실행 검증 범위는 [종합 보고서](README.md)에 별도로 적었다. P1은 출시 전 해결할 신뢰/핵심 이용 문제, P2는 작업 효율과 제품 품질 개선이다.

## 핵심 판단

재무 표현에서는 관측/예상, 환급 부호, provenance, source fallback, 미제공 값을 구분하는 좋은 기반이 있다. SourcePolicyEditor는 편집 중 미리보기를 무효화하고 pending 중 입력을 잠그며 서버 preview token을 적용한다. 같은 수준의 일관성이 업로드/대량 조작/오류 복구와 접근성에는 적용되지 않았다. 따라서 시각 디자인 추가보다 **사용자가 본 내용과 실제 저장 결과의 일치**, **실패를 빈 데이터로 오해시키지 않기**, **핵심 흐름의 키보드/모바일 완주**가 먼저다.

## 12개 우선 항목

### FE-01 · P1 · 확정: API 장애를 빈 재무 데이터로 표시

- 근거: `frontend/src/features/home/HomePage.tsx:262`의 noData는 loading만 제외하고 canonical/cashflow error를 검사하지 않는다. `:277-285`가 시작하기 카드를 렌더한다. `frontend/src/features/data/TransactionsPage.tsx:311-357`는 list loading 다음 rows.length만 검사한다. `ImportPage.tsx:200-228`의 이력, `InstallmentsPage.tsx:109-125` 및 `:145-180`도 같은 패턴이다.
- 재현: 캐시 없는 상태에서 canonical와 cashflow 요청이 실패하면 홈은 “아직 데이터가 없습니다…업로드”를 표시한다. 거래 목록 500/401/네트워크 오류는 “조건에 맞는 거래가 없습니다”로 바뀐다.
- 영향: 재무 데이터가 삭제된 것으로 오인하거나 불필요한 재업로드를 시도한다. 대출/할부/규칙 부재와 조회 실패를 구분할 수 없다.
- 개선: success-empty/error/loading/stale-success를 분리한 공통 query-state 정책, 섹션별 재시도, 기존 데이터 보존 및 최신성 표시. 홈 noData는 필요한 조회가 정상 완료했을 때만 true.
- acceptance: 13 route마다 401/403/422/500/offline/empty를 주입해 오류가 “0건/없음/정상”으로 나오지 않음; 재시도 후 기존 context 유지.
- 연계: T021 후속 품질, T006/T029 empty-state 의미. 기존 완료 상태를 소급 삭제하지 말고 후속 항목 제안.

### FE-02 · P1 · 확정: 업로드 미리보기와 적용 입력이 달라질 수 있음

- 근거: `ImportPage.tsx:42-55` 파일/기준일 변경 시 현재 preview만 지우지만 in-flight 응답을 무효화하지 않는다. `:61-63` 응답은 무조건 setPreview. `:82` apply는 preview의 파일/날짜가 아니라 최신 component state를 사용. 파일 input/date input은 pending 중에도 활성화(`:135-153`).
- 재현: 파일 A/날짜 D1로 preview 시작 → 응답 전에 날짜 D2 변경 → D1 preview가 뒤늦게 표시 → 선택 적용은 D2 전송. 같은 파일 날짜만 바꿀 때 change-key가 같아 불일치를 잡을 프론트 방어가 없다. 파일 A→B 변경도 동일 race다. apply 중 새 파일을 선택하면 이전 완료 콜백이 새 입력을 지우기도 한다(`:86-90`).
- 영향: 사용자가 확인한 스냅샷 기준일과 실제 적용 기준일 불일치; 승인 대상의 신뢰 훼손.
- 개선: preview를 file fingerprint+snapshotDate+request generation에 결합, 오래된 응답 폐기. apply에는 preview가 승인한 immutable input만 사용. mutation 중 relevant 입력을 잠금. SourcePolicyEditor의 busy/edit invalidation을 참고.
- acceptance: 지연응답+날짜변경/파일변경/재시도/적용중 변경 테스트에서 이전 preview를 적용할 수 없고 새 입력을 완료 콜백이 지우지 않음.
- 추가 소규모 결함: `:45`에서 날짜 없는 새 파일은 이전 파일 날짜를 유지한다. 새 파일에 자동 날짜가 없으면 비우거나 명시적으로 재확인해야 한다.
- 연계: T031 후속 hardening. T031에서 의도적으로 제외한 canonical/cashflow 영향범위 표시를 필수 회귀로 되살리는 것은 아님.

### FE-03 · P1 · 확정: 숫자 입력을 parseInt로 축소해 잘못 저장

- 근거: `InstallmentsPage.tsx:65-73`: 회차/월납입액에 Number.parseInt 사용. 입력은 type=number(`:99-100`)이나 form submit/검증 없이 버튼 onClick(`:105`)으로 저장. `SettingsPage.tsx:42` 비상금 목표도 같은 처리.
- 재현: 월 납입액 `1e6`은 number input이 허용하는 표기지만 parseInt 결과는 1. `1500.9`는 1500, 총개월 `3.9`는 3으로 조용히 잘린다. 단순 JS 파싱에서 결정되는 동작이다.
- 영향: 사용자가 입력한 금액과 저장 금액이 다르고 할부 전망에 직접 반영된다.
- 개선: 통일된 금액/정수 parser, 정규식 또는 Number+isSafeInteger 검증, 지수표기 정책 명시, 입력 오류를 해당 필드에 표시. 원 단위 소수는 거절하고 임의 절삭하지 않음.
- acceptance: 정상 1000000 정확 보존; `1e6`, 소수, 음수, 0, 빈값, 상한 초과에 일관된 허용/거절 정책과 전송값 assertion.
- 연계: T021/T013 및 할부 기능 후속 품질.

### FE-04 · P1 · 확정: 대출 필터 초기화가 보이지 않는 선택을 유지

- 근거: `LoansPage.tsx:271`의 적용은 setSelected(new Set())를 실행하지만 초기화는 수행하지 않음. `:247-257` connect는 현재 보이는 items와 무관하게 selected 전체를 전송한다. 대조: TransactionsPage의 resetFilter는 선택을 비움(`:175`).
- 재현: 좁은 필터에서 거래 선택 → 초기화 → 선택 거래가 전체 목록 다른 페이지로 밀려 사라짐 → 다른 거래 선택 후 대출 연결 → 이전 선택 ID도 전송.
- 영향: 사용자가 현재 확인하지 않은 거래의 대출 연결과 월상환 추정 변경 가능.
- 개선: 범위 변경을 하나의 함수로 통일해 선택/대상 계좌를 초기화, 페이지 간 선택을 유지한다면 현재 페이지 외 개수와 대상 검토를 제공.
- acceptance: 적용/초기화/탭 전환 각각의 선택 정책 테스트; 초기화 이후 이전 ID는 요청 payload에 없음.
- 연계: T042 및 실행 기록의 “일괄 선택 누락 방지” 후속. 기존 페이지 간 선택 유지 의도 자체는 보존.

### FE-05 · P1 · 확정: 데이터 초기화 확인 문구가 재오픈 때 남음

- 근거: `ds/ConfirmDanger.tsx:27-29` useState는 open false여도 유지되고 value reset 로직 없음. ImportPage는 component를 항상 마운트한 채 open만 바꿈(`:251-264`).
- 재현: 초기화 dialog 열기 → 정확한 문구 입력 → 취소 → 동일 범위 dialog 재오픈. 재입력 없이 destructive button 활성화. 실제 삭제 없이 UI만으로 검증 가능.
- 영향: 한 번의 확인 입력이 다음의 별개 파괴적 의사결정에 재사용됨.
- 개선: open epoch/confirmPhrase 변경 시 입력 초기화, pending 중 취소/재오픈 정책 일관화. 입력 accessible label도 제공.
- acceptance: 취소/실패/성공 이후 재오픈은 항상 빈 입력·비활성 실행. scope 변경에도 새 문구를 입력해야 함.
- 연계: T021 + import/reset 위험작업 UX 후속.

### FE-06 · P1 · 확정: 키보드만으로 거래 편집을 열 수 없고 modal focus 경계 없음

- 근거: `TransactionsPage.tsx:329-338` 편집은 tr.onClick만 있고 button/link/tabIndex/key handler 없음. checkbox는 stopPropagation인 td 안에 있어 키보드 체크도 편집을 열지 못함. `ds/DetailPanel.tsx:14-55` Escape만 처리하며 초기 focus/포커스 trap/복귀/aria-modal/inert 없음. ConfirmDanger도 role만 있고 trap 없음. `ImportPreviewPanel.tsx:140-151` 선택 UI는 일반 button+aria-hidden 아이콘으로만 상태 표시(aria-pressed/checked 없음).
- 영향: 거래 수정이라는 핵심 작업을 keyboard/screenreader 이용자가 완주할 수 없다. 패널 뒤 버튼으로 focus 이동, 미리보기 선택 상태 인지 불가.
- 개선: 행에 명시적 “상세/편집” button, 검증된 Dialog primitive로 portal/focus lifecycle, 실제 checkbox 또는 aria-pressed 상태. 차트 선택도 대체 표/버튼 제공(Treemap.tsx:94-99의 g.onClick 동일 문제).
- acceptance: Tab/Shift+Tab/Enter/Space/Escape만으로 업로드 선택과 거래 열기-편집-저장-복귀 완주; focus가 modal 밖으로 나가지 않음; 자동 axe + 수동 screenreader 핵심 여정.
- 연계: T021 후속 접근성 품질.

### FE-07 · P2 · 확정: 편집 초안과 작업 맥락이 경고 없이 소실

- 근거: `TransactionsPage.tsx:159-162` closeDetail 무조건 닫기; `:169-171` 재열기 시 서버 값으로 draft 대체. DetailPanel은 backdrop/Escape 모두 close. `TransactionsPage.tsx:113-119`, `LoansPage.tsx:230-235`, `SignalsPage.tsx:193-200` 필터/페이지는 대부분 local state. Spending만 일부 URL parameter 보존.
- 재현: 메모 수정 후 실수로 배경/Escape → 재열기 시 입력 소실. 거래 필터와 페이지를 맞춘 뒤 다른 메뉴를 다녀오면 원점.
- 영향: 반복적 분류/조정 업무의 재작업, 저장 여부 불신. 금융 값의 자동 저장은 의도 확인 없이 도입하면 안 됨.
- 개선: dirty 상태 표시와 닫기/이동 guard, 저장/버리기 선택. 필터·정렬·페이지는 URL, 민감 초안은 메모리 우선 정책. bulk 선택은 URL에 넣지 않고 명시 관리.
- acceptance: dirty close에서 선택 제공, 저장 성공 후만 dirty 해제; 뒤로가기/새로고침/공유 링크가 조회 context 복원.
- 연계: T021, 기존 “drilldown context 보존” 후속 확장.

### FE-08 · P1 개선 요구: 규칙 일괄 적용에 결과 미리보기/범위 확인/되돌림 없음

- 근거: `RulesPage.tsx:114-118` category/alias/recurring 모두 mutation 직행. `LoansPage.tsx:343-346` 대출 규칙도 동일. 반면 인박스 recurring 승인은 preview token과 확인한 ID 범위 사용(`InboxPage.tsx:110-158`).
- 재현: 규칙 화면 “일괄 적용” 버튼 1회 → 즉시 전체 적용 API 호출; 바뀔 거래수/예시/기존값을 실행 전에 확인할 단계 없음.
- 영향: 광범위한 분류·거래처 변경의 실제 영향이 실행 후에만 보임. API가 사용자 수정 보호를 하더라도 사용자에게 전체 영향의 범위가 설명되지 않음.
- 구분: 현재 API 계약 위반으로 단정하지 않음. 상품화 safety/사용성의 누락이며 backend preview/audit 지원 필요.
- 개선: 거래수·기간·대표 before/after와 제외 이유 preview, explicit apply, batch 결과/rollback 가능성 제공. 모든 단일 수정에 과도한 확인을 추가할 필요는 없음.
- acceptance: 사전 조회는 DB 불변, 승인 당시 대상만 적용, 변경된 조건은 재preview 요구, 적용 결과 감사기록 확인.
- 연계: T033/T034 승인 기반 자동화; 기존 과거 승인 범위를 확장 승인으로 취급하지 말 것.

### FE-09 · P2 · 확정: 단일 거래 삭제의 복원 실패가 사용자에게 안 보임

- 근거: `TransactionsPage.tsx:390` toast action의 `void restore.mutateAsync(detailTx.id)`에는 catch/성공상태 없음. `ds/toast.tsx:35-40`는 action 호출 직후 toast를 dismiss. `useTransactions.ts` restore에는 사용자 오류 handler 없음.
- 재현: 거래 삭제 성공 → 복원 액션 클릭 시 복원 API 실패. 삭제 알림은 사라지고 복원 실패 안내도 나타나지 않음. 일괄 삭제 복원은 `undoDelete` catch가 있어 이 문제를 피함.
- 영향: 복원되었다고 오인하고 다음 작업 진행. 8초 toast 액션만의 유효성도 발견성을 낮춤(삭제 포함 필터로 나중 복원 경로는 있으므로 영구 복구 불가라고 주장하지 않음).
- 개선: single restore를 공통 mutation UX로 감싸 성공/실패/pending을 표시, 실패 시 재시도 가능한 액션 유지. 삭제 이력/휴지통 진입을 명확하게.
- acceptance: 복원 실패는 명시 오류와 재시도; 성공 확인 후만 성공 알림. pending 중 중복 클릭 차단.
- 연계: T030 soft delete 보존, T021 위험작업 UX.

### FE-10 · P2 · 확정: 업로드/초기화 후 관측 범위 캐시가 갱신되지 않음

- 근거: `hooks/useUpload.ts:46-51`, `:60-64`에 canonical-views invalidate 누락. `hooks/useCanonicalViews.ts:7`는 별도 key. ImportPage는 canonical 관측 범위를 계속 마운트한 상태로 표시(`:185-195`).
- 재현: 가져오기 페이지에 표시된 기간 확인 → 새 기간 파일 적용 또는 거래 초기화 → 같은 페이지의 관측 범위는 이전 값. route 재마운트/window focus의 always refetch로 나중 회복되므로 영구 캐시 오류로 확대하지 않음.
- 개선: mutation dependent key 집합 중앙화, 관련 active query 갱신 완료와 성공 상태를 맞춤. assets 하위 source-policy는 이미 invalidate되므로 누락 주장 제외.
- acceptance: apply/reset 후 같은 화면에서 관측 범위/총량이 backend 재조회와 일치; request 실패 시 stale 명시.
- 연계: T006/T031 신뢰도와 실행 기록의 화면 갱신 후속.

### FE-11 · P2 · 구조 확인/성능 영향은 계측 필요: 대용량 import와 숨은 렌즈 요청

- 근거: `ImportPreviewPanel.tsx:135-173` 전체 변경을 상세 DOM으로 map하고 필터/페이지/가상화/전체해제가 없음. `SpendingPage.tsx:100-112` 비활성 렌즈의 fixedSummary/fixedTrend/merchantTop/categoryMoM/incomeTimeline/incomeBreakdown도 요청. income lens 밖에서는 `{}`를 전달하지만 hooks `useTransactions.ts:179-190`에는 enabled 조건이 없어 조회가 취소되지 않는다. `router.tsx:3-15` 13 페이지 전부 eager import.
- 영향: 장기간 장부에서 review 문서 길이, 요청량 및 JS 초기 payload가 커짐. 구체적인 느려짐 수치/클라이언트 crash는 아직 측정하지 않았으므로 확정 성능 장애로 표현하지 말 것.
- 개선: 변경유형 검색/집계/페이지/전체선택 정책, 필요 lens만 enabled, 라우트 lazy 분리. 적용 시 전체 선택 ID 보존 테스트 필수.
- acceptance 제안: synthetic 1만행 preview에서 초기 렌더 2초·선택 반응 200ms 목표(실제 타깃 기기에서 정식 예산 확정); 비활성 lens 요청 0; chunk 예산 및 p95 측정.
- 연계: T021/T031, T022 상품화 운영 품질.

### FE-12 · P2 · 확정: API 오류를 원문 JSON 토스트로만 전달

- 근거: `lib/apiClient.ts:29-32` HTTP response text 전체를 Error message로 만들고 주요 화면은 `String(error)`를 toast description에 그대로 출력(예 ImportPage:68/92, RulesPage:120, InstallmentsPage:77). `ds/toastStore.ts:30-31` 오류도 5초 후 삭제. client timeout/AbortSignal 연계, status/error code 분기 UX가 없다.
- 영향: 422 필드 검증, 권한 만료, 서버 장애를 구분하는 실행 가능한 안내가 없고 필드 수정 지점을 찾기 어렵다. 네트워크 hang 시 상태가 오래 지속될 수 있음. 원문에 실제 민감값이 노출된다고 단정하지 않되 표시 정책이 없는 것은 확인.
- 개선: typed ApiError(status/code/fieldErrors/requestId), 필드 오류 inline, 재인증/읽기전용/재시도 복구 안내, 원문 diagnostic은 별도 접기 및 redact. 금융 apply timeout은 단순 재전송 대신 처리결과 조회/idempotency와 연결.
- acceptance: 401/403/409/413/422/429/500/timeout 각각 다음 행동이 명확; 긴/민감 오류 원문 미노출; 작업 완료 여부 불명확 상황은 조회 후 재시도.
- 연계: T021 및 API contract/운영 품질 새 세부 과제.

## 모바일 구조 위험과 검증 경계

- `DetailPanel.tsx:27` z-40과 `AppShell.tsx:121-125` 모바일 하단탭 z-40이 같고 하단탭이 DOM 뒤에 있어 상세 패널 footer 저장/삭제와 겹칠 가능성이 높다. Dialog portal layer를 navigation보다 높게 하고 safe-area-inset-bottom을 반영해야 한다. 390×844/320px/가상키보드 환경에서 CTA를 확인할 것. 확인 전 확정 시각 결함으로 표시하지 말 것.
- 읽기전용 설명과 테마 버튼이 desktop aside에만 존재(`AppShell.tsx:57-98`); 모바일에서는 주요 disabled action의 이유를 알기 어렵다. 공통 mobile status indicator를 검토. 이것은 desktop 전용 마크업으로 확인된 UX 누락이다.

## 13 route 검토 표

| route | 검토 중심 / 판단 |
|---|---|
| `/` | 관측/예상 및 null 설명은 강점. API 동시 실패가 onboarding으로 위장(FE-01). |
| `/spending` | URL lens/date/category 일부 보존. hidden request fan-out, 일부 chart/transaction query 오류를 빈 상태로 처리. |
| `/net-worth` | 날짜/추정 source 설명과 금리 미제공 표현 양호. history/loan 외 투자·보험·유동성 실패 분리 일관성 필요. |
| `/signals` | 기간/active/history 구분 양호. 필터 local state, 일부 비교·반복 결과의 오류/empty 분리 필요. |
| `/data/inbox` | dry-run token, stale 재조회, 승인 범위는 좋은 기준. 여러 요청 중 하나 실패하면 전체 작업을 error로 가리는 결합도 개선 후보. |
| `/data/transactions` | 다중페이지 선택 및 bulk preview 기반 존재. keyboard, dirty exit, error empty, single undo 오류 누락 우선. |
| `/data/loans` | 메타 diff 저장과 월상환 근거 양호. 필터 초기화 선택 누락, 규칙 direct apply, 조회 오류 상태 부족. |
| `/data/installments` | 실제 납부/예정/과거 미확인 구분 양호. parseInt 금액 왜곡, form validation, 조회 오류 상태. |
| `/data/assets` | tri-state와 diff 저장, query error/retry 있음. 다중 draft 이탈 보호와 dense mobile 폼 완주 확인 후보. |
| `/data/rules` | 규칙 삭제 확인/수동 override 안내 있음. 전체 적용 사전 영향 확인 없음, 조회 실패와 empty 혼동. |
| `/data/settings` | source selection preview token+pending lock은 기준 구현으로 재사용 가능. 수입/분석 설정 전문성 높아 신규사용자 progressive disclosure 검토. |
| `/data/import` | preview/apply 분리 기반 양호. race, 날짜 유지, snapshot-only 적용 조건(선택 0이면 불가), 확인 state, 대량 DOM, 로그 error. snapshot-only는 parser/API 지원 가능 범위를 backend와 확인 후 과제로 확정. |
| `/data/reference` | schema/dashboard 오류 처리 있고 계산 근거 제공. 일반 소비자 핵심 nav에서 전문 데이터사전의 우선순위는 사용자 검증 대상. |

## 테스트 근거와 빈틈

- `ImportPage.test.tsx:181-253`: 기본 렌더, 정상 preview/apply, 파일명 날짜, locked ambiguous, dialog open을 검증. pending 입력 변경/늦은 응답/재오픈 확인 state 미포함.
- `HomePage.test.tsx:162-341`: 빈 DB, projection null, 환급, 근거 및 낮은 신뢰도 등 재무 의미 테스트가 충실함. canonical+cashflow error가 noData로 바뀌는 경우 미포함.
- `TransactionsPage.test.tsx:105-171`: 클릭 편집, bulk preview, 페이지 간 그룹 선택, deep-link 있음. keyboard-only 편집/dirty 닫기/single undo 실패 미포함.
- `LoansPage.test.tsx:99-210`: 메타 diff와 늦은 응답 보존 테스트가 충실함. 대출 거래 필터 reset의 선택 전이 미포함.
- ds 전용 테스트는 Stat/format/charts가 중심이며 DetailPanel/ConfirmDanger의 focus/state lifecycle 회귀를 보강할 가치가 크다.

## 실행 제안

1. 신뢰 회귀 묶음: FE-01/02/03/04/05 + API 실패/지연 재현 테스트.
2. 핵심 여정 UX: FE-06/07/09와 모바일 overlay 확인. 업로드→검토→적용→수정→삭제/복원까지 keyboard와 mobile 완주를 출시 gate로.
3. 승인 자동화/규모 대응: FE-08을 T033/T034와 설계, FE-10/11/12를 독립적 frontend/API 계약 과제로 분해. 구현 후보는 로드맵 T047/T048/T049에 제안 상태로 연결했다. 구현 승인은 별도로 받는다.

## Live 관찰과 코드의 연결

- 홈 행동 큐는 `HomePage.tsx:448-471`에 있으며 전망/현금흐름/주의 신호 뒤에 있다. 데스크톱에서 전망 근거가 앞선 화면을 차지한다고 관찰한 것은 이 순서와 일치한다. 기본 홈은 핵심 요약+다음 행동을 우선 배치하고 세부 계산 근거를 disclosure로 접는 실험을 제안한다. 근거 정보를 삭제하면 안 된다.
- 같은 카드의 분류 품질 검토 건수는 canonical queue(`:256`), 분류 커버리지는 discretionary velocity의 classification_coverage_ratio(`:259`)에서 온다. 서로 다른 분모·의미이므로 100%와 검토 항목이 함께 있는 것은 수학 오류 증거가 아니다. ‘분류값 입력됨’과 ‘검토 완료’의 다른 정의·분모를 이름/설명에 명시할 필요가 있다. 개인 수치는 기록하지 않았다.
- FE-03의 파싱은 Node에서 직접 확인: `parseInt('1e6', 10) === 1`, `parseInt('1500.9', 10) === 1500`, `parseInt('3.9', 10) === 3`. 이는 API mutation 없이 순수 함수 결과로 확인했다.

## 브라우저 교차 확인

- 데스크톱 1440×900에서 거래 상세를 열어도 focus가 dialog 안으로 이동하지 않는 것을 직접 확인했다. 별도 브라우저 검토에서도 Tab 탐색이 배경으로 이동함을 확인했다.
- 설정 화면의 `median_30pct_exclusion`, `prorated_closed_month_baseline` 코드 문자열이 실제 자유입력란에 노출된다. 한국어 선택지와 읽기 쉬운 설명으로 바꿀 대상이다.
- 모바일에서는 상세 패널과 하단 메뉴의 동일 z-index 및 DOM 순서가 겹침 위험을 만든다. 사용 가능한 브라우저가 viewport 변경 API를 지원하지 않아 실제 모바일 겹침 판정은 하지 않았다.

## 추가 합성 실행 검증

실제 컴포넌트를 사용하고 API·요청 지연을 mock한 임시 테스트를 작성한 뒤 통합 검토에서 독립 재실행했다. FE-01 조회 오류가 empty로 표시됨, FE-02 늦은 preview와 변경된 기준일의 불일치, FE-03 지수 표기 입력의 축소된 payload, FE-05 닫기/재오픈 뒤 확인 문구 잔존을 각각 재현했다. 4개 테스트가 모두 해당 결함을 확인했다. 수정 테스트가 아니며 운영 쓰기는 없었다. 임시 테스트·로그는 저장소에 포함하지 않았다.

13개 실제 화면과 현재 데이터의 의미 문제는 [Live 교차 검토](live-review.md)를 참고한다.
