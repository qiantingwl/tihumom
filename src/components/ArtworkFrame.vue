<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ARTWORK_VIEWPORT, previewDocument } from '../services/artwork-document'

const props = defineProps<{
  html: string
  title: string
  interactive?: boolean
  // 列表使用静态预览；交互视图直接显示动画，避免截图到动画的相位跳变。
  previewSrc?: string
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const frameRef = ref<HTMLIFrameElement | null>(null)
const isVisible = ref(false)
// 作品真正绘制出画面（收到尺寸回报）前保持占位符，避免 iframe 先闪一帧白底
const frameReady = ref(false)
const previewErrored = ref(false)
const previewLoaded = ref(false)
const loadingVisible = ref(false)
let loadingTimer: ReturnType<typeof setTimeout> | undefined
let readyFrame = 0
let observer: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
// IP/HTTP deployments have no randomUUID API; getRandomValues also works there.
const createChannel = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('')
const channel = ref(createChannel())
const frameSize = ref({ ...ARTWORK_VIEWPORT })
const containerSize = ref({ width: 0, height: 0 })
// Lists show browser-rendered images; only opened works execute their document.
const showFrame = computed(() => Boolean(props.html.trim()) && isVisible.value && (props.interactive || !props.previewSrc || previewErrored.value))
const usePreview = computed(() => !props.interactive && Boolean(props.previewSrc) && !previewErrored.value)
const waiting = computed(() => !frameReady.value && (!usePreview.value || !previewLoaded.value))
const documentHtml = computed(() => previewDocument(props.html, channel.value))
const frameStyle = computed(() => {
  const { width, height } = frameSize.value
  const scale = Math.min(containerSize.value.width / width, containerSize.value.height / height)
  return { width: `${width}px`, height: `${height}px`, transform: `translate(-50%, -50%) scale(${scale || 0})` }
})

watch(() => props.html, () => {
  channel.value = createChannel()
  frameSize.value = { ...ARTWORK_VIEWPORT }
  frameReady.value = false
})

watch(() => props.previewSrc, () => {
  previewErrored.value = false
  previewLoaded.value = false
})

function receiveSize(event: MessageEvent) {
  if (event.source !== frameRef.value?.contentWindow || event.data?.channel !== channel.value
    || event.data?.type !== 'pelican-preview-size') return
  const { width, height } = event.data
  if (!Number.isFinite(width) || !Number.isFinite(height)) return
  const nextSize = {
    width: Math.min(10000, Math.max(ARTWORK_VIEWPORT.width, Math.ceil(width))),
    height: Math.min(10000, Math.max(ARTWORK_VIEWPORT.height, Math.ceil(height))),
  }
  if (frameSize.value.width !== nextSize.width || frameSize.value.height !== nextSize.height) {
    frameSize.value = nextSize
  }
  // Apply the reported geometry before revealing the first animation frame.
  if (!frameReady.value) revealLoadedFrame()
}

watch([showFrame, () => props.html], () => {
  cancelAnimationFrame(readyFrame)
  frameReady.value = false
}, { immediate: true })

function revealLoadedFrame() {
  const frame = frameRef.value
  const documentChannel = channel.value
  cancelAnimationFrame(readyFrame)
  readyFrame = requestAnimationFrame(() => {
    readyFrame = requestAnimationFrame(() => {
      if (frame && frame === frameRef.value && documentChannel === channel.value && showFrame.value
        && containerSize.value.width > 0 && containerSize.value.height > 0) frameReady.value = true
    })
  })
}

watch(waiting, (pending) => {
  clearTimeout(loadingTimer)
  loadingVisible.value = false
  // Fast local frame startup should not flash a spinner for one or two paints.
  if (pending) loadingTimer = setTimeout(() => { loadingVisible.value = true }, 180)
}, { immediate: true })

onMounted(() => {
  window.addEventListener('message', receiveSize)
  resizeObserver = new ResizeObserver(([entry]) => {
    if (entry) containerSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  // Start details immediately; release showcase animations once off screen.
  if (props.interactive) isVisible.value = true
  observer = new IntersectionObserver(
    ([entry]) => {
      isVisible.value = entry?.isIntersecting ?? false
    },
    { rootMargin: '150px' }
  )

  if (containerRef.value) {
    observer.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  resizeObserver?.disconnect()
  window.removeEventListener('message', receiveSize)
  cancelAnimationFrame(readyFrame)
  clearTimeout(loadingTimer)
})
</script>

<template>
  <div ref="containerRef" class="artwork-frame-wrapper">
    <img
      v-if="usePreview"
      v-show="!showFrame || !frameReady"
      class="artwork-preview-img"
      :src="previewSrc"
      :loading="interactive ? 'eager' : 'lazy'"
      decoding="async"
      alt=""
      aria-hidden="true"
      @load="previewLoaded = true"
      @error="previewErrored = true"
    />
    <iframe
      v-if="showFrame"
      :key="channel"
      ref="frameRef"
      :class="['artwork-frame', { interactive, pending: !frameReady }]"
      :title="title"
      :srcdoc="documentHtml"
      :style="frameStyle"
      sandbox="allow-scripts"
      scrolling="no"
      :loading="interactive ? 'eager' : 'lazy'"
    />
    <div
      v-if="waiting && loadingVisible"
      class="artwork-placeholder"
      aria-hidden="true"
    >
      <div class="placeholder-spinner"></div>
    </div>
  </div>
</template>

<style scoped>
.artwork-frame-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #ffffff;
}
/* 缓存预览只用于等待动画或列表展示，不与已经就绪的动画叠加。 */
.artwork-preview-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  background: #ffffff;
  display: block;
}
.artwork-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center;
  border: 0;
  display: block;
  opacity: 1;
}
/* 作品完成首帧绘制前保持透明，避免 iframe 默认白底闪现 */
.artwork-frame.pending {
  opacity: 0;
}
.artwork-frame:not(.interactive) {
  pointer-events: none;
}
.artwork-placeholder {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  background: #f8fafc;
}
.placeholder-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #e2e8f0;
  border-top-color: #94a3b8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
