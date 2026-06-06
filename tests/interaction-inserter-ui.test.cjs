/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

const appVue = readFileSync('src/interaction-inserter/App.vue', 'utf8');
const storeTs = readFileSync('src/interaction-inserter/store.ts', 'utf8');

test('shows JSON import/export actions only for custom interaction presets', () => {
  const customOnlyActions = [
    '@click="store.importPresetJsonFile"',
    '@click="store.exportPresetJson"',
    '@click="store.resetInteractionPreset"',
  ];

  for (const action of customOnlyActions) {
    const index = appVue.indexOf(action);
    assert.notEqual(index, -1, `${action} should exist`);
    const openingTag = appVue.lastIndexOf('<button', index);
    const buttonTag = appVue.slice(openingTag, index);
    assert.match(buttonTag, /v-if="store\.settings\.presetSource === 'custom'"/);
  }
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

test('default mode and worldbook prompts are written for interaction inserter flow', () => {
  assert.match(storeTs, /当前模式：当下场景/);
  assert.match(storeTs, /当前模式：一对一/);
  assert.match(storeTs, /当前模式：远程通信/);
  assert.match(storeTs, /来自互动插入器/);
  assert.match(storeTs, /不是新的主剧情楼层/);
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
  assert.match(appVue, /<h3>插入模板<\/h3>/);
});
