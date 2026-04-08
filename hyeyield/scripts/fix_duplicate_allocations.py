import sqlite3

db = sqlite3.connect('hyeyield.db')
table = 'schedule_allocations'
db.execute(
    f'DELETE FROM {table} WHERE id NOT IN '
    f'(SELECT MIN(id) FROM {table} GROUP BY schedule_id, symbol)'
)
db.commit()
count = db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
print(f'Done. Rows remaining: {count}')
