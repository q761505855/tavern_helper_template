// 互动插入器: 自动注入的全局酒馆正则.
//
// 插入到楼层的互动内容形如:
//   <interaction_records_context>
//     <source>...</source>
//     <absorption_policy>...</absorption_policy>
//     <forbidden>...</forbidden>
//     <records>
//       <真正要给用户看的互动内容>
//     </records>
//   </interaction_records_context>
//
// 这里的 source / absorption_policy / forbidden 都是写给 AI 看的吸收规则,
// 对用户而言是噪音. 该正则只作用于「显示」(destination.display), 不动提示词,
// 因此 AI 仍能收到完整的吸收规则, 而用户界面��会看到 <records> 内的互动正文.

// 固定的脚本名, 作为全局正则里的幂等键. 修改正则规则时请同步提升版本号,
// 这样插件下次加载会自动用新版本覆盖旧的那一条.
const REGEX_SCRIPT_NAME = '互动插入器-隐藏吸收规则';
const REGEX_VERSION = 1;
const REGEX_SCRIPT_NAME_WITH_VERSION = `${REGEX_SCRIPT_NAME} v${REGEX_VERSION}`;

// 匹配整个 <interaction_records_context> 包裹块, 捕获 <records> 内部正文.
// [\s\S] 跨行匹配; *? 非贪婪, 避免一次性吞掉多个互动块.
const FIND_REGEX = String.raw`<interaction_records_context>[\s\S]*?<records>\s*([\s\S]*?)\s*<\/records>[\s\S]*?<\/interaction_records_context>`;
// 仅保留 records 内部正文, 丢弃包裹结构.
const REPLACE_STRING = '$1';

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

function makeRegexId(): string {
  // 用固定字符串派生稳定 id, 避免每次加载生成新随机 id 造成重复.
  return `interaction-inserter-hide-policy-v${REGEX_VERSION}`;
}

function buildHidePolicyRegex(): TavernRegex {
  return {
    id: makeRegexId(),
    script_name: REGEX_SCRIPT_NAME_WITH_VERSION,
    enabled: true,
    find_regex: FIND_REGEX,
    replace_string: REPLACE_STRING,
    trim_strings: [],
    source: {
      user_input: false,
      // 互动内容是拼进 AI 楼层正文的, 作用范围选 ai_output.
      ai_output: true,
      slash_command: false,
      // 若用户把插入目标改成世界书, 内容会作为 world_info 注入, 一并覆盖.
      world_info: true,
    },
    destination: {
      // 只改显示, 不改提示词: AI 仍收到完整吸收规则.
      display: true,
      prompt: false,
    },
    // 编辑楼层时也重新套用, 否则编辑后会露出完整结构.
    run_on_edit: true,
    min_depth: null,
    max_depth: null,
  };
}

/**
 * 确保「隐藏吸收规则」的全局正则存在且为最新版本. 幂等: 重复调用不会产生重复项.
 * - 已存在同名(含版本)正则: 原地更新其规则, 保持用户调整过的启用状态.
 * - 存在同名但旧版本: 移除旧版本, 写入新版本.
 * - 不存在: 追加.
 */
export async function ensureInteractionRecordsDisplayRegex(): Promise<void> {
  try {
    await updateTavernRegexesWith(regexes => {
      const next = regexes.filter(
        regex => regex.script_name === REGEX_SCRIPT_NAME || regex.script_name.startsWith(`${REGEX_SCRIPT_NAME} v`),
      );
      const current = next.find(regex => regex.script_name === REGEX_SCRIPT_NAME_WITH_VERSION);

      if (current) {
        // 同版本已存在: 仅刷新规则本身, 保留用户可能手动改过的 enabled.
        const enabled = current.enabled;
        const updated = { ...buildHidePolicyRegex(), enabled };
        return regexes.map(regex => (regex.script_name === REGEX_SCRIPT_NAME_WITH_VERSION ? updated : regex));
      }

      // 移除任何旧版本(含无版本号的历史遗留), 再追加新版本.
      const withoutLegacy = regexes.filter(
        regex => regex.script_name !== REGEX_SCRIPT_NAME && !regex.script_name.startsWith(`${REGEX_SCRIPT_NAME} v`),
      );
      withoutLegacy.push(buildHidePolicyRegex());
      return withoutLegacy;
    }, { type: 'global' });
  } catch (error) {
    console.error('[互动插入器] 注入隐藏吸收规则的全局正则失败:', error);
  }
}

/**
 * 移除本插件注入的全局正则(含所有历史版本). 插件卸载时调用.
 * 幂等: 没有匹配项时是空操作.
 */
export async function removeInteractionRecordsDisplayRegex(): Promise<void> {
  try {
    await updateTavernRegexesWith(
      regexes =>
        regexes.filter(
          regex => regex.script_name !== REGEX_SCRIPT_NAME && !regex.script_name.startsWith(`${REGEX_SCRIPT_NAME} v`),
        ),
      { type: 'global' },
    );
  } catch (error) {
    console.error('[互动插入器] 移除隐藏吸收规则的全局正则失败:', error);
  }
}
