<template>
  <div v-if="store.isOpen" class="ii-overlay">
      <section class="ii-workbench">
        <header class="ii-topbar">
          <div class="ii-title">
            <strong>{{ store.view === 'settings' ? '设置' : '互动工作台' }}</strong>
            <span>{{ store.view === 'settings' ? '核心配置：API / 模式提示词 / 世界书插入' : '临时互动不会创建主聊天楼层' }}</span>
          </div>
          <div class="ii-top-actions">
            <button v-if="store.view === 'workbench'" class="ii-btn ii-sidebar-toggle" @click="store.toggleSidebar">
              列表/角色
            </button>
            <button v-if="store.view === 'settings'" class="ii-btn" @click="store.view = 'workbench'">返回工作台</button>
            <button v-else class="ii-btn" @click="store.view = 'settings'">设置</button>
            <button class="ii-btn ii-danger" @click="store.closeWorkbench">关闭</button>
          </div>
        </header>

        <main v-if="store.view === 'workbench'" class="ii-main" :class="{ 'sidebar-open': store.isSidebarOpen }">
          <button class="ii-drawer-scrim" type="button" aria-label="关闭列表抽屉" @click="store.closeSidebar"></button>
          <aside class="ii-sidebar">
            <div class="ii-modes">
              <button class="ii-mode" :class="{ active: store.selectedMode === 'scene' }" @click="store.selectMode('scene')">
                <b>当下场景</b>
              </button>
              <button class="ii-mode" :class="{ active: store.selectedMode === 'private' }" @click="store.selectMode('private')">
                <b>一对一</b>
              </button>
              <button class="ii-mode" :class="{ active: store.selectedMode === 'remote' }" @click="store.selectMode('remote')">
                <b>远程通信</b>
              </button>
            </div>

            <div class="ii-panel">
              <div class="ii-panel-head">角色列表</div>
              <form class="ii-add-row" @submit.prevent="store.addCharacter">
                <input v-model="store.characterDraft" placeholder="添加角色名或身份" />
                <button class="ii-btn ii-primary" type="submit">添加</button>
              </form>
              <div class="ii-character-list">
                <div v-for="character in store.state.characters" :key="character.id" class="ii-character">
                  <button class="ii-character-main" @click="store.createSessionFromCharacter(character.id)">
                    <span>{{ character.label }}</span>
                    <small>{{ store.selectedMode === 'remote' ? '创建远程通信' : store.selectedMode === 'private' ? '创建一对一' : '选择模式后创建' }}</small>
                  </button>
                  <button class="ii-mini ii-danger-text" @click.stop="store.deleteCharacter(character.id)">删</button>
                </div>
                <p v-if="store.state.characters.length === 0" class="ii-empty">选择一对一或远程通信后，先添加角色标识，再点击角色创建互动。</p>
              </div>
            </div>

            <div class="ii-panel ii-sessions">
              <div class="ii-panel-head">互动列表</div>
              <div
                v-for="session in store.state.sessions"
                :key="session.id"
                class="ii-session"
                :class="{ active: session.id === store.state.activeSessionId }"
              >
                <button class="ii-session-main" @click="store.switchSession(session.id)">
                  <b>{{ session.title }}</b>
                  <span>
                    {{ store.sessionModeLabel(session.mode) }} · {{ session.messages.length }} 条 ·
                    <i :class="['ii-merge-state', session.merged ? 'merged' : 'pending']">{{ session.merged ? '已合并' : '待合并' }}</i>
                  </span>
                </button>
                <div class="ii-session-actions">
                  <button class="ii-mini" @click.stop="store.toggleSessionMerged(session.id)">{{ session.merged ? '改待合并' : '标已合并' }}</button>
                  <button class="ii-mini ii-danger-text" @click.stop="store.deleteSession(session.id)">删</button>
                </div>
              </div>
            </div>
          </aside>

          <section class="ii-chat">
            <div class="ii-messages">
              <div class="ii-system">
                当前模式：{{ store.activeSession ? store.sessionModeLabel(store.activeSession.mode) : '无' }}
                <template v-if="store.activeCharacter"> · 角色：{{ store.activeCharacter.label }}</template>
              </div>
              <div
                v-for="message in store.activeSession?.messages ?? []"
                :key="message.id"
                class="ii-bubble"
                :class="[`role-${message.role}`]"
              >
                <div class="ii-role">{{ store.roleLabel(message.role) }}</div>
                <div class="ii-content">{{ message.content || '...' }}</div>
              </div>
            </div>

            <form class="ii-composer" @submit.prevent="store.sendMessage">
              <textarea v-model="store.draft" placeholder="输入台词、动作或追问。这里是互动模式，不需要推进整段主剧情。" />
              <button
                class="ii-btn ii-primary"
                :type="store.isGenerating ? 'button' : 'submit'"
                :disabled="!store.isGenerating && !store.canSend"
                @click="store.isGenerating && store.stopGeneration()"
              >
                {{ store.isGenerating ? '停止' : '发送' }}
              </button>
            </form>
          </section>
        </main>

        <main v-else class="ii-settings">
          <section class="ii-setting-section">
            <h3>聊天 API</h3>
            <div class="ii-grid-3">
              <label><span>模式</span><select v-model="store.settings.api.mode"><option value="current">当前酒馆 API</option><option value="proxy">代理预设</option><option value="custom">自定义 API</option></select></label>
              <label>
                <span>Proxy preset</span>
                <input v-model="store.settings.api.proxy_preset" :disabled="store.settings.api.mode !== 'proxy'" placeholder="仅代理预设模式使用" />
              </label>
              <label>
                <span>模型</span>
                <input v-if="store.settings.api.mode === 'current'" :value="store.currentTavernModel" disabled />
                <input v-else v-model="store.settings.api.model" placeholder="留空或 same_as_preset 则跟随预设" />
              </label>
              <label>
                <span>API URL</span>
                <input v-model="store.settings.api.apiurl" :disabled="store.settings.api.mode !== 'custom'" placeholder="仅自定义 API 模式使用" />
              </label>
              <label>
                <span>API Key</span>
                <input v-model="store.settings.api.key" :disabled="store.settings.api.mode !== 'custom'" type="password" />
              </label>
              <label>
                <span>Source</span>
                <input v-model="store.settings.api.source" :disabled="store.settings.api.mode !== 'custom'" placeholder="openai" />
              </label>
            </div>
          </section>

          <section class="ii-setting-section">
            <h3>模式提示词</h3>
            <label><span>通用互动约束</span><textarea v-model="store.settings.prompts.common" /></label>
            <div class="ii-grid-3">
              <label><span>当下场景</span><textarea v-model="store.settings.prompts.scene" /></label>
              <label><span>一对一</span><textarea v-model="store.settings.prompts.private" /></label>
              <label><span>远程通信</span><textarea v-model="store.settings.prompts.remote" /></label>
            </div>
          </section>

          <section class="ii-setting-section">
            <h3>世界书插入模板</h3>
            <label><span>插入模板</span><textarea v-model="store.settings.worldbookTemplate" /></label>
          </section>

          <section class="ii-setting-section">
            <h3>辅助项</h3>
            <div class="ii-grid-4">
              <label><span>互动历史条数</span><input v-model.number="store.settings.historyLimit" type="number" min="1" max="50" /></label>
              <label class="ii-check"><input v-model="store.settings.stream" type="checkbox" />流式显示</label>
              <label class="ii-check"><input v-model="store.settings.clearWorldbookOnNewMainMessage" type="checkbox" />新楼层/重 roll 后清空</label>
            </div>
          </section>
        </main>

        <footer class="ii-footer">
          <span v-if="store.view === 'workbench'">未合并内容会全量写入当前角色世界书条目“{{ store.FIXED_ENTRY_NAME }}”。</span>
          <span v-else>设置保存到脚本变量；互动记录保存到聊天变量。</span>
          <div class="ii-footer-actions">
            <button v-if="store.view === 'settings'" class="ii-btn" @click="store.resetSettings">恢复默认</button>
            <button v-if="store.view === 'workbench'" class="ii-btn" @click="store.clearAll">清空</button>
            <button v-if="store.view === 'workbench'" class="ii-btn" @click="store.copyInteractionRecords">复制</button>
            <button v-if="store.view === 'workbench'" class="ii-btn ii-primary" @click="store.mergeAndExit">合并并退出</button>
            <button v-else class="ii-btn ii-primary" @click="store.view = 'workbench'">保存并返回</button>
          </div>
        </footer>
      </section>
  </div>
</template>

<script setup lang="ts">
import { useInteractionStore } from './store';

const store = useInteractionStore();
</script>
