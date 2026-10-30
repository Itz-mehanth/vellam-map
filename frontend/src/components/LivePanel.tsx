import { ChevronDown, Share2 } from 'lucide-react'
import { useState } from 'react'
import type { Alert, ReportFeature } from '../api'
import { BANDS, ageLabel, bandFor, reportDepth, sinceLabel } from '../lib/depth'
import type { Tone } from '../lib/tone'
import { DepthPill, Label, Tag } from './ui'

const LEVEL: Record<Alert['level'], { tone: Tone; label: string; bar: string }> = {
  danger: { tone: 'bad', label: 'Danger', bar: BANDS[3].colour },
  high: { tone: 'warn', label: 'High', bar: BANDS[2].colour },
  caution: { tone: 'warn', label: 'Caution', bar: BANDS[1].colour },
  low: { tone: 'ok', label: 'Low', bar: BANDS[0].colour },
  info: { tone: 'neutral', label: 'Info', bar: '#8c959d' },
}

function shareAlert(a: Alert) {
  const text = `${a.message}\nVia Vellam Map. Estimates only, follow official flood warnings.`
  if (navigator.share) navigator.share({ title: 'Flood alert', text }).catch(() => {})
  else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}

/** How the city's reports split across depth bands, as one stacked bar. */
function Situation({ reports }: { reports: ReportFeature[] }) {
  const depths = reports.map((r) => reportDepth(r.properties))
  const counts = BANDS.map((b) => depths.filter((d) => bandFor(d.value)?.key === b.key).length)
  const unknown = depths.filter((d) => d.value === null).length
  const total = reports.length
  const deepest = reports
    .map((r) => ({ r, d: reportDepth(r.properties) }))
    .filter((x) => x.d.value !== null)
    .sort((a, b) => (b.d.value ?? 0) - (a.d.value ?? 0))[0]

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Label>Situation</Label>
        <span className="font-mono text-[11px] text-ink-3">{total} reports · last 72 h</span>
      </div>
      {total === 0 ? (
        <p className="text-[13px] text-ink-3">No flood reports yet.</p>
      ) : (
        <>
          <div className="flex h-2 overflow-hidden rounded-full bg-line-2">
            {BANDS.map((b, i) => counts[i] > 0 && <span key={b.key} style={{ width: `${(counts[i] / total) * 100}%`, background: b.colour }} />)}
            {unknown > 0 && <span style={{ width: `${(unknown / total) * 100}%` }} className="bg-unknown" />}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {BANDS.map((b, i) => (
              <div key={b.key}>
                <p className="font-mono text-[18px] font-semibold leading-none text-ink">{counts[i]}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.colour }} />
                  {b.label}
                </p>
              </div>
            ))}
          </div>
          {deepest && (
            <p className="text-[12.5px] text-ink-2">
              Deepest: <span className="font-medium text-ink">{deepest.r.properties.place ?? 'unnamed location'}</span>{' '}
              <span className="font-mono">~{Math.round(deepest.d.value ?? 0)}&nbsp;cm</span> · {sinceLabel(deepest.r.properties.created_at)}
            </p>
          )}
        </>
      )}
    </section>
  )
}

export function LivePanel({
  reports,
  alerts,
  onFly,
  selectedId,
}: {
  reports: ReportFeature[]
  alerts: Alert[]
  onFly: (lat: number, lng: number, id?: number) => void
  selectedId: number | null
}) {
  const recent = [...reports].sort((a, b) => b.properties.created_at - a.properties.created_at).slice(0, 25)
  const demo = reports.some((r) => r.properties.demo)
  const [allAlerts, setAllAlerts] = useState(false)
  const shownAlerts = allAlerts ? alerts : alerts.slice(0, 4)
  return (
    <div className="space-y-6">
      {demo && (
        <p className="rounded-lg border border-warn/20 bg-warn-soft px-3 py-2 text-[12px] leading-snug text-warn">
          The map includes seeded demo reports for illustration. They are marked "demo" and are not real measurements.
        </p>
      )}
      <Situation reports={reports} />

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <Label>Area alerts</Label>
          <span className="font-mono text-[11px] text-ink-3">last 6 h · 600 m radius</span>
        </div>
        {alerts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-[13px] text-ink-3">No active alerts.</p>
        ) : (
          <ul className="divide-y divide-line-2 overflow-hidden rounded-lg border border-line">
            {shownAlerts.map((a, i) => (
              <li key={i} className="group flex items-stretch bg-surface">
                <span className="w-[3px] shrink-0" style={{ background: LEVEL[a.level].bar }} />
                <button onClick={() => onFly(a.lat, a.lng)} className="min-w-0 flex-1 px-3 py-2.5 text-left transition-colors hover:bg-sunken">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink">{a.place}</span>
                    <Tag tone={LEVEL[a.level].tone}>{LEVEL[a.level].label}</Tag>
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
                    {a.max_depth_cm !== null && `≤ ${Math.round(a.max_depth_cm)} cm · `}
                    {a.reports} {a.reports === 1 ? 'report' : 'reports'} · {ageLabel(a.latest_age_min * 60)}
                    {a.corroborated && ' · corroborated'}
                    {a.demo && ' · demo'}
                  </span>
                </button>
                <button
                  onClick={() => shareAlert(a)}
                  aria-label={`Share alert for ${a.place}`}
                  title="Share"
                  className="px-3 text-ink-4 transition-colors hover:bg-sunken hover:text-ink"
                >
                  <Share2 size={15} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {alerts.length > 4 && (
          <button
            onClick={() => setAllAlerts((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-ink-3 hover:text-ink"
          >
            {allAlerts ? 'Show fewer' : `Show all ${alerts.length}`}
            <ChevronDown size={13} className={allAlerts ? 'rotate-180' : ''} />
          </button>
        )}
      </section>

      <section>
        <Label className="mb-2">Latest reports</Label>
        <ul className="-mx-2">
          {recent.map((r) => {
            const p = r.properties
            const [lng, lat] = r.geometry.coordinates
            return (
              <li key={p.id}>
                <button
                  onClick={() => onFly(lat, lng, p.id)}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-sunken ${selectedId === p.id ? 'bg-sunken' : ''}`}
                >
                  <DepthPill depth={reportDepth(p)} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.place ?? `${lat.toFixed(3)}, ${lng.toFixed(3)}`}</span>
                  {p.status === 'flood_review' && <Tag tone="warn">review</Tag>}
                  {p.status === 'flood_unconfirmed' && <Tag tone="warn">unconfirmed</Tag>}
                  <span className="shrink-0 text-right font-mono text-[11px] leading-tight text-ink-3">
                    {sinceLabel(p.created_at)}
                    {p.demo && <span className="block text-[10px] uppercase tracking-wide text-ink-4">demo</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
