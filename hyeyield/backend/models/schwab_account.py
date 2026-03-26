from datetime import datetime
from typing import Optional, List
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base


class SchwabAccount(Base):
    __tablename__ = "schwab_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_number: Mapped[str] = mapped_column(String(50), nullable=False)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    refresh_token_enc: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    rotation_state: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    min_order_value: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    remainder_symbol: Mapped[str] = mapped_column(String(10), nullable=False, default="SPUS")
    last_run: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    allocations: Mapped[List["Allocation"]] = relationship(  # noqa: F821
        "Allocation", back_populates="account", cascade="all, delete-orphan"
    )

    def get_refresh_token(self) -> str:
        from backend.utils.crypto import decrypt
        return decrypt(self.refresh_token_enc)

    def set_refresh_token(self, plaintext: str) -> None:
        from backend.utils.crypto import encrypt
        self.refresh_token_enc = encrypt(plaintext)
