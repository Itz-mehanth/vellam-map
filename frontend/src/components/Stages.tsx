import type { ReactNode } from 'react'
import {
  STAGE_ORDER,
  depthColour,
  type FusionData,
  type GeometryData,
  type IntakeData,
  type ObjectsData,
  type ResultData,
  type StageEvents,
  type StageId,
  type VerifyData,
  type WaterData,
  type WheelRecord,
} from '../api'
import { Badge, Bar, Stat, TONES, type Tone } from './ui'

const META: Record<StageId, { title: string; blurb: string }> = {
  intake: { title: 'Photo received', blurb: 'Hashing the image and checking it against earlier reports' },
  water: { title: 'Find the water', blurb: 'SAM 3.1 segments the flood surface from the prompt "water"' },
  objects: { title: 'Find reference objects', blurb: 'SAM 3.1 looks for wheels, whose real size is known' },
  geometry: { title: 'Recover the hidden wheel', blurb: 'A circle is fitted to the visible rim to find where the wheel meets the road' },
  fusion: { title: 'Combine the evidence', blurb: 'Estimates are merged, trusting the more certain ones more' },
  verify: { title: 'Verify the report', blurb: 'Muse Spark checks the photo is a real, original flood' },
  result: { title: 'Decision', blurb: 'The report is accepted, flagged or rejected' },
}

const STATUS: Record<string, { label: string; tone: Tone; text: string }> = {
  verified: { label: 'Verified', tone: 'green', text: 'Added to the live map.' },
  flood_unmeasured: {
    label: 'Flood confirmed',
    tone: 'amber',
    text: 'The flood is real, but no wheel was both visible and touching the water, so depth could not be measured.',
  },
  rejected_duplicate: { label: 'Duplicate', tone: 'red', text: 'This photo matches an earlier report, so it was not added.' },
  rejected_not_flood: { label: 'Rejected', tone: 'red', text: 'This does not look like a real, original flood photo.' },
}

const REASON_TONE = (reason: string): Tone => (reason === 'ok' ? 'green' : 'amber')

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
}

function Overlay({ src, legend }: { src: string; legend: [string, string][] }) {
  return (
    <figure>
      <img src={src} alt="Segmentation overlay" className="w-full rounded-lg ring-1 ring-slate-200" />
      <figcaption className="mt-2 flex gap-4 text-xs text-slate-500">
        {legend.map(([label, colour]) => (
          <span key={label} className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: colour }} />
            {label}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

function IntakeBody({ d }: { d: IntakeData }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Size" value={`${d.width}×${d.height}`} hint={`${d.kb} KB`} />
      <Stat label="Fingerprint" value={<code className="text-xs">{d.phash.slice(0, 8)}…</code>} hint="perceptual hash" />
      <Stat label="Duplicate" value={d.duplicate_of === null ? 'None found' : `Matches #${d.duplicate_of}`} />
      <Stat label="Location" value={`${d.lat.toFixed(3)}, ${d.lng.toFixed(3)}`} />
    </div>
  )
}

function WaterBody({ d }: { d: WaterData }) {
  return (
    <div className="space-y-3">
      <Overlay src={d.overlay} legend={[['Water surface', '#2563eb']]} />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Coverage" value={`${d.coverage_pct}%`} hint="of the frame" />
        <Stat label="Regions" value={d.instances} />
        <Stat label="Confidence" value={d.confidence !== null ? `${Math.round(d.confidence * 100)}%` : '–'} />
      </div>
      {!d.found && <p className="text-sm text-amber-700">No water detected, so reference objects are skipped.</p>}
    </div>
  )
}

function ObjectsBody({ d }: { d: ObjectsData }) {
  const max = Math.max(1, ...d.prompts.map((p) => p.count))
  return (
    <div className="space-y-3">
      <Overlay src={d.overlay} legend={[['Water', '#2563eb'], ['Wheel', '#f97316']]} />
      {d.prompts.length === 0 ? (
        <p className="text-sm text-slate-500">Skipped: no water was found.</p>
      ) : (
        <ul className="space-y-2">
          {d.prompts.map((p) => (
            <li key={p.type} className="text-sm">
              <div className="mb-1 flex justify-between">
                <span className="text-slate-700">
                  “{p.prompt}”
                </span>
                <span className={p.count ? 'font-semibold text-slate-900' : 'text-slate-400'}>{p.count} found</span>
              </div>
              <Bar pct={(p.count / max) * 100} colour={p.count ? '#f97316' : '#e2e8f0'} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Zoomed view of one wheel: the photo, the fitted circle, the waterline and the measured gap. */
function WheelZoom({ photo, size, wheel }: { photo: string; size: [number, number]; wheel: WheelRecord }) {
  const c = wheel.circle
  const [bx0, by0, bx1, by1] = wheel.box
  const r = c ? c.r : Math.max(bx1 - bx0, by1 - by0) / 2
  const cx = c ? c.cx : (bx0 + bx1) / 2
  const cy = c ? c.cy : (by0 + by1) / 2
  const pad = r * 1.9
  const sw = r * 0.045
  const id = `clip-${Math.round(cx)}-${Math.round(cy)}`
  const wl = wheel.waterline_y
  const bottom = cy + r
  const label = { fontSize: r * 0.3, fill: '#fff', stroke: '#0f172a', strokeWidth: r * 0.06, paintOrder: 'stroke' } as const
  return (
    <svg viewBox={`${cx - pad} ${cy - pad} ${pad * 2} ${pad * 2}`} className="aspect-square w-full rounded-lg bg-slate-900 ring-1 ring-slate-200">
      <image href={photo} width={size[0]} height={size[1]} />
      {c && (
        <>
          <clipPath id={id}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
          {wl !== undefined && (
            <g clipPath={`url(#${id})`}>
              <rect x={cx - r} y={wl} width={r * 2} height={r * 2} fill="#2563eb" opacity={0.4} />
            </g>
          )}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fb923c" strokeWidth={sw} strokeDasharray={`${r * 0.18} ${r * 0.1}`} />
          {wheel.rim_sample?.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={r * 0.03} fill="#fff" />
          ))}
        </>
      )}
      {!c && <rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} fill="none" stroke="#fb923c" strokeWidth={sw} />}
      {wl !== undefined && (
        <line x1={cx - pad} x2={cx + pad} y1={wl} y2={wl} stroke="#38bdf8" strokeWidth={sw} />
      )}
      {c && wl !== undefined && wheel.depth_cm !== null && (
        <g>
          <line x1={cx - r * 1.3} x2={cx - r * 0.85} y1={bottom} y2={bottom} stroke="#f87171" strokeWidth={sw} />
          <line x1={cx - r * 1.1} x2={cx - r * 1.1} y1={wl} y2={bottom} stroke="#fff" strokeWidth={sw} />
          <text x={cx - r * 1.2} y={(wl + bottom) / 2 + r * 0.1} textAnchor="end" {...label}>
            {Math.round(wheel.depth_cm)} cm
          </text>
        </g>
      )}
    </svg>
  )
}

function GeometryBody({ d, photo, size }: { d: GeometryData; photo: string; size: [number, number] }) {
  if (d.wheels.length === 0) return <p className="text-sm text-slate-500">No wheels to measure in this photo.</p>
  const usable = d.wheels.filter((w) => w.depth_cm !== null).length
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        <b className="text-slate-900">{usable}</b> of {d.wheels.length} detected wheels gave a usable measurement.
        <span className="ml-1 text-slate-400">
          depth = (road contact − waterline) × real wheel size ÷ fitted size in pixels
        </span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {d.wheels.map((w, i) => (
          <div key={i} className="space-y-1.5">
            <WheelZoom photo={photo} size={size} wheel={w} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs capitalize text-slate-500">
                {w.type.replaceAll('_', ' ')} {w.confidence !== null && `· ${Math.round(w.confidence * 100)}%`}
              </span>
              {w.depth_cm !== null ? (
                <Badge tone="green">
                  {Math.round(w.depth_cm)} ± {Math.round(w.uncertainty_cm ?? 0)} cm
                </Badge>
              ) : (
                <Badge tone={REASON_TONE(w.reason)}>skipped</Badge>
              )}
            </div>
            {w.depth_cm === null && <p className="text-[11px] leading-tight text-slate-500">{w.reason}</p>}
            {w.circle && w.waterline_y !== undefined && w.depth_cm !== null && w.cm_per_px && (
              <p className="font-mono text-[10px] leading-tight text-slate-400">
                ({Math.round(w.circle.cy + w.circle.r)} − {Math.round(w.waterline_y)}) px × {w.cm_per_px.toFixed(2)} cm/px
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span><i className="mr-1.5 inline-block h-0.5 w-4 bg-sky-400 align-middle" />Waterline</span>
        <span><i className="mr-1.5 inline-block h-0.5 w-4 border-t-2 border-dashed border-orange-400 align-middle" />Fitted wheel</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-slate-400 align-middle" />Visible rim points</span>
        <span><i className="mr-1.5 inline-block h-0.5 w-4 bg-red-400 align-middle" />Road contact</span>
      </p>
    </div>
  )
}

/** Each estimate as a point with its error bar, and the fused result as a band. */
function FusionBody({ d }: { d: FusionData }) {
  if (d.depth_cm === null) return <p className="text-sm text-slate-500">No usable estimates to combine.</p>
  const W = 560
  const L = 118
  const R = 56
  const rowH = 34
  const max = Math.max(60, ...d.inputs.map((i) => i.depth_cm + i.uncertainty_cm)) * 1.15
  const x = (v: number) => L + (v / max) * (W - L - R)
  const H = (d.inputs.length + 1) * rowH + 34
  const step = max > 120 ? 40 : 20
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)
  const fusedY = d.inputs.length * rowH + 16
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Depth estimates with error bars and the fused result">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={6} y2={H - 22} stroke="#e2e8f0" />
          <text x={x(t)} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {t}
          </text>
        </g>
      ))}
      <text x={W - R + 6} y={H - 6} fontSize="10" fill="#94a3b8">cm</text>
      <rect x={x(d.depth_cm - (d.uncertainty_cm ?? 0))} width={Math.max(2, x(2 * (d.uncertainty_cm ?? 0)) - L)} y={6} height={H - 28} fill="#2563eb" opacity={0.08} />
      <line x1={x(d.depth_cm)} x2={x(d.depth_cm)} y1={6} y2={H - 22} stroke="#2563eb" strokeDasharray="4 3" />
      {d.inputs.map((inp, i) => {
        const y = 24 + i * rowH
        return (
          <g key={i}>
            <text x={L - 10} y={y + 4} textAnchor="end" fontSize="12" fill="#475569">
              Wheel {i + 1}
            </text>
            <line x1={x(inp.depth_cm - inp.uncertainty_cm)} x2={x(inp.depth_cm + inp.uncertainty_cm)} y1={y} y2={y} stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
            <circle cx={x(inp.depth_cm)} cy={y} r="6" fill="#fff" stroke="#f97316" strokeWidth="3" />
            <text x={W - R + 6} y={y + 4} fontSize="11" fill="#64748b">
              {Math.round(inp.weight * 100)}%
            </text>
          </g>
        )
      })}
      <text x={L - 10} y={fusedY + 24} textAnchor="end" fontSize="12" fontWeight="700" fill="#1e3a8a">
        Fused
      </text>
      <line x1={x(d.depth_cm - (d.uncertainty_cm ?? 0))} x2={x(d.depth_cm + (d.uncertainty_cm ?? 0))} y1={fusedY + 20} y2={fusedY + 20} stroke="#2563eb" strokeWidth="5" strokeLinecap="round" />
      <rect x={x(d.depth_cm) - 6} y={fusedY + 14} width="12" height="12" fill="#1d4ed8" transform={`rotate(45 ${x(d.depth_cm)} ${fusedY + 20})`} />
      <text x={W - R + 6} y={6} fontSize="10" fill="#94a3b8">weight</text>
    </svg>
  )
}

function VerifyBody({ d }: { d: VerifyData }) {
  const v = d.verdict
  const rows: [string, boolean | undefined][] = [
    ['Real flood', v.is_flood],
    ['Outdoor street', v.is_outdoor_street],
    ['Original photo (not stock or staged)', v.looks_staged_or_stock === undefined ? undefined : !v.looks_staged_or_stock],
    ['Not a duplicate', d.duplicate_of === null],
  ]
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {rows.map(([label, ok]) => (
          <li key={label} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-slate-600">{label}</span>
            <Badge tone={ok === undefined ? 'slate' : ok ? 'green' : 'red'}>{ok === undefined ? 'unknown' : ok ? 'pass' : 'fail'}</Badge>
          </li>
        ))}
      </ul>
      {v.reason && <p className="mt-3 border-l-2 border-blue-200 pl-3 text-sm italic text-slate-600">“{v.reason}”</p>}
      {v.water_depth_hint && (
        <p className="mt-2 text-sm text-slate-600">
          Muse Spark's own visual guess: <b className="capitalize">{v.water_depth_hint}-deep</b>
        </p>
      )}
    </div>
  )
}

/** Horizontal depth scale with danger zones, the estimate and its uncertainty band. */
function DepthRuler({ depth, unc }: { depth: number; unc: number }) {
  const max = 150
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`
  const zones: [number, number, string][] = [[0, 20, '#bbf7d0'], [20, 50, '#fef08a'], [50, 90, '#fed7aa'], [90, max, '#fecaca']]
  const marks: [number, string][] = [[10, 'ankle'], [50, 'knee'], [90, 'thigh'], [130, 'waist']]
  return (
    <div className="pt-6">
      <div className="relative h-4 rounded-full">
        {zones.map(([a, b, colour]) => (
          <div key={a} className="absolute top-0 h-full first:rounded-l-full last:rounded-r-full" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})`, background: colour }} />
        ))}
        <div className="absolute top-[-3px] h-[22px] rounded-sm bg-slate-900/25" style={{ left: pct(depth - unc), width: `calc(${pct(depth + unc)} - ${pct(depth - unc)})` }} />
        <div className="absolute top-[-8px] -translate-x-1/2" style={{ left: pct(depth) }}>
          <div className="mx-auto h-8 w-1 rounded bg-slate-900" />
        </div>
      </div>
      <div className="relative mt-2 h-4 text-[11px] text-slate-400">
        {marks.map(([v, label]) => (
          <span key={label} className="absolute -translate-x-1/2" style={{ left: pct(v) }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

function ResultBody({ d, onViewMap }: { d: ResultData; onViewMap: () => void }) {
  const s = STATUS[d.status] ?? { label: d.status, tone: 'slate' as Tone, text: '' }
  return (
    <div className="space-y-3">
      {d.depth_cm !== null ? (
        <div>
          <p className="flex items-baseline gap-2">
            <span className="text-5xl font-bold tracking-tight" style={{ color: depthColour(d.depth_cm) }}>
              {Math.round(d.depth_cm)}
            </span>
            <span className="text-lg text-slate-500">cm ± {Math.round(d.uncertainty_cm ?? 0)}</span>
          </p>
          <DepthRuler depth={d.depth_cm} unc={d.uncertainty_cm ?? 0} />
        </div>
      ) : (
        <p className="text-sm text-slate-600">No depth could be measured from this photo.</p>
      )}
      <div className={`rounded-lg p-3 text-sm ring-1 ring-inset ${TONES[s.tone]}`}>
        <b>{s.label}.</b> {s.text}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Report #{d.id} · analysed in {(d.total_ms / 1000).toFixed(1)} s</span>
        {(d.status === 'verified' || d.status === 'flood_unmeasured') && (
          <button onClick={onViewMap} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
            View on map
          </button>
        )}
      </div>
    </div>
  )
}

type Status = 'done' | 'active' | 'pending'

function StageShell({ index, id, status, ms, last, children }: { index: number; id: StageId; status: Status; ms?: number; last: boolean; children?: ReactNode }) {
  const m = META[id]
  const dot =
    status === 'done' ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white">✓</span>
    ) : status === 'active' ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 ring-2 ring-blue-600">
        <Spinner />
      </span>
    ) : (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-400">{index + 1}</span>
    )
  return (
    <li className="relative flex gap-4 pb-6">
      {!last && <span className={`absolute left-[13px] top-8 h-[calc(100%-2rem)] w-0.5 ${status === 'done' ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
      <div className="z-10 shrink-0">{dot}</div>
      <div className={`min-w-0 flex-1 ${status === 'pending' ? 'opacity-50' : ''}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">{m.title}</h3>
          {ms !== undefined && <span className="shrink-0 text-xs tabular-nums text-slate-400">{ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`}</span>}
        </div>
        <p className="text-xs text-slate-500">{m.blurb}</p>
        {status === 'active' && (
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-blue-500" />
          </div>
        )}
        {status === 'done' && children && <div className="fade-in mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{children}</div>}
      </div>
    </li>
  )
}

export function Pipeline({
  events,
  running,
  photo,
  onViewMap,
}: {
  events: StageEvents
  running: boolean
  photo: string | null
  onViewMap: () => void
}) {
  const nextIdx = STAGE_ORDER.findIndex((s) => !events[s])
  const size: [number, number] = events.intake ? [events.intake.data.width, events.intake.data.height] : [1, 1]
  const body = (id: StageId): ReactNode => {
    const e = events[id]
    if (!e) return null
    switch (id) {
      case 'intake': return <IntakeBody d={events.intake!.data} />
      case 'water': return <WaterBody d={events.water!.data} />
      case 'objects': return <ObjectsBody d={events.objects!.data} />
      case 'geometry': return photo ? <GeometryBody d={events.geometry!.data} photo={photo} size={size} /> : null
      case 'fusion': return <FusionBody d={events.fusion!.data} />
      case 'verify': return <VerifyBody d={events.verify!.data} />
      case 'result': return <ResultBody d={events.result!.data} onViewMap={onViewMap} />
    }
  }
  return (
    <ol>
      {STAGE_ORDER.map((id, i) => (
        <StageShell
          key={id}
          id={id}
          index={i}
          last={i === STAGE_ORDER.length - 1}
          ms={events[id]?.ms}
          status={events[id] ? 'done' : running && i === nextIdx ? 'active' : 'pending'}
        >
          {body(id)}
        </StageShell>
      ))}
    </ol>
  )
}
