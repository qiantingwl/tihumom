import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('showcase exposes cached real previews, validates sides, and honors visibility settings', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pelican-showcase-'))
  process.env.DATA_DIR = dir
  process.env.PELICAN_TEST_MODE = '1'
  process.env.ADMIN_TOKEN = 'fixture-showcase-admin'
  process.env.LOG_LEVEL = 'silent'
  const artwork = { code: 'ART', label: '真实作品', model: 'fixture', desc: '作品', time: '1s',
    html: '<!doctype html><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><rect width="600" height="400" fill="orange"/></svg>' }
  writeFileSync(join(dir, 'showcase-pairs.json'), JSON.stringify([{ good: artwork, bad: artwork }]))
  const { app } = await import('../server/index.js')
  try {
    const pairs = (await app.inject('/api/showcase')).json()
    assert.equal(pairs[0].good.html, artwork.html)
    assert.match(pairs[0].good.previewImage, /^\/api\/showcase\/0\/good\/preview\?v=[a-f0-9]{16}$/)
    const image = await app.inject(pairs[0].good.previewImage)
    assert.equal(image.statusCode, 200)
    assert.match(String(image.headers['content-type']), /image\/jpeg/)
    assert.ok(image.rawPayload.length > 1000)
    assert.ok(image.headers['cache-control'])
    assert.deepEqual((await app.inject(pairs[0].good.previewImage)).rawPayload, image.rawPayload)
    for (const path of ['/api/showcase/-1/good/preview', '/api/showcase/99/good/preview', '/api/showcase/0/other/preview'])
      assert.equal((await app.inject(path)).statusCode, 404)
    await app.inject({ method: 'PUT', url: '/api/admin/settings', headers: { 'x-admin-token': process.env.ADMIN_TOKEN }, payload: { showShowcase: false } })
    assert.deepEqual((await app.inject('/api/showcase')).json(), [])
    assert.equal((await app.inject(pairs[0].good.previewImage)).statusCode, 404)
  } finally {
    await app.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
