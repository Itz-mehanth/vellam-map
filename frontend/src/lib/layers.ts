export type BaseId = 'standard' | 'satellite' | 'terrain'
export type OverlayId = 'rain' | 'traffic' | 'zones'

export interface LayerState {
  base: BaseId
  overlays: Record<OverlayId, boolean>
}

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

export function saveLayers(s: LayerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}
