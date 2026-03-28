from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.allocation import Allocation
from backend.models.schedule import Schedule
from backend.models.schwab_account import SchwabAccount
from backend.utils.jwt_utils import get_current_user
from backend.models.user import User

router = APIRouter(tags=["schedules"])


class AllocationIn(BaseModel):
    symbol: str
    pct: float


class ScheduleCreate(BaseModel):
    account_id: int
    is_test: bool = False
    frequency: str           # weekly | biweekly_1_15 | biweekly_alternating | monthly
    day_of_week: Optional[int] = None   # 0=Mon…4=Fri
    day_of_month: Optional[int] = None  # 1–28
    hour: int = 9
    minute: int = 35
    timezone: str = "America/Chicago"
    allocations: List[AllocationIn]


def _next_run(schedule: Schedule):
    from backend.services.scheduler import scheduler
    job = scheduler.get_job(f"schedule_{schedule.id}")
    return job.next_run_time.isoformat() if job and job.next_run_time else None


def _schedule_out(schedule: Schedule, account: SchwabAccount, allocations, next_run_time=None):
    return {
        "id": schedule.id,
        "account_id": schedule.account_id,
        "account_name": account.account_name,
        "account_number": account.account_number,
        "account_type": account.account_type,
        "is_test": schedule.is_test,
        "frequency": schedule.frequency,
        "day_of_week": schedule.day_of_week,
        "day_of_month": schedule.day_of_month,
        "hour": schedule.hour,
        "minute": schedule.minute,
        "timezone": schedule.timezone,
        "enabled": schedule.enabled,
        "allocations": [{"symbol": a.symbol, "pct": a.target_pct} for a in allocations],
        "next_run": next_run_time,
    }


@router.get("/schedules")
async def list_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Schedule).where(Schedule.user_id == current_user.id, Schedule.enabled == True)
    )
    schedules = result.scalars().all()
    out = []
    for s in schedules:
        acct_res = await db.execute(select(SchwabAccount).where(SchwabAccount.id == s.account_id))
        account = acct_res.scalar_one_or_none()
        if not account:
            continue
        alloc_res = await db.execute(
            select(Allocation).where(Allocation.account_id == s.account_id).order_by(Allocation.display_order)
        )
        allocs = alloc_res.scalars().all()
        out.append(_schedule_out(s, account, allocs, _next_run(s)))
    return out


@router.post("/schedules", status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ScheduleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from backend.services.scheduler import register_schedule_job

    # Validate account belongs to user
    acct_res = await db.execute(
        select(SchwabAccount).where(
            SchwabAccount.id == body.account_id,
            SchwabAccount.user_id == current_user.id,
        )
    )
    account = acct_res.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # Validate allocations sum to ~100%
    total = sum(a.pct for a in body.allocations)
    if abs(total - 100) > 0.5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Allocations must total 100% (got {total:.1f}%)",
        )

    # Remove existing schedule for this account (one per account)
    existing = await db.execute(
        select(Schedule).where(
            Schedule.user_id == current_user.id,
            Schedule.account_id == body.account_id,
        )
    )
    old = existing.scalar_one_or_none()
    if old:
        from backend.services.scheduler import remove_schedule_job
        remove_schedule_job(old.id)
        await db.delete(old)

    # Save schedule
    schedule = Schedule(
        user_id=current_user.id,
        account_id=body.account_id,
        is_test=body.is_test,
        frequency=body.frequency,
        day_of_week=body.day_of_week,
        day_of_month=body.day_of_month,
        hour=body.hour,
        minute=body.minute,
        timezone=body.timezone,
    )
    db.add(schedule)
    await db.flush()  # get schedule.id

    # Replace account allocations
    await db.execute(delete(Allocation).where(Allocation.account_id == body.account_id))
    for idx, a in enumerate(body.allocations):
        db.add(Allocation(
            account_id=body.account_id,
            symbol=a.symbol.upper(),
            target_pct=a.pct,
            display_order=idx,
        ))

    await db.commit()
    await db.refresh(schedule)

    register_schedule_job(schedule)

    alloc_res = await db.execute(
        select(Allocation).where(Allocation.account_id == body.account_id).order_by(Allocation.display_order)
    )
    allocs = alloc_res.scalars().all()
    return _schedule_out(schedule, account, allocs, _next_run(schedule))


@router.patch("/schedules/{schedule_id}/toggle")
async def toggle_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from backend.services.scheduler import register_schedule_job, remove_schedule_job

    result = await db.execute(
        select(Schedule).where(Schedule.id == schedule_id, Schedule.user_id == current_user.id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    schedule.enabled = not schedule.enabled
    await db.commit()
    await db.refresh(schedule)

    if schedule.enabled:
        register_schedule_job(schedule)
    else:
        remove_schedule_job(schedule_id)

    acct_res = await db.execute(select(SchwabAccount).where(SchwabAccount.id == schedule.account_id))
    account = acct_res.scalar_one_or_none()
    alloc_res = await db.execute(
        select(Allocation).where(Allocation.account_id == schedule.account_id).order_by(Allocation.display_order)
    )
    allocs = alloc_res.scalars().all()
    return _schedule_out(schedule, account, allocs, _next_run(schedule))


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from backend.services.scheduler import remove_schedule_job

    result = await db.execute(
        select(Schedule).where(Schedule.id == schedule_id, Schedule.user_id == current_user.id)
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    remove_schedule_job(schedule_id)
    await db.delete(schedule)
    await db.commit()
