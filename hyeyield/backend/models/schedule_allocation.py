from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class ScheduleAllocation(Base):
    __tablename__ = "schedule_allocations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    schedule_id: Mapped[int] = mapped_column(ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    target_pct: Mapped[float] = mapped_column(Float, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
