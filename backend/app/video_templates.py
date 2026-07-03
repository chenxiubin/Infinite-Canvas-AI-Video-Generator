"""
MVP-3 Sprint 2: Video templates and instance chain generation.

Provides default desk_calendar and wall_calendar templates with 6 shots each,
and helper functions for building product instance chains from templates.
"""

import uuid
import time
import sqlite3

# Canonical role keys (consistent with Sprint 1)
CANONICAL_ROLES = {"main", "detail1", "detail2", "scene", "motion", "brand"}

# ---------- Default Template Definitions ----------

DESK_CALENDAR_SHOTS = [
    {
        "shot_key": "S01_main",
        "shot_name": "台历主视觉展示",
        "shot_order": 1,
        "duration_seconds": 4,
        "required_asset_role": "main",
        "prompt_template": (
            "产品展示视频，台历，主视觉展示。中景，缓慢推进，居中构图。"
            "暖光节日氛围。高清晰度，产品形状稳定，文字清晰可读，无变形无乱码。"
            "保持产品图案不变，保持产品文字不变，保持日期数字不变，保持印刷内容不变。"
            "不重绘产品，不新增或删除产品上的图案文字，不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": True,
    },
    {
        "shot_key": "S02_detail1",
        "shot_name": "纸张与印刷细节",
        "shot_order": 2,
        "duration_seconds": 4,
        "required_asset_role": "detail1",
        "prompt_template": (
            "产品展示视频，台历，纸张印刷细节特写。45度侧光质感。"
            "展示纸张材质、印刷质感、色彩细节。微距镜头，文字清晰不模糊不乱码。"
            "保持产品图案不变，保持产品文字不变，保持印刷内容不变。"
            "不重绘产品，不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": False,
    },
    {
        "shot_key": "S03_detail2",
        "shot_name": "支架装订与内页结构",
        "shot_order": 3,
        "duration_seconds": 4,
        "required_asset_role": "detail2",
        "prompt_template": (
            "产品展示视频，台历，支架装订结构特写。局部45度，拉镜头。"
            "展示台历支架、装订、内页翻动结构，结构清楚。"
            "保持产品图案不变，保持产品形状不变，保持印刷内容不变。"
            "不改变产品结构形状，不让文字乱码。"
        ),
        "is_required": True,
        "requires_review": False,
    },
    {
        "shot_key": "S04_motion",
        "shot_name": "桌面翻页运镜",
        "shot_order": 4,
        "duration_seconds": 5,
        "required_asset_role": "motion",
        "prompt_template": (
            "产品展示视频，台历，桌面翻页运镜展示。全景，平移镜头，自然光。"
            "展示桌面场景里的轻微翻页或镜头移动。产品主体稳定。"
            "保持产品图案不变，保持产品文字不变，图案文字不变形。"
            "不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": True,
    },
    {
        "shot_key": "S05_scene",
        "shot_name": "新年书房/办公桌场景",
        "shot_order": 5,
        "duration_seconds": 5,
        "required_asset_role": "scene",
        "prompt_template": (
            "产品展示视频，台历，使用场景展示。中远景，移镜头，自然光。"
            "展示台历在书桌、办公桌、书房里的使用场景。真实商业摄影风格，新年节日氛围。"
            "保持产品图案不变，保持产品文字不变，保持产品形状不变。"
            "不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": False,
    },
    {
        "shot_key": "S06_brand",
        "shot_name": "品牌尾帧与卖点收束",
        "shot_order": 6,
        "duration_seconds": 4,
        "required_asset_role": "brand",
        "prompt_template": (
            "产品展示视频，台历，品牌尾帧收束。全景，静止镜头，演播室光。"
            "品牌LOGO收尾，礼品感，卖点收束。画面稳定，尾帧简洁高级。"
            "保持产品图案不变，保持产品文字不变，保持印刷内容不变。"
            "不重绘产品，不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": True,
    },
]

WALL_CALENDAR_SHOTS = [
    {
        "shot_key": "S01_main",
        "shot_name": "挂历主视觉展示",
        "shot_order": 1,
        "duration_seconds": 4,
        "required_asset_role": "main",
        "prompt_template": (
            "产品展示视频，挂历，主视觉展示。中景，缓慢推进，居中构图。"
            "暖光节日氛围。高清晰度，产品形状稳定，文字清晰可读，无变形无乱码。"
            "保持产品图案不变，保持产品文字不变，保持日期数字不变，保持印刷内容不变。"
            "不重绘产品，不新增或删除产品上的图案文字，不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": True,
    },
    {
        "shot_key": "S02_detail1",
        "shot_name": "画面印刷与纸张细节",
        "shot_order": 2,
        "duration_seconds": 4,
        "required_asset_role": "detail1",
        "prompt_template": (
            "产品展示视频，挂历，画面印刷细节特写。侧光质感。"
            "展示画面印刷精度、纸张纹理细节。文字清晰不模糊不乱码。"
            "保持产品图案不变，保持产品文字不变，保持印刷内容不变。"
            "不重绘产品，不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": False,
    },
    {
        "shot_key": "S03_detail2",
        "shot_name": "挂孔装订与尺寸结构",
        "shot_order": 3,
        "duration_seconds": 4,
        "required_asset_role": "detail2",
        "prompt_template": (
            "产品展示视频，挂历，挂孔装订结构特写。局部45度，拉镜头。"
            "展示挂孔、装订结构、尺寸感知。结构清楚。"
            "保持产品图案不变，保持产品形状不变，保持印刷内容不变。"
            "不改变产品结构形状，不让文字乱码。"
        ),
        "is_required": True,
        "requires_review": False,
    },
    {
        "shot_key": "S04_motion",
        "shot_name": "墙面悬挂运镜",
        "shot_order": 4,
        "duration_seconds": 5,
        "required_asset_role": "motion",
        "prompt_template": (
            "产品展示视频，挂历，墙面悬挂运镜展示。全景，摇镜头，自然光。"
            "展示挂历整体展开、悬挂全景摇镜。产品主体稳定。"
            "保持产品图案不变，保持产品文字不变，图案文字不变形。"
            "不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": True,
    },
    {
        "shot_key": "S05_scene",
        "shot_name": "客厅/玄关新年场景",
        "shot_order": 5,
        "duration_seconds": 5,
        "required_asset_role": "scene",
        "prompt_template": (
            "产品展示视频，挂历，使用场景展示。中远景，移镜头，自然光。"
            "展示挂历在客厅墙面、玄关的陈列场景。真实商业摄影风格，新年节日氛围。"
            "保持产品图案不变，保持产品文字不变，保持产品形状不变。"
            "不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": False,
    },
    {
        "shot_key": "S06_brand",
        "shot_name": "品牌尾帧与节庆收束",
        "shot_order": 6,
        "duration_seconds": 4,
        "required_asset_role": "brand",
        "prompt_template": (
            "产品展示视频，挂历，品牌尾帧收束。全景，静止镜头，演播室光。"
            "品牌LOGO收尾，节庆氛围，卖点收束。画面稳定，尾帧简洁高级。"
            "保持产品图案不变，保持产品文字不变，保持印刷内容不变。"
            "不重绘产品，不让文字乱码，不让产品主体变形。"
        ),
        "is_required": True,
        "requires_review": True,
    },
]

TEMPLATE_DEFS = {
    "desk_calendar_default": {
        "product_type": "desk_calendar",
        "template_name": "台历默认视频模板",
        "description": "6 镜头标准台历电商展示视频模板，总时长 26 秒",
        "shots": DESK_CALENDAR_SHOTS,
    },
    "wall_calendar_default": {
        "product_type": "wall_calendar",
        "template_name": "挂历默认视频模板",
        "description": "6 镜头标准挂历电商展示视频模板，总时长 26 秒",
        "shots": WALL_CALENDAR_SHOTS,
    },
}


def ensure_default_video_templates(cursor):
    """Seed default video templates if they don't exist.
    Idempotent — skips if template_key already present.
    """
    for template_key, defn in TEMPLATE_DEFS.items():
        cursor.execute(
            "SELECT id FROM video_templates WHERE template_key = ?",
            (template_key,),
        )
        if cursor.fetchone():
            continue  # Already exists

        tpl_id = f"tpl_{template_key}"
        now = time.time()
        total_dur = sum(s["duration_seconds"] for s in defn["shots"])
        cursor.execute(
            """INSERT INTO video_templates
            (id, template_key, product_type, template_name, description,
             total_duration_seconds, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)""",
            (tpl_id, template_key, defn["product_type"], defn["template_name"],
             defn["description"], total_dur, now, now),
        )
        for shot in defn["shots"]:
            sid = f"shot_{template_key}_{shot['shot_key']}"
            cursor.execute(
                """INSERT INTO template_shots
                (id, template_id, shot_key, shot_name, shot_order,
                 duration_seconds, required_asset_role, prompt_template,
                 is_required, requires_review, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (sid, tpl_id, shot["shot_key"], shot["shot_name"],
                 shot["shot_order"], shot["duration_seconds"],
                 shot["required_asset_role"], shot["prompt_template"],
                 int(shot["is_required"]), int(shot["requires_review"]),
                 now, now),
            )


def get_asset_for_role(product_id: str, role_key: str, cursor) -> dict | None:
    """Get the best confirmed asset for a role on a product.

    Returns the earliest confirmed asset. If multiple confirmed assets exist
    for the same role, returns the first by created_at.
    """
    cursor.execute(
        """SELECT * FROM product_assets
        WHERE product_id = ? AND role_key = ? AND role_confirmed = 1
        ORDER BY created_at ASC LIMIT 1""",
        (product_id, role_key),
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def resolve_motion_asset(product_id: str, cursor) -> tuple[dict | None, str]:
    """Resolve the asset for S04_motion with fallback.

    Returns (asset_dict, source_tag) where source_tag is one of:
    'direct', 'fallback_from_scene', 'fallback_from_main'.
    """
    # 1. Try direct motion
    asset = get_asset_for_role(product_id, "motion", cursor)
    if asset:
        return asset, "direct"

    # 2. Fallback to scene
    asset = get_asset_for_role(product_id, "scene", cursor)
    if asset:
        return asset, "fallback_from_scene"

    # 3. Fallback to main
    asset = get_asset_for_role(product_id, "main", cursor)
    if asset:
        return asset, "fallback_from_main"

    return None, "none"


def build_prompt(template: str, product_type: str, sku: str, shot_key: str) -> str:
    """Build the final prompt by injecting minimal variables."""
    product_type_cn = "台历" if product_type == "desk_calendar" else "挂历"
    return template.replace("{product_type}", product_type_cn).replace("{sku}", sku).replace("{shot_key}", shot_key)
