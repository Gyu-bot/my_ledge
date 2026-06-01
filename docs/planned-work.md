# Planned Work

이 문서는 **아직 구현되지 않은 backlog와 보류/장기 계획**만 정리한다.
이미 구현된 endpoint, canonical view, frontend 연결, 운영 결정은 이 파일에 반복하지 않고 [STATUS.md](STATUS.md), [backend-api-ssot.md](backend-api-ssot.md), [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md)를 기준으로 확인한다.

우선순위 기준:

- **P0:** 기존 기능의 신뢰도, 운영 검증, 에이전트 read contract 안정성에 직접 영향
- **P1:** 현재 live 기능을 막지는 않지만 사용자 workflow를 눈에 띄게 개선하는 후속 작업
- **P2:** 큰 구조 변경, 장기 제품 방향, 또는 별도 승인 후 진행할 실험
- **Paused:** 명시적으로 보류된 작업
- **Stale:** 과거 계획 문서에 남아 있지만 현재 live 상태 기준 backlog로 보지 않는 항목

현재 live contract는 코드와 [backend-api-ssot.md](backend-api-ssot.md)가 우선한다. `PRD.md`와 `docs/superpowers/plans/**`는 제품/실행 계획으로 참고하되, live 여부 판단에는 사용하지 않는다.

---

## Product Direction Decisions

- My Ledge의 1차 역할은 재무 어시스턴트 자체가 아니라, 재무 어시스턴트가 믿고 쓸 canonical view/read model foundation을 제공하는 것이다.
- My Ledge는 구매/소비에 대한 최종 규범적 판단을 내리지 않는다. 재현 가능한 계산, threshold 적용, 후보 탐지, 근거, confidence, assumptions, review workflow 상태까지만 책임지고, 에이전트가 사용자 맥락을 반영해 최종 해석과 조언을 만든다.
- assistant personality, 말투, 조언 강도는 My Ledge core가 아니라 별도 assistant/consumer layer에서 결정한다.
- 어시스턴트 해석에 필요한 주요 요약은 agent가 매번 raw data로 재계산하지 않도록 backend API 또는 canonical read surface로 고정한다.
- 새 advisor 기능의 기본 threshold와 lookback 값은 보수적인 초기값으로 두되, settings API 또는 기능별 settings surface로 조정 가능하게 만든다.
- `description_user` / `effective_description`은 구현하지 않는다. 원본 설명은 `description`으로 보존하고, 분석/집계용 거래처명은 `merchant`, 사용자 부가 설명은 기존 `memo`를 사용한다.
- 자산/투자/대출 snapshot은 우선 업로드될 때만 쌓이는 sparse 데이터로 본다. 월말/정기 snapshot 강제 운영은 지금 하지 않는다.
- 투자 성과/상품 배분/수익률 분석은 증권사 API 연동 이후로 미룬다.
- 자산이동/이체 tracking은 현재 사용자 가치가 낮으므로 우선순위를 뒤로 미룬다. 구현 전까지는 `transfer_activity_total` 같은 기존 현금흐름 보조 값만 유지한다.

---

## P0 — Stabilization And Contract Hygiene

### 운영 배포본 smoke capture

- 대상:
  - overview
  - spending
  - assets
  - insights
  - operations workbench
  - loan mapping
  - asset settings
  - installments
- 확인:
  - API proxy와 runtime config
  - 주요 chart/table 렌더링
  - console error
  - 운영 배포본 screenshot capture
- 관련 문서:
  - [frontend/page-wireframes.md](frontend/page-wireframes.md)
  - [frontend/components-and-design-token-inventory.md](frontend/components-and-design-token-inventory.md)

### Import parity hardening

- 현재 `verify_import_parity` 범위는 transaction sample presence + snapshot missing/extra row 검증으로 유지한다.
- rolling-window overlap extra-row 검증은 운영 fixture 비용이 큰 별도 hardening으로 남긴다.
- acceptance:
  - prepared workbook으로 upload/import smoke를 재현한다.
  - 누적 BankSalad workbook의 overlap window에서 신규/기존 row 판정이 문서화된다.
  - 실패 시 upload log와 검증 리포트가 어느 row 범위를 비교했는지 남긴다.

---

## P1 — Workflow Follow-Up

### Purchase gate review workflow

- 현재 live purchase gate는 후보와 review status를 제공한다. 후속 작업은 별도 review workflow를 더 쓰기 좋게 만드는 것이다.
- 남은 작업:
  - `/operations/purchase-review` 또는 insights 내 review-focused section 검토
  - review memo 저장
  - `reviewed_at`
  - `cooldown_until`
  - snooze/dismiss된 후보의 재노출 규칙
- contract docs 영향:
  - [backend-api-ssot.md](backend-api-ssot.md)
  - [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md)
  - [agents/canonical-read-surface-reference.md](agents/canonical-read-surface-reference.md)

### Settings frontend

- 현재 analytics settings backend는 live다. 남은 작업은 사용자가 직접 조정할 수 있는 frontend surface다.
- 남은 작업:
  - `/settings` route와 shell 하단 settings entry
  - analytics settings panel
  - purchase gate / discretionary velocity / recurring dry-run / asset-liability settings UI
  - reset-to-default, export/import는 별도 개발/리뷰용 도구로 분리
- contract docs 영향:
  - [frontend/page-wireframes.md](frontend/page-wireframes.md)
  - [frontend/components-and-design-token-inventory.md](frontend/components-and-design-token-inventory.md)

## P2 — Asset Raw Observation Lifecycle, Source Priority, And Reconciliation

상태: planned. 현재 live는 snapshot 원본 보존과 liquidity/repayment metadata 보강까지만 지원한다. 다음 단계는 raw observation을 immutable하게 보존하면서 canonical asset selection, user-controlled source priority, deterministic conflict resolution, stale/matured handling, reconciliation/audit surface를 추가하는 것이다.

목표:

- BankSalad raw data로 들어온 자산/대출/투자 observation이 만기, 중복, 오염, 외부 source 대체로 인해 더 이상 기본 화면이나 canonical view에 포함되면 안 되는 경우를 안전하게 정리한다.
- 전체 `data/reset` 없이 특정 자산 원천 observation을 canonical total에서 제외하거나 다른 source로 대체할 수 있게 한다.
- BankSalad 외 source를 추가해도 canonical 자산/부채/투자 값이 deterministic하게 합쳐지고, 에이전트가 source 신뢰도와 freshness를 설명할 수 있게 한다.
- multi-source 충돌이 있을 때 시스템 기본값만 강제하지 않고, 사용자가 asset type/source별 우선순위를 선택하고 저장할 수 있게 한다.

### P2a — Observation lifecycle and canonical inclusion policy

- 일반 운영에서는 raw observation을 hard delete하지 않는다. canonical 제외와 대체는 lifecycle decision layer에서 처리한다.
- `asset_snapshots`, `investments`, `loans` 또는 별도 metadata table에 raw observation lifecycle status를 둔다.
- 후보 status:
  - `active`
  - `hidden_by_user`
  - `matured_candidate`
  - `matured_confirmed`
  - `replaced`
  - `duplicate`
  - `conflict`
  - `stale`
  - `needs_review`
- `hidden_by_user`, `matured_confirmed`, `replaced`, `duplicate` observation은 raw audit에서는 보이지만 기본 assets UI와 canonical totals에서는 제외하는 방향을 검토한다.
- `stale`은 freshness SLA 초과일 뿐 canonical 제외 근거가 아니다. `matured_confirmed`는 0 balance/closed evidence 또는 사용자 확인이 있어야 한다.
- 만기 지난 대출/자산이 latest view에 계속 보이는 문제를 해결한다.
  - 대출은 `maturity_date < as_of_date`이고 balance가 0 또는 사용자 확인된 경우 `matured_candidate`로 제안한다.
  - 적금/예금/보험성 자산처럼 product name이나 category로 만기 추정이 가능한 row는 자동 숨김이 아니라 review candidate로 올린다.
- API 후보:
  - `GET /api/v1/assets/snapshots/raw`
  - `POST /api/v1/assets/snapshots/visibility-preview`
  - `POST /api/v1/assets/snapshots/visibility-apply`
- acceptance:
  - apply 전 preview가 canonical total 영향, latest asset screen 영향, raw audit 보존 여부를 보여준다.
  - visibility 변경은 감사 가능한 이유와 actor/source를 남긴다.

### P2b — User-controlled source priority profiles

- BankSalad raw data의 특정 자산 항목을 외부 source로 대체할 수 있게 한다.
  - 투자: 추후 증권사 API 또는 brokerage CLI에서 보유수량/평가액/현금 예수금 snapshot을 가져온다.
  - 부동산: 실거래가/공시가격/시세 API를 별도 valuation source로 받아 BankSalad row와 연결한다.
  - 기타: 보험 해지환급금, 퇴직연금, 예수금, 외화 현금성 자산, 수동 valuation import를 source adapter 후보로 둔다.
- 기본 우선순위는 fallback일 뿐이며, 사용자는 자산군 또는 특정 canonical asset key 단위로 source priority를 버전 관리된 설정으로 조정할 수 있다.
- 우선순위 변경은 historical observation을 수정하지 않고 future resolution rule로 기록한다.
- source priority 설정 범위:
  - global default priority
  - asset class별 priority: cash, investment, real_estate, loan, insurance, pension, manual
  - canonical asset key별 override
  - field별 override: balance, valuation, liquidity_tier, monthly_payment, maturity_date
- 초기 기본값 후보:
  - manual override
  - user-confirmed row
  - high-confidence external source
  - BankSalad raw import
  - heuristic/derived estimate
- UI/설정 후보:
  - `/settings/assets/source-priority`
  - `GET /api/v1/assets/source-priority`
  - `PATCH /api/v1/assets/source-priority`
- 에이전트는 source conflict를 임의로 해결하지 않고, 현재 저장된 priority와 conflict reason을 사용자에게 설명한다.

### P2c — Deterministic field-level resolution and conflict queue

- row 단위 merge보다 field 단위 resolution을 우선한다.
- 동일 자산 identity에 여러 source가 들어오면 `canonical_asset_key + as_of_date`로 묶고, `hidden_by_user`, `replaced`, `duplicate`, `matured_confirmed` observation을 제외한 뒤 field별 source priority를 적용한다.
- tie-break 순서:
  - `user_confirmed`
  - higher-priority source
  - fresher `observed_at`
  - higher `source_confidence`
  - later `ingested_at`
  - stable row id
- 같은 우선순위 source끼리 금액 차이가 tolerance를 넘으면 조용히 덮지 않고 conflict queue에 남긴다.
- preview-first workflow:
  - lifecycle decision preview: 대상 observation 수, snapshot_date 범위, canonical total 영향, latest asset screen 영향 표시
  - replacement preview: source observation과 selected observation, field별 선택 이유, conflict/tolerance 정보 표시
  - apply: explicit confirmation 후 lifecycle decision 또는 replacement chain을 저장
- API 후보:
  - `GET /api/v1/assets/reconciliation`
  - `GET /api/v1/assets/conflicts`
  - `POST /api/v1/assets/reconciliation/preview`
  - `POST /api/v1/assets/reconciliation/apply`
- `POST /api/v1/data/reset`은 대량 초기화용으로 유지하고, 위 API는 범위 제한 복구/정리용으로 분리한다.

### P2d — Provenance and agent coverage surface

- 원천 추적 필드 또는 별도 table 후보:
  - `source_system`
  - `source_run_id`
  - `source_file_fingerprint`
  - `source_row_hash`
  - `external_account_id`
  - `canonical_asset_key`
  - `source_confidence`
  - `observed_at`
  - `valuation_as_of`
  - `is_user_confirmed`
  - `priority_policy_id`
  - `decision_reason`
  - `reviewed_by`
  - `reviewed_at`
  - `superseded_by_observation_id`
  - `selected_source_system`
  - `selected_observation_id`
  - `freshness_sla_days`
  - `stale_days`
  - `conflict_status`
- 에이전트용 coverage surface 후보:
  - `GET /api/v1/analytics/asset-source-coverage`
  - `vw_asset_source_coverage`
  - `vw_asset_snapshot_canonical` 확장 필드: `raw_total`, `selected_total`, `excluded_total`, `confirmed_total`, `derived_total`, `hidden_total`, `conflicted_total`, `stale_ratio`, `stale_days`, `missing_value_reason`, `last_authoritative_observed_at`, `source_priority_profile`, `source_priority_applied`
- 에이전트 답변 규칙:
  - source가 섞인 자산 값은 확정 총액처럼 말하지 않고 source coverage와 stale 여부를 같이 설명한다.
  - hidden/matured/replaced row는 raw audit 대상이지만 기본 자산 상태 판단에는 포함하지 않는다.
  - 부동산/투자 외부 valuation은 가격 기준일과 confidence를 항상 함께 표시한다.
  - 사용자 priority 때문에 낮은 confidence source가 선택된 경우, 선택된 정책과 대안 source를 함께 설명한다.
- contract docs 영향:
  - [backend-api-ssot.md](backend-api-ssot.md)
  - [backend-api-and-metrics-reference.md](backend-api-and-metrics-reference.md)
  - [agents/canonical-read-surface-reference.md](agents/canonical-read-surface-reference.md)
  - [agent-integration/integration-guide.md](agent-integration/integration-guide.md)

---

## P2 — Product Expansion

### Investment analytics after securities source integration

- 증권사 API/CLI 연동 이후 투자 분석 보강
  - `GET /api/v1/analytics/investment-performance`
  - `vw_investment_allocation_snapshot`
  - broker/product type/product 기준 allocation ratio와 previous-snapshot delta
  - 매수/매도/입출금 cashflow 기반 수익률과 성과 attribution
- 투자 성과/배분 판단은 BankSalad snapshot만으로 구현하지 않는다.

### Transfer tracking

- 현재 우선순위는 뒤쪽이다.
- 구현 전까지는 `vw_monthly_cashflow.transfer_activity_total`만 보조 값으로 유지한다.
- API 후보:
  - `GET /api/v1/transfers/summary`
  - `GET /api/v1/transfers`
  - `GET /api/v1/transfers/unmatched`
- 범위:
  - raw `type='이체'` 기반 자산 이동을 먼저 다룸
  - 대출 원금/이자 상환처럼 `type='지출'`에 섞인 debt movement는 raw type을 바꾸지 않고 파생 레이어로만 처리
  - ambiguous row는 review candidate로 남긴다.

### Long-term product items

- 수입 분석 페이지
- 자동 백업 크론
- 도메인 연결 + HTTPS
- budgets / financial goals / advice preferences
- health score / personalized coaching

---

## Paused

### Frontend remake

- 프론트엔드는 현재 화면의 단기 미관 개선보다 전체 리메이크 가능성을 계획으로 유지한다.
- 재개 시점에는 현재 main의 live 기능, route, API contract를 기준으로 새 frontend 범위를 다시 정의한다.
- legacy component cleanup, theme 확장 같은 단기 미관 개선은 우선순위에서 제외한다.

---

## Stale Or Historical Items

아래 항목은 문서에 남아 있어도 현재 backlog로 보지 않는다.

- 과거 `PRD.md` Phase 1-3 unchecked milestone 항목
- `docs/archive/planning/finance-advisor-analytics-expansion.md`
- `docs/archive/**`
- `docs/superpowers/plans/2026-03-23-*`, `2026-03-24-*`, `2026-03-26-*`

---

## Recommended Execution Order

1. P0 운영 배포본 smoke capture와 import parity hardening을 먼저 처리한다.
2. P1 purchase gate review workflow와 settings frontend를 이어서 정리한다.
3. P2 asset raw data lifecycle / multi-source priority를 별도 설계 세션으로 구체화한다.
4. 투자 분석과 자산이동/이체 tracking은 각각 source integration과 product 우선순위를 확인한 뒤 진행한다.
