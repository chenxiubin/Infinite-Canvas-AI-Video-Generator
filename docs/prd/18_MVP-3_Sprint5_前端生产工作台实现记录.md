# 18_MVP-3_Sprint5_前端生产工作台实现记录

> 状态：已完成

## 1. Sprint 5 目标

在浏览器中跑通完整视频生产闭环：创建产品 → 登记素材 → 确认 role → checklist → 选择模板 → 创建 batch → mock 生成 → 节点状态查看 → merge preview → approve/reject → export → final_video_url。

## 2. 新增文件

| 文件 | 用途 |
|------|------|
| `frontend/src/api/mvp3.ts` | 全部 MVP-3 API 封装（22 个函数） |
| `frontend/src/components/ProductionWorkbench.tsx` | 生产工作台主组件（5 个区块） |
| `frontend/tests/mvp3_workbench.spec.ts` | E2E 测试 |

## 3. 修改文件

| 文件 | 变更 |
|------|------|
| `frontend/src/App.tsx` | 新增"生产工作台"按钮 + showWorkbench 状态切换 |
| `frontend/package.json` | 新增 `test:e2e:mvp3` 脚本 |

## 4. 页面结构（5 个区块）

1. 产品素材包 — 创建产品、Demo 按钮、登记素材、确认 role、checklist
2. 视频模板 — 查询/选择模板
3. 视频批次 — 创建 batch、Generate Batch
4. 节点状态 — 6 个 nodes 状态 + retry
5. 预览/审核/导出 — merge preview、approve/reject per-node、Approve All、export

## 5. E2E

`npm run test:e2e:mvp3` 运行 M3-Happy 全链路测试。

## 6. 已知局限

- 不使用无限画布交互
- 不做真实文件上传
- UI 为功能导向，未美化
