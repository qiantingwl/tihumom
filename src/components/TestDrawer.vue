<script setup lang="ts">
import { verdictText, verdictClass } from "../services/display"
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { CheckCircle2, CircleAlert, Eye, EyeOff, FileImage, KeyRound, LoaderCircle, Send, X } from '@lucide/vue'
import ArtworkFrame from './ArtworkFrame.vue'
import TaskLoading from './TaskLoading.vue'
import { watchTestTask, type TaskConnection } from '../services/task-monitor'
import ReportModal from './ReportModal.vue'
import { confirmPublishedItem } from '../services/api'
import type { BenchmarkType, GalleryItem, ReasoningEffort, TestMode, TestTask } from '../types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  completed: [task: TestTask]
}>()

const form = reactive({
  demo: false,
  benchmark: 'pelican' as BenchmarkType,
  endpoint: '',
  apiKey: '',
  model: 'gpt-6-astra',
  mode: 'benchmark' as TestMode,
  customPrompt: '',
  effort: 'auto' as ReasoningEffort,
  source: '',
  publicSource: true,
})

const running = ref(false)
const showKey = ref(false)
const error = ref('')
const currentTask = ref<TestTask | null>(null)
let stopMonitor: (() => void) | undefined
const connection = ref<TaskConnection>('connecting')
onBeforeUnmount(() => stopMonitor?.())

const reportItem = ref<GalleryItem | null>(null)
const showReportModal = ref(false)

function openReportItem(t: TestTask) {
  if (!t.result) return
  reportItem.value = {
    id: t.id,
    code: t.code,
    title: t.result.title,
    benchmark: t.benchmark,
    model: t.input.model,
    mode: t.input.mode,
    effort: t.input.effort,
    source: t.input.source,
    createdAt: t.completedAt || new Date().toISOString(),
    latencyMs: t.result.latencyMs,
    inputTokens: t.result.inputTokens,
    outputTokens: t.result.outputTokens,
    cost: t.result.cost,
    previewImage: t.result.previewImage,
    html: t.result.html,
    answerText: t.result.answerText,
    published: true,
    likes: 0,
    abstracts: 0,
    fails: 0,
    prompt: t.prompt,
    verdict: t.result.verdict,
    analysis: t.result.analysis,
    inspections: t.result.inspections,
  }
  showReportModal.value = true
}

function effortLabel(effort: string) {
  const map: Record<string, string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '极高' }
  return map[effort] || effort
}

async function runTest() {
  error.value = ''
  running.value = true
  stopMonitor?.()
  currentTask.value = null

  // 格式化 endpoint
  let ep = form.endpoint.trim()
  if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
    ep = 'https://' + ep
  }
  if (!ep.includes('/v1')) {
    ep = ep.replace(/\/+$/, '') + '/v1/responses'
  }

  try {
    const isCandy = form.mode === 'candy'
    const isCustom = form.mode === 'custom'

    const res = await fetch('/api/tests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        demo: false,
        benchmark: isCandy ? 'candy' : isCustom ? 'custom' : 'pelican',
        endpoint: ep,
        apiKey: form.apiKey,
        model: form.model,
        mode: form.mode,
        customPrompt: isCustom ? form.customPrompt : undefined,
        effort: form.effort,
        source: form.source || '自测',
      }),
    })
    const payload = await res.json()
    if (!res.ok) throw new Error(payload.error || '创建检测失败')
    currentTask.value = payload.task

    stopMonitor = watchTestTask(payload.task.id, {
      onConnection: (state) => { connection.value = state },
      onUnavailable: (message) => { error.value = message; running.value = false },
      onTask: (updated) => {
      currentTask.value = updated
      if (['completed', 'failed'].includes(currentTask.value!.status)) {
        running.value = false
        if (currentTask.value?.status === 'completed' && currentTask.value?.result) {
          emit('completed', currentTask.value)
          void confirmPublishedItem(currentTask.value.id).catch(() => {
            error.value = '检测已完成，但未能确认作品墙发布状态；请在现场检测页重试发布。'
          })
        }
      }
      },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发起检测失败'
    running.value = false
  }
}
</script>

<template>
  <div v-if="open" class="drawer-backdrop" @mousedown.self="$emit('close')">
    <aside class="test-drawer">
      <header class="drawer-header">
        <div>
          <span class="drawer-eyebrow">YOUR TURN</span>
          <h2>测一下 GPT-6</h2>
        </div>
        <button class="drawer-close" type="button" aria-label="关闭侧边栏" @click="$emit('close')">
          <X :size="20" />
        </button>
      </header>

      <form class="drawer-form" @submit.prevent="runTest">
        <!-- 顶部题目类型大类选择：基准题（鹈鹕骑行） / 糖果测试（推理） -->
        <div class="mode-tabs">
          <button
            type="button"
            :class="{ active: form.benchmark === 'pelican' }"
            @click="form.benchmark = 'pelican'; if (form.mode === 'candy') form.mode = 'benchmark'"
          >
            基准题 (鹈鹕骑行)
          </button>
          <button
            type="button"
            :class="{ active: form.benchmark === 'candy' }"
            @click="form.benchmark = 'candy'; form.mode = 'candy'"
          >
            糖果测试 (推理)
          </button>
        </div>

        <label class="form-item">
          <span>接口域名 / Base URL</span>
          <input
            v-model="form.endpoint"
            type="text"
            placeholder="填写服务商的 /v1/responses 或 /v1/chat/completions 地址"
            required
          />
        </label>

        <label class="form-item">
          <span>接口密钥</span>
          <div class="input-wrap">
            <input
              v-model="form.apiKey"
              :type="showKey ? 'text' : 'password'"
              placeholder="sk-..."
              required
              autocomplete="off"
            />
            <button class="eye-btn" type="button" @click="showKey = !showKey">
              <EyeOff v-if="showKey" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </label>

        <label class="form-item">
          <span>模型</span>
          <input v-model="form.model" type="text" placeholder="gpt-6-astra" required />
        </label>

        <label class="form-item">
          <span>思考级别</span>
          <select v-model="form.effort">
            <option value="auto">自动</option>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="xhigh">极高</option>
          </select>
          <small class="field-hint">不确定时选自动。</small>
        </label>

        <!-- 若选的是鹈鹕基准题，在下方展示切换：默认固定 / 点击切换随机 / 自定义 -->
        <div v-if="form.benchmark === 'pelican'" class="sub-mode-section">
          <div class="sub-mode-header">
            <span>题目模式</span>
            <div class="sub-mode-pills">
              <button
                type="button"
                :class="['sub-pill', { active: form.mode === 'benchmark' }]"
                @click="form.mode = 'benchmark'"
              >
                固定题目
              </button>
              <button
                type="button"
                :class="['sub-pill', { active: form.mode === 'random' }]"
                @click="form.mode = 'random'"
              >
                随机题目
              </button>
              <button
                type="button"
                :class="['sub-pill', { active: form.mode === 'custom' }]"
                @click="form.mode = 'custom'"
              >
                自定义输入
              </button>
            </div>
          </div>

          <!-- 自定义题目输入框 -->
          <div v-if="form.mode === 'custom'" class="custom-prompt-wrap">
            <textarea
              v-model="form.customPrompt"
              rows="4"
              class="custom-prompt-input"
              placeholder="请在此输入您要发送给模型的自定义 Prompt..."
              required
            ></textarea>
            <small class="field-hint">切换为固定后将发送系统默认或后台设定的基准题。</small>
          </div>

          <!-- 提示词预览卡片 -->
          <div v-else class="prompt-hint-card">
            <div class="hint-header">
              {{ form.mode === 'benchmark' ? '固定基准题 · 默认标准指令' : '随机场景题 · 后台动态词库扩展' }}
            </div>
            <p v-if="form.mode === 'benchmark'">
              请生成可直接运行的单文件HTML，使用内联SVG绘制鹈鹕骑自行车的二维循环动画。画面以鹈鹕和自行车为主体，展示清晰的身体结构、踩踏动作和车轮转动...
            </p>
            <p v-else>
              在固定鹈鹕骑行基准上，服务端将动态注入后台设置的随机场景与配件词库（例如：灯塔公路、盐湖小道、麦田风车、配不同颜色围巾与车铃），检验模型理解多重限定条件的能力。
            </p>
          </div>
        </div>

        <!-- 糖果测试提示卡片 -->
        <div v-else-if="form.benchmark === 'candy'" class="prompt-hint-card">
          <div class="hint-header">极值推理 · 糖果测试</div>
          <p>
            黑色袋子中有苹果、桃子、西瓜三种口味的糖果，圆形与五角星形可以靠手感区分。最少取多少个，才能保证同时拥有不同形状的苹果味和桃子味糖果？（经典逻辑盲抽鸽巢原理题）
          </p>
        </div>

        <label class="checkbox-row">
          <input v-model="form.publicSource" type="checkbox" />
          <span>公开测试来源（勾选后将在作品卡片显示来源简称）</span>
        </label>

        <div class="queue-status">
          <span>0 个生成中 · 0 个排队</span>
        </div>

        <p v-if="error" class="error-msg"><CircleAlert :size="15" /> {{ error }}</p>

        <!-- 当前运行状态卡片 -->
        <div v-if="currentTask" class="running-card" :class="currentTask.status">
          <LoaderCircle v-if="running" class="spin" :size="16" />
          <CheckCircle2 v-else-if="currentTask.status === 'completed'" :size="16" />
          <CircleAlert v-else :size="16" />
          <span>{{ currentTask.message }} ({{ currentTask.progress }}%)</span>
        </div>

        <button class="submit-btn" type="submit" :disabled="running">
          <LoaderCircle v-if="running" class="spin" :size="16" />
          <span>{{ running ? '正在现场跑一圈...' : '测一下' }}</span>
        </button>

        <!-- 实时生成中或生成完毕展示卡片 -->
        <div v-if="currentTask" class="drawer-result-box">
          <div class="result-header">
            <span class="result-title">本次作品</span>
            <span v-if="currentTask.status === 'completed'" :class="['result-badge', verdictClass(currentTask.result?.verdict)]">
              {{ verdictText(currentTask.result?.verdict) }}
            </span>
            <span v-else-if="currentTask.status === 'failed'" class="result-badge fail">
              调用未完成
            </span>
            <span v-else class="result-badge running">
              真实调用 · 正在生成
            </span>
          </div>

          <!-- 生成中状态展示占位动画 -->
          <TaskLoading v-if="currentTask.status !== 'completed' && currentTask.status !== 'failed'"
            :key="currentTask.id" :task="currentTask" :connection="connection" />

          <!-- 失败状态展示 -->
          <div v-else-if="currentTask.status === 'failed'" class="drawer-failed-frame">
            <CircleAlert :size="24" />
            <b>调用未成功</b>
            <p>{{ currentTask.error || currentTask.message }}</p>
          </div>

          <!-- 完成后：鹈鹕骑行动画展示 -->
          <div v-else-if="currentTask.benchmark === 'pelican' && currentTask.result?.html" class="drawer-artwork-frame">
            <ArtworkFrame
              :html="currentTask.result.html"
              :title="currentTask.result.title"
              interactive
            />
          </div>

          <!-- 糖果测试回答展示 -->
          <div v-else-if="currentTask.benchmark === 'candy' || currentTask.input.mode === 'candy'" class="drawer-candy-frame">
            <div class="candy-tag">糖果测试回答</div>
            <pre class="drawer-candy-pre">{{ currentTask.result?.answerText }}</pre>
          </div>

          <!-- 自定义题目回答展示 -->
          <div v-else class="drawer-custom-frame">
            <div v-if="currentTask.result?.html" class="drawer-artwork-frame">
              <ArtworkFrame :html="currentTask.result.html" :title="currentTask.result.title" interactive />
            </div>
            <div v-else class="drawer-candy-frame">
              <pre class="drawer-candy-pre">{{ currentTask.result?.answerText }}</pre>
            </div>
          </div>

          <!-- 元信息与操作 -->
          <div v-if="currentTask.status === 'completed'" class="drawer-result-meta">
            <span>{{ currentTask.input.model }}</span>
            <span>思考: {{ effortLabel(currentTask.input.effort) }}</span>
            <span>{{ currentTask.result ? (currentTask.result.latencyMs / 1000).toFixed(1) + 's' : '' }}</span>
          </div>

          <div v-if="currentTask.status === 'completed'" class="drawer-result-actions">
            <RouterLink
              class="action-btn"
              :to="`/compare?left=${currentTask.id}`"
              @click="$emit('close')"
            >
              加入同题对比
            </RouterLink>
            <button
              class="action-btn"
              type="button"
              @click="openReportItem(currentTask)"
            >
              图片战报
            </button>
          </div>
        </div>

        <footer class="drawer-footer-note">
          <p>调用费用由接口服务商收取。</p>
          <p>本浏览器记住密钥。本次生成仅在服务端临时使用，任务结束后不保留。</p>
        </footer>
      </form>
    </aside>

    <!-- 战报导出弹窗 -->
    <ReportModal
      v-if="showReportModal && reportItem"
      :item="reportItem"
      @close="showReportModal = false"
    />
  </div>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.test-drawer {
  width: min(100%, 460px);
  height: 100%;
  background: #ffffff;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 28px 16px;
  border-bottom: 1px solid #f1f5f9;
}
.drawer-eyebrow {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.08em;
}
.drawer-header h2 {
  margin: 4px 0 0;
  font-size: 1.45rem;
  color: #0f172a;
}
.drawer-close {
  background: transparent;
  border: 0;
  padding: 6px;
  color: #64748b;
  cursor: pointer;
  border-radius: 6px;
}
.drawer-close:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.drawer-form {
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
}
.mode-tabs button {
  border: 0;
  background: transparent;
  padding: 8px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
  cursor: pointer;
}
.mode-tabs button.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.sub-mode-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sub-mode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sub-mode-header span {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}
.sub-mode-pills {
  display: inline-flex;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}
.sub-pill {
  border: 0;
  background: transparent;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.76rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}
.sub-pill.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.custom-prompt-input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.85rem;
  line-height: 1.5;
  resize: vertical;
}
.custom-prompt-input:focus {
  outline: 2px solid #0f172a;
}
.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-item span {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}
.form-item input, .form-item select {
  height: 42px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 14px;
  font-size: 0.9rem;
  color: #0f172a;
  background: #ffffff;
}
.form-item input:focus, .form-item select:focus {
  outline: 2px solid #0f172a;
}
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.input-wrap input {
  width: 100%;
  padding-right: 44px;
}
.eye-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: #64748b;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.eye-btn:hover {
  color: #0f172a;
  background: #f1f5f9;
}
.field-hint {
  font-size: 0.74rem;
  color: #64748b;
}
.prompt-hint-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px 14px;
}
.hint-header {
  font-size: 0.8rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
}
.prompt-hint-card p {
  margin: 0;
  font-size: 0.76rem;
  color: #64748b;
  line-height: 1.5;
}
.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.8rem;
  color: #475569;
  cursor: pointer;
}
.queue-status {
  font-size: 0.78rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
}
.error-msg {
  margin: 0;
  font-size: 0.82rem;
  color: #b91c1c;
  display: flex;
  align-items: center;
  gap: 6px;
}
.running-card {
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.running-card.connecting, .running-card.generating, .running-card.checking {
  background: #f1f5f9;
  color: #0f172a;
}
.running-card.completed {
  background: #f0fdf4;
  color: #166534;
}
.running-card.failed {
  background: #fef2f2;
  color: #991b1b;
}
.submit-btn {
  height: 48px;
  background: #0f172a;
  color: #ffffff;
  border: 0;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.submit-btn:hover {
  opacity: 0.92;
}
.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.drawer-result-box {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 6px;
}
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.result-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}
.result-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
.result-badge.pass {
  background: #dcfce7;
  color: #166534;
}
.result-badge.fail {
  background: #fee2e2;
  color: #991b1b;
}
.result-badge.running {
  background: #e0f2fe;
  color: #0369a1;
}
.drawer-generating-frame {
  height: 200px;
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 16px;
}
.generating-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #0f172a;
  border-radius: 50%;
}
.drawer-generating-frame b {
  font-size: 0.95rem;
  color: #0f172a;
}
.drawer-generating-frame p {
  margin: 0;
  font-size: 0.82rem;
  color: #0369a1;
  font-weight: 600;
}
.drawer-generating-frame small {
  font-size: 0.72rem;
  color: #64748b;
}
.drawer-failed-frame {
  padding: 24px 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #991b1b;
}
.drawer-failed-frame b {
  font-size: 0.92rem;
}
.drawer-failed-frame p {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
}
.drawer-artwork-frame {
  height: 280px;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  background: #ffffff;
}
.drawer-artwork-frame :deep(iframe) {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
.drawer-candy-frame, .drawer-custom-frame {
  max-height: 280px;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px;
}
.candy-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: #b45309;
  margin-bottom: 6px;
}
.drawer-candy-pre {
  margin: 0;
  font-family: inherit;
  font-size: 0.8rem;
  line-height: 1.5;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-all;
}
.drawer-result-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.78rem;
  color: #64748b;
}
.drawer-result-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}
.drawer-result-actions .action-btn {
  height: 36px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: all 0.15s ease;
}
.drawer-result-actions .action-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.drawer-footer-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.72rem;
  color: #94a3b8;
  line-height: 1.4;
  text-align: center;
  margin-top: 8px;
}
.drawer-footer-note p {
  margin: 0;
}
</style>
