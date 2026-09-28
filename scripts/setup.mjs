import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
mkdirSync('data', { recursive: true })
if (!existsSync('.env')) {
  writeFileSync(
    '.env',
    `HOST=127.0.0.1\nPORT=8988\nADMIN_TOKEN=${randomBytes(32).toString('hex')}\nCOOKIE_SECURE=false\n`,
    { mode: 0o600, flag: 'wx' },
  )
  console.log('已创建 .env；管理员口令保存在 ADMIN_TOKEN，未输出到日志。请在编辑器中查看。')
} else console.log('保留已有 .env，未覆盖配置。')
console.log(
  '下一步：npx playwright install chromium && npm run check:renderer && npm run build && npm start',
)
