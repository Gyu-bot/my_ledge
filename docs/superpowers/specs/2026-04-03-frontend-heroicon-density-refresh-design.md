# Frontend Heroicon and Density Refresh Design

## Summary

현재 sidebar shell은 텍스트 중심으로 동작하고, 주요 카드/섹션 제목은 아이콘 없이 제목만 노출된다. 사용자는 navigation과 핵심 정보 블록의 시각적 스캐닝을 더 빠르게 만들기 위해 Heroicons 스타일 아이콘을 추가하고, 전체 컴포넌트 내부 여백도 한 단계 더 조밀하게 줄이길 원한다.

이번 작업은 새로운 기능 추가가 아니라 shell과 카드 컴포넌트의 표현 밀도를 재조정하는 UI refresh다. route, 데이터 훅, 분석 로직, 페이지 구조 자체는 유지한다.

## Goals

- sidebar와 mobile drawer의 모든 메뉴에 Heroicons 스타일 아이콘을 부여한다.
- 페이지의 큰 섹션 제목과 주요 카드 제목에만 절제된 범위로 아이콘을 추가한다.
- 공통 카드와 shell spacing을 한 단계 줄여 더 dense한 dashboard 느낌을 만든다.
- 패키지 설치 없이 로컬 SVG React 컴포넌트로 관리해 의존성 증가를 피한다.

## Non-Goals

- 거의 모든 텍스트 레이블에 아이콘을 붙이지 않는다.
- route IA, 데이터 흐름, API contract, chart library를 바꾸지 않는다.
- 새로운 icon package를 설치하지 않는다.

## Approved Direction

### Option A · Local Heroicon Components

- `frontend/src/components/icons/` 아래에 Heroicons outline 스타일의 로컬 SVG 컴포넌트를 둔다.
- navigation config가 각 item의 icon을 source of truth로 가진다.
- sidebar, mobile drawer, 주요 section/card title은 같은 아이콘 세트를 재사용한다.
- spacing은 shared primitives와 shell 컴포넌트부터 줄이고, page-level에서 과한 곳만 보정한다.

### Why This Direction

- 사용자 요청 범위를 가장 정확히 만족한다.
- 패키지 추가가 필요 없어 작업 경계가 작고 안전하다.
- 아이콘 스타일과 크기를 한 곳에서 관리할 수 있어 중복 inline SVG를 피할 수 있다.

## Component Scope

### Navigation

- direct item:
  - `개요` → home/dashboard 계열 아이콘
- grouped item:
  - `분석` → chart 계열 아이콘
  - `운영` → wrench/toolbox 계열 아이콘
- child item:
  - `지출`, `자산`, `인사이트`, `거래 작업대` 각각 의미에 맞는 구체 아이콘 사용

### Content Titles

- 적용 대상은 페이지의 큰 section/card title에 한정한다.
- metric 숫자 카드나 작은 badge 라벨에는 아이콘을 붙이지 않는다.
- title + icon 조합은 공용 `inline-flex` 패턴으로 통일한다.

## Density Rules

- `CardHeader`, `CardContent`, `CardFooter` 기본 padding을 `6 -> 5` 수준으로 낮춘다.
- `StatusCard`, sidebar item height, mobile drawer block spacing, `ContentFrame` vertical padding을 각각 한 단계 축소한다.
- 페이지 내부에서 `p-6`, `p-5`, `py-3.5` 류가 과한 곳만 선택적으로 줄인다.
- chart 자체 크기를 무리하게 줄이지 않고, title/filter/action 주변의 주변부 여백만 줄인다.

## Testing and Validation

- frontend unit tests, lint, typecheck를 다시 실행한다.
- desktop과 mobile viewport에서 실제 브라우저를 열어 다음을 확인한다.
  - sidebar icon 정렬
  - collapsed / mobile drawer 가독성
  - title icon과 텍스트 baseline 정렬
  - padding 축소로 인한 겹침, 줄바꿈, 시각적 과밀 여부
- 문제가 보이면 공통 밀도 규칙을 유지한 채 outlier만 추가 보정한다.
