## 上下文

`generateRaw` 接收的 `ordered_prompts` 是窄格式：原生占位符字符串和 `{ role, content }`。

SillyTavern 实际导出的 Preset JSON 是顶层设置字段加 `prompts`、`prompt_order`、`extensions` 等结构。prompt 身份字段是 `identifier`，启用状态和排序主要来自 `prompt_order[].order[]`。

本变更不把互动预设注册到酒馆预设列表，也不通过 `preset_name` 加载酒馆预设。互动插入器把 Preset JSON 作为自己的 ordered prompt 配置文件读写，并在生成前转换为 `generateRaw.ordered_prompts`。

## 目标

- 导出的互动预设 JSON 能直接导入 SillyTavern 预设界面。
- SillyTavern 现成预设 JSON 能导入互动插入器。
- 插入器保留自己的提示词内容配置，作为宏展开的数据源。
- 三种模式提示词宏互斥展开，避免同一轮请求同时注入多个模式提示词。

## 数据模型

设置继续保存在脚本变量 `interactionInserterSettings` 中，`preset` 字段保存完整 SillyTavern Preset JSON。

默认 Preset JSON 包含：

- 原生占位符：`worldInfoBefore`、`personaDescription`、`charDescription`、`charPersonality`、`scenario`、`worldInfoAfter`、`dialogueExamples`、`chatHistory`
- 普通提示词：通用提示词宏、当前模式提示词宏、上下文提示词宏
- 插入器扩展节点：`iiInteractionHistory`、`iiUserInput`
- `prompt_order`：使用 `identifier` 排序并控制启用状态

插入器扩展节点仍是合法普通 preset prompt，因此文件可以导入 SillyTavern。插入器导入时按 `identifier` 或 `extra.interactionInserter.type` 识别它们。

## 转换规则

转换器优先读取 `preset.prompt_order`：

- 优先选择包含 `personaDescription` 的 order。
- 如果不存在，则使用第一组 order。
- 如果 `prompt_order` 缺失或为空，才按 `preset.prompts` 数组顺序处理。

转换每个启用节点时：

- `prompt_order[].order[].enabled === false` 的 prompt 跳过。
- 原生占位符 `identifier` 映射为 `generateRaw` 占位符字符串。
- 普通 prompt 和系统 prompt 映射为 `{ role, content }`。
- `iiInteractionHistory` 映射为当前互动历史的多条 RolePrompt。
- `iiUserInput` 映射为 `'user_input'`。
- 如果最终结果不含 `'user_input'`，在末尾追加 `'user_input'`。
- content 为空且不是扩展节点的普通 prompt 跳过，避免空 system 消息污染请求。

## 宏展开

转换器不依赖 SillyTavern 全局宏注册即可工作。生成前对普通 prompt content 执行插入器本地宏展开：

- `{{ii_common_prompt}}`
- `{{ii_scene_prompt}}`
- `{{ii_private_prompt}}`
- `{{ii_remote_prompt}}`
- `{{ii_context_prompt}}`

三种模式宏互斥：当前 session 模式对应宏返回配置文本，另外两个返回空字符串。

后续如果需要让同一份预设在 SillyTavern 主聊天中也能展开这些宏，可以再注册全局宏；第一步优先保证互动插入器生成路径稳定。

## UI

设置界面保留“模式提示词”作为宏数据源；新增“互动预设 JSON”区域：

- 导入：选择本地 `.json` 文件，读取 Preset JSON 并保存到脚本变量。
- 导出：将当前 Preset JSON 下载为 `.json` 文件。
- 恢复默认：恢复内置默认 Preset JSON。

## 风险

- 现成 SillyTavern 预设可能缺少 `user_input` 概念。通过默认追加 `user_input` 保底。
- SillyTavern Preset JSON 字段较多，插入器只消费 `prompts` 和 `prompt_order`，但保存时保留未知字段，避免破坏导入来源。
- SillyTavern 预设排序语义在插入器中以 `prompt_order` 为准；当缺少 `prompt_order` 时才简化为 `prompts` 数组顺序。
