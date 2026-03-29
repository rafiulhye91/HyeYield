from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("schwab_accounts.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # "weekly" | "biweekly_1_15" | "biweekly_alternating" | "monthly"
    frequency: Mapped[str] = mapped_column(String(30), nullable=False)
    day_of_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)   # 0=Mon…4=Fri
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1–28

    hour: Mapped[int] = mapped_column(Integer, nullable=False, default=9)
    minute: Mapped[int] = mapped_column(Integer, nullable=False, default=35)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="America/Chicago")

    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
