import assert from 'node:assert/strict'
import test from 'node:test'
import { verdictText, verdictClass, formatDuration, formatPercent, compareDuration } from '../src/services/display.js'

test('display keeps missing results neutral and preserves real zero values', () => {
  assert.equal(verdictText(undefined), '未判定')
  assert.equal(verdictClass(undefined), '')
  assert.equal(verdictText('passed'), '通过')
  assert.equal(verdictText('failed'), '降智')
  assert.equal(formatDuration(null), '—')
  assert.equal(formatDuration(0), '0.0s')
  assert.equal(formatPercent(null), '—')
  assert.equal(formatPercent(0), '0%')
  assert.equal(compareDuration(null, 1000), '耗时未记录，无法比较')
})
