/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { test } = require('node:test');

const modulePath = 'src/interaction-inserter/chat-scroll.ts';

async function loadScrollPolicy() {
  assert.equal(existsSync(modulePath), true, `${modulePath} should exist`);
  return require('../src/interaction-inserter/chat-scroll.ts');
}

test('scrollChatToBottom directly assigns the current scroll height', async () => {
  const { scrollChatToBottom } = await loadScrollPolicy();
  const element = { scrollHeight: 875, scrollTop: 120 };

  scrollChatToBottom(element);

  assert.equal(element.scrollTop, 875);
});

test('stream growth and generation completion have no scroll policy hooks', async () => {
  const policy = await loadScrollPolicy();

  assert.equal(policy.isNearChatBottom, undefined);
  assert.equal(policy.shouldForceGenerationCompletionScroll, undefined);
});

test('workbench remount scrolls only while the open workbench is visible', async () => {
  const { shouldForceWorkbenchScroll } = await loadScrollPolicy();

  assert.equal(shouldForceWorkbenchScroll(true, 'workbench'), true);
  assert.equal(shouldForceWorkbenchScroll(true, 'settings'), false);
  assert.equal(shouldForceWorkbenchScroll(false, 'workbench'), false);
});
