import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { depthColour, type ReportFeature } from '../api'

const CHENNAI: [number, number] = [13.0827, 80.2707]

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

export function FloodMap({ reports, center }: { reports: ReportFeature[]; center?: [number, number] }) {
  return (
    <div className="relative h-[calc(100vh-9rem)] min-h-[440px] overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <MapContainer center={center ?? CHENNAI} zoom={center ? 14 : 12} className="h-full w-full">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
