/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { removeInteractionRecordContexts } = require('../src/interaction-inserter/regex.ts');

test('removes one interaction context and keeps the original message body', () => {
  const source = '原正文\n\n<interaction_records_context>\n<records>互动</records>\n</interaction_records_context>\n\n';

  assert.deepEqual(removeInteractionRecordContexts(source), { message: '原正文', removedCount: 1 });
});

test('removes every interaction context even when attributes, case, or inner content changed', () => {
  const source = [
    '正文',
    '<interaction_records_context data-edited="yes">手动修改内容</interaction_records_context>',
    '中间正文',
    '<INTERACTION_RECORDS_CONTEXT>另一段</INTERACTION_RECORDS_CONTEXT>',
  ].join('\n\n');

  assert.deepEqual(removeInteractionRecordContexts(source), {
    message: '正文\n\n\n\n中间正文',
    removedCount: 2,
  });
});

test('leaves a message without interaction contexts unchanged', () => {
  assert.deepEqual(removeInteractionRecordContexts('普通正文\n'), { message: '普通正文\n', removedCount: 0 });
});
