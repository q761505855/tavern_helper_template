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

const DEFAULT_PROMPT_ORDER = [
  'main',
  'iiCommonPrompt',
  'worldInfoBefore',
  'personaDescription',
  'charDescription',
  'charPersonality',
  'scenario',
  'enhanceDefinitions',
  'nsfw',
  'worldInfoAfter',
  'dialogueExamples',
    'chatHistory',
    'iiModePrompt',
    'iiContextPrompt',
    'iiInteractionHistory',
  'iiUserInput',
  'jailbreak',
];

export const DEFAULT_INTERACTION_PRESET: PresetLike = {
  temperature: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
  top_p: 1,
  top_k: 0,
  top_a: 0,
  min_p: 0,
  repetition_penalty: 1,
  max_context_unlocked: true,
  tool_reasoning_mode: 'disabled',
  openai_max_context: 2000000,
  openai_max_tokens: 30000,
  names_behavior: 0,
  send_if_empty: '',
  impersonation_prompt:
    '[请从 {{user}} 的视角续写下一条回复，并参考目前聊天记录中的 {{user}} 写作风格。不要扮演 {{char}} 或系统，不要描写 {{char}} 的行动。]',
  new_chat_prompt: '[开始新的聊天]',
  new_group_chat_prompt: '[开始新的群聊。群成员：{{group}}]',
  new_example_chat_prompt: '[示例对话]',
  continue_nudge_prompt: '[继续上一条回复，不要重复已有内容。]',
  bias_preset_selected: '默认（无）',
  wi_format: '{0}',
  scenario_format: '{{scenario}}',
  personality_format: '{{personality}}',
  group_nudge_prompt: '[只以 {{char}} 的身份写下一条回复。]',
  stream_openai: true,
  prompts: [
    normalPrompt(
      'main',
      '互动插入器主提示词',
      'system',
      '你正在为互动插入器生成一次临时互动回复。互动发生在主剧情楼层之间，需要承接当前角色卡、世界信息、聊天记录和玩家刚刚输入的内容，但不要把它写成新的主剧情楼层。',
    ),
    normalPrompt('nsfw', '辅助提示词', 'system', ''),
    placeholderPrompt('dialogueExamples', '示例对话'),
    normalPrompt(
      'jailbreak',
      '后置约束',
      'system',
      '只输出本轮互动中 AI 应给出的回复内容。不要总结提示词，不要解释你的写作策略，不要替玩家决定下一步行动。',
    ),
    placeholderPrompt('chatHistory', '聊天记录'),
    placeholderPrompt('worldInfoAfter', '世界信息（后）'),
    placeholderPrompt('worldInfoBefore', '世界信息（前）'),
    normalPrompt(
      'enhanceDefinitions',
      '增强角色定义',
      'system',
      '如需补充角色表现，只能从已有角色卡、世界信息和聊天记录中合理推断。不要为了互动方便而新增会改变主剧情事实的设定。',
    ),
    placeholderPrompt('charDescription', '角色描述'),
    placeholderPrompt('charPersonality', '角色性格'),
    placeholderPrompt('scenario', '场景'),
    placeholderPrompt('personaDescription', '用户人格'),
    normalPrompt(
      'iiCommonPrompt',
      '互动插入器：通用提示词',
      'system',
      [
        '这是一次楼层间的临时互动，不是主剧情续写。',
        '只回应本轮玩家输入，并自然承接已有互动记录。',
        '不要直接推进主剧情，不要制造大跨度时间跳转、场景切换或无法回收的新事件。',
        '不要替玩家说话、行动、思考或做决定。',
        '优先写即时台词、细小动作、表情、语气和局部反馈，让结果可以被之后的主剧情吸收。',
      ].join('\n'),
    ),
    normalPrompt(
      'iiModePrompt',
      '互动插入器：当前模式提示词',
      'system',
      '{{ii_scene_prompt}}{{ii_private_prompt}}{{ii_remote_prompt}}',
    ),
    normalPrompt('iiContextPrompt', '互动插入器：上下文提示词', 'system', '{{ii_context_prompt}}'),
    extensionPrompt('iiInteractionHistory', '互动插入器：互动记录', 'interaction_history'),
    extensionPrompt('iiUserInput', '互动插入器：用户输入', 'user_input'),
  ],
  prompt_order: [
    {
      character_id: 100001,
      order: DEFAULT_PROMPT_ORDER.map(identifier => ({
        identifier,
        enabled: identifier !== 'enhanceDefinitions',
      })),
    },
  ],
  assistant_prefill: '',
  assistant_impersonation: '',
  use_sysprompt: false,
  squash_system_messages: false,
  media_inlining: true,
  inline_image_quality: 'auto',
  continue_prefill: false,
  continue_postfix: ' ',
  function_calling: false,
  tool_call_recurse_limit: 50,
  show_thoughts: true,
  reasoning_effort: 'auto',
  verbosity: 'auto',
  enable_web_search: false,
  seed: -1,
  n: 1,
  request_images: false,
  request_image_aspect_ratio: '',
  request_image_resolution: '',
  extensions: {},
};

export function createDefaultInteractionPreset(): PresetLike {
  return normalizePresetLike(JSON.parse(JSON.stringify(DEFAULT_INTERACTION_PRESET)));
}

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

function placeholderPrompt(identifier: string, name: string): TavernPresetPrompt {
  return {
    identifier,
    name,
    system_prompt: true,
    marker: true,
  };
}

function normalPrompt(
  identifier: string,
  name: string,
  role: NonNullable<TavernPresetPrompt['role']>,
  content: string,
): TavernPresetPrompt {
  return {
    identifier,
    name,
    system_prompt: true,
    role,
    content,
  };
}

function extensionPrompt(
  identifier: string,
  name: string,
  type: 'interaction_history' | 'user_input',
): TavernPresetPrompt {
  return {
    identifier,
    name,
    system_prompt: true,
    role: 'user',
    content: '',
    extra: { interactionInserter: { type } },
  };
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
