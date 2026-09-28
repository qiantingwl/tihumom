import assert from 'node:assert/strict'
import test from 'node:test'
import { assessmentKey, planRejudgment, sameAssessmentContent } from '../server/rejudgment.js'
import type { GalleryItem, TestTask } from '../server/types.js'

test('rejudgment updates exact benchmark copies and task sources, preserving content and metadata', () => {
  const source = {
    id: 'source', benchmark: 'pelican', html: '<svg>bad bicycle</svg>',
    verdict: 'passed', judgmentVersion: 'local-structure-v10', likes: 5, fails: 9,
    origin: 'measured', createdAt: '2026-09-24T00:00:00Z', published: true,
  } as GalleryItem
  const rows = [source, { ...source, id: 'bot-copy', origin: 'demo' },
    { ...source, id: 'different', html: '<svg>different</svg>' },
    { ...source, id: 'custom', benchmark: 'custom' },
    { ...source, id: 'deleted', deletedAt: '2026-09-25' }] as GalleryItem[]
  const tasks = ['source', 'task-only', 'deleted', 'active'].map((id) => ({
    id, benchmark: 'pelican', status: id === 'active' ? 'checking' : 'completed', result: { ...source, id },
  })) as unknown as TestTask[]
  const grade = { verdict: 'failed' as const, judgmentVersion: 'local-structure-v11', analysis: 'failed frame', inspections: [] }
  const plan = planRejudgment(rows, tasks, source, grade)
  assert.equal(plan.affectedGallery, 2)
  assert.deepEqual(plan.taskPatches.map((patch) => patch.task.id), ['source', 'task-only'])
  for (const item of plan.gallery.slice(0, 2)) {
    assert.equal(item.verdict, 'failed')
    assert.equal(item.html, source.html)
    assert.equal(item.likes, 5)
    assert.equal(item.fails, 9)
    assert.equal(item.createdAt, source.createdAt)
  }
  assert.equal(plan.gallery[1].origin, 'demo')
  for (let index = 2; index < rows.length; index++) assert.equal(plan.gallery[index], rows[index])
  assert.equal(source.verdict, 'passed')
  assert.equal(tasks[0].result!.verdict, 'passed')
  assert.equal(assessmentKey(source), assessmentKey(rows[1]))
  assert.notEqual(assessmentKey(source), assessmentKey(rows[3]))
  assert.equal(sameAssessmentContent(source, { ...source, html: '<svg>changed</svg>' }), false)
  assert.equal(sameAssessmentContent({ ...source, html: '' }, { ...source, id: 'empty-copy', html: '' }), false)
})
