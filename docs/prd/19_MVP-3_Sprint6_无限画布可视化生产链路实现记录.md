# 19_MVP-3_Sprint6_无限画布可视化生产链路实现记录

> 状态：已完成

## 1. Sprint 6 目标

将生产工作台的业务链路以画布形式可视化展示：batch → instances → 6 nodes → 状态/审核/导出。

## 2. 新增组件

- `ProductionCanvasView.tsx` — 画布主视图（缩放/平移/节点展示）
- `CanvasNodeDetailPanel.tsx` — 节点详情面板（审核/retry/信息查看）

## 3. 修改文件

- `ProductionWorkbench.tsx` — 新增工作台/画布视图切换
- `backend/app/main.py` — instance detail 接口补充 review_status + error_message

## 4. 画布布局

S01 → S02 → S03 → S04 → S05 → S06 横向排列，箭头连线，缩放支持。

## 5. 状态颜色

| status | 颜色 |
|--------|------|
| pending | 灰 |
| running | 蓝 |
| success | 绿 |
| failed | 红 |

## 6. E2E

2 条 pass（happy path + empty state）。

## 7. 原则

画布不存储业务坐标，不新增后端画布表。
