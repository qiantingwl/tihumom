export type BenchmarkType = 'pelican' | 'candy' | 'custom'
export type TestMode = 'benchmark' | 'random' | 'candy' | 'custom'
export type TaskStatus = 'queued' | 'connecting' | 'generating' | 'checking' | 'completed' | 'failed'
export type ReasoningEffort = 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export interface InspectionItem {
  name: string
  passed: boolean
  status?: 'passed' | 'failed' | 'unknown'
  detail: string
}

export interface TestResult {
  previewImage?: string
  verdict?: 'passed' | 'failed'
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  cost?: string
  origin?: 'measured' | 'imported' | 'demo'
  html?: string
  answerText?: string
  title: string
  analysis?: string
  inspections?: InspectionItem[]
}

export interface TestTask {
  id: string
  code: string
  benchmark: BenchmarkType
  status: TaskStatus
  progress: number
  message: string
  createdAt: string
  generation?: {
    outputChars: number
    reasoningChars: number
    receivedBytes: number
    elapsedMs: number
    buffering?: boolean
  }
  completedAt?: string
  input: {
    demo: boolean
    endpoint?: string
    model: string
    benchmark?: BenchmarkType
    mode: TestMode
    effort: ReasoningEffort
    source?: string
    visitorAlias?: string
  }
  prompt: string
  result?: TestResult
  error?: string
}

export interface GalleryItem {
  previewImage?: string
  id: string
  judgmentVersion?: string
  judgmentSource?: 'automatic' | 'historical' | 'ungraded' | 'manual'
  mine?: boolean
  code: string
  title: string
  benchmark: BenchmarkType
  model: string
  mode: TestMode
  effort: ReasoningEffort
  source?: string
  visitorAlias?: string
  inputTokens?: number | null
  outputTokens?: number | null
  cost?: string
  origin?: 'measured' | 'imported' | 'demo' | 'reused'
  displayUsage?: {
    latencyMs: number
    inputTokens: number
    outputTokens: number
    cost: string
    fieldSources: Record<'latencyMs' | 'inputTokens' | 'outputTokens' | 'cost', 'reused' | 'simulated'>
  }
  verdict?: 'passed' | 'failed'
  createdAt: string
  latencyMs: number | null
  html?: string
  answerText?: string
  published: boolean
  likes: number
  abstracts: number
  fails: number
  prompt?: string
  analysis?: string
  inspections?: InspectionItem[]
}

export interface SuspiciousSample {
  id: string
  code?: string
  title: string
  type: string
  date: string
  model: string
  benchmark?: string
  html?: string
  answerText?: string
  previewImage?: string
  summary: string
  evidence: string
  prompt: string
  outputPreview: string
}

export interface DanmakuMessage {
  id: number
  text: string
  createdAt: string
}

export interface StatsOverview {
  totalRuns: number
  publicWorks: number
  pelicanCount: number
  candyCount: number
  pelicanPassRate: number | null
  candyPassRate: number | null
  avgLatencyPelican: number | null
  avgLatencyCandy: number | null
  topModels: { model: string; count: number; passRate: number | null; avgLatency: number | null }[]
  recentRuns: {
    id: string
    code: string
    title?: string
    benchmark: string
    model: string
    effort?: ReasoningEffort
    source?: string
    visitorAlias?: string
    inputTokens?: number | null
    outputTokens?: number | null
    cost?: string
    status: string
    verdict?: 'passed' | 'failed'
    latencyMs: number | null
    time: string
    html?: string
    answerText?: string
    likes?: number
    abstracts?: number
    fails?: number
    prompt?: string
  }[]
}
