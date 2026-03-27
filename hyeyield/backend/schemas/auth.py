from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    app_key: str
    app_secret: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserUpdate(BaseModel):
    ntfy_topic: Optional[str] = None
    app_key: Optional[str] = None
    app_secret: Optional[str] = None


class UserProfile(BaseModel):
    id: int
    username: str
    email: str
    ntfy_topic: Optional[str]
    schedule_cron: str
    has_schwab_credentials: bool
    has_schwab_connected: bool
    created_at: datetime

    class Config:
        from_attributes = True
