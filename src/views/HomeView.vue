<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { AlertTriangle, ArrowRight, BarChart3, Layers3, Radio, ShieldCheck, Sparkles } from '@lucide/vue'
import SectionHeading from '../components/SectionHeading.vue'
import GalleryCard from '../components/GalleryCard.vue'
import BenchmarkSwitch from '../components/BenchmarkSwitch.vue'
import ReportModal from '../components/ReportModal.vue'
import ArtworkDetailModal from '../components/ArtworkDetailModal.vue'
import { fetchBootstrapData, fetchGalleryItems, galleryChanges, getCachedGalleryItems } from '../services/api'
import type { GalleryItem } from '../types'

const home = ref({
  kicker: '鹈鹕妈妈 · 模型观察站',
  title: '今天还会骑吗？',
  description: '让模型多跑一圈，看看它是不是认真的在认真工作。',
  primaryLabel: '开始测试',
  primaryHref: '/test',
  secondaryEnabled: false,
  secondaryLabel: '看看作品墙',
  secondaryHref: '/gallery',
})
const selectedBenchmark = ref<'pelican' | 'candy'>('pelican')
const latestItems = shallowRef<GalleryItem[]>([])
const works = computed(() => latestItems.value
  .filter((item) => item.benchmark === selectedBenchmark.value)
  .slice(0, 6))
const activeReportItem = ref<GalleryItem | null>(null)
const activeDetailItem = ref<GalleryItem | null>(null)

onMounted(() => {
  showLatest(getCachedGalleryItems() || [])
  void fetchBootstrapData().then(bootstrap => {
    if (bootstrap?.home) Object.assign(home.value, bootstrap.home)
  }).catch(() => {})
  void fetchGalleryItems().then(showLatest).catch(() => {})
})

function showLatest(items: GalleryItem[]) {
  latestItems.value = [...items]
    .filter((item) => item.published && (item.html || item.answerText))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
watch(galleryChanges, async () => {
  try { showLatest(await fetchGalleryItems(true)) } catch {}
})

function handleOpenReport(item: GalleryItem) {
  activeReportItem.value = item
}

function handleOpenDetail(item: GalleryItem) {
  activeDetailItem.value = item
}
</script>

<template>
  <section class="home-hero page-wrap">
    <img class="hero-photo" src="/assets/hero-pelican-mama.jpg" alt="一只鹈鹕沿海边骑自行车" />
    <div class="hero-content">
      <span class="hero-kicker">{{ home.kicker }}</span>
      <h1>{{ home.title }}</h1>
      <p class="hero-lead">{{ home.description }}</p>
      <div class="hero-actions">
        <a class="button primary" :href="home.primaryHref">{{ home.primaryLabel }} <ArrowRight :size="16" /></a>
        <a v-if="home.secondaryEnabled" class="button ghost" :href="home.secondaryHref">{{ home.secondaryLabel }}</a>
      </div>
    </div>
    <div class="hero-dots" aria-hidden="true"><i></i><i></i><i class="active"></i></div>
  </section>

  <section class="quick-links page-wrap" aria-label="核心功能导航">
    <RouterLink to="/test">
      <Radio :size="18" />
      <h2>现场检测</h2>
      <p>支持自填接口与密钥，实时监控流式返回。</p>
    </RouterLink>
    <RouterLink to="/gallery">
      <Sparkles :size="18" />
      <h2>作品墙</h2>
      <p>公开样本库与代码战报，支持查看源码。</p>
    </RouterLink>
    <RouterLink to="/compare">
      <Layers3 :size="18" />
      <h2>同题对比</h2>
      <p>双窗口并排对齐题型、参数与耗时差异。</p>
    </RouterLink>
    <RouterLink to="/stats">
      <BarChart3 :size="18" />
      <h2>检测统计</h2>
      <p>模型通过率、平均响应耗时与近期流水。</p>
    </RouterLink>
    <RouterLink to="/suspicious">
      <AlertTriangle :size="18" />
      <h2>可疑样本</h2>
      <p>代码复用与异常生成行为技术分析记录。</p>
    </RouterLink>
    <RouterLink to="/api-docs">
      <ShieldCheck :size="18" />
      <h2>API 接入</h2>
      <p>标准 REST 与 SSE 接口规范及调用文档。</p>
    </RouterLink>
  </section>

  <section class="content-section works-section page-wrap">
    <SectionHeading eyebrow="PUBLIC BENCHMARK RESULTS" title="最新评测样本" :copy="selectedBenchmark === 'pelican' ? '最新鹈鹕作品，点击查看动画、源码与生成耗时。' : '最新糖果测试，点击查看完整回答与评测记录。'">
      <RouterLink class="text-link" to="/gallery">进入作品墙 <ArrowRight :size="15" /></RouterLink>
    </SectionHeading>
    <div class="home-gallery-toolbar">
      <BenchmarkSwitch v-model="selectedBenchmark" />
    </div>
    <div v-if="works.length" class="gallery-grid home-gallery">
      <GalleryCard
        v-for="item in works"
        :key="item.id"
        :item="item"
        @open="handleOpenDetail"
        @report="handleOpenReport"
      />
    </div>
    <p v-else class="home-gallery-empty" role="status">
      {{ selectedBenchmark === 'pelican' ? '暂无公开鹈鹕作品' : '暂无公开糖果测试' }}
    </p>
  </section>

  <section class="closing-band">
    <div class="page-wrap closing-inner">
      <div>
        <span class="eyebrow">READY WHEN YOU ARE</span>
        <h2>这一圈，让结果说话。</h2>
      </div>
      <RouterLink class="button light" to="/test">带模型上车 <ArrowRight :size="16" /></RouterLink>
    </div>
  </section>

  <!-- 放大作品详情与源码弹窗 -->
  <ArtworkDetailModal
    v-if="activeDetailItem"
    :item="activeDetailItem"
    @close="activeDetailItem = null"
    @report="handleOpenReport"
  />

  <!-- 战报导出弹窗 -->
  <ReportModal
    v-if="activeReportItem"
    :item="activeReportItem"
    @close="activeReportItem = null"
  />
</template>

<style scoped>
.home-gallery-toolbar { display: flex; margin-bottom: var(--space-3); }
.home-gallery-empty { padding-block: var(--space-4); color: var(--ink-soft); }
</style>
