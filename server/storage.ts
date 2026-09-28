import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })
export function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(dataDir, name), 'utf8'))
  } catch (error: any) {
    if (error.code === 'ENOENT') return structuredClone(fallback)
    throw new Error(`数据文件 ${name} 无法读取，已停止操作以保护历史数据`)
  }
}
export function writeJson(name: string, value: unknown) {
  const file = join(dataDir, name),
    temporary = `${file}.${randomUUID()}.tmp`
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  renameSync(temporary, file)
}
