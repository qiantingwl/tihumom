<script setup lang="ts">
import { formatDuration } from "../services/display"
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeftRight, CheckCircle2, Clock3, FileImage, Info, RotateCcw, Sparkles, Zap } from '@lucide/vue'
import { useRoute } from 'vue-router'
import ArtworkFrame from '../components/ArtworkFrame.vue'
import GalleryCard from '../components/GalleryCard.vue'
import BenchmarkSwitch from '../components/BenchmarkSwitch.vue'
import { compareRecords, recordSource } from '../services/comparison'
import ReportModal from '../components/ReportModal.vue'
import ArtworkDetailModal from '../components/ArtworkDetailModal.vue'
import { fetchGalleryItem, fetchGalleryItems } from '../services/api'
import type { GalleryItem } from '../types'

const route = useRoute()
const items = shallowRef<GalleryItem[]>([])
const displayCount = ref(36)
const selected = ref<GalleryItem[]>([])
const showReportModal = ref(false)
const activeDetailItem = ref<GalleryItem | null>(null)
const singleReportItem = ref<GalleryItem | null>(null)
const benchmark = ref<'pelican' | 'candy'>('pelican')
const comparisonLoading = ref(false)
const comparisonError = ref('')
const comparisonRetry = ref(0)

const ready = computed(() => selected.value.length === 2)
// Keep all assessed outcomes available; a failed work is also useful evidence.
const validItems = computed(() => items.value
  .filter((item) => item.benchmark === benchmark.value && item.origin !== 'demo' && (item.html || item.answerText))
  .slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)))
watch(benchmark, () => { displayCount.value = 36 })
const visibleItems = computed(() => validItems.value.slice(0, displayCount.value))
const hasMore = computed(() => validItems.value.length > displayCount.value)

function loadMore() {
  displayCount.value += 36
}

function effortLabel(effort: string) {
  const map: Record<string, string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '极高' }
  return map[effort] || effort
}

function handleOpenDetail(item: GalleryItem) {
  activeDetailItem.value = item
}

function toggle(item: GalleryItem) {
  const index = selected.value.findIndex((entry) => entry.id === item.id)
  if (index >= 0) {
    selected.value.splice(index, 1)
  } else if (selected.value.length < 2) {
    selected.value.push(item)
  } else {
    selected.value.splice(1, 1, item)
  }
}

const conditionAnalysis = computed(() => ready.value ? compareRecords(selected.value[0], selected.value[1]) : null)

onMounted(() => {
  fetchGalleryItems().then((galleryItems) => { items.value = galleryItems }).catch(() => {})
})

watch(() => [route.query.left, route.query.right, comparisonRetry.value] as const, async ([left, right], _previous, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  selected.value = []
  comparisonError.value = ''
  comparisonLoading.value = true
  try {
    if ((left && typeof left !== 'string') || (right && typeof right !== 'string') || (right && !left))
      throw new Error('对比分享链接中的作品编号无效。')
    if (left && right) {
      // An explicit pair must never be silently replaced with unrelated defaults.
      const pair = await Promise.all([fetchGalleryItem(left as string, controller.signal), fetchGalleryItem(right as string, controller.signal)])
      if (!controller.signal.aborted) {
        selected.value = pair
        if (pair[0]?.benchmark === 'candy') benchmark.value = 'candy'
      }
      return
    }
    if (left) {
      const item = await fetchGalleryItem(left as string, controller.signal)
      if (controller.signal.aborted) return
      selected.value = [item]
    }
    // Wait for the user's second selection; never insert unrelated defaults.
    if (selected.value[0]?.benchmark === 'candy') benchmark.value = 'candy'

  } catch (error) {
    if (!controller.signal.aborted) comparisonError.value = error instanceof Error ? error.message : '读取对比作品失败，请重试。'
  } finally {
    if (!controller.signal.aborted) comparisonLoading.value = false
  }
}, { immediate: true })
</script>

<template>
  <section class="page-title page-wrap">
    <span class="eyebrow">SIDE BY SIDE OBSERVATION</span>
    <div class="title-row">
      <div>
        <h1>同题对比 · 条件与结果</h1>
        <p>选择两份作品，核对提示词、模型、推理档位与来源，再查看各自的技术分析。</p>
      </div>
      <div class="title-actions">
        <button v-if="ready" class="button secondary" type="button" @click="showReportModal = true">
          <FileImage :size="16" /> 生成双图对比战报
        </button>
        <button v-if="selected.length" class="icon-button" type="button" aria-label="清空选择" @click="selected = []">
          <RotateCcw :size="18" />
        </button>
      </div>
    </div>
  </section>

  <section class="compare-stage page-wrap">
    <div v-if="comparisonLoading || comparisonError" class="share-notice" :role="comparisonError ? 'alert' : 'status'">
      <span>{{ comparisonLoading ? '正在打开对比作品…' : comparisonError }}</span>
      <button v-if="comparisonError" class="button secondary" type="button" @click="comparisonRetry++">重试</button>
    </div>
    <!-- 两个对比槽位 -->
    <div class="compare-grid">
      <div v-for="index in 2" :key="index" class="compare-slot">
        <template v-if="selected[index - 1]">
          <div class="slot-visual">
            <ArtworkFrame
              v-if="selected[index - 1].benchmark === 'pelican' && selected[index - 1].html"
              :html="selected[index - 1].html!"
              :title="`对比作品 ${index}`"
              interactive
            />
            <div v-else class="slot-candy-text">
              <div class="slot-candy-head">{{ selected[index - 1].benchmark === 'candy' ? '糖果测试回答' : '自定义回答' }}</div>
              <pre>{{ selected[index - 1].answerText }}</pre>
            </div>
          </div>

          <div class="slot-info">
            <div class="slot-meta">
              <span class="slot-tag">#{{ selected[index - 1].code }}</span>
              <h2>{{ selected[index - 1].title }}</h2>
            </div>
            <div class="slot-badges">
              <span><b>记录</b> {{ recordSource(selected[index - 1]) }}</span>
              <span><b>渠道</b> {{ selected[index - 1].source || '未记录' }}</span>
              <span><b>模型</b> {{ selected[index - 1].model }}</span>
              <span><b>题型</b> {{ selected[index - 1].benchmark === 'candy' ? '糖果测试' : selected[index - 1].benchmark === 'custom' ? '自定义' : (selected[index - 1].mode === 'benchmark' ? '固定题' : '随机题') }}</span>
              <span><b>思考</b> {{ effortLabel(selected[index - 1].effort) }}</span>
              <span><b>耗时</b> <Clock3 :size="12" /> {{ formatDuration(selected[index - 1].latencyMs) }}</span>
            </div>
          </div>
        </template>

        <div v-else class="slot-empty">
          <span class="empty-num">0{{ index }}</span>
          <p>从下方画廊中点击一幅作品放入槽位</p>
        </div>
      </div>

      <span class="versus"><ArrowLeftRight :size="20" /></span>
    </div>

    <!-- 研判与条件对齐提示栏 -->
    <div v-if="conditionAnalysis" class="condition-card">
      <div class="condition-header">
        <Sparkles :size="16" />
        <b>条件核对与技术分析</b>
      </div>
      <div class="condition-items">
        <span :class="['condition-pill', conditionAnalysis.sameBenchmark && conditionAnalysis.sameMode && conditionAnalysis.samePrompt ? 'match' : 'diff']">
          {{ conditionAnalysis.sameBenchmark && conditionAnalysis.sameMode && conditionAnalysis.samePrompt ? '题目与模式一致' : '题目或模式不同或未记录' }}
        </span>
        <span :class="['condition-pill', conditionAnalysis.sameModel ? 'match' : 'diff']">
          {{ conditionAnalysis.sameModel ? '模型一致' : '模型不同' }}
        </span>
        <span :class="['condition-pill', conditionAnalysis.sameEffort ? 'match' : 'diff']">
          {{ conditionAnalysis.sameEffort ? '思考等级一致' : '思考等级不同' }}
        </span>
        <span :class="['condition-pill', conditionAnalysis.sameSource ? 'match' : 'diff']">
          {{ conditionAnalysis.sameSource ? '来源渠道一致' : '来源渠道不同或未记录' }}
        </span>
        <span class="condition-pill speed">
          {{ conditionAnalysis.speedText }}
        </span>
      </div>
      <p class="condition-summary">{{ conditionAnalysis.summary }}</p>
      <div class="comparison-evidence">
        <article v-for="(analysis, index) in [conditionAnalysis.left, conditionAnalysis.right]" :key="selected[index].id">
          <h3>{{ index === 0 ? 'A' : 'B' }} · #{{ selected[index].code }} · {{ analysis.conclusion }}</h3>
          <p class="evidence-source">{{ recordSource(selected[index]) }} · {{ analysis.source }}</p>
          <p>{{ analysis.summary }}</p>
          <button class="text-link evidence-link" type="button" @click="handleOpenDetail(selected[index])">查看完整作品与判断依据</button>
        </article>
      </div>
    </div>

    <!-- 备选池 -->
    <div class="picker-section">
      <h3>选择要加入对比的作品</h3>
      <p>自行选择 A、B 两份记录；不会自动拿不相关的样本配对。</p>
      <BenchmarkSwitch v-model="benchmark" />
      <p v-if="!visibleItems.length">当前分类暂无可选记录。</p>
      <div class="picker-grid">
        <GalleryCard
          v-for="item in visibleItems"
          :key="item.id"
          :item="item"
          selectable
          :selected="selected.some((entry) => entry.id === item.id)"
          @select="toggle"
          @open="handleOpenDetail"
          @report="singleReportItem = $event"
        />
      </div>

      <div v-if="hasMore" class="picker-more">
        <button class="button ghost" type="button" @click="loadMore">
          加载更多候选作品 (已显示 {{ visibleItems.length }} / {{ validItems.length }})
        </button>
      </div>
    </div>
  </section>

  <!-- 放大作品详情与源码弹窗（点击卡片查看） -->
  <ArtworkDetailModal
    v-if="activeDetailItem"
    :item="activeDetailItem"
    @close="activeDetailItem = null"
    @report="singleReportItem = $event"
  />

  <ReportModal v-if="singleReportItem" :item="singleReportItem" @close="singleReportItem = null" />

  <!-- 对比战报弹窗 -->
  <ReportModal
    v-if="showReportModal && ready"
    :item="selected[0]"
    :item-b="selected[1]"
    @close="showReportModal = false"
  />
</template>

<style scoped>
.title-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.comparison-evidence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
.comparison-evidence article { border-top: 1px solid var(--line); padding-top: var(--space-2); }
.comparison-evidence h3 { margin: 0 0 var(--space-1); font-size: .95rem; }
.comparison-evidence p { line-height: 1.7; overflow-wrap: anywhere; }
.evidence-source { color: var(--ink-soft); font-size: .8rem; }
.evidence-link { border: 0; background: transparent; padding: var(--space-1) 0; cursor: pointer; }
.picker-grid { margin-top: var(--space-3); }
@media (max-width: 700px) { .comparison-evidence { grid-template-columns: 1fr; } }
.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  position: relative;
  margin-top: 24px;
}
.compare-slot {
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 500px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
  transition: box-shadow 0.2s ease;
}
.compare-slot:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.05);
}
.slot-visual {
  height: auto;
  aspect-ratio: var(--artwork-preview-ratio);
  overflow: hidden;
  background: #ffffff;
  border-bottom: 1px solid var(--line);
}
.slot-candy-text {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  font-size: 0.85rem;
}
.slot-candy-head {
  font-weight: 700;
  color: #b45309;
  margin-bottom: 8px;
}
.slot-candy-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: inherit;
  line-height: 1.6;
  color: var(--ink);
}
.slot-info {
  padding: 18px 20px;
}
.slot-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.slot-tag {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  background: #f1f5f9;
  color: #0f172a;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
}
.slot-meta h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--ink);
}
.slot-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 0.78rem;
  color: var(--ink-soft);
}
.slot-badges span {
  background: #f4f6f4;
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.slot-badges b {
  color: var(--ink);
}
.slot-empty {
  height: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  color: var(--ink-soft);
}
.empty-num {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 2.4rem;
  font-weight: 700;
  opacity: 0.3;
}
.versus {
  position: absolute;
  left: 50%;
  top: 190px;
  transform: translate(-50%, -50%);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #ffffff;
  color: #0f172a;
  border: 1px solid var(--line);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  display: grid;
  place-items: center;
  z-index: 10;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.versus:hover {
  transform: translate(-50%, -50%) scale(1.08);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}
.condition-card {
  margin: 28px 0;
  padding: 20px 24px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  min-height: 120px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.condition-note {
  margin: 24px 0 32px;
  padding: 12px 18px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.85rem;
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.condition-note b {
  color: #0f172a;
}
.condition-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--green-deep);
  font-size: 0.95rem;
  margin-bottom: 12px;
}
.condition-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.condition-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}
.condition-pill.match {
  background: #dcfce7;
  color: #166534;
}
.condition-pill.diff {
  background: #fee2e2;
  color: #991b1b;
}
.condition-pill.speed {
  background: #fef3c7;
  color: #92400e;
}
.condition-summary {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ink);
  line-height: 1.6;
}
.picker-section {
  margin-top: 40px;
}
.picker-section h3 {
  font-size: 1.1rem;
  color: var(--ink);
  margin-bottom: 16px;
}
.picker-more {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}
.picker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 900px) {
  .picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .picker-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 800px) {
  .compare-grid {
    grid-template-columns: 1fr;
  }
  .versus {
    display: none;
  }
}
</style>
