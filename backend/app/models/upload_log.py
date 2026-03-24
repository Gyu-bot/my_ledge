from datetime import date, datetime

from sqlalchemy import Date, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UploadLog(Base):
    __tablename__ = "upload_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
    )
    filename: Mapped[str | None] = mapped_column(String(200))
    snapshot_date: Mapped[date | None] = mapped_column(Date)
    tx_total: Mapped[int | None] = mapped_column(Integer)
    tx_new: Mapped[int | None] = mapped_column(Integer)
    tx_skipped: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String(20))
    error_message: Mapped[str | None] = mapped_column(Text)
