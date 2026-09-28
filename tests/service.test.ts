import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QUALITY_VERSION } from '../server/quality/quality.js'
import { assessmentContentHash, MANUAL_VERSION } from '../server/manual-assessment.js'

test('admin protection, history, ownership, pagination, real statistics and reversible deletion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pelican-service-'))
  process.env.DATA_DIR = dir
  process.env.PELICAN_TEST_MODE = '1'
  process.env.ADMIN_TOKEN = 'fixture-admin-only'
  process.env.LOG_LEVEL = 'silent'
  const old = {
    id: 'art-old',
    code: '1234',
    title: '原作品',
    benchmark: 'pelican',
    model: 'legacy',
    effort: 'auto',
    mode: 'benchmark',
    createdAt: '2026-09-21T12:00:00Z',
    html: '<svg><circle r="30"/></svg>',
    published: true,
    likes: 2,
    abstracts: 0,
    fails: 20,
    latencyMs: 1500,
    verdict: 'passed',
  }
  writeFileSync(
    join(dir, 'gallery.json'),
    JSON.stringify([old, { ...old, id: 'bot-old', code: '0000', inputTokens: 100, cost: '$1' }]),
  )
  const { app } = await import('../server/index.js')
  const headers = { 'x-admin-token': process.env.ADMIN_TOKEN }
  try {
    assert.equal((await app.inject('/api/admin/settings')).statusCode, 401)
    const visitor = await app.inject('/api/bootstrap'),
      cookie = visitor.cookies[0].name + '=' + visitor.cookies[0].value
    const gallery = (await app.inject('/api/gallery?pageSize=1')).json()
    assert.equal(gallery.total, 1)
    assert.equal(gallery.items.length, 1)
    assert.equal(gallery.items[0].html, undefined)
    assert.equal(gallery.items[0].verdict, 'passed')
    assert.equal(gallery.items[0].judgmentSource, 'historical')
    const detail = (await app.inject('/api/gallery/art-old')).json().item
    assert.equal(detail.html, old.html)
    assert.equal(detail.owner, undefined)
    assert.equal(detail.inputTokens, null)
    assert.equal(detail.outputTokens, null)
    assert.equal(detail.cost, undefined)
    assert.equal((await app.inject('/api/gallery')).json().items.find((i: any) => i.id === 'art-old').judgmentSource, 'historical')
    const demo = (await app.inject('/api/gallery/bot-old')).json().item
    assert.equal(demo.origin, 'demo')
    assert.equal(demo.cost, undefined)
    assert.equal((await app.inject('/api/gallery?filter=fails')).json().total, 0)
    assert.equal((await app.inject('/api/gallery?filter=worst')).json().total, 1)
    const stats = (await app.inject('/api/stats')).json()
    assert.equal(stats.totalRuns, 0)
    assert.equal(stats.pelicanPassRate, null)
    assert.equal(stats.avgLatencyPelican, null)
    await app.inject({ url: '/api/admin/settings', method: 'PUT', headers, payload: { defaultModel: 'keep-this-model' } })
    assert.match(
      (await app.inject('/api/artifacts/art-old')).headers['content-security-policy'] as string,
      /sandbox allow-scripts/,
    )
    assert.equal(
      (
        await app.inject({
          url: '/api/admin/settings',
          method: 'PUT',
          headers,
          payload: { pageSize: 0 },
        })
      ).statusCode,
      400,
    )
    assert.equal(
      (
        await app.inject({
          url: '/api/admin/settings',
          method: 'PUT',
          headers,
          payload: { demoEnabled: true, pageSize: 12 },
        })
      ).statusCode,
      200,
    )
    const created = await app.inject({
      url: '/api/tests',
      method: 'POST',
      headers: { cookie },
      payload: { demo: true, benchmark: 'candy', model: 'local-fixture', effort: 'high' },
    })
    assert.equal(created.statusCode, 202)
    assert.equal((await app.inject({ url: '/api/admin/settings', headers })).json().settings.defaultModel, 'keep-this-model')
    assert.equal((await app.inject({ url: '/api/tests', method: 'POST', headers: { cookie },
      payload: { demo: true, benchmark: 'candy', mode: 'custom', model: 'local-fixture' } })).statusCode, 400)
    const id = created.json().task.id
    assert.equal((await app.inject(`/api/tests/${id}`)).statusCode, 404)
    const task = (await app.inject({ url: `/api/tests/${id}`, headers: { cookie } })).json().task
    assert.equal(task.status, 'completed')
    assert.equal(task.result.verdict, 'passed')
    assert.equal(task.input.effort, 'high')
    assert.equal(task.input.mode, 'candy')
    assert.equal(task.input.apiKey, undefined)
    assert.equal(
      (await app.inject({ url: `/api/gallery/${id}/publish`, method: 'POST' })).statusCode,
      404,
    )
    assert.equal(
      (await app.inject({ url: `/api/gallery/${id}/publish`, method: 'POST', headers: { cookie } }))
        .statusCode,
      200,
    )
    assert.equal(
      (await app.inject({ url: '/api/gallery?mine=1', headers: { cookie } })).json().total,
      1,
    )
    assert.equal((await app.inject('/api/stats')).json().totalRuns, 0)
    // Rejudge an original and every exact copy together; rendering an invalid
    // structure requires no upstream request. Persisted history stays intact.
    assert.equal((await app.inject({ url: '/api/admin/gallery/art-old/rejudge', method: 'POST' })).statusCode, 401)
    const rejudge = await app.inject({ url: '/api/admin/gallery/art-old/rejudge', method: 'POST', headers })
    assert.equal(rejudge.statusCode, 200)
    assert.equal(rejudge.json().affectedGallery, 2)
    for (const id of ['art-old', 'bot-old']) {
      const corrected = (await app.inject(`/api/gallery/${id}`)).json().item
      assert.equal(corrected.verdict, 'failed')
      assert.equal(corrected.judgmentVersion, QUALITY_VERSION)
      assert.equal(corrected.html, old.html)
      assert.equal(corrected.likes, old.likes)
    }
    assert.equal((await app.inject('/api/stats')).json().totalRuns, 0)
    // Manual conclusions require admin access and matching content. Copies
    // retain their original evidence and cannot be silently rejudged away.
    const manualUrl = '/api/admin/gallery/art-old/verdict'
    const payload = { verdict: 'passed', reason: '管理员指定正常', contentHash: assessmentContentHash({ ...old, benchmark: 'pelican' }) }
    assert.equal((await app.inject({ url: manualUrl, method: 'POST', payload })).statusCode, 401)
    assert.equal((await app.inject({ url: manualUrl, method: 'POST', headers, payload: { ...payload, contentHash: '0'.repeat(64) } })).statusCode, 409)
    const manual = await app.inject({ url: manualUrl, method: 'POST', headers, payload })
    assert.equal(manual.statusCode, 200)
    assert.equal(manual.json().affectedGallery, 2)
    for (const id of ['art-old', 'bot-old']) {
      const corrected = (await app.inject(`/api/gallery/${id}`)).json().item
      assert.equal(corrected.verdict, 'passed')
      assert.equal(corrected.judgmentSource, 'manual')
      assert.equal(corrected.judgmentVersion, MANUAL_VERSION)
      assert.equal(corrected.originalAssessment, undefined)
      assert.equal(corrected.manualAssessmentHash, undefined)
      const retained = await app.inject({ url: `/api/admin/gallery/${id}/rejudge`, method: 'POST', headers })
      assert.equal(retained.json().affectedGallery, 0)
      assert.equal(retained.json().item.verdict, 'passed')
    }
    const saved = JSON.parse(readFileSync(join(dir, 'gallery.json'), 'utf8')).find((i: any) => i.id === 'art-old')
    assert.equal(saved.originalAssessment.verdict, 'failed')
    assert.equal(saved.originalAssessment.judgmentVersion, QUALITY_VERSION)
    assert.equal((await app.inject('/api/stats')).json().totalRuns, 0)
    // Tests and production must aggregate by identical provenance rules.
    const reuseUrl = '/api/admin/gallery/reuse'
    const reusePayload = { sourceIds: ['art-old'], count: 3, batchId: '99c7b2b0-a0e7-460a-9c26-a4e67a260e35' }
    assert.equal((await app.inject({ url: reuseUrl, method: 'POST', payload: reusePayload })).statusCode, 401)
    const reused = await app.inject({ url: reuseUrl, method: 'POST', headers, payload: reusePayload })
    assert.equal(reused.statusCode, 200)
    assert.equal(reused.json().count, 3)
    assert.equal(reused.json().created, true)
    const reuseAgain = await app.inject({ url: reuseUrl, method: 'POST', headers, payload: reusePayload })
    assert.equal(reuseAgain.json().created, false)
    assert.deepEqual(reuseAgain.json().ids, reused.json().ids)
    const reusedItem = (await app.inject('/api/gallery/' + reused.json().ids[0])).json().item
    assert.equal(reusedItem.html, old.html)
    assert.equal(reusedItem.verdict, 'passed')
    assert.equal(reusedItem.origin, 'reused')
    assert.equal(reusedItem.reuseSourceId, undefined)
    assert.equal(reusedItem.reuseBatchId, undefined)
    assert.equal((await app.inject('/api/stats')).json().totalRuns, 0)
    process.env.PELICAN_TEST_MODE = '0'
    assert.equal((await app.inject('/api/stats')).json().totalRuns, 0)
    process.env.PELICAN_TEST_MODE = '1'
    await app.inject({ url: '/api/admin/gallery/art-old', method: 'DELETE', headers })
    assert.equal((await app.inject('/api/gallery/art-old')).statusCode, 404)
    assert.equal(
      JSON.parse(readFileSync(join(dir, 'gallery.json'), 'utf8')).find(
        (i: any) => i.id === 'art-old',
      ).html,
      old.html,
    )
    await app.inject({ url: '/api/admin/gallery/art-old/restore', method: 'POST', headers })
    assert.equal((await app.inject('/api/gallery/art-old')).statusCode, 200)
    assert.deepEqual((await app.inject({ url: '/api/admin/bot', headers })).json().config.modelPool, ['gpt-6-astra'])
    const dispatched = (await app.inject({ url: '/api/admin/bot/dispatch', method: 'POST', headers })).json().item
    assert.equal(dispatched.origin, 'demo')
    assert.equal(dispatched.model, 'gpt-6-astra')
    assert.ok(dispatched.displayUsage)
    assert.equal(dispatched.latencyMs, null)
    assert.equal(dispatched.inputTokens, null)
    assert.equal(dispatched.cost, undefined)
    assert.equal(dispatched.displayUsage.sourceRecordId, undefined)
    assert.equal((await app.inject('/api/gallery/art-old')).json().item.model, old.model)
    assert.equal((await app.inject('/api/stats')).json().totalRuns, 0)
    // 开放全域名测试请求
    assert.equal(
      (
        await app.inject({
          url: '/api/tests',
          method: 'POST',
          headers: { origin: 'https://evil.invalid' },
          payload: {},
        })
      ).statusCode,
      400,
    )
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
