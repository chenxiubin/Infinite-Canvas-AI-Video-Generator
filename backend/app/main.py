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
except ImportError:
    from asset_roles import (
        infer_asset_role, canonicalize_role, CANONICAL_ROLES,
        compute_checklist, compute_product_status,
    )

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
DB_FILE = os.path.join(BASE_DIR, "db.sqlite3")
STATIC_DIR = os.path.join(BASE_DIR, "static")
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


if __name__ == "__main__":
    import uvicorn
    # Start on port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
