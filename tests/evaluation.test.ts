import assert from 'node:assert/strict'
import test from 'node:test'
import { gradeCandy } from '../server/evaluation.js'
import { inspectPelican } from '../server/quality/quality.js'
import { createStreamCollector, createSseParser, generate } from '../server/quality/generation.js'
import { createServer } from 'node:http'
import { isPublicIp, normalizeEndpoint } from '../server/security.js'

test('candy uses the final answer, not incidental 21 or conflicting conclusions', () => {
  assert.equal(gradeCandy('推导中可能是 21\nFINAL_ANSWER: 22').verdict, 'failed')
  assert.equal(gradeCandy('FINAL_ANSWER: 21\n最终答案：22').verdict, 'failed')
  assert.equal(gradeCandy('FINAL_ANSWER: 21\nFINAL_ANSWER: 22').verdict, 'failed')
  assert.equal(gradeCandy('FINAL_ANSWER: 22\n21').verdict, 'failed')
  assert.equal(gradeCandy('FINAL_ANSWER: 21.5\n21').verdict, 'failed')
  assert.equal(gradeCandy('21').verdict, 'passed')
  assert.equal(gradeCandy('分析\n**FINAL_ANSWER: 21**').verdict, 'passed')
  assert.equal(gradeCandy('最终答案为 21 个').verdict, 'passed')
  assert.equal(gradeCandy('最终答案是：21 颗糖果。').verdict, 'passed')
  assert.equal(gradeCandy('最终答案：21.5').verdict, 'failed')
  assert.equal(gradeCandy('最终答案：21 或者 22').verdict, 'failed')
  assert.equal(gradeCandy('之前提到了 21，还需继续计算').verdict, 'failed')
})
test('keywords, SVG in script strings and external images cannot pass the document gate', () => {
  assert.equal(inspectPelican('<p>pelican bicycle @keyframes wheel</p>').verdict, 'failed')
  assert.equal(inspectPelican('<template><svg></svg></template>').verdict, 'failed')
  assert.equal(
    inspectPelican('<svg><image href="https://example.com/p.png"/></svg>').verdict,
    'failed',
  )
  const script = inspectPelican('<script>document.body.innerHTML="<svg></svg>"</script>')
  assert.ok(script.inspections.some((i: any) => i.name === '内联 SVG' && i.status === 'unknown'))
  assert.equal(inspectPelican('<style>@import "https://example.com/a.css";</style><svg/>').verdict, 'failed')
  assert.equal(inspectPelican('<style>svg{fill:url(https://example.com/a.svg)}</style><svg/>').verdict, 'failed')
  assert.equal(inspectPelican('<svg><defs><linearGradient id="local"/></defs><circle fill="url(#local)" r="4"/></svg>').verdict, 'passed')
})
test('endpoint normalization and non-public IPv4/IPv6 are enforced', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.1.1',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '0.0.0.0',
  ])
    assert.equal(isPublicIp(ip), false, ip)
  assert.equal(isPublicIp('8.8.8.8'), true)
  assert.equal(normalizeEndpoint('https://example.com/v1').pathname, '/v1/responses')
  assert.equal(
    normalizeEndpoint('https://example.com/v1/chat/completions').pathname,
    '/v1/chat/completions',
  )
  assert.throws(() => normalizeEndpoint('https://user:pass@example.com/v1'), /HTTPS/)
})
test('stream errors with HTTP 200, truncation, split chunks and actual usage stay distinct', () => {
  const failed = createStreamCollector('responses')
  failed.accept({ type: 'response.failed', response: { error: { message: 'quota' } } })
  assert.equal(failed.result().failed, true)
  const truncated = createStreamCollector('chat')
  truncated.accept({ choices: [{ index: 0, delta: { content: 'abc' }, finish_reason: 'length' }] })
  assert.equal(truncated.result().incomplete, true)
  const c = createStreamCollector('responses'),
    parser = createSseParser((value: any, event: string) => c.accept(value, event))
  const events = [
    { type: 'response.output_text.delta', delta: '中文作品' },
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        model: 'returned-model',
        output_text: '中文作品',
        usage: { input_tokens: 0, output_tokens: 9, cost: { amount: 0, currency: 'USD' } },
      },
    },
  ]
  const raw = events.map((e) => 'data: ' + JSON.stringify(e) + '\r\n\r\n').join('')
  for (const char of raw) parser.push(char)
  const r: any = c.result()
  assert.equal(r.text, '中文作品')
  assert.equal(r.incomplete, false)
  assert.equal(r.inputTokens, 0)
  assert.equal(r.outputTokens, 9)
  assert.equal(r.responseModel, 'returned-model')
  assert.equal(r.billing?.amount, 0)
  const unknown = createStreamCollector('chat')
  unknown.accept({ choices: [{ index: 0, delta: { content: 'abc' }, finish_reason: 'stop' }] })
  assert.equal(unknown.result().inputTokens, null)
  assert.equal((unknown.result() as any).billing, undefined)
})

test('an HTML proxy error with HTTP 200 is a transport error, never artwork', async () => {
  const server = createServer((_request, response) => response.writeHead(200, { 'content-type': 'text/html' }).end('<!DOCTYPE html><h1>Bad gateway</h1>'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address() as { port: number }
    await assert.rejects(generate(`http://127.0.0.1:${address.port}/fixture`, { body: '{}' }, 'responses'),
      (error: any) => error.code === 'GENERATION_INVALID_RESPONSE' && !error.message.includes('<!DOCTYPE'))
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
})
