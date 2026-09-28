import { z } from 'zod'
import { randomInt } from 'node:crypto'
import { readJson, writeJson } from './storage.js'

export const PELICAN_PROMPT =
  '请生成可直接运行的单文件HTML，使用内联SVG绘制鹈鹕骑自行车的二维循环动画。画面以鹈鹕和自行车为主体，展示清晰的身体结构、踩踏动作和车轮转动，配合协调的背景、配色与层次。动画应流畅自然、衔接连续，并适配不同屏幕尺寸。禁止依赖外部资源，只输出完整HTML，不要代码围栏或解释文字。'
export const CANDY_PROMPT =
  '黑色袋子中有苹果、桃子、西瓜三种口味的糖果，圆形与五角星形可以靠手感区分。活动前决定取出的总数，抽取时可以根据形状选择。最少取多少个，才能保证同时拥有不同形状的苹果味和桃子味糖果？圆形：苹果7、桃子9、西瓜8；五角星形：苹果7、桃子6、西瓜4。请给出最坏情况分析与最终数字，最后一行严格写成 FINAL_ANSWER: 数字。'
export const settingsSchema = z.object({
  testsEnabled: z.boolean().default(true),
  demoEnabled: z.boolean().default(true),
  defaultModel: z.string().trim().min(1).max(120).default('gpt-6-astra'),
  defaultEffort: z
    .enum(['auto', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
    .default('auto'),
  idleTimeoutSeconds: z.number().int().min(30).max(3600).default(600),
  maxOutputTokens: z.number().int().min(1024).max(128000).default(16000),
  maxConcurrent: z.number().int().min(1).max(10).default(3),
  requestsPerTenMinutes: z.number().int().min(1).max(100).default(12),
  pageSize: z.number().int().min(6).max(100).default(24),
  pelicanPrompt: z.string().trim().min(20).max(6000).default(PELICAN_PROMPT),
  randomScenes: z.array(z.string().trim().min(1)).default([
    '海边的灯塔公路',
    '黄昏的盐湖小道',
    '春日的风车田野',
    '雨后的森林绿道',
    '清晨的山间公路',
    '繁星下的湖畔',
  ]),
  randomAccents: z.array(z.string().trim().min(1)).default([
    '蓝色围巾',
    '绿色车篮',
    '橙色骑行帽',
    '紫色水壶',
    '红色车铃',
  ]),
  showShowcase: z.boolean().default(true),
  showDanmaku: z.boolean().default(true),
  brandName: z.string().trim().min(1).max(50).default('鹈鹕妈妈'),
  brandSub: z.string().trim().max(50).default('PELICAN OBSERVATORY'),
  brandLogoUrl: z.string().trim().max(1000).default('/logo.png'),
  galleryTitle: z.string().trim().min(1).max(80).default('作品墙'),
  galleryDescription: z
    .string()
    .trim()
    .max(200)
    .default('查看真实生成的作品、测试提示词与本地判定依据。'),
  showcaseTitle: z.string().trim().min(1).max(80).default('正常与降智，看作品说话。'),
})
export const defaults = settingsSchema.parse({})
let settings = settingsSchema.parse(readJson('settings.json', {}))
export const getSettings = () => ({ ...settings })
export function saveSettings(value: unknown) {
  const next = settingsSchema.parse({ ...settings, ...settingsSchema.partial().parse(value) })
  writeJson('settings.json', next)
  settings = next
  return getSettings()
}
export function promptFor(benchmark: string, mode: string, customPrompt?: string) {
  if (benchmark === 'custom' || mode === 'custom') {
    return customPrompt?.trim() || settings.pelicanPrompt
  }
  if (benchmark === 'candy' || mode === 'candy') return CANDY_PROMPT
  if (mode !== 'random') return settings.pelicanPrompt
  const scenes = settings.randomScenes?.length ? settings.randomScenes : ['海边的灯塔公路', '黄昏的盐湖小道', '春日的风车田野']
  const accents = settings.randomAccents?.length ? settings.randomAccents : ['蓝色围巾', '绿色车篮', '橙色骑行帽']
  return (
    settings.pelicanPrompt +
    `\n本次场景：${scenes[randomInt(scenes.length)]}；增加${accents[randomInt(accents.length)]}。主体仍为鹈鹕和普通双轮自行车。`
  )
}
export const homeSchema = z.object({
  kicker: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200),
  primaryLabel: z.string().trim().min(1).max(30),
  primaryHref: z.string().regex(/^\/(?!\/)[^\\\r\n]*$/),
  secondaryEnabled: z.boolean(),
  secondaryLabel: z.string().trim().min(1).max(30),
  secondaryHref: z.string().regex(/^\/(?!\/)[^\\\r\n]*$/),
})
export const defaultHome = {
  kicker: '鹈鹕妈妈 · 模型观察站',
  title: '今天还会骑吗？',
  description: '带上自己的接口，观察一次真实的生成与推理表现。',
  primaryLabel: '开始测试',
  primaryHref: '/test',
  secondaryEnabled: true,
  secondaryLabel: '看看作品墙',
  secondaryHref: '/gallery',
}
