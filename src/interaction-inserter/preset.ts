export type InteractionMode = 'scene' | 'private' | 'remote';

export type InteractionPromptSettings = {
  scene: string;
  private: string;
  remote: string;
};

export type InteractionMacroInput = {
  mode: InteractionMode;
  prompts: InteractionPromptSettings;
  contextPrompt: string;
};

export type TavernPresetPrompt = {
  identifier: string;
  name: string;
  system_prompt?: boolean;
  marker?: boolean;
  role?: 'system' | 'user' | 'assistant';
  content?: string;
  enabled?: boolean;
  extra?: Record<string, any>;
  [key: string]: any;
};

export type TavernPromptOrderEntry = {
  identifier: string;
  enabled: boolean;
  [key: string]: any;
};

export type TavernPromptOrder = {
  character_id: number;
  order: TavernPromptOrderEntry[];
  [key: string]: any;
};

export type PresetLike = Record<string, any> & {
  prompts: TavernPresetPrompt[];
  prompt_order: TavernPromptOrder[];
};

export type InteractionPlaceholderPrompt =
  | 'world_info_before'
  | 'persona_description'
  | 'char_description'
  | 'char_personality'
  | 'scenario'
  | 'world_info_after'
  | 'dialogue_examples'
  | 'chat_history'
  | 'user_input';

export type InteractionRolePrompt = {
  role: 'system' | 'assistant' | 'user';
  content: string;
};

export type OrderedInteractionPrompt = InteractionPlaceholderPrompt | InteractionRolePrompt;

export type ConvertPresetOptions = InteractionMacroInput & {
  interactionHistory: InteractionRolePrompt[];
};

export type WorldbookMacroInput = {
  interactionRecords: string;
};

export type InteractionHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type SendableInteractionSession = {
  id: string;
  createdAt: number;
  merged: boolean;
  sendToContext?: boolean;
  messages: InteractionHistoryMessage[];
};

const PLACEHOLDER_IDENTIFIER_MAP: Record<string, InteractionPlaceholderPrompt> = {
  worldInfoBefore: 'world_info_before',
  personaDescription: 'persona_description',
  charDescription: 'char_description',
  charPersonality: 'char_personality',
  scenario: 'scenario',
  worldInfoAfter: 'world_info_after',
  dialogueExamples: 'dialogue_examples',
  chatHistory: 'chat_history',
};

export function buildInteractionMacros(input: InteractionMacroInput): Record<string, string> {
  return {
    '{{ii_scene_prompt}}': input.mode === 'scene' ? input.prompts.scene : '',
    '{{ii_private_prompt}}': input.mode === 'private' ? input.prompts.private : '',
    '{{ii_remote_prompt}}': input.mode === 'remote' ? input.prompts.remote : '',
    '{{ii_context_prompt}}': input.contextPrompt,
  };
}

export function buildWorldbookMacros(input: WorldbookMacroInput): Record<string, string> {
  return {
    '{{ii_interaction_records}}': input.interactionRecords,
  };
}

export function buildWorldbookContent(template: string, interactionRecords: string): string {
  return expandInteractionMacros(template, buildWorldbookMacros({ interactionRecords })).trim();
}

export function sanitizeInteractionReplyContent(input: string): string {
  return input
    .replace(/(^|\n)[ \t]*<([A-Za-z][\w:-]*)(?:\s[^>]*)?>[\s\S]*?<\/\2>[ \t]*(?=\n|$)/g, '$1')
    .replace(/(^|\n)[ \t]*<([A-Za-z][\w:-]*)(?:\s[^>]*)?>[\s\S]*$/g, '$1')
    .trim();
}

export function collectSendableInteractionHistory(
  sessions: SendableInteractionSession[],
  currentSession: SendableInteractionSession,
  options: {
    historyLimit: number;
    labelMessage: (message: InteractionHistoryMessage, session: SendableInteractionSession) => string;
  },
): InteractionRolePrompt[] {
  const earlierSessions = sessions
    .filter(
      session =>
        session.id !== currentSession.id &&
        session.sendToContext === true &&
        session.merged !== true &&
        session.messages.length > 0 &&
        session.createdAt < currentSession.createdAt,
    )
    .sort((left, right) => left.createdAt - right.createdAt);
  const currentMessages = currentSession.messages.slice(-options.historyLimit);

  const history: InteractionRolePrompt[] = [];
  if (earlierSessions.length > 0) {
    history.push({
      role: 'system',
      content: '以下是玩家手动标记要带入本轮生成的待合并互动记录，按创建时间从早到晚排列。',
    });
  }

  earlierSessions.forEach((session, index) => {
    history.push({
      role: 'user',
      content: [`[前置互动 ${index + 1}]`, ...session.messages.map(message => options.labelMessage(message, session))].join('\n'),
    });
  });

  history.push({
    role: 'user',
    content: ['[当前互动]', ...currentMessages.map(message => options.labelMessage(message, currentSession))].join('\n'),
  });

  return history.filter(item => item.content.trim().length > 0);
}

export function convertPresetToOrderedPrompts(
  preset: PresetLike,
  options: ConvertPresetOptions,
): OrderedInteractionPrompt[] {
  const normalizedPreset = normalizePresetLike(preset);
  const macros = buildInteractionMacros(options);
  const promptByIdentifier = new Map(normalizedPreset.prompts.map(prompt => [prompt.identifier, prompt]));
  const activeOrder = selectActivePromptOrder(normalizedPreset.prompt_order);
  const promptRefs =
    activeOrder.length > 0
      ? activeOrder.filter(entry => entry.enabled !== false)
      : normalizedPreset.prompts.map(prompt => ({ identifier: prompt.identifier, enabled: prompt.enabled !== false }));
  const ordered: OrderedInteractionPrompt[] = [];

  for (const ref of promptRefs) {
    const prompt = promptByIdentifier.get(ref.identifier);
    if (prompt?.enabled === false) continue;

    const extensionType = getInteractionExtensionType(ref.identifier, prompt);
    if (extensionType === 'interaction_history') {
      ordered.push(...options.interactionHistory);
      continue;
    }
    if (extensionType === 'user_input') {
      ordered.push('user_input');
      continue;
    }

    const placeholder = PLACEHOLDER_IDENTIFIER_MAP[ref.identifier];
    if (placeholder) {
      ordered.push(placeholder);
      continue;
    }

    if (!prompt) continue;
    const content = expandInteractionMacros(prompt.content ?? '', macros).trim();
    if (!content) continue;
    ordered.push({ role: normalizeRole(prompt.role), content });
  }

  if (!ordered.includes('user_input')) {
    ordered.push('user_input');
  }
  return ordered;
}

export function parseInteractionPresetJson(input: string): PresetLike {
  const parsed = JSON.parse(input);
  return normalizePresetLike(parsed);
}

export function normalizePresetLike(input: unknown): PresetLike {
  const preset = input && typeof input === 'object' ? (input as Record<string, any>) : {};
  return {
    ...preset,
    prompts: Array.isArray(preset.prompts) ? preset.prompts.map(normalizePresetPrompt).filter(isTavernPresetPrompt) : [],
    prompt_order: Array.isArray(preset.prompt_order)
      ? preset.prompt_order.map(normalizePromptOrder).filter(isTavernPromptOrder)
      : [],
  };
}

export function stringifyInteractionPreset(preset: PresetLike): string {
  return JSON.stringify(toSillyTavernPresetJson(preset), null, 2);
}

function expandInteractionMacros(content: string, macros: Record<string, string>): string {
  let result = content;
  for (const [macro, value] of Object.entries(macros)) {
    result = result.split(macro).join(value);
  }
  return result;
}

function getInteractionExtensionType(
  identifier: string,
  prompt?: TavernPresetPrompt,
): 'interaction_history' | 'user_input' | null {
  const configuredType = prompt?.extra?.interactionInserter?.type;
  if (configuredType === 'interaction_history' || configuredType === 'user_input') {
    return configuredType;
  }
  if (identifier === 'iiInteractionHistory') {
    return 'interaction_history';
  }
  if (identifier === 'iiUserInput') {
    return 'user_input';
  }
  return null;
}

function normalizePresetPrompt(prompt: unknown): TavernPresetPrompt | null {
  if (!prompt || typeof prompt !== 'object') return null;
  const value = prompt as Record<string, any>;
  const identifier = typeof value.identifier === 'string' ? value.identifier : value.id;
  if (typeof identifier !== 'string' || typeof value.name !== 'string') return null;
  return {
    ...value,
    identifier,
    name: value.name,
    role: normalizeRole(value.role),
  };
}

function toSillyTavernPresetJson(input: unknown): PresetLike {
  const normalizedPreset = normalizePresetLike(input);
  const { settings: _settings, prompts_unused: _promptsUnused, ...preset } = normalizedPreset;
  const prompts = normalizedPreset.prompts.map(prompt => {
    const { id: _id, ...value } = prompt;
    return value;
  });
  const prompt_order =
    normalizedPreset.prompt_order.length > 0
      ? normalizedPreset.prompt_order.map(order => ({
          ...order,
          order: order.order.map(entry => {
            const { id: _id, ...value } = entry;
            return value;
          }),
        }))
      : [
          {
            character_id: 100001,
            order: normalizedPreset.prompts.map(prompt => ({
              identifier: prompt.identifier,
              enabled: prompt.enabled !== false,
            })),
          },
        ];

  return {
    ...preset,
    prompts,
    prompt_order,
  };
}

function normalizePromptOrder(order: unknown): TavernPromptOrder | null {
  if (!order || typeof order !== 'object') return null;
  const value = order as Record<string, any>;
  if (!Array.isArray(value.order)) return null;
  return {
    ...value,
    character_id: typeof value.character_id === 'number' ? value.character_id : 100001,
    order: value.order
      .map((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return null;
        const entryValue = entry as Record<string, any>;
        const identifier = typeof entryValue.identifier === 'string' ? entryValue.identifier : entryValue.id;
        if (typeof identifier !== 'string') return null;
        return {
          ...entryValue,
          identifier,
          enabled: entryValue.enabled !== false,
        };
      })
      .filter(isTavernPromptOrderEntry),
  };
}

function selectActivePromptOrder(promptOrder: TavernPromptOrder[]): TavernPromptOrderEntry[] {
  const preferred = promptOrder.find(item => item.order.some(entry => entry.identifier === 'personaDescription'));
  return (preferred ?? promptOrder[0])?.order ?? [];
}

function normalizeRole(role: unknown): InteractionRolePrompt['role'] {
  return role === 'assistant' || role === 'user' || role === 'system' ? role : 'system';
}

function isTavernPresetPrompt(prompt: TavernPresetPrompt | null): prompt is TavernPresetPrompt {
  return prompt !== null;
}

function isTavernPromptOrder(order: TavernPromptOrder | null): order is TavernPromptOrder {
  return order !== null;
}

function isTavernPromptOrderEntry(entry: TavernPromptOrderEntry | null): entry is TavernPromptOrderEntry {
  return entry !== null;
}
