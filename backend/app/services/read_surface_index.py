"""Index of the agent read surface (T060)."""

from app.schemas.read_surface import (
    QUESTION_LABELS,
    STATUS_LABELS,
    ReadSurfaceEntry,
    ReadSurfaceIndexResponse,
)
from app.services.metric_views import FLOW_DEFINITION, SPEND_CUBE_DEFINITION

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
                key="net_worth_reconciliation",
                name="순자산 대조",
                path=None,
                questions=["Q5"],
                definition="(T061에서 정함)",
                availability="reserved",
                availability_label="예약됨",
                provided_by="T061",
                notes="재무상태와 순자산 대조는 T061이 제공한다. 경로는 T061 병합 뒤 채운다.",
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
