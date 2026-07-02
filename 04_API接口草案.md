# 04_API接口草案

> 风格：RESTful，均以 `/api/v1` 为前缀。本草案为 MVP 阶段接口范围，字段以《03_数据模型与状态定义.md》为准，命名可在开发阶段微调。

## 1. 模板管理

### 创建/更新分镜模板
`POST /api/v1/templates`
```json
{
  "product_id": "hanging_calendar",
  "name": "挂历标准链",
  "nodes": [
    { "node_key": "S01_main", "node_type": "shot", "role_key": "main", "duration": 4, "shot_size": "中景", "camera_move": "缓慢推进", "is_fixed": false },
    { "node_key": "S06_brand", "node_type": "shot", "role_key": "brand_end", "duration": 3.5, "is_fixed": true }
  ],
  "edges": [
    { "from_node_key": "S01_main", "to_node_key": "S02_detail1", "transition_type": "交叉溶解", "transition_duration": 0.3 }
  ]
}
```
响应：`{ "template_id": "tpl_xxx" }`

### 获取模板列表 / 详情
`GET /api/v1/templates?product_id=hanging_calendar`
`GET /api/v1/templates/{template_id}`

### 删除模板
`DELETE /api/v1/templates/{template_id}`

## 2. 素材需求清单

### 配置清单
`PUT /api/v1/products/{product_id}/checklist`
```json
{
  "items": [
    { "role_key": "main", "role_name": "主图-正面", "bound_node_key": "S01_main", "content_requirement": "产品完整正面，干净背景", "composition_suggestion": "中景，居中构图" }
  ]
}
```

### 获取清单及到位状态（按批次）
`GET /api/v1/batches/{batch_id}/checklist-status`
返回每个 `instance` 下各角色的 `pending` / `fulfilled` 状态，供画布展示"待补充"标记。

## 3. 画布与产品链实例

### 创建画布
`POST /api/v1/canvases` → `{ "canvas_id": "cv_xxx" }`

### 从模板克隆生成产品链实例（单条）
`POST /api/v1/canvases/{canvas_id}/instances`
```json
{ "template_id": "tpl_xxx", "product_sku": "SKU2027-A01" }
```

### 批量克隆（拖拽多组素材触发）
`POST /api/v1/canvases/{canvas_id}/instances/batch`
```json
{
  "template_id": "tpl_xxx",
  "products": [
    { "product_sku": "SKU2027-A01", "asset_group_id": "ag_001" },
    { "product_sku": "SKU2027-A02", "asset_group_id": "ag_002" }
  ]
}
```
响应：`{ "batch_id": "bt_xxx", "instance_ids": ["ins_001", "ins_002"] }`

### 获取产品链实例详情（含节点状态）
`GET /api/v1/instances/{instance_id}`

## 4. 素材管理

### 批量上传素材
`POST /api/v1/assets/upload`（multipart，支持多文件）
响应返回每个文件的 `asset_id` 及按命名规则自动识别的 `role_key`（识别失败则为 `null`，需人工标注）

### 素材角色绑定/修正
`PUT /api/v1/instances/{instance_id}/nodes/{node_key}/asset-binding`
```json
{ "asset_id": "asset_xxx", "source_type": "uploaded" }
```

### 素材分组（一个产品的一整套素材）
`POST /api/v1/asset-groups`
```json
{ "product_sku": "SKU2027-A01", "asset_ids": ["asset_001", "asset_002", "asset_003"] }
```

## 5. AI 生成节点

> 与图生视频/图片生成模型的实际调用见《09_AI生成接口占位说明.md》，此处为平台内部封装的业务接口。

### 触发生成候选
`POST /api/v1/instances/{instance_id}/nodes/{node_key}/generate-candidates`
```json
{ "reference_asset_id": "asset_main_001", "style": "节日氛围", "composition": "居中留白" }
```
响应：`{ "job_id": "gj_xxx", "status": "candidates_generating" }`

### 查询候选结果
`GET /api/v1/generation-jobs/{job_id}`
```json
{ "status": "pending_selection", "candidates": [{ "candidate_id": "c1", "preview_url": "..." }] }
```

### 选定候选（锁定）
`POST /api/v1/instances/{instance_id}/nodes/{node_key}/select-candidate`
```json
{ "candidate_id": "c1" }
```

## 6. 分镜生成与批量任务

### 提交生成（单链）
`POST /api/v1/instances/{instance_id}/generate`

### 提交生成（批量）
`POST /api/v1/batches/{batch_id}/generate`

### 查询批量任务进度
`GET /api/v1/batches/{batch_id}`
```json
{
  "status": "running",
  "summary": { "total": 20, "completed": 14, "generating": 3, "failed": 3 },
  "items": [{ "instance_id": "ins_001", "status": "completed" }]
}
```

### 单节点重跑
`POST /api/v1/instances/{instance_id}/nodes/{node_key}/retry`

## 7. 合成与导出

### 触发合成（Merge 节点自动执行，也支持手动重触发）
`POST /api/v1/instances/{instance_id}/merge`

### 导出成片
`POST /api/v1/instances/{instance_id}/export`
```json
{ "platform_preset": "douyin_9_16" }
```
响应：`{ "export_job_id": "ex_xxx" }`

### 查询导出结果
`GET /api/v1/export-jobs/{export_job_id}`
```json
{ "status": "success", "output_url": "https://.../final.mp4" }
```

### 批量导出
`POST /api/v1/batches/{batch_id}/export`

## 8. 通用说明

- 所有 `generate` / `export` 类接口均为**异步**，立即返回 `job_id`，客户端轮询或接入 WebSocket 推送状态变更（MVP 阶段先轮询，V1 视性能情况升级为推送）
- 错误响应统一结构：`{ "error_code": "string", "message": "string" }`
- 鉴权、限流、分页参数（`page` / `page_size`）等基础规范按团队现有后端规范执行，本草案不重复定义
