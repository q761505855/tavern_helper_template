/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'Node' });
require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { klona } = require('klona');
const { createPinia, defineStore, setActivePinia } = require('pinia');
const { computed, ref, watch } = require('vue');

let runtime;

Object.assign(globalThis, {
  _: require('lodash'),
  z: require('zod').z,
  klona,
  computed,
  defineStore,
  ref,
  watch,
  getScriptId: () => 'interaction-inserter-test',
  getChatCompletionModel: () => 'test-model',
  getVariables: ({ type }) => runtime.variables[type],
  updateVariablesWith: (updater, { type }) => {
    runtime.variables[type] = updater(runtime.variables[type]);
  },
  getChatMessages: () => runtime.messages,
  setChatMessages: async (messages, options) => {
    runtime.setCalls.push({ messages, options });
  },
  eventOn: () => () => {},
  tavern_events: {
    CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed',
    MESSAGE_SENT: 'message_sent',
  },
  iframe_events: {
    STREAM_TOKEN_RECEIVED_INCREMENTALLY: 'stream_token_received_incrementally',
    STREAM_TOKEN_RECEIVED_FULLY: 'stream_token_received_fully',
  },
  toastr: {
    success: message => runtime.successes.push(message),
    warning: message => runtime.warnings.push(message),
  },
});

const { useInteractionStore } = require('../src/interaction-inserter/store.ts');

function makeSession(id, merged) {
  return {
    id,
    mode: 'scene',
    title: id,
    messages: [{ id: `${id}-message`, role: 'user', content: '互动', createdAt: 1 }],
    merged,
    sendToContext: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function createStore(message) {
  runtime = {
    messages: message === undefined ? [] : [{ message_id: 7, message }],
    setCalls: [],
    successes: [],
    warnings: [],
    variables: {
      script: {},
      chat: {
        interactionInserter: {
          characters: [],
          sessions: [makeSession('merged', true), makeSession('pending', false)],
          activeSessionId: 'merged',
        },
      },
    },
  };
  setActivePinia(createPinia());
  return useInteractionStore();
}

test('cancel merge removes every current-message context and restores merged sessions to pending', async () => {
  const store = createStore(
    [
      '原正文',
      '<interaction_records_context>第一段</interaction_records_context>',
      '<interaction_records_context data-edited="yes">修改后的第二段</interaction_records_context>',
    ].join('\n\n'),
  );

  await store.cancelMessageMerge();

  assert.deepEqual(runtime.setCalls, [
    {
      messages: [{ message_id: 7, message: '原正文' }],
      options: { refresh: 'affected' },
    },
  ]);
  assert.deepEqual(
    store.state.sessions.map(session => ({ id: session.id, merged: session.merged })),
    [
      { id: 'merged', merged: false },
      { id: 'pending', merged: false },
    ],
  );
  assert.deepEqual(runtime.successes, ['已取消合并 2 段互动内容']);
});

test('cancel merge leaves session state untouched when the current message has no context block', async () => {
  const store = createStore('普通正文');

  await store.cancelMessageMerge();

  assert.deepEqual(runtime.setCalls, []);
  assert.equal(store.state.sessions[0].merged, true);
  assert.deepEqual(runtime.warnings, ['当前楼层没有已合并的互动内容']);
});

test('cancel merge warns without changing sessions when there is no current message', async () => {
  const store = createStore(undefined);

  await store.cancelMessageMerge();

  assert.deepEqual(runtime.setCalls, []);
  assert.equal(store.state.sessions[0].merged, true);
  assert.deepEqual(runtime.warnings, ['当前没有可取消合并的楼层消息']);
});
