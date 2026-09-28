import type { GalleryItem } from '../types'
import { assessmentDisplay } from './assessment-display'

export function recordSource(item: GalleryItem) {
  return item.origin === 'measured' ? '实测记录'
    : item.origin === 'reused' ? '复用记录'
      : item.origin === 'demo' ? '存档作品' : '导入记录'
}

export function compareRecords(a: GalleryItem, b: GalleryItem) {
  const sameBenchmark = a.benchmark === b.benchmark
  const sameMode = a.mode === b.mode
  const samePrompt = !!a.prompt?.trim() && a.prompt.trim() === b.prompt?.trim()
  const sameModel = !!a.model && a.model === b.model
  const sameEffort = !!a.effort && a.effort === b.effort
  const sameSource = !!a.source?.trim() && a.source.trim() === b.source?.trim()
  const independent = a.id !== b.id && a.origin === 'measured' && b.origin === 'measured'
  const aligned = sameBenchmark && sameMode && samePrompt && sameModel && sameEffort && sameSource
  const left = assessmentDisplay(a), right = assessmentDisplay(b)
  const finiteTime = (value: number | null) => typeof value === 'number' && Number.isFinite(value) && value >= 0
  const speedText = !independent
    ? '含演示、复用或导入记录，不比较实测速度'
    : !aligned ? '测试条件不同或未记录，不给出快慢结论'
      : !finiteTime(a.latencyMs) || !finiteTime(b.latencyMs) ? '实测耗时不完整，无法比较'
        : a.latencyMs === b.latencyMs ? '这两次记录耗时相同'
          : '本次记录：' + (a.latencyMs! < b.latencyMs! ? 'A' : 'B') + ' 少用 ' + (Math.abs(a.latencyMs! - b.latencyMs!) / 1000).toFixed(1) + ' 秒'
  const summary = a.id === b.id ? '左右是同一份作品，不能作为两次检测比较。'
    : !independent ? '这是已保存作品的对照，包含非独立实测记录；只展示原有画面与判断依据，不将其作为两次生成的稳定性或速度结论。'
      : !sameBenchmark || !sameMode || !samePrompt ? '题型、模式或提示词不同（或未记录），只能对照作品内容，不能据此评价同题能力差异。'
        : !sameEffort || !sameSource ? '提示词相同，但推理档位或来源渠道不同（或未记录），没有控制这些变量，不能解释为随机波动或直接比较速度。'
          : !sameModel ? '提示词与已记录设置相同、模型不同；仅展示这两份结果，不据单次样本推断模型整体优劣。'
            : '已记录的题目、模型、推理档位和来源一致。以下仅比较两份实测结果，不能仅凭两次结果判断整体稳定性。'
  return { sameBenchmark, sameMode, samePrompt, sameModel, sameEffort, sameSource, independent, aligned,
    speedText, summary, left, right, leftSource: recordSource(a), rightSource: recordSource(b) }
}
