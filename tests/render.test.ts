import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { evaluateHtml } from '../server/evaluation.js'
import { closeRenderer } from '../server/quality/render-quality.js'

const normal = readFileSync(new URL('./fixtures/pelican.html', import.meta.url), 'utf8')
test('rendered structural verdicts follow the bicycle, not decorations, hidden geometry or framing', { timeout: 90000 }, async () => {
  const rotate = /<animateTransform\b[^>]*\/>/g
  let rotations = 0
  const staticWheels = normal.replace(rotate, (tag) => ++rotations <= 2 ? '' : tag)
  const staticLeg = normal.replace(/<animate\s+attributeName="d"[\s\S]*?\/>/, '')
  const sun = '<path d="M40 95H170 M105 30V160 M59 49L151 141 M59 141L151 49" stroke="#e9ae21" stroke-width="4" fill="none"/>'
  const movingDot = '<circle cx="80" cy="80" r="20" fill="orange"><animate attributeName="cx" values="80;130;80" dur="1s" repeatCount="indefinite"/></circle>'
  const svg = normal.match(/<svg[\s\S]*<\/svg>/)![0]
  const reused = normal.replace('<g id="bicycle">', '<defs><g id="bicycle">')
    .replace('</g>\n</svg>', '</g></defs><use href="#bicycle"/>\n</svg>')
  const cases: Array<[string, string, 'passed' | 'failed', string?]> = [
    ['coordinated bicycle', normal, 'passed'],
    ['script-generated inline SVG', `<!doctype html><body><script>document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(normal.match(/<svg[\s\S]*<\/svg>/)![0])})</script></body>`, 'passed'],
    ['delayed script-generated SVG is not a broken bicycle', `<!doctype html><body><script>setTimeout(() => document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(svg)}), 1450)</script></body>`, 'passed'],
    ['transparent bicycle plus moving decoration cannot pass', normal.replace(/(fill|stroke)="#[\da-f]+"/gi, '$1="rgba(0,0,0,0)"').replace('</svg>', movingDot + '</svg>'), 'failed', '双轮结构'],
    ['visible referenced bicycle remains valid', reused, 'passed'],
    ['transparent referenced group cannot pass', reused.replace('id="bicycle"', 'id="bicycle" opacity="0"').replace('</svg>', movingDot + '</svg>'), 'failed', '双轮结构'],
    ['unrelated larger SVG does not replace artwork evidence', normal.replace('<body>', '<body><svg width="100%" height="100%" style="position:fixed;inset:0;pointer-events:none"><circle r="2" cx="1" cy="1"/></svg>'), 'passed'],
    ['moving leg with stopped wheels', staticWheels, 'failed', '车轮转动'],
    ['moving wheels with stopped leg', staticLeg, 'failed', '踩踏动作'],
    ['partly cropped bicycle', normal.replace('id="bicycle"', 'id="bicycle" transform="translate(-300 0)"'), 'passed'],
    ['radial sun is not a detached spoke', normal.replace('</svg>', sun + '</svg>'), 'passed'],
    ['hidden bicycle cannot establish quality', normal.replace('id="bicycle"', 'id="bicycle" style="display:none"'), 'failed', '双轮结构'],
    ['inserting decorative DOM nodes preserves geometry identity', normal.replace('</body>', `<script>
      setInterval(() => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        p.setAttribute('cx', '12'); p.setAttribute('cy', '12'); p.setAttribute('r', '2');
        document.querySelector('svg').prepend(p); }, 350);
      </script></body>`), 'passed'],
  ]
  try {
    // Bound local Chromium concurrency; no model API or messages are involved.
    for (let start = 0; start < cases.length; start += 2) {
      await Promise.all(cases.slice(start, start + 2).map(async ([label, html, expected, failedCheck]) => {
        const result = await evaluateHtml(html)
        assert.equal(result.verdict, expected, `${label}: ${result.analysis}`)
        if (expected === 'passed') assert.ok(result.inspections.every((check) => check.passed), `${label}: mixed verdicts`)
        if (failedCheck) assert.ok(result.inspections.some((check) => check.name === failedCheck && !check.passed), label)
      }))
    }
    await assert.rejects(evaluateHtml('<svg><circle r="40">'), /未完成/)
  } finally { await closeRenderer() }
})
