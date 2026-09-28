import { randomBytes } from 'node:crypto'
import type { GalleryItem } from './types.js'

export function reuseGallery(gallery: GalleryItem[], sourceIds: string[], count: number, batchId: string) {
  const previous = gallery.filter(item => item.reuseBatchId === batchId)
  if (previous.length) return { items: previous, created: false }
  const wanted = new Set(sourceIds)
  const sources = gallery.filter(item => wanted.has(item.id) && !item.deletedAt && item.published
    && item.origin !== 'demo' && item.origin !== 'reused' && !/^(bot-|demo-)/.test(item.id)
    && (item.benchmark === 'candy' ? !!item.answerText : !!item.html))
  if (!Number.isInteger(count) || count < 1 || count > 500 || !wanted.size || sources.length !== wanted.size) {
    throw Object.assign(new Error('请选择现有的原作品，复制数量为 1–500'), { statusCode: 400 })
  }
  const codes = new Set(gallery.map(item => item.code))
  const reusedAt = new Date().toISOString()
  const items: GalleryItem[] = []
  for (let index = 0; index < count; index++) {
    const source = sources[index % sources.length]
    let code: string
    do { code = randomBytes(3).toString('hex').toUpperCase() } while (codes.has(code))
    codes.add(code)
    const item: GalleryItem = {
      id: `reuse-${batchId}-${index}`, code,
      title: source.title.replace(/#[0-9a-f]+/gi, `#${code}`),
      benchmark: source.benchmark, model: source.model, mode: source.mode,
      effort: source.effort, source: source.source,
      createdAt: source.createdAt, latencyMs: source.latencyMs,
      inputTokens: source.inputTokens, outputTokens: source.outputTokens, cost: source.cost,
      html: source.html, answerText: source.answerText, prompt: source.prompt,
      verdict: source.verdict, judgmentVersion: source.judgmentVersion,
      inspections: source.inspections, analysis: source.analysis,
      previewImage: source.previewImage, responseModel: source.responseModel,
      manualAssessmentHash: source.manualAssessmentHash, originalAssessment: source.originalAssessment,
      published: true, likes: 0, abstracts: 0, fails: 0,
      origin: 'reused', reuseSourceId: source.id, reuseBatchId: batchId, reusedAt,
    }
    items.push(item)
  }
  return { items, created: true }
}
