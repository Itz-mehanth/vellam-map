import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import {
  depthColour,
  fetchMap,
  submitReport,
  type ReportFeature,
  type ReportResult,
  type Verdict,
} from './api'

const CHENNAI: [number, number] = [13.0827, 80.2707]

type Tone = 'green' | 'amber' | 'red' | 'slate' | 'blue'
const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
}

const STATUS: Record<string, { label: string; tone: Tone; text: string }> = {
  verified: { label: 'Verified', tone: 'green', text: 'Added to the live map.' },
  flood_unmeasured: {
    label: 'Flood confirmed',
    tone: 'amber',
    text: 'Water is real, but no usable reference object (such as a wheel) was found to measure depth.',
  },
  rejected_duplicate: { label: 'Duplicate', tone: 'red', text: 'This photo was already reported.' },
  rejected_not_flood: { label: 'Rejected', tone: 'red', text: 'This does not look like a real flood photo.' },
}

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}

function Card({ title, step, children }: { title: string; step?: number; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        {step && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] text-white">
            {step}
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Check({ ok, label }: { ok: boolean | undefined; label: string }) {
  const tone: Tone = ok === undefined ? 'slate' : ok ? 'green' : 'red'
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <Badge tone={tone}>{ok === undefined ? 'unknown' : ok ? 'yes' : 'no'}</Badge>
    </div>
  )
}

function useCurrentPosition() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('Location unavailable, using Chennai centre.'),
      { timeout: 10000 },
    )
  }, [])
  return { pos, error }
}

function VerdictList({ verdict, duplicate }: { verdict: Verdict; duplicate: number | null }) {
  const original =
    verdict.looks_staged_or_stock === undefined ? undefined : !verdict.looks_staged_or_stock
  return (
    <div className="divide-y divide-slate-100">
      <Check ok={verdict.is_flood} label="Real flood" />
      <Check ok={verdict.is_outdoor_street} label="Outdoor street" />
      <Check ok={original} label="Original photo (not stock or staged)" />
      <Check ok={duplicate === null} label="Not a duplicate" />
    </div>
  )
}

function ResultCards({ result }: { result: ReportResult }) {
  const m = result.measurement
  const status = STATUS[result.status] ?? { label: result.status, tone: 'slate' as Tone, text: '' }
  return (
    <>
      <Card title="Depth estimate" step={3}>
        {m.depth_cm !== null ? (
          <p className="text-4xl font-bold tracking-tight text-slate-900">
            {Math.round(m.depth_cm)}
            <span className="ml-1 text-lg font-medium text-slate-500">
              cm ± {Math.round(m.uncertainty_cm ?? 0)}
            </span>
          </p>
        ) : (
          <p className="text-sm text-slate-600">No measurable depth from this photo.</p>
        )}
        {result.verdict.water_depth_hint && (
          <p className="mt-2 text-sm text-slate-600">
            Muse Spark visual hint: <b className="capitalize">{result.verdict.water_depth_hint}-deep</b>
          </p>
        )}
      </Card>
      <Card title="Verification" step={4}>
        <VerdictList verdict={result.verdict} duplicate={result.duplicate_of} />
        {result.verdict.reason && (
          <p className="mt-2 text-sm italic text-slate-500">“{result.verdict.reason}”</p>
        )}
        <div className={`mt-4 rounded-lg p-3 text-sm ring-1 ring-inset ${TONES[status.tone]}`}>
          <b>{status.label}.</b> {status.text}
        </div>
      </Card>
    </>
  )
}

function ReportPanel() {
  const queryClient = useQueryClient()
  const { pos, error: geoError } = useCurrentPosition()
  const [photo, setPhoto] = useState<File | null>(null)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  const place = pos ?? { lat: CHENNAI[0], lng: CHENNAI[1] }

  const report = useMutation({
    mutationFn: (file: File) => submitReport(file, place.lat, place.lng),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['map'] }),
  })
  const result = report.data

  return (
    <div className="space-y-4">
      <Card title="Report a flooded street" step={1}>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
          <span className="text-sm font-medium text-slate-700">
            {photo ? photo.name : 'Choose or take a photo'}
          </span>
          <span className="mt-1 text-xs text-slate-500">
            Include a vehicle wheel or kerb in frame for depth
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              setPhoto(e.target.files?.[0] ?? null)
              report.reset()
            }}
          />
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Location: {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
          {geoError && <span className="text-amber-600"> · {geoError}</span>}
        </p>
        <button
          disabled={!photo || report.isPending}
          onClick={() => photo && report.mutate(photo)}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {report.isPending ? 'Analysing with SAM 3.1 and Muse Spark…' : 'Measure depth'}
        </button>
        {report.isError && <p className="mt-2 text-sm text-red-600">{report.error.message}</p>}
      </Card>

      {(preview || result) && (
        <Card title="Segmentation" step={2}>
          <div className="relative overflow-hidden rounded-lg bg-slate-100">
            <img
              src={result?.measurement.overlay ?? preview ?? ''}
              alt="Analysed flood photo"
              className="w-full"
            />
            {report.isPending && <div className="absolute inset-0 animate-pulse bg-blue-500/20" />}
          </div>
          {result && (
            <>
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                  Water
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-sm bg-orange-500" />
                  Wheel
                </span>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {result.measurement.objects.length === 0 && (
                  <li className="py-2 text-slate-500">No reference objects detected.</li>
                )}
                {result.measurement.objects.map((o, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="capitalize text-slate-700">
                      {o.type.replaceAll('_', ' ')}
                      {o.confidence !== null && (
                        <span className="ml-2 text-xs text-slate-400">{Math.round(o.confidence * 100)}%</span>
                      )}
                    </span>
                    {o.depth_cm !== null ? (
                      <Badge tone="green">{Math.round(o.depth_cm)} cm</Badge>
                    ) : (
                      <span className="text-right text-xs text-slate-500">{o.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {result && <ResultCards result={result} />}
    </div>
  )
}

function Legend() {
  const items: [string, string][] = [
    ['< 20 cm', '#22c55e'],
    ['20–50', '#eab308'],
    ['50–90', '#f97316'],
    ['90+', '#dc2626'],
    ['Unmeasured', '#64748b'],
  ]
  return (
    <div className="absolute bottom-4 left-4 z-[1000] flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-white/95 px-3 py-2 text-xs shadow ring-1 ring-slate-200">
      {items.map(([label, colour]) => (
        <span key={label} className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
          {label}
        </span>
      ))}
    </div>
  )
}

function FloodMap({ reports }: { reports: ReportFeature[] }) {
  return (
    <div className="relative h-[60vh] min-h-[420px] overflow-hidden rounded-xl border border-slate-200 shadow-sm lg:h-[calc(100vh-7.5rem)]">
      <MapContainer center={CHENNAI} zoom={12} className="h-full w-full">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {reports.map((f) => {
          const p = f.properties
          const [lng, lat] = f.geometry.coordinates
          return (
            <CircleMarker
              key={p.id}
              center={[lat, lng]}
              radius={13}
              pathOptions={{ color: '#fff', weight: 2, fillColor: depthColour(p.depth_cm), fillOpacity: 0.9 }}
            >
              <Popup>
                <b>
                  {p.depth_cm === null
                    ? 'Flooded, depth unknown'
                    : `~${Math.round(p.depth_cm)} ± ${Math.round(p.uncertainty_cm ?? 0)} cm`}
                </b>
                <br />
                {new Date(p.created_at * 1000).toLocaleString()}
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

export default function App() {
  const { data: reports = [], isError } = useQuery({
    queryKey: ['map'],
    queryFn: fetchMap,
    refetchInterval: 30000,
  })
  const measured = reports.filter((r) => r.properties.depth_cm !== null).length
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-lg text-white">
              🌊
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">Vellam Map</h1>
              <p className="text-xs text-slate-500">Photo-measured flood depth, mapped live</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge tone="blue">{reports.length} reports</Badge>
            <Badge tone="green">{measured} measured</Badge>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[420px_1fr]">
        <ReportPanel />
        <div>
          {isError && <p className="mb-2 text-sm text-red-600">Could not reach the API.</p>}
          <FloodMap reports={reports} />
        </div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-slate-400">
        Depths are estimates with uncertainty. The app never says a road is safe. Always follow official flood
        warnings.
      </footer>
    </div>
  )
}
