import http from 'node:http'
import https from 'node:https'
import { extractResponse } from './response.js'
import { readUsage, mergeUsage } from './usage.js'

const configuredIdle = Number(process.env.PELICAN_IDLE_TIMEOUT_SECONDS || 600)
if (!Number.isFinite(configuredIdle) || configuredIdle <= 0)
  throw new Error('PELICAN_IDLE_TIMEOUT_SECONDS must be positive')
export const GENERATION_IDLE_MS = configuredIdle * 1000
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null)

export function createStreamCollector(format, usageOptions = {}) {
  let text = '',
    inputTokens = null,
    outputTokens = null,
    terminal = false,
    finish = '',
    failed = false
  let finalResponse
  const blocks = new Map()
  const reasoningBlocks = new Map()
  let reasoningChars = 0
  const metadata = {}
  function usage(value) {
    if (!value) return
    inputTokens =
      count(value.input_tokens ?? value.prompt_tokens ?? value.promptTokenCount) ?? inputTokens
    outputTokens =
      count(value.output_tokens ?? value.completion_tokens ?? value.candidatesTokenCount) ??
      outputTokens
  }
  function accept(value, event = '') {
    if (!value || typeof value !== 'object') throw new Error('Invalid stream event')
    const type = value.type || event
    mergeUsage(metadata, readUsage(value, usageOptions))
    if (value.message) mergeUsage(metadata, readUsage(value.message, usageOptions))
    if (value.response) mergeUsage(metadata, readUsage(value.response, usageOptions))
    if (value.error || type === 'error' || type === 'response.failed') failed = true
    usage(value.usage || value.usageMetadata)
    if (format === 'responses') {
      const key = `${value.output_index ?? 0}:${value.content_index ?? 0}`
      if (/^response\.reasoning(?:_summary)?_text\.(?:delta|done)$/.test(type)) {
        const reasoningKey = `${value.output_index ?? 0}:${value.summary_index ?? value.content_index ?? 0}:${type.split('.')[1]}`
        reasoningBlocks.set(reasoningKey, type.endsWith('.done')
          ? (typeof value.text === 'string' ? value.text : reasoningBlocks.get(reasoningKey) || '')
          : (reasoningBlocks.get(reasoningKey) || '') + (typeof value.delta === 'string' ? value.delta : ''))
      }
      if (type === 'response.output_text.delta')
        blocks.set(key, (blocks.get(key) || '') + (value.delta || ''))
      if (type === 'response.output_text.done' && typeof value.text === 'string')
        blocks.set(key, value.text)
      if (['response.completed', 'response.incomplete', 'response.failed'].includes(type)) {
        terminal = true
        finalResponse = value.response
        finish = type === 'response.completed' ? 'stop' : 'incomplete'
        usage(finalResponse?.usage)
      }
    } else if (format === 'messages') {
      if (type === 'content_block_start' && value.content_block?.type === 'thinking')
        reasoningChars += (value.content_block.thinking || '').length
      if (type === 'content_block_delta' && value.delta?.type === 'thinking_delta')
        reasoningChars += (value.delta.thinking || '').length
      if (type === 'message_start') usage(value.message?.usage)
      if (type === 'content_block_start' && value.content_block?.type === 'text')
        text += value.content_block.text || ''
      if (type === 'content_block_delta' && value.delta?.type === 'text_delta')
        text += value.delta.text || ''
      if (type === 'message_delta') finish = value.delta?.stop_reason || finish
      if (type === 'message_stop') terminal = true
    } else if (format === 'gemini') {
      const candidate = value.candidates?.find((c) => (c.index ?? 0) === 0)
      reasoningChars += (candidate?.content?.parts || []).filter((p) => p.thought).reduce((n, p) => n + (p.text || '').length, 0)
      text += (candidate?.content?.parts || [])
        .filter((p) => !p.thought)
        .map((p) => p.text || '')
        .join('')
      if (candidate?.finishReason) {
        terminal = true
        finish = candidate.finishReason
      }
      if (value.promptFeedback?.blockReason) {
        terminal = true
        failed = true
      }
    } else {
      const choice = value.choices?.find((c) => (c.index ?? 0) === 0)
      const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning
      if (typeof reasoning === 'string') reasoningChars += reasoning.length
      const content = choice?.delta?.content
      text +=
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((c) => c.text || '').join('')
            : ''
      if (choice?.finish_reason) {
        terminal = true
        finish = choice.finish_reason
      }
    }
  }
  return {
    accept,
    isTerminal: () => terminal,
    progress() {
      return {
        outputChars: format === 'responses' ? [...blocks.values()].reduce((n, value) => n + value.length, 0) : text.length,
        reasoningChars: reasoningChars + [...reasoningBlocks.values()].reduce((n, value) => n + value.length, 0),
      }
    },
    result() {
      let incomplete = !terminal || !['stop', 'end_turn', 'stop_sequence', 'STOP'].includes(finish)
      if (format === 'responses') {
        text = [...blocks.values()].join('')
        if (finalResponse) {
          const final = extractResponse(finalResponse)
          text = final.text || text
          incomplete ||= final.incomplete
        }
      }
      return {
        text,
        incomplete: incomplete || failed,
        failed,
        inputTokens,
        outputTokens,
        ...metadata,
      }
    },
  }
}

// Accept LF, CRLF, comments, multiline data and UTF-8 split across network chunks.
export function createSseParser(onEvent, onDone = () => {}) {
  let buffer = '',
    lines = [],
    event = ''
  const dispatch = () => {
    if (lines.length) {
      const data = lines.join('\n')
      if (data.trim() === '[DONE]') onDone()
      else onEvent(JSON.parse(data), event)
    }
    lines = []
    event = ''
  }
  const line = (value) => {
    if (!value) return dispatch()
    if (value.startsWith(':')) return
    const colon = value.indexOf(':')
    const field = colon < 0 ? value : value.slice(0, colon)
    const data = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '')
    if (field === 'data') lines.push(data)
    if (field === 'event') event = data
  }
  function drain(final = false) {
    let index
    while ((index = buffer.search(/[\r\n]/)) >= 0) {
      if (buffer[index] === '\r' && index === buffer.length - 1 && !final) break
      const size = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1
      line(buffer.slice(0, index))
      buffer = buffer.slice(index + size)
    }
    if (final) {
      if (buffer) line(buffer)
      buffer = ''
      dispatch()
    }
  }
  return {
    push(value) {
      buffer += value
      drain()
    },
    finish() {
      drain(true)
    },
  }
}

export async function generate(endpoint, options, format, { idleMs = GENERATION_IDLE_MS, onProgress } = {}) {
  const url = new URL(endpoint)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
  const transport = url.protocol === 'https:' ? https : http
  const startedAt = Date.now()
  let request, timer, response, idleError
  const resetIdle = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      idleError = Object.assign(new Error('Upstream idle timeout'), {
        code: 'GENERATION_IDLE_TIMEOUT',
      })
      request.destroy(idleError)
    }, idleMs)
  }
  try {
    response = await new Promise((resolve, reject) => {
      request = transport.request(
        url,
        {
          method: options.method || 'POST',
          headers: options.headers,
          lookup: options.lookup,
          signal: options.signal,
        },
        resolve,
      )
      request.on('error', reject)
      resetIdle()
      request.end(options.body)
    })
    resetIdle()
    const status = response.statusCode
    if (status < 200 || status >= 300) {
      let errBody = ''
      try {
        const dec = new TextDecoder()
        for await (const chunk of response) {
          errBody += dec.decode(chunk, { stream: true })
          if (errBody.length > 500) break
        }
      } catch {}
      response.destroy()
      return {
        status,
        failed: true,
        text: errBody,
        incomplete: true,
        inputTokens: null,
        outputTokens: null,
      }
    }
    const stream = /text\/event-stream/i.test(response.headers['content-type'] || '')
    const usageOptions = { openRouter: url.hostname === 'openrouter.ai' }
    const collector = createStreamCollector(format, usageOptions)
    let endMarker = false
    const parser = createSseParser(collector.accept, () => {
      endMarker = true
    })
    const decoder = new TextDecoder()
    let raw = '',
      bytes = 0,
      lastMeaningfulChars = 0
    for await (const chunk of response) {
      bytes += chunk.length
      if (bytes > MAX_RESPONSE_BYTES)
        throw Object.assign(new Error('Response exceeds storage limit'), {
          code: 'GENERATION_SIZE_LIMIT',
        })
      const part = decoder.decode(chunk, { stream: true })
      if (stream) {
        parser.push(part)
        const progress = collector.progress()
        const meaningfulChars = progress.outputChars + progress.reasoningChars
        // SSE comments and empty keepalives do not mean the model is advancing.
        if (meaningfulChars > lastMeaningfulChars || collector.isTerminal()) resetIdle()
        lastMeaningfulChars = meaningfulChars
        if (typeof onProgress === 'function') {
          try { onProgress(progress.outputChars, { ...progress, receivedBytes: bytes, elapsedMs: Date.now() - startedAt }) } catch {}
        }
        if (endMarker || (format !== 'chat' && collector.isTerminal()))
          return { status, ...collector.result() }
      } else {
        raw += part
        resetIdle()
        if (typeof onProgress === 'function') {
          try { onProgress(0, { outputChars: 0, reasoningChars: 0, receivedBytes: bytes, elapsedMs: Date.now() - startedAt, buffering: true }) } catch {}
        }
      }
    }
    if (stream) {
      parser.push(decoder.decode())
      parser.finish()
      return { status, ...collector.result() }
    }
    // Relays may ignore stream:true and still return an ordinary JSON response.
    let payload
    try {
      payload = JSON.parse(raw + decoder.decode())
    } catch {
      throw Object.assign(new Error(`上游响应格式异常（HTTP ${status}）：未返回有效 JSON 或 SSE；本次不判定画面质量`), {
        code: 'GENERATION_INVALID_RESPONSE',
      })
    }
    if (format === 'gemini') {
      collector.accept(payload)
      return { status, ...collector.result() }
    }
    const result = extractResponse(payload)
    return {
      status,
      ...result,
      failed: Boolean(payload.error),
      inputTokens: count(payload.usage?.input_tokens ?? payload.usage?.prompt_tokens),
      outputTokens: count(payload.usage?.output_tokens ?? payload.usage?.completion_tokens),
      ...readUsage(payload, usageOptions),
    }
  } catch (error) {
    if (idleError) throw idleError
    if (options.signal?.aborted) throw options.signal.reason || error
    throw error
  } finally {
    clearTimeout(timer)
    response?.destroy()
    request?.destroy()
  }
}
