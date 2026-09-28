import { evaluateRecord } from './quality/quality.js'
import type { InspectionItem } from './types.js'

export function gradeCandy(text: string) {
  const cleaned = text.replace(/[*`]/g, '').trim()
  const marked = [
    ...cleaned.matchAll(/^\s*FINAL_ANSWER\s*[:：]\s*(\d+)\s*[个颗]?\s*[。.!]?\s*$/gim),
  ]
  const unique = new Set(marked.map((m) => Number(m[1])))
  const tail = cleaned.split(/\n/).filter((line) => line.trim()).at(-1) || ''
  const conclusion = [
    ...tail.matchAll(
      /(?:最终答案|最终结论|答案|最少(?:需要)?(?:取出|抽取|取)?|至少(?:需要)?(?:取出|抽取|取)?)\s*(?:是|为)?\s*[:：]?\s*(\d+)\s*(?:个|颗)?(?:糖果)?\s*[。.!！]*\s*$/g,
    ),
  ]
  const finalIsMarked = /^\s*FINAL_ANSWER\s*[:：]\s*\d+\s*[个颗]?\s*[。.!]?\s*$/i.test(
    cleaned.split(/\n/).at(-1) || '',
  )
  const answer =
    finalIsMarked && unique.size === 1
      ? [...unique][0]
      : !marked.length && conclusion.length
        ? Number(conclusion.at(-1)![1])
        : !marked.length && !/FINAL_ANSWER\s*[:：]/i.test(cleaned) && /^21\s*[个颗。.!]*$/.test(tail)
          ? 21
          : null
  const passed = answer === 21 && unique.size <= 1
  const inspections: InspectionItem[] = [
    {
      name: '最终结论',
      passed,
      detail: passed
        ? '最终明确答案为 21；不把推导中偶然出现的 21 当作答案。'
        : answer === null
          ? '没有提取到唯一明确的最终数字。'
          : `最终答案为 ${answer}，与本题标准答案 21 不符。`,
    },
  ]
  return {
    verdict: passed ? ('passed' as const) : ('failed' as const),
    analysis: passed ? '正常：本次糖果题最终答案正确。' : '降智：本次糖果题未给出正确的最终答案。',
    inspections,
    judgmentVersion: 'candy-final-v3',
  }
}
// An arbitrary prompt has no standard answer. Receiving text/HTML successfully
// is not evidence that it passed the pelican or candy benchmark.
export function acceptCustomOutput() {
  return {
    verdict: undefined,
    analysis: '自定义输出已接收；未设置标准答案，不参与正常／降智判定及正常率。',
    inspections: [] as InspectionItem[],
    judgmentVersion: 'custom-output-v2',
  }
}
export async function evaluateHtml(html: string) {
  const record: any = { html, execution_status: 'completed' }
  const result = await evaluateRecord(record)
  if (result.verdict === null)
    throw new Error(record.execution_status === 'incomplete'
      ? '作品未完成：空输出或 SVG 未闭合；本次不计入正常率'
      : '本地画面检测未完成，请检查浏览器运行环境；本次不计入正常率')
  return {
    verdict: result.verdict as 'passed' | 'failed',
    analysis: result.analysis,
    inspections: result.inspections as InspectionItem[],
    previewImage: (result as any).preview_image as string | undefined,
    judgmentVersion: result.judgment_version,
  }
}
