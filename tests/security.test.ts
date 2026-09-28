import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoHtml } from '../server/demo.js'
import { assertSafeEndpoint } from '../server/security.js'

test('demo artwork is a complete inert HTML document', () => {
  const html = createDemoHtml('TEST')
  assert.match(html, /<!doctype html>/i)
  assert.match(html, /<main class="scene">/)
  assert.doesNotMatch(html, /<script/i)
})

test('rejects non-HTTPS upstream endpoints', async () => {
  await assert.rejects(() => assertSafeEndpoint('http://api.example.com/v1/responses'), /HTTPS/)
})

test('rejects localhost and private-address endpoints', async () => {
  await assert.rejects(() => assertSafeEndpoint('https://localhost/v1/responses'), /本机|局域网/)
  await assert.rejects(() => assertSafeEndpoint('https://127.0.0.1/v1/responses'), /内网/)
  await assert.rejects(() => assertSafeEndpoint('https://192.168.1.2/v1/responses'), /内网/)
})
