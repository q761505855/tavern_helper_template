## 为什么

互动插入器当前在设置界面中直接维护通用提示词和三种模式提示词，并在代码里硬编码 `generateRaw.ordered_prompts` 顺序。这样不利于复用酒馆预设生态，也难以让高级用户灵活调整 prompt 顺序、角色、启用状态和宏组合。

需要让互动插入器的 ordered prompt 配置使用酒馆原生 Preset JSON 结构：导出的文件可以直接导入酒馆预设，酒馆现成预设也可以导入插入器作为互动生成预设。

## 变更内容

- 新增互动插入器预设配置，采用完整酒馆 Preset JSON 结构保存。
- 内置一个默认互动插入器预设，包含原生占位符、插入器宏提示词、互动历史和用户输入扩展节点。
- 设置界面支持导入、导出、恢复默认互动预设 JSON。
- 生成时将 Preset JSON 转换为 `generateRaw.ordered_prompts`。
- 支持插入器扩展节点 `iiInteractionHistory` 和 `iiUserInput`。
- 支持模式提示词宏互斥展开：同一轮生成中仅当前模式宏有值。
- 保留插入器自己的提示词内容配置作为宏数据来源。

## 功能 (Capabilities)

### 新增功能

### 修改功能

- `interaction-inserter`: 互动生成提示词配置从代码硬编码顺序扩展为可导入导出的酒馆 Preset JSON，并通过宏和扩展节点控制 ordered prompts。

## 影响

- 修改 `src/interaction-inserter/store.ts` 的设置结构、宏数据来源、生成前 ordered prompts 构建逻辑。
- 修改 `src/interaction-inserter/App.vue` 的设置界面，增加预设 JSON 导入导出入口。
- 可能新增纯函数模块和轻量测试脚本，用于验证 Preset JSON 到 `ordered_prompts` 的转换规则。
- 构建产物 `publish/interaction-inserter/index.js` 需要重新生成。
