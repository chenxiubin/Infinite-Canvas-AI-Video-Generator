# 16_MVP-3_Sprint3_Mock生成与状态流转实现记录

> 状态：已完成

## 1. Sprint 3 目标

把 Sprint 2 的 pending 节点推进到可执行的 Mock 图生视频生成状态机：batch / instance / node 状态联动、单节点重跑、可控失败注入。

## 2. 新增数据表

### video_generation_jobs

生成任务留痕表，记录每次生成/重试。

| 字段 | 说明 |
|------|------|
| id | job_id |
| batch_id / instance_id / node_id | 关联 |
| status | queued / running / success / failed |
| model_name / model_version | mock_image_to_video / mock-v1 |
| output_video_url / output_cover_url | Mock 输出 |
| attempt_no | 第几次尝试 |
| retry_of_job_id | 指向上一次失败 job |

### video_instance_nodes 新增字段

- job_id — 最新 job
- cover_url
- retry_count
- completed_at

## 3. 状态机

| 层级 | 状态 |
|------|------|
| video_instance_nodes | pending → running → success / failed |
| video_instances | pending → running → completed / failed |
| batch_tasks | ready → running → completed / partially_completed / failed |

## 4. 新增 API

| Method | Path | 用途 |
|--------|------|------|
| POST | /api/v1/video-batches/{id}/generate | 批量生成 |
| POST | /api/v1/video-nodes/{id}/generate | 单节点生成 |
| POST | /api/v1/video-nodes/{id}/retry | 重跑失败节点 |
| GET | /api/v1/video-generation-jobs/{id} | 查询 job |
| GET | /api/v1/video-nodes/{id}/jobs | 节点 job 历史 |

## 5. 安全规则

TESTING=false 时：force_node_statuses / force_status → 403
TESTING=true 时：允许失败注入

## 6. 测试

23 个测试用例。全部后端 89 条通过。E2E 14 条通过。

## 7. 当前不做

不接真实模型、不做视频合成、不做审核面板。

## 8. 已知风险

- Mock 为同步执行；后续替换真实异步模型需调整
- video_instances 无 partially_completed（CHECK 约束），混合状态上报为 failed
