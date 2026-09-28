import type { GalleryItem, InspectionItem } from '../types'
import { sampleStatus } from './display'

export function inspectionStatus(check: InspectionItem): 'passed' | 'failed' | 'unknown' {
  if (check.status === 'unknown') return 'unknown'
  if (check.status === 'passed' || check.status === 'failed') return check.status
  return check.passed === true ? 'passed' : check.passed === false ? 'failed' : 'unknown'
}

// Show only recorded evidence. A historical label does not supply missing checks.
export function assessmentDisplay(item: Pick<GalleryItem,
  'verdict' | 'analysis' | 'inspections' | 'judgmentVersion' | 'judgmentSource'> & Partial<Pick<GalleryItem, 'origin' | 'benchmark'>>) {
  const rank = { failed: 0, unknown: 1, passed: 2 }
  const checks = (item.inspections || []).map((check) => ({ ...check, status: inspectionStatus(check) }))
    .sort((a, b) => rank[a.status] - rank[b.status])
  const failed = checks.filter((check) => check.status === 'failed')
  const passed = checks.filter((check) => check.status === 'passed').length
  const unknown = checks.length - failed.length - passed
  const status = sampleStatus({ origin: item.origin, benchmark: item.benchmark || 'pelican', verdict: item.verdict })
  const conclusion = item.origin !== 'demo' && item.verdict === 'passed' ? '正常' : status.label
  const source = item.judgmentSource === 'manual' || item.judgmentVersion === 'manual-confirmed-v1'
    ? '管理员确认' : item.judgmentSource === 'historical' ? '历史记录' : item.judgmentVersion ? '本地自动判定' : '已保存记录'
  const summary = (item.origin === 'demo' || (!item.verdict && item.benchmark === 'custom') ? status.detail : '') || item.analysis?.trim() || (failed.length && item.verdict === 'failed'
    ? failed.map((check) => check.detail).filter(Boolean).join('；')
    : checks.length ? '以下为这份作品已保存的逐项检查结果。'
      : '这条历史记录未保存逐项判断依据，不能据此补写通过或降智的原因。')
  return { checks, passed, failed: failed.length, unknown, conclusion, source, summary }
}
