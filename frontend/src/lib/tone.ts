export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'signal'

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  neutral: 'bg-line-2 text-ink-2',
  signal: 'bg-signal-soft text-signal',
}

export function toneClasses(tone: Tone) {
  return TONE[tone]
}
