interface ContentRecord {
  id: string
  benchmark?: string
  html?: string
  answerText?: string
  origin?: string
  createdAt?: string
  time?: string
  date?: string
}

function contentKey(item: ContentRecord): string {
  const content = (item.html || item.answerText || '').replace(/\r\n?/g, '\n').trim()
  // Missing or truncated content is never enough to merge two records.
  return content ? JSON.stringify([item.benchmark || '', item.html ? 'html' : 'text', content]) : 'id:' + item.id
}

function sourceRank(item: ContentRecord): number {
  if (item.origin === 'measured') return 4
  if (item.origin === 'demo' || /^(bot-|demo-)/.test(item.id)) return 1
  if (item.origin === 'reused' || item.id.startsWith('reuse-')) return 2
  return 3
}

function timestamp(item: ContentRecord): number {
  return Date.parse(item.createdAt || item.time || item.date || '') || 0
}

// Collapse identical full artifacts in listings, keeping all original IDs in storage.
export function uniqueContent<T extends ContentRecord>(items: readonly T[]): T[] {
  const chosen = new Map<string, T>()
  for (const item of items) {
    const key = contentKey(item)
    const previous = chosen.get(key)
    if (!previous || sourceRank(item) > sourceRank(previous)
      || (sourceRank(item) === sourceRank(previous) && timestamp(item) > timestamp(previous))) {
      chosen.set(key, item)
    }
  }
  return [...chosen.values()]
}
