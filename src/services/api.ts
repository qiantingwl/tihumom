import type { DanmakuMessage, GalleryItem, StatsOverview, SuspiciousSample } from '../types'
import { ref } from 'vue'
import { uniqueContent } from './catalog'
export const galleryChanges = ref(0)

// Share in-flight reads and expire display data without refetching on every route change.
const CACHE_TTL = 30000
const fetchedAt: Record<string, number> = {}
let galleryRevision = 0, statsRevision = 0, suspiciousRevision = 0
async function readJsonResponse(response: Response) {
  let data
  try { data = await response.json() } catch { throw new Error('服务响应格式异常，请稍后刷新') }
  if (!response.ok) throw new Error(data?.error || `请求失败（HTTP ${response.status}）`)
  return data
}
let cachedGallery: GalleryItem[] | null = null
let galleryInFlight: Promise<GalleryItem[]> | null = null

let cachedStats: StatsOverview | null = null
let statsInFlight: Promise<StatsOverview> | null = null

let cachedBootstrap: any = null
let bootstrapInFlight: Promise<any> | null = null

let cachedShowcase: any[] | null = null
let showcaseInFlight: Promise<any[]> | null = null

let cachedDanmaku: DanmakuMessage[] | null = null
let danmakuInFlight: Promise<DanmakuMessage[]> | null = null

let cachedSuspicious: SuspiciousSample[] | null = null
let suspiciousInFlight: Promise<SuspiciousSample[]> | null = null

export async function fetchGalleryItems(force = false): Promise<GalleryItem[]> {
  if (cachedGallery && !force && Date.now() - (fetchedAt.gallery || 0) < CACHE_TTL) {
    return cachedGallery
  }
  if (galleryInFlight) {
    return galleryInFlight
  }
  const revision = galleryRevision
  galleryInFlight = fetch('/api/gallery')
    .then(readJsonResponse)
    .then((data) => {
      if (revision !== galleryRevision) {
        galleryInFlight = null
        return fetchGalleryItems(true)
      }
      cachedGallery = uniqueContent<GalleryItem>(data.items || [])
      galleryInFlight = null
      fetchedAt.gallery = Date.now()
      return cachedGallery!
    })
    .catch((err) => {
      galleryInFlight = null
      throw err
    })
  return galleryInFlight
}

export function getCachedGalleryItems(): GalleryItem[] | null {
  return cachedGallery
}

export async function fetchGalleryItem(id: string, signal?: AbortSignal): Promise<GalleryItem> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 15000)
  try {
    const response = await fetch(`/api/gallery/${encodeURIComponent(id)}`, {
      cache: 'no-store', signal: controller.signal,
    })
    if (response.status === 404) throw new Error('该作品不存在、尚未公开或已被删除。')
    const data = await readJsonResponse(response)
    if (!data.item || data.item.id !== id) throw new Error('作品信息不完整，请稍后重试。')
    return data.item
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('读取作品超时，请重试。')
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

export function invalidateAssessmentCache() {
  galleryRevision++; statsRevision++; suspiciousRevision++
  cachedGallery = null
  cachedStats = null
  cachedSuspicious = null
  galleryChanges.value++
}

export function updateCachedGalleryItem(id: string, updates: Partial<GalleryItem>) {
  galleryRevision++; statsRevision++; suspiciousRevision++
  cachedStats = null
  cachedSuspicious = null
  if (!cachedGallery) return
  const item = cachedGallery.find((i) => i.id === id)
  if (item) {
    Object.assign(item, updates)
  }
  galleryChanges.value++
}

export function addCachedGalleryItem(item: GalleryItem) {
  galleryRevision++; statsRevision++; suspiciousRevision++
  cachedStats = null
  cachedSuspicious = null
  fetchedAt.gallery = 0
  galleryChanges.value++
  if (!cachedGallery) {
    cachedGallery = [item]
    return
  }
  cachedGallery = uniqueContent([item, ...cachedGallery.filter((entry) => entry.id !== item.id)])
}

export async function confirmPublishedItem(id: string): Promise<GalleryItem> {
  const item = await fetchGalleryItem(id)
  if (!item.published) throw new Error('作品尚未公开，请重新发布。')
  addCachedGalleryItem(item)
  return item
}

export async function fetchStatsData(force = false): Promise<StatsOverview> {
  if (cachedStats && !force && Date.now() - (fetchedAt.stats || 0) < CACHE_TTL) {
    return cachedStats
  }
  if (statsInFlight) {
    return statsInFlight
  }
  const revision = statsRevision
  statsInFlight = fetch('/api/stats')
    .then(readJsonResponse)
    .then((data) => {
      if (revision !== statsRevision) {
        statsInFlight = null
        return fetchStatsData(true)
      }
      data.recentRuns = uniqueContent(data.recentRuns || [])
      cachedStats = data
      statsInFlight = null
      fetchedAt.stats = Date.now()
      return data
    })
    .catch((err) => {
      statsInFlight = null
      throw err
    })
  return statsInFlight
}

export function getCachedStats(): StatsOverview | null {
  return cachedStats
}

export async function fetchBootstrapData(force = false): Promise<any> {
  if (cachedBootstrap && !force && Date.now() - (fetchedAt.bootstrap || 0) < CACHE_TTL) {
    return cachedBootstrap
  }
  if (bootstrapInFlight) {
    return bootstrapInFlight
  }
  bootstrapInFlight = fetch('/api/bootstrap')
    .then(readJsonResponse)
    .then((data) => {
      cachedBootstrap = data
      bootstrapInFlight = null
      fetchedAt.bootstrap = Date.now()
      return data
    })
    .catch((err) => {
      bootstrapInFlight = null
      throw err
    })
  return bootstrapInFlight
}

export function getCachedBootstrap(): any | null {
  return cachedBootstrap
}

export async function fetchShowcasePairs(force = false): Promise<any[]> {
  if (cachedShowcase && !force && Date.now() - (fetchedAt.showcase || 0) < CACHE_TTL) {
    return cachedShowcase
  }
  if (showcaseInFlight) {
    return showcaseInFlight
  }
  showcaseInFlight = fetch('/api/showcase')
    .then(readJsonResponse)
    .then((data) => {
      cachedShowcase = Array.isArray(data) ? data : []
      showcaseInFlight = null
      fetchedAt.showcase = Date.now()
      return cachedShowcase!
    })
    .catch((err) => {
      showcaseInFlight = null
      throw err
    })
  return showcaseInFlight
}

export function getCachedShowcase(): any[] | null {
  return cachedShowcase
}

export async function fetchDanmakuMessages(force = false): Promise<DanmakuMessage[]> {
  if (cachedDanmaku && !force && Date.now() - (fetchedAt.danmaku || 0) < CACHE_TTL) {
    return cachedDanmaku
  }
  if (danmakuInFlight) {
    return danmakuInFlight
  }
  danmakuInFlight = fetch('/api/danmaku')
    .then(readJsonResponse)
    .then((data) => {
      cachedDanmaku = data.messages || []
      danmakuInFlight = null
      fetchedAt.danmaku = Date.now()
      return cachedDanmaku!
    })
    .catch((err) => {
      danmakuInFlight = null
      throw err
    })
  return danmakuInFlight
}

export function getCachedDanmaku(): DanmakuMessage[] | null {
  return cachedDanmaku
}

export function addCachedDanmaku(msg: DanmakuMessage) {
  // 页面加载后 danmakus ref 与 cachedDanmaku 是同一数组引用，按 id 去重避免双重 push
  if (cachedDanmaku && !cachedDanmaku.some((m) => m.id === msg.id)) {
    cachedDanmaku.push(msg)
  }
}

export async function fetchSuspiciousSamples(force = false): Promise<SuspiciousSample[]> {
  if (cachedSuspicious && !force && Date.now() - (fetchedAt.suspicious || 0) < CACHE_TTL) {
    return cachedSuspicious
  }
  if (suspiciousInFlight) {
    return suspiciousInFlight
  }
  const revision = suspiciousRevision
  suspiciousInFlight = fetch('/api/suspicious')
    .then(readJsonResponse)
    .then((data) => {
      if (revision !== suspiciousRevision) {
        suspiciousInFlight = null
        return fetchSuspiciousSamples(true)
      }
      cachedSuspicious = uniqueContent<SuspiciousSample>(data.samples || [])
      suspiciousInFlight = null
      fetchedAt.suspicious = Date.now()
      return cachedSuspicious!
    })
    .catch((err) => {
      suspiciousInFlight = null
      throw err
    })
  return suspiciousInFlight
}

export function getCachedSuspicious(): SuspiciousSample[] | null {
  return cachedSuspicious
}
