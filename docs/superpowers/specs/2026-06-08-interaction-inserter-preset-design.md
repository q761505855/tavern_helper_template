# Interaction Inserter Preset Upgrade Design

## Goal

Upgrade `tavern_sync/互动插入器预设` from a compact default preset into a maintainable, professional preset focused on lightweight character interaction.

The preset should support three interaction modes:

- 当下场景: local multi-character interaction, similar to a small group scene or shared interruption.
- 一对一: face-to-face private interaction, fast character response with light body language.
- 远程通信: world-appropriate remote communication such as message, letter, phone, talisman, radio, or magic transmission.

The default output should be clean, dialogue-led, and easy to merge back into the main chat.

## File Structure

Add a `条目/` folder under `tavern_sync/互动插入器预设` and move long reusable prompt text into item files.

Planned structure:

- `互动插入器预设.yaml`: preset settings, prompt order, switches, placeholders, macro insertion points.
- `默认提示词配置.json`: mode-specific prompt text and worldbook merge template used by the interaction inserter UI.
- `条目/📑使用说明.txt`: short user-facing preset notes.
- `条目/✅互动插入器核心规则.txt`: main purpose and scope.
- `条目/🧭人称与控制权.txt`: anti-takeover and pronoun discipline.
- `条目/🗣输出格式.txt`: clean role-name output format.
- `条目/💬对白质感.txt`: natural dialogue rules.
- `条目/🎭动作表情控制.txt`: light non-dialogue description rules.
- `条目/🧠角色心理开关.txt`: optional character inner-thought switch.
- `条目/🧩模式协同规则.txt`: generic rules that cooperate with JSON mode prompts.
- `条目/🛑后置约束.txt`: final output-only constraint.

## Prompt Layering

The YAML preset will keep the Tavern/SillyTavern placeholder order intact:

1. Core interaction rules.
2. Character and world placeholders.
3. Optional enhancer switches.
4. Chat history.
5. Mode prompt macro: `{{ii_scene_prompt}}{{ii_private_prompt}}{{ii_remote_prompt}}`.
6. Context prompt macro: `{{ii_context_prompt}}`.
7. Interaction history extension prompt.
8. User input extension prompt.
9. Final output constraint.

This keeps user input near the end and lets the mode prompt override the generic rules without replacing them.

## Output Format

Default output should use role-name blocks:

```text
角色A:
(脸色一红)“xxxxxx”
```

Rules:

- Prefer one to three short role blocks per reply.
- Dialogue is the main body.
- Parenthesized action, expression, tone, or short inner thought may appear before or after dialogue.
- Do not output headings, analysis, summaries, prompt explanations, markdown fences, or metadata.
- Do not force every line into identical rhythm.

## Control And Person Rules

The assistant must not write the player's speech, decisions, private thoughts, or sensory experience.

Allowed references to the player:

- Direct address inside character dialogue, such as “你”.
- Objective visible facts already supplied by the user or chat history, such as the player handing over an item.
- Immediate consequences caused by the character's response, without deciding the player's next action.

The preset should avoid switching between “我/你/他/她” as narration. Non-dialogue descriptions should be neutral parenthetical stage directions rather than full narrator prose.

## Mode Rules

`默认提示词配置.json` owns mode-specific behavior.

当下场景:

- Multiple present characters may know and respond.
- Good for interactions that need several characters to hear, interrupt, argue, tease, or react.
- Keep it local and recoverable; no large plot jump.

一对一:

- Face-to-face private chat.
- Strongest support for quick reactions to user dialogue and simple user actions.
- May include light expression, posture, gesture, and short character thought if the switch is enabled.

远程通信:

- Choose a communication form that fits the world and current context.
- Dialogue or message content stays primary.
- Physical expression/action is normally omitted unless it belongs to the sending act or the medium shows it.
- Character psychology can still appear when the psychology switch is enabled; this is treated as a user-side extra view, not an in-world communication ability.

## Character Psychology Switch

Add an optional disabled-by-default prompt item.

When enabled:

- Allow short inner thoughts from non-user characters in all modes.
- Inner thoughts are an extra readable layer for the user.
- They must not become long monologues.
- They must not reveal or decide the user's inner state.
- They must not be treated as spoken content unless explicitly written as speech.

When disabled:

- Avoid direct inner thoughts.
- Use dialogue, expression, gesture, and hesitation to imply emotion.

## Worldbook Merge Template

The JSON worldbook template should tell later main-chat generation to absorb interaction records as already-happened local facts, but not mechanically repeat them.

It should preserve:

- Spoken promises or refusals.
- Relationship tone changes.
- Shared knowledge.
- Items, injuries, clues, locations, and short-term emotional residue.

It should avoid:

- Treating interaction records as full main-story chapters.
- Replaying every line unless the user asks.
- Overwriting higher-priority main chat facts.

## Verification

After edits:

- Check every YAML `文件:` reference resolves to a file in `条目/`.
- Check YAML still contains required interaction extension prompts for `interaction_history` and `用户输入`.
- Check JSON is valid.
- Check mode macros remain exactly `{{ii_scene_prompt}}{{ii_private_prompt}}{{ii_remote_prompt}}` and `{{ii_context_prompt}}`.
