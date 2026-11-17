"""T065: 사람이 등록한 대출 규칙을 업로드 시 기본 적용한다.

Revision ID: 20261117_0043
Revises: 20261117_0042
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261117_0043"
down_revision: str | None = "20261117_0042"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "auto_classification_settings",
        "apply_loan_rules_on_upload",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=sa.true(),
    )
    # 소유자가 기존 설정도 기본 적용으로 전환하도록 승인했다.
    op.execute(
        "UPDATE auto_classification_settings SET apply_loan_rules_on_upload = TRUE"
    )


def downgrade() -> None:
    # 이후 사람이 바꾼 설정은 보존하고 서버 기본값만 되돌린다.
    op.alter_column(
        "auto_classification_settings",
        "apply_loan_rules_on_upload",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=sa.false(),
    )
