<template>
  <main class="phone-status">
    <section class="phone-shell" aria-label="手机角色状态栏">
      <div class="phone-notch" aria-hidden="true">
        <span></span>
      </div>

      <div class="phone-screen">
        <header class="system-bar">
          <span>{{ systemTime }}</span>
          <span class="system-icons">
            <span>5G</span>
            <span class="battery" aria-hidden="true"></span>
            <span>{{ batteryLevel }}</span>
          </span>
        </header>

        <section class="chat-header" aria-label="角色信息">
          <div class="avatar" aria-hidden="true">{{ characterInitial }}</div>
          <div class="identity">
            <strong>{{ characterName }}</strong>
            <span>{{ presenceText }}</span>
          </div>
          <span class="mood-pill">{{ moodLabel }}</span>
        </section>

        <section class="chat-body" aria-label="聊天界面">
          <article v-for="message in messages" :key="message.text" class="bubble" :class="`bubble-${message.side}`">
            {{ message.text }}
          </article>

          <section class="status-card" aria-label="角色当前状态">
            <div class="status-heading">
              <div>
                <span>当前状态</span>
                <strong>{{ statusSummary }}</strong>
              </div>
              <span class="status-dot">{{ statusTag }}</span>
            </div>

            <div class="metrics">
              <div v-for="metric in statusMetrics" :key="metric.label" class="metric">
                <div class="metric-row">
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.value }} {{ metric.percent }}%</strong>
                </div>
                <div class="metric-bar" aria-hidden="true">
                  <span :style="{ width: `${metric.percent}%` }"></span>
                </div>
              </div>
            </div>

            <dl class="status-details">
              <div v-for="detail in statusDetails" :key="detail.label">
                <dt>{{ detail.label }}</dt>
                <dd>{{ detail.value }}</dd>
              </div>
            </dl>
          </section>
        </section>

        <footer class="input-bar" aria-label="消息输入栏">
          <span>{{ inputPlaceholder }}</span>
          <button type="button" aria-label="发送消息">➤</button>
        </footer>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
interface ChatMessage {
  side: 'left' | 'right';
  text: string;
}

interface StatusMetric {
  label: string;
  value: string;
  percent: number;
}

interface StatusDetail {
  label: string;
  value: string;
}

const systemTime = '21:48';
const batteryLevel = '82%';
const characterName = '莉娅';
const characterInitial = '莉';
const presenceText = '刚刚还在看着你';
const moodLabel = '安心';
const statusSummary = '情绪稳定，愿意继续聊天';
const statusTag = '在线';
const inputPlaceholder = '输入给角色的消息...';

const messages: ChatMessage[] = [
  { side: 'left', text: '今天的语气比平时柔和很多。' },
  { side: 'right', text: '要不要先坐一会儿？' },
  { side: 'left', text: '嗯，我现在感觉很安心。' },
];

const statusMetrics: StatusMetric[] = [
  { label: '心情', value: '平稳', percent: 76 },
  { label: '精力', value: '充足', percent: 64 },
  { label: '好感', value: '亲近', percent: 68 },
];

const statusDetails: StatusDetail[] = [
  { label: '位置', value: '窗边沙发' },
  { label: '行动', value: '等待你的回应' },
  { label: '语气', value: '轻声、放松' },
];
</script>

<style lang="scss" scoped>
.phone-status {
  width: min(100%, 360px);
  margin: 14px auto;
  padding: 4px;
  color: #342c25;
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

.phone-shell {
  position: relative;
  width: min(100%, 320px);
  aspect-ratio: 9 / 18.4;
  margin: 0 auto;
  padding: 8px;
  overflow: hidden;
  border: 1px solid #0f0f10;
  border-radius: 36px;
  background: linear-gradient(145deg, #282828, #0f0f10 46%, #242424), #171717;
  box-shadow:
    0 18px 42px rgba(42, 34, 25, 0.2),
    0 4px 12px rgba(42, 34, 25, 0.16),
    inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.phone-notch {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 4;
  display: flex;
  width: 94px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 0 0 16px 16px;
  transform: translateX(-50%);
  background: #111;

  span {
    width: 34px;
    height: 4px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.14);
  }
}

.phone-screen {
  position: relative;
  display: flex;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border-radius: 28px;
  background:
    radial-gradient(circle at 22% 6%, rgba(255, 255, 255, 0.92), transparent 28%),
    linear-gradient(180deg, #fff9ef 0%, #f4eadf 52%, #eaded1 100%);
}

.system-bar {
  display: flex;
  min-height: 38px;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 19px 7px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: #5b4b3f;
}

.system-icons {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.battery {
  position: relative;
  width: 18px;
  height: 9px;
  border: 1px solid currentColor;
  border-radius: 3px;

  &::before {
    content: '';
    position: absolute;
    top: 1px;
    left: 1px;
    width: 12px;
    height: 5px;
    border-radius: 2px;
    background: currentColor;
  }

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    right: -3px;
    width: 2px;
    height: 4px;
    border-radius: 0 2px 2px 0;
    background: currentColor;
  }
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 2px 14px 0;
  padding: 10px 0 12px;
  border-bottom: 1px solid rgba(128, 91, 59, 0.14);
}

.avatar {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border: 2px solid rgba(255, 255, 255, 0.82);
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(248, 211, 153, 0.95), rgba(209, 133, 91, 0.9)), #d99b67;
  box-shadow: 0 6px 14px rgba(158, 100, 54, 0.2);
  color: #fffaf5;
  font-size: 16px;
  font-weight: 800;
}

.identity {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 15px;
    line-height: 1.1;
  }

  span {
    color: #887466;
    font-size: 11px;
  }
}

.mood-pill,
.status-dot {
  flex: 0 0 auto;
  border: 1px solid rgba(195, 127, 78, 0.18);
  border-radius: 999px;
  background: rgba(204, 137, 85, 0.16);
  color: #965f37;
  font-size: 11px;
  font-weight: 700;
}

.mood-pill {
  padding: 5px 8px;
}

.chat-body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  padding: 14px;
}

.bubble {
  max-width: 84%;
  padding: 9px 11px;
  border-radius: 15px;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  box-shadow: 0 5px 14px rgba(111, 82, 55, 0.08);
}

.bubble-left {
  align-self: flex-start;
  border-bottom-left-radius: 6px;
  background: rgba(255, 255, 255, 0.86);
  color: #40362f;
}

.bubble-right {
  align-self: flex-end;
  border-bottom-right-radius: 6px;
  background: linear-gradient(135deg, #d99a5f, #c8804d);
  color: #fffaf3;
}

.status-card {
  margin-top: 2px;
  padding: 13px;
  border: 1px solid rgba(184, 126, 78, 0.16);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.78);
  box-shadow:
    0 10px 22px rgba(128, 91, 59, 0.12),
    inset 0 0 0 1px rgba(255, 255, 255, 0.52);
  backdrop-filter: blur(10px);
}

.status-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;

  div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  span {
    color: #96735b;
    font-size: 11px;
  }

  strong {
    font-size: 13px;
    line-height: 1.35;
  }
}

.status-dot {
  padding: 4px 7px;
}

.metrics {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;

  strong {
    color: #7c5d48;
    font-size: 11px;
  }
}

.metric-bar {
  height: 7px;
  margin-top: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(138, 102, 74, 0.14);

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #d9a05f, #bf7651);
  }
}

.status-details {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 12px 0 0;

  div {
    min-width: 0;
    border-radius: 12px;
    background: rgba(219, 174, 131, 0.15);
    padding: 7px;
  }

  dt,
  dd {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  dt {
    color: #9d7a64;
    font-size: 10px;
  }

  dd {
    margin: 3px 0 0;
    color: #5c4638;
    font-size: 11px;
    font-weight: 700;
  }
}

.input-bar {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  margin: 0 14px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  padding: 6px 7px 6px 14px;
  box-shadow: 0 6px 18px rgba(111, 82, 55, 0.12);
  color: #9a8778;
  font-size: 12px;

  span {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    display: grid;
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: #c8804d;
    color: #fffaf3;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }
}

@media (max-width: 420px) {
  .phone-status {
    width: min(100%, 330px);
    margin: 10px auto;
  }

  .phone-shell {
    border-radius: 32px;
  }

  .chat-body {
    gap: 8px;
    padding: 12px;
  }

  .status-details {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
  }
}
</style>
