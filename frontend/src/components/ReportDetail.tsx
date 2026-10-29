import { useQuery } from '@tanstack/react-query'
import { Maximize2, X } from 'lucide-react'
import { useState } from 'react'
import { fetchEvidence, imageUrl, type Evidence } from '../api'
import { bandFor, depthColour, reportDepth, sinceLabel } from '../lib/depth'
import { StaffGauge } from './StaffGauge'
import { STATUS, WheelZoom } from './SurveyLog'
import { Label, Readouts, Spinner, Tag, toneClasses, type Tone } from './ui'

function Figure({ src, caption, onOpen }: { src: string; caption: string; onOpen: () => void }) {
  return (
    <figure className="min-w-0">
      <button onClick={onOpen} className="group relative block w-full overflow-hidden rounded-md border border-line bg-ink" aria-label={`Enlarge: ${caption}`}>
        <img src={src} alt={caption} className="aspect-[4/3] w-full object-cover" loading="lazy" />
        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded bg-ink/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 size={12} />
        </span>
      </button>
      <figcaption className="mt-1.5 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">{caption}</figcaption>
    </figure>
  )
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink/80 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <img src={src} alt="Evidence" className="max-h-full max-w-full rounded-md" />
      <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink">
        <X size={16} />
      </button>
    </div>
  )
}

function Body({ d }: { d: Evidence }) {
  const [zoomed, setZoomed] = useState<string | null>(null)
  const ev = d.evidence
  const rd = reportDepth({
    id: d.id, created_at: d.created_at, status: d.status, depth_cm: d.depth_cm, uncertainty_cm: d.uncertainty_cm, verdict: d.verdict,
  })
  const s = STATUS[d.status] ?? { label: d.status, tone: 'neutral' as Tone, text: '' }
  const band = bandFor(rd.value)
  const photo = imageUrl(d.id, 'photo')
  const usable = ev?.wheels.filter((w) => w.depth_cm !== null).length ?? 0

  return (
    <div className="space-y-4">
      {rd.value !== null && (
        <div className="flex items-center gap-4">
          <StaffGauge depth={rd.value} uncertainty={rd.uncertainty ?? 0} visual={rd.kind === 'visual'} />
          <div className="min-w-0">
            <Label>{rd.kind === 'visual' ? 'Visual estimate' : 'Measured depth'}</Label>
            <p className="mt-1 font-mono text-[40px] font-semibold leading-none tracking-tight" style={{ color: depthColour(rd.value) }}>
              {rd.kind === 'visual' ? `${Math.round(rd.low ?? 0)}–${Math.round(rd.high ?? 0)}` : Math.round(rd.value)}
            </p>
            <p className="mt-1 font-mono text-[12.5px] text-ink-3">{rd.kind === 'visual' ? 'cm, by eye' : `± ${Math.round(rd.uncertainty ?? 0)} cm`}</p>
            {band && <p className="mt-2 text-[13px] text-ink-2">About {band.label.replace('+', '')}-deep on an adult.</p>}
          </div>
        </div>
      )}

      <div className={`rounded-lg px-3 py-2 text-[12.5px] leading-snug ${toneClasses(s.tone)}`}>
        <span className="font-semibold">{s.label}.</span> {s.text}
      </div>

      {d.has_photo ? (
        <section>
          <Label className="mb-2">The photos behind this reading</Label>
          <div className="grid grid-cols-2 gap-2">
            <Figure src={photo} caption="Submitted photo" onOpen={() => setZoomed(photo)} />
            {d.has_overlay && <Figure src={imageUrl(d.id, 'overlay')} caption="Water + wheels found" onOpen={() => setZoomed(imageUrl(d.id, 'overlay'))} />}
          </div>
        </section>
      ) : (
        <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] leading-snug text-ink-3">
          {d.demo ? 'Demo report: it has no photo behind it.' : 'No photo is stored for this report.'}
        </p>
      )}

      {ev && ev.wheels.length > 0 && d.has_photo && (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <Label>Wheel geometry</Label>
            <span className="font-mono text-[11px] text-ink-3">
              {usable} of {ev.wheels.length} usable
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ev.wheels.map((w, i) => (
              <div key={i} className="min-w-0">
                <WheelZoom photo={photo} size={[ev.width, ev.height]} wheel={w} />
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="font-mono text-[10.5px] text-ink-3">W{i + 1}</span>
                  {w.depth_cm !== null ? (
                    <span className="font-mono text-[11.5px] font-semibold text-ink">
                      {Math.round(w.depth_cm)}±{Math.round(w.uncertainty_cm ?? 0)}
                    </span>
                  ) : (
                    <span className="font-mono text-[10.5px] text-ink-4">skipped</span>
                  )}
                </div>
                {w.depth_cm === null && <p className="text-[10.5px] leading-tight text-ink-3">{w.reason}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {ev && (
        <Readouts
          items={[
            { label: 'Water in frame', value: <span className="font-mono">{ev.water.coverage_pct}%</span> },
            {
              label: 'Visual check',
              value: d.verdict.depth_cm_low != null ? <span className="font-mono">{Math.round(d.verdict.depth_cm_low)}–{Math.round(d.verdict.depth_cm_high ?? 0)} cm</span> : '—',
              hint: d.verdict.depth_reference ?? undefined,
            },
            { label: 'Agreement', value: ev.cross_check === 'unavailable' ? '—' : ev.cross_check === 'agree' ? 'Geometry agrees' : 'Disagrees' },
            { label: 'Photo metadata', value: ev.exif.has_taken_at || ev.exif.has_gps ? 'Checked' : 'None' },
          ]}
        />
      )}

      {d.verdict.reason && <p className="border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-2">{d.verdict.reason}</p>}
      {zoomed && <Lightbox src={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  )
}

export function ReportDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({ queryKey: ['evidence', id], queryFn: () => fetchEvidence(id), staleTime: 60_000 })
  return (
    <section className="enter rounded-xl border border-line bg-sunken p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label>Report #{id}</Label>
          <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">{q.data?.place ?? (q.isLoading ? 'Loading…' : 'Unnamed location')}</p>
          {q.data && (
            <p className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
              {sinceLabel(q.data.created_at)}
              {q.data.demo && <Tag>demo</Tag>}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Close report" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-line-2 hover:text-ink">
          <X size={16} />
        </button>
      </div>
      {q.isLoading && (
        <p className="flex items-center gap-2 py-6 text-[13px] text-ink-3">
          <Spinner /> Loading evidence…
        </p>
      )}
      {q.isError && <p className="text-[13px] text-bad">Could not load this report.</p>}
      {q.data && <Body d={q.data} />}
    </section>
  )
}
