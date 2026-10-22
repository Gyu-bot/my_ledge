# 금융 로직·가져오기 감사 — 2026-10-22

검토 기준: `9876439` (2026-10-22). 아래 금액은 전부 합성값이다. 인메모리 SQLite와 실제 서비스 함수를 사용해 재현했으며 통합 검토자가 스크립트를 읽고 독립 재실행했다. 운영 데이터에서 오류를 발생시키거나 PostgreSQL 쓰기 검증을 한 것은 아니다. 전체 결론·검증 범위·작업 순서는 [종합 보고서](README.md)를 따른다.

재현은 `Base.metadata.create_all`로 만든 인메모리 DB에 합성 `Transaction`, `Loan`, `UserProfileSnapshot`을 넣고 각 항목의 서비스 함수를 호출했다. F01은 `build_transaction_upload_preview_plan_from_rows` → `apply_transaction_upload_from_rows` → `get_monthly_cashflow`, F02는 `upsert_manual_settlement_match` → `get_monthly_cashflow` 경로다. F08은 같은 연결 데이터에 FK 강제를 켜고 `reset_data`를 호출했다. 재현 입력과 기대/관측값을 각 항목에 남겼다.

## F01. 대체 승인한 거래의 구버전이 분석에 그대로 포함됨
- 분류/심각도: **확정 결함 / P0 출시 차단**.
- 근거: `backend/app/services/upload_apply_service.py:287-311`는 replacement 생성 뒤 old transaction을 `superseded`로 표시하지만 `is_deleted`, `merged_into_id`는 그대로 둔다. `backend/app/services/canonical_views.py:154-157`은 삭제/병합만 제외한다. 따라서 현재 canonical 분석에서 superseded가 살아 있다.
- 재현: 동일 날짜·시간·금액·통화·결제수단, 설명만 변경한 재업로드를 preview의 `possible_replacement`로 명시 적용했다. 정상 지출 10,000인데 analytics monthly cashflow는 20,000, old 상태 `superseded`, deleted=false, merged=null.
- 영향: 재업로드 수정 승인 자체가 총지출·카테고리·구매 검토·예측 학습을 이중 계산한다. 사용자가 정상적인 복구 동작을 할수록 숫자 신뢰가 무너진다.
- 개선: 원본 행을 보존하되 canonical 소비면에서 superseded를 일관되게 제외하고, lineage 조회에서만 구버전 노출. SQL view·ORM select·raw SQL 소비면을 같은 계약으로 정렬. 관계 이동에는 settlement·후보 리뷰 등 전체 관계 목록 명시.
- 완료 기준: preview→replacement apply→재업로드→삭제/복원까지 원본 lineage는 남고 실적 합계는 정확히 1회; monthly/category/merchant/dashboard/projection 동일 기대치. API 및 SQL view parity 검사.
- 연결: **T030, T031, T032, T043 회귀 보강**.

## F02. 부분 배분한 환불의 미배분 잔액이 사라짐
- 분류/심각도: **확정 결함 / P0 출시 차단**.
- 근거: `backend/app/services/settlement_match_service.py:154-194`는 `matched_amount`로 부분 수동 배분을 지원한다. `backend/app/services/settlement_group_service.py:111-124`는 연결이 하나라도 있는 refund id를 전체 제외 집합에 넣고, `backend/app/services/analytics_service.py:1278-1286`은 해당 환불 금액 전체를 0으로 만든다.
- 재현: 결제 -10,000, 환불 +8,000 중 4,000만 user_confirmed. 실제 signed 순지출 2,000인데 analytics=6,000.
- 영향: 부분 배분/다중 원결제 배분 도중 환불 잔액을 잃어 지출이 과대 계상된다.
- 개선: excluded id 대신 환불별 배분액을 사용해 `remaining_refund = refund.amount - allocated_total` 유지. 배분 총액 제약 및 lifecycle 변경 시 capacity 유효성 검증.
- 완료 기준: 1개 환불의 일부 배분, 여러 결제에 완전/부분 배분, 거절/취소 재분류에서 전체 signed 순액 보존. 합산 순액이 원본 signed sum과 같다는 invariant 테스트.
- 연결: **T032, T012**.

## F03. 월 현금흐름에 미래 환불이 소급 반영되고 전망 실적과 다름
- 분류/심각도: **확정 동작·제품 계약 결함 / P1**. 구매의 경제적 순액을 원구매에 귀속하는 자체는 가능한 정책이나, 월 현금흐름·관측 실적과 같은 이름으로 소비하는 현재 경계가 문제다.
- 근거: `backend/app/services/analytics_service.py:1201-1217`은 거래 기간만 제한하고 settlement map은 전기간을 읽는다. `:1278-1286`에서 원결제에 환불을 소급하고 실제 환불일 행을 제거한다. `backend/app/services/monthly_projection_service.py:765-767`은 원본 날짜별 signed 실적을 사용한다.
- 재현: 2월 28일 -10,000, 3월 2일 +4,000 확정 연결. 2월 말까지 analytics 지출=6,000, 같은 날짜 projection observed expense=10,000, 3월 analytics는 환불 행을 없애 월 자체가 없다.
- 영향: 뒤늦은 환불 승인으로 과거 현금흐름이 바뀌고, 같은 월 화면 간 지출이 달라진다. as-of 과거 분석에도 미래 이벤트가 들어간다.
- 개선: `cashflow_by_posted_date`와 `purchase_net_economics`를 분리, basis/as_of/settlement cutoff를 응답에 명시. 현금흐름·예측 관측값은 실제 거래 날짜의 signed sum 유지, 구매 검토는 net economics 사용.
- 완료 기준: 월 경계·연 경계 환불, 기간 밖 환불, 승인 전후에도 현금흐름 실적이 일관되고 구매 순액만 갱신되는지 검증.
- 연결: **T023, T028, T032, T043**.

## F04. 외화 금액을 원화와 더하고 소수부도 절삭
- 분류/심각도: **확정 결함 / P1**. 실제 사용자의 외화 데이터 존재를 주장하는 것은 아니다. 현재 importer가 외화 입력을 허용하는 계약상의 문제다.
- 근거: `backend/app/parsers/transactions.py:60-61`은 amount=int, currency는 입력값 유지. `backend/app/services/analytics_service.py:1226-1243`은 currency를 버린다. `:103-113` 및 projection `:765-767`은 단위 구분 없이 합산한다.
- 재현: KRW -10,000 + USD -10 → 단일 expense=10,010. USD -10.99 parser 입력 → -10.
- 영향: 국제 결제/외화 계좌 사용자의 대시보드·분석·예측이 수학적으로 의미 없는 총액을 제공하며 원본 정밀도도 잃는다.
- 개선: 최소 범위에서는 KRW-only 계약을 명시하고 외화 입력을 경고·별도 버킷으로 격리해 단일 합계 제외. 다중통화 지원 시 Decimal/통화별 minor units, original_amount/currency, converted_amount/rate/date/source를 보존하고 missing FX는 null 및 사유 반환.
- 완료 기준: KRW+USD+JPY, fractional negative/refund, FX 없음/변경, 원본과 환산값 재현성. 어떤 경로에서도 서로 다른 통화를 단위 없이 합산하지 않음.
- 연결: **T009, T018, T035, T043**. 외화 거래 계약은 신규 승인 작업으로 범위 명시 권장.

## F05. 다음 날짜 업로드에서 수동 대출 조건이 끊김
- 분류/심각도: **확정 동작·지속성 결함 / P1**.
- 근거: `backend/app/services/upload_service.py:210-236`은 loan metadata를 같은 snapshot_date에서만 가져온다. `:279-286`에서 새 loan을 만들므로 이전 날짜의 manual 금액/상환 방식은 승계되지 않는다. `backend/app/services/assets_service.py:531-534`의 manual 저장도 snapshot row에만 존재한다. 자산 liquidity metadata는 반대로 same-or-earlier를 승계한다.
- 재현: 5월 snapshot에 월상환액 1,000/manual + principal_interest/manual 저장 후 6월 동일 lender/product를 import. 새 monthly_payment/source/repayment_method 모두 null.
- 영향: 정기 업로드 후 입력한 대출 조건이 사라지거나 자동 추정으로 돌아가 liquidity·월말 전망이 갑자기 달라진다. 현재 계약은 same-date 보존만 문서화되어 있으므로 상품화 시 정책 결정을 포함한 개선이 필요하다.
- 개선: 안정 account identity의 사용자 override를 snapshot 원본과 분리하고 effective-from/to를 부여. 안전한 동일 identity는 수동 override를 이어가되 불명확한 중복 이름은 리뷰.
- 완료 기준: 같은 날짜/다음 날짜/과거 업로드, manual null/zero/value, 자동 복귀, 동명이계좌에서 의도한 override 유지 및 source 표시.
- 연결: **T042, T025, T015**.

## F06. optional 고객정보가 없는 같은 날짜 업로드가 기존 프로필을 삭제
- 분류/심각도: **확정 결함 / P1**.
- 근거: `backend/app/parsers/snapshots.py:91-95`는 고객정보 marker 없음→None. `backend/app/services/upload_service.py:241-245`는 기존 profile을 무조건 삭제하고 `:288-294`는 None일 때 새 row를 만들지 않는다. `asset_source_service.py:152` 이하 append-only 보존은 asset/loan만 포함하여 profile에 동일 보호가 없다.
- 재현: 같은 snapshot date에 프로필이 있을 때 user_profile=None인 parse 결과 replace → 기존 row 소멸.
- 영향: 수집되지 않음과 의도적으로 비움이 구분되지 않아 출처 근거와 이전 프로필을 잃는다.
- 개선: section presence/parse validity/explicit empty를 구분하고 missing section은 skip. 프로필·보험을 포함한 원본 observation/version 보존 후 선택값 갱신.
- 완료 기준: marker missing, present-empty, malformed, explicit deletion 각각 보존/변경 결과와 diagnostics 구분; same-date 재업로드 이력 추적 가능.
- 연결: **T004, T029, T015, T018**.

## F07. 보험·투자·대출 optional section 누락이 거래 preview 전체를 막음
- 분류/심각도: **확정 결함 / P2**.
- 근거: `backend/app/parsers/snapshots.py:72-75`는 모든 marker를 필수 조회. `backend/app/services/upload_preview_service.py:58-69`는 거래와 snapshot parsing을 묶어 실패 시 invalid workbook. backend/app AGENTS는 optional section 누락을 skipped metadata로 처리하도록 요구한다.
- 재현: 보험 marker만 없는 합성 뱅샐현황 → ValueError `Missing marker: 4.보험현황`. preview 경로에서는 422 invalid_workbook으로 매핑된다.
- 영향: 보험·투자가 없는 사용자, export 양식 일부 변경 사용자가 정상 거래 내역까지 가져오지 못한다.
- 개선: section별 파싱 결과·presence·warning 계약, 필수 거래 schema만 전역 실패. 누락 section은 F06처럼 삭제 신호로 취급하지 않음.
- 완료 기준: 보험 없음/투자 없음/대출 없음/고객정보 없음 각각 거래 preview 가능, warnings와 skipped counts 노출, 기존 snapshot 보존.
- 연결: **T008, T009, T029, T031**.

## F08. 실제 FK 제약 아래 연결 거래가 있으면 데이터 초기화 실패
- 분류/심각도: **확정 결함 / P1**. QA-01의 운영 DB 제약 검증 공백과 연결된다.
- 근거: `backend/app/services/data_reset_service.py:33`은 먼저 transactions 전체 삭제. `backend/app/models/settlement_group.py:36-43` 및 loan/installment transaction link FK는 cascading delete가 없고 reset에서 자식 정리도 없다.
- 재현: 위 synthetic settlement data에 `PRAGMA foreign_keys=ON` 후 `reset_data(... scope='transactions_only')` → IntegrityError / FOREIGN KEY constraint failed. PostgreSQL 실행은 하지 않았고, FK를 실제 강제하는 SQLite로 결함 확인.
- 영향: 정상 사용 후 초기화가 오히려 불가능. 기본 SQLite 테스트가 FK OFF여서 이런 회귀를 놓칠 수 있다.
- 개선: 삭제 의도에 맞춘 graph cleanup 순서/보존 정책을 원자적 transaction으로 구현. 전체 reset의 profile/settings/logs/account metadata 포함 범위를 명시. 모든 SQLite fixture FK ON 및 PostgreSQL 계약 검증.
- 완료 기준: loan/installment/settlement/review/self-reference 각각 존재하는 reset, rollback injection, 두 scope의 보존/삭제 counts 검증.
- 연결: **T030, T031, 데이터 관리 후속 작업**.

## F09. 거래 preview/apply 계약 밖에서 자산·대출 snapshot 전체 교체
- 분류/심각도: **설계·UX 계약 공백 / P1 개선 제안**. 현재 documented date-scoped replace 동작으로, 구현이 기존 문서를 위반한다고 주장하지 않는다.
- 근거: `backend/app/services/upload_preview_service.py:42-49`는 parsed snapshots를 버리고 거래 preview만 만든다. `backend/app/services/upload_apply_service.py:130-141`은 사용자가 고른 transaction selections와 독립적으로 snapshot 전부 replace. `backend/app/schemas/upload.py:117-123` preview에는 snapshot diff/삭제 수가 없다.
- 영향: 사용자는 거래 몇 건의 적용을 승인하면서 동일 날짜 전체 자산·보험·대출 교체까지 승인하는 셈이다. 중요한 자산 감소나 누락을 사전에 검토하기 어렵다.
- 개선: source별 snapshot diff(신규/변경/삭제/skip), 순자산 영향, 기준일, section coverage를 같은 preview revision으로 묶고 apply에 snapshot scope 선택/명시 동의. 원본은 append-only 유지.
- 완료 기준: 거래 1건만 선택해도 어떤 snapshot 변경이 동반되는지 preview에 표시; empty/missing/0 값을 구분; stale preview 거부; snapshot만 import도 일관된 지원.
- 연결: **T031, T015-T018**.

## F10. 반복 탐지와 전망의 거래처 단위가 복수 계약·계절성·FX를 혼합
- 분류/심각도: **알려진 미완성 설계 / P2**. T035/T036 미완료이므로 기존 완료 작업의 회귀라고 분류하지 않는다.
- 근거: `backend/app/services/analytics_service.py:519-522` merchant-only grouping. `backend/app/services/monthly_projection_service.py:526-544`는 merchant에 고정/반복 거래 하나가 있으면 같은 payer를 모두 recurring partition에 넣는다. `:164-172` 안정 이력은 median ±30% / 최소 3개월.
- 영향: 같은 판매처의 두 구독과 일회성 구매, 카드별 계약이 섞이며 계절성 공과금·환율 변화·가격 인상을 동일한 금액 불안정으로 다룬다. 안정적인 정기 결제와 금액을 예측하기 쉬운 결제를 혼동하기 쉽다.
- 개선: series identity=normalized merchant+payment method+currency+amount/date/description evidence, 사용자 승인 ledger와 갱신/해지·가격변경 상태. recurrence confidence와 amount forecast confidence 분리; 변동 공과금은 범위/계절성, FX는 원통화 반복성과 환산 불확실성을 분리.
- 완료 기준: 동일 merchant 두 구독/한 카드 두 계약/일회성 혼합, 겨울 가스비, 외화 정액 원화변동, 전액환불/분할환불/해지·미납을 독립 fixture로 검증. 동일 transaction은 계획 구성요소 하나에만 배정.
- 연결: **T035, T036, T037, T043**.

## 강점과 경계

- canonical select는 user category override COALESCE, 삭제·병합 제외를 공통화한다. 이체는 projection income/expense에서 제외되며, signed expense 환불 원칙이 기본 경로에 존재한다. 문제는 새 lifecycle 상태와 downstream netting 소비면의 경계다.
- 투자 소스는 append-only observation, complete run 선택, currency mismatch·missing valuation conflict 및 provenance를 구현한다. T015-T018 전체 일반화가 아직 미완료임을 현재 roadmap도 명시한다. 이번 합성 검증은 투자 API/네트워크를 호출하지 않았다.
- 월 전망은 충분히 관측된 월 기준·stale 입력 제한·known/unknown remaining 분리를 이미 제공한다. 고도화보다 먼저 위 합산·이력 불변식을 통과시키는 것이 상품화에 중요하다.
- 직접 금액 mutation에 대한 stale settlement 실험도 했으나 현재 공개 거래 수정 경로에서 amount 변경이 허용되지 않아 확정 사용자 결함 목록에 올리지 않았다. 이 실험 출력은 출시 차단의 독립 근거로 사용하지 말 것.
