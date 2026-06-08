/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

const appVue = readFileSync('src/interaction-inserter/App.vue', 'utf8');
const storeTs = readFileSync('src/interaction-inserter/store.ts', 'utf8');
const defaultPromptConfig = JSON.parse(readFileSync('tavern_sync/互动插入器预设/默认提示词配置.json', 'utf8'));

test('custom interaction presets use collection actions without reset default', () => {
  const customOnlyActions = [
    '@click="store.createPresetConfig"',
    '@click="store.importPresetJsonFile"',
    '@click="store.exportPresetJson"',
    '@click="store.savePresetConfigAs"',
    '@click="store.deletePresetConfig"',
  ];

  for (const action of customOnlyActions) {
    const index = appVue.indexOf(action);
    assert.notEqual(index, -1, `${action} should exist`);
    const openingTag = appVue.lastIndexOf('<button', index);
    const buttonTag = appVue.slice(openingTag, index);
    assert.match(buttonTag, /v-if="store\.settings\.presetSource === 'custom'"/);
  }

  assert.match(appVue, /v-model="store\.settings\.activePresetConfigId"/);
  assert.equal(appVue.includes('@click="store.resetInteractionPreset"'), false);
  assert.equal(storeTs.includes('function resetInteractionPreset()'), false);
});

test('mode prompts and insert template share prompt config collection actions', () => {
  assert.match(appVue, /<h3>提示词配置 JSON<\/h3>/);
  assert.match(appVue, /v-model="store\.settings\.activePromptConfigId"/);
  assert.match(appVue, /@click="store\.createPromptConfig"/);
  assert.match(appVue, /@click="store\.importPromptConfigJsonFile"/);
  assert.match(appVue, /@click="store\.exportPromptConfigJson"/);
  assert.match(appVue, /@click="store\.savePromptConfigAs"/);
  assert.match(appVue, /@click="store\.deletePromptConfig"/);
  assert.match(appVue, /v-model="store\.activePromptConfig\.prompts\.scene"/);
  assert.match(appVue, /v-model="store\.activePromptConfig\.worldbookTemplate"/);
});

test('custom API settings use OpenAI model selector without proxy or source mode', () => {
  assert.equal(appVue.includes('value="proxy"'), false);
  assert.equal(appVue.includes('proxy_preset'), false);
  assert.equal(appVue.includes('api.source'), false);
  assert.match(appVue, /<select\s+v-else\s+v-model="store\.settings\.api\.model"/);
  assert.match(appVue, /class="ii-btn ii-grid-action"/);
  assert.match(appVue, /@click="store\.refreshCustomApiModels"/);
});

test('interaction messages expose edit and delete actions', () => {
  assert.match(appVue, /@click="store\.startEditingMessage\(message\.id\)"/);
  assert.match(appVue, /@click="store\.deleteMessage\(message\.id\)"/);
  assert.match(appVue, /v-if="store\.editingMessageId === message\.id"/);
});

test('interaction list starts empty and sessions can be manually marked for context sending', () => {
  assert.doesNotMatch(storeTs, /const session = makeSession\('scene'\);\s*state\.sessions\.push\(session\)/);
  assert.match(storeTs, /sendToContext: z\.boolean\(\)\.prefault\(false\)/);
  assert.match(storeTs, /toggleSessionSendToContext/);
  assert.match(appVue, /session\.sendToContext \? '带入' : '不带入'/);
  assert.match(appVue, /session\.sendToContext \? '取消带入' : '带入'/);
  assert.match(appVue, /@click\.stop="store\.toggleSessionSendToContext\(session\.id\)"/);
  assert.match(appVue, /暂无互动记录/);
});

test('default mode and worldbook prompts come from bundled prompt config JSON', () => {
  assert.match(storeTs, /默认提示词配置\.json/);
  assert.match(storeTs, /defaultPromptConfig\.prompts/);
  assert.match(storeTs, /defaultPromptConfig\.worldbookTemplate/);
  assert.match(defaultPromptConfig.prompts.scene, /<scene_mode>/);
  assert.match(defaultPromptConfig.prompts.private, /<private_mode>/);
  assert.match(defaultPromptConfig.prompts.remote, /<remote_mode>/);
  assert.match(defaultPromptConfig.worldbookTemplate, /来自互动插入器/);
  assert.match(defaultPromptConfig.worldbookTemplate, /不是新的主剧情楼层/);
});

test('interaction worldbook entry is cleared on next user message, not after received or reroll events', () => {
  assert.match(storeTs, /eventOn\(tavern_events\.MESSAGE_SENT/);
  assert.doesNotMatch(storeTs, /eventOn\(tavern_events\.MESSAGE_RECEIVED[\s\S]*?clearWorldbookEntry/);
  assert.doesNotMatch(storeTs, /eventOn\(tavern_events\.MESSAGE_SWIPED[\s\S]*?clearWorldbookEntry/);
  assert.doesNotMatch(storeTs, /eventOn\(tavern_events\.MESSAGE_UPDATED[\s\S]*?clearWorldbookEntry/);
  assert.match(appVue, /下一轮主聊天前清空/);
});

test('interaction content can be inserted into worldbook or current message body', () => {
  assert.match(storeTs, /insertTarget: z\.enum\(\['worldbook', 'message'\]\)\.prefault\('message'\)/);
  assert.match(storeTs, /appendInteractionToCurrentMessage/);
  assert.match(storeTs, /setChatMessages/);
  assert.match(appVue, /插入方式/);
  assert.match(appVue, /世界书/);
  assert.match(appVue, /当前楼层正文/);
  assert.match(appVue, /插入模板/);
});
