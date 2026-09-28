import { createHash } from 'node:crypto'
import type { DisplayUsage, GalleryItem } from './types.js'

const validNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const validCost = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim() && value.trim() !== '—'

// Display-only metadata: never overwrite the actual request/billing fields.
// A stable per-record seed prevents missing values changing on refresh.
export function makeDisplayUsage(item: Pick<GalleryItem, 'id'>, source?: Partial<GalleryItem>): DisplayUsage {
  const random = (field: string, minimum: number, maximum: number) => {
    const value = createHash('sha256').update(`display-usage-v1:${item.id}:${field}`).digest().readUInt32BE(0)
    return minimum + value % (maximum - minimum + 1)
  }
  const fieldSources: DisplayUsage['fieldSources'] = {
    latencyMs: validNumber(source?.latencyMs) ? 'reused' : 'simulated',
    inputTokens: validNumber(source?.inputTokens) ? 'reused' : 'simulated',
    outputTokens: validNumber(source?.outputTokens) ? 'reused' : 'simulated',
    cost: validCost(source?.cost) ? 'reused' : 'simulated',
  }
  return {
    latencyMs: validNumber(source?.latencyMs) ? source.latencyMs : random('latencyMs', 60000, 180000),
    inputTokens: validNumber(source?.inputTokens) ? source.inputTokens : random('inputTokens', 900, 2600),
    outputTokens: validNumber(source?.outputTokens) ? source.outputTokens : random('outputTokens', 1800, 6500),
    cost: validCost(source?.cost) ? source.cost.trim() : `$${(random('cost', 100, 800) / 10000).toFixed(4)}`,
    fieldSources,
    sourceRecordId: source?.id,
  }
}

export function publicDisplayUsage(value?: DisplayUsage) {
  if (!value) return undefined
  const { sourceRecordId: _, ...publicValue } = value
  return publicValue
}
