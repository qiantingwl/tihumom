import { createHash } from 'node:crypto'
import { parse } from 'parse5'
import { inspectRendered } from './render-quality.js'

export const QUALITY_VERSION = 'local-structure-v12'
export const contentHash = (html) =>
  createHash('sha256')
    .update(html || '')
    .digest('hex')

const inspection = (name, status, detail) => ({ name, status, passed: status === 'passed', detail })
const outcome = (verdict, analysis, inspections) => ({
  verdict,
  analysis,
  inspections,
  score: null,
  grade: verdict === null ? 'unavailable' : verdict === 'passed' ? 'normal' : 'degraded',
  judgment_version: QUALITY_VERSION,
  judgment_source: 'automatic',
})

const inspectionCache = new Map()
export function inspectPelican(html) {
  const key = contentHash(typeof html === 'string' ? html : '')
  if (!inspectionCache.has(key)) {
    inspectionCache.set(key, inspectDocument(html))
    if (inspectionCache.size > 256) inspectionCache.delete(inspectionCache.keys().next().value)
  }
  return structuredClone(inspectionCache.get(key))
}

function inspectDocument(html) {
  const raw = typeof html === 'string' ? html.trim() : ''
  if (!raw)
    return outcome(
      'failed',
      '模型返回了空内容，未满足 HTML/SVG 输出要求。此结果不等同于模型智力下降。',
      [inspection('输出内容', 'failed', '未返回可检查的内容')],
    )
  const document = parse(raw, { sourceCodeLocationInfo: true })
  const nodes = []
  function visit(node, inert = false) {
    // SVG-looking strings in scripts/comments/templates are not a rendered SVG.
    if (!inert && node.tagName) nodes.push(node)
    for (const child of node.childNodes || []) visit(child, inert || node.tagName === 'template')
  }
  visit(document)
  const svg = nodes.filter(
    (node) => node.tagName === 'svg' && node.namespaceURI === 'http://www.w3.org/2000/svg',
  )
  const scripts = nodes.filter((node) => node.tagName === 'script')
  const problems = []
  const checks = []
  if (!svg.length) {
    const status = scripts.length ? 'unknown' : 'failed'
    checks.push(
      inspection(
        '内联 SVG',
        status,
        scripts.length ? '含脚本，将由浏览器检查脚本运行后的 SVG' : '解析后的文档没有内联 SVG',
      ),
    )
    if (!scripts.length) problems.push('没有内联 SVG')
  } else {
    const incomplete = svg.some((node) => {
      const location = node.sourceCodeLocation
      return (
        location &&
        !location.endTag &&
        !/\/\s*>$/.test(raw.slice(location.startTag.startOffset, location.startTag.endOffset))
      )
    })
    checks.push(
      inspection(
        'SVG 标签完整性',
        incomplete ? 'failed' : 'passed',
        incomplete
          ? 'SVG 标签缺少结束标签，响应可能不完整'
          : '解析到完整内联 SVG；不据此推断画面质量',
      ),
    )
    if (incomplete) problems.push('SVG 标签未闭合')
  }
  const external = []
  const localResource = (value) => !value.trim() || /^(?:#|data:|blob:)/i.test(value.trim())
  const cssReferences = (css) => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of stripped.matchAll(/@import\s+(['"])(.*?)\1/gi))
      if (!localResource(match[2])) external.push('CSS 外部导入')
    for (const match of stripped.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      if (!localResource(match[2])) external.push('CSS 外部链接')
    }
  }
  for (const node of nodes) {
    const attrs = Object.fromEntries((node.attrs || []).map((attr) => [attr.name, attr.value]))
    if (
      ['iframe', 'object', 'embed'].includes(node.tagName) &&
      [attrs.src, attrs.data].some((value) => value && !localResource(value))
    )
      external.push('外部嵌入文档')
    if (
      ['script', 'img', 'image', 'use', 'video', 'audio', 'source'].includes(node.tagName) ||
      (node.tagName === 'link' && /(?:stylesheet|preload|icon|prefetch)/i.test(attrs.rel || ''))
    ) {
      for (const attr of node.attrs || []) {
        if (['src', 'href', 'poster'].includes(attr.name) && !localResource(attr.value))
          external.push('外部资源链接')
        if (attr.name === 'srcset' && attr.value.trim()) external.push('响应式资源声明')
      }
    }
    if (attrs.style) cssReferences(attrs.style)
    if (node.tagName === 'style')
      cssReferences((node.childNodes || []).map((child) => child.value || '').join(''))
  }
  // srcset can contain local data URLs; do not turn ambiguous parsing into a failed verdict.
  const confirmedExternal = external.filter(
    (item) => item !== '响应式资源声明',
  )
  if (confirmedExternal.length) problems.push('依赖外部资源')
  checks.push(
    inspection(
      '资源声明',
      confirmedExternal.length ? 'failed' : 'passed',
      confirmedExternal.length
        ? [...new Set(confirmedExternal)].join('、')
        : '未发现明确的外部链接；动态资源另由浏览器隔离检查',
    ),
  )
  checks.push(
    inspection(
      '自动检测方式',
      'passed',
      '实际浏览器渲染与多帧变化检测；不使用英文命名、路径数量或颜色黑名单',
    ),
  )
  return outcome(
    problems.length ? 'failed' : 'passed',
    problems.length
      ? `输出规范未通过：${problems.join('；')}。这不是模型智力下降的证明。`
      : '输出规范检查正常。',
    checks,
  )
}

const renderedCache = new Map()
export async function evaluateRecord(record) {
  const basic = inspectPelican(record.html)
  if (!record.html?.trim() || basic.inspections.some((item) => item.name === 'SVG 标签完整性' && !item.passed)) {
    record.execution_status = 'incomplete'
    record.analysis = '未收到完整作品（空输出或 SVG 未闭合），不判定画面质量，不计入正常率'
  }
  if (record.execution_status !== 'completed' || basic.verdict === 'failed')
    return judgeRecord(record)
  const hash = contentHash(record.html)
  if (!renderedCache.has(hash)) {
    const pending = inspectRendered(record.html)
      .then((result) => ({
        ...outcome(
          result.verdict,
          result.verdict === 'passed'
            ? '正常：本地多帧检查通过，轮对、车架、骑乘连接和踩踏动作满足当前结构规则。'
            : '降智：' +
                result.inspections
                  .filter((item) => !item.passed)
                  .map((item) => item.detail)
                  .join('；'),
          [...basic.inspections.map((item) => {
            if (item.name !== '内联 SVG' || item.status !== 'unknown') return item
            const rendered = result.inspections.find((check) => check.name === '实际 SVG 渲染')
            return inspection(item.name, rendered?.passed ? 'passed' : 'failed',
              rendered?.passed ? '脚本运行后生成了可见内联 SVG' : '脚本运行后未生成可见内联 SVG')
          }), ...result.inspections],
        ),
        content_hash: hash,
        preview_image: result.preview_image,
      }))
      .catch((error) => {
        renderedCache.delete(hash)
        throw error
      })
    renderedCache.set(hash, pending)
    if (renderedCache.size > 256) renderedCache.delete(renderedCache.keys().next().value)
  }
  try {
    const result = await renderedCache.get(hash)
    record.automatic_result = structuredClone(result)
    return result
  } catch {
    record.execution_status = 'evaluation_error'
    record.analysis = '自动渲染检测未完成，请检查 Chromium 安装或服务资源；本次不计入正常率'
    return judgeRecord(record)
  }
}

export function judgeRecord(record) {
  if (record.execution_status && record.execution_status !== 'completed') {
    return outcome(null, record.analysis || '本次请求未完成，不计入正常率', [
      inspection('检测执行', 'failed', record.analysis || '接口、配置或输出截断异常'),
    ])
  }
  if (!record.html && !record.execution_status)
    return outcome(null, '历史记录没有有效画面和执行状态，不计入正常率', [])
  if (
    record.automatic_result?.judgment_version === QUALITY_VERSION &&
    record.automatic_result.content_hash === contentHash(record.html)
  )
    return structuredClone(record.automatic_result)
  const basic = inspectPelican(record.html)
  return basic.verdict === 'failed'
    ? basic
    : outcome(null, '本次结构检测尚未完成，不计入正常率', basic.inspections)
}
