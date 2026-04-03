import logging
from datetime import date, datetime, timedelta

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="America/New_York")

SCHWAB_REFRESH_TOKEN_TTL_DAYS = 7


def _acct_short(account_name: str, account_number: str) -> str:
    return f"{account_name} ...{str(account_number)[-3:]}"


def _short_reason(msg: str) -> str:
    """Condense a verbose order message into a short human-readable reason."""
    if not msg:
        return "unknown"
    m = msg.lower()
    if "insufficient" in m:
        return "insufficient cash"
    if "market closed" in m:
        return "market closed"
    if "token" in m and "expired" in m:
        return "token expired"
    return msg[:40] if len(msg) > 40 else msg


def _build_invest_notification(result, schedule_name: str):
    """Return (title, body) for an invest run result."""
    acct = _acct_short(result.account_name, result.account_number)

    if result.error:
        title = "🔴 Hye-Yield — Invest run failed"
        body = f"{acct} · {schedule_name}\nError: {result.error}"
        return title, body

    filled  = [o for o in result.orders if o.status in ("FILLED", "WORKING", "DRY_RUN")]
    skipped = [o for o in result.orders if o.status not in ("FILLED", "WORKING", "DRY_RUN")]
    has_partial = bool(skipped) and bool(filled)
    all_failed  = bool(skipped) and not bool(filled)

    if all_failed:
        title = "🔴 Hye-Yield — Invest run failed"
        parts = [f"{o.symbol} — ({_short_reason(o.message)})" for o in result.orders]
        body = f"{acct} · {schedule_name}\n{'  '.join(parts)}\n$0.00 invested"
        return title, body

    # Build per-order summary (SPUS ×22 ✓  IAU — (insufficient cash))
    parts = []
    for o in result.orders:
        if o.status in ("FILLED", "WORKING", "DRY_RUN"):
            parts.append(f"{o.symbol} ×{o.shares} ✓")
        else:
            parts.append(f"{o.symbol} — ({_short_reason(o.message)})")
    order_line = "  ".join(parts)

    if has_partial:
        title = "⚠️ Hye-Yield — Partial fill"
        body = (
            f"{acct} · {schedule_name}\n"
            f"{order_line}\n"
            f"${result.total_invested:.2f} of ~${result.cash_before:.2f} invested"
        )
    else:
        title = "✅ Hye-Yield — Invest complete"
        body = f"{acct} · {schedule_name}\n{order_line}\n${result.total_invested:.2f} invested"

    return title, body


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

        # Capture before engine runs — commits inside the engine expire session objects.
        ntfy_topic = user.ntfy_topic

        engine = InvestEngine(db=db, user_id=user_id)
        results = await engine.run_all(dry_run=False)

        if ntfy_topic:
            for r in results:
                title, body = _build_invest_notification(r, r.account_name)
                await send_notify(ntfy_topic, title, body)


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
    from datetime import datetime, timedelta
    from sqlalchemy import select
    from backend.models.schwab_account import SchwabAccount
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

        # Proactive "expiring soon" warning if token is within 2 days of expiry
        if user.ntfy_topic and user.refresh_token_obtained_at:
            expiry = user.refresh_token_obtained_at + timedelta(days=SCHWAB_REFRESH_TOKEN_TTL_DAYS)
            days_left = (expiry - datetime.utcnow()).days
            if days_left <= 2:
                accts_res = await db.execute(
                    select(SchwabAccount).where(SchwabAccount.user_id == user_id)
                )
                accts = accts_res.scalars().all()
                for acct in accts:
                    acct_label = _acct_short(acct.account_name, acct.account_number)
                    await send_notify(
                        user.ntfy_topic,
                        "⏰ Hye-Yield — Token expiring soon",
                        f"{acct_label} · Schwab token expires in {max(days_left, 0)} day{'s' if days_left != 1 else ''}",
                    )

        client = SchwabClient(
            app_key=user.get_app_key(),
            app_secret=user.get_app_secret(),
            refresh_token=user.get_refresh_token(),
        )
        try:
            _, new_refresh = await client.refresh_access_token()
            user.set_refresh_token(new_refresh)
            user.refresh_token_obtained_at = datetime.utcnow()
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
                accts_res = await db.execute(
                    select(SchwabAccount).where(SchwabAccount.user_id == user_id)
                )
                accts = accts_res.scalars().all()
                for acct in accts:
                    acct_label = _acct_short(acct.account_name, acct.account_number)
                    await send_notify(
                        user.ntfy_topic,
                        "🔴 Hye-Yield — Invest run failed",
                        f"{acct_label}\nError: Schwab token expired",
                    )


def register_token_refresh_job(user_id: int, refresh_token_obtained_at: datetime | None = None) -> None:
    """Add or replace the 5-day token refresh job for a user.

    When refresh_token_obtained_at is provided (e.g. on startup), start_date is
    anchored to token age so a server restart doesn't reset the countdown.
    """
    job_id = f"token_refresh_{user_id}"

    start_date = None
    if refresh_token_obtained_at is not None:
        start_date = refresh_token_obtained_at + timedelta(days=5)
        if start_date < datetime.utcnow():
            # Token is overdue for a refresh — fire as soon as possible
            start_date = datetime.utcnow()

    scheduler.add_job(
        refresh_tokens_job,
        trigger="interval",
        id=job_id,
        kwargs={"user_id": user_id},
        days=5,
        start_date=start_date,
        replace_existing=True,
    )
    logger.info("Registered token refresh job '%s' (start_date=%s)", job_id, start_date)


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

        if schedule.end_date and date.today() >= schedule.end_date:
            logger.info("schedule_id=%d past end_date %s, pausing", schedule_id, schedule.end_date)
            schedule.enabled = False
            schedule.paused_by_end_date = True
            await db.commit()
            remove_schedule_job(schedule_id)
            return

        user_res = await db.execute(select(User).where(User.id == schedule.user_id))
        user = user_res.scalar_one_or_none()
        if not user:
            return

        # Capture before engine runs — db.commit() inside the engine expires all
        # session objects, making attribute access raise MissingGreenlet in async mode.
        ntfy_topic = user.ntfy_topic
        schedule_name = schedule.name
        user_id = schedule.user_id

        import asyncio
        from backend.services.sse import notify_user

        engine = InvestEngine(db=db, user_id=user_id)
        notify_tasks = []
        try:
            result = await engine.run_account(schedule.account_id, dry_run=schedule.is_test, schedule_id=schedule.id, schedule_name=schedule.name)

            if ntfy_topic:
                sched_name = schedule_name or _acct_short(result.account_name, result.account_number)
                title, body = _build_invest_notification(result, sched_name)
                notify_tasks.append(send_notify(ntfy_topic, title, body))
        except Exception as e:
            logger.error("Unexpected error running schedule_id=%d: %s", schedule_id, e, exc_info=True)
            if ntfy_topic:
                notify_tasks.append(send_notify(ntfy_topic, "🔴 Hye-Yield — Invest run failed", f"{schedule_name}\nUnexpected error: {e}"))
        finally:
            # Fire SSE and ntfy concurrently — ntfy.sh can take 20-25 s to return an
            # HTTP response even though it pushes the notification immediately; running
            # both in parallel means the dashboard refreshes as soon as the engine
            # finishes rather than waiting for the slow ntfy round-trip.
            notify_tasks.append(notify_user(user_id, {"type": "schedule_ran", "schedule_id": schedule_id}))
            await asyncio.gather(*notify_tasks, return_exceptions=True)


def _build_cron_trigger(schedule) -> CronTrigger:
    tz = pytz.timezone(schedule.timezone)
    f = schedule.frequency
    h, m = schedule.hour, schedule.minute
    if f == "weekly":
        return CronTrigger(day_of_week=schedule.day_of_week, hour=h, minute=m, timezone=tz)
    if f == "biweekly_1_15":
        return CronTrigger(day="1,15", hour=h, minute=m, timezone=tz)
    if f == "biweekly_alternating":
        # Anchor the every-other-week pattern to the schedule's first run date so
        # the parity matches what the user expects rather than being fixed to ISO
        # odd weeks (1, 3, 5 …) which is what the bare "*/2" expression produces.
        from datetime import timedelta as _td
        created = schedule.created_at.date() if hasattr(schedule.created_at, 'date') else date.today()
        # backend day_of_week 0=Mon…4=Fri → ISO isoweekday 1=Mon…5=Fri
        target_isowd = (schedule.day_of_week or 0) + 1
        delta = (target_isowd - created.isoweekday()) % 7
        first_run = created + _td(days=delta)
        iso_week = first_run.isocalendar()[1]
        # "*/2" fires on odd ISO weeks (1,3,5…); "2/2" fires on even ISO weeks (2,4,6…)
        week_expr = "*/2" if iso_week % 2 == 1 else "2/2"
        return CronTrigger(day_of_week=schedule.day_of_week, week=week_expr, hour=h, minute=m, timezone=tz)
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
# Expired-schedule sweeper
# ------------------------------------------------------------------

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
                register_token_refresh_job(user.id, user.refresh_token_obtained_at)
            except Exception as e:
                logger.error("Failed to register token refresh job for user_id=%d: %s", user.id, e)

        sched_result = await db.execute(select(Schedule).where(Schedule.enabled == True))
        schedules = sched_result.scalars().all()
        for s in schedules:
            try:
                register_schedule_job(s)
            except Exception as e:
                logger.error("Failed to register schedule_id=%d: %s", s.id, e)


    logger.info("Scheduler startup complete — %d job(s) registered", len(scheduler.get_jobs()))
