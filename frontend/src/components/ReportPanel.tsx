import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Camera, ImageUp, LocateFixed, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchReplayMode, STAGE_ORDER, streamReport, type StageEvents } from '../api'
import { SurveyLog } from './SurveyLog'
import { CHENNAI, useCurrentPosition } from '../lib/useLocation'
import { Button, Label } from './ui'

interface Sample {
  file: string
  label: string
  license: string
  author: string
  source: string
  control: boolean
}

function Samples({ onPick, selected }: { onPick: (f: File) => void; selected: string | null }) {
  const { data: samples = [] } = useQuery({
    queryKey: ['samples'],
    queryFn: async (): Promise<Sample[]> => (await fetch('/samples/samples.json')).json(),
    staleTime: Infinity,
  })
  const { data: replay } = useQuery({ queryKey: ['replay-mode'], queryFn: fetchReplayMode, staleTime: Infinity })
  const active = samples.find((s) => s.file === selected)
  const pick = async (s: Sample) => {
    const blob = await (await fetch(`/samples/${s.file}`)).blob()
    onPick(new File([blob], s.file, { type: 'image/jpeg' }))
  }
  if (!samples.length) return null
  return (
    <section>
      {replay && (
        <p className="mb-3 rounded-md border border-line bg-sunken px-3 py-2 text-[12px] leading-snug text-ink-3">
          <strong className="font-semibold text-ink-2">Replay mode.</strong> This copy has no API key, so each test photo plays
          back the pipeline run recorded on it with the real models. Your own photos and the voice assistant need a key.
        </p>
      )}
      <div className="mb-2 flex items-baseline justify-between">
        <Label>Test photos</Label>
        <span className="font-mono text-[10.5px] text-ink-4">Wikimedia Commons</span>
      </div>
      <div className="scroll-quiet -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {samples.map((s) => (
          <button
            key={s.file}
            title={s.label}
            onClick={() => pick(s)}
            className={`relative h-14 w-[74px] shrink-0 overflow-hidden rounded-md transition ${
              selected === s.file ? 'ring-2 ring-ink ring-offset-1' : 'opacity-85 hover:opacity-100'
            }`}
          >
            <img src={`/samples/${s.file}`} alt={s.label} loading="lazy" className="h-full w-full object-cover" />
            {s.control && <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-px font-mono text-[9px] uppercase tracking-wide text-white">control</span>}
          </button>
        ))}
      </div>
      {active && (
        <p className="mt-1.5 truncate text-[11.5px] text-ink-3">
          <span className="text-ink-2">{active.label}</span> · {active.author} ·{' '}
          <a href={active.source} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:text-ink">
            {active.license}
          </a>
        </p>
      )}
    </section>
  )
}

export function ReportPanel({ onDone, onShow }: { onDone: (lat: number, lng: number, id: number) => void; onShow: (lat: number, lng: number, id?: number) => void }) {
  const queryClient = useQueryClient()
  const { pos, denied } = useCurrentPosition()
  const place = pos ?? CHENNAI
  const [photo, setPhoto] = useState<File | null>(null)
  const [events, setEvents] = useState<StageEvents>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const cameraInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const choose = (f: File | null | undefined) => {
    if (!f) return
    setPhoto(f)
    setEvents({})
    setError(null)
  }

  const run = async () => {
    if (!photo) return
    setRunning(true)
    setEvents({})
    setError(null)
    let reportId: number | null = null
    try {
      await streamReport(photo, place.lat, place.lng, (stage, ms, data) => {
        if (stage === 'result') reportId = (data as { id: number }).id
        setEvents((prev) => ({ ...prev, [stage]: { ms, data } }))
      })
      queryClient.invalidateQueries({ queryKey: ['map'] })
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      if (reportId !== null) onDone(place.lat, place.lng, reportId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setRunning(false)
    }
  }

  const doneCount = STAGE_ORDER.filter((s) => events[s]).length
  const started = running || doneCount > 0

  return (
    <div className="space-y-5">
      <section>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        {preview ? (
          <div className="relative overflow-hidden rounded-lg border border-line bg-ink">
            <img src={preview} alt="Selected flood photo" className="max-h-64 w-full object-contain" />
            {running && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="scan absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-white/15 to-transparent" />
              </div>
            )}
            {!running && (
              <button
                onClick={() => { setPhoto(null); setEvents({}) }}
                aria-label="Remove photo"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-white backdrop-blur hover:bg-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]) }}
            className={`rounded-lg border border-dashed px-5 py-7 text-center transition-colors ${dragging ? 'border-signal bg-signal-soft' : 'border-ink-4/60 bg-sunken'}`}
          >
            <p className="text-[15px] font-semibold text-ink">Photograph the flooded street</p>
            <p className="mx-auto mt-1 max-w-[290px] text-[12.5px] leading-snug text-ink-3">
              Frame a car, bike or bus wheel where it meets the water. That is what the depth is measured from.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={() => cameraInput.current?.click()}>
                <Camera size={15} strokeWidth={1.75} /> Take photo
              </Button>
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <ImageUp size={15} strokeWidth={1.75} /> Upload
              </Button>
            </div>
          </div>
        )}
        <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
          <LocateFixed size={12} />
          {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
          {!pos && <span className="text-warn">{denied ? '· location off, using Chennai centre' : '· locating…'}</span>}
        </p>
      </section>

      {photo && running && (
        <div className="relative overflow-hidden rounded-lg bg-ink px-3.5 py-2.5 text-[13.5px] font-medium text-white" role="status">
          <span
            className="absolute inset-y-0 left-0 bg-white/10 transition-all duration-500"
            style={{ width: `${(doneCount / STAGE_ORDER.length) * 100}%` }}
          />
          <span className="relative flex items-center justify-between">
            <span>Measuring…</span>
            <span className="font-mono text-[12px] text-white/70">
              {String(Math.min(doneCount + 1, STAGE_ORDER.length)).padStart(2, '0')} / 07
            </span>
          </span>
        </div>
      )}
      {photo && !running && (
        <Button onClick={run} className="w-full py-2.5">
          {started ? (
            <>
              <RotateCcw size={15} /> Measure again
            </>
          ) : (
            <>
              Measure depth <ArrowRight size={15} />
            </>
          )}
        </Button>
      )}
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}

      {started ? (
        <section className="enter">
          <Label className="mb-3">Survey log</Label>
          <SurveyLog
            events={events}
            running={running}
            photo={preview}
            onShow={() => events.result && onShow(place.lat, place.lng, events.result.data.id)}
          />
        </section>
      ) : (
        <Samples onPick={choose} selected={photo?.name ?? null} />
      )}

      {!started && (
        <section className="border-t border-line pt-4">
          <Label className="mb-2">How the reading is made</Label>
          <ol className="space-y-1.5 text-[12.5px] leading-snug text-ink-2">
            {[
              ['SAM 3.1', 'outlines the water and every wheel.'],
              ['Geometry', 'fits a circle to each visible rim and recovers the hidden part under water.'],
              ['Scale', 'the known wheel size turns pixels into centimetres, with an error bar.'],
              ['Muse Spark', 'checks it is a real, current flood before it reaches the map.'],
            ].map(([k, v], i) => (
              <li key={k} className="grid grid-cols-[22px_1fr]">
                <span className="font-mono text-[11px] text-ink-4">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="font-medium text-ink">{k}</span> {v}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
