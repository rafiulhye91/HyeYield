import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

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
# Startup loader
# ------------------------------------------------------------------

async def load_all_jobs() -> None:
    """Register invest jobs for all users on startup."""
    from sqlalchemy import select
    from backend.models.user import User

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        users = result.scalars().all()
        for user in users:
            try:
                register_invest_job(user.id, user.schedule_cron)
            except Exception as e:
                logger.error("Failed to register job for user_id=%d: %s", user.id, e)

    logger.info("Scheduler startup complete — %d job(s) registered", len(scheduler.get_jobs()))
