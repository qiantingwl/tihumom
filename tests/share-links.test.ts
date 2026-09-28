import assert from 'node:assert/strict'
import test from 'node:test'
import { artworkShareUrl } from '../src/services/share-links'

test('single artwork sharing and QR destination retain the exact ID on the current host', () => {
  const id = '01c7ff36-d8a8-4eb3-8444-6daa119f0336'
  assert.equal(artworkShareUrl('https://www.tihu.mom', id), `https://www.tihu.mom/gallery?item=${id}`)
  const encoded = new URL(artworkShareUrl('http://localhost:6188', 'id &/作品'))
  assert.equal(encoded.searchParams.get('item'), 'id &/作品')
  assert.equal(encoded.host, 'localhost:6188')
  assert.equal(encoded.pathname, '/gallery')
})

test('dual report sharing preserves both artwork IDs in order', () => {
  const link = new URL(artworkShareUrl('https://www.tihu.mom', 'left-id', 'right-id'))
  assert.equal(link.pathname, '/compare')
  assert.equal(link.searchParams.get('left'), 'left-id')
  assert.equal(link.searchParams.get('right'), 'right-id')
})
