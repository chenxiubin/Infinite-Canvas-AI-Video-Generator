import sqlite3, json, uuid

conn = sqlite3.connect('db.sqlite3')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

canvas_id = 'cv_test123'
template_id = 'tpl_hanging'
product_sku = 'SKU2027-A01'

cursor.execute('SELECT * FROM templates WHERE id = ?', (template_id,))
template = cursor.fetchone()
if not template:
    print('Template not found')
else:
    instance_id = 'ins_testonly'
    cursor.execute('INSERT INTO instances (id, canvas_id, template_id, product_sku) VALUES (?, ?, ?, ?)',
        (instance_id, canvas_id, template_id, product_sku))
    
    template_nodes = json.loads(template['nodes_json'])
    for node in template_nodes:
        node_id = 'node_' + uuid.uuid4().hex[:8]
        try:
            cursor.execute(
                """
                INSERT INTO instance_nodes (
                    id, instance_id, node_key, node_type, label, role_key, role_name, 
                    status, duration, shot_size, camera_move, lighting_mood, 
                    motion_intensity, text_lock_enabled, is_fixed, bound_asset_url, bound_asset_source, ai_candidate_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    node_id, instance_id,
                    node.get('node_key'), node.get('node_type'),
                    node.get('label') or node.get('role_name') or node.get('node_key') or 'node',
                    node.get('role_key'), node.get('role_name') or node.get('role_key') or '',
                    'success' if node.get('is_fixed') else 'pending',
                    node.get('duration', 0), node.get('shot_size'), node.get('camera_move'),
                    node.get('lighting_mood'), node.get('motion_intensity'), 0,
                    1 if node.get('is_fixed') else 0,
                    None, None,
                    'not_triggered' if node.get('node_type') == 'generation' else None
                )
            )
            print('OK:', node.get('node_key'), 'type=', node.get('node_type'))
        except Exception as e:
            print('FAIL:', node.get('node_key'), '->', e)
    conn.rollback()
    print('Done (rolled back)')
conn.close()
