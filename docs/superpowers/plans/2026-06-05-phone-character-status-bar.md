# 手机角色状态栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent Vue frontend named `手机角色状态栏` that presents a warm mobile chat-style character status bar.

**Architecture:** Create one frontend entry folder under `src/手机角色状态栏`. `index.html` only provides the app mount point, `index.ts` mounts Vue after jQuery load, and `界面.vue` owns static display data plus scoped responsive styling.

**Tech Stack:** Vue 3, TypeScript, scoped SCSS, existing webpack frontend discovery.

---

### Task 1: Independent Frontend Shell

**Files:**
- Create: `src/手机角色状态栏/index.html`
- Create: `src/手机角色状态栏/index.ts`

- [ ] **Step 1: Add static mount point**

```html
<head></head>
<body>
  <div id="app"></div>
</body>
```

- [ ] **Step 2: Add Vue bootstrapping**

```ts
import App from './界面.vue';

$(() => {
  createApp(App).mount('#app');
});
```

### Task 2: Phone Chat Status Component

**Files:**
- Create: `src/手机角色状态栏/界面.vue`

- [ ] **Step 1: Define static status data in `<script setup>`**

```ts
interface StatusMetric {
  label: string;
  value: string;
  percent: number;
}

const statusMetrics: StatusMetric[] = [
  { label: '心情', value: '平稳', percent: 76 },
  { label: '精力', value: '充足', percent: 64 },
  { label: '好感', value: '亲近', percent: 68 },
];
```

- [ ] **Step 2: Build the phone frame, notch, chat area, status card, and input bar**

Use semantic markup with classes scoped to the component. Keep all content in normal document flow and size the phone with `width` plus `aspect-ratio`.

- [ ] **Step 3: Add scoped SCSS**

Use a warm social app palette, stable dimensions, responsive max widths, no `vh`, no horizontal overflow, and reduced-motion handling.

### Task 3: Verification

**Files:**
- Verify: `src/手机角色状态栏/index.html`
- Verify: `src/手机角色状态栏/index.ts`
- Verify: `src/手机角色状态栏/界面.vue`

- [ ] **Step 1: Format the new frontend files**

Run: `pnpm exec prettier --write "src/手机角色状态栏/**/*.{ts,html,vue}"`

Expected: Prettier rewrites or confirms the three files.

- [ ] **Step 2: Build the project**

Run: `pnpm build:dev`

Expected: webpack includes `src/手机角色状态栏/index.ts` and emits `dist/手机角色状态栏/index.html`.
