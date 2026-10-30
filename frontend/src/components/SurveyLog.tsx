import { Check, Minus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  STAGE_ORDER,
  type FusionData,
  type GeometryData,
  type IntakeData,
  type ObjectsData,
  type ResultData,
  type StageEvents,
  type StageId,
  type Verdict,
  type VerifyData,
  type WaterData,
  type WheelRecord,
} from '../api'
import { bandFor, depthColour, duration } from '../lib/depth'
import { StaffGauge } from './StaffGauge'
import { STATUS } from '../lib/status'
import { toneClasses, type Tone } from '../lib/tone'
import { Button, Label, Readouts, Spinner, Tag } from './ui'

const STEPS: Record<StageId, { title: string; channel: string; blurb: string }> = {
  intake: { title: 'Intake', channel: 'server', blurb: 'Fingerprint, duplicate and metadata checks' },
  water: { title: 'Water surface', channel: 'SAM 3.1', blurb: 'Segment the flood water' },
  objects: { title: 'Reference objects', channel: 'SAM 3.1', blurb: 'Find wheels, whose real size is known' },
  geometry: { title: 'Wheel geometry', channel: 'circle fit', blurb: 'Recover each hidden wheel and measure the waterline' },
  fusion: { title: 'Fusion', channel: 'statistics', blurb: 'Combine estimates by their certainty' },
  verify: { title: 'Verification', channel: 'Muse Spark', blurb: 'Real flood, original photo, sanity check' },
  result: { title: 'Reading', channel: 'decision', blurb: 'Publish, flag for review, or reject' },
}

function Figure({ src, legend }: { src: string; legend: [string, string][] }) {
  return (
    <figure>
      <img src={src} alt="Segmentation overlay" className="w-full rounded-md border border-line" />
      <figcaption className="mt-2 flex gap-4 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
        {legend.map(([label, colour]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: colour }} />
            {label}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

function IntakeBody({ d }: { d: IntakeData }) {
  const meta = d.exif.has_taken_at || d.exif.has_gps
  return (
    <Readouts
      items={[
        { label: 'Image', value: `${d.width} × ${d.height}`, hint: `${d.kb} KB` },
        { label: 'Fingerprint', value: <span className="font-mono text-[12.5px]">{d.phash}</span>, hint: 'perceptual hash' },
        { label: 'Duplicate', value: d.duplicate_of === null ? 'None found' : `Matches #${d.duplicate_of}` },
        { label: 'Metadata', value: meta ? 'Checked' : 'None', hint: meta ? 'time and place' : 'stripped by many apps' },
      ]}
    />
  )
}

function WaterBody({ d }: { d: WaterData }) {
  return (
    <div className="space-y-3">
      <Figure src={d.overlay} legend={[['Water', '#2563eb']]} />
      <Readouts
        cols={3}
        items={[
          { label: 'Coverage', value: <span className="font-mono">{d.coverage_pct}%</span> },
          { label: 'Regions', value: <span className="font-mono">{d.instances}</span>, hint: d.prompt ? `“${d.prompt}”` : undefined },
          { label: 'Confidence', value: <span className="font-mono">{d.confidence !== null ? `${Math.round(d.confidence * 100)}%` : '—'}</span> },
        ]}
      />
    </div>
  )
}

function ObjectsBody({ d }: { d: ObjectsData }) {
  const max = Math.max(1, ...d.prompts.map((p) => p.count))
  return (
    <div className="space-y-3">
      <Figure src={d.overlay} legend={[['Water', '#2563eb'], ['Wheel', '#f97316']]} />
      {d.prompts.length === 0 ? (
        <p className="text-[13px] text-ink-3">Skipped: no water was found.</p>
      ) : (
        <ul className="space-y-1.5">
          {d.prompts.map((p) => (
            <li key={p.type} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[12.5px]">
              <span className="text-ink-2">“{p.prompt}”</span>
              <span className={`font-mono ${p.count ? 'font-semibold text-ink' : 'text-ink-4'}`}>{p.count}</span>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-line-2">
                <span className="block h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${(p.count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Zoomed view of one wheel: the photo, the fitted circle, the waterline and the measured gap. */
export function WheelZoom({ photo, size, wheel }: { photo: string; size: [number, number]; wheel: WheelRecord }) {
  const c = wheel.circle
  const [bx0, by0, bx1, by1] = wheel.box
  const r = c ? c.r : Math.max(bx1 - bx0, by1 - by0) / 2
  const cx = c ? c.cx : (bx0 + bx1) / 2
  const cy = c ? c.cy : (by0 + by1) / 2
  const pad = r * 1.9
  const sw = r * 0.04
  const id = `clip-${Math.round(cx)}-${Math.round(cy)}`
  const wl = wheel.waterline_y
  const bottom = cy + r
  const label = { fontSize: r * 0.24, fill: '#fff', stroke: '#0d1b26', strokeWidth: r * 0.07, paintOrder: 'stroke', fontFamily: 'IBM Plex Mono', fontWeight: 600 } as const
  return (
    <svg viewBox={`${cx - pad} ${cy - pad} ${pad * 2} ${pad * 2}`} className="aspect-square w-full rounded-md bg-ink">
      <image href={photo} width={size[0]} height={size[1]} />
      {c && (
        <>
          <clipPath id={id}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
          {wl !== undefined && (
            <g clipPath={`url(#${id})`}>
              <rect x={cx - r} y={wl} width={r * 2} height={r * 2} fill="#1e5bd6" opacity={0.45} />
            </g>
          )}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffb547" strokeWidth={sw} strokeDasharray={`${r * 0.16} ${r * 0.1}`} />
          {wheel.rim_sample?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={r * 0.028} fill="#fff" />)}
        </>
      )}
      {!c && <rect x={bx0} y={by0} width={bx1 - bx0} height={by1 - by0} fill="none" stroke="#ffb547" strokeWidth={sw} />}
      {wl !== undefined && <line x1={cx - pad} x2={cx + pad} y1={wl} y2={wl} stroke="#6aa8ff" strokeWidth={sw} />}
      {c && wl !== undefined && wheel.depth_cm !== null && (
        <g>
          <line x1={cx - r * 1.3} x2={cx - r * 0.85} y1={bottom} y2={bottom} stroke="#ff5a6a" strokeWidth={sw} />
          <line x1={cx - r * 1.1} x2={cx - r * 1.1} y1={wl} y2={bottom} stroke="#fff" strokeWidth={sw} />
          <text x={cx - r * 1.22} y={(wl + bottom) / 2 + r * 0.1} textAnchor="end" {...label}>
            {Math.round(wheel.depth_cm)} cm
          </text>
        </g>
      )}
    </svg>
  )
}

function GeometryBody({ d, photo, size }: { d: GeometryData; photo: string; size: [number, number] }) {
  if (d.wheels.length === 0) return <p className="text-[13px] text-ink-3">No wheels in this photo, so no geometric measurement.</p>
  const usable = d.wheels.filter((w) => w.depth_cm !== null).length
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-ink-2">
        <span className="font-mono font-semibold text-ink">{usable}</span> of <span className="font-mono">{d.wheels.length}</span> wheels gave a usable reading.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {d.wheels.map((w, i) => (
          <div key={i} className="min-w-0">
            <WheelZoom photo={photo} size={size} wheel={w} />
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
      <div className="rounded-md bg-sunken px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-2">
        depth = (road contact − waterline) px × wheel Ø cm ÷ fitted Ø px
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-[#6aa8ff]" />waterline</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed border-[#ffb547]" />fitted wheel</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 bg-[#ff5a6a]" />road</span>
      </p>
    </div>
  )
}

/** Each estimate with its error bar; the fused result as a band. */
function FusionBody({ d }: { d: FusionData }) {
  if (d.depth_cm === null) return <p className="text-[13px] text-ink-3">Nothing to combine.</p>
  const W = 400
  const L = 40
  const R = 40
  const rowH = 26
  const max = Math.max(60, ...d.inputs.map((i) => i.depth_cm + i.uncertainty_cm)) * 1.15
  const x = (v: number) => L + (Math.max(0, v) / max) * (W - L - R)
  const fusedY = d.inputs.length * rowH + 18
  const H = fusedY + 40
  const step = max > 120 ? 40 : 20
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)
  const u = d.uncertainty_cm ?? 0
  const mono = { fontFamily: 'IBM Plex Mono', fontSize: 10 }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Estimates and fused depth">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={4} y2={H - 18} stroke="#efede6" />
          <text x={x(t)} y={H - 4} textAnchor="middle" fill="#a2aab1" {...mono}>{t}</text>
        </g>
      ))}
      <rect x={x(d.depth_cm - u)} width={Math.max(2, x(d.depth_cm + u) - x(d.depth_cm - u))} y={4} height={H - 22} fill="#1e5bd6" opacity={0.07} />
      {d.inputs.map((inp, i) => {
        const y = 18 + i * rowH
        return (
          <g key={i}>
            <text x={L - 8} y={y + 3.5} textAnchor="end" fill="#6c7782" {...mono}>W{i + 1}</text>
            <line x1={x(inp.depth_cm - inp.uncertainty_cm)} x2={x(inp.depth_cm + inp.uncertainty_cm)} y1={y} y2={y} stroke="#3b4853" strokeWidth="1.5" />
            <line x1={x(inp.depth_cm - inp.uncertainty_cm)} x2={x(inp.depth_cm - inp.uncertainty_cm)} y1={y - 4} y2={y + 4} stroke="#3b4853" strokeWidth="1.5" />
            <line x1={x(inp.depth_cm + inp.uncertainty_cm)} x2={x(inp.depth_cm + inp.uncertainty_cm)} y1={y - 4} y2={y + 4} stroke="#3b4853" strokeWidth="1.5" />
            <circle cx={x(inp.depth_cm)} cy={y} r="3.5" fill="#fff" stroke="#0d1b26" strokeWidth="1.5" />
            <text x={W - R + 8} y={y + 3.5} fill="#6c7782" {...mono}>{Math.round(inp.weight * 100)}%</text>
          </g>
        )
      })}
      <line x1={L} x2={W - R} y1={fusedY - 6} y2={fusedY - 6} stroke="#e4e1d8" />
      <text x={L - 8} y={fusedY + 9} textAnchor="end" fill="#0d1b26" fontWeight="600" {...mono}>Σ</text>
      <line x1={x(d.depth_cm - u)} x2={x(d.depth_cm + u)} y1={fusedY + 6} y2={fusedY + 6} stroke="#1e5bd6" strokeWidth="4" strokeLinecap="round" />
      <rect x={x(d.depth_cm) - 4.5} y={fusedY + 1.5} width="9" height="9" fill="#1e5bd6" transform={`rotate(45 ${x(d.depth_cm)} ${fusedY + 6})`} />
      <text x={W - R + 8} y={fusedY + 9.5} fill="#1e5bd6" fontWeight="600" {...mono}>{Math.round(d.depth_cm)}</text>
    </svg>
  )
}

function CheckRow({ ok, label }: { ok: boolean | 'unsure' | undefined; label: string }) {
  const Icon = ok === undefined || ok === 'unsure' ? Minus : ok ? Check : X
  const tone: Tone = ok === undefined ? 'neutral' : ok === 'unsure' ? 'warn' : ok ? 'ok' : 'bad'
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-[13px]">
      <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full ${toneClasses(tone)}`}>
        <Icon size={11} strokeWidth={2.5} />
      </span>
      <span className={ok === false ? 'text-ink' : 'text-ink-2'}>{label}</span>
    </li>
  )
}

function VerifyBody({ d }: { d: VerifyData }) {
  const v = d.verdict
  return (
    <div>
      <ul>
        <CheckRow
          ok={v.flood_evidence === 'clear' ? true : v.flood_evidence === 'possible' ? 'unsure' : v.flood_evidence === 'none' ? false : undefined}
          label={v.flood_evidence === 'possible' ? 'Water seems present, but the photo cannot confirm it' : 'Floodwater visible, not a puddle or a dry scene'}
        />
        <CheckRow ok={v.looks_staged_or_stock === undefined ? undefined : !v.looks_staged_or_stock} label="Original photo, not stock or staged" />
        <CheckRow ok={d.duplicate_of === null} label="Not seen before" />
        {d.exif.has_taken_at && <CheckRow ok={!d.exif.stale} label="Taken in the last 3 days" />}
        {d.exif.has_gps && <CheckRow ok={!d.exif.mismatch} label="Taken where it was reported" />}
        {d.cross_check !== 'unavailable' && <CheckRow ok={d.cross_check === 'agree'} label="Geometry agrees with the visual estimate" />}
      </ul>
      {v.reason && <p className="mt-2 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-2">{v.reason}</p>}
      {v.depth_cm_low != null && v.depth_cm_high != null && (
        <p className="mt-2 font-mono text-[11.5px] text-ink-3">
          visual estimate {Math.round(v.depth_cm_low)}–{Math.round(v.depth_cm_high)} cm{v.depth_reference ? ` · from ${v.depth_reference}` : ''}
        </p>
      )}
    </div>
  )
}

function ResultBody({ d, verdict, onShow }: { d: ResultData; verdict?: Verdict; onShow?: () => void }) {
  const s = STATUS[d.status] ?? { label: d.status, tone: 'neutral' as Tone, text: '' }
  const visual = d.depth_cm === null && verdict?.depth_cm_low != null && verdict.depth_cm_high != null
  const depth = d.depth_cm ?? (visual ? (verdict!.depth_cm_low! + verdict!.depth_cm_high!) / 2 : null)
  const unc = d.depth_cm !== null ? (d.uncertainty_cm ?? 0) : visual ? (verdict!.depth_cm_high! - verdict!.depth_cm_low!) / 2 : 0
  const band = bandFor(depth)
  const published = !d.status.startsWith('rejected')

  return (
    <div className="space-y-4">
      {depth !== null ? (
        <div className="flex items-center gap-4">
          <StaffGauge depth={depth} uncertainty={unc} visual={visual} />
          <div className="min-w-0 space-y-3">
            <div>
              <Label>{visual ? 'Visual estimate' : 'Measured depth'}</Label>
              <p className="mt-1 font-mono text-[44px] font-semibold leading-none tracking-tight" style={{ color: depthColour(depth) }}>
                {visual ? `${Math.round(verdict!.depth_cm_low!)}–${Math.round(verdict!.depth_cm_high!)}` : Math.round(depth)}
              </p>
              <p className="mt-1 font-mono text-[13px] text-ink-3">{visual ? 'cm, by eye' : `± ${Math.round(unc)} cm`}</p>
            </div>
            {band && (
              <p className="text-[13px] text-ink-2">
                About <span className="font-medium text-ink">{band.label.replace('+', '')}-deep</span> on an adult.
              </p>
            )}
            {d.place && <p className="text-[12.5px] text-ink-3">{d.place}</p>}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-ink-2">No depth could be read from this photo.</p>
      )}
      <div className={`rounded-lg px-3 py-2.5 text-[13px] leading-snug ${toneClasses(s.tone)}`}>
        <span className="font-semibold">{s.label}.</span> {s.text}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-ink-3">
          {d.id > 0 && `#${d.id} · `}{duration(d.total_ms)}
        </span>
        {published && onShow && (
          <Button variant="secondary" onClick={onShow} className="py-1.5 text-[12.5px]">
            Show on map
          </Button>
        )}
      </div>
    </div>
  )
}

type StepState = 'done' | 'active' | 'pending'

function Step({ n, id, state, ms, last, children }: { n: number; id: StageId; state: StepState; ms?: number; last: boolean; children?: ReactNode }) {
  const s = STEPS[id]
  return (
    <li className="relative grid grid-cols-[28px_1fr] gap-x-3">
      {!last && <span className={`absolute left-[13.5px] top-7 bottom-0 w-px ${state === 'done' ? 'bg-ink/25' : 'bg-line'}`} />}
      <span
        className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${
          state === 'done' ? 'bg-ink text-white' : state === 'active' ? 'bg-signal-soft text-signal ring-1 ring-signal/40' : 'bg-surface text-ink-4 ring-1 ring-line'
        }`}
      >
        {state === 'active' ? <Spinner /> : String(n).padStart(2, '0')}
      </span>
      <div className={`min-w-0 pb-5 ${state === 'pending' ? 'opacity-55' : ''}`}>
        <div className="flex h-7 items-center justify-between gap-2">
          <span className="truncate text-[13.5px] font-semibold text-ink">{s.title}</span>
          <span className="flex shrink-0 items-center gap-2">
            <Tag tone={state === 'active' ? 'signal' : 'neutral'}>{s.channel}</Tag>
            <span className="w-11 text-right font-mono text-[11px] text-ink-3">{ms !== undefined ? duration(ms) : ''}</span>
          </span>
        </div>
        {state !== 'done' && <p className="text-[12px] text-ink-3">{s.blurb}</p>}
        {state === 'active' && (
          <div className="relative mt-2 h-[2px] overflow-hidden rounded-full bg-signal-soft">
            <span className="sweep absolute inset-y-0 w-1/3 rounded-full bg-signal" />
          </div>
        )}
        {state === 'done' && children && <div className="enter mt-2">{children}</div>}
      </div>
    </li>
  )
}

export function SurveyLog({ events, running, photo, onShow }: { events: StageEvents; running: boolean; photo: string | null; onShow?: () => void }) {
  const next = STAGE_ORDER.findIndex((s) => !events[s])
  const size: [number, number] = events.intake ? [events.intake.data.width, events.intake.data.height] : [1, 1]
  const body = (id: StageId): ReactNode => {
    switch (id) {
      case 'intake': return events.intake && <IntakeBody d={events.intake.data} />
      case 'water': return events.water && <WaterBody d={events.water.data} />
      case 'objects': return events.objects && <ObjectsBody d={events.objects.data} />
      case 'geometry': return events.geometry && photo && <GeometryBody d={events.geometry.data} photo={photo} size={size} />
      case 'fusion': return events.fusion && <FusionBody d={events.fusion.data} />
      case 'verify': return events.verify && <VerifyBody d={events.verify.data} />
      case 'result': return events.result && <ResultBody d={events.result.data} verdict={events.verify?.data.verdict} onShow={onShow} />
    }
  }
  return (
    <ol>
      {STAGE_ORDER.map((id, i) => (
        <Step
          key={id}
          n={i + 1}
          id={id}
          last={i === STAGE_ORDER.length - 1}
          ms={events[id]?.ms}
          state={events[id] ? 'done' : running && i === next ? 'active' : 'pending'}
        >
          {body(id)}
        </Step>
      ))}
    </ol>
  )
}
