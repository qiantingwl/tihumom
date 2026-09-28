import assert from 'node:assert/strict'

const origin = new URL(process.argv[2] || 'http://127.0.0.1:8988')
assert.ok(['http:', 'https:'].includes(origin.protocol), 'Use an HTTP(S) site URL')
async function get(path, type) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(30000), redirect: 'error' })
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`)
  assert.ok(response.headers.get('content-type')?.includes(type), `${path}: unexpected content type`)
  return response
}

assert.equal((await (await get('/api/health', 'application/json')).json()).ok, true)
const bootstrap = await (await get('/api/bootstrap', 'application/json')).json()
assert.ok(bootstrap.settings && bootstrap.stats, 'Bootstrap settings / stats missing')
for (const path of ['/', '/gallery', '/test', '/compare', '/suspicious', '/stats', '/api-docs', '/admin']) {
  const html = await (await get(path, 'text/html')).text()
  assert.match(html, /id="app"/, `${path}: app mount missing`)
  const assets = [...html.matchAll(/(?:src|href)="([^" ]+[.](?:js|css))"/g)].map(match => match[1])
  assert.ok(assets.length >= 2, `${path}: frontend assets missing`)
  if (path === '/') for (const asset of assets) {
    const response = await fetch(new URL(asset, origin), { signal: AbortSignal.timeout(30000) })
    assert.equal(response.status, 200, `Missing bundle ${asset}`)
    assert.ok(!response.headers.get('content-type')?.includes('text/html'), `Bundle served as HTML: ${asset}`)
  }
}
for (const path of ['/logo.png', '/favicon-32.png', '/favicon-48.png', '/apple-touch-icon.png']) {
  const bytes = new Uint8Array(await (await get(path, 'image/png')).arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${path}: invalid PNG`)
}
const gallery = await (await get('/api/gallery?page=1&pageSize=6', 'application/json')).json()
assert.ok(Array.isArray(gallery.items), 'Gallery response missing items')
assert.ok(Array.isArray(await (await get('/api/showcase', 'application/json')).json()), 'Showcase response invalid')
console.log(JSON.stringify({ ok: true, origin: origin.origin, version: 'v0.2.1', visibleWorks: gallery.total ?? gallery.items.length, checks: ['health', 'bootstrap', '8 routes', 'bundles', '4 brand images', 'gallery', 'showcase'], upstreamRequests: 0 }, null, 2))
