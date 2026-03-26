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
    app_key_enc: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    app_secret_enc: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    def get_app_key(self) -> str:
        from backend.utils.crypto import decrypt
        return decrypt(self.app_key_enc)

    def get_app_secret(self) -> str:
        from backend.utils.crypto import decrypt
        return decrypt(self.app_secret_enc)

    def set_app_key(self, plaintext: str) -> None:
        from backend.utils.crypto import encrypt
        self.app_key_enc = encrypt(plaintext)

    def set_app_secret(self, plaintext: str) -> None:
        from backend.utils.crypto import encrypt
        self.app_secret_enc = encrypt(plaintext)
