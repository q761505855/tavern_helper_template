/*
 * 无头思维链提取 + Reasoning 面板美化（iframe 脚本版 / 纯 JS）
 * 规则：提取 reasoning，并把命中的 think 段从正文移除
 * 当前主题：极致日系极简（无标题单图标、丝滑交互动画、明朝体排版）
 */

(function () {
  const DEBUG = true;
  const SCRIPT_ID = typeof getScriptId === 'function' ? getScriptId() : 'reasoning_regex_styler';
  const STYLE_ID = `reasoning-style-${SCRIPT_ID}`;

  // 1. 配置注入：通过获取酒馆 Context 强行修改原生解析器配置
  function injectConfig() {
    const context = getST()?.getContext?.();
    const config = context?.powerUserSettings?.reasoning;
    if (config) {
      config.auto_parse = true;
      config.prefix = '<!-- begin_of_Subtext_think -->';
      config.suffix = '</thinking>';
      log('Config injected to ST via Context API');
    } else {
      log('Failed to inject config: Context or powerUserSettings not found');
    }
  }

  function getReasoningConfig() {
    const context = getST()?.getContext?.();
    const config = context?.powerUserSettings?.reasoning;
    if (config) {
      return {
        prefix: config.prefix || '-',
        suffix: config.suffix || '</think>',
        auto_expand: config.auto_expand
      };
    }
    return { prefix: '-', suffix: '</think>', auto_expand: true };
  }

  const REASONING_CSS = String.raw`
/* ========================================================= */
/* 终极完美版：按钮视觉水平对齐 + 纯蓝系光效 + 五彩全息文字      */
/* ========================================================= */

/* 1. 基础容器 */
.mes_reasoning_details {
    margin: 40px 20px 30px 0 !important; 
    width: calc(100% - 20px) !important; 
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    background: transparent !important; 
    border: none !important;
    box-shadow: none !important;
    position: relative !important;
    overflow: visible !important; 
}

/* 2. 剥离原生容器的干扰 */
.mes_reasoning_summary {
    margin: 0 !important; padding: 0 !important;
    background: transparent !important; border: none !important;
    cursor: pointer !important; outline: none !important; list-style: none !important;
    position: relative !important; z-index: 2 !important; 
    display: block !important;
}
.mes_reasoning_summary::-webkit-details-marker { display: none !important; }

.mes_reasoning_header_block {
    background: transparent !important; border: none !important; box-shadow: none !important;
    margin: 0 !important; padding: 0 !important; display: block !important;
}

/* 隐藏原生图标 */
.mes_reasoning_header .thinking-icon, 
.mes_reasoning_header .icon-svg, 
.mes_reasoning_arrow {
    display: none !important;
}

/* ========================================================= */
/* 3. 头部布局重构 (高级磨砂深邃质感 + 纯色蓝绑带)              */
/* ========================================================= */
.mes_reasoning_header {
    background: transparent !important; border: none !important; box-shadow: none !important;
    margin: 0 !important; 
    padding: 14px 20px !important;
    display: flex !important;
    align-items: center !important;
    position: relative !important;
    z-index: 1 !important;
    transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
}

/* --- 3D 气泡中间层：暗影磨砂立体质感 --- */
.mes_reasoning_header::before {
    content: '' !important;
    position: absolute !important;
    top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
    border-radius: 10px !important;
    z-index: -2 !important; 
    transition: all 0.4s ease !important;
    
    /* 🔥 质感升级：加入 1px 半透明边框，让边缘更加锐利 */
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    
    /* 🔥 质感升级：多层光影叠加。外阴影悬浮 + 左上角内发光高光(倒角) + 右下角内暗影 */
    box-shadow: 
        4px 4px 12px rgba(0, 0, 0, 0.4), 
        inset 1px 1px 2px rgba(255, 255, 255, 0.06), 
        inset -1px -1px 4px rgba(0, 0, 0, 0.3) !important; 
        
    /* 🔥 质感升级：将纯色替换为 145deg 暗色金属微渐变，保持蓝条锋利 */
background: 
        linear-gradient(45deg,
            transparent calc(100% - 72px),
            #2563eb calc(100% - 72px), #2563eb calc(100% - 68px),
            transparent calc(100% - 68px), transparent calc(100% - 60px),
            #38bdf8 calc(100% - 60px), #38bdf8 calc(100% - 56px),
            transparent calc(100% - 56px)
        ),
        linear-gradient(135deg,
            transparent calc(100% - 72px),
            #2563eb calc(100% - 72px), #2563eb calc(100% - 68px),
            transparent calc(100% - 68px), transparent calc(100% - 60px),
            #38bdf8 calc(100% - 60px), #38bdf8 calc(100% - 56px),
            transparent calc(100% - 56px)
        ),
        linear-gradient(145deg, #2b2d35 0%, #1c1e24 100%) !important;
}

/* --- 右下角玻璃模糊镜片 --- */
.mes_reasoning_header::after {
    content: '' !important;
    position: absolute !important;
    bottom: 0 !important; right: 0 !important;
    transform: translate(12px, 12px) !important; 
    width: 35px !important; height: 35px !important;
    
    /* 🔥 质感升级：增加玻璃质感的高光渐变和极细边框 */
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2) !important;
    
    backdrop-filter: blur(5px) !important;
    -webkit-backdrop-filter: blur(5px) !important;
    border-radius: 50px !important;
    z-index: -1 !important; 
    transition: all 0.4s ease !important;
    pointer-events: none !important;
}

/* --- 3D 错层悬停动画 (悬停时亮度微增，阴影加深) --- */
.mes_reasoning_summary:hover .mes_reasoning_header::before {
    transform: translate(8px, 10px) !important;
    box-shadow: 
        8px 8px 20px rgba(0, 0, 0, 0.5), 
        inset 1px 1px 2px rgba(255, 255, 255, 0.08), 
        inset -1px -1px 4px rgba(0, 0, 0, 0.4) !important; 
background: 
        linear-gradient(45deg,
            transparent calc(100% - 72px),
            #2563eb calc(100% - 72px), #2563eb calc(100% - 68px),
            transparent calc(100% - 68px), transparent calc(100% - 60px),
            #38bdf8 calc(100% - 60px), #38bdf8 calc(100% - 56px),
            transparent calc(100% - 56px)
        ),
        linear-gradient(135deg,
            transparent calc(100% - 72px),
            #2563eb calc(100% - 72px), #2563eb calc(100% - 68px),
            transparent calc(100% - 68px), transparent calc(100% - 60px),
            #38bdf8 calc(100% - 60px), #38bdf8 calc(100% - 56px),
            transparent calc(100% - 56px)
        ),
        linear-gradient(145deg, #32353f 0%, #22242a 100%) !important;
}
/* 悬浮时：玻璃镜片扩散 */
.mes_reasoning_summary:hover .mes_reasoning_header::after {
    border-radius: 10px !important;
    transform: translate(0, 0) !important;
    width: 100% !important; height: 100% !important;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.01) 100%) !important; 
}

.mes_reasoning_summary:active .mes_reasoning_header::after {
    transition: 0s !important;
    transform: translate(0, 4px) !important;
}

/* ========================================================= */
/* 4. 左侧标题文字：双层叠加实现无缝平滑过渡 (Hologram Sweep)   */
/* ========================================================= */
.mes_reasoning_header_title {
    display: flex !important;
    align-items: center !important;
    flex: 1 !important; 
    font-size: 0 !important; 
    color: transparent !important;
    padding: 0 !important; 
    margin: 0 !important;
    background: transparent !important;
    position: relative !important;
    z-index: 10 !important;
    transition: transform 2.8s cubic-bezier(0.25, 0.8, 0.25, 1), padding 0.4s ease !important;
}

/* 共有基础属性：::before 为光效层，::after 为常驻白字层 */
.mes_reasoning_header_title::before,
.mes_reasoning_header_title::after {
    content: "ᴘʀɪꜱᴍ//ғᴏх" !important;
    font-size: 0.95rem !important;
    font-weight: 500 !important;
    letter-spacing: 1px !important;
    /* 🔥 核心修复：添加超平滑的 0.8s 透明度渐变，告别突兀闪烁 */
    transition: opacity 2.8s cubic-bezier(0.4, 0, 0.2, 1), color 0.4s ease, left 0.4s ease !important;
}

/* --- 底层：常驻静态文字 --- */
.mes_reasoning_header_title::after {
    color: #e0e0e0 !important; 
    -webkit-text-fill-color: initial !important;
    background-image: none !important;
    opacity: 1 !important; /* 默认结束状态时：显示白字 */
}

/* --- 顶层：五彩斑斓全息光效 --- */
.mes_reasoning_header_title::before {
    position: absolute !important;
    left: 0 !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    display: inline-block !important; 
    
    background-image: linear-gradient(
        90deg, 
        #a21caf 0%, 
        #3b82f6 25%, 
        #2dd4bf 50%, 
        #fda4af 75%, 
        #a21caf 100%
    ) !important;
    background-size: 200% auto !important; 
    color: transparent !important; 
    -webkit-text-fill-color: transparent !important; 
    -webkit-background-clip: text !important;
    background-clip: text !important;
    animation: colorful-sweep 2s linear infinite !important;
    
    opacity: 0 !important; /* 默认结束状态时：隐藏光效 */
    pointer-events: none !important;
}

@keyframes colorful-sweep {
    0% { background-position: 0% center; }
    100% { background-position: 200% center; }
}

/* 🔥 思考中状态：显示光效层，隐藏白字层（状态切换时互相平滑渐变） */
.mes_reasoning_details:not([data-state="done"]):not([open]) .mes_reasoning_header_title::before {
    opacity: 1 !important;
}
.mes_reasoning_details:not([data-state="done"]):not([open]) .mes_reasoning_header_title::after {
    opacity: 0 !important;
}

/* ========================================================= */
/* 5. 展开状态交互：完美还原外壳溶解与文字停靠            */
/* ========================================================= */
.mes_reasoning_details[open] .mes_reasoning_header::before,
.mes_reasoning_details[open] .mes_reasoning_header::after {
    opacity: 0 !important;
    visibility: hidden !important;
}

.mes_reasoning_details[open] .mes_reasoning_header_title {
    transform: translateY(-4px) !important;
    padding-left: 10px !important;
}

/* 展开时：修正光效层的偏移跟随，并确保光效彻底隐藏 */
.mes_reasoning_details[open] .mes_reasoning_header_title::before {
    left: 10px !important; 
    opacity: 0 !important; 
}

/* 展开时：底层字体平滑变为停靠灰字 */
.mes_reasoning_details[open] .mes_reasoning_header_title::after {
    color: #999 !important;
    -webkit-text-fill-color: #999 !important; 
    opacity: 1 !important;
}

/* ========================================================= */
/* 6. 核心修复：操作按钮悬浮至 -8px + 纯文字青蓝光效 (无下划线) */
/* ========================================================= */
.mes_reasoning_actions {
    display: flex !important;
    gap: 12px !important; 
    align-items: center !important;
    
    position: absolute !important;
    right: 20px !important;
    top: 50% !important;
    z-index: 20 !important;
    
    /* 基础隐藏状态：基线视觉补偿 -3px */
    opacity: 0 !important;
    visibility: hidden !important;
    transform: translate(10px, calc(-50% - 3px)) !important;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

/* 展开悬浮时：显现并对齐至完美高度 -8px */
.mes_reasoning_details[open] .mes_reasoning_summary:hover .mes_reasoning_actions {
    opacity: 1 !important;
    visibility: visible !important;
    transform: translate(0, calc(-50% - 8px)) !important;
}

.mes_reasoning_actions > div {
    background: transparent !important;
    border: none !important;
    color: rgba(255, 255, 255, 0.3) !important;
    font-size: 0 !important; 
    cursor: pointer !important;
    padding: 4px 0 !important; 
    position: relative !important;
    z-index: 20 !important;
    transition: color 0.3s ease, text-shadow 0.3s ease !important;
}

.mes_reasoning_actions > div::before {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    text-transform: uppercase !important; 
    font-size: 10px !important; 
    letter-spacing: 1px !important;
}

.mes_reasoning_actions .mes_reasoning_close_all::before { content: "FOLD" !important; }
.mes_reasoning_actions .mes_reasoning_copy::before { content: "COPY" !important; }
.mes_reasoning_actions .mes_reasoning_edit::before { content: "EDIT" !important; }
.mes_reasoning_actions .mes_reasoning_edit_done::before { content: "SAVE" !important; }
.mes_reasoning_actions .mes_reasoning_delete::before { content: "DEL" !important; }
.mes_reasoning_actions .mes_reasoning_edit_cancel::before { content: "CANCEL" !important; }

/* ✨ 保留并增强光效：鼠标悬停时的青蓝色发光 */
.mes_reasoning_actions > div:hover {
    color: #38bdf8 !important;
    /* 采用双层阴影，让光晕更饱满好看 */
    text-shadow: 0 0 8px rgba(56, 189, 248, 0.8), 0 0 16px rgba(56, 189, 248, 0.4) !important;
}

/* 强制清除可能存在的原版下划线，避免穿帮 */
.mes_reasoning_actions > div::after {
    display: none !important;
}

/* ========================================================= */
/* 7. 内容承载区：超厚 6px 边框 + 幽蓝渐变深坑                    */
/* ========================================================= */
.mes_reasoning {
    margin: 0 !important;
    margin-top: -18px !important; 
    padding: 28px 20px 20px 20px !important;
    
    /* 🔥 砍掉了这里原有的杂乱蓝条，只保留纯粹干净的暗色深坑渐变 */
    background: linear-gradient(145deg, #161922 0%, #0d0f14 100%) !important; 
        
    color: #dcdcdc !important;
    font-size: 0.9em !important;
    line-height: 1.7 !important;
    border-radius: 12px !important;
    
    border: 6px solid #262830 !important;
    box-shadow: 
        8px 8px 18px rgba(0, 0, 0, 0.95), 
        -2px -2px 10px rgba(255, 255, 255, 0.05), 
        inset 12px 12px 24px rgba(0, 0, 0, 0.95), 
        inset -4px -4px 10px rgba(255, 255, 255, 0.04) !important;
        
    position: relative !important;
    z-index: 1 !important; 
    animation: dent-sink 0.4s ease-out forwards !important;
    max-height: 400px;
    overflow-y: auto;
}

@keyframes dent-sink {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

.mes_reasoning::-webkit-scrollbar { width: 6px; }
.mes_reasoning::-webkit-scrollbar-track { background: transparent; }
.mes_reasoning::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }
.mes_reasoning::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }
`;

  function log(...args) {
    if (!DEBUG) return;
    console.log('[ReasoningRegexStyler]', ...args);
  }

  function getTopDocument() {
    try {
      return window.top?.document || document;
    } catch {
      return document;
    }
  }

  function getST() {
    if (typeof SillyTavern !== 'undefined') return SillyTavern;
    return null;
  }

  function getChatArray() {
    const st = getST();
    if (st && Array.isArray(st.chat)) return st.chat;
    if (Array.isArray(window.chat)) return window.chat;
    return null;
  }

  function updateBlock(messageId, message) {
    const st = getST();
    if (st && typeof st.updateMessageBlock === 'function') {
      st.updateMessageBlock(messageId, message);
      return;
    }
    if (typeof window.updateMessageBlock === 'function') {
      window.updateMessageBlock(messageId, message);
    }
  }

  function injectStyleOnce(doc) {
    if (!doc || !doc.head) return;
    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement('style');
      style.id = STYLE_ID;
      doc.head.appendChild(style);
      log('style created', { inTop: doc === getTopDocument() });
    }
    style.textContent = REASONING_CSS;
  }

  function injectStyle() {
    injectStyleOnce(document);
    injectStyleOnce(getTopDocument());
    log('style injected', { cssLength: REASONING_CSS.length });
  }

  function removeStyle() {
    for (const doc of [document, getTopDocument()]) {
      const style = doc?.getElementById?.(STYLE_ID);
      if (style) style.remove();
    }
    log('style removed');
  }

  /**
   * 核心：流式兼容的解析逻辑 (无头优先)
   */
  function extractReasoningAndClean(text, isStreaming) {
    if (typeof text !== 'string') return null;
    const { prefix, suffix } = getReasoningConfig();

    // 1. 如果包含闭合标签
    if (text.includes(suffix)) {
      const parts = text.split(suffix);
      let reasoningPart = parts[0];
      const cleaned = parts.slice(1).join(suffix).trim();

      // 如果有前缀则从前缀后开始截取
      if (reasoningPart.includes(prefix)) {
        reasoningPart = reasoningPart.split(prefix)[1];
      }

      const title = extractLatestHeader(reasoningPart);
      return { reasoning: reasoningPart.trim(), cleaned, state: 'done', title };
    }

    // 2. 流式状态下，没看到闭合标签，则全部内容视为思维链
    if (isStreaming && text.length > 0) {
      let reasoning = text;
      // 如果有前缀则去掉前缀显示
      if (text.startsWith(prefix)) {
        reasoning = text.slice(prefix.length);
      }
      const title = extractLatestHeader(reasoning);
      return { reasoning: reasoning.trim(), cleaned: '', state: 'thinking', title };
    }

    // 3. 非流式但有前缀的情况
    if (text.startsWith(prefix)) {
      const reasoning = text.slice(prefix.length).trim();
      const title = extractLatestHeader(reasoning);
      return { reasoning, cleaned: '', state: 'thinking', title };
    }

    return null;
  }

  // 移除 extractLatestHeader，直接使用酒馆默认逻辑

  function applyReasoningToMessage(messageId) {
    const id = Number(messageId);
    if (!Number.isInteger(id) || id < 0) return;

    const chat = getChatArray();
    if (!chat) return;

    const message = chat[id];
    if (!message || message.is_user) return;

    const isStreaming = message.swipe_id === undefined && message.gen_started && !message.extra?.reasoning_duration;

    if (message.extra?.reasoning) {
      const state = isStreaming ? 'thinking' : 'done';

      const { suffix } = getReasoningConfig();
      if (message.mes.includes(suffix)) {
        message.mes = message.mes.split(suffix).slice(1).join(suffix).trim();
        updateBlock(id, message);
      }

      updateReasoningUIState(id, state);
      return;
    }

    const parsed = extractReasoningAndClean(String(message.mes ?? ''), isStreaming);
    if (!parsed) {
      updateReasoningUIState(id, 'none');
      return;
    }

    message.extra = (message.extra && typeof message.extra === 'object') ? message.extra : {};
    message.extra.reasoning = parsed.reasoning;
    message.extra.reasoning_type = 'parsed';
    message.extra.reasoning_state = parsed.state;
    message.mes = parsed.cleaned;

    updateBlock(id, message);
    updateReasoningUIState(id, parsed.state);
  }

  /**
   * 强制同步 DOM 状态属性
   */
  function updateReasoningUIState(messageId, state) {
    requestAnimationFrame(() => {
      const messageDom = document.querySelector(`#chat [mesid="${messageId}"]`);
      if (!messageDom) return;

      // 【核心】给根节点挂载状态，通过 CSS 物理遮断正文渲染
      if (state === 'thinking') {
        messageDom.setAttribute('data-reasoning-state', 'thinking');
        messageDom.setAttribute('data-is-thinking', 'true');
      } else if (state === 'done') {
        messageDom.setAttribute('data-reasoning-state', 'done');
        messageDom.removeAttribute('data-is-thinking');
      } else {
        messageDom.removeAttribute('data-reasoning-state');
        messageDom.removeAttribute('data-is-thinking');
      }

      const mesDetails = messageDom.querySelector('.mes_reasoning_details');

      if (mesDetails) {
        if (mesDetails.getAttribute('data-state') !== state) {
          mesDetails.setAttribute('data-state', state);
        }
        const config = getReasoningConfig();
        if (state === 'thinking' && config.auto_expand) {
          if (!mesDetails.open) mesDetails.open = true;
        }
      }

      // 移除所有自定义标题属性，确保显示原生文本
      const mesTitle = messageDom.querySelector('.mes_reasoning_header_title');
      if (mesTitle) {
          mesTitle.removeAttribute('data-custom-title');
      }
    });
  }

  function applyReasoningToAllMessages() {
    const chat = getChatArray();
    if (!chat) return;
    for (let i = 0; i < chat.length; i++) applyReasoningToMessage(i);
  }

  function bindEvents() {
    if (typeof eventOn === 'function' && typeof tavern_events !== 'undefined') {
      eventOn(tavern_events.MESSAGE_UPDATED, (messageId) => {
        applyReasoningToMessage(messageId);
      });

      eventOn(tavern_events.MESSAGE_RECEIVED, (messageId) => {
        applyReasoningToMessage(messageId);
      });

      eventOn(tavern_events.CHAT_CHANGED, () => {
        injectConfig(); // 切换聊天时再次确保配置注入
        setTimeout(applyReasoningToAllMessages, 50);
      });

      eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        applyReasoningToMessage(messageId);
      });

      // 新增：高频流式监听，确保在每个 token 到达时都强制同步一次 UI 状态
      eventOn(tavern_events.STREAM_TOKEN_RECEIVED, (messageId) => {
        applyReasoningToMessage(messageId);
      });
    } else {
      log('eventOn/tavern_events not available');
    }
  }

  function init() {
    injectConfig();
    injectStyle();
    bindEvents();

    setTimeout(applyReasoningToAllMessages, 100);
    setTimeout(applyReasoningToAllMessages, 800);

    $(window).on('pagehide', removeStyle);
    log('loaded', { scriptId: SCRIPT_ID, debug: DEBUG });
  }

  $(() => init());
})();
