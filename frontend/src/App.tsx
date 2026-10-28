import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { STAGE_ORDER, fetchMap, streamReport, type StageEvents } from './api'
import { FloodMap } from './components/MapView'
import { Pipeline } from './components/Stages'
import { Badge } from './components/ui'

const CHENNAI = { lat: 13.0827, lng: 80.2707 }

interface Sample {
  file: string
  label: string
  license: string
  author: string
  source: string
  control: boolean
}

function useCurrentPosition() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('Location unavailable, using Chennai centre'),
      { timeout: 10000 },
    )
  }, [])
  return { pos, error }
}

function SampleGallery({ onPick, selected }: { onPick: (f: File) => void; selected: string | null }) {
  const { data: samples = [] } = useQuery({
    queryKey: ['samples'],
    queryFn: async (): Promise<Sample[]> => (await fetch('/samples/samples.json')).json(),
  })
  const active = samples.find((s) => s.file === selected)
  const pick = async (s: Sample) => {
    const blob = await (await fetch(`/samples/${s.file}`)).blob()
    onPick(new File([blob], s.file, { type: 'image/jpeg' }))
  }
  if (!samples.length) return null
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Or try a sample photo</p>
      <div className="grid grid-cols-6 gap-1.5">
        {samples.map((s) => (
          <button
            key={s.file}
            title={s.label}
            onClick={() => pick(s)}
            className={`relative aspect-square overflow-hidden rounded-md ring-2 transition ${
              selected === s.file ? 'ring-blue-600' : 'ring-transparent hover:ring-slate-300'
            }`}
          >
            <img src={`/samples/${s.file}`} alt={s.label} loading="lazy" className="h-full w-full object-cover" />
            {s.control && <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 text-[9px] text-white">control</span>}
          </button>
        ))}
      </div>
      {active && (
        <p className="mt-2 text-xs text-slate-500">
          <b className="text-slate-700">{active.label}</b> · {active.license} · {active.author} ·{' '}
          <a href={active.source} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            Wikimedia Commons
          </a>
        </p>
      )}
    </div>
  )
}

function Analyse({ onViewMap }: { onViewMap: (at: [number, number]) => void }) {
  const queryClient = useQueryClient()
  const { pos, error: geoError } = useCurrentPosition()
  const place = pos ?? CHENNAI
  const [photo, setPhoto] = useState<File | null>(null)
  const [events, setEvents] = useState<StageEvents>({})
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pipelineRef = useRef<HTMLDivElement>(null)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const choose = (f: File | null) => {
    setPhoto(f)
    setEvents({})
    setError(null)
  }

  const run = async () => {
    if (!photo) return
    setRunning(true)
    setEvents({})
    setError(null)
    pipelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    try {
      await streamReport(photo, place.lat, place.lng, (stage, ms, data) =>
        setEvents((prev) => ({ ...prev, [stage]: { ms, data } })),
      )
      queryClient.invalidateQueries({ queryKey: ['map'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setRunning(false)
    }
  }

  const started = running || Object.keys(events).length > 0
  const doneCount = STAGE_ORDER.filter((s) => events[s]).length

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold">1 · Choose a flood photo</h2>
          <label className="group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-center transition hover:border-blue-400">
            {preview ? (
              <>
                <img src={preview} alt="Selected" className="max-h-60 w-full object-cover" />
                {running && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="scan-line absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-blue-400/40 to-transparent" />
                  </div>
                )}
              </>
            ) : (
              <div className="px-4 py-8">
                <p className="text-sm font-medium text-slate-700">Drop, choose or take a photo</p>
                <p className="mt-1 text-xs text-slate-500">Include a vehicle wheel at the waterline for a depth reading</p>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
            {geoError && <span className="text-amber-600"> · {geoError}</span>}
          </p>
          <button
            disabled={!photo || running}
            onClick={run}
            className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {running ? `Running stage ${Math.min(doneCount + 1, STAGE_ORDER.length)} of ${STAGE_ORDER.length}…` : started ? 'Run again' : 'Measure depth'}
          </button>
          {error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <SampleGallery onPick={choose} selected={photo?.name ?? null} />
          </div>
        </section>
      </aside>

      <div ref={pipelineRef} className="scroll-mt-4">
        {started ? (
          <Pipeline events={events} running={running} photo={preview} onViewMap={() => onViewMap([place.lat, place.lng])} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
            <p className="text-lg font-semibold text-slate-800">How a photo becomes a depth</p>
            <ol className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm text-slate-600">
              <li><b>1.</b> SAM 3.1 outlines the water and any wheels.</li>
              <li><b>2.</b> A circle is fitted to each wheel's visible rim to recover its hidden lower part.</li>
              <li><b>3.</b> Real wheel size turns pixels into centimetres, and estimates are fused with their uncertainty.</li>
              <li><b>4.</b> Muse Spark checks the photo is a real, original flood before it reaches the map.</li>
            </ol>
            <p className="mt-5 text-xs text-slate-400">Pick a photo or a sample on the left to watch it happen live.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const { data: reports = [], isError } = useQuery({ queryKey: ['map'], queryFn: fetchMap, refetchInterval: 30000 })
  const [tab, setTab] = useState<'analyse' | 'map'>('analyse')
  const [focus, setFocus] = useState<[number, number] | undefined>()
  const measured = reports.filter((r) => r.properties.depth_cm !== null).length
  const tabClass = (t: string) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-lg text-white">🌊</div>
            <div>
              <h1 className="text-base font-bold leading-tight">Vellam Map</h1>
              <p className="hidden text-xs text-slate-500 sm:block">Photo-measured flood depth, mapped live</p>
            </div>
          </div>
          <nav className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button className={tabClass('analyse')} onClick={() => setTab('analyse')}>Analyse</button>
            <button className={tabClass('map')} onClick={() => setTab('map')}>Live map</button>
          </nav>
          <div className="hidden gap-2 md:flex">
            <Badge tone="blue">{reports.length} reports</Badge>
            <Badge tone="green">{measured} measured</Badge>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">
        {isError && <p className="mb-2 text-sm text-red-600">Could not reach the API.</p>}
        <div className={tab === 'analyse' ? '' : 'hidden'}>
          <Analyse
            onViewMap={(at) => {
              setFocus(at)
              setTab('map')
            }}
          />
        </div>
        {tab === 'map' && <FloodMap key={focus?.join() ?? 'default'} reports={reports} center={focus} />}
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-slate-400">
        Depths are estimates with uncertainty. The app never says a road is safe. Always follow official flood warnings.
      </footer>
    </div>
  )
}
