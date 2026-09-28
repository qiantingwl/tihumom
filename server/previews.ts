import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { capturePreview } from './quality/render-quality.js'
import { dataDir } from './storage.js'

const dir = join(dataDir, 'previews')
mkdirSync(dir, { recursive: true })
const pending = new Map<string, Promise<Buffer>>()
const failed = new Map<string, number>()
export async function thumbnail(html: string): Promise<Buffer> {
  const key = createHash('sha256')
      .update('preview-v1:' + html)
      .digest('hex'),
    file = join(dir, key + '.jpg')
  if (existsSync(file)) return readFile(file)
  if ((failed.get(key) || 0) > Date.now()) throw new Error('Preview retry later')
  if (pending.has(key)) return pending.get(key)!
  if (pending.size >= 32) throw new Error('Preview queue busy')
  const work = (async () => {
    try {
      const buffer = await capturePreview(html)
      const temp = file + '.tmp'
      await writeFile(temp, buffer)
      await rename(temp, file)
      return buffer
    } catch (e) {
      failed.set(key, Date.now() + 60000)
      throw e
    } finally {
      pending.delete(key)
      if (failed.size > 256) failed.clear()
    }
  })()
  pending.set(key, work)
  return work
}
