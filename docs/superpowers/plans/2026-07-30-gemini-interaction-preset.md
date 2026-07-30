# Gemini 3 Flash 互动预设结构优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过重定义互动历史用途、调整提示词顺序和补充近端正例，降低 Gemini 3 Flash 的固定演出与文风回音。

**Architecture:** 只修改 tavern_sync 预设源条目和 YAML 排序。保留完整互动历史用于事实连续性，但不允许将模型旧回复自动视为角色文风范本；few-shot 移到互动记录后作为最终生成前的近端示范。

**Tech Stack:** Tavern Sync YAML、UTF-8 文本条目、JSON bundle

## Global Constraints

- 目标模型固定为 Gemini 3 Flash。
- 不限制角色合理创作、权能与既定行为逻辑。
- 不加入某种具体文学风格要求。
- 不修改互动器 TypeScript 代码。
- 不调用模型测试，由用户手动测试。

---

### Task 1: 重定义表达依据和历史用途

**Files:**
- Modify: `tavern_sync/互动插入器预设/条目/😀人格补充.txt`
- Modify: `tavern_sync/互动插入器预设/条目/💬对白质感.txt`
- Modify: `tavern_sync/互动插入器预设/条目/🛑后置约束.txt`
- Modify: `tavern_sync/互动插入器预设/条目/🧠生成前检查.txt`

**Interfaces:**
- Consumes: 角色卡、主剧情、当前互动记录
- Produces: 区分“事实连续性”与“表面表达模仿”的系统规则

- [ ] **Step 1: 修改表达依据**

将角色卡中的明确对白保留为可靠表达依据；将模型生成的互动记录限定为事实、关系和状态依据。

- [ ] **Step 2: 加入回应强度匹配**

要求定义、纠错、确认和选择分别先完成本轮实际任务，普通问题不自动触发重大异象、关系升级或下一阶段催促。

- [ ] **Step 3: 加入静默检查**

检查是否复用了上一轮的括号模板、昵称、反问结尾或戏剧升级，并在不影响连续性的情况下删除。

### Task 2: 更新近端正确示例

**Files:**
- Modify: `tavern_sync/互动插入器预设/条目/📚正确示例.txt`

**Interfaces:**
- Consumes: Task 1 的表达与历史规则
- Produces: Gemini 3 Flash 可直接模仿的自然回应样本

- [ ] **Step 1: 保留通用示例**

保留不同人物、模式和媒介的短互动示例，确保示例事实不进入当前世界。

- [ ] **Step 2: 增加三类针对性示例**

加入高位非人意识回答定义、角色纠正自己先前说满的话、玩家要求“全都要”时角色落实可行方案的示例。示例应以台词为主体，最多一处有实际作用的非对白描写。

### Task 3: 调整预设顺序并生成 JSON

**Files:**
- Modify: `tavern_sync/互动插入器预设/互动插入器预设.yaml`
- Generate: `tavern_sync/互动插入器预设/互动插入器预设.json`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的源条目
- Produces: 可导入的最新互动插入器预设 JSON

- [ ] **Step 1: 移动 few-shot**

在 YAML 中将 `📚正确示例.txt` 移到互动记录之后、生成前检查与后置约束之前。

- [ ] **Step 2: 运行 bundle**

Run:

```powershell
node tavern_sync.mjs bundle 互动插入器预设
```

Expected: 输出“成功将预设”并生成 `互动插入器预设.json`。

- [ ] **Step 3: 静态核对**

使用 PowerShell 解析 JSON，确认 few-shot 位于互动历史之后、最终用户输入之前，用户输入为最后一个启用项，且关键规则存在。

- [ ] **Step 4: 检查差异**

Run:

```powershell
git diff --check
git status --short
```

Expected: 无空白错误，只显示本轮预期文件。
