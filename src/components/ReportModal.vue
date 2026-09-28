<script setup lang="ts">
import { sampleStatus, formatDuration, artworkUsage } from "../services/display"
import { computed, nextTick, onMounted, ref } from 'vue'
import { Check, Download, Share2, X } from '@lucide/vue'
import QRCode from 'qrcode'
import type { GalleryItem } from '../types'
import { artworkShareUrl, PUBLIC_SITE_ORIGIN } from '../services/share-links'
import { compareRecords } from '../services/comparison'

const props = defineProps<{
  item: GalleryItem
  itemB?: GalleryItem
}>()

const emit = defineEmits<{ close: [] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const previewUrl = ref('')
const copied = ref(false)
const generating = ref(true)
const shareUrl = computed(() => artworkShareUrl(PUBLIC_SITE_ORIGIN, props.item.id, props.itemB?.id))

function effortLabel(effort: string) {
  const map: Record<string, string> = { auto: '自动', low: '低', medium: '中', high: '高', xhigh: '极高' }
  return map[effort] || effort
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

// Use the full-document browser capture, including CSS variables and script state.
function loadArtworkImage(item: GalleryItem): Promise<HTMLImageElement | null> {
  const source = item.previewImage?.startsWith('data:image/')
    ? item.previewImage
    : '/api/gallery/' + encodeURIComponent(item.id) + '/preview'
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => { img.onload = null; img.onerror = null; resolve(null) }, 12000)
    const finish = (value: HTMLImageElement | null) => { clearTimeout(timer); resolve(value) }
    img.onload = () => finish(img)
    img.onerror = () => finish(null)
    img.src = source
  })
}

function drawArtwork(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight)
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale
  ctx.drawImage(img, x + (width - w) / 2, y + (height - h) / 2, w, h)
}

// 辅助：生成二维码 Image
function generateQrImage(text: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    QRCode.toDataURL(text, { width: 320, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }, (err, url) => {
      if (err || !url) return resolve(null)
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
  })
}

// 辅助：绘制圆角矩形
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 辅助：Canvas 多行文本折行，支持自适应高度渲染全部文本
function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 10) {
  let line = ''
  let currentY = y
  let lineCount = 1

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const testLine = line + char
    const testWidth = ctx.measureText(testLine).width

    if (testWidth > maxWidth && i > 0) {
      if (lineCount >= maxLines) {
        ctx.fillText(line.slice(0, -1) + '...', x, currentY)
        return
      }
      ctx.fillText(line, x, currentY)
      line = char
      currentY += lineHeight
      lineCount++
    } else {
      line = testLine
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY)
  }
}

async function renderCard() {
  generating.value = true
  await nextTick()
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const isDual = Boolean(props.itemB)
  const width = 640
  // 单图留出 940 高度以完整渲染提示词与底部二维码存证区，双图留出 960
  const height = isDual ? 960 : 940
  canvas.width = width * 2
  canvas.height = height * 2
  ctx.scale(2, 2)

  // 1. 背景底色（纯白高质感）
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // 外层整体浅灰细边框
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.strokeRect(12, 12, width - 24, height - 24)

  // 顶栏深石板黑装饰条
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(28, 26, width - 56, 4)

  // 2. 标题区
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText('鹈鹕妈妈 · 模型观察站 · 现场存证战报', 28, 62)

  ctx.fillStyle = '#64748b'
  ctx.font = '600 11px "IBM Plex Mono", monospace'
  const subCode = isDual ? `DUAL BATTLE · #${props.item.code} VS #${props.itemB!.code}` : `NO.${props.item.code} · ${props.item.model}`
  ctx.fillText(`PELICAN OBSERVATORY CARD · ${subCode}`, 28, 80)

  // 分割虚线
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(28, 94)
  ctx.lineTo(width - 28, 94)
  ctx.stroke()
  ctx.setLineDash([])

  if (!isDual) {
    // ==================== 单幅完整战报 ====================
    const a = props.item

    // 画面预览容器（320px 高）
    const artBoxY = 108
    const artBoxH = 320
    ctx.fillStyle = '#f8fafc'
    ctx.strokeStyle = '#e2e8f0'
    drawRoundedRect(ctx, 28, artBoxY, width - 56, artBoxH, 8)
    ctx.fill()
    ctx.stroke()

    if (a.benchmark === 'pelican' && a.html) {
      const img = await loadArtworkImage(a)
      if (img) {
        ctx.save()
        drawRoundedRect(ctx, 28, artBoxY, width - 56, artBoxH, 8)
        ctx.clip()
        drawArtwork(ctx, img, 28, artBoxY, width - 56, artBoxH)
        ctx.restore()
      } else {
        ctx.fillStyle = '#0f172a'
        ctx.font = 'bold 16px sans-serif'
        ctx.fillText(a.title, 48, artBoxY + 50)
      }
    } else {
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 16px sans-serif'
      ctx.fillText('糖果测试 · 逻辑极值推导记录', 48, artBoxY + 36)

      ctx.fillStyle = '#475569'
      ctx.font = '12px sans-serif'
      const lines = [
        '测试题目：黑色袋中苹果、桃子、西瓜糖果，圆与星形手感区分。最少取多少个保证同时拥有不同形状苹果与桃子？',
        '',
        '模型思维链与回答摘录：',
        ...((a.answerText || '').slice(0, 240).match(/.{1,46}/g) || []),
        '',
        `自动化判分：${sampleStatus(a).label}`
      ]
      lines.slice(0, 10).forEach((line, idx) => {
        ctx.fillText(line, 48, artBoxY + 68 + idx * 22)
      })
    }

    // 评测参数矩阵大网格（移除无意义的测试来源，替换为更有价值的参数）
    const infoY = 444
    const infoH = 190
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#e2e8f0'
    drawRoundedRect(ctx, 28, infoY, width - 56, infoH, 8)
    ctx.fill()
    ctx.stroke()

    // 标题条
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(29, infoY + 1, width - 58, 34)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 13px sans-serif'
    const usage = artworkUsage(a)
    ctx.fillText(usage.note || '技术指标与评测存证', 44, infoY + 23)

    const facts = [
      ['作品编号', `#${a.code}`],
      ['测试题型', a.benchmark === 'candy' ? '糖果测试 · 极值推理' : (a.mode === 'benchmark' ? '基准题 (固定变量)' : '随机题 (临场发挥)')],
      ['测试模型', a.model],
      ['推理档位', `思考档位: ${effortLabel(a.effort)}`],
      ['响应耗时', formatDuration(usage.latencyMs)],
      ['生成时间', formatDate(a.createdAt)],
      ['输入 Tokens', `${usage.inputTokens ?? '—'}`],
      ['输出 Tokens', `${usage.outputTokens ?? '—'}`],
      [usage.note ? '展示费用' : '记录费用', usage.cost ?? '—'],
      ['自动化判定', sampleStatus(a).label],
    ]

    facts.forEach(([label, val], idx) => {
      const col = idx % 2
      const row = Math.floor(idx / 2)
      const x = 44 + col * 275
      const y = infoY + 58 + row * 25
      ctx.fillStyle = '#64748b'
      ctx.font = '12px sans-serif'
      ctx.fillText(label, x, y)
      ctx.fillStyle = '#0f172a'
      ctx.font = '600 12px "IBM Plex Mono", monospace'
      ctx.fillText(val, x + 85, y)
    })

    // 测试提示词框（完整多行自适应展示，绝不漏字）
    const promptY = 648
    const promptBoxH = 135
    ctx.fillStyle = '#f8fafc'
    ctx.strokeStyle = '#e2e8f0'
    drawRoundedRect(ctx, 28, promptY, width - 56, promptBoxH, 6)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#64748b'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('测试提示词 (PROMPT)：', 40, promptY + 22)

    ctx.fillStyle = '#334155'
    ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    const promptText = a.prompt || '请生成可直接运行的单文件HTML，使用内联SVG绘制鹈鹕骑自行车的二维循环动画。画面以鹈鹕和自行车为主体，展示清晰的身体结构、踩踏动作和车轮转动，配合协调的背景、配色与层次。动画应流畅自然、衔接连续，并适配不同屏幕尺寸。禁止依赖外部资源，只输出完整HTML，不要代码围栏或解释文字。'
    drawWrappedText(ctx, promptText, 40, promptY + 44, width - 80, 18, 5)
  } else {
    // ==================== 双图同题对比战报 ====================
    const [a, b] = [props.item, props.itemB!]

    // 对比卡片 A
    ctx.fillStyle = '#f8fafc'
    ctx.strokeStyle = '#e2e8f0'
    drawRoundedRect(ctx, 28, 108, 282, 350, 8)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(`作品 A · #${a.code}`, 42, 134)

    if (a.benchmark === 'pelican' && a.html) {
      const imgA = await loadArtworkImage(a)
      if (imgA) {
        drawArtwork(ctx, imgA, 40, 146, 258, 160)
      }
    }

    ctx.fillStyle = '#475569'
    ctx.font = '11px sans-serif'
    ctx.fillText(`模型：${a.model}`, 42, 330)
    ctx.fillText(`思考：${effortLabel(a.effort)} · 耗时：${formatDuration(a.latencyMs)}`, 42, 352)
    ctx.fillText(`评价：${a.likes}赞 · 判定：${sampleStatus(a).label}`, 42, 374)
    ctx.fillText(`编号：#${a.code}`, 42, 396)

    // 对比卡片 B
    ctx.fillStyle = '#f8fafc'
    ctx.strokeStyle = '#e2e8f0'
    drawRoundedRect(ctx, 330, 108, 282, 350, 8)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(`作品 B · #${b.code}`, 344, 134)

    if (b.benchmark === 'pelican' && b.html) {
      const imgB = await loadArtworkImage(b)
      if (imgB) {
        drawArtwork(ctx, imgB, 342, 146, 258, 160)
      }
    }

    ctx.fillStyle = '#475569'
    ctx.font = '11px sans-serif'
    ctx.fillText(`模型：${b.model}`, 344, 330)
    ctx.fillText(`思考：${effortLabel(b.effort)} · 耗时：${formatDuration(b.latencyMs)}`, 344, 352)
    ctx.fillText(`评价：${b.likes}赞 · 判定：${sampleStatus(b).label}`, 344, 374)
    ctx.fillText(`编号：#${b.code}`, 344, 396)

    // 对比结论大卡片
    const evalY = 474
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#e2e8f0'
    drawRoundedRect(ctx, 28, evalY, width - 56, 230, 8)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText('【作品对照与条件说明】', 44, evalY + 34)

    const comparison = compareRecords(a, b)
    const notes = [
      '1. 题目：' + (comparison.samePrompt && comparison.sameBenchmark && comparison.sameMode ? '已记录题目与模式一致' : '不同或未记录'),
      '2. 模型：' + (comparison.sameModel ? '一致' : '不同') + '；思考档位：' + (comparison.sameEffort ? '一致' : '不同或未记录'),
      '3. 记录来源：A ' + comparison.leftSource + ' / B ' + comparison.rightSource,
      '4. ' + comparison.speedText,
      '5. ' + (comparison.independent && comparison.aligned ? '条件已对齐，仅代表这两次结果。' : '条件未完全对齐或非独立实测，只作作品对照。')
    ]
    notes.forEach((text, i) => {
      ctx.fillStyle = '#475569'
      ctx.font = '12px sans-serif'
      ctx.fillText(text, 44, evalY + 68 + i * 26)
    })
  }

  // 3. 底部专属防伪落款 + 二维码区域（彻底解决文字重叠，清晰整齐）
  const qrImg = await generateQrImage(shareUrl.value)

  const footerAreaY = height - 120
  // 分割虚线
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.moveTo(28, footerAreaY)
  ctx.lineTo(width - 28, footerAreaY)
  ctx.stroke()
  ctx.setLineDash([])

  // 绘制右下角高清存证二维码（留出底边安全区，绝不越界出底框）
  if (qrImg) {
    const qrSize = 80
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(qrImg, width - 28 - qrSize, footerAreaY + 12, qrSize, qrSize)
    ctx.restore()
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('扫码查看原版', width - 28 - qrSize / 2, footerAreaY + 104)
    ctx.textAlign = 'left'
  }

  // 左侧文字分行排列，彻底避免重叠
  ctx.fillStyle = '#0f172a'
  ctx.font = '600 12px "IBM Plex Mono", monospace'
  ctx.fillText('Generated by 鹈鹕妈妈 (PELICAN OBSERVATORY)', 28, footerAreaY + 28)

  ctx.fillStyle = '#64748b'
  ctx.font = '11px "IBM Plex Mono", monospace'
  ctx.fillText(`作品存证地址 · ${PUBLIC_SITE_ORIGIN}`, 28, footerAreaY + 50)

  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px sans-serif'
  ctx.fillText('真实现场存证 · 一次结果不是结论 · 建议多跑几圈', 28, footerAreaY + 72)

  previewUrl.value = canvas.toDataURL('image/png')
  generating.value = false
}

function downloadImage() {
  if (!previewUrl.value) return
  const a = document.createElement('a')
  a.href = previewUrl.value
  a.download = `pelican-report-${props.item.code}.png`
  a.click()
}

async function copyShareLink() {
  await navigator.clipboard.writeText(shareUrl.value)
  copied.value = true
  setTimeout(() => copied.value = false, 2000)
}

onMounted(renderCard)
</script>

<template>
  <Teleport to="body">
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="report-modal" role="dialog" aria-modal="true" aria-label="图片战报">
      <header class="modal-header">
        <div>
          <h3>图片战报 · 现场存证卡</h3>
          <p>把这一幕存成高清战报长图，支持包含画面实况、耗时、参数与二维码存证。</p>
        </div>
        <button class="close-btn" type="button" aria-label="关闭" @click="$emit('close')">
          <X :size="20" />
        </button>
      </header>

      <div class="canvas-wrap">
        <canvas ref="canvasRef" class="report-canvas" />
        <p class="canvas-tip">若点击下载无反应，可在图片上长按或右键另存为图片。</p>
      </div>

      <footer class="modal-footer">
        <button class="button ghost-dark" type="button" @click="copyShareLink">
          <Check v-if="copied" :size="16" />
          <Share2 v-else :size="16" />
          {{ copied ? '已复制分享链接' : '复制分享链接' }}
        </button>
        <button class="button primary" type="button" :disabled="generating" @click="downloadImage">
          <Download :size="16" />
          保存战报长图
        </button>
      </footer>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--dialog-backdrop);
  z-index: var(--layer-report);
  isolation: isolate;
  display: grid;
  place-items: center;
  padding: 20px;
}
.report-modal {
  position: relative;
  z-index: 1;
  width: min(100%, 720px);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: var(--dialog-shadow);
  overflow: hidden;
  border: 1px solid #cbd5e1;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}
.modal-header h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}
.modal-header p {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: #64748b;
}
.close-btn {
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  color: #64748b;
  padding: 6px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  transition: all 0.15s ease;
}
.close-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.canvas-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f8fafc;
}
.report-canvas {
  width: 100%;
  max-width: 600px;
  height: auto;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  background: white;
}
.canvas-tip {
  margin-top: 14px;
  font-size: 0.78rem;
  color: #94a3b8;
}
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
}
</style>
