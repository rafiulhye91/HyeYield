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


class UserProfile(BaseModel):
    id: int
    username: str
    email: str
    ntfy_topic: Optional[str]
    schedule_cron: str
    created_at: datetime

    class Config:
        from_attributes = True
