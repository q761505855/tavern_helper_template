/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const postcss = require('postcss');
const sass = require('sass');

const appVue = readFileSync('src/interaction-inserter/App.vue', 'utf8');
const css = sass.compile('src/interaction-inserter/style.scss').css;
const root = postcss.parse(css);

function declarationsFor(selector) {
  const declarations = {};
  root.walkRules(rule => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls(declaration => {
        declarations[declaration.prop] = declaration.value;
      });
    }
  });
  return declarations;
}

test('character and interaction panels share sidebar height and scroll independently', () => {
  assert.match(appVue, /class="ii-panel ii-characters"/);
  assert.match(appVue, /class="ii-session-list"/);

  const sidebar = declarationsFor('.ii-sidebar');
  assert.equal(sidebar['overflow-y'], 'auto');
  assert.equal(sidebar['grid-template-rows'], 'auto minmax(164px, 1fr) minmax(140px, 1fr)');

  for (const selector of ['.ii-character-list', '.ii-session-list']) {
    const list = declarationsFor(selector);
    assert.equal(list['min-height'], '0');
    assert.equal(list['overflow-x'], 'hidden');
    assert.equal(list['overflow-y'], 'auto');
  }

  assert.equal(declarationsFor('.ii-character-list')['align-content'], 'start');
});
