## 修改需求

### 需求: 使用 SillyTavern Preset JSON 配置互动 ordered prompts

互动插入器必须支持用完整 SillyTavern Preset JSON 作为互动生成的 ordered prompt 配置来源。

#### 场景: 导入 SillyTavern 原生预设 JSON

- **当** 用户在互动插入器设置中导入一个 SillyTavern 原生 Preset JSON
- **那么** 系统必须保存该 Preset JSON
- **并且** 后续互动生成必须按该 Preset JSON 的 `prompt_order[].order[]` 构建 `generateRaw.ordered_prompts`

#### 场景: 导出可导入 SillyTavern 的预设 JSON

- **当** 用户导出互动插入器当前预设
- **那么** 系统必须导出完整 SillyTavern Preset JSON
- **并且** 该 JSON 必须使用 `prompts[].identifier` 和 `prompt_order[].order[].identifier` 表达提示词身份与顺序

#### 场景: 转换原生占位符

- **当** Preset JSON 中启用的 prompt `identifier` 是 SillyTavern 原生占位符
- **那么** 系统必须将其转换为 `generateRaw.ordered_prompts` 支持的占位符字符串

#### 场景: 转换普通提示词

- **当** Preset JSON 中启用的 prompt 是普通提示词或系统提示词且包含内容
- **那么** 系统必须按原始 `role` 和展开后的 `content` 转换为 RolePrompt

#### 场景: 支持互动历史扩展节点

- **当** Preset JSON 中存在启用的 `iiInteractionHistory` 扩展节点
- **那么** 系统必须在该位置插入当前互动历史 RolePrompt

#### 场景: 支持用户输入扩展节点

- **当** Preset JSON 中存在启用的 `iiUserInput` 扩展节点
- **那么** 系统必须在该位置插入 `user_input`

#### 场景: 缺少用户输入节点时保底追加

- **当** Preset JSON 转换结果中不存在 `user_input`
- **那么** 系统必须在 ordered prompts 末尾追加 `user_input`

### 需求: 模式提示词宏互斥展开

互动插入器必须提供三种模式提示词宏，并保证同一轮生成中只有当前模式宏展开为非空文本。

#### 场景: 当前场景模式

- **当** 当前互动模式是当前场景
- **那么** `{{ii_scene_prompt}}` 必须展开为当前场景提示词
- **并且** `{{ii_private_prompt}}` 和 `{{ii_remote_prompt}}` 必须展开为空字符串

#### 场景: 一对一模式

- **当** 当前互动模式是一对一
- **那么** `{{ii_private_prompt}}` 必须展开为一对一提示词
- **并且** `{{ii_scene_prompt}}` 和 `{{ii_remote_prompt}}` 必须展开为空字符串

#### 场景: 远程通信模式

- **当** 当前互动模式是远程通信
- **那么** `{{ii_remote_prompt}}` 必须展开为远程通信提示词
- **并且** `{{ii_scene_prompt}}` 和 `{{ii_private_prompt}}` 必须展开为空字符串
