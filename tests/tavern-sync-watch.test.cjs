/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

const tavernSyncMjs = readFileSync('tavern_sync.mjs', 'utf8');

test('preset watcher includes the main preset yaml file', () => {
  const presetSyncerMatch = tavernSyncMjs.match(/class Preset_syncer[\s\S]*?class Worldbook_syncer/);

  assert.ok(presetSyncerMatch, 'Preset_syncer block should exist');
  assert.match(presetSyncerMatch[0], /do_watch\(local_data\)[\s\S]*?\.concat\(this\.file\)/);
});
