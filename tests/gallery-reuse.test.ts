import assert from 'node:assert/strict'
import test from 'node:test'
import { reuseGallery } from '../server/gallery-reuse.js'
import { measuredRecords } from '../server/statistics.js'
import { hasManualAssessment, manualAssessment } from '../server/manual-assessment.js'
import type { GalleryItem } from '../server/types.js'

test('bulk reuse creates independent IDs with original evidence and no new measured runs', () => {
  const source = { id: 'original', code: '123456', benchmark: 'pelican', title: '作品 #123456',
    model: 'recorded-model', mode: 'benchmark', effort: 'high', source: 'original-route',
    html: '<svg>bird</svg>', createdAt: '2026-09-20T01:00:00Z', published: true,
    verdict: 'failed', judgmentVersion: 'local-structure-v12', inputTokens: 123,
    latencyMs: 3210, cost: '$0.12', likes: 3, abstracts: 0, fails: 1, owner: 'private-owner', origin: 'measured' } as GalleryItem
  Object.assign(source, manualAssessment(source, 'passed', '确认正常'))
  const rows = [source]
  const first = reuseGallery(rows, [source.id], 300, 'batch')
  assert.equal(first.created, true)
  assert.equal(new Set(first.items.map(x => x.id)).size, 300)
  assert.equal(new Set([source, ...first.items].map(x => x.code)).size, 301)
  for (const item of first.items) {
    assert.equal(item.html, source.html)
    assert.equal(item.createdAt, source.createdAt)
    assert.equal(item.model, source.model)
    assert.equal(item.inputTokens, 123)
    assert.equal(item.cost, '$0.12')
    assert.equal(item.reuseSourceId, source.id)
    assert.equal(item.likes, 0)
    assert.equal((item as any).owner, undefined)
    assert.equal(hasManualAssessment(item), true)
  }
  assert.equal(measuredRecords([...rows, ...first.items], []).length, 1)
  const retry = reuseGallery([...rows, ...first.items], [source.id], 300, 'batch')
  assert.equal(retry.created, false)
  assert.deepEqual(retry.items, first.items)
  assert.throws(() => reuseGallery([{ ...source, deletedAt: 'now' }], [source.id], 3, 'deleted'))
  assert.throws(() => reuseGallery([{ ...source, origin: 'demo' }], [source.id], 3, 'demo'))
  assert.throws(() => reuseGallery(rows, ['missing'], 3, 'missing'))
})
