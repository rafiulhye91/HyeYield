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
# Token keep-alive job
# ------------------------------------------------------------------

async def refresh_tokens_job(user_id: int) -> None:
    """Refresh Schwab tokens for all connected accounts. Runs every 5 days."""
    from sqlalchemy import select
    from backend.models.schwab_account import SchwabAccount
    from backend.models.trade_log import TradeLog
    from backend.models.user import User
    from backend.services.schwab_client import SchwabAuthError, SchwabClient
    from backend.services.notify import send_notify

    logger.info("Token refresh job firing for user_id=%d", user_id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SchwabAccount).where(
                SchwabAccount.user_id == user_id,
                SchwabAccount.refresh_token_enc.isnot(None),
                SchwabAccount.enabled == True,
            )
        )
        accounts = result.scalars().all()

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()

        for account in accounts:
            client = SchwabClient(
                app_key=account.get_app_key(),
                app_secret=account.get_app_secret(),
                refresh_token=account.get_refresh_token(),
            )
            try:
                _, new_refresh = await client.refresh_access_token()
                account.set_refresh_token(new_refresh)
                await db.commit()
                logger.info("Token refreshed for account_id=%d", account.id)
            except SchwabAuthError as e:
                logger.error("Token refresh FAILED for account_id=%d: %s", account.id, e)
                log = TradeLog(
                    user_id=user_id,
                    account_id=account.id,
                    symbol="N/A",
                    status="FAILED",
                    message=f"TOKEN_REFRESH failed: {e}",
                    dry_run=False,
                )
                db.add(log)
                await db.commit()
                if user and user.ntfy_topic:
                    await send_notify(
                        user.ntfy_topic,
                        "Hye-Yield: Token Expired",
                        f"Account '{account.account_name}' needs to be re-connected to Schwab.",
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
                register_token_refresh_job(user.id)
            except Exception as e:
                logger.error("Failed to register job for user_id=%d: %s", user.id, e)

    logger.info("Scheduler startup complete — %d job(s) registered", len(scheduler.get_jobs()))
