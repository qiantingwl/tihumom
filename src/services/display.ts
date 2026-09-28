import type { GalleryItem } from '../types'

export function artworkUsage(item: Pick<GalleryItem, 'origin' | 'displayUsage' | 'latencyMs' | 'inputTokens' | 'outputTokens' | 'cost'>) {
  const usage = item.origin === 'demo' ? item.displayUsage : undefined
  if (!usage) return { latencyMs: item.latencyMs, inputTokens: item.inputTokens, outputTokens: item.outputTokens, cost: item.cost, note: item.origin === 'reused' ? '复用原作品' : '' }
  const simulated = Object.values(usage.fieldSources).some((source) => source === 'simulated')
  return { ...usage, note: simulated ? '展示用量（含随机演示值）' : '复用原记录用量' }
}

export function verdictText(verdict?: 'passed' | 'failed') {
  return verdict === 'passed' ? '通过' : verdict === 'failed' ? '降智' : '未判定'
}

export function sampleStatus(item: Pick<GalleryItem, 'origin' | 'benchmark' | 'verdict'>) {
  if (item.origin === 'demo') return { label: '作品展示', detail: '这份作品没有独立实测记录，画面与原内容保持一致。', tone: '' }
  if (item.benchmark === 'custom') return { label: '自定义', detail: '自定义回答不使用鹈鹕或糖果基准判分。', tone: '' }
  if (item.verdict === 'passed') return { label: '通过', detail: '已保存的评测结论；具体依据见作品详情。', tone: 'ribbon-pass' }
  if (item.verdict === 'failed') return { label: '降智', detail: '已保存的评测结论；具体依据见作品详情。', tone: 'ribbon-fail' }
  if (item.origin === 'reused') return { label: '复用记录', detail: '复用原作品，未保存可用评测结论。', tone: '' }
  return { label: '未评测', detail: '这条记录没有可用评测结论，不能据画面自行补判。', tone: '' }
}

export function verdictClass(verdict?: 'passed' | 'failed', pass = 'pass', fail = 'fail') {
  return verdict === 'passed' ? pass : verdict === 'failed' ? fail : ''
}

export function formatDuration(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${(value / 1000).toFixed(1)}s` : '—'
}

export function formatPercent(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '—'
}

export function compareDuration(a?: number | null, b?: number | null, left = '作品 A', right = '作品 B') {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return '耗时未记录，无法比较'
  if (a === b) return '两者耗时相同'
  return `${a < b ? left : right} 比 ${a < b ? right : left} 快 ${(Math.abs(a - b) / 1000).toFixed(1)} 秒`
}
