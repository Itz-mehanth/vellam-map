import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { ReportDepth } from '../lib/depth'
import { depthColour } from '../lib/depth'

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral' | 'signal'

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  neutral: 'bg-line-2 text-ink-2',
  signal: 'bg-signal-soft text-signal',
}

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wide ${TONE[tone]}`}>
      {children}
    </span>
  )
}

export function toneClasses(tone: Tone) {
  return TONE[tone]
}

/** Small caps-style label used for every section and readout. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-3 ${className}`}>{children}</p>
}

/** Spec-sheet grid: hairline-separated readouts, like an instrument's data plate. */
export function Readouts({ items, cols = 2 }: { items: { label: string; value: ReactNode; hint?: ReactNode }[]; cols?: 2 | 3 | 4 }) {
  const grid = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' }[cols]
  return (
    <dl className={`grid ${grid} overflow-hidden rounded-lg border border-line bg-line [gap:1px]`}>
      {items.map((it) => (
        <div key={it.label} className="bg-surface px-3 py-2.5">
          <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">{it.label}</dt>
          <dd className="mt-0.5 truncate text-[13.5px] font-medium text-ink">{it.value}</dd>
          {it.hint && <dd className="truncate text-[11px] text-ink-3">{it.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const v = {
    primary: 'bg-ink text-white hover:bg-[#1c2d3a] disabled:bg-line disabled:text-ink-4',
    secondary: 'border border-line bg-surface text-ink hover:border-ink-4 disabled:text-ink-4',
    ghost: 'text-ink-2 hover:bg-line-2 disabled:text-ink-4',
  }[variant]
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed ${v} ${className}`}
    />
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  full = false,
}: {
  full?: boolean
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className={`${full ? 'flex w-full' : 'inline-flex'} rounded-lg bg-line-2 p-0.5`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all ${full ? 'flex-1' : ''} ${
            size === 'sm' ? 'px-2 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]'
          } ${value === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(13_27_38/0.08)]' : 'text-ink-3 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The depth itself as a coloured pill: solid when measured, outlined with "~" when only guessed by eye. */
export function DepthPill({ depth, size = 'md' }: { depth: ReportDepth; size?: 'sm' | 'md' }) {
  const colour = depthColour(depth.value)
  const pad = size === 'sm' ? 'min-w-[38px] px-1.5 py-px text-[11px]' : 'min-w-[46px] px-2 py-0.5 text-[12px]'
  if (depth.value === null)
    return <span className={`inline-flex justify-center rounded-full bg-line-2 font-mono font-semibold text-ink-3 ${pad}`}>—</span>
  return depth.kind === 'visual' ? (
    <span className={`inline-flex justify-center rounded-full border border-dashed font-mono font-semibold ${pad}`} style={{ color: colour, borderColor: colour }}>
      ~{Math.round(depth.value)}
    </span>
  ) : (
    <span className={`inline-flex justify-center rounded-full font-mono font-semibold text-white ${pad}`} style={{ background: colour }}>
      {Math.round(depth.value)}
    </span>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent ${className}`} />
}
