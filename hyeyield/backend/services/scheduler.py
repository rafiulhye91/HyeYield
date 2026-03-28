import logging

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="America/New_York")


# ------------------------------------------------------------------
# Invest job
# ------------------------------------------------------------------

async def scheduled_invest(user_id: int) -> None:
    """Run all accounts for a user and send ntfy notification."""
    from backend.services.invest_engine import InvestEngine
    from backend.services.notify import send_notify
    from sqlalchemy import select
    from backend.models.user import User

    logger.info("Scheduled invest job firing for user_id=%d", user_id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            logger.warning("scheduled_invest: user_id=%d not found, skipping", user_id)
            return

        engine = InvestEngine(db=db, user_id=user_id)
        results = await engine.run_all(dry_run=False)

        if user.ntfy_topic:
            lines = []
            for r in results:
                if r.error:
                    lines.append(f"{r.account_name}: ERROR — {r.error}")
                else:
                    lines.append(f"{r.account_name}: ${r.total_invested:.2f} invested")
            summary = "\n".join(lines) if lines else "No accounts processed"
            await send_notify(user.ntfy_topic, "Hye-Yield: Scheduled Investment", summary)


def register_invest_job(user_id: int, cron_expr: str) -> None:
    """Add or replace the invest cron job for a user."""
    parts = cron_expr.split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: '{cron_expr}'")
    minute, hour, day, month, day_of_week = parts

    job_id = f"invest_{user_id}"
    scheduler.add_job(
        scheduled_invest,
        trigger="cron",
        id=job_id,
        kwargs={"user_id": user_id},
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info("Registered invest job '%s' with cron '%s'", job_id, cron_expr)


def remove_invest_job(user_id: int) -> None:
    job_id = f"invest_{user_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("Removed invest job '%s'", job_id)


# ------------------------------------------------------------------
# Token keep-alive job
# ------------------------------------------------------------------

async def refresh_tokens_job(user_id: int) -> None:
    """Refresh Schwab token for user. Runs every 5 days."""
    from sqlalchemy import select
    from backend.models.trade_log import TradeLog
    from backend.models.user import User
    from backend.services.schwab_client import SchwabAuthError, SchwabClient
    from backend.services.notify import send_notify

    logger.info("Token refresh job firing for user_id=%d", user_id)
    async with AsyncSessionLocal() as db:
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if user is None or not user.refresh_token_enc:
            logger.info("Token refresh skipped for user_id=%d (no token)", user_id)
            return

        client = SchwabClient(
            app_key=user.get_app_key(),
            app_secret=user.get_app_secret(),
            refresh_token=user.get_refresh_token(),
        )
        try:
            _, new_refresh = await client.refresh_access_token()
            user.set_refresh_token(new_refresh)
            await db.commit()
            logger.info("Token refreshed for user_id=%d", user_id)
        except SchwabAuthError as e:
            logger.error("Token refresh FAILED for user_id=%d: %s", user_id, e)
            log = TradeLog(
                user_id=user_id,
                account_id=None,
                symbol="N/A",
                status="FAILED",
                message=f"TOKEN_REFRESH failed: {e}",
                dry_run=False,
            )
            db.add(log)
            await db.commit()
            if user.ntfy_topic:
                await send_notify(
                    user.ntfy_topic,
                    "Hye-Yield: Token Expired",
                    "Your Schwab connection has expired. Please re-connect in the Accounts page.",
                )


def register_token_refresh_job(user_id: int) -> None:
    """Add or replace the 5-day token refresh job for a user."""
    job_id = f"token_refresh_{user_id}"
    scheduler.add_job(
        refresh_tokens_job,
        trigger="interval",
        id=job_id,
        kwargs={"user_id": user_id},
        days=5,
        replace_existing=True,
    )
    logger.info("Registered token refresh job '%s'", job_id)


def remove_token_refresh_job(user_id: int) -> None:
    job_id = f"token_refresh_{user_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("Removed token refresh job '%s'", job_id)


# ------------------------------------------------------------------
# Per-schedule jobs
# ------------------------------------------------------------------

async def scheduled_invest_schedule(schedule_id: int) -> None:
    """Run invest (or dry-run) for a specific schedule."""
    from sqlalchemy import select
    from backend.models.schedule import Schedule
    from backend.models.user import User
    from backend.services.invest_engine import InvestEngine
    from backend.services.notify import send_notify

    logger.info("Schedule job firing for schedule_id=%d", schedule_id)
    async with AsyncSessionLocal() as db:
        sched_res = await db.execute(select(Schedule).where(Schedule.id == schedule_id))
        schedule = sched_res.scalar_one_or_none()
        if not schedule or not schedule.enabled:
            logger.warning("schedule_id=%d not found or disabled, skipping", schedule_id)
            return

        user_res = await db.execute(select(User).where(User.id == schedule.user_id))
        user = user_res.scalar_one_or_none()
        if not user:
            return

        engine = InvestEngine(db=db, user_id=schedule.user_id)
        result = await engine.run_account(schedule.account_id, dry_run=schedule.is_test)

        if user.ntfy_topic:
            label = "Test Run" if schedule.is_test else "Investment"
            if result.error:
                msg = f"{result.account_name}: ERROR — {result.error}"
            else:
                msg = f"{result.account_name}: ${result.total_invested:.2f} {'simulated' if schedule.is_test else 'invested'}"
            await send_notify(user.ntfy_topic, f"HyeYield: Scheduled {label}", msg)


def _build_cron_trigger(schedule) -> CronTrigger:
    tz = pytz.timezone(schedule.timezone)
    f = schedule.frequency
    h, m = schedule.hour, schedule.minute
    if f == "weekly":
        return CronTrigger(day_of_week=schedule.day_of_week, hour=h, minute=m, timezone=tz)
    if f == "biweekly_1_15":
        return CronTrigger(day="1,15", hour=h, minute=m, timezone=tz)
    if f == "biweekly_alternating":
        return CronTrigger(day_of_week=schedule.day_of_week, week="*/2", hour=h, minute=m, timezone=tz)
    if f == "monthly":
        return CronTrigger(day=schedule.day_of_month, hour=h, minute=m, timezone=tz)
    raise ValueError(f"Unknown frequency: {f}")


def register_schedule_job(schedule) -> None:
    job_id = f"schedule_{schedule.id}"
    trigger = _build_cron_trigger(schedule)
    scheduler.add_job(
        scheduled_invest_schedule,
        trigger=trigger,
        id=job_id,
        kwargs={"schedule_id": schedule.id},
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info("Registered schedule job '%s'", job_id)


def remove_schedule_job(schedule_id: int) -> None:
    job_id = f"schedule_{schedule_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("Removed schedule job '%s'", job_id)


# ------------------------------------------------------------------
# Startup loader
# ------------------------------------------------------------------

async def load_all_jobs() -> None:
    """Register invest jobs for all users and all schedules on startup."""
    from sqlalchemy import select
    from backend.models.user import User
    from backend.models.schedule import Schedule

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        for user in users:
            try:
                register_invest_job(user.id, user.schedule_cron)
                register_token_refresh_job(user.id)
            except Exception as e:
                logger.error("Failed to register legacy job for user_id=%d: %s", user.id, e)

        sched_result = await db.execute(select(Schedule).where(Schedule.enabled == True))
        schedules = sched_result.scalars().all()
        for s in schedules:
            try:
                register_schedule_job(s)
            except Exception as e:
                logger.error("Failed to register schedule_id=%d: %s", s.id, e)

    logger.info("Scheduler startup complete — %d job(s) registered", len(scheduler.get_jobs()))
