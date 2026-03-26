from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel


class AccountCreate(BaseModel):
    account_number: str
    account_name: str
    account_type: Optional[str] = None
    app_key: str
    app_secret: str
    min_order_value: float = 1.0
    remainder_symbol: str = "SPUS"


class AccountUpdate(BaseModel):
    account_name: Optional[str] = None
    account_type: Optional[str] = None
    min_order_value: Optional[float] = None
    remainder_symbol: Optional[str] = None
    enabled: Optional[bool] = None


class AccountResponse(BaseModel):
    id: int
    account_number: str
    account_name: str
    account_type: Optional[str]
    rotation_state: int
    enabled: bool
    min_order_value: float
    remainder_symbol: str
    last_run: Optional[datetime]
    created_at: datetime
    connected: bool

    class Config:
        from_attributes = True


class ConnectRequest(BaseModel):
    account_id: int
    redirect_url: str


class AllocationIn(BaseModel):
    symbol: str
    target_pct: float
    display_order: int


class AllocationOut(BaseModel):
    id: int
    symbol: str
    target_pct: float
    display_order: int

    class Config:
        from_attributes = True
