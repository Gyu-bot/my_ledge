# Frontend V2 Design Spec

**Date:** 2026-04-07  
**Branch:** `feat/frontend-v2` (신규 브랜치, 완전 새 구현)  
**Scope:** 5개 페이지 전체 재구현 — 기존 CSS/디자인토큰/컴포넌트 참조 없음

---

## 1. 디자인 방향

### 1.1 톤 & 무드

| 항목 | 결정 |
|---|---|
| 테마 | **Dark Pro** — 어두운 배경, 금융 터미널 계열 |
| 배경 | `#0b0f1a` (main), `#080b12` (sidebar/topbar), `#0f1623` (card) |
| 카드 경계 | `#1a2035` — 카드와 배경을 구분하는 저채도 테두리 |
| 강조색 (Accent) | **Emerald** `#10b981` — 수익/자산/성장 긍정 신호 |
| 위험색 | `#f87171` — 지출/부채/삭제 |
| 경고색 | `#f59e0b` — 주의 신호 |

### 1.2 정보 밀도

- **균형 밀도 + 보조 텍스트**: 카드 크기가 읽기 편하고, 전월 대비·예산 대비 등 컨텍스트 정보를 카드 하단에 함께 표시
- 숫자는 일반 sans-serif (모노스페이스 아님)
- 행 높이: 약 34px (compact하되 탭 타겟 충분)

---

## 2. 앱 셸 (App Shell)

### 2.1 레이아웃 구조

```
[56px 사이드바] | [topbar 48px                    ]
               | [main content (padding 20px)      ]
```

### 2.2 사이드바

- **너비**: 56px 고정
- **배경**: `#080b12`, 우측 border `1px #1a2035`
- **로고**: 32px 에메랄드 그라디언트 라운드 박스, 상단 고정
- **nav 아이콘**: 40×40px 라운드 버튼, Heroicons outline 18px
  - 기본: `#374151`
  - active: `background #0d2b1e`, `color #10b981`
  - hover: `background #111827`, `color #9ca3af`
- **구분선**: `24px 가로 1px #1a2035` — 개요 / 분석그룹 / 운영그룹 사이
- **모바일**: Drawer로 전환, 배경 overlay `rgba(0,0,0,0.6)`
- **nav 항목** (순서):
  1. 개요 `/`
  2. — 구분선 —
  3. 지출 `/analysis/spending`
  4. 자산 `/analysis/assets`
  5. 인사이트 `/analysis/insights`
  6. — 구분선 —
  7. 거래 작업대 `/operations/workbench`

### 2.3 Topbar

- **높이**: 48px
- **배경**: `#080b12`, 하단 border `1px #1a2035`
- **왼쪽**: breadcrumb(11px `#374151`) → `›` → 페이지 제목(13px semibold `#d1d5db`)
- **오른쪽**: 페이지별 메타 badge (`#111827` 배경, `#1f2937` border, `#6b7280` 텍스트, 20px border-radius)
- **모바일**: 햄버거 버튼(좌) + 제목(중앙) + 메타(우)

---

## 3. 공통 컴포넌트 설계

### 3.1 KPI Card

```
┌────────────────────────────┐
│ label (10px #4b5563)       │
│ value (18px bold, 강조색)  │
│ sub-text (10px)            │
└────────────────────────────┘
```
- border-radius: 10px
- border-top accent line 옵션: 2px 강조색

### 3.2 Section Card

- `background #0f1623`, `border 1px #1a2035`, `border-radius 10px`, `padding 16px`
- Card Header: 타이틀(11px semibold `#9ca3af`) + 우측 badge
- Card Badge: `#111827` bg, `#1f2937` border, `9px #4b5563`

### 3.3 상태 처리

모든 카드/섹션은 독립적으로 아래 상태를 처리:
- **loading**: 스켈레톤 또는 spinner (accent 색)
- **error**: 에러 메시지 + 재시도 버튼
- **empty**: placeholder 텍스트 + 아이콘

### 3.4 반응형

- **데스크탑**: 사이드바 고정, 콘텐츠 그리드
- **모바일**: 사이드바 drawer, read-only 테이블 → 카드 레이아웃

### 3.5 Read-only 모드

`has_write_access = false` 시 업로드/수정/삭제/복원/초기화 비활성화. 읽기는 정상 동작.

---

## 4. 페이지별 설계

### 4.1 개요 `/`

**Topbar meta**: 최신 자산 snapshot 기준일

**레이아웃** (위→아래):

1. **KPI 4개** (`grid-cols-4`)
   - 순자산 (에메랄드), 이번 달 지출 (레드), 이번 달 수입 (기본), 저축률 (에메랄드)
   - 각 카드 하단: 전월 대비 delta 텍스트

2. **월간 현금흐름 + 주의 신호** (`grid-cols-[2fr_1fr]`)
   - 현금흐름: 수입/지출 듀얼 바 차트, 최근 6개월, 범례
   - 주의 신호: 이상 지출 건수 / 반복 결제 건수 / 수입 안정성 — 3개 signal 카드

3. **카테고리 Top 5 + 최근 거래** (`grid-cols-2`)
   - 카테고리: 카테고리명 + 수평 바 + 금액/비율
   - 최근 거래: 날짜/거래처/카테고리/금액 read-only 목록

**데이터 소스**: asset snapshots, monthly cashflow, category breakdown, recent transactions, analytics (income-stability, recurring-payments, spending-anomalies)

---

### 4.2 지출 분석 `/analysis/spending`

**Topbar meta**: 현재 상세 조회 범위 `시작월 ~ 종료월`

**레이아웃** (위→아래):

1. **조회 범위 슬라이더** — 시작/종료 월 range slider + 적용/초기화 버튼
   - 슬라이더 범위 변경은 아래 시계열 섹션에만 적용

2. **월별 카테고리 추이** — stacked bar 차트, 카드 높이 충분히 확보 (약 160px)
   - 상위 5개 + 기타, 현재 월 강조

3. **상세 필터 바** — 시작월 select / 종료월 select / 수입 포함 토글
   - 이 필터는 아래 집계 카드와 거래 내역에 적용

4. **카테고리 지출 + 소분류 지출** (`grid-cols-2`)
   - 카테고리: 수평 바 + 금액
   - 소분류: 상위 카테고리 select → 해당 소분류 수평 바

5. **고정비/변동비 비율 + 고정비 필수/비필수** (`grid-cols-2`)
   - 각 카드: segmented bar (42%/58% 식) + 금액 breakdown 2칸
   - `cost_kind` / `fixed_cost_necessity` 데이터 미적재 시 placeholder 표시

6. **거래처 Treemap** — merchant 기준 지출 규모 블록, full width

7. **일별 달력 + 거래 내역 accordion** (`grid-cols-[3fr_2fr]`)
   - 달력: 대상 월 select, 일자별 지출 dot (강도), 월 합계
   - 거래 내역: 접힘/펼침 accordion, 헤더에 페이지/건수 표시, 20건/페이지 pagination

**상태 규칙**:
- 상세 월 필터 변경 시 거래 내역 페이지 1로 리셋
- 수입 포함 꺼짐 → 지출만 조회
- 달력 대상 월 없으면 빈 상태 표시

---

### 4.3 자산 현황 `/analysis/assets`

**Topbar meta**: 최신 snapshot 기준일

**레이아웃**:

1. **KPI 4개** (`grid-cols-4`)
   - 순자산 (에메랄드), 총자산, 총부채 (레드), 투자 평가액 (바이올렛 `#a78bfa`)

2. **순자산 추이** — line + area 차트, snapshot 시계열, 현재 시점 dot 강조
   - 데이터 1개 이하 시 차트 대신 summary fallback

3. **투자 요약 + 대출 요약** (`grid-cols-2`)
   - 투자: 원금/평가액/수익률 + 포트폴리오 비중 수평 바
   - 대출: 총원금/총잔액 + 상위 4개 대출 테이블 (상품명/금융사/유형/잔액/금리)

**상태 규칙**: 투자/대출 데이터 없어도 KPI와 순자산 추이는 독립 표시

---

### 4.4 인사이트 `/analysis/insights`

**Topbar meta**: 핵심 인사이트 총 건수

**레이아웃**:

1. **요약 카드 3개** (`grid-cols-3`)
   - 저축률, 수입 변동성, 이상 카테고리 수

2. **핵심 인사이트** — 아이콘 + 제목 + 설명 + 상태 배지(양호/주의/확인 필요) 리스트

3. **반복 결제 + 이상 지출** (`grid-cols-2`)
   - 각각 독립 pagination (10건/페이지)
   - "진단 기준 보기" 토글 — assumption/한계 설명

4. **거래처 소비 Top 5 + 카테고리 전월 대비** (`grid-cols-2`)
   - 거래처: 순위/이름/건수/평균금액/합계
   - MoM: 중앙 기준선, 좌(감소)/우(증가) 바, delta 금액

---

### 4.5 거래 작업대 `/operations/workbench`

**Topbar meta**: `현재 페이지 건수 / 전체 건수`

**레이아웃**:

1. **액션 피드백 배너** — 업로드/수정/삭제/복원/초기화 결과 (성공/실패)

2. **필터 바**
   - 검색 input, 거래 유형 select, 입력 출처 select, 대분류 select, 결제수단 select
   - 시작일/종료일 input, 삭제 포함 toggle, 수정 항목만 toggle
   - 적용/초기화 버튼
   - draft 상태와 applied 상태 구분 (apply 전까지 실제 쿼리 안 날림)

3. **Bulk edit 패널** — 선택된 행 있을 때만 노출
   - 거래처, 대분류, 소분류, 고정/변동, **필수여부**, 메모
   - 일괄 적용 버튼 / 선택 해제 버튼
   - bulk 선택 중 개별 행 편집 비활성화

4. **거래 테이블** — 서버 페이지네이션, 20건/페이지
   - 컬럼: 선택 / 날짜 / 설명(read-only, muted italic) / 거래처(editable) / 카테고리 / 고정/변동 / **필수여부** / 메모 / 상태 / 금액 / 동작
   - 설명 열과 거래처 열: 동일한 텍스트 크기/배열, 설명은 원본 read-only(이탤릭 구분), 거래처는 편집 가능
   - 상태 배지: `원본` (회색) / `수정됨` (에메랄드) / `삭제됨` (레드)
   - 필수여부 배지: `필수` (초록) / `비필수` (노란) / `—` (해당없음)
   - 인라인 편집: 거래처 input + 카테고리 select + 고정/변동 select + **필수여부 select** + 메모 input
   - 삭제된 행: 선택 불가, 복원 버튼만 표시
   - 행 편집 중에는 bulk 선택 해제

5. **업로드 accordion**
   - 파일 드롭존 (.xlsx)
   - 스냅샷 기준일 필수 입력
   - 업로드 결과 요약

6. **최근 업로드 이력 accordion**
   - 파일명 / 상태 / 신규 / 스킵 / 기준일 / 업로드 시각 테이블

7. **Danger Zone accordion**
   - 레드 테마, 초기화 범위 선택 (거래만 / 거래+스냅샷)
   - 확인 문구 입력 후 실행 버튼 활성화
   - 업로드 이력은 초기화되지 않음

---

## 5. 수정 가능 필드 정의

| 필드 | 인라인 편집 | Bulk edit |
|---|---|---|
| `merchant` | ✅ input | ✅ |
| `category_major_user` | ✅ select (DB 동적 조회) | ✅ |
| `category_minor_user` | ✅ select (대분류 종속) | ✅ |
| `cost_kind` | ✅ select (고정비/변동비) | ✅ |
| `fixed_cost_necessity` | ✅ select (필수/비필수/해당없음) | ✅ |
| `memo` | ✅ input | ✅ |

`description`은 read-only (원본 보존).

---

## 6. 구현 방향

### 6.1 접근법

- `feat/frontend-v2` 브랜치 신규 생성
- `frontend/src` 전체를 새로 작성 — 기존 파일 참조 없음
- 백엔드 API 타입은 `backend/app/schemas/`에서 직접 유도

### 6.2 기술 스택 (AGENTS.md 준수)

| 항목 | 선택 |
|---|---|
| 빌드 | Vite + TypeScript (strict) |
| UI | Tailwind CSS (새 토큰 정의) |
| 컴포넌트 primitive | shadcn/ui 패턴 참조 (별도 CSS 프레임워크 금지) |
| 차트 | shadcn/ui chart 우선, 미지원 시 Recharts |
| 상태관리 | TanStack Query (서버 상태), Zustand 불필요 |
| 라우팅 | React Router v6+ |

### 6.3 Tailwind 커스텀 토큰 (신규 정의)

```js
// tailwind.config.js (예시)
colors: {
  surface: {
    base:  '#060810',
    panel: '#0b0f1a',
    card:  '#0f1623',
    bar:   '#080b12',
  },
  border: {
    DEFAULT: '#1a2035',
    subtle:  '#111827',
    strong:  '#1f2937',
  },
  accent: {
    DEFAULT: '#10b981',
    dim:     '#0d2b1e',
    bright:  '#6ee7b7',
  },
  danger: {
    DEFAULT: '#f87171',
    dim:     '#2d1a1a',
  },
  warn: {
    DEFAULT: '#f59e0b',
    dim:     '#2a1f0a',
  },
  text: {
    primary:   '#d1d5db',
    secondary: '#9ca3af',
    muted:     '#6b7280',
    faint:     '#4b5563',
    ghost:     '#374151',
  },
}
```

### 6.4 라우트 구조 (기존 유지)

| Route | 페이지 |
|---|---|
| `/` | 개요 |
| `/analysis/spending` | 지출 분석 |
| `/analysis/assets` | 자산 현황 |
| `/analysis/insights` | 인사이트 |
| `/operations/workbench` | 거래 작업대 |
| `/spending` → redirect | `/analysis/spending` |
| `/assets` → redirect | `/analysis/assets` |
| `/data` → redirect | `/operations/workbench` |
| `*` → redirect | `/` |

---

## 7. 미구현 placeholder 항목

현재 데이터 미비로 placeholder 표시하되, 레이아웃 공간은 확보:
- 지출 페이지: 고정비/변동비 추이, 고정비 필수/비필수 비율 (`cost_kind` 미적재 시)
- `/income`, `/transfers` — live 페이지 없음, redirect 유지

---

## 8. 목업 파일 위치

`.superpowers/brainstorm/3560762-1775522426/content/` 내:

| 파일 | 내용 |
|---|---|
| `overview-mockup.html` | 개요 페이지 |
| `spending-mockup-v2.html` | 지출 분석 (고정비 카드 포함) |
| `assets-mockup.html` | 자산 현황 |
| `insights-mockup.html` | 인사이트 |
| `workbench-mockup-v2.html` | 거래 작업대 (필수여부 컬럼 포함) |
