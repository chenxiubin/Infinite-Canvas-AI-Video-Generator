# 15_MVP-3_Sprint2_视频模板与实例链实现记录

> 状态：已完成
> 对应规划：`docs/prd/13_MVP-3_真实业务生产闭环规划.md` Sprint 2

## 1. Sprint 2 目标

实现"产品素材包 → 选择视频模板 → 创建 batch → 生成 ProductInstance →
生成 6 个 InstanceNode → 自动绑定素材 role → 应用 motion fallback"的最小闭环。

## 2. 新增数据表

### video_templates

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `tpl_desk_calendar_default` 等 |
| template_key | TEXT UNIQUE | `desk_calendar_default` / `wall_calendar_default` |
| product_type | TEXT | `desk_calendar` / `wall_calendar` |
| template_name | TEXT | 模板名称 |
| description | TEXT | |
| total_duration_seconds | INTEGER | 26 |
| status | TEXT | active / archived |
| created_at / updated_at | REAL | |

### template_shots

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | |
| template_id | TEXT FK | → video_templates.id |
| shot_key | TEXT | S01_main ~ S06_brand |
| shot_name | TEXT | |
| shot_order | INTEGER | 1-6 |
| duration_seconds | INTEGER | 3-5 |
| required_asset_role | TEXT | main/detail1/detail2/motion/scene/brand |
| prompt_template | TEXT | 图生视频提示词 |
| is_required | INTEGER | 1 |
| requires_review | INTEGER | 0/1 |

### video_instances

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `ins_xxxxxxxx` |
| batch_id | TEXT | → batch_tasks.id |
| product_id | TEXT FK | → products.id |
| template_id | TEXT | → video_templates.id |
| product_type | TEXT | |
| sku | TEXT | |
| status | TEXT | pending/running/completed/failed |
| merged_video_url | TEXT | 本阶段 NULL |
| created_at / updated_at | REAL | |

### video_instance_nodes

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | `vnode_xxxxxxxx` |
| instance_id | TEXT FK | → video_instances.id |
| batch_id | TEXT | |
| product_id | TEXT FK | → products.id |
| template_id | TEXT | |
| shot_key | TEXT | S01_main ~ S06_brand |
| shot_name | TEXT | |
| shot_order | INTEGER | 1-6 |
| duration_seconds | INTEGER | |
| required_asset_role | TEXT | |
| bound_asset_id | TEXT | → product_assets.id |
| bound_asset_role | TEXT | 实际绑定的素材 role |
| bound_asset_source | TEXT | direct / fallback_from_scene / fallback_from_main |
| prompt | TEXT | 最终提示词 |
| status | TEXT | pending/running/success/failed |
| video_url | TEXT | 本阶段 NULL |
| error_message | TEXT | 本阶段 NULL |

## 3. 默认模板

### 台历 (desk_calendar_default)

| shot_key | shot_name | 时长 | role |
|----------|-----------|------|------|
| S01_main | 台历主视觉展示 | 4s | main |
| S02_detail1 | 纸张与印刷细节 | 4s | detail1 |
| S03_detail2 | 支架装订与内页结构 | 4s | detail2 |
| S04_motion | 桌面翻页运镜 | 5s | motion |
| S05_scene | 新年书房/办公桌场景 | 5s | scene |
| S06_brand | 品牌尾帧与卖点收束 | 4s | brand |

总时长: 26s

### 挂历 (wall_calendar_default)

| shot_key | shot_name | 时长 | role |
|----------|-----------|------|------|
| S01_main | 挂历主视觉展示 | 4s | main |
| S02_detail1 | 画面印刷与纸张细节 | 4s | detail1 |
| S03_detail2 | 挂孔装订与尺寸结构 | 4s | detail2 |
| S04_motion | 墙面悬挂运镜 | 5s | motion |
| S05_scene | 客厅/玄关新年场景 | 5s | scene |
| S06_brand | 品牌尾帧与节庆收束 | 4s | brand |

总时长: 26s

## 4. 素材绑定规则

| shot_key | 绑定 role | fallback 链 |
|----------|----------|-------------|
| S01_main | main | — |
| S02_detail1 | detail1 | — |
| S03_detail2 | detail2 | — |
| S04_motion | motion | → scene → main |
| S05_scene | scene | — |
| S06_brand | brand | — |

## 5. Video Batch 主表说明

1. Sprint 2 **没有新增 `video_batches` 表**。
2. 当前复用旧 `batch_tasks` 作为 video batch 主表。
3. `batch_tasks` 存储：
   - `id` — batch_id
   - `status` — ready / running / completed / partially_completed / failed
   - `total_count` — 产品数量
   - `completed_count`
   - `failed_count`
   - `canvas_id` — 占位值 `"mvp3_auto"`
4. `template_id` 和 `product_type` 当前不在 `batch_tasks` 行级存储。
5. `template_id` 存储在 `video_instances.template_id`（per-instance）。
6. `product_type` 存储在 `video_instances.product_type`（per-instance）。
7. `GET /api/v1/video-batches/{batch_id}` 通过 `batch_tasks` JOIN `video_instances` 聚合返回完整批次信息。
8. 当前约束：同一个 video batch 内所有 instances 必须来自同一个 template 和同一个 product_type（创建时校验）。
9. 后续 Sprint 3 如果需要更强的 batch 级调度，可以评估是否给 `batch_tasks` 增加 nullable 的 `template_id` / `product_type` 字段，Sprint 2 暂不强制。

## 6. API 列表

| Method | Path | 用途 |
|--------|------|------|
| GET | /api/v1/video-templates | 模板列表 |
| GET | /api/v1/video-templates/{id} | 模板详情（含 shots） |
| POST | /api/v1/video-batches | 创建视频批次 |
| GET | /api/v1/video-batches/{id} | 批次详情 |
| GET | /api/v1/video-instances/{id} | 实例详情（含 nodes） |
| GET | /api/v1/video-nodes/{id} | 节点详情 |

## 7. 测试用例

29 个，位于 `backend/tests/test_video_templates.py`

全部通过。全部后端 66 条通过。E2E 14 条通过。npm test 通过。

## 8. 当前不做

- 不调用真实模型
- 不生成真实视频
- 不做审核面板
- 不做复杂 UI

## 9. 已知风险

- `build_prompt` 当前模板不含占位符，实际字符串替换为空操作；后续模板升级时需要同步添加 `{product_type}`、`{sku}` 等占位符
- video_instances 和 MVP-2 instances 是两套独立的表，批量任务统一用 batch_tasks
