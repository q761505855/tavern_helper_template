/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { test } = require('node:test');

const modulePath = 'src/interaction-inserter/chat-scroll.ts';

async function loadScrollPolicy() {
  assert.equal(existsSync(modulePath), true, `${modulePath} should exist`);
  return require('../src/interaction-inserter/chat-scroll.ts');
}

test('chat bottom policy uses a 48 pixel inclusive threshold', async () => {
  const { CHAT_BOTTOM_THRESHOLD_PX, isNearChatBottom } = await loadScrollPolicy();

  assert.equal(CHAT_BOTTOM_THRESHOLD_PX, 48);
  assert.equal(isNearChatBottom({ scrollHeight: 1000, scrollTop: 752, clientHeight: 200 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 1000, scrollTop: 751, clientHeight: 200 }), false);
});

test('chat bottom policy tolerates overscroll and supports an explicit threshold', async () => {
  const { isNearChatBottom } = await loadScrollPolicy();

  assert.equal(isNearChatBottom({ scrollHeight: 500, scrollTop: 320, clientHeight: 200 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 500, scrollTop: 275, clientHeight: 200 }, 25), true);
  assert.equal(isNearChatBottom({ scrollHeight: 500, scrollTop: 274, clientHeight: 200 }, 25), false);
});

test('scrollChatToBottom directly assigns the current scroll height', async () => {
  const { scrollChatToBottom } = await loadScrollPolicy();
  const element = { scrollHeight: 875, scrollTop: 120 };

  scrollChatToBottom(element);

  assert.equal(element.scrollTop, 875);
});

test('generation completion scrolls only the session that owns the generation', async () => {
  const { shouldForceGenerationCompletionScroll } = await loadScrollPolicy();

  assert.equal(shouldForceGenerationCompletionScroll('session-a', 'session-a'), true);
  assert.equal(shouldForceGenerationCompletionScroll('session-a', 'session-b'), false);
  assert.equal(shouldForceGenerationCompletionScroll(null, 'session-a'), false);
});

test('workbench remount scrolls only while the open workbench is visible', async () => {
  const { shouldForceWorkbenchScroll } = await loadScrollPolicy();

  assert.equal(shouldForceWorkbenchScroll(true, 'workbench'), true);
  assert.equal(shouldForceWorkbenchScroll(true, 'settings'), false);
  assert.equal(shouldForceWorkbenchScroll(false, 'workbench'), false);
});
