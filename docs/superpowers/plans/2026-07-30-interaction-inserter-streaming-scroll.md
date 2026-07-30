# Interaction Inserter Streaming and Auto-Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make interaction-inserter AI bubbles repaint on every real stream update and keep the internal chat viewport at the latest message without interrupting users who scroll upward.

**Architecture:** Keep the existing `generateRaw` event pipeline and make its assistant-message reference point at Vue's reactive array proxy. Add a small DOM-independent scroll policy module, then let `App.vue` watch session/message/generation changes and apply that policy after Vue finishes rendering.

**Tech Stack:** Vue 3 Composition API, Pinia 3, TypeScript, Node.js built-in test runner, webpack.

## Global Constraints

- Preserve the existing `generateRaw`, `generation_id`, sanitization, prompt, persistence, and message schema behavior.
- New message bubbles and session changes force the internal chat viewport to the bottom.
- Stream chunks follow the bottom only while the user remains within 48 pixels of it.
- A user scroll above the threshold pauses stream following; returning to the threshold resumes it.
- Generation completion, failure, or stop forces the viewport to the bottom and restores following.
- Scrolling affects only `.ii-messages`, never the SillyTavern host page.
- Do not add a typing animation or a second source of truth for streamed text.
- Do not add dependencies.
- The user will manually validate the Vue streaming and scroll interaction in SillyTavern; do not add source-text assertions or a heavyweight UI test harness.

---

## File Structure

- Modify `src/interaction-inserter/store.ts`: return the reactive message stored in the session array so stream callbacks trigger Vue repainting.
- Create `src/interaction-inserter/chat-scroll.ts`: own bottom-distance calculation and direct scroll-to-bottom behavior.
- Modify `src/interaction-inserter/App.vue`: connect the chat DOM element, user scroll state, and Vue post-render watchers.
- Create `tests/interaction-inserter-scroll.test.cjs`: execute the scroll policy with deterministic fake element metrics.

### Task 1: Stream Into the Reactive Assistant Message

**Files:**
- Modify: `src/interaction-inserter/store.ts:732-738`

**Interfaces:**
- Consumes: `InteractionSession.messages: InteractionMessage[]`.
- Produces: `appendMessage(session, role, content): InteractionMessage`, returning the element read back from the reactive `session.messages` array.

- [ ] **Step 1: Return Vue's reactive array element**

Change `appendMessage` in `src/interaction-inserter/store.ts` to:

```ts
function appendMessage(session: InteractionSession, role: MessageRole, content: string): InteractionMessage {
  const message = { id: makeId('message'), role, content, createdAt: Date.now() };
  session.messages.push(message);
  session.updatedAt = Date.now();
  session.merged = false;
  return session.messages[session.messages.length - 1];
}
```

Do not change `applyStreamText`: its existing `assistantMessage.content = sanitizedText` assignment will now target the reactive proxy returned above.

- [ ] **Step 2: Run the existing interaction-inserter tests**

Run:

```powershell
node --test tests/interaction-inserter-*.test.cjs
```

Expected: all existing interaction-inserter tests PASS.

- [ ] **Step 3: Run static checking for the production change**

Run:

```powershell
pnpm.cmd lint
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Commit the reactive streaming fix**

```powershell
git add -- src/interaction-inserter/store.ts
git commit -m "fix: repaint interaction replies while streaming"
```

### Task 2: Define and Test the Chat Bottom Policy

**Files:**
- Create: `src/interaction-inserter/chat-scroll.ts`
- Create: `tests/interaction-inserter-scroll.test.cjs`

**Interfaces:**
- Produces: `CHAT_BOTTOM_THRESHOLD_PX: 48`.
- Produces: `isNearChatBottom(metrics: ChatScrollMetrics, threshold?: number): boolean`.
- Produces: `scrollChatToBottom(element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>): void`.
- Consumers: Task 3 imports all three exports into `App.vue`.

- [ ] **Step 1: Write the failing executable tests**

Create `tests/interaction-inserter-scroll.test.cjs`:

```js
/* eslint-disable @typescript-eslint/no-require-imports, import-x/no-nodejs-modules */
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const modulePath = 'src/interaction-inserter/chat-scroll.ts';

async function loadScrollPolicy() {
  assert.equal(existsSync(modulePath), true, `${modulePath} should exist`);
  return import(pathToFileURL(modulePath).href);
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/interaction-inserter-scroll.test.cjs
```

Expected: FAIL with `src/interaction-inserter/chat-scroll.ts should exist`.

- [ ] **Step 3: Implement the minimal scroll policy**

Create `src/interaction-inserter/chat-scroll.ts`:

```ts
export const CHAT_BOTTOM_THRESHOLD_PX = 48;

export type ChatScrollMetrics = Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>;

export function isNearChatBottom(
  { scrollHeight, scrollTop, clientHeight }: ChatScrollMetrics,
  threshold = CHAT_BOTTOM_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

export function scrollChatToBottom(element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>): void {
  element.scrollTop = element.scrollHeight;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test tests/interaction-inserter-scroll.test.cjs
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run lint**

Run:

```powershell
pnpm.cmd lint
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 6: Commit the tested scroll policy**

```powershell
git add -- src/interaction-inserter/chat-scroll.ts tests/interaction-inserter-scroll.test.cjs
git commit -m "test: define interaction chat scroll policy"
```

### Task 3: Connect Scroll Following to the Vue Chat View

**Files:**
- Modify: `src/interaction-inserter/App.vue:79`
- Modify: `src/interaction-inserter/App.vue:298-315`

**Interfaces:**
- Consumes: `isNearChatBottom(metrics)` and `scrollChatToBottom(element)` from `./chat-scroll`.
- Consumes: `store.isOpen`, `store.state.activeSessionId`, `store.activeSession?.messages`, and `store.isGenerating`.
- Produces: local `messagesElement`, `followsLatestMessage`, `handleMessagesScroll`, and `scrollMessagesToBottom`.

- [ ] **Step 1: Bind the scrollable message element**

Change the message container opening tag in `src/interaction-inserter/App.vue` to:

```vue
<div ref="messagesElement" class="ii-messages" @scroll.passive="handleMessagesScroll">
```

- [ ] **Step 2: Add the scroll state and operations**

At the start of `<script setup lang="ts">`, use:

```ts
import { nextTick, ref, watch } from 'vue';
import { isNearChatBottom, scrollChatToBottom } from './chat-scroll';
import { useInteractionStore } from './store';

const store = useInteractionStore();
const messagesElement = ref<HTMLElement | null>(null);
const followsLatestMessage = ref(true);

function handleMessagesScroll() {
  const element = messagesElement.value;
  if (!element) return;
  followsLatestMessage.value = isNearChatBottom(element);
}

async function scrollMessagesToBottom(force: boolean) {
  await nextTick();
  const element = messagesElement.value;
  if (!element || (!force && !followsLatestMessage.value)) return;
  scrollChatToBottom(element);
  if (force) followsLatestMessage.value = true;
}
```

- [ ] **Step 3: Add post-render watchers**

Insert these watchers before `handleComposerKeydown`:

```ts
watch(
  () => [store.isOpen, store.state.activeSessionId, store.activeSession?.messages.length ?? 0] as const,
  ([isOpen]) => {
    if (isOpen) void scrollMessagesToBottom(true);
  },
  { flush: 'post' },
);

watch(
  () => {
    const messages = store.activeSession?.messages;
    return messages && messages.length > 0 ? messages[messages.length - 1].content : '';
  },
  () => {
    void scrollMessagesToBottom(false);
  },
  { flush: 'post' },
);

watch(
  () => store.isGenerating,
  generating => {
    if (!generating) void scrollMessagesToBottom(true);
  },
  { flush: 'post' },
);
```

The first watcher forces scrolling for opening, session changes, and message additions. The second follows stream growth only when `followsLatestMessage` remains true. The third forces the final success, failure, or stop state into view.

- [ ] **Step 4: Run focused UI and scroll tests**

Run:

```powershell
node --test tests/interaction-inserter-ui.test.cjs tests/interaction-inserter-scroll.test.cjs
```

Expected: all tests PASS.

- [ ] **Step 5: Run the complete automated test suite**

Run:

```powershell
node --test tests/*.test.cjs
```

Expected: all tests PASS with 0 failures.

- [ ] **Step 6: Run static checks and the production build**

Run:

```powershell
pnpm.cmd lint
pnpm.cmd build
```

Expected: both commands exit 0; webpack produces the interaction-inserter bundle without TypeScript, Vue, or ESLint errors.

- [ ] **Step 7: Inspect generated and source changes**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: only the planned source/test files and generated interaction-inserter bundle artifacts are changed; `git diff --check` emits no errors.

- [ ] **Step 8: Commit the Vue integration and generated bundle**

```powershell
git add -- src/interaction-inserter/App.vue publish/interaction-inserter/index.js publish/interaction-inserter/index.js.map
git commit -m "fix: keep interaction chat pinned to latest reply"
```

## Final Verification

- [ ] Run `node --test tests/*.test.cjs` and confirm 0 failures.
- [ ] Run `pnpm.cmd lint` and confirm exit code 0.
- [ ] Run `pnpm.cmd build` and confirm exit code 0.
- [ ] Run `git status --short` and verify the worktree contains no unintended or uncommitted changes.
- [ ] Re-read `docs/superpowers/specs/2026-07-30-interaction-inserter-streaming-scroll-design.md` and confirm every acceptance item is implemented or explicitly identified as requiring manual SillyTavern runtime validation.
- [ ] Hand the SillyTavern runtime checklist to the user for manual verification of stream repainting and scroll behavior.
