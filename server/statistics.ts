import type { GalleryItem, TestTask } from './types.js'

export const originOf = (item: Pick<GalleryItem, 'id' | 'origin'>) =>
  /^(bot-|demo-)/.test(item.id) ? 'demo' : item.origin || 'imported'

export function evaluatedVerdict(item: Pick<GalleryItem, 'benchmark' | 'judgmentVersion' | 'verdict'>) {
  const version = item.judgmentVersion || ''
  const supported = version === 'manual-confirmed-v1' || (item.benchmark === 'pelican'
    ? /^local-structure-v\d+$/.test(version)
    : item.benchmark === 'candy' && /^candy-final-v\d+$/.test(version))
  return supported && (item.verdict === 'passed' || item.verdict === 'failed')
    ? item.verdict : undefined
}

// Preserve explicitly stored historical conclusions for the original gallery.
// They are not new evaluations and must never enter the measured denominator.
export function displayedVerdict(item: Pick<GalleryItem, 'benchmark' | 'judgmentVersion' | 'verdict'>) {
  if (!item.judgmentVersion && (item.verdict === 'passed' || item.verdict === 'failed')) return item.verdict
  return evaluatedVerdict(item)
}

export function measuredRecords(gallery: GalleryItem[], tasks: Iterable<TestTask>) {
  const rows = new Map<string, GalleryItem>()
  const hidden = new Set(gallery.filter((item) => !item.published || item.deletedAt).map((item) => item.id))
  for (const task of tasks) {
    if (task.status !== 'completed' || task.input.demo || !task.result || hidden.has(task.id)) continue
    const item = {
      ...task.result, id: task.id, code: task.code, benchmark: task.benchmark,
      model: task.input.model, mode: task.input.mode, effort: task.input.effort,
      createdAt: task.completedAt || task.createdAt, published: false,
      likes: 0, abstracts: 0, fails: 0, origin: 'measured' as const,
    }
    if (evaluatedVerdict(item)) rows.set(item.id, item)
  }
  // Public records contain administrator rejudgments and take precedence over
  // the original task snapshot. Neither copies nor demos are new measurements.
  for (const item of gallery) {
    if (hidden.has(item.id)) continue
    if (evaluatedVerdict(item) && (originOf(item) === 'measured' || rows.has(item.id))) rows.set(item.id, item)
  }
  return [...rows.values()]
}

export function passRate(items: GalleryItem[]) {
  const judged = items.filter((item) => evaluatedVerdict(item))
  return judged.length ? Math.round(judged.filter((item) => item.verdict === 'passed').length / judged.length * 100) : null
}

export function averageLatency(items: GalleryItem[]) {
  const values = items.map((item) => item.latencyMs).filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}
