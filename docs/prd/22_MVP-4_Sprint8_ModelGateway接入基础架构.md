# 22_MVP-4_Sprint8_ModelGateway接入基础架构

> 状态：已完成

## 1. Sprint 8 目标

在 mock 生成之上新增可扩展 Model Gateway 架构，支持后续接入真实图生视频模型。

## 2. Architecture

```
video_instance_node → generate request → model_gateway → adapter (mock / external_http) → provider job → video_generation_job → node status
```

## 3. Adapters

| Key | Provider | Default | Status |
|-----|----------|---------|--------|
| mock | mock | Yes | Always configured |
| external_http | custom | No | Needs env vars |

## 4. New module

- `backend/app/model_gateway.py` — adapter registry + submit

## 5. video_generation_jobs new fields

adapter_key, provider_name, provider_job_id, provider_status, prompt_version, submitted_at, polled_at

## 6. New APIs

- GET /api/v1/model-gateway/adapters
- GET /api/v1/model-settings

## 7. Generate API extension

model_adapter field on batch generate, node generate, retry

## 8. Tests

12 tests in test_model_gateway.py. Backend 136 total OK.

## 9. Security

No API keys in code. Mock is default. external_http fails safely when unconfigured.
