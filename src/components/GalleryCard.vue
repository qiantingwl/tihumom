<script setup lang="ts">
import { formatDuration } from "../services/display"
import { ref } from 'vue'
import { ArrowLeftRight, Clock3, FileImage, Sparkles, ThumbsDown, Zap } from '@lucide/vue'
import ArtworkFrame from './ArtworkFrame.vue'
import { updateCachedGalleryItem } from '../services/api'
import type { GalleryItem } from '../types'

const props = defineProps<{
  item: GalleryItem
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  select: [item: GalleryItem]
  report: [item: GalleryItem]
  open: [item: GalleryItem]
}>()

const localLikes = ref(props.item.likes)
const localAbstracts = ref(props.item.abstracts)
const localFails = ref(props.item.fails)
const reacting = ref(false)

async function react(type: 'likes' | 'abstracts' | 'fails') {
  if (reacting.value) return
  reacting.value = true
  try {
    const res = await fetch(`/api/gallery/${props.item.id}/react`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    const data = await res.json()
    if (res.ok) {
      localLikes.value = data.likes
      localAbstracts.value = data.abstracts
      localFails.value = data.fails
      updateCachedGalleryItem(props.item.id, {
        likes: data.likes,
        abstracts: data.abstracts,
        fails: data.fails,
      })
    }
  } catch (e) {
    console.error(e)
  } finally {
    reacting.value = false
  }
}

function effortLabel(effort: string) {
  const map: Record<string, string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '极高' }
  return map[effort] || effort
}
</script>

<template>
  <article :class="['gallery-card', { selected, selectable, candy: item.benchmark === 'candy' }]">
    <div class="card-top-bar" @click.stop="$emit('open', item)">
      <span class="code-tag">#{{ item.code }}</span>
      <span class="benchmark-tag" :class="item.benchmark">
        {{ item.benchmark === 'candy' ? '糖果测试' : (item.mode === 'benchmark' ? '基准题' : '随机题') }}
      </span>
      <span v-if="item.source" class="source-tag">来源 {{ item.source }}</span>
    </div>

    <!-- 点击图片/画面触发放大查看弹窗 -->
    <div
      v-if="item.html"
      class="gallery-art clickable-art"
      title="点击查看完整作品与源代码"
      @click.stop="$emit('open', item)"
    >
      <ArtworkFrame :html="item.html" :preview-src="item.previewImage || '/api/gallery/' + encodeURIComponent(item.id) + '/preview'" :title="`${item.model} 的作品`" />
      <div class="art-overlay-hint">点击查看详情与源码</div>
    </div>
    <div
      v-else
      class="gallery-candy-preview clickable-art"
      title="点击查看完整解答"
      @click.stop="$emit('open', item)"
    >
      <div class="candy-badge">推理记录</div>
      <p class="candy-text">{{ item.answerText || '无文本回答' }}</p>
      <div class="art-overlay-hint">点击查看完整答卷</div>
    </div>

    <div class="gallery-meta" @click.stop="$emit('open', item)">
      <div class="meta-main">
        <h3>{{ item.title }}</h3>
        <p class="model-line">
          <b>{{ item.model }}</b>
          <span class="meta-dot">·</span>
          <span>思考 {{ effortLabel(item.effort) }}</span>
        </p>
      </div>
      <span class="work-time"><Clock3 :size="13" /> {{ formatDuration(item.latencyMs) }}</span>
    </div>

    <!-- 互动点赞与反应条（纯文字无花哨表情） -->
    <div class="card-reactions">
      <button class="rx-btn rx-like" type="button" title="好看" @click.stop="react('likes')">
        <Sparkles :size="13" /> 好看 <span class="rx-count">{{ localLikes }}</span>
      </button>
      <button class="rx-btn rx-abstract" type="button" title="抽象" @click.stop="react('abstracts')">
        <Zap :size="13" /> 抽象 <span class="rx-count">{{ localAbstracts }}</span>
      </button>
      <button class="rx-btn rx-fail" type="button" title="翻车" @click.stop="react('fails')">
        <ThumbsDown :size="13" /> 翻车 <span class="rx-count">{{ localFails }}</span>
      </button>
    </div>

    <div class="card-actions-bar">
      <button class="card-action-btn" type="button" title="生成并导出图片战报" @click.stop="$emit('report', item)">
        <FileImage :size="14" /> 战报
      </button>
      <button
        v-if="selectable"
        :class="['card-action-btn', 'compare-btn', { active: selected }]"
        type="button"
        title="选择加入对比"
        @click.stop="$emit('select', item)"
      >
        <ArrowLeftRight :size="14" /> {{ selected ? '已加入' : '对比' }}
      </button>
      <RouterLink v-else class="card-action-btn" :to="`/compare?left=${encodeURIComponent(item.id)}`" title="加入同题对比">
        <ArrowLeftRight :size="14" /> 对比
      </RouterLink>
    </div>
  </article>
</template>

<style scoped>
.gallery-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.gallery-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
}
.gallery-card.selected {
  border-color: #0f172a;
  outline: 2px solid #0f172a;
}
.gallery-select {
  width: 100%;
  height: 36px;
  background: #f8fafc;
  border: 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.gallery-select:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.gallery-select[aria-pressed="true"] {
  background: #0f172a;
  color: #ffffff;
}
.card-top-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 8px;
  font-size: 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
  cursor: pointer;
}
.code-tag {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  color: #0f172a;
}
.benchmark-tag {
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
  background: #f1f5f9;
  color: #334155;
}
.source-tag {
  margin-left: auto;
  font-size: 0.7rem;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 1px 6px;
  border-radius: 3px;
}
.clickable-art {
  cursor: pointer;
  position: relative;
}
.art-overlay-hint {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  padding: var(--space-1);
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink);
  display: grid;
  place-items: center;
  font-size: 0.85rem;
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.clickable-art:hover .art-overlay-hint {
  opacity: 1;
}
.gallery-art {
  height: auto;
  aspect-ratio: var(--artwork-preview-ratio);
  overflow: hidden;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
}
.gallery-candy-preview {
  height: auto;
  aspect-ratio: var(--artwork-preview-ratio);
  padding: 14px;
  background: #f8fafc;
  overflow: hidden;
  position: relative;
  border-bottom: 1px solid #f1f5f9;
}
.candy-badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  background: #e2e8f0;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}
.candy-text {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 7;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gallery-meta {
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}
.meta-main h3 {
  margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}
.model-line {
  margin: 0;
  font-size: 0.78rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
}
.meta-dot {
  opacity: 0.5;
}
.work-time {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
}
.card-reactions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 10px;
  border-bottom: 1px solid #f1f5f9;
}
.rx-btn {
  border: 1px solid #e2e8f0;
  background: #ffffff;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #475569;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.rx-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.rx-count {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  color: #0f172a;
}
.card-actions-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 14px;
  background: #ffffff;
}
.card-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.76rem;
  font-weight: 600;
  color: #64748b;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}
.card-action-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #e2e8f0;
}
.card-action-btn.compare-btn.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}
</style>
