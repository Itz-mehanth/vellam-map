import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  LEVEL_NAMES,
  LEVEL_SHORT,
  fetchBenchmark,
  fetchRecordedRun,
  jitter,
  levelOf,
  photoUrl,
  type BenchIndex,
  type BenchPhoto,
  type MethodId,
  type MethodStats,
} from '../lib/benchmark'
import { SurveyLog } from './SurveyLog'
import { Label, Segmented, Spinner, Tag } from './ui'

const NO_EDGES: number[] = []
const VISUAL = '#1e5bd6'
const GEOMETRY = '#e2703a'

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`)

/** How close a prediction is to the true level: right, one off, or further. */
function closeness(photo: BenchPhoto, depth: number | null, edges: number[]) {
  if (depth === null) return null
  const d = Math.abs(levelOf(depth, edges) - photo.level)
  return d === 0 ? 'right' : d === 1 ? 'near' : 'far'
}
const CLOSE_STYLE = { right: 'bg-ok-soft text-ok', near: 'bg-warn-soft text-warn', far: 'bg-bad-soft text-bad' } as const

function Scorecard({ title, colour, s, note }: { title: string; colour: string; s: MethodStats; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
        <span className="h-2 w-2 rounded-full" style={{ background: colour }} />
        {title}
      </p>
      <p className="mt-2 font-mono text-[30px] font-semibold leading-none tracking-tight text-ink" title="Spearman rank correlation: 1.0 means predicted depth rises in perfect step with the true level, 0 means no relation.">
        {s.spearman === null ? '–' : s.spearman.toFixed(2)}
      </p>
      <p className="mt-1 text-[11px] text-ink-3">rank correlation</p>
      <dl className="mt-3 space-y-1.5 font-mono text-[11.5px]">
        <div className="flex justify-between">
          <dt className="text-ink-3">gave a reading</dt>
          <dd className="font-medium text-ink">{s.n} / {s.of}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-3">within 1 level</dt>
          <dd className="font-medium text-ink">{pct(s.within1)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-3">exact level</dt>
          <dd className="font-medium text-ink">{pct(s.exact)}</dd>
        </div>
      </dl>
      <p className="mt-2.5 border-t border-line-2 pt-2 text-[11px] leading-snug text-ink-3">{note}</p>
    </div>
  )
}

/** Predicted depth against true level: every photo is a dot, medians are bars, shaded boxes show where each level should land. */
function StripChart({ data, onPick }: { data: BenchIndex; onPick: (p: BenchPhoto) => void }) {
  const W = 408
  const H = 240
  const m = { l: 34, r: 6, t: 20, b: 30 }
  const colW = (W - m.l - m.r) / 5
  const MAX = 150
  const y = (cm: number) => m.t + (H - m.t - m.b) * (1 - Math.min(MAX, Math.max(0, cm)) / MAX)
  const edges = [0, ...data.meta.level_edges_cm, MAX]
  const med = data.metrics.methods
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Predicted depth by true level">
      {[0, 25, 50, 75, 100, 125, 150].map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="#efede6" />
          <text x={m.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="9.5" fill="#a2aab1" fontFamily="IBM Plex Mono">{t}</text>
        </g>
      ))}
      <text x={m.l - 6} y={9} textAnchor="end" fontSize="9.5" fill="#a2aab1" fontFamily="IBM Plex Mono">cm</text>
      {[0, 1, 2, 3, 4].map((lv) => {
        const cx = m.l + colW * (lv + 0.5)
        return (
          <g key={lv}>
            <rect x={cx - colW / 2 + 3} width={colW - 6} y={y(edges[lv + 1])} height={Math.max(2, y(edges[lv]) - y(edges[lv + 1]))} fill="#0d1b26" opacity="0.05" rx="3" />
            <text x={cx} y={H - 14} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0d1b26" fontFamily="IBM Plex Mono">L{lv}</text>
            <text x={cx} y={H - 3} textAnchor="middle" fontSize="8.5" fill="#6c7782">{LEVEL_SHORT[lv]}</text>
            {(['visual', 'geometry'] as const).map((k) => {
              const v = med[k].median_by_level[lv]
              if (v === null) return null
              const x0 = cx + (k === 'visual' ? -13 : 13)
              return <line key={k} x1={x0 - 9} x2={x0 + 9} y1={y(v)} y2={y(v)} stroke={k === 'visual' ? VISUAL : GEOMETRY} strokeWidth="2.5" strokeLinecap="round" />
            })}
          </g>
        )
      })}
      {data.photos.filter((p) => !p.error).map((p) => {
        const cx = m.l + colW * (p.level + 0.5)
        return (
          <g key={p.id}>
            {p.visual_mid !== null && (
              <circle cx={cx - 13 + jitter(p.id, 7)} cy={y(p.visual_mid)} r="3.6" fill={VISUAL} fillOpacity="0.55" stroke="#fff" strokeWidth="0.8" className="cursor-pointer" onClick={() => onPick(p)}>
                <title>{`${p.id}: by-eye ~${Math.round(p.visual_mid)} cm`}</title>
              </circle>
            )}
            {p.geometry_cm !== null && (
              <circle cx={cx + 13 + jitter(p.id + 'g', 7)} cy={y(p.geometry_cm)} r="3.6" fill={GEOMETRY} fillOpacity="0.8" stroke="#fff" strokeWidth="0.8" className="cursor-pointer" onClick={() => onPick(p)}>
                <title>{`${p.id}: geometry ${Math.round(p.geometry_cm)} cm`}</title>
              </circle>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Confusion({ s }: { s: MethodStats }) {
  const max = Math.max(1, ...s.confusion.flat())
  return (
    <div>
      <div className="grid grid-cols-[34px_repeat(5,1fr)] gap-[3px] text-center font-mono text-[11px]">
        <span />
        {[0, 1, 2, 3, 4].map((c) => (
          <span key={c} className="pb-0.5 text-[10px] text-ink-3">L{c}</span>
        ))}
        {s.confusion.map((row, r) => (
          <FragmentRow key={r} row={row} r={r} max={max} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] text-ink-3">
        <span>rows: true level</span>
        <span>columns: predicted level</span>
      </div>
    </div>
  )
}

function FragmentRow({ row, r, max }: { row: number[]; r: number; max: number }) {
  return (
    <>
      <span className="flex items-center justify-end pr-1.5 text-[10px] text-ink-3">L{r}</span>
      {row.map((v, c) => (
        <span
          key={c}
          title={`true L${r}, predicted L${c}: ${v}`}
          className={`flex aspect-[1.35] items-center justify-center rounded-[4px] ${r === c ? 'ring-1 ring-inset ring-ink/40' : ''}`}
          style={{ background: v ? `rgba(30,91,214,${0.1 + (0.8 * v) / max})` : '#f9f8f4', color: v / max > 0.5 ? '#fff' : '#3b4853' }}
        >
          {v || ''}
        </span>
      ))}
    </>
  )
}

function CoverageBars({ data }: { data: BenchIndex }) {
  return (
    <div className="space-y-2.5">
      {data.metrics.per_level.map((pl) => (
        <div key={pl.level} className="grid grid-cols-[28px_1fr] items-center gap-2">
          <span className="font-mono text-[11px] font-semibold text-ink">L{pl.level}</span>
          <div className="space-y-1">
            {([['by-eye', pl.visual_n, VISUAL], ['geometry', pl.geometry_n, GEOMETRY]] as const).map(([label, n, colour]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-2">
                  <span className="block h-full rounded-full" style={{ width: `${pl.n ? (n / pl.n) * 100 : 0}%`, background: colour }} />
                </span>
                <span className="w-[98px] whitespace-nowrap text-right font-mono text-[10.5px] text-ink-3">{n}/{pl.n} {label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Thumb({ p, edges, onOpen }: { p: BenchPhoto; edges: number[]; onOpen: () => void }) {
  const vis = closeness(p, p.visual_mid, edges)
  const geo = closeness(p, p.geometry_cm, edges)
  return (
    <button onClick={onOpen} disabled={!p.images} className="group min-w-0 text-left disabled:opacity-40">
      <span className="relative block aspect-[4/3] overflow-hidden rounded-md bg-sunken ring-1 ring-line group-hover:ring-ink-4">
        <span className="absolute inset-0 grid place-items-center text-[10px] text-ink-4">no image</span>
        {p.images && (
          <img
            src={photoUrl(p.id)}
            alt={`Benchmark photo ${p.id}, true level ${p.level}`}
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
            className="relative h-full w-full object-cover"
          />
        )}
        <span className="absolute left-1 top-1 rounded bg-ink/80 px-1 font-mono text-[10px] font-semibold text-white">L{p.level}</span>
      </span>
      <span className="mt-1 flex flex-wrap gap-1">
        <span className={`rounded px-1 font-mono text-[10px] ${vis ? CLOSE_STYLE[vis] : 'bg-line-2 text-ink-4'}`} title="Muse Spark by-eye estimate">
          {p.visual_mid === null ? 'eye –' : `eye ${Math.round(p.visual_mid)}`}
        </span>
        <span className={`rounded px-1 font-mono text-[10px] ${geo ? CLOSE_STYLE[geo] : 'bg-line-2 text-ink-4'}`} title="Wheel geometry">
          {p.geometry_cm === null ? 'geo –' : `geo ${Math.round(p.geometry_cm)}`}
        </span>
      </span>
    </button>
  )
}

function Detail({ p, data, onBack }: { p: BenchPhoto; data: BenchIndex; onBack: () => void }) {
  const run = useQuery({ queryKey: ['bench-run', p.id], queryFn: () => fetchRecordedRun(p.id), staleTime: Infinity })
  const edges = data.meta.level_edges_cm
  const row = (label: string, depth: number | null, colour: string) => {
    const c = closeness(p, depth, edges)
    return (
      <div className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
        <span className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: colour }} />
          {label}
        </span>
        {depth === null ? (
          <span className="font-mono text-[12px] text-ink-4">no reading</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="font-mono font-semibold text-ink">{Math.round(depth)} cm</span>
            <span className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] ${CLOSE_STYLE[c!]}`}>
              predicts L{levelOf(depth, edges)} · {c === 'right' ? 'right' : c === 'near' ? 'one off' : 'far off'}
            </span>
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="enter space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> All benchmark photos
      </button>
      <div className="overflow-hidden rounded-lg border border-line bg-ink">
        <img src={photoUrl(p.id)} alt={`Benchmark photo ${p.id}`} onError={(e) => { e.currentTarget.style.display = 'none' }} className="max-h-60 w-full object-contain" />
      </div>
      <div>
        <Label>Ground truth</Label>
        <p className="mt-0.5 text-[15px] font-semibold text-ink">Level {p.level}: {LEVEL_NAMES[p.level]}</p>
        <div className="mt-2 divide-y divide-line-2 rounded-lg border border-line px-3">
          {row('Muse Spark by-eye', p.visual_mid, VISUAL)}
          {row('Wheel geometry', p.geometry_cm, GEOMETRY)}
        </div>
      </div>
      <div>
        <Label className="mb-3">Recorded pipeline run</Label>
        {run.isLoading && <p className="flex items-center gap-2 text-[13px] text-ink-3"><Spinner /> Loading…</p>}
        {run.isError && <p className="text-[13px] text-bad">No recorded run for this photo.</p>}
        {run.data && <SurveyLog events={run.data.events} running={false} photo={photoUrl(p.id)} />}
      </div>
    </div>
  )
}

type Filter = 'all' | 'geometry' | 'disagree' | '0' | '1' | '2' | '3' | '4'

export function BenchmarkPanel() {
  const q = useQuery({ queryKey: ['benchmark'], queryFn: fetchBenchmark, staleTime: Infinity })
  const [method, setMethod] = useState<MethodId>('visual')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const data = q.data
  const edges = data?.meta.level_edges_cm ?? NO_EDGES

  const shown = useMemo(() => {
    if (!data) return []
    const ok = data.photos.filter((p) => !p.error)
    if (filter === 'all') return ok
    if (filter === 'geometry') return ok.filter((p) => p.geometry_cm !== null)
    if (filter === 'disagree')
      return ok.filter((p) => p.geometry_cm !== null && p.visual_mid !== null && Math.abs(levelOf(p.geometry_cm, edges) - levelOf(p.visual_mid, edges)) >= 1)
    return ok.filter((p) => p.level === Number(filter))
  }, [data, filter, edges])

  if (q.isLoading) return <p className="flex items-center gap-2 py-6 text-[13px] text-ink-3"><Spinner /> Loading benchmark…</p>
  if (!data)
    return (
      <div className="rounded-lg border border-dashed border-line px-4 py-6 text-[13px] leading-relaxed text-ink-3">
        No benchmark results are bundled with this build. Create them with
        <code className="mx-1 rounded bg-line-2 px-1 py-0.5 font-mono text-[12px] text-ink-2">python -u eval/benchmark_flooded_cars.py</code>
        (see docs/BENCHMARK.md).
      </div>
    )

  const selected = open ? data.photos.find((p) => p.id === open) : null
  if (selected) return <Detail p={selected} data={data} onBack={() => setOpen(null)} />

  const m = data.metrics.methods
  const filters: [Filter, string][] = [['all', 'All'], ['0', 'L0'], ['1', 'L1'], ['2', 'L2'], ['3', 'L3'], ['4', 'L4'], ['geometry', 'Geometry read'], ['disagree', 'Methods disagree']]

  return (
    <div className="space-y-7">
      <section>
        <p className="text-[15px] font-semibold text-ink">Tested on {data.metrics.n} real photos</p>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
          Flooded cars from the public{' '}
          <a href={data.meta.dataset_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-signal underline decoration-signal/30 underline-offset-2">
            {data.meta.dataset} <ExternalLink size={11} />
          </a>{' '}
          ({data.meta.dataset_license}). Each photo has a true depth <b className="font-medium text-ink-2">level</b> from 0 to 4, not centimetres, so this tests
          ordering. {data.meta.per_level} photos per level, test split, run {data.meta.generated_at}.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Scorecard title="Muse Spark, by eye" colour={VISUAL} s={m.visual} note="Reads the whole scene. Works on most photos." />
          <Scorecard title="Wheel geometry" colour={GEOMETRY} s={m.geometry} note="Needs a wheel meeting the water. Rare in these tight crops." />
        </div>
      </section>

      <section>
        <Label className="mb-1">Predicted depth by true level</Label>
        <p className="mb-2 text-[11.5px] text-ink-3">Each dot is a photo; bars are medians; shaded boxes show where each level should land. Tap a dot to open it.</p>
        <StripChart data={data} onPick={(p) => p.images && setOpen(p.id)} />
        <p className="mt-1 flex gap-4 font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: VISUAL }} />by eye</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: GEOMETRY }} />geometry</span>
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Label>Where predictions landed</Label>
          <Segmented<MethodId>
            size="sm"
            value={method}
            onChange={setMethod}
            options={[{ value: 'visual', label: 'By eye' }, { value: 'geometry', label: 'Geometry' }, { value: 'combined', label: 'Combined' }]}
          />
        </div>
        {m[method].n === 0 ? <p className="text-[13px] text-ink-3">No predictions.</p> : <Confusion s={m[method]} />}
        <p className="mt-2 text-[11.5px] text-ink-3">The diagonal is a correct level. Cells next to it are one level off.</p>
      </section>

      <section>
        <Label className="mb-2">How often each method gave a reading</Label>
        <CoverageBars data={data} />
        <p className="mt-2 text-[11.5px] text-ink-3">Level 0 cars are not in water, so no depth is the right answer there.</p>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <Label>Photos and their pipeline</Label>
          <span className="font-mono text-[11px] text-ink-3">{shown.length} shown</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {filters.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${filter === id ? 'bg-ink text-white' : 'bg-line-2 text-ink-2 hover:bg-line'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {shown.map((p) => (
            <Thumb key={p.id} p={p} edges={edges} onOpen={() => setOpen(p.id)} />
          ))}
        </div>
        {shown.length === 0 && <p className="py-4 text-[13px] text-ink-3">No photos match.</p>}
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          <span className="flex items-center gap-1"><Check size={11} className="text-ok" />right level</span>
          <Tag tone="warn">one off</Tag>
          <Tag tone="bad">far off</Tag>
          <span>Open any photo to replay every pipeline stage.</span>
        </p>
      </section>

      <section className="space-y-2 border-t border-line pt-4 text-[12px] leading-relaxed text-ink-3">
        <Label>Read this before quoting these numbers</Label>
        <ul className="list-disc space-y-1 pl-4">
          <li>{data.metrics.n} photos from one sample: a first read, not a published claim.</li>
          <li>Ordered levels, not centimetres. Level thresholds ({edges.join(', ')} cm) are our assumption.</li>
          <li>The images are tight, upscaled crops, which give wheel geometry less to work with than a phone photo. Its coverage here is probably a floor.</li>
          <li>Faces and plates are blurred. Photos come from the dataset above under its licence.</li>
        </ul>
      </section>
    </div>
  )
}
