#!/usr/bin/env python3
"""
Seed / teardown Dynamic Allocation Test schedules (KAN-51 testing).

Usage:
    # Create all 12 test schedules
    python scripts/seed_test_schedules.py

    # Delete all test schedules whose name starts with "Dynamic Allocation Test"
    python scripts/seed_test_schedules.py --teardown

Environment variables (or pass as args):
    API_BASE_URL   e.g. http://localhost:8000          (default: http://localhost:8000)
    API_USERNAME   your login username
    API_PASSWORD   your login password
"""

import argparse
import os
import sys
import requests

# ---------------------------------------------------------------------------
# Test-case definitions
# ---------------------------------------------------------------------------
TEST_CASES = [
    {"n": 1,  "allocations": [("IAU", 80), ("SPUS", 10), ("VDE", 10)]},
    {"n": 2,  "allocations": [("F", 50), ("NOK", 50)]},
    {"n": 3,  "allocations": [("F", 33.33), ("NOK", 33.33), ("OPEN", 33.34)]},
    {"n": 4,  "allocations": [("GRAB", 100)]},
    {"n": 5,  "allocations": [("BRK.A", 100)]},
    {"n": 6,  "allocations": [("BRK.A", 50), ("SNAP", 50)]},
    {"n": 7,  "allocations": [("SNAP", 30), ("GRAB", 30), ("OPEN", 40)]},
    {"n": 8,  "allocations": [("SNAP", 25), ("NOK", 25), ("GRAB", 25), ("OPEN", 25)]},
    {"n": 9,  "allocations": [("SPY", 50), ("QQQ", 50)]},
    {"n": 10, "allocations": [("AMZN", 60), ("NVDA", 40)]},
    {"n": 11, "allocations": [("VOO", 34), ("IWM", 33), ("BND", 33)]},
    {"n": 12, "allocations": [("IAU", 80), ("SPUS", 10), ("VDE", 10)]},
]

SCHEDULE_NAME_PREFIX = "Dynamic Allocation Test"

# Thursday = day_of_week 3 (0=Mon…6=Sun, APScheduler convention matches Python weekday)
COMMON = {
    "frequency": "weekly",
    "day_of_week": 3,   # Thursday
    "hour": 22,         # 10 PM
    "minute": 0,
    "timezone": "America/Chicago",
    "end_date": "2026-04-06",
    "is_test": True,
}


def env(key, default=None):
    val = os.environ.get(key, default)
    if val is None:
        print(f"ERROR: environment variable {key} is required.", file=sys.stderr)
        sys.exit(1)
    return val


def login(base_url, username, password) -> str:
    r = requests.post(f"{base_url}/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def get_account_id(base_url, token, suffix="036") -> int:
    r = requests.get(f"{base_url}/accounts", headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    accounts = r.json()
    for acct in accounts:
        if str(acct.get("account_number", "")).endswith(suffix):
            return acct["id"]
    numbers = [acct.get("account_number", "?") for acct in accounts]
    print(f"ERROR: No account ending in ...{suffix} found. Available: {numbers}", file=sys.stderr)
    sys.exit(1)


def list_schedules(base_url, token) -> list:
    r = requests.get(f"{base_url}/schedules", headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json()


def create_schedule(base_url, token, account_id, test_case) -> dict:
    payload = {
        **COMMON,
        "account_id": account_id,
        "name": f"{SCHEDULE_NAME_PREFIX} #{test_case['n']}",
        "allocations": [{"symbol": sym, "pct": pct} for sym, pct in test_case["allocations"]],
    }
    r = requests.post(f"{base_url}/schedules", json=payload, headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    return r.json()


def delete_schedule(base_url, token, schedule_id) -> None:
    r = requests.delete(f"{base_url}/schedules/{schedule_id}", headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()


def seed(base_url, token, account_id):
    print(f"Creating {len(TEST_CASES)} test schedules on account ...036 (id={account_id})...\n")
    for tc in TEST_CASES:
        try:
            sched = create_schedule(base_url, token, account_id, tc)
            allocs = ", ".join(f"{a['symbol']} {a['pct']}%" for a in sched["allocations"])
            print(f"  [OK] #{tc['n']:>2}  id={sched['id']:<6} {sched['name']}  [{allocs}]")
        except requests.HTTPError as e:
            print(f"  [FAIL] #{tc['n']}  {e.response.status_code}: {e.response.text}")
    print("\nDone. Run with --teardown to delete all test schedules.")


def teardown(base_url, token):
    schedules = list_schedules(base_url, token)
    targets = [s for s in schedules if s["name"].startswith(SCHEDULE_NAME_PREFIX)]
    if not targets:
        print("No test schedules found — nothing to delete.")
        return
    print(f"Deleting {len(targets)} test schedule(s)...\n")
    for s in targets:
        try:
            delete_schedule(base_url, token, s["id"])
            print(f"  [DELETED] id={s['id']:<6} {s['name']}")
        except requests.HTTPError as e:
            print(f"  [FAIL]    id={s['id']:<6} {s['name']}  {e.response.status_code}: {e.response.text}")
    print("\nDone.")


def main():
    parser = argparse.ArgumentParser(description="Seed or teardown Dynamic Allocation Test schedules.")
    parser.add_argument("--teardown", action="store_true", help="Delete all test schedules instead of creating them.")
    args = parser.parse_args()

    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")
    username = env("API_USERNAME")
    password = env("API_PASSWORD")

    print(f"Connecting to {base_url} as '{username}'...")
    token = login(base_url, username, password)
    print("Authenticated.\n")

    if args.teardown:
        teardown(base_url, token)
    else:
        account_id = get_account_id(base_url, token)
        seed(base_url, token, account_id)


if __name__ == "__main__":
    main()
