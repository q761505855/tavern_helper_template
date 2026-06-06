import {
  buildWorldbookContent,
  convertPresetToOrderedPrompts,
  createDefaultInteractionPreset,
  normalizePresetLike,
  parseInteractionPresetJson,
  stringifyInteractionPreset,
  type InteractionMode,
  type PresetLike,
} from './preset';

type MessageRole = 'user' | 'assistant' | 'system';

const FIXED_ENTRY_NAME = '本轮互动内容';
const SCRIPT_VARIABLE_KEY = 'interactionInserterSettings';
const CHAT_VARIABLE_KEY = 'interactionInserter';

const DEFAULT_PROMPTS = {
  scene: `延续当前主剧情场景。不要要求玩家额外说明场景。AI 不需要选定单一对象，应扮演场景中相关 NPC 与环境反馈。减少宏大剧情推进，优先回应玩家的台词、动作、追问和局部观察。`,
  private: `聚焦玩家指定的角色标识。AI 必须根据当前剧情上下文匹配该人物，保持角色口吻、关系和现场限制。优先生成即时对话与小动作，不替玩家推进主剧情，不让无关角色突然插入。`,
  remote: `聚焦玩家指定的角色标识，以远程消息、通话或其他通讯形式互动。回复应受到距离、时延、信息不完整的限制；不应直接描写远端角色无法得知的现场细节。`,
  worldbookTemplate: `以下是玩家在上一轮主剧情后进行的临时互动内容。这些互动已经发生，后续主剧情必须承认其结果。请吸收其中的事实、关系变化、承诺、线索与情绪余波，但不要机械复述完整互动记录，除非玩家明确要求回顾。

{{ii_interaction_records}}`,
};

const ApiSettingsSchema = z
  .object({
    mode: z.enum(['current', 'proxy', 'custom']).prefault('current'),
    proxy_preset: z.string().prefault(''),
    apiurl: z.string().prefault(''),
    key: z.string().prefault(''),
    model: z.string().prefault('same_as_preset'),
    source: z.string().prefault('openai'),
  })
  .prefault({});

const SettingsSchema = z
  .object({
    api: ApiSettingsSchema.prefault({}),
    preset: z
      .custom<PresetLike>()
      .transform(value => normalizePresetLike(value))
      .prefault(createDefaultInteractionPreset()),
    prompts: z
      .object({
        scene: z.string().prefault(DEFAULT_PROMPTS.scene),
        private: z.string().prefault(DEFAULT_PROMPTS.private),
        remote: z.string().prefault(DEFAULT_PROMPTS.remote),
      })
      .prefault({}),
    worldbookTemplate: z.string().prefault(DEFAULT_PROMPTS.worldbookTemplate),
    historyLimit: z.coerce.number().transform(value => _.clamp(Math.trunc(value), 1, 50)).prefault(50),
    stream: z.boolean().prefault(true),
    clearAfterMerge: z.boolean().prefault(true),
    clearWorldbookOnNewMainMessage: z.boolean().prefault(true),
  })
  .prefault({});

const CharacterRefSchema = z.object({
  id: z.string(),
  label: z.string(),
});

const InteractionMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  createdAt: z.coerce.number(),
});

const SessionSchema = z.object({
  id: z.string(),
  mode: z.enum(['scene', 'private', 'remote']),
  characterId: z.string().optional(),
  title: z.string(),
  messages: z.array(InteractionMessageSchema).prefault([]),
  merged: z.boolean().prefault(false),
  createdAt: z.coerce.number(),
  updatedAt: z.coerce.number(),
});

const ChatStateSchema = z
  .object({
    characters: z.array(CharacterRefSchema).prefault([]),
    sessions: z.array(SessionSchema).prefault([]),
    activeSessionId: z.string().nullable().prefault(null),
  })
  .prefault({});

type InteractionSettings = z.infer<typeof SettingsSchema>;
type ChatState = z.infer<typeof ChatStateSchema>;
type CharacterRef = z.infer<typeof CharacterRefSchema>;
type InteractionMessage = z.infer<typeof InteractionMessageSchema>;
type InteractionSession = z.infer<typeof SessionSchema>;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getScriptSettings(): InteractionSettings {
  const variables = getVariables({ type: 'script', script_id: getScriptId() });
  return SettingsSchema.parse(_.get(variables, SCRIPT_VARIABLE_KEY, {}));
}

function saveScriptSettings(settings: InteractionSettings) {
  updateVariablesWith(
    variables => {
      _.set(variables, SCRIPT_VARIABLE_KEY, klona(settings));
      return variables;
    },
    { type: 'script', script_id: getScriptId() },
  );
}

function getChatState(): ChatState {
  const variables = getVariables({ type: 'chat' });
  return ChatStateSchema.parse(_.get(variables, CHAT_VARIABLE_KEY, {}));
}

function saveChatState(state: ChatState) {
  updateVariablesWith(
    variables => {
      _.set(variables, CHAT_VARIABLE_KEY, klona(state));
      return variables;
    },
    { type: 'chat' },
  );
}

function makeSession(mode: InteractionMode, character?: CharacterRef): InteractionSession {
  const now = Date.now();
  const title =
    mode === 'scene' ? '当下场景' : `${mode === 'private' ? '一对一' : '远程通信'}：${character?.label ?? '未选择角色'}`;
  return {
    id: makeId('session'),
    mode,
    characterId: character?.id,
    title,
    messages: [],
    merged: false,
    createdAt: now,
    updatedAt: now,
  };
}

function ensureActiveSession(state: ChatState): ChatState {
  if (state.sessions.some(session => session.id === state.activeSessionId)) {
    return state;
  }
  if (state.sessions.length > 0) {
    state.activeSessionId = state.sessions[0].id;
    return state;
  }
  const session = makeSession('scene');
  state.sessions.push(session);
  state.activeSessionId = session.id;
  return state;
}

function roleLabel(role: MessageRole): string {
  if (role === 'user') return '玩家';
  if (role === 'assistant') return 'AI';
  return '系统';
}

function sessionModeLabel(mode: InteractionMode): string {
  if (mode === 'scene') return '当下场景';
  if (mode === 'private') return '一对一';
  return '远程通信';
}

export const useInteractionStore = defineStore('interaction-inserter', () => {
  const isOpen = ref(false);
  const view = ref<'workbench' | 'settings'>('workbench');
  const isSidebarOpen = ref(false);
  const settings = ref(getScriptSettings());
  const state = ref(ensureActiveSession(getChatState()));
  const draft = ref('');
  const characterDraft = ref('');
  const selectedMode = ref<InteractionMode>('scene');
  const isGenerating = ref(false);
  const activeGenerationId = ref<string | null>(null);
  const generationBuffer = ref('');
  const currentTavernModel = ref(readCurrentTavernModel());
  const presetJsonDraft = ref(stringifyInteractionPreset(settings.value.preset));

  const activeSession = computed(() => state.value.sessions.find(session => session.id === state.value.activeSessionId));
  const activeCharacter = computed(() =>
    state.value.characters.find(character => character.id === activeSession.value?.characterId),
  );
  const canSend = computed(() => draft.value.trim().length > 0 && !isGenerating.value);

  function persistSettings() {
    settings.value = SettingsSchema.parse(settings.value);
    saveScriptSettings(settings.value);
  }

  function persistState() {
    saveChatState(ensureActiveSession(ChatStateSchema.parse(klona(state.value))));
  }

  watch(
    settings,
    () => {
      saveScriptSettings(SettingsSchema.parse(klona(settings.value)));
    },
    { deep: true },
  );

  watch(
    state,
    () => {
      saveChatState(ChatStateSchema.parse(klona(state.value)));
    },
    { deep: true },
  );

  watch(view, currentView => {
    if (currentView === 'settings') {
      syncPresetJsonDraft();
    }
  });

  eventOn('interaction-inserter:open', () => {
    state.value = ensureActiveSession(getChatState());
    settings.value = getScriptSettings();
    syncPresetJsonDraft();
    refreshCurrentTavernModel();
    isOpen.value = true;
    view.value = 'workbench';
    isSidebarOpen.value = false;
  });

  eventOn(tavern_events.CHATCOMPLETION_MODEL_CHANGED, () => {
    refreshCurrentTavernModel();
  });

  function closeWorkbench() {
    isOpen.value = false;
    view.value = 'workbench';
    isSidebarOpen.value = false;
  }

  function openSidebar() {
    isSidebarOpen.value = true;
  }

  function closeSidebar() {
    isSidebarOpen.value = false;
  }

  function toggleSidebar() {
    isSidebarOpen.value = !isSidebarOpen.value;
  }

  function resetSettings() {
    settings.value = SettingsSchema.parse({});
    syncPresetJsonDraft();
    persistSettings();
    toastr.success('已恢复默认设置');
  }

  function syncPresetJsonDraft() {
    presetJsonDraft.value = stringifyInteractionPreset(settings.value.preset);
  }

  function applyPresetJsonText(content: string) {
    try {
      settings.value.preset = parseInteractionPresetJson(content);
      syncPresetJsonDraft();
      persistSettings();
      toastr.success('已导入互动预设 JSON');
    } catch (error) {
      toastr.error(`互动预设 JSON 导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function importPresetJsonFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (!file) return;
        file
          .text()
          .then(applyPresetJsonText)
          .catch(error => {
            toastr.error(`读取互动预设 JSON 失败：${error instanceof Error ? error.message : String(error)}`);
          });
      },
      { once: true },
    );
    input.click();
  }

  function exportPresetJson() {
    syncPresetJsonDraft();
    const blob = new Blob([presetJsonDraft.value], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '互动插入器预设.json';
    link.click();
    URL.revokeObjectURL(url);
    toastr.success('已导出互动预设 JSON');
  }

  function resetInteractionPreset() {
    settings.value.preset = createDefaultInteractionPreset();
    syncPresetJsonDraft();
    persistSettings();
    toastr.success('已恢复默认互动预设');
  }

  function addCharacter() {
    const label = characterDraft.value.trim();
    if (!label) return;
    const duplicated = state.value.characters.some(character => character.label === label);
    if (!duplicated) {
      state.value.characters.push({ id: makeId('character'), label });
    }
    characterDraft.value = '';
    persistState();
  }

  function deleteCharacter(characterId: string) {
    _.remove(state.value.characters, character => character.id === characterId);
    for (const session of state.value.sessions) {
      if (session.characterId === characterId) {
        session.characterId = undefined;
      }
    }
    persistState();
  }

  function createSession(mode: InteractionMode, characterId?: string) {
    if (mode !== 'scene' && !characterId) {
      toastr.warning('请先选择一个角色');
      return;
    }
    const character = state.value.characters.find(item => item.id === characterId);
    const session = makeSession(mode, character);
    state.value.sessions.unshift(session);
    state.value.activeSessionId = session.id;
    persistState();
    closeSidebar();
  }

  function selectMode(mode: InteractionMode) {
    selectedMode.value = mode;
    if (mode === 'scene') {
      createSession('scene');
    }
  }

  function createSessionFromCharacter(characterId: string) {
    if (selectedMode.value === 'scene') {
      toastr.info('请先选择一对一或远程通信');
      return;
    }
    createSession(selectedMode.value, characterId);
  }

  function switchSession(sessionId: string) {
    state.value.activeSessionId = sessionId;
    persistState();
    closeSidebar();
  }

  function deleteSession(sessionId: string) {
    _.remove(state.value.sessions, session => session.id === sessionId);
    if (state.value.activeSessionId === sessionId) {
      state.value.activeSessionId = state.value.sessions[0]?.id ?? null;
    }
    persistState();
  }

  function toggleSessionMerged(sessionId: string) {
    const session = state.value.sessions.find(item => item.id === sessionId);
    if (!session) return;
    session.merged = !session.merged;
    persistState();
  }

  function appendMessage(session: InteractionSession, role: MessageRole, content: string): InteractionMessage {
    const message = { id: makeId('message'), role, content, createdAt: Date.now() };
    session.messages.push(message);
    session.updatedAt = Date.now();
    session.merged = false;
    return message;
  }

  function readCurrentTavernModel(): string {
    try {
      return getChatCompletionModel() || '跟随酒馆当前模型';
    } catch {
      return '跟随酒馆当前模型';
    }
  }

  function refreshCurrentTavernModel() {
    currentTavernModel.value = readCurrentTavernModel();
  }

  function modelOverride(model: string): string | undefined {
    const value = model.trim();
    if (!value || value === 'same_as_preset') return undefined;
    return value;
  }

  function buildCustomApi(): CustomApiConfig | undefined {
    const api = settings.value.api;
    if (api.mode === 'current') {
      return undefined;
    }
    if (api.mode === 'proxy') {
      return {
        proxy_preset: api.proxy_preset.trim(),
        model: modelOverride(api.model),
      };
    }
    return {
      apiurl: api.apiurl.trim(),
      key: api.key,
      model: modelOverride(api.model),
      source: api.source.trim() || 'openai',
    };
  }

  function buildContextPrompt(session: InteractionSession): string {
    const lines = [
      `当前互动模式：${sessionModeLabel(session.mode)}`,
      `当前角色标识：${activeCharacter.value?.label ?? '无'}`,
      `角色标识由玩家手动输入。若模式为一对一或远程通信，你必须根据主剧情上下文匹配该人物；如果无法确认，请保守回应或自然询问。`,
    ];
    return lines.join('\n');
  }

  function recentInteractionPrompts(session: InteractionSession): RolePrompt[] {
    const messages = session.messages.slice(-settings.value.historyLimit);
    return messages.map(message => ({
      role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
      content: `${roleLabel(message.role)}：${message.content}`,
    }));
  }

  function buildOrderedPrompts(session: InteractionSession): (PlaceholderPrompt | RolePrompt)[] {
    return convertPresetToOrderedPrompts(settings.value.preset, {
      mode: session.mode,
      prompts: settings.value.prompts,
      contextPrompt: buildContextPrompt(session),
      interactionHistory: recentInteractionPrompts(session),
    }) as (PlaceholderPrompt | RolePrompt)[];
  }

  async function sendMessage() {
    const session = activeSession.value;
    const input = draft.value.trim();
    if (!session || !input || isGenerating.value) return;
    if (session.mode !== 'scene' && !session.characterId) {
      toastr.warning('请先为该会话选择角色');
      return;
    }

    const orderedPrompts = buildOrderedPrompts(session);
    draft.value = '';
    appendMessage(session, 'user', input);
    const assistantMessage = appendMessage(session, 'assistant', '');
    const generationId = makeId('generation');
    activeGenerationId.value = generationId;
    generationBuffer.value = '';
    isGenerating.value = true;
    persistState();

    const streamListener = eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, (text, receivedGenerationId) => {
      if (receivedGenerationId !== generationId) return;
      assistantMessage.content = text;
      generationBuffer.value = text;
      session.updatedAt = Date.now();
    });

    try {
      const result = await generateRaw({
        generation_id: generationId,
        user_input: input,
        should_stream: settings.value.stream,
        should_silence: true,
        ordered_prompts: orderedPrompts,
        custom_api: buildCustomApi(),
      });
      assistantMessage.content = typeof result === 'string' ? result : result.content;
      session.updatedAt = Date.now();
      persistState();
    } catch (error) {
      assistantMessage.content = `生成失败：${error instanceof Error ? error.message : String(error)}`;
      persistState();
      throw error;
    } finally {
      streamListener.stop();
      isGenerating.value = false;
      activeGenerationId.value = null;
      generationBuffer.value = '';
    }
  }

  function stopGeneration() {
    if (activeGenerationId.value) {
      stopGenerationById(activeGenerationId.value);
    }
    isGenerating.value = false;
    activeGenerationId.value = null;
  }

  function formatUnmergedMessages(): string {
    return state.value.sessions
      .flatMap(session =>
        session.messages.length === 0 || session.merged
          ? []
          : [
              `## ${session.title}`,
              ...session.messages.map(message => `【${roleLabel(message.role)}】${message.content}`),
            ],
      )
      .join('\n\n')
      .trim();
  }

  function getCharacterWorldbookName(): string | null {
    try {
      const worldbooks = getCharWorldbookNames();
      return worldbooks.primary || null;
    } catch {
      return null;
    }
  }

  function makeWorldbookContent(rawInteraction: string): string {
    return buildWorldbookContent(settings.value.worldbookTemplate, rawInteraction.trim());
  }

  async function upsertInteractionEntry(content: string): Promise<boolean> {
    const worldbookName = getCharacterWorldbookName();
    if (!worldbookName) {
      toastr.warning('当前角色没有绑定世界书，请先在角色设置中绑定世界书');
      return false;
    }
    await updateWorldbookWith(
      worldbookName,
      worldbook => {
        const existing = worldbook.find(entry => entry.name === FIXED_ENTRY_NAME);
        const entry = {
          name: FIXED_ENTRY_NAME,
          enabled: true,
          strategy: { type: 'constant' as const, keys: [], keys_secondary: { logic: 'and_any' as const, keys: [] }, scan_depth: 'same_as_global' as const },
          position: { type: 'at_depth' as const, role: 'system' as const, depth: 1, order: 100 },
          content,
          probability: 100,
          recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
          effect: { sticky: null, cooldown: null, delay: null },
        };
        if (existing) {
          Object.assign(existing, entry);
          return worldbook;
        }
        return [...worldbook, entry];
      },
      { render: 'debounced' },
    );
    return true;
  }

  async function clearWorldbookEntry() {
    const worldbookName = getCharacterWorldbookName();
    if (!worldbookName) return;
    await updateWorldbookWith(
      worldbookName,
      worldbook => {
        const existing = worldbook.find(entry => entry.name === FIXED_ENTRY_NAME);
        if (existing) {
          existing.content = '';
          existing.enabled = false;
        }
        return worldbook;
      },
      { render: 'debounced' },
    );
  }

  function clearInteractionRecords() {
    state.value.sessions = [];
    state.value.activeSessionId = null;
    state.value = ensureActiveSession(state.value);
    persistState();
  }

  async function clearAll() {
    clearInteractionRecords();
    await clearWorldbookEntry();
    toastr.success('已清空互动记录和世界书条目');
  }

  async function mergeAndExit() {
    const rawInteraction = formatUnmergedMessages();
    if (!rawInteraction) {
      toastr.warning('没有可合并的互动内容');
      return;
    }
    const merged = await upsertInteractionEntry(makeWorldbookContent(rawInteraction));
    if (!merged) return;
    for (const session of state.value.sessions) {
      if (session.messages.length > 0) {
        session.merged = true;
      }
    }
    persistState();
    closeWorkbench();
    toastr.success('已合并到世界书');
  }

  async function copyInteractionRecords() {
    await navigator.clipboard.writeText(formatUnmergedMessages());
    toastr.success('已复制互动记录');
  }

  eventOn(tavern_events.MESSAGE_RECEIVED, async () => {
    if (settings.value.clearWorldbookOnNewMainMessage) {
      await clearWorldbookEntry();
    }
  });
  eventOn(tavern_events.MESSAGE_SWIPED, async () => {
    if (settings.value.clearWorldbookOnNewMainMessage) {
      await clearWorldbookEntry();
    }
  });
  eventOn(tavern_events.MESSAGE_UPDATED, async () => {
    if (settings.value.clearWorldbookOnNewMainMessage) {
      await clearWorldbookEntry();
    }
  });

  return {
    isOpen,
    view,
    isSidebarOpen,
    settings,
    state,
    draft,
    characterDraft,
    selectedMode,
    isGenerating,
    currentTavernModel,
    presetJsonDraft,
    activeSession,
    activeCharacter,
    canSend,
    FIXED_ENTRY_NAME,
    closeWorkbench,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    resetSettings,
    syncPresetJsonDraft,
    importPresetJsonFile,
    exportPresetJson,
    resetInteractionPreset,
    addCharacter,
    deleteCharacter,
    createSession,
    selectMode,
    createSessionFromCharacter,
    switchSession,
    deleteSession,
    toggleSessionMerged,
    sendMessage,
    stopGeneration,
    clearAll,
    mergeAndExit,
    copyInteractionRecords,
    persistSettings,
    persistState,
    sessionModeLabel,
    roleLabel,
  };
});
