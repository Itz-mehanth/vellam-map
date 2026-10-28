import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { depthColour, type Alert, type ReportFeature } from '../api'
import { Badge, type Tone } from './ui'

const CHENNAI: [number, number] = [13.0827, 80.2707]

/** Fallback colour for reports with only a visual estimate: the midpoint of Muse Spark's range. */
function visualMid(p: ReportFeature['properties']): number | null {
  const { depth_cm_low: lo, depth_cm_high: hi } = p.verdict
  return p.status === 'flood_visual_estimate' && lo != null && hi != null ? (lo + hi) / 2 : null
}

/** Reports fade as they age, so a stale one is never mistaken for a current reading. */
function freshness(createdAt: number): number {
  const hours = (Date.now() / 1000 - createdAt) / 3600
  return hours < 6 ? 1 : hours < 24 ? 0.7 : 0.4
}

function ageLabel(createdAt: number): string {
  const min = Math.max(0, Math.round((Date.now() / 1000 - createdAt) / 60))
  return min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`
}

function shareAlert(a: Alert) {
  const text = `${a.message}\nVia Vellam Map. Estimates only, follow official flood warnings.`
  if (navigator.share) navigator.share({ title: 'Flood alert', text }).catch(() => {})
  else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}

function Legend() {
  const items: [string, string][] = [
    ['< 20 cm', '#22c55e'],
    ['20–50', '#eab308'],
    ['50–90', '#f97316'],
    ['90+', '#dc2626'],
    ['Unmeasured', '#64748b'],
    ['Dashed = visual guess', '#94a3b8'],
  ]
  return (
    <div className="absolute bottom-4 left-4 right-4 z-[1000] flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-white/95 px-3 py-2 text-xs shadow ring-1 ring-slate-200 sm:right-auto">
      {items.map(([label, colour]) => (
        <span key={label} className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
          {label}
        </span>
      ))}
    </div>
  )
}

function FlyTo({ center }: { center?: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.flyTo(center, 15, { duration: 0.8 })
  }, [center, map])
  return null
}

const LEVEL: Record<Alert['level'], { tone: Tone; bar: string; label: string }> = {
  danger: { tone: 'red', bar: 'bg-red-600', label: 'Danger' },
  high: { tone: 'amber', bar: 'bg-orange-500', label: 'High' },
  caution: { tone: 'amber', bar: 'bg-yellow-400', label: 'Caution' },
  low: { tone: 'green', bar: 'bg-green-500', label: 'Low' },
  info: { tone: 'slate', bar: 'bg-slate-400', label: 'Info' },
}

export function AlertsPanel({ alerts, onPick }: { alerts: Alert[]; onPick: (at: [number, number]) => void }) {
  return (
    <aside className="space-y-2 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
      <h2 className="text-sm font-semibold">Area alerts</h2>
      {alerts.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white/60 p-4 text-sm text-slate-500">
          No active alerts. Reports from the last 6 hours appear here, grouped by area.
        </p>
      )}
      {alerts.map((a, i) => (
        <div key={i} className="flex w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300">
          <span className={`w-1.5 shrink-0 ${LEVEL[a.level].bar}`} />
          <button onClick={() => onPick([a.lat, a.lng])} className="min-w-0 flex-1 p-3 text-left">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">{a.title}</span>
              <Badge tone={LEVEL[a.level].tone}>{LEVEL[a.level].label}</Badge>
            </span>
            <span className="mt-0.5 block truncate text-sm text-slate-600">{a.place}</span>
            <span className="mt-1 block text-xs text-slate-400">
              {a.max_depth_cm !== null && `up to ~${Math.round(a.max_depth_cm)} cm · `}
              {a.reports} report{a.reports !== 1 && 's'} · {a.latest_age_min} min ago
              {a.corroborated && ' · corroborated'}
              {a.demo && ' · demo data'}
            </span>
          </button>
          <button
            onClick={() => shareAlert(a)}
            title="Share this alert"
            aria-label="Share this alert"
            className="shrink-0 border-l border-slate-100 px-3 text-slate-400 hover:bg-slate-50 hover:text-blue-600"
          >
            ↗
          </button>
        </div>
      ))}
    </aside>
  )
}

export function FloodMap({ reports, center }: { reports: ReportFeature[]; center?: [number, number] }) {
  return (
    <div className="relative h-[60vh] min-h-[420px] overflow-hidden rounded-xl border border-slate-200 shadow-sm lg:h-[calc(100vh-9rem)]">
      <MapContainer center={CHENNAI} zoom={12} className="h-full w-full">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FlyTo center={center} />
        {reports.map((f) => {
          const p = f.properties
          const [lng, lat] = f.geometry.coordinates
          const mid = visualMid(p)
          return (
            <CircleMarker
              key={p.id}
              center={[lat, lng]}
              radius={13}
              pathOptions={
                mid !== null
                  ? { color: depthColour(mid), weight: 3, dashArray: '4 3', fillColor: depthColour(mid), fillOpacity: 0.25 * freshness(p.created_at), opacity: freshness(p.created_at) }
                  : { color: '#fff', weight: 2, fillColor: depthColour(p.depth_cm), fillOpacity: 0.9 * freshness(p.created_at), opacity: freshness(p.created_at) }
              }
            >
              <Popup>
                <b>
                  {mid !== null
                    ? `Visual guess ${Math.round(p.verdict.depth_cm_low ?? 0)}–${Math.round(p.verdict.depth_cm_high ?? 0)} cm`
                    : p.depth_cm === null
                      ? 'Flooded, depth unknown'
                      : `~${Math.round(p.depth_cm)} ± ${Math.round(p.uncertainty_cm ?? 0)} cm`}
                </b>
                {p.place && (
                  <>
                    <br />
                    {p.place}
                  </>
                )}
                <br />
                {ageLabel(p.created_at)} · {new Date(p.created_at * 1000).toLocaleString()}
                {p.demo && (
                  <>
                    <br />
                    <b style={{ color: '#b45309' }}>Demo data</b>
                  </>
                )}
                <br />
                <span className="text-xs text-slate-500">Estimate only. Follow official warnings.</span>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
      <Legend />
    </div>
  )
}
