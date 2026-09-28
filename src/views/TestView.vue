<script setup lang="ts">
import { verdictText, formatDuration, formatPercent } from "../services/display"
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Eye,
  EyeOff,
  FileImage,
  Info,
  KeyRound,
  LoaderCircle,
  Radio,
  Send,
  Sparkles,
  UploadCloud
} from '@lucide/vue'
import ArtworkFrame from '../components/ArtworkFrame.vue'
import TaskLoading from '../components/TaskLoading.vue'
import { watchTestTask, type TaskConnection } from '../services/task-monitor'
import ReportModal from '../components/ReportModal.vue'
import { confirmPublishedItem, fetchShowcasePairs, fetchStatsData, getCachedShowcase, getCachedStats } from '../services/api'
import type { BenchmarkType, GalleryItem, ReasoningEffort, TestMode, TestTask } from '../types'

const form = reactive({
  demo: false,
  benchmark: 'pelican' as BenchmarkType,
  endpoint: '',
  apiKey: '',
  model: 'gpt-6-astra',
  mode: 'benchmark' as TestMode,
  customPrompt: '',
  effort: 'medium' as ReasoningEffort,
  source: 'WEB自测',
})

const task = ref<TestTask | null>(null)
const error = ref('')
const running = ref(false)
const showKey = ref(false)
const published = ref(false)
const publishing = ref(false)
const publicationError = ref('')
const showReportModal = ref(false)
const reportItem = ref<GalleryItem | null>(null)
let stopMonitor: (() => void) | undefined
const connection = ref<TaskConnection>('connecting')

// 橱窗对拍
const promoIndex = ref(0)
const showcasePairs = ref<any[]>(getCachedShowcase() || [])
const showcaseLoading = ref(!showcasePairs.value.length)
const showcaseError = ref('')

const currentPromo = computed(() => {
  if (showcasePairs.value.length > 0) {
    return showcasePairs.value[promoIndex.value % showcasePairs.value.length]
  }
  return {
    good: { code: '', label: '标准效果', model: '—', desc: '', time: '—', html: '', previewImage: '' },
    bad: { code: '', label: '失败效果', model: '—', desc: '', time: '—', html: '', previewImage: '' },
  }
})

function togglePromo() {
  if (showcasePairs.value.length > 0) {
    promoIndex.value = (promoIndex.value + 1) % showcasePairs.value.length
  }
}

// 轮播卡片状态：0: 鹈鹕标准vs失败, 1: 糖果测试推演基准
const slideIndex = ref(0)
let autoSlideTimer: any = null

function nextSlide() {
  slideIndex.value = (slideIndex.value + 1) % 2
}

function prevSlide() {
  slideIndex.value = (slideIndex.value - 1 + 2) % 2
}

// 糖果统计指标
const candyStats = ref({ total: 0, passRate: null as number | null, avgLatency: '—' })

function showStats(stats: Awaited<ReturnType<typeof fetchStatsData>> | null) {
  if (!stats) return
  candyStats.value = { total: stats.candyCount ?? 0, passRate: stats.candyPassRate ?? null,
    avgLatency: formatDuration(stats.avgLatencyCandy) }
}
showStats(getCachedStats())

async function loadShowcase(force = false) {
  showcaseLoading.value = !showcasePairs.value.length
  showcaseError.value = ''
  try {
    showcasePairs.value = await fetchShowcasePairs(force)
    promoIndex.value %= showcasePairs.value.length || 1
  } catch {
    if (!showcasePairs.value.length) showcaseError.value = '作品对比暂时无法加载，请重试。'
  } finally { showcaseLoading.value = false }
}

onMounted(() => {
  // Render cached artwork immediately; statistics must never block its first paint.
  void loadShowcase()
  void fetchStatsData().then(showStats).catch(() => {})

  autoSlideTimer = setInterval(() => {
    slideIndex.value = (slideIndex.value + 1) % 2
  }, 6000)

  void restoreRecentTask()
})

onBeforeUnmount(() => {
  if (autoSlideTimer) clearInterval(autoSlideTimer)
  stopMonitor?.()
})

const canSubmit = computed(() => !running.value && Boolean(form.endpoint && form.apiKey && form.model))
const statusSteps = [
  ['queued', '排队'],
  ['connecting', '连接'],
  ['generating', '生成'],
  ['checking', '检查'],
  ['completed', '完成'],
]

const reached = (status: string) => {
  const current = statusSteps.findIndex(([key]) => key === task.value?.status)
  return current >= statusSteps.findIndex(([key]) => key === status)
}

function effortLabel(effort: string) {
  const map: Record<string, string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '极高' }
  return map[effort] || effort
}

async function startTest() {
  error.value = ''
  published.value = false
  publishing.value = false
  publicationError.value = ''
  running.value = true
  stopMonitor?.()
  task.value = null
  try {
    const response = await fetch('/api/tests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || '无法创建检测任务')
    task.value = payload.task
    attachMonitor(payload.task.id)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '检测请求失败'
    running.value = false
  }
}

// 订阅任务状态：SSE 实时 + 轮询兜底，终态自动断开
function attachMonitor(id: string) {
  stopMonitor = watchTestTask(id, {
    onConnection: (state) => { connection.value = state },
    onUnavailable: (message) => { error.value = message; running.value = false },
    onTask: (updated) => {
      task.value = updated
      if (['completed', 'failed'].includes(task.value!.status)) {
        running.value = false
        if (task.value?.status === 'completed' && task.value?.result && !task.value.input.demo) {
          void verifyPublication(task.value.id)
        }
      }
    },
  })
}

// 刷新 / 切页后恢复近期任务：只重新接管监控，绝不重复发起计费请求
async function restoreRecentTask() {
  try {
    const response = await fetch('/api/tests', { cache: 'no-store' })
    if (!response.ok) return
    const payload = await response.json()
    const items: TestTask[] = payload.items || []
    const now = Date.now()
    const recent = items.filter((t) => {
      const created = Date.parse(t.createdAt)
      return Number.isFinite(created) && now - created < 30 * 60 * 1000
    })
    const runningTask = recent.find((t) => !['completed', 'failed'].includes(t.status))
    if (runningTask) {
      task.value = runningTask
      running.value = true
      attachMonitor(runningTask.id)
      return
    }
    const finished = recent.find((t) => t.status === 'completed' && t.result)
    if (finished) {
      // The history list omits HTML and preview data; restore the complete result.
      const detail = await fetch('/api/tests/' + encodeURIComponent(finished.id), { cache: 'no-store' })
      if (!detail.ok) return
      task.value = (await detail.json()).task
      if (!finished.input.demo) void verifyPublication(finished.id)
    }
  } catch {}
}

async function verifyPublication(id: string) {
  publishing.value = true
  publicationError.value = ''
  try {
    await confirmPublishedItem(id)
    if (task.value?.id === id) published.value = true
  } catch (caught) {
    if (task.value?.id === id) {
      published.value = false
      publicationError.value = caught instanceof Error ? caught.message : '未能确认作品已公开，请重试。'
    }
  } finally {
    if (task.value?.id === id) publishing.value = false
  }
}

async function publishResult() {
  if (!task.value || publishing.value) return
  const id = task.value.id
  publishing.value = true
  publicationError.value = ''
  try {
    const response = await fetch('/api/gallery/' + encodeURIComponent(id) + '/publish', { method: 'POST' })
    if (!response.ok) throw new Error('发布失败，请稍后再试。')
    await verifyPublication(id)
  } catch (caught) {
    publicationError.value = caught instanceof Error ? caught.message : '发布失败，请稍后重试。'
  } finally { publishing.value = false }
}

function openReport() {
  if (!task.value?.result) return
  reportItem.value = {
    id: task.value.id,
    code: task.value.code,
    title: task.value.result.title,
    benchmark: task.value.benchmark,
    model: task.value.input.model,
    mode: task.value.input.mode,
    effort: task.value.input.effort,
    source: task.value.input.source,
    createdAt: task.value.completedAt || new Date().toISOString(),
    latencyMs: task.value.result.latencyMs,
    inputTokens: task.value.result.inputTokens,
    outputTokens: task.value.result.outputTokens,
    cost: task.value.result.cost,
    previewImage: task.value.result.previewImage,
    html: task.value.result.html,
    answerText: task.value.result.answerText,
    published: published.value,
    likes: 0,
    abstracts: 0,
    fails: 0,
    prompt: task.value.prompt,
    verdict: task.value.result.verdict,
    analysis: task.value.result.analysis,
    inspections: task.value.result.inspections,
  }
  showReportModal.value = true
}
</script>

<template>
  <section class="workspace-head page-wrap">
    <span class="eyebrow">LIVE BENCHMARK</span>
    <h1>现场检测 · 到底是满血还是降智？</h1>
    <p>提供【鹈鹕骑行 (SVG 动画)】与【糖果测试 (盲抽鸽巢极值推理)】双轨现场深度检测。密钥仅内存使用，绝不落库。</p>
  </section>

  <!-- 现场检测顶部轮播区（标准vs失败 轮播 糖果测试推演基准） -->
  <section class="page-wrap carousel-container">
    <div class="carousel-track">
      <!-- 轮播卡片 1：OPAI 标准效果 vs 失败效果真实对拍 -->
      <div v-show="slideIndex === 0" class="gallery-promo carousel-slide">
        <div class="promo-copy">
          <div class="promo-brand-tag">
            <span>OPAI 模型商店</span>
          </div>
          <h2>标准 vs 失败，<br />看图就懂。</h2>
          <p class="promo-sub">店主 TIBO · 同名，同盒。GPT6 我的博士呢？</p>
          <div class="promo-action">
            <button class="button primary" type="button" @click="togglePromo">
              切换样本对比 ({{ promoIndex + 1 }}/{{ showcasePairs.length || 1 }}) <ArrowRight :size="15" />
            </button>
          </div>
        </div>

        <div v-if="showcaseLoading || showcaseError || !showcasePairs.length" class="showcase-state" role="status">
          <LoaderCircle v-if="showcaseLoading" class="spin" :size="22" />
          <span>{{ showcaseLoading ? '正在加载作品对比…' : showcaseError || '暂无作品对比' }}</span>
          <button v-if="showcaseError" class="button secondary" type="button" @click="loadShowcase(true)">重新加载</button>
        </div>
        <div v-else class="promo-showcase">
          <div class="showcase-card showcase-good">
            <div class="showcase-header">
              <span class="badge-good">标准效果</span>
              <span class="showcase-code">{{ currentPromo.good.desc }}</span>
            </div>
            <div class="showcase-art">
              <ArtworkFrame :key="currentPromo.good.previewImage || currentPromo.good.code" :html="currentPromo.good.html" :title="currentPromo.good.label" :preview-src="currentPromo.good.previewImage" interactive />
            </div>
            <div class="showcase-footer">
              <span>{{ currentPromo.good.model }}</span>
              <small>{{ currentPromo.good.time }}</small>
            </div>
          </div>

          <button class="promo-vs-btn" type="button" @click="togglePromo">
            <b>VS</b>
            <span>{{ promoIndex + 1 }}/{{ showcasePairs.length || 1 }}</span>
          </button>

          <div class="showcase-card showcase-bad">
            <div class="showcase-header">
              <span class="badge-bad">失败效果</span>
              <span class="showcase-code">{{ currentPromo.bad.desc }}</span>
            </div>
            <div class="showcase-art">
              <ArtworkFrame :key="currentPromo.bad.previewImage || currentPromo.bad.code" :html="currentPromo.bad.html" :title="currentPromo.bad.label" :preview-src="currentPromo.bad.previewImage" interactive />
            </div>
            <div class="showcase-footer">
              <span>{{ currentPromo.bad.model }}</span>
              <small>{{ currentPromo.bad.time }}</small>
            </div>
          </div>
        </div>

        <!-- 卡片内部悬浮切换指示条 -->
        <div class="slide-internal-nav">
          <div class="internal-dots">
            <button
              type="button"
              :class="['int-dot', { active: slideIndex === 0 }]"
              title="第1页：标准 vs 失败对拍"
              @click.stop="slideIndex = 0"
            ></button>
            <button
              type="button"
              :class="['int-dot', { active: slideIndex === 1 }]"
              title="第2页：糖果测试规则基准"
              @click.stop="slideIndex = 1"
            ></button>
          </div>
        </div>
      </div>

      <!-- 轮播卡片 2：糖果测试 · 逻辑极值推演基准 -->
      <div v-show="slideIndex === 1" class="candy-hero carousel-slide">
        <div class="hero-left">
          <div class="promo-brand-tag">
            <span>REASONING & PIGEONHOLE PRINCIPLE</span>
          </div>
          <h2>糖果测试 · 逻辑极值推演基准</h2>
          <p>
            针对大模型的极端盲抽概率推理基准题。通过多层约束与最坏情况（鸽巢抽屉原理）检验思维链是否真实展开，判定是否存在逻辑降智与套壳虚假推理。
          </p>
          <div class="stats-pills">
            <span>样本量 <b>{{ candyStats.total }}</b> 次</span>
            <span>满血通过率 <b>{{ formatPercent(candyStats.passRate) }}</b></span>
            <span>平均耗时 <b>{{ candyStats.avgLatency }}</b></span>
          </div>
        </div>

        <div class="candy-rule-card">
          <div class="rule-head">
            <Info :size="16" />
            <b>基准测试题与判定规则</b>
          </div>
          <p class="rule-body">
            黑色袋子中有苹果、桃子、西瓜三种口味的糖果，圆形与五角星形可以靠手感区分。最少取多少个，才能保证同时拥有不同形状的苹果味和桃子味糖果？
          </p>
          <div class="rule-table">
            <div class="table-row table-head">
              <span>形状</span><span>苹果味</span><span>桃子味</span><span>西瓜味</span>
            </div>
            <div class="table-row">
              <span>圆形</span><span>7</span><span>9</span><span>8</span>
            </div>
            <div class="table-row">
              <span>五角星形</span><span>7</span><span>6</span><span>4</span>
            </div>
          </div>
          <div class="rule-foot">
            <b>自动化判分依据：</b>经极值穷举计算，最不利上限累加后，答案必须包含独立的 <b>21</b> 判定为满血通过；未命中则判定为未通过（降智）。
          </div>
        </div>

        <!-- 卡片内部悬浮切换指示条 -->
        <div class="slide-internal-nav">
          <div class="internal-dots">
            <button
              type="button"
              :class="['int-dot', { active: slideIndex === 0 }]"
              title="第1页：标准 vs 失败对拍"
              @click.stop="slideIndex = 0"
            ></button>
            <button
              type="button"
              :class="['int-dot', { active: slideIndex === 1 }]"
              title="第2页：糖果测试规则基准"
              @click.stop="slideIndex = 1"
            ></button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 现场检测操作台 -->
  <section class="workspace page-wrap" :class="{ 'is-running': running }">
    <form class="test-panel" @submit.prevent="startTest">
      <header>
        <div><span class="panel-index">01</span><h2>检测配置</h2></div>
      </header>

      <!-- 双轨检测选择：鹈鹕骑行 / 糖果测试 / 自定义题目 -->
      <fieldset class="segmented-field">
        <legend>检测类别</legend>
        <div class="segmented segmented-three">
          <button type="button" :class="{ active: form.benchmark === 'pelican' }" @click="form.benchmark = 'pelican'">
            鹈鹕骑行 (SVG)
          </button>
          <button type="button" :class="{ active: form.benchmark === 'candy' }" @click="form.benchmark = 'candy'">
            糖果测试 (推理)
          </button>
          <button type="button" :class="{ active: form.benchmark === 'custom' }" @click="form.benchmark = 'custom'">
            自定义题目
          </button>
        </div>
      </fieldset>

      <!-- 鹈鹕题型模式：基准题 / 随机场景题 -->
      <fieldset v-if="form.benchmark === 'pelican'" class="segmented-field">
        <legend>基准与场景模式</legend>
        <div class="segmented">
          <button type="button" :class="{ active: form.mode === 'benchmark' }" @click="form.mode = 'benchmark'">基准固定题</button>
          <button type="button" :class="{ active: form.mode === 'random' }" @click="form.mode = 'random'">随机场景题</button>
        </div>
        <small class="mode-tip">
          {{ form.mode === 'benchmark' ? '所有模型使用同一套经典基准 Prompt，便于横向公平对比。' : '服务端动态加入随机场景（灯塔公路、麦田风车等）与配件色彩，检验多轮条件服从性。' }}
        </small>
      </fieldset>

      <!-- 自定义题目输入框 -->
      <label v-if="form.benchmark === 'custom'" class="form-field">
        <span>自定义测试提示词 (Prompt)</span>
        <textarea
          v-model="form.customPrompt"
          rows="4"
          class="custom-textarea"
          placeholder="请输入您要让模型执行的提示词指令..."
          required
        ></textarea>
        <small class="mode-tip">支持任意文本、逻辑问答、或 SVG/HTML 代码生成指令。</small>
      </label>

      <label class="form-field">
        <span>接口地址</span>
        <input v-model="form.endpoint" type="text" required placeholder="填写服务商的 /v1/responses 或 /v1/chat/completions 地址" />
      </label>

      <label class="form-field">
        <span>API Key <small>仅内存调用，不存数据库</small></span>
        <span class="input-with-icon">
          <KeyRound :size="17" />
          <input v-model="form.apiKey" :type="showKey ? 'text' : 'password'" required placeholder="sk-..." autocomplete="off" />
          <button type="button" :aria-label="showKey ? '隐藏密钥' : '显示密钥'" @click="showKey = !showKey">
            <EyeOff v-if="showKey" :size="17" />
            <Eye v-else :size="17" />
          </button>
        </span>
      </label>

      <div class="form-two-col">
        <label class="form-field">
          <span>模型名称</span>
          <input v-model="form.model" type="text" required placeholder="gpt-6-astra" />
        </label>
        <label class="form-field">
          <span>来源标识 (可选)</span>
          <input v-model="form.source" type="text" placeholder="如 AI8 / ZGSUDU" />
        </label>
      </div>

      <fieldset class="segmented-field effort-field">
        <legend>推理档位 (Reasoning Effort)</legend>
        <div class="segmented">
          <button v-for="effort in ['auto', 'low', 'medium', 'high', 'xhigh']" :key="effort" type="button" :class="{ active: form.effort === effort }" @click="form.effort = effort as typeof form.effort">
            {{ effortLabel(effort) }}
          </button>
        </div>
      </fieldset>

      <p v-if="error" class="error-note" role="alert"><CircleAlert :size="16" /> {{ error }}</p>

      <button class="button primary submit-button" type="submit" :disabled="!canSubmit">
        <LoaderCircle v-if="running" class="spin" :size="17" />
        <Send v-else :size="17" />
        {{ running ? '正在检测' : '开始现场检测' }}
        <ArrowRight :size="17" />
      </button>
    </form>

    <section class="result-panel" aria-live="polite">
      <header>
        <div>
          <span class="panel-index">02</span>
          <h2>评测结果与监控</h2>
        </div>
        <div v-if="task" class="header-badges">
          <span class="code-badge">#{{ task.code }}</span>
          <span :class="['status-badge', task.status]">{{ task.message }}</span>
        </div>
      </header>

      <div v-if="!task" class="empty-result">
        <div class="route-line"><span></span><i></i><span></span></div>
        <h3>等待发起评测</h3>
        <p>在左侧填入您的真实接口地址、API Key 与模型，点击开始评测。</p>
      </div>

      <template v-else>
        <div class="progress-block">
          <div class="progress-track"><i :style="{ width: `${task.progress}%` }"></i></div>
          <div class="step-row">
            <span v-for="step in statusSteps" :key="step[0]" :class="{ reached: reached(step[0]) }"><i></i>{{ step[1] }}</span>
          </div>
        </div>

        <div class="prompt-box">
          <div class="prompt-label"><b>测试提示词</b><span class="mode-tag">{{ task.benchmark === 'candy' ? '糖果测试' : task.benchmark === 'custom' ? '自定义题目' : '鹈鹕骑行' }}</span></div>
          <p>{{ task.prompt }}</p>
        </div>

        <div v-if="task.result" class="result-content">
          <div class="result-summary">
            <span>
              <CheckCircle2 v-if="task.result.verdict === 'passed'" class="icon-passed" :size="22" />
              <CircleAlert v-else-if="task.result.verdict === 'failed'" class="icon-failed" :size="22" />
              <b>{{ verdictText(task.result.verdict) }}</b>
              <small>{{ (task.result.latencyMs / 1000).toFixed(1) }} 秒</small>
            </span>
            <span>
              <b>{{ task.result.outputTokens ?? '—' }}</b>
              <small>输出 Token</small>
            </span>
            <span>
              <b>{{ effortLabel(task.input.effort) }}</b>
              <small>思考档位</small>
            </span>
            <span>
              <b>{{ task.input.source || '访客' }}</b>
              <small>来源</small>
            </span>
          </div>

          <!-- 鹈鹕骑行展示 -->
          <div v-if="task.benchmark === 'pelican' && task.result.html" class="artwork-container">
            <div class="verdict-bar" :class="task.result.verdict">
              <b>{{ '自动化质检：' + verdictText(task.result.verdict) }}</b>
              <span>{{ task.result.analysis }}</span>
            </div>
            <ArtworkFrame
              class="result-artwork"
              :html="task.result.html"
              :title="task.result.title"
              :preview-src="task.id ? `/api/gallery/${encodeURIComponent(task.id)}/preview` : undefined"
              interactive
            />

            <!-- 规则细则核对列表 -->
            <div v-if="task.result.inspections" class="test-inspections">
              <div v-for="(insp, i) in task.result.inspections" :key="i" class="test-insp-item">
                <span :class="['insp-badge', insp.passed ? 'pass' : 'fail']">{{ insp.passed ? '通过' : '未通过' }}</span>
                <b>{{ insp.name }}</b>
                <small>{{ insp.detail }}</small>
              </div>
            </div>
          </div>

          <!-- 糖果测试回答展示 -->
          <div v-else-if="task.benchmark === 'candy'" class="candy-result-display">
            <div class="candy-verdict-banner" :class="task.result.verdict">
              <b>{{ verdictText(task.result.verdict) }}</b>
              <span>{{ task.result.analysis }}</span>
            </div>
            <div v-if="task.result.inspections" class="test-inspections">
              <div v-for="(insp, i) in task.result.inspections" :key="i" class="test-insp-item">
                <span :class="['insp-badge', insp.passed ? 'pass' : 'fail']">{{ insp.passed ? '通过' : '未通过' }}</span>
                <b>{{ insp.name }}</b>
                <small>{{ insp.detail }}</small>
              </div>
            </div>
            <div class="candy-answer-card">
              <div class="answer-header">模型回答全文：</div>
              <pre class="answer-pre">{{ task.result.answerText }}</pre>
            </div>
          </div>

          <p v-if="publicationError" class="error-note" role="alert">{{ publicationError }}</p>
          <div class="result-actions">
            <RouterLink v-if="published" class="button secondary" :to="'/gallery?item=' + task.id">
              <CheckCircle2 :size="16" /> 已发布至作品墙 · 查看
            </RouterLink>
            <button v-else class="button secondary" type="button" :disabled="publishing" @click="publishResult">
              <UploadCloud :size="16" />{{ publishing ? '正在确认发布…' : '发布到作品墙' }}
            </button>
            <button class="button ghost-dark" type="button" @click="openReport">
              <FileImage :size="16" /> 生成图片战报
            </button>
            <RouterLink class="button ghost-dark" :to="`/compare?left=${task.id}`">
              同题对比
            </RouterLink>
          </div>
        </div>

        <div v-else-if="task.status === 'failed'" class="failed-result">
          <CircleAlert :size="28" />
          <h3>评测中断</h3>
          <p>{{ task.error }}</p>
        </div>

        <TaskLoading v-else :key="task.id" :task="task" :connection="connection" />
      </template>
    </section>
  </section>

  <!-- 战报弹窗 -->
  <ReportModal v-if="showReportModal && reportItem" :item="reportItem" @close="showReportModal = false" />
</template>

<style scoped>
.segmented-three {
  grid-template-columns: repeat(3, 1fr) !important;
}
.custom-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.5;
  resize: vertical;
}
.custom-textarea:focus {
  outline: 2px solid #0f172a;
}
.form-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.mode-tip {
  display: block;
  margin-top: 6px;
  font-size: 0.74rem;
  color: #64748b;
  line-height: 1.4;
}
.header-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}
.code-badge {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  background: #eef3ef;
  color: var(--ink);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
}
.prompt-box {
  background: #fbfcf9;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
}
.prompt-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.mode-tag {
  font-size: 0.72rem;
  font-weight: 600;
  background: var(--mint-pale);
  color: var(--green-deep);
  padding: 2px 8px;
  border-radius: 999px;
}
.prompt-box p {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ink-soft);
  line-height: 1.6;
}
.icon-passed {
  color: #166534;
}
.icon-failed {
  color: #dc2626;
}

.verdict-bar {
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.verdict-bar.passed {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}
.verdict-bar.failed {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}
.test-inspections {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}
.test-insp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
}
.insp-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
}
.insp-badge.pass {
  background: #dcfce7;
  color: #15803d;
}
.insp-badge.fail {
  background: #fee2e2;
  color: #b91c1c;
}
.test-insp-item b {
  color: #0f172a;
}
.test-insp-item small {
  color: #64748b;
  margin-left: auto;
}

.candy-result-display {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 16px 0;
}
.candy-verdict-banner {
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.candy-verdict-banner.passed {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}
.candy-verdict-banner.failed {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}
.candy-answer-card {
  border: 1px solid var(--line);
  background: #fafbfa;
  border-radius: 8px;
  padding: 14px 16px;
  max-height: 380px;
  overflow-y: auto;
}
.answer-header {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink-soft);
  margin-bottom: 8px;
}
.answer-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.65;
  color: var(--ink);
}

/* 轮播容器 */
.carousel-container {
  margin-top: 24px;
  position: relative;
}
.carousel-track {
  width: 100%;
}
.carousel-slide {
  margin: 0 !important;
  width: 100%;
  min-height: 380px;
}
.slide-internal-nav {
  position: absolute;
  right: 24px;
  bottom: 18px;
  display: flex;
  align-items: center;
  z-index: 20;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #cbd5e1;
  padding: 5px 12px;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.internal-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}
.internal-dots .int-dot {
  width: 16px;
  height: 4px;
  border-radius: 999px;
  background: #cbd5e1;
  border: 0;
  cursor: pointer;
  transition: all 0.2s ease;
}
.internal-dots .int-dot:hover {
  background: #94a3b8;
}
.internal-dots .int-dot.active {
  background: #0f172a;
  width: 26px;
}

/* 橱窗样式 */
.gallery-promo {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 36px;
  align-items: center;
  padding: 32px 36px 44px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.promo-brand-tag {
  font-size: 0.76rem;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 8px;
}
.promo-copy h1, .promo-copy h2 {
  margin: 0 0 10px;
  font-size: 2.1rem;
  line-height: 1.15;
  color: #0f172a;
}
.promo-sub {
  margin: 0 0 20px;
  color: #64748b;
  font-size: 0.88rem;
}
.promo-showcase {
  display: flex;
  align-items: center;
  gap: 14px;
}
.showcase-state {
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--space-2);
  color: var(--ink-soft);
}
.showcase-card {
  flex: 1;
  background: white;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.showcase-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  font-size: 0.75rem;
}
.badge-good {
  font-weight: 700;
  color: #166534;
  background: #f0fdf4;
  padding: 2px 6px;
  border-radius: 4px;
}
.badge-bad {
  font-weight: 700;
  color: #991b1b;
  background: #fef2f2;
  padding: 2px 6px;
  border-radius: 4px;
}
.showcase-code {
  color: #64748b;
  font-family: 'IBM Plex Mono', monospace;
}
.showcase-art {
  height: 180px;
  background: white;
}
.showcase-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--line);
  font-size: 0.75rem;
  font-weight: 600;
  color: #0f172a;
}
.promo-vs-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: #ffffff;
  cursor: pointer;
}
.promo-vs-btn b {
  font-size: 1.1rem;
}
.promo-vs-btn span {
  font-size: 0.68rem;
  color: #64748b;
}

/* 糖果规则卡片 */
.candy-hero {
  position: relative;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 32px;
  align-items: center;
  padding: 32px 36px 44px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.hero-left h2 {
  margin: 6px 0 10px;
  font-size: 1.5rem;
  color: #0f172a;
}
.hero-left p {
  color: #475569;
  font-size: 0.88rem;
  line-height: 1.6;
  margin-bottom: 16px;
}
.stats-pills {
  display: flex;
  gap: 10px;
}
.stats-pills span {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.78rem;
  color: #64748b;
}
.stats-pills b {
  color: #0f172a;
}

.candy-rule-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rule-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #0f172a;
  font-size: 0.88rem;
}
.rule-body {
  margin: 0;
  font-size: 0.82rem;
  color: #334155;
  line-height: 1.45;
}
.rule-table {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
  font-size: 0.76rem;
}
.table-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 5px 8px;
  border-bottom: 1px solid #f1f5f9;
}
.table-row:last-child {
  border-bottom: 0;
}
.table-head {
  background: #f1f5f9;
  font-weight: 700;
  color: #334155;
}
.rule-foot {
  font-size: 0.74rem;
  color: #64748b;
  line-height: 1.45;
}
.rule-foot b {
  color: #0f172a;
}
@media (max-width: 900px) {
  .gallery-promo, .candy-hero { grid-template-columns: minmax(0, 1fr); padding: 20px; }
  .promo-showcase { min-width: 0; }
  .showcase-card { min-width: 0; }
  .showcase-header, .showcase-footer { flex-wrap: wrap; }
  .stats-pills { flex-wrap: wrap; }
  .test-insp-item { flex-wrap: wrap; }
}
</style>
