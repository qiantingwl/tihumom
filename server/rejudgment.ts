import { createHash } from 'node:crypto'
import type { BenchmarkType, GalleryItem, TestResult, TestTask } from './types.js'
import { manualAssessment, MANUAL_VERSION } from './manual-assessment.js'

type Content = { id: string; benchmark: BenchmarkType; html?: string; answerText?: string }
type Grade = Pick<TestResult, 'verdict' | 'analysis' | 'inspections' | 'judgmentVersion' | 'previewImage' | 'manualAssessmentHash' | 'originalAssessment'>

function contentOf(item: Content) {
  return item.benchmark === 'candy' ? item.answerText || '' : item.html || ''
}

export function assessmentKey(item: Content) {
  const content = contentOf(item)
  // Empty output and arbitrary prompts are not a shared benchmark sample.
  if (!content || item.benchmark === 'custom') return JSON.stringify([item.benchmark, item.id])
  return JSON.stringify([item.benchmark, createHash('sha256').update(content).digest('hex')])
}

export function sameAssessmentContent(left: Content, right: Content) {
  if (left.benchmark !== right.benchmark || contentOf(left) !== contentOf(right)) return false
  return !!contentOf(left) && left.benchmark !== 'custom' || left.id === right.id
}

export function planRejudgment(gallery: GalleryItem[], tasks: Iterable<TestTask>, source: GalleryItem, grade: Grade) {
  // Each copy keeps its own original evidence; manual confirmation is bound
  // to the benchmark content, not incidental presentation fields.
  const gradeFor = (item: GalleryItem) => grade.judgmentVersion === MANUAL_VERSION
    ? manualAssessment(item, grade.verdict as 'passed' | 'failed', grade.inspections?.[0]?.detail || '')
    : grade
  let affectedGallery = 0
  const nextGallery = gallery.map((item) => {
    if (item.deletedAt || !sameAssessmentContent(item, source)) return item
    affectedGallery++
    return { ...item, ...gradeFor(item) }
  })
  const deleted = new Set(gallery.filter((item) => item.deletedAt).map((item) => item.id))
  const taskPatches: Array<{ task: TestTask; previous: TestResult; result: TestResult }> = []
  for (const task of tasks) {
    if (task.status !== 'completed' || !task.result || task.result.deletedAt || deleted.has(task.id)) continue
    const content = { ...task.result, id: task.id, benchmark: task.benchmark }
    if (!sameAssessmentContent(content, source)) continue
    taskPatches.push({ task, previous: task.result, result: { ...task.result, ...gradeFor(content as GalleryItem) } })
  }
  return { gallery: nextGallery, taskPatches, affectedGallery }
}
