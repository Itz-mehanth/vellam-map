import { ArrowUpRight, CornerDownLeft, Mic, Square, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MAX_RECORD_SECONDS, speak, startRecording, type Recorder } from '../audio'
import { ask, type AskResult } from '../api'
import { ageLabel } from '../lib/depth'
import { DepthPill, Label, Segmented, Spinner } from './ui'

type Lang = 'auto' | 'English' | 'Tamil'

const SUGGESTIONS = [
  'Is Velachery main road passable by bike?',
  'வேளச்சேரி மெயின் ரோட்டில் பைக்கில் போக முடியுமா?',
  'Which areas near Adyar are flooded right now?',
  'Can a car get through Medavakkam Main Road?',
]

const BARS = 56

/** Live input level from the microphone, scrolling like a recorder's meter. */
function Waveform({ stream }: { stream: MediaStream | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx2d = el.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const levels: number[] = Array(BARS).fill(0)
    const draw = () => {
      // Size from layout on every draw: the panel may mount hidden at 0 px wide.
      if (el.width !== el.clientWidth * dpr) el.width = el.clientWidth * dpr
      if (el.height !== el.clientHeight * dpr) el.height = el.clientHeight * dpr
      const { width: w, height: h } = el
      ctx2d.clearRect(0, 0, w, h)
      const gap = w / BARS
      levels.forEach((lv, i) => {
        const bh = Math.max(2 * dpr, lv * h * 0.9)
        ctx2d.fillStyle = stream ? (i > BARS - 8 ? '#d3263a' : '#0d1b26') : '#c9cdd1'
        ctx2d.fillRect(i * gap + gap * 0.25, (h - bh) / 2, gap * 0.5, bh)
      })
    }
    const resize = new ResizeObserver(draw)
    resize.observe(el)
    if (!stream) {
      draw()
      return () => resize.disconnect()
    }
    const audio = new AudioContext()
    const analyser = audio.createAnalyser()
    analyser.fftSize = 1024
    audio.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let raf = 0
    let frame = 0
    const tick = () => {
      if (frame++ % 3 === 0) {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += ((v - 128) / 128) ** 2
        levels.shift()
        levels.push(Math.min(1, Math.sqrt(sum / data.length) * 4.5))
        draw()
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      audio.close()
    }
  }, [stream])
  return <canvas ref={canvas} className="h-12 w-full" aria-hidden="true" />
}

export function AskPanel({ onFly }: { onFly: (lat: number, lng: number, id?: number) => void }) {
  const [lang, setLang] = useState<Lang>('auto')
  const [recording, setRecording] = useState<Recorder | null>(null)
  const [thinking, setThinking] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [text, setText] = useState('')
  const [result, setResult] = useState<AskResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<Recorder | null>(null)

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250)
    return () => window.clearInterval(t)
  }, [recording])

  const send = async (input: Parameters<typeof ask>[0]) => {
    setThinking(true)
    setError(null)
    try {
      setResult(await ask({ ...input, language: lang === 'auto' ? undefined : lang }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not answer')
    } finally {
      setThinking(false)
    }
  }

  // Reads the recorder from a ref, so the 20-second auto-stop always stops the current recording.
  const stopAndSend = async () => {
    const rec = recorderRef.current
    if (!rec) return
    recorderRef.current = null
    setRecording(null)
    send({ audio: await rec.stop() })
  }

  const startMic = async () => {
    try {
      const rec = await startRecording(stopAndSend)
      recorderRef.current = rec
      setElapsed(0)
      setResult(null)
      setError(null)
      setRecording(rec)
    } catch {
      setError('Microphone unavailable. Allow access in the browser, or type the question.')
    }
  }

  const busy = thinking || recording !== null
  const tamil = (s: string) => /[஀-௿]/.test(s)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-ink">Ask about a street</p>
          <p className="text-[12.5px] text-ink-3">Answers come only from current reports.</p>
        </div>
        <Segmented<Lang>
          size="sm"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'English', label: 'EN' },
            { value: 'Tamil', label: 'தமிழ்' },
          ]}
        />
      </div>

      <section className="rounded-xl border border-line bg-sunken p-4">
        <div className="flex items-center gap-4">
          <button
            onClick={recording ? stopAndSend : startMic}
            disabled={thinking}
            aria-label={recording ? 'Stop and send' : 'Record a question'}
            className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:opacity-40 ${
              recording ? 'bg-gauge' : 'bg-ink hover:bg-[#1c2d3a]'
            }`}
          >
            {recording ? <Square size={16} fill="currentColor" /> : <Mic size={20} strokeWidth={1.75} />}
          </button>
          <div className="min-w-0 flex-1">
            <Waveform stream={recording?.stream ?? null} />
            <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3">
              <span>
                {recording ? 'Listening · tap to send' : thinking ? 'Transcribing and reading the map…' : 'Tap to speak, Tamil or English'}
              </span>
              <span className={recording ? 'text-gauge' : ''}>
                0:{String(recording ? elapsed : 0).padStart(2, '0')} / 0:{MAX_RECORD_SECONDS}
              </span>
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim() && !busy) send({ question: text.trim() })
          }}
          className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-surface pl-3 focus-within:border-ink-4"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Or type: Is Mount Road flooded near Saidapet?"
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-4"
          />
          <button
            disabled={!text.trim() || busy}
            aria-label="Ask"
            className="m-1 flex h-8 w-8 items-center justify-center rounded-md bg-ink text-white disabled:bg-line disabled:text-ink-4"
          >
            {thinking ? <Spinner /> : <CornerDownLeft size={14} />}
          </button>
        </form>
      </section>

      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}

      {result ? (
        <article className="enter space-y-4">
          <div>
            <Label>{result.transcribed ? 'Heard' : 'Asked'}</Label>
            <p className={`mt-1 text-[13.5px] text-ink-2 ${tamil(result.question) ? 'leading-relaxed' : ''}`}>“{result.question}”</p>
          </div>
          <div className="border-l-2 border-ink pl-4">
            <p className={`whitespace-pre-line text-[16px] text-ink ${tamil(result.answer) ? 'leading-[1.75]' : 'leading-relaxed'}`}>{result.answer}</p>
            <button
              onClick={() => speak(result.answer, tamil(result.answer) ? 'ta-IN' : 'en-IN') || setError('This device has no voice for that language.')}
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3 hover:text-ink"
            >
              <Volume2 size={13} /> Read aloud
            </button>
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <Label>Sources</Label>
              <span className="font-mono text-[11px] text-ink-3">
                {result.sources.length} of {result.reports_considered} reports
              </span>
            </div>
            {result.sources.length === 0 ? (
              <p className="text-[12.5px] text-ink-3">No report matched this question.</p>
            ) : (
              <ol className="-mx-2">
                {result.sources.map((s, i) => (
                  <li key={s.id}>
                    <button onClick={() => onFly(s.lat, s.lng, s.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-sunken">
                      <span className="w-4 font-mono text-[11px] text-ink-4">{i + 1}</span>
                      <DepthPill
                        size="sm"
                        depth={{ value: s.depth_cm, kind: s.source === 'visual' ? 'visual' : s.depth_cm === null ? 'none' : 'measured', uncertainty: null }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.place}</span>
                      <span className="font-mono text-[11px] text-ink-3">{ageLabel(s.age_min * 60)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </article>
      ) : (
        !busy && (
          <section>
            <Label className="mb-1">Try asking</Label>
            <ul className="-mx-2">
              {SUGGESTIONS.map((q) => (
                <li key={q}>
                  <button
                    onClick={() => {
                      setText(q)
                      send({ question: q })
                    }}
                    className="group flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-[13.5px] text-ink-2 hover:bg-sunken hover:text-ink"
                  >
                    <span>{q}</span>
                    <ArrowUpRight size={14} className="shrink-0 text-ink-4 group-hover:text-ink" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  )
}
