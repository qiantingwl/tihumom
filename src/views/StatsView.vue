<script setup lang="ts">
import { formatDuration, formatPercent, verdictText, verdictClass } from "../services/display"
import { onMounted, ref, shallowRef } from 'vue'
import { Activity, BarChart3, CheckCircle2, Clock3, LayoutGrid, ListFilter, RefreshCw, ShieldAlert, Sparkles, TrendingUp } from '@lucide/vue'
import ArtworkFrame from '../components/ArtworkFrame.vue'
import ArtworkDetailModal from '../components/ArtworkDetailModal.vue'
import ReportModal from '../components/ReportModal.vue'
import { fetchStatsData } from '../services/api'
import type { GalleryItem, StatsOverview } from '../types'

const stats = shallowRef<StatsOverview | null>(null)
const loading = ref(false)
const listMode = ref<'grid' | 'table'>('grid')
const activeDetailItem = ref<GalleryItem | null>(null)
const activeReportItem = ref<GalleryItem | null>(null)

async function loadStats(force = false) {
  loading.value = true
  try {
    stats.value = await fetchStatsData(force)
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return iso
  }
}

function toGalleryItem(run: any): GalleryItem {
  return {
    id: run.id,
    code: run.code,
    title: run.title || (run.benchmark === 'candy' ? '糖果测试 · 推理答卷' : '鹈鹕骑行 · #' + run.code),
    benchmark: run.benchmark,
    model: run.model,
    mode: run.mode || 'benchmark',
    effort: run.effort || 'auto',
    source: run.source,
    visitorAlias: run.visitorAlias,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    cost: run.cost,
    verdict: run.verdict,
    createdAt: run.time,
    latencyMs: run.latencyMs,
    html: run.html,
    answerText: run.answerText,
    published: true,
    likes: run.likes ?? 0,
    abstracts: run.abstracts ?? 0,
    fails: run.fails ?? 0,
    prompt: run.prompt,
    analysis: run.analysis,
    inspections: run.inspections,
    judgmentVersion: run.judgmentVersion,
    judgmentSource: run.judgmentSource,
  }
}

function openDetail(run: any) {
  activeDetailItem.value = toGalleryItem(run)
}

function openReport(run: any) {
  activeReportItem.value = toGalleryItem(run)
}

onMounted(loadStats)
</script>

<template>
  <section class="page-title page-wrap">
    <span class="eyebrow">OBSERVATION & TELEMETRY</span>
    <div class="title-row">
      <div>
        <h1>检测统计 · 监控看板</h1>
        <p>基于真实运行与公开样本库聚合。对比通过率、响应耗时与模型稳定性。</p>
      </div>
      <button class="icon-button" type="button" aria-label="刷新统计" :disabled="loading" @click="loadStats(true)">
        <RefreshCw :class="{ spin: loading }" :size="18" />
      </button>
    </div>
  </section>

  <section v-if="stats" class="stats-shell page-wrap">
    <!-- 顶栏数据大卡片 -->
    <div class="metric-tiles">
      <article class="tile">
        <div class="tile-icon"><Activity :size="20" /></div>
        <div class="tile-meta">
          <span>总评测次数</span>
          <b>{{ stats.totalRuns }}</b>
        </div>
        <small class="tile-sub">含现场任务与公开样本</small>
      </article>

      <article class="tile">
        <div class="tile-icon"><Sparkles :size="20" /></div>
        <div class="tile-meta">
          <span>公开作品存量</span>
          <b>{{ stats.publicWorks }}</b>
        </div>
        <small class="tile-sub">可查验的完整画面与答卷</small>
      </article>

      <article class="tile highlight-green">
        <div class="tile-icon"><CheckCircle2 :size="20" /></div>
        <div class="tile-meta">
          <span>鹈鹕骑行动画率</span>
          <b>{{ formatPercent(stats.pelicanPassRate) }}</b>
        </div>
        <small class="tile-sub">平均耗时 {{ formatDuration(stats.avgLatencyPelican) }}</small>
      </article>

      <article class="tile highlight-yellow">
        <div class="tile-icon"><TrendingUp :size="20" /></div>
        <div class="tile-meta">
          <span>糖果极值满血率</span>
          <b>{{ formatPercent(stats.candyPassRate) }}</b>
        </div>
        <small class="tile-sub">平均耗时 {{ formatDuration(stats.avgLatencyCandy) }}</small>
      </article>
    </div>

    <!-- 模型横向排行榜 -->
    <section class="stats-section">
      <div class="section-head">
        <h2><BarChart3 :size="20" /> 模型表现综合排行榜</h2>
        <p>按已记录样本统计 · 演示数据单独标注</p>
      </div>

      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>模型名称</th>
              <th>样本总量</th>
              <th>推理通过率</th>
              <th>平均耗时</th>
              <th>状态评级</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in stats.topModels" :key="m.model">
              <td><b>{{ m.model }}</b></td>
              <td>{{ m.count }} 次</td>
              <td>
                <div class="rate-bar-cell">
                  <div class="mini-bar-track">
                    <div class="mini-bar-fill" :style="{ width: `${m.passRate ?? 0}%` }"></div>
                  </div>
                  <span>{{ formatPercent(m.passRate) }}</span>
                </div>
              </td>
              <td><Clock3 :size="13" /> {{ formatDuration(m.avgLatency) }}</td>
              <td>
                <span :class="['grade-tag', m.passRate == null ? '' : m.passRate >= 80 ? 'good' : (m.passRate >= 50 ? 'med' : 'bad')]">
                  {{ m.passRate == null ? '暂无实测' : m.passRate >= 80 ? '满血常驻' : (m.passRate >= 50 ? '偶见降智' : '高度疑似降智') }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 访客检测卡片流水（支持切换精细网格卡片与紧凑表格） -->
    <section class="stats-section">
      <div class="section-head-with-tools">
        <div>
          <h2><Activity :size="20" /> 现场动态流水与测试结果</h2>
          <p>记录每一次访客调用的最终结果、内联画作预览、Token 消耗与耗时。</p>
        </div>

        <div class="view-mode-toggle">
          <button
            type="button"
            :class="{ active: listMode === 'grid' }"
            title="查看鹈鹕骑行（详细卡片）"
            @click="listMode = 'grid'"
          >
            <LayoutGrid :size="13" /> 详细卡片
          </button>
          <button
            type="button"
            :class="{ active: listMode === 'table' }"
            title="查看糖果测试答卷流水"
            @click="listMode = 'table'"
          >
            <ListFilter :size="13" /> 糖果测试
          </button>
        </div>
      </div>

      <!-- 模式 1：带画面的独立卡片网格（与用户截图完全一致的样式） -->
      <div v-if="listMode === 'grid'" class="stats-cards-grid">
        <article
          v-for="run in stats.recentRuns.filter(r => r.benchmark === 'pelican')"
          :key="run.id"
          class="stats-visitor-card"
          @click="openDetail(run)"
        >
          <!-- 卡片上方预览（鹈鹕动画） -->
          <div class="card-art-box">
            <ArtworkFrame
              v-if="run.html"
              :html="run.html"
              :title="run.code"
              :preview-src="'/api/gallery/' + encodeURIComponent(run.id) + '/preview'"
            />
            <div v-else class="card-empty-placeholder">
              <span>无矢量画面</span>
            </div>
            <div :class="['card-ribbon', verdictClass(run.verdict)]">
              {{ verdictText(run.verdict) }}
            </div>
          </div>

          <div class="card-body">
            <div class="card-row-top">
              <b>{{ run.visitorAlias }}</b>
              <span :class="['status-chip', verdictClass(run.verdict)]">
                {{ verdictText(run.verdict) }}
              </span>
            </div>

            <div class="card-row-sub">
              <span>{{ run.model }}</span>
              <span class="effort-tag">{{ run.effort }}</span>
              <span v-if="run.source" class="source-tag">来源 {{ run.source }}</span>
              <span class="card-time">{{ formatDate(run.time).split(' ')[1] }}</span>
            </div>

            <div class="card-stats-row">
              <div><small>输入 Token</small><b>{{ run.inputTokens ?? '—' }}</b></div>
              <div><small>输出 Token</small><b>{{ run.outputTokens ?? '—' }}</b></div>
              <div><small>耗时</small><b>{{ formatDuration(run.latencyMs) }}</b></div>
              <div><small>记录费用</small><b>{{ run.cost ?? '—' }}</b></div>
            </div>

            <div class="card-actions">
              <button class="action-btn" type="button" @click.stop="openDetail(run)">查看作品与源码</button>
              <button class="action-btn" type="button" @click.stop="openReport(run)">战报</button>
            </div>
          </div>
        </article>
      </div>

      <!-- 模式 2：糖果测试答卷卡片（融入到此处） -->
      <div v-else class="stats-cards-grid">
        <article
          v-for="run in stats.recentRuns.filter(r => r.benchmark === 'candy')"
          :key="run.id"
          class="stats-visitor-card"
          @click="openDetail(run)"
        >
          <!-- 糖果答卷窗口 -->
          <div class="card-art-box">
            <div class="card-candy-box">
              <div class="candy-label">糖果测试 · 推理答卷</div>
              <pre class="candy-text">{{ run.answerText }}</pre>
            </div>
            <div :class="['card-ribbon', verdictClass(run.verdict)]">
              {{ verdictText(run.verdict) }}
            </div>
          </div>

          <div class="card-body">
            <div class="card-row-top">
              <b>{{ run.visitorAlias }}</b>
              <span :class="['status-chip', verdictClass(run.verdict)]">
                {{ verdictText(run.verdict) }}
              </span>
            </div>

            <div class="card-row-sub">
              <span>{{ run.model }}</span>
              <span class="effort-tag">{{ run.effort }}</span>
              <span v-if="run.source" class="source-tag">来源 {{ run.source }}</span>
              <span class="card-time">{{ formatDate(run.time).split(' ')[1] }}</span>
            </div>

            <div class="card-stats-row">
              <div><small>输入 Token</small><b>{{ run.inputTokens ?? '—' }}</b></div>
              <div><small>输出 Token</small><b>{{ run.outputTokens ?? '—' }}</b></div>
              <div><small>推导耗时</small><b>{{ formatDuration(run.latencyMs) }}</b></div>
              <div><small>记录费用</small><b>{{ run.cost ?? '—' }}</b></div>
            </div>

            <div class="card-actions">
              <button class="action-btn" type="button" @click.stop="openDetail(run)">查看完整答卷</button>
              <button class="action-btn" type="button" @click.stop="openReport(run)">战报</button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </section>

  <!-- 放大作品详情与源码弹窗 -->
  <ArtworkDetailModal
    v-if="activeDetailItem"
    :item="activeDetailItem"
    @close="activeDetailItem = null"
    @report="openReport"
  />

  <!-- 战报导出弹窗 -->
  <ReportModal
    v-if="activeReportItem"
    :item="activeReportItem"
    @close="activeReportItem = null"
  />
</template>

<style scoped>
.stats-shell {
  display: flex;
  flex-direction: column;
  gap: 36px;
  margin-top: 24px;
}
.metric-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.tile {
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.tile:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
}
.tile-icon {
  color: var(--ink);
  margin-bottom: 8px;
}
.tile-meta span {
  font-size: 0.82rem;
  color: var(--ink-soft);
}
.tile-meta b {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 2.1rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.1;
  margin: 4px 0 6px;
}
.tile-sub {
  font-size: 0.72rem;
  color: var(--ink-soft);
}
.tile.highlight-green {
  background: #f8fafc;
}
.tile.highlight-yellow {
  background: #f8fafc;
}

.stats-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.section-head h2, .section-head-with-tools h2 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-head p, .section-head-with-tools p {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: var(--ink-soft);
}
.section-head-with-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.view-mode-toggle {
  display: inline-flex;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 3px;
  gap: 2px;
}
.view-mode-toggle button {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s ease;
}
.view-mode-toggle button.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.table-card {
  background: white;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}
.data-table th {
  background: #f8fafc;
  padding: 12px 18px;
  font-weight: 600;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
}
.data-table td {
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
}
.rate-bar-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.mini-bar-track {
  width: 120px;
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.mini-bar-fill {
  height: 100%;
  background: #0f172a;
  border-radius: 999px;
}
.grade-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}
.grade-tag.good {
  background: #dcfce7;
  color: #15803d;
}
.grade-tag.med {
  background: #fef3c7;
  color: #b45309;
}
.grade-tag.bad {
  background: #fee2e2;
  color: #b91c1c;
}

/* 4列访客卡片网格（与用户截图完全一致的样式） */
.stats-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.stats-visitor-card {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.stats-visitor-card:hover {
  transform: translateY(-2px);
  border-color: #94a3b8;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
}
.card-art-box {
  position: relative;
  height: auto;
  aspect-ratio: var(--artwork-preview-ratio);
  overflow: hidden;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
}
.card-empty-placeholder {
  height: 100%;
  display: grid;
  place-items: center;
  background: #f8fafc;
  color: #94a3b8;
  font-size: 0.75rem;
}
.card-candy-box {
  height: 100%;
  padding: 12px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
}
.candy-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #334155;
  margin-bottom: 4px;
}
.candy-text {
  margin: 0;
  font-family: inherit;
  font-size: 0.75rem;
  line-height: 1.45;
  color: #64748b;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: hidden;
  flex: 1;
}
.card-ribbon {
  position: absolute;
  right: -24px;
  top: 10px;
  transform: rotate(45deg);
  width: 80px;
  text-align: center;
  font-size: 0.62rem;
  font-weight: 700;
  color: white;
  z-index: 5;
}
.card-ribbon.pass {
  background: #16a34a;
}
.card-ribbon.fail {
  background: #dc2626;
}
.card-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-row-top b {
  font-size: 0.92rem;
  color: #0f172a;
}
.status-chip {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
}
.status-chip.pass {
  background: #dcfce7;
  color: #166534;
}
.status-chip.fail {
  background: #fee2e2;
  color: #991b1b;
}
.card-row-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
  color: #64748b;
}
.effort-tag {
  background: #e2e8f0;
  color: #334155;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.68rem;
  font-weight: 600;
}
.source-tag {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.68rem;
}
.card-time {
  margin-left: auto;
  font-family: 'IBM Plex Mono', monospace;
}
.card-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  background: #f8fafc;
  padding: 8px 6px;
  border-radius: 4px;
  border: 1px solid #f1f5f9;
}
.card-stats-row div {
  display: flex;
  flex-direction: column;
}
.card-stats-row small {
  font-size: 0.62rem;
  color: #94a3b8;
  white-space: nowrap;
}
.card-stats-row b {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #0f172a;
}
.card-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}
.action-btn {
  flex: 1;
  padding: 5px 6px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  font-size: 0.72rem;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
  transition: all 0.15s ease;
}
.action-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

/* 紧凑单行表格 */
.recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.recent-item {
  background: white;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 12px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.recent-item:hover {
  background: #f8fafc;
}
.recent-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.recent-alias {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
}
.recent-source {
  font-size: 0.72rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 1px 6px;
  border-radius: 3px;
  color: #64748b;
}
.tokens-pill {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  color: #64748b;
  background: #f8fafc;
  padding: 2px 6px;
  border-radius: 4px;
}
.cost-pill {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.75rem;
  font-weight: 700;
  color: #0f172a;
}
.recent-code {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  color: var(--ink);
  font-size: 0.85rem;
}
.recent-type {
  font-size: 0.78rem;
  background: #f1f5f2;
  padding: 2px 8px;
  border-radius: 4px;
}
.recent-model {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink);
}
.recent-right {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 0.8rem;
  color: var(--ink-soft);
}

@media (max-width: 1100px) {
  .stats-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .metric-tiles {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 700px) {
  .stats-cards-grid {
    grid-template-columns: 1fr;
  }
  .metric-tiles {
    grid-template-columns: 1fr;
  }
}
</style>
