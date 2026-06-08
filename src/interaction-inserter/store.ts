import {
  buildWorldbookContent,
  collectSendableInteractionHistory,
  convertPresetToOrderedPrompts,
  normalizePresetLike,
  parseInteractionPresetJson,
  stringifyInteractionPreset,
  type InteractionMode,
  type PresetLike,
} from './preset';
import { makeInteractionSessionTitle, readTavernUserName, roleDisplayName } from './labels';
import defaultInteractionPreset from '../../tavern_sync/互动插入器预设/互动插入器预设.json';
import defaultPromptConfig from '../../tavern_sync/互动插入器预设/默认提示词配置.json';

type MessageRole = 'user' | 'assistant' | 'system';

const FIXED_ENTRY_NAME = '本轮互动内容';
const SCRIPT_VARIABLE_KEY = 'interactionInserterSettings';
const CHAT_VARIABLE_KEY = 'interactionInserter';
const DEFAULT_PRESET_CONFIG_ID = 'default-preset';
const DEFAULT_PROMPT_CONFIG_ID = 'default-prompt-config';

const DEFAULT_PROMPT_CONFIG_NAME = defaultPromptConfig.name;
const DEFAULT_PROMPTS = {
  ...defaultPromptConfig.prompts,
  worldbookTemplate: defaultPromptConfig.worldbookTemplate,
};

function createDefaultInteractionPreset(): PresetLike {
  return normalizePresetLike(JSON.parse(JSON.stringify(defaultInteractionPreset)));
}

const ApiSettingsSchema = z
  .object({
    mode: z.enum(['current', 'custom']).catch('current').prefault('current'),
    apiurl: z.string().prefault(''),
    key: z.string().prefault(''),
    model: z.string().prefault('same_as_preset'),
  })
  .prefault({});

const PromptValuesSchema = z
  .object({
    scene: z.string().prefault(DEFAULT_PROMPTS.scene),
    private: z.string().prefault(DEFAULT_PROMPTS.private),
    remote: z.string().prefault(DEFAULT_PROMPTS.remote),
  })
  .prefault({});

const PresetConfigSchema = z
  .object({
    id: z.string().prefault(DEFAULT_PRESET_CONFIG_ID),
    name: z.string().prefault('默认预设'),
    preset: z
      .custom<PresetLike>()
      .transform(value => normalizePresetLike(value))
      .prefault(createDefaultInteractionPreset()),
  })
  .prefault({});

const PromptConfigSchema = z
  .object({
    id: z.string().prefault(DEFAULT_PROMPT_CONFIG_ID),
    name: z.string().prefault(DEFAULT_PROMPT_CONFIG_NAME),
    prompts: PromptValuesSchema.prefault({}),
    worldbookTemplate: z.string().prefault(DEFAULT_PROMPTS.worldbookTemplate),
  })
  .prefault({});

const SettingsSchema = z
  .object({
    api: ApiSettingsSchema.prefault({}),
    presetSource: z.enum(['custom', 'tavern']).prefault('custom'),
    tavernPresetName: z.string().prefault(''),
    preset: z.unknown().optional(),
    presetConfigs: z.array(PresetConfigSchema).catch([]).prefault([]),
    activePresetConfigId: z.string().prefault(''),
    prompts: PromptValuesSchema.optional(),
    worldbookTemplate: z.string().optional(),
    promptConfigs: z.array(PromptConfigSchema).catch([]).prefault([]),
    activePromptConfigId: z.string().prefault(''),
    insertTarget: z.enum(['worldbook', 'message']).prefault('message'),
    historyLimit: z.coerce.number().transform(value => _.clamp(Math.trunc(value), 1, 50)).prefault(50),
    stream: z.boolean().prefault(true),
    clearAfterMerge: z.boolean().prefault(true),
    clearWorldbookOnNewMainMessage: z.boolean().prefault(true),
  })
  .transform(settings => {
    const presetConfigs =
      settings.presetConfigs.length > 0
        ? settings.presetConfigs
        : [
            PresetConfigSchema.parse({
              id: DEFAULT_PRESET_CONFIG_ID,
              name: '默认预设',
              preset: settings.preset ?? createDefaultInteractionPreset(),
            }),
          ];
    const activePresetConfigId = presetConfigs.some(config => config.id === settings.activePresetConfigId)
      ? settings.activePresetConfigId
      : presetConfigs[0].id;

    const promptConfigs =
      settings.promptConfigs.length > 0
        ? settings.promptConfigs
        : [
            PromptConfigSchema.parse({
              id: DEFAULT_PROMPT_CONFIG_ID,
              name: DEFAULT_PROMPT_CONFIG_NAME,
              prompts: settings.prompts ?? {},
              worldbookTemplate: settings.worldbookTemplate ?? DEFAULT_PROMPTS.worldbookTemplate,
            }),
          ];
    const activePromptConfigId = promptConfigs.some(config => config.id === settings.activePromptConfigId)
      ? settings.activePromptConfigId
      : promptConfigs[0].id;

    return {
      api: settings.api,
      presetSource: settings.presetSource,
      tavernPresetName: settings.tavernPresetName,
      presetConfigs,
      activePresetConfigId,
      promptConfigs,
      activePromptConfigId,
      insertTarget: settings.insertTarget,
      historyLimit: settings.historyLimit,
      stream: settings.stream,
      clearAfterMerge: settings.clearAfterMerge,
      clearWorldbookOnNewMainMessage: settings.clearWorldbookOnNewMainMessage,
    };
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
  sendToContext: z.boolean().prefault(false),
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
type PresetConfig = InteractionSettings['presetConfigs'][number];
type PromptConfig = InteractionSettings['promptConfigs'][number];
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
  const title = makeInteractionSessionTitle(mode, character?.label);
  return {
    id: makeId('session'),
    mode,
    characterId: character?.id,
    title,
    messages: [],
    merged: false,
    sendToContext: false,
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
  state.activeSessionId = null;
  return state;
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
  const customApiModels = ref<string[]>([]);
  const customApiModelsLoading = ref(false);
  const tavernPresetNames = ref<string[]>([]);
  const editingMessageId = ref<string | null>(null);
  const editingMessageDraft = ref('');

  function uniqueConfigName(items: { name: string }[], baseName: string): string {
    const normalizedBaseName = baseName.trim() || '未命名配置';
    if (!items.some(item => item.name === normalizedBaseName)) {
      return normalizedBaseName;
    }
    for (let index = 2; ; index += 1) {
      const nextName = `${normalizedBaseName} ${index}`;
      if (!items.some(item => item.name === nextName)) {
        return nextName;
      }
    }
  }

  function promptConfigName(defaultName: string): string | null {
    const name = window.prompt('请输入配置名称', defaultName)?.trim();
    return name || null;
  }

  function makePresetConfig(name: string, preset: PresetLike): PresetConfig {
    return PresetConfigSchema.parse({
      id: makeId('preset-config'),
      name,
      preset,
    });
  }

  function makePromptConfig(name: string, prompts = PromptValuesSchema.parse({}), worldbookTemplate = DEFAULT_PROMPTS.worldbookTemplate): PromptConfig {
    return PromptConfigSchema.parse({
      id: makeId('prompt-config'),
      name,
      prompts,
      worldbookTemplate,
    });
  }

  function ensureActivePresetConfig(): PresetConfig {
    const existing = settings.value.presetConfigs.find(config => config.id === settings.value.activePresetConfigId);
    if (existing) return existing;
    const fallback = settings.value.presetConfigs[0] ?? makePresetConfig('默认预设', createDefaultInteractionPreset());
    if (settings.value.presetConfigs.length === 0) {
      settings.value.presetConfigs.push(fallback);
    }
    settings.value.activePresetConfigId = fallback.id;
    return fallback;
  }

  function ensureActivePromptConfig(): PromptConfig {
    const existing = settings.value.promptConfigs.find(config => config.id === settings.value.activePromptConfigId);
    if (existing) return existing;
    const fallback = settings.value.promptConfigs[0] ?? makePromptConfig(DEFAULT_PROMPT_CONFIG_NAME);
    if (settings.value.promptConfigs.length === 0) {
      settings.value.promptConfigs.push(fallback);
    }
    settings.value.activePromptConfigId = fallback.id;
    return fallback;
  }

  const activeSession = computed(() => state.value.sessions.find(session => session.id === state.value.activeSessionId));
  const activeCharacter = computed(() =>
    state.value.characters.find(character => character.id === activeSession.value?.characterId),
  );
  const activePresetConfig = computed(() => ensureActivePresetConfig());
  const activePromptConfig = computed(() => ensureActivePromptConfig());
  const canSend = computed(() => Boolean(activeSession.value) && draft.value.trim().length > 0 && !isGenerating.value);

  function sessionCharacterName(session: InteractionSession): string | null {
    return state.value.characters.find(character => character.id === session.characterId)?.label ?? null;
  }

  function roleLabel(role: MessageRole, session = activeSession.value): string {
    return roleDisplayName(role, {
      userName: readTavernUserName(),
      characterName: session ? sessionCharacterName(session) : activeCharacter.value?.label,
    });
  }

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
      refreshTavernPresetNames();
      if (settings.value.api.mode === 'custom') {
        void refreshCustomApiModels();
      }
    }
  });

  eventOn('interaction-inserter:open', () => {
    state.value = ensureActiveSession(getChatState());
    settings.value = getScriptSettings();
    refreshTavernPresetNames();
    refreshCurrentTavernModel();
    if (settings.value.api.mode === 'custom') {
      void refreshCustomApiModels();
    }
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
    settings.value = SettingsSchema.parse({
      presetSource: settings.value.presetSource,
      tavernPresetName: settings.value.tavernPresetName,
      presetConfigs: settings.value.presetConfigs,
      activePresetConfigId: settings.value.activePresetConfigId,
      promptConfigs: settings.value.promptConfigs,
      activePromptConfigId: settings.value.activePromptConfigId,
    });
    refreshTavernPresetNames();
    persistSettings();
    toastr.success('已恢复默认设置');
  }

  function refreshTavernPresetNames() {
    try {
      tavernPresetNames.value = getPresetNames();
      if (settings.value.presetSource === 'tavern') {
        ensureSelectedTavernPreset();
      }
    } catch {
      tavernPresetNames.value = [];
    }
  }

  function ensureSelectedTavernPreset() {
    if (settings.value.tavernPresetName && tavernPresetNames.value.includes(settings.value.tavernPresetName)) {
      return;
    }
    try {
      const loadedPresetName = getLoadedPresetName();
      settings.value.tavernPresetName = tavernPresetNames.value.includes(loadedPresetName)
        ? loadedPresetName
        : (tavernPresetNames.value[0] ?? '');
    } catch {
      settings.value.tavernPresetName = tavernPresetNames.value[0] ?? '';
    }
  }

  function createPresetConfig() {
    const name = uniqueConfigName(settings.value.presetConfigs, '默认预设');
    const config = makePresetConfig(name, createDefaultInteractionPreset());
    settings.value.presetConfigs.push(config);
    settings.value.activePresetConfigId = config.id;
    settings.value.presetSource = 'custom';
    persistSettings();
    toastr.success('已新建互动预设配置');
  }

  function applyPresetJsonText(content: string, fallbackName = '导入预设') {
    try {
      const name = uniqueConfigName(settings.value.presetConfigs, fallbackName.replace(/\.json$/i, '') || '导入预设');
      const config = makePresetConfig(name, parseInteractionPresetJson(content));
      settings.value.presetConfigs.push(config);
      settings.value.activePresetConfigId = config.id;
      settings.value.presetSource = 'custom';
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
          .then(content => applyPresetJsonText(content, file.name))
          .catch(error => {
            toastr.error(`读取互动预设 JSON 失败：${error instanceof Error ? error.message : String(error)}`);
          });
      },
      { once: true },
    );
    input.click();
  }

  function exportPresetJson() {
    let preset: PresetLike;
    try {
      preset = resolveActiveInteractionPreset();
    } catch (error) {
      toastr.error(`互动预设读取失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const blob = new Blob([stringifyInteractionPreset(preset)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activePresetConfig.value.name || '互动插入器预设'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toastr.success('已导出互动预设 JSON');
  }

  function savePresetConfigAs() {
    const name = promptConfigName(`${activePresetConfig.value.name} 副本`);
    if (!name) return;
    const config = makePresetConfig(uniqueConfigName(settings.value.presetConfigs, name), klona(activePresetConfig.value.preset));
    settings.value.presetConfigs.push(config);
    settings.value.activePresetConfigId = config.id;
    settings.value.presetSource = 'custom';
    persistSettings();
    toastr.success('已保存为新的互动预设配置');
  }

  function deletePresetConfig() {
    if (settings.value.presetConfigs.length <= 1) {
      toastr.warning('至少保留一个互动预设配置');
      return;
    }
    _.remove(settings.value.presetConfigs, config => config.id === settings.value.activePresetConfigId);
    settings.value.activePresetConfigId = settings.value.presetConfigs[0]?.id ?? '';
    persistSettings();
    toastr.success('已删除互动预设配置');
  }

  function resolveActiveInteractionPreset(): PresetLike {
    if (settings.value.presetSource !== 'tavern') {
      return activePresetConfig.value.preset;
    }
    refreshTavernPresetNames();
    const presetName = settings.value.tavernPresetName.trim();
    if (!presetName) {
      throw new Error('请先选择一个酒馆预设');
    }
    return normalizePresetLike(getPreset(presetName));
  }

  function parsePromptConfigJson(content: string): Omit<PromptConfig, 'id'> {
    const parsed = JSON.parse(content);
    const source = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const promptsSource = source.prompts && typeof source.prompts === 'object' ? source.prompts : source;
    return {
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : '导入提示词配置',
      prompts: PromptValuesSchema.parse(promptsSource),
      worldbookTemplate:
        typeof source.worldbookTemplate === 'string' ? source.worldbookTemplate : DEFAULT_PROMPTS.worldbookTemplate,
    };
  }

  function stringifyPromptConfig(config: PromptConfig): string {
    return JSON.stringify(
      {
        name: config.name,
        prompts: config.prompts,
        worldbookTemplate: config.worldbookTemplate,
      },
      null,
      2,
    );
  }

  function createPromptConfig() {
    const name = uniqueConfigName(settings.value.promptConfigs, DEFAULT_PROMPT_CONFIG_NAME);
    const config = makePromptConfig(name);
    settings.value.promptConfigs.push(config);
    settings.value.activePromptConfigId = config.id;
    persistSettings();
    toastr.success('已新建提示词配置');
  }

  function applyPromptConfigJsonText(content: string, fallbackName = '导入提示词配置') {
    try {
      const parsed = parsePromptConfigJson(content);
      const name = uniqueConfigName(
        settings.value.promptConfigs,
        parsed.name === '导入提示词配置' ? fallbackName.replace(/\.json$/i, '') || parsed.name : parsed.name,
      );
      const config = makePromptConfig(name, parsed.prompts, parsed.worldbookTemplate);
      settings.value.promptConfigs.push(config);
      settings.value.activePromptConfigId = config.id;
      persistSettings();
      toastr.success('已导入提示词配置 JSON');
    } catch (error) {
      toastr.error(`提示词配置 JSON 导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function importPromptConfigJsonFile() {
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
          .then(content => applyPromptConfigJsonText(content, file.name))
          .catch(error => {
            toastr.error(`读取提示词配置 JSON 失败：${error instanceof Error ? error.message : String(error)}`);
          });
      },
      { once: true },
    );
    input.click();
  }

  function exportPromptConfigJson() {
    const config = activePromptConfig.value;
    const blob = new Blob([stringifyPromptConfig(config)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${config.name || '互动插入器提示词配置'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toastr.success('已导出提示词配置 JSON');
  }

  function savePromptConfigAs() {
    const name = promptConfigName(`${activePromptConfig.value.name} 副本`);
    if (!name) return;
    const config = makePromptConfig(
      uniqueConfigName(settings.value.promptConfigs, name),
      klona(activePromptConfig.value.prompts),
      activePromptConfig.value.worldbookTemplate,
    );
    settings.value.promptConfigs.push(config);
    settings.value.activePromptConfigId = config.id;
    persistSettings();
    toastr.success('已保存为新的提示词配置');
  }

  function deletePromptConfig() {
    if (settings.value.promptConfigs.length <= 1) {
      toastr.warning('至少保留一个提示词配置');
      return;
    }
    _.remove(settings.value.promptConfigs, config => config.id === settings.value.activePromptConfigId);
    settings.value.activePromptConfigId = settings.value.promptConfigs[0]?.id ?? '';
    persistSettings();
    toastr.success('已删除提示词配置');
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

  function toggleSessionSendToContext(sessionId: string) {
    const session = state.value.sessions.find(item => item.id === sessionId);
    if (!session) return;
    session.sendToContext = !session.sendToContext;
    persistState();
  }

  function appendMessage(session: InteractionSession, role: MessageRole, content: string): InteractionMessage {
    const message = { id: makeId('message'), role, content, createdAt: Date.now() };
    session.messages.push(message);
    session.updatedAt = Date.now();
    session.merged = false;
    return message;
  }

  function findActiveMessage(messageId: string): InteractionMessage | null {
    return activeSession.value?.messages.find(message => message.id === messageId) ?? null;
  }

  function startEditingMessage(messageId: string) {
    const message = findActiveMessage(messageId);
    if (!message) return;
    editingMessageId.value = message.id;
    editingMessageDraft.value = message.content;
  }

  function cancelEditingMessage() {
    editingMessageId.value = null;
    editingMessageDraft.value = '';
  }

  function saveEditingMessage() {
    const messageId = editingMessageId.value;
    const session = activeSession.value;
    if (!messageId || !session) return;
    const message = session.messages.find(item => item.id === messageId);
    if (!message) {
      cancelEditingMessage();
      return;
    }
    message.content = editingMessageDraft.value;
    session.updatedAt = Date.now();
    session.merged = false;
    cancelEditingMessage();
    persistState();
  }

  function deleteMessage(messageId: string) {
    const session = activeSession.value;
    if (!session) return;
    const removed = _.remove(session.messages, message => message.id === messageId).length > 0;
    if (!removed) return;
    if (editingMessageId.value === messageId) {
      cancelEditingMessage();
    }
    session.updatedAt = Date.now();
    session.merged = false;
    persistState();
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

  function customApiModelsEndpoint(): string {
    const apiurl = settings.value.api.apiurl.trim().replace(/\/+$/, '');
    if (!apiurl) return '';
    if (/\/models$/i.test(apiurl)) return apiurl;
    return `${apiurl}/models`;
  }

  function normalizeModelNames(payload: unknown): string[] {
    const data =
      payload && typeof payload === 'object' && Array.isArray((payload as Record<string, any>).data)
        ? (payload as Record<string, any>).data
        : payload;
    if (!Array.isArray(data)) return [];
    return _.uniq(
      data
        .map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && typeof (item as Record<string, any>).id === 'string') {
            return (item as Record<string, any>).id;
          }
          return '';
        })
        .filter(Boolean),
    );
  }

  async function refreshCustomApiModels() {
    if (settings.value.api.mode !== 'custom') return;
    const endpoint = customApiModelsEndpoint();
    if (!endpoint) {
      customApiModels.value = [];
      return;
    }
    customApiModelsLoading.value = true;
    try {
      const response = await fetch(endpoint, {
        headers: {
          ...(settings.value.api.key ? { Authorization: `Bearer ${settings.value.api.key}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }
      customApiModels.value = normalizeModelNames(await response.json());
      if (
        settings.value.api.model &&
        settings.value.api.model !== 'same_as_preset' &&
        customApiModels.value.length > 0 &&
        !customApiModels.value.includes(settings.value.api.model)
      ) {
        settings.value.api.model = customApiModels.value[0] ?? 'same_as_preset';
      }
    } catch (error) {
      customApiModels.value = [];
      toastr.error(`模型列表读取失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      customApiModelsLoading.value = false;
    }
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
    return {
      apiurl: api.apiurl.trim(),
      key: api.key,
      model: modelOverride(api.model),
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
    return collectSendableInteractionHistory(state.value.sessions, session, {
      historyLimit: settings.value.historyLimit,
      labelMessage: (message, ownerSession) =>
        `${roleLabel(message.role, ownerSession as InteractionSession)}：${message.content}`,
    });
  }

  function buildOrderedPrompts(session: InteractionSession): (PlaceholderPrompt | RolePrompt)[] {
    return convertPresetToOrderedPrompts(resolveActiveInteractionPreset(), {
      mode: session.mode,
      prompts: activePromptConfig.value.prompts,
      contextPrompt: buildContextPrompt(session),
      interactionHistory: recentInteractionPrompts(session),
    }) as (PlaceholderPrompt | RolePrompt)[];
  }

  async function sendMessage() {
    const session = activeSession.value;
    const input = draft.value.trim();
    if (!session) {
      toastr.warning('请先创建一个互动');
      return;
    }
    if (!input || isGenerating.value) return;
    if (session.mode !== 'scene' && !session.characterId) {
      toastr.warning('请先为该会话选择角色');
      return;
    }

    let orderedPrompts: (PlaceholderPrompt | RolePrompt)[];
    try {
      orderedPrompts = buildOrderedPrompts(session);
    } catch (error) {
      toastr.error(`互动预设读取失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
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
      .slice()
      .sort((left, right) => left.createdAt - right.createdAt)
      .flatMap(session =>
        session.messages.length === 0 || session.merged
          ? []
          : [
              `## ${session.title}`,
              ...session.messages.map(message => `【${roleLabel(message.role, session)}】${message.content}`),
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
    return buildWorldbookContent(activePromptConfig.value.worldbookTemplate, rawInteraction.trim());
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

  async function appendInteractionToCurrentMessage(content: string): Promise<boolean> {
    const currentMessage = getChatMessages(-1)[0];
    if (!currentMessage) {
      toastr.warning('当前没有可插入的楼层消息');
      return false;
    }
    const nextMessage = [currentMessage.message.trimEnd(), content.trim()].filter(Boolean).join('\n\n');
    await setChatMessages(
      [
        {
          message_id: currentMessage.message_id,
          message: nextMessage,
        },
      ],
      { refresh: 'affected' },
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
    const content = makeWorldbookContent(rawInteraction);
    const merged =
      settings.value.insertTarget === 'message'
        ? await appendInteractionToCurrentMessage(content)
        : await upsertInteractionEntry(content);
    if (!merged) return;
    for (const session of state.value.sessions) {
      if (session.messages.length > 0) {
        session.merged = true;
      }
    }
    persistState();
    closeWorkbench();
    toastr.success(settings.value.insertTarget === 'message' ? '已插入当前楼层正文' : '已合并到世界书');
  }

  async function copyInteractionRecords() {
    await navigator.clipboard.writeText(formatUnmergedMessages());
    toastr.success('已复制互动记录');
  }

  eventOn(tavern_events.MESSAGE_SENT, async () => {
    if (settings.value.insertTarget === 'worldbook' && settings.value.clearWorldbookOnNewMainMessage) {
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
    customApiModels,
    customApiModelsLoading,
    tavernPresetNames,
    editingMessageId,
    editingMessageDraft,
    activeSession,
    activeCharacter,
    activePresetConfig,
    activePromptConfig,
    canSend,
    FIXED_ENTRY_NAME,
    closeWorkbench,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    resetSettings,
    refreshCustomApiModels,
    refreshTavernPresetNames,
    createPresetConfig,
    importPresetJsonFile,
    exportPresetJson,
    savePresetConfigAs,
    deletePresetConfig,
    createPromptConfig,
    importPromptConfigJsonFile,
    exportPromptConfigJson,
    savePromptConfigAs,
    deletePromptConfig,
    addCharacter,
    deleteCharacter,
    createSession,
    selectMode,
    createSessionFromCharacter,
    switchSession,
    deleteSession,
    toggleSessionMerged,
    toggleSessionSendToContext,
    startEditingMessage,
    cancelEditingMessage,
    saveEditingMessage,
    deleteMessage,
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
