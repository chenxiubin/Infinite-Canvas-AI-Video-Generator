# 14_MVP-3_Sprint1_产品素材包实现记录

> 状态：已完成
> 对应规划：`docs/prd/13_MVP-3_真实业务生产闭环规划.md` Sprint 1
> 代码版本：本地（尚未 push）

## 1. Sprint 1 目标

实现"创建产品 → 上传/登记素材 → 自动识别 role_key → 人工确认 role →
检查素材完整度 → 查询产品素材包状态"的最小闭环。

## 2. 新增数据表

### products

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `prod_xxxxxxxx` |
| product_type | TEXT | `desk_calendar` / `wall_calendar` |
| sku | TEXT UNIQUE | 产品 SKU |
| title | TEXT | 产品名称 |
| description | TEXT | 可选描述 |
| status | TEXT | draft / incomplete / asset_ready / archived |
| created_at | REAL | |
| updated_at | REAL | |

### product_assets

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `pa_xxxxxxxx` |
| product_id | TEXT FK | 关联 products.id |
| role_key | TEXT | main / detail1 / detail2 / scene / motion / brand / unrecognized |
| original_filename | TEXT | 原始文件名 |
| file_url | TEXT | 文件路径/URL |
| mime_type | TEXT | |
| file_size | INTEGER | |
| width | INTEGER | |
| height | INTEGER | |
| role_confidence | REAL | 0.0~1.0 |
| role_source | TEXT | auto / manual |
| role_confirmed | INTEGER | 0/1 |
| fallback_source | TEXT | direct / fallback_from_scene / fallback_from_main |
| created_at | REAL | |
| updated_at | REAL | |

## 3. 新增模块

`backend/app/asset_roles.py` — 素材角色推断与校验模块

### 函数

| 函数 | 用途 |
|------|------|
| `infer_asset_role(filename)` | 从文件名自动识别 role_key + 置信度 |
| `canonicalize_role(role_key)` | 旧别名 → 规范名（detail_1→detail1 等） |
| `compute_checklist(assets_by_role, role_confirmed_map)` | 计算素材完整度 |
| `compute_product_status(assets_by_role, role_confirmed_map)` | 根据素材状态推导产品状态 |

## 4. role_key 统一规则

规范名（存储到数据库的值）：

- `main` / `detail1` / `detail2` / `scene` / `motion` / `brand` / `unrecognized`

兼容的旧别名（输入时自动转换）：

- `detail_1` → `detail1`
- `detail_2` → `detail2`
- `brand_end` → `brand`
- `main_image` → `main`
- 等

## 5. 自动识别规则

按文件名关键词匹配，大小写不敏感。详见 `asset_roles.py` 中的 `_ROLE_KEYWORDS` 字典。

支持中英文关键词：main/主图/封面 → main, detail1/材质/纸张/印刷 → detail1,
detail2/结构/装订/挂孔 → detail2, scene/场景/书房/桌面 → scene,
motion/运镜/翻页 → motion, brand/尾帧/logo → brand。

未匹配 → `unrecognized`, confidence=0。

## 6. 人工确认流程

1. 素材上传时自动识别 role_key → `role_source=auto`, `role_confirmed=false`
2. 调用 `PUT /api/v1/products/{id}/assets/{id}/role` → `role_source=manual`, `role_confirmed=true`
3. Checklist 检查 required roles 时要求 `role_confirmed=true` 才算到位

## 7. Checklist 规则

- required_roles: main, detail1, detail2, scene, brand
- recommended_roles: motion
- `missing_required_roles`: 完全没有素材的 required role
- `unconfirmed_required_roles`: 有素材但未确认的 required role
- 所有 required roles 已存在且已确认 → `is_ready=true`
- 只缺 motion 不阻断 ready
- 重复 role 时提示 `duplicate_roles`
- 无法识别的文件在 `unrecognized_assets` 中提示

**语义区分**：

| 字段 | 含义 | 示例场景 |
|------|------|---------|
| `missing_required_roles` | 该 role 没有任何素材 | 根本没上传 detail1 的图片 |
| `unconfirmed_required_roles` | 有素材但 role_confirmed=false | 上传了 main 但未经人工确认 |

示例：只上传 main 但未确认：

```json
{
  "missing_required_roles": ["detail1", "detail2", "scene", "brand"],
  "unconfirmed_required_roles": ["main"],
  "is_ready": false
}
```

## 8. Motion fallback 规则

- motion 存在 → 直接使用 (fallback_source=direct)
- motion 缺失 + scene 存在 → fallback_from_scene
- motion + scene 都缺失 + main 存在 → fallback_from_main
- 记录在 checklist 的 `fallback_plan` 中

## 9. API 列表

| Method | Path | 用途 |
|--------|------|------|
| POST | /api/v1/products | 创建产品 |
| GET | /api/v1/products | 查询产品列表（支持 product_type/status 过滤） |
| GET | /api/v1/products/{id} | 查询产品详情（含 assets + checklist） |
| PATCH | /api/v1/products/{id}/status | 更新产品状态 |
| POST | /api/v1/products/{id}/assets | 登记素材（自动识别 role） |
| PUT | /api/v1/products/{id}/assets/{aid}/role | 手动确认/修改 role |
| GET | /api/v1/products/{id}/checklist | 查询素材完整度 checklist |

## 10. 测试用例

33 个测试用例，位于 `backend/tests/test_product_assets.py`：

- TestProductCreation: 5 个（创建台历/挂历、非法类型、重复 SKU、空 SKU）
- TestAssetRoleInference: 12 个（各 role 关键词识别、中文关键词、旧别名兼容、未识别、auto 默认未确认、404）
- TestManualRoleConfirmation: 3 个（手动确认、非法 role、资产不存在）
- TestChecklist: 9 个（未确认→missing/unconfirmed 分离、仅 main 未确认、全部上传未确认、全部确认→就绪、缺 motion→就绪、fallback to scene、fallback to main、重复 role）
- TestProductListAndStatus: 4 个（列表、类型过滤、归档、详情含 assets+checklist）

全部 33 条通过。

## 11. 当前不做范围

- 不做 multipart 文件上传（使用 file_url 登记）
- 不做无限画布 UI
- 不做模板设计器
- 不做批量生成链路
- 不做真实图生视频模型接入
- 不修改 MVP-2 测试逻辑

## 12. 已知风险

- SQLite CHECK 约束在旧版本 SQLite 中可能不生效（仅用于文档目的）
- 产品状态更新分散在多个 API handler 中，后续可抽取为统一的状态同步函数
- `init_db()` 使用了新表，但与旧表完全独立，不影响 MVP-2 功能
