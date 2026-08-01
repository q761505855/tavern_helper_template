# Interaction Inserter Sidebar List Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the character and interaction panels share sidebar space equally while keeping at least one item visible in each and scrolling long lists independently.

**Architecture:** Keep the existing Vue component and SCSS structure. Add semantic wrappers for both scrollable lists, make each panel a fixed-header flex column, and use two equal `1fr` sidebar tracks with content-based minimum heights and a sidebar overflow fallback.

**Tech Stack:** Vue 3 single-file component, SCSS, Node.js built-in test runner, Sass compiler, PostCSS parser.

## Global Constraints

- The mode selector remains fixed above the two list panels.
- The character and interaction panels use equal `1:1` weight when enough height is available.
- Each panel preserves room for at least one item.
- Each list scrolls independently; an extremely short sidebar scrolls as a whole.
- Desktop sidebar and mobile drawer share the same rules.
- No character, session, or other business behavior changes.

---

### Task 1: Sidebar list layout contract

**Files:**
- Create: `tests/interaction-inserter-sidebar-layout.test.cjs`
- Modify: `src/interaction-inserter/App.vue`
- Modify: `src/interaction-inserter/style.scss`

**Interfaces:**
- Consumes: Existing `.ii-sidebar`, `.ii-panel`, `.ii-character-list`, and `.ii-sessions` markup and styles.
- Produces: `.ii-characters` and `.ii-session-list` layout hooks; independently scrollable character and session item containers.

- [ ] **Step 1: Write the failing layout test**

Create a Node test that compiles `style.scss`, parses the CSS with PostCSS, and checks these observable layout rules:

```js
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
  assert.match(sidebar['grid-template-rows'], /^auto minmax\(.+, 1fr\) minmax\(.+, 1fr\)$/);

  for (const selector of ['.ii-character-list', '.ii-session-list']) {
    const list = declarationsFor(selector);
    assert.equal(list['min-height'], '0');
    assert.equal(list['overflow-x'], 'hidden');
    assert.equal(list['overflow-y'], 'auto');
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/interaction-inserter-sidebar-layout.test.cjs`

Expected: FAIL because `.ii-characters` and `.ii-session-list` do not exist and the character list has no independent overflow.

- [ ] **Step 3: Add semantic list wrappers and minimal layout styles**

In `App.vue`, add `ii-characters` to the character panel and wrap all session entries plus their empty state in:

```vue
<div class="ii-session-list">
  <!-- existing session loop and empty state -->
</div>
```

In `style.scss`:

```scss
.ii-sidebar {
  grid-template-rows: auto minmax(164px, 1fr) minmax(132px, 1fr);
  overflow-y: auto;
}

.ii-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.ii-character-list,
.ii-session-list {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.ii-character-list {
  flex: 1;
}

.ii-session-list {
  flex: 1;
}

.ii-sessions {
  min-height: 0;
  overflow: hidden;
}
```

Keep the existing item spacing rules. The `164px` character minimum covers its header, add form, and one character item; the `132px` session minimum covers its header, margins, and one session item. Both tracks use `1fr`, so available space is equal by default.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/interaction-inserter-sidebar-layout.test.cjs`

Expected: PASS.

- [ ] **Step 5: Run interaction-inserter regression tests and build**

Run: `node --test tests/interaction-inserter-*.test.cjs`

Expected: all interaction-inserter tests pass.

Run: `pnpm build`

Expected: production bundle completes without errors.

- [ ] **Step 6: Commit the implementation**

```bash
git add tests/interaction-inserter-sidebar-layout.test.cjs src/interaction-inserter/App.vue src/interaction-inserter/style.scss
git commit -m "fix: keep interaction sidebar lists scrollable"
```
