#!/usr/bin/env python3
"""
Seed / teardown Dynamic Allocation Test schedules (KAN-51 testing).

Writes directly to the SQLite database — no login or credentials required.
Run from the hyeyield/ directory (where hyeyield.db lives):

    # Create all 12 test schedules
    python scripts/seed_test_schedules.py

    # Delete all test schedules
    python scripts/seed_test_schedules.py --teardown
"""

import argparse
import asyncio
import sys
from datetime import date
from pathlib import Path

# Allow importing backend modules when run from the hyeyield/ directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.models.schedule import Schedule
from backend.models.schedule_allocation import ScheduleAllocation
from backend.models.schwab_account import SchwabAccount
from backend.models.user import User

# ---------------------------------------------------------------------------
# Database — same SQLite file the app uses
# ---------------------------------------------------------------------------
DB_PATH = Path(__file__).resolve().parent.parent / "hyeyield.db"
engine = create_async_engine(f"sqlite+aiosqlite:///{DB_PATH}", echo=False)
AsyncSessionLocal = sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

# ---------------------------------------------------------------------------
# Test-case definitions
# ---------------------------------------------------------------------------
TEST_CASES = [
    {"n": 1,  "allocations": [("IAU", 80),    ("SPUS", 10),   ("VDE", 10)]},
    {"n": 2,  "allocations": [("F", 50),      ("NOK", 50)]},
    {"n": 3,  "allocations": [("F", 33.33),   ("NOK", 33.33), ("OPEN", 33.34)]},
    {"n": 4,  "allocations": [("GRAB", 100)]},
    {"n": 5,  "allocations": [("BRK.A", 100)]},
    {"n": 6,  "allocations": [("BRK.A", 50),  ("SNAP", 50)]},
    {"n": 7,  "allocations": [("SNAP", 30),   ("GRAB", 30),   ("OPEN", 40)]},
    {"n": 8,  "allocations": [("SNAP", 25),   ("NOK", 25),    ("GRAB", 25),  ("OPEN", 25)]},
    {"n": 9,  "allocations": [("SPY", 50),    ("QQQ", 50)]},
    {"n": 10, "allocations": [("AMZN", 60),   ("NVDA", 40)]},
    {"n": 11, "allocations": [("VOO", 34),    ("IWM", 33),    ("BND", 33)]},
    {"n": 12, "allocations": [("IAU", 80),    ("SPUS", 10),   ("VDE", 10)]},
]

SCHEDULE_NAME_PREFIX = "Dynamic Allocation Test"
ACCOUNT_SUFFIX = "036"
END_DATE = date(2026, 4, 6)


async def find_account(db: AsyncSession) -> SchwabAccount:
    result = await db.execute(select(SchwabAccount))
    accounts = result.scalars().all()
    for acct in accounts:
        if str(acct.account_number).endswith(ACCOUNT_SUFFIX):
            return acct
    numbers = [acct.account_number for acct in accounts]
    print(f"ERROR: No account ending in ...{ACCOUNT_SUFFIX} found. Available: {numbers}", file=sys.stderr)
    sys.exit(1)


async def find_user(db: AsyncSession, account: SchwabAccount) -> User:
    result = await db.execute(select(User).where(User.id == account.user_id))
    return result.scalar_one()


async def seed(db: AsyncSession):
    account = await find_account(db)
    user = await find_user(db, account)
    print(f"Account: {account.account_name} ...{ACCOUNT_SUFFIX}  (user_id={user.id})")
    print(f"Creating {len(TEST_CASES)} test schedules...\n")

    for tc in TEST_CASES:
        schedule = Schedule(
            user_id=user.id,
            account_id=account.id,
            name=f"{SCHEDULE_NAME_PREFIX} #{tc['n']}",
            is_test=True,
            frequency="weekly",
            day_of_week=3,   # Thursday (0=Mon … 6=Sun)
            hour=22,         # 10 PM
            minute=0,
            timezone="America/Chicago",
            end_date=END_DATE,
            enabled=True,
        )
        db.add(schedule)
        await db.flush()  # get schedule.id

        for idx, (symbol, pct) in enumerate(tc["allocations"]):
            db.add(ScheduleAllocation(
                schedule_id=schedule.id,
                symbol=symbol.upper(),
                target_pct=pct,
                display_order=idx,
            ))

        alloc_str = ", ".join(f"{sym} {pct}%" for sym, pct in tc["allocations"])
        print(f"  [OK] #{tc['n']:>2}  id={schedule.id:<6} {schedule.name}  [{alloc_str}]")

    await db.commit()
    print(f"\nDone. {len(TEST_CASES)} schedules created.")
    print("Run with --teardown to remove them all.")


async def teardown(db: AsyncSession):
    result = await db.execute(
        select(Schedule).where(Schedule.name.startswith(SCHEDULE_NAME_PREFIX))
    )
    targets = result.scalars().all()

    if not targets:
        print("No test schedules found — nothing to delete.")
        return

    print(f"Deleting {len(targets)} test schedule(s)...\n")
    for s in targets:
        await db.execute(
            delete(ScheduleAllocation).where(ScheduleAllocation.schedule_id == s.id)
        )
        await db.delete(s)
        print(f"  [DELETED] id={s.id:<6} {s.name}")

    await db.commit()
    print("\nDone.")


async def main():
    parser = argparse.ArgumentParser(description="Seed or teardown Dynamic Allocation Test schedules.")
    parser.add_argument("--teardown", action="store_true", help="Delete all test schedules.")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        if args.teardown:
            await teardown(db)
        else:
            await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
