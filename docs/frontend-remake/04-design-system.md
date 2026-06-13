# 04. 디자인 시스템 — "Ledger DS" (가칭)

> 바닥부터 새로 정의한다. 기존 `frontend-design-tokens.md`의 토큰은 참조하지 않는다.
> 구현 형태: CSS 변수(시맨틱 토큰) + Tailwind theme 매핑. 라이브러리 중립.

## 1. 디자인 원칙

1. **숫자가 주인공** — 화면의 위계는 금액 → 변화량 → 라벨 순. 장식 요소는 숫자 가독성을 침해하지 않는다.
2. **신뢰 수준을 숨기지 않는다** — 관측/수동/자동/추정의 출처를 시각 언어(배지+팝오버)로 항상 구분한다. 추정치를 관측치처럼 보이게 하지 않는다.
3. **조용한 기본, 명확한 예외** — 평상시 화면은 저채도 중립. 색은 의미(수입/지출/경고/추정)가 있을 때만 쓴다.
4. **읽기는 가볍게, 쓰기는 무겁게** — 조회 화면은 클릭 1회 내 정보 도달, 파괴적 작업은 미리보기→확인의 2단계.
5. **다크 퍼스트, 라이트 동등** — 개인 셀프호스팅 대시보드 특성상 다크를 기본으로 설계하되 모든 토큰은 듀얼 정의.

## 2. 파운데이션

### 2.1 컬러

#### 원시 팔레트 (primitive)
중립은 약간의 블루 틴트를 가진 grayscale("Slate-Ink"), 브랜드 컬러는 차분한 틸.

```
ink-0   #0B0E14   ink-1  #11151D   ink-2  #161B26   ink-3  #1D2330
ink-4   #262E3D   ink-5  #333D4F   ink-6  #4A5568   ink-7  #6B7689
ink-8   #99A3B3   ink-9  #C3CAD6   ink-10 #E6E9EF   ink-11 #F4F6F9   ink-12 #FFFFFF

teal    400 #2DD4BF  500 #14B8A6  600 #0D9488      ← 브랜드/수입/긍정
red     400 #F87171  500 #EF4444  600 #DC2626      ← 지출/위험
amber   400 #FBBF24  500 #F59E0B  600 #D97706      ← 경고/주의
violet  400 #A78BFA  500 #8B5CF6  600 #7C3AED      ← 추정(estimated) 전용
blue    400 #60A5FA  500 #3B82F6  600 #2563EB      ← 이체/정보/링크
```

#### 시맨틱 토큰 (다크 / 라이트)

| 토큰 | 다크 | 라이트 | 용도 |
|---|---|---|---|
| `bg/base` | ink-0 | ink-11 | 앱 배경 |
| `bg/surface` | ink-1 | ink-12 | 카드 |
| `bg/surface-raised` | ink-2 | ink-12+shadow | 팝오버, 시트 |
| `bg/inset` | ink-2 | ink-10 | 입력, 테이블 헤더, 게이지 트랙 |
| `bg/selected` | teal-500 @12% | teal-500 @10% | 선택 행 |
| `border/subtle` | ink-3 | ink-9 | 카드 내부 구분 |
| `border/default` | ink-4 | ink-8 | 카드 외곽, 입력 |
| `border/strong` | ink-5 | ink-7 | 포커스 외 강조 |
| `text/primary` | ink-11 | ink-1 | 본문·수치 |
| `text/secondary` | ink-9 | ink-5 | 보조 본문 |
| `text/muted` | ink-7 | ink-6 | 라벨·캡션 |
| `text/faint` | ink-6 | ink-7 | 메타·placeholder |
| `accent/*` | teal-400/500/@12%dim | teal-600/… | 브랜드, 긍정 |
| `income/*` | teal-400 | teal-600 | 수입 금액 |
| `expense/*` | red-400 | red-600 | 지출 금액, 파괴적 액션 |
| `transfer/*` | blue-400 | blue-600 | 이체, 정보, 링크 |
| `warn/*` | amber-400 | amber-600 | 주의 신호, 미연결 |
| `estimate/*` | violet-400 | violet-600 | **추정치 전용** — 다른 의미로 쓰지 않음 |
| `focus-ring` | teal-400 @60% | teal-600 @60% | 키보드 포커스 2px |

규칙:
- 각 시맨틱 색은 `-fg`(텍스트), `-bg`(@10~14% 딤 배경), `-border`(@35%) 3종 세트로 파생 — 배지/카드/버튼에서 동일 조합 사용.
- 추정치 violet은 시스템 전체에서 "이 값은 계산된 추정"이라는 단 하나의 의미. (기존엔 accent와 혼용)
- 심각도 스케일: 양호=accent, 관찰=blue, 주의=amber, 확인 필요/높음=red — 4단계 고정.

### 2.2 타이포그래피

- 본문: **Pretendard Variable** (한글 최적화), 숫자: **tabular-nums 필수** + 금액 강조는 같은 서체의 숫자 전용 feature(`ss01` 또는 Pretendard 숫자 그대로) 사용. 코드/스키마: JetBrains Mono.

| 토큰 | 크기/행간 | 굵기 | 용도 |
|---|---|---|---|
| `display` | 32/38 | 700 | 홈 히어로 금액 |
| `kpi` | 24/30 | 700 | KPI 수치 |
| `title` | 18/26 | 600 | 페이지 타이틀 |
| `section` | 15/22 | 600 | 카드/섹션 제목 |
| `body` | 14/22 | 400·500 | 본문, 폼 |
| `label` | 13/18 | 500 | 테이블 셀, 리스트 |
| `caption` | 12/16 | 400·500 | 라벨, 메타, 필터 칩 |
| `micro` | 11/14 | 400 | 배지, 보조 메타 (최소 크기 — 이보다 작은 글자 금지) |

- 기존 `nano(10px)` 폐지: 11px 미만 금지 (가독성 원칙).
- 모든 금액 셀/수치: `font-variant-numeric: tabular-nums` + 우측 정렬.

### 2.3 금액·수치 표기 규칙 (시스템 계약)

| 항목 | 규칙 |
|---|---|
| 통화 기호 | `₩` + 공백 없이 숫자 (`₩1,420,000`). KRW 단일 가정 |
| 압축 표기 | KPI/카드에서만: 만 단위 미만 그대로, ≥1만 `1.2만`, ≥1억 `4.21억`. 테이블·상세·툴팁은 항상 전체 자릿수 |
| 부호와 색 | 지출 `-` + `expense-fg`, 수입 `+` + `income-fg`, 0/중립은 `text/primary`. 색맹 대비를 위해 **부호를 항상 병기** (색에만 의존 금지) |
| 증감 | `+8.2%` / `-3.1%` + 방향 캐럿(▴▾). "증가=빨강(지출 문맥)" vs "증가=초록(수입·저축 문맥)"은 문맥 토큰 `delta-good/delta-bad`로 결정 — 컴포넌트가 의미를 받아서 색을 정한다 |
| 추정치 | 값 옆 `예상` violet 배지 + ⓘ Provenance. 관측값 병기 가능 시 `관측 ₩…` 보조 행 |
| 비어있는 값 | `—` (대시). 0과 결측을 구분 |
| 날짜 | 같은 해: `06-09`, 다른 해: `2025-06-09`, 월: `2026-06`, 기간: `2025-07 ~ 2026-06` |
| 백분율 | 소수 1자리 고정 (`34.2%`), confidence는 정수 (`81%`) |

### 2.4 레이아웃 · 스페이싱

- 4px 베이스 그리드. 스케일: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`.
- 컨텐츠 max-width 1280px, 페이지 패딩 24px(데스크톱) / 16px(모바일).
- 12컬럼 그리드, 카드 간격 16px. 카드 내부 패딩 16~20px.
- 브레이크포인트: `sm 640 / md 768 / lg 1024 / xl 1280`.
- 사이드바 240px, 모바일 하단 탭바 56px, 페이지 헤더 56px sticky.

### 2.5 형태 · 깊이 · 모션

| 토큰 | 값 | 용도 |
|---|---|---|
| `radius-sm` 6px | 배지, 입력, 칩 |
| `radius-md` 10px | 카드, 버튼 |
| `radius-lg` 16px | 시트, 모달 |
| `shadow-raised` | 0 4px 16px @24% | 팝오버/시트 (다크에서는 보더+밝은 surface가 주, 그림자는 보조) |
| `motion-fast` 120ms | hover, 토글 |
| `motion-base` 200ms ease-out | 패널 열림, 아코디언 |
| `motion-slow` 320ms | 시트, 페이지 전환 |

- 차트 진입 애니메이션은 400ms 1회만, 데이터 갱신 시에는 애니메이션 없이 교체(숫자 신뢰 원칙).
- `prefers-reduced-motion` 시 모든 모션 비활성.

### 2.6 아이콘

- Lucide 유지, 16px(인라인)/20px(내비) 2사이즈, stroke 1.75.
- 의미 고정 아이콘: ⬆가져오기, 🔁반복, 🔗연결, ⚖규칙, ⓘ출처, ⚠주의 — 같은 의미에 항상 같은 아이콘.

## 3. 차트 시스템

- 라이브러리 중립 스펙. 모든 차트는 `bg/surface` 위, 그리드 라인 `border/subtle`, 축 라벨 `caption/text-muted`.

| 용도 | 차트 | 색 규칙 |
|---|---|---|
| 현금흐름 | 수입/지출 dual bar + 순현금흐름 라인 | income/expense 고정, 라인 `text/secondary` |
| 카테고리 추이 | 스택 바 (Top5+기타) | 카테고리 팔레트 (아래) |
| 구성 비교 | 수평 bar 목록 | 단색 accent, 선택 항목만 진하게 |
| 고정비 | 스택 area 또는 bar | 고정=blue, 변동=teal / 필수=teal, 재량=amber |
| 거래처 비중 | nested treemap | 카테고리 팔레트 + 자식은 명도 단계 |
| 순자산 | line + soft area | accent |
| 일별 달력 | heat cell | `expense` 명도 5단계 (수입 포함 시 income/expense 분리 점) |
| MoM | diverging bar | delta-good/delta-bad |
| 비율 | segmented bar | 의미 색 2~3개, 도넛 금지(각도 비교 회피) |

카테고리 팔레트 (12색, 다크/라이트 공용 — 명도만 ±):
```
#14B8A6 #60A5FA #F59E0B #F87171 #A78BFA #34D399
#FB923C #38BDF8 #F472B6 #A3E635 #C084FC #94A3B8(기타 고정)
```
- "기타"는 항상 회색 마지막. 카테고리→색 매핑은 세션 내 고정(범례 클릭 토글 시에도 유지).
- 모든 차트에 키보드 접근 가능한 데이터 테이블 대체(스크린리더용 summary) 제공.

## 4. 컴포넌트 카탈로그

### 4.1 셸
| 컴포넌트 | 스펙 |
|---|---|
| `AppShell` | 사이드바(240) + 헤더(56 sticky) + 컨텐츠. 모바일: 하단 탭바 + 시트 헤더 |
| `SideNav` | 섹션 그룹, 활성=accent 좌측 2px 바 + `bg/selected`. 인박스 카운트 배지 |
| `PageHeader` | 타이틀 + 페이지 정의 컨트롤 슬롯(기간/기준 모드/스냅샷 메타) + 메타 배지 슬롯 |
| `ReadOnlyIndicator` | 사이드바 하단 1곳. 쓰기 컨트롤은 disabled + 툴팁 |

### 4.2 데이터 표시
| 컴포넌트 | 스펙 |
|---|---|
| `Stat` (KPI) | 라벨(caption/muted) + 값(kpi, tabular) + 델타/보조(caption + 방향색) + 옵션 스파크라인. 변형: `hero`(display 크기, 홈 전용) |
| `Card` | surface + border/default + radius-md. 헤더(제목+메타+액션 슬롯) / 본문 / 푸터 |
| `SignalCard` | 심각도 배지 + 타입 배지 + 제목(수치 포함) + 근거 1줄 + ⓘ + 액션 링크들 + 무시 |
| `ProvenanceBadge` + `ProvenancePopover` | 4단계: 관측(없음)/수동(ink 배지 "수동")/자동(blue 배지 "자동")/추정(violet 배지 "예상"). 팝오버: 출처→산출 기준→가정·제외→confidence→근거 딥링크 |
| `DataTable` | 행 높이 40px, 헤더 `bg/inset` sticky, 선택 체크박스(전체/indeterminate), 정렬, 행 상태(수정=accent 좌측 점, 삭제=취소선+50%, 선택=`bg/selected`), 행 클릭→상세 패널 |
| `DetailPanel` | 우측 슬라이드(380px) / 모바일 풀 시트. 폼 + 출처 + 액션 |
| `BulkBar` | 하단 고정, 선택 수 + 필드 + 주요/위험 액션 + 해제. 위험 액션은 `PreviewStep` 내장(건수·기간·합계·대표 항목) |
| `FilterBar` | 칩형 필터: 미적용=outline, 적용=accent-dim 칩 + 개별 ×. draft→적용 모델 유지(적용 버튼), 적용된 칩 요약 표시 |
| `RangeControl` | 월 범위 프리셋(3/6/12) + 커스텀. 로컬 예외 표시 점(`전역과 다름`) |
| `CoverageGauge` | 분류 커버리지: 트랙 `bg/inset` + accent 채움 + % + 부족 항목 딥링크 |
| `CalendarHeat` | 월 그리드, 셀 클릭=필터 |
| `EmptyState` | 아이콘 + 1줄 설명 + (가능하면) 해결 액션 버튼 — "데이터 없음"으로 끝내지 않기 |
| `ErrorState` | 사유 + 재시도 버튼 |
| `Skeleton` | 카드/테이블/KPI 형태 보존 스켈레톤 (스피너 금지) |

### 4.3 입력·피드백
| 컴포넌트 | 스펙 |
|---|---|
| `Button` | `primary`(accent solid) / `secondary`(outline) / `ghost` / `danger`(expense). 높이 32(기본)·28(밀집)·40(주요) |
| `Input/Select/DatePicker/MonthPicker` | 높이 32, `bg/inset`, 포커스 focus-ring. 종속 select(대분류→소분류) 패턴 내장 |
| `Toggle/Checkbox/SegmentedControl` | segmented는 렌즈 탭·모드 전환용 |
| `Badge` | 의미 색 -fg/-bg/-border 세트. 텍스트 micro·500 |
| `Toast` | 우상단 스택, 성공/실패 + 설명 + 옵션 undo 액션(예: "방금 삭제 복원"). 자동 닫힘 5s, undo 있는 경우 8s |
| `ConfirmDanger` | 라디오 범위 선택 + 확인 문구 타이핑 + 빨간 실행 버튼. 모달 |
| `Tabs` | 페이지 내 서브뷰(언더라인형) vs 렌즈(segmented형) 구분 |
| `Tooltip` | 300ms 지연, 단축 설명만 (데이터는 Popover) |

### 4.4 접근성 기준
- 모든 인터랙티브 요소 키보드 도달 + focus-ring 가시.
- 색 대비 WCAG AA (text/primary ≥ 7:1, muted ≥ 4.5:1 목표).
- 의미 전달에 색 단독 사용 금지 (부호·아이콘·라벨 병기 — §2.3).
- 테이블 행 액션은 hover 의존 금지 (항상 표시 또는 행 선택 후 패널).
