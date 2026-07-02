import sqlite3

conn = sqlite3.connect('db.sqlite3')
cursor = conn.cursor()
cursor.execute('SELECT instance_id, node_key, bound_asset_url FROM instance_nodes WHERE instance_id LIKE "%A03%" ORDER BY id DESC LIMIT 20')
rows = cursor.fetchall()
for row in rows:
    print(row)
