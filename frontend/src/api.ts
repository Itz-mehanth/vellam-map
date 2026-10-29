export interface Verdict {
  is_flood?: boolean
  is_outdoor_street?: boolean
  looks_staged_or_stock?: boolean
  is_puddle_or_splash?: boolean
  water_depth_hint?: string
  depth_cm_low?: number | null
  depth_cm_high?: number | null
  depth_reference?: string | null
  reason?: string
}

export const API = import.meta.env.VITE_API_BASE ?? ''

export interface ReportProperties {
  id: number
  created_at: number
  status: string
  depth_cm: number | null
  uncertainty_cm: number | null
  verdict: Verdict
  place?: string | null
  demo?: boolean
  has_evidence?: boolean
}

export interface ReportFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: ReportProperties
}

// ---- Pipeline stage events (streamed from POST /api/reports/stream) ----

export interface ExifInfo {
  has_taken_at: boolean
  age_hours: number | null
  stale: boolean
  has_gps: boolean
  distance_km: number | null
  mismatch: boolean
}

export interface IntakeData {
  exif: ExifInfo
  width: number
  height: number
  kb: number
  phash: string
  duplicate_of: number | null
  lat: number
  lng: number
}

export interface WaterData {
  found: boolean
  instances: number
  prompt?: string
  coverage_pct: number
  confidence: number | null
  overlay: string
}

export interface ObjectsData {
  prompts: { type: string; prompt: string; count: number }[]
  objects: { type: string; box: number[]; confidence: number | null }[]
  overlay: string
}

export interface WheelRecord {
  type: string
  box: number[]
  confidence: number | null
  depth_cm: number | null
  uncertainty_cm: number | null
  reason: string
  waterline_y?: number
  rim_points?: number
  rim_sample?: [number, number][]
  circle?: { cx: number; cy: number; r: number }
  cm_per_px?: number
}

export interface GeometryData {
  wheels: WheelRecord[]
}

export interface FusionData {
  inputs: { type: string; depth_cm: number; uncertainty_cm: number; weight: number }[]
  depth_cm: number | null
  uncertainty_cm: number | null
}

export interface VerifyData {
  exif: ExifInfo
  verdict: Verdict
  duplicate_of: number | null
  cross_check: 'agree' | 'disagree' | 'unavailable'
}

export interface ResultData {
  id: number
  place?: string | null
  verdict?: Verdict
  status: string
  depth_cm: number | null
  uncertainty_cm: number | null
  total_ms: number
}

export interface StageDataMap {
  intake: IntakeData
  water: WaterData
  objects: ObjectsData
  geometry: GeometryData
  fusion: FusionData
  verify: VerifyData
  result: ResultData
}

export type StageId = keyof StageDataMap
export const STAGE_ORDER: StageId[] = ['intake', 'water', 'objects', 'geometry', 'fusion', 'verify', 'result']

export type StageEvents = { [K in StageId]?: { ms: number; data: StageDataMap[K] } }

export async function fetchMap(): Promise<ReportFeature[]> {
  const res = await fetch(`${API}/api/map`)
  if (!res.ok) throw new Error('Could not load the map')
  return (await res.json()).features
}

/** Posts a photo and calls onEvent for every pipeline stage as the server finishes it. */
export async function streamReport(
  photo: File,
  lat: number,
  lng: number,
  onEvent: <K extends StageId>(stage: K, ms: number, data: StageDataMap[K]) => void,
): Promise<void> {
  const body = new FormData()
  body.append('photo', photo)
  body.append('lat', String(lat))
  body.append('lng', String(lng))
  const res = await fetch(`${API}/api/reports/stream`, { method: 'POST', body })
  if (!res.ok || !res.body) throw new Error(res.status === 400 ? 'That file is not a valid image' : 'Report failed')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const ev = JSON.parse(line)
      if (ev.stage === 'error') throw new Error(ev.data.message)
      onEvent(ev.stage, ev.ms, ev.data)
    }
  }
}

export { depthColour } from './lib/depth'

// ---- Alerts and Q&A ----

export interface Alert {
  level: 'danger' | 'high' | 'caution' | 'low' | 'info'
  title: string
  place: string
  lat: number
  lng: number
  reports: number
  corroborated: boolean
  max_depth_cm: number | null
  latest_age_min: number
  message: string
  demo: boolean
}

export async function fetchAlerts(): Promise<Alert[]> {
  const res = await fetch(`${API}/api/alerts`)
  if (!res.ok) throw new Error('Could not load alerts')
  return (await res.json()).alerts
}

export interface AskResult {
  question: string
  transcribed: boolean
  answer: string
  sources: { id: number; place: string; depth_cm: number | null; source: string; age_min: number; lat: number; lng: number }[]
  reports_considered: number
}

export async function ask(input: { audio?: Blob; question?: string; language?: string; lat?: number; lng?: number }): Promise<AskResult> {
  const body = new FormData()
  if (input.audio) body.append('audio', input.audio, 'question.wav')
  if (input.question) body.append('question', input.question)
  if (input.language) body.append('language', input.language)
  if (input.lat !== undefined && input.lng !== undefined) {
    body.append('lat', String(input.lat))
    body.append('lng', String(input.lng))
  }
  const res = await fetch(`${API}/api/ask`, { method: 'POST', body })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? 'Could not answer')
  return res.json()
}

// ---- Evidence behind a published report ----

export interface Evidence {
  id: number
  created_at: number
  status: string
  place: string | null
  lat: number
  lng: number
  depth_cm: number | null
  uncertainty_cm: number | null
  verdict: Verdict
  demo: boolean
  has_photo: boolean
  has_overlay: boolean
  evidence: {
    width: number
    height: number
    water: { coverage_pct: number; prompt: string }
    wheels: WheelRecord[]
    fusion: { depth_cm: number; uncertainty_cm: number; weight: number }[]
    cross_check: 'agree' | 'disagree' | 'unavailable'
    exif: ExifInfo
  } | null
}

export async function fetchEvidence(id: number): Promise<Evidence> {
  const res = await fetch(`${API}/api/reports/${id}/evidence`)
  if (!res.ok) throw new Error('Could not load this report')
  return res.json()
}

export const imageUrl = (id: number, kind: 'photo' | 'overlay') => `${API}/api/reports/${id}/${kind}.jpg`
