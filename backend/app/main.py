import os
import uuid
import time
import json
import sqlite3
import shutil
from typing import List, Optional
from fastapi import FastAPI, BackgroundTasks, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# MVP-3: asset role helpers
try:
    from .asset_roles import (
        infer_asset_role, canonicalize_role, CANONICAL_ROLES,
        compute_checklist, compute_product_status,
    )
    from .video_templates import (
        get_asset_for_role, resolve_motion_asset, build_prompt,
    )
    from .video_generation import (
        generate_batch_nodes, run_mock_generation_for_node,
        create_generation_job, get_latest_job_for_node,
        recompute_instance_status, recompute_batch_status,
        apply_instance_status, apply_batch_status,
        assert_testing_force_allowed,
    )
    from .video_review_export import (
        all_nodes_success, can_merge_preview, run_mock_merge_preview,
        recompute_instance_review_status, apply_instance_review_status,
        create_review_record, review_node, review_instance_nodes,
        can_export_instance, run_mock_export,
        reset_instance_delivery_after_node_regenerate,
    )
    from .model_gateway import list_adapters as list_model_adapters, submit_generation, DEFAULT_ADAPTER
except ImportError:
    from asset_roles import (
        infer_asset_role, canonicalize_role, CANONICAL_ROLES,
        compute_checklist, compute_product_status,
    )
    from video_templates import (
        get_asset_for_role, resolve_motion_asset, build_prompt,
    )
    from video_generation import (
        generate_batch_nodes, run_mock_generation_for_node,
        create_generation_job, get_latest_job_for_node,
        recompute_instance_status, recompute_batch_status,
        apply_instance_status, apply_batch_status,
        assert_testing_force_allowed,
    )
    from video_review_export import (
        all_nodes_success, can_merge_preview, run_mock_merge_preview,
        recompute_instance_review_status, apply_instance_review_status,
        create_review_record, review_node, review_instance_nodes,
        can_export_instance, run_mock_export,
        reset_instance_delivery_after_node_regenerate,
    )
    from model_gateway import list_adapters as list_model_adapters, submit_generation, DEFAULT_ADAPTER

# Initialize FastAPI App
app = FastAPI(
    title="Infinite Canvas Video Generator Mock Backend",
    description="Implements API draft (04) and Mock AI Gateway (09) for MVP-1",
    version="0.1.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")


def _get_db_path() -> str:
    """Return the database file path.
    Uses TEST_DATABASE_PATH env var if set (for test isolation).
    """
    return os.environ.get(
        "TEST_DATABASE_PATH",
        os.path.join(BASE_DIR, "db.sqlite3"),
    )


# Module-level default (used by uvicorn at startup; tests override via env var)
DB_FILE = _get_db_path()
UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")
MOCK_ASSETS_DIR = os.path.join(STATIC_DIR, "mock_assets")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(MOCK_ASSETS_DIR, exist_ok=True)

# Mount static files to serve uploads and mock videos
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

def get_db():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# Database Schema Initialization
def init_db():
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")

    # 1. Templates
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        product_id TEXT NOT NULL,
        nodes_json TEXT NOT NULL,
        edges_json TEXT NOT NULL
    )
    """)
    
    # 2. Canvases
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS canvases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
    )
    """)
    
    # 3. Product Instances (Chains)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        canvas_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        product_sku TEXT NOT NULL,
        total_duration INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        merged_video_url TEXT,
        missing_roles_json TEXT DEFAULT '[]'
    )
    """)
    
    # 4. Instance Nodes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS instance_nodes (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        node_key TEXT NOT NULL,
        node_type TEXT NOT NULL,
        label TEXT NOT NULL,
        role_key TEXT,
        role_name TEXT,
        status TEXT DEFAULT 'pending',
        duration INTEGER DEFAULT 0,
        shot_size TEXT,
        camera_move TEXT,
        lighting_mood TEXT,
        motion_intensity TEXT,
        text_lock_enabled INTEGER DEFAULT 0,
        is_fixed INTEGER DEFAULT 0,
        bound_asset_url TEXT,
        bound_asset_source TEXT,
        bound_asset_role_key TEXT,
        ai_candidate_status TEXT,
        selected_candidate_id TEXT,
        FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE
    )
    """)
    
    # 5. Jobs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT,
        created_at REAL NOT NULL
    )
    """)
    
    # 6. Uploaded Assets
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        role_key TEXT
    )
    """)
    
    # 7. Batch Tasks
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS batch_tasks (
        id TEXT PRIMARY KEY,
        canvas_id TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        total_count INTEGER DEFAULT 0,
        completed_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL
    )
    """)
    
    # 8. Batch Task Items
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS batch_task_items (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        error_message TEXT,
        node_id TEXT,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        FOREIGN KEY (batch_id) REFERENCES batch_tasks (id) ON DELETE CASCADE,
        FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE
    )
    """)

    # 9. Products (MVP-3)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        product_type TEXT NOT NULL CHECK(product_type IN ('desk_calendar', 'wall_calendar')),
        sku TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'incomplete', 'asset_ready', 'archived')),
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        UNIQUE(sku)
    )
    """)

    # 10. Product Assets (MVP-3)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_assets (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        role_key TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_url TEXT NOT NULL,
        mime_type TEXT DEFAULT '',
        file_size INTEGER DEFAULT 0,
        width INTEGER DEFAULT 0,
        height INTEGER DEFAULT 0,
        role_confidence REAL DEFAULT 0.0,
        role_source TEXT DEFAULT 'auto' CHECK(role_source IN ('auto', 'manual')),
        role_confirmed INTEGER DEFAULT 0,
        fallback_source TEXT DEFAULT NULL,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """)

    # 11. Video Templates (MVP-3 Sprint 2)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_templates (
        id TEXT PRIMARY KEY,
        template_key TEXT NOT NULL UNIQUE,
        product_type TEXT NOT NULL CHECK(product_type IN ('desk_calendar', 'wall_calendar')),
        template_name TEXT NOT NULL,
        description TEXT DEFAULT '',
        total_duration_seconds INTEGER DEFAULT 26,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived')),
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL
    )
    """)

    # 12. Template Shots (MVP-3 Sprint 2)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS template_shots (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        shot_key TEXT NOT NULL,
        shot_name TEXT NOT NULL,
        shot_order INTEGER NOT NULL CHECK(shot_order BETWEEN 1 AND 6),
        duration_seconds INTEGER NOT NULL,
        required_asset_role TEXT NOT NULL,
        prompt_template TEXT NOT NULL DEFAULT '',
        is_required INTEGER DEFAULT 1,
        requires_review INTEGER DEFAULT 0,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        FOREIGN KEY (template_id) REFERENCES video_templates(id) ON DELETE CASCADE,
        UNIQUE(template_id, shot_key)
    )
    """)

    # 13. Video Instances (MVP-3 Sprint 2)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_instances (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        product_type TEXT NOT NULL,
        sku TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        merged_video_url TEXT,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id)
    )
    """)

    # 14. Video Instance Nodes (MVP-3 Sprint 2)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_instance_nodes (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        shot_key TEXT NOT NULL,
        shot_name TEXT NOT NULL,
        shot_order INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 4,
        required_asset_role TEXT NOT NULL,
        bound_asset_id TEXT,
        bound_asset_role TEXT,
        bound_asset_source TEXT,
        prompt TEXT NOT NULL DEFAULT '',
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'success', 'failed')),
        video_url TEXT,
        error_message TEXT,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        FOREIGN KEY (instance_id) REFERENCES video_instances(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id),
        UNIQUE(instance_id, shot_key)
    )
    """)

    # 15. Video Generation Jobs (MVP-3 Sprint 3)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_generation_jobs (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        shot_key TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'running', 'success', 'failed')),
        model_name TEXT DEFAULT 'mock_image_to_video',
        model_version TEXT DEFAULT 'mock-v1',
        prompt TEXT DEFAULT '',
        input_asset_id TEXT DEFAULT '',
        input_asset_url TEXT DEFAULT '',
        output_video_url TEXT,
        output_cover_url TEXT,
        duration_seconds INTEGER DEFAULT 0,
        error_message TEXT,
        retry_of_job_id TEXT,
        attempt_no INTEGER DEFAULT 1,
        cost_estimate REAL DEFAULT 0,
        created_at REAL NOT NULL,
        started_at REAL,
        completed_at REAL
    )
    """)

    # MVP-4 Sprint 8: model gateway columns on video_generation_jobs
    for col, col_def in [
        ("adapter_key", "TEXT DEFAULT 'mock'"),
        ("provider_name", "TEXT DEFAULT 'mock'"),
        ("provider_job_id", "TEXT DEFAULT ''"),
        ("provider_status", "TEXT DEFAULT ''"),
        ("prompt_version", "TEXT DEFAULT ''"),
        ("submitted_at", "REAL"),
        ("polled_at", "REAL"),
        ("request_payload_summary", "TEXT DEFAULT ''"),
        ("response_payload_summary", "TEXT DEFAULT ''"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE video_generation_jobs ADD COLUMN {col} {col_def}")
        except sqlite3.OperationalError:
            pass

    # Ensure MVP-3 Sprint 3 columns on video_instance_nodes (SQLite ALTER TABLE is limited)
    for col, col_def in [
        ("job_id", "TEXT"),
        ("cover_url", "TEXT"),
        ("retry_count", "INTEGER DEFAULT 0"),
        ("completed_at", "REAL"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE video_instance_nodes ADD COLUMN {col} {col_def}")
        except sqlite3.OperationalError:
            pass

    # Sprint 4: review + delivery columns on video_instance_nodes
    for col, col_def in [
        ("review_status", "TEXT DEFAULT 'not_required'"),
        ("review_reason", "TEXT DEFAULT ''"),
        ("reviewed_at", "REAL"),
        ("requires_review", "INTEGER DEFAULT 1"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE video_instance_nodes ADD COLUMN {col} {col_def}")
        except sqlite3.OperationalError:
            pass

    # Sprint 4: delivery columns on video_instances
    for col, col_def in [
        ("draft_preview_url", "TEXT"),
        ("draft_cover_url", "TEXT"),
        ("merge_status", "TEXT DEFAULT 'not_started'"),
        ("review_status", "TEXT DEFAULT 'not_ready'"),
        ("export_status", "TEXT DEFAULT 'not_started'"),
        ("final_video_url", "TEXT"),
        ("reviewed_at", "REAL"),
        ("exported_at", "REAL"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE video_instances ADD COLUMN {col} {col_def}")
        except sqlite3.OperationalError:
            pass

    # 16. Video Merge Jobs (MVP-3 Sprint 4)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_merge_jobs (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        output_preview_url TEXT,
        output_cover_url TEXT,
        error_message TEXT,
        attempt_no INTEGER DEFAULT 1,
        created_at REAL NOT NULL,
        started_at REAL,
        completed_at REAL
    )
    """)

    # 17. Review Records (MVP-3 Sprint 4)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS review_records (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        node_id TEXT,
        action TEXT NOT NULL,
        previous_status TEXT DEFAULT '',
        new_status TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        reviewer TEXT DEFAULT 'local_user',
        created_at REAL NOT NULL
    )
    """)

    # 18. Export Jobs (MVP-3 Sprint 4)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS export_jobs (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        draft_preview_url TEXT DEFAULT '',
        final_video_url TEXT,
        error_message TEXT,
        attempt_no INTEGER DEFAULT 1,
        created_at REAL NOT NULL,
        started_at REAL,
        completed_at REAL
    )
    """)

    # 19. Video Node Asset Bindings (Sprint 9B-3C)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS video_node_asset_bindings (
        id TEXT PRIMARY KEY,
        instance_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        shot_key TEXT NOT NULL,
        binding_type TEXT NOT NULL CHECK(binding_type IN ('start_frame', 'end_frame', 'reference_image')),
        asset_id TEXT NOT NULL,
        asset_role TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at REAL NOT NULL,
        updated_at REAL NOT NULL,
        FOREIGN KEY (node_id) REFERENCES video_instance_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (asset_id) REFERENCES product_assets(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vnab_lookup ON video_node_asset_bindings(instance_id, shot_key, binding_type)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uniq_vnab_single_frame ON video_node_asset_bindings(instance_id, shot_key, binding_type) WHERE binding_type IN ('start_frame', 'end_frame')")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uniq_vnab_reference_order ON video_node_asset_bindings(instance_id, shot_key, sort_order) WHERE binding_type = 'reference_image'")
    cursor.execute("""INSERT OR IGNORE INTO video_node_asset_bindings (id, instance_id, node_id, shot_key, binding_type, asset_id, asset_role, source, sort_order, created_at, updated_at)
    SELECT 'vnab_'||lower(hex(randomblob(6))), vin.instance_id, vin.id, vin.shot_key, 'start_frame', vin.bound_asset_id, COALESCE(vin.bound_asset_role,'start_frame'), COALESCE(vin.bound_asset_source,'migrated'), 0, vin.created_at, vin.updated_at
    FROM video_instance_nodes vin WHERE vin.bound_asset_id IS NOT NULL AND vin.bound_asset_id!='' AND NOT EXISTS (SELECT 1 FROM video_node_asset_bindings vnab WHERE vnab.instance_id=vin.instance_id AND vnab.shot_key=vin.shot_key AND vnab.binding_type='start_frame')""")

    conn.commit()

    # Seed default video templates (MVP-3 Sprint 2)
    try:
        from .video_templates import ensure_default_video_templates
    except ImportError:
        from video_templates import ensure_default_video_templates
    ensure_default_video_templates(cursor)
    conn.commit()

    conn.commit()

    # Seed default templates if empty
    cursor.execute("SELECT COUNT(*) FROM templates")
    if cursor.fetchone()[0] == 0:
        seed_templates(cursor)
        conn.commit()
        
    conn.close()

def seed_templates(cursor):
    # Standard Hanging Calendar Template Nodes
    hanging_nodes = [
      { "node_key": "S01_main", "node_type": "shot", "role_key": "main", "role_name": "主图-正面", "duration": 4, "shot_size": "中景", "camera_move": "推", "lighting_mood": "暖光节日氛围", "motion_intensity": "轻微", "is_fixed": False },
      { "node_key": "S02_detail1", "node_type": "shot", "role_key": "detail_1", "role_name": "细节-纸张质感", "duration": 3, "shot_size": "特写", "camera_move": "摇", "lighting_mood": "侧光质感", "motion_intensity": "中等", "is_fixed": False },
      { "node_key": "S03_detail2", "node_type": "shot", "role_key": "detail_2", "role_name": "细节-装订挂绳", "duration": 3, "shot_size": "特写", "camera_move": "拉", "lighting_mood": "暖光节日氛围", "motion_intensity": "轻微", "is_fixed": False },
      { "node_key": "S04_motion", "node_type": "shot", "role_key": "motion", "role_name": "运镜-整体悬挂摇镜", "duration": 5, "shot_size": "全景", "camera_move": "摇", "lighting_mood": "自然光", "motion_intensity": "较大", "is_fixed": False },
      { "node_key": "S05_scene", "node_type": "shot", "role_key": "scene", "role_name": "场景-墙面陈列", "duration": 5, "shot_size": "中远景", "camera_move": "移", "lighting_mood": "自然光", "motion_intensity": "轻微", "is_fixed": False },
      { "node_key": "S06_brand", "node_type": "shot", "role_key": "brand_end", "role_name": "尾帧-LOGO", "duration": 4, "shot_size": "全景", "camera_move": "静止", "lighting_mood": "演播室", "motion_intensity": "轻微", "is_fixed": True },
      { "node_key": "M01_merge", "node_type": "merge", "duration": 0 },
      { "node_key": "AI01_gen", "node_type": "generation", "duration": 0 }
    ]
    
    hanging_edges = [
      { "from_node_key": "S01_main", "to_node_key": "S02_detail1" },
      { "from_node_key": "S02_detail1", "to_node_key": "S03_detail2" },
      { "from_node_key": "S03_detail2", "to_node_key": "S04_motion" },
      { "from_node_key": "S04_motion", "to_node_key": "S05_scene" },
      { "from_node_key": "S05_scene", "to_node_key": "S06_brand" },
      { "from_node_key": "S06_brand", "to_node_key": "M01_merge" },
      { "from_node_key": "AI01_gen", "to_node_key": "S01_main", "style_dashed": True }
    ]

    cursor.execute(
        "INSERT INTO templates (id, name, product_id, nodes_json, edges_json) VALUES (?, ?, ?, ?, ?)",
        ("tpl_hanging", "挂历标准链", "hanging_calendar", json.dumps(hanging_nodes), json.dumps(hanging_edges))
    )

    # Standard Desk Calendar Template Nodes
    desk_nodes = [
      { "node_key": "S01_main", "node_type": "shot", "role_key": "main", "role_name": "主图-正面", "duration": 4, "shot_size": "中景", "camera_move": "推", "lighting_mood": "暖光节日氛围", "motion_intensity": "轻微", "is_fixed": False },
      { "node_key": "S02_detail1", "node_type": "shot", "role_key": "detail_1", "role_name": "细节-纸张质感", "duration": 3, "shot_size": "特写", "camera_move": "摇", "lighting_mood": "侧光质感", "motion_intensity": "中等", "is_fixed": False },
      { "node_key": "S03_detail2", "node_type": "shot", "role_key": "detail_2", "role_name": "底座/翻页装订结构", "duration": 3, "shot_size": "特写", "camera_move": "拉", "lighting_mood": "暖光节日氛围", "motion_intensity": "轻微", "is_fixed": False },
      { "node_key": "S04_motion", "node_type": "shot", "role_key": "motion", "role_name": "手部翻页动作 + 桌面平移", "duration": 5, "shot_size": "全景", "camera_move": "平移", "lighting_mood": "自然光", "motion_intensity": "较大", "is_fixed": False },
      { "node_key": "S05_scene", "node_type": "shot", "role_key": "scene", "role_name": "书桌/办公场景陈列", "duration": 5, "shot_size": "中远景", "camera_move": "移", "lighting_mood": "自然光", "motion_intensity": "轻微", "is_fixed": False },
      { "node_key": "S06_brand", "node_type": "shot", "role_key": "brand_end", "role_name": "尾帧-LOGO", "duration": 4, "shot_size": "全景", "camera_move": "静止", "lighting_mood": "演播室", "motion_intensity": "轻微", "is_fixed": True },
      { "node_key": "M01_merge", "node_type": "merge", "duration": 0 },
      { "node_key": "AI01_gen", "node_type": "generation", "duration": 0 }
    ]

    cursor.execute(
        "INSERT INTO templates (id, name, product_id, nodes_json, edges_json) VALUES (?, ?, ?, ?, ?)",
        ("tpl_desk", "台历标准链", "desk_calendar", json.dumps(desk_nodes), json.dumps(hanging_edges))
    )

# Prepare Mock Video Asset
def init_mock_video():
    # Write a base64 encoded tiny 1-second valid silent MP4 video if not exists
    placeholder_path = os.path.join(MOCK_ASSETS_DIR, "placeholder.mp4")
    if not os.path.exists(placeholder_path):
        # A tiny valid 1-second silent black MP4 file encoded in base64
        # (This is standard structure that players can parse)
        base64_mp4 = (
            "AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAADFtb292AAAAbG12aGQAAAAA"
            "AAAAAAAAAAAAAAAAAAABAAAAGAAAAAAAQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
            "AAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAJn"
            "dHJhawAAXHRraGQAAAAEAAAAAAAAAAAAAAABAAAAAAAAGAAAAAAAAAAAAAAAAAAA"
            "AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAr"
            "ZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAAGAAAAAABAAAAAAACZ21kaWEAAAAgbWRo"
            "ZAAAAAAAAAAAAAAAAAAABgAAAAAAgAAAAAAAaGhkbHIAAAAAAAAAAHZpZGVAAAAA"
            "AAAAAAAAAABWaWRlb0hhbmRsZXIAAAAC2W1pbmYAAAAUdm1oZAAAAAEAAAAAAAAA"
            "AAAAJGRpbmYAAAAYZHVyZQAAAAAAAAABAAAADHVybCAAAAABAAACW3N0YmwAAABt"
            "c3RzZAAAAAAAAAABAAAATWF2YzFpc29tAAAAAFhCQAAAAAAQAAAAGAAAABgAAAAA"
            "AAAAAABhdmNDAVQAKv/hABhnVAAqwkF2AP5AgAARgAABAADAAAAGBwcHAQABAgAE"
            "AAAACHBhc3AAAAABAAAAAQAAAAAYc3R0cwAAAAAAAAABAAAAAQAAABgAAAAUc3Rz"
            "cwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3Rz"
            "egAAAAAAAAAAAAAAAQAAABgAAAAUc3RjbwAAAAAAAAABAAAAMAAAADJtZGF0AAAA"
            "F2ZyZWUAAAAPYXZjMQH///+IAAAAAGc="
        )
        try:
            import base64
            with open(placeholder_path, "wb") as f:
                f.write(base64.b64decode(base64_mp4))
        except Exception as e:
            # Fallback to copy an empty file or basic header
            with open(placeholder_path, "wb") as f:
                f.write(b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom")

@app.on_event("startup")
def startup_event():
    init_db()
    init_mock_video()

# ----------------- SCHEMAS -----------------
class TemplateCreate(BaseModel):
    product_id: str
    name: str
    nodes: List[dict]
    edges: List[dict]

class InstanceCreate(BaseModel):
    template_id: str
    product_sku: str

class AssetBindingRequest(BaseModel):
    asset_id: str
    source_type: str
    asset_role_key: Optional[str] = None

class BatchCloneAsset(BaseModel):
    filename: str
    url: str
    asset_id: Optional[str] = None

class BatchCloneRequest(BaseModel):
    template_id: str
    assets: List[BatchCloneAsset]  # flat list of all selected assets

class AIModelImageToVideoRequest(BaseModel):
    source_image_url: str
    prompt_fields: dict
    duration_seconds: int
    text_lock: dict

class AIModelTextToImageRequest(BaseModel):
    reference_image_url: str
    prompt_fields: dict
    candidate_count: int

class AICandidateSelectionRequest(BaseModel):
    candidate_id: str

class BatchGenerateRequest(BaseModel):
    force_statuses: Optional[dict] = None

# ----------------- INTERNAL MOCK GATEWAY (09) -----------------

def run_mock_video_generation(job_id: str, duration: int):
    # Simulates generation taking 3 seconds as specified in 09 PRD
    time.sleep(3)
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cursor = conn.cursor()
    
    # We will return the static placeholder video
    # In a real setup, we would run model APIs here
    output_url = "http://localhost:8000/static/mock_assets/placeholder.mp4"
    result = {
        "status": "success",
        "output_video_url": output_url,
        "actual_duration_seconds": float(duration) + 0.1,
        "model_provider": "placeholder",
        "model_version": "mock-0.1"
    }
    
    cursor.execute(
        "UPDATE jobs SET status = 'success', result_json = ? WHERE id = ?",
        (json.dumps(result), job_id)
    )
    
    # Also update the instance node status
    cursor.execute("SELECT target_id FROM jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()
    if row:
        target_node_id = row[0]
        # Randomly succeed (85% probability) or fail (15%)
        import random
        final_status = 'success' if random.random() > 0.15 else 'failed'
        cursor.execute(
            "UPDATE instance_nodes SET status = ? WHERE id = ?",
            (final_status, target_node_id)
        )
        
    conn.commit()
    conn.close()

@app.post("/internal/model-gateway/image-to-video")
def model_gateway_image_to_video(req: AIModelImageToVideoRequest, bg_tasks: BackgroundTasks):
    job_id = f"model_job_{uuid.uuid4().hex[:8]}"
    
    # Save job in database
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO jobs (id, type, target_id, status, created_at) VALUES (?, ?, ?, ?, ?)",
        (job_id, "image-to-video", "", "queued", time.time())
    )
    conn.commit()
    conn.close()
    
    # Trigger async delay
    bg_tasks.add_task(run_mock_video_generation, job_id, req.duration_seconds)
    
    return { "job_id": job_id, "status": "queued" }

@app.get("/internal/model-gateway/jobs/{job_id}")
def get_model_gateway_job(job_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Gateway job not found")
        
    if row["status"] == "success" and row["result_json"]:
        return json.loads(row["result_json"])
        
    return { "status": row["status"] }

@app.post("/internal/model-gateway/text-to-image")
def model_gateway_text_to_image(req: AIModelTextToImageRequest):
    # Returns 4 crop variations or different mockup images
    # We will use Unsplash links with different search tags to mock the candidates
    job_id = f"img_job_{uuid.uuid4().hex[:8]}"
    candidates = [
        { "candidate_id": "c1", "image_url": "https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&q=80" },
        { "candidate_id": "c2", "image_url": "https://images.unsplash.com/photo-1512909006721-3d6018887383?w=400&q=80" },
        { "candidate_id": "c3", "image_url": "https://images.unsplash.com/photo-1545239351-ef35f43d514b?w=400&q=80" },
        { "candidate_id": "c4", "image_url": "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&q=80" }
    ]
    
    return {
        "job_id": job_id,
        "status": "success",
        "candidates": candidates
    }

# ----------------- UPPER BUSINESS LAYER APIS (04) -----------------

@app.post("/api/v1/templates")
def create_template(req: TemplateCreate, db: sqlite3.Connection = Depends(get_db)):
    template_id = f"tpl_custom_{uuid.uuid4().hex[:8]}"
    
    # Strip any bound asset details from node templates (H2 requirement)
    clean_nodes = []
    for node in req.nodes:
        clean_node = {
            "node_key": node["node_key"] if "node_key" in node else node.get("id"),
            "node_type": node["node_type"] if "node_type" in node else node.get("data", {}).get("nodeType"),
            "role_key": node.get("role_key") if "role_key" in node else node.get("data", {}).get("roleKey"),
            "role_name": node.get("role_name") if "role_name" in node else node.get("data", {}).get("roleName"),
            "duration": node.get("duration") if "duration" in node else node.get("data", {}).get("duration", 0),
            "shot_size": node.get("shot_size") if "shot_size" in node else node.get("data", {}).get("shotSize"),
            "camera_move": node.get("camera_move") if "camera_move" in node else node.get("data", {}).get("cameraMove"),
            "lighting_mood": node.get("lighting_mood") if "lighting_mood" in node else node.get("data", {}).get("lightingMood"),
            "motion_intensity": node.get("motion_intensity") if "motion_intensity" in node else node.get("data", {}).get("motionIntensity"),
            "text_lock_enabled": bool(node.get("text_lock_enabled")) if "text_lock_enabled" in node else bool(node.get("data", {}).get("textLockEnabled", False)),
            "is_fixed": bool(node.get("is_fixed")) if "is_fixed" in node else bool(node.get("data", {}).get("isFixed", False)),
        }
        # Fixed nodes keep their reference asset
        if clean_node["is_fixed"]:
            clean_node["bound_asset_url"] = node.get("bound_asset_url") if "bound_asset_url" in node else node.get("data", {}).get("boundAssetUrl")
            clean_node["bound_asset_source"] = node.get("bound_asset_source") if "bound_asset_source" in node else node.get("data", {}).get("boundAssetSource")
            
        clean_nodes.append(clean_node)
        
    clean_edges = []
    for edge in req.edges:
        clean_edge = {
            "from_node_key": edge.get("from_node_key") if "from_node_key" in edge else edge.get("source"),
            "to_node_key": edge.get("to_node_key") if "to_node_key" in edge else edge.get("target"),
            "transition_type": edge.get("transition_type", "交叉溶解"),
            "transition_duration": float(edge.get("transition_duration", 0.3))
        }
        clean_edges.append(clean_edge)

    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO templates (id, name, product_id, nodes_json, edges_json) VALUES (?, ?, ?, ?, ?)",
        (template_id, req.name, req.product_id, json.dumps(clean_nodes), json.dumps(clean_edges))
    )
    db.commit()
    return { "template_id": template_id }

@app.get("/api/v1/templates")
def list_templates(product_id: Optional[str] = None, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    if product_id:
        cursor.execute("SELECT id, name, product_id FROM templates WHERE product_id = ?", (product_id,))
    else:
        cursor.execute("SELECT id, name, product_id FROM templates")
    rows = cursor.fetchall()
    return [{ "template_id": r["id"], "name": r["name"], "product_id": r["product_id"] } for r in rows]

@app.post("/api/v1/canvases")
def create_canvas(db: sqlite3.Connection = Depends(get_db)):
    canvas_id = f"cv_{uuid.uuid4().hex[:8]}"
    cursor = db.cursor()
    cursor.execute("INSERT INTO canvases (id, name) VALUES (?, ?)", (canvas_id, f"画布-{canvas_id}"))
    db.commit()
    return { "canvas_id": canvas_id }

def update_missing_roles(cursor, instance_id):
    cursor.execute(
        "SELECT role_key FROM instance_nodes WHERE instance_id = ? AND bound_asset_url IS NULL AND is_fixed = 0",
        (instance_id,)
    )
    rows = cursor.fetchall()
    missing = [row["role_key"] for row in rows if row["role_key"]]
    cursor.execute(
        "UPDATE instances SET missing_roles_json = ? WHERE id = ?",
        (json.dumps(missing), instance_id)
    )

@app.post("/api/v1/canvases/{canvas_id}/instances")
def clone_template_instance(canvas_id: str, req: InstanceCreate, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM templates WHERE id = ?", (req.template_id,))
    template = cursor.fetchone()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    instance_id = f"ins_{uuid.uuid4().hex[:8]}"
    
    # 1. Create Instance record
    cursor.execute(
        "INSERT INTO instances (id, canvas_id, template_id, product_sku) VALUES (?, ?, ?, ?)",
        (instance_id, canvas_id, req.template_id, req.product_sku)
    )
    
    # 2. Clone Nodes
    template_nodes = json.loads(template["nodes_json"])
    for node in template_nodes:
        node_id = f"node_{uuid.uuid4().hex[:8]}"
        cursor.execute(
            """
            INSERT INTO instance_nodes (
                id, instance_id, node_key, node_type, label, role_key, role_name, 
                status, duration, shot_size, camera_move, lighting_mood, 
                motion_intensity, text_lock_enabled, is_fixed, bound_asset_url, bound_asset_source, ai_candidate_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                node_id,
                instance_id,
                node.get("node_key"),
                node.get("node_type"),
                node.get("label") or node.get("role_name") or node.get("node_key") or "节点", # label
                node.get("role_key"),
                node.get("role_name") or node.get("role_key") or "", # role_name
                "success" if node.get("is_fixed") else "pending", # Fixed outro is already preloaded
                node.get("duration", 0),
                node.get("shot_size"),
                node.get("camera_move"),
                node.get("lighting_mood"),
                node.get("motion_intensity"),
                0, # text_lock_enabled
                1 if node.get("is_fixed") else 0,
                "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80" if node.get("is_fixed") else None, # fixed asset
                "uploaded" if node.get("is_fixed") else None,
                "not_triggered" if node["node_type"] == "generation" else None
            )
        )
        
    db.commit()
    
    # Calculate initial total duration
    cursor.execute("SELECT SUM(duration) FROM instance_nodes WHERE instance_id = ? AND node_type = 'shot'", (instance_id,))
    total_dur = cursor.fetchone()[0] or 0
    cursor.execute("UPDATE instances SET total_duration = ? WHERE id = ?", (total_dur, instance_id))
    
    # Update missing roles
    update_missing_roles(cursor, instance_id)
    db.commit()
    
    return { "instance_id": instance_id }

@app.get("/api/v1/instances/{instance_id}")
def get_instance_details(instance_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM instances WHERE id = ?", (instance_id,))
    instance = cursor.fetchone()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
        
    cursor.execute("SELECT * FROM instance_nodes WHERE instance_id = ?", (instance_id,))
    nodes_rows = cursor.fetchall()
    
    nodes = []
    for row in nodes_rows:
        nodes.append({
            "id": row["node_key"],
            "db_id": row["id"],
            "type": "custom",
            "position": { "x": 0, "y": 0 }, # position managed by frontend client
            "data": {
                "label": row["label"],
                "roleKey": row["role_key"],
                "roleName": row["role_name"],
                "nodeType": row["node_type"],
                "isFixed": bool(row["is_fixed"]),
                "status": row["status"],
                "duration": row["duration"],
                "shotSize": row["shot_size"],
                "cameraMove": row["camera_move"],
                "lightingMood": row["lighting_mood"],
                "motionIntensity": row["motion_intensity"],
                "textLockEnabled": bool(row["text_lock_enabled"]),
                "boundAssetUrl": row["bound_asset_url"],
                "boundAssetSource": row["bound_asset_source"],
                "boundAssetRoleKey": row["bound_asset_role_key"],
                "aiCandidateStatus": row["ai_candidate_status"],
                "selectedCandidateId": row["selected_candidate_id"]
            }
        })
        
    return {
        "instance_id": instance["id"],
        "product_sku": instance["product_sku"],
        "total_duration": instance["total_duration"],
        "status": instance["status"],
        "merged_video_url": instance["merged_video_url"],
        "missing_roles": json.loads(instance["missing_roles_json"] or "[]"),
        "nodes": nodes
    }

@app.put("/api/v1/instances/{instance_id}/nodes/{node_key}/asset-binding")
def bind_asset_to_node(instance_id: str, node_key: str, req: AssetBindingRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    
    asset_role_key = req.asset_role_key
    if not req.asset_id.startswith("http://") and not req.asset_id.startswith("https://"):
        cursor.execute("SELECT url, role_key FROM assets WHERE id = ?", (req.asset_id,))
        asset = cursor.fetchone()
        if not asset:
            raise HTTPException(status_code=404, detail="Asset file not found")
        url = asset["url"]
        if not asset_role_key:
            asset_role_key = asset["role_key"]
    else:
        url = req.asset_id
        
    cursor.execute(
        "UPDATE instance_nodes SET bound_asset_url = ?, bound_asset_source = ?, bound_asset_role_key = ?, status = 'pending' WHERE instance_id = ? AND node_key = ?",
        (url, req.source_type, asset_role_key, instance_id, node_key)
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"Node '{node_key}' not found in instance '{instance_id}'")
    # Sync missing_roles_json after binding change
    update_missing_roles(cursor, instance_id)
    db.commit()
    return { "status": "success" }

def _extract_sku_and_role(filename: str) -> tuple:
    """
    Parse filename into (sku, role_key).
      3. No separator found      -> sku=stem (full name minus ext), role=''
    """
    import re
    stem = filename.rsplit(".", 1)[0]  # strip extension
    # Try underscore split: last segment is role_key
    if "_" in stem:
        parts = stem.rsplit("_", 1)
        return parts[0], parts[1].lower()
    # Try hyphen split: last hyphen-segment is role_key
    if "-" in stem:
        parts = stem.rsplit("-", 1)
        # Only treat as role if last part looks like a word (no digits)
        if parts[1].isalpha():
            return parts[0], parts[1].lower()
    # Fallback: whole stem is the SKU, role unknown
    return stem, ""

# Role key aliases: map common alt names to canonical role keys
_ROLE_ALIASES = {
    "front": "main", "主图": "main", "正面": "main",
    "detail1": "detail_1", "细节1": "detail_1",
    "detail2": "detail_2", "细节2": "detail_2",
    "motion": "motion", "运镜": "motion",
    "scene": "scene", "场景": "scene",
    "outro": "brand", "尾帧": "brand",
}

@app.post("/api/v1/canvases/{canvas_id}/instances/batch")
def batch_clone_instances(canvas_id: str, req: BatchCloneRequest, db: sqlite3.Connection = Depends(get_db)):
    """
    Batch clone: groups uploaded assets by SKU, then per-group creates one instance
    and auto-binds assets to nodes by role_key match.
    - Limit: max 10 instances per batch (frontend should enforce, backend also guards)
    - Partial groups (missing roles): instance is created, missing nodes remain pending
    - Unrecognised filenames: entire file treated as fallback to 'main' role in its own group
    """
    cursor = db.cursor()

    # 1. Load template
    cursor.execute("SELECT * FROM templates WHERE id = ?", (req.template_id,))
    template = cursor.fetchone()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template_nodes = json.loads(template["nodes_json"])

    # 2. Group assets by SKU
    groups: dict[str, list[dict]] = {}
    unrecognized_assets = []
    
    for asset in req.assets:
        sku, role = _extract_sku_and_role(asset.filename)
        # Resolve role aliases
        role = _ROLE_ALIASES.get(role, role)
        
        valid_canonical_roles = {"main", "detail_1", "detail_2", "motion", "scene", "brand", "brand_end"}
        if not role or role not in valid_canonical_roles:
            unrecognized_assets.append({
                "filename": asset.filename,
                "url": asset.url,
                "reason": "filename_not_parseable"
            })
            continue

        if not sku:
            sku = "unidentified"
            
        if sku not in groups:
            groups[sku] = []
        groups[sku].append({"url": asset.url, "role": role, "filename": asset.filename, "asset_id": asset.asset_id})

    # 3. Enforce batch limit
    if len(groups) > 10:
        raise HTTPException(status_code=422, detail=f"Batch limit exceeded: max 10 product chains per request, got {len(groups)}")

    # Create Batch Task record
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        "INSERT INTO batch_tasks (id, canvas_id, status, total_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (batch_id, canvas_id, "queued", len(groups), now, now)
    )
    db.commit()

    # 4. For each SKU group, clone one instance and bind matching assets
    results = []
    for sku, assets_in_group in groups.items():
        instance_id = f"ins_{uuid.uuid4().hex[:8]}"
        cursor.execute(
            "INSERT INTO instances (id, canvas_id, template_id, product_sku) VALUES (?, ?, ?, ?)",
            (instance_id, canvas_id, req.template_id, sku)
        )

        # Build role -> asset lookup for this group
        # If multiple assets share the same role, last one wins
        role_map: dict[str, dict] = {}
        unmatched = []
        for a in assets_in_group:
            if a["role"]:
                role_map[a["role"]] = a
            else:
                unmatched.append(a)

        # Assign unmatched assets to unfilled roles in template order
        unfilled_roles = [n.get("role_key", "") for n in template_nodes
                          if not n.get("is_fixed") and n.get("role_key") not in role_map]
        for idx, a in enumerate(unmatched):
            if idx < len(unfilled_roles):
                role_map[unfilled_roles[idx]] = a

        # Clone nodes and bind where possible
        for node in template_nodes:
            node_id = f"node_{uuid.uuid4().hex[:8]}"
            role_key = node.get("role_key")
            matched = role_map.get(role_key) if role_key else None

            bound_url = None
            bound_source = None
            bound_role_key = None
            node_status = "pending"

            if node.get("is_fixed"):
                # Fixed nodes always keep their default asset
                bound_url = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80"
                bound_source = "uploaded"
                node_status = "success"
            elif matched:
                bound_url = matched["url"]
                bound_source = "uploaded"
                bound_role_key = matched["role"]
                # node_status stays 'pending' until user triggers generation

            cursor.execute(
                """
                INSERT INTO instance_nodes (
                    id, instance_id, node_key, node_type, label, role_key, role_name,
                    status, duration, shot_size, camera_move, lighting_mood,
                    motion_intensity, text_lock_enabled, is_fixed, bound_asset_url, bound_asset_source,
                    bound_asset_role_key, ai_candidate_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    node_id, instance_id,
                    node.get("node_key"), node.get("node_type"),
                    node.get("label") or node.get("role_name") or node.get("node_key") or "节点",
                    role_key,
                    node.get("role_name") or role_key or "",
                    node_status,
                    node.get("duration", 0),
                    node.get("shot_size"), node.get("camera_move"),
                    node.get("lighting_mood"), node.get("motion_intensity"),
                    0,
                    1 if node.get("is_fixed") else 0,
                    bound_url, bound_source, bound_role_key,
                    "not_triggered" if node.get("node_type") == "generation" else None
                )
            )

        db.commit()

        # Calculate total duration and missing roles
        cursor.execute("SELECT SUM(duration) FROM instance_nodes WHERE instance_id = ? AND node_type = 'shot'", (instance_id,))
        total_dur = cursor.fetchone()[0] or 0
        cursor.execute("UPDATE instances SET total_duration = ? WHERE id = ?", (total_dur, instance_id))
        update_missing_roles(cursor, instance_id)
        db.commit()

        # Read back missing roles
        cursor.execute("SELECT missing_roles_json FROM instances WHERE id = ?", (instance_id,))
        row = cursor.fetchone()
        missing = json.loads(row["missing_roles_json"] or "[]")

        results.append({
            "instance_id": instance_id,
            "product_sku": sku,
            "missing_roles": missing,
            "status": "created"
        })
        
        # Create Batch Task Item
        cursor.execute(
            "INSERT INTO batch_task_items (id, batch_id, instance_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (f"bti_{uuid.uuid4().hex[:8]}", batch_id, instance_id, "queued", now, now)
        )
        db.commit()

    return { 
        "batch_id": batch_id,
        "instances": results, 
        "total": len(results),
        "unrecognized_assets": unrecognized_assets
    }

# AI Generation Node Call
@app.post("/api/v1/instances/{instance_id}/nodes/{node_key}/generate-candidates")
def trigger_ai_candidate_generation(instance_id: str, node_key: str, bg_tasks: BackgroundTasks, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    
    # Verify node type
    cursor.execute("SELECT id, node_type FROM instance_nodes WHERE instance_id = ? AND node_key = ?", (instance_id, node_key))
    node = cursor.fetchone()
    if not node or node["node_type"] != "generation":
        raise HTTPException(status_code=400, detail="Target node is not an AI generation node")
        
    # 1. Call Text-to-Image gateway mock
    gateway_resp = model_gateway_text_to_image(
        AIModelTextToImageRequest(
            reference_image_url="http://localhost:8000/static/mock_assets/sample_ref.jpg",
            prompt_fields={ "theme": "节日" },
            candidate_count=4
        )
    )
    
    # 2. Update node data status
    cursor.execute(
        "UPDATE instance_nodes SET ai_candidate_status = 'pending_selection', status = 'pending' WHERE id = ?",
        (node["id"],)
    )
    db.commit()
    
    # Save the candidates json in jobs table
    job_id = f"job_gen_{uuid.uuid4().hex[:8]}"
    cursor.execute(
        "INSERT INTO jobs (id, type, target_id, status, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (job_id, "candidates", node["id"], "success", json.dumps(gateway_resp), time.time())
    )
    db.commit()
    
    return { "job_id": job_id, "status": "success", "candidates": gateway_resp["candidates"] }

@app.post("/api/v1/instances/{instance_id}/nodes/{node_key}/select-candidate")
def select_ai_candidate(instance_id: str, node_key: str, req: AICandidateSelectionRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    
    # 1. Get Node
    cursor.execute("SELECT id FROM instance_nodes WHERE instance_id = ? AND node_key = ?", (instance_id, node_key))
    node = cursor.fetchone()
    if not node:
        raise HTTPException(status_code=404, detail="Generation node not found")
        
    # 2. Get the candidate image (mock lookup, we will just use standard candidates)
    candidates_urls = {
        "c1": "https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&q=80",
        "c2": "https://images.unsplash.com/photo-1512909006721-3d6018887383?w=400&q=80",
        "c3": "https://images.unsplash.com/photo-1545239351-ef35f43d514b?w=400&q=80",
        "c4": "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&q=80"
    }
    selected_url = candidates_urls.get(req.candidate_id)
    if not selected_url:
        raise HTTPException(status_code=400, detail="Invalid candidate ID")
        
    # Update AI node status to locked
    cursor.execute(
        "UPDATE instance_nodes SET ai_candidate_status = 'locked', selected_candidate_id = ?, status = 'success' WHERE id = ?",
        (req.candidate_id, node["id"])
    )
    
    # Automatically bind this output image to S01 main node as generated source!
    cursor.execute(
        "UPDATE instance_nodes SET bound_asset_url = ?, bound_asset_source = 'generated', status = 'pending' WHERE instance_id = ? AND node_key = 'S01_main'",
        (selected_url, instance_id)
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"S01_main node not found in instance '{instance_id}'")

    db.commit()
    return { "status": "success" }

# Trigger Video Generation for a specific segment node
def run_segment_generation_bg(instance_id: str, node_key: str, db_node_id: str, duration: int, force_status: str = None):
    # Triggers model gateway
    job_id = f"model_job_{uuid.uuid4().hex[:8]}"
    
    # 1. Update node status to generating
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute("UPDATE instance_nodes SET status = 'generating' WHERE id = ?", (db_node_id,))
    cursor.execute(
        "INSERT INTO jobs (id, type, target_id, status, created_at) VALUES (?, ?, ?, ?, ?)",
        (job_id, "image-to-video", db_node_id, "queued", time.time())
    )
    conn.commit()
    
    # Simulate generating delay of 3 seconds
    time.sleep(3)
    
    # Success/Failure determination
    if force_status:
        final_status = force_status
    else:
        import os
        simulate_failures = os.getenv("SIMULATE_FAILURES", "false").lower() == "true"
        if simulate_failures:
            import random
            final_status = "success" if random.random() > 0.15 else "failed"
        else:
            final_status = "success"
    
    cursor.execute("UPDATE instance_nodes SET status = ? WHERE id = ?", (final_status, db_node_id))
    cursor.execute("UPDATE jobs SET status = ? WHERE id = ?", (final_status, job_id))
    
    # Check if this instance now has all shots successful, if so, auto-trigger merge
    if final_status == "success":
        cursor.execute("SELECT instance_id FROM instance_nodes WHERE id = ?", (db_node_id,))
        instance_id = cursor.fetchone()[0]
        cursor.execute("SELECT status FROM instance_nodes WHERE instance_id = ? AND node_type = 'shot'", (instance_id,))
        statuses = [r[0] for r in cursor.fetchall()]
        if all(s == 'success' for s in statuses):
            # Auto-trigger merge
            cursor.execute("UPDATE instance_nodes SET status = 'generating' WHERE instance_id = ? AND node_type = 'merge'", (instance_id,))
            conn.commit()
            conn.close()
            run_merge_bg(instance_id)
            return

    conn.commit()
    conn.close()

def verify_testing_environment(param_name: str):
    is_testing = os.getenv("TESTING", "false").lower() == "true"
    if not is_testing:
        raise HTTPException(
            status_code=403,
            detail=f"{param_name} is only allowed in testing environment"
        )

@app.post("/api/v1/instances/{instance_id}/nodes/{node_key}/generate")
def generate_segment_node(instance_id: str, node_key: str, bg_tasks: BackgroundTasks, force_status: str = None, db: sqlite3.Connection = Depends(get_db)):
    if force_status is not None:
        verify_testing_environment("force_status")
            
    cursor = db.cursor()
    cursor.execute(
        "SELECT id, bound_asset_url, duration FROM instance_nodes WHERE instance_id = ? AND node_key = ?",
        (instance_id, node_key)
    )
    node = cursor.fetchone()
    if not node:
        raise HTTPException(status_code=404, detail="Storyboard node not found")
    if not node["bound_asset_url"]:
        raise HTTPException(status_code=400, detail="Cannot generate video segment: no asset is bound to this node")
        
    bg_tasks.add_task(run_segment_generation_bg, instance_id, node_key, node["id"], node["duration"], force_status)
    return { "status": "queued" }

def run_batch_item_bg(batch_id: str, item_id: str, instance_id: str, nodes: list, node_force_map: dict = None):
    """Generate each node individually (reusing single-node logic), then update batch tracking.
    After all nodes complete, auto-trigger merge via run_merge_bg (which has its own validation).

    node_force_map: dict mapping node_key -> status, e.g. {"S03_detail2": "failed"}.
    Only matching nodes are forced; others follow normal success/failure logic.
    If node_force_map contains '__all__', it applies to every node (backward compat).
    """
    import random
    import os

    # --- Phase 1: Generate each node individually ---
    for node in nodes:
        db_node_id = node["id"]
        duration = node.get("duration", 0)
        node_key = node.get("node_key", "")

        # Update node to generating
        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        cursor = conn.cursor()
        cursor.execute("UPDATE instance_nodes SET status = 'generating' WHERE id = ?", (db_node_id,))
        conn.commit()
        conn.close()

        # Simulate generation time (same 3s as single-node path)
        time.sleep(3)

        # Determine outcome — per-node force takes priority
        if node_force_map and '__all__' in node_force_map:
            final_node_status = node_force_map['__all__']
        elif node_force_map and node_key in node_force_map:
            final_node_status = node_force_map[node_key]
        else:
            simulate_failures = os.getenv("SIMULATE_FAILURES", "false").lower() == "true"
            if simulate_failures:
                final_node_status = "success" if random.random() > 0.15 else "failed"
            else:
                final_node_status = "success"

        # Update node status
        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        cursor = conn.cursor()
        cursor.execute("UPDATE instance_nodes SET status = ? WHERE id = ?", (final_node_status, db_node_id))
        conn.commit()
        conn.close()

    # --- Phase 2: Check results and update batch tracking ---
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT status FROM instance_nodes WHERE instance_id = ? AND node_type = 'shot'", (instance_id,))
    statuses = [r[0] for r in cursor.fetchall()]
    all_success = all(s == 'success' for s in statuses)

    if all_success:
        cursor.execute("UPDATE batch_task_items SET status = 'completed', updated_at = ? WHERE id = ?",
                       (time.time(), item_id))
        cursor.execute("UPDATE batch_tasks SET completed_count = completed_count + 1 WHERE id = ?", (batch_id,))
        conn.commit()
        conn.close()

        # Auto-trigger merge (run_merge_bg now validates node states itself)
        run_merge_bg(instance_id)

        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
    else:
        cursor.execute("UPDATE batch_task_items SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
                       ("Generation failed for one or more nodes", time.time(), item_id))
        cursor.execute("UPDATE batch_tasks SET failed_count = failed_count + 1 WHERE id = ?", (batch_id,))

    # Update batch task overall status
    cursor.execute("SELECT total_count, completed_count, failed_count FROM batch_tasks WHERE id = ?", (batch_id,))
    batch = cursor.fetchone()
    if batch["completed_count"] + batch["failed_count"] == batch["total_count"]:
        if batch["completed_count"] == 0 and batch["failed_count"] > 0:
            final_batch_status = "failed"
        elif batch["failed_count"] == 0:
            final_batch_status = "completed"
        else:
            final_batch_status = "partially_completed"
        cursor.execute("UPDATE batch_tasks SET status = ?, updated_at = ? WHERE id = ?",
                       (final_batch_status, time.time(), batch_id))

    conn.commit()
    conn.close()

@app.post("/api/v1/batches/{batch_id}/generate")
def batch_generate_segments(batch_id: str, req: BatchGenerateRequest, bg_tasks: BackgroundTasks, db: sqlite3.Connection = Depends(get_db)):
    if req.force_statuses:
        verify_testing_environment("force_statuses")
        
    cursor = db.cursor()
    cursor.execute("SELECT * FROM batch_tasks WHERE id = ?", (batch_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Batch task not found")
        
    cursor.execute("UPDATE batch_tasks SET status = 'running', updated_at = ? WHERE id = ?", (time.time(), batch_id))
    
    cursor.execute("SELECT * FROM batch_task_items WHERE batch_id = ?", (batch_id,))
    items = cursor.fetchall()
    
    for item in items:
        instance_id = item["instance_id"]
        
        # Check for missing roles
        cursor.execute("SELECT missing_roles_json FROM instances WHERE id = ?", (instance_id,))
        row = cursor.fetchone()
        missing = json.loads(row["missing_roles_json"] or "[]")
        
        if missing:
            # Full chain block: Skip generation
            cursor.execute(
                "UPDATE batch_task_items SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?",
                (f"缺少必需素材 ({missing[0]}), 已跳过生成", time.time(), item["id"])
            )
            cursor.execute("UPDATE batch_tasks SET failed_count = failed_count + 1 WHERE id = ?", (batch_id,))
        else:
            cursor.execute(
                "UPDATE batch_task_items SET status = 'running', updated_at = ? WHERE id = ?",
                (time.time(), item["id"])
            )
            cursor.execute("SELECT id, node_key, duration FROM instance_nodes WHERE instance_id = ? AND node_type = 'shot'", (instance_id,))
            nodes = cursor.fetchall()
            
            # Build per-node force map from compound keys like "ins_id:node_key"
            node_force_map = {}
            if req.force_statuses:
                for key, status in req.force_statuses.items():
                    if ':' in key:
                        inst_id, node_key = key.split(':', 1)
                        if inst_id == instance_id:
                            node_force_map[node_key] = status
                    elif key == instance_id:
                        # Plain instance_id key: apply to ALL nodes (backward compat)
                        node_force_map = {'__all__': status}
                        break
            bg_tasks.add_task(run_batch_item_bg, batch_id, item["id"], instance_id, [dict(n) for n in nodes], node_force_map if node_force_map else None)
            
    # Check if all were failed synchronously
    cursor.execute("SELECT total_count, completed_count, failed_count FROM batch_tasks WHERE id = ?", (batch_id,))
    batch = cursor.fetchone()
    if batch["completed_count"] + batch["failed_count"] == batch["total_count"]:
        if batch["completed_count"] == 0 and batch["failed_count"] > 0:
            final_batch_status = "failed"
        elif batch["failed_count"] == 0:
            final_batch_status = "completed"
        else:
            final_batch_status = "partially_completed"
        cursor.execute("UPDATE batch_tasks SET status = ?, updated_at = ? WHERE id = ?", (final_batch_status, time.time(), batch_id))
            
    db.commit()
    return { "status": "queued" }

@app.get("/api/v1/batches/{batch_id}")
def get_batch_task(batch_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM batch_tasks WHERE id = ?", (batch_id,))
    batch = cursor.fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch task not found")
        
    cursor.execute("""
        SELECT bti.*, i.product_sku 
        FROM batch_task_items bti
        JOIN instances i ON bti.instance_id = i.id
        WHERE bti.batch_id = ?
    """, (batch_id,))
    items = cursor.fetchall()
    items_list = []
    for i in items:
        item_dict = dict(i)
        cursor.execute("SELECT id, status FROM instance_nodes WHERE instance_id = ?", (item_dict["instance_id"],))
        item_dict["nodes"] = [dict(n) for n in cursor.fetchall()]
        items_list.append(item_dict)
        
    return {
        "id": batch["id"],
        "status": batch["status"],
        "total_count": batch["total_count"],
        "completed_count": batch["completed_count"],
        "failed_count": batch["failed_count"],
        "items": items_list
    }

# Merge/Composite All segments
def run_merge_bg(instance_id: str):
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # --- Security Gate: Validate all shot nodes are success before merging ---
    cursor.execute("SELECT node_key, status FROM instance_nodes WHERE instance_id = ? AND node_type = 'shot'", (instance_id,))
    shot_nodes = cursor.fetchall()
    if not shot_nodes:
        conn.close()
        return  # No shot nodes at all, nothing to merge

    failed_or_pending = [dict(r) for r in shot_nodes if r["status"] != "success"]
    if failed_or_pending:
        # Set merge node to failed so user can see the failure
        cursor.execute(
            "UPDATE instance_nodes SET status = 'failed' WHERE instance_id = ? AND node_type = 'merge'",
            (instance_id,)
        )
        conn.commit()
        conn.close()
        return  # Refuse to merge with incomplete nodes

    cursor.execute("UPDATE instance_nodes SET status = 'generating' WHERE instance_id = ? AND node_type = 'merge'", (instance_id,))
    if cursor.rowcount == 0:
        conn.commit()
        conn.close()
        return  # No merge node exists
    conn.commit()
    conn.close()

    time.sleep(4) # Simulate stitching taking 4 seconds

    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Re-validate after the simulated delay (defense in depth)
    cursor.execute("SELECT status FROM instance_nodes WHERE instance_id = ? AND node_type = 'shot'", (instance_id,))
    current_statuses = [r[0] for r in cursor.fetchall()]
    if not all(s == 'success' for s in current_statuses):
        cursor.execute(
            "UPDATE instance_nodes SET status = 'failed' WHERE instance_id = ? AND node_type = 'merge'",
            (instance_id,)
        )
        conn.commit()
        conn.close()
        return  # State changed during merge window, abort

    # Composite output video
    merged_url = "http://localhost:8000/static/mock_assets/placeholder.mp4"
    cursor.execute(
        "UPDATE instances SET status = 'completed', merged_video_url = ? WHERE id = ?",
        (merged_url, instance_id)
    )
    cursor.execute(
        "UPDATE instance_nodes SET status = 'success' WHERE instance_id = ? AND node_type = 'merge'",
        (instance_id,)
    )
    
    # --- Sprint 5: Manual Fix Hook ---
    cursor.execute("SELECT id, batch_id, status FROM batch_task_items WHERE instance_id = ?", (instance_id,))
    bti = cursor.fetchone()
    if bti and bti[2] == 'failed':
        # Update item status to completed and set a special manual fix message
        cursor.execute("UPDATE batch_task_items SET status = 'completed', error_message = '✨ 已手动修复', updated_at = ? WHERE id = ?", (time.time(), bti[0]))
        
        # Atomically adjust the batch task counts
        batch_id = bti[1]
        cursor.execute("UPDATE batch_tasks SET completed_count = completed_count + 1, failed_count = failed_count - 1 WHERE id = ?", (batch_id,))
        
        # Atomically update the overall batch status based on the new counts
        cursor.execute("""
            UPDATE batch_tasks 
            SET status = CASE 
                WHEN failed_count = 0 THEN 'completed' 
                WHEN completed_count = 0 THEN 'failed' 
                ELSE 'partially_completed' 
            END 
            WHERE id = ? AND completed_count + failed_count = total_count
        """, (batch_id,))
    # ---------------------------------
    
    conn.commit()
    conn.close()

@app.post("/api/v1/instances/{instance_id}/merge")
def merge_product_chain(instance_id: str, bg_tasks: BackgroundTasks, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    
    # Check if all shot nodes are successful
    cursor.execute("SELECT status FROM instance_nodes WHERE instance_id = ? AND node_type = 'shot'", (instance_id,))
    statuses = [r[0] for r in cursor.fetchall()]
    if not all(s == 'success' for s in statuses):
        raise HTTPException(status_code=400, detail="Cannot composite: not all storyboard segment nodes are in success status")
        
    cursor.execute("UPDATE instance_nodes SET status = 'generating' WHERE instance_id = ? AND node_type = 'merge'", (instance_id,))
    db.commit()
    
    bg_tasks.add_task(run_merge_bg, instance_id)
    return { "status": "processing" }

# Upload Assets
@app.post("/api/v1/assets/upload")
def upload_asset_file(file: UploadFile = File(...), db: sqlite3.Connection = Depends(get_db)):
    file_id = f"asset_{uuid.uuid4().hex[:8]}"
    ext = os.path.splitext(file.filename)[1]
    saved_filename = f"{file_id}{ext}"
    saved_path = os.path.join(UPLOAD_DIR, saved_filename)
    
    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    url = f"http://localhost:8000/static/uploads/{saved_filename}"
    
    # Try to automatically extract role key from filename
    # E.g. SKU2027A01_main.jpg -> main
    role_key = None
    fn_lower = file.filename.lower()
    for key in ["main", "detail_1", "detail_2", "motion", "scene"]:
        if key in fn_lower:
            role_key = key
            break
            
    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO assets (id, filename, url, role_key) VALUES (?, ?, ?, ?)",
        (file_id, file.filename, url, role_key)
    )
    db.commit()
    
    return {
        "asset_id": file_id,
        "filename": file.filename,
        "url": url,
        "role_key": role_key
    }

# ==================== MVP-3: Product Asset Package APIs ====================

# --- Schemas ---

class ProductCreateRequest(BaseModel):
    product_type: str  # 'desk_calendar' | 'wall_calendar'
    sku: str
    title: str
    description: str = ""

class ProductAssetRegisterRequest(BaseModel):
    original_filename: str
    file_url: str
    mime_type: str = "image/jpeg"
    file_size: int = 0
    width: int = 0
    height: int = 0

class AssetRoleUpdateRequest(BaseModel):
    role_key: str

class ProductStatusUpdateRequest(BaseModel):
    status: str  # 'draft' | 'incomplete' | 'asset_ready' | 'archived'

# --- Product CRUD ---

@app.post("/api/v1/products")
def create_product(req: ProductCreateRequest, db: sqlite3.Connection = Depends(get_db)):
    if req.product_type not in ("desk_calendar", "wall_calendar"):
        raise HTTPException(status_code=400, detail=f"Invalid product_type: {req.product_type}. Must be desk_calendar or wall_calendar.")
    if not req.sku or not req.sku.strip():
        raise HTTPException(status_code=400, detail="sku is required")

    cursor = db.cursor()
    # Check duplicate SKU
    cursor.execute("SELECT id FROM products WHERE sku = ?", (req.sku.strip(),))
    if cursor.fetchone():
        raise HTTPException(status_code=409, detail=f"Product with SKU '{req.sku}' already exists")

    product_id = f"prod_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        "INSERT INTO products (id, product_type, sku, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (product_id, req.product_type, req.sku.strip(), req.title, req.description, "draft", now, now),
    )
    db.commit()
    return {
        "product_id": product_id,
        "product_type": req.product_type,
        "sku": req.sku.strip(),
        "title": req.title,
        "description": req.description,
        "status": "draft",
    }


@app.get("/api/v1/products")
def list_products(
    product_type: Optional[str] = None,
    status: Optional[str] = None,
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.cursor()
    query = "SELECT id, product_type, sku, title, status, created_at, updated_at FROM products WHERE 1=1"
    params = []
    if product_type:
        query += " AND product_type = ?"
        params.append(product_type)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    return [
        {
            "product_id": r["id"],
            "product_type": r["product_type"],
            "sku": r["sku"],
            "title": r["title"],
            "status": r["status"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@app.get("/api/v1/products/{product_id}")
def get_product(product_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    product = cursor.fetchone()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Collect assets by role
    cursor.execute("SELECT * FROM product_assets WHERE product_id = ? ORDER BY created_at", (product_id,))
    asset_rows = cursor.fetchall()
    assets = [
        {
            "asset_id": r["id"],
            "product_id": r["product_id"],
            "role_key": r["role_key"],
            "original_filename": r["original_filename"],
            "file_url": r["file_url"],
            "mime_type": r["mime_type"],
            "file_size": r["file_size"],
            "width": r["width"],
            "height": r["height"],
            "role_confidence": r["role_confidence"],
            "role_source": r["role_source"],
            "role_confirmed": bool(r["role_confirmed"]),
            "fallback_source": r["fallback_source"],
        }
        for r in asset_rows
    ]

    # Build role-wise maps for checklist
    assets_by_role: dict[str, list[dict]] = {}
    role_confirmed_map: dict[str, bool] = {}
    for a in assets:
        rk = a["role_key"]
        assets_by_role.setdefault(rk, []).append(a)
    for rk, alist in assets_by_role.items():
        role_confirmed_map[rk] = all(a["role_confirmed"] for a in alist)

    checklist = compute_checklist(assets_by_role, role_confirmed_map)
    # Recompute product status
    new_status = compute_product_status(assets_by_role, role_confirmed_map)
    if new_status != product["status"]:
        cursor.execute("UPDATE products SET status = ?, updated_at = ? WHERE id = ?", (new_status, time.time(), product_id))
        db.commit()

    return {
        "product_id": product["id"],
        "product_type": product["product_type"],
        "sku": product["sku"],
        "title": product["title"],
        "description": product["description"],
        "status": new_status,
        "assets": assets,
        "checklist": checklist,
    }


@app.patch("/api/v1/products/{product_id}/status")
def update_product_status(product_id: str, req: ProductStatusUpdateRequest, db: sqlite3.Connection = Depends(get_db)):
    if req.status not in ("draft", "incomplete", "asset_ready", "archived"):
        raise HTTPException(status_code=400, detail=f"Invalid status: {req.status}")
    cursor = db.cursor()
    cursor.execute("SELECT id FROM products WHERE id = ?", (product_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Product not found")
    cursor.execute("UPDATE products SET status = ?, updated_at = ? WHERE id = ?", (req.status, time.time(), product_id))
    db.commit()
    return {"product_id": product_id, "status": req.status}


# --- Product Assets ---

@app.post("/api/v1/products/{product_id}/assets")
def register_product_asset(product_id: str, req: ProductAssetRegisterRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM products WHERE id = ?", (product_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Product not found")
    if not req.original_filename or not req.original_filename.strip():
        raise HTTPException(status_code=400, detail="original_filename is required")
    if not req.file_url or not req.file_url.strip():
        raise HTTPException(status_code=400, detail="file_url is required")

    # Infer role_key from filename
    role_key, confidence = infer_asset_role(req.original_filename)

    asset_id = f"pa_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        """INSERT INTO product_assets
        (id, product_id, role_key, original_filename, file_url, mime_type,
         file_size, width, height, role_confidence, role_source, role_confirmed, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (asset_id, product_id, role_key, req.original_filename, req.file_url,
         req.mime_type, req.file_size, req.width, req.height,
         confidence, "auto", 0, now, now),
    )
    db.commit()

    # Recompute product status
    cursor.execute("SELECT * FROM product_assets WHERE product_id = ?", (product_id,))
    all_assets = cursor.fetchall()
    assets_by_role: dict[str, list] = {}
    role_confirmed_map: dict[str, bool] = {}
    for r in all_assets:
        rk = r["role_key"]
        assets_by_role.setdefault(rk, []).append(dict(r))
    for rk, alist in assets_by_role.items():
        role_confirmed_map[rk] = all(a["role_confirmed"] for a in alist)
    new_status = compute_product_status(assets_by_role, role_confirmed_map)
    cursor.execute("UPDATE products SET status = ?, updated_at = ? WHERE id = ?", (new_status, time.time(), product_id))
    db.commit()

    return {
        "asset_id": asset_id,
        "product_id": product_id,
        "role_key": role_key,
        "role_confidence": confidence,
        "role_source": "auto",
        "role_confirmed": False,
    }


@app.put("/api/v1/products/{product_id}/assets/{asset_id}/role")
def update_asset_role(product_id: str, asset_id: str, req: AssetRoleUpdateRequest, db: sqlite3.Connection = Depends(get_db)):
    # Canonicalize and validate
    canonical = canonicalize_role(req.role_key)
    if canonical not in CANONICAL_ROLES and canonical != "unrecognized":
        raise HTTPException(status_code=400, detail=f"Invalid role_key: {req.role_key}. Allowed: {sorted(CANONICAL_ROLES)}")

    cursor = db.cursor()
    cursor.execute("SELECT * FROM product_assets WHERE id = ? AND product_id = ?", (asset_id, product_id))
    asset = cursor.fetchone()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found for this product")

    now = time.time()
    cursor.execute(
        "UPDATE product_assets SET role_key = ?, role_source = 'manual', role_confirmed = 1, updated_at = ? WHERE id = ?",
        (canonical, now, asset_id),
    )
    db.commit()

    # Recompute product status
    cursor.execute("SELECT * FROM product_assets WHERE product_id = ?", (product_id,))
    all_assets = cursor.fetchall()
    assets_by_role: dict[str, list] = {}
    role_confirmed_map: dict[str, bool] = {}
    for r in all_assets:
        rk = r["role_key"]
        assets_by_role.setdefault(rk, []).append(dict(r))
    for rk, alist in assets_by_role.items():
        role_confirmed_map[rk] = all(a["role_confirmed"] for a in alist)
    new_status = compute_product_status(assets_by_role, role_confirmed_map)
    cursor.execute("UPDATE products SET status = ?, updated_at = ? WHERE id = ?", (new_status, time.time(), product_id))
    db.commit()

    return {
        "asset_id": asset_id,
        "role_key": canonical,
        "role_source": "manual",
        "role_confirmed": True,
    }


# --- Video Instance Node Asset Binding ---

class VideoNodeBindRequest(BaseModel):
    asset_id: str
    source_type: str
    asset_role: Optional[str] = None

@app.put("/api/v1/video-instances/{instance_id}/nodes/{shot_key}/bind")
def bind_video_node_asset(instance_id: str, shot_key: str, req: VideoNodeBindRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id, product_id FROM video_instances WHERE id = ?", (instance_id,))
    inst = cursor.fetchone()
    if not inst:
        raise HTTPException(status_code=404, detail="Video instance not found")

    cursor.execute(
        "SELECT id, product_id FROM video_instance_nodes WHERE instance_id = ? AND shot_key = ?",
        (instance_id, shot_key),
    )
    node = cursor.fetchone()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{shot_key}' not found in instance '{instance_id}'")

    if req.asset_role and req.asset_role not in ("start_frame",):
        raise HTTPException(status_code=400, detail=f"Unsupported asset_role: '{req.asset_role}'. Only 'start_frame' is supported for binding.")

    role_value = req.asset_role
    cursor.execute(
        "SELECT role_key FROM product_assets WHERE id = ? AND product_id = ?",
        (req.asset_id, node["product_id"]),
    )
    asset = cursor.fetchone()
    if not asset:
        raise HTTPException(status_code=404, detail="Product asset not found")
    if not role_value:
        role_value = asset["role_key"]

    now = time.time()
    cursor.execute(
        """UPDATE video_instance_nodes
           SET bound_asset_id = ?, bound_asset_role = ?, bound_asset_source = ?, status = 'pending', updated_at = ?
           WHERE instance_id = ? AND shot_key = ?""",
        (req.asset_id, role_value, req.source_type, now, instance_id, shot_key),
    )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=500, detail="Failed to update node binding")
    db.commit()
    return {
        "status": "success",
        "instance_id": instance_id,
        "shot_key": shot_key,
        "bound_asset_id": req.asset_id,
        "bound_asset_role": role_value,
    }


# --- Video Node Asset Binding CRUD ---

class BindingUpsertRequest(BaseModel):
    asset_id: str
    source: str = "manual"


class ReferenceImageCreateRequest(BaseModel):
    asset_id: str
    source: str = "manual"
    sort_order: Optional[int] = None


def _serialize_binding(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "instance_id": row["instance_id"], "node_id": row["node_id"],
        "shot_key": row["shot_key"], "binding_type": row["binding_type"],
        "asset_id": row["asset_id"], "asset_role": row["asset_role"],
        "source": row["source"], "sort_order": row["sort_order"],
        "created_at": row["created_at"], "updated_at": row["updated_at"],
    }


def _resolve_asset_url(cursor, asset_id: str) -> str:
    cursor.execute("SELECT file_url FROM product_assets WHERE id = ?", (asset_id,))
    row = cursor.fetchone()
    return row["file_url"] if row else ""


def _validate_instance_and_node(cursor, instance_id: str, shot_key: str):
    cursor.execute("SELECT id FROM video_instances WHERE id = ?", (instance_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Video instance not found")
    cursor.execute("SELECT id FROM video_instance_nodes WHERE instance_id = ? AND shot_key = ?", (instance_id, shot_key))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail=f"Node '{shot_key}' not found in instance '{instance_id}'")


def _validate_asset(cursor, asset_id: str):
    cursor.execute("SELECT id FROM product_assets WHERE id = ?", (asset_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Product asset not found")


@app.get("/api/v1/video-instances/{instance_id}/nodes/{shot_key}/bindings")
def list_node_bindings(instance_id: str, shot_key: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    _validate_instance_and_node(cursor, instance_id, shot_key)
    cursor.execute(
        "SELECT * FROM video_node_asset_bindings WHERE instance_id = ? AND shot_key = ? ORDER BY binding_type, sort_order",
        (instance_id, shot_key),
    )
    rows = cursor.fetchall()
    bindings = [_serialize_binding(r) for r in rows]
    for b in bindings:
        b["asset_url"] = _resolve_asset_url(cursor, b["asset_id"])
    result = {"shot_key": shot_key, "start_frame": None, "end_frame": None, "reference_images": []}
    for b in bindings:
        if b["binding_type"] == "start_frame": result["start_frame"] = b
        elif b["binding_type"] == "end_frame": result["end_frame"] = b
        elif b["binding_type"] == "reference_image": result["reference_images"].append(b)
    return result


def _upsert_binding(cursor, instance_id: str, shot_key: str, node_id: str, binding_type: str, asset_id: str, source: str):
    now = time.time()
    cursor.execute("SELECT id FROM video_node_asset_bindings WHERE instance_id=? AND shot_key=? AND binding_type=?",
                   (instance_id, shot_key, binding_type))
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            "UPDATE video_node_asset_bindings SET asset_id=?, source=?, updated_at=? WHERE id=?",
            (asset_id, source, now, existing["id"]),
        )
        return existing["id"]
    new_id = f"vnab_{uuid.uuid4().hex[:8]}"
    cursor.execute(
        """INSERT INTO video_node_asset_bindings (id, instance_id, node_id, shot_key, binding_type, asset_id, asset_role, source, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
        (new_id, instance_id, node_id, shot_key, binding_type, asset_id, binding_type, source, now, now),
    )
    return new_id


@app.put("/api/v1/video-instances/{instance_id}/nodes/{shot_key}/bindings/start_frame")
def upsert_start_frame(instance_id: str, shot_key: str, req: BindingUpsertRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    _validate_instance_and_node(cursor, instance_id, shot_key)
    _validate_asset(cursor, req.asset_id)
    cursor.execute("SELECT id FROM video_instance_nodes WHERE instance_id=? AND shot_key=?", (instance_id, shot_key))
    node = cursor.fetchone()
    binding_id = _upsert_binding(cursor, instance_id, shot_key, node["id"], "start_frame", req.asset_id, req.source)
    db.commit()
    return {"status": "success", "binding_id": binding_id, "binding_type": "start_frame"}


@app.put("/api/v1/video-instances/{instance_id}/nodes/{shot_key}/bindings/end_frame")
def upsert_end_frame(instance_id: str, shot_key: str, req: BindingUpsertRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    _validate_instance_and_node(cursor, instance_id, shot_key)
    _validate_asset(cursor, req.asset_id)
    cursor.execute("SELECT id FROM video_instance_nodes WHERE instance_id=? AND shot_key=?", (instance_id, shot_key))
    node = cursor.fetchone()
    binding_id = _upsert_binding(cursor, instance_id, shot_key, node["id"], "end_frame", req.asset_id, req.source)
    db.commit()
    return {"status": "success", "binding_id": binding_id, "binding_type": "end_frame"}


@app.post("/api/v1/video-instances/{instance_id}/nodes/{shot_key}/bindings/reference_images")
def add_reference_image(instance_id: str, shot_key: str, req: ReferenceImageCreateRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    _validate_instance_and_node(cursor, instance_id, shot_key)
    _validate_asset(cursor, req.asset_id)
    cursor.execute("SELECT id FROM video_instance_nodes WHERE instance_id=? AND shot_key=?", (instance_id, shot_key))
    node = cursor.fetchone()
    if req.sort_order is None:
        cursor.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM video_node_asset_bindings WHERE instance_id=? AND shot_key=? AND binding_type='reference_image'",
            (instance_id, shot_key),
        )
        sort_order = cursor.fetchone()[0]
    else:
        sort_order = req.sort_order
    now = time.time()
    new_id = f"vnab_{uuid.uuid4().hex[:8]}"
    cursor.execute(
        """INSERT INTO video_node_asset_bindings (id, instance_id, node_id, shot_key, binding_type, asset_id, asset_role, source, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'reference_image', ?, 'reference_image', ?, ?, ?, ?)""",
        (new_id, instance_id, node["id"], shot_key, req.asset_id, req.source, sort_order, now, now),
    )
    db.commit()
    return {"status": "success", "binding_id": new_id, "binding_type": "reference_image", "sort_order": sort_order}


@app.delete("/api/v1/video-instances/{instance_id}/nodes/{shot_key}/bindings/{binding_id}")
def delete_node_binding(instance_id: str, shot_key: str, binding_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        "SELECT id FROM video_node_asset_bindings WHERE id=? AND instance_id=? AND shot_key=?",
        (binding_id, instance_id, shot_key),
    )
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Binding not found")
    cursor.execute("DELETE FROM video_node_asset_bindings WHERE id=?", (binding_id,))
    db.commit()
    return {"status": "deleted", "binding_id": binding_id}


@app.get("/api/v1/products/{product_id}/checklist")
def get_product_checklist(product_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    product = cursor.fetchone()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    cursor.execute("SELECT * FROM product_assets WHERE product_id = ? ORDER BY created_at", (product_id,))
    all_assets = cursor.fetchall()

    assets_by_role: dict[str, list[dict]] = {}
    role_confirmed_map: dict[str, bool] = {}
    for r in all_assets:
        rk = r["role_key"]
        rdict = {
            "asset_id": r["id"],
            "role_key": rk,
            "original_filename": r["original_filename"],
            "role_source": r["role_source"],
            "role_confirmed": bool(r["role_confirmed"]),
        }
        assets_by_role.setdefault(rk, []).append(rdict)

    for rk, alist in assets_by_role.items():
        role_confirmed_map[rk] = all(a["role_confirmed"] for a in alist)

    checklist = compute_checklist(assets_by_role, role_confirmed_map)

    return {
        "product_id": product["id"],
        "product_type": product["product_type"],
        **checklist,
    }


# ==================== MVP-3 Sprint 2: Video Templates & Instance Chains ====================

# --- Schemas ---

class VideoBatchCreateRequest(BaseModel):
    template_id: str
    product_ids: List[str]

# --- Video Templates ---

@app.get("/api/v1/video-templates")
def list_video_templates(
    product_type: Optional[str] = None,
    status: str = "active",
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.cursor()
    query = "SELECT * FROM video_templates WHERE status = ?"
    params = [status]
    if product_type:
        query += " AND product_type = ?"
        params.append(product_type)
    query += " ORDER BY created_at"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    templates = []
    for r in rows:
        cursor.execute("SELECT COUNT(*) FROM template_shots WHERE template_id = ?", (r["id"],))
        shot_count = cursor.fetchone()[0]
        templates.append({
            "template_id": r["id"],
            "template_key": r["template_key"],
            "product_type": r["product_type"],
            "template_name": r["template_name"],
            "description": r["description"],
            "total_duration_seconds": r["total_duration_seconds"],
            "shot_count": shot_count,
            "status": r["status"],
        })
    return {"templates": templates}


@app.get("/api/v1/video-templates/{template_id}")
def get_video_template(template_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM video_templates WHERE id = ?", (template_id,))
    tpl = cursor.fetchone()
    if not tpl:
        raise HTTPException(status_code=404, detail="Video template not found")
    cursor.execute(
        "SELECT * FROM template_shots WHERE template_id = ? ORDER BY shot_order",
        (template_id,),
    )
    shots = [
        {
            "shot_id": r["id"],
            "shot_key": r["shot_key"],
            "shot_name": r["shot_name"],
            "shot_order": r["shot_order"],
            "duration_seconds": r["duration_seconds"],
            "required_asset_role": r["required_asset_role"],
            "prompt_template": r["prompt_template"],
            "is_required": bool(r["is_required"]),
            "requires_review": bool(r["requires_review"]),
        }
        for r in cursor.fetchall()
    ]
    return {
        "template_id": tpl["id"],
        "template_key": tpl["template_key"],
        "product_type": tpl["product_type"],
        "template_name": tpl["template_name"],
        "description": tpl["description"],
        "total_duration_seconds": tpl["total_duration_seconds"],
        "status": tpl["status"],
        "shots": shots,
    }


# --- Video Batches ---

@app.post("/api/v1/video-batches")
def create_video_batch(req: VideoBatchCreateRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    # 1. Validate template
    cursor.execute("SELECT * FROM video_templates WHERE id = ? AND status = 'active'", (req.template_id,))
    tpl = cursor.fetchone()
    if not tpl:
        raise HTTPException(status_code=404, detail="Video template not found or inactive")

    # 2. Validate product_ids
    if not req.product_ids:
        raise HTTPException(status_code=400, detail="product_ids is required and must not be empty")
    if len(req.product_ids) != len(set(req.product_ids)):
        raise HTTPException(status_code=400, detail="product_ids contains duplicates")

    cursor.execute(
        "SELECT * FROM template_shots WHERE template_id = ? ORDER BY shot_order",
        (req.template_id,),
    )
    tpl_shots = cursor.fetchall()
    if len(tpl_shots) != 6:
        raise HTTPException(status_code=500, detail=f"Template has {len(tpl_shots)} shots, expected 6")

    # 3. Validate each product
    instances_data = []
    for pid in req.product_ids:
        cursor.execute("SELECT * FROM products WHERE id = ?", (pid,))
        product = cursor.fetchone()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product not found: {pid}")
        if product["product_type"] != tpl["product_type"]:
            raise HTTPException(
                status_code=400,
                detail=f"Product {pid} type '{product['product_type']}' does not match template type '{tpl['product_type']}'",
            )

        # Build checklist
        cursor.execute("SELECT * FROM product_assets WHERE product_id = ?", (pid,))
        assets = cursor.fetchall()
        assets_by_role: dict[str, list] = {}
        role_confirmed_map: dict[str, bool] = {}
        for a in assets:
            rk = a["role_key"]
            assets_by_role.setdefault(rk, []).append(dict(a))
        for rk, alist in assets_by_role.items():
            role_confirmed_map[rk] = all(a["role_confirmed"] for a in alist)

        chk = compute_checklist(assets_by_role, role_confirmed_map)
        if not chk["is_ready"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": f"Product {pid} is not ready",
                    "missing_required_roles": chk["missing_required_roles"],
                    "unconfirmed_required_roles": chk["unconfirmed_required_roles"],
                },
            )

        instances_data.append({
            "product": product,
            "assets_by_role": assets_by_role,
            "role_confirmed_map": role_confirmed_map,
        })

    # 4. Create batch
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    now = time.time()
    cursor.execute(
        """INSERT INTO batch_tasks
        (id, canvas_id, status, total_count, completed_count, failed_count, created_at, updated_at)
        VALUES (?, ?, 'ready', ?, 0, 0, ?, ?)""",
        (batch_id, "mvp3_auto", len(req.product_ids), now, now),
    )
    db.commit()

    # 5. Create instances and nodes
    result_instances = []
    for data in instances_data:
        product = data["product"]
        instance_id = f"ins_{uuid.uuid4().hex[:8]}"
        cursor.execute(
            """INSERT INTO video_instances
            (id, batch_id, product_id, template_id, product_type, sku, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)""",
            (instance_id, batch_id, product["id"], req.template_id,
             product["product_type"], product["sku"], now, now),
        )
        db.commit()

        node_list = []
        for shot in tpl_shots:
            node_id = f"vnode_{uuid.uuid4().hex[:8]}"
            asset_role = shot["required_asset_role"]
            bound_asset_id = None
            bound_asset_role = None
            bound_asset_source = None

            if asset_role == "motion":
                mot_asset, mot_source = resolve_motion_asset(product["id"], cursor)
                if mot_asset:
                    bound_asset_id = mot_asset["id"]
                    bound_asset_role = mot_asset["role_key"]
                    bound_asset_source = mot_source
            else:
                asset = get_asset_for_role(product["id"], asset_role, cursor)
                if asset:
                    bound_asset_id = asset["id"]
                    bound_asset_role = asset["role_key"]
                    bound_asset_source = "direct"

            prompt = build_prompt(
                shot["prompt_template"],
                product["product_type"],
                product["sku"],
                shot["shot_key"],
            )

            cursor.execute(
                """INSERT INTO video_instance_nodes
                (id, instance_id, batch_id, product_id, template_id,
                 shot_key, shot_name, shot_order, duration_seconds,
                 required_asset_role, bound_asset_id, bound_asset_role,
                 bound_asset_source, prompt, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)""",
                (node_id, instance_id, batch_id, product["id"], req.template_id,
                 shot["shot_key"], shot["shot_name"], shot["shot_order"],
                 shot["duration_seconds"], asset_role,
                 bound_asset_id, bound_asset_role, bound_asset_source,
                 prompt, now, now),
            )
            node_list.append({
                "node_id": node_id,
                "shot_key": shot["shot_key"],
                "bound_asset_role": bound_asset_role,
                "bound_asset_source": bound_asset_source,
                "status": "pending",
            })

        result_instances.append({
            "instance_id": instance_id,
            "product_id": product["id"],
            "sku": product["sku"],
            "node_count": len(node_list),
            "status": "pending",
            "nodes": node_list,
        })

    # Update batch_tasks with total
    cursor.execute(
        "UPDATE batch_tasks SET total_count = ?, updated_at = ? WHERE id = ?",
        (len(result_instances), time.time(), batch_id),
    )
    db.commit()

    return {
        "batch_id": batch_id,
        "template_id": req.template_id,
        "product_type": tpl["product_type"],
        "status": "ready",
        "total_count": len(result_instances),
        "instances": result_instances,
    }


@app.get("/api/v1/video-batches/{batch_id}")
def get_video_batch(batch_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM batch_tasks WHERE id = ?", (batch_id,))
    batch = cursor.fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="Video batch not found")

    cursor.execute(
        "SELECT * FROM video_instances WHERE batch_id = ? ORDER BY created_at",
        (batch_id,),
    )
    instances = []
    for inst in cursor.fetchall():
        cursor.execute(
            "SELECT COUNT(*) as total FROM video_instance_nodes WHERE instance_id = ?",
            (inst["id"],),
        )
        node_count = cursor.fetchone()[0]
        cursor.execute(
            "SELECT status, COUNT(*) as cnt FROM video_instance_nodes WHERE instance_id = ? GROUP BY status",
            (inst["id"],),
        )
        status_counts = {r["status"]: r["cnt"] for r in cursor.fetchall()}
        instances.append({
            "instance_id": inst["id"],
            "product_id": inst["product_id"],
            "sku": inst["sku"],
            "status": inst["status"],
            "node_count": node_count,
            "node_status_counts": status_counts,
        })

    return {
        "batch_id": batch["id"],
        "status": batch["status"],
        "total_count": batch["total_count"],
        "completed_count": batch["completed_count"],
        "failed_count": batch["failed_count"],
        "instances": instances,
    }


# --- Video Instances ---

@app.get("/api/v1/video-instances/{instance_id}")
def get_video_instance(instance_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM video_instances WHERE id = ?", (instance_id,))
    inst = cursor.fetchone()
    if not inst:
        raise HTTPException(status_code=404, detail="Video instance not found")

    cursor.execute(
        "SELECT * FROM video_instance_nodes WHERE instance_id = ? ORDER BY shot_order",
        (instance_id,),
    )
    nodes = [
        {
            "node_id": r["id"],
            "shot_key": r["shot_key"],
            "shot_name": r["shot_name"],
            "shot_order": r["shot_order"],
            "duration_seconds": r["duration_seconds"],
            "required_asset_role": r["required_asset_role"],
            "bound_asset_id": r["bound_asset_id"],
            "bound_asset_role": r["bound_asset_role"],
            "bound_asset_source": r["bound_asset_source"],
            "prompt": r["prompt"],
            "status": r["status"],
            "video_url": r["video_url"],
            "cover_url": r["cover_url"],
            "job_id": r["job_id"],
            "retry_count": r["retry_count"],
            "review_status": r["review_status"],
            "error_message": r["error_message"],
        }
        for r in cursor.fetchall()
    ]

    cursor.execute("SELECT * FROM products WHERE id = ?", (inst["product_id"],))
    product = cursor.fetchone()

    return {
        "instance_id": inst["id"],
        "batch_id": inst["batch_id"],
        "product_id": inst["product_id"],
        "product_type": inst["product_type"],
        "sku": inst["sku"],
        "template_id": inst["template_id"],
        "status": inst["status"],
        "draft_preview_url": inst["draft_preview_url"],
        "draft_cover_url": inst["draft_cover_url"],
        "merge_status": inst["merge_status"],
        "review_status": inst["review_status"],
        "export_status": inst["export_status"],
        "final_video_url": inst["final_video_url"],
        "product": {
            "product_id": product["id"],
            "sku": product["sku"],
            "title": product["title"],
        } if product else None,
        "nodes": nodes,
    }


# --- Video Instance Nodes ---

@app.get("/api/v1/video-nodes/{node_id}")
def get_video_node(node_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM video_instance_nodes WHERE id = ?", (node_id,))
    node = cursor.fetchone()
    if not node:
        raise HTTPException(status_code=404, detail="Video node not found")

    bound_asset = None
    if node["bound_asset_id"]:
        cursor.execute("SELECT * FROM product_assets WHERE id = ?", (node["bound_asset_id"],))
        ba = cursor.fetchone()
        if ba:
            bound_asset = {
                "asset_id": ba["id"],
                "role_key": ba["role_key"],
                "original_filename": ba["original_filename"],
                "file_url": ba["file_url"],
            }

    return {
        "node_id": node["id"],
        "instance_id": node["instance_id"],
        "batch_id": node["batch_id"],
        "shot_key": node["shot_key"],
        "shot_name": node["shot_name"],
        "shot_order": node["shot_order"],
        "duration_seconds": node["duration_seconds"],
        "required_asset_role": node["required_asset_role"],
        "bound_asset": bound_asset,
        "bound_asset_source": node["bound_asset_source"],
        "prompt": node["prompt"],
        "status": node["status"],
        "review_status": node["review_status"],
        "video_url": node["video_url"],
        "cover_url": node["cover_url"],
    }


# ==================== MVP-3 Sprint 3: Mock Generation & State Machine ====================

# --- Schemas ---

class VideoBatchGenerateRequest(BaseModel):
    skip_success: bool = True
    force_node_statuses: Optional[dict] = None
    model_adapter: str = "mock"

class VideoNodeGenerateRequest(BaseModel):
    force: bool = False
    force_status: Optional[str] = None
    model_adapter: str = "mock"
    prompt: Optional[str] = None

class VideoNodeRetryRequest(BaseModel):
    force_status: Optional[str] = None
    model_adapter: str = "mock"
    prompt: Optional[str] = None

# --- Batch Generate ---

@app.post("/api/v1/video-batches/{batch_id}/generate")
def generate_video_batch(batch_id: str, req: VideoBatchGenerateRequest, db: sqlite3.Connection = Depends(get_db)):
    if req.force_node_statuses:
        assert_testing_force_allowed("force_node_statuses")

    # Validate model adapter
    adapters = list_model_adapters()
    valid_keys = [a["adapter_key"] for a in adapters]
    if req.model_adapter not in valid_keys:
        raise HTTPException(status_code=400, detail=f"Unknown model adapter: {req.model_adapter}")
    adapter_info = next(a for a in adapters if a["adapter_key"] == req.model_adapter)
    if not adapter_info["configured"]:
        raise HTTPException(status_code=400, detail=f"Model adapter '{req.model_adapter}' not configured. Missing: {adapter_info['missing_config']}")

    cursor = db.cursor()

    # Validate batch
    cursor.execute("SELECT * FROM batch_tasks WHERE id = ?", (batch_id,))
    batch = cursor.fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="Video batch not found")
    if batch["status"] == "archived":
        raise HTTPException(status_code=400, detail="Archived batch cannot be generated")

    # Check there are instances
    cursor.execute("SELECT id FROM video_instances WHERE batch_id = ?", (batch_id,))
    inst_rows = cursor.fetchall()
    if not inst_rows:
        raise HTTPException(status_code=400, detail="Batch has no product instances")

    # Check all nodes have bound assets (excluding brand)
    cursor.execute(
        """SELECT vin.id, vin.shot_key FROM video_instance_nodes vin
        JOIN video_instances vi ON vin.instance_id = vi.id
        WHERE vi.batch_id = ? AND vin.bound_asset_id IS NULL AND vin.required_asset_role != 'brand'""",
        (batch_id,),
    )
    unbound = cursor.fetchall()
    # brand can legitimately have no asset if not uploaded; other roles cannot
    for u in unbound:
        raise HTTPException(
            status_code=400,
            detail=f"Node {u['id']} ({u['shot_key']}) has no bound asset",
        )

    # Update batch to running
    cursor.execute("UPDATE batch_tasks SET status = 'running', updated_at = ? WHERE id = ?", (time.time(), batch_id))
    # Update all pending instances to running
    cursor.execute(
        "UPDATE video_instances SET status = 'running', updated_at = ? WHERE batch_id = ? AND status = 'pending'",
        (time.time(), batch_id),
    )
    db.commit()

    result = generate_batch_nodes(cursor, batch_id, req.skip_success, req.force_node_statuses, model_adapter=req.model_adapter)
    db.commit()

    # Build instance summaries
    cursor.execute(
        "SELECT * FROM video_instances WHERE batch_id = ? ORDER BY created_at",
        (batch_id,),
    )
    instances = []
    for inst in cursor.fetchall():
        cursor.execute(
            "SELECT COUNT(*) as total FROM video_instance_nodes WHERE instance_id = ?",
            (inst["id"],),
        )
        nc = cursor.fetchone()[0]
        instances.append({
            "instance_id": inst["id"],
            "product_id": inst["product_id"],
            "sku": inst["sku"],
            "status": inst["status"],
            "node_count": nc,
        })

    # Re-read batch counts after generation
    cursor.execute("SELECT completed_count, failed_count FROM batch_tasks WHERE id = ?", (batch_id,))
    batch_counts = cursor.fetchone()

    return {
        "batch_id": batch_id,
        "status": result["status"],
        "total_count": batch["total_count"],
        "completed_count": batch_counts["completed_count"],
        "failed_count": batch_counts["failed_count"],
        "generated_nodes": result["generated_nodes"],
        "skipped_success_nodes": result["skipped_success_nodes"],
        "failed_nodes": result["failed_nodes"],
        "instances": instances,
    }


# --- Single Node Generate ---

@app.post("/api/v1/video-nodes/{node_id}/generate")
def generate_video_node(node_id: str, req: VideoNodeGenerateRequest, db: sqlite3.Connection = Depends(get_db)):
    if req.force_status is not None:
        assert_testing_force_allowed("force_status")

    # Validate model adapter
    adapters = list_model_adapters()
    valid_keys = [a["adapter_key"] for a in adapters]
    if req.model_adapter not in valid_keys:
        raise HTTPException(status_code=400, detail=f"Unknown model adapter: {req.model_adapter}")

    cursor = db.cursor()
    cursor.execute("SELECT * FROM video_instance_nodes WHERE id = ?", (node_id,))
    node = cursor.fetchone()
    if not node:
        raise HTTPException(status_code=404, detail="Video node not found")

    # Check batch not archived
    cursor.execute("SELECT status FROM batch_tasks WHERE id = ?", (node["batch_id"],))
    batch = cursor.fetchone()
    if batch and batch["status"] == "archived":
        raise HTTPException(status_code=400, detail="Archived batch cannot be generated")

    # Skip success nodes unless forced
    if node["status"] == "success" and not req.force:
        return {
            "node_id": node_id,
            "status": "success",
            "skipped": True,
        }

    if node["status"] != "success" and not req.force:
        pass  # normal generate

    node_dict = dict(node)
    if req.prompt is not None:
        node_dict["prompt"] = req.prompt
    result = run_mock_generation_for_node(
        cursor, node_dict,
        batch_id=node["batch_id"],
        instance_id=node["instance_id"],
        product_id=node["product_id"],
        template_id=node["template_id"],
        force_status=req.force_status,
        model_adapter=req.model_adapter,
    )
    apply_instance_status(cursor, node["instance_id"])
    apply_batch_status(cursor, node["batch_id"])
    db.commit()

    return {
        "node_id": node_id,
        "status": result["status"],
        "job_id": result["job_id"],
        "video_url": result.get("video_url"),
        "cover_url": result.get("cover_url"),
        "skipped": result.get("skipped", False),
    }


# --- Node Retry ---

@app.post("/api/v1/video-nodes/{node_id}/retry")
def retry_video_node(node_id: str, req: VideoNodeRetryRequest, db: sqlite3.Connection = Depends(get_db)):
    if req.force_status is not None:
        assert_testing_force_allowed("force_status")

    cursor = db.cursor()
    cursor.execute("SELECT * FROM video_instance_nodes WHERE id = ?", (node_id,))
    node = cursor.fetchone()
    if not node:
        raise HTTPException(status_code=404, detail="Video node not found")

    if node["status"] != "failed":
        raise HTTPException(status_code=400, detail=f"Only failed nodes can be retried. Current status: {node['status']}")

    cursor.execute("SELECT status FROM batch_tasks WHERE id = ?", (node["batch_id"],))
    batch = cursor.fetchone()
    if batch and batch["status"] == "archived":
        raise HTTPException(status_code=400, detail="Archived batch cannot be retried")

    node_dict = dict(node)
    if req.prompt is not None:
        node_dict["prompt"] = req.prompt
    result = run_mock_generation_for_node(
        cursor, node_dict,
        batch_id=node["batch_id"],
        instance_id=node["instance_id"],
        product_id=node["product_id"],
        template_id=node["template_id"],
        force_status=req.force_status if req.force_status else "success",
        model_adapter=req.model_adapter,
    )
    apply_instance_status(cursor, node["instance_id"])
    apply_batch_status(cursor, node["batch_id"])
    db.commit()

    return {
        "node_id": node_id,
        "status": result["status"],
        "job_id": result["job_id"],
        "attempt_no": result["attempt_no"],
        "video_url": result.get("video_url"),
        "cover_url": result.get("cover_url"),
    }


# --- Generation Job Queries ---

@app.get("/api/v1/video-generation-jobs/{job_id}")
def get_generation_job(job_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM video_generation_jobs WHERE id = ?", (job_id,))
    job = cursor.fetchone()
    if not job:
        raise HTTPException(status_code=404, detail="Generation job not found")

    return {
        "job_id": job["id"],
        "batch_id": job["batch_id"],
        "instance_id": job["instance_id"],
        "node_id": job["node_id"],
        "shot_key": job["shot_key"],
        "status": job["status"],
        "model_name": job["model_name"],
        "model_version": job["model_version"],
        "output_video_url": job["output_video_url"],
        "output_cover_url": job["output_cover_url"],
        "error_message": job["error_message"],
        "adapter_key": job["adapter_key"],
        "provider_name": job["provider_name"],
        "provider_job_id": job["provider_job_id"],
        "provider_status": job["provider_status"],
        "prompt_version": job["prompt_version"],
        "cost_estimate": job["cost_estimate"],
        "request_payload_summary": job["request_payload_summary"],
        "response_payload_summary": job["response_payload_summary"],
        "attempt_no": job["attempt_no"],
        "retry_of_job_id": job["retry_of_job_id"],
    }


@app.get("/api/v1/video-nodes/{node_id}/jobs")
def list_node_jobs(node_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM video_instance_nodes WHERE id = ?", (node_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Video node not found")

    cursor.execute(
        "SELECT * FROM video_generation_jobs WHERE node_id = ? ORDER BY attempt_no",
        (node_id,),
    )
    jobs = [
        {
            "job_id": r["id"],
            "status": r["status"],
            "adapter_key": r["adapter_key"],
            "provider_name": r["provider_name"],
            "provider_job_id": r["provider_job_id"],
            "provider_status": r["provider_status"],
            "model_name": r["model_name"],
            "model_version": r["model_version"],
            "cost_estimate": r["cost_estimate"],
            "attempt_no": r["attempt_no"],
            "retry_of_job_id": r["retry_of_job_id"],
            "output_video_url": r["output_video_url"],
            "error_message": r["error_message"],
            "created_at": r["created_at"],
            "completed_at": r["completed_at"],
        }
        for r in cursor.fetchall()
    ]
    return {"node_id": node_id, "jobs": jobs}


# ==================== MVP-3 Sprint 4: Preview, Review, Export ====================

# --- Schemas ---

class MergePreviewRequest(BaseModel):
    force: bool = False

class NodeReviewRequest(BaseModel):
    action: str  # "approve" | "reject"
    reason: str = ""

class InstanceReviewRequest(BaseModel):
    action: str
    reason: str = ""

class ExportRequest(BaseModel):
    force: bool = False

# --- Merge Preview ---

@app.post("/api/v1/video-instances/{instance_id}/merge-preview")
def create_merge_preview(instance_id: str, req: MergePreviewRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    ok, reason = can_merge_preview(cursor, instance_id)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)

    # Check if already merged
    cursor.execute("SELECT * FROM video_instances WHERE id = ?", (instance_id,))
    inst = cursor.fetchone()
    if inst["draft_preview_url"] and not req.force:
        return {
            "instance_id": instance_id,
            "merge_status": inst["merge_status"],
            "draft_preview_url": inst["draft_preview_url"],
            "draft_cover_url": inst["draft_cover_url"],
            "skipped": True,
            "review_status": inst["review_status"],
        }

    result = run_mock_merge_preview(cursor, instance_id, inst["batch_id"])
    db.commit()
    return {
        "instance_id": instance_id,
        "merge_status": result["status"],
        "draft_preview_url": result["draft_preview_url"],
        "draft_cover_url": result["draft_cover_url"],
        "merge_job_id": result["merge_job_id"],
        "skipped": False,
        "review_status": "pending",
    }


# --- Node Review ---

@app.post("/api/v1/video-nodes/{node_id}/review")
def review_video_node(node_id: str, req: NodeReviewRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    try:
        result = review_node(cursor, node_id, req.action, req.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    return result


# --- Instance Batch Review ---

@app.post("/api/v1/video-instances/{instance_id}/review")
def review_video_instance(instance_id: str, req: InstanceReviewRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM video_instances WHERE id = ?", (instance_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Instance not found")
    try:
        result = review_instance_nodes(cursor, instance_id, req.action, req.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()
    return result


# --- Review Records ---

@app.get("/api/v1/video-instances/{instance_id}/reviews")
def list_instance_reviews(instance_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM video_instances WHERE id = ?", (instance_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Instance not found")
    cursor.execute(
        "SELECT * FROM review_records WHERE instance_id = ? ORDER BY created_at DESC",
        (instance_id,),
    )
    reviews = [
        {
            "review_id": r["id"],
            "target_type": r["target_type"],
            "target_id": r["target_id"],
            "action": r["action"],
            "previous_status": r["previous_status"],
            "new_status": r["new_status"],
            "reason": r["reason"],
            "reviewer": r["reviewer"],
            "created_at": r["created_at"],
        }
        for r in cursor.fetchall()
    ]
    return {"instance_id": instance_id, "reviews": reviews}


# --- Export ---

@app.post("/api/v1/video-instances/{instance_id}/export")
def export_video_instance(instance_id: str, req: ExportRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    ok, reason = can_export_instance(cursor, instance_id)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)

    cursor.execute("SELECT * FROM video_instances WHERE id = ?", (instance_id,))
    inst = cursor.fetchone()
    if inst["export_status"] == "success" and not req.force:
        return {
            "instance_id": instance_id,
            "export_status": inst["export_status"],
            "final_video_url": inst["final_video_url"],
            "skipped": True,
        }

    result = run_mock_export(cursor, instance_id, inst["batch_id"])
    db.commit()
    return {
        "instance_id": instance_id,
        "export_status": result["status"],
        "final_video_url": result["final_video_url"],
        "export_job_id": result["export_job_id"],
        "skipped": False,
    }


# --- Job Queries ---

@app.get("/api/v1/export-jobs/{export_job_id}")
def get_export_job(export_job_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM export_jobs WHERE id = ?", (export_job_id,))
    job = cursor.fetchone()
    if not job:
        raise HTTPException(status_code=404, detail="Export job not found")
    return {
        "export_job_id": job["id"],
        "instance_id": job["instance_id"],
        "status": job["status"],
        "final_video_url": job["final_video_url"],
        "attempt_no": job["attempt_no"],
    }


@app.get("/api/v1/video-merge-jobs/{merge_job_id}")
def get_merge_job(merge_job_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM video_merge_jobs WHERE id = ?", (merge_job_id,))
    job = cursor.fetchone()
    if not job:
        raise HTTPException(status_code=404, detail="Merge job not found")
    return {
        "merge_job_id": job["id"],
        "instance_id": job["instance_id"],
        "status": job["status"],
        "output_preview_url": job["output_preview_url"],
        "output_cover_url": job["output_cover_url"],
    }


# ==================== MVP-4 Sprint 8: Model Gateway ====================

@app.get("/api/v1/model-gateway/adapters")
def get_model_adapters():
    return {"adapters": list_model_adapters()}


# --- Frontend model settings ---
@app.get("/api/v1/model-settings")
def get_model_settings():
    adapters = list_model_adapters()
    default = next((a for a in adapters if a.get("default")), adapters[0] if adapters else None)
    return {
        "current_adapter": default["adapter_key"] if default else "mock",
        "current_model": "mock_image_to_video",
        "adapters": adapters,
    }


if __name__ == "__main__":
    import uvicorn
    # Start on port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
