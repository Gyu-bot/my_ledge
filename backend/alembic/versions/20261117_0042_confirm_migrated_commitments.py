"""T056: 사용자 확인과 이전 수동 편집 이력 보존. 이전 컬럼은 삭제하지 않는다.

Revision ID: 20261117_0042
Revises: 20261117_0041
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261117_0042"
down_revision: str | None = "20261117_0041"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "recurring_commitments",
        sa.Column("attributes_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column(
            "legacy_classification_edited",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # 분류값·출처·수정 시각은 그대로 둔다. 교체·병합된 행의 이력도 이어받는다.
    # UNION으로 순환을 끊고, 이미 존재하는 거래의 계보만 따라간다.
    op.execute("""
        WITH RECURSIVE edited(id) AS (
            SELECT id FROM transactions WHERE cost_classification_source = 'manual'
            UNION
            SELECT COALESCE(t.superseded_by_transaction_id, t.merged_into_id)
            FROM transactions t JOIN edited e ON e.id = t.id
            WHERE COALESCE(t.superseded_by_transaction_id, t.merged_into_id) IS NOT NULL
        )
        UPDATE transactions SET legacy_classification_edited = TRUE
        WHERE id IN (SELECT id FROM edited)
    """)


def downgrade() -> None:
    # 기존 행은 고치지 않았으므로 새 기록만 제거하면 직전 상태로 돌아간다.
    op.drop_column("transactions", "legacy_classification_edited")
    op.drop_column("recurring_commitments", "attributes_confirmed_at")
