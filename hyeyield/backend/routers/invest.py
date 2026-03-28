import dataclasses
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.schwab_account import SchwabAccount
from backend.models.trade_log import TradeLog
from backend.models.user import User
from backend.services.invest_engine import InvestEngine
from backend.services.notify import send_notify
from backend.utils.jwt_utils import get_current_user

router = APIRouter(tags=["invest"])


# ------------------------------------------------------------------
# Dry-run
# ------------------------------------------------------------------

@router.post("/invest/dry-run")
async def dry_run(
    account_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    engine = InvestEngine(db=db, user_id=current_user.id)
    if account_id:
        result = await engine.run_account(account_id, dry_run=True)
        return dataclasses.asdict(result)
    results = await engine.run_all(dry_run=True)
    return [dataclasses.asdict(r) for r in results]


# ------------------------------------------------------------------
# Live invest
# ------------------------------------------------------------------

@router.post("/invest/live")
async def live_invest(
    account_id: Optional[int] = None,
    x_confirm_live: Optional[str] = Header(default=None, alias="X-Confirm-Live"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if x_confirm_live != "true":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required header: X-Confirm-Live: true",
        )

    engine = InvestEngine(db=db, user_id=current_user.id)
    if account_id:
        result = await engine.run_account(account_id, dry_run=False)
        results = [result]
    else:
        results = await engine.run_all(dry_run=False)

    # Send ntfy notification
    if current_user.ntfy_topic:
        summary = _build_notify_summary(results)
        await send_notify(current_user.ntfy_topic, "Hye-Yield: Investment Complete", summary)

    return [dataclasses.asdict(r) for r in results]


# ------------------------------------------------------------------
# Rotation
# ------------------------------------------------------------------

@router.get("/invest/rotation")
async def get_rotation(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(SchwabAccount)
        .options(selectinload(SchwabAccount.allocations))
        .where(SchwabAccount.user_id == current_user.id)
    )
    accounts = result.scalars().all()
    rotation_info = []
    for acct in accounts:
        allocs = sorted(acct.allocations, key=lambda a: a.display_order)
        n = len(allocs)
        if n == 0:
            next_order = []
        else:
            rotation = acct.rotation_state % n
            next_order = [a.symbol for a in allocs[rotation:]] + [a.symbol for a in allocs[:rotation]]
        rotation_info.append({
            "account_id": acct.id,
            "account_name": acct.account_name,
            "rotation_state": acct.rotation_state,
            "next_order": next_order,
        })
    return rotation_info


@router.post("/invest/rotation/reset")
async def reset_rotation(
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SchwabAccount).where(
            SchwabAccount.id == account_id,
            SchwabAccount.user_id == current_user.id,
        )
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    account.rotation_state = 0
    await db.commit()
    return {"account_id": account_id, "rotation_state": 0}


# ------------------------------------------------------------------
# Logs
# ------------------------------------------------------------------

@router.get("/logs")
async def get_logs(
    account_id: Optional[int] = Query(default=None),
    dry_run: Optional[bool] = Query(default=None),
    symbol: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func, and_
    from datetime import datetime, timezone

    base = select(TradeLog).where(TradeLog.user_id == current_user.id)
    if account_id is not None:
        base = base.where(TradeLog.account_id == account_id)
    if dry_run is not None:
        base = base.where(TradeLog.dry_run == dry_run)
    if symbol is not None:
        base = base.where(TradeLog.symbol == symbol.upper())
    if status_filter:
        base = base.where(TradeLog.status == status_filter.upper())
    if date_from:
        base = base.where(TradeLog.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        base = base.where(TradeLog.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))

    # Total count
    count_res = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_res.scalar()

    query = base.order_by(TradeLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    logs = result.scalars().all()

    # Fetch account info for all logs in one query
    account_ids = list({log.account_id for log in logs if log.account_id})
    acct_map = {}
    if account_ids:
        accts_res = await db.execute(select(SchwabAccount).where(SchwabAccount.id.in_(account_ids)))
        acct_map = {a.id: a for a in accts_res.scalars().all()}

    items = [
        {
            "id": log.id,
            "account_id": log.account_id,
            "account_name": acct_map[log.account_id].account_name if log.account_id in acct_map else None,
            "account_number": acct_map[log.account_id].account_number if log.account_id in acct_map else None,
            "symbol": log.symbol,
            "shares": log.shares,
            "price": log.price,
            "amount": log.amount,
            "status": log.status,
            "message": log.message,
            "dry_run": log.dry_run,
            "created_at": log.created_at.isoformat() + "Z",
        }
        for log in logs
    ]
    return {"items": items, "total": total, "page": page, "per_page": per_page}


# ------------------------------------------------------------------
# Schedule
# ------------------------------------------------------------------

from pydantic import BaseModel

class ScheduleUpdate(BaseModel):
    cron: str


@router.get("/invest/schedule")
async def get_schedule(
    current_user: User = Depends(get_current_user),
):
    from backend.services.scheduler import scheduler
    job = scheduler.get_job(f"invest_{current_user.id}")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
    return {
        "schedule_cron": current_user.schedule_cron,
        "next_run": next_run,
    }


@router.put("/invest/schedule")
async def update_schedule(
    body: ScheduleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from backend.services.scheduler import register_invest_job, scheduler

    parts = body.cron.strip().split()
    if len(parts) != 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="cron must be a 5-field expression (e.g. '35 9 1,15 * *')",
        )

    try:
        register_invest_job(current_user.id, body.cron)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    current_user.schedule_cron = body.cron
    await db.commit()

    job = scheduler.get_job(f"invest_{current_user.id}")
    next_run = job.next_run_time.isoformat() if job and job.next_run_time else None
    return {"schedule_cron": body.cron, "next_run": next_run}


# ------------------------------------------------------------------
# Helper
# ------------------------------------------------------------------

def _build_notify_summary(results) -> str:
    lines = []
    for r in results:
        if r.error:
            lines.append(f"{r.account_name}: ERROR — {r.error}")
        else:
            lines.append(f"{r.account_name}: ${r.total_invested:.2f} invested across {len(r.orders)} orders")
    return "\n".join(lines) if lines else "No accounts processed"
