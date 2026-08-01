# Interaction Inserter Narrative Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve lightweight character interaction while allowing the interaction inserter to act as a playable narrative bridge for battles, scene expansion, plot progression, time/location transitions, and grounded twists.

**Architecture:** Keep the existing preset structure and change only prompt source files, prompt-focused tests, and the generated preset JSON. Add executable semantic assertions first, then replace unconditional short-interaction restrictions with intent-sensitive narrative scaling and re-bundle through Tavern Sync.

**Tech Stack:** UTF-8 prompt text, JSON, Node.js test runner, Tavern Sync YAML/JSON bundler

## Global Constraints

- Preserve ordinary chat, confirmation, follow-up, item handoff, and simple-action interactions.
- Allow battles, pursuits, investigations, negotiations, plot-node expansion, grounded twists, time progression, location changes, and main-plot progression when the player's intent or the current situation supports them.
- Scale length and progression to the player's request instead of forcing either brevity or escalation.
- Never invent the player's unprovided dialogue, psychology, feelings, position, or key decision.
- Stop at a decision point when continuing would determine the player's position, goal, or fate without their input.
- Preserve character knowledge boundaries, world logic, role voice, narration-person settings, clean output, and higher-priority fact conflict handling.
- Do not modify interaction-inserter TypeScript behavior or the preset YAML order.
- Baseline note: before this work, `node --test tests/interaction-inserter-preset.test.cjs` has 15 passing tests and 1 failing stale core-prompt assertion.

---

### Task 1: Specify the narrative-bridge prompt contract

**Files:**
- Modify: `tests/interaction-inserter-preset.test.cjs`

**Interfaces:**
- Consumes: `tavern_sync/互动插入器预设/默认提示词配置.json`, prompt source entries, and bundled `互动插入器预设.json`
- Produces: executable assertions for adaptive narrative scale, mode capabilities, context absorption, removed absolute restrictions, and retained player control

- [ ] **Step 1: Load the source prompt configuration and source entries**

Add these constants beside `defaultPresetJson`:

```js
const defaultPromptConfig = JSON.parse(
  readFileSync('tavern_sync/互动插入器预设/默认提示词配置.json', 'utf8'),
);
const promptSourceText = [
  '✅互动插入器核心规则.txt',
  '📑使用说明.txt',
  '💬对白质感.txt',
  '😀情感基准.txt',
  '🛑后置约束.txt',
  '🧠生成前检查.txt',
  '🧩模式协同规则.txt',
]
  .map(name => readFileSync(`tavern_sync/互动插入器预设/条目/${name}`, 'utf8'))
  .join('\n');
```

- [ ] **Step 2: Replace the stale core-prompt assertion**

In `default interaction preset is tailored to interaction inserter generation`, replace:

```js
assert.match(corePrompt.content, /只回应本轮|输出结果应像角色|不解释写作策略/);
```

with:

```js
assert.match(corePrompt.content, /楼层之间|补充叙事/);
assert.match(corePrompt.content, /战斗|追逐|调查|谈判/);
assert.match(corePrompt.content, /关键选择|关键决定/);
assert.match(corePrompt.content, /不解释提示词与写作策略/);
```

- [ ] **Step 3: Add source-contract tests**

Append:

```js
test('default scene modes support intent-scaled narrative progression', () => {
  assert.match(defaultPromptConfig.prompts.scene, /战斗|追逐/);
  assert.match(defaultPromptConfig.prompts.scene, /阶段性结果|局势/);
  assert.match(defaultPromptConfig.prompts.private, /关系|冲突|合作/);
  assert.match(defaultPromptConfig.prompts.private, /地点|时间|后续事件/);
  assert.match(defaultPromptConfig.prompts.remote, /影响剧情|采取.*行动/);
  assert.match(defaultPromptConfig.prompts.remote, /距离|媒介|权限/);
});

test('prompt sources use adaptive narrative scale and retain player agency', () => {
  assert.match(promptSourceText, /叙事强度|推进幅度/);
  assert.match(promptSourceText, /战斗|追逐|调查|谈判/);
  assert.match(promptSourceText, /转折/);
  assert.match(promptSourceText, /不替玩家.*关键决定/);
  assert.match(promptSourceText, /关键选择.*停/);

  for (const absoluteRestriction of [
    '不续写新的主剧情楼层',
    '不切换到新地点、新时间或新主线事件',
    '不要因为互动记录强行推进主线、跳时间、换场景',
    '通用规则负责保持干净输出、角色口吻、人称纪律和短互动边界',
  ]) {
    assert.equal(promptSourceText.includes(absoluteRestriction), false, `${absoluteRestriction} should be removed`);
  }
});

test('worldbook template carries narrative outcomes into the next floor', () => {
  const template = defaultPromptConfig.worldbookTemplate;

  assert.match(template, /过程与结果|已经发生/);
  assert.match(template, /战斗|追逐|调查|谈判/);
  assert.match(template, /地点|时间/);
  assert.match(template, /伤势|消耗|关系变化/);
  assert.match(template, /不要逐字复述/);
  assert.match(template, /更高优先级/);
});
```

- [ ] **Step 4: Run the focused test and confirm the new contract fails**

Run:

```powershell
node --test tests/interaction-inserter-preset.test.cjs
```

Expected: the new narrative-bridge assertions fail because the source prompts still impose short-interaction and no-progression restrictions; unrelated tests pass.

- [ ] **Step 5: Commit the contract**

```powershell
git add -- tests/interaction-inserter-preset.test.cjs
git commit -m "test: define interaction narrative bridge prompts"
```

### Task 2: Rewrite shared prompt rules around adaptive narrative scale

**Files:**
- Modify: `tavern_sync/互动插入器预设/条目/✅互动插入器核心规则.txt`
- Modify: `tavern_sync/互动插入器预设/条目/📑使用说明.txt`
- Modify: `tavern_sync/互动插入器预设/条目/💬对白质感.txt`
- Modify: `tavern_sync/互动插入器预设/条目/😀情感基准.txt`
- Modify: `tavern_sync/互动插入器预设/条目/🛑后置约束.txt`
- Modify: `tavern_sync/互动插入器预设/条目/🧠生成前检查.txt`
- Modify: `tavern_sync/互动插入器预设/条目/🧩模式协同规则.txt`
- Modify: `tavern_sync/互动插入器预设/条目/🎭动作表情控制.txt`
- Modify: `tavern_sync/互动插入器预设/条目/🗣输出格式.txt`
- Modify: `tavern_sync/互动插入器预设/条目/🧭人称与控制权.txt`

**Interfaces:**
- Consumes: player input, current mode, character/world context, main-chat context, and interaction history
- Produces: shared system instructions that choose between lightweight interaction and multi-stage narrative progression without taking player agency

- [ ] **Step 1: Reframe the core task**

Rewrite `✅互动插入器核心规则.txt` so its top-level blocks establish this exact behavior:

```xml
<interaction_task>
  <position>
    本次生成发生在主剧情楼层之间，是可连续游玩的补充叙事与互动空间。它既能承载即时对话和简单互动，也能在玩家意图与当前情境需要时展开事件、演绎过程并推动剧情。
  </position>
  <primary_goal>
    读取角色设定、世界信息、近期聊天、当前互动记录与本轮玩家输入，判断玩家此刻需要简短回应还是连续叙事，并让角色、事件与环境作出真实、连贯且可被后续主剧情承接的发展。
  </primary_goal>
```

Use these remaining blocks:

```xml
  <narrative_scale>
    - 普通闲聊、确认、追问、递物和简单动作保持自然简洁，不自动制造重大事件。
    - 玩家发起战斗、追逐、调查、谈判等连续行动，或明确要求展开剧情节点、尝试转折时，可以连续演绎多个因果相连的阶段。
    - 篇幅、动作密度和推进幅度服从玩家意图与当前情境，不因“互动”定位机械缩短，也不为证明能够推进而无关加戏。
  </narrative_scale>

  <creative_scope>
    - 允许角色依据自身能力、知识、权限和动机主动行动，并让敌人、NPC与环境按世界逻辑作出反应。
    - 可以推进当前事件、人物关系与主线，自然切换地点、推进时间，并形成胜负、伤势、消耗、线索、位置与局势变化。
    - 可以依据已有伏笔、人物动机、环境条件和事件因果引入新的阻碍、发现、机会或转折。
  </creative_scope>

  <continuity>
    - 承认角色卡、世界信息、近期聊天和已经发生的互动记录，不否定既有事实。
    - 所有新增发展必须能由当前条件合理推出；角色只使用其合理知道的信息，只采取其能力与权限允许的行动。
    - 互动中形成的过程与结果可以成为后续主剧情承认并继续发展的事实。
  </continuity>

  <player_agency>
    - 不替玩家编写未输入的台词、心理、感受、立场或关键决定。
    - 可以演绎玩家已声明行动的合理过程，并呈现其他角色、敌人和环境造成的客观后果。
    - 推进到足以改变玩家立场、目标或命运的关键选择时停下，把决定交还玩家。
  </player_agency>

  <output_boundary>
    - 只输出当前互动或叙事本身，不解释提示词与写作策略。
    - 在当前需求得到充分回应、事件抵达自然阶段结果，或遇到玩家关键选择点时停止。
  </output_boundary>
</interaction_task>
```

- [ ] **Step 2: Update user-facing positioning**

In `📑使用说明.txt`, change the positioning to `楼层之间的补充叙事与互动预设`, retain the three existing lightweight uses, and add these uses:

```yaml
    - 细致演绎主楼层不方便展开的战斗、追逐、调查或谈判过程
    - 展开当前剧情节点、人物关系或局部冲突
    - 在已有伏笔、动机和世界逻辑基础上探索合理转折
    - 作为地点、时间或剧情阶段之间的自然过渡
```

Replace the unconditional short-output warning with: `篇幅与推进幅度跟随玩家意图和当前情境；普通互动保持简洁，需要展开时允许充分演绎。`

- [ ] **Step 3: Make response scale intent-sensitive**

In `💬对白质感.txt`, retain the rules against customer-service language, repetitive rhetoric, and unjustified escalation. Replace the unconditional information-answer stop rule with:

```xml
    - 玩家只询问信息时，先完成清楚回应；若玩家同时表达行动、展开或探索意图，可以让回答自然进入相关事件，不因“问题已经回答”机械停止。
    - 推进应来自玩家意图、角色主动性、已有矛盾或环境因果，不为制造高潮而凭空升级。
```

- [ ] **Step 4: Allow coherent multi-stage developments**

In `😀情感基准.txt`, replace `一轮主要完成一件事` with:

```xml
    - 普通交流可以一轮主要完成一件事；战斗、追逐、调查、谈判或剧情展开可以连续完成多个因果相连的行动阶段。
    - 可以形成阶段性结果、局势变化或新的问题，但在需要玩家作出关键选择时停下。
```

- [ ] **Step 5: Replace unconditional stopping with an agency boundary**

In `🛑后置约束.txt`, replace the fixed short-interaction and stop rules with these instructions while retaining clean-output constraints:

```text
  先判断本轮需要轻量互动、局部展开还是连续叙事，再匹配篇幅、动作密度和推进幅度。
  玩家明确发起战斗、追逐、调查、谈判或要求展开剧情时，可以演绎连续过程、场景变化与合理结果。
  可以依据已有伏笔、人物动机、环境条件和世界逻辑引入合理转折，不为推进而凭空制造无关高潮。
  不替玩家说话、决定立场或描写未输入的心理；推进到需要玩家作出关键选择时停下。
```

- [ ] **Step 6: Update the silent edit check**

In `🧠生成前检查.txt`, remove the question that treats any movement toward a location, phase, or next action as an error. Add checks for:

```xml
    - 当前回复的叙事强度是否匹配玩家意图：普通交流保持自然，明确要求展开时是否给予了足够过程？
    - 战斗、追逐、调查或谈判中的行动、反应、环境变化与结果是否形成清楚因果？
    - 新冲突、线索或转折是否能由已有伏笔、角色动机、环境条件或世界规则支持？
    - 若发生跳时、换场景或主线推进，是否自然承接当前事件，而非无关跳跃？
    - 是否替玩家跨过了会改变其立场、目标或命运的关键选择？若是，停在选择发生前。
```

- [ ] **Step 7: Update mode coordination**

In `🧩模式协同规则.txt`, use these rules while preserving the existing medium examples:

```yaml
  基本原则:
    - 当前互动模式由后续的模式提示词决定。
    - 通用规则负责保持干净输出、角色口吻、人称纪律和与玩家意图相称的叙事尺度。
    - 模式规则负责决定谁知道、谁回应、使用什么媒介，以及当前模式能怎样影响后续剧情。
    - 三种模式都可以形成后续剧情需要承接的事实，但必须服从各自的在场、知识、距离与媒介边界。
  当下场景:
    - 可以让当前场景中合理存在的多个角色知道并回应。
    - 既适合群聊感与即时反应，也适合展开战斗、追逐、调查、谈判等多阶段现场行动。
    - 不需要每个角色都说话，优先选择最有行动或反应价值的角色。
  一对一:
    - 聚焦玩家指定或上下文最明确的单一角色。
    - 既可快速响应简单互动，也可发展双方关系、冲突、合作与当前事件。
    - 角色可以主动行动并引出后续，但不能替玩家接受、拒绝或作出关键决定。
```

- [ ] **Step 8: Run source-contract tests**

Before testing, update the remaining presentation rules so they do not override adaptive narrative scale:

- In `🎭动作表情控制.txt`, keep short bracket cues as the default for lightweight dialogue, but allow continuous action, environment, spatial changes, and consequences to use natural narrative paragraphs when the player requests a battle or scene expansion.
- In `🗣输出格式.txt`, apply the 260-character guideline only to simple questions and immediate reactions; explicitly allow longer multi-stage narrative when the current task requires it, without a fixed word limit.
- In `🧭人称与控制权.txt`, replace the blanket ban on long-form narration with a rule that narration length follows the task while never inventing the player's dialogue, psychology, or key choice.

Run:

```powershell
node --test tests/interaction-inserter-preset.test.cjs
```

Expected: source-file assertions pass; assertions that inspect bundled `互动插入器预设.json` may still fail until Task 4 regenerates it.

- [ ] **Step 9: Commit shared prompt rules**

```powershell
git add -- `
  'tavern_sync/互动插入器预设/条目/✅互动插入器核心规则.txt' `
  'tavern_sync/互动插入器预设/条目/📑使用说明.txt' `
  'tavern_sync/互动插入器预设/条目/💬对白质感.txt' `
  'tavern_sync/互动插入器预设/条目/😀情感基准.txt' `
  'tavern_sync/互动插入器预设/条目/🛑后置约束.txt' `
  'tavern_sync/互动插入器预设/条目/🧠生成前检查.txt' `
  'tavern_sync/互动插入器预设/条目/🧩模式协同规则.txt'
git commit -m "feat: scale interaction narrative to player intent"
```

### Task 3: Expand each mode and the context handoff

**Files:**
- Modify: `tavern_sync/互动插入器预设/默认提示词配置.json`

**Interfaces:**
- Consumes: selected mode macro and `{{ii_interaction_records}}`
- Produces: mode-specific narrative capabilities and a main-story handoff that treats interaction outcomes as occurred facts

- [ ] **Step 1: Expand scene mode**

Keep role selection and differentiated dialogue. Replace the no-location/no-time/no-main-event prohibition with an `<narrative_progression>` block that states:

```xml
    - 普通交谈保持自然简洁；玩家发起战斗、追逐、调查、谈判或要求展开当前节点时，可以连续描写角色行动、对手反应、环境变化和因果结果。
    - 可以推进时间、切换地点、改变局势并产生胜负、伤势、消耗、线索或关系变化，只要这些发展符合当前情境与世界逻辑。
    - 可以引入由既有伏笔、人物动机、环境条件或事件因果支持的阻碍、发现与转折。
    - 推进到需要玩家决定立场、目标或关键行动时停下，不替玩家作出选择。
```

- [ ] **Step 2: Expand private mode**

Keep single-character focus and close-range voice. Replace the fixed short-interaction limit with:

```xml
  <narrative_progression>
    - 普通私聊与简单动作保持贴近、自然；玩家要求展开时，可以连续发展双方关系、冲突、合作与当前事件。
    - 角色可以依据自身动机主动行动、提出并落实计划、引出后续事件，也可以让互动自然进入新的地点或时间。
    - 可以引入由已有关系、伏笔、人物动机和环境条件支持的误会、发现、阻碍或转折。
    - 不替玩家接受、拒绝、表态或作出关键决定；需要这些选择时停下等待玩家回应。
  </narrative_progression>
```

- [ ] **Step 3: Expand remote mode**

Keep medium selection and knowledge boundaries. Add:

```xml
  <narrative_progression>
    - 远程通信可以真实影响剧情：角色可以传递关键情报、调动权限内的资源、采取远端行动、制造或解决局部问题，并促成后续事件。
    - 通信带来的命令、承诺、警告、误解、延迟与信息缺口可以形成实际后果和合理转折。
    - 所有推进必须服从距离、媒介、延迟、角色知识、能力和权限，不能让远端角色无条件解决现场问题。
    - 不替玩家发送未输入的回复、决定是否接听、接受条件或作出关键选择。
  </narrative_progression>
```

- [ ] **Step 4: Rewrite the worldbook handoff**

Change `<source>` so records are `楼层之间已经发生的补充互动或叙事过程`, and make `<absorption_policy>` explicitly retain:

```xml
    - 后续主剧情应承认互动记录中已经发生且不与高优先级设定冲突的过程与结果，并从结果继续发展。
    - 战斗、追逐、调查和谈判的阶段或最终结果，以及地点、时间、伤势、消耗、线索、关系和局势变化，都属于可承接事实。
    - 提炼并自然吸收这些事实，不要逐字复述完整对话或过程。
```

Keep the psychology knowledge rule, uninvolved-character knowledge rule, conflict precedence, and anti-padding rule. Remove the blanket prohibitions against chapters, main-plot progression, time advancement, and scene changes.

- [ ] **Step 5: Parse the JSON source**

Run:

```powershell
node -e "const fs=require('node:fs'); JSON.parse(fs.readFileSync('tavern_sync/互动插入器预设/默认提示词配置.json','utf8')); console.log('prompt config valid')"
```

Expected: prints `prompt config valid` and exits 0.

- [ ] **Step 6: Run the focused test before bundling**

Run:

```powershell
node --test tests/interaction-inserter-preset.test.cjs
```

Expected: mode and source-contract assertions pass; bundled-preset assertions may still reflect the old generated JSON.

- [ ] **Step 7: Commit mode and handoff rules**

```powershell
git add -- 'tavern_sync/互动插入器预设/默认提示词配置.json'
git commit -m "feat: let interaction modes advance narrative"
```

### Task 4: Regenerate and verify the importable preset

**Files:**
- Generate: `tavern_sync/互动插入器预设/互动插入器预设.json`

**Interfaces:**
- Consumes: `互动插入器预设.yaml`, updated prompt entry files, and `默认提示词配置.json`
- Produces: importable SillyTavern preset JSON containing the narrative-bridge behavior

- [ ] **Step 1: Bundle the preset**

Run:

```powershell
node tavern_sync.mjs bundle 互动插入器预设
```

Expected: Tavern Sync reports successful preset generation and updates `tavern_sync/互动插入器预设/互动插入器预设.json`.

- [ ] **Step 2: Run all interaction-inserter tests**

Run:

```powershell
node --test tests/interaction-inserter-*.test.cjs
```

Expected: all interaction-inserter tests pass, including the previously stale core-prompt assertion after its replacement in Task 1.

- [ ] **Step 3: Check semantic anchors and removed restrictions in the generated preset**

Run:

```powershell
$generated = Get-Content -Raw -Encoding UTF8 'tavern_sync/互动插入器预设/互动插入器预设.json'
@('补充叙事','战斗','转折','关键选择','不替玩家') | ForEach-Object { if (-not $generated.Contains($_)) { throw "missing: $_" } }
@('不续写新的主剧情楼层','不切换到新地点、新时间或新主线事件','不要因为互动记录强行推进主线、跳时间、换场景') | ForEach-Object { if ($generated.Contains($_)) { throw "stale restriction: $_" } }
```

Expected: exits 0 without output.

- [ ] **Step 4: Inspect formatting and scope**

Run:

```powershell
git diff --check
git status --short
git diff --stat HEAD
```

Expected: no whitespace errors; only the plan, prompt test, eight prompt source files, and generated preset JSON are changed by this implementation sequence.

- [ ] **Step 5: Commit the generated preset**

```powershell
git add -- 'tavern_sync/互动插入器预设/互动插入器预设.json'
git commit -m "build: bundle narrative interaction preset"
```

- [ ] **Step 6: Perform final verification**

Run:

```powershell
node --test tests/interaction-inserter-*.test.cjs
git diff --check HEAD~3..HEAD
git status --short
```

Expected: all tests pass, the committed range has no whitespace errors, and the worktree is clean except for the implementation plan if it has not yet been committed.
