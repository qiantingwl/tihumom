import assert from 'node:assert/strict'
import test from 'node:test'
import { makeDisplayUsage, publicDisplayUsage } from '../server/display-usage.js'
import { artworkUsage } from '../src/services/display.js'

test('reused usage takes precedence, missing fields are stable and real measurements remain separate', () => {
  const original = { id: 'source', latencyMs: 0, inputTokens: 1200, outputTokens: 0, cost: '$0' }
  const reused = makeDisplayUsage({ id: 'bot-copy' }, original)
  assert.equal(reused.latencyMs, 0)
  assert.equal(reused.inputTokens, 1200)
  assert.equal(reused.outputTokens, 0)
  assert.equal(reused.cost, '$0')
  assert.ok(Object.values(reused.fieldSources).every((value) => value === 'reused'))
  assert.equal(reused.sourceRecordId, 'source')
  assert.equal((publicDisplayUsage(reused) as any).sourceRecordId, undefined)
  const partial = makeDisplayUsage({ id: 'bot-copy' }, { id: 'partial', inputTokens: 12 })
  assert.equal(partial.inputTokens, 12)
  assert.equal(partial.fieldSources.inputTokens, 'reused')
  assert.equal(partial.fieldSources.outputTokens, 'simulated')
  assert.deepEqual(partial, makeDisplayUsage({ id: 'bot-copy' }, { id: 'partial', inputTokens: 12 }))
  assert.notDeepEqual(makeDisplayUsage({ id: 'bot-copy' }), makeDisplayUsage({ id: 'bot-other' }))
  const demo = artworkUsage({ origin: 'demo', displayUsage: partial, latencyMs: null })
  assert.equal(demo.inputTokens, 12)
  assert.equal(demo.note, '展示用量（含随机演示值）')
  const measured = artworkUsage({ origin: 'measured', displayUsage: partial, latencyMs: 10, inputTokens: 0 })
  assert.equal(measured.inputTokens, 0)
  assert.equal(measured.outputTokens, undefined)
  assert.equal(measured.note, '')
})
