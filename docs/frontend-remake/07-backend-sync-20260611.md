# 07. 백엔드 동기화 — main `8c77fed` (T001-T012) 반영

> 2026-06-11, main에 합류한 backend 신규 surface를 프론트엔드 설계에 반영한 변경 기록.
> 이 문서가 **델타의 SSOT**이고, 02/03/05/06 문서는 이 내용이 반영된 상태로 수정되어 있다.
> ⚠ `frontend-remake` 브랜치의 backend 코드는 아직 분기점(e938435) 기준이다 — 구현 시 main merge 필요.

## 1. 신규/변경 백엔드 surface → 설계 반영 맵

| Backend 변경 | 내용 | 프론트 설계 반영 위치 |
|---|---|---|
| `GET /api/v1/profile` (신규) | BankSalad `1.고객정보` 스냅샷 — 성별/나이/KCB 신용점수 + 이력 (이름·이메일 비저장) | **자산·부채**: 신용점수 카드(+이력 스파크라인, 나이·성별 메타) |
| `GET /api/v1/insurance/summary` (신규) | `4.보험현황` 계약 스냅샷(보험사/상품/상태/총납입/계약일/만기일) + 최근 마감월 `보험` 카테고리 지출 기반 월 보험료 추정(assumptions 포함) | **자산·부채**: 보험 보드 신설. **가져오기**: 업로드 결과에 보험 건수. 01 인벤토리의 "보험현황 미사용" 전제 폐기 |
| `investments/summary` `pct_of_investment_total` | 종목별 투자 비중 | **자산·부채**: 투자 구성 보드 신설 ("증권사 연동 후 보강" 단서 제거) |
| canonical dashboard `data_coverage` + `is_complete_month` | 관측 거래 범위(first/last date), 월별 마감 여부 플래그 | **홈**: 마감월 판단 휴리스틱 → `is_complete_month`로 교체. 현금흐름 차트 미완성 월 시각 구분. **가져오기/데이터 사전**: 관측 범위 표시 |
| `liquidity-health` `emergency_fund_target_months` + `target_progress_ratio` + 음수 자산 제외 | 재무 목표 기반 비상금 진행률, `negative_asset_excluded_total` | **자산·부채**: 비상금 목표 대비 진행률 게이지. 구성 차트 Provenance에 음수 자산 제외 표기 |
| `settings/analytics` 확장 — `financial_targets` (비상금 목표 개월, 저축률 목표, 부채 전략 avalanche/snowball) + 섹션별 분석 파라미터 | 저장형 설정 표면 완성 | **신규 화면 `/data/settings`** (데이터 서브 내비 9번째). **홈/신호**: "목표 50%" 하드코딩 → `savings_rate_target` 사용. **자산·부채**: 부채 전략을 대출 보드 정렬 힌트로 |
| purchase-gate review 확장 — status 5종 + `memo` + `cooldown_until`(`cooldown_days`, snooze 기본 14일) + `reviewed_at` | 후보 리뷰 워크플로 영속화 | **신호**: 구매 게이트 신호 카드에 리뷰 액션(검토함/무시/스누즈 N일/메모). 기존 "[무시]"가 세션 휘발 → 서버 영속로 변경 |
| `vw_loan_account_canonical` (+`estimated_monthly_interest`) | 안정 대출 계좌 구조 surface, 월 이자 단순 추정(`balance×rate/12`) | **자산·부채** 대출 카드 + **데이터·대출** 계좌 탭: 월 이자 추정 표시 (ⓘ "단리 추정, 상환 스케줄 아님") |
| `vw_income_monthly_by_category` | 월 수입 카테고리 구성 (agent/SQL surface, 아직 REST 미노출) | **지출**: `수입` 렌즈 추가. 1차 데이터는 기존 `by-category(type=수입)` API, canonical REST 노출 시 교체 |
| `snapshot-compare` `last_closed_month_vs_previous_closed_month` 모드 | 비교 기준 선택지 추가 | **자산·부채** 헤더: 비교 모드 선택(기본 latest vs previous) |
| upload — `1.고객정보`/`4.보험현황` 파싱, summary에 `insurance_contracts`, reset 범위에 보험 포함, `2.현금흐름현황`은 검증 증거 전용 | import 범위 확대 | **가져오기**: 결과 표시(자산/보험/투자/대출 4종 카운트), Danger Zone 문구에 보험 포함, 검증(parity) 경고 노출 자리 예약 |

## 2. 설계 원칙에 미치는 영향

- **마감월 개념의 공식화** — 지금까지 "직전 마감월"을 날짜 휴리스틱으로 판단했지만, 이제 `is_complete_month`가 계약이다. 홈 저축률·신호 기준 모드·차트 표기 모두 이 플래그를 단일 기준으로 쓴다.
- **목표(financial targets)의 등장** — 저축률 50%, 비상금 3개월이 하드코딩에서 사용자 설정으로 바뀐다. KPI 보조 라인의 목표 표기는 전부 settings 값을 읽는다.
- **보험은 "증거만"** — 백엔드 명시 원칙(적정성 판단은 에이전트/사용자 몫)을 UI 문구로 그대로 가져온다. 보험 보드는 계약·보험료 추정 evidence만 보여주고 판단 문구를 넣지 않는다.
- **음수 자산 제외 같은 계산 규칙은 Provenance로** — `negative_asset_excluded_total` 류의 "계산에서 뺀 것"은 본문이 아니라 ⓘ 팝오버 행으로 노출한다.

## 3. 프론트 구현 추가 작업 (06 계획 반영)

- 신규 api/hooks: `profile`, `insurance/summary`, `settings/analytics`(GET/PATCH 확장형), purchase-gate review PATCH 확장형
- 타입 갱신: `canonicalViews.ts`(`data_coverage`, `is_complete_month`), `asset.ts`(`pct_of_investment_total`, `negative_asset_excluded_total`, liquidity targets), `analytics.ts`(purchase gate review 필드)
- 홈 수정: 저축률 마감월 선택을 `is_complete_month` 기반으로, 목표를 settings에서
- 02 문서의 "백엔드 요청" 중 *분류 커버리지 집계*는 여전히 미해결, *데이터 커버리지*는 `data_coverage`로 해결됨
