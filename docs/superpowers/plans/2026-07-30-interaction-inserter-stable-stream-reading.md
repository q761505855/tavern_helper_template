# Interaction Inserter Stable Stream Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the interaction-inserter viewport stable while an AI bubble streams and when generation ends, while still scrolling once for a newly appended message.

**Architecture:** Narrow the Vue watcher to structural chat changes only: workbench visibility, active session, and message count. Remove content-growth and generation-completion watchers plus their tracking state, so streamed text only changes bubble height.

**Tech Stack:** Vue 3 Composition API, TypeScript, Node.js built-in test runner, webpack.

## Global Constraints

- Preserve real-time streamed text rendering and all generation/persistence behavior.
- Opening the workbench, switching sessions, and appending messages may scroll the internal chat container to the bottom.
- Stream content updates and generation completion, failure, or stop must not write the internal chat container's `scrollTop`.
- Scrolling affects only `.ii-messages`.
- Do not add dependencies or a UI animation.

---

## File Structure

- Modify `tests/interaction-inserter-scroll.test.cjs`: define the new stable-reading policy and remove the obsolete completion-follow expectation.
- Modify `src/interaction-inserter/chat-scroll.ts`: retain only visible-workbench and direct bottom-scroll behavior.
- Modify `src/interaction-inserter/App.vue`: remove stream-content and generation-completion scroll triggers.
- Rebuild `publish/interaction-inserter/index.js` and its source map.

### Task 1: Keep the Viewport Stable During Stream Growth

**Files:**
- Modify: `tests/interaction-inserter-scroll.test.cjs`
- Modify: `src/interaction-inserter/chat-scroll.ts`
- Modify: `src/interaction-inserter/App.vue`
- Regenerate: `publish/interaction-inserter/index.js`
- Regenerate: `publish/interaction-inserter/index.js.map`

**Interfaces:**
- Retains: `scrollChatToBottom(element): void`.
- Retains: `shouldForceWorkbenchScroll(isOpen, view): boolean`.
- Removes: `CHAT_BOTTOM_THRESHOLD_PX`, `isNearChatBottom`, and `shouldForceGenerationCompletionScroll`.
- Removes local Vue state and watchers used only for stream following.

- [ ] **Step 1: Write the failing policy test**

Change `tests/interaction-inserter-scroll.test.cjs` so it verifies:

```js
test('stream growth and generation completion have no scroll policy hooks', async () => {
  const policy = await loadScrollPolicy();

  assert.equal(policy.isNearChatBottom, undefined);
  assert.equal(policy.shouldForceGenerationCompletionScroll, undefined);
});
```

Retain the executable tests for `scrollChatToBottom` and `shouldForceWorkbenchScroll`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/interaction-inserter-scroll.test.cjs
```

Expected: FAIL because the old stream-follow and completion-scroll exports still exist.

- [ ] **Step 3: Implement the minimal policy change**

In `src/interaction-inserter/chat-scroll.ts`, remove `CHAT_BOTTOM_THRESHOLD_PX`, `ChatScrollMetrics`, `isNearChatBottom`, and `shouldForceGenerationCompletionScroll`.

In `src/interaction-inserter/App.vue`:

- import only `scrollChatToBottom` and `shouldForceWorkbenchScroll`;
- remove `followsLatestMessage`, `generationSessionId`, and `handleMessagesScroll`;
- remove the passive scroll listener from `.ii-messages`;
- make `scrollMessagesToBottom` unconditionally scroll after `nextTick`;
- retain the structural watcher for open/view/session/message-count changes;
- remove the last-message-content watcher;
- remove the `store.isGenerating` watcher.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
node --test tests/interaction-inserter-scroll.test.cjs tests/interaction-inserter-stream-display.test.cjs
```

Expected: all focused tests PASS.

- [ ] **Step 5: Run scoped static checks and build**

Run:

```powershell
pnpm.cmd eslint src/interaction-inserter/App.vue src/interaction-inserter/chat-scroll.ts tests/interaction-inserter-scroll.test.cjs
pnpm.cmd build
Copy-Item -LiteralPath dist\interaction-inserter\index.js -Destination publish\interaction-inserter\index.js -Force
Copy-Item -LiteralPath dist\interaction-inserter\index.js.map -Destination publish\interaction-inserter\index.js.map -Force
```

Expected: lint and build exit 0, then the generated interaction-inserter bundle and source map are copied into the publish directory.

- [ ] **Step 6: Run interaction-inserter regression tests**

Run:

```powershell
node --test tests/interaction-inserter-*.test.cjs
```

Expected: all interaction-inserter tests PASS.

- [ ] **Step 7: Inspect and commit**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Commit only the planned source, test, plan, and generated bundle files.
