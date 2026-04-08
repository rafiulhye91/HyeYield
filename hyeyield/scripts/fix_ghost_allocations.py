"""
Fix ghost allocation rows caused by the pre-ORM-delete bug.

For each schedule whose allocations sum to more than 105%, this script
removes the oldest rows (lowest id) one by one until the total drops
to <= 105%. Those oldest rows are the stale "ghost" allocations from
a prior edit that was never properly cleaned up.

After running this script, re-open and save each affected schedule in the
UI so the correct percentages are applied (the surviving rows may still
carry old percentage values).
"""
import sqlite3

DB_PATH = 'hyeyield.db'

db = sqlite3.connect(DB_PATH)

schedules = db.execute('SELECT id, name FROM schedules').fetchall()

any_fixed = False
for sid, sname in schedules:
    rows = db.execute(
        'SELECT id, symbol, target_pct FROM schedule_allocations '
        'WHERE schedule_id=? ORDER BY id ASC',
        (sid,)
    ).fetchall()

    total = sum(r[2] for r in rows)
    if total <= 105:
        print(f'Schedule {sid} ({sname!r}): OK — {total:.1f}%  ({len(rows)} rows)')
        continue

    print(f'\nSchedule {sid} ({sname!r}): OVER — {total:.1f}%  ({len(rows)} rows)')
    deleted = []
    while total > 105 and len(rows) > 1:
        oldest = rows[0]
        rows = rows[1:]
        total = sum(r[2] for r in rows)
        deleted.append(oldest)
        print(f'  removing ghost row: id={oldest[0]}  {oldest[1]}  {oldest[2]}%  → new total {total:.1f}%')

    if deleted:
        ids_to_delete = [r[0] for r in deleted]
        placeholders = ','.join('?' * len(ids_to_delete))
        db.execute(f'DELETE FROM schedule_allocations WHERE id IN ({placeholders})', ids_to_delete)
        any_fixed = True
        print(f'  ✓ removed {len(deleted)} ghost row(s); remaining total {total:.1f}%')
        print(f'  Remaining symbols: {[r[1] for r in rows]}')
        print(f'  → Re-open and save this schedule in the UI to apply correct percentages.')

db.commit()

if not any_fixed:
    print('\nNo over-allocated schedules found — nothing to clean up.')
else:
    print('\nDone. Re-deploy and then edit+save each affected schedule in the UI.')
