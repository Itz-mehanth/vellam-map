import type { StageEvents } from '../api'

/** Names for the five ground-truth levels, as we read the dataset's examples. */
export const LEVEL_NAMES = ['Not in the water', 'Water at the tyres', 'Wheel arch to doors', 'Up to the windows', 'Roof level']
export const LEVEL_SHORT = ['Clear', 'Tyres', 'Doors', 'Windows', 'Roof']

export type MethodId = 'visual' | 'geometry' | 'combined'

export interface MethodStats {
  n: number
  of: number
  spearman: number | null
  exact: number | null
  within1: number | null
  monotonic: boolean | null
  median_by_level: (number | null)[]
  confusion: number[][]
}

export interface BenchPhoto {
  id: string
  file: string
  level: number
  geometry_cm: number | null
  geometry_unc: number | null
  usable_wheels: number
  wheels: number
  visual_lo: number | null
  visual_hi: number | null
  visual_mid: number | null
  is_flood: boolean | null
  status: string | null
  images: boolean
  width: number
  height: number
  error?: string
}

export interface BenchIndex {
  meta: {
    dataset: string
    dataset_url: string
    dataset_license: string
    dataset_author: string
    per_level: number
    seed: number
    n: number
    level_edges_cm: number[]
    generated_at: string
  }
  metrics: {
    n: number
    errors: number
    per_level: { level: number; n: number; geometry_n: number; visual_n: number }[]
    methods: Record<MethodId, MethodStats>
  }
  photos: BenchPhoto[]
}

export async function fetchBenchmark(): Promise<BenchIndex | null> {
  const res = await fetch('/benchmark/index.json')
  if (!res.ok) return null
  // A single-page host answers unknown paths with index.html, so check that this really is JSON.
  if (!(res.headers.get('content-type') ?? '').includes('json')) return null
  return res.json()
}

export interface RecordedRun {
  width: number
  height: number
  events: StageEvents
}

/** A photo's recorded pipeline stages, turned into the shape the live survey log renders. */
export async function fetchRecordedRun(id: string): Promise<RecordedRun> {
  const res = await fetch(`/benchmark/photos/${id}.json`)
  if (!res.ok) throw new Error('This photo has no recorded run')
  const raw = (await res.json()) as { width: number; height: number; events: { stage: string; ms: number; data: unknown }[] }
  const events: Record<string, { ms: number; data: unknown }> = {}
  for (const e of raw.events) events[e.stage] = { ms: e.ms, data: e.data }
  return { width: raw.width, height: raw.height, events: events as StageEvents }
}

export const photoUrl = (id: string) => `/benchmark/img/${id}.jpg`

/** The level a depth falls in, using the run's thresholds. */
export function levelOf(depthCm: number, edges: number[]): number {
  return edges.filter((e) => depthCm >= e).length
}

/** Small deterministic offset so dots in a strip chart do not sit exactly on top of each other. */
export function jitter(id: string, spread: number): number {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ((h % 1000) / 1000 - 0.5) * 2 * spread
}
