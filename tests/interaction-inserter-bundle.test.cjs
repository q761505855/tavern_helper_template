/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

test('interaction inserter bundles Pinia instead of loading it from the CDN', () => {
  const bundle = readFileSync('publish/interaction-inserter/index.js', 'utf8');

  assert.doesNotMatch(bundle, /npm\/pinia\/\+esm/);
});
