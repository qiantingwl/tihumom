<script setup lang="ts">
import { sampleStatus, formatDuration } from "../services/display"
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, ArrowUpDown, Clock3, Fish, MessageSquare, Pause, Play, RefreshCw, Search, Send } from '@lucide/vue'
import ArtworkFrame from '../components/ArtworkFrame.vue'
import GalleryCard from '../components/GalleryCard.vue'
import BenchmarkSwitch from '../components/BenchmarkSwitch.vue'
import ReportModal from '../components/ReportModal.vue'
import ArtworkDetailModal from '../components/ArtworkDetailModal.vue'
import { addCachedDanmaku, fetchDanmakuMessages, fetchGalleryItem, fetchGalleryItems, fetchShowcasePairs, getCachedGalleryItems, galleryChanges } from '../services/api'
import type { DanmakuMessage, GalleryItem } from '../types'

const items = shallowRef<GalleryItem[]>([])
const filter = ref<'all' | 'best' | 'fails'>('all')
const viewBenchmark = ref<'pelican' | 'candy'>('pelican')
const onlyMine = ref(false)
const searchQuery = ref('')
const sortBy = ref<'likes' | 'newest' | 'size'>('newest')
const loading = ref(false)
const listError = ref('')
const currentPage = ref(1)
const pageSize = 24

const selectedVisitorItem = ref<GalleryItem | null>(null)
const activeReportItem = ref<GalleryItem | null>(null)
const activeDetailItem = ref<GalleryItem | null>(null)
const route = useRoute()
const router = useRouter()
const detailLoading = ref(false)
const detailError = ref('')
const detailRetry = ref(0)

watch(() => [route.query.item, detailRetry.value] as const, async ([id], _previous, onCleanup) => {
  activeDetailItem.value = null
  detailError.value = ''
  detailLoading.value = false
  if (!id) return
  if (typeof id !== 'string') { detailError.value = '分享链接中的作品编号无效。'; return }
  const cached = (items.value.length ? items.value : getCachedGalleryItems() || []).find((item) => item.id === id)
  if (cached && (cached.html || cached.answerText)) {
    activeDetailItem.value = cached
    selectedVisitorItem.value = cached
    if (cached.benchmark === 'pelican' || cached.benchmark === 'candy') viewBenchmark.value = cached.benchmark
    return
  }
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  detailLoading.value = true
  try {
    const item = await fetchGalleryItem(id, controller.signal)
    if (controller.signal.aborted) return
    activeDetailItem.value = item
    selectedVisitorItem.value = item
    if (item.benchmark === 'candy' || item.benchmark === 'pelican') viewBenchmark.value = item.benchmark
  } catch (error) {
    if (!controller.signal.aborted) detailError.value = error instanceof Error ? error.message : '读取分享作品失败，请重试。'
  } finally {
    if (!controller.signal.aborted) detailLoading.value = false
  }
}, { immediate: true })

function closeDetail() {
  activeDetailItem.value = null
  const query = { ...route.query }
  delete query.item
  void router.replace({ query })
}

// 弹幕系统
const danmakus = ref<DanmakuMessage[]>([])
const danmakuInput = ref('')
const danmakuPaused = ref(false)
const sendingDanmaku = ref(false)
const isFed = ref(false)
let fedTimeout: any = null

function feedFish() {
  isFed.value = true
  clearTimeout(fedTimeout)
  fedTimeout = setTimeout(() => {
    isFed.value = false
  }, 2500)
}

const promoIndex = ref(0)
const showcasePairs = ref<any[]>([])

const currentPromo = computed(() => {
  if (showcasePairs.value.length > 0) {
    return showcasePairs.value[promoIndex.value]
  }
  return {
    good: { code: '1581', label: '标准效果', model: 'OPAI GPT 6', desc: '真实作品 #1581', time: '136.4s', html: '' },
    bad: { code: '9CE0', label: '失败效果', model: 'OPAI GPT 6', desc: '真实作品 #9CE0', time: '158.1s', html: '' },
  }
})

function togglePromo() {
  if (showcasePairs.value.length > 0) {
    promoIndex.value = (promoIndex.value + 1) % showcasePairs.value.length
  }
}

const filtered = computed(() => {
  let list = items.value.filter((i) => i.benchmark === viewBenchmark.value)

  if (filter.value === 'best') {
    list = list.filter((i) => i.likes > 0)
  } else if (filter.value === 'fails') {
    list = list.filter((i) => i.fails > 0 || i.verdict === 'failed')
  }

  if (onlyMine.value) {
    list = list.filter((i) => i.mine)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter((i) =>
      (i.code && i.code.toLowerCase().includes(q)) ||
      (i.title && i.title.toLowerCase().includes(q)) ||
      (i.model && i.model.toLowerCase().includes(q)) ||
      (i.source && i.source.toLowerCase().includes(q))
    )
  }

  if (sortBy.value === 'likes') {
    list.sort((a, b) => b.likes - a.likes)
  } else if (sortBy.value === 'size') {
    list.sort((a, b) => ((b.html || b.answerText || '').length) - ((a.html || a.answerText || '').length))
  } else {
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  return list
})

const totalPages = computed(() => Math.ceil(filtered.value.length / pageSize) || 1)
const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filtered.value.slice(start, start + pageSize)
})

async function load(force = false) {
  loading.value = true
  listError.value = ''
  try {
    const [galleryItems, dmkMessages, scPairs] = await Promise.all([
      fetchGalleryItems(force),
      fetchDanmakuMessages(force).catch(() => danmakus.value),
      fetchShowcasePairs(force).catch(() => showcasePairs.value),
    ])
    items.value = galleryItems
    danmakus.value = dmkMessages
    if (Array.isArray(scPairs) && scPairs.length > 0) {
      showcasePairs.value = scPairs
    }
    if (items.value.length > 0 && !selectedVisitorItem.value) {
      selectedVisitorItem.value = items.value[0]
    }
  } catch (error) {
    listError.value = error instanceof Error ? error.message : '读取作品墙失败，请重试。'
  } finally {
    loading.value = false
  }
}

async function sendDanmaku() {
  const text = danmakuInput.value.trim()
  if (!text || sendingDanmaku.value) return
  sendingDanmaku.value = true
  try {
    const res = await fetch('/api/danmaku', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const data = await res.json()
    if (res.ok) {
      if (!danmakus.value.some((m) => m.id === data.message.id)) {
        danmakus.value.push(data.message)
      }
      addCachedDanmaku(data.message)
      danmakuInput.value = ''
    }
  } finally {
    sendingDanmaku.value = false
  }
}

function handleOpenReport(item: GalleryItem) {
  activeReportItem.value = item
}

function handleOpenDetail(item: GalleryItem) {
  void router.push({ query: { ...route.query, item: item.id } })
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

watch([filter, viewBenchmark, onlyMine, sortBy], () => { currentPage.value = 1 })
watch(galleryChanges, () => { void load(true) })
onMounted(() => { void load(true) })
</script>

<template>
  <div v-if="detailLoading || detailError" class="share-notice page-wrap" :role="detailError ? 'alert' : 'status'">
    <span>{{ detailLoading ? '正在打开分享的作品…' : detailError }}</span>
    <button v-if="detailError" class="button secondary" type="button" @click="detailRetry++">重试</button>
    <button class="button ghost-dark" type="button" @click="closeDetail">返回作品墙</button>
  </div>
  <!-- 顶部模型商店：标准 vs 失败，看图就懂 -->
  <section class="gallery-promo page-wrap">
    <div class="promo-copy">
      <div class="promo-brand-tag">
        <span>OPAI 模型商店</span>
      </div>
      <h1>标准 vs 失败，<br />看图就懂。</h1>
      <p class="promo-sub">店主 TIBO · 同名，同盒。GPT6 我的博士呢？</p>
      <div class="promo-action">
        <RouterLink class="button primary" to="/test">
          测测你这盒 <ArrowRight :size="15" />
        </RouterLink>
      </div>
    </div>

    <div class="promo-showcase">
      <div class="showcase-card showcase-good">
        <div class="showcase-header">
          <span class="badge-good">标准效果</span>
          <span class="showcase-code">{{ currentPromo.good.desc }}</span>
        </div>
        <div class="showcase-art">
          <ArtworkFrame :html="currentPromo.good.html" :title="currentPromo.good.label" interactive />
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
          <ArtworkFrame :html="currentPromo.bad.html" :title="currentPromo.bad.label" interactive />
        </div>
        <div class="showcase-footer">
          <span>{{ currentPromo.bad.model }}</span>
          <small>{{ currentPromo.bad.time }}</small>
        </div>
      </div>
    </div>
  </section>

  <!-- 真实作品 · 画面对比 -->
  <section class="page-wrap gallery-workspace">
    <div class="workspace-main">
      <!-- 过滤与排序条 -->
      <div class="gallery-filter-bar">
        <!-- 左侧普通分类按钮 -->
        <div class="tab-filters">
          <button :class="{ active: filter === 'all' }" @click="filter = 'all'">
            最新 {{ items.length }}
          </button>
          <button :class="{ active: filter === 'best' }" @click="filter = 'best'">
            最佳 {{ items.filter(i => i.likes > 0).length }}
          </button>
          <button :class="{ active: filter === 'fails' }" @click="filter = 'fails'">
            最丑 {{ items.filter(i => i.fails > 0 || i.verdict === 'failed').length }}
          </button>
        </div>

        <!-- 右侧工具栏：详细卡片/糖果测试胶囊切换 + 搜索 + 只看我的 + 排序 + 刷新 -->
        <div class="bar-right">
          <div class="gallery-search-box">
            <Search :size="14" />
            <input
              v-model="searchQuery"
              placeholder="搜索编号或模型..."
              @input="currentPage = 1"
            />
          </div>

          <BenchmarkSwitch v-model="viewBenchmark" />

          <label class="only-mine-label">
            <input v-model="onlyMine" type="checkbox" />
            <span>只看我的</span>
          </label>

          <select v-model="sortBy" class="sort-dropdown">
            <option value="likes">人气优先</option>
            <option value="newest">最新发布</option>
            <option value="size">文件大小</option>
          </select>

          <button class="icon-refresh-btn" type="button" aria-label="刷新" @click="load(true)">
            <RefreshCw :class="{ spin: loading }" :size="16" />
          </button>
        </div>
      </div>

      <!-- 作品墙网格：支持鹈鹕骑行（SVG动画）与糖果测试（答卷预览） -->
      <div v-if="pagedItems.length" class="works-grid">
        <div
          v-for="item in pagedItems"
          :key="item.id"
          :class="['artwork-item-card', { selected: selectedVisitorItem?.id === item.id }]"
          @click="selectedVisitorItem = item"
        >
          <!-- 判定角标 (通过 / 降智) -->
          <div v-if="item.verdict && item.origin !== 'demo'" :class="['ribbon-badge', sampleStatus(item).tone]" :title="sampleStatus(item).detail">
            {{ sampleStatus(item).label }}
          </div>

          <!-- 若是鹈鹕骑行，展示内联SVG动画 -->
          <div v-if="item.benchmark === 'pelican' && item.html" class="card-art" @click="handleOpenDetail(item)">
            <ArtworkFrame :html="item.html" :preview-src="item.previewImage || '/api/gallery/' + encodeURIComponent(item.id) + '/preview'" :title="item.title" />
            <div class="hover-tip">点击查看源码与详情</div>
          </div>

          <!-- 若是糖果测试，展示推理答卷预览 -->
          <div v-else class="card-candy-art" @click="handleOpenDetail(item)">
            <div class="card-candy-title">糖果测试 · 推理答卷</div>
            <pre class="card-candy-text">{{ item.answerText }}</pre>
            <div class="hover-tip">点击查看完整推导</div>
          </div>

          <div class="card-bottom">
            <div class="card-title-row">
              <b>{{ item.visitorAlias || ('访客 ' + item.code) }}</b>
              <span class="card-time">{{ formatDate(item.createdAt) }}</span>
            </div>
            <div class="card-meta-row">
              <span>{{ item.benchmark === 'candy' ? '糖果测试' : item.model }} · {{ item.effort }}</span>
              <span>{{ formatDuration(item.latencyMs) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="loading" class="empty-state" role="status">正在读取作品墙…</div>
      <div v-else-if="listError" class="empty-state" role="alert">
        <p>{{ listError }}</p>
        <button class="button secondary" @click="load(true)">重新加载</button>
      </div>
      <div v-else class="empty-state">
        <p>还没有公开作品</p>
        <RouterLink class="text-link" to="/test">画一只 <ArrowRight :size="14" /></RouterLink>
      </div>

      <!-- 分页栏 -->
      <nav v-if="totalPages > 1" class="gallery-pagination">
        <span>共 {{ filtered.length }} 幅 · 每页 {{ pageSize }} 幅 · 第 {{ currentPage }} / {{ totalPages }} 页</span>
        <div class="pagination-btns">
          <button
            type="button"
            :disabled="currentPage <= 1"
            @click="currentPage = Math.max(1, currentPage - 1)"
          >
            上一页
          </button>
          <button
            type="button"
            :disabled="currentPage >= totalPages"
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
          >
            下一页
          </button>
        </div>
      </nav>
    </div>
  </section>

  <!-- 底部弹幕互动区（嘴可以比轮子快） -->
  <section class="page-wrap danmaku-section">
    <div class="danmaku-header">
      <div class="danmaku-title">
        <MessageSquare :size="18" />
        <b>嘴可以比轮子快。</b>
      </div>
      <button class="danmaku-toggle-btn" type="button" @click="danmakuPaused = !danmakuPaused">
        <Play v-if="danmakuPaused" :size="14" />
        <Pause v-else :size="14" />
        {{ danmakuPaused ? '播放飘过' : '暂停飘过' }}
      </button>
    </div>

    <!-- 弹幕滚屏槽（三轨道 + 轨道序号 + 投喂一条鱼彩蛋） -->
    <div class="danmaku-stage" :class="{ paused: danmakuPaused }">
      <div class="danmaku-guides" aria-hidden="true">
        <span>01</span>
        <span>02</span>
        <span>03</span>
      </div>

      <div class="danmaku-tracks-wrap">
        <div class="danmaku-track track-1">
          <span v-for="m in danmakus.slice(0, 4)" :key="m.id" class="danmaku-bubble">
            {{ m.text }}
          </span>
        </div>
        <div class="danmaku-track track-2">
          <span v-for="m in danmakus.slice(4, 7)" :key="m.id" class="danmaku-bubble">
            {{ m.text }}
          </span>
        </div>
        <div class="danmaku-track track-3">
          <span v-for="m in danmakus.slice(7)" :key="m.id" class="danmaku-bubble">
            {{ m.text }}
          </span>
        </div>
      </div>

      <!-- 投喂一条鱼按钮 -->
      <button
        type="button"
        :class="['feed-bird-btn', { isFed }]"
        title="投喂一条鱼，触发小彩蛋"
        @click="feedFish"
      >
        <Fish :size="16" />
        <span>{{ isFed ? '嗝。今天不想努力了。' : '投喂一条鱼' }}</span>
      </button>
    </div>

    <!-- 发送弹幕输入条 -->
    <div class="danmaku-input-bar">
      <input
        v-model="danmakuInput"
        class="danmaku-text-input"
        type="text"
        placeholder="夸它一句，或者让它别骑了..."
        maxlength="60"
        @keydown.enter="sendDanmaku"
      />
      <span class="char-count">{{ danmakuInput.length }}/60</span>
      <button class="send-danmaku-btn" type="button" :disabled="sendingDanmaku || !danmakuInput.trim()" @click="sendDanmaku">
        <Send :size="14" />
        弹幕发车
      </button>
    </div>
    <small class="danmaku-notice">免登录 · 弹幕会保存 · 不接受网址、广告与引流</small>
  </section>

  <!-- 放大详情与源码弹窗 -->
  <ArtworkDetailModal
    v-if="activeDetailItem"
    :key="activeDetailItem.id"
    :item="activeDetailItem"
    @close="closeDetail"
    @report="handleOpenReport"
  />

  <!-- 战报海报弹窗 -->
  <ReportModal
    v-if="activeReportItem"
    :item="activeReportItem"
    @close="activeReportItem = null"
  />
</template>

<style scoped>
.gallery-promo {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  gap: 36px;
  align-items: center;
  margin-top: 24px;
  padding: 32px 36px;
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
.promo-copy h1 {
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

.gallery-workspace {
  margin-top: 32px;
}
.gallery-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
}
.tab-filters {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tab-filters button {
  background: transparent;
  border: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #64748b;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
}
.tab-filters button:hover {
  color: #0f172a;
  background: #f8fafc;
}
.tab-filters button.active {
  color: #0f172a;
  background: #f1f5f9;
}
.bar-right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.gallery-search-box {
  position: relative;
  display: flex;
  align-items: center;
}
.gallery-search-box svg {
  position: absolute;
  left: 10px;
  color: #94a3b8;
  pointer-events: none;
}
.gallery-search-box input {
  height: 34px;
  width: 150px;
  padding: 0 10px 0 30px;
  font-size: 0.82rem;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: #ffffff;
  color: #0f172a;
  transition: width 0.2s ease, border-color 0.2s ease;
}
.gallery-search-box input:focus {
  width: 200px;
  border-color: #0f172a;
  outline: none;
}
.only-mine-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: #475569;
  cursor: pointer;
}
.sort-dropdown {
  height: 34px;
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 10px;
  font-size: 0.82rem;
  color: #0f172a;
  background: #ffffff;
  cursor: pointer;
}
.icon-refresh-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--line);
  background: #ffffff;
  border-radius: 4px;
  display: grid;
  place-items: center;
  color: #64748b;
  cursor: pointer;
}
.icon-refresh-btn:hover {
  background: #f8fafc;
  color: #0f172a;
}

.works-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.artwork-item-card {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.artwork-item-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
}
.artwork-item-card.selected {
  outline: 2px solid #0f172a;
}
.ribbon-badge {
  position: absolute;
  right: -28px;
  top: 14px;
  transform: rotate(45deg);
  width: 100px;
  text-align: center;
  font-size: 0.68rem;
  font-weight: 700;
  color: white;
  z-index: 5;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
.ribbon-pass {
  background: #16a34a;
}
.ribbon-fail {
  background: #dc2626;
}
.card-art {
  height: auto;
  aspect-ratio: var(--artwork-preview-ratio);
  background: #ffffff;
  position: relative;
}
.card-candy-art {
  height: auto;
  aspect-ratio: var(--artwork-preview-ratio);
  min-height: 0;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  position: relative;
  padding: 14px;
  display: flex;
  flex-direction: column;
}
.card-candy-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
  margin-bottom: 6px;
}
.card-candy-text {
  margin: 0;
  font-family: inherit;
  font-size: 0.78rem;
  line-height: 1.5;
  color: #64748b;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: hidden;
  flex: 1;
}
.hover-tip {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  padding: var(--space-1);
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 600;
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.card-art:hover .hover-tip, .card-candy-art:hover .hover-tip {
  opacity: 1;
}
.card-bottom {
  padding: 12px 14px;
  border-top: 1px solid #f1f5f9;
  background: #ffffff;
}
.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.88rem;
  color: #0f172a;
  margin-bottom: 4px;
}
.card-time {
  font-size: 0.72rem;
  color: #64748b;
}
.card-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.76rem;
  color: #64748b;
}

.gallery-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  font-size: 0.82rem;
  color: #64748b;
}
.pagination-btns {
  display: flex;
  gap: 8px;
}
.pagination-btns button {
  padding: 6px 14px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
  transition: all 0.15s ease;
}
.pagination-btns button:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.pagination-btns button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 弹幕互动区 */
.danmaku-section {
  margin-top: 40px;
  padding: 24px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.danmaku-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.danmaku-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.05rem;
  color: #0f172a;
}
.danmaku-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid #cbd5e1;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.76rem;
  color: #64748b;
  cursor: pointer;
}
.danmaku-stage {
  height: 140px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  display: flex;
}
.danmaku-guides {
  width: 48px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding: 10px 0 10px 14px;
  border-right: 1px dashed #e2e8f0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.72rem;
  color: #94a3b8;
  user-select: none;
}
.danmaku-tracks-wrap {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding: 10px 0;
  overflow: hidden;
  position: relative;
}
.danmaku-track {
  display: flex;
  white-space: nowrap;
  animation: scrollDanmaku 20s linear infinite;
  gap: 36px;
}
.track-2 {
  animation-duration: 25s;
  animation-delay: -5s;
}
.track-3 {
  animation-duration: 22s;
  animation-delay: -10s;
}
.danmaku-stage.paused .danmaku-track {
  animation-play-state: paused;
}
@keyframes scrollDanmaku {
  from { transform: translateX(100%); }
  to { transform: translateX(-100%); }
}
.danmaku-bubble {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.8rem;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.feed-bird-btn {
  position: absolute;
  right: 14px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 600;
  color: #166534;
  cursor: pointer;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.15s ease;
}
.feed-bird-btn:hover {
  background: #f0fdf4;
  border-color: #86efac;
  transform: scale(1.04);
}
.feed-bird-btn.isFed {
  background: #fef3c7;
  border-color: #fde047;
  color: #854d0e;
  animation: wiggle 0.4s ease;
}
@keyframes wiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-6deg); }
  75% { transform: rotate(6deg); }
}
.danmaku-input-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.danmaku-text-input {
  flex: 1;
  height: 42px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0 14px;
  font-size: 0.88rem;
}
.danmaku-text-input:focus {
  outline: 2px solid #0f172a;
}
.char-count {
  font-size: 0.75rem;
  color: #94a3b8;
  font-family: 'IBM Plex Mono', monospace;
}
.send-danmaku-btn {
  height: 42px;
  padding: 0 18px;
  background: #0f172a;
  color: white;
  border: 0;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.send-danmaku-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.danmaku-notice {
  display: block;
  margin-top: 8px;
  font-size: 0.74rem;
  color: #94a3b8;
}

@media (max-width: 1100px) {
  .gallery-filter-bar {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .bar-right {
    flex-wrap: wrap;
    max-width: 100%;
  }
  .only-mine-label { white-space: nowrap; }
  .works-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 700px) {
  .danmaku-text-input { min-width: 0; }
  .gallery-promo {
    grid-template-columns: 1fr;
  }
  .works-grid {
    grid-template-columns: 1fr;
  }
}
</style>
