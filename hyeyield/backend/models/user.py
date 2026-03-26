from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    ntfy_topic: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    schedule_cron: Mapped[str] = mapped_column(String(50), nullable=False, default="35 9 1,15 * *")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
