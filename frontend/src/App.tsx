import { useQuery } from '@tanstack/react-query'
import { Camera, Mic, Radio } from 'lucide-react'
import { useRef, useState } from 'react'
import { fetchAlerts, fetchMap } from './api'
import { AskPanel } from './components/AskPanel'
import { LivePanel } from './components/LivePanel'
import { ReportDetail } from './components/ReportDetail'
import { Wordmark } from './components/Logo'
import { MapStage, type FlyTarget } from './components/MapStage'
import { ReportPanel } from './components/ReportPanel'
import { Segmented } from './components/ui'
import { sinceLabel } from './lib/depth'

type Tab = 'live' | 'report' | 'ask'

function LiveStatus({ count, updatedAt, error }: { count: number; updatedAt: number; error: boolean }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
      <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-bad' : 'live-dot bg-ok'}`} />
      {error ? (
        <span className="text-bad">offline</span>
      ) : (
        <span>
          <span className="text-ink-2">LIVE</span>
          <span className="hidden sm:inline"> · {count} reports · updated {updatedAt ? sinceLabel(updatedAt / 1000) : '—'}</span>
        </span>
      )}
    </div>
  )
}

export default function App() {
  const map = useQuery({ queryKey: ['map'], queryFn: fetchMap, refetchInterval: 30000 })
  const alertsQ = useQuery({ queryKey: ['alerts'], queryFn: fetchAlerts, refetchInterval: 30000 })
  const reports = map.data ?? []
  const alerts = alertsQ.data ?? []
  // Home-screen shortcuts open straight into /?tab=report or /?tab=ask.
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    return t === 'report' || t === 'ask' ? t : 'live'
  })
  const [target, setTarget] = useState<FlyTarget | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const fly = (lat: number, lng: number, id?: number) => {
    setTarget({ lat, lng, id, nonce: Date.now() })
    if (id !== undefined) openReport(id)
    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Selecting a report from the map, the feed or an answer opens its evidence in the Live tab.
  const openReport = (id: number) => {
    setSelectedId(id)
    setTab('live')
    panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const tabs = [
    { value: 'live' as Tab, label: <><Radio size={14} strokeWidth={1.75} /> Live{alerts.length > 0 && <span className="rounded bg-gauge px-1 font-mono text-[10px] leading-4 text-white">{alerts.length}</span>}</> },
    { value: 'report' as Tab, label: <><Camera size={14} strokeWidth={1.75} /> Report</> },
    { value: 'ask' as Tab, label: <><Mic size={14} strokeWidth={1.75} /> Ask</> },
  ]

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <header className="sticky top-0 z-[1200] flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface/95 px-4 backdrop-blur lg:static">
        <div className="flex items-center gap-4">
          <Wordmark />
          <span className="hidden h-5 w-px bg-line sm:block" />
          <span className="hidden text-[13px] text-ink-2 sm:block">Chennai</span>
        </div>
        <LiveStatus count={reports.length} updatedAt={map.dataUpdatedAt} error={map.isError} />
      </header>

      <div className="relative flex-1 lg:min-h-0">
        <div className="h-[46svh] min-h-[300px] lg:absolute lg:inset-0 lg:h-auto">
          <MapStage reports={reports} alerts={alerts} target={target} selectedId={selectedId} onSelect={openReport} />
        </div>

        <aside className="relative z-[1100] -mt-4 flex flex-col rounded-t-2xl border-t border-line bg-surface lg:absolute lg:bottom-4 lg:left-4 lg:top-4 lg:mt-0 lg:w-[440px] lg:rounded-xl lg:border lg:shadow-[var(--shadow-float)]">
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line lg:hidden" />
          <div className="sticky top-14 z-10 border-b border-line-2 bg-surface px-4 py-3 lg:static lg:rounded-t-xl">
            <Segmented full value={tab} onChange={setTab} options={tabs} />
          </div>
          <div ref={panelRef} className="scroll-quiet flex-1 px-4 pb-8 pt-4 lg:overflow-y-auto">
            <div className={tab === 'live' ? 'enter space-y-6' : 'hidden'}>
              {selectedId !== null && <ReportDetail key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} />}
              <LivePanel reports={reports} alerts={alerts} onFly={fly} selectedId={selectedId} />
            </div>
            <div className={tab === 'report' ? 'enter' : 'hidden'}>
              <ReportPanel onDone={(lat, lng, id) => { setTarget({ lat, lng, id, nonce: Date.now() }); setSelectedId(id) }} onShow={fly} />
            </div>
            <div className={tab === 'ask' ? 'enter' : 'hidden'}>
              <AskPanel onFly={fly} />
            </div>
          </div>
          <p className="border-t border-line-2 px-4 py-2.5 text-[11px] leading-snug text-ink-3">
            Depths are estimates with an error range. Vellam never says a road is safe. Follow official flood warnings.
          </p>
        </aside>
      </div>
    </div>
  )
}
