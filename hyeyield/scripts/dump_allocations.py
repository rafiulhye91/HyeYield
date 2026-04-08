import sqlite3

db = sqlite3.connect('hyeyield.db')

schedules = db.execute('SELECT id, name FROM schedules').fetchall()
for sid, sname in schedules:
    allocs = db.execute(
        'SELECT id, symbol, target_pct, display_order FROM schedule_allocations WHERE schedule_id=? ORDER BY display_order',
        (sid,)
    ).fetchall()
    total = sum(a[2] for a in allocs)
    print(f'\nSchedule {sid} — {sname}  (total: {total}%)')
    for a in allocs:
        print(f'  row_id={a[0]}  {a[1]}  {a[2]}%  order={a[3]}')
