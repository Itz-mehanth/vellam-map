import { useQuery } from '@tanstack/react-query'
import { Check, Layers } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TileLayer } from 'react-leaflet'
import { Label } from './ui'

export type BaseId = 'standard' | 'satellite' | 'terrain'
export type OverlayId = 'rain' | 'traffic' | 'zones'

export interface LayerState {
  base: BaseId
  overlays: Record<OverlayId, boolean>
}

const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_KEY as string | undefined

const BASES: { id: BaseId; label: string; hint: string; swatch: string }[] = [
  { id: 'standard', label: 'Streets', hint: 'Clean base for reading depths', swatch: 'linear-gradient(135deg,#ece9e0 0 55%,#d9d4c6 55% 62%,#ece9e0 62%)' },
  { id: 'satellite', label: 'Satellite', hint: 'See what is under the water', swatch: 'linear-gradient(135deg,#3b4a36,#6b7a52 45%,#8d8467)' },
  { id: 'terrain', label: 'Terrain', hint: 'Contours: where water collects', swatch: 'linear-gradient(135deg,#dfe8cf,#c6d6a9 40%,#e5dcc0)' },
]

const STORAGE_KEY = 'vellam-layers'
const DEFAULTS: LayerState = { base: 'standard', overlays: { rain: false, traffic: false, zones: true } }

export function loadLayers(): LayerState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved?.base && saved?.overlays) return { base: saved.base, overlays: { ...DEFAULTS.overlays, ...saved.overlays } }
  } catch {
    /* private mode or corrupt value: fall back */
  }
  return DEFAULTS
}

function saveLayers(s: LayerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/** The tile layers for the chosen base map and overlays. Rendered inside the MapContainer. */
export function MapLayers({ state }: { state: LayerState }) {
  const radar = useQuery({
    queryKey: ['radar'],
    enabled: state.overlays.rain,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const d = await (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json()
      const frame = d.radar.past[d.radar.past.length - 1]
      return { url: `${d.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, time: frame.time as number }
    },
  })

  return (
    <>
      {state.base === 'standard' && (
        <TileLayer
          key="standard"
          className="tiles-muted"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
      )}
      {state.base === 'satellite' && (
        <>
          <TileLayer
            key="satellite"
            attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          <TileLayer
            key="satellite-labels"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </>
      )}
      {state.base === 'terrain' && (
        <TileLayer
          key="terrain"
          attribution='Map data &copy; OpenStreetMap contributors, SRTM | Style &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
          url="https://tile.opentopomap.org/{z}/{x}/{y}.png"
          maxZoom={17}
          maxNativeZoom={17}
        />
      )}
      {state.overlays.rain && radar.data && (
        <TileLayer
          key={radar.data.url}
          url={radar.data.url}
          opacity={0.65}
          maxNativeZoom={7}
          maxZoom={19}
          zIndex={300}
          attribution='Radar &copy; <a href="https://www.rainviewer.com">RainViewer</a>'
        />
      )}
      {state.overlays.traffic && TOMTOM_KEY && (
        <TileLayer
          key="traffic"
          url={`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`}
          opacity={0.9}
          maxZoom={19}
          zIndex={310}
          attribution='Traffic &copy; <a href="https://www.tomtom.com">TomTom</a>'
        />
      )}
    </>
  )
}

function Toggle({ on, disabled, label, hint, onChange }: { on: boolean; disabled?: boolean; label: string; hint?: string; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className="flex w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${on ? 'border-ink bg-ink text-white' : 'border-ink-4 bg-surface'}`}>
        {on && <Check size={12} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint && <span className="block text-[11px] leading-tight text-ink-3">{hint}</span>}
      </span>
    </button>
  )
}

export function LayerControl({ state, onChange }: { state: LayerState; onChange: (s: LayerState) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const update = (next: LayerState) => {
    saveLayers(next)
    onChange(next)
  }
  const flip = (k: OverlayId) => update({ ...state, overlays: { ...state.overlays, [k]: !state.overlays[k] } })

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Map layers"
        className="flex h-[38px] items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-[var(--shadow-float)] hover:border-ink-4"
      >
        <Layers size={15} strokeWidth={1.75} />
        <span className="hidden sm:inline">Layers</span>
      </button>
      {open && (
        <div className="enter absolute right-0 top-[46px] w-[272px] rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow-float)]">
          <Label className="mb-2">Base map</Label>
          <div className="grid grid-cols-3 gap-2">
            {BASES.map((b) => (
              <button
                key={b.id}
                onClick={() => update({ ...state, base: b.id })}
                title={b.hint}
                aria-pressed={state.base === b.id}
                className="text-left"
              >
                <span className={`block h-12 rounded-md ${state.base === b.id ? 'ring-2 ring-ink ring-offset-1' : 'ring-1 ring-line'}`} style={{ background: b.swatch }} />
                <span className={`mt-1 block text-[12px] ${state.base === b.id ? 'font-semibold text-ink' : 'text-ink-2'}`}>{b.label}</span>
              </button>
            ))}
          </div>

          <Label className="mb-1 mt-4">Overlays</Label>
          <Toggle on={state.overlays.rain} onChange={() => flip('rain')} label="Rain radar" hint="Live rainfall, updated every few minutes" />
          <Toggle
            on={state.overlays.traffic && !!TOMTOM_KEY}
            disabled={!TOMTOM_KEY}
            onChange={() => flip('traffic')}
            label="Live traffic"
            hint={TOMTOM_KEY ? 'Congestion on roads (TomTom)' : 'Needs a TomTom key: set VITE_TOMTOM_KEY'}
          />
          <Toggle on={state.overlays.zones} onChange={() => flip('zones')} label="Alert zones" hint="600 m areas around flood alerts" />
        </div>
      )}
    </div>
  )
}
