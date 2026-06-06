/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  DEFAULT_INTERACTION_PRESET,
  buildWorldbookContent,
  buildInteractionMacros,
  convertPresetToOrderedPrompts,
  parseInteractionPresetJson,
} = require('../src/interaction-inserter/preset.ts');

const prompts = {
  scene: 'scene rules',
  private: 'private rules',
  remote: 'remote rules',
};

function tavernPreset(overrides = {}) {
  return {
    temperature: 1,
    stream_openai: true,
    prompts: [
      { identifier: 'main', name: 'Main Prompt', system_prompt: true, role: 'system', content: 'Main prompt' },
      { identifier: 'worldInfoBefore', name: 'World Info before', system_prompt: true, marker: true },
      { identifier: 'personaDescription', name: 'Persona Description', system_prompt: true, marker: true },
      { identifier: 'charDescription', name: 'Char Description', system_prompt: true, marker: true },
      {
        identifier: 'iiModePrompt',
        name: 'Interaction mode prompt',
        system_prompt: true,
        role: 'system',
        content: '{{ii_scene_prompt}}{{ii_private_prompt}}{{ii_remote_prompt}}',
      },
      {
        identifier: 'iiInteractionHistory',
        name: 'Interaction history',
        system_prompt: true,
        role: 'user',
        content: '',
      },
      {
        identifier: 'iiUserInput',
        name: 'User input',
        system_prompt: true,
        role: 'user',
        content: '',
      },
      {
        identifier: 'disabledPrompt',
        name: 'Disabled Prompt',
        system_prompt: true,
        role: 'system',
        content: 'must not appear',
      },
    ],
    prompt_order: [
      {
        character_id: 100001,
        order: [
          { identifier: 'main', enabled: true },
          { identifier: 'worldInfoBefore', enabled: true },
          { identifier: 'personaDescription', enabled: true },
          { identifier: 'charDescription', enabled: true },
          { identifier: 'iiModePrompt', enabled: true },
          { identifier: 'iiInteractionHistory', enabled: true },
          { identifier: 'iiUserInput', enabled: true },
          { identifier: 'disabledPrompt', enabled: false },
        ],
      },
    ],
    assistant_prefill: '',
    use_sysprompt: false,
    extensions: {},
    ...overrides,
  };
}

test('converts SillyTavern preset prompts using prompt_order identifiers', () => {
  const ordered = convertPresetToOrderedPrompts(tavernPreset(), {
    mode: 'private',
    prompts,
    contextPrompt: 'context rules',
    interactionHistory: [
      { role: 'user', content: 'User: hello' },
      { role: 'assistant', content: 'Assistant: hi' },
    ],
  });

  assert.deepEqual(ordered, [
    { role: 'system', content: 'Main prompt' },
    'world_info_before',
    'persona_description',
    'char_description',
    { role: 'system', content: 'private rules' },
    { role: 'user', content: 'User: hello' },
    { role: 'assistant', content: 'Assistant: hi' },
    'user_input',
  ]);
});

test('skips prompts disabled in SillyTavern prompt_order even when prompt content exists', () => {
  const ordered = convertPresetToOrderedPrompts(tavernPreset(), {
    mode: 'scene',
    prompts,
    contextPrompt: 'context rules',
    interactionHistory: [],
  });

  assert.equal(ordered.some(item => typeof item === 'object' && item.content === 'must not appear'), false);
});

test('falls back to prompts array order when prompt_order is missing', () => {
  const preset = tavernPreset({ prompt_order: [] });
  const ordered = convertPresetToOrderedPrompts(preset, {
    mode: 'scene',
    prompts,
    contextPrompt: 'context rules',
    interactionHistory: [],
  });

  assert.deepEqual(ordered.slice(0, 3), [{ role: 'system', content: 'Main prompt' }, 'world_info_before', 'persona_description']);
});

test('appends user_input when imported SillyTavern preset does not include interaction user input node', () => {
  const ordered = convertPresetToOrderedPrompts(
    tavernPreset({
      prompts: [{ identifier: 'main', name: 'Main Prompt', system_prompt: true, role: 'system', content: 'Main prompt' }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }],
    }),
    {
      mode: 'scene',
      prompts,
      contextPrompt: 'context rules',
      interactionHistory: [],
    },
  );

  assert.deepEqual(ordered, [{ role: 'system', content: 'Main prompt' }, 'user_input']);
});

test('mode prompt macros are mutually exclusive', () => {
  assert.deepEqual(buildInteractionMacros({ mode: 'remote', prompts, contextPrompt: 'context rules' }), {
    '{{ii_scene_prompt}}': '',
    '{{ii_private_prompt}}': '',
    '{{ii_remote_prompt}}': 'remote rules',
    '{{ii_context_prompt}}': 'context rules',
  });
});

test('expands worldbook insertion macros from template', () => {
  const content = buildWorldbookContent('Header\n{{ii_interaction_records}}\nFooter', '玩家：调查书架');

  assert.equal(content, 'Header\n玩家：调查书架\nFooter');
});

test('trims worldbook macro output without appending records outside the template', () => {
  const content = buildWorldbookContent('Before\n\n{{ii_interaction_records}}\n\n', 'AI：回应');

  assert.equal(content, 'Before\n\nAI：回应');
});

test('parses and preserves real SillyTavern preset shape', () => {
  const preset = parseInteractionPresetJson(JSON.stringify(tavernPreset({ custom_top_level: true })));

  assert.equal(preset.custom_top_level, true);
  assert.ok(Array.isArray(preset.prompts));
  assert.ok(Array.isArray(preset.prompt_order));
  assert.equal(preset.prompts[0].identifier, 'main');
  assert.equal('settings' in preset, false);
  assert.equal('prompts_unused' in preset, false);
});

test('default interaction preset is exportable as SillyTavern preset JSON', () => {
  assert.ok(Array.isArray(DEFAULT_INTERACTION_PRESET.prompts));
  assert.ok(Array.isArray(DEFAULT_INTERACTION_PRESET.prompt_order));
  assert.ok(DEFAULT_INTERACTION_PRESET.prompts.some(prompt => prompt.identifier === 'iiInteractionHistory'));
  assert.ok(DEFAULT_INTERACTION_PRESET.prompts.some(prompt => prompt.identifier === 'iiUserInput'));
  assert.equal('settings' in DEFAULT_INTERACTION_PRESET, false);
  assert.equal('prompts_unused' in DEFAULT_INTERACTION_PRESET, false);
});
