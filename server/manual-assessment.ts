import { createHash } from 'node:crypto'
import type { GalleryItem, TestResult } from './types.js'

export const MANUAL_VERSION = 'manual-confirmed-v1'
export function assessmentContentHash(item: Pick<GalleryItem, 'benchmark' | 'html' | 'answerText'>) {
  const content = item.benchmark === 'candy' ? item.answerText || ''
    : item.benchmark === 'pelican' ? item.html || '' : [item.html || '', item.answerText || '']
  return createHash('sha256').update(JSON.stringify([item.benchmark, content])).digest('hex')
}

export function hasManualAssessment(item: Pick<GalleryItem, 'benchmark' | 'html' | 'answerText' | 'judgmentVersion' | 'manualAssessmentHash'>) {
  return item.judgmentVersion === MANUAL_VERSION && item.manualAssessmentHash === assessmentContentHash(item)
}

export function manualAssessment(item: GalleryItem, verdict: 'passed' | 'failed', reason: string) {
  const previous = item.originalAssessment || {
    verdict: item.verdict, analysis: item.analysis, inspections: item.inspections,
    judgmentVersion: item.judgmentVersion,
  }
  return {
    verdict,
    analysis: `${verdict === 'passed' ? '正常' : '降智'}：${reason}`,
    inspections: [{ name: '管理员确认', passed: verdict === 'passed', detail: reason }],
    judgmentVersion: MANUAL_VERSION,
    manualAssessmentHash: assessmentContentHash(item),
    originalAssessment: previous,
  } satisfies Partial<TestResult>
}
