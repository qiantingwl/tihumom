import assert from 'node:assert/strict'
import test from 'node:test'
import { assessmentContentHash, hasManualAssessment, manualAssessment } from '../server/manual-assessment.js'
import { planRejudgment } from '../server/rejudgment.js'
import { assessmentDisplay } from '../src/services/assessment-display.js'
import { measuredRecords } from '../server/statistics.js'
import type { GalleryItem } from '../server/types.js'

test('manual approval preserves original evidence and is invalidated by changed content', () => {
  const original = { id: 'original', benchmark: 'pelican', html: '<svg>sample</svg>', verdict: 'failed',
    judgmentVersion: 'local-structure-v12', analysis: 'static legs', published: true, origin: 'imported' } as GalleryItem
  const approved = { ...original, ...manualAssessment(original, 'passed', '管理员确认此作品正常') }
  assert.equal(hasManualAssessment(approved), true)
  assert.equal(hasManualAssessment({ ...approved, html: '<svg>another</svg>' }), false)
  assert.equal(approved.originalAssessment.verdict, 'failed')
  assert.equal(manualAssessment(approved, 'failed', '后续修改').originalAssessment.analysis, 'static legs')
  assert.equal(assessmentDisplay(approved).source, '管理员确认')
  assert.equal(measuredRecords([approved], []).length, 0)
})

test('manual confirmation synchronizes copies while retaining each original judgment', () => {
  const original = { id: 'source', benchmark: 'candy', answerText: 'answer', html: 'irrelevant A',
    verdict: 'failed', analysis: 'source reason' } as GalleryItem
  const copy = { ...original, id: 'copy', html: 'irrelevant B', analysis: 'copy reason' }
  const other = { ...copy, id: 'other', answerText: 'different answer' }
  assert.equal(assessmentContentHash(original), assessmentContentHash(copy))
  const plan = planRejudgment([original, copy, other], [], original, manualAssessment(original, 'passed', '确认'))
  assert.equal(plan.affectedGallery, 2)
  assert.equal(plan.gallery[1].originalAssessment?.analysis, 'copy reason')
  assert.equal(hasManualAssessment(plan.gallery[1]), true)
  assert.equal(plan.gallery[2], other)
})
