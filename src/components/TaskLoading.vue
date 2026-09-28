<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { CircleAlert, LoaderCircle } from '@lucide/vue'
import type { TestTask } from '../types'
import type { TaskConnection } from '../services/task-monitor'

const props = defineProps<{ task: TestTask; connection: TaskConnection }>()
const now = ref(Date.now())
const stopping = ref(false)
const stopError = ref('')
const timer = setInterval(() => { now.value = Date.now() }, 1000)
onBeforeUnmount(() => clearInterval(timer))
const elapsed = computed(() => {
  const seconds = Math.max(0, Math.floor((now.value - Date.parse(props.task.createdAt)) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
})
const connectionLabel = computed(() => ({
  connecting: '正在同步任务状态',
  live: '实时状态已连接',
  polling: '正在通过备用通道同步状态',
  offline: '状态连接中断，正在自动重试',
  unavailable: '任务状态已不可访问，请刷新后重试',
})[props.connection])
const hint = computed(() => {
  if (props.task.status === 'checking') return '输出已接收，正在进行本地检查。'
  if (props.task.generation?.outputChars) return `正文 ${props.task.generation.outputChars} 字符 · 推理 ${props.task.generation.reasoningChars} 字符`
  if (props.task.generation?.reasoningChars) return '已收到推理数据，正文尚未开始输出。'
  if (props.task.generation?.buffering) return '上游采用整包返回，接收完毕后解析正文。'
  return '尚未收到正文或推理内容；可以继续等待，也可以停止本次检测。'
})
async function cancel() {
  stopping.value = true
  stopError.value = ''
  try {
    const response = await fetch(`/api/tests/${encodeURIComponent(props.task.id)}/cancel`, {
      method: 'POST', signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('停止请求未成功，请稍后重试。')
  } catch (error) {
    stopError.value = error instanceof Error ? error.message : '停止请求未成功'
    stopping.value = false
  }
}
</script>

<template>
  <div class="loading-result" role="status" :aria-busy="connection !== 'unavailable'">
    <CircleAlert v-if="connection === 'unavailable'" :size="34" aria-hidden="true" />
    <LoaderCircle v-else class="spin" :size="34" aria-hidden="true" />
    <p>{{ connection === 'unavailable' ? '无法继续同步任务' : task.message }}</p>
    <small class="task-elapsed" aria-live="off">已等待 {{ elapsed }} · {{ connectionLabel }}</small>
    <small>{{ hint }}</small>
    <button v-if="connection !== 'unavailable'" class="button secondary" type="button" :disabled="stopping" @click="cancel">
      {{ stopping ? '正在停止…' : '停止本次检测' }}
    </button>
    <p v-if="stopError" class="error-note" role="alert">{{ stopError }}</p>
  </div>
</template>
