import assert from 'node:assert/strict'
import test from 'node:test'
import { measuredRecords, passRate, averageLatency } from '../server/statistics.js'
import { acceptCustomOutput } from '../server/evaluation.js'

test('statistics exclude copies and custom output, preserve zero and honor rejudgment/deletion', () => {
  const base: any = {
    id: 'real', benchmark: 'pelican', origin: 'measured', judgmentVersion: 'local-structure-v10',
    verdict: 'passed', latencyMs: 0, published: true, model: 'requested-model',
  }
  const task: any = { id: 'real', status: 'completed', benchmark: 'pelican', input: { demo: false }, result: base }
  const gallery = [
    { ...base, verdict: 'failed', judgmentVersion: 'local-structure-v11' },
    { ...base, id: 'bot-copy', origin: 'measured' },
    { ...base, id: 'custom', benchmark: 'custom' },
    { ...base, id: 'ungraded', judgmentVersion: undefined },
    { ...base, id: 'import', origin: 'imported' },
  ]
  const rows = measuredRecords(gallery, [task])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].verdict, 'failed')
  assert.equal(passRate(rows), 0)
  assert.equal(averageLatency(rows), 0)
  assert.equal(averageLatency([]), null)
  assert.equal(passRate([]), null)
  assert.equal(measuredRecords([{ ...base, deletedAt: '2026-09-25' }], [task]).length, 0)
  assert.equal(measuredRecords([{ ...base, published: false }], [task]).length, 0)
  assert.equal(acceptCustomOutput().verdict, undefined)
})
