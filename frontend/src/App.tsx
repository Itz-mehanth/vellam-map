import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { depthColour, fetchMap, submitReport } from './api'

const CHENNAI: [number, number] = [13.0827, 80.2707]

const STATUS_TEXT: Record<string, string> = {
  verified: 'Verified and added to the map.',
  flood_unmeasured: 'Flood confirmed, but no reference object (e.g. a wheel) was usable to measure depth.',
  rejected_duplicate: 'Rejected: this photo was already reported.',
  rejected_not_flood: 'Rejected: this does not look like a real flood photo.',
}

function ReportForm() {
  const queryClient = useQueryClient()
  const [photo, setPhoto] = useState<File | null>(null)
  const report = useMutation({
    mutationFn: async (file: File) => {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }),
      )
      return submitReport(file, pos.coords.latitude, pos.coords.longitude)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['map'] }),
  })

  return (
    <section className="rounded-lg bg-white p-4 shadow">
      <h2 className="font-semibold">Report a flooded street</h2>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="mt-2 block w-full text-sm"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
      />
      <button
        disabled={!photo || report.isPending}
        onClick={() => photo && report.mutate(photo)}
        className="mt-3 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {report.isPending ? 'Measuring…' : 'Measure depth'}
      </button>
      {report.isError && (
        <p className="mt-2 text-sm text-red-600">
          {report.error instanceof GeolocationPositionError
            ? 'Location is needed to place the report on the map.'
            : report.error.message}
        </p>
      )}
      {report.data && (
        <div className="mt-3 text-sm">
          {report.data.measurement.depth_cm !== null && (
            <p className="text-2xl font-bold">
              ~{Math.round(report.data.measurement.depth_cm)} cm
              <span className="text-base font-normal text-slate-500">
                {' '}± {Math.round(report.data.measurement.uncertainty_cm ?? 0)}
              </span>
            </p>
          )}
          <p>{STATUS_TEXT[report.data.status] ?? report.data.status}</p>
          {report.data.verdict.reason && <p className="text-slate-500">{report.data.verdict.reason}</p>}
        </div>
      )}
    </section>
  )
}

function FloodMap() {
  const { data = [] } = useQuery({ queryKey: ['map'], queryFn: fetchMap, refetchInterval: 30000 })
  return (
    <MapContainer center={CHENNAI} zoom={12} className="h-[60vh] w-full rounded-lg shadow">
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {data.map((f) => {
        const p = f.properties
        const [lng, lat] = f.geometry.coordinates
        return (
          <CircleMarker
            key={p.id}
            center={[lat, lng]}
            radius={12}
            pathOptions={{ color: depthColour(p.depth_cm), fillOpacity: 0.7 }}
          >
            <Popup>
              <strong>
                {p.depth_cm === null
                  ? 'Flooded, depth unknown'
                  : `~${Math.round(p.depth_cm)} ± ${Math.round(p.uncertainty_cm ?? 0)} cm`}
              </strong>
              <br />
              {new Date(p.created_at * 1000).toLocaleString()}
              <br />
              <em>Estimate only. Follow official warnings.</em>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}

export default function App() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 bg-slate-50 p-4 text-slate-900">
      <header>
        <h1 className="text-2xl font-bold">Vellam Map</h1>
        <p className="text-slate-600">
          Photograph a flooded street. Know how deep it is. Warn your neighbours.
        </p>
      </header>
      <ReportForm />
      <FloodMap />
    </main>
  )
}
