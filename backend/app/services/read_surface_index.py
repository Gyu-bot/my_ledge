"""Index of the agent read surface (T060)."""

from app.schemas.read_surface import (
    QUESTION_LABELS,
    STATUS_LABELS,
    ReadSurfaceEntry,
    ReadSurfaceIndexResponse,
)
from app.services.metric_views import FLOW_DEFINITION, SPEND_CUBE_DEFINITION
from app.services.net_worth_service import (
    EMERGENCY_FUND_DEFINITION,
    RECONCILIATION_DEFINITION,
)

READ_PREFIX = "/api/v1/read"

FORMAT_RULES = [
    "금액은 원 단위 정수다. 문자열이나 소수로 주지 않는다.",
    "비중과 비율은 0–1 사이 소수(소수점 4자리)다. 금액 기준 비중이다.",
    "날짜는 ISO 형식(YYYY-MM-DD), 기간은 YYYY-MM이다.",
    "키는 안정된 영어 이름이고, 열거값마다 한국어 이름이 함께 온다: 새 항목은 "
    "같은 줄의 *_label, 화면과 공유하는 payload는 봉투의 labels(키 → 이름).",
    "정의·범위·규칙·가정은 봉투의 basis 하나에만 둔다. 가정은 한국어 문장 목록이다.",
    "status는 ok, classification_incomplete, no_transactions, not_imported 중 하나다. "
    "조회 실패는 HTTP 503과 status=query_failed 본문, 인증 실패는 HTTP 401이다.",
    "스냅샷 기준일은 종류(자산·대출·투자·보험·프로필)마다 따로 주고 합치지 않는다.",
]


def build_index() -> ReadSurfaceIndexResponse:
    live = "제공 중"

    def entry(**values: object) -> ReadSurfaceEntry:
        return ReadSurfaceEntry(
            availability="live", availability_label=live, provided_by="T060", **values
        )  # type: ignore[arg-type]

    return ReadSurfaceIndexResponse(
        auth="모든 경로에 X-API-Key 헤더가 필요하다. 쓰기 경로는 없다.",
        entries=[
            entry(
                key="monthly_flow",
                name="월 흐름표",
                path=f"{READ_PREFIX}/monthly-flow",
                questions=["Q1"],
                definition=FLOW_DEFINITION,
                parameters=["start_period", "end_period"],
            ),
            entry(
                key="spend_cube",
                name="지출 큐브 질의",
                path=f"{READ_PREFIX}/spend-cube",
                questions=["Q1", "Q3"],
                definition=SPEND_CUBE_DEFINITION,
                parameters=[
                    "start_period",
                    "end_period",
                    "group_by",
                    "effective_category_major",
                    "effective_category_minor",
                    "merchant",
                    "payment_form",
                    "commitment_kind",
                    "adjustability",
                    "flow_row",
                    "limit",
                ],
                notes=(
                    "할부 회차를 뺀 지출은 group_by=commitment_kind로 할부 줄을 따로 보거나 "
                    "월 흐름표의 total_outflow − committed_installment_total로 읽는다."
                ),
            ),
            entry(
                key="comparison_monthly_flow",
                name="월 흐름표 비교",
                path=f"{READ_PREFIX}/comparison/monthly-flow",
                questions=["Q1", "Q2"],
                definition="comparison.v1",
                parameters=["period"],
            ),
            entry(
                key="comparison_contributions",
                name="변화 기여",
                path=f"{READ_PREFIX}/comparison/contributions",
                questions=["Q2", "Q3"],
                definition="comparison.v1",
                parameters=["period", "adjustability", "level", "category", "limit"],
            ),
            entry(
                key="review_items",
                name="사후 검토할 거래",
                path=f"{READ_PREFIX}/review-items",
                questions=["Q2", "Q3"],
                definition="review_items.v1",
                parameters=["period", "limit"],
            ),
            entry(
                key="commitments",
                name="약정 목록",
                path=f"{READ_PREFIX}/commitments",
                questions=["Q4"],
                definition="commitments.v1",
                parameters=["period"],
            ),
            ReadSurfaceEntry(
                key="net_worth_intervals",
                name="스냅샷 구간 목록",
                path="/api/v1/metrics/net-worth/intervals",
                questions=["Q5"],
                definition=RECONCILIATION_DEFINITION,
                availability="live",
                availability_label=live,
                provided_by="T061",
                parameters=[],
                notes=(
                    "종류별 스냅샷 날짜와 연속된 자산 스냅샷 구간. "
                    "공통 봉투 없이 지표 응답을 그대로 준다. 상태 어휘가 따로 있다 "
                    "(응답의 status, status_reasons)."
                ),
            ),
            ReadSurfaceEntry(
                key="net_worth_reconciliation",
                name="순자산 대조",
                path="/api/v1/metrics/net-worth/reconciliation",
                questions=["Q5"],
                definition=RECONCILIATION_DEFINITION,
                availability="live",
                availability_label=live,
                provided_by="T061",
                parameters=["start_date", "end_date"],
                notes=(
                    "순자산 변동 = 잔여 + 대출 잔액 감소 + 투자 평가 변동 + 설명되지 않는 차이. "
                    "공통 봉투 없이 지표 응답을 그대로 준다. 상태 어휘가 따로 있다 "
                    "(응답의 status, status_reasons)."
                ),
            ),
            ReadSurfaceEntry(
                key="emergency_fund",
                name="비상금 개월 수",
                path="/api/v1/metrics/net-worth/emergency-fund",
                questions=["Q5"],
                definition=EMERGENCY_FUND_DEFINITION,
                availability="live",
                availability_label=live,
                provided_by="T061",
                parameters=[],
                notes=(
                    "현금성 자산 ÷ 월 보호 지급. "
                    "공통 봉투 없이 지표 응답을 그대로 준다. 상태 어휘가 따로 있다 "
                    "(응답의 status, status_reasons)."
                ),
            ),
            entry(
                key="data_status",
                name="자료 현황",
                path=f"{READ_PREFIX}/data-status",
                questions=["Q6"],
                definition="data_status.v1",
            ),
        ],
        questions=dict(QUESTION_LABELS),
        status_vocabulary=dict(STATUS_LABELS),
        format_rules=FORMAT_RULES,
        migration_document="docs/agents/read-surface-migration.md",
    )
