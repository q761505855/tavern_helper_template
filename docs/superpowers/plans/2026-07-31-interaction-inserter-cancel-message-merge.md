# Interaction Inserter Cancel Message Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a “取消合并” action that removes every interaction context block from the current message and restores merged sessions to pending.

**Architecture:** Put the text transformation in a pure exported helper beside the existing interaction-record display regex, returning both the cleaned text and removal count. Keep Tavern Helper I/O and session-state updates in the Pinia store, while the Vue footer only invokes the store action.

**Tech Stack:** TypeScript, Vue 3, Pinia, Tavern Helper chat-message APIs, Node.js `node:test`.

## Global Constraints

- Match every complete `<interaction_records_context>...</interaction_records_context>` block across lines, non-greedily and case-insensitively, including opening tags with attributes.
- Remove matching blocks even when their inner `<records>` content was manually changed.
- Only trim whitespace left at the end of the message; preserve all other non-matching body text.
- Restore every `merged: true` session to `merged: false` only after at least one block was removed and the message update succeeded.
- Do not delete interaction messages, character data, or worldbook content, and do not close the workbench.

---

### Task 1: Pure interaction-context removal

**Files:**
- Modify: `src/interaction-inserter/regex.ts`
- Create: `tests/interaction-inserter-regex.test.cjs`

**Interfaces:**
- Consumes: A raw message body string.
- Produces: `removeInteractionRecordContexts(message: string): { message: string; removedCount: number }`.

- [ ] **Step 1: Write the failing pure-function tests**

Create `tests/interaction-inserter-regex.test.cjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/interaction-inserter-regex.test.cjs`

Expected: FAIL because `removeInteractionRecordContexts` is not exported.

- [ ] **Step 3: Implement the minimal pure helper**

Add to `src/interaction-inserter/regex.ts`:

```ts
const INTERACTION_RECORDS_CONTEXT_REGEX =
  /<interaction_records_context\b[^>]*>[\s\S]*?<\/interaction_records_context\s*>/gi;

export function removeInteractionRecordContexts(message: string): { message: string; removedCount: number } {
  let removedCount = 0;
  const nextMessage = message.replace(INTERACTION_RECORDS_CONTEXT_REGEX, () => {
    removedCount += 1;
    return '';
  });
  return {
    message: removedCount > 0 ? nextMessage.trimEnd() : message,
    removedCount,
  };
}
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `node --test tests/interaction-inserter-regex.test.cjs`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the pure helper**

```bash
git add src/interaction-inserter/regex.ts tests/interaction-inserter-regex.test.cjs
git commit -m "feat: remove merged interaction contexts"
```

### Task 2: Store action and footer button

**Files:**
- Modify: `src/interaction-inserter/store.ts`
- Modify: `src/interaction-inserter/App.vue`
- Modify: `tests/interaction-inserter-ui.test.cjs`

**Interfaces:**
- Consumes: `removeInteractionRecordContexts(message: string)` from Task 1, `getChatMessages(-1)`, and `setChatMessages(...)`.
- Produces: Store action `cancelMessageMerge(): Promise<void>` and a footer button bound with `@click="store.cancelMessageMerge"`.

- [ ] **Step 1: Write the failing UI/store contract test**

Append to `tests/interaction-inserter-ui.test.cjs`:

```js
test('cancel merge removes current-message contexts and restores merged sessions to pending', () => {
  const cancelButton = '@click="store.cancelMessageMerge"';
  const cancelIndex = appVue.indexOf(cancelButton);
  const mergeIndex = appVue.indexOf('@click="store.mergeAndExit"');

  assert.notEqual(cancelIndex, -1);
  assert.ok(cancelIndex < mergeIndex);
  assert.match(appVue.slice(appVue.lastIndexOf('<button', cancelIndex), cancelIndex), /class="ii-btn"/);
  assert.match(storeTs, /async function cancelMessageMerge\(\)/);
  assert.match(storeTs, /removeInteractionRecordContexts\(currentMessage\.message\)/);
  assert.match(storeTs, /setChatMessages/);
  assert.match(storeTs, /session\.merged = false/);
  assert.match(storeTs, /cancelMessageMerge,/);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/interaction-inserter-ui.test.cjs`

Expected: FAIL because the button and `cancelMessageMerge` action do not exist.

- [ ] **Step 3: Implement the store action**

In `src/interaction-inserter/store.ts`, import `removeInteractionRecordContexts` from `./regex` and add:

```ts
async function cancelMessageMerge() {
  const currentMessage = getChatMessages(-1)[0];
  if (!currentMessage) {
    toastr.warning('当前没有可取消合并的楼层消息');
    return;
  }
  const result = removeInteractionRecordContexts(currentMessage.message);
  if (result.removedCount === 0) {
    toastr.warning('当前楼层没有已合并的互动内容');
    return;
  }
  await setChatMessages(
    [{ message_id: currentMessage.message_id, message: result.message }],
    { refresh: 'affected' },
  );
  for (const session of state.value.sessions) {
    if (session.merged) session.merged = false;
  }
  persistState();
  toastr.success(`已取消合并 ${result.removedCount} 段互动内容`);
}
```

Expose `cancelMessageMerge` from the store return object.

- [ ] **Step 4: Add the footer button**

In `src/interaction-inserter/App.vue`, immediately before “合并并退出” add:

```vue
<button v-if="store.view === 'workbench'" class="ii-btn" @click="store.cancelMessageMerge">取消合并</button>
```

- [ ] **Step 5: Run focused tests and lint**

Run:

```bash
node --test tests/interaction-inserter-regex.test.cjs tests/interaction-inserter-ui.test.cjs
pnpm exec eslint src/interaction-inserter/regex.ts src/interaction-inserter/store.ts src/interaction-inserter/App.vue tests/interaction-inserter-regex.test.cjs tests/interaction-inserter-ui.test.cjs
```

Expected: all focused tests PASS and ESLint exits 0.

- [ ] **Step 6: Run full verification**

Run:

```bash
node --test tests/*.test.cjs
pnpm build:dev
```

Expected: all tests PASS and the development bundle builds successfully.

- [ ] **Step 7: Commit the integrated feature**

```bash
git add src/interaction-inserter/store.ts src/interaction-inserter/App.vue tests/interaction-inserter-ui.test.cjs
git commit -m "feat: cancel interaction merge from message"
```
