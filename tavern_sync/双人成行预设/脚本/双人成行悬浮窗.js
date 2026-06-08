$(
  errorCatched(async () => {
    const ID = "th-orb-v5-prismfox";
    let pdoc, pwin;
    try {
      pdoc = parent?.document ? parent.document : document;
      pwin = parent?.window ? parent.window : window;
    } catch (_) {
      pdoc = document;
      pwin = window;
    }

    // ── 清理所有旧版本 ────────────────────────────
    [
      "th-orb-v4-glass",
      "th-orb-v4-deepblue",
      "th-orb-v4-aurora",
      "th-orb-v4-eyecare",
      "th-orb-v4-minimalstar",
      "th-orb-v4-stargem",
      "th-orb-v4-stargem-aligned",
      ID,
      `${ID}-panic-mask`,
      `${ID}-cyber-term`,
    ].forEach((oldId) => {
      pdoc.getElementById(oldId)?.remove();
      pdoc.getElementById(`${oldId}-style`)?.remove();
    });

    // ── 彻底删除/屏蔽手机端老板键 (Panic Mode) ──────
    try {
      if (pwin.panicMode) pwin.panicMode = () => {};
      if (window.panicMode) window.panicMode = () => {};
      if (pwin.$) {
        pwin.$(pdoc).off("dblclick", ".mes_window, #bg_layer, body");
        pwin.$(pdoc.body).off("dblclick");
      }
      pdoc.addEventListener(
        "dblclick",
        (e) => {
          if (e.target === pdoc.body || e.target.id === "bg_layer" || e.target.classList?.contains("mes_window")) {
            e.stopPropagation();
            e.preventDefault();
          }
        },
        true,
      );
    } catch (err) {
      console.warn("屏蔽老板键时出错:", err);
    }

    // ── 读取保存的位置、主题与模型状态 ─────────
    const isMobile = pwin.innerWidth <= 768;
    const pos = isMobile ? { x: pwin.innerWidth - 60, y: pwin.innerHeight - 120 } : { x: 40, y: 160 };
    let currentTheme = "bg-glass";
    let savedModel = "gemini"; // 默认模型
    try {
      const r = getVariables({ type: "global" })?.orbV5_prismfox_pos;
      if (r) {
        const saved = JSON.parse(r);
        saved.x = Math.max(0, Math.min(Number(saved.x) || 40, pwin.innerWidth - 48));
        saved.y = Math.max(0, Math.min(Number(saved.y) || 160, pwin.innerHeight - 48));
        if (saved.theme) currentTheme = saved.theme;
        if (saved.model) savedModel = saved.model;
        Object.assign(pos, saved);
      }
    } catch (_) {}

    // ── 样式表 ──────────────────────────────────────
    const style = pdoc.createElement("style");
    style.id = `${ID}-style`;
    style.textContent = `
    #${ID} {
      position: fixed !important; z-index: 2147483647 !important;
      width: 48px; height: 48px;
      font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
      user-select: none; -webkit-user-select: none; touch-action: none;
      -webkit-transform: translateZ(0); transform: translateZ(0);
    }

    #${ID} .orb {
      position: absolute; top: 0; left: 0;
      width: 48px; height: 48px; border-radius: 8px; cursor: pointer; z-index: 2;
      background: transparent; display: flex; align-items: center; justify-content: center;
      transition: background 0.2s ease;
    }
    #${ID} .orb:hover { background: rgba(255, 255, 255, 0.05); }

    #${ID} .orb-icon {
      transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1);
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); display: block;
    }
    #${ID} .orb:hover .orb-icon { transform: scale(1.15); }
    #${ID}.open .orb-icon { transform: rotate(90deg) scale(1.1); }

    #${ID} .menu {
      position: absolute; width: 340px; pointer-events: none;
      -webkit-transform: scale(0.95) translateY(-4px); transform: scale(0.95) translateY(-4px);
      opacity: 0; transition: transform 0.2s cubic-bezier(0.34,1.3,0.64,1), opacity 0.15s ease;
    }
    @media (max-width: 768px) { #${ID} .menu { width: 310px; } }

    #${ID}.open .menu {
      pointer-events: all; -webkit-transform: scale(1) translateY(0); transform: scale(1) translateY(0); opacity: 1;
    }
    #${ID}.open-up .menu {
      -webkit-transform: scale(0.95) translateY(4px); transform: scale(0.95) translateY(4px);
    }
    #${ID}.open.open-up .menu {
      -webkit-transform: scale(1) translateY(0); transform: scale(1) translateY(0);
    }

    /* ── 外壳与主题 ── */
    #${ID} .menu-shell {
      border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
      overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
      transition: background 0.3s ease;
    }
    #${ID} .bg-glass { background: rgba(15, 15, 15, 0.45); backdrop-filter: blur(16px) saturate(120%); -webkit-backdrop-filter: blur(16px) saturate(120%); }
    #${ID} .bg-dark { background: rgba(22, 22, 22, 0.95); backdrop-filter: blur(8px); }
    #${ID} .bg-blue { background: rgba(15, 22, 35, 0.95); backdrop-filter: blur(8px); }
    #${ID} .bg-green { background: rgba(18, 30, 22, 0.95); backdrop-filter: blur(8px); }

    /* ── 标题栏 ── */
    #${ID} .menu-head {
      display: flex; align-items: center; gap: 8px; padding: 12px 14px;
      background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      cursor: grab; flex-shrink: 0;
    }
    #${ID} .menu-head:active { cursor: grabbing; }
    #${ID} .menu-title {
      font-size: 13px; font-weight: bold; color: #eeeeee;
      flex: 1; letter-spacing: 0.05em; line-height: 1; margin-top: 1px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    }

    #${ID} .theme-dots { display: flex; gap: 8px; margin-right: 12px; align-items: center; }
    #${ID} .t-dot {
      width: 14px; height: 14px; border-radius: 50%; cursor: pointer;
      border: 2px solid rgba(255,255,255,0.3); transition: all 0.2s;
    }
    #${ID} .t-dot:hover { transform: scale(1.2); }
    #${ID} .t-dot.active { border-color: #fff; box-shadow: 0 0 6px #fff, inset 0 0 4px rgba(0,0,0,0.5); transform: scale(1.1); }

    #${ID} .menu-close {
      width: 22px; height: 22px; border-radius: 4px; border: none;
      background: transparent; color: rgba(255,255,255,0.5); cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 14px;
      transition: all 0.15s; padding: 0;
    }
    #${ID} .menu-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

    /* ── 列表区域 ── */
    #${ID} .menu-list {
      padding: 8px; display: flex; flex-direction: column; gap: 4px;
      overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent;
      max-height: 65vh;
    }
    #${ID} .menu-list::-webkit-scrollbar { width: 4px; }
    #${ID} .menu-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }

    /* ── 折叠面板样式 ── */
    #${ID} details { margin-bottom: 2px; }
    #${ID} summary {
      font-size: 11.5px; font-weight: bold; color: rgba(255,255,255,0.8);
      padding: 8px 10px; background: rgba(0,0,0,0.15); border-radius: 6px;
      cursor: pointer; list-style: none; user-select: none;
      display: flex; justify-content: space-between; align-items: center;
      text-transform: uppercase; letter-spacing: 0.05em; transition: background 0.2s;
    }
    #${ID} summary:hover { background: rgba(255,255,255,0.05); }
    #${ID} summary::after { content: "▼"; font-size: 9px; opacity: 0.5; transition: transform 0.2s; }
    #${ID} details[open] > summary::after { transform: rotate(180deg); }
    #${ID} .details-content { padding: 8px 0 4px 0; display: flex; flex-direction: column; gap: 6px; }

    /* ── 嵌套子菜单样式 ── */
    #${ID} .nested-details summary {
      background: rgba(255, 255, 255, 0.04);
      font-size: 10.5px;
      color: rgba(255, 255, 255, 0.65);
      padding: 6px 10px;
    }
    #${ID} .nested-details summary:hover { background: rgba(255, 255, 255, 0.08); }

    /* ── 按钮与开关 ── */
    #${ID} .sexy-group {
      margin: 0 4px; display: flex; border-radius: 6px;
      background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.06);
      height: 30px; flex-shrink: 0; overflow: hidden; box-sizing: border-box;
    }
    #${ID} .sexy-seg {
      flex: 1; display: flex; align-items: center; justify-content: center;
      cursor: pointer; position: relative; transition: background 0.15s; background: transparent;
    }
    #${ID} .sexy-seg + .sexy-seg { border-left: 1px solid rgba(255,255,255,0.05); }
    #${ID} .sexy-seg:hover { background: rgba(255,255,255,0.08); }
    #${ID} .sexy-seg-label {
      font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1; margin-top: 1px;
      transition: color 0.15s; pointer-events: none; text-align: center;
    }
    #${ID} .sexy-seg.is-on { background: rgba(96, 185, 200, 0.2); }
    #${ID} .sexy-seg.is-on .sexy-seg-label { color: #60b9c8; font-weight: bold; text-shadow: 0 0 4px rgba(0,0,0,0.8); }

    .grid-toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 0 4px; }
    .grid-toggles.col-3 { grid-template-columns: 1fr 1fr 1fr; }
    .grid-toggles.col-2 { grid-template-columns: 1fr 1fr; }

    #${ID} .menu-item-toggle {
      display: flex; align-items: center; justify-content: space-between;
      height: 28px; padding: 0 8px; border-radius: 6px; box-sizing: border-box;
      background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.06);
      cursor: pointer; transition: all 0.15s ease; margin: 0;
    }
    #${ID} .menu-item-toggle:hover { background: rgba(255,255,255,0.08); }
    #${ID} .menu-item-text {
      font-size: 11px; color: rgba(255,255,255,0.7); white-space: nowrap;
      line-height: 1; margin-top: 1px; overflow: hidden; text-overflow: ellipsis;
    }
    #${ID} .toggle-led {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: rgba(255,255,255,0.15);
      transition: all 0.2s ease; border: 1px solid rgba(0,0,0,0.5); margin-left: 4px;
    }

    #${ID} .menu-item-toggle.is-on { background: rgba(96, 185, 200, 0.15); border-color: rgba(96, 185, 200, 0.4); }
    #${ID} .menu-item-toggle.is-on .menu-item-text { color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
    #${ID} .menu-item-toggle.is-on .toggle-led { background: #60b9c8; box-shadow: 0 0 6px #60b9c8; border-color: transparent; }

    #${ID} .btn-full { grid-column: 1 / -1; justify-content: center; background: rgba(232, 176, 114, 0.05); gap: 6px; border-color: rgba(232, 176, 114, 0.2); }
    #${ID} .btn-full .menu-item-text { font-size: 12px; font-weight: bold; color: #e8b072; margin-top: 0; }
    #${ID} .btn-full.is-on { background: rgba(232, 176, 114, 0.2); border-color: rgba(232, 176, 114, 0.5); }
    #${ID} .btn-full.is-on .menu-item-text { color: #ffd6a5; }
    #${ID} .btn-full.is-on .toggle-led { background: #e8b072; box-shadow: 0 0 6px #e8b072; border-color: transparent;}

    /* 底部区域及署名特效 */
    #${ID} .menu-foot {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 14px; font-size: 11px; color: rgba(255,255,255,0.4);
      background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255, 255, 255, 0.05); flex-shrink: 0;
    }
    #${ID} .fox-link {
      cursor: pointer; color: #60b9c8; font-weight: bold; letter-spacing: 0.5px;
      transition: all 0.3s cubic-bezier(0.34,1.56,0.64,1); font-size: 11px;
    }
    #${ID} .fox-link:hover {
      color: #e8b072; text-shadow: 0 0 8px rgba(232, 176, 114, 0.8); transform: scale(1.08);
    }

    @keyframes orb-in { from { opacity:0; transform: scale(0.5); } to { opacity:1; transform: scale(1); } }
    #${ID} { animation: orb-in 0.2s cubic-bezier(0.34,1.3,0.64,1) both; }
  `;
    pdoc.head.appendChild(style);

    // ── DOM 渲染 ────────────────────────────────────────────────
    const root = pdoc.createElement("div");
    root.id = ID;
    root.style.left = `${pos.x}px`;
    root.style.top = `${pos.y}px`;

    root.innerHTML = `
    <div class="orb" id="${ID}-orb">
      <svg class="orb-icon" viewBox="0 0 24 24" width="28" height="28">
        <defs>
          <linearGradient id="${ID}-grad" x1="10%" y1="10%" x2="90%" y2="90%">
            <stop offset="35%" stop-color="#e8b072" />
            <stop offset="65%" stop-color="#60b9c8" />
          </linearGradient>
        </defs>
        <path fill="url(#${ID}-grad)" d="M12 1L14.8 9.2L23 12L14.8 14.8L12 23L9.2 14.8L1 12L9.2 9.2Z" />
      </svg>
    </div>

    <div class="menu" id="${ID}-menu">
      <div class="menu-shell ${currentTheme}" id="${ID}-shell">
        <div class="menu-head" id="${ID}-head">
          <svg class="menu-gem-svg" viewBox="0 0 24 24" width="14" height="14">
            <path fill="url(#${ID}-grad)" d="M12 1L14.8 9.2L23 12L14.8 14.8L12 23L9.2 14.8L1 12L9.2 9.2Z" />
          </svg>
          <div class="menu-title">双人成行 V5 DS版</div>
          <div class="theme-dots">
            <div class="t-dot ${currentTheme === "bg-glass" ? "active" : ""}" data-theme="bg-glass" style="background:#555;" title="毛玻璃"></div>
            <div class="t-dot ${currentTheme === "bg-dark" ? "active" : ""}" data-theme="bg-dark" style="background:#222;" title="极夜黑"></div>
            <div class="t-dot ${currentTheme === "bg-blue" ? "active" : ""}" data-theme="bg-blue" style="background:#0f1623;" title="深海蓝"></div>
            <div class="t-dot ${currentTheme === "bg-green" ? "active" : ""}" data-theme="bg-green" style="background:#1b2a20;" title="护眼绿"></div>
          </div>
          <button class="menu-close" id="${ID}-close">✕</button>
        </div>

        <div class="menu-list">

          <details open>
            <summary>选择核心驱动模型</summary>
            <div class="details-content">
              <div class="sexy-group">
                <div class="sexy-seg hk-on" id="${ID}-cot-gemini"><div class="sexy-seg-label">哈基米</div></div>
                <div class="sexy-seg" id="${ID}-cot-glm"><div class="sexy-seg-label">GLM模式</div></div>
                <div class="sexy-seg" id="${ID}-cot-claude"><div class="sexy-seg-label">克4.6</div></div>
                <div class="sexy-seg" id="${ID}-cot-c45s"><div class="sexy-seg-label">克4.5s</div></div>
                <div class="sexy-seg" id="${ID}-cot-deepseek"><div class="sexy-seg-label">DeepSeek</div></div>
              </div>
            </div>
          </details>

          <details>
            <summary>人称与话语权调度 (单选)</summary>
            <div class="details-content">
              <div class="grid-toggles col-3" style="margin-bottom: 4px;">
                <div class="menu-item-toggle toggle-btn" data-kw="🕐第一人称" data-group="person"><div class="menu-item-text">第一人称</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🕑第二人称" data-group="person"><div class="menu-item-text">第二人称</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🕒第三人称" data-group="person"><div class="menu-item-text">第三人称</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🕒<char>第三人称" data-group="person"><div class="menu-item-text">&lt;char&gt;第三</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🕒非 <user> 视角" data-group="person"><div class="menu-item-text">非User视角</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🕒群像视角" data-group="person"><div class="menu-item-text">群像视角</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw=" 👑上帝模式" data-group="person"><div class="menu-item-text">上帝模式</div><div class="toggle-led"></div></div>
              </div>
              <div class="grid-toggles col-3" style="margin-top: 6px;">
                <div class="menu-item-toggle toggle-btn" data-kw="😲user全是话" data-group="user-talk"><div class="menu-item-text">全是话</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🤐user不说话" data-group="user-talk"><div class="menu-item-text">不说话</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😏user的嘴替" data-group="user-talk"><div class="menu-item-text">User嘴替</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗨增加对白"><div class="menu-item-text">增加对话</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗨增加NPC对白"><div class="menu-item-text">增NPC对话</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🎫// COT //User去中心化"><div class="menu-item-text">去中心化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="👤user基准性格"><div class="menu-item-text">User基准性格</div><div class="toggle-led"></div></div>
              </div>
            </div>
          </details>

          <details>
            <summary>🎭 情感基调 (单选)</summary>
            <div class="details-content">
              <div class="grid-toggles col-2">
                <div class="menu-item-toggle toggle-btn" data-kw="●积极" data-group="emotion"><div class="menu-item-text">● 积极</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="●治愈" data-group="emotion"><div class="menu-item-text">● 治愈</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="●消极" data-group="emotion"><div class="menu-item-text">● 消极</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="●伤感" data-group="emotion"><div class="menu-item-text">● 伤感</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="●基调为空" data-group="emotion"><div class="menu-item-text">● 基调为空</div><div class="toggle-led"></div></div>
              </div>
            </div>
          </details>

          <details open>
            <summary>📚 特色文风滤镜库 (单选)</summary>
            <div class="details-content" style="padding-left: 6px; border-left: 1px dashed rgba(255,255,255,0.1); margin-left: 6px;">

              <details class="nested-details">
                <summary>⤵️ 轻松温馨向</summary>
                <div class="details-content">
                  <div class="grid-toggles col-2">
                    <div class="menu-item-toggle toggle-btn" data-kw="烤面包机@电波系" data-group="style"><div class="menu-item-text">烤面包机</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="流转心跳叙事@四神花ル水" data-group="style"><div class="menu-item-text">流转心跳</div><div class="toggle-led"></div></div>
                  </div>
                </div>
              </details>

              <details class="nested-details">
                <summary>⤵️ 情绪表达向</summary>
                <div class="details-content">
                  <div class="grid-toggles col-2">
                    <div class="menu-item-toggle toggle-btn" data-kw="旧录像带质感[TEST]" data-group="style"><div class="menu-item-text">旧录像带</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="冷冽与梦核" data-group="style"><div class="menu-item-text">冷冽梦核</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="细腻情感@四神花ル水" data-group="style"><div class="menu-item-text">细腻情感</div><div class="toggle-led"></div></div>
                  </div>
                </div>
              </details>

              <details class="nested-details">
                <summary>⤵️ 神秘高压向</summary>
                <div class="details-content">
                  <div class="grid-toggles col-2">
                    <div class="menu-item-toggle toggle-btn" data-kw="显性高压" data-group="style"><div class="menu-item-text">显性高压</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="深渊童谣[TEST]" data-group="style"><div class="menu-item-text">深渊童谣</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="后311@natami" data-group="style"><div class="menu-item-text">后311</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="魔幻现实" data-group="style"><div class="menu-item-text">魔幻现实</div><div class="toggle-led"></div></div>
                  </div>
                </div>
              </details>

              <details class="nested-details">
                <summary>⤵️ 小说故事向</summary>
                <div class="details-content">
                  <div class="grid-toggles col-2">
                    <div class="menu-item-toggle toggle-btn" data-kw="群像文风" data-group="style"><div class="menu-item-text">群像文风</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="西方魔幻" data-group="style"><div class="menu-item-text">西方魔幻</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="写实西幻" data-group="style"><div class="menu-item-text">写实西幻</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="辰东网文" data-group="style"><div class="menu-item-text">辰东网文</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="成人童话" data-group="style"><div class="menu-item-text">成人童话</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="🔖N-轻小说" data-group="style"><div class="menu-item-text">N-轻小说</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="🌸N-恋爱" data-group="style"><div class="menu-item-text">N-恋爱</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="散文" data-group="style"><div class="menu-item-text">散文小说</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="散文小说（测试 使用者多反馈）" data-group="style"><div class="menu-item-text">散文(测)</div><div class="toggle-led"></div></div>
                  </div>
                </div>
              </details>

              <details class="nested-details">
                <summary>⤵️ 古风</summary>
                <div class="details-content">
                  <div class="grid-toggles col-2">
                    <div class="menu-item-toggle toggle-btn" data-kw="四字为锋" data-group="style"><div class="menu-item-text">四字为锋</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="红楼一梦@四神花ル水" data-group="style"><div class="menu-item-text">红楼一梦</div><div class="toggle-led"></div></div>
                  </div>
                </div>
              </details>

              <details class="nested-details">
                <summary>⤵️ NSFW向</summary>
                <div class="details-content">
                  <div class="grid-toggles col-2">
                    <div class="menu-item-toggle toggle-btn" data-kw="🔞黄文@Lime" data-group="style"><div class="menu-item-text">🔞黄文</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="🔞N-黄文（纯爱）@Lime" data-group="style"><div class="menu-item-text">🔞纯爱H</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="🎧日系ASMR" data-group="style"><div class="menu-item-text">日系ASMR</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="反差（男孩）" data-group="style"><div class="menu-item-text">反差男孩</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="反差色情" data-group="style"><div class="menu-item-text">反差色情</div><div class="toggle-led"></div></div>
                  </div>
                </div>
              </details>

              <details class="nested-details">
                <summary>🔄 特殊向</summary>
                <div class="details-content">
                  <div class="grid-toggles col-2">
                    <div class="menu-item-toggle toggle-btn" data-kw="🍡Galgame" data-group="style"><div class="menu-item-text">Galgame</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="💬聊天（关闭人称）" data-group="style"><div class="menu-item-text">聊天风格</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="瞎勾八写吧你就（杀™八股）" data-group="style"><div class="menu-item-text">瞎写杀八股</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="自适应文风@小回" data-group="style"><div class="menu-item-text">自适应文风</div><div class="toggle-led"></div></div>
                  </div>
                </div>
              </details>

            </div>
          </details>

          <details>
            <summary>🔨 自定义扩展区</summary>
            <div class="details-content" style="padding-left: 6px; border-left: 1px dashed rgba(255,255,255,0.1); margin-left: 6px;">
              <div class="grid-toggles col-3">
                <div class="menu-item-toggle toggle-btn" data-kw="✒自定义文风" data-group="style" data-edit="true"><div class="menu-item-text">自定文风1</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="✒自定义文风2" data-group="style" data-edit="true"><div class="menu-item-text">自定文风2</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="💿自定义格式" data-edit="true"><div class="menu-item-text">自定格式</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🕒自定义视角" data-group="person" data-edit="true"><div class="menu-item-text">自定视角</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😀自定义user选项" data-group="user-talk" data-edit="true"><div class="menu-item-text">自定User</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎自定义杀什么" data-edit="true"><div class="menu-item-text">自定杀什么</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="✒自定义思维链" data-edit="true"><div class="menu-item-text">自定思维链</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="💬字数设定" data-edit="true" data-group="word_count"><div class="menu-item-text">字数设定</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="💬无字数需求" data-group="word_count"><div class="menu-item-text">字数无限制</div><div class="toggle-led"></div></div>
              </div>
            </div>
          </details>

          <details>
            <summary>杀八股 (修辞抑制与净化)</summary>
            <div class="details-content">
              <div class="grid-toggles col-3">
                <div class="menu-item-toggle toggle-btn" data-kw="❎杀比拟"><div class="menu-item-text">杀比拟</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎杀说明"><div class="menu-item-text">杀说明</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎白描"><div class="menu-item-text">纯白描</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎杀揭示"><div class="menu-item-text">杀揭示</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎杀声述"><div class="menu-item-text">杀声述</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎微观与宏观"><div class="menu-item-text">禁极端感知</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎情绪化通感"><div class="menu-item-text">禁躯体隐喻</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎占有与支配"><div class="menu-item-text">禁支配词汇</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗反科幻"><div class="menu-item-text">反科幻</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🧷禁用词表（测试）"><div class="menu-item-text">禁用词表</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🧷克劳德禁词表（测试）"><div class="menu-item-text">克劳德禁词</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🔓抗空回"><div class="menu-item-text">抗空回</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎杀转折词"><div class="menu-item-text">杀转折词</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎杀超雄"><div class="menu-item-text">杀超雄</div><div class="toggle-led"></div></div>
              </div>
            </div>
          </details>

          <details>
            <summary>NSFW 局部特化</summary>
            <div class="details-content">
              <div class="grid-toggles col-3">
                <div class="menu-item-toggle toggle-btn" data-kw="✅启用特化"><div class="menu-item-text">启用特化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🐬足部特化"><div class="menu-item-text">足部特化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🐬腿部特化"><div class="menu-item-text">腿部特化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🐬胸部特化"><div class="menu-item-text">胸部特化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🐬臀部特化"><div class="menu-item-text">臀部特化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🐬性器特化"><div class="menu-item-text">性器特化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🐬脸部特化"><div class="menu-item-text">脸部特化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🐬反差特化"><div class="menu-item-text">反差特化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🥵官能凝视（色）@KKM"><div class="menu-item-text">官能凝视</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗反发情"><div class="menu-item-text">防发情</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🔣语气符号"><div class="menu-item-text">语气符号</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗反回避色色@Qiheng"><div class="menu-item-text">反回避色色</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🔞nsfw必开"><div class="menu-item-text">NSFW必开</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🔞sex_guide"><div class="menu-item-text">Sex Guide</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🔞用词要求"><div class="menu-item-text">用词要求</div><div class="toggle-led"></div></div>
              </div>
            </div>
          </details>

          <details>
            <summary>底层规则与推演逻辑</summary>
            <div class="details-content">
              <div class="grid-toggles col-2">
                <div class="menu-item-toggle toggle-btn" data-kw="⚠️防复述" data-group="push"><div class="menu-item-text">防复述</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="⚠️扩写/加强复述" data-group="push"><div class="menu-item-text">扩写复述</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="⚠️扩写后推进" data-group="push"><div class="menu-item-text">扩写后推</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="⚠️只复述" data-group="push"><div class="menu-item-text">只复述</div><div class="toggle-led"></div></div>
              </div>
              <div class="grid-toggles col-3">
                <div class="menu-item-toggle toggle-btn" data-kw="❗反转述只续写"><div class="menu-item-text">反转述续写</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗无对话"><div class="menu-item-text">无对话</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="💥抢话提醒"><div class="menu-item-text">抢话提醒</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="⁉️// COT //反抢话"><div class="menu-item-text">CoT反抢话</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎抗抢话Beta"><div class="menu-item-text">抗抢话Beta</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗反固定"><div class="menu-item-text">反固定</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="♻️防打断" data-group="hook"><div class="menu-item-text">防打断</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="♻️防打断（新）" data-group="hook"><div class="menu-item-text">防打断（新）</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗反全知"><div class="menu-item-text">反全知</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😭// COT //反极端"><div class="menu-item-text">CoT反极端</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗抗绝望"><div class="menu-item-text">抗绝望</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎抗绝望Beta"><div class="menu-item-text">抗绝望Beta</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎反神化"><div class="menu-item-text">反神化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🎬// COT //Char主动"><div class="menu-item-text">Char主动</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🎭// COT //NPC引入"><div class="menu-item-text">NPC主动</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="♾️物理规则"><div class="menu-item-text">物理规则</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🧱多渠道破限增强"><div class="menu-item-text">多渠道破限</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗺️真实世界"><div class="menu-item-text">真实世界</div><div class="toggle-led"></div></div>
              </div>

              <details class="nested-details" style="margin-top: 6px;">
                <summary>㊙️ 心理透视 (内心活动)</summary>
                <div class="details-content">
                  <div class="grid-toggles col-2">
                    <div class="menu-item-toggle toggle-btn" data-kw="✅启用内心独白"><div class="menu-item-text">启用内心话</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="🔢内心话要求"><div class="menu-item-text">格式规范</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="🗣️用户角色"><div class="menu-item-text">User内心</div><div class="toggle-led"></div></div>
                    <div class="menu-item-toggle toggle-btn" data-kw="👤其他角色"><div class="menu-item-text">NPC内心</div><div class="toggle-led"></div></div>
                  </div>
                </div>
              </details>

            </div>
          </details>

          <details>
            <summary>角色质感塑造 (RSD)</summary>
            <div class="details-content">
              <div class="grid-toggles col-2">
                <div class="menu-item-toggle toggle-btn" data-kw="📊事实增强@pigment"><div class="menu-item-text">事实增强</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😀人格补充"><div class="menu-item-text">人格补充</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😀人格补充（测试版）"><div class="menu-item-text">人格补充(测)</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😼哈基米抑制器@翎"><div class="menu-item-text">哈基米抑制器</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😕克—详略得当" data-group="anti_verbose"><div class="menu-item-text">克—详略得当</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😕克—详略得当（测试版）" data-group="anti_verbose"><div class="menu-item-text">详略得当(测)</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😋同人增强@pigment"><div class="menu-item-text">同人增强</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❎抗过拟合Beta"><div class="menu-item-text">抗过拟合</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🍉生动化Beta"><div class="menu-item-text">生动化Beta</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗡草稿"><div class="menu-item-text">草稿</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗡深度"><div class="menu-item-text">深度写作</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗡叙事"><div class="menu-item-text">叙事优化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗡写作优化"><div class="menu-item-text">写作优化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🩹外表美化"><div class="menu-item-text">美型化(美颜)</div><div class="toggle-led"></div></div>
              </div>
            </div>
          </details>

          <details>
            <summary>思维链 (CoT) 增强节点</summary>
            <div class="details-content">
              <div class="grid-toggles col-3">
                <div class="menu-item-toggle toggle-btn" data-kw="—\\✨思考模式（简）" data-group="gemini-cot"><div class="menu-item-text">思考模式(简)</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="—\\✨思考模式（繁）" data-group="gemini-cot"><div class="menu-item-text">思考模式(繁)</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="—\\✨自由CoT"><div class="menu-item-text">自由CoT</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🔁// COT //防重复"><div class="menu-item-text">CoT防重复</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="📚// COT //世界书增强"><div class="menu-item-text">世界书增强</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗰强化思考@leyangzhoumichael0421"><div class="menu-item-text">强化思考</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🚫卡COT"><div class="menu-item-text">卡COT</div><div class="toggle-led"></div></div>
              </div>
              <div class="grid-toggles col-2" style="margin-top: 4px;">
                <div class="menu-item-toggle toggle-btn" data-kw="✍️// COT //生动化"><div class="menu-item-text">CoT生动化</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🚒// COT //推剧情"><div class="menu-item-text">CoT推剧情</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🥒// COT //色情要求"><div class="menu-item-text">CoT色情要求</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🍆// COT //性爱事件判断"><div class="menu-item-text">性爱事件判断</div><div class="toggle-led"></div></div>
              </div>
            </div>
          </details>

          <details>
            <summary>组件渲染与特殊交互</summary>
            <div class="details-content">
              <div class="grid-toggles col-3">
                <div class="menu-item-toggle toggle-btn" data-kw="💯变量更新（没变量别开）"><div class="menu-item-text">变量更新</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="📝伏笔（需打开摘要）"><div class="menu-item-text">记录伏笔</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="📝摘要"><div class="menu-item-text">生成摘要</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="♿️快捷回复"><div class="menu-item-text">快捷回复</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="😱IF剧情线"><div class="menu-item-text">IF剧情线</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🗯 双语对白"><div class="menu-item-text">双语对白</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="💬无字数需求"><div class="menu-item-text">无字数限制</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="💬字数加强@陆子慕"><div class="menu-item-text">字数加强</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗️打破第四面墙" data-group="meta"><div class="menu-item-text">第四面墙</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="❗️色情吐槽" data-group="meta"><div class="menu-item-text">色情吐槽</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="📅日期卡片"><div class="menu-item-text">日期卡片</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="☂️通用防掉格式"><div class="menu-item-text">防掉格式</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🔓抗截断"><div class="menu-item-text">抗截断(高数)</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🖥️视觉交互（复杂前端）@pigment"><div class="menu-item-text">视觉交互</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🖥️前端交互（PC端）@pigment"><div class="menu-item-text">前端交互(PC)</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🖥️前端交互（手机端）@pigment"><div class="menu-item-text">前端交互(手机)</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🧷格式要求"><div class="menu-item-text">全文格式要求</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="🎼音乐播放器@小夜"><div class="menu-item-text">音乐播放器</div><div class="toggle-led"></div></div>
                <div class="menu-item-toggle toggle-btn" data-kw="📶加强世界书阅读" style="display:none;"><div class="menu-item-text">隐形的世界书开关</div><div class="toggle-led"></div></div>
              </div>
              <div class="grid-toggles col-2" style="margin-top: 4px;">
                <div class="menu-item-toggle toggle-btn btn-full" data-kw="🤬AI对话（对线哈基米）" data-group="special-mode">
                  <div class="menu-item-text">AI对话 (哈基米)</div><div class="toggle-led"></div>
                </div>
                <div class="menu-item-toggle toggle-btn btn-full" data-kw="👊拷打（拷打克劳德）" data-group="special-mode">
                  <div class="menu-item-text">拷打模式 (小克)</div><div class="toggle-led"></div>
                </div>
              </div>
              <div class="grid-toggles" style="grid-template-columns: 1fr; margin-top: 6px;">
                <div class="menu-item-toggle toggle-btn btn-full" data-kw="💥大总结模式" data-group="special-mode">
                  <div class="menu-item-text">💥 大总结模式</div><div class="toggle-led"></div>
                </div>
              </div>
            </div>
          </details>

        </div>
        <div class="menu-foot">
          <span style="opacity: 0.5;">ATRI & DEACH V5 DS</span>
          <span class="fox-link" id="${ID}-fox-btn">[ ᴘʀɪsᴍ//ғᴏx ]</span>
        </div>
      </div>
    </div>
  `;

    (pdoc.documentElement || pdoc.body).appendChild(root);

    // ── 基础交互 ──────────────────────────────────────────────
    const orb = pdoc.getElementById(`${ID}-orb`);
    const head = pdoc.getElementById(`${ID}-head`);
    const btnClose = pdoc.getElementById(`${ID}-close`);
    const menu = pdoc.getElementById(`${ID}-menu`);
    const shell = pdoc.getElementById(`${ID}-shell`);
    const foxBtn = pdoc.getElementById(`${ID}-fox-btn`);
    let isOpen = false;

    if (foxBtn) {
      foxBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toastr.info("模块挂载成功，双人成行 V5 DS版", "💬 ᴘʀɪsᴍ//ғᴏx");
      });
    }

    // ── Tavern Helper 核心控制函数 ──
    function isPromptEnabled(li) {
      return !li.classList.contains("completion_prompt_manager_prompt_disabled");
    }
    function clickToggle(li) {
      const btn = li.querySelector(".prompt-manager-toggle-action");
      if (btn) btn.click();
    }

    function findByKeyword(keyword) {
      const list = pdoc.querySelector("#completion_prompt_manager_list");
      if (!list) return [];
      return Array.from(list.querySelectorAll("li[data-pm-identifier]")).filter((li) => {
        const name = li.querySelector("[data-pm-name]")?.getAttribute?.("data-pm-name") ?? "";
        return name.trim() === keyword.trim();
      });
    }

    function ensureOn(keyword) {
      let lock = false;
      findByKeyword(keyword).forEach((li) => {
        if (!isPromptEnabled(li)) clickToggle(li);
        if (lock) return;
        li.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
        lock = true;
      });
    }
    function openEditModal(keyword) {
      const li = findByKeyword(keyword)[0];
      if (li) {
        li.querySelector(".prompt-manager-edit-action").click();
      }
    }
    function ensureOff(keyword) {
      findByKeyword(keyword).forEach((li) => {
        if (isPromptEnabled(li)) clickToggle(li);
      });
    }

    // 同步按钮和底层状态
    function syncToggle(targetKw, state) {
      if (state) ensureOn(targetKw);
      else ensureOff(targetKw);
      const btnEl = pdoc.querySelector(`.toggle-btn[data-kw="${targetKw}"]`);
      if (btnEl) btnEl.classList.toggle("is-on", state);
    }

    // 保存坐标及当前模型等状态到全局变量
    function savePos() {
      try {
        insertOrAssignVariables(
          {
            orbV5_prismfox_pos: JSON.stringify({
              x: parseInt(root.style.left, 10),
              y: parseInt(root.style.top, 10),
              theme: currentTheme,
              model: savedModel,
            }),
          },
          { type: "global" },
        );
      } catch (_) {}
    }

    // ── 核心驱动模型管理 (四大模式精准互斥与分配) ──
    const ALL_MODEL_PROMPTS = [
      "✨ Gemini",
      "✨Gemini✨",
      "🎨 Claude",
      "🎨Claude🎨",
      "—\\✨思考模式（简）",
      "—\\✨思考模式（繁）",
      "—\\✨自由CoT",
      "—\\🎐思考模式",
      "—\\✴️思考模式",
      "✳️GLM Core",
      "🛑Core",
    ];

    function setModel(type) {
      if (!pdoc.querySelector("#completion_prompt_manager_list")) {
        toastr.warning("请先打开预设面板");
        return;
      }

      // 更新并保存当前激活的模型名
      savedModel = type;
      savePos();

      // 是否保留已选的“繁”
      const useFan = isKeywordOn("—\\✨思考模式（繁）");

      const turnOn = [];
      let corePrompt = "🛑Core";

      if (type === "gemini") {
        turnOn.push("✨Gemini✨", "✨ Gemini");
        turnOn.push(useFan ? "—\\✨思考模式（繁）" : "—\\✨思考模式（简）");
      } else if (type === "glm") {
        // GLM 专属结构配置
        turnOn.push("✨Gemini✨", "—\\✴️思考模式");
        corePrompt = "✳️GLM Core";
      } else if (type === "claude") {
        // 克4.6
        turnOn.push("🎨Claude🎨", "🎨 Claude", "—\\🎐思考模式");
      } else if (type === "c45s") {
        turnOn.push("🎨Claude🎨", "✨ Gemini", "—\\🎐思考模式");
      } else if (type === "deepseek") {
        turnOn.push("✨Gemini✨", "✨ Gemini", "—\\🎐思考模式");
      }

      turnOn.push(corePrompt);

      // 绝对清除不相关的核心选项，然后开启对应的
      ALL_MODEL_PROMPTS.forEach((kw) => {
        if (turnOn.includes(kw)) ensureOn(kw);
        else ensureOff(kw);
      });

      // 刷新 UI 指示灯
      const ids = {
        gemini: `${ID}-cot-gemini`,
        glm: `${ID}-cot-glm`,
        claude: `${ID}-cot-claude`,
        c45s: `${ID}-cot-c45s`,
        deepseek: `${ID}-cot-deepseek`,
      };
      Object.values(ids).forEach((id) => {
        pdoc.getElementById(id)?.classList.remove("is-on");
      });
      pdoc.getElementById(ids[type])?.classList.add("is-on");

      toastr.success(`已切换模型模式: ${type.toUpperCase()}`);
    }

    pdoc.getElementById(`${ID}-cot-gemini`)?.addEventListener("click", () => setModel("gemini"));
    pdoc.getElementById(`${ID}-cot-glm`)?.addEventListener("click", () => setModel("glm"));
    pdoc.getElementById(`${ID}-cot-claude`)?.addEventListener("click", () => setModel("claude"));
    pdoc.getElementById(`${ID}-cot-c45s`)?.addEventListener("click", () => setModel("c45s"));
    pdoc.getElementById(`${ID}-cot-deepseek`)?.addEventListener("click", () => setModel("deepseek"));

    // ── 主题切换逻辑 ──
    pdoc.querySelectorAll(".t-dot").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        const theme = dot.getAttribute("data-theme");
        shell.className = `menu-shell ${theme}`;
        pdoc.querySelectorAll(".t-dot").forEach((d) => {
          d.classList.remove("active");
        });
        dot.classList.add("active");
        currentTheme = theme;
        savePos();
      });
    });

    // ── 单选及开关核心逻辑 ──
    let previousCotState = [];
    const cotKws = ["—\\✨思考模式（简）", "—\\✨思考模式（繁）", "—\\✨自由CoT", "—\\🎐思考模式"];

    pdoc.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!pdoc.querySelector("#completion_prompt_manager_list")) {
          toastr.warning("请先打开预设面板");
          return;
        }

        const kw = btn.getAttribute("data-kw");
        const groupName = btn.getAttribute("data-group");
        const isEdit = btn.getAttribute("data-edit") === "true";
        const isOn = btn.classList.contains("is-on");

        if (isOn) {
          // --- 正在关闭该选项 ---
          ensureOff(kw);
          btn.classList.remove("is-on");

          // 双向联动：世界书
          if (kw === "📶加强世界书阅读") syncToggle("📚// COT //世界书增强", false);
          if (kw === "📚// COT //世界书增强") syncToggle("📶加强世界书阅读", false);

          // 关闭拷打模式 -> 恢复小克的思考模式
          if (kw === "👊拷打（拷打克劳德）") {
            syncToggle("—\\🎐思考模式", true);
          }

          // 关闭大总结 -> 恢复记录的思考模式
          if (kw === "💥大总结模式") {
            previousCotState.forEach((ckw) => {
              syncToggle(ckw, true);
            });
            previousCotState = []; // 清空记忆
            toastr.info("已退出大总结模式，恢复思考模块");
          }
        } else {
          // --- 正在开启该选项 ---

          // 如果存在分组 (互斥单选)
          if (groupName) {
            pdoc.querySelectorAll(`.toggle-btn[data-group="${groupName}"]`).forEach((otherBtn) => {
              if (otherBtn !== btn && otherBtn.classList.contains("is-on")) {
                const otherKw = otherBtn.getAttribute("data-kw");
                ensureOff(otherKw);
                otherBtn.classList.remove("is-on");

                // 处理被动关闭带来的副作用
                if (otherKw === "💥大总结模式") {
                  previousCotState.forEach((ckw) => {
                    syncToggle(ckw, true);
                  });
                  previousCotState = [];
                }
                if (otherKw === "👊拷打（拷打克劳德）") {
                  syncToggle("—\\🎐思考模式", true);
                }
              }
            });

            // 特殊对线模式切换底层模型
            if (groupName === "special-mode") {
              if (kw === "🤬AI对话（对线哈基米）") setModel("gemini");
              else if (kw === "👊拷打（拷打克劳德）") setModel("claude");
            }
          }

          ensureOn(kw);
          if (isEdit) {
            openEditModal(kw);
          }
          btn.classList.add("is-on");

          // 双向联动：世界书
          if (kw === "📶加强世界书阅读") syncToggle("📚// COT //世界书增强", true);
          if (kw === "📚// COT //世界书增强") syncToggle("📶加强世界书阅读", true);

          // 开启拷打模式 -> 关闭小克思考模式
          if (kw === "👊拷打（拷打克劳德）") {
            syncToggle("—\\🎐思考模式", false);
          }

          // 开启大总结模式 -> 自动记忆并关闭所有思考模式
          if (kw === "💥大总结模式") {
            // 筛选出当前真正处于开启状态的思考模式
            previousCotState = cotKws.filter((ckw) => isKeywordOn(ckw));
            cotKws.forEach((ckw) => {
              syncToggle(ckw, false);
            });
            toastr.info("已进入大总结模式，自动关闭思考模块");
          }
        }
      });
    });

    // ── 初始化状态检测 ──
    function isKeywordOn(keyword) {
      const items = findByKeyword(keyword);
      return items.length > 0 && items.every((li) => isPromptEnabled(li));
    }

    function initDetectState() {
      if (!pdoc.querySelector("#completion_prompt_manager_list")) return;

      const on = (kw) => isKeywordOn(kw);

      let currentModel = null;

      // 精准反推模型特征
      if (on("🎨Claude🎨") && on("✨ Gemini") && on("—\\🎐思考模式")) {
        currentModel = "c45s";
      } else if (on("✨Gemini✨") && on("✨ Gemini") && on("—\\🎐思考模式")) {
        currentModel = "deepseek";
      } else if (on("🎨Claude🎨") && on("🎨 Claude") && on("—\\🎐思考模式")) {
        currentModel = "claude";
      } else if (on("—\\✴️思考模式") && on("✨Gemini✨")) {
        currentModel = "glm";
      } else if (
        on("✨Gemini✨") &&
        on("✨ Gemini") &&
        (on("—\\✨思考模式（简）") || on("—\\✨思考模式（繁）") || on("—\\✨自由CoT"))
      ) {
        // 如果特征判定是 Gemini 结构，且之前保存在全局变量里的是 glm，则恢复 glm 的高亮状态
        currentModel = savedModel === "glm" ? "glm" : "gemini";
      }

      if (currentModel) {
        const ids = {
          gemini: `${ID}-cot-gemini`,
          glm: `${ID}-cot-glm`,
          claude: `${ID}-cot-claude`,
          c45s: `${ID}-cot-c45s`,
          deepseek: `${ID}-cot-deepseek`,
        };
        Object.values(ids).forEach((id) => {
          pdoc.getElementById(id)?.classList.remove("is-on");
        });
        pdoc.getElementById(ids[currentModel])?.classList.add("is-on");
        savedModel = currentModel;
      }

      // 常规按钮同步检测
      pdoc.querySelectorAll(".toggle-btn").forEach((btn) => {
        btn.classList.toggle("is-on", isKeywordOn(btn.getAttribute("data-kw")));
      });
    }

    // ── 原生 UI 操作的反向同步 (绝对可靠版 MutationObserver) ──
    const reverseSyncObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const m of mutations) {
        if (
          m.type === "attributes" &&
          m.attributeName === "class" &&
          m.target.tagName === "LI" &&
          m.target.hasAttribute("data-pm-identifier")
        ) {
          shouldUpdate = true;
          break;
        }
        if (m.type === "childList" && m.target.id === "completion_prompt_manager_list") {
          shouldUpdate = true;
          break;
        }
      }
      if (shouldUpdate) {
        clearTimeout(pwin._orbSyncTimer);
        pwin._orbSyncTimer = setTimeout(initDetectState, 80);
      }
    });

    function attachReverseObserver() {
      const list = pdoc.getElementById("completion_prompt_manager_list");
      if (list && !list.dataset.orbObserved) {
        reverseSyncObserver.observe(list, { attributes: true, subtree: true, childList: true, attributeFilter: ["class"] });
        list.dataset.orbObserved = "true";
      }
    }

    // 捕获阶段拦截，应对ST可能的事件阻断和DOM重绘
    pdoc.addEventListener(
      "click",
      (e) => {
        attachReverseObserver();
        if (e.target.closest("#completion_prompt_manager_list") || e.target.closest(".drawer-content")) {
          clearTimeout(pwin._orbSyncTimer);
          pwin._orbSyncTimer = setTimeout(initDetectState, 150);
        }
      },
      true,
    );

    pdoc.addEventListener(
      "change",
      (e) => {
        if (e.target.closest(".drawer-content") || e.target.tagName === "SELECT") {
          clearTimeout(pwin._orbSyncTimer);
          pwin._orbSyncTimer = setTimeout(() => {
            attachReverseObserver();
            initDetectState();
          }, 400);
        }
      },
      true,
    );

    let initDone = false;
    function tryInitDetect() {
      if (initDone) return;
      if (pdoc.querySelector("#completion_prompt_manager_list")) {
        initDone = true;
        initDetectState();
        attachReverseObserver(); // 初始挂载监听
      }
    }
    // 给点加载缓冲时间
    setTimeout(tryInitDetect, 1200);
    setTimeout(tryInitDetect, 2500);

    // ── UI 位置展开逻辑 ──
    function updateMenuDirection() {
      const orbX = parseInt(root.style.left, 10) || 0;
      const orbY = parseInt(root.style.top, 10) || 0;
      const menuH = 480;
      if (orbX < pwin.innerWidth / 2) {
        menu.style.left = "0";
        menu.style.right = "auto";
      } else {
        menu.style.left = "auto";
        menu.style.right = "0";
      }
      const spaceBelow = pwin.innerHeight - orbY - 60;
      if (spaceBelow < menuH && orbY > menuH / 2) {
        menu.style.top = "auto";
        menu.style.bottom = "52px";
        root.classList.add("open-up");
        menu.style.transformOrigin = orbX < pwin.innerWidth / 2 ? "bottom left" : "bottom right";
      } else {
        menu.style.top = "52px";
        menu.style.bottom = "auto";
        root.classList.remove("open-up");
        menu.style.transformOrigin = orbX < pwin.innerWidth / 2 ? "top left" : "top right";
      }
    }

    function toggle() {
      isOpen = !isOpen;
      if (isOpen) {
        updateMenuDirection();
        initDetectState();
        attachReverseObserver();
      } else {
        root.classList.remove("open-up");
      }
      root.classList.toggle("open", isOpen);
    }
    function close() {
      isOpen = true;
      toggle();
    }

    btnClose.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
    });

    let drag = false,
      ox = 0,
      oy = 0,
      moved = false,
      dragMask = null;
    function createMask() {
      dragMask = parent.document.createElement("div");
      dragMask.style.cssText = "position:fixed;inset:0;z-index:2147483646;cursor:grabbing;background:transparent;";
      parent.document.body.appendChild(dragMask);
    }
    function removeMask() {
      dragMask?.remove();
      dragMask = null;
    }
    function startDrag(cx, cy) {
      drag = true;
      moved = false;
      const rect = root.getBoundingClientRect();
      ox = cx - rect.left;
      oy = cy - rect.top;
      root.style.transition = "none";
      createMask();
    }
    function moveDrag(cx, cy) {
      if (!drag) return;
      moved = true;
      root.style.left = `${Math.max(4, Math.min(cx - ox, pwin.innerWidth - 50))}px`;
      root.style.top = `${Math.max(4, Math.min(cy - oy, pwin.innerHeight - 50))}px`;
    }
    function endDrag() {
      if (!drag) return;
      drag = false;
      root.style.transition = "";
      removeMask();
      if (moved) savePos();
    }

    orb.addEventListener("mousedown", (e) => {
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });
    head.addEventListener("mousedown", (e) => {
      if (e.target.id === `${ID}-close` || e.target.classList.contains("t-dot")) return;
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });
    parent.document.addEventListener("mousemove", (e) => moveDrag(e.clientX, e.clientY));
    parent.document.addEventListener("mouseup", () => endDrag());

    orb.addEventListener("click", () => {
      if (moved) {
        moved = false;
        return;
      }
      toggle();
    });

    orb.addEventListener(
      "touchstart",
      (e) => {
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
        e.stopPropagation();
      },
      { passive: true },
    );
    orb.addEventListener(
      "touchmove",
      (e) => {
        if (!drag) return;
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true },
    );
    orb.addEventListener(
      "touchend",
      (e) => {
        const wasMoved = moved;
        endDrag();
        if (!wasMoved) toggle();
        e.stopPropagation();
        e.preventDefault();
      },
      { passive: false },
    );

    head.addEventListener(
      "touchstart",
      (e) => {
        if (e.target.id === `${ID}-close` || e.target.classList.contains("t-dot")) return;
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
        e.stopPropagation();
      },
      { passive: true },
    );
    head.addEventListener(
      "touchmove",
      (e) => {
        if (!drag) return;
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true },
    );
    head.addEventListener(
      "touchend",
      (e) => {
        endDrag();
        e.stopPropagation();
      },
      { passive: true },
    );

    window.addEventListener("pagehide", () => {
      pdoc.getElementById(ID)?.remove();
      pdoc.getElementById(`${ID}-style`)?.remove();
    });
    window.addEventListener("unload", () => {
      pdoc.getElementById(ID)?.remove();
      pdoc.getElementById(`${ID}-style`)?.remove();
    });
  }),
);
