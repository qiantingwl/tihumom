import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer, type ServerResponse } from 'node:http'
import { createStreamCollector, generate } from '../server/quality/generation.js'

async function fixture(run: (response: ServerResponse) => void, check: (url: string) => Promise<void>) {
  const server = createServer((_request, response) => run(response))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await check(`http://127.0.0.1:${(server.address() as { port: number }).port}/fixture`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`

test('reasoning progress is counted separately and never included in the answer', () => {
  const chat = createStreamCollector('chat')
  chat.accept({ choices: [{ delta: { reasoning_content: '先思考' } }] })
  assert.deepEqual(chat.progress(), { outputChars: 0, reasoningChars: 3 })
  assert.equal(chat.result().text, '')
  chat.accept({ choices: [{ delta: { content: '<svg/>' }, finish_reason: 'stop' }] })
  assert.deepEqual(chat.progress(), { outputChars: 6, reasoningChars: 3 })
  assert.equal(chat.result().text, '<svg/>')
  assert.equal(chat.result().incomplete, false)

  const responses = createStreamCollector('responses')
  responses.accept({ type: 'response.reasoning_summary_text.delta', delta: '规划' })
  responses.accept({ type: 'response.reasoning_summary_text.done', text: '规划' })
  assert.deepEqual(responses.progress(), { outputChars: 0, reasoningChars: 2 })
  responses.accept({ type: 'response.output_text.delta', delta: '答案' })
  assert.deepEqual(responses.progress(), { outputChars: 2, reasoningChars: 2 })
  assert.equal(responses.result().text, '答案')
})

test('SSE heartbeats cannot keep a stalled upstream alive forever', async () => {
  await fixture((response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write(': heartbeat\n\n')
    const timer = setInterval(() => response.write(': heartbeat\n\n'), 20)
    response.on('close', () => clearInterval(timer))
  }, async (url) => {
    const progress: any[] = []
    await assert.rejects(generate(url, { body: '{}' }, 'chat', {
      idleMs: 160, onProgress: (_count: number, details: any) => progress.push(details),
    } as any), (error: any) => error.code === 'GENERATION_IDLE_TIMEOUT')
    assert.ok(progress.length > 0)
    assert.ok(progress.every((p) => p.outputChars === 0 && p.reasoningChars === 0))
    assert.ok(progress.at(-1).receivedBytes > 0)
  })
})

test('continuing reasoning resets idle timeout and the final text still completes', async () => {
  await fixture((response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    let ticks = 0
    response.write(event({ choices: [{ delta: { reasoning_content: '思' } }] }))
    const timer = setInterval(() => {
      if (++ticks < 6) response.write(event({ choices: [{ delta: { reasoning_content: '考' } }] }))
      else {
        clearInterval(timer)
        response.end(event({ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n')
      }
    }, 80)
    response.on('close', () => clearInterval(timer))
  }, async (url) => {
    const progress: any[] = []
    const result = await generate(url, { body: '{}' }, 'chat', {
      idleMs: 250, onProgress: (_count: number, details: any) => progress.push(details),
    } as any)
    assert.equal(result.text, 'done')
    assert.equal(result.incomplete, false)
    assert.ok(progress.some((p) => p.reasoningChars > 0 && p.outputChars === 0))
    assert.ok(progress.at(-1).elapsedMs > 250)
    assert.equal(progress.at(-1).outputChars, 4)
  })
})

test('relays returning ordinary JSON expose receiving progress and preserve the result', async () => {
  await fixture((response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }))
  }, async (url) => {
    const progress: any[] = []
    const result = await generate(url, { body: '{}' }, 'chat', {
      onProgress: (_count: number, details: any) => progress.push(details),
    } as any)
    assert.equal(result.text, 'done')
    assert.equal(result.incomplete, false)
    assert.equal(progress.at(-1).buffering, true)
    assert.ok(progress.at(-1).receivedBytes > 0)
  })
})

test('an unresponsive connection times out and a waiting stream can be cancelled', async () => {
  await fixture(() => {}, async (url) => {
    await assert.rejects(generate(url, { body: '{}' }, 'chat', { idleMs: 120 }),
      (error: any) => error.code === 'GENERATION_IDLE_TIMEOUT')
  })
  await fixture((response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write(': heartbeat\n\n')
  }, async (url) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 80)
    try {
      await assert.rejects(generate(url, { body: '{}', signal: controller.signal }, 'chat'),
        (error: any) => error.name === 'AbortError')
    } finally { clearTimeout(timer) }
  })
})
