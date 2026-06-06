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
    "[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don't write as {{char}} or system. Don't describe actions of {{char}}.]",
  new_chat_prompt: '[Start a new Chat]',
  new_group_chat_prompt: '[Start a new group chat. Group members: {{group}}]',
  new_example_chat_prompt: '[Example Chat]',
  continue_nudge_prompt: '[Continue your last message without repeating its original content.]',
  bias_preset_selected: 'Default (none)',
  wi_format: '{0}',
  scenario_format: '{{scenario}}',
  personality_format: '{{personality}}',
  group_nudge_prompt: '[Write the next reply only as {{char}}.]',
  stream_openai: true,
  prompts: [
    normalPrompt('main', 'Main Prompt', 'system', "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}."),
    normalPrompt('nsfw', 'Auxiliary Prompt', 'system', ''),
    placeholderPrompt('dialogueExamples', 'Chat Examples'),
    normalPrompt('jailbreak', 'Post-History Instructions', 'system', ''),
    placeholderPrompt('chatHistory', 'Chat History'),
    placeholderPrompt('worldInfoAfter', 'World Info (after)'),
    placeholderPrompt('worldInfoBefore', 'World Info (before)'),
    normalPrompt(
      'enhanceDefinitions',
      'Enhance Definitions',
      'system',
      "If you have more knowledge of {{char}}, add to the character's lore and personality to enhance them but keep the Character Sheet's definitions absolute.",
    ),
    placeholderPrompt('charDescription', 'Char Description'),
    placeholderPrompt('charPersonality', 'Char Personality'),
    placeholderPrompt('scenario', 'Scenario'),
    placeholderPrompt('personaDescription', 'Persona Description'),
    normalPrompt(
      'iiCommonPrompt',
      'Interaction Inserter: Common Prompt',
      'system',
      'Treat the current interaction as a temporary layer between main story turns. Focus on local, continuable interaction details instead of generating a full new main-plot segment.',
    ),
    normalPrompt(
      'iiModePrompt',
      'Interaction Inserter: Current Mode Prompt',
      'system',
      '{{ii_scene_prompt}}{{ii_private_prompt}}{{ii_remote_prompt}}',
    ),
    normalPrompt('iiContextPrompt', 'Interaction Inserter: Context Prompt', 'system', '{{ii_context_prompt}}'),
    extensionPrompt('iiInteractionHistory', 'Interaction Inserter: Interaction History', 'interaction_history'),
    extensionPrompt('iiUserInput', 'Interaction Inserter: User Input', 'user_input'),
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
  return JSON.stringify(normalizePresetLike(preset), null, 2);
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
