<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ClipboardCheck, Code2, Copy, Download, ExternalLink, Eye, FileImage, Layers3, X } from '@lucide/vue'
import ArtworkFrame from './ArtworkFrame.vue'
import type { GalleryItem } from '../types'
import { formatDuration, artworkUsage } from '../services/display'
import { assessmentDisplay } from '../services/assessment-display'
import { artworkShareUrl, PUBLIC_SITE_ORIGIN } from '../services/share-links'

const props = defineProps<{
  item: GalleryItem
}>()

const emit = defineEmits<{
  close: []
  report: [item: GalleryItem]
}>()

const activeTab = ref<'preview' | 'code' | 'prompt' | 'assessment'>('preview')
const assessment = computed(() => assessmentDisplay(props.item))
// 服务端渲染的静态预览图：打开瞬间即显示（列表页已缓存），动画 iframe 随后接管
const previewSrc = computed(() =>
  props.item.html && props.item.id
    ? `/api/gallery/${encodeURIComponent(props.item.id)}/preview`
    : undefined,
)
const copiedCode = ref(false)
const copiedLink = ref(false)

function effortLabel(effort: string) {
  const map: Record<string, string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '极高' }
  return map[effort] || effort
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

const recordedUsage = computed(() => artworkUsage(props.item))
const hasSimulatedUsage = computed(() => props.item.origin === 'demo' &&
  Object.values(props.item.displayUsage?.fieldSources || {}).includes('simulated'))
const totalTokens = computed(() => {
  const { inputTokens, outputTokens } = recordedUsage.value
  return inputTokens != null && outputTokens != null ? inputTokens + outputTokens : '—'
})

function formatCode(raw: string) {
  if (!raw) return ''
  // 若是文本回答直接返回
  if (!raw.includes('<svg') && !raw.includes('<html')) return raw
  // 对单行压缩或大行宽的 HTML/SVG 代码进行标准缩进美化排版
  let tab = '  '
  let result = ''
  let indent = 0
  const clean = raw.trim()
  clean.split(/>\s*</).forEach((element) => {
    if (element.match(/^\/\w/)) {
      indent = Math.max(0, indent - 1)
    }
    result += tab.repeat(indent) + '<' + element + '>\n'
    if (
      element.match(/^<?\w[^>]*[^\/]$/) &&
      !element.startsWith('input') &&
      !element.startsWith('img') &&
      !element.startsWith('br') &&
      !element.startsWith('meta') &&
      !element.startsWith('link') &&
      !element.startsWith('!--')
    ) {
      indent++
    }
  })
  return result.substring(1, result.length - 2).trim() || raw
}

const displayCode = computed(() => {
  const raw = props.item.html || props.item.answerText || ''
  return formatCode(raw)
})

async function copyCode() {
  const content = props.item.html || props.item.answerText || ''
  await navigator.clipboard.writeText(content)
  copiedCode.value = true
  setTimeout(() => copiedCode.value = false, 1500)
}

async function copyLink() {
  const url = artworkShareUrl(PUBLIC_SITE_ORIGIN, props.item.id)
  await navigator.clipboard.writeText(url)
  copiedLink.value = true
  setTimeout(() => copiedLink.value = false, 1500)
}

function openReport() {
  emit('report', props.item)
  emit('close')
}

function downloadHtml() {
  const content = props.item.html || props.item.answerText || ''
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `pelican-${props.item.code}.html`
  a.click()
}
</script>

<template>
  <Teleport to="body">
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="detail-dialog" role="dialog" aria-modal="true" :aria-label="item.title || '作品详情'">
      <header class="dialog-header">
        <div class="header-left">
          <div class="code-and-title">
            <span class="work-code">#{{ item.code }}</span>
            <span class="work-title">{{ item.title }}</span>
          </div>
          <div class="header-sub">
            <span>{{ formatDate(item.createdAt) }}</span>
            <span class="sep">/</span>
            <span>模型 {{ item.model }}</span>
            <span class="sep">/</span>
            <span>思考 {{ effortLabel(item.effort) }}</span>
            <span v-if="item.source" class="source-pill">来源 {{ item.source }}</span>
          </div>
        </div>

        <div class="header-actions">
          <button class="top-icon-btn" type="button" :title="copiedLink ? '已复制作品链接' : '复制分享链接'" @click="copyLink">
            <Check v-if="copiedLink" :size="15" />
            <ExternalLink v-else :size="15" />
          </button>
          <button class="top-icon-btn" type="button" :title="copiedCode ? '已复制代码' : '复制完整源码'" @click="copyCode">
            <Check v-if="copiedCode" :size="15" />
            <Copy v-else :size="15" />
          </button>
          <button class="top-icon-btn" type="button" title="下载 HTML 文件" @click="downloadHtml">
            <Download :size="15" />
          </button>
          <button class="top-icon-btn close-btn" type="button" aria-label="关闭" @click="$emit('close')">
            <X :size="18" />
          </button>
        </div>
      </header>

      <div class="dialog-tabs">
        <button
          :class="['tab-btn', { active: activeTab === 'preview' }]"
          type="button"
          @click="activeTab = 'preview'"
        >
          <Eye :size="15" /> 画面预览
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'code' }]"
          type="button"
          @click="activeTab = 'code'"
        >
          <Code2 :size="15" /> 查看源代码
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'prompt' }]"
          type="button"
          @click="activeTab = 'prompt'"
        >
          测试提示词
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'assessment' }]"
          type="button"
          :aria-pressed="activeTab === 'assessment'"
          @click="activeTab = 'assessment'"
        >
          <ClipboardCheck :size="15" /> 判断依据
        </button>
      </div>

      <div class="dialog-body">
        <div v-if="activeTab === 'preview'" class="view-preview">
          <ArtworkFrame
            v-if="item.html"
            :html="item.html"
            :title="item.title"
            :preview-src="previewSrc"
            interactive
          />
          <div v-else class="candy-full-preview">
            <div class="candy-header-box">
              <h3>{{ item.benchmark === 'candy' ? '糖果极值抽屉原理推理答卷' : '自定义回答' }}</h3>
              <p>{{ item.prompt || '未记录提示词' }}</p>
            </div>
            <pre class="candy-pre">{{ item.answerText }}</pre>
          </div>
        </div>

        <div v-else-if="activeTab === 'code'" class="view-code">
          <div class="code-toolbar">
            <span>HTML 单文件源码 ({{ ((item.html || item.answerText || '').length / 1024).toFixed(1) }} KB)</span>
            <button class="code-copy-btn" type="button" @click="copyCode">
              <Check v-if="copiedCode" :size="13" />
              <Copy v-else :size="13" />
              {{ copiedCode ? '代码已复制' : '复制代码' }}
            </button>
          </div>
          <pre class="code-editor">{{ displayCode }}</pre>
        </div>

        <div v-else-if="activeTab === 'prompt'" class="view-prompt">
          <div class="prompt-meta-item">
            <h3>本次实际下发的完整测试提示词</h3>
            <div class="prompt-content-box">
              {{ item.prompt || '请生成可直接运行的单文件HTML，使用内联SVG绘制鹈鹕骑自行车的二维循环动画。画面以鹈鹕和自行车为主体，展示清晰的身体结构、踩踏动作和车轮转动，配合协调的背景、配色与层次。动画应流畅自然、衔接连续，并适配不同屏幕尺寸。禁止依赖外部资源，只输出完整HTML，不要代码围栏或解释文字。' }}
            </div>
          </div>
        </div>

        <section v-else class="view-assessment" aria-label="判断依据" tabindex="0">
          <div class="assessment-heading">
            <h3>本次判定：<span :class="{ 'assessment-failed': item.verdict === 'failed' }">{{ assessment.conclusion }}</span></h3>
            <span class="assessment-meta">{{ assessment.source }}<template v-if="item.judgmentVersion"> · {{ item.judgmentVersion }}</template></span>
          </div>
          <p class="assessment-summary">{{ assessment.summary }}</p>
          <template v-if="assessment.checks.length">
            <p class="assessment-count">通过 {{ assessment.passed }} 项 · 未通过 {{ assessment.failed }} 项<template v-if="assessment.unknown"> · 未确认 {{ assessment.unknown }} 项</template></p>
            <ul class="assessment-list">
              <li v-for="(check, index) in assessment.checks" :key="`${check.name}-${index}`" class="assessment-row">
                <div class="assessment-row-heading">
                  <strong>{{ check.name }}</strong>
                  <span :class="['assessment-status', { 'assessment-failed': check.status === 'failed' }]">
                    <Check v-if="check.status === 'passed'" :size="14" aria-hidden="true" />
                    <X v-else-if="check.status === 'failed'" :size="14" aria-hidden="true" />
                    {{ check.status === 'passed' ? '通过' : check.status === 'failed' ? '未通过' : '未确认' }}
                  </span>
                </div>
                <p>{{ check.detail || '未记录详细说明' }}</p>
              </li>
            </ul>
          </template>
          <p class="assessment-note">依据来自已保存的检测记录。打开此页不会重新测试；用户反馈票数不改变自动结论。</p>
        </section>
      </div>

      <footer class="dialog-footer">
        <div class="footer-stats">
          <div class="stat-group">
            <span class="stat-pill">{{ item.model }}</span>
            <span class="stat-pill">思考 {{ effortLabel(item.effort) }}</span>
            <span v-if="hasSimulatedUsage" class="stat-pill">{{ recordedUsage.note }}</span>
          </div>
          <div class="stat-numbers">
            <span>耗时 <b>{{ formatDuration(recordedUsage.latencyMs) }}</b></span>
            <span class="sep">·</span>
            <span>输入 Token <b>{{ recordedUsage.inputTokens ?? '—' }}</b></span>
            <span class="sep">·</span>
            <span>输出 Token <b>{{ recordedUsage.outputTokens ?? '—' }}</b></span>
            <span class="sep">·</span>
            <span>总计 <b>{{ totalTokens }}</b> tokens</span>
            <span class="sep">·</span>
            <span>{{ recordedUsage.note ? '展示费用' : '记录费用' }} <b>{{ recordedUsage.cost ?? '—' }}</b></span>
          </div>
        </div>

        <div class="footer-buttons">
          <button class="action-btn" type="button" @click="openReport">
            <FileImage :size="15" /> 图片战报
          </button>
          <RouterLink class="action-btn primary-action" :to="`/compare?left=${encodeURIComponent(item.id)}`">
            <Layers3 :size="15" /> 同题对比
          </RouterLink>
        </div>
      </footer>

      <!-- 复制与操作 Toast 提示 -->
      <transition name="toast-fade">
        <div v-if="copiedCode || copiedLink" class="modal-toast">
          <Check :size="14" />
          <span>{{ copiedCode ? '完整源代码已复制到剪贴板' : '作品分享链接已复制' }}</span>
        </div>
      </transition>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--dialog-backdrop);
  z-index: var(--layer-dialog);
  isolation: isolate;
  display: grid;
  place-items: center;
  padding: 24px;
}
.detail-dialog {
  position: relative;
  z-index: 1;
  width: min(100%, 1020px);
  height: min(92vh, 820px);
  background: #ffffff;
  border-radius: 12px;
  box-shadow: var(--dialog-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}
.code-and-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.work-code {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  font-size: 1rem;
  color: #0f172a;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
}
.work-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
}
.header-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: #64748b;
  margin-top: 4px;
}
.header-sub .sep {
  opacity: 0.4;
}
.source-pill {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 1px 6px;
  border-radius: 3px;
  color: #475569;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.top-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.top-icon-btn:hover {
  background: #f8fafc;
  color: #0f172a;
  border-color: #cbd5e1;
}
.close-btn:hover {
  background: #fee2e2;
  color: #b91c1c;
  border-color: #fecaca;
}

.dialog-tabs {
  display: flex;
  overflow-x: auto;
  flex-shrink: 0;
  gap: 6px;
  padding: 10px 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.tab-btn {
  display: inline-flex;
  flex-shrink: 0;
  white-space: nowrap;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab-btn:hover {
  color: #0f172a;
  background: rgba(0, 0, 0, 0.04);
}
.tab-btn.active {
  background: #ffffff;
  color: #0f172a;
  border-color: #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.dialog-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #f8fafc;
  position: relative;
}
.view-preview {
  width: 100%;
  height: 100%;
  display: flex;
  background: #ffffff;
}
.view-preview :deep(.artwork-frame) {
  width: 100%;
  height: 100%;
  border: 0;
}
.candy-full-preview {
  width: 100%;
  height: 100%;
  padding: 24px;
  overflow-y: auto;
  background: #ffffff;
}
.candy-header-box {
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 16px;
}
.candy-header-box h3 {
  margin: 0 0 6px;
  font-size: 1.1rem;
  color: #0f172a;
}
.candy-header-box p {
  margin: 0;
  font-size: 0.88rem;
  color: #64748b;
}
.candy-pre {
  margin: 0;
  font-family: inherit;
  font-size: 0.92rem;
  line-height: 1.7;
  color: #1e293b;
  white-space: pre-wrap;
}

.view-code {
  width: 100%;
  height: 100%;
  background: #1e2227;
  display: flex;
  flex-direction: column;
}
.code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  background: #181b1f;
  border-bottom: 1px solid #282c34;
  color: #9da5b4;
  font-size: 0.78rem;
}
.code-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.1);
  border: 0;
  color: #e5e7eb;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}
.code-copy-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}
.code-editor {
  flex: 1;
  margin: 0;
  padding: 18px 20px;
  font-family: 'IBM Plex Mono', Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  color: #abb2bf;
  background: #1e2227;
  overflow: auto;
  white-space: pre;
  word-break: normal;
  tab-size: 2;
}

.view-prompt {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
  background: #ffffff;
}
.prompt-meta-item h3 {
  margin: 0 0 12px;
  font-size: 1rem;
  color: #0f172a;
}
.prompt-content-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px 20px;
  font-size: 0.92rem;
  line-height: 1.7;
  color: #334155;
}

.view-assessment {
  --assessment-label-size: 0.82rem;
  --assessment-copy-size: 0.9rem;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-3);
  background: var(--white);
  color: var(--ink);
  overflow-wrap: anywhere;
}
.assessment-heading,
.assessment-row-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
}
.assessment-heading h3 {
  margin: 0;
  font-size: 1rem;
}
.assessment-meta,
.assessment-count,
.assessment-note {
  color: var(--ink-soft);
  font-size: var(--assessment-label-size);
}
.assessment-summary {
  margin: var(--space-2) 0;
  padding: var(--space-2);
  background: var(--mint-pale);
  border-radius: var(--radius-md);
  font-size: var(--assessment-copy-size);
  line-height: 1.7;
}
.assessment-count { margin: var(--space-2) 0 var(--space-1); }
.assessment-list { margin: 0; padding: 0; list-style: none; }
.assessment-row { padding: var(--space-2) 0; border-bottom: 1px solid var(--line); }
.assessment-row-heading strong { font-size: var(--assessment-copy-size); }
.assessment-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--assessment-label-size);
  white-space: nowrap;
  color: var(--ink-soft);
}
.assessment-failed { color: var(--error); }
.assessment-row p { margin: var(--space-1) 0 0; color: var(--ink-soft); font-size: var(--assessment-copy-size); }
.assessment-note { margin: var(--space-2) 0 0; line-height: 1.7; }

.dialog-footer {
  padding: 12px 24px;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.footer-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-group {
  display: flex;
  gap: 6px;
}
.stat-pill {
  font-size: 0.75rem;
  font-weight: 600;
  background: #f1f5f9;
  color: #334155;
  padding: 2px 8px;
  border-radius: 4px;
}
.stat-numbers {
  font-size: 0.76rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
}
.stat-numbers b {
  color: #0f172a;
}
.stat-numbers .sep {
  opacity: 0.4;
}
.footer-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.action-btn:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}
.action-btn.primary-action {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}
.action-btn.primary-action:hover {
  background: #1e293b;
}

.modal-toast {
  position: absolute;
  bottom: 84px;
  left: 50%;
  transform: translateX(-50%);
  background: #0f172a;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 10;
}
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

@media (max-width: 600px) {
  .dialog-header { align-items: flex-start; flex-direction: column; gap: var(--space-1); padding: var(--space-2); }
  .header-left { width: 100%; min-width: 0; }
  .work-title { overflow-wrap: anywhere; }
  .work-code { flex-shrink: 0; }
  .header-sub { flex-wrap: wrap; }
  .header-actions { align-self: flex-end; }
  .dialog-tabs { padding-inline: var(--space-2); }
  .view-assessment { padding: var(--space-2); }
  .dialog-footer { padding: var(--space-2); }
  .footer-stats { min-width: 0; }
  .stat-numbers { flex-wrap: wrap; }
  .stat-numbers > span { white-space: nowrap; }
}
</style>
