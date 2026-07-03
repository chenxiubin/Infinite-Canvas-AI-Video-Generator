# Infinite Canvas AI Video Generator

基于无限画布可视化交互的 AI 电商视频批量生成平台 MVP。

**当前版本**：v0.3-mvp-demo

## 支持产品

- `desk_calendar`：新年台历
- `wall_calendar`：新年挂历

## 核心能力

- 产品素材包（创建/登记/role自动识别/人工确认/checklist/motion fallback）
- 视频模板（台历/挂历各 6 分镜节点，26s 总时长）
- Mock 图生视频生成（batch/node generate/failed retry/skip success/状态机联动）
- 审核导出（merge preview/review records/approve reject/mock export）
- 前端生产工作台（一键 Demo/状态总览/步骤日志/工作台画布切换）
- 无限画布可视化（节点展示/详情面板/approve reject/zoom）

## 快速启动

### 后端

```bash
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

如遇端口占用（WinError 10013），换端口并同步修改 `frontend/vite.config.ts` proxy：

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

访问：`http://127.0.0.1:5173`

## Demo 操作

1. 打开页面 → 工具栏点击「生产工作台」
2. 点击「一键运行 Demo」
3. 等待状态总览完成
4. 切换到「画布视图」查看节点

## 测试

```bash
npm run test
```

可选：

```bash
npm run test:e2e:mvp3        # 工作台 E2E
npm run test:e2e:mvp3:canvas # 画布 E2E
npm run test:e2e:mvp3:demo   # Demo E2E
```

## 当前限制

- Mock 生成，不接真实模型
- 不做真实视频合成/下载
- 不做真实文件上传
- 仅用于 MVP 演示
