from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.allocation import Allocation
from backend.models.schedule import Schedule
from backend.models.schedule_allocation import ScheduleAllocation
from backend.models.schwab_account import SchwabAccount
from backend.utils.jwt_utils import get_current_user
from backend.models.user import User

router = APIRouter(tags=["schedules"])


class AllocationIn(BaseModel):
    symbol: str
    pct: float


class ScheduleCreate(BaseModel):
    account_id: int
    name: str
    is_test: bool = False
    frequency: str           # weekly | biweekly_1_15 | biweekly_alternating | monthly
    day_of_week: Optional[int] = None   # 0=Mon…4=Fri
    day_of_month: Optional[int] = None  # 1–28
    hour: int = 9
    minute: int = 35
    timezone: str = "America/Chicago"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    allocations: List[AllocationIn]


def _next_run(schedule: Schedule):
    from backend.services.scheduler import scheduler
    job = scheduler.get_job(f"schedule_{schedule.id}")
    return job.next_run_time.isoformat() if job and job.next_run_time else None


def _schedule_out(schedule: Schedule, account: SchwabAccount, allocations, next_run_time=None):
    return {
        "id": schedule.id,
        "name": schedule.name,
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
        "paused_by_end_date": schedule.paused_by_end_date,
        "start_date": schedule.start_date.isoformat() if schedule.start_date else None,
        "end_date": schedule.end_date.isoformat() if schedule.end_date else None,
        "allocations": [{"symbol": a.symbol, "pct": a.target_pct} for a in allocations],
        "next_run": next_run_time,
    }


@router.get("/schedules")
async def list_schedules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from backend.services.scheduler import remove_schedule_job

    result = await db.execute(
        select(Schedule).where(Schedule.user_id == current_user.id)
    )
    schedules = result.scalars().all()

    # Pause any enabled schedules whose end_date has already passed.
    dirty = False
    for s in schedules:
        if s.enabled and s.end_date and date.today() >= s.end_date:
            s.enabled = False
            s.paused_by_end_date = True
            remove_schedule_job(s.id)
            dirty = True
    if dirty:
        await db.commit()

    out = []
    for s in schedules:
        acct_res = await db.execute(select(SchwabAccount).where(SchwabAccount.id == s.account_id))
        account = acct_res.scalar_one_or_none()
        if not account:
            continue
        alloc_res = await db.execute(
            select(ScheduleAllocation).where(ScheduleAllocation.schedule_id == s.id).order_by(ScheduleAllocation.display_order)
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

    # Save schedule
    schedule = Schedule(
        user_id=current_user.id,
        account_id=body.account_id,
        name=body.name,
        is_test=body.is_test,
        frequency=body.frequency,
        day_of_week=body.day_of_week,
        day_of_month=body.day_of_month,
        hour=body.hour,
        minute=body.minute,
        timezone=body.timezone,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(schedule)
    await db.flush()  # get schedule.id

    for idx, a in enumerate(body.allocations):
        db.add(ScheduleAllocation(
            schedule_id=schedule.id,
            symbol=a.symbol.upper(),
            target_pct=a.pct,
            display_order=idx,
        ))

    await db.commit()
    await db.refresh(schedule)

    register_schedule_job(schedule)

    alloc_res = await db.execute(
        select(ScheduleAllocation).where(ScheduleAllocation.schedule_id == schedule.id).order_by(ScheduleAllocation.display_order)
    )
    allocs = alloc_res.scalars().all()
    return _schedule_out(schedule, account, allocs, _next_run(schedule))


@router.put("/schedules/{schedule_id}")
async def update_schedule(
    schedule_id: int,
    body: ScheduleCreate,
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

    acct_res = await db.execute(
        select(SchwabAccount).where(SchwabAccount.id == body.account_id, SchwabAccount.user_id == current_user.id)
    )
    account = acct_res.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    total = sum(a.pct for a in body.allocations)
    if abs(total - 100) > 0.5:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Allocations must total 100% (got {total:.1f}%)")

    schedule.account_id = body.account_id
    schedule.name = body.name
    schedule.is_test = body.is_test
    schedule.frequency = body.frequency
    schedule.day_of_week = body.day_of_week
    schedule.day_of_month = body.day_of_month
    schedule.hour = body.hour
    schedule.minute = body.minute
    schedule.timezone = body.timezone
    schedule.start_date = body.start_date
    schedule.end_date = body.end_date

    # Auto-resume if the schedule was paused because its end date expired
    # and the user has now set a future (or no) end date.
    if schedule.paused_by_end_date and (body.end_date is None or body.end_date > date.today()):
        schedule.enabled = True
        schedule.paused_by_end_date = False

    await db.execute(delete(ScheduleAllocation).where(ScheduleAllocation.schedule_id == schedule.id))
    for idx, a in enumerate(body.allocations):
        db.add(ScheduleAllocation(schedule_id=schedule.id, symbol=a.symbol.upper(), target_pct=a.pct, display_order=idx))

    await db.commit()
    await db.refresh(schedule)

    remove_schedule_job(schedule_id)
    if schedule.enabled:
        register_schedule_job(schedule)

    alloc_res = await db.execute(
        select(ScheduleAllocation).where(ScheduleAllocation.schedule_id == schedule.id).order_by(ScheduleAllocation.display_order)
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
        select(ScheduleAllocation).where(ScheduleAllocation.schedule_id == schedule.id).order_by(ScheduleAllocation.display_order)
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
