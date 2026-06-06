/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { readTavernUserName, roleDisplayName } = require('../src/interaction-inserter/labels.ts');

test('uses current tavern user name for user messages', () => {
  assert.equal(roleDisplayName('user', { userName: 'Alice', characterName: 'Noel' }), 'Alice');
});

test('uses selected interaction character name for assistant messages', () => {
  assert.equal(roleDisplayName('assistant', { userName: 'Alice', characterName: 'Noel' }), 'Noel');
});

test('falls back to macro-like user label and AI when names are missing', () => {
  assert.equal(roleDisplayName('user', {}), '<user>');
  assert.equal(roleDisplayName('assistant', {}), 'AI');
});

test('resolves <user> before showing the name in inserter UI', () => {
  const originalName1 = globalThis.name1;
  const originalSubstituteParams = globalThis.substituteParams;
  globalThis.name1 = '<user>';
  globalThis.substituteParams = content => content.replaceAll('<user>', 'Alice');

  try {
    assert.equal(readTavernUserName(), 'Alice');
  } finally {
    globalThis.name1 = originalName1;
    globalThis.substituteParams = originalSubstituteParams;
  }
});

test('reads and resolves user name from SillyTavern context in inserter UI', () => {
  const originalSillyTavern = globalThis.SillyTavern;
  const originalSubstitudeMacros = globalThis.substitudeMacros;
  globalThis.SillyTavern = {
    getContext: () => ({ name1: '<user>' }),
  };
  globalThis.substitudeMacros = content => content.replaceAll('<user>', 'Context Alice');

  try {
    assert.equal(readTavernUserName(), 'Context Alice');
  } finally {
    globalThis.SillyTavern = originalSillyTavern;
    globalThis.substitudeMacros = originalSubstitudeMacros;
  }
});
