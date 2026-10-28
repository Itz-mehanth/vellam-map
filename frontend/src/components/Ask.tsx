import { useRef, useState } from 'react'
import { MAX_RECORD_SECONDS, speak, startRecording, type Recorder } from '../audio'
import { ask, type AskResult } from '../api'
import { Badge } from './ui'

const LANGUAGES = [
  { id: '', label: 'Auto-detect', speech: 'en-IN' },
  { id: 'English', label: 'English', speech: 'en-IN' },
  { id: 'Tamil', label: 'தமிழ் Tamil', speech: 'ta-IN' },
]

const EXAMPLES = [
  'Is Velachery main road passable by bike?',
  'வேளச்சேரி மெயின் ரோட்டில் பைக்கில் போக முடியுமா?',
  'Which areas near Adyar are flooded right now?',
  'Can a car go through Medavakkam Main Road?',
]

type Phase = 'idle' | 'recording' | 'thinking'

export function Ask({ onShowOnMap }: { onShowOnMap: (at: [number, number]) => void }) {
  const [language, setLanguage] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [result, setResult] = useState<AskResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [spoken, setSpoken] = useState<boolean | null>(null)
  const recorder = useRef<Recorder | null>(null)
  const speechLang = LANGUAGES.find((l) => l.id === language)?.speech ?? 'en-IN'

  const send = async (input: Parameters<typeof ask>[0]) => {
    setPhase('thinking')
    setError(null)
    setSpoken(null)
    try {
      const r = await ask({ ...input, language: language || undefined })
      setResult(r)
      // Answers in Tamil script are read with a Tamil voice when the device has one.
      setSpoken(speak(r.answer, /[஀-௿]/.test(r.answer) ? 'ta-IN' : speechLang))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setPhase('idle')
    }
  }

  const toggleMic = async () => {
    if (phase === 'recording' && recorder.current) {
      const rec = recorder.current
      recorder.current = null
      setPhase('thinking')
      send({ audio: await rec.stop() })
      return
    }
    try {
      recorder.current = await startRecording(toggleMic)
      setResult(null)
      setError(null)
      setPhase('recording')
    } catch {
      setError('Microphone unavailable. Allow access, or type your question below.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ask about a road</h2>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                onClick={() => setLanguage(l.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${language === l.id ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="my-6 flex flex-col items-center gap-3">
          <button
            onClick={toggleMic}
            disabled={phase === 'thinking'}
            aria-label={phase === 'recording' ? 'Stop recording' : 'Start recording'}
            className={`relative flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow-lg transition disabled:opacity-50 ${
              phase === 'recording' ? 'bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {phase === 'recording' && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/50" />}
            <span className="relative">{phase === 'recording' ? '■' : '🎙'}</span>
          </button>
          <p className="text-sm text-slate-600">
            {phase === 'recording'
              ? `Listening… tap to stop (max ${MAX_RECORD_SECONDS}s)`
              : phase === 'thinking'
                ? 'Transcribing and checking the live map…'
                : 'Tap and ask in Tamil or English'}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) send({ question: text.trim() })
          }}
          className="flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="…or type your question"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            disabled={!text.trim() || phase !== 'idle'}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            Ask
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((q) => (
            <button
              key={q}
              onClick={() => {
                setText(q)
                send({ question: q })
              }}
              disabled={phase !== 'idle'}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      </section>

      {result && (
        <section className="fade-in space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{result.transcribed ? 'You said' : 'You asked'}</p>
            <p className="text-sm text-slate-800">“{result.question}”</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-4 ring-1 ring-inset ring-blue-100">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-900">{result.answer}</p>
          </div>
          {spoken === false && <p className="text-xs text-slate-400">This device has no voice for that language, so the answer is text only.</p>}
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-500">
              Based on {result.sources.length} of {result.reports_considered} recent reports
            </p>
            <ul className="space-y-1.5">
              {result.sources.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{s.place}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={s.source === 'measured' ? 'green' : 'amber'}>
                      {s.depth_cm === null ? '?' : `${s.source === 'visual' ? '~' : ''}${Math.round(s.depth_cm)} cm`}
                    </Badge>
                    <span className="text-xs text-slate-400">{s.age_min} min ago</span>
                    <button onClick={() => onShowOnMap([s.lat, s.lng])} className="text-xs font-medium text-blue-600 hover:underline">
                      map
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-400">Estimates only. This app never says a road is safe. Follow official flood warnings.</p>
        </section>
      )}
    </div>
  )
}
