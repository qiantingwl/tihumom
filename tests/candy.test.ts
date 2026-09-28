import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoCandyResponse } from '../server/demo.js'

test('candy test passing answer contains 21', () => {
  const answer = createDemoCandyResponse(true)
  assert.match(answer, /(?:^|[^\d])21(?:[^\d]|$)/)
})

test('candy test failing answer does not contain 21', () => {
  const answer = createDemoCandyResponse(false)
  assert.doesNotMatch(answer, /(?:^|[^\d])21(?:[^\d]|$)/)
})
