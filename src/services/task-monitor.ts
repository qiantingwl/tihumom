import type { TestTask } from '../types'

export type TaskConnection = 'connecting' | 'live' | 'polling' | 'offline' | 'unavailable'

// Reading task state is safe to retry; never repeat the billable POST /api/tests.
export function watchTestTask(
  id: string,
  callbacks: {
    onTask: (task: TestTask) => void
    onConnection: (state: TaskConnection) => void
    onUnavailable: (message: string) => void
  },
) {
  let stopped = false
  let revision = 0
  let lastEventAt = 0
  let request: AbortController | null = null
  let source: EventSource | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  const url = `/api/tests/${encodeURIComponent(id)}`
  function stop() {
    stopped = true
    clearInterval(timer)
    request?.abort()
    source?.close()
  }
  function accept(task: TestTask) {
    if (stopped || task?.id !== id) return
    if (['completed', 'failed'].includes(task.status)) stop()
    callbacks.onTask(task)
  }
  async function poll() {
    if (stopped || request) return
    const startedRevision = revision
    const controller = new AbortController()
    request = controller
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      if (stopped) return
      if ([401, 403, 404].includes(response.status)) {
        stop()
        callbacks.onConnection('unavailable')
        callbacks.onUnavailable('任务已不可访问或访客会话失效，请刷新页面后重试。')
        return
      }
      if (!response.ok) throw new Error('状态同步暂时不可用')
      const payload = await response.json()
      if (stopped) return
      callbacks.onConnection(lastEventAt && Date.now() - lastEventAt < 15000 ? 'live' : 'polling')
      // A slower poll must not overwrite a newer SSE update or terminal result.
      if (revision === startedRevision) accept(payload.task)
    } catch {
      if (!stopped && revision === startedRevision) callbacks.onConnection('offline')
    } finally {
      clearTimeout(timeout)
      if (request === controller) request = null
    }
  }
  callbacks.onConnection('connecting')
  try {
    source = new EventSource(`${url}/events`)
    source.onmessage = (event) => {
      if (stopped) return
      try {
        const payload = JSON.parse(event.data)
        if (payload.task?.id !== id) return
        revision++
        lastEventAt = Date.now()
        callbacks.onConnection('live')
        accept(payload.task)
      } catch { void poll() }
    }
    source.onerror = () => {
      if (stopped) return
      lastEventAt = 0
      callbacks.onConnection('polling')
      void poll()
      // EventSource reconnects itself; polling also covers buffered/silent streams.
    }
  } catch { callbacks.onConnection('polling') }
  timer = setInterval(() => void poll(), 3000)
  void poll()
  return stop
}
