<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Check, Copy } from '@lucide/vue'
import { fetchBootstrapData } from '../services/api'
import { PUBLIC_SITE_ORIGIN } from '../services/share-links'

const copied = ref('')
const baseUrl = PUBLIC_SITE_ORIGIN
const requestLimit = ref<number | null>(null)
const testsEnabled = ref<boolean | null>(null)
onMounted(async () => {
  try {
    const data = await fetchBootstrapData()
    requestLimit.value = data?.settings?.requestsPerTenMinutes ?? null
    testsEnabled.value = data?.settings?.testsEnabled ?? null
  } catch {}
})
async function copy(id: string, value: string) {
  await navigator.clipboard.writeText(value)
  copied.value = id
  setTimeout(() => copied.value = '', 1400)
}

function createExample(benchmark: 'pelican' | 'candy') {
  const body = {
    benchmark, demo: false,
    endpoint: 'https://your-provider.example/v1/responses',
    apiKey: 'YOUR_API_KEY',
    model: 'YOUR_MODEL_ID',
    mode: benchmark === 'candy' ? 'candy' : 'benchmark',
    effort: 'auto', source: 'MY-AGENT',
  }
  return [
    'curl --fail-with-body -sS -b pelican-cookies.txt -c pelican-cookies.txt \\',
    '  -X POST "' + baseUrl + '/api/tests" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '" + JSON.stringify(body, null, 2) + "'",
  ].join('\n')
}
const pelicanExample = createExample('pelican')
const candyExample = createExample('candy')
const progressExample = [
  '# 将 TASK_ID 换成创建响应中的 task.id；使用同一份 Cookie 文件。',
  'curl --fail-with-body -sS -b pelican-cookies.txt "' + baseUrl + '/api/tests/TASK_ID"',
  '',
  '# SSE 持续输出 data: {"task": ...}；完成或失败后连接结束。',
  'curl --fail-with-body -N -b pelican-cookies.txt "' + baseUrl + '/api/tests/TASK_ID/events"',
].join('\n')
const galleryExample = [
  'curl --fail-with-body -sS "' + baseUrl + '/api/gallery?benchmark=pelican&page=1&pageSize=12&sort=newest"',
  '',
  '# 将 WORK_ID 换成列表项 id；详情包含完整 HTML 或回答。',
  'curl --fail-with-body -sS "' + baseUrl + '/api/gallery/WORK_ID"',
].join('\n')
const reactExample = [
  'curl --fail-with-body -sS -b pelican-cookies.txt -c pelican-cookies.txt \\',
  '  -X POST "' + baseUrl + '/api/gallery/WORK_ID/react" \\',
  '  -H "Content-Type: application/json" \\',
  "  -d '{\"type\":\"likes\"}'",
].join('\n')
const healthExample = 'curl --fail-with-body -sS "' + baseUrl + '/api/health"'
</script>

<template>
  <section class="page-title page-wrap">
    <span class="eyebrow">DEVELOPER API REFERENCE</span>
    <h1>开发者 API 接入指南</h1>
    <p>创建检测任务、读取进度与公开作品。接口与分享统一使用正式站点。</p>
  </section>
  <section class="docs-layout page-wrap">
    <aside class="docs-nav">
      <div class="nav-sticky">
        <span class="nav-title">接口目录</span>
        <a href="#overview">接入与会话</a>
        <a href="#pelican">01 鹈鹕检测</a>
        <a href="#candy">02 糖果测试</a>
        <a href="#events">03 查询与 SSE</a>
        <a href="#react">04 作品与互动</a>
        <a href="#errors">05 状态与错误</a>
      </div>
    </aside>
    <div class="docs-content">
      <section id="overview" class="doc-card">
        <h2>接入与会话</h2>
        <p>正式服务地址：<code>{{ baseUrl }}</code>。</p>
        <p v-if="testsEnabled !== null">当前配置：{{ testsEnabled ? '允许创建检测任务' : '暂停创建检测任务' }}。这项配置不代表你的上游密钥或模型一定可用。</p>
        <ol>
          <li>替换示例中的上游 <code>endpoint</code>、<code>YOUR_API_KEY</code>、<code>YOUR_MODEL_ID</code>，模型必须是你的服务商实际支持的名称。</li>
          <li>创建任务用 <code>-c pelican-cookies.txt</code> 保存访客 Cookie；后续查询、SSE 与取消使用 <code>-b pelican-cookies.txt</code> 带回同一会话。</li>
          <li>收到 <code>202</code> 后取 <code>task.id</code>。它表示任务已受理，最终成功要看 <code>task.status === "completed"</code>。</li>
        </ol>
        <p>示例按 Bash / WSL 编写。Windows PowerShell 请使用 <code>curl.exe</code>，把 JSON 保存为文件后用 <code>--data-binary @request.json</code> 发送，避免命令行引号转义问题。</p>
        <p>上游 API Key 仅供本次生成使用，不写入任务数据。不要把 Cookie 文件或密钥提交到代码仓库。</p>
      </section>

      <section id="pelican" class="doc-card">
        <div class="endpoint-header"><span class="method-tag post">POST</span><code class="endpoint-path">/api/tests</code></div>
        <h2>01 鹈鹕骑行动画检测</h2>
        <p><code>benchmark: "pelican"</code> 支持固定题 <code>mode: "benchmark"</code> 和随机题 <code>mode: "random"</code>。服务端渲染生成内容并记录逐项检查依据。</p>
        <p>上游地址支持 <code>/v1/responses</code> 或 <code>/v1/chat/completions</code>；只填域名或 <code>/v1</code> 时默认补为 Responses 地址。</p>
        <div class="code-block">
          <button type="button" aria-label="复制鹈鹕创建示例" @click="copy('pelican', pelicanExample)"><Check v-if="copied === 'pelican'" :size="16" /><Copy v-else :size="16" /></button>
          <pre>{{ pelicanExample }}</pre>
        </div>
        <p>自定义题使用 <code>benchmark: "custom"</code>、<code>mode: "custom"</code> 并传 <code>customPrompt</code>；自定义回答不套用鹈鹕或糖果基准结论。</p>
      </section>

      <section id="candy" class="doc-card">
        <div class="endpoint-header"><span class="method-tag post">POST</span><code class="endpoint-path">/api/tests</code></div>
        <h2>02 糖果推理测试</h2>
        <p>服务端提供固定题，核对最终回答与冲突结论；不是正文中出现正确数字就算通过。完整依据保存在结果中。</p>
        <div class="code-block">
          <button type="button" aria-label="复制糖果创建示例" @click="copy('candy', candyExample)"><Check v-if="copied === 'candy'" :size="16" /><Copy v-else :size="16" /></button>
          <pre>{{ candyExample }}</pre>
        </div>
      </section>

      <section id="events" class="doc-card">
        <div class="endpoint-header"><span class="method-tag get">GET</span><code class="endpoint-path">/api/tests/:id</code></div>
        <h2>03 查询任务与 SSE 进度</h2>
        <p>查询返回 <code>{ "task": { ... } }</code>。SSE 地址是 <code>/api/tests/:id/events</code>；事件正文同样为 <code>{ "task": ... }</code>，心跳注释可忽略。</p>
        <p>状态可能为 <code>queued → connecting → generating → checking → completed</code>，出错或取消则为 <code>failed</code>。完成后读取 <code>task.result</code>；失败读取 <code>task.error</code>。</p>
        <div class="code-block">
          <button type="button" aria-label="复制查询与进度示例" @click="copy('progress', progressExample)"><Check v-if="copied === 'progress'" :size="16" /><Copy v-else :size="16" /></button>
          <pre>{{ progressExample }}</pre>
        </div>
        <p><code>GET /api/tests</code> 只返回当前会话的任务摘要，完整内容要查单个任务。<code>POST /api/tests/:id/cancel</code> 可取消当前会话的任务。</p>
        <p>丢失 Cookie、跨到另一个域名或查询他人的任务会返回 <code>404</code>；浏览器接入建议与页面同源。</p>
      </section>

      <section id="react" class="doc-card">
        <div class="endpoint-header"><span class="method-tag get">GET</span><code class="endpoint-path">/api/gallery</code></div>
        <h2>04 公开作品与互动</h2>
        <p>分页参数为 <code>page</code> 和 <code>pageSize</code>，单页上限 100。分页列表返回摘要，单项详情返回完整内容；<code>sort</code> 支持 <code>newest</code>、<code>likes</code>、<code>size</code>。</p>
        <div class="code-block">
          <button type="button" aria-label="复制作品读取示例" @click="copy('gallery', galleryExample)"><Check v-if="copied === 'gallery'" :size="16" /><Copy v-else :size="16" /></button>
          <pre>{{ galleryExample }}</pre>
        </div>
        <p>非演示检测完成后自动公开，作品 ID 与任务 ID 相同；可通过 <code>GET /api/gallery/:id</code> 确认。只需要公开作品内容时不必查询私有任务。</p>
        <p><code>POST /api/gallery/:id/react</code> 支持 <code>likes</code>、<code>abstracts</code>、<code>fails</code>，调用会真实增加对应票数。</p>
        <div class="code-block">
          <button type="button" aria-label="复制作品互动示例" @click="copy('react', reactExample)"><Check v-if="copied === 'react'" :size="16" /><Copy v-else :size="16" /></button>
          <pre>{{ reactExample }}</pre>
        </div>
      </section>

      <section id="errors" class="doc-card">
        <div class="endpoint-header"><span class="method-tag get">GET</span><code class="endpoint-path">/api/health</code></div>
        <h2>05 状态与错误</h2>
        <p>只读健康查询返回 <code>{ "ok": true, "quality": "..." }</code>，表示本站 API 进程有响应，不代表付费上游调用已经成功。</p>
        <div class="code-block"><pre>{{ healthExample }}</pre></div>
        <ul>
          <li><code>400</code>：参数不完整或题型冲突；<code>404</code>：记录不存在、已下架或不属于当前会话。</li>
          <li><code>429</code>：席位已满或请求过频；<code>503</code>：检测暂停或服务正在关闭。</li>
          <li>每个 IP 每十分钟的创建限额：{{ requestLimit === null ? '以当前服务配置为准' : requestLimit + ' 次' }}。</li>
          <li>上游只接受公网 HTTPS、默认 443 端口，不接受内网、回环地址或 URL 内嵌凭据；上游鉴权失败、额度不足、截断和超时会在任务内标为 <code>failed</code>。</li>
          <li>本站错误一般返回 <code>{ "error": "原因" }</code>。若公网请求收到 <code>403</code> 或 HTML 而非 JSON，先查看反向代理或 CDN 规则，不要把它当成成功结果。</li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.docs-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 32px;
  margin-top: 24px;
  align-items: start;
}
.docs-nav {
  position: sticky;
  top: 90px;
}
.nav-sticky {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px 12px;
}
.nav-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 8px 8px;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 4px;
}
.docs-nav a {
  padding: 8px 10px;
  font-size: 0.85rem;
  font-weight: 500;
  color: #475569;
  border-radius: 6px;
  transition: all 0.15s ease;
}
.docs-nav a:hover {
  background: #f8fafc;
  color: #0f172a;
}
.docs-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.doc-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 24px 28px;
  margin-bottom: 20px;
}
.endpoint-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.method-tag {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
.method-tag.post {
  background: #0f172a;
  color: #ffffff;
}
.method-tag.get {
  background: #f1f5f9;
  color: #0f172a;
  border: 1px solid #cbd5e1;
}
.method-tag.guide {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.endpoint-path {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.85rem;
  color: #0f172a;
  font-weight: 600;
  background: #f8fafc;
  padding: 2px 8px;
  border-radius: 4px;
}
.doc-card h2 {
  margin: 8px 0 8px;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}
.doc-card p, .doc-card ul {
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.7;
  margin: 6px 0;
}
.doc-card code {
  font-family: 'IBM Plex Mono', monospace;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.82rem;
  color: #0f172a;
}
.code-block {
  --code-copy-size: 44px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-1);
  position: relative;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 6px;
  padding: 16px 20px;
  margin-top: 14px;
  border: 1px solid #1e293b;
}
.code-block pre {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  margin: 0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.82rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.code-block button {
  grid-column: 2;
  grid-row: 1;
  width: var(--code-copy-size);
  height: var(--code-copy-size);
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.12);
  border: 0;
  color: white;
  border-radius: 4px;
  padding: 6px;
  cursor: pointer;
}
.code-block button:hover {
  background: rgba(255, 255, 255, 0.22);
}
@media (max-width: 800px) {
  .docs-layout { grid-template-columns: minmax(0, 1fr); }
  .docs-nav { position: static; }
  .doc-card { padding: var(--space-2); }
}
</style>
