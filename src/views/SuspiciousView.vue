<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { AlertTriangle, ChevronRight, FileSearch, Eye } from '@lucide/vue'
import ArtworkDetailModal from '../components/ArtworkDetailModal.vue'
import ArtworkFrame from '../components/ArtworkFrame.vue'
import ReportModal from '../components/ReportModal.vue'
import { fetchGalleryItem, fetchSuspiciousSamples, getCachedGalleryItems } from '../services/api'
import type { GalleryItem, SuspiciousSample } from '../types'

const samples = shallowRef<SuspiciousSample[]>([])
const activeSample = ref<SuspiciousSample | null>(null)
const loading = ref(false)
const listError = ref('')
const activeDetailItem = shallowRef<GalleryItem | null>(null)
const activeReportItem = shallowRef<GalleryItem | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const evidenceItems = computed(() => [...new Set((activeSample.value?.evidence || '')
  .split(/[；;]\s*/).map((line) => line.trim()).filter(Boolean))])
let detailController: AbortController | undefined

async function loadSuspicious(force = false) {
  loading.value = true
  listError.value = ''
  try {
    samples.value = await fetchSuspiciousSamples(force)
    activeSample.value = samples.value.find((sample) => sample.id === activeSample.value?.id) || samples.value[0] || null
  } catch (error) {
    listError.value = error instanceof Error ? error.message : '读取可疑样本失败，请重试。'
  } finally {
    loading.value = false
  }
}

function selectSample(sample: SuspiciousSample) {
  detailController?.abort()
  detailLoading.value = false
  detailError.value = ''
  activeSample.value = sample
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

async function openSample(sample: SuspiciousSample) {
  activeSample.value = sample
  detailController?.abort()
  const controller = new AbortController()
  detailController = controller
  detailLoading.value = true
  detailError.value = ''
  activeDetailItem.value = null
  try {
    const cached = getCachedGalleryItems()?.find((item) => item.id === sample.id)
    const item = cached && (cached.html || cached.answerText)
      ? cached : await fetchGalleryItem(sample.id, controller.signal)
    if (!controller.signal.aborted) activeDetailItem.value = item
  } catch (error) {
    if (!controller.signal.aborted) detailError.value = error instanceof Error ? error.message : '打开样本失败，请重试。'
  } finally {
    if (!controller.signal.aborted) detailLoading.value = false
  }
}

onMounted(() => { void loadSuspicious() })
onBeforeUnmount(() => { detailController?.abort() })
</script>

<template>
  <section class="page-title page-wrap">
    <span class="eyebrow">PUBLIC VERIFICATION</span>
    <div class="title-row">
      <div>
        <h1>可疑样本 · 证据记录</h1>
        <p>对照作品与题目要求，查看公开检测中的疑似异常：作品复用、答非所问、虚假思考等线索。</p>
      </div>
    </div>
  </section>

  <section class="suspicious-layout page-wrap">
    <div class="samples-list">
      <div class="list-head">
        <AlertTriangle :size="16" />
        <b>疑似线索记录（仅供技术核对）</b>
      </div>
      <p v-if="loading" role="status">正在读取可疑样本…</p>
      <div v-else-if="listError" role="alert">
        <p>{{ listError }}</p>
        <button class="button secondary" type="button" @click="loadSuspicious(true)">重新加载</button>
      </div>
      <p v-else-if="!samples.length" role="status">暂无公开可疑样本</p>
      <button
        v-for="s in samples"
        type="button"
        :key="s.id"
        :class="['sample-card', { active: activeSample?.id === s.id }]"
        :aria-pressed="activeSample?.id === s.id"
        @click="selectSample(s)"
      >
        <span class="sample-badge">{{ s.type }}</span>
        <strong class="sample-title">{{ s.title }}</strong>
        <span class="sample-meta">{{ s.model }} · {{ formatDate(s.date) }}</span>
        <span class="sample-open-label">查看技术分析 <ChevronRight :size="14" /></span>
      </button>
    </div>

    <div v-if="activeSample" class="sample-detail-panel">
      <header class="detail-header">
        <div class="type-pill">{{ activeSample.type }}</div>
        <h2>{{ activeSample.title }}</h2>
        <div class="detail-meta">
          <span><b>模型</b> {{ activeSample.model }}</span>
          <span><b>记录时间</b> {{ formatDate(activeSample.date) }}</span>
        </div>
      </header>

      <div class="detail-body">
        <section class="detail-block preview-block">
          <h3><Eye :size="16" /> {{ activeSample.html ? '作品预览' : '回答预览' }}</h3>
          <button v-if="activeSample.html" class="sample-art-preview" type="button"
            aria-label="放大查看当前作品" @click="openSample(activeSample)">
            <ArtworkFrame :key="activeSample.id" :html="activeSample.html" :title="activeSample.title"
              :preview-src="activeSample.previewImage || '/api/gallery/' + encodeURIComponent(activeSample.id) + '/preview'" />
          </button>
          <pre v-else class="sample-answer-preview">{{ activeSample.answerText || activeSample.outputPreview }}</pre>
        </section>
        <section class="detail-block">
          <h3><FileSearch :size="16" /> 证据与技术分析</h3>
          <ul class="evidence-text">
            <li v-for="line in evidenceItems" :key="line">{{ line }}</li>
          </ul>
        </section>
        <div class="sample-detail-actions">
          <p v-if="detailError" class="sample-open-error" role="alert">{{ detailError }}</p>
          <button class="button secondary" type="button" :disabled="detailLoading" @click="openSample(activeSample)">
            {{ detailLoading ? '正在打开…' : '查看完整作品与回答' }} <ChevronRight :size="16" />
          </button>
        </div>
      </div>
    </div>
  </section>
  <ArtworkDetailModal
    v-if="activeDetailItem"
    :key="activeDetailItem.id"
    :item="activeDetailItem"
    @close="activeDetailItem = null"
    @report="activeReportItem = $event"
  />
  <ReportModal v-if="activeReportItem" :item="activeReportItem" @close="activeReportItem = null" />
</template>

<style scoped>
.suspicious-layout {
  --sample-preview-width: 360px;
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 24px;
  margin-top: 24px;
  align-items: start;
}
.samples-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.list-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  padding: 10px 14px;
  border-radius: 6px;
}
.sample-card {
  width: 100%;
  text-align: left;
  font: inherit;
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.sample-card:hover {
  border-color: #94a3b8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}
.sample-card.active {
  border-color: #0f172a;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
}
.sample-badge {
  display: inline-block;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  margin-bottom: 6px;
}
.sample-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.4;
  margin: 0 0 6px;
  font-size: 0.95rem;
  color: var(--ink);
}
.sample-meta {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 0 8px;
  font-size: 0.75rem;
  color: var(--ink-soft);
}

.sample-detail-panel {
  min-width: 0;
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.type-pill {
  display: inline-block;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 700;
  font-size: 0.78rem;
  padding: 3px 10px;
  border-radius: 999px;
  margin-bottom: 8px;
}
.detail-header h2 {
  margin: 0 0 12px;
  font-size: 1.4rem;
  color: var(--ink);
}
.detail-meta {
  flex-wrap: wrap;
  display: flex;
  gap: 20px;
  font-size: 0.82rem;
  color: var(--ink-soft);
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.detail-meta b {
  color: var(--ink);
}
.detail-block { margin-top: var(--space-3); }
.detail-block:first-child { margin-top: 0; }
.detail-block h3 {
  margin: 0 0 10px;
  font-size: 0.98rem;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 6px;
}
.evidence-text {
  margin: 0;
  list-style-position: inside;
  overflow-wrap: anywhere;
  font-size: 0.9rem;
  line-height: 1.7;
  color: #1e293b;
  background: #f8fafc;
  padding: 14px 18px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #f97316;
}
.sample-art-preview {
  display: block;
  padding: 0;
  width: min(100%, var(--sample-preview-width));
  aspect-ratio: var(--artwork-preview-ratio);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--white);
  cursor: zoom-in;
}
.sample-answer-preview { margin: 0; padding: var(--space-3); max-height: 320px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; background: var(--mint-pale); border: 1px solid var(--line); border-radius: var(--radius-md); }
.evidence-text li + li { margin-top: var(--space-1); }
.sample-open-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--space-2);
  font-size: .82rem;
  font-weight: 600;
  color: var(--ink);
}
.sample-open-error { display: block; margin-top: var(--space-1); color: var(--error); }
.sample-detail-actions { margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); }
@media (max-width: 800px) {
  .suspicious-layout { grid-template-columns: minmax(0, 1fr); }
  .sample-detail-panel { padding: var(--space-3); }
}
</style>
