# Interaction Inserter Preset Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the interaction inserter preset into a professional, dialogue-led preset with itemized prompt files, mode-specific defaults, and an optional character psychology switch.

**Architecture:** Keep the preset YAML as the prompt-order and switch layer. Move reusable long prompt bodies into `条目/` files. Keep mode-specific behavior and the worldbook merge template in `默认提示词配置.json` because the interaction inserter UI expands those values through `{{ii_scene_prompt}}`, `{{ii_private_prompt}}`, `{{ii_remote_prompt}}`, and `{{ii_context_prompt}}`.

**Tech Stack:** Tavern Helper preset YAML, interaction inserter JSON prompt config, PowerShell validation, Node.js JSON parsing.

---

### Task 1: Create Itemized Prompt Files

**Files:**
- Create: `tavern_sync/互动插入器预设/条目/📑使用说明.txt`
- Create: `tavern_sync/互动插入器预设/条目/✅互动插入器核心规则.txt`
- Create: `tavern_sync/互动插入器预设/条目/🧭人称与控制权.txt`
- Create: `tavern_sync/互动插入器预设/条目/🗣输出格式.txt`
- Create: `tavern_sync/互动插入器预设/条目/💬对白质感.txt`
- Create: `tavern_sync/互动插入器预设/条目/🎭动作表情控制.txt`
- Create: `tavern_sync/互动插入器预设/条目/🧠角色心理开关.txt`
- Create: `tavern_sync/互动插入器预设/条目/🧩模式协同规则.txt`
- Create: `tavern_sync/互动插入器预设/条目/🛑后置约束.txt`

- [ ] **Step 1: Create the `条目/` directory**

Run: `New-Item -ItemType Directory -Force -LiteralPath 'tavern_sync\互动插入器预设\条目'`
Expected: directory exists.

- [ ] **Step 2: Add focused prompt files**

Use `apply_patch` to add the nine files above. Each file should contain one prompt responsibility only.

- [ ] **Step 3: Verify file names**

Run: `Get-ChildItem -LiteralPath 'tavern_sync\互动插入器预设\条目'`
Expected: all nine files are present.

### Task 2: Rewrite Preset YAML

**Files:**
- Modify: `tavern_sync/互动插入器预设/互动插入器预设.yaml`

- [ ] **Step 1: Replace inline long prompt content with `文件:` references**

The YAML should reference the new item files for core rules, output format, person control, dialogue quality, action control, optional psychology, mode cooperation, and final constraints.

- [ ] **Step 2: Preserve interaction inserter extension prompts**

Keep:

```yaml
额外字段:
  interactionInserter:
    类型: interaction_history
```

and:

```yaml
额外字段:
  interactionInserter:
    类型: 用户输入
```

- [ ] **Step 3: Preserve required macros**

Keep mode prompt content exactly:

```text
{{ii_scene_prompt}}{{ii_private_prompt}}{{ii_remote_prompt}}
```

Keep context prompt content exactly:

```text
{{ii_context_prompt}}
```

### Task 3: Rewrite Default Prompt Config JSON

**Files:**
- Modify: `tavern_sync/互动插入器预设/默认提示词配置.json`

- [ ] **Step 1: Expand `scene` prompt**

Describe 当下场景 as local shared interaction with possible multiple known participants and short recoverable responses.

- [ ] **Step 2: Expand `private` prompt**

Describe 一对一 as face-to-face chat, with fast response to speech and simple user actions.

- [ ] **Step 3: Expand `remote` prompt**

Describe remote communication as world-appropriate communication where dialogue/message content is primary and psychology switch remains valid as a user-side extra view.

- [ ] **Step 4: Expand `worldbookTemplate`**

Tell later main-chat generation to absorb concrete interaction facts without replaying all lines.

### Task 4: Validate The Preset

**Files:**
- Read: `tavern_sync/互动插入器预设/互动插入器预设.yaml`
- Read: `tavern_sync/互动插入器预设/默认提示词配置.json`

- [ ] **Step 1: Validate JSON**

Run:

```powershell
Get-Content -LiteralPath 'tavern_sync\互动插入器预设\默认提示词配置.json' -Raw | ConvertFrom-Json | Out-Null
```

Expected: command exits successfully.

- [ ] **Step 2: Verify YAML file references**

Run:

```powershell
$root='tavern_sync\互动插入器预设'; Select-String -LiteralPath "$root\互动插入器预设.yaml" -Pattern '文件:\s*(.+)$' | ForEach-Object { $rel=$_.Matches[0].Groups[1].Value.Trim(); $path=Join-Path $root $rel; if (-not (Test-Path -LiteralPath $path)) { throw "Missing file reference: $rel" } }
```

Expected: command exits successfully.

- [ ] **Step 3: Verify required macros and extension types**

Run:

```powershell
$yaml=Get-Content -LiteralPath 'tavern_sync\互动插入器预设\互动插入器预设.yaml' -Raw; if ($yaml -notmatch '\{\{ii_scene_prompt\}\}\{\{ii_private_prompt\}\}\{\{ii_remote_prompt\}\}') { throw 'Missing mode macros' }; if ($yaml -notmatch '\{\{ii_context_prompt\}\}') { throw 'Missing context macro' }; if ($yaml -notmatch 'interaction_history') { throw 'Missing interaction history extension' }; if ($yaml -notmatch '用户输入') { throw 'Missing user input extension' }
```

Expected: command exits successfully.
