import re
from typing import List, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.allocation import Allocation
from backend.models.schwab_account import SchwabAccount
from backend.models.user import User
from backend.schemas.account import (
    AccountCreate,
    AccountResponse,
    AccountUpdate,
    AllocationIn,
    AllocationOut,
    ConnectRequest,
)
from pydantic import BaseModel
from backend.services.schwab_client import SchwabAuthError, SchwabAPIError, SchwabClient
from backend.utils.jwt_utils import get_current_user

router = APIRouter(tags=["schwab"])

_REDIRECT_URI = "https://hyeyield.duckdns.org/redirect"
_SCHWAB_AUTH_URL = "https://api.schwabapi.com/v1/oauth/authorize"


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _account_response(account: SchwabAccount, user: User) -> AccountResponse:
    return AccountResponse(
        id=account.id,
        account_number=account.account_number,
        account_name=account.account_name,
        account_type=account.account_type,
        rotation_state=account.rotation_state,
        enabled=account.enabled,
        min_order_value=account.min_order_value,
        remainder_symbol=account.remainder_symbol,
        last_run=account.last_run,
        created_at=account.created_at,
        connected=user.refresh_token_enc is not None,
    )


class _RedirectBody(BaseModel):
    redirect_url: str


async def _get_owned_account(account_id: int, user: User, db: AsyncSession) -> SchwabAccount:
    result = await db.execute(select(SchwabAccount).where(SchwabAccount.id == account_id))
    account = result.scalar_one_or_none()
    if account is None or account.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


# ------------------------------------------------------------------
# Accounts CRUD
# ------------------------------------------------------------------

@router.get("/accounts", response_model=List[AccountResponse])
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SchwabAccount).where(SchwabAccount.user_id == current_user.id)
    )
    return [_account_response(a, current_user) for a in result.scalars().all()]


@router.post("/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    body: AccountCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = SchwabAccount(
        user_id=current_user.id,
        account_number=body.account_number,
        account_name=body.account_name,
        account_type=body.account_type,
        min_order_value=body.min_order_value,
        remainder_symbol=body.remainder_symbol,
    )

    db.add(account)
    await db.commit()
    await db.refresh(account)
    return _account_response(account, current_user)


@router.put("/accounts/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    body: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_owned_account(account_id, current_user, db)

    if body.account_name is not None:
        account.account_name = body.account_name
    if body.account_type is not None:
        account.account_type = body.account_type
    if body.min_order_value is not None:
        account.min_order_value = body.min_order_value
    if body.remainder_symbol is not None:
        account.remainder_symbol = body.remainder_symbol
    if body.enabled is not None:
        account.enabled = body.enabled

    await db.commit()
    await db.refresh(account)
    return _account_response(account, current_user)


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_owned_account(account_id, current_user, db)
    await db.delete(account)
    await db.commit()


# ------------------------------------------------------------------
# Schwab OAuth
# ------------------------------------------------------------------

@router.get("/schwab/auth-url")
async def get_auth_url(
    current_user: User = Depends(get_current_user),
):
    if not current_user.app_key_enc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No Schwab credentials configured. Add App Key and Secret in Settings.")
    params = urlencode({
        "response_type": "code",
        "client_id": current_user.get_app_key(),
        "redirect_uri": _REDIRECT_URI,
    })
    return {"auth_url": f"{_SCHWAB_AUTH_URL}?{params}"}


@router.post("/schwab/connect")
async def connect_schwab(
    body: _RedirectBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    match = re.search(r"[?&]code=([^&]+)", body.redirect_url)
    if not match:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No auth code found in redirect URL")
    code = match.group(1)

    import httpx, base64
    app_key = current_user.get_app_key()
    app_secret = current_user.get_app_secret()
    basic = base64.b64encode(f"{app_key}:{app_secret}".encode()).decode()

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.schwabapi.com/v1/oauth/token",
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _REDIRECT_URI,
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Schwab token exchange failed: {resp.text}")

    token_data = resp.json()
    current_user.set_refresh_token(token_data["refresh_token"])
    await db.commit()

    # Auto-discover and sync all Schwab accounts
    client = SchwabClient(app_key=app_key, app_secret=app_secret, refresh_token=token_data["refresh_token"])
    try:
        access_token, new_refresh = await client.refresh_access_token()
        current_user.set_refresh_token(new_refresh)
        balances_data = await client.get_all_balances(access_token)
        for item in balances_data:
            acct = item.get("securitiesAccount", {})
            acc_num = acct.get("accountNumber")
            if not acc_num:
                continue
            existing = await db.execute(
                select(SchwabAccount).where(
                    SchwabAccount.user_id == current_user.id,
                    SchwabAccount.account_number == acc_num,
                )
            )
            if existing.scalar_one_or_none() is None:
                acc_type = acct.get("type", "").replace("_", " ").title()
                new_acct = SchwabAccount(
                    user_id=current_user.id,
                    account_number=acc_num,
                    account_name=f"{acc_type} ...{acc_num[-4:]}",
                    account_type=acct.get("type", "").lower(),
                )
                db.add(new_acct)
        await db.commit()
    except (SchwabAuthError, SchwabAPIError):
        pass  # token saved — account sync can be retried via /schwab/sync

    from backend.services.scheduler import register_token_refresh_job
    register_token_refresh_job(current_user.id)

    return {"success": True}


@router.post("/schwab/sync")
async def sync_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-sync accounts from Schwab — discovers any new accounts."""
    if not current_user.refresh_token_enc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Not connected to Schwab. Complete OAuth first.")
    client = SchwabClient(
        app_key=current_user.get_app_key(),
        app_secret=current_user.get_app_secret(),
        refresh_token=current_user.get_refresh_token(),
    )
    access_token, new_refresh = await client.refresh_access_token()
    current_user.set_refresh_token(new_refresh)
    balances_data = await client.get_all_balances(access_token)
    synced = 0
    for item in balances_data:
        acct = item.get("securitiesAccount", {})
        acc_num = acct.get("accountNumber")
        if not acc_num:
            continue
        existing = await db.execute(
            select(SchwabAccount).where(
                SchwabAccount.user_id == current_user.id,
                SchwabAccount.account_number == acc_num,
            )
        )
        if existing.scalar_one_or_none() is None:
            acc_type = acct.get("type", "").replace("_", " ").title()
            new_acct = SchwabAccount(
                user_id=current_user.id,
                account_number=acc_num,
                account_name=f"{acc_type} ...{acc_num[-4:]}",
                account_type=acct.get("type", "").lower(),
            )
            db.add(new_acct)
            synced += 1
    await db.commit()
    return {"synced": synced}


def _parse_balance(data: list, account_number: str) -> dict:
    for item in data:
        acct = item.get("securitiesAccount", {})
        if acct.get("accountNumber") == account_number:
            bal = acct.get("currentBalances", {})
            total = float(bal.get("liquidationValue", 0))
            cash = float(bal.get("cashAvailableForTrading", 0))
            invested = max(0.0, total - cash)
            return {"total_value": total, "cash": cash, "invested": invested}
    return {"total_value": None, "cash": None, "invested": None}


@router.get("/schwab/balances")
async def get_balances(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SchwabAccount).where(SchwabAccount.user_id == current_user.id)
    )
    accounts = result.scalars().all()

    connected = current_user.refresh_token_enc is not None

    balances = []
    for account in accounts:
        if not account.enabled:
            balances.append({
                "account_id": account.id,
                "account_name": account.account_name,
                "account_number": account.account_number,
                "connected": connected,
                "enabled": False,
            })
            continue
        if not connected:
            balances.append({
                "account_id": account.id,
                "account_name": account.account_name,
                "account_number": account.account_number,
                "connected": False,
                "enabled": True,
            })
            continue
        client = SchwabClient(
            app_key=current_user.get_app_key(),
            app_secret=current_user.get_app_secret(),
            refresh_token=current_user.get_refresh_token(),
        )
        try:
            access_token, new_refresh = await client.refresh_access_token()
            current_user.set_refresh_token(new_refresh)
            await db.commit()

            account_data = await client.get_all_balances(access_token)
            parsed = _parse_balance(account_data, account.account_number)
            balances.append({
                "account_id": account.id,
                "account_name": account.account_name,
                "account_number": account.account_number,
                "connected": True,
                "enabled": account.enabled,
                **parsed,
            })
        except (SchwabAuthError, SchwabAPIError) as e:
            balances.append({
                "account_id": account.id,
                "account_name": account.account_name,
                "account_number": account.account_number,
                "connected": False,
                "enabled": account.enabled,
                "error": str(e),
            })

    return balances


# ------------------------------------------------------------------
# Allocations
# ------------------------------------------------------------------

@router.get("/accounts/{account_id}/allocations", response_model=List[AllocationOut])
async def get_allocations(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_account(account_id, current_user, db)
    result = await db.execute(
        select(Allocation)
        .where(Allocation.account_id == account_id)
        .order_by(Allocation.display_order)
    )
    return result.scalars().all()


@router.put("/accounts/{account_id}/allocations", response_model=List[AllocationOut])
async def set_allocations(
    account_id: int,
    body: List[AllocationIn],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_owned_account(account_id, current_user, db)

    if not body:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Allocations cannot be empty")

    symbol_re = re.compile(r"^[A-Z]{1,10}$")
    for item in body:
        if not symbol_re.match(item.symbol):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid symbol '{item.symbol}' — must be 1–10 uppercase letters",
            )

    total = sum(item.target_pct for item in body)
    if abs(total - 100.0) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Allocations must sum to 100.0 (got {total:.2f})",
        )

    # Atomic delete + insert
    await db.execute(delete(Allocation).where(Allocation.account_id == account_id))
    new_allocations = [
        Allocation(
            account_id=account_id,
            symbol=item.symbol,
            target_pct=item.target_pct,
            display_order=item.display_order,
        )
        for item in body
    ]
    db.add_all(new_allocations)
    await db.commit()

    result = await db.execute(
        select(Allocation)
        .where(Allocation.account_id == account_id)
        .order_by(Allocation.display_order)
    )
    return result.scalars().all()
