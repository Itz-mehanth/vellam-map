import type { ReportProperties } from '../api'

export interface Band {
  key: 'ankle' | 'knee' | 'thigh' | 'waist'
  label: string
  range: string
  max: number
  colour: string
}

// Named in body terms people use under stress, not only numbers.
export const BANDS: Band[] = [
  { key: 'ankle', label: 'Ankle', range: '< 20 cm', max: 20, colour: '#3fa79a' },
  { key: 'knee', label: 'Knee', range: '20–50', max: 50, colour: '#d9a62e' },
  { key: 'thigh', label: 'Thigh', range: '50–90', max: 90, colour: '#e2703a' },
  { key: 'waist', label: 'Waist+', range: '90+', max: Infinity, colour: '#c42f3b' },
]

export const UNKNOWN_COLOUR = '#8c959d'

export function bandFor(depthCm: number | null): Band | null {
  if (depthCm === null) return null
  return BANDS.find((b) => depthCm < b.max) ?? BANDS[BANDS.length - 1]
}

export function depthColour(depthCm: number | null): string {
  return bandFor(depthCm)?.colour ?? UNKNOWN_COLOUR
}

export interface ReportDepth {
  value: number | null
  kind: 'measured' | 'visual' | 'none'
  uncertainty: number | null
  low?: number
  high?: number
}

/** The depth to show for a report: the geometric measurement, else Muse Spark's visual range. */
export function reportDepth(p: ReportProperties): ReportDepth {
  if (p.depth_cm !== null) return { value: p.depth_cm, kind: 'measured', uncertainty: p.uncertainty_cm }
  const { depth_cm_low: lo, depth_cm_high: hi } = p.verdict
  if (lo != null && hi != null) return { value: (lo + hi) / 2, kind: 'visual', uncertainty: (hi - lo) / 2, low: lo, high: hi }
  return { value: null, kind: 'none', uncertainty: null }
}

export function ageLabel(seconds: number): string {
  const min = Math.max(0, Math.round(seconds / 60))
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 1440) return `${Math.round(min / 60)} h ago`
  return `${Math.round(min / 1440)} d ago`
}

export function sinceLabel(unixSeconds: number): string {
  return ageLabel(Date.now() / 1000 - unixSeconds)
}

export function duration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`
}

/** Reports fade as they age, so a stale one is never mistaken for a current reading. */
export function freshness(unixSeconds: number): number {
  const hours = (Date.now() / 1000 - unixSeconds) / 3600
  return hours < 6 ? 1 : hours < 24 ? 0.7 : 0.45
}
