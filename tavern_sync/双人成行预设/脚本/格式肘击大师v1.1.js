// ============================================================
// 格式肘击大师（ST-TagFixer）
// 运行环境：SillyTavern JS-Slash-Runner（酒馆助手）扩展
// 当主 AI 模型输出的文本存在格式标签遗漏或顺序错乱时，
// 自动检测并修复（六层流水线）：
//   ⓪ 脚本补标签 — 标签缺失但内容存在时直接插入
//   ① 预检 — 全局扫描标签是否完整
//   ② 分组重排 — 标签完整但顺序错误时脚本直接调整
//   ③ 细粒度修复 — 换行 + 组内标签顺序纠正
//   ④ LLM 修复 — 存在标签缺失时调用辅助模型补全
//   ④.5 二次扫描 — LLM 补全后脚本再次整理格式
// ============================================================

// ===================== 模块①：设置管理器 =====================

const SettingsManager = (() => {
  const VAR_KEY_SHARED = 'st_tagfixer_shared';
  const VAR_KEY_PRESET = 'st_tagfixer_preset';
  const VAR_KEY_CHARS = 'st_tagfixer_chars';

  const SHARED_KEYS = ['customApiUrl', 'customApiKey', 'customModelName'];

  const PRESET_KEYS = [
    'selectedPresetEntries',
    'autoFixEnabled',
    'customSystemPrompt', 'customUserPrompt',
    'enableSystemPrompt', 'enableUserPrompt',
    'tagTemplateEnabled',
    'customPresetRuleEntries',
  ];

  const CHAR_KEYS = [
    'selectedWorldbookEntries',
    'selectedWorldbooks',
    'customRuleEntries',
    'ruleOrder',
    'tagTemplates',
  ];

  const DEFAULTS = {
    customApiUrl: '',
    customApiKey: '',
    customModelName: '',
    selectedWorldbookEntries: [],
    selectedPresetEntries: [],
    ruleOrder: [],
    autoFixEnabled: true,
    customSystemPrompt: '',
    customUserPrompt: '',
    enableSystemPrompt: true,
    enableUserPrompt: true,
    tagTemplateEnabled: false,
    tagTemplates: [],
    customRuleEntries: [],
    customPresetRuleEntries: [],
    selectedWorldbooks: [],
  };

  let currentSettings = {};
  let currentCharKey = '';

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getCharKey() {
    try {
      const chId = SillyTavern.characterId;
      const chars = SillyTavern.characters;
      if (chId != null && chars && chars[chId]) {
        return chars[chId].avatar || chars[chId].name || '';
      }
    } catch (_) {}
    try {
      const name = getCurrentCharacterName();
      if (name) return name;
    } catch (_) {}
    return '__default__';
  }

  function deepCloneDefaults() {
    const c = Object.assign({}, DEFAULTS);
    c.selectedWorldbookEntries = [];
    c.selectedPresetEntries = [];
    c.ruleOrder = [];
    c.tagTemplates = [];
    c.customRuleEntries = [];
    c.customPresetRuleEntries = [];
    c.selectedWorldbooks = [];
    return c;
  }

  function extractPresetTemplates(templates) {
    const result = [];
    for (const tpl of templates) {
      if (!tpl.groups || tpl.groups.length === 0) continue;
      result.push({
        id: tpl.id,
        name: tpl.name,
        enabled: tpl.enabled,
        matching: tpl.matching,
        groups: tpl.groups,
      });
    }
    return result;
  }

  function isLinkedGroup(g) {
    return g.linkedPromptIds && g.linkedPromptIds.length > 0;
  }

  function mergePresetTemplates(charTemplates, presetTemplates) {
    if (!presetTemplates || presetTemplates.length === 0) return charTemplates;
    const merged = [...charTemplates];
    for (const pt of presetTemplates) {
      const existing = merged.find(t => t.id === pt.id);
      if (existing) {
        const charGroupMap = {};
        for (const cg of (existing.groups || [])) charGroupMap[cg.id] = cg;
        const mergedGroups = [];
        const seen = new Set();
        // 按预设层的分组顺序为基准
        for (const pg of (pt.groups || [])) {
          seen.add(pg.id);
          if (isLinkedGroup(pg)) {
            mergedGroups.push(pg);
          } else {
            mergedGroups.push(charGroupMap[pg.id] || pg);
          }
        }
        // 角色卡层独有的分组（预设层没有的）追加到末尾
        for (const cg of (existing.groups || [])) {
          if (!seen.has(cg.id)) mergedGroups.push(cg);
        }
        existing.groups = mergedGroups;
        existing.name = pt.name;
        existing.matching = pt.matching;
      } else {
        merged.push({
          id: pt.id,
          name: pt.name,
          enabled: pt.enabled,
          matching: pt.matching,
          groups: (pt.groups || []).map(g => ({ ...g })),
        });
      }
    }
    return merged;
  }

  function loadSettings() {
    currentSettings = deepCloneDefaults();
    currentCharKey = getCharKey();

    // 1. 全局层
    try {
      const globalVars = getVariables({ type: 'global' });
      const shared = globalVars[VAR_KEY_SHARED];
      if (shared && typeof shared === 'object') {
        for (const k of SHARED_KEYS) {
          if (k in shared) currentSettings[k] = shared[k];
        }
      }
    } catch (e) {
      console.warn('[TagFixer] 读取全局变量失败:', e);
    }

    // 2. 预设层
    let presetTemplates = [];
    try {
      const presetVars = getVariables({ type: 'preset' });
      const presetData = presetVars[VAR_KEY_PRESET];
      if (presetData && typeof presetData === 'object') {
        for (const k of PRESET_KEYS) {
          if (k in presetData) currentSettings[k] = presetData[k];
        }
        if (presetData.presetTemplates) {
          presetTemplates = presetData.presetTemplates;
        } else if (presetData.presetGroups) {
          // 兼容旧版 v2 格式：presetGroups = { templateId: groups[] }
          for (const [tplId, groups] of Object.entries(presetData.presetGroups)) {
            presetTemplates.push({ id: tplId, name: '', enabled: true, matching: { tagMode: 'plain' }, groups });
          }
        }
      }
    } catch (e) {
      console.warn('[TagFixer] 读取预设配置失败:', e);
    }

    // 3. 角色卡层
    try {
      const presetVars = getVariables({ type: 'preset' });
      const charsMap = presetVars[VAR_KEY_CHARS];
      if (charsMap && typeof charsMap === 'object' && charsMap[currentCharKey]) {
        const charData = charsMap[currentCharKey];
        for (const k of CHAR_KEYS) {
          if (k in charData) currentSettings[k] = charData[k];
        }
      }
    } catch (e) {
      console.warn('[TagFixer] 读取角色配置失败:', e);
    }

    // 4. 合并预设模板（含联动分组）到角色卡模板
    currentSettings.tagTemplates = mergePresetTemplates(currentSettings.tagTemplates, presetTemplates);

    migrateLegacy();
    console.log('[TagFixer] 已加载配置，角色:', currentCharKey);
    return currentSettings;
  }

  function migrateLegacy() {
    let migrated = false;

    // 迁移旧的 localStorage
    const legacyKeys = ['st-tagfixer-settings', 'st-tagfixer-shared'];
    for (const key of legacyKeys) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          for (const k in parsed) {
            if (k in DEFAULTS && JSON.stringify(currentSettings[k]) === JSON.stringify(DEFAULTS[k])) {
              currentSettings[k] = parsed[k];
              migrated = true;
            }
          }
        } catch (_) {}
        localStorage.removeItem(key);
      }
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('st-tagfixer-preset-')) {
        localStorage.removeItem(key);
      }
    }

    // 迁移旧的 st_tagfixer（非按角色卡存储的预设级配置）
    try {
      const presetVars = getVariables({ type: 'preset' });
      const oldPresetData = presetVars['st_tagfixer'];
      if (oldPresetData && typeof oldPresetData === 'object') {
        if (!presetVars[VAR_KEY_PRESET]) {
          const ALL_OLD_KEYS = [...PRESET_KEYS, ...CHAR_KEYS];
          for (const k of ALL_OLD_KEYS) {
            if (k in oldPresetData && JSON.stringify(currentSettings[k]) === JSON.stringify(DEFAULTS[k])) {
              currentSettings[k] = oldPresetData[k];
              migrated = true;
            }
          }
          // API 字段迁移到全局层
          for (const k of SHARED_KEYS) {
            if (k in oldPresetData && oldPresetData[k] && JSON.stringify(currentSettings[k]) === JSON.stringify(DEFAULTS[k])) {
              currentSettings[k] = oldPresetData[k];
              migrated = true;
            }
          }
          if (migrated) {
            console.log('[TagFixer] 已从旧预设配置迁移到分层存储');
          }
        }
        // 清理旧 key，防止 API 密钥随预设导出泄漏
        insertOrAssignVariables({ st_tagfixer: null }, { type: 'preset' });
      }
    } catch (_) {}

    // v1→v2: 从旧的 VAR_KEY_CHARS 中提取 PRESET_KEYS 到预设层
    try {
      const presetVars = getVariables({ type: 'preset' });
      const presetData = presetVars[VAR_KEY_PRESET];
      if (!presetData || !presetData._version) {
        const charsMap = presetVars[VAR_KEY_CHARS];
        if (charsMap && typeof charsMap === 'object' && charsMap[currentCharKey]) {
          const charData = charsMap[currentCharKey];
          let v1Migrated = false;
          for (const k of PRESET_KEYS) {
            if (k in charData && JSON.stringify(currentSettings[k]) === JSON.stringify(DEFAULTS[k])) {
              currentSettings[k] = charData[k];
              v1Migrated = true;
            }
          }
          if (v1Migrated) {
            migrated = true;
            console.log('[TagFixer] v1→v2: 预设配置已从角色卡层提取到预设层');
          }
        }
      }
    } catch (_) {}

    // 清理预设层和角色卡层中可能残留的 API 字段（防止随预设导出泄漏）
    try {
      const presetVars = getVariables({ type: 'preset' });
      let cleaned = false;
      // 清理 st_tagfixer_preset 中的 API 字段
      const pd = presetVars[VAR_KEY_PRESET];
      if (pd && typeof pd === 'object') {
        for (const k of SHARED_KEYS) {
          if (k in pd) { delete pd[k]; cleaned = true; }
        }
        if (cleaned) insertOrAssignVariables({ [VAR_KEY_PRESET]: pd }, { type: 'preset' });
      }
      // 清理 st_tagfixer_chars 各角色卡数据中的 API 字段
      const cm = presetVars[VAR_KEY_CHARS];
      if (cm && typeof cm === 'object') {
        let charCleaned = false;
        for (const ck of Object.keys(cm)) {
          const cd = cm[ck];
          if (cd && typeof cd === 'object') {
            for (const k of SHARED_KEYS) {
              if (k in cd) { delete cd[k]; charCleaned = true; }
            }
          }
        }
        if (charCleaned) insertOrAssignVariables({ [VAR_KEY_CHARS]: cm }, { type: 'preset' });
      }
    } catch (_) {}

    if (migrated) {
      saveSettings();
    }
  }

  function saveSettings() {
    // 1. 全局层
    try {
      const shared = {};
      for (const k of SHARED_KEYS) shared[k] = currentSettings[k];
      insertOrAssignVariables({ [VAR_KEY_SHARED]: shared }, { type: 'global' });
    } catch (e) {
      console.error('[TagFixer] 保存全局配置失败:', e);
    }

    // 2. 预设层
    try {
      const presetData = { _version: 2 };
      for (const k of PRESET_KEYS) presetData[k] = currentSettings[k];
      presetData.presetTemplates = extractPresetTemplates(currentSettings.tagTemplates || []);
      insertOrAssignVariables({ [VAR_KEY_PRESET]: presetData }, { type: 'preset' });
    } catch (e) {
      console.error('[TagFixer] 保存预设配置失败:', e);
    }

    // 3. 角色卡层
    try {
      const presetVars = getVariables({ type: 'preset' });
      const charsMap = (presetVars[VAR_KEY_CHARS] && typeof presetVars[VAR_KEY_CHARS] === 'object')
        ? presetVars[VAR_KEY_CHARS]
        : {};
      const charData = {};
      for (const k of CHAR_KEYS) charData[k] = currentSettings[k];
      charsMap[currentCharKey] = charData;
      insertOrAssignVariables({ [VAR_KEY_CHARS]: charsMap }, { type: 'preset' });
    } catch (e) {
      console.error('[TagFixer] 保存角色配置失败:', e);
    }
  }

  function getSetting(key) {
    if (key in currentSettings) return currentSettings[key];
    if (key in DEFAULTS) return DEFAULTS[key];
    console.warn('[TagFixer] 未知的设置项:', key);
    return undefined;
  }

  function updateSetting(key, value) {
    if (!(key in DEFAULTS)) {
      console.warn('[TagFixer] 未知的设置项:', key);
      return;
    }
    currentSettings[key] = value;
    saveSettings();
  }

  function resetSettings() {
    currentSettings = deepCloneDefaults();
    for (const k of SHARED_KEYS) currentSettings[k] = DEFAULTS[k];
    saveSettings();
    return currentSettings;
  }

  function getCurrentCharKey() {
    return currentCharKey;
  }

  function exportPresetConfig() {
    const data = { _exportType: 'preset', _version: 2 };
    for (const k of PRESET_KEYS) data[k] = currentSettings[k];
    data.presetTemplates = extractPresetTemplates(currentSettings.tagTemplates || []);
    return data;
  }

  function importPresetConfig(data) {
    if (!data || data._exportType !== 'preset') throw new Error('无效的预设配置文件');
    for (const k of PRESET_KEYS) {
      if (k in data) currentSettings[k] = data[k];
    }
    if (data.presetTemplates) {
      currentSettings.tagTemplates = mergePresetTemplates(currentSettings.tagTemplates, data.presetTemplates);
    }
    saveSettings();
  }

  function exportCharConfig() {
    const data = { _exportType: 'char', _version: 2, _charKey: currentCharKey };
    for (const k of CHAR_KEYS) data[k] = currentSettings[k];
    return data;
  }

  function importCharConfig(data) {
    if (!data || data._exportType !== 'char') throw new Error('无效的角色卡配置文件');
    for (const k of CHAR_KEYS) {
      if (k in data) currentSettings[k] = data[k];
    }
    saveSettings();
  }

  loadSettings();

  return { loadSettings, saveSettings, getSetting, updateSetting, resetSettings, createId, getCurrentCharKey, DEFAULTS, exportPresetConfig, importPresetConfig, exportCharConfig, importCharConfig };
})();

window.ST_TagFixer_Settings = SettingsManager;

// ===================== 模块②-A：世界书读取器 =====================

const WorldInfoReader = (() => {
  let cachedEntries = [];

  function getAvailableWorldbooks() {
    const allNames = new Set();
    try {
      const globalNames = getGlobalWorldbookNames();
      globalNames.forEach(n => allNames.add(n));
    } catch (e) {
      console.warn('[TagFixer] 读取全局世界书名称失败:', e);
    }
    try {
      const charBooks = getCharWorldbookNames('current');
      if (charBooks.primary) allNames.add(charBooks.primary);
      if (charBooks.additional && charBooks.additional.length > 0) {
        charBooks.additional.forEach(n => allNames.add(n));
      }
    } catch (e) {
      console.warn('[TagFixer] 读取角色世界书名称失败:', e);
    }
    try {
      const chatBook = getChatWorldbookName('current');
      if (chatBook) allNames.add(chatBook);
    } catch (e) {
      console.warn('[TagFixer] 读取聊天世界书名称失败:', e);
    }
    return [...allNames];
  }

  async function getEntriesForBooks(bookNames) {
    const entries = [];
    for (const bookName of bookNames) {
      try {
        const bookEntries = await getWorldbook(bookName);
        for (const entry of bookEntries) {
          entries.push({
            uid: entry.uid,
            worldbook: bookName,
            name: entry.name || '(无标题)',
            content: entry.content || '',
            enabled: entry.enabled,
          });
        }
      } catch (e) {
        console.warn(`[TagFixer] 读取世界书 "${bookName}" 失败:`, e);
      }
    }
    cachedEntries = entries;
    return entries;
  }

  function findEntry(wbId) {
    return cachedEntries.find(e => `wb::${e.worldbook}::${e.uid}` === wbId);
  }

  async function getSelectedEntriesContent() {
    const selectedIds = SettingsManager.getSetting('selectedWorldbookEntries') || [];
    if (selectedIds.length === 0) return [];

    if (cachedEntries.length === 0) {
      const selectedBooks = SettingsManager.getSetting('selectedWorldbooks') || [];
      if (selectedBooks.length > 0) await getEntriesForBooks(selectedBooks);
    }

    const results = [];
    for (const id of selectedIds) {
      const entry = cachedEntries.find(e => `${e.worldbook}::${e.uid}` === id);
      if (entry) {
        results.push({ id: `wb::${id}`, name: entry.name, content: entry.content, source: '世界书', enabled: entry.enabled });
      }
    }
    return results;
  }

  return { getAvailableWorldbooks, getEntriesForBooks, getSelectedEntriesContent, findEntry };
})();

window.ST_TagFixer_WorldInfo = WorldInfoReader;

// ===================== 模块②-B：预设条目读取器 =====================

const PresetReader = (() => {
  let cachedPrompts = [];

  function getAllPrompts() {
    try {
      const preset = getPreset('in_use');
      const prompts = [];

      const allPrompts = (preset.prompts || []).concat(preset.prompts_unused || []);
      for (const p of allPrompts) {
        if (isPresetPlaceholderPrompt(p)) continue;

        const hasContent = typeof p.content === 'string' && p.content.trim() !== '';
        prompts.push({
          id: p.id,
          name: p.name || p.id,
          content: hasContent ? p.content : '',
          enabled: p.enabled,
          isSystem: isPresetSystemPrompt(p),
        });
      }

      cachedPrompts = prompts;
      return prompts;
    } catch (e) {
      console.warn('[TagFixer] 获取预设条目失败:', e);
      cachedPrompts = [];
      return [];
    }
  }

  function findPrompt(presetId) {
    return cachedPrompts.find(e => `preset::${e.id}` === presetId);
  }

  function getSelectedEntriesContent() {
    const selectedIds = SettingsManager.getSetting('selectedPresetEntries') || [];
    if (selectedIds.length === 0) return [];

    if (cachedPrompts.length === 0) getAllPrompts();

    const results = [];
    for (const id of selectedIds) {
      const entry = cachedPrompts.find(e => e.id === id);
      if (entry && entry.content) {
        results.push({ id: `preset::${id}`, name: entry.name, content: entry.content, source: '预设', enabled: entry.enabled });
      }
    }
    return results;
  }

  function refreshPrompts() {
    cachedPrompts = [];
    return getAllPrompts();
  }

  return { getAllPrompts, getSelectedEntriesContent, refreshPrompts, findPrompt };
})();

window.ST_TagFixer_PresetReader = PresetReader;

// ===================== 模块②-C：标签模板扫描器（检测 + 重排 + 补全引擎） =====================

const TagTemplateScanner = (() => {
  let _log = null;
  function setLog(fn) { _log = fn; }
  function log(msg) { if (_log) _log(msg); }

  function createTemplate(name) {
    return {
      id: SettingsManager.createId(),
      name: name || '新模板',
      enabled: true,
      groups: [],
      matching: {
        tagMode: 'plain',
      },
    };
  }

  function createGroup(name) {
    return {
      id: SettingsManager.createId(),
      name: name || '新分组',
      enabled: true,
      collapsed: false,
      linkedPromptIds: [],
      slots: [{ id: SettingsManager.createId(), type: 'content_passthrough' }],
    };
  }

  function createSlot(type, value) {
    const slot = { id: SettingsManager.createId(), type: type || 'content_passthrough' };
    if (type === 'tag') slot.value = value || '';
    return slot;
  }

  function findNextTag(text, fromIndex, tagValue, matching) {
    const startAt = Math.max(0, Number(fromIndex) || 0);
    if (!tagValue) return null;

    if (matching && matching.tagMode === 'regex') {
      try {
        const regex = new RegExp(tagValue, 'g');
        regex.lastIndex = startAt;
        const match = regex.exec(text);
        if (!match) return null;
        return { start: match.index, end: match.index + match[0].length, text: match[0] };
      } catch (e) {
        console.warn('[TagFixer] 标签模板正则无效:', tagValue, e);
        return null;
      }
    }

    const index = text.indexOf(tagValue, startAt);
    if (index === -1) return null;
    return { start: index, end: index + tagValue.length, text: tagValue };
  }

  function syncGroupsFromPreset(template) {
    if (!template || !template.groups) return;
    let prompts = null;
    for (const group of template.groups) {
      if (!group.linkedPromptIds || group.linkedPromptIds.length === 0) continue;
      if (!prompts) {
        try {
          const preset = getPreset('in_use');
          prompts = (preset.prompts || []).concat(preset.prompts_unused || []);
        } catch (_) {
          prompts = [];
        }
      }
      const allLinkedEnabled = group.linkedPromptIds.every(pid => {
        const p = prompts.find(pp => pp.id === pid);
        if (!p) return true;
        return p.enabled;
      });
      const prevEnabled = group.enabled;
      group.enabled = allLinkedEnabled;
      if (prevEnabled !== false && !allLinkedEnabled) {
        log(`⚠ 分组「${group.name}」被禁用 (关联预设条目未全部启用)`);
      }
    }
  }

  function findAllTag(text, tagValue, matching) {
    const results = [];
    if (!tagValue) return results;
    if (matching && matching.tagMode === 'regex') {
      try {
        const regex = new RegExp(tagValue, 'g');
        let m;
        while ((m = regex.exec(text)) !== null) {
          results.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
          if (regex.lastIndex === m.index) regex.lastIndex++;
        }
      } catch (_) {}
      return results;
    }
    let from = 0;
    while (true) {
      const idx = text.indexOf(tagValue, from);
      if (idx === -1) break;
      results.push({ start: idx, end: idx + tagValue.length, text: tagValue });
      from = idx + tagValue.length;
    }
    return results;
  }

  // 从 startSlotIdx 开始、cursor 位置往后，链式匹配后续标签，返回 { located, missing }
  function chainMatchFrom(text, tagSlots, startSlotIdx, cursor, matching) {
    const located = [];
    const missing = [];
    for (let i = startSlotIdx; i < tagSlots.length; i++) {
      const found = findNextTag(text, cursor, tagSlots[i].value, matching);
      if (found) {
        located.push({ slot: tagSlots[i], found });
        cursor = found.end;
      } else {
        missing.push(tagSlots[i].value);
      }
    }
    return { located, missing };
  }

  // 组感知定位：找所有出现位置，选匹配最完整的那条链
  function locateGroupTags(text, group, matching) {
    const tagSlots = (group.slots || []).filter(s => s.type === 'tag' && s.value);
    if (tagSlots.length === 0) return { complete: true, located: [], missing: [] };

    log(`[${group.name}] 定位 ${tagSlots.length} 个标签...`);

    // 对第一个标签找所有出现位置，每个位置作为起点尝试链式匹配
    const firstAllOccurrences = findAllTag(text, tagSlots[0].value, matching);
    if (firstAllOccurrences.length > 1) log(`  「${tagSlots[0].value}」出现 ${firstAllOccurrences.length} 次，尝试多起点匹配`);

    let bestChain = null; // { located, missing, locatedCount }

    for (const firstOcc of firstAllOccurrences) {
      const chain = chainMatchFrom(text, tagSlots, 1, firstOcc.end, matching);
      const located = [{ slot: tagSlots[0], found: firstOcc }, ...chain.located];
      const candidate = { located, missing: chain.missing, locatedCount: located.length };
      if (!bestChain || candidate.locatedCount > bestChain.locatedCount) {
        bestChain = candidate;
      }
      if (candidate.missing.length === 0) break;
    }

    // 如果第一个标签完全不存在，从后续标签的每个出现位置尝试
    if (firstAllOccurrences.length === 0) {
      log(`  [${group.name}] 首标签未找到，从后续标签做锚点`);
      for (let anchorIdx = 1; anchorIdx < tagSlots.length; anchorIdx++) {
        const anchorAll = findAllTag(text, tagSlots[anchorIdx].value, matching);
        for (const anchorOcc of anchorAll) {
          const chain = chainMatchFrom(text, tagSlots, anchorIdx + 1, anchorOcc.end, matching);
          const located = [{ slot: tagSlots[anchorIdx], found: anchorOcc }, ...chain.located];
          const missing = tagSlots.slice(0, anchorIdx).map(s => s.value).concat(chain.missing);
          const candidate = { located, missing, locatedCount: located.length };
          if (!bestChain || candidate.locatedCount > bestChain.locatedCount) {
            bestChain = candidate;
          }
        }
        if (bestChain && bestChain.locatedCount > 0) break;
      }
    }

    if (!bestChain) {
      log(`  [${group.name}] 所有标签均未找到`);
      return { complete: false, located: [], missing: tagSlots.map(s => s.value) };
    }

    const complete = bestChain.missing.length === 0;
    const locatedNames = bestChain.located.map(item => `「${item.slot.value}」@${item.found.start}`).join(', ');
    const missingNames = bestChain.missing.map(v => `「${v}」`).join(', ');
    if (complete) {
      log(`  [${group.name}] ✓ 完整 (${locatedNames})`);
    } else {
      log(`  [${group.name}] ✗ 缺失: ${missingNames}` + (locatedNames ? ` | 已定位: ${locatedNames}` : ''));
    }
    return { complete, located: bestChain.located, missing: bestChain.missing };
  }

  function detectMissing(text, template) {
    if (!template || !template.enabled) return { hasMissing: false, missingTags: [] };

    syncGroupsFromPreset(template);

    const enabledGroups = (template.groups || []).filter(g => g.enabled !== false);
    if (enabledGroups.length === 0) return { hasMissing: false, missingTags: [] };

    const missingTags = [];
    const groupsWithMatches = new Set();

    for (const group of enabledGroups) {
      const result = locateGroupTags(text, group, template.matching);
      if (result.located.length > 0) groupsWithMatches.add(group.id);
      for (const tagValue of result.missing) {
        missingTags.push({
          groupId: group.id,
          groupName: group.name,
          tagValue,
          hasGroupMatch: false,
        });
      }
    }

    for (const m of missingTags) {
      m.hasGroupMatch = groupsWithMatches.has(m.groupId);
    }

    return { hasMissing: missingTags.length > 0, missingTags };
  }

  // ---- 全局扫描 + 自动重排 ----

  function scanGlobal(text, template) {
    if (!template || !template.enabled) return null;
    syncGroupsFromPreset(template);
    const enabledGroups = (template.groups || []).filter(g => g.enabled !== false);
    if (enabledGroups.length === 0) return null;

    const groupStatuses = [];
    for (const group of enabledGroups) {
      const result = locateGroupTags(text, group, template.matching);
      const firstLocated = result.located.length > 0 ? result.located[0] : null;
      const lastLocated = result.located.length > 0 ? result.located[result.located.length - 1] : null;
      groupStatuses.push({
        groupId: group.id,
        groupName: group.name,
        complete: result.complete,
        tags: result.located.map(item => ({ slotId: item.slot.id, value: item.slot.value, found: item.found })),
        firstPos: firstLocated ? firstLocated.found.start : -1,
        lastEnd: lastLocated ? lastLocated.found.end : -1,
      });
    }
    return groupStatuses;
  }

  function detectAndReorder(text, template) {
    const groupStatuses = scanGlobal(text, template);
    if (!groupStatuses || groupStatuses.length === 0) {
      return { action: 'skip', text };
    }

    const hasIncomplete = groupStatuses.some(g => !g.complete);
    if (hasIncomplete) {
      return { action: 'llm', text, reason: '存在不完整分组' };
    }

    const positions = groupStatuses.map(g => g.firstPos);
    let ordered = true;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] < positions[i - 1]) { ordered = false; break; }
    }
    if (ordered) {
      return { action: 'skip', text };
    }

    // 需要重排：按 firstPos 确定每个分组在文本中的实际范围，然后按模板顺序重新拼接
    const segments = [];
    for (const gs of groupStatuses) {
      segments.push({ groupId: gs.groupId, groupName: gs.groupName, start: gs.firstPos, end: gs.lastEnd });
    }
    segments.sort((a, b) => a.start - b.start);

    // 切分文本：gap0 | group_a | gap1 | group_b | gap2 | ...
    const pieces = [];
    let cursor = 0;
    for (const seg of segments) {
      if (seg.start > cursor) {
        pieces.push({ type: 'gap', text: text.slice(cursor, seg.start) });
      }
      pieces.push({ type: 'group', groupId: seg.groupId, groupName: seg.groupName, text: text.slice(seg.start, seg.end) });
      cursor = seg.end;
    }
    if (cursor < text.length) {
      pieces.push({ type: 'gap', text: text.slice(cursor) });
    }

    const groupPieces = pieces.filter(p => p.type === 'group');
    const templateOrder = groupStatuses.map(g => g.groupId);
    groupPieces.sort((a, b) => templateOrder.indexOf(a.groupId) - templateOrder.indexOf(b.groupId));

    // 将 groups 从文本中摘出，按模板顺序放回原 group 占位位置，gap 保持不动
    const groupTexts = {};
    for (const gp of groupPieces) {
      groupTexts[gp.groupId] = gp.text;
    }

    let reorderedGroupIdx = 0;
    const resultParts = [];
    for (const piece of pieces) {
      if (piece.type === 'gap') {
        resultParts.push(piece.text);
      } else {
        resultParts.push(groupTexts[templateOrder[reorderedGroupIdx]]);
        reorderedGroupIdx++;
      }
    }

    const reorderedText = resultParts.join('');
    if (reorderedText === text) {
      return { action: 'skip', text };
    }

    return { action: 'reorder', text: reorderedText, movedCount: groupPieces.length };
  }

  // ---- 标签级细粒度修复：换行分隔 + 组内标签顺序 ----

  function repairTagDetails(text, template) {
    if (!template || !template.enabled) return { changed: false, text, fixes: [] };
    syncGroupsFromPreset(template);
    const enabledGroups = (template.groups || []).filter(g => g.enabled !== false);
    if (enabledGroups.length === 0) return { changed: false, text, fixes: [] };

    let currentText = text;
    const fixes = [];

    // 子任务1：换行分隔
    // 每次插入换行后重新定位所有组（因为偏移量变化），最多迭代 50 次防止死循环
    log(`换行检测: ${enabledGroups.length} 个启用分组`);
    for (let iteration = 0; iteration < 50; iteration++) {
      let insertedAny = false;
      for (const group of enabledGroups) {
        const result = locateGroupTags(currentText, group, template.matching);
        for (const item of result.located) {
          if (item.found.start === 0) continue;
          const prevChar = currentText[item.found.start - 1];
          const prevCode = prevChar.charCodeAt(0);
          if (prevChar !== '\n') {
            log(`  [${group.name}]「${item.slot.value}」前方='${prevChar}'(${prevCode}) → 需换行`);
            const prefix = currentText.slice(0, item.found.start).replace(/[ \t]+$/, '');
            currentText = prefix + '\n' + currentText.slice(item.found.start);
            fixes.push(`[${group.name}] 在「${item.slot.value}」前插入换行`);
            insertedAny = true;
            break;
          }
        }
        if (insertedAny) break;
      }
      if (!insertedAny) break;
    }
    if (fixes.length > 0) log(`换行修复: ${fixes.length} 处`);

    // 子任务2：组内标签顺序修正
    for (const group of enabledGroups) {
      const result = locateGroupTags(currentText, group, template.matching);
      if (!result.complete || result.located.length < 2) continue;

      const located = result.located;
      const sortedByPos = [...located].sort((a, b) => a.found.start - b.found.start);
      if (located.every((item, idx) => item === sortedByPos[idx])) continue;

      const posSlots = sortedByPos.map(item => ({ start: item.found.start, end: item.found.end }));
      const templateTexts = located.map(item => item.found.text);
      const replacements = [];
      for (let i = 0; i < posSlots.length; i++) {
        replacements.push({ start: posSlots[i].start, end: posSlots[i].end, newText: templateTexts[i] });
      }
      replacements.sort((a, b) => b.start - a.start);
      for (const r of replacements) {
        currentText = currentText.slice(0, r.start) + r.newText + currentText.slice(r.end);
      }
      fixes.push(`[${group.name}] 组内标签顺序已修正`);
    }

    return { changed: currentText !== text, text: currentText, fixes };
  }

  // ---- Layer 0: 脚本级标签补全 ----

  function getInsertText(slot, matching) {
    if (!matching || matching.tagMode !== 'regex') return slot.value;
    if (slot.defaultValue) return slot.defaultValue;
    if (/[.*+?()[\]{}|\\^$]/.test(slot.value)) return null;
    return slot.value;
  }

  function groupHasContent(text, group, locateResult, groupResults, groupIdx) {
    const slots = group.slots || [];
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].type !== 'content_passthrough') continue;
      let leftEnd = -1, rightStart = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (slots[j].type !== 'tag') continue;
        const loc = locateResult.located.find(l => l.slot.id === slots[j].id);
        if (loc) { leftEnd = loc.found.end; break; }
      }
      for (let j = i + 1; j < slots.length; j++) {
        if (slots[j].type !== 'tag') continue;
        const loc = locateResult.located.find(l => l.slot.id === slots[j].id);
        if (loc) { rightStart = loc.found.start; break; }
      }
      // 单侧缺失时，用相邻分组的已定位标签作为边界
      if (leftEnd < 0 && groupResults && groupIdx > 0) {
        const prevGr = groupResults[groupIdx - 1];
        if (prevGr.result.located.length > 0) {
          leftEnd = prevGr.result.located[prevGr.result.located.length - 1].found.end;
        }
      }
      if (rightStart < 0 && groupResults && groupIdx < groupResults.length - 1) {
        const nextGr = groupResults[groupIdx + 1];
        if (nextGr.result.located.length > 0) {
          rightStart = nextGr.result.located[0].found.start;
        }
      }
      if (leftEnd >= 0 && rightStart >= 0) {
        if (text.slice(leftEnd, rightStart).trim().length > 0) return true;
      }
    }
    return false;
  }

  function tryInsertMissingTags(text, template) {
    if (!template || !template.enabled) return { action: 'skip', text, insertedCount: 0, fixes: [] };
    syncGroupsFromPreset(template);
    const enabledGroups = (template.groups || []).filter(g => g.enabled !== false);
    if (enabledGroups.length === 0) return { action: 'skip', text, insertedCount: 0, fixes: [] };

    // 1. 定位所有分组
    const groupResults = [];
    for (const group of enabledGroups) {
      const result = locateGroupTags(text, group, template.matching);
      groupResults.push({ group, result });
    }

    // 2. 分类
    const completeGroups = groupResults.filter(gr => gr.result.complete);
    const partialGroups = groupResults.filter(gr => !gr.result.complete && gr.result.located.length > 0);
    const emptyGroups = groupResults.filter(gr => !gr.result.complete && gr.result.located.length === 0);

    if (partialGroups.length === 0 && emptyGroups.length === 0) {
      return { action: 'skip', text, insertedCount: 0, fixes: [] };
    }

    // 3. 安全检查：完整分组的内容区须存在
    for (const cg of completeGroups) {
      const hasCP = (cg.group.slots || []).some(s => s.type === 'content_passthrough');
      if (!hasCP) continue;
      if (!groupHasContent(text, cg.group, cg.result, groupResults, groupResults.indexOf(cg))) {
        log(`⓪ 安全阀: 完整分组「${cg.group.name}」内容区为空，交 LLM`);
        return { action: 'llm', text, insertedCount: 0, fixes: [] };
      }
    }

    // 4. 收集所有已定位标签用于侵入检测
    const allLocated = [];
    for (const gr of groupResults) {
      for (const loc of gr.result.located) {
        allLocated.push({ groupId: gr.group.id, start: loc.found.start, end: loc.found.end });
      }
    }

    // 5. 侵入检测
    for (const pg of [...partialGroups, ...emptyGroups]) {
      if (pg.result.located.length < 2) continue;
      const groupStart = Math.min(...pg.result.located.map(l => l.found.start));
      const groupEnd = Math.max(...pg.result.located.map(l => l.found.end));
      for (const al of allLocated) {
        if (al.groupId === pg.group.id) continue;
        if (al.start > groupStart && al.start < groupEnd) {
          log(`⓪ 侵入检测: 分组「${pg.group.name}」区间内出现其他分组标签，交 LLM`);
          return { action: 'llm', text, insertedCount: 0, fixes: [] };
        }
      }
    }

    const insertions = []; // { pos, insertBefore: bool, tagText, groupName }

    // 6. 处理 partialGroups
    for (const pg of partialGroups) {
      const slots = pg.group.slots || [];
      const tagSlots = slots.filter(s => s.type === 'tag' && s.value);
      const locatedIds = new Set(pg.result.located.map(l => l.slot.id));
      const cpIdx = slots.findIndex(s => s.type === 'content_passthrough');

      if (!groupHasContent(text, pg.group, pg.result, groupResults, groupResults.indexOf(pg))) {
        log(`⓪ 分组「${pg.group.name}」内容区为空，交 LLM`);
        return { action: 'llm', text, insertedCount: 0, fixes: [] };
      }

      const headSide = []; // slots before content_passthrough
      const tailSide = []; // slots after content_passthrough
      for (let si = 0; si < slots.length; si++) {
        const s = slots[si];
        if (s.type !== 'tag' || !s.value) continue;
        if (locatedIds.has(s.id)) continue;
        const insertText = getInsertText(s, template.matching);
        if (insertText === null) {
          log(`⓪ 分组「${pg.group.name}」正则标签「${s.value}」无 defaultValue 且含元字符，交 LLM`);
          return { action: 'llm', text, insertedCount: 0, fixes: [] };
        }
        if (cpIdx >= 0 && si < cpIdx) {
          headSide.push({ slot: s, slotIndex: si, text: insertText });
        } else {
          tailSide.push({ slot: s, slotIndex: si, text: insertText });
        }
      }

      // headSide: 找最近的已定位标签作为锚点（紧接在 content_passthrough 之前的已定位标签 OR 前一分组尾标签）
      if (headSide.length > 0) {
        let anchorEnd = -1;
        for (let si = cpIdx >= 0 ? cpIdx - 1 : slots.length - 1; si >= 0; si--) {
          if (slots[si].type !== 'tag') continue;
          const loc = pg.result.located.find(l => l.slot.id === slots[si].id);
          if (loc) { anchorEnd = loc.found.end; break; }
        }
        if (anchorEnd < 0) {
          const groupIdx = enabledGroups.indexOf(pg.group);
          if (groupIdx > 0) {
            const prevGr = groupResults[groupIdx - 1];
            if (prevGr.result.located.length > 0) {
              anchorEnd = prevGr.result.located[prevGr.result.located.length - 1].found.end;
            }
          }
          if (anchorEnd < 0) anchorEnd = 0;
        }
        const combined = headSide.map(h => h.text).join('\n');
        insertions.push({ pos: anchorEnd, insertBefore: false, tagText: combined, groupName: pg.group.name, side: 'head' });
      }

      // tailSide: 找最近的已定位标签作为锚点（紧接在 content_passthrough 之后的已定位标签 OR 后一分组首标签）
      if (tailSide.length > 0) {
        let anchorStart = -1;
        for (let si = cpIdx >= 0 ? cpIdx + 1 : 0; si < slots.length; si++) {
          if (slots[si].type !== 'tag') continue;
          const loc = pg.result.located.find(l => l.slot.id === slots[si].id);
          if (loc) { anchorStart = loc.found.start; break; }
        }
        if (anchorStart < 0) {
          const groupIdx = enabledGroups.indexOf(pg.group);
          if (groupIdx < enabledGroups.length - 1) {
            const nextGr = groupResults[groupIdx + 1];
            if (nextGr.result.located.length > 0) {
              anchorStart = nextGr.result.located[0].found.start;
            }
          }
          if (anchorStart < 0) anchorStart = text.length;
        }
        const combined = tailSide.map(t => t.text).join('\n');
        insertions.push({ pos: anchorStart, insertBefore: true, tagText: combined, groupName: pg.group.name, side: 'tail' });
      }
    }

    // 7. 处理 emptyGroups（场景D/E/F）
    for (const eg of emptyGroups) {
      const slots = eg.group.slots || [];
      const cpIdx = slots.findIndex(s => s.type === 'content_passthrough');
      if (cpIdx < 0) {
        log(`⓪ 分组「${eg.group.name}」无内容区（纯标签分组），交 LLM`);
        return { action: 'llm', text, insertedCount: 0, fixes: [] };
      }

      const groupIdx = enabledGroups.indexOf(eg.group);
      let prevEnd = -1, nextStart = -1;
      if (groupIdx > 0) {
        const prevGr = groupResults[groupIdx - 1];
        if (prevGr.result.located.length > 0) {
          prevEnd = prevGr.result.located[prevGr.result.located.length - 1].found.end;
        }
      }
      if (prevEnd < 0 && groupIdx === 0) prevEnd = 0;
      if (groupIdx < enabledGroups.length - 1) {
        const nextGr = groupResults[groupIdx + 1];
        if (nextGr.result.located.length > 0) {
          nextStart = nextGr.result.located[0].found.start;
        }
      }
      if (nextStart < 0 && groupIdx === enabledGroups.length - 1) nextStart = text.length;

      if (prevEnd < 0 && nextStart < 0) {
        log(`⓪ 分组「${eg.group.name}」无法确定上下边界，交 LLM`);
        return { action: 'llm', text, insertedCount: 0, fixes: [] };
      }

      const upperBound = prevEnd >= 0 ? prevEnd : 0;
      const lowerBound = nextStart >= 0 ? nextStart : text.length;
      if (text.slice(upperBound, lowerBound).trim().length === 0) {
        log(`⓪ 分组「${eg.group.name}」边界间无内容，交 LLM`);
        return { action: 'llm', text, insertedCount: 0, fixes: [] };
      }

      const headTags = [], tailTags = [];
      for (let si = 0; si < slots.length; si++) {
        const s = slots[si];
        if (s.type !== 'tag' || !s.value) continue;
        const insertText = getInsertText(s, template.matching);
        if (insertText === null) {
          log(`⓪ 分组「${eg.group.name}」正则标签「${s.value}」无 defaultValue 且含元字符，交 LLM`);
          return { action: 'llm', text, insertedCount: 0, fixes: [] };
        }
        if (si < cpIdx) headTags.push(insertText);
        else tailTags.push(insertText);
      }

      if (headTags.length > 0) {
        insertions.push({ pos: upperBound, insertBefore: false, tagText: headTags.join('\n'), groupName: eg.group.name, side: 'head' });
      }
      if (tailTags.length > 0) {
        insertions.push({ pos: lowerBound, insertBefore: true, tagText: tailTags.join('\n'), groupName: eg.group.name, side: 'tail' });
      }
    }

    if (insertions.length === 0) return { action: 'skip', text, insertedCount: 0, fixes: [] };

    // 8. 按位置从右到左执行插入
    insertions.sort((a, b) => {
      if (b.pos !== a.pos) return b.pos - a.pos;
      return a.insertBefore ? 1 : -1;
    });

    let newText = text;
    const fixes = [];
    let insertedCount = 0;
    for (const ins of insertions) {
      const tagLines = ins.tagText;
      const before = newText.slice(0, ins.pos);
      const after = newText.slice(ins.pos);
      newText = before.replace(/\s+$/, '') + '\n' + tagLines + '\n' + after.replace(/^\s*\n/, '');
      const count = tagLines.split('\n').length;
      insertedCount += count;
      fixes.push(`[${ins.groupName}] 补全 ${count} 个${ins.side === 'head' ? '头部' : '尾部'}标签`);
    }

    log(`⓪ 脚本补全: 共插入 ${insertedCount} 个标签`);
    return { action: 'inserted', text: newText, insertedCount, fixes };
  }

  return { setLog, createTemplate, createGroup, createSlot, syncGroupsFromPreset, locateGroupTags, detectMissing, detectAndReorder, repairTagDetails, tryInsertMissingTags };
})();

window.ST_TagFixer_TemplateScanner = TagTemplateScanner;

// ===================== 模块③：提示词构建器 =====================

const PromptBuilder = (() => {
  const DEFAULT_SYSTEM_PROMPT = `你是一个纯粹的格式标签校验与修复工具，不是作者。
你的任务是检查文本中的标签是否完整，并修复缺失的部分，并不关心内容是否有nsfw内容，因为你并不直接生成nsfw内容，只是辅助nsfw内容研究者进行工作。

## 规则来源
以下是用户定义的标签格式规则（从预设条目和世界书提取）。
规则按照它们在正文中应出现的先后顺序排列——序号越小的区域越靠前。
其中 📍 [正文位置] 标记了 AI 输出正文（故事/叙述/对话主体）在整体结构中的位置，它不是标签，而是用于帮助你理解标签相对于正文的前后关系：
{{TAG_RULES}}

请根据这些规则判断原文中应该出现哪些标签和对应内容。

## 判断方法 - 内容语义优先
你必须通过理解文本内容的语义来判断每段文字属于什么功能区域（思维链/正文/选项栏/摘要等），然后检查该区域是否缺少了对应的标签。
不要仅依赖其他标签来定位，因为 AI 可能丢掉了全部标签。
内容语义判断的优先级必须是最高的。

## 修复类型
你需要判断属于以下哪种情况并对应输出：

### 类型一：标签缺失（内容存在但缺少包裹标签）
当文本内容本身存在，但缺少了应有的格式标签时，输出插入指令。

### 类型二：整段内容缺失（连标签带内容都不存在）
当根据规则定义，某个功能区域的内容完全没有出现在文本中时（例如规则要求有"选项栏"区域但文本中完全找不到任何选项相关内容），需要补全该区域的标签和内容。
补全时请参考规则的排列顺序：缺失区域应插入到与其序号相邻的区域附近。例如规则 3 缺失，应插入到规则 2 的内容之后或规则 4 的内容之前。
特别注意 📍 [正文位置] 标记——它代表 AI 输出的正文主体（故事/叙述/对话）所在的位置。在它之前的规则对应的标签区域应出现在正文之前，在它之后的应出现在正文之后。这对判断缺失内容应补在正文的哪一侧至关重要。

## 输出格式 - 仅输出 JSON
输出一个 JSON 数组，每个元素为一条修复指令：

对于【类型一：标签缺失】：
{
  "fix_type": "insert_tag",
  "target_text": "一句足够长且不重复的完整句子，用于在原文中精确定位插入位置",
  "position": "before 或 after",
  "tag": "需要插入的标签内容"
}

对于【类型二：整段内容缺失】：
{
  "fix_type": "insert_block",
  "target_text": "用于定位插入位置的原文锚点句子",
  "position": "before 或 after",
  "content": "需要补全的完整内容（包含标签和内容文本）"
}

如果没有发现任何问题，输出空数组 []

## target_text 选取策略
- 优先选取功能区域的第一句话或最后一句话作为锚点
- 如果区域的内容只有一句话，就用那句话
- 选取的句子至少要有 10 个字符
- 绝对不要选取可能在全文中重复出现的短语
- target_text 必须是原文中实际存在的、完整的一句话

## 对于类型二（整段内容缺失）的补全规则
- 补全的内容必须符合原文的语境和风格
- 补全的内容必须包含规则中定义的标签
- content 字段中应包含完整的标签和内容文本
- 仅补全规则中明确定义的功能区域，不要凭空创造
- 根据规则的排列顺序决定插入位置

## 绝对禁止事项
- 绝对不要输出 JSON 以外的任何文字
- 绝对不要添加规则中没有定义的标签
- 绝对不要评论或解释你的判断过程`;

  const DEFAULT_USER_PROMPT = `请检查以下文本中是否存在格式标签缺失或整段内容缺失的问题，并按要求输出 JSON 修复指令：

{{ORIGINAL_TEXT}}`;

  function getSystemTemplate() {
    const custom = SettingsManager.getSetting('customSystemPrompt');
    return (custom && custom.trim()) ? custom : DEFAULT_SYSTEM_PROMPT;
  }

  function getUserTemplate() {
    const custom = SettingsManager.getSetting('customUserPrompt');
    return (custom && custom.trim()) ? custom : DEFAULT_USER_PROMPT;
  }

  async function getAllRuleEntriesAsync() {
    const presetEntries = PresetReader.getSelectedEntriesContent();
    const worldbookEntries = await WorldInfoReader.getSelectedEntriesContent();
    const customPresetEntries = (SettingsManager.getSetting('customPresetRuleEntries') || [])
      .filter(e => e.enabled !== false)
      .map(e => ({ id: `customp::${e.id}`, name: e.name, content: e.content, source: '自建(预设)', enabled: true }));
    const customCharEntries = (SettingsManager.getSetting('customRuleEntries') || [])
      .filter(e => e.enabled !== false)
      .map(e => ({ id: `custom::${e.id}`, name: e.name, content: e.content, source: '自建(角色卡)', enabled: true }));

    return presetEntries.concat(worldbookEntries).concat(customPresetEntries).concat(customCharEntries);
  }

  async function buildPrompt(originalText, scanResult) {
    const allEntries = await getAllRuleEntriesAsync();
    const activeEntries = allEntries.filter(e => e.enabled !== false);

    let tagRules = '';
    if (activeEntries.length === 0) {
      tagRules = '（未选择任何标签规则条目，请根据常见标签格式进行检查）';
    } else {
      const ruleOrder = SettingsManager.getSetting('ruleOrder') || [];
      const parts = [];
      let seq = 1;
      for (const orderId of ruleOrder) {
        if (orderId === '__MAIN_TEXT__') {
          parts.push(`### 位置 ${seq}：📍 [正文位置]（AI 输出的故事/叙述/对话主体内容在此处）`);
          seq++;
          continue;
        }
        const entry = activeEntries.find(e => e.id === orderId);
        if (entry) {
          parts.push(`### 规则 ${seq}（位置序号 ${seq}）：${entry.name}（来源：${entry.source}）\n${entry.content}`);
          seq++;
        }
      }
      for (const entry of activeEntries) {
        if (!ruleOrder.includes(entry.id)) {
          parts.push(`### 规则 ${seq}（位置序号 ${seq}）：${entry.name}（来源：${entry.source}）\n${entry.content}`);
          seq++;
        }
      }
      tagRules = parts.join('\n\n');
    }

    let scanHint = '';
    if (scanResult && scanResult.hasMissing && scanResult.missingTags.length > 0) {
      const lines = scanResult.missingTags.map(t =>
        `- 分组「${t.groupName}」中的 ${t.tagValue} 标签缺失` + (t.hasGroupMatch ? '（该分组其他标签存在）' : '（该分组所有标签均未找到）')
      );
      scanHint = `\n\n## 预检结果\n标签模板扫描发现以下标签缺失，请重点检查以上区域：\n${lines.join('\n')}`;
    }

    const messages = [];

    if (SettingsManager.getSetting('enableSystemPrompt')) {
      const systemPrompt = getSystemTemplate().replace('{{TAG_RULES}}', tagRules) + scanHint;
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (SettingsManager.getSetting('enableUserPrompt')) {
      const userPrompt = getUserTemplate().replace('{{ORIGINAL_TEXT}}', originalText);
      messages.push({ role: 'user', content: userPrompt });
    }

    if (messages.length === 0) {
      throw new Error('System Prompt 和 User Prompt 至少需要启用一个');
    }

    return messages;
  }

  return {
    buildPrompt,
    getDefaultSystemPrompt: () => DEFAULT_SYSTEM_PROMPT,
    getDefaultUserPrompt: () => DEFAULT_USER_PROMPT,
  };
})();

window.ST_TagFixer_PromptBuilder = PromptBuilder;

// ===================== 模块④：小模型调用器 =====================

const LLMCaller = (() => {
  async function callLLM(messages) {
    const apiUrl = SettingsManager.getSetting('customApiUrl');
    const apiKey = SettingsManager.getSetting('customApiKey');
    const modelName = SettingsManager.getSetting('customModelName');

    if (!apiUrl) throw new Error('未填写 API 地址，请在设置中填写');

    const orderedPrompts = messages.map(msg => ({ role: msg.role, content: msg.content }));
    const customApi = {
      apiurl: apiUrl,
      source: 'openai',
      temperature: 0,
      max_tokens: 65000,
    };
    if (apiKey) customApi.key = apiKey;
    if (modelName) customApi.model = modelName;

    try {
      const result = await generateRaw({
        should_silence: true,
        ordered_prompts: orderedPrompts,
        custom_api: customApi,
      });
      return parseResponse(result);
    } catch (e) {
      console.error('[TagFixer] LLM 调用失败:', e);
      let detail = '';
      if (e instanceof Error) {
        detail = e.message || e.name || String(e);
      } else if (typeof e === 'string') {
        detail = e;
      } else if (e && typeof e === 'object') {
        detail = e.message || e.error || e.statusText || e.status || '';
        if (!detail) {
          try { detail = JSON.stringify(e, Object.getOwnPropertyNames(e)); } catch (_) { detail = String(e); }
        }
      }
      throw new Error('LLM 调用失败: ' + (detail || '未知错误，请检查浏览器控制台(F12)'));
    }
  }

  async function fetchModels() {
    const apiUrl = SettingsManager.getSetting('customApiUrl');
    const apiKey = SettingsManager.getSetting('customApiKey');

    if (!apiUrl) throw new Error('请先填写 API 地址');

    return await getModelList({ apiurl: apiUrl, key: apiKey || undefined });
  }

  function normalizeJson(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && parsed.fix_type) return [parsed];
    return null;
  }

  function tryParseJson(text) {
    try {
      return normalizeJson(JSON.parse(text));
    } catch (_) {
      return null;
    }
  }

  function parseResponse(responseText) {
    if (!responseText || typeof responseText !== 'string') {
      console.warn('[TagFixer] 小模型返回空响应');
      return [];
    }

    const trimmed = responseText.trim();

    const direct = tryParseJson(trimmed);
    if (direct) return direct;

    const first = trimmed.indexOf('[');
    const last = trimmed.lastIndexOf(']');
    if (first !== -1 && last !== -1 && last > first) {
      const bracket = tryParseJson(trimmed.substring(first, last + 1));
      if (bracket) return bracket;
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const brace = tryParseJson(trimmed.substring(firstBrace, lastBrace + 1));
      if (brace) return brace;
    }

    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      const codeBlock = tryParseJson(match[1].trim());
      if (codeBlock) return codeBlock;
    }

    if (/^(没有|未发现|无|不存在|所有标签).{0,20}(问题|缺失|异常|完整|正常)/s.test(trimmed) ||
        /no\s*(issues?|problems?|fix)/i.test(trimmed)) {
      console.log('[TagFixer] 小模型以自然语言表示无需修复:', trimmed.substring(0, 80));
      return [];
    }

    const hasOpenBracket = trimmed.includes('[') || trimmed.includes('{');
    const endsClean = trimmed.endsWith(']') || trimmed.endsWith('}');
    if (hasOpenBracket && !endsClean) {
      console.error('[TagFixer] 小模型响应疑似被截断（JSON 未闭合）:', trimmed.substring(0, 500));
      throw new Error('小模型响应被截断（JSON 未闭合），可能是输出内容过长超出了 token 上限，建议减少需要补全的内容量');
    }

    const preview = trimmed.substring(0, 100).replace(/[\r\n]+/g, ' ');
    console.error('[TagFixer] 无法解析小模型的响应:', trimmed.substring(0, 500));
    throw new Error('小模型响应格式无法解析，原始回复: ' + preview);
  }

  return { callLLM, parseResponse, fetchModels };
})();

window.ST_TagFixer_LLMCaller = LLMCaller;

// ===================== 模块⑤：文本修复器 =====================

const TextFixer = (() => {
  function applyFixes(originalText, fixInstructions) {
    if (!fixInstructions || fixInstructions.length === 0) return originalText;

    const validInstructions = validateInstructions(fixInstructions);
    if (validInstructions.length === 0) return originalText;

    const instructionsWithIndex = [];
    for (const instruction of validInstructions) {
      const index = originalText.indexOf(instruction.target_text);

      if (index === -1) {
        console.warn('[TagFixer] 无法定位目标文本，跳过此修复指令:', instruction.target_text.substring(0, 30) + '...');
        continue;
      }

      const secondIndex = originalText.indexOf(instruction.target_text, index + 1);
      if (secondIndex !== -1) {
        console.warn('[TagFixer] 目标文本不唯一，已在第一处匹配位置执行修复:', instruction.target_text.substring(0, 30) + '...');
      }

      const insertIndex = instruction.position === 'before'
        ? index
        : index + instruction.target_text.length;

      const fixType = instruction.fix_type || 'insert_tag';
      const insertContent = fixType === 'insert_block'
        ? (instruction.content || '')
        : (instruction.tag || '');

      if (!insertContent) {
        console.warn('[TagFixer] 修复指令缺少插入内容，跳过');
        continue;
      }

      instructionsWithIndex.push({
        insertIndex,
        insertContent,
        position: instruction.position,
        target_text: instruction.target_text,
        fix_type: fixType,
      });
    }

    if (instructionsWithIndex.length === 0) return originalText;

    instructionsWithIndex.sort((a, b) => b.insertIndex - a.insertIndex);

    let result = originalText;

    for (const item of instructionsWithIndex) {
      if (item.fix_type === 'insert_tag') {
        const checkStart = Math.max(0, item.insertIndex - item.insertContent.length - 2);
        const checkEnd = Math.min(result.length, item.insertIndex + item.insertContent.length + 2);
        const nearby = result.substring(checkStart, checkEnd);

        if (nearby.includes(item.insertContent)) {
          console.info('[TagFixer] 标签已存在，跳过重复插入:', item.insertContent);
          continue;
        }
      }

      if (item.position === 'before') {
        result = result.substring(0, item.insertIndex) + item.insertContent + '\n' + result.substring(item.insertIndex);
      } else {
        result = result.substring(0, item.insertIndex) + '\n' + item.insertContent + result.substring(item.insertIndex);
      }
    }

    return result;
  }

  function validateInstructions(fixInstructions) {
    if (!Array.isArray(fixInstructions)) {
      console.warn('[TagFixer] 修复指令不是数组，已忽略');
      return [];
    }

    return fixInstructions.filter((item, index) => {
      if (!item || typeof item !== 'object') {
        console.warn(`[TagFixer] 第 ${index} 条指令格式无效，已跳过`);
        return false;
      }
      if (typeof item.target_text !== 'string' || item.target_text.trim() === '') {
        console.warn(`[TagFixer] 第 ${index} 条指令缺少有效的 target_text，已跳过`);
        return false;
      }
      if (item.position !== 'before' && item.position !== 'after') {
        console.warn(`[TagFixer] 第 ${index} 条指令的 position 无效: "${item.position}"，已跳过`);
        return false;
      }

      const fixType = item.fix_type || 'insert_tag';
      if (fixType === 'insert_tag') {
        if (typeof item.tag !== 'string' || item.tag.trim() === '') {
          console.warn(`[TagFixer] 第 ${index} 条指令缺少有效的 tag，已跳过`);
          return false;
        }
      } else if (fixType === 'insert_block') {
        if (typeof item.content !== 'string' || item.content.trim() === '') {
          console.warn(`[TagFixer] 第 ${index} 条指令缺少有效的 content，已跳过`);
          return false;
        }
      } else {
        console.warn(`[TagFixer] 第 ${index} 条指令的 fix_type 无效: "${fixType}"，已跳过`);
        return false;
      }

      return true;
    });
  }

  return { applyFixes };
})();

window.ST_TagFixer_TextFixer = TextFixer;

// ===================== 模块⑥：主控制器 + UI =====================

const MainController = (() => {
  const MAX_LOG_COUNT = 30;
  let logs = [];

  function addLog(content) {
    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');
    logs.push({ time, content });
    if (logs.length > MAX_LOG_COUNT) logs = logs.slice(-MAX_LOG_COUNT);
    renderLogs();
  }

  function escapeLogHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderLogs() {
    const $el = $('#tagfixer-log-container');
    if ($el.length === 0) return;
    $el.html(logs.map(l => `<div class="tagfixer-log-entry">[${l.time}] ${escapeLogHtml(l.content)}</div>`).join(''));
    $el.scrollTop($el[0].scrollHeight);
  }

  // ========== 核心修复流程 ==========

  function logMissingDetails(missingTags) {
    const byGroup = {};
    for (const t of missingTags) {
      const key = t.groupName || t.groupId;
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(t.tagValue);
    }
    for (const [group, tags] of Object.entries(byGroup)) {
      addLog(`  ⚠ [${group}] 缺失: ${tags.join(', ')}`);
    }
  }

  async function autoFix() {
    if (!SettingsManager.getSetting('autoFixEnabled')) return;

    const latestMessages = getChatMessages(-1, { role: 'assistant' });
    if (latestMessages.length === 0) return;

    const msg = latestMessages[0];
    addLog('检测到新消息，开始扫描...');

    if (SettingsManager.getSetting('tagTemplateEnabled')) {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const enabledTemplates = templates.filter(t => t.enabled);
      if (enabledTemplates.length > 0) {
        let currentText = msg.message;

        // Layer 0: 脚本级标签补全
        for (const tpl of enabledTemplates) {
          const ir = TagTemplateScanner.tryInsertMissingTags(currentText, tpl);
          if (ir.action === 'inserted') {
            currentText = ir.text;
            for (const f of ir.fixes) addLog(`⓪ ${f}`);
          }
        }

        // Layer 1: 全局扫描 — 检测分组完整性与顺序
        let needLLM = false;
        let needReorder = false;
        let reorderTotal = 0;

        for (const tpl of enabledTemplates) {
          const result = TagTemplateScanner.detectAndReorder(currentText, tpl);
          if (result.action === 'llm') {
            needLLM = true;
            addLog(`① 预检: 模板「${tpl.name}」存在不完整分组`);
            break;
          }
          if (result.action === 'reorder') {
            needReorder = true;
            currentText = result.text;
            reorderTotal += result.movedCount;
          }
        }

        // Layer 2a: 分组级重排
        if (!needLLM && needReorder) {
          addLog(`② 重排: 已自动重排 ${reorderTotal} 个分组的位置`);
        }

        // Layer 2b: 标签级细粒度修复
        let detailFixes = [];
        for (const tpl of enabledTemplates) {
          const dr = TagTemplateScanner.repairTagDetails(currentText, tpl);
          if (dr.changed) currentText = dr.text;
          detailFixes = detailFixes.concat(dr.fixes);
        }
        if (detailFixes.length > 0) {
          for (const f of detailFixes) addLog(`③ ${f}`);
        }

        const scriptChanged = currentText !== msg.message;
        if (scriptChanged) {
          await setChatMessages([{ message_id: msg.message_id, message: currentText }]);
        }

        // 缺失检测
        let totalMissing = [];
        for (const tpl of enabledTemplates) {
          const result = TagTemplateScanner.detectMissing(currentText, tpl);
          if (result.hasMissing) totalMissing = totalMissing.concat(result.missingTags);
        }
        if (totalMissing.length === 0) {
          if (scriptChanged) {
            addLog('✅ 脚本修复完成，标签完整');
          } else {
            addLog('✅ 标签模板预检通过，所有标签完整、顺序正确、换行正常');
          }
          return;
        }
        addLog(`④ 检测到 ${totalMissing.length} 处缺失，调用辅助模型...`);
        logMissingDetails(totalMissing);
        await runFix(msg.message_id, currentText, { hasMissing: true, missingTags: totalMissing });
        return;
      }
    }

    await runFix(msg.message_id, msg.message, null);
  }

  async function manualFix(messageId) {
    const msgs = getChatMessages(messageId);
    if (msgs.length === 0) {
      addLog('❌ 找不到指定的消息');
      return;
    }
    addLog('手动修复被触发');

    let currentText = msgs[0].message;

    if (SettingsManager.getSetting('tagTemplateEnabled')) {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const enabledTemplates = templates.filter(t => t.enabled);
      if (enabledTemplates.length > 0) {
        // Layer 0: 脚本级标签补全
        for (const tpl of enabledTemplates) {
          const ir = TagTemplateScanner.tryInsertMissingTags(currentText, tpl);
          if (ir.action === 'inserted') {
            currentText = ir.text;
            for (const f of ir.fixes) addLog(`⓪ ${f}`);
          }
        }

        // Layer 1: 全局扫描 — 分组级重排
        for (const tpl of enabledTemplates) {
          const result = TagTemplateScanner.detectAndReorder(currentText, tpl);
          if (result.action === 'llm') {
            addLog(`① 预检: 模板「${tpl.name}」存在不完整分组`);
            break;
          }
          if (result.action === 'reorder') currentText = result.text;
        }

        // Layer 2b: 标签级细粒度修复
        let detailFixes = [];
        for (const tpl of enabledTemplates) {
          const dr = TagTemplateScanner.repairTagDetails(currentText, tpl);
          if (dr.changed) currentText = dr.text;
          detailFixes = detailFixes.concat(dr.fixes);
        }
        if (detailFixes.length > 0) {
          for (const f of detailFixes) addLog(`③ ${f}`);
        }

        if (currentText !== msgs[0].message) {
          await setChatMessages([{ message_id: msgs[0].message_id, message: currentText }]);
        }

        // 缺失检测
        let totalMissing = [];
        for (const tpl of enabledTemplates) {
          const result = TagTemplateScanner.detectMissing(currentText, tpl);
          if (result.hasMissing) totalMissing = totalMissing.concat(result.missingTags);
        }
        if (totalMissing.length > 0) {
          addLog(`④ 检测到 ${totalMissing.length} 处缺失，调用辅助模型...`);
          logMissingDetails(totalMissing);
          await runFix(msgs[0].message_id, currentText, { hasMissing: true, missingTags: totalMissing });
          return;
        }
        if (currentText !== msgs[0].message) {
          addLog('✅ 脚本修复完成，标签完整');
          return;
        }
        addLog('✅ 标签模板预检通过，所有标签完整、顺序正确、换行正常');
        return;
      }
    }

    await runFix(msgs[0].message_id, currentText, null);
  }

  async function runFix(messageId, originalText, scanResult) {
    try {
      const messages = await PromptBuilder.buildPrompt(originalText, scanResult);
      addLog('已构建提示词，发送修复请求至小模型...');

      const fixInstructions = await LLMCaller.callLLM(messages);

      if (!fixInstructions || fixInstructions.length === 0) {
        addLog('✅ 未发现缺失标签，无需修复');
        return;
      }

      const tagCount = fixInstructions.filter(i => (i.fix_type || 'insert_tag') === 'insert_tag').length;
      const blockCount = fixInstructions.filter(i => i.fix_type === 'insert_block').length;
      let logMsg = `发现 ${fixInstructions.length} 处问题`;
      if (tagCount > 0) logMsg += `（${tagCount} 处标签缺失）`;
      if (blockCount > 0) logMsg += `（${blockCount} 处内容缺失）`;
      addLog(logMsg + '，正在修复...');

      let fixedText = TextFixer.applyFixes(originalText, fixInstructions);

      if (fixedText === originalText) {
        addLog('✅ 修复完成（文本无变化）');
        return;
      }

      // Layer 4.5: LLM 补全后二次脚本扫描（重排 + 换行 + 组内顺序）
      if (SettingsManager.getSetting('tagTemplateEnabled')) {
        const templates = SettingsManager.getSetting('tagTemplates') || [];
        const enabledTemplates = templates.filter(t => t.enabled);
        let postFixes = [];
        for (const tpl of enabledTemplates) {
          const reorderResult = TagTemplateScanner.detectAndReorder(fixedText, tpl);
          if (reorderResult.action === 'reorder') {
            fixedText = reorderResult.text;
            postFixes.push('LLM补全后重排分组');
          }
          const dr = TagTemplateScanner.repairTagDetails(fixedText, tpl);
          if (dr.changed) {
            fixedText = dr.text;
            postFixes = postFixes.concat(dr.fixes);
          }
        }
        for (const f of postFixes) addLog(`④.5 ${f}`);
      }

      await setChatMessages([{ message_id: messageId, message: fixedText }]);

      addLog('✅ 修复完成，已更新消息');
    } catch (e) {
      console.error('[TagFixer] 修复流程出错:', e);
      const errMsg = e instanceof Error ? e.message : (typeof e === 'string' ? e : JSON.stringify(e));
      addLog('❌ 修复出错: ' + (errMsg || '未知错误'));
    }
  }

  // ========== 事件监听 ==========

  function setupEventListeners() {
    eventOn(tavern_events.MESSAGE_RECEIVED, async (message_id, type) => {
      if (type === 'first_message') return;
      await new Promise(r => setTimeout(r, 500));
      await autoFix();
    });

    eventOn(tavern_events.CHAT_CHANGED, () => {
      const oldKey = SettingsManager.getCurrentCharKey();
      SettingsManager.loadSettings();
      const newKey = SettingsManager.getCurrentCharKey();
      if (oldKey !== newKey) {
        addLog('角色卡已切换: ' + newKey);
        refreshAllUI();
      }
    });

    addLog('事件监听已启动');
  }

  function updateCharIndicator() {
    const key = SettingsManager.getCurrentCharKey();
    const display = key === '__default__' ? '未选择角色卡' : key.replace(/\.\w+$/, '');
    $('#tagfixer-char-indicator').text('📎 ' + display).attr('title', '当前配置绑定: ' + key);
  }

  function refreshAllUI() {
    updateCharIndicator();
    const s = SettingsManager;
    $('#tagfixer-auto-fix').prop('checked', s.getSetting('autoFixEnabled'));
    $('#tagfixer-api-url').val(s.getSetting('customApiUrl'));
    $('#tagfixer-api-key').val(s.getSetting('customApiKey'));
    $('#tagfixer-model-name').val(s.getSetting('customModelName'));
    $('#tagfixer-enable-sys').prop('checked', s.getSetting('enableSystemPrompt'));
    $('#tagfixer-enable-usr').prop('checked', s.getSetting('enableUserPrompt'));
    $('#tagfixer-template-enabled').prop('checked', s.getSetting('tagTemplateEnabled'));

    const customSys = s.getSetting('customSystemPrompt');
    $('#tagfixer-sys-prompt').val(customSys || PromptBuilder.getDefaultSystemPrompt());
    const customUsr = s.getSetting('customUserPrompt');
    $('#tagfixer-usr-prompt').val(customUsr || PromptBuilder.getDefaultUserPrompt());

    loadPresetEntries();
    loadWorldbookList();
    renderRuleOrder();
    renderTemplateEditor();
  }

  // ========== 设置面板 UI ==========

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function createSettingsPanel() {
    const s = SettingsManager;

    const panelHtml = `
    <div id="tagfixer-panel" style="display:none; position:fixed; z-index:10001; background:#1a1a2e; border:1px solid #444; padding:20px; overflow-y:auto; color:#e0e0e0; font-size:14px; box-shadow:0 8px 32px rgba(0,0,0,0.6);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="margin:0; font-size:17px; color:#fff;">🥊 格式肘击大师 设置</h3>
        <span id="tagfixer-char-indicator" style="font-size:13px; color:#888; margin-left:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;" title="当前配置绑定的角色卡"></span>
        <span id="tagfixer-close-btn" style="cursor:pointer; font-size:21px; color:#888; padding:4px;">✕</span>
      </div>

      <!-- 自动修复开关 -->
      <div style="margin-bottom:16px; display:flex; align-items:center; justify-content:space-between;">
        <label>自动修复（AI 回复后自动检测并修复）</label>
        <label class="tagfixer-switch">
          <input type="checkbox" id="tagfixer-auto-fix" ${s.getSetting('autoFixEnabled') ? 'checked' : ''}>
          <span class="tagfixer-slider"></span>
        </label>
      </div>

      <!-- API 配置 -->
      <fieldset style="border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px;">
        <legend style="color:#aaa; font-size:13px; padding:0 6px;">API 配置</legend>
        <div style="margin-bottom:8px;">
          <label style="display:block; margin-bottom:4px;">API 地址</label>
          <input type="text" id="tagfixer-api-url" value="${escapeHtml(s.getSetting('customApiUrl'))}" placeholder="https://api.example.com/v1" style="width:100%; padding:6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px; box-sizing:border-box;">
          <div style="color:#666; font-size:13px; margin-top:2px;">填写 OpenAI 兼容的 API 基础地址（如 https://api.openai.com/v1）</div>
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:block; margin-bottom:4px;">API Key</label>
          <input type="password" id="tagfixer-api-key" value="${escapeHtml(s.getSetting('customApiKey'))}" placeholder="sk-..." style="width:100%; padding:6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px; box-sizing:border-box;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="display:block; margin-bottom:4px;">模型名称</label>
          <div style="display:flex; gap:6px;">
            <select id="tagfixer-model-select" style="flex:1; padding:6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px;">
              <option value="">-- 手动输入或拉取列表 --</option>
            </select>
            <button id="tagfixer-fetch-models" style="padding:6px 12px; background:#2a4a6e; border:1px solid #567; color:#e0e0e0; border-radius:4px; cursor:pointer; white-space:nowrap;">拉取模型</button>
          </div>
          <input type="text" id="tagfixer-model-name" value="${escapeHtml(s.getSetting('customModelName'))}" placeholder="gpt-4o-mini" style="width:100%; padding:6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px; box-sizing:border-box; margin-top:6px;">
          <div style="color:#666; font-size:13px; margin-top:2px;">从列表选择或直接输入模型名称</div>
        </div>
      </fieldset>

      <!-- 标签规则来源：预设条目 -->
      <fieldset style="border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px;">
        <legend style="color:#aaa; font-size:13px; padding:0 6px;">标签规则来源 - 预设条目</legend>
        <div style="margin-bottom:8px;">
          从当前预设中选择包含标签规则的条目：
          <button id="tagfixer-refresh-presets" style="margin-left:8px; padding:2px 10px; background:#2a4a6e; border:1px solid #567; color:#e0e0e0; border-radius:4px; cursor:pointer;">🔄 刷新</button>
        </div>
        <div id="tagfixer-preset-list" style="max-height:200px; overflow-y:auto; background:#0d0d1a; border-radius:4px; padding:8px;">
          <div style="color:#666;">加载中...</div>
        </div>
      </fieldset>

      <!-- 标签规则来源：世界书条目 -->
      <fieldset style="border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px;">
        <legend style="color:#aaa; font-size:13px; padding:0 6px;">标签规则来源 - 世界书条目</legend>
        <div style="margin-bottom:8px;">
          ① 先勾选要读取的世界书：
          <button id="tagfixer-refresh-worldbooks" style="margin-left:8px; padding:2px 10px; background:#2a4a6e; border:1px solid #567; color:#e0e0e0; border-radius:4px; cursor:pointer;">🔄 刷新列表</button>
        </div>
        <div id="tagfixer-worldbook-list" style="max-height:120px; overflow-y:auto; background:#0d0d1a; border-radius:4px; padding:8px; margin-bottom:8px;">
          <div style="color:#666;">点击刷新加载世界书列表</div>
        </div>
        <div style="margin-bottom:8px;">
          ② 再拉取选中世界书的条目：
          <button id="tagfixer-fetch-wb-entries" style="margin-left:8px; padding:2px 10px; background:#2a4a6e; border:1px solid #567; color:#e0e0e0; border-radius:4px; cursor:pointer;">📥 拉取条目</button>
        </div>
        <div id="tagfixer-entries-list" style="max-height:200px; overflow-y:auto; background:#0d0d1a; border-radius:4px; padding:8px;">
          <div style="color:#666;">请先选择世界书并拉取条目</div>
        </div>
      </fieldset>

      <!-- 已选规则排序 -->
      <fieldset style="border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px;">
        <legend style="color:#aaa; font-size:13px; padding:0 6px;">已选规则排序</legend>
        <div style="margin-bottom:8px; color:#999; font-size:13px; line-height:1.5;">
          拖拽或使用箭头调整顺序。顺序 = 区域在正文中的先后位置，辅助模型会参考此顺序决定缺失内容应补在哪里。<br>
          <span style="color:#4caf50;">📍 [正文位置]</span> 标记了 AI 输出正文在整体结构中的位置，可上下移动或删除。删除后可通过下方按钮重新插入。<br>
          <span style="color:#e8a735;">⚠ 注意：</span>规则条目的启用状态与预设/世界书同步——在预设中关闭的条目，本插件也会自动跳过（以灰色显示）。<br>
          <span style="color:#64b5f6;">💡 技巧：</span>可以直接点击下方按钮创建精简的格式说明。<b>自建(预设)</b>跟随预设存储，所有角色卡共享；<b>自建(角色卡)</b>跟随角色卡存储，仅当前角色卡可见。自建条目有独立的启用开关。
        </div>
        <div id="tagfixer-rule-order" style="background:#0d0d1a; border-radius:4px; padding:8px; min-height:30px;">
          <div style="color:#666;">请先在上方勾选条目</div>
        </div>
        <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
          <button id="tagfixer-add-custom-preset-rule" style="padding:6px 14px; background:#2a4a6e; border:1px solid #567; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">+ 自建(预设)</button>
          <button id="tagfixer-add-custom-rule" style="padding:6px 14px; background:#2a4a2e; border:1px solid #4a6a4e; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">+ 自建(角色卡)</button>
          <button id="tagfixer-insert-body-marker" style="padding:6px 14px; background:#2a3a2a; border:1px solid #4a6a4e; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px; display:none;">+ 插入正文位置标记</button>
        </div>
        <div id="tagfixer-custom-rule-editor-area"></div>
      </fieldset>

      <!-- 配置导出/导入 -->
      <fieldset style="border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px;">
        <legend style="color:#aaa; font-size:13px; padding:0 6px;">配置导出/导入</legend>
        <div style="margin-bottom:8px; color:#999; font-size:13px; line-height:1.5;">
          导出/导入规则和标签模板配置。<b>不含 API 密钥</b>，可安全分享。
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
          <span style="color:#aaa; font-size:13px; line-height:28px; min-width:60px;">预设配置：</span>
          <button id="tagfixer-export-preset" style="padding:4px 12px; background:#2a4a6e; border:1px solid #567; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">导出</button>
          <button id="tagfixer-import-preset" style="padding:4px 12px; background:#4a3a2e; border:1px solid #765; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">导入</button>
          <span style="color:#666; font-size:12px; line-height:28px;">预设条目选择 + 自建(预设) + 标签模板 + 提示词</span>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <span style="color:#aaa; font-size:13px; line-height:28px; min-width:60px;">角色卡配置：</span>
          <button id="tagfixer-export-char" style="padding:4px 12px; background:#2a4a6e; border:1px solid #567; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">导出</button>
          <button id="tagfixer-import-char" style="padding:4px 12px; background:#4a3a2e; border:1px solid #765; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">导入</button>
          <span style="color:#666; font-size:12px; line-height:28px;">世界书选择 + 自建(角色卡) + 规则排序 + 标签模板</span>
        </div>
      </fieldset>

      <!-- 标签模板（预检 + 重排） -->
      <fieldset style="border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px;">
        <legend style="color:#aaa; font-size:13px; padding:0 6px;">标签模板（预检 + 重排）</legend>
        <div style="margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
          <label style="font-size:13px;">启用标签模板</label>
          <label class="tagfixer-switch">
            <input type="checkbox" id="tagfixer-template-enabled" ${s.getSetting('tagTemplateEnabled') ? 'checked' : ''}>
            <span class="tagfixer-slider"></span>
          </label>
        </div>
        <div style="margin-bottom:8px; color:#999; font-size:13px; line-height:1.5;">
          定义期望的标签分组结构。AI 回复后自动执行六层检测：<br>
          ⓪ <b style="color:#ccc;">补全</b> — 标签缺失但内容存在时脚本直接补标签<br>
          ① <b style="color:#ccc;">预检</b> — 全局扫描标签是否完整，全部存在则跳过 LLM<br>
          ② <b style="color:#ccc;">分组重排</b> — 标签完整但分组顺序不对时脚本直接调整<br>
          ③ <b style="color:#ccc;">细粒度修复</b> — 同组内标签顺序纠正 + 标签间自动插入换行<br>
          ④ <b style="color:#ccc;">LLM 修复</b> — 存在标签缺失时调用辅助模型补全<br>
          ④.5 <b style="color:#ccc;">二次扫描</b> — LLM 补完后脚本再次整理格式<br>
          分组可与预设条目联动：关联的预设条目全部启用时分组才生效。手动修复同样会先执行脚本修复。
        </div>
        <div id="tagfixer-template-editor" style="background:#0d0d1a; border-radius:4px; padding:8px; min-height:40px;">
        </div>
        <div style="margin-top:8px; display:flex; gap:6px;">
          <button id="tagfixer-add-template" style="padding:5px 12px; background:#2a4a6e; border:1px solid #567; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">+ 新建模板</button>
        </div>
      </fieldset>

      <!-- 提示词自定义 -->
      <fieldset style="border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px;">
        <legend style="color:#aaa; font-size:13px; padding:0 6px;">提示词设置</legend>
        <div style="margin-bottom:10px; color:#999; font-size:13px; line-height:1.5;">
          可自定义发送给辅助模型的提示词。留空则使用默认提示词。<br>
          <b>可用占位符：</b><br>
          • <code style="background:#2a2a3e; padding:1px 4px; border-radius:2px;">{{TAG_RULES}}</code> — 替换为上方勾选并排序的预设条目 + 世界书条目内容<br>
          • <code style="background:#2a2a3e; padding:1px 4px; border-radius:2px;">{{ORIGINAL_TEXT}}</code> — 替换为待检查的 AI 输出文本<br>
          <b>提示：</b>自定义时请确保 System Prompt 包含 <code style="background:#2a2a3e; padding:1px 4px; border-radius:2px;">{{TAG_RULES}}</code>，User Prompt 包含 <code style="background:#2a2a3e; padding:1px 4px; border-radius:2px;">{{ORIGINAL_TEXT}}</code>。
        </div>

        <!-- System Prompt -->
        <div style="margin-bottom:12px; border:1px solid #333; border-radius:6px; padding:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <label class="tagfixer-switch" style="flex-shrink:0;">
                <input type="checkbox" id="tagfixer-enable-sys" ${s.getSetting('enableSystemPrompt') ? 'checked' : ''}>
                <span class="tagfixer-slider"></span>
              </label>
              <label style="font-weight:bold;">System Prompt</label>
            </div>
            <button id="tagfixer-reset-sys-prompt" style="padding:2px 8px; background:#4a2a2a; border:1px solid #755; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">恢复默认</button>
          </div>
          <textarea id="tagfixer-sys-prompt" rows="6" style="width:100%; padding:6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px; box-sizing:border-box; font-size:13px; line-height:1.4; resize:vertical;">${escapeHtml(s.getSetting('customSystemPrompt') || PromptBuilder.getDefaultSystemPrompt())}</textarea>
        </div>

        <!-- User Prompt -->
        <div style="border:1px solid #333; border-radius:6px; padding:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <label class="tagfixer-switch" style="flex-shrink:0;">
                <input type="checkbox" id="tagfixer-enable-usr" ${s.getSetting('enableUserPrompt') ? 'checked' : ''}>
                <span class="tagfixer-slider"></span>
              </label>
              <label style="font-weight:bold;">User Prompt</label>
            </div>
            <button id="tagfixer-reset-usr-prompt" style="padding:2px 8px; background:#4a2a2a; border:1px solid #755; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">恢复默认</button>
          </div>
          <textarea id="tagfixer-usr-prompt" rows="3" style="width:100%; padding:6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px; box-sizing:border-box; font-size:13px; line-height:1.4; resize:vertical;">${escapeHtml(s.getSetting('customUserPrompt') || PromptBuilder.getDefaultUserPrompt())}</textarea>
        </div>
      </fieldset>

      <!-- 运行日志 -->
      <fieldset style="border:1px solid #444; border-radius:8px; padding:12px;">
        <legend style="color:#aaa; font-size:13px; padding:0 6px;">运行日志</legend>
        <div id="tagfixer-log-container" style="max-height:150px; overflow-y:auto; background:#0d0d1a; border-radius:4px; padding:8px; font-family:monospace; font-size:13px;">
          <div style="color:#666;">暂无日志</div>
        </div>
      </fieldset>

      <style>
        .tagfixer-switch { position:relative; display:inline-block; width:44px; height:24px; }
        .tagfixer-switch input { opacity:0; width:0; height:0; }
        .tagfixer-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:#444; border-radius:24px; transition:.3s; }
        .tagfixer-slider:before { content:""; position:absolute; height:18px; width:18px; left:3px; bottom:3px; background:#fff; border-radius:50%; transition:.3s; }
        .tagfixer-switch input:checked + .tagfixer-slider { background:#4caf50; }
        .tagfixer-switch input:checked + .tagfixer-slider:before { transform:translateX(20px); }
        .tagfixer-log-entry { padding:2px 0; border-bottom:1px solid #1a1a2e; color:#b0b0b0; word-break:break-all; }
        #tagfixer-entries-list label, #tagfixer-preset-list label { display:block; padding:3px 0; cursor:pointer; }
        #tagfixer-entries-list label:hover, #tagfixer-preset-list label:hover { background:#1a1a3e; }
        #tagfixer-panel fieldset legend { user-select:none; }
        #tagfixer-panel textarea { font-family: 'Consolas', 'Monaco', monospace; }
        #tagfixer-panel code { font-family: 'Consolas', 'Monaco', monospace; }
        .tagfixer-order-item { display:flex; align-items:center; gap:6px; padding:4px 6px; margin:2px 0; background:#1a1a3e; border:1px solid #333; border-radius:4px; cursor:grab; user-select:none; }
        .tagfixer-order-item:active { cursor:grabbing; }
        .tagfixer-order-item .tagfixer-order-num { color:#888; font-size:13px; min-width:20px; text-align:center; }
        .tagfixer-order-item .tagfixer-order-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tagfixer-order-item .tagfixer-order-source { color:#666; font-size:13px; flex-shrink:0; }
        .tagfixer-order-item .tagfixer-order-btns { display:flex; gap:2px; flex-shrink:0; }
        .tagfixer-order-item .tagfixer-order-btns span { cursor:pointer; padding:0 4px; color:#888; font-size:15px; line-height:1; }
        .tagfixer-order-item .tagfixer-order-btns span:hover { color:#fff; }
        .tagfixer-order-item.tagfixer-drag-over { border-top:2px solid #4caf50; }
        .tagfixer-order-item.tagfixer-main-text-marker { background:#2a3a2a; border:1px dashed #4caf50; cursor:default; }
        .tagfixer-order-item.tagfixer-main-text-marker .tagfixer-order-name { color:#4caf50; font-weight:bold; }
        .tagfixer-order-item.tagfixer-main-text-marker .tagfixer-order-source { color:#4caf50; }
        .tagfixer-order-item.tagfixer-disabled { opacity:0.5; }
        .tagfixer-order-item .tagfixer-enabled-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }

        .tagfixer-tpl-card { border:1px solid #444; border-radius:6px; padding:10px; margin-bottom:8px; background:#12122a; }
        .tagfixer-tpl-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
        .tagfixer-tpl-group { border:1px solid #333; border-radius:4px; padding:8px; margin:6px 0; background:#1a1a30; }
        .tagfixer-tpl-group-header { display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap; }
        .tagfixer-tpl-slot { display:flex; align-items:center; gap:6px; padding:3px 4px; margin:2px 0; background:#22223a; border-radius:3px; }
        .tagfixer-tpl-slot input { flex:1; padding:3px 6px; background:#2a2a3e !important; border:1px solid #555 !important; color:#e0e0e0 !important; border-radius:3px; font-size:13px; box-sizing:border-box; }
        .tagfixer-tpl-slot .slot-type-label { font-size:12px; color:#888; min-width:40px; flex-shrink:0; }
        .tagfixer-tpl-slot .slot-del { cursor:pointer; color:#888; font-size:15px; padding:0 2px; }
        .tagfixer-tpl-slot .slot-del:hover { color:#f44; }

        .tagfixer-custom-edit-inline { background:#1a1a2e; border:1px solid #555; border-radius:6px; padding:12px; margin-top:8px; }
        .tagfixer-custom-edit-inline input,
        .tagfixer-custom-edit-inline textarea { width:100%; padding:6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px; box-sizing:border-box; font-size:13px; }
        .tagfixer-custom-edit-inline textarea { resize:vertical; line-height:1.4; }

        .tagfixer-custom-edit-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:10002; display:flex; align-items:center; justify-content:center; }
        .tagfixer-custom-edit-panel { background:#1a1a2e; border:1px solid #555; border-radius:8px; padding:20px; width:450px; max-width:90vw; max-height:80vh; overflow-y:auto; }

        .tagfixer-linked-prompts { display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; }
        .tagfixer-linked-prompt-tag { font-size:12px; padding:1px 6px; background:#2a4a6e; border-radius:8px; color:#ccc; display:flex; align-items:center; gap:3px; }
        .tagfixer-linked-prompt-tag .tag-remove { cursor:pointer; color:#aaa; font-size:13px; }
        .tagfixer-linked-prompt-tag .tag-remove:hover { color:#f44; }

        #tagfixer-panel.tagfixer-mobile {
          font-size: 13px;
        }
        #tagfixer-panel.tagfixer-mobile h3 { font-size: 15px; }
        #tagfixer-panel.tagfixer-mobile fieldset { padding: 8px; margin-bottom: 10px; }
        #tagfixer-panel.tagfixer-mobile fieldset legend { font-size: 13px; }
        #tagfixer-panel.tagfixer-mobile textarea { font-size: 13px; }
        #tagfixer-panel.tagfixer-mobile input[type="text"],
        #tagfixer-panel.tagfixer-mobile input[type="password"],
        #tagfixer-panel.tagfixer-mobile select { font-size: 13px; padding: 5px; }
        #tagfixer-panel.tagfixer-mobile button { padding: 5px 8px; font-size: 13px; }
        #tagfixer-panel.tagfixer-mobile label { font-size: 13px; }
        #tagfixer-panel.tagfixer-mobile code { font-size: 12px; }
        #tagfixer-panel.tagfixer-mobile .tagfixer-order-item { padding: 4px 6px; gap: 4px; }
        #tagfixer-panel.tagfixer-mobile .tagfixer-order-item .tagfixer-order-btns span { padding: 2px 6px; font-size: 17px; }
        #tagfixer-panel.tagfixer-mobile #tagfixer-entries-list,
        #tagfixer-panel.tagfixer-mobile #tagfixer-preset-list { max-height: 120px; }
        #tagfixer-panel.tagfixer-mobile #tagfixer-log-container { max-height: 80px; }
        #tagfixer-panel.tagfixer-mobile .tagfixer-log-entry { font-size: 12px; }
      </style>
    </div>
    <div id="tagfixer-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000;"></div>`;

    const $root = $('<div id="tagfixer-ui-root"></div>');
    $root.html(panelHtml);
    $('body').append($root);

    bindPanelEvents();
    loadPresetEntries();
    loadWorldbookList();
    renderRuleOrder();
    renderTemplateEditor();
    updateCharIndicator();
  }

  function bindPanelEvents() {
    $('#tagfixer-close-btn').on('click', () => togglePanel(false));
    $('#tagfixer-overlay').on('click', () => togglePanel(false));

    $('#tagfixer-auto-fix').on('change', function () {
      SettingsManager.updateSetting('autoFixEnabled', this.checked);
      addLog('自动修复已' + (this.checked ? '开启' : '关闭'));
    });

    $('#tagfixer-api-url').on('blur', function () {
      SettingsManager.updateSetting('customApiUrl', this.value.trim());
    });
    $('#tagfixer-api-key').on('blur', function () {
      SettingsManager.updateSetting('customApiKey', this.value.trim());
    });
    $('#tagfixer-model-name').on('blur', function () {
      SettingsManager.updateSetting('customModelName', this.value.trim());
    });

    $('#tagfixer-model-select').on('change', function () {
      const val = $(this).val();
      if (val) {
        $('#tagfixer-model-name').val(val);
        SettingsManager.updateSetting('customModelName', val);
      }
    });

    $('#tagfixer-fetch-models').on('click', async function () {
      const $btn = $(this);
      const $select = $('#tagfixer-model-select');
      $btn.prop('disabled', true).text('拉取中...');
      try {
        const models = await LLMCaller.fetchModels();
        let html = '<option value="">-- 请选择模型 --</option>';
        const currentModel = SettingsManager.getSetting('customModelName');
        for (const m of models) {
          const sel = m === currentModel ? ' selected' : '';
          html += `<option value="${escapeHtml(m)}"${sel}>${escapeHtml(m)}</option>`;
        }
        $select.html(html);
        addLog(`✅ 已拉取 ${models.length} 个模型`);
      } catch (e) {
        addLog('❌ 拉取模型失败: ' + (e.message || '未知错误'));
        $select.html('<option value="">拉取失败</option>');
      } finally {
        $btn.prop('disabled', false).text('拉取模型');
      }
    });

    $('#tagfixer-refresh-presets').on('click', () => { loadPresetEntries(); renderRuleOrder(); });
    $('#tagfixer-refresh-worldbooks').on('click', () => { loadWorldbookList(); });
    $('#tagfixer-fetch-wb-entries').on('click', async () => { await fetchWorldbookEntries(); renderRuleOrder(); });

    $('#tagfixer-enable-sys').on('change', function () {
      SettingsManager.updateSetting('enableSystemPrompt', this.checked);
      addLog('System Prompt 已' + (this.checked ? '启用' : '禁用'));
    });
    $('#tagfixer-enable-usr').on('change', function () {
      SettingsManager.updateSetting('enableUserPrompt', this.checked);
      addLog('User Prompt 已' + (this.checked ? '启用' : '禁用'));
    });

    $('#tagfixer-sys-prompt').on('blur', function () {
      const val = this.value.trim();
      const isDefault = val === PromptBuilder.getDefaultSystemPrompt().trim();
      SettingsManager.updateSetting('customSystemPrompt', isDefault ? '' : val);
    });
    $('#tagfixer-usr-prompt').on('blur', function () {
      const val = this.value.trim();
      const isDefault = val === PromptBuilder.getDefaultUserPrompt().trim();
      SettingsManager.updateSetting('customUserPrompt', isDefault ? '' : val);
    });

    $('#tagfixer-reset-sys-prompt').on('click', () => {
      $('#tagfixer-sys-prompt').val(PromptBuilder.getDefaultSystemPrompt());
      SettingsManager.updateSetting('customSystemPrompt', '');
      addLog('System Prompt 已恢复默认');
    });
    $('#tagfixer-reset-usr-prompt').on('click', () => {
      $('#tagfixer-usr-prompt').val(PromptBuilder.getDefaultUserPrompt());
      SettingsManager.updateSetting('customUserPrompt', '');
      addLog('User Prompt 已恢复默认');
    });

    $('#tagfixer-template-enabled').on('change', function () {
      SettingsManager.updateSetting('tagTemplateEnabled', this.checked);
      addLog('标签模板预检已' + (this.checked ? '开启' : '关闭'));
    });

    $('#tagfixer-add-template').on('click', () => {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      templates.push(TagTemplateScanner.createTemplate('模板 ' + (templates.length + 1)));
      SettingsManager.updateSetting('tagTemplates', templates);
      renderTemplateEditor();
    });

    $('#tagfixer-add-custom-preset-rule').on('click', () => {
      showCustomRuleEditor(null, 'preset');
    });
    $('#tagfixer-add-custom-rule').on('click', () => {
      showCustomRuleEditor(null, 'char');
    });

    $('#tagfixer-insert-body-marker').on('click', () => {
      const order = SettingsManager.getSetting('ruleOrder') || [];
      if (!order.includes(MAIN_TEXT_MARKER_ID)) {
        order.push(MAIN_TEXT_MARKER_ID);
        SettingsManager.updateSetting('ruleOrder', order);
        renderRuleOrder();
        addLog('已插入正文位置标记');
      }
    });

    // 配置导出/导入
    $('#tagfixer-export-preset').on('click', () => {
      try {
        const data = SettingsManager.exportPresetConfig();
        downloadJson(data, 'tagfixer-preset-config.json');
        addLog('已导出预设配置');
      } catch (e) {
        addLog('❌ 导出失败: ' + e.message);
      }
    });

    $('#tagfixer-import-preset').on('click', () => {
      uploadJson((data) => {
        try {
          SettingsManager.importPresetConfig(data);
          refreshAllUI();
          addLog('已导入预设配置');
        } catch (e) {
          addLog('❌ 导入失败: ' + e.message);
        }
      });
    });

    $('#tagfixer-export-char').on('click', () => {
      try {
        const data = SettingsManager.exportCharConfig();
        downloadJson(data, 'tagfixer-char-config.json');
        addLog('已导出角色卡配置');
      } catch (e) {
        addLog('❌ 导出失败: ' + e.message);
      }
    });

    $('#tagfixer-import-char').on('click', () => {
      uploadJson((data) => {
        try {
          SettingsManager.importCharConfig(data);
          refreshAllUI();
          addLog('已导入角色卡配置');
        } catch (e) {
          addLog('❌ 导入失败: ' + e.message);
        }
      });
    });
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function uploadJson(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        callback(data);
      } catch (err) {
        addLog('❌ 文件读取失败: ' + (err.message || '无效的 JSON 文件'));
      }
    };
    input.click();
  }

  // ========== 自建规则条目内联编辑 ==========

  function showCustomRuleEditor(existingEntry, storageType) {
    const $area = $('#tagfixer-custom-rule-editor-area');
    const isEdit = !!existingEntry;
    const isPreset = storageType === 'preset';
    const settingKey = isPreset ? 'customPresetRuleEntries' : 'customRuleEntries';
    const rulePrefix = isPreset ? 'customp::' : 'custom::';
    const typeLabel = isPreset ? '预设' : '角色卡';
    const name = isEdit ? existingEntry.name : '';
    const content = isEdit ? existingEntry.content : '';

    $area.html(`<div class="tagfixer-custom-edit-inline">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-size:13px; color:#ccc; font-weight:bold;">${isEdit ? '编辑' : '新建'}自建条目（${typeLabel}）</span>
      </div>
      <div style="margin-bottom:8px;">
        <label style="display:block; margin-bottom:3px; font-size:13px; color:#999;">条目名称</label>
        <input type="text" class="cre-name" value="${escapeHtml(name)}" placeholder="如：思维链格式">
      </div>
      <div style="margin-bottom:10px;">
        <label style="display:block; margin-bottom:3px; font-size:13px; color:#999;">条目内容（标签格式说明）</label>
        <textarea class="cre-content" rows="6" placeholder="写标签名称和简要说明...">${escapeHtml(content)}</textarea>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="cre-cancel" style="padding:5px 14px; background:#444; border:1px solid #666; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">取消</button>
        <button class="cre-save" style="padding:5px 14px; background:#2a6a4e; border:1px solid #4a8a6e; color:#e0e0e0; border-radius:4px; cursor:pointer; font-size:13px;">保存</button>
      </div>
    </div>`);

    $area.find('.cre-cancel').on('click', () => $area.empty());

    $area.find('.cre-save').on('click', () => {
      const newName = $area.find('.cre-name').val().trim();
      const newContent = $area.find('.cre-content').val().trim();
      if (!newName) { alert('请输入条目名称'); return; }
      if (!newContent) { alert('请输入条目内容'); return; }

      const entries = SettingsManager.getSetting(settingKey) || [];
      if (isEdit) {
        const idx = entries.findIndex(e => e.id === existingEntry.id);
        if (idx !== -1) {
          entries[idx].name = newName;
          entries[idx].content = newContent;
        }
      } else {
        const newEntry = { id: SettingsManager.createId(), name: newName, content: newContent, enabled: true };
        entries.push(newEntry);
        const ruleOrder = SettingsManager.getSetting('ruleOrder') || [];
        ruleOrder.push(rulePrefix + newEntry.id);
        SettingsManager.updateSetting('ruleOrder', ruleOrder);
      }
      SettingsManager.updateSetting(settingKey, entries);
      renderRuleOrder();
      $area.empty();
      addLog(isEdit ? `已更新自建条目(${typeLabel}): ${newName}` : `已新建条目(${typeLabel}): ${newName}`);
    });

    $area[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ========== 已选规则排序 ==========

  function getSelectedRuleIds() {
    const presetIds = (SettingsManager.getSetting('selectedPresetEntries') || []).map(id => 'preset::' + id);
    const wbIds = (SettingsManager.getSetting('selectedWorldbookEntries') || []).map(id => 'wb::' + id);
    const customPIds = (SettingsManager.getSetting('customPresetRuleEntries') || []).map(e => 'customp::' + e.id);
    const customIds = (SettingsManager.getSetting('customRuleEntries') || []).map(e => 'custom::' + e.id);
    return presetIds.concat(wbIds).concat(customPIds).concat(customIds);
  }

  function getRuleInfo(ruleId) {
    if (ruleId.startsWith('preset::')) {
      const p = PresetReader.findPrompt(ruleId);
      return p ? { name: p.name, source: '预设', enabled: p.enabled } : null;
    } else if (ruleId.startsWith('wb::')) {
      const e = WorldInfoReader.findEntry(ruleId);
      return e ? { name: e.name, source: '世界书', enabled: e.enabled } : null;
    } else if (ruleId.startsWith('customp::')) {
      const cid = ruleId.replace('customp::', '');
      const entries = SettingsManager.getSetting('customPresetRuleEntries') || [];
      const entry = entries.find(e => e.id === cid);
      return entry ? { name: entry.name, source: '自建(预设)', enabled: entry.enabled !== false } : null;
    } else if (ruleId.startsWith('custom::')) {
      const cid = ruleId.replace('custom::', '');
      const entries = SettingsManager.getSetting('customRuleEntries') || [];
      const entry = entries.find(e => e.id === cid);
      return entry ? { name: entry.name, source: '自建(角色卡)', enabled: entry.enabled !== false } : null;
    }
    return null;
  }

  const MAIN_TEXT_MARKER_ID = '__MAIN_TEXT__';

  function renderRuleOrder() {
    const $container = $('#tagfixer-rule-order');
    const selectedIds = getSelectedRuleIds();

    if (selectedIds.length === 0) {
      $container.html('<div style="color:#666;">请先在上方勾选条目或新建规则</div>');
      SettingsManager.updateSetting('ruleOrder', []);
      $('#tagfixer-insert-body-marker').hide();
      return;
    }

    const currentOrder = SettingsManager.getSetting('ruleOrder') || [];
    const isFirstPopulate = currentOrder.length === 0;
    const ordered = currentOrder.filter(id => id === MAIN_TEXT_MARKER_ID || selectedIds.includes(id));
    for (const id of selectedIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    if (isFirstPopulate && !ordered.includes(MAIN_TEXT_MARKER_ID)) {
      ordered.push(MAIN_TEXT_MARKER_ID);
    }
    SettingsManager.updateSetting('ruleOrder', ordered);

    const hasBodyMarker = ordered.includes(MAIN_TEXT_MARKER_ID);

    let html = '';
    ordered.forEach((id, i) => {
      if (id === MAIN_TEXT_MARKER_ID) {
        html += `<div class="tagfixer-order-item tagfixer-main-text-marker" data-rule-id="${MAIN_TEXT_MARKER_ID}" draggable="true">
          <span class="tagfixer-order-num">${i + 1}</span>
          <span class="tagfixer-order-name">📍 [正文位置]</span>
          <span class="tagfixer-order-source">AI输出正文</span>
          <span class="tagfixer-order-btns">
            <span class="tagfixer-move-up" title="上移">▲</span>
            <span class="tagfixer-move-down" title="下移">▼</span>
            <span class="tagfixer-remove-rule" title="删除正文位置标记">✕</span>
          </span>
        </div>`;
        return;
      }
      const info = getRuleInfo(id);
      if (!info) return;
      const isEnabled = info.enabled !== false;
      const disabledClass = isEnabled ? '' : ' tagfixer-disabled';
      const dotColor = isEnabled ? '#4caf50' : '#666';
      const isCustom = id.startsWith('custom::') || id.startsWith('customp::');
      html += `<div class="tagfixer-order-item${disabledClass}" data-rule-id="${escapeHtml(id)}" draggable="true">
        <span class="tagfixer-order-num">${i + 1}</span>
        <span class="tagfixer-enabled-dot" style="background:${dotColor};" title="${isEnabled ? '已启用' : '已禁用（来源条目未启用）'}"></span>
        <span class="tagfixer-order-name">${escapeHtml(info.name)}</span>
        <span class="tagfixer-order-source">${escapeHtml(info.source)}</span>
        <span class="tagfixer-order-btns">
          ${isCustom ? `<span class="tagfixer-edit-rule" title="编辑">✎</span>` : ''}
          ${isCustom ? `<span class="tagfixer-toggle-rule" title="${isEnabled ? '禁用' : '启用'}">${isEnabled ? '🟢' : '⚫'}</span>` : ''}
          <span class="tagfixer-move-up" title="上移">▲</span>
          <span class="tagfixer-move-down" title="下移">▼</span>
          <span class="tagfixer-remove-rule" title="删除">✕</span>
        </span>
      </div>`;
    });
    $container.html(html);

    // 插入正文位置按钮
    const $insertBtn = $('#tagfixer-insert-body-marker');
    if (hasBodyMarker) {
      $insertBtn.hide();
    } else {
      $insertBtn.show();
    }

    // 按钮排序
    $container.find('.tagfixer-move-up').on('click', function (e) {
      e.stopPropagation();
      const $item = $(this).closest('.tagfixer-order-item');
      const $prev = $item.prev('.tagfixer-order-item');
      if ($prev.length) {
        $item.insertBefore($prev);
        saveOrderFromDom();
      }
    });
    $container.find('.tagfixer-move-down').on('click', function (e) {
      e.stopPropagation();
      const $item = $(this).closest('.tagfixer-order-item');
      const $next = $item.next('.tagfixer-order-item');
      if ($next.length) {
        $item.insertAfter($next);
        saveOrderFromDom();
      }
    });

    // 删除按钮
    $container.find('.tagfixer-remove-rule').on('click', function (e) {
      e.stopPropagation();
      const ruleId = $(this).closest('.tagfixer-order-item').data('rule-id');

      if (ruleId === MAIN_TEXT_MARKER_ID) {
        const order = (SettingsManager.getSetting('ruleOrder') || []).filter(id => id !== MAIN_TEXT_MARKER_ID);
        SettingsManager.updateSetting('ruleOrder', order);
        renderRuleOrder();
        return;
      }

      if (ruleId.startsWith('preset::')) {
        const pid = ruleId.replace('preset::', '');
        const ids = (SettingsManager.getSetting('selectedPresetEntries') || []).filter(x => x !== pid);
        SettingsManager.updateSetting('selectedPresetEntries', ids);
        loadPresetEntries();
      } else if (ruleId.startsWith('wb::')) {
        const wid = ruleId.replace('wb::', '');
        const ids = (SettingsManager.getSetting('selectedWorldbookEntries') || []).filter(x => x !== wid);
        SettingsManager.updateSetting('selectedWorldbookEntries', ids);
        fetchWorldbookEntries();
      } else if (ruleId.startsWith('customp::')) {
        const cid = ruleId.replace('customp::', '');
        const entries = (SettingsManager.getSetting('customPresetRuleEntries') || []).filter(e => e.id !== cid);
        SettingsManager.updateSetting('customPresetRuleEntries', entries);
      } else if (ruleId.startsWith('custom::')) {
        const cid = ruleId.replace('custom::', '');
        const entries = (SettingsManager.getSetting('customRuleEntries') || []).filter(e => e.id !== cid);
        SettingsManager.updateSetting('customRuleEntries', entries);
      }
      renderRuleOrder();
    });

    // 编辑自建条目
    $container.find('.tagfixer-edit-rule').on('click', function (e) {
      e.stopPropagation();
      const ruleId = $(this).closest('.tagfixer-order-item').data('rule-id');
      if (ruleId.startsWith('customp::')) {
        const cid = ruleId.replace('customp::', '');
        const entries = SettingsManager.getSetting('customPresetRuleEntries') || [];
        const entry = entries.find(e => e.id === cid);
        if (entry) showCustomRuleEditor(entry, 'preset');
      } else {
        const cid = ruleId.replace('custom::', '');
        const entries = SettingsManager.getSetting('customRuleEntries') || [];
        const entry = entries.find(e => e.id === cid);
        if (entry) showCustomRuleEditor(entry, 'char');
      }
    });

    // 自建条目启用/禁用切换
    $container.find('.tagfixer-toggle-rule').on('click', function (e) {
      e.stopPropagation();
      const ruleId = $(this).closest('.tagfixer-order-item').data('rule-id');
      const isPreset = ruleId.startsWith('customp::');
      const settingKey = isPreset ? 'customPresetRuleEntries' : 'customRuleEntries';
      const cid = ruleId.replace(/^customp?::/, '');
      const entries = SettingsManager.getSetting(settingKey) || [];
      const entry = entries.find(e => e.id === cid);
      if (entry) {
        entry.enabled = !entry.enabled;
        SettingsManager.updateSetting(settingKey, entries);
        renderRuleOrder();
      }
    });

    // 拖拽排序
    let dragId = null;
    $container.find('.tagfixer-order-item').on('dragstart', function (e) {
      dragId = $(this).data('rule-id');
      $(this).css('opacity', '0.4');
      e.originalEvent.dataTransfer.effectAllowed = 'move';
    }).on('dragend', function () {
      dragId = null;
      $(this).css('opacity', '');
      $container.find('.tagfixer-drag-over').removeClass('tagfixer-drag-over');
    }).on('dragover', function (e) {
      e.preventDefault();
      e.originalEvent.dataTransfer.dropEffect = 'move';
      $container.find('.tagfixer-drag-over').removeClass('tagfixer-drag-over');
      $(this).addClass('tagfixer-drag-over');
    }).on('dragleave', function () {
      $(this).removeClass('tagfixer-drag-over');
    }).on('drop', function (e) {
      e.preventDefault();
      $(this).removeClass('tagfixer-drag-over');
      if (!dragId) return;
      const targetId = $(this).data('rule-id');
      if (dragId === targetId) return;
      const $drag = $container.find(`[data-rule-id="${dragId}"]`);
      $drag.insertBefore($(this));
      saveOrderFromDom();
    });
  }

  function saveOrderFromDom() {
    const order = [];
    $('#tagfixer-rule-order .tagfixer-order-item').each(function () {
      order.push($(this).data('rule-id'));
    });
    SettingsManager.updateSetting('ruleOrder', order);
    $('#tagfixer-rule-order .tagfixer-order-item').each(function (i) {
      $(this).find('.tagfixer-order-num').text(i + 1);
    });
  }

  // ========== 标签模板编辑器 ==========

  function renderTemplateEditor() {
    const $container = $('#tagfixer-template-editor');
    const templates = SettingsManager.getSetting('tagTemplates') || [];

    if (templates.length === 0) {
      $container.html('<div style="color:#666; font-size:13px;">暂无模板，点击下方按钮新建</div>');
      return;
    }

    let html = '';
    for (let ti = 0; ti < templates.length; ti++) {
      const tpl = templates[ti];
      html += `<div class="tagfixer-tpl-card" data-tpl-idx="${ti}">
        <div class="tagfixer-tpl-header">
          <label class="tagfixer-switch" style="flex-shrink:0;">
            <input type="checkbox" class="tpl-enabled-cb" data-tpl-idx="${ti}" ${tpl.enabled ? 'checked' : ''}>
            <span class="tagfixer-slider"></span>
          </label>
          <input type="text" class="tpl-name-input" data-tpl-idx="${ti}" value="${escapeHtml(tpl.name)}" style="flex:1; padding:4px 8px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px; font-size:14px;">
          <select class="tpl-mode-select" data-tpl-idx="${ti}" style="padding:4px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:4px; font-size:13px;">
            <option value="plain" ${tpl.matching?.tagMode !== 'regex' ? 'selected' : ''}>纯文本</option>
            <option value="regex" ${tpl.matching?.tagMode === 'regex' ? 'selected' : ''}>正则</option>
          </select>
          <span class="tpl-delete" data-tpl-idx="${ti}" style="cursor:pointer; color:#888; font-size:17px; padding:0 4px;" title="删除模板">✕</span>
        </div>`;

      for (let gi = 0; gi < (tpl.groups || []).length; gi++) {
        const group = tpl.groups[gi];
        const collapsed = group.collapsed;
        html += `<div class="tagfixer-tpl-group" data-tpl-idx="${ti}" data-group-idx="${gi}">
          <div class="tagfixer-tpl-group-header">
            <span class="tpl-group-collapse" data-tpl-idx="${ti}" data-group-idx="${gi}" style="cursor:pointer; font-size:13px; color:#888;">${collapsed ? '▶' : '▼'}</span>
            <label class="tagfixer-switch" style="flex-shrink:0; transform:scale(0.8);">
              <input type="checkbox" class="tpl-group-enabled-cb" data-tpl-idx="${ti}" data-group-idx="${gi}" ${group.enabled ? 'checked' : ''}>
              <span class="tagfixer-slider"></span>
            </label>
            <input type="text" class="tpl-group-name-input" data-tpl-idx="${ti}" data-group-idx="${gi}" value="${escapeHtml(group.name)}" style="flex:1; padding:3px 6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:3px; font-size:13px; min-width:60px;">
            <button class="tpl-group-link-btn" data-tpl-idx="${ti}" data-group-idx="${gi}" style="padding:2px 8px; background:#2a4a6e; border:1px solid #567; color:#ccc; border-radius:3px; cursor:pointer; font-size:12px; white-space:nowrap;">联动预设</button>
            <span class="tpl-group-delete" data-tpl-idx="${ti}" data-group-idx="${gi}" style="cursor:pointer; color:#888; font-size:15px; padding:0 2px;" title="删除分组">✕</span>
          </div>`;

        // 联动预设标签显示
        if (group.linkedPromptIds && group.linkedPromptIds.length > 0) {
          html += `<div class="tagfixer-linked-prompts" data-tpl-idx="${ti}" data-group-idx="${gi}">`;
          for (const pid of group.linkedPromptIds) {
            const pInfo = PresetReader.findPrompt('preset::' + pid);
            const pName = pInfo ? pInfo.name : pid.substring(0, 8);
            html += `<span class="tagfixer-linked-prompt-tag"><span>${escapeHtml(pName)}</span><span class="tag-remove" data-tpl-idx="${ti}" data-group-idx="${gi}" data-prompt-id="${escapeHtml(pid)}">✕</span></span>`;
          }
          html += `</div>`;
        }

        if (!collapsed) {
          for (let si = 0; si < (group.slots || []).length; si++) {
            const slot = group.slots[si];
            if (slot.type === 'tag') {
              const isRegex = tpl.matching?.tagMode === 'regex';
              html += `<div class="tagfixer-tpl-slot" data-tpl-idx="${ti}" data-group-idx="${gi}" data-slot-idx="${si}">
                <span class="slot-type-label">标签</span>
                <input type="text" class="tpl-slot-value" data-tpl-idx="${ti}" data-group-idx="${gi}" data-slot-idx="${si}" value="${escapeHtml(slot.value || '')}" placeholder="如 <thinking>">
                ${isRegex ? `<input type="text" class="tpl-slot-default-value" data-tpl-idx="${ti}" data-group-idx="${gi}" data-slot-idx="${si}" value="${escapeHtml(slot.defaultValue || '')}" placeholder="补全时插入的文本" style="max-width:140px; padding:3px 6px; background:#2a2a3e; border:1px solid #555; color:#e0e0e0; border-radius:3px; font-size:12px;">` : ''}
                <span class="slot-del" data-tpl-idx="${ti}" data-group-idx="${gi}" data-slot-idx="${si}">✕</span>
              </div>`;
            } else if (slot.type === 'content_passthrough') {
              html += `<div class="tagfixer-tpl-slot" data-tpl-idx="${ti}" data-group-idx="${gi}" data-slot-idx="${si}">
                <span class="slot-type-label" style="color:#4caf50;">内容区</span>
                <span style="flex:1; color:#666; font-size:13px;">（此处为标签之间的内容，无需匹配）</span>
                <span class="slot-del" data-tpl-idx="${ti}" data-group-idx="${gi}" data-slot-idx="${si}">✕</span>
              </div>`;
            }
          }

          html += `<div style="display:flex; gap:4px; margin-top:4px;">
            <button class="tpl-add-tag-slot" data-tpl-idx="${ti}" data-group-idx="${gi}" style="padding:2px 8px; background:#2a3a4e; border:1px solid #445; color:#ccc; border-radius:3px; cursor:pointer; font-size:12px;">+ 标签</button>
            <button class="tpl-add-content-slot" data-tpl-idx="${ti}" data-group-idx="${gi}" style="padding:2px 8px; background:#2a3a4e; border:1px solid #445; color:#ccc; border-radius:3px; cursor:pointer; font-size:12px;">+ 内容区</button>
          </div>`;
        }

        html += `</div>`;
      }

      html += `<button class="tpl-add-group" data-tpl-idx="${ti}" style="margin-top:6px; padding:4px 10px; background:#2a4a6e; border:1px solid #567; color:#ccc; border-radius:3px; cursor:pointer; font-size:13px;">+ 添加分组</button>`;
      html += `</div>`;
    }

    $container.html(html);
    bindTemplateEditorEvents();
  }

  function bindTemplateEditorEvents() {
    const $c = $('#tagfixer-template-editor');

    $c.find('.tpl-enabled-cb').on('change', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      if (templates[ti]) {
        templates[ti].enabled = this.checked;
        SettingsManager.updateSetting('tagTemplates', templates);
      }
    });

    $c.find('.tpl-name-input').on('blur', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      if (templates[ti]) {
        templates[ti].name = this.value.trim() || '未命名模板';
        SettingsManager.updateSetting('tagTemplates', templates);
      }
    });

    $c.find('.tpl-mode-select').on('change', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      if (templates[ti]) {
        if (!templates[ti].matching) templates[ti].matching = {};
        templates[ti].matching.tagMode = this.value;
        SettingsManager.updateSetting('tagTemplates', templates);
      }
    });

    $c.find('.tpl-delete').on('click', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      templates.splice(ti, 1);
      SettingsManager.updateSetting('tagTemplates', templates);
      renderTemplateEditor();
    });

    $c.find('.tpl-group-collapse').on('click', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      if (templates[ti] && templates[ti].groups[gi]) {
        templates[ti].groups[gi].collapsed = !templates[ti].groups[gi].collapsed;
        SettingsManager.updateSetting('tagTemplates', templates);
        renderTemplateEditor();
      }
    });

    $c.find('.tpl-group-enabled-cb').on('change', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      if (templates[ti] && templates[ti].groups[gi]) {
        templates[ti].groups[gi].enabled = this.checked;
        SettingsManager.updateSetting('tagTemplates', templates);
      }
    });

    $c.find('.tpl-group-name-input').on('blur', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      if (templates[ti] && templates[ti].groups[gi]) {
        templates[ti].groups[gi].name = this.value.trim() || '未命名分组';
        SettingsManager.updateSetting('tagTemplates', templates);
      }
    });

    $c.find('.tpl-group-delete').on('click', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      if (templates[ti]) {
        templates[ti].groups.splice(gi, 1);
        SettingsManager.updateSetting('tagTemplates', templates);
        renderTemplateEditor();
      }
    });

    $c.find('.tpl-add-group').on('click', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      if (templates[ti]) {
        templates[ti].groups.push(TagTemplateScanner.createGroup('分组 ' + (templates[ti].groups.length + 1)));
        SettingsManager.updateSetting('tagTemplates', templates);
        renderTemplateEditor();
      }
    });

    // 联动预设按钮
    $c.find('.tpl-group-link-btn').on('click', function () {
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      showLinkPresetDialog(ti, gi);
    });

    // 移除联动预设标签
    $c.find('.tagfixer-linked-prompt-tag .tag-remove').on('click', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      const pid = $(this).data('prompt-id');
      if (templates[ti] && templates[ti].groups[gi]) {
        templates[ti].groups[gi].linkedPromptIds = (templates[ti].groups[gi].linkedPromptIds || []).filter(id => id !== pid);
        SettingsManager.updateSetting('tagTemplates', templates);
        renderTemplateEditor();
      }
    });

    // Slot 操作
    $c.find('.tpl-slot-value').on('blur', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      const si = parseInt($(this).data('slot-idx'));
      if (templates[ti]?.groups[gi]?.slots[si]) {
        templates[ti].groups[gi].slots[si].value = this.value;
        SettingsManager.updateSetting('tagTemplates', templates);
      }
    });

    $c.find('.tpl-slot-default-value').on('blur', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      const si = parseInt($(this).data('slot-idx'));
      if (templates[ti]?.groups[gi]?.slots[si]) {
        templates[ti].groups[gi].slots[si].defaultValue = this.value || undefined;
        SettingsManager.updateSetting('tagTemplates', templates);
      }
    });

    $c.find('.slot-del').on('click', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      const si = parseInt($(this).data('slot-idx'));
      if (templates[ti]?.groups[gi]) {
        templates[ti].groups[gi].slots.splice(si, 1);
        SettingsManager.updateSetting('tagTemplates', templates);
        renderTemplateEditor();
      }
    });

    $c.find('.tpl-add-tag-slot').on('click', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      if (templates[ti]?.groups[gi]) {
        templates[ti].groups[gi].slots.push(TagTemplateScanner.createSlot('tag', ''));
        SettingsManager.updateSetting('tagTemplates', templates);
        renderTemplateEditor();
      }
    });

    $c.find('.tpl-add-content-slot').on('click', function () {
      const templates = SettingsManager.getSetting('tagTemplates') || [];
      const ti = parseInt($(this).data('tpl-idx'));
      const gi = parseInt($(this).data('group-idx'));
      if (templates[ti]?.groups[gi]) {
        templates[ti].groups[gi].slots.push(TagTemplateScanner.createSlot('content_passthrough'));
        SettingsManager.updateSetting('tagTemplates', templates);
        renderTemplateEditor();
      }
    });
  }

  // ========== 联动预设弹窗 ==========

  function showLinkPresetDialog(tplIdx, groupIdx) {
    const templates = SettingsManager.getSetting('tagTemplates') || [];
    const group = templates[tplIdx]?.groups[groupIdx];
    if (!group) return;

    const prompts = PresetReader.getAllPrompts();
    const linked = group.linkedPromptIds || [];

    let listHtml = '';
    for (const p of prompts) {
      const checked = linked.includes(p.id) ? ' checked' : '';
      const enableMark = p.enabled ? '🟢' : '⚫';
      listHtml += `<label style="display:block; padding:3px 0; cursor:pointer; color:#e0e0e0;"><input type="checkbox" value="${escapeHtml(p.id)}" class="link-preset-cb"${checked}> ${enableMark} ${escapeHtml(p.name)}</label>`;
    }

    const $overlay = $(`<div class="tagfixer-custom-edit-overlay">
      <div class="tagfixer-custom-edit-panel" style="width:380px;">
        <h4 style="margin:0 0 10px; color:#fff; font-size:15px;">关联预设条目 — ${escapeHtml(group.name)}</h4>
        <div style="color:#999; font-size:13px; margin-bottom:8px;">勾选要关联的预设条目。当所有关联条目都启用时，此分组才生效。</div>
        <div style="max-height:300px; overflow-y:auto; background:#0d0d1a; border-radius:4px; padding:8px;">
          ${listHtml || '<div style="color:#666;">未找到预设条目</div>'}
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
          <button class="link-preset-cancel" style="padding:6px 16px; background:#444; border:1px solid #666; color:#e0e0e0; border-radius:4px; cursor:pointer;">取消</button>
          <button class="link-preset-save" style="padding:6px 16px; background:#2a6a4e; border:1px solid #4a8a6e; color:#e0e0e0; border-radius:4px; cursor:pointer;">确定</button>
        </div>
      </div>
    </div>`);

    $('body').append($overlay);

    $overlay.find('.link-preset-cancel').on('click', () => $overlay.remove());
    $overlay.on('click', function (e) { if (e.target === this) $overlay.remove(); });

    $overlay.find('.link-preset-save').on('click', () => {
      const ids = [];
      $overlay.find('.link-preset-cb:checked').each(function () { ids.push($(this).val()); });
      const tpls = SettingsManager.getSetting('tagTemplates') || [];
      if (tpls[tplIdx]?.groups[groupIdx]) {
        tpls[tplIdx].groups[groupIdx].linkedPromptIds = ids;
        SettingsManager.updateSetting('tagTemplates', tpls);
        renderTemplateEditor();
      }
      $overlay.remove();
    });
  }

  // ========== 加载预设条目列表 ==========

  function loadPresetEntries() {
    const $list = $('#tagfixer-preset-list');
    $list.html('<div style="color:#666;">加载中...</div>');

    const selectedIds = SettingsManager.getSetting('selectedPresetEntries') || [];

    try {
      const prompts = PresetReader.refreshPrompts();
      if (prompts.length === 0) {
        $list.html('<div style="color:#666;">未找到预设条目</div>');
        return;
      }

      let html = '';
      for (const p of prompts) {
        const checked = selectedIds.includes(p.id) ? ' checked' : '';
        const enableMark = p.enabled ? '🟢' : '⚫';
        const typeMark = p.isSystem ? '📌' : '📝';
        const preview = p.content ? p.content.substring(0, 40).replace(/\n/g, ' ') + (p.content.length > 40 ? '...' : '') : '(空)';
        html += `<label title="${escapeHtml(preview)}"><input type="checkbox" value="${escapeHtml(p.id)}"${checked} class="tagfixer-preset-cb"> ${enableMark}${typeMark} ${escapeHtml(p.name)}</label>`;
      }
      $list.html(html);

      $list.find('.tagfixer-preset-cb').on('change', () => {
        const ids = [];
        $list.find('.tagfixer-preset-cb:checked').each(function () {
          ids.push($(this).val());
        });
        SettingsManager.updateSetting('selectedPresetEntries', ids);
        renderRuleOrder();
      });
    } catch (e) {
      console.warn('[TagFixer] 加载预设条目失败:', e);
      $list.html('<div style="color:#f44;">加载失败</div>');
    }
  }

  // ========== 加载世界书条目列表 ==========

  function loadWorldbookList() {
    const $list = $('#tagfixer-worldbook-list');
    try {
      const books = WorldInfoReader.getAvailableWorldbooks();
      if (books.length === 0) {
        $list.html('<div style="color:#666;">未找到任何世界书</div>');
        return;
      }

      const selectedBooks = SettingsManager.getSetting('selectedWorldbooks') || [];
      let html = '';
      for (const name of books) {
        const checked = selectedBooks.includes(name) ? ' checked' : '';
        html += `<label><input type="checkbox" value="${escapeHtml(name)}"${checked} class="tagfixer-wb-cb"> 📘 ${escapeHtml(name)}</label>`;
      }
      $list.html(html);

      $list.find('.tagfixer-wb-cb').on('change', () => {
        const names = [];
        $list.find('.tagfixer-wb-cb:checked').each(function () { names.push($(this).val()); });
        SettingsManager.updateSetting('selectedWorldbooks', names);
      });
    } catch (e) {
      console.warn('[TagFixer] 加载世界书列表失败:', e);
      $list.html('<div style="color:#f44;">加载失败</div>');
    }
  }

  async function fetchWorldbookEntries() {
    const selectedBooks = SettingsManager.getSetting('selectedWorldbooks') || [];
    const $list = $('#tagfixer-entries-list');

    if (selectedBooks.length === 0) {
      $list.html('<div style="color:#e8a735;">请先在上方勾选要读取的世界书</div>');
      return;
    }

    $list.html('<div style="color:#666;">正在拉取条目...</div>');

    try {
      const entries = await WorldInfoReader.getEntriesForBooks(selectedBooks);
      if (entries.length === 0) {
        $list.html('<div style="color:#666;">选中的世界书中未找到条目</div>');
        return;
      }

      const selectedIds = SettingsManager.getSetting('selectedWorldbookEntries') || [];
      let html = '';
      for (const entry of entries) {
        const id = `${entry.worldbook}::${entry.uid}`;
        const checked = selectedIds.includes(id) ? ' checked' : '';
        const mark = entry.enabled ? '🟢' : '⚫';
        html += `<label><input type="checkbox" value="${escapeHtml(id)}"${checked} class="tagfixer-entry-cb"> ${mark} ${escapeHtml(entry.name)} <span style="color:#666; font-size:13px;">(${escapeHtml(entry.worldbook)})</span></label>`;
      }
      $list.html(html);

      $list.find('.tagfixer-entry-cb').on('change', () => {
        const ids = [];
        $list.find('.tagfixer-entry-cb:checked').each(function () { ids.push($(this).val()); });
        SettingsManager.updateSetting('selectedWorldbookEntries', ids);
        renderRuleOrder();
      });

      addLog(`✅ 已拉取 ${entries.length} 个世界书条目`);
    } catch (e) {
      console.warn('[TagFixer] 拉取世界书条目失败:', e);
      $list.html('<div style="color:#f44;">拉取失败</div>');
    }
  }

  function detectMobile() {
    try { return SillyTavern.isMobile(); } catch (_) {}
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  }

  function togglePanel(show) {
    const $panel = $('#tagfixer-panel');
    const $overlay = $('#tagfixer-overlay');
    if (!show) {
      $panel.css('display', 'none');
      $overlay.css('display', 'none');
      return;
    }

    const mobile = detectMobile();

    if (mobile) {
      $panel.addClass('tagfixer-mobile');
      $panel.css({
        display: 'block',
        position: 'fixed',
        top: '2dvh',
        left: '2dvw',
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
        width: '96dvw',
        height: '90dvh',
        maxWidth: 'none',
        maxHeight: 'none',
        borderRadius: '8px',
        padding: '10px',
        boxSizing: 'border-box',
      });
    } else {
      $panel.removeClass('tagfixer-mobile');
      $panel.css({
        display: 'block',
        position: 'fixed',
        top: '50%',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)',
        width: '520px',
        minWidth: 'auto',
        height: 'auto',
        maxWidth: 'none',
        maxHeight: '85vh',
        borderRadius: '12px',
        padding: '20px',
        boxSizing: 'border-box',
        fontSize: '14px',
      });
    }

    $overlay.css('display', 'block');
    renderLogs();
  }

  // ========== 魔法棒菜单入口 ==========

  function addWandMenuEntry() {
    const $menu = $('#extensionsMenu');
    if ($menu.length === 0) {
      setTimeout(addWandMenuEntry, 2000);
      return;
    }
    if ($('#tagfixer_wand_container').length > 0) return;

    const $container = $('<div id="tagfixer_wand_container" class="extension_container"></div>');
    const $item = $(`
      <div class="list-group-item flex-container flexGap5 interactable" tabindex="0" role="listitem">
        <div class="fa-fw fa-solid fa-wrench extensionsMenuExtensionButton"></div>
        <span>格式肘击大师</span>
      </div>
    `);
    $item.on('click', () => {
      togglePanel(true);
      $menu.fadeOut(200);
    });
    $container.append($item);
    $menu.append($container);
  }

  // ========== 消息操作按钮 ==========

  function setupMessageButtons() {
    addFixButtonsToExistingMessages();

    const $chat = $('#chat');
    if ($chat.length === 0) {
      setTimeout(setupMessageButtons, 2000);
      return;
    }

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && $(node).hasClass('mes')) {
            addFixButtonToMessage($(node));
          }
        }
      }
    }).observe($chat[0], { childList: true });
  }

  function addFixButtonsToExistingMessages() {
    $('#chat .mes').each(function () {
      addFixButtonToMessage($(this));
    });
  }

  function addFixButtonToMessage($mes) {
    if ($mes.attr('is_user') === 'true') return;
    const $extra = $mes.find('.mes_buttons .extraMesButtons');
    if ($extra.length === 0 || $extra.find('.tagfixer-fix-btn').length > 0) return;

    const $btn = $('<div class="mes_button tagfixer-fix-btn interactable" title="格式肘击大师: 修复标签" style="cursor:pointer; padding:2px 4px;">🥊</div>');
    $btn.on('click', async () => {
      const id = parseInt($mes.attr('mesid'), 10);
      if (!isNaN(id)) await manualFix(id);
    });
    $extra.append($btn);
  }

  // ========== 初始化 ==========

  async function init() {
    TagTemplateScanner.setLog(addLog);
    await createSettingsPanel();
    addWandMenuEntry();
    setupMessageButtons();
    setupEventListeners();
    addLog('格式肘击大师已启动');
  }

  return { init, autoFix, manualFix, togglePanel, addLog };
})();

window.ST_TagFixer_Main = MainController;
MainController.init();
