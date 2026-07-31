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
                    {{ session.sendToContext ? '带入' : '不带入' }} ·
                    <i :class="['ii-merge-state', session.merged ? 'merged' : 'pending']">{{ session.merged ? '已合并' : '待合并' }}</i>
                  </span>
                </button>
                <div class="ii-session-actions">
                  <button class="ii-mini" @click.stop="store.toggleSessionSendToContext(session.id)">{{ session.sendToContext ? '取消带入' : '带入' }}</button>
                  <button class="ii-mini" @click.stop="store.toggleSessionMerged(session.id)">{{ session.merged ? '改待合并' : '标已合并' }}</button>
                  <button class="ii-mini ii-danger-text" @click.stop="store.deleteSession(session.id)">删</button>
                </div>
              </div>
              <p v-if="store.state.sessions.length === 0" class="ii-empty">暂无互动记录。点击“当下场景”，或选择一对一/远程通信后点击角色创建互动。</p>
            </div>
          </aside>

          <section class="ii-chat">
            <div ref="messagesElement" class="ii-messages">
              <div class="ii-system">
                当前模式：{{ store.activeSession ? store.sessionModeLabel(store.activeSession.mode) : '无' }}
                <template v-if="store.activeCharacter"> · 角色：{{ store.activeCharacter.label }}</template>
              </div>
              <div v-if="!store.activeSession" class="ii-system">暂无互动记录，请先从左侧创建一个互动。</div>
              <div
                v-for="message in store.activeSession?.messages ?? []"
                :key="message.id"
                class="ii-bubble"
                :class="[`role-${message.role}`]"
              >
                <div class="ii-role">{{ store.roleLabel(message.role) }}</div>
                <template v-if="store.editingMessageId === message.id">
                  <textarea v-model="store.editingMessageDraft" class="ii-message-edit" />
                  <div class="ii-message-actions">
                    <button class="ii-mini ii-primary" type="button" @click="store.saveEditingMessage">保存</button>
                    <button class="ii-mini" type="button" @click="store.cancelEditingMessage">取消</button>
                  </div>
                </template>
                <template v-else>
                  <div class="ii-content">{{ store.messageContent(message) || '...' }}</div>
                  <div class="ii-message-actions">
                    <button class="ii-mini" type="button" @click="store.startEditingMessage(message.id)">改</button>
                    <button class="ii-mini ii-danger-text" type="button" @click="store.deleteMessage(message.id)">删</button>
                  </div>
                </template>
              </div>
            </div>

            <form class="ii-composer" @submit.prevent="store.sendMessage">
              <textarea
                v-model="store.draft"
                placeholder="输入台词、动作或追问。这里是互动模式，不需要推进整段主剧情。"
                :disabled="!store.activeSession"
                @keydown="handleComposerKeydown"
              />
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
              <label>
                <span>模式</span>
                <select v-model="store.settings.api.mode" @change="store.refreshCustomApiModels">
                  <option value="current">当前酒馆 API</option>
                  <option value="custom">自定义 API</option>
                </select>
              </label>
              <label>
                <span>模型</span>
                <input v-if="store.settings.api.mode === 'current'" :value="store.currentTavernModel" disabled />
                <select v-else v-model="store.settings.api.model" :disabled="store.customApiModelsLoading">
                  <option value="same_as_preset">跟随预设</option>
                  <option v-for="model in store.customApiModels" :key="model" :value="model">{{ model }}</option>
                </select>
              </label>
              <label>
                <span>API URL</span>
                <input
                  v-model="store.settings.api.apiurl"
                  :disabled="store.settings.api.mode !== 'custom'"
                  placeholder="OpenAI 兼容地址，例如 https://api.example.com/v1"
                  @change="store.refreshCustomApiModels"
                />
              </label>
              <label>
                <span>API Key</span>
                <input
                  v-model="store.settings.api.key"
                  :disabled="store.settings.api.mode !== 'custom'"
                  type="password"
                  @change="store.refreshCustomApiModels"
                />
              </label>
              <button
                v-if="store.settings.api.mode === 'custom'"
                class="ii-btn ii-grid-action"
                type="button"
                :disabled="store.customApiModelsLoading"
                @click="store.refreshCustomApiModels"
              >
                {{ store.customApiModelsLoading ? '读取中' : '刷新模型' }}
              </button>
            </div>
          </section>

          <section class="ii-setting-section">
            <h3>互动预设 JSON</h3>
            <div class="ii-grid-2">
              <label>
                <span>预设来源</span>
                <select v-model="store.settings.presetSource" @change="store.refreshTavernPresetNames">
                  <option value="custom">自定义预设 JSON</option>
                  <option value="tavern">酒馆内预设</option>
                </select>
              </label>
              <label v-if="store.settings.presetSource === 'custom'">
                <span>自定义配置</span>
                <select v-model="store.settings.activePresetConfigId">
                  <option v-for="config in store.settings.presetConfigs" :key="config.id" :value="config.id">{{ config.name }}</option>
                </select>
              </label>
              <label>
                <span>酒馆预设</span>
                <select
                  v-model="store.settings.tavernPresetName"
                  :disabled="store.settings.presetSource !== 'tavern' || store.tavernPresetNames.length === 0"
                >
                  <option v-for="presetName in store.tavernPresetNames" :key="presetName" :value="presetName">{{ presetName }}</option>
                </select>
              </label>
            </div>
            <div class="ii-setting-actions">
              <button v-if="store.settings.presetSource === 'tavern'" class="ii-btn" type="button" @click="store.refreshTavernPresetNames">
                刷新酒馆预设
              </button>
              <button v-if="store.settings.presetSource === 'custom'" class="ii-icon-btn" type="button" title="新建默认预设配置" @click="store.createPresetConfig">
                +
              </button>
              <button v-if="store.settings.presetSource === 'custom'" class="ii-icon-btn" type="button" title="导入预设 JSON" @click="store.importPresetJsonFile">
                ↓
              </button>
              <button v-if="store.settings.presetSource === 'custom'" class="ii-icon-btn" type="button" title="导出当前预设 JSON" @click="store.exportPresetJson">
                ↑
              </button>
              <button v-if="store.settings.presetSource === 'custom'" class="ii-icon-btn" type="button" title="保存为新预设配置" @click="store.savePresetConfigAs">
                S
              </button>
              <button v-if="store.settings.presetSource === 'custom'" class="ii-icon-btn ii-danger-text" type="button" title="删除当前预设配置" @click="store.deletePresetConfig">
                ×
              </button>
            </div>
          </section>

          <section class="ii-setting-section">
            <h3>提示词配置 JSON</h3>
            <div class="ii-config-bar">
              <label>
                <span>当前配置</span>
                <select v-model="store.settings.activePromptConfigId">
                  <option v-for="config in store.settings.promptConfigs" :key="config.id" :value="config.id">{{ config.name }}</option>
                </select>
              </label>
              <div class="ii-setting-actions">
                <button class="ii-icon-btn" type="button" title="新建默认提示词配置" @click="store.createPromptConfig">+</button>
                <button class="ii-icon-btn" type="button" title="导入提示词配置 JSON" @click="store.importPromptConfigJsonFile">↓</button>
                <button class="ii-icon-btn" type="button" title="导出当前提示词配置 JSON" @click="store.exportPromptConfigJson">↑</button>
                <button class="ii-icon-btn" type="button" title="保存为新提示词配置" @click="store.savePromptConfigAs">S</button>
                <button class="ii-icon-btn ii-danger-text" type="button" title="删除当前提示词配置" @click="store.deletePromptConfig">×</button>
              </div>
            </div>
            <div class="ii-grid-3">
              <label><span>当下场景</span><textarea v-model="store.activePromptConfig.prompts.scene" /></label>
              <label><span>一对一</span><textarea v-model="store.activePromptConfig.prompts.private" /></label>
              <label><span>远程通信</span><textarea v-model="store.activePromptConfig.prompts.remote" /></label>
            </div>
            <div class="ii-grid-2">
              <label>
                <span>插入方式</span>
                <select v-model="store.settings.insertTarget">
                  <option value="worldbook">世界书</option>
                  <option value="message">当前楼层正文</option>
                </select>
              </label>
            </div>
            <label><span>插入模板</span><textarea v-model="store.activePromptConfig.worldbookTemplate" /></label>
          </section>

          <section class="ii-setting-section">
            <h3>可用宏变量</h3>
            <div class="ii-macro-table">
              <div v-for="macro in macroDocs" :key="macro.name" class="ii-macro-row">
                <code v-text="macro.name"></code>
                <span>{{ macro.description }}</span>
                <small>{{ macro.scope }}</small>
              </div>
            </div>
          </section>

          <section class="ii-setting-section">
            <h3>辅助项</h3>
            <div class="ii-grid-4">
              <label><span>互动历史条数</span><input v-model.number="store.settings.historyLimit" type="number" min="1" max="50" /></label>
              <label class="ii-check"><input v-model="store.settings.stream" type="checkbox" />流式显示</label>
              <label v-if="store.settings.insertTarget === 'worldbook'" class="ii-check">
                <input v-model="store.settings.clearWorldbookOnNewMainMessage" type="checkbox" />下一轮主聊天前清空
              </label>
            </div>
          </section>
        </main>

        <footer class="ii-footer">
          <span v-if="store.view === 'workbench' && store.settings.insertTarget === 'message'">未合并内容会按插入模板追加到当前楼层正文末尾。</span>
          <span v-else-if="store.view === 'workbench'">未合并内容会全量写入当前角色世界书条目“{{ store.FIXED_ENTRY_NAME }}”。</span>
          <span v-else>设置保存到脚本变量；互动记录保存到聊天变量。</span>
          <div class="ii-footer-actions">
            <button v-if="store.view === 'settings'" class="ii-btn" @click="store.resetSettings">恢复默认</button>
            <button v-if="store.view === 'workbench'" class="ii-btn" @click="store.clearAll">清空</button>
            <button v-if="store.view === 'workbench'" class="ii-btn" @click="store.copyInteractionRecords">复制</button>
            <button v-if="store.view === 'workbench'" class="ii-btn" @click="store.cancelMessageMerge">取消合并</button>
            <button v-if="store.view === 'workbench'" class="ii-btn ii-primary" @click="store.mergeAndExit">合并并退出</button>
            <button v-else class="ii-btn ii-primary" @click="store.view = 'workbench'">保存并返回</button>
          </div>
        </footer>
      </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { scrollChatToBottom, shouldForceWorkbenchScroll } from './chat-scroll';
import { useInteractionStore } from './store';

const store = useInteractionStore();
const messagesElement = ref<HTMLElement | null>(null);

async function scrollMessagesToBottom() {
  await nextTick();
  const element = messagesElement.value;
  if (!element) return;
  scrollChatToBottom(element);
}

watch(
  () => [store.isOpen, store.view, store.state.activeSessionId, store.activeSession?.messages.length ?? 0] as const,
  ([isOpen, view]) => {
    if (shouldForceWorkbenchScroll(isOpen, view)) void scrollMessagesToBottom();
  },
  { flush: 'post' },
);

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void store.sendMessage();
}

const macroDocs = [
  { name: '{{ii_scene_prompt}}', description: '当下场景模式提示词；其他模式为空。', scope: '互动预设 JSON' },
  { name: '{{ii_private_prompt}}', description: '一对一模式提示词；其他模式为空。', scope: '互动预设 JSON' },
  { name: '{{ii_remote_prompt}}', description: '远程通信模式提示词；其他模式为空。', scope: '互动预设 JSON' },
  { name: '{{ii_context_prompt}}', description: '当前互动模式、角色标识等脚本上下文。', scope: '互动预设 JSON' },
  { name: '{{ii_interaction_records}}', description: '待合并到世界书的互动记录。', scope: '世界书插入模板' },
];
</script>
