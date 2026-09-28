import './env.js'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import cookie from '@fastify/cookie'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { parse, serialize } from 'parse5'
import { thumbnail } from './previews.js'
import { showcaseWithPreviews, type ShowcasePair } from './showcase.js'
import { readJson, writeJson } from './storage.js'
import {
  getSettings,
  saveSettings,
  defaults,
  promptFor,
  homeSchema,
  defaultHome,
} from './settings.js'
import { evaluateHtml, gradeCandy, acceptCustomOutput } from './evaluation.js'
import { QUALITY_VERSION } from './quality/quality.js'
import { originOf, evaluatedVerdict, displayedVerdict, measuredRecords, passRate, averageLatency } from './statistics.js'
import { assessmentKey, sameAssessmentContent, planRejudgment } from './rejudgment.js'
import { assessmentContentHash, hasManualAssessment, manualAssessment, MANUAL_VERSION } from './manual-assessment.js'
import { makeDisplayUsage, publicDisplayUsage } from './display-usage.js'
import { reuseGallery } from './gallery-reuse.js'
import { uniqueContent } from '../src/services/catalog.js'
import { assertSafeEndpoint, safeLookup } from './security.js'
import { generate } from './quality/generation.js'
import { closeRenderer } from './quality/render-quality.js'
import { createDemoHtml, createDemoCandyResponse } from './demo.js'
import type { GalleryItem, TestTask, TestInput, ReasoningEffort } from './types.js'

export const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-admin-token'],
  },
  bodyLimit: 2 * 1024 * 1024,
  trustProxy: process.env.TRUST_PROXY === 'loopback' ? 'loopback' : false,
})
const auth = readJson('session-secret.json', { secret: '' })
if (!auth.secret) {
  auth.secret = randomBytes(32).toString('hex')
  writeJson('session-secret.json', auth)
}
await app.register(cookie, { secret: auth.secret })
let gallery = readJson<GalleryItem[]>('gallery.json', [])
if (!Array.isArray(gallery)) throw new Error('作品文件不是列表，停止启动以保护历史数据')
const taskList = readJson<TestTask[]>('tasks.json', [])
const tasks = new Map(taskList.map((t) => [t.id, t]))
const controllers = new Map<string, AbortController>()
const listeners = new Map<string, Set<(t: TestTask) => void>>()
const windows = new Map<string, number[]>()
const rejudging = new Set<string>()
let shuttingDown = false
const terminal = (t: TestTask) => ['completed', 'failed'].includes(t.status)
for (const t of tasks.values())
  if (!terminal(t))
    Object.assign(t, {
      status: 'failed',
      progress: 100,
      error: '服务重启，本次请求已停止；请手动重新检测',
      message: '检测中断',
    })
function persistTasks() {
  writeJson(
    'tasks.json',
    [...tasks.values()].filter((t) => Date.parse(t.createdAt) > Date.now() - 7 * 86400000),
  )
}
function commit(items: GalleryItem[]) {
  writeJson('gallery.json', items)
  gallery = items
}
function update(t: TestTask, patch: Partial<TestTask>) {
  const previous = { ...t }
  Object.assign(t, patch)
  try { persistTasks() } catch (error) {
    for (const key of Object.keys(patch)) delete (t as any)[key]
    Object.assign(t, previous)
    throw error
  }
  for (const fn of listeners.get(t.id) || []) {
    try { fn(t) } catch { listeners.get(t.id)?.delete(fn) }
  }
}
function limited(key: string, max: number, windowMs = 600000) {
  const now = Date.now(),
    list = (windows.get(key) || []).filter((t) => now - t < windowMs)
  if (list.length >= max) return false
  list.push(now)
  windows.set(key, list)
  return true
}
function owner(request: any) {
  const signed = request.unsignCookie(request.cookies.pelican_visitor || '')
  return signed.valid ? (signed.value as string) : ''
}
function publicTask(task: TestTask) {
  const { owner: _, ...rest } = task
  return rest
}
function isAdmin(request: any) {
  const expected = process.env.ADMIN_TOKEN || '',
    actual = request.headers['x-admin-token']
  if (!expected || typeof actual !== 'string') return false
  const a = Buffer.from(actual),
    b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
app.addHook('onRequest', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer')
  if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store')
  // 全开放跨域与跨站提交，允许任何前端域名或中转代理发起测试
  reply.header('Access-Control-Allow-Origin', '*')
  reply.header('Access-Control-Allow-Headers', '*')
  reply.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS')
  if (request.method === 'OPTIONS') {
    return reply.code(204).send()
  }
  if (request.url.startsWith('/api/admin/')) {
    if (!limited('admin:' + request.ip, 120)) return reply.code(429).send({ error: '请求过于频繁' })
    if (!process.env.ADMIN_TOKEN)
      return reply.code(503).send({ error: '请先运行 npm run setup 配置管理员口令' })
    if (!isAdmin(request)) return reply.code(401).send({ error: '管理员口令不正确' })
  }
  if (!owner(request)) {
    ;(request as any).visitor = randomUUID()
    reply.setCookie('pelican_visitor', (request as any).visitor, {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: 365 * 86400,
    })
  }
})
app.setErrorHandler((error: any, request, reply) => {
  if (error instanceof z.ZodError)
    return reply.code(400).send({ error: error.issues[0]?.message || '参数无效' })
  if (error.statusCode && error.statusCode < 500)
    return reply.code(error.statusCode).send({ error: error.message })
  request.log.error({ name: error.name, code: error.code }, 'request failed')
  return reply.code(500).send({ error: '操作未完成，请重试或检查服务日志' })
})
function publicItem(i: GalleryItem, visitor = '', full = false) {
  const {
    owner: _,
    html,
    answerText,
    previewImage,
    manualAssessmentHash: _manualHash,
    originalAssessment: _originalAssessment,
    reuseSourceId: _reuseSourceId,
    reuseBatchId: _reuseBatchId,
    ...item
  } = i as GalleryItem & { owner?: string }
  const origin = originOf(i)
  return {
    ...item,
    origin,
    displayUsage: origin === 'demo' ? publicDisplayUsage(i.displayUsage) : undefined,
    judgmentSource: i.judgmentVersion === MANUAL_VERSION ? 'manual' : evaluatedVerdict(i) ? 'automatic' : displayedVerdict(i) ? 'historical' : 'ungraded',
    mine: !!visitor && (i as any).owner === visitor,
    inputTokens: origin === 'demo' ? null : (i.inputTokens ?? null),
    outputTokens: origin === 'demo' ? null : (i.outputTokens ?? null),
    cost: origin === 'demo' ? undefined : i.cost,
    latencyMs: origin === 'demo' ? null : (i.latencyMs ?? null),
    previewImage:
      previewImage || html ? `/api/gallery/${encodeURIComponent(i.id)}/preview` : undefined,
    artifactUrl: i.html ? `/api/artifacts/${encodeURIComponent(i.id)}` : undefined,
    contentSize: Buffer.byteLength(html || answerText || ''),
    ...(full
      ? { html, answerText, verdict: displayedVerdict(i) }
      : { answerText: answerText?.slice(0, 180), verdict: displayedVerdict(i) }),
  }
}
const available = (i: GalleryItem) => i.published && !i.deletedAt
const inputSchema = z.object({
  demo: z.boolean().default(false),
  benchmark: z.enum(['pelican', 'candy', 'custom']).default('pelican'),
  endpoint: z.string().trim().max(500).optional(),
  apiKey: z.string().trim().max(1000).optional(),
  model: z.string().trim().min(1).max(120),
  mode: z.enum(['benchmark', 'random', 'candy', 'custom']).default('benchmark'),
  customPrompt: z.string().trim().max(10000).optional(),
  effort: z.enum(['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('auto'),
  source: z.string().trim().max(50).optional(),
})
function safeOutput(text: string, secret?: string, endpoint?: string) {
  for (const value of [secret, endpoint]) if (value) text = text.split(value).join('[REDACTED]')
  return text
}
async function runTask(task: TestTask, secret?: string) {
  const start = Date.now(),
    controller = new AbortController()
  controllers.set(task.id, controller)
  // Absolute guard for endless streams; normal timeout is idle-based and configurable.
  const absolute = setTimeout(() => controller.abort(), 3600000)
  try {
    const settings = getSettings()
    update(task, { status: 'connecting', progress: 12, message: '正在连接接口' })
    let output = '',
      inputTokens: number | null = null,
      outputTokens: number | null = null,
      responseModel: string | null = null,
      cost: string | undefined
    if (task.input.demo) {
      const originals = gallery.filter((i) => !i.deletedAt && i.benchmark === 'pelican' && i.html)
      output = task.benchmark === 'candy'
        ? createDemoCandyResponse(true)
        : originals.length
          ? originals[Math.floor(Math.random() * originals.length)].html!
          : createDemoHtml('本地演示')
    } else {
      const endpoint = await assertSafeEndpoint(task.input.endpoint!)
      const format = endpoint.pathname.endsWith('/chat/completions') ? 'chat' : 'responses'
      const body: any =
        format === 'chat'
          ? {
              model: task.input.model,
              messages: [{ role: 'user', content: task.prompt }],
              stream: true,
              stream_options: { include_usage: true },
              max_tokens: settings.maxOutputTokens,
            }
          : {
              model: task.input.model,
              input: task.prompt,
              stream: true,
              max_output_tokens: settings.maxOutputTokens,
            }
      if (task.input.effort !== 'auto') {
        if (format === 'chat') body.reasoning_effort = task.input.effort
        else body.reasoning = { effort: task.input.effort }
      }
      update(task, {
        status: 'generating', progress: 35, message: '已发送生成请求，等待上游返回内容',
        generation: { outputChars: 0, reasoningChars: 0, receivedBytes: 0, elapsedMs: 0 },
      })
      let lastReport = 0
      const r: any = await (generate as any)(
        endpoint.toString(),
        {
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${secret}`,
            accept: 'text/event-stream, application/json',
          },
          body: JSON.stringify(body),
          lookup: safeLookup,
          signal: controller.signal,
        },
        format,
        {
          idleMs: settings.idleTimeoutSeconds * 1000,
          onProgress: (charCount: number, generation: NonNullable<TestTask['generation']>) => {
            const firstOutput = charCount > 0 && !task.generation?.outputChars
            const firstReasoning = generation.reasoningChars > 0 && !task.generation?.reasoningChars
            if (Date.now() - lastReport > 800 || firstOutput || firstReasoning) {
              lastReport = Date.now()
              const pct = Math.min(80, 35 + Math.floor((charCount / 6000) * 45))
              update(task, {
                status: 'generating',
                progress: pct,
                generation,
                message: charCount > 0
                  ? `正在接收正文，已接收 ${charCount} 字符`
                  : generation.reasoningChars > 0
                    ? `上游正在推理，已接收 ${generation.reasoningChars} 个推理字符；尚未返回正文`
                    : generation.buffering
                      ? `正在接收完整响应，已接收 ${generation.receivedBytes} 字节`
                      : '上游连接仍在，等待正文或推理内容',
              })
            }
          },
        },
      )
      if (r.status < 200 || r.status >= 300 || r.failed) {
        let hint = ''
        try {
          const parsed = JSON.parse(r.text || '{}')
          hint = parsed.error?.message || parsed.message || parsed.code || ''
        } catch {}
        throw new Error(
          `接口未完成生成${r.status ? '（HTTP ' + r.status + '）' : ''}${hint ? ': ' + hint : ''}，请检查额度、权限与上游状态；不判定画面质量`,
        )
      }
      if (r.incomplete) throw new Error('上游输出截断或未完成，本次不判定画面质量；请检查输出上限')
      output = safeOutput(r.text || '', secret, task.input.endpoint)
      inputTokens = r.inputTokens
      outputTokens = r.outputTokens
      responseModel = r.responseModel || null
      if (r.billing?.amount != null && r.billing?.currency)
        cost = `${r.billing.currency} ${r.billing.amount}`
    }
    if (!output.trim()) throw new Error('上游没有返回内容，本次不判定画面质量')
    output = output.replace(/^\s*```(?:html|xml|svg)?\s*([\s\S]*?)```\s*$/i, '$1').trim()
    if (controller.signal.aborted) throw new Error('本次检测已取消')
    const generationLatencyMs = Date.now() - start
    const isCandy = task.benchmark === 'candy'
    const isCustom = task.benchmark === 'custom'
    const isHtmlCustom = isCustom && /<(?:svg|html)\b|<!doctype\s+html/i.test(output)

    update(task, {
      status: 'checking',
      progress: 85,
      message: isCandy ? '正在核对最终答案' : '正在本地渲染并检查生成结构',
    })
    const grade = isCandy
      ? gradeCandy(output)
      : isCustom
        ? acceptCustomOutput()
        : await evaluateHtml(output)

    if (controller.signal.aborted) throw new Error('本次检测已取消')
    const displayTitle = isCandy
      ? '糖果测试 · #' + task.code
      : isCustom
        ? '自定义题目 · #' + task.code
        : '鹈鹕骑行 · #' + task.code

    const testResult = {
      ...grade,
      latencyMs: generationLatencyMs,
      evaluationMs: Date.now() - start - generationLatencyMs,
      inputTokens,
      outputTokens,
      responseModel,
      cost,
      origin: task.input.demo ? 'demo' : 'measured',
      title: displayTitle,
      ...(isCandy || (isCustom && !isHtmlCustom)
        ? { answerText: output }
        : { html: output }),
    } as any

    const completedAt = new Date().toISOString()
    // 用户测试完成直接自动进入公共样本库与最新评测样本，无需手动发布
    if (!task.input.demo && !gallery.some((i) => i.id === task.id)) {
      commit([
        {
          ...testResult,
          id: task.id,
          code: task.code,
          benchmark: task.benchmark,
          model: task.input.model,
          mode: task.input.mode,
          effort: task.input.effort,
          source: task.input.source || '自测',
          createdAt: completedAt,
          published: true,
          likes: 0,
          abstracts: 0,
          fails: 0,
          prompt: task.prompt,
          owner: task.owner,
        } as GalleryItem,
        ...gallery,
      ])
    }
    update(task, {
      status: 'completed', progress: 100, message: '检测完成', completedAt, result: testResult,
    })
  } catch (error: any) {
    const message = controller.signal.aborted
      ? '本次检测已停止；未判定画面质量'
      : error.code === 'GENERATION_IDLE_TIMEOUT'
        ? `上游连续 ${getSettings().idleTimeoutSeconds} 秒未返回有效内容（心跳不计入输出），本次未判定画面质量`
        : safeOutput(error.message || '接口或本地检测异常', secret, task.input.endpoint)
    update(task, {
      status: 'failed',
      progress: 100,
      message: '检测未完成',
      completedAt: new Date().toISOString(),
      error: message,
      result: undefined,
    })
  } finally {
    clearTimeout(absolute)
    controllers.delete(task.id)
  }
}
app.get('/api/health', async () => ({ ok: true, quality: QUALITY_VERSION }))
app.get('/api/bootstrap', async () => ({
  service: 'ready',
  home: readJson('home-config.json', defaultHome),
  settings: getSettings(),
  stats: {
    completed: [...tasks.values()].filter((t) => t.status === 'completed' && !t.input.demo).length,
    publicWorks: uniqueContent(gallery.filter(available)).length,
    active: controllers.size,
  },
}))
app.post('/api/tests', async (request, reply) => {
  const config = getSettings()
  if (shuttingDown || !config.testsEnabled) return reply.code(503).send({ error: '检测暂未开放' })
  if (controllers.size >= config.maxConcurrent)
    return reply.code(429).header('Retry-After', '10').send({ error: '检测席位已满，请稍后再试' })
  if (!limited('test:' + request.ip, config.requestsPerTenMinutes))
    return reply.code(429).header('Retry-After', '600').send({ error: '检测过于频繁，请稍后再试' })
  const input = inputSchema.parse(request.body)
  if ((input.benchmark === 'candy' && input.mode === 'custom') ||
      (input.benchmark === 'custom' && input.mode === 'candy'))
    return reply.code(400).send({ error: '题型与测试模式冲突，请重新选择' })
  if (input.mode === 'candy' || input.benchmark === 'candy') {
    input.benchmark = 'candy'; input.mode = 'candy'
  } else if (input.mode === 'custom' || input.benchmark === 'custom') {
    input.benchmark = 'custom'; input.mode = 'custom'
  }
  if (input.demo && !config.demoEnabled) return reply.code(400).send({ error: '演示模式未开启' })
  if (!input.demo && (!input.endpoint || !input.apiKey))
    return reply.code(400).send({ error: '请填写接口地址和 API Key' })
  // Reserve capacity synchronously; endpoint/DNS validation is part of the owned task.
  const { apiKey, ...stored } = input
  const visitor = owner(request) || (request as any).visitor
  const id = randomUUID(),
    task: TestTask = {
      id,
      code: randomBytes(3).toString('hex').toUpperCase(),
      owner: visitor || '',
      benchmark: input.benchmark,
      status: 'queued',
      progress: 0,
      message: '等待连接',
      createdAt: new Date().toISOString(),
      input: stored as TestInput,
      prompt: promptFor(input.benchmark, input.mode, input.customPrompt),
    }
  if (!task.owner) return reply.code(409).send({ error: '请先刷新页面初始化访客会话' })
  tasks.set(id, task)
  try { persistTasks() } catch (error) { tasks.delete(id); throw error }
  void runTask(task, apiKey).catch(() => app.log.error('Task persistence failed'))
  return reply.code(202).send({ task: publicTask(task) })
})
function ownedTask(request: any) {
  const t = tasks.get(request.params.id)
  return t && (t.owner === owner(request) || isAdmin(request)) ? t : undefined
}
app.get('/api/tests', async (request) => ({
  items: [...tasks.values()]
    .filter((t) => t.owner === owner(request))
    .map((t) => {
      const p = publicTask(t)
      return {
        ...p,
        result: p.result
          ? { ...p.result, html: undefined, answerText: undefined, previewImage: undefined }
          : undefined,
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30),
}))
app.get('/api/tests/:id', async (request, reply) => {
  const task = ownedTask(request)
  return task
    ? { task: publicTask(task) }
    : reply.code(404).send({ error: '任务不存在或不属于当前访客' })
})
app.post('/api/tests/:id/cancel', async (request, reply) => {
  const t = ownedTask(request)
  if (!t) return reply.code(404).send({ error: '任务不存在' })
  controllers.get(t.id)?.abort()
  return { ok: true }
})
app.get('/api/tests/:id/events', async (request, reply) => {
  const task = ownedTask(request)
  if (!task) return reply.code(404).send({ error: '任务不存在' })
  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  })
  const set = listeners.get(task.id) || new Set()
  listeners.set(task.id, set)
  const heartbeat = setInterval(() => {
    if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n')
  }, 15000)
  const cleanup = () => {
    clearInterval(heartbeat)
    set.delete(send)
    if (!set.size) listeners.delete(task.id)
  }
  const send = (t: TestTask) => {
    if (reply.raw.destroyed) return cleanup()
    reply.raw.write(`data: ${JSON.stringify({ task: publicTask(t) })}\n\n`)
    if (terminal(t)) {
      cleanup()
      reply.raw.end()
    }
  }
  reply.raw.on('close', cleanup)
  set.add(send)
  send(task)
})
app.get('/api/gallery', async (request) => {
  const q = request.query as any,
    visitor = owner(request),
    settings = getSettings()
  let items = gallery.filter((i) => available(i) && !(i.html && i.html.includes('语法解析错误')))
  // The original UI paginates and opens source locally; keep its response contract.
  if (!Object.keys(q).length) {
    return { items: uniqueContent(items).map((i) => publicItem(i, visitor, true)) }
  }
  if (q.benchmark) items = items.filter((i) => i.benchmark === q.benchmark)
  if (q.mine === '1') items = items.filter((i) => (i as any).owner === visitor)
  if (q.filter === 'fails') items = items.filter((i) => i.judgmentVersion && i.verdict === 'failed')
  if (q.filter === 'worst') items = items.filter((i) => i.fails > 0)
  if (q.filter === 'best') items = items.filter((i) => i.likes > 0)
  if (q.search) {
    const search = String(q.search).toLowerCase()
    items = items.filter((i) =>
      [i.title, i.model, i.source, i.code].some((v) => v?.toLowerCase().includes(search)),
    )
  }
  items = uniqueContent(items).sort(
    q.sort === 'likes'
      ? (a, b) => b.likes - a.likes
      : q.sort === 'size'
        ? (a, b) => (b.html || b.answerText || '').length - (a.html || a.answerText || '').length
        : (a, b) => b.createdAt.localeCompare(a.createdAt),
  )
  const size = Math.min(100, Math.max(1, Math.floor(Number(q.pageSize)) || settings.pageSize)),
    total = items.length,
    page = Math.min(
      Math.max(1, Math.floor(Number(q.page)) || 1),
      Math.max(1, Math.ceil(total / size)),
    )
  return {
    items: items.slice((page - 1) * size, page * size).map((i) => publicItem(i, visitor)),
    total,
    page,
    pageSize: size,
    pages: Math.max(1, Math.ceil(total / size)),
  }
})
app.get('/api/gallery/:id', async (request, reply) => {
  const i = gallery.find((i) => i.id === (request.params as any).id && available(i))
  return i
    ? { item: publicItem(i, owner(request), true) }
    : reply.code(404).send({ error: '作品不存在' })
})
app.get('/api/gallery/:id/preview', async (request, reply) => {
  const i = gallery.find((i) => i.id === (request.params as any).id && available(i))
  if (!i) return reply.code(404).send()
  try {
    const buffer = i.previewImage?.startsWith('data:image/jpeg;base64,')
      ? Buffer.from(i.previewImage.split(',')[1], 'base64')
      : i.html
        ? await thumbnail(i.html)
        : null
    if (!buffer) return reply.code(404).send()
    return reply.type('image/jpeg').header('Cache-Control', 'private, max-age=300').send(buffer)
  } catch {
    return reply
      .type('image/svg+xml')
      .header('Cache-Control', 'no-store')
      .send(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#f8fafc"/><text x="300" y="205" text-anchor="middle" fill="#64748b" font-size="20">点击查看完整动画</text></svg>',
      )
  }
})
const artifactPolicy =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"
app.get('/api/artifacts/:id', async (request, reply) => {
  const item = gallery.find(
    (i) =>
      (i.id === (request.params as any).id || i.code === (request.params as any).id) &&
      available(i),
  )
  if (!item?.html) return reply.code(404).type('text/plain').send('作品不存在')
  const doc: any = parse(item.html)
  const clean = (n: any) => {
    if (n.childNodes)
      n.childNodes = n.childNodes.filter(
        (c: any) =>
          c.tagName !== 'base' &&
          !(c.tagName === 'meta' && c.attrs?.some((a: any) => a.name === 'http-equiv')),
      )
    for (const c of n.childNodes || []) clean(c)
  }
  clean(doc)
  const html = serialize(doc).replace(
    '<head>',
    '<head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:grid;place-items:center}svg{max-width:100%;max-height:100%}</style>',
  )
  return reply
    .header('Content-Security-Policy', artifactPolicy)
    .type('text/html;charset=utf-8')
    .send(html)
})
app.post('/api/gallery/:taskId/publish', async (request, reply) => {
  const task = tasks.get((request.params as any).taskId)
  if (!task || task.owner !== owner(request) || task.status !== 'completed' || !task.result)
    return reply.code(404).send({ error: '没有可发布的检测结果' })
  if (!gallery.some((i) => i.id === task.id))
    commit([
      {
        ...task.result,
        id: task.id,
        code: task.code,
        benchmark: task.benchmark,
        model: task.input.model,
        mode: task.input.mode,
        effort: task.input.effort,
        source: task.input.source,
        createdAt: task.completedAt!,
        published: true,
        likes: 0,
        abstracts: 0,
        fails: 0,
        prompt: task.prompt,
        owner: task.owner,
      } as GalleryItem,
      ...gallery,
    ])
  return { ok: true }
})
app.post('/api/gallery/:id/react', async (request, reply) => {
  const id = (request.params as any).id,
    type = z.enum(['likes', 'abstracts', 'fails']).parse((request.body as any)?.type),
    item = gallery.find((i) => i.id === id && available(i))
  if (!item) return reply.code(404).send({ error: '作品不存在' })
  if (!limited(`react:${request.ip}:${id}:${type}`, 1, 86400000))
    return reply.code(429).send({ error: '今天已经表达过这个看法' })
  const changed = { ...item, [type]: item[type] + 1 }
  commit(gallery.map((i) => (i.id === id ? changed : i)))
  return { ok: true, likes: changed.likes, abstracts: changed.abstracts, fails: changed.fails }
})
app.get('/api/showcase', async () =>
  getSettings().showShowcase ? showcaseWithPreviews(readJson<ShowcasePair[]>('showcase-pairs.json', [])) : [],
)
app.get('/api/showcase/:index/:side/preview', async (request, reply) => {
  const { index, side } = request.params as { index: string; side: string }
  if (!getSettings().showShowcase || !/^\d+$/.test(index) || !['good', 'bad'].includes(side))
    return reply.code(404).send()
  const pair = readJson<ShowcasePair[]>('showcase-pairs.json', [])[Number(index)]
  const artwork = pair?.[side as 'good' | 'bad']
  if (!artwork?.html) return reply.code(404).send()
  try {
    const buffer = await thumbnail(artwork.html)
    return reply.type('image/jpeg').header('Cache-Control', 'private, max-age=86400').send(buffer)
  } catch {
    return reply.code(503).header('Cache-Control', 'no-store').send({ error: '预览暂时无法生成' })
  }
})
app.get('/api/suspicious', async () => ({
  samples: uniqueContent(gallery
    .filter(
      (i) =>
        available(i) &&
        (evaluatedVerdict(i) === 'failed' || i.fails > 0) &&
        !(i.html && i.html.includes('语法解析错误')),
    ))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30)
    .map((i) => ({
      id: i.id,
      code: i.code,
      title: i.title,
      type: evaluatedVerdict(i) === 'failed' ? '作品质检未通过' : '用户反馈',
      date: i.createdAt,
      model: i.model,
      benchmark: i.benchmark,
      html: i.html,
      answerText: i.answerText,
      previewImage: i.html ? '/api/gallery/' + encodeURIComponent(i.id) + '/preview' : undefined,
      summary: evaluatedVerdict(i) === 'failed' ? i.analysis || '作品未通过本地规则检查' : '收到用户反馈；反馈票数不代表自动判定为降智。',
      evidence:
        (i.inspections || [])
          .filter((c) => !c.passed)
          .map((c) => c.detail)
          .join('；') || '暂无自动判定的失败依据',
      prompt: i.prompt || '请生成可直接运行的单文件HTML，使用内联SVG绘制鹈鹕骑自行车的二维循环动画...',
      outputPreview: (i.answerText || i.html || '').slice(0, 1200),
    })),
}))
let danmaku = readJson<any[]>('danmaku.json', [])
app.get('/api/danmaku', async () => ({
  messages: getSettings().showDanmaku ? danmaku.slice(-100) : [],
  cursor: danmaku.at(-1)?.id || 0,
}))
app.post('/api/danmaku', async (request, reply) => {
  if (!getSettings().showDanmaku) return reply.code(403).send({ error: '弹幕暂未开启' })
  const text = z
    .string()
    .trim()
    .min(1)
    .max(60)
    .parse((request.body as any)?.text)
  if (/https?:|www\.|[\w-]+\.(?:com|cn|xyz|net)|微信|加群|qq群/i.test(text))
    return reply.code(400).send({ error: '弹幕不接受网址、广告或引流' })
  if (!limited('danmaku:' + request.ip, 3, 60000))
    return reply.code(429).send({ error: '发送过于频繁' })
  const message = { id: Date.now(), text, createdAt: new Date().toISOString() }
  const next = [...danmaku, message].slice(-500)
  writeJson('danmaku.json', next)
  danmaku = next
  return { ok: true, message }
})
function measured() {
  return measuredRecords(gallery, tasks.values())
}
app.get('/api/stats', async () => {
  const rows = measured(),
    pelican = rows.filter((i) => i.benchmark === 'pelican'),
    candy = rows.filter((i) => i.benchmark === 'candy')
  const rate = passRate, avg = averageLatency
  const models = [...new Set(rows.map((i) => i.model || '未记录'))]
  return {
    totalRuns: rows.length,
    publicWorks: uniqueContent(gallery.filter(available)).length,
    pelicanPassRate: rate(pelican),
    candyPassRate: rate(candy),
    pelicanCount: pelican.length,
    candyCount: candy.length,
    avgLatencyPelican: avg(pelican),
    avgLatencyCandy: avg(candy),
    topModels: models.map((model) => {
      const a = rows.filter((i) => (i.model || '未记录') === model)
      return { model, count: a.length, passRate: rate(a), avgLatency: avg(a) }
    }),
    recentRuns: uniqueContent(rows
      .filter((i) => i.published))
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map((i) => ({
        ...publicItem(i, '', true),
        time: i.createdAt,
        status: i.verdict === 'failed' ? '未通过' : '通过',
      })),
  }
})
app.get('/api/admin/summary', async () => ({
  configured: true,
  quality: QUALITY_VERSION,
  stats: {
    tasks: tasks.size,
    gallery: gallery.length,
    active: controllers.size,
    deleted: gallery.filter((i) => i.deletedAt).length,
  },
}))
app.get('/api/admin/home', async () => ({ home: readJson('home-config.json', defaultHome) }))
app.put('/api/admin/home', async (request) => {
  const home = homeSchema.parse(request.body)
  writeJson('home-config.json', home)
  return { home }
})
app.get('/api/admin/settings', async () => ({ settings: getSettings(), defaults }))
app.put('/api/admin/settings', async (request) => ({ settings: saveSettings(request.body) }))
app.get('/api/admin/tasks', async () => ({
  items: [...tasks.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100)
    .map((t) => {
      const p = publicTask(t)
      return {
        ...p,
        input: { ...p.input, endpoint: undefined },
        result: p.result
          ? { ...p.result, html: undefined, answerText: undefined, previewImage: undefined }
          : undefined,
      }
    }),
}))
app.get('/api/admin/gallery', async (request) => {
  const q = request.query as any
  let rows = gallery.filter((i) => (q.deleted === '1' ? !!i.deletedAt : !i.deletedAt))
  if (q.search)
    rows = rows.filter((i) =>
      [i.title, i.model, i.source, i.code].some((v) =>
        v?.toLowerCase().includes(String(q.search).toLowerCase()),
      ),
    )
  if (!Object.keys(q).length) {
    return { items: rows.map((i) => publicItem(i, '', true)) }
  }
  const size = 30,
    total = rows.length,
    page = Math.min(
      Math.max(1, Math.floor(Number(q.page)) || 1),
      Math.max(1, Math.ceil(total / size)),
    )
  return {
    items: rows
      .slice((page - 1) * size, page * size)
      .map((i) => publicItem(i, '', true)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / size)),
  }
})
app.post('/api/admin/gallery', async (request) => {
  const body = z
    .object({
      title: z.string().trim().min(1).max(120),
      html: z.string().min(1).max(1000000),
      model: z.string().max(120).default('未记录'),
      source: z.string().max(50).default('本地导入'),
      effort: inputSchema.shape.effort,
      latencyMs: z.number().nonnegative().default(0),
    })
    .parse(request.body)
  if (rejudging.size >= 3)
    throw Object.assign(new Error('正在本地检测，请稍后再试'), { statusCode: 429 })
  const importKey = randomUUID()
  rejudging.add(importKey)
  let grade
  try {
    grade = await evaluateHtml(body.html)
  } finally {
    rejudging.delete(importKey)
  }
  const item: GalleryItem = {
    ...body,
    ...grade,
    id: 'custom-' + randomUUID(),
    code: randomBytes(3).toString('hex').toUpperCase(),
    benchmark: 'pelican',
    mode: 'benchmark',
    createdAt: new Date().toISOString(),
    published: true,
    likes: 0,
    abstracts: 0,
    fails: 0,
    origin: 'imported',
  }
  commit([item, ...gallery])
  return { item: publicItem(item), ok: true }
})
app.post('/api/admin/gallery/:id/verdict', async (request, reply) => {
  const body = z.object({ verdict: z.enum(['passed', 'failed']), reason: z.string().trim().min(1).max(1000), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).parse(request.body)
  const item = gallery.find((i) => i.id === (request.params as any).id && !i.deletedAt)
  if (!item) return reply.code(404).send({ error: '作品不存在' })
  if (assessmentContentHash(item) !== body.contentHash) return reply.code(409).send({ error: '作品内容已变化' })
  if (rejudging.has(assessmentKey(item))) return reply.code(409).send({ error: '作品正在检测，请稍后再试' })
  const grade = manualAssessment(item, body.verdict, body.reason)
  const plan = planRejudgment(gallery, tasks.values(), item, grade)
  let tasksPersisted = false
  try {
    for (const patch of plan.taskPatches) patch.task.result = patch.result
    if (plan.taskPatches.length) { persistTasks(); tasksPersisted = true }
    commit(plan.gallery)
  } catch (error) {
    for (const patch of plan.taskPatches) patch.task.result = patch.previous
    if (tasksPersisted) persistTasks()
    throw error
  }
  for (const { task } of plan.taskPatches) {
    for (const fn of listeners.get(task.id) || []) {
      try { fn(task) } catch { listeners.get(task.id)?.delete(fn) }
    }
  }
  return { ok: true, item: publicItem({ ...item, ...grade }), affectedGallery: plan.affectedGallery, affectedTasks: plan.taskPatches.length }
})
app.post('/api/admin/gallery/:id/rejudge', async (request, reply) => {
  const id = (request.params as any).id,
    item = gallery.find((i) => i.id === id && !i.deletedAt)
  if (!item) return reply.code(404).send({ error: '作品不存在' })
  if (hasManualAssessment(item)) return { ok: true, item: publicItem(item), affectedGallery: 0, affectedTasks: 0, message: '保留管理员已确认的结论' }
  const key = assessmentKey(item)
  if (rejudging.has(key) || rejudging.size >= 3)
    return reply.code(409).send({ error: '正在本地检测，请稍后刷新' })
  rejudging.add(key)
  try {
    const grade =
      item.benchmark === 'candy'
        ? gradeCandy(item.answerText || '')
        : item.benchmark === 'custom' ? acceptCustomOutput() : await evaluateHtml(item.html || '')
    const next = gallery.find((i) => i.id === id)
    if (!next || next.deletedAt || !sameAssessmentContent(next, item))
      return reply.code(409).send({ error: '作品状态已变化' })
    const plan = planRejudgment(gallery, tasks.values(), next, grade)
    let tasksPersisted = false
    try {
      for (const patch of plan.taskPatches) patch.task.result = patch.result
      if (plan.taskPatches.length) {
        persistTasks()
        tasksPersisted = true
      }
      commit(plan.gallery)
    } catch (error) {
      for (const patch of plan.taskPatches) patch.task.result = patch.previous
      if (tasksPersisted) persistTasks()
      throw error
    }
    for (const { task } of plan.taskPatches) {
      for (const fn of listeners.get(task.id) || []) {
        try { fn(task) } catch { listeners.get(task.id)?.delete(fn) }
      }
    }
    return { ok: true, item: publicItem({ ...next, ...grade }), affectedGallery: plan.affectedGallery, affectedTasks: plan.taskPatches.length }
  } finally {
    rejudging.delete(key)
  }
})
app.post('/api/admin/gallery/reuse', async (request) => {
  const body = z.object({ sourceIds: z.array(z.string()).min(1).max(100),
    count: z.number().int().min(1).max(500), batchId: z.string().uuid() }).parse(request.body)
  const result = reuseGallery(gallery, body.sourceIds, body.count, body.batchId)
  if (result.created) commit([...result.items, ...gallery])
  return { ok: true, created: result.created, count: result.items.length,
    ids: result.items.map(item => item.id) }
})
app.post('/api/admin/gallery/batch-delete', async (request, reply) => {
  const ids = z.array(z.string()).parse((request.body as any)?.ids)
  const idSet = new Set(ids)
  commit(gallery.map((i) => (idSet.has(i.id) ? { ...i, deletedAt: new Date().toISOString() } : i)))
  return { ok: true, count: ids.length }
})
app.post('/api/admin/gallery/batch-restore', async (request, reply) => {
  const ids = z.array(z.string()).parse((request.body as any)?.ids)
  const idSet = new Set(ids)
  commit(gallery.map((i) => (idSet.has(i.id) ? { ...i, deletedAt: undefined } : i)))
  return { ok: true, count: ids.length }
})
app.post('/api/admin/gallery/clear-tasks', async (_request, reply) => {
  for (const [id, task] of tasks) if (terminal(task)) tasks.delete(id)
  persistTasks()
  return { ok: true, activePreserved: tasks.size }
})
app.post('/api/admin/danmaku/clear', async (_request, reply) => {
  danmaku = []
  writeJson('danmaku.json', [])
  return { ok: true }
})
app.delete('/api/admin/gallery/:id', async (request, reply) => {
  const id = (request.params as any).id
  if (!gallery.some((i) => i.id === id)) return reply.code(404).send({ error: '作品不存在' })
  commit(gallery.map((i) => (i.id === id ? { ...i, deletedAt: new Date().toISOString() } : i)))
  return { ok: true }
})
app.post('/api/admin/gallery/:id/restore', async (request, reply) => {
  const id = (request.params as any).id
  if (!gallery.some((i) => i.id === id)) return reply.code(404).send({ error: '作品不存在' })
  commit(gallery.map((i) => (i.id === id ? { ...i, deletedAt: undefined } : i)))
  return { ok: true }
})
app.get('/api/admin/export', async (_request, reply) =>
  reply
    .header('Content-Disposition', 'attachment; filename="pelican-backup.json"')
    .send({
      home: readJson('home-config.json', defaultHome),
      settings: getSettings(),
      bot: botConfig,
      gallery,
      danmaku,
    }),
)
// Original automatic demonstration dispatch remains available, with explicit provenance.
const botSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(1).max(1440).default(10),
  batchCount: z.number().int().min(1).max(50).default(1),
  modelPool: z.array(z.string().trim().min(1).max(120)).min(1).max(50).default([
    'gpt-6-astra',
  ]),
  sourcePool: z.array(z.string().trim().min(1).max(50)).min(1).max(50).default([
    'AI8',
    'ZGSUDU',
    'WANSHUABA',
    'USELUNORA',
    'PIFAAPI',
    'DPDNS',
    'A6API',
    'WAWAZZ',
    'WILLOWAPI',
  ]),
})
let botConfig = botSchema.parse(readJson('bot-config.json', {})),
  botTimer: ReturnType<typeof setInterval> | undefined

function getHistoricalPool(): GalleryItem[] {
  const excluded = new Set(gallery.filter((i) => i.deletedAt).map((i) => i.id))
  const fromGallery = gallery.filter((i) => !i.deletedAt && originOf(i) !== 'demo' && originOf(i) !== 'reused' && (i.html || i.answerText))
  const fromTasks: GalleryItem[] = []
  for (const t of tasks.values()) {
    if (t.status === 'completed' && !t.input.demo && !excluded.has(t.id) && t.result && (t.result.html || t.result.answerText)) {
      fromTasks.push({
        id: t.id,
        code: t.code,
        title: t.result.title || (t.benchmark === 'candy' ? '糖果测试 · 推理答卷' : `鹈鹕骑行 · #${t.code}`),
        benchmark: t.benchmark,
        model: t.input.model || 'gpt-6-astra',
        mode: t.input.mode || 'benchmark',
        effort: t.input.effort || 'auto',
        source: t.input.source || 'WEB自测',
        inputTokens: t.result.inputTokens,
        outputTokens: t.result.outputTokens,
        cost: t.result.cost,
        verdict: t.result.verdict,
        createdAt: t.completedAt || t.createdAt,
        latencyMs: t.result.latencyMs ?? 0,
        html: t.result.html,
        answerText: t.result.answerText,
        published: true,
        likes: 0,
        abstracts: 0,
        fails: 0,
        prompt: t.prompt,
        previewImage: t.result.previewImage,
        judgmentVersion: t.result.judgmentVersion,
        inspections: t.result.inspections,
        analysis: t.result.analysis,
      })
    }
  }
  return [...new Map([...fromTasks, ...fromGallery].map((item) => [item.id, item])).values()]
}

function generateDispatchedItem(): GalleryItem {
  const pool = getHistoricalPool()
  const source = pool.length ? pool[Math.floor(Math.random() * pool.length)] : undefined
  const code = randomBytes(2).toString('hex').toUpperCase()
  const id = 'bot-' + randomUUID()

  const models = botConfig.modelPool?.length ? botConfig.modelPool : ['gpt-6-astra']
  const randomModel = models[Math.floor(Math.random() * models.length)]

  const sources = botConfig.sourcePool?.length ? botConfig.sourcePool : ['AI8', 'ZGSUDU', 'DPDNS', 'USELUNORA', 'PIFAAPI', 'WAWAZZ']
  const randomSource = sources[Math.floor(Math.random() * sources.length)]

  const efforts: ReasoningEffort[] = ['auto', 'low', 'medium', 'high', 'xhigh']
  const randomEffort = efforts[Math.floor(Math.random() * efforts.length)]

  const benchmark = source?.benchmark || 'pelican'
  const mode = source?.mode || 'benchmark'

  let title = source?.title || (benchmark === 'candy' ? '糖果测试 · 推理答卷' : `鹈鹕骑行 · #${code}`)
  if (title.includes('#')) {
    title = title.replace(/#[0-9A-Fa-f]+/, `#${code}`)
  }

  return {
    id,
    code,
    title,
    benchmark,
    model: randomModel,
    source: randomSource,
    mode,
    effort: randomEffort,
    createdAt: new Date().toISOString(),
    latencyMs: 0,
    inputTokens: null,
    outputTokens: null,
    displayUsage: makeDisplayUsage({ id }, source),
    verdict: source ? evaluatedVerdict(source) : undefined,
    published: true,
    likes: 0,
    abstracts: 0,
    fails: 0,
    html: source?.html || createDemoHtml('本地演示'),
    answerText: source?.answerText,
    origin: 'demo',
    prompt: source?.prompt,
    previewImage: source?.previewImage,
    judgmentVersion: source?.judgmentVersion,
    inspections: source?.inspections,
    analysis: source?.analysis,
  }
}

function dispatchDemo(count = 1) {
  const n = Math.max(1, Math.min(count, 50))
  const newItems: GalleryItem[] = []
  for (let i = 0; i < n; i++) {
    newItems.push(generateDispatchedItem())
  }
  commit([...newItems, ...gallery])
  return newItems
}

function scheduleDemo() {
  clearInterval(botTimer)
  if (botConfig.enabled) {
    botTimer = setInterval(() => {
      try {
        const count = botConfig.batchCount || 1
        dispatchDemo(count)
      } catch {
        app.log.error('Demo dispatch persistence failed')
      }
    }, botConfig.intervalMinutes * 60000)
    botTimer.unref()
  }
}
if (process.env.PELICAN_TEST_MODE !== '1') scheduleDemo()
app.get('/api/admin/bot', async () => {
  const pool = getHistoricalPool()
  const historyTaskCount = [...tasks.values()].filter(
    (t) => t.status === 'completed' && t.result && (t.result.html || t.result.answerText),
  ).length
  const galleryCount = gallery.filter((i) => !i.deletedAt && (i.html || i.answerText)).length
  return {
    config: botConfig,
    stats: {
      totalPool: pool.length,
      historyTaskCount,
      galleryCount,
    },
  }
})
app.put('/api/admin/bot', async (request) => {
  const next = botSchema.parse(request.body)
  writeJson('bot-config.json', next)
  botConfig = next
  scheduleDemo()
  return { ok: true, config: next }
})
app.post('/api/admin/bot/dispatch', async (request) => {
  const body = (request.body as any) || {}
  const count = typeof body.count === 'number' && body.count > 0 ? body.count : 1
  const items = dispatchDemo(count)
  return {
    ok: true,
    count: items.length,
    items: items.map((i) => publicItem(i)),
    item: publicItem(items[0]),
  }
})
const dist = join(process.cwd(), 'dist')
if (existsSync(dist)) {
  await app.register(fastifyStatic, { root: dist })
  app.setNotFoundHandler((request, reply) =>
    request.url.startsWith('/api/')
      ? reply.code(404).send({ error: '接口不存在' })
      : reply.sendFile('index.html'),
  )
}
const cleanup = setInterval(() => {
  const now = Date.now()
  for (const [key, list] of windows) {
    const valid = list.filter((t) => now - t < 86400000)
    if (valid.length) windows.set(key, valid)
    else windows.delete(key)
  }
  for (const [id, t] of tasks)
    if (terminal(t) && Date.parse(t.createdAt) < now - 7 * 86400000) tasks.delete(id)
}, 60000)
cleanup.unref()
app.addHook('onClose', async () => {
  shuttingDown = true
  clearInterval(botTimer)
  clearInterval(cleanup)
  for (const c of controllers.values()) c.abort()
  await closeRenderer()
})
if (process.env.PELICAN_TEST_MODE !== '1') {
  await app.listen({
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 8988),
  })
  const stop = async () => {
    shuttingDown = true
    for (const c of controllers.values()) c.abort()
    await app.close()
    process.exit(0)
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
