import assert from 'node:assert/strict'
import test from 'node:test'
import { uniqueContent } from '../src/services/catalog.js'

test('catalog merges full duplicate artifacts, keeps originals and preserves other benchmarks', () => {
  const rows = [
    { id: 'copy', html: '<svg/>\r\n', benchmark: 'pelican', origin: 'reused', createdAt: '2026-09-26' },
    { id: 'original', html: '<svg/>', benchmark: 'pelican', origin: 'measured', createdAt: '2026-09-25' },
    { id: 'custom', html: '<svg/>', benchmark: 'custom', origin: 'measured' },
    { id: 'different', html: '<svg><circle/></svg>', benchmark: 'pelican' },
    { id: 'empty-a', benchmark: 'pelican' },
    { id: 'empty-b', benchmark: 'pelican' },
  ]
  const before = structuredClone(rows)
  assert.deepEqual(uniqueContent(rows).map(item => item.id), ['original', 'custom', 'different', 'empty-a', 'empty-b'])
  assert.deepEqual(rows, before)
})

test('newest equally ranked result wins without merging text excerpts', () => {
  const rows = [
    { id: 'old', answerText: 'answer', benchmark: 'candy', origin: 'measured', createdAt: '2026-09-24' },
    { id: 'new', answerText: 'answer', benchmark: 'candy', origin: 'measured', createdAt: '2026-09-26' },
    { id: 'longer', answerText: 'answer continued', benchmark: 'candy', origin: 'measured' },
  ]
  assert.deepEqual(uniqueContent(rows).map(item => item.id), ['new', 'longer'])
})
