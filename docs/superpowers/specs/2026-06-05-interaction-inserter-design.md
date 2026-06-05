# 剧情中途互动插入器 Design

## Goal

制作一个轻量 Tavern Helper 脚本，让玩家能在主线剧情中途打开独立悬浮面板，与指定角色进行一段更细粒度的对话或行动互动；互动结束后，插件把完整互动记录插入主聊天，作为后续主线剧情和 `SP·数据库 III` 的正文素材。

V1 的重点不是自动理解正文，而是验证这条体验链路：

1. 主线剧情正常生成。
2. 玩家在某个剧情节点开启独立互动。
3. 玩家在面板中和某个对象进行多轮互动。
4. 玩家手动结束互动并合并。
5. 插件向主聊天插入一条普通可见 `user` 楼层，包含完整互动记录和数据库提取提示。
6. 后续主线生成能顺着互动事实推进。
7. `SP·数据库 III` 后续自动更新或手动填表时，能把该楼层当作正文材料提取进长期记忆表格。

## Non-Goals For V1

- 不从正文自动提取当前场景、可交互 NPC 或远程联系人。
- 不直接调用、修改或 hook `SP·数据库 III` 的内部 API。
- 不自动触发主线生成。
- 不自动触发数据库填表。
- 不做复杂群聊编排、角色主动插话、长期互动记忆召回。
- 不修改当前角色卡、世界书、预设或数据库脚本配置。

这些能力都需要预留设计空间，但不进入第一版实现。

## Recommended Approach

采用独立 Tavern Helper 脚本，挂载一个隔离 iframe 悬浮 UI。UI 负责创建互动会话、显示流式互动、保存会话、合并到主线。AI 请求使用 `generateRaw`，以独立提示词组构造互动模式，不改变酒馆当前主线预设。

合并时使用 `createChatMessages` 创建普通可见 `user` 楼层。插入位置默认是聊天末尾，因为这最符合 SillyTavern 和 `SP·数据库 III` 对“最新正文素材”的读取习惯。后续可支持插入到锚点楼层之后，但 V1 避免移动历史楼层导致数据库脚本的楼层数据、自动更新范围或用户手动整理被打乱。

## Alternatives Considered

### Approach A: Hidden Or System Message Merge

将互动记录插入隐藏楼层或 system 楼层。这样更干净，不会影响聊天界面阅读。

缺点是兼容风险较高：`SP·数据库 III` 未必会把隐藏楼层或 system 楼层作为正文处理；主线模型也可能弱化这段内容。V1 目标是让主线和数据库都可靠吃到互动事实，因此不推荐默认采用。

### Approach B: Summary-Only Merge

只把互动摘要插入主聊天，完整记录留在插件变量中。

这能节省上下文，但不符合当前目标。用户明确希望详细互动记录进入主剧情，让后续主线能顺着细节推进，也让数据库脚本拥有足够原始材料做提取。因此 V1 不采用摘要-only。

### Approach C: Direct Database Integration

合并后尝试调用 `SP·数据库 III` 的内部接口或模拟按钮点击，立即触发表格更新。

这会产生强耦合。`SP·数据库 III` 版本体量大、内部 API 不稳定，并且已经 hook 主线生成前流程。V1 只把互动记录做成清晰正文素材，让数据库脚本在自己的既有更新流程中处理。后续如果脚本作者暴露稳定 API，再增加集成适配层。

## User Experience

### Entry Point

脚本加载后在酒馆页面右下角显示一个小型悬浮按钮。点击后展开主面板。

主面板 V1 包含四个区域：

- 会话列表：显示草稿、进行中、已合并会话。
- 会话设置：互动对象、互动模式、背景备注、锚点楼层。
- 对话区：以聊天形式显示用户和 AI 的互动消息，支持流式显示。
- 操作区：发送、停止生成、保存草稿、合并到主线。

### Creating A Session

用户点击“新建互动”，手动填写：

- 互动对象：自由文本，例如 `白娅`、`酒馆老板`、`远程通讯：莉莉丝`。
- 互动模式：
  - `present_private`: 当前场景的一对一私下互动。
  - `present_group`: 当前场景多人互动。
  - `remote`: 远程通讯。
- 背景备注：自由文本，用来说明这段互动发生在主线的哪个情境下。

插件记录当前最新楼层号为 `anchorMessageId`。如果没有可用楼层，则使用 `null` 并在合并记录里写成“当前聊天开头/未绑定楼层”。

### Interaction Flow

用户在面板中发送输入后，插件调用 `generateRaw`：

- `should_stream: true`
- `should_silence: true`
- 设置唯一 `generation_id`
- 使用自定义 `ordered_prompts`
- `max_chat_history` 使用设置值，默认只取较少主线历史，例如最近 8 条

流式 token 通过该 `generation_id` 归属到当前会话，避免和其他生成请求混淆。

V1 的互动 AI 不需要完美提示词。插件只提供可配置的默认提示词，强调：

- 当前是独立互动模式，不是主线大段剧情模式。
- 回复应聚焦所选互动对象和当前场景。
- 可以进行自然对话、动作反馈、短段描写。
- 不擅自推进主线大事件。
- 保持和角色卡、世界书、最近主线历史一致。

### Merge Flow

用户点击“合并到主线”后，插件生成一段“互动记录包”，调用 `createChatMessages` 插入主聊天末尾。

默认创建：

- `role: 'user'`
- `name`: 可不填，沿用酒馆默认用户名
- `is_hidden: false`
- `message`: 互动记录包正文
- `data`: 写入插件元数据，便于后续识别

合并后，会话状态改为 `merged`，记录新建楼层号。如果接口无法直接返回新楼层号，则合并前读取 `getLastMessageId()`，合并后再次读取并记录。

## Merge Record Format

V1 使用固定文本格式，兼顾人类可读、主线可读、数据库脚本可提取。

```text
<插入互动记录>
发生节点：第 {{anchorMessageId}} 楼之后
互动对象：{{targetName}}
互动模式：{{modeLabel}}
补充背景：{{backgroundNote}}

<完整互动记录>
{{transcript}}
</完整互动记录>

<数据库提取提示>
本段互动属于主线事实，请在后续数据库更新时视为已发生剧情。
重点关注：人物关系变化、承诺或约定、地点时间、物品变化、任务变化、角色心理与状态变化。
</数据库提取提示>
</插入互动记录>
```

`transcript` 使用稳定前缀：

```text
玩家：……
白娅：……
玩家：……
白娅：……
```

多人互动时使用实际 speaker：

```text
玩家：……
白娅：……
店主：……
```

V1 不让 AI 自动生成数据库指令，也不要求输出 `insertRow` 或 SQL。数据库脚本应从这段正文中自行提取。

## Data Model

插件状态存储在脚本变量中：`getVariables({ type: 'script' })` / `replaceVariables(..., { type: 'script' })`。

```ts
type InteractionMode = 'present_private' | 'present_group' | 'remote';
type InteractionStatus = 'draft' | 'active' | 'merged' | 'abandoned';

type InteractionSpeaker = 'user' | 'assistant' | 'system';

type InteractionMessage = {
  id: string;
  role: InteractionSpeaker;
  speakerName: string;
  content: string;
  createdAt: string;
};

type InteractionMergeInfo = {
  mergedMessageId?: number;
  mergedAt?: string;
  fullRecord: string;
  databaseHint: string;
};

type InteractionSession = {
  id: string;
  anchorMessageId: number | null;
  targetName: string;
  mode: InteractionMode;
  status: InteractionStatus;
  backgroundNote: string;
  messages: InteractionMessage[];
  merge?: InteractionMergeInfo;
  createdAt: string;
  updatedAt: string;

  // Reserved for future versions.
  sceneId?: string;
  participantNames?: string[];
  remoteChannel?: string;
  sourceMessageIds?: number[];
  databaseSync?: {
    expected: boolean;
    triggeredAt?: string;
    result?: 'not_supported' | 'queued' | 'completed' | 'failed';
    note?: string;
  };
  extractedFacts?: {
    summary?: string;
    relationshipChanges?: string[];
    promises?: string[];
    tasks?: string[];
    inventoryChanges?: string[];
    locationTime?: string;
  };
};

type PluginSettings = {
  maxMainHistory: number;
  defaultMode: InteractionMode;
  mergeRole: 'user';
  mergeInsertPosition: 'end';
  defaultPrompt: string;
  databaseHint: string;
};

type PluginState = {
  version: 1;
  sessions: InteractionSession[];
  activeSessionId?: string;
  settings: PluginSettings;
};
```

V1 只依赖 `targetName`、`mode`、`backgroundNote`、`messages`、`anchorMessageId`、`merge`。其他字段为后续能力保留，保存时允许为空。

## Architecture

### Script Entry

位置建议：`src/剧情互动插入器/index.ts`。

职责：

- 在 `$(() => {})` 中初始化。
- 创建隔离 iframe。
- 挂载 Vue app。
- 在 `pagehide` 时卸载 app、移除 iframe、清理事件监听。

遵循项目脚本规则：独立悬浮窗挂载到 iframe 内部，样式隔离；优先使用 Vue、Pinia、zod。

### UI Layer

建议文件：

- `src/剧情互动插入器/App.vue`
- `src/剧情互动插入器/store.ts`
- `src/剧情互动插入器/types.ts`
- `src/剧情互动插入器/interaction.ts`
- `src/剧情互动插入器/merge.ts`

UI 只调用 store action，不直接碰 Tavern Helper API。

### Store Layer

Pinia store 负责：

- 读取脚本变量并用 zod 校验。
- 提供默认设置。
- 保存会话和设置。
- 管理当前活动会话。
- 记录生成状态和流式文本。

写入变量时使用 `klona()` 去除 Vue proxy。

### Generation Service

`interaction.ts` 负责：

- 根据当前会话构造 `generateRaw` 请求。
- 使用 `generation_id` 区分流式事件。
- 监听 `STREAM_TOKEN_RECEIVED_FULLY` 或 `STREAM_TOKEN_RECEIVED_INCREMENTALLY`。
- 生成结束后写入 assistant 消息。
- 支持停止当前生成。

如果同一会话已有生成进行中，禁止再次发送。

### Merge Service

`merge.ts` 负责：

- 格式化互动记录包。
- 调用 `createChatMessages` 插入末尾。
- 回写 `mergedMessageId` 和 `mergedAt`。
- 防止重复合并：已 `merged` 的会话默认不能再次合并，除非后续版本提供“重新合并为新楼层”。

## Prompt Composition

V1 使用 `generateRaw`，推荐 ordered prompts：

1. `char_description`
2. `char_personality`
3. `scenario`
4. `world_info_before`
5. 自定义 system：互动模式说明。
6. 自定义 system：会话背景、互动对象、互动模式。
7. 自定义 assistant/user 历史：当前互动会话消息。
8. `user_input`

可以包含 `chat_history`，但默认不建议全量使用。更稳的 V1 是通过 `max_chat_history` 控制最近主线历史，并在自定义 system 中加入锚点说明和背景备注。

后续版本可以把主线历史、互动历史和世界书内容分层编排。

## Compatibility With SP·数据库 III

本插件不依赖 `SP·数据库 III` 存在。它只保证合并后的主聊天内容足够清晰，让数据库脚本在后续流程中读取。

兼容原则：

- 插入普通可见 `user` 楼层，而不是隐藏楼层。
- 不触发主线生成，避免和数据库脚本的 `TavernHelper.generate` hook 或 `GENERATION_AFTER_COMMANDS` 流程竞争。
- 不写 `insertRow`、SQL 或数据库内部标签，避免误导填表 AI。
- 用明确标签 `<插入互动记录>`、`<完整互动记录>`、`<数据库提取提示>` 帮助填表提示词识别这是一段已发生剧情。
- 保留完整互动，而不只保留摘要，给数据库脚本更多事实材料。

后续可选集成：

- 检测 `SP·数据库 III` 是否存在，只显示“数据库脚本可能会在下一次更新中处理”状态。
- 合并后提供“复制数据库重点摘要”。
- 如果数据库脚本暴露稳定 API，再添加“合并后排队数据库更新”设置。
- 将 `extractedFacts` 单独注入给数据库脚本作为辅助素材。

## Error Handling

- 变量解析失败：回退默认 state，并在控制台 `console.warn`，UI 显示“状态已重置，可继续使用”。
- AI 生成失败：保留用户输入，显示错误，可重试。
- 流式事件丢失：最终结果仍以 `generateRaw` 返回值为准。
- 合并失败：会话保持未合并状态，显示错误，可再次尝试。
- 无当前聊天或无法获取楼层：允许创建互动，但合并前提示当前没有可写入聊天。
- 重复合并：默认阻止，并提示已合并楼层。

## Testing Strategy

### Unit-Level Checks

- zod schema 能解析空变量并生成默认 state。
- merge formatter 对空背景、单人、多人的 transcript 都生成稳定格式。
- 已合并会话再次合并时被阻止。
- `mode` label 正确渲染为中文文本。

### Manual Runtime Checks

- 脚本加载后悬浮按钮出现。
- 打开面板、新建会话、刷新聊天后会话仍保存在脚本变量中。
- 发送互动时流式文本显示，并在结束后变成一条 assistant 消息。
- 点击合并后，主聊天末尾出现普通 user 楼层。
- 合并楼层内容包含完整互动记录和数据库提取提示。
- 合并后不自动触发主线生成。
- 和 `SP·数据库 III` 同时启用时，普通主线发送仍可工作。

### Build Checks

- `pnpm exec prettier --write "src/剧情互动插入器/**/*.{ts,vue}"`
- `pnpm build:dev`

## Future Design Space

### V2: Scene And Contact Awareness

通过主线提示词或世界书要求 AI 更新当前场景、在场人物、远程联系人。插件读取聊天变量或消息变量，自动展示可互动对象。

### V3: Rich Merge Modes

提供合并选项：

- 完整记录。
- 完整记录 + AI 纪要。
- 只插纪要，完整记录留插件变量。
- 插入到锚点楼层之后。
- 作为隐藏楼层或 system 楼层。

### V4: Database-Aware Assistance

在不强耦合数据库脚本的前提下，生成辅助事实清单：

- 关系变化。
- 约定。
- 任务变化。
- 物品变化。
- 地点和时间。
- 角色状态。

这些先写入互动记录包，未来再考虑直接传给数据库脚本。

### V5: Interaction Memory Retrieval

当互动记录很多时，为互动会话建立独立索引。后续和同一角色互动时，召回过去相关互动；主线合并时也能选择附带引用。

### V6: Multi-Agent Scene Interaction

支持多人在场互动、角色主动插话、玩家点名角色、远程频道群聊等复杂模式。V1 的 `participantNames` 和 `mode` 字段为此预留。

## Open Questions

- V1 默认互动提示词需要后续实际游玩打磨，不在本设计中定死文风。
- 合并楼层是否需要自定义 `name`，取决于 SillyTavern 与数据库脚本对不同 `name` 的处理表现。V1 先不设置。
- 是否需要 UI 上显示 `SP·数据库 III` 状态，V1 不做，避免误导用户以为存在强集成。
