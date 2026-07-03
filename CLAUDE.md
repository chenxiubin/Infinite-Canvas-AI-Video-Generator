# CLAUDE.md — 无限画布 AI 视频生成平台

## 项目概述

- **项目名称**：无限画布 AI 视频生成平台
- **当前阶段**：MVP-2（批量生产能力）收尾
- **技术栈**：FastAPI (Python) 后端 + React + Vite + Zustand + React Flow 前端
- **后端端口**：127.0.0.1:8000
- **前端端口**：127.0.0.1:5173

## 协作规矩（不可违反）

### 1. "已完成"三个字的可信标准
只有当代码物理写完并保存、本地编译/运行正常、且自动化测试真实运行过并留有实际日志（不是转述、不是预期结果），才能说"已完成"。如果只是方案设计完成、代码还没动，必须如实说明真实进度，不要用"已完成"这个词。

### 2. 证据留痕，不接受空口结论
任何测试判定"通过"之前，必须提供证据——UI状态用截图，接口行为用实际请求/响应或数据库查询结果，不能只给"测试通过"这几个字。

### 3. 对抗性验证，不是确认式验证
验证一个功能时，主动去找能让它失败的操作路径（尤其是"是否真的阻断/隔离/校验"这类用例），找不到反例才能判定通过；找到问题要如实报告，不能淡化或归为边缘情况。

### 4. 不为了让测试通过而修改测试本身
除非能证明是测试代码写错了逻辑（不是被测功能有问题），否则不能放宽断言、跳过断言，或者用 force 点击这类方式绕过真实的交互限制去让测试变绿。

### 5. 发现问题只报告，不擅自顺手修复
除非明确要求"发现问题直接修"，否则先给问题清单，等确认优先级和处理方式，避免失去对"这版代码到底有多少真实问题"的准确判断。

### 6. 报告里不下"是否可以进入下一阶段"这类结论性判断
如实汇报验证结果和风险即可，是否批准进入下一步，决定权在用户，不需要替用户下结论或者说"完全获批"之类的话。

### 7. 安全校验必须和功能接口同时诞生
任何新增的接口，如果涉及测试专用参数（比如 force_status 这类）或者绕过正常业务校验的能力，安全限制必须在这个接口第一次被创建时就接入，不能先做功能、后面再补安全校验，哪怕UI还没有暴露这个入口。

### 8. 批量/并发场景下的数据一致性要用原子操作
涉及计数类字段的更新（比如批次的成功数/失败数），要用数据库原子操作而不是"先读后写"，并且要有并发场景下的测试验证，不能只测单次串行场景。

### 9. 文档中的参数格式约定必须与代码实现和测试完全一致
文档中出现的字段/参数格式约定（比如 "instance_id:node_key" 这种复合key格式），必须在代码实现和测试代码里保持完全一致。如果测试代码里使用的格式跟实际业务代码解析的格式不同，即使测试"通过"了，也不能证明该功能是正确的——因为很可能测试根本没有触达真正验证格式匹配的那行代码。

## 项目文档索引

根目录下的产品文档：
- `01_产品边界说明.md` — 产品边界
- `02_页面结构与用户流程.md` — 页面流程
- `03_数据模型与状态定义.md` — 数据模型、状态机定义
- `04_API接口草案.md` — API 草案
- `05_MVP开发阶段拆分.md` — MVP 阶段拆分
- `06_UI交互规则.md` — UI 交互规则
- `07_素材角色与分镜模板规则.md` — 素材角色、模板规则
- `08_审核与导出规则.md` — 审核导出规则
- `09_AI生成接口占位说明.md` — AI 生成接口占位
- `10_开发验收标准.md` — 开发验收标准
- `11_MVP-1_自测脚本.md` — MVP-1 自测脚本
- `docs/prd/12_MVP-2_自测脚本.md` — MVP-2 自测脚本（G/H/I/J/K 全部用例权威定义）
- `docs/prd/13_MVP-3_真实业务生产闭环规划.md` — MVP-3 完整规划
- `docs/prd/14_MVP-3_Sprint1_产品素材包实现记录.md` — MVP-3 Sprint 1 实现记录
- `docs/prd/15_MVP-3_Sprint2_视频模板与实例链实现记录.md` — MVP-3 Sprint 2 实现记录
- `docs/prd/16_MVP-3_Sprint3_Mock生成与状态流转实现记录.md` — MVP-3 Sprint 3 实现记录
- `docs/prd/17_MVP-3_Sprint4_草稿合成审核导出前置实现记录.md` — MVP-3 Sprint 4 实现记录
- `docs/prd/18_MVP-3_Sprint5_前端生产工作台实现记录.md` — MVP-3 Sprint 5 实现记录
- `docs/prd/19_MVP-3_Sprint6_无限画布可视化生产链路实现记录.md` — MVP-3 Sprint 6 实现记录
- `docs/prd/20_MVP-3_Sprint7_体验整理与Demo流程实现记录.md` — MVP-3 Sprint 7 实现记录

（以下文档在当前阶段不再单独维护，MVP-2的实现决策和验证记录以 12_MVP-2_自测脚本.md + 代码本身 + 对话记录为准）
- `tech_debt_log.md` — 技术债记录（已知技术债已吸收进本节"已知技术债"章节）
- `implementation_plan.md` — MVP-2 实现方案（历史文件）
- `self_test_report_sprint*.md` — 各 Sprint 自测报告（历史文件）

## 测试命令

```bash
# 运行后端单元测试（安全校验，两种 TESTING 模式均可）
cd backend && python -m unittest discover -s tests -v

# TESTING=false 全量回归（含 K2-a 安全拦截验证，不含 K2-b）
cd frontend && npx playwright test --grep "G1|G2|H1|H2|H3|I1|I2|I3|I4|J1|J3|J4|K1|K2-a"

# TESTING=true 全量回归（含 K2-b 隔离性验证，不含 K2-a）
cd frontend && npx playwright test --grep "G1|G2|H1|H2|H3|I1|I2|I3|I4|J1|J3|J4|K1|K2-b"

# 运行单个测试
cd frontend && npx playwright test --grep "K1"
```

环境说明：
- **TESTING=false**（默认）：安全拦截生效。K2-a 验证 403 拦截；K2-b 会明确报错"需要 TESTING=true"
- **TESTING=true**：安全拦截解除。K2-a 在此模式下会失败（预期行为，因为 403 被绕过）
- K2-a/K2-b 分别独立报告结果，不能混为一谈："K2-a Pass" = 安全拦截生效，"K2-b Pass" = 隔离性逻辑正确
- 两条全量回归命令都跑通，才能说全部用例通过

启动命令：
```bash
# 后端（需要先 cd backend && rm -f app/db.sqlite3 清库）
cd backend && TESTING=false python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端
cd frontend && npx vite --host 127.0.0.1 --port 5173
```

注意：curl 测试时需要 `--noproxy "*"` 绕过本地代理。

## 已知技术债（2026-07-02）

1. **UPDATE rowcount 检查**：backend/app/main.py 中 20 处 UPDATE 语句均无 rowcount 检查（详见下方清单）。本次已修复高风险 2 处（`bind_asset_to_node`、`select_ai_candidate` auto-bind），剩余 17 处待分批修复。

2. **instanceId 单实例模型限制**：Zustand store 的 `instanceId` 假设画布上只有一个活跃实例。批量克隆后多个实例共存时，依赖 `instanceId` 的操作可能指向错误实例。本次通过 `resolveInstanceIdFromNode()` 辅助函数和 `BatchDashboard.handleItemClick` 设置了局部缓解，但多实例工作区需要 V1 重新设计。

3. **run_batch_item_bg 串行节点生成**：Fix B 后批量路径的每个节点单独生成（N×3s），比旧的批量 SET 方式慢（3s 总共）。对于 MVP mock 阶段可接受，正式对接真实 AI 模型时需要实现节点级并发。
