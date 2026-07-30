/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { nextTick, reactive, watch } = require('vue');

test('stream repaint state updates the assistant bubble without autosaving chat history per chunk', async () => {
  const { createStreamDisplayState } = require('../src/interaction-inserter/stream-display.ts');
  const chatState = reactive({
    messages: [{ id: 'assistant-1', content: '' }],
  });
  const autosavedContents = [];
  watch(
    chatState,
    () => {
      autosavedContents.push(chatState.messages[0].content);
    },
    { deep: true },
  );
  const streamDisplay = createStreamDisplayState();

  streamDisplay.start('generation-1', 'assistant-1');
  streamDisplay.update('generation-1', 'first');
  await nextTick();
  assert.equal(streamDisplay.contentFor(chatState.messages[0]), 'first');
  assert.deepEqual(autosavedContents, []);

  streamDisplay.update('generation-1', 'first second');
  await nextTick();
  assert.equal(streamDisplay.contentFor(chatState.messages[0]), 'first second');
  assert.deepEqual(autosavedContents, []);

  chatState.messages[0].content = 'first second';
  await nextTick();
  assert.deepEqual(autosavedContents, ['first second']);

  streamDisplay.clear('generation-1');
  assert.equal(streamDisplay.contentFor(chatState.messages[0]), 'first second');
});

test('a stale generation cannot update or clear a newer generation display', () => {
  const { createStreamDisplayState } = require('../src/interaction-inserter/stream-display.ts');
  const assistantA = { id: 'assistant-a', content: 'canonical-a' };
  const assistantB = { id: 'assistant-b', content: 'canonical-b' };
  const streamDisplay = createStreamDisplayState();

  streamDisplay.start('generation-a', assistantA.id);
  streamDisplay.update('generation-a', 'stream-a');
  streamDisplay.start('generation-b', assistantB.id);
  streamDisplay.update('generation-b', 'stream-b');
  streamDisplay.update('generation-a', 'stale-a');
  streamDisplay.clear('generation-a');

  assert.equal(streamDisplay.contentFor(assistantB), 'stream-b');
  assert.equal(streamDisplay.contentFor(assistantA), 'canonical-a');

  streamDisplay.clear('generation-b');
  assert.equal(streamDisplay.contentFor(assistantB), 'canonical-b');
});
