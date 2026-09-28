import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.setContent(
    '<svg width="100" height="100"><circle cx="50" cy="50" r="25" fill="orange"/></svg>',
  )
  await page.screenshot()
  console.log('Chromium 渲染可用')
} finally {
  await browser.close()
}
