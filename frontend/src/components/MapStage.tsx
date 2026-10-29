import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet'
import type { Alert, ReportFeature } from '../api'
import { BANDS, UNKNOWN_COLOUR, depthColour, freshness, reportDepth, sinceLabel } from '../lib/depth'
import { LayerControl, MapLayers, loadLayers, type LayerState } from './LayerControl'
import { Label } from './ui'

const CHENNAI: [number, number] = [13.0, 80.21]
const PANEL_OFFSET_PX = 228 // half the desktop side panel, so targets land in the visible map

export interface FlyTarget {
  lat: number
  lng: number
  zoom?: number
  id?: number
  nonce: number
}

function FlyTo({ target }: { target: FlyTarget | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    // Slide to the place and keep the zoom the person chose: tapping a report should never jump the view.
    const zoom = target.zoom ?? map.getZoom()
    const offset = window.innerWidth >= 1024 ? PANEL_OFFSET_PX : 0
    const point = map.project([target.lat, target.lng], zoom).subtract([offset, 0])
    map.panTo(map.unproject(point, zoom), { duration: 0.5, easeLinearity: 0.4 })
  }, [target, map])
  return null
}

/** On first load, frame every report in the part of the map the panel does not cover. */
function FitOnce({ reports }: { reports: ReportFeature[] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || reports.length === 0) return
    done.current = true
    const desktop = window.innerWidth >= 1024
    // Frame the main cluster: one stray report on another continent must not zoom the view out to the world.
    const pts = reports.map((r) => [r.geometry.coordinates[1], r.geometry.coordinates[0]] as [number, number])
    const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]
    const centre = L.latLng(med(pts.map((q) => q[0])), med(pts.map((q) => q[1])))
    const near = pts.filter((q) => centre.distanceTo(q) < 100_000)
    const bounds = L.latLngBounds(near.length ? near : pts)
    map.fitBounds(bounds, {
      paddingTopLeft: [desktop ? 500 : 28, 48],
      paddingBottomRight: [desktop ? 240 : 28, 48],
      maxZoom: 14,
      animate: false,
    })
  }, [reports, map])
  return null
}

function pinIcon(f: ReportFeature, selected: boolean) {
  const d = reportDepth(f.properties)
  const colour = depthColour(d.value)
  const text = d.value === null ? '?' : `${d.kind === 'visual' ? '~' : ''}${Math.round(d.value)}`
  const cls = ['pin', d.kind === 'visual' ? 'pin-visual' : '', selected ? 'pin-selected' : ''].join(' ')
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<span class="${cls}" style="--c:${colour};opacity:${freshness(f.properties.created_at)}">${text}</span>`,
  })
}

function ReportPopup({ f }: { f: ReportFeature }) {
  const p = f.properties
  const d = reportDepth(p)
  return (
    <div className="w-52 p-3">
      <Label>{d.kind === 'visual' ? 'Visual estimate' : d.kind === 'measured' ? 'Measured depth' : 'Flooding reported'}</Label>
      <p className="mt-1 font-mono text-[22px] font-semibold leading-none" style={{ color: depthColour(d.value) }}>
        {d.value === null
          ? '—'
          : d.kind === 'visual'
            ? `${Math.round(d.low ?? 0)}–${Math.round(d.high ?? 0)}`
            : Math.round(d.value)}
        {d.value !== null && <span className="ml-1 text-[12px] font-normal text-ink-3">{d.kind === 'measured' ? `± ${Math.round(d.uncertainty ?? 0)} cm` : 'cm'}</span>}
      </p>
      <p className="mt-2 text-[13px] font-medium text-ink">{p.place ?? `${f.geometry.coordinates[1].toFixed(4)}, ${f.geometry.coordinates[0].toFixed(4)}`}</p>
      <p className="font-mono text-[11px] text-ink-3">
        {sinceLabel(p.created_at)}
        {p.status === 'flood_review' && ' · under review'}
        {p.demo && ' · demo data'}
      </p>
    </div>
  )
}

const LEVEL_COLOUR: Record<Alert['level'], string> = {
  danger: BANDS[3].colour,
  high: BANDS[2].colour,
  caution: BANDS[1].colour,
  low: BANDS[0].colour,
  info: UNKNOWN_COLOUR,
}

function Legend() {
  return (
    <div className="pointer-events-auto rounded-lg border border-line bg-surface/95 px-3 py-2.5 shadow-[var(--shadow-float)] backdrop-blur">
      <Label>Water depth</Label>
      <ul className="mt-1.5 space-y-1">
        {BANDS.map((b) => (
          <li key={b.key} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.colour }} />
            <span className="w-12 text-ink">{b.label}</span>
            <span className="font-mono text-[11px] text-ink-3">{b.range}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 pt-1 text-[11.5px] text-ink-3">
          <span className="h-2.5 w-2.5 rounded-full border border-dashed border-ink-3" />
          ~ visual guess
        </li>
      </ul>
    </div>
  )
}

export function MapStage({
  reports,
  alerts,
  target,
  selectedId,
  onSelect,
}: {
  reports: ReportFeature[]
  alerts: Alert[]
  target: FlyTarget | null
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const [layers, setLayers] = useState<LayerState>(loadLayers)
  // Older first, so the newest pins draw on top.
  const ordered = useMemo(() => [...reports].sort((a, b) => a.properties.created_at - b.properties.created_at), [reports])
  return (
    <div className="relative h-full w-full">
      <MapContainer center={CHENNAI} zoom={12} zoomControl={false} className="h-full w-full" attributionControl>
        <MapLayers state={layers} />
        <ZoomControl position="bottomright" />
        <FlyTo target={target} />
        <FitOnce reports={reports} />
        {layers.overlays.zones && alerts.map((a, i) => (
          <Circle
            key={`a${i}`}
            center={[a.lat, a.lng]}
            radius={600}
            interactive={false}
            pathOptions={{ stroke: false, fillColor: LEVEL_COLOUR[a.level], fillOpacity: 0.1 }}
          />
        ))}
        {ordered.map((f) => (
          <Marker
            key={f.properties.id}
            position={[f.geometry.coordinates[1], f.geometry.coordinates[0]]}
            icon={pinIcon(f, f.properties.id === selectedId)}
            zIndexOffset={f.properties.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(f.properties.id) }}
          >
            <Popup offset={[0, -6]} closeButton={false}>
              <ReportPopup f={f} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="absolute right-3 top-3 z-[500]">
        <LayerControl state={layers} onChange={setLayers} />
      </div>
      <div className="pointer-events-none absolute bottom-6 right-[60px] z-[500] hidden sm:block">
        <Legend />
      </div>
    </div>
  )
}
