export interface Verdict {
  is_flood?: boolean
  is_outdoor_street?: boolean
  looks_staged_or_stock?: boolean
  water_depth_hint?: string
  reason?: string
}

export interface ReportProperties {
  id: number
  created_at: number
  status: string
  depth_cm: number | null
  uncertainty_cm: number | null
  verdict: Verdict
}

export interface ReportFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: ReportProperties
}

export interface DetectedObject {
  type: string
  confidence: number | null
  depth_cm: number | null
  reason: string
}

export interface Measurement {
  overlay: string
  water_found: boolean
  objects: DetectedObject[]
  depth_cm: number | null
  uncertainty_cm: number | null
}

export interface ReportResult {
  id: number
  status: string
  duplicate_of: number | null
  verdict: Verdict
  measurement: Measurement
}

export async function fetchMap(): Promise<ReportFeature[]> {
  const res = await fetch('/api/map')
  if (!res.ok) throw new Error('Could not load the map')
  return (await res.json()).features
}

export async function submitReport(photo: File, lat: number, lng: number): Promise<ReportResult> {
  const body = new FormData()
  body.append('photo', photo)
  body.append('lat', String(lat))
  body.append('lng', String(lng))
  const res = await fetch('/api/reports', { method: 'POST', body })
  if (!res.ok) throw new Error('Report failed')
  return res.json()
}

// Colour by danger. Unmeasured floods are grey: we know there is water, not how deep.
export function depthColour(depthCm: number | null): string {
  if (depthCm === null) return '#64748b'
  if (depthCm < 20) return '#22c55e'
  if (depthCm < 50) return '#eab308'
  if (depthCm < 90) return '#f97316'
  return '#dc2626'
}
