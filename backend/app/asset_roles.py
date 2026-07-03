"""
MVP-3: Asset role inference from filename.

Canonical role keys (MVP-3 standard):
    main, detail1, detail2, scene, motion, brand, unrecognized

Old MVP-1/MVP-2 aliases (detail_1, detail_2, brand_end) are accepted as input
but the stored role_key is always canonical.
"""

import re
from typing import Tuple

# Canonical role keys for MVP-3
CANONICAL_ROLES = {"main", "detail1", "detail2", "scene", "motion", "brand"}

# Old-to-new role_key migration mapping (kept for input compatibility)
_ROLE_MIGRATION = {
    "detail_1": "detail1",
    "detail_2": "detail2",
    "brand_end": "brand",
    "detail_image_1": "detail1",
    "detail_image_2": "detail2",
    "main_image": "main",
}

# Keyword-based recognition rules: canonical_role -> [keywords]
# Keywords are matched case-insensitively against the filename stem (without extension).
_ROLE_KEYWORDS: dict[str, list[str]] = {
    "main": [
        "main", "cover", "hero",
        "主图", "首图", "封面",
    ],
    "detail1": [
        "detail1", "detail_1", "detail-1",
        "material", "paper", "print", "texture",
        "材质", "纸张", "印刷", "细节1", "细节图1",
    ],
    "detail2": [
        "detail2", "detail_2", "detail-2",
        "structure", "binding", "stand", "hook", "inner",
        "结构", "装订", "支架", "挂孔", "内页", "细节2", "细节图2",
    ],
    "scene": [
        "scene", "usage", "environment",
        "desk", "wall",
        "场景", "使用", "书房", "桌面", "墙面", "玄关",
    ],
    "motion": [
        "motion", "movement", "flip", "pan",
        "运镜", "翻页", "动态", "运动",
    ],
    "brand": [
        "brand", "logo", "end", "tail",
        "品牌", "尾帧", "logo",
    ],
}


def canonicalize_role(role_key: str) -> str:
    """Convert any role_key (old or new) to the canonical MVP-3 form.

    Returns the canonical role_key, or the original string if unrecognized.
    """
    if not role_key:
        return ""
    key = role_key.strip().lower()
    if key in CANONICAL_ROLES:
        return key
    if key in _ROLE_MIGRATION:
        return _ROLE_MIGRATION[key]
    return role_key  # return as-is so caller can handle unrecognized


def infer_asset_role(filename: str) -> Tuple[str, float]:
    """Infer the asset role_key from a filename.

    Args:
        filename: Original filename, e.g. "SKU2027-A01_main.jpg"

    Returns:
        Tuple of (role_key, confidence):
        - role_key: canonical role_key, or "unrecognized"
        - confidence: 0.0 to 1.0 indicating match confidence
    """
    if not filename:
        return ("unrecognized", 0.0)

    # Strip extension and work with lowercase stem
    stem = re.sub(r"\.[^.]+$", "", filename).lower()

    best_role = "unrecognized"
    best_score = 0.0

    for role, keywords in _ROLE_KEYWORDS.items():
        # Exact keyword match anywhere in the stem
        for kw in keywords:
            kw_lower = kw.lower()
            if kw_lower in stem:
                # Score: longer keyword match = higher confidence
                score = len(kw_lower) / max(len(stem), 1)
                if score > best_score:
                    best_score = score
                    best_role = role

    # Clamp confidence
    if best_role == "unrecognized":
        return ("unrecognized", 0.0)

    # Scale: multiple keyword matches increase confidence
    # Check if any other keyword for the same role also matches
    extra_hits = sum(
        1 for kw in _ROLE_KEYWORDS.get(best_role, [])
        if kw.lower() in stem and kw.lower() != ""
    )
    confidence = min(0.65 + (extra_hits - 1) * 0.15, 0.98)

    return (best_role, round(confidence, 2))


def compute_checklist(
    assets_by_role: dict[str, list[dict]],
    role_confirmed_map: dict[str, bool],
) -> dict:
    """Compute asset completeness checklist for a product.

    Args:
        assets_by_role: dict mapping canonical role_key -> list of asset dicts
        role_confirmed_map: dict mapping canonical role_key -> bool (all confirmed for that role)

    Returns:
        Checklist dict with:
        - missing_required_roles: roles with ZERO assets at all
        - unconfirmed_required_roles: roles with assets but none confirmed
        - is_ready: True only when all required roles are present AND confirmed
    """
    required_roles = ["main", "detail1", "detail2", "scene", "brand"]
    recommended_roles = ["motion"]

    missing_required = []      # No assets at all
    unconfirmed_required = []  # Assets exist but none confirmed
    missing_recommended = []
    duplicate_roles = []
    unrecognized_assets = assets_by_role.get("unrecognized", [])

    for role in required_roles:
        assets = assets_by_role.get(role, [])
        if not assets:
            missing_required.append(role)
        else:
            if len(assets) > 1:
                duplicate_roles.append(role)
            if not role_confirmed_map.get(role, False):
                unconfirmed_required.append(role)

    for role in recommended_roles:
        assets = assets_by_role.get(role, [])
        if not assets:
            missing_recommended.append(role)

    # Build fallback plan for missing motion
    fallback_plan = {}
    if "motion" in missing_recommended:
        scene_assets = assets_by_role.get("scene", [])
        main_assets = assets_by_role.get("main", [])
        if scene_assets and (len(scene_assets) == 1 or role_confirmed_map.get("scene")):
            fallback_plan["motion"] = {
                "source_role": "scene",
                "fallback_source": "fallback_from_scene",
            }
        elif main_assets and (len(main_assets) == 1 or role_confirmed_map.get("main")):
            fallback_plan["motion"] = {
                "source_role": "main",
                "fallback_source": "fallback_from_main",
            }

    is_ready = (len(missing_required) == 0 and len(unconfirmed_required) == 0)

    return {
        "required_roles": required_roles,
        "recommended_roles": recommended_roles,
        "missing_required_roles": missing_required,
        "unconfirmed_required_roles": unconfirmed_required,
        "missing_recommended_roles": missing_recommended,
        "duplicate_roles": duplicate_roles,
        "unrecognized_assets": [
            {"asset_id": a.get("id", ""), "filename": a.get("original_filename", "")}
            for a in unrecognized_assets
        ],
        "is_ready": is_ready,
        "fallback_plan": fallback_plan,
    }


def compute_product_status(assets_by_role: dict, role_confirmed_map: dict) -> str:
    """Derive the product status from its assets.

    Returns one of: draft, incomplete, asset_ready
    """
    total_assets = sum(len(v) for v in assets_by_role.values())
    if total_assets == 0:
        return "draft"

    checklist = compute_checklist(assets_by_role, role_confirmed_map)
    if checklist["is_ready"]:
        return "asset_ready"
    return "incomplete"
