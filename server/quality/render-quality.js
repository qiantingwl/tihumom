import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { parse, serialize } from 'parse5'
import { captureScene, inspectScenes } from './scene-quality.js'

let browserPromise
let active = 0
const queue = []
async function browser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true })
      .then((instance) => {
        instance.on('disconnected', () => {
          browserPromise = undefined
        })
        return instance
      })
      .catch((error) => {
        browserPromise = undefined
        throw error
      })
  }
  return browserPromise
}
export async function closeRenderer() {
  const pending = browserPromise
  browserPromise = undefined
  if (pending) await (await pending).close()
}

function isolatedHtml(html) {
  const document = parse(html)
  function clean(node) {
    if (node.childNodes)
      node.childNodes = node.childNodes.filter(
        (child) =>
          child.tagName !== 'base' &&
          !(child.tagName === 'meta' && child.attrs?.some((attr) => attr.name === 'http-equiv')),
      )
    for (const child of node.childNodes || []) clean(child)
  }
  clean(document)
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">`
  return serialize(document).replace(
    '<head>',
    `<head>${policy}<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{display:grid;place-items:center}svg{max-width:100%;max-height:100%}</style>`,
  )
}

export function frameEvidence(buffers) {
  const frames = buffers.map((buffer) => PNG.sync.read(buffer))
  let visible = false
  let changingPixels = 0
  for (const frame of frames) {
    const bins = new Map()
    for (let i = 0; i < frame.data.length; i += 4) {
      const key =
        (frame.data[i] >> 4) * 256 + (frame.data[i + 1] >> 4) * 16 + (frame.data[i + 2] >> 4)
      bins.set(key, (bins.get(key) || 0) + 1)
    }
    // Only reject essentially uniform output, not dark palettes or simple artwork.
    if (Math.max(...bins.values()) < frame.width * frame.height - 32) visible = true
  }
  for (let index = 1; index < frames.length; index++) {
    const a = frames[0].data,
      b = frames[index].data
    let changed = 0
    for (let i = 0; i < a.length; i += 4) {
      if (
        Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >
        24
      )
        changed++
    }
    changingPixels = Math.max(changingPixels, changed)
  }
  return { visible, moving: changingPixels >= 12, changingPixels }
}

export async function inspectRendered(html) {
  if (active >= 3) await new Promise((resolve) => queue.push(resolve))
  else active++
  let context
  let watchdog
  try {
    // Match ArtworkFrame: evaluating a thumbnail viewport changes responsive layouts.
    context = await (
      await browser()
    ).newContext({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      permissions: [],
    })
    await context.route('**/*', (route) => route.abort())
    await context.routeWebSocket('**/*', (socket) => socket.close())
    const page = await context.newPage()
    let blockedExternal = false
    page.on('requestfailed', (request) => {
      if (/^https?:/i.test(request.url())) blockedExternal = true
    })
    page.setDefaultTimeout(6000)
    // A stuck model script is an evaluation error, never an automatic degraded result.
    watchdog = setTimeout(() => {
      context.close().catch(() => {})
    }, 15000)
    await page.setContent(isolatedHtml(html), { waitUntil: 'domcontentloaded', timeout: 6000 })
    // Give a script-generated SVG a bounded startup window. Empty startup
    // frames are not broken bicycle frames; sample the full motion afterwards.
    const readyDeadline = Date.now() + 2500
    while (Date.now() < readyDeadline) {
      const scene = await page.evaluate(captureScene)
      if (scene.canvases.some((canvas) => canvas.shapes.length > 0)) break
      await page.waitForTimeout(100)
    }
    const snapshots = []
    const scenes = []
    let previewImage = null
    let hasSvg = false
    const started = Date.now()
    // Uneven intervals avoid repeatedly sampling the same phase of a short loop.
    for (const offset of [250, 710, 1370, 2230, 3370, 4490, 5710]) {
      // Observe the actual common browser timeline. Never seek each animation
      // independently: that desynchronizes both mixed CSS/JS and different cycles.
      await page.waitForTimeout(Math.max(0, offset - (Date.now() - started)))
      const frameHasSvg = await page.evaluate(() => {
        return [...document.querySelectorAll('svg')].some((svg) => {
          const rect = svg.getBoundingClientRect(),
            style = getComputedStyle(svg)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) > 0
          )
        })
      })
      hasSvg ||= frameHasSvg
      scenes.push(await page.evaluate(captureScene))
      snapshots.push(await page.screenshot({ animations: 'allow', timeout: 6000 }))
      if (offset === 1370)
        previewImage =
          'data:image/jpeg;base64,' +
          (
            await page.screenshot({ type: 'jpeg', quality: 55, animations: 'allow', timeout: 6000 })
          ).toString('base64')
    }
    const evidence = frameEvidence(snapshots)
    const checks = [
      {
        name: '运行资源',
        passed: !blockedExternal,
        detail: blockedExternal
          ? '运行时请求了被隔离策略拦截的外部资源'
          : '未检测到外部资源请求失败',
      },
      {
        name: '实际 SVG 渲染',
        passed: hasSvg,
        detail: hasSvg ? '浏览器中存在可见 SVG 画布' : '运行后没有可见 SVG 画布',
      },
      {
        name: '画面内容',
        passed: evidence.visible,
        detail: evidence.visible
          ? '渲染帧存在可见图形，不按背景颜色判定'
          : '多个采样帧均为近乎纯色的空画面',
      },
      {
        name: '实际动画变化',
        passed: evidence.moving,
        detail: evidence.moving
          ? '不同时间的渲染帧有实际像素变化'
          : '不同动画相位及时间采样均未检测到有效画面变化',
      },
    ].map((item) => ({ ...item, status: item.passed ? 'passed' : 'failed' }))
    checks.push(...inspectScenes(scenes))
    return {
      verdict: checks.every((item) => item.passed) ? 'passed' : 'failed',
      inspections: checks,
      preview_image: previewImage,
    }
  } finally {
    clearTimeout(watchdog)
    if (context) await context.close().catch(() => {})
    const next = queue.shift()
    if (next) next()
    else active--
  }
}

// Historical works get a real browser thumbnail lazily without changing their verdicts.
export async function capturePreview(html) {
  if (active >= 3) await new Promise((resolve) => queue.push(resolve))
  else active++
  let context, watchdog
  try {
    context = await (
      await browser()
    ).newContext({
      viewport: { width: 1200, height: 800 },
      serviceWorkers: 'block',
      permissions: [],
    })
    await context.route('**/*', (route) => route.abort())
    await context.routeWebSocket('**/*', (socket) => socket.close())
    watchdog = setTimeout(() => context.close().catch(() => {}), 10000)
    const page = await context.newPage()
    await page.setContent(isolatedHtml(html), { waitUntil: 'domcontentloaded', timeout: 5000 })
    await page.waitForTimeout(900)
    return await page.screenshot({ type: 'jpeg', quality: 50, timeout: 5000 })
  } finally {
    clearTimeout(watchdog)
    if (context) await context.close().catch(() => {})
    const next = queue.shift()
    if (next) next()
    else active--
  }
}
