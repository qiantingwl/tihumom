import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchStatsData, addCachedGalleryItem, fetchGalleryItems, invalidateAssessmentCache, getCachedGalleryItems } from '../src/services/api.js'

test('a completed test invalidates older in-flight statistics and HTTP errors never poison the cache', async () => {
  const originalFetch = globalThis.fetch
  let release: (value: Response) => void = () => {}
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    if (requests === 1) return new Promise<Response>((resolve) => { release = resolve })
    return new Response(JSON.stringify({ totalRuns: 2 }))
  }) as typeof fetch
  try {
    const first = fetchStatsData(true)
    addCachedGalleryItem({ id: 'new-fixture' } as any)
    release(new Response(JSON.stringify({ totalRuns: 1 })))
    assert.equal((await first).totalRuns, 2)
    assert.equal((await fetchStatsData()).totalRuns, 2)
    assert.equal(requests, 2)
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'fixture failure' }), { status: 503 })) as typeof fetch
    await assert.rejects(fetchGalleryItems(true), /fixture failure/)
    globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ id: 'recovered' }] }))) as typeof fetch
    assert.equal((await fetchGalleryItems(true))[0].id, 'recovered')
    invalidateAssessmentCache()
    assert.equal(getCachedGalleryItems(), null)
    globalThis.fetch = (async () => new Response(JSON.stringify({ items: [{ id: 'recovered', verdict: 'failed' }] }))) as typeof fetch
    assert.equal((await fetchGalleryItems())[0].verdict, 'failed')
  } finally { globalThis.fetch = originalFetch }
})
