# 17_MVP-3_Sprint4_草稿合成审核导出前置实现记录

> 状态：已完成

## 1. Sprint 4 目标

把生成成功的 mock 视频节点推进到"草稿合成预览 + 人工审核 + 正式导出前置"的交付链路。

## 2. 新增表

- `video_merge_jobs` — 草稿合成 job
- `review_records` — 审核历史记录
- `export_jobs` — 导出 job

## 3. ALTER TABLE

- `video_instance_nodes`: +review_status, review_reason, reviewed_at, requires_review
- `video_instances`: +draft_preview_url, draft_cover_url, merge_status, review_status, export_status, final_video_url, reviewed_at, exported_at

## 4. API

| Method | Path | 用途 |
|--------|------|------|
| POST | /api/v1/video-instances/{id}/merge-preview | 创建草稿合成 |
| POST | /api/v1/video-nodes/{id}/review | 审核节点 |
| POST | /api/v1/video-instances/{id}/review | 批量审核 |
| GET | /api/v1/video-instances/{id}/reviews | 审核历史 |
| POST | /api/v1/video-instances/{id}/export | 创建导出 |
| GET | /api/v1/export-jobs/{id} | 查询导出 job |
| GET | /api/v1/video-merge-jobs/{id} | 查询合成 job |

## 5. 核心规则

- 所有 nodes success → 可 merge preview
- merge preview → review_status=pending
- success node → 可 approve/reject
- 全部 approved → instance review_status=approved → 可 export
- node retry/regenerate → 清空 delivery state (draft/final URLs, merge/export status)
- archived batch → 禁止 merge/review/export

## 6. 测试

22 个用例。全部后端 117 条通过。E2E 14 条通过。

## 7. 已知风险

- Mock 无真实视频拼接
- ALTER TABLE 幂等（try/except）
