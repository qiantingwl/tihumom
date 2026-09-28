export type BenchmarkType = 'pelican' | 'candy' | 'custom'
export type TestMode = 'benchmark' | 'random' | 'candy' | 'custom'
export type TaskStatus =
  | 'queued'
  | 'connecting'
  | 'generating'
  | 'checking'
  | 'completed'
  | 'failed'
export type ReasoningEffort = 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export interface TestInput {
  demo: boolean
  benchmark?: BenchmarkType
  endpoint?: string
  apiKey?: string
  model: string
  mode: TestMode
  effort: ReasoningEffort
  source?: string
  visitorAlias?: string
}

export interface InspectionItem {
  name: string
  passed: boolean
  detail: string
}

export interface DisplayUsage {
  latencyMs: number
  inputTokens: number
  outputTokens: number
  cost: string
  fieldSources: Record<'latencyMs' | 'inputTokens' | 'outputTokens' | 'cost', 'reused' | 'simulated'>
  sourceRecordId?: string
}

export interface TestResult {
  manualAssessmentHash?: string
  originalAssessment?: Pick<TestResult, 'verdict' | 'analysis' | 'inspections' | 'judgmentVersion'>
  verdict?: 'passed' | 'failed'
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  cost?: string
  html?: string
  answerText?: string
  title: string
  previewImage?: string
  responseModel?: string | null
  judgmentVersion?: string
  origin?: 'measured' | 'imported' | 'demo'
  mine?: boolean
  artifactUrl?: string
  contentSize?: number
  deletedAt?: string
  analysis?: string
  inspections?: InspectionItem[]
}

export interface TestTask {
  id: string
  owner?: string
  code: string // e.g. "AC82"
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
  input: Omit<TestInput, 'apiKey'>
  prompt: string
  result?: TestResult
  error?: string
}

export interface GalleryItem {
  reuseSourceId?: string
  reuseBatchId?: string
  reusedAt?: string
  manualAssessmentHash?: string
  originalAssessment?: TestResult['originalAssessment']
  id: string
  code: string
  title: string
  previewImage?: string
  responseModel?: string | null
  judgmentVersion?: string
  origin?: 'measured' | 'imported' | 'demo' | 'reused'
  mine?: boolean
  artifactUrl?: string
  contentSize?: number
  deletedAt?: string
  benchmark: BenchmarkType
  model: string
  mode: TestMode
  effort: ReasoningEffort
  source?: string
  visitorAlias?: string
  inputTokens?: number | null
  outputTokens?: number | null
  cost?: string
  displayUsage?: DisplayUsage
  verdict?: 'passed' | 'failed'
  createdAt: string
  latencyMs: number
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
  title: string
  previewImage?: string
  responseModel?: string | null
  judgmentVersion?: string
  origin?: 'measured' | 'imported' | 'demo'
  mine?: boolean
  artifactUrl?: string
  contentSize?: number
  deletedAt?: string
  type: string
  date: string
  model: string
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
