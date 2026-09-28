import assert from 'node:assert/strict'
import test from 'node:test'
import { assessmentDisplay } from '../src/services/assessment-display.js'

test('judgment basis separates historical labels, unknown checks and failed evidence', () => {
  const historical = assessmentDisplay({ verdict: 'passed', judgmentSource: 'historical' })
  assert.equal(historical.conclusion, '正常')
  assert.equal(historical.source, '历史记录')
  assert.equal(historical.checks.length, 0)
  assert.match(historical.summary, /未保存逐项判断依据/)
  const unknown = assessmentDisplay({ inspections: [{ name: '内联 SVG', passed: false, status: 'unknown', detail: '等待浏览器' }] })
  assert.equal(unknown.conclusion, '未评测')
  assert.equal(unknown.failed, 0)
  assert.equal(unknown.unknown, 1)
  const failed = assessmentDisplay({ verdict: 'failed', judgmentVersion: 'local-structure-v12', inspections: [
    { name: '双轮结构', passed: true, detail: '轮对完整' },
    { name: '踩踏动作', passed: false, detail: '腿脚未动作' },
  ] })
  assert.equal(failed.source, '本地自动判定')
  assert.equal(failed.conclusion, '降智')
  assert.equal(failed.checks[0].name, '踩踏动作')
  assert.equal(failed.passed, 1)
  assert.equal(failed.failed, 1)
  assert.equal(failed.summary, '腿脚未动作')
})
