<script setup lang="ts">
import { verdictText, verdictClass, formatDuration } from "../services/display"
import { invalidateAssessmentCache } from '../services/api'
import { onMounted, reactive, ref } from 'vue'
import {
  Activity,
  Bird,
  Check,
  CircleAlert,
  Clock,
  Download,
  Eye,
  Filter,
  Layers,
  LockKeyhole,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Sliders,
  Sparkles,
  Terminal,
  Trash2,
  UploadCloud,
  X,
  Zap
} from '@lucide/vue'
import ArtworkFrame from '../components/ArtworkFrame.vue'
import type { GalleryItem } from '../types'

type HomeConfig = {
  kicker: string
  title: string
  description: string
  primaryLabel: string
  primaryHref: string
  secondaryEnabled: boolean
  secondaryLabel: string
  secondaryHref: string
}

type BotConfig = {
  enabled: boolean
  intervalMinutes: number
  batchCount: number
  modelPool: string[]
  sourcePool: string[]
}

type SiteSettings = {
  testsEnabled: boolean
  demoEnabled: boolean
  defaultModel: string
  defaultEffort: string
  idleTimeoutSeconds: number
  maxOutputTokens: number
  maxConcurrent: number
  requestsPerTenMinutes: number
  pageSize: number
  pelicanPrompt: string
  randomScenes?: string[]
  randomAccents?: string[]
  brandName?: string
  brandSub?: string
  brandLogoUrl?: string
  showShowcase: boolean
  showDanmaku: boolean
  galleryTitle: string
  galleryDescription: string
  showcaseTitle: string
}

const token = ref(localStorage.getItem('pelican_admin_token') || '')
const error = ref('')
const homeMessage = ref('')
const galleryMessage = ref('')
const botMessage = ref('')
const settingsMessage = ref('')
const loading = ref(false)
const dispatching = ref(false)
const summary = ref<{ configured: boolean; quality: string; stats: { tasks: number; gallery: number; active: number; deleted: number } } | null>(null)

// 标签页：'dashboard' | 'brand' | 'tasks' | 'settings' | 'bot' | 'gallery' | 'home' | 'security'
const activeTab = ref<'dashboard' | 'brand' | 'tasks' | 'settings' | 'bot' | 'gallery' | 'home' | 'security'>('dashboard')

// 现场任务列表
const tasksList = ref<any[]>([])

// 在线预览弹窗
const previewModalItem = ref<GalleryItem | null>(null)

// 批量选择
const selectedItemIds = ref<string[]>([])

const home = reactive<HomeConfig>({
  kicker: '',
  title: '',
  description: '',
  primaryLabel: '',
  primaryHref: '',
  secondaryEnabled: false,
  secondaryLabel: '',
  secondaryHref: '',
})

const bot = reactive<BotConfig>({
  enabled: true,
  intervalMinutes: 10,
  batchCount: 1,
  modelPool: ['gpt-6-astra'],
  sourcePool: ['AI8', 'ZGSUDU', 'WANSHUABA', 'USELUNORA', 'PIFAAPI', 'DPDNS'],
})

const siteSettings = reactive<SiteSettings>({
  testsEnabled: true,
  demoEnabled: true,
  defaultModel: 'gpt-6-astra',
  defaultEffort: 'auto',
  idleTimeoutSeconds: 600,
  maxOutputTokens: 16000,
  maxConcurrent: 3,
  requestsPerTenMinutes: 12,
  pageSize: 24,
  pelicanPrompt: '',
  brandName: '鹈鹕妈妈',
  brandSub: 'PELICAN OBSERVATORY',
  brandLogoUrl: '',
  showShowcase: true,
  showDanmaku: true,
  galleryTitle: '作品墙',
  galleryDescription: '查看真实生成的作品、测试提示词与本地判定依据。',
  showcaseTitle: '正常与降智，看作品说话。',
})

const botModelsInput = ref('')
const botSourcesInput = ref('')

const randomScenesInput = ref('')
const randomAccentsInput = ref('')

const galleryList = ref<GalleryItem[]>([])
const gallerySearch = ref('')
const showDeleted = ref(false)
const galleryPage = ref(1)
const galleryTotal = ref(0)
const galleryPages = ref(1)

const newArtwork = reactive({
  title: '',
  model: 'gpt-6-astra',
  source: 'AI8',
  effort: 'low',
  latencyMs: 0,
  html: '',
})

function getAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  if (token.value) h['x-admin-token'] = token.value
  return h
}

async function load() {
  error.value = ''
  homeMessage.value = ''
  galleryMessage.value = ''
  botMessage.value = ''
  settingsMessage.value = ''
  loading.value = true
  try {
    const authHeaders = getAuthHeaders()
    const [summaryResponse, homeResponse, galleryResponse, botResponse, settingsResponse, tasksResponse] = await Promise.all([
      fetch('/api/admin/summary', { headers: authHeaders }),
      fetch('/api/admin/home', { headers: authHeaders }),
      fetch(`/api/admin/gallery?page=${galleryPage.value}&search=${encodeURIComponent(gallerySearch.value)}&deleted=${showDeleted.value ? '1' : '0'}`, { headers: authHeaders }),
      fetch('/api/admin/bot', { headers: authHeaders }),
      fetch('/api/admin/settings', { headers: authHeaders }),
      fetch('/api/admin/tasks', { headers: authHeaders }),
    ])
    const summaryPayload = await summaryResponse.json()
    const homePayload = await homeResponse.json()
    const galleryPayload = await galleryResponse.json()
    const botPayload = await botResponse.json()
    const settingsPayload = await settingsResponse.json()
    const tasksPayload = await tasksResponse.json()

    if (!summaryResponse.ok) throw new Error(summaryPayload.error || '管理员口令不正确')
    if (!homeResponse.ok) throw new Error(homePayload.error || '首页配置读取失败')

    // 登录成功，记忆 Token
    localStorage.setItem('pelican_admin_token', token.value)

    summary.value = summaryPayload
    Object.assign(home, homePayload.home)
    if (galleryResponse.ok) {
      galleryList.value = galleryPayload.items || []
      galleryTotal.value = galleryPayload.total || 0
      galleryPages.value = galleryPayload.pages || 1
    }
    if (botResponse.ok && botPayload.config) {
      Object.assign(bot, botPayload.config)
      botBatchCountInput.value = bot.batchCount || 1
      botModelsInput.value = bot.modelPool.join(', ')
      botSourcesInput.value = bot.sourcePool.join(', ')
    }
    if (settingsResponse.ok && settingsPayload.settings) {
      Object.assign(siteSettings, settingsPayload.settings)
      randomScenesInput.value = (siteSettings.randomScenes || []).join(', ')
      randomAccentsInput.value = (siteSettings.randomAccents || []).join(', ')
    }
    if (tasksResponse.ok && tasksPayload.items) {
      tasksList.value = tasksPayload.items || []
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '验证失败'
    summary.value = null
  } finally {
    loading.value = false
  }
}

function handleLogout() {
  localStorage.removeItem('pelican_admin_token')
  token.value = ''
  summary.value = null
}

async function saveSiteSettings() {
  settingsMessage.value = ''
  loading.value = true
  try {
    siteSettings.randomScenes = randomScenesInput.value.split(',').map((s) => s.trim()).filter(Boolean)
    siteSettings.randomAccents = randomAccentsInput.value.split(',').map((s) => s.trim()).filter(Boolean)

    const authHeaders = getAuthHeaders()
    const response = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify(siteSettings),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || '保存全局配置失败')
    Object.assign(siteSettings, payload.settings)
    settingsMessage.value = '全局核心参数配置已更新生效。'
  } catch (caught) {
    alert(caught instanceof Error ? caught.message : '保存失败')
  } finally {
    loading.value = false
  }
}

async function saveHome() {
  error.value = ''
  homeMessage.value = ''
  loading.value = true
  try {
    const authHeaders = getAuthHeaders()
    const response = await fetch('/api/admin/home', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify(home),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || '首页配置保存失败')
    Object.assign(home, payload.home)
    homeMessage.value = '首页展示文案已保存更新。'
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '保存失败'
  } finally {
    loading.value = false
  }
}

async function saveBot() {
  botMessage.value = ''
  loading.value = true
  try {
    bot.batchCount = Number(botBatchCountInput.value) || 1
    bot.modelPool = botModelsInput.value.split(',').map((s) => s.trim()).filter(Boolean)
    bot.sourcePool = botSourcesInput.value.split(',').map((s) => s.trim()).filter(Boolean)

    const authHeaders = getAuthHeaders()
    const res = await fetch('/api/admin/bot', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify(bot),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '保存失败')
    botMessage.value = '自动放单配置已保存并生效。'
  } catch (e) {
    alert(e instanceof Error ? e.message : '保存失败')
  } finally {
    loading.value = false
  }
}

const botBatchCountInput = ref(1)

async function triggerDispatchNow(count = 1) {
  dispatching.value = true
  try {
    const authHeaders = getAuthHeaders()
    const res = await fetch('/api/admin/bot/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify({ count }),
    })
    const data = await res.json()
    if (res.ok) {
      alert(`已即刻从历史样本池随机抽取并放单 ${data.count || 1} 条！编号 #${data.item?.code || data.items?.[0]?.code}`)
      await load()
    } else {
      alert(data.error || '放单失败')
    }
  } catch (e) {
    console.error(e)
    alert('放单网络请求异常')
  } finally {
    dispatching.value = false
  }
}

async function addCustomArtwork() {
  galleryMessage.value = ''
  if (!newArtwork.title || !newArtwork.html) {
    alert('请填写标题与完整的内联 SVG / HTML 源码')
    return
  }
  loading.value = true
  try {
    const authHeaders = getAuthHeaders()
    const res = await fetch('/api/admin/gallery', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify(newArtwork),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '添加失败')
    galleryMessage.value = '已成功添加到站内作品库！'
    newArtwork.title = ''
    newArtwork.html = ''
    await load()
  } catch (e) {
    alert(e instanceof Error ? e.message : '添加失败')
  } finally {
    loading.value = false
  }
}

async function rejudgeArtwork(id: string) {
  try {
    const authHeaders = getAuthHeaders()
    const res = await fetch(`/api/admin/gallery/${id}/rejudge`, {
      method: 'POST',
      headers: authHeaders,
    })
    const data = await res.json()
    if (res.ok) {
      invalidateAssessmentCache()
      alert(`质检重新评定完成！当前评级：${verdictText(data.item.verdict)}`)
      await load()
    } else {
      alert(data.error || '重新评定失败')
    }
  } catch (e) {
    console.error(e)
  }
}

async function deleteArtwork(id: string) {
  if (!confirm('确定将此作品标记为移除吗？可在已移除列表中随时恢复。')) return
  try {
    const authHeaders = getAuthHeaders()
    const res = await fetch(`/api/admin/gallery/${id}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    if (res.ok) {
      await load()
    }
  } catch (e) {
    console.error(e)
  }
}

async function restoreArtwork(id: string) {
  try {
    const authHeaders = getAuthHeaders()
    const res = await fetch(`/api/admin/gallery/${id}/restore`, {
      method: 'POST',
      headers: authHeaders,
    })
    if (res.ok) {
      await load()
    }
  } catch (e) {
    console.error(e)
  }
}

function toggleSelectAll() {
  if (selectedItemIds.value.length === galleryList.value.length) {
    selectedItemIds.value = []
  } else {
    selectedItemIds.value = galleryList.value.map((i) => i.id)
  }
}

async function batchDelete() {
  if (!selectedItemIds.value.length) return
  if (!confirm(`确定批量下架选中的 ${selectedItemIds.value.length} 个作品吗？`)) return
  loading.value = true
  try {
    const authHeaders = getAuthHeaders()
    await Promise.all(
      selectedItemIds.value.map((id) =>
        fetch(`/api/admin/gallery/${id}`, { method: 'DELETE', headers: authHeaders })
      )
    )
    selectedItemIds.value = []
    await load()
  } finally {
    loading.value = false
  }
}

async function batchRestore() {
  if (!selectedItemIds.value.length) return
  loading.value = true
  try {
    const authHeaders = getAuthHeaders()
    await Promise.all(
      selectedItemIds.value.map((id) =>
        fetch(`/api/admin/gallery/${id}/restore`, { method: 'POST', headers: authHeaders })
      )
    )
    selectedItemIds.value = []
    await load()
  } finally {
    loading.value = false
  }
}

async function clearAllTasks() {
  if (!confirm('确定清空所有现场历史调用任务记录吗？（不影响已生成的作品）')) return
  try {
    const authHeaders = getAuthHeaders()
    const res = await fetch('/api/admin/gallery/clear-tasks', { method: 'POST', headers: authHeaders })
    if (res.ok) {
      alert('历史测试任务已清空！')
      await load()
    }
  } catch (e) {
    console.error(e)
  }
}

async function clearDanmaku() {
  if (!confirm('确定清空作品墙所有弹幕留言吗？')) return
  try {
    const authHeaders = getAuthHeaders()
    const res = await fetch('/api/admin/danmaku/clear', { method: 'POST', headers: authHeaders })
    if (res.ok) {
      alert('弹幕库已清空！')
      await load()
    }
  } catch (e) {
    console.error(e)
  }
}

function openPreview(item: GalleryItem) {
  previewModalItem.value = item
}

function handleExportBackup() {
  const tokenVal = encodeURIComponent(token.value)
  window.open(`/api/admin/export?token=${tokenVal}`, '_blank')
}

onMounted(() => {
  if (token.value) {
    load()
  }
})
</script>

<template>
  <section class="page-title page-wrap">
    <span class="eyebrow">ADMINISTRATION CONSOLE</span>
    <div class="title-row">
      <div>
        <h1>后台管理与参数控制</h1>
        <p>站内核心参数、公共样本库、自动放单排期与页面文案统一管理中心。</p>
      </div>
      <div v-if="summary" class="admin-top-actions">
        <button class="button ghost" type="button" @click="handleExportBackup">
          <Download :size="15" /> 导出完整数据备份
        </button>
        <button class="button ghost-dark" type="button" @click="handleLogout">
          <LogOut :size="15" /> 退出管理
        </button>
      </div>
    </div>
  </section>

  <section class="admin-shell page-wrap">
    <!-- 登录面板 -->
    <div v-if="!summary" class="login-wrapper">
      <form class="admin-login-card" @submit.prevent="load">
        <div class="lock-icon-box"><LockKeyhole :size="26" /></div>
        <h2>管理员访问验证</h2>
        <p class="login-desc">请输入管理员口令 (ADMIN_TOKEN) 解锁后台控制台</p>

        <label class="form-field login-field">
          <span>管理员口令</span>
          <input
            v-model="token"
            type="password"
            placeholder="请输入管理员访问口令"
            required
            autocomplete="current-password"
          />
        </label>

        <p v-if="error" class="error-note">{{ error }}</p>

        <button class="button primary login-btn" type="submit" :disabled="loading">
          <RefreshCw v-if="loading" class="spin" :size="16" />
          {{ loading ? '正在验证…' : '验证并进入控制台' }}
        </button>
      </form>
    </div>

    <!-- 管理员控制台 -->
    <div v-else class="admin-dashboard">
      <!-- 顶部数据概览 Tile -->
      <div class="summary-tiles">
        <article class="dash-tile">
          <div class="tile-icon"><Activity :size="20" /></div>
          <div class="tile-body">
            <span>现场评测总任务</span>
            <b>{{ summary.stats.tasks }}</b>
          </div>
          <small class="tile-sub">包含用户主动发起的测试</small>
        </article>

        <article class="dash-tile">
          <div class="tile-icon"><Layers :size="20" /></div>
          <div class="tile-body">
            <span>公共作品库总样本</span>
            <b>{{ summary.stats.gallery }}</b>
          </div>
          <small class="tile-sub">当前展示作品存量</small>
        </article>

        <article class="dash-tile">
          <div class="tile-icon"><Sparkles :size="20" /></div>
          <div class="tile-body">
            <span>正在执行席位</span>
            <b>{{ summary.stats.active }}</b>
          </div>
          <small class="tile-sub">并发通道负载占用</small>
        </article>

        <article class="dash-tile">
          <div class="tile-icon"><Trash2 :size="20" /></div>
          <div class="tile-body">
            <span>已下架 / 软删除样本</span>
            <b>{{ summary.stats.deleted }}</b>
          </div>
          <small class="tile-sub">可随时恢复的备份</small>
        </article>
      </div>

      <!-- 功能标签切换栏 -->
      <div class="admin-nav-tabs">
        <button
          type="button"
          :class="['admin-tab-btn', { active: activeTab === 'dashboard' }]"
          @click="activeTab = 'dashboard'"
        >
          <Sliders :size="16" /> 全局参数配置
        </button>
        <button
          type="button"
          :class="['admin-tab-btn', { active: activeTab === 'brand' }]"
          @click="activeTab = 'brand'"
        >
          <Sparkles :size="16" /> 品牌外观与Logo定制
        </button>
        <button
          type="button"
          :class="['admin-tab-btn', { active: activeTab === 'tasks' }]"
          @click="activeTab = 'tasks'"
        >
          <Terminal :size="16" /> 任务队列监控 ({{ tasksList.length }})
        </button>
        <button
          type="button"
          :class="['admin-tab-btn', { active: activeTab === 'gallery' }]"
          @click="activeTab = 'gallery'"
        >
          <Layers :size="16" /> 样本库管理 ({{ galleryTotal }})
        </button>
        <button
          type="button"
          :class="['admin-tab-btn', { active: activeTab === 'bot' }]"
          @click="activeTab = 'bot'"
        >
          <Zap :size="16" /> 自动放单系统
        </button>
        <button
          type="button"
          :class="['admin-tab-btn', { active: activeTab === 'home' }]"
          @click="activeTab = 'home'"
        >
          <Settings :size="16" /> 首页文案配置
        </button>
        <button
          type="button"
          :class="['admin-tab-btn', { active: activeTab === 'security' }]"
          @click="activeTab = 'security'"
        >
          <LockKeyhole :size="16" /> 安全与网关控制
        </button>
      </div>

      <!-- 标签 1：全局核心参数设置 -->
      <section v-show="activeTab === 'dashboard'" class="admin-card">
        <div class="editor-heading">
          <div>
            <span class="eyebrow">SYSTEM SETTINGS</span>
            <h2>全局运行与评测参数配置</h2>
          </div>
          <span v-if="settingsMessage" class="save-state"><Check :size="15" /> {{ settingsMessage }}</span>
        </div>
        <p class="admin-tip">直接配置测试开关、超时时限、频率限制、默认基准 Prompt 等核心规则。</p>

        <form class="seed-form" @submit.prevent="saveSiteSettings">
          <div class="switches-card">
            <div class="switches-list">
              <label class="switch-item">
                <input v-model="siteSettings.testsEnabled" type="checkbox" />
                <span><b>开放公共现场检测</b> (取消后访客将无法发起新测试)</span>
              </label>
              <label class="switch-item">
                <input v-model="siteSettings.showShowcase" type="checkbox" />
                <span><b>展示现场对拍橱窗</b> (顶部 Standard vs Degraded 对比展台)</span>
              </label>
              <label class="switch-item">
                <input v-model="siteSettings.showDanmaku" type="checkbox" />
                <span><b>展示弹幕互动系统</b> (作品墙底部实时弹幕飘过)</span>
              </label>
            </div>
            <div class="danmaku-action-row">
              <span class="danmaku-status-tip">弹幕数据管理：</span>
              <button class="sm-btn delete-clean" type="button" @click="clearDanmaku">
                <Trash2 :size="13" /> 一键清空所有弹幕历史
              </button>
            </div>
          </div>

          <div class="editor-three-col">
            <label class="form-field">
              <span>默认测试模型</span>
              <input v-model="siteSettings.defaultModel" required />
            </label>
            <label class="form-field">
              <span>最大并发评测数 (1-10)</span>
              <input v-model.number="siteSettings.maxConcurrent" type="number" min="1" max="10" required />
            </label>
            <label class="form-field">
              <span>单 IP 限流 (次/10分钟)</span>
              <input v-model.number="siteSettings.requestsPerTenMinutes" type="number" min="1" max="100" required />
            </label>
          </div>

          <div class="editor-two-col">
            <label class="form-field">
              <span>流式响应空闲超时 (秒)</span>
              <input v-model.number="siteSettings.idleTimeoutSeconds" type="number" min="30" max="3600" required />
            </label>
            <label class="form-field">
              <span>单次生成最大 Output Tokens</span>
              <input v-model.number="siteSettings.maxOutputTokens" type="number" min="1024" max="128000" required />
            </label>
          </div>

          <label class="form-field">
            <span>默认基准测试 Prompt（固定题标准指令）</span>
            <textarea
              v-model="siteSettings.pelicanPrompt"
              rows="4"
              class="textarea-box"
              required
            ></textarea>
            <small class="field-hint">所有选择“基准题/固定题”时都会使用此标准指令。</small>
          </label>

          <div class="editor-two-col">
            <label class="form-field">
              <span>随机场景词库 (英文逗号分隔)</span>
              <input v-model="randomScenesInput" placeholder="海边的灯塔公路, 黄昏的盐湖小道, 春日的风车田野" />
              <small class="field-hint">用户选择“随机题”时随机从中抽取场景拼接。</small>
            </label>
            <label class="form-field">
              <span>随机配件与色彩词库 (英文逗号分隔)</span>
              <input v-model="randomAccentsInput" placeholder="蓝色围巾, 绿色车篮, 橙色骑行帽, 紫色水壶" />
              <small class="field-hint">用户选择“随机题”时随机从中抽取配件拼接。</small>
            </label>
          </div>

          <div class="editor-two-col">
            <label class="form-field">
              <span>作品墙标题</span>
              <input v-model="siteSettings.galleryTitle" required />
            </label>
            <label class="form-field">
              <span>作品墙副标题说明</span>
              <input v-model="siteSettings.galleryDescription" required />
            </label>
          </div>

          <button class="button primary admin-save-btn" type="submit" :disabled="loading">
            <Save :size="15" /> 保存全局参数
          </button>
        </form>
      </section>

      <!-- 标签 2：品牌外观与 Logo 专属配置 -->
      <section v-show="activeTab === 'brand'" class="admin-card">
        <div class="editor-heading">
          <div>
            <span class="eyebrow">BRAND & IDENTITY</span>
            <h2>品牌形象与 Logo 图标定制</h2>
          </div>
          <span v-if="settingsMessage" class="save-state"><Check :size="15" /> {{ settingsMessage }}</span>
        </div>
        <p class="admin-tip">实时定制全站左上角与底部页脚的品牌名、副标及图标。支持使用自带鸟类图标、远程图片 URL，或一键导入 Base64/SVG。</p>

        <form class="seed-form" @submit.prevent="saveSiteSettings">
          <!-- 实时预览预览框 -->
          <div class="brand-preview-hero">
            <div class="preview-hero-label">顶栏实时渲染效果预览</div>
            <div class="preview-hero-bar">
              <div class="preview-brand-unit">
                <span class="preview-logo-box">
                  <img v-if="siteSettings.brandLogoUrl" :src="siteSettings.brandLogoUrl" :alt="siteSettings.brandName" class="brand-img-preview" />
                  <Bird v-else :size="26" stroke-width="1.8" />
                </span>
                <span class="preview-brand-texts">
                  <b>{{ siteSettings.brandName || '鹈鹕妈妈' }}</b>
                  <small>{{ siteSettings.brandSub || 'PELICAN OBSERVATORY' }}</small>
                </span>
              </div>
              <div class="preview-mock-nav">
                <span>首页</span>
                <span>现场检测</span>
                <span>作品墙</span>
              </div>
            </div>
          </div>

          <div class="editor-two-col">
            <label class="form-field">
              <span>全站品牌名称 (Main Brand Name)</span>
              <input v-model="siteSettings.brandName" placeholder="例如：鹈鹕妈妈" required />
            </label>
            <label class="form-field">
              <span>副标题 / 英文小标 (Sub Kicker)</span>
              <input v-model="siteSettings.brandSub" placeholder="例如：PELICAN OBSERVATORY" />
            </label>
          </div>

          <label class="form-field">
            <span>Logo 图标地址 / URL 或 DataURI</span>
            <input
              v-model="siteSettings.brandLogoUrl"
              placeholder="例如：/logo.svg、https://example.com/logo.png 或 data:image/svg+xml;base64,... （留空则展示默认鹈鹕图标）"
            />
            <small class="field-hint">支持 SVG、PNG、WebP、JPG 链接或 Base64 编码；若清空此项，系统将自动回退为默认的精美鹈鹕矢量图标。</small>
          </label>

          <div class="logo-presets-row">
            <span>快捷预设或操作：</span>
            <button class="button ghost-dark sm-btn" type="button" @click="siteSettings.brandLogoUrl = '/logo.png'">
              使用根目录定制大嘴鹈鹕 Logo (/logo.png)
            </button>
            <button class="button ghost-dark sm-btn" type="button" @click="siteSettings.brandLogoUrl = ''">
              还原矢量鹈鹕图标
            </button>
          </div>

          <button class="button primary admin-save-btn" type="submit" :disabled="loading">
            <Save :size="15" /> 保存品牌与 Logo 设置
          </button>
        </form>
      </section>

      <!-- 标签：现场任务队列监控 -->
      <section v-show="activeTab === 'tasks'" class="admin-card">
        <div class="editor-heading">
          <div>
            <span class="eyebrow">TASK QUEUE & STREAM MONITOR</span>
            <h2>现场测试任务实时监控</h2>
          </div>
          <div class="task-head-btns">
            <button class="button ghost" type="button" @click="load">
              <RefreshCw :class="{ spin: loading }" :size="14" /> 刷新任务
            </button>
            <button class="button ghost-dark" type="button" @click="clearAllTasks">
              <Trash2 :size="14" /> 清空历史任务
            </button>
          </div>
        </div>
        <p class="admin-tip">展示最近 100 次访客与系统发起的真实调用状态、所用模型、流式进度与判定结果。</p>

        <div class="admin-table-wrap">
          <table class="admin-data-table">
            <thead>
              <tr>
                <th style="width: 80px;">编号</th>
                <th>题型</th>
                <th>模型</th>
                <th>状态与进度</th>
                <th>耗时</th>
                <th>判定结果</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in tasksList" :key="t.id">
                <td><code class="code-pill">#{{ t.code }}</code></td>
                <td>{{ t.benchmark === 'candy' ? '糖果测试' : t.benchmark === 'custom' ? '自定义题目' : '鹈鹕骑行' }}</td>
                <td><b>{{ t.input.model }}</b></td>
                <td>
                  <span :class="['task-status-pill', t.status]">
                    {{ t.status }} ({{ t.progress }}%)
                  </span>
                  <small class="task-msg">{{ t.message }}</small>
                </td>
                <td>{{ formatDuration(t.result?.latencyMs) }}</td>
                <td>
                  <span v-if="t.result" :class="['status-pill', verdictClass(t.result.verdict)]">
                    {{ verdictText(t.result.verdict) }}
                  </span>
                  <span v-else-if="t.error" class="error-badge" :title="t.error">报错</span>
                  <span v-else class="pending-badge">进行中</span>
                </td>
                <td><small>{{ t.createdAt }}</small></td>
              </tr>
              <tr v-if="tasksList.length === 0">
                <td colspan="7" class="table-empty">当前暂无近期任务流水</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 标签 2：样本库管理与导入 -->
      <section v-show="activeTab === 'gallery'" class="admin-card">
        <div class="editor-heading">
          <div>
            <span class="eyebrow">GALLERY MANAGEMENT</span>
            <h2>公共样本库管理与导入</h2>
          </div>
          <span v-if="galleryMessage" class="save-state"><Check :size="15" /> {{ galleryMessage }}</span>
        </div>
        <p class="admin-tip">管理当前已收录的样本、支持关键词检索、快速重新运行本地多帧质检，以及将外部通过代码手动录入。</p>

        <!-- 样本搜索与过滤工具条 -->
        <div class="gallery-admin-toolbar">
          <div class="search-input-wrap">
            <Search :size="16" />
            <input
              v-model="gallerySearch"
              placeholder="搜索标题、模型、编号、来源..."
              @keydown.enter.prevent="load"
            />
          </div>
          <label class="deleted-toggle">
            <input v-model="showDeleted" type="checkbox" @change="load" />
            <span>查看已下架作品</span>
          </label>
          <button class="button ghost" type="button" @click="load">
            <Filter :size="14" /> 筛选 / 刷新
          </button>
        </div>

        <!-- 批量操作栏 -->
        <div v-if="selectedItemIds.length" class="batch-bar">
          <span>已选中 <b>{{ selectedItemIds.length }}</b> 个作品</span>
          <button v-if="!showDeleted" class="button ghost-dark" type="button" @click="batchDelete">
            <Trash2 :size="14" /> 批量标记移除
          </button>
          <button v-else class="button ghost-dark" type="button" @click="batchRestore">
            <RotateCcw :size="14" /> 批量恢复上架
          </button>
        </div>

        <!-- 样本列表表格 -->
        <div class="admin-table-wrap">
          <table class="admin-data-table">
            <thead>
              <tr>
                <th style="width: 40px;">
                  <input
                    type="checkbox"
                    :checked="selectedItemIds.length === galleryList.length && galleryList.length > 0"
                    @change="toggleSelectAll"
                  />
                </th>
                <th style="width: 80px;">编号</th>
                <th>作品标题</th>
                <th>模型与来源</th>
                <th style="width: 100px;">质检状态</th>
                <th style="width: 100px;">生成耗时</th>
                <th style="width: 220px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in galleryList" :key="item.id">
                <td>
                  <input
                    type="checkbox"
                    :value="item.id"
                    v-model="selectedItemIds"
                  />
                </td>
                <td><code class="code-pill">#{{ item.code }}</code></td>
                <td>
                  <b class="clickable-title" @click="openPreview(item)">{{ item.title }}</b>
                </td>
                <td>
                  <span>{{ item.model }} · {{ item.source || '访客' }}</span>
                </td>
                <td>
                  <span :class="['status-pill', verdictClass(item.verdict)]">
                    {{ verdictText(item.verdict) }}
                  </span>
                </td>
                <td>{{ formatDuration(item.latencyMs) }}</td>
                <td>
                  <div class="table-actions">
                    <button class="sm-btn preview" type="button" title="直接在线预览画面与源码" @click="openPreview(item)">
                      <Eye :size="13" /> 预览
                    </button>
                    <button class="sm-btn rejudge" type="button" title="重新跑本地渲染质检" @click="rejudgeArtwork(item.id)">
                      <RefreshCw :size="13" /> 复检
                    </button>
                    <button
                      v-if="!showDeleted"
                      class="sm-btn delete"
                      type="button"
                      title="标记下架"
                      @click="deleteArtwork(item.id)"
                    >
                      <Trash2 :size="13" /> 移除
                    </button>
                    <button
                      v-else
                      class="sm-btn restore"
                      type="button"
                      title="恢复上架"
                      @click="restoreArtwork(item.id)"
                    >
                      <RotateCcw :size="13" /> 恢复
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="galleryList.length === 0">
                <td colspan="6" class="table-empty">没有匹配的样本</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div v-if="galleryPages > 1" class="admin-pagination">
          <span>共 {{ galleryTotal }} 件作品 · 第 {{ galleryPage }} / {{ galleryPages }} 页</span>
          <div class="page-btns">
            <button
              class="button ghost"
              type="button"
              :disabled="galleryPage <= 1"
              @click="galleryPage = Math.max(1, galleryPage - 1); load()"
            >
              上一页
            </button>
            <button
              class="button ghost"
              type="button"
              :disabled="galleryPage >= galleryPages"
              @click="galleryPage = Math.min(galleryPages, galleryPage + 1); load()"
            >
              下一页
            </button>
          </div>
        </div>

        <!-- 手动导入表单卡片 -->
        <div class="manual-import-box">
          <h3><Plus :size="17" /> 手动导入完整 HTML / SVG 源码</h3>
          <form class="seed-form" @submit.prevent="addCustomArtwork">
            <div class="editor-two-col">
              <label class="form-field">
                <span>作品标题</span>
                <input v-model="newArtwork.title" placeholder="例如：海风慢骑 · 沿海公路" required />
              </label>
              <label class="form-field">
                <span>模型名称</span>
                <input v-model="newArtwork.model" required />
              </label>
            </div>
            <div class="editor-two-col">
              <label class="form-field">
                <span>测试来源标识</span>
                <input v-model="newArtwork.source" placeholder="例如：AI8 / USELUNORA" required />
              </label>
              <label class="form-field">
                <span>生成耗时 (毫秒)</span>
                <input v-model.number="newArtwork.latencyMs" type="number" min="0" required />
              </label>
            </div>
            <label class="form-field">
              <span>单文件 HTML / 内联 SVG 源码</span>
              <textarea
                v-model="newArtwork.html"
                rows="6"
                class="textarea-box"
                placeholder="<!doctype html><html>... 包含完整内联 SVG 动画代码"
                required
              ></textarea>
            </label>
            <button class="button primary" type="submit" :disabled="loading">
              <Plus :size="15" /> 自动质检并导入公共库
            </button>
          </form>
        </div>
      </section>

      <!-- 标签 3：自动放单系统 -->
      <section v-show="activeTab === 'bot'" class="admin-card">
        <div class="editor-heading">
          <div>
            <span class="eyebrow">AUTOMATION DISPATCH</span>
            <h2>自动放单系统设置（保持作品库活跃）</h2>
          </div>
          <span v-if="botMessage" class="save-state"><Check :size="15" /> {{ botMessage }}</span>
        </div>
        <p class="admin-tip">
          开启后，服务端将按照设定时间间隔自动向作品库放单。<b>核心机制：完全复用历史真实调用结果与站内样本库的真实代码/答卷</b>，对编号、模型池、测试来源、思考档位、生成耗时（80s~180s）、Token 消耗与费用进行完全随机化仿真，保持作品库生态活跃。
        </p>

        <form class="seed-form" @submit.prevent="saveBot">
          <div class="switch-row">
            <input v-model="bot.enabled" type="checkbox" id="bot-toggle" />
            <label for="bot-toggle"><b>开启自动定时放单服务</b></label>
          </div>

          <div class="editor-three-col">
            <label class="form-field">
              <span>放单间隔时间 (分钟)</span>
              <input v-model.number="bot.intervalMinutes" type="number" min="1" max="1440" required />
            </label>
            <label class="form-field">
              <span>每次自动放单数量 (条)</span>
              <input v-model.number="botBatchCountInput" type="number" min="1" max="50" required />
            </label>
            <div class="dispatch-action-col">
              <span class="field-label">即刻手动放单</span>
              <div class="quick-batch-btns">
                <button class="button ghost-dark sm-btn" type="button" :disabled="dispatching" @click="triggerDispatchNow(1)">
                  +1条
                </button>
                <button class="button ghost-dark sm-btn" type="button" :disabled="dispatching" @click="triggerDispatchNow(5)">
                  +5条
                </button>
                <button class="button ghost-dark sm-btn" type="button" :disabled="dispatching" @click="triggerDispatchNow(10)">
                  +10条
                </button>
              </div>
            </div>
          </div>

          <label class="form-field">
            <span>随机模型分配池 (英文逗号分隔，放单时随机抽取并标注)</span>
            <input v-model="botModelsInput" placeholder="gpt-6-astra, gpt-5.5, claude-3-7-sonnet, deepseek-r1" required />
          </label>

          <label class="form-field">
            <span>随机来源分配池 (英文逗号分隔，放单时随机抽取并标注)</span>
            <input v-model="botSourcesInput" placeholder="AI8, ZGSUDU, WANSHUABA, USELUNORA, PIFAAPI, DPDNS, WAWAZZ" required />
          </label>

          <button class="button primary" type="submit" :disabled="loading">
            <Save :size="15" /> 保存自动放单策略
          </button>
        </form>
      </section>

      <!-- 标签 4：首页文案配置 -->
      <section v-show="activeTab === 'home'" class="admin-card">
        <div class="editor-heading">
          <div>
            <span class="eyebrow">HOMEPAGE CONTENT</span>
            <h2>首页文案与按钮配置</h2>
          </div>
          <span v-if="homeMessage" class="save-state"><Check :size="15" /> {{ homeMessage }}</span>
        </div>
        <p class="admin-tip">在线自定义首页大标题、眉标与快捷操作链接。</p>

        <form class="seed-form" @submit.prevent="saveHome">
          <label class="form-field">
            <span>顶部眉标标签</span>
            <input v-model="home.kicker" required />
          </label>
          <label class="form-field">
            <span>主标题</span>
            <input v-model="home.title" required />
          </label>
          <label class="form-field">
            <span>说明文字</span>
            <textarea v-model="home.description" rows="3" class="textarea-box" required></textarea>
          </label>
          <div class="editor-two-col">
            <label class="form-field">
              <span>主按钮文案</span>
              <input v-model="home.primaryLabel" required />
            </label>
            <label class="form-field">
              <span>主按钮链接</span>
              <input v-model="home.primaryHref" required />
            </label>
          </div>
          <div class="switch-row">
            <input v-model="home.secondaryEnabled" type="checkbox" id="sec-toggle" />
            <label for="sec-toggle"><b>展示副按钮</b></label>
          </div>
          <div v-if="home.secondaryEnabled" class="editor-two-col">
            <label class="form-field">
              <span>副按钮文案</span>
              <input v-model="home.secondaryLabel" />
            </label>
            <label class="form-field">
              <span>副按钮链接</span>
              <input v-model="home.secondaryHref" />
            </label>
          </div>
          <button class="button primary" type="submit" :disabled="loading">
            <Save :size="15" /> 保存首页文案
          </button>
        </form>
      </section>

      <!-- 标签 5：安全与网关控制面板 -->
      <section v-show="activeTab === 'security'" class="admin-card">
        <div class="editor-heading">
          <div>
            <span class="eyebrow">GATEWAY & ACCESS SECURITY</span>
            <h2>安全与网关控制状态</h2>
          </div>
          <span class="save-state"><Check :size="15" /> 保护状态正常</span>
        </div>
        <p class="admin-tip">系统当前网络门禁、CORS 与鉴权机制的实时监控状态。</p>

        <div class="security-matrix-grid">
          <div class="sec-card">
            <b>CORS 全域放行机制</b>
            <span class="sec-status active">已启用 (全开放)</span>
            <p>支持任意合法第三方域名、中转代理与开发端口发起 Benchmark 测试请求。</p>
          </div>
          <div class="sec-card">
            <b>SSRF 内网穿透防御</b>
            <span class="sec-status active">已启用 (严格拦截)</span>
            <p>基于 ipaddr.js 解析所有测试 Base URL，坚决禁止请求本地或私有保留内网 IP。</p>
          </div>
          <div class="sec-card">
            <b>沙箱隔离保护 (IFrame Sandbox)</b>
            <span class="sec-status active">已启用 (严格隔离)</span>
            <p>所有模型生成的 HTML/SVG 均运行在隔离沙箱 iframe 中，禁止篡改宿主 DOM 与窃取凭据。</p>
          </div>
          <div class="sec-card">
            <b>后台管理鉴权机制</b>
            <span class="sec-status active">已保护 (常量时延匹配)</span>
            <p>基于 crypto.timingSafeEqual 安全校验 ADMIN_TOKEN，防止侧信道时序攻击。</p>
          </div>
        </div>
      </section>
    </div>

    <!-- 作品在线快捷预览弹窗 -->
    <div v-if="previewModalItem" class="admin-preview-overlay" @click.self="previewModalItem = null">
      <div class="admin-preview-dialog">
        <header class="preview-dialog-head">
          <div>
            <b>{{ previewModalItem.title }}</b>
            <code class="code-pill">#{{ previewModalItem.code }}</code>
            <small>{{ previewModalItem.model }} · {{ formatDuration(previewModalItem.latencyMs) }}</small>
          </div>
          <button class="icon-close-btn" type="button" @click="previewModalItem = null">
            <X :size="18" />
          </button>
        </header>

        <div class="preview-dialog-art">
          <ArtworkFrame
            v-if="previewModalItem.benchmark === 'pelican' && previewModalItem.html"
            :html="previewModalItem.html"
            :title="previewModalItem.title"
            interactive
          />
          <div v-else class="preview-candy-text">
            <pre>{{ previewModalItem.answerText }}</pre>
          </div>
        </div>

        <div class="preview-dialog-meta">
          <div class="meta-row">
            <span>质检结论：<b>{{ verdictText(previewModalItem.verdict) }}</b></span>
            <span>输入 Token：{{ previewModalItem.inputTokens ?? '—' }}</span>
            <span>输出 Token：{{ previewModalItem.outputTokens ?? '—' }}</span>
            <span>记录费用：{{ previewModalItem.cost ?? '—' }}</span>
          </div>
          <div v-if="previewModalItem.analysis" class="analysis-row">
            {{ previewModalItem.analysis }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}
.admin-top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 登录面板 */
.login-wrapper {
  padding: 40px 0;
  display: flex;
  justify-content: center;
}
.admin-login-card {
  width: 100%;
  max-width: 440px;
  padding: 36px 32px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.lock-icon-box {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #0f172a;
  display: grid;
  place-items: center;
  margin: 0 auto;
}
.admin-login-card h2 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
  color: #0f172a;
}
.login-desc {
  margin: 0 0 10px;
  font-size: 0.85rem;
  color: var(--ink-soft);
}
.login-field {
  text-align: left;
}
.login-field input {
  height: 42px;
}
.login-btn {
  width: 100%;
  min-height: 44px;
}

/* 概览 Tile 网格 */
.summary-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 24px;
}
.dash-tile {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.dash-tile:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
}
.tile-icon {
  color: #0f172a;
  margin-bottom: 8px;
}
.tile-body span {
  font-size: 0.82rem;
  color: var(--ink-soft);
}
.tile-body b {
  display: block;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 2rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
  margin: 4px 0 6px;
}
.tile-sub {
  font-size: 0.72rem;
  color: var(--ink-soft);
}

/* 标签切换栏 */
.admin-nav-tabs {
  display: flex;
  gap: 8px;
  margin-top: 24px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
}
.admin-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 0.88rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}
.admin-tab-btn:hover {
  color: #0f172a;
  background: #f8fafc;
}
.admin-tab-btn.active {
  background: #0f172a;
  color: #ffffff;
}

/* 卡片容器 */
.admin-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 28px 32px;
  margin-top: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.editor-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 6px;
}
.editor-heading h2 {
  margin: 4px 0 0;
  font-size: 1.3rem;
  font-weight: 700;
  color: #0f172a;
}
.save-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #166534;
  background: #dcfce7;
  padding: 4px 10px;
  border-radius: 4px;
}
.admin-tip {
  margin: 0 0 20px;
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.6;
}

/* 表单与网格 */
.seed-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
/* 规范整洁的开关卡片容器 */
.switches-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.switches-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 24px;
}
.switch-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  color: #334155;
  cursor: pointer;
  user-select: none;
}
.danmaku-action-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
}
.danmaku-status-tip {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
}
.delete-clean {
  background: #fff;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}
.delete-clean:hover {
  background: #fee2e2;
  border-color: #f87171;
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #0f172a;
  cursor: pointer;
}
.editor-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.editor-three-col {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.dispatch-now-box {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.dispatch-now-box span {
  font-size: 0.78rem;
  font-weight: 700;
  color: #334155;
}
.textarea-box {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.6;
  resize: vertical;
}
.textarea-box:focus {
  outline: 2px solid #0f172a;
}
.field-hint {
  display: block;
  margin-top: 4px;
  font-size: 0.74rem;
  color: #64748b;
}
.admin-save-btn {
  align-self: flex-start;
  margin-top: 6px;
}

/* 样本库工具栏 */
.gallery-admin-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}
.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}
.search-input-wrap svg {
  position: absolute;
  left: 12px;
  color: #64748b;
}
.search-input-wrap input {
  width: 100%;
  height: 40px;
  padding: 0 12px 0 38px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.88rem;
}
.search-input-wrap input:focus {
  outline: 2px solid #0f172a;
}
.deleted-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
}

/* 样本库表格 */
.admin-table-wrap {
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
.admin-data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.86rem;
}
.admin-data-table th {
  background: #f8fafc;
  padding: 12px 16px;
  font-weight: 600;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
}
.admin-data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}
.code-pill {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.78rem;
}
.status-pill {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
}
.status-pill.pass {
  background: #dcfce7;
  color: #166534;
}
.status-pill.fail {
  background: #fee2e2;
  color: #991b1b;
}
.table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sm-btn {
  border: 0;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.sm-btn.rejudge {
  background: #f1f5f9;
  color: #0f172a;
}
.sm-btn.rejudge:hover {
  background: #e2e8f0;
}
.sm-btn.delete {
  background: #fee2e2;
  color: #b91c1c;
}
.sm-btn.delete:hover {
  background: #fecaca;
}
.sm-btn.restore {
  background: #dcfce7;
  color: #166534;
}
.sm-btn.restore:hover {
  background: #bbf7d0;
}
.table-empty {
  text-align: center;
  color: #94a3b8;
  padding: 24px;
}
.admin-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 0.82rem;
  color: var(--ink-soft);
}
.page-btns {
  display: flex;
  gap: 8px;
}

/* 手动导入框 */
.manual-import-box {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
}
.manual-import-box h3 {
  margin: 0 0 16px;
  font-size: 1.1rem;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 批量操作条 */
.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid var(--line);
  padding: 8px 14px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 0.85rem;
}
.batch-bar b {
  color: #0f172a;
}
.clickable-title {
  cursor: pointer;
  transition: color 0.15s ease;
}
.clickable-title:hover {
  color: #3b82f6;
  text-decoration: underline;
}
.sm-btn.preview {
  background: #0f172a;
  color: #ffffff;
}
.sm-btn.preview:hover {
  background: #1e293b;
}

/* 任务状态徽章 */
.task-status-pill {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: capitalize;
}
.task-status-pill.completed {
  background: #dcfce7;
  color: #166534;
}
.task-status-pill.generating, .task-status-pill.checking {
  background: #e0f2fe;
  color: #0369a1;
}
.task-status-pill.failed {
  background: #fee2e2;
  color: #991b1b;
}
.task-status-pill.queued {
  background: #f1f5f9;
  color: #475569;
}
.task-msg {
  display: block;
  font-size: 0.72rem;
  color: #64748b;
  margin-top: 2px;
}
.error-badge {
  background: #fee2e2;
  color: #b91c1c;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: help;
}
.pending-badge {
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

/* 在线快捷预览弹窗 */
.admin-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 999;
  display: grid;
  place-items: center;
  padding: 24px;
}
.admin-preview-dialog {
  width: min(100%, 780px);
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.preview-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #ffffff;
  border-bottom: 1px solid var(--line);
}
.preview-dialog-head div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview-dialog-head b {
  font-size: 1rem;
  color: #0f172a;
}
.preview-dialog-head small {
  color: #64748b;
  font-size: 0.78rem;
}
.icon-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: transparent;
  color: #64748b;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.icon-close-btn:hover {
  background: #fee2e2;
  color: #b91c1c;
  border-color: #fecaca;
}
.preview-dialog-art {
  height: 380px;
  background: #f8fafc;
  position: relative;
}
.preview-candy-text {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  font-size: 0.85rem;
}
.preview-candy-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
  line-height: 1.6;
  color: #0f172a;
}
.preview-dialog-meta {
  padding: 14px 20px;
  background: #ffffff;
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meta-row {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 0.8rem;
  color: #64748b;
}
.meta-row b {
  color: #0f172a;
}
.analysis-row {
  font-size: 0.78rem;
  color: #475569;
  background: #f8fafc;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

/* 安全矩阵网格 */
.security-matrix-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 10px;
}
.sec-card {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sec-card b {
  font-size: 0.95rem;
  color: #0f172a;
}
.sec-status {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  width: max-content;
}
.sec-status.active {
  background: #dcfce7;
  color: #166534;
}
.sec-card p {
  margin: 4px 0 0;
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.5;
}
.danmaku-clear-col {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* 品牌预览 Hero 区域 */
.brand-preview-hero {
  padding: 18px 20px;
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.preview-hero-label {
  font-size: 0.76rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.preview-hero-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}
.preview-brand-unit {
  display: flex;
  align-items: center;
  gap: 12px;
}
.preview-logo-box {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: #f1f5f9;
  display: grid;
  place-items: center;
  color: #0f172a;
}
.brand-img-preview {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
.preview-brand-texts {
  display: flex;
  flex-direction: column;
}
.preview-brand-texts b {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.2;
}
.preview-brand-texts small {
  font-size: 0.72rem;
  color: #64748b;
  letter-spacing: 0.6px;
}
.preview-mock-nav {
  display: flex;
  gap: 16px;
  font-size: 0.84rem;
  color: #64748b;
}
.logo-presets-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.82rem;
  color: #64748b;
}

/* 放单按钮组 */
.dispatch-action-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
}
.quick-batch-btns {
  display: flex;
  gap: 8px;
}
</style>
