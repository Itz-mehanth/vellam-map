import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { C, EDITORIAL, LINEAR, mono, prog, sans } from './theme'

export const Reveal = ({ at, children, y = 22, dur = 20, style }: { at: number; children: ReactNode; y?: number; dur?: number; style?: CSSProperties }) => {
  const p = prog(useCurrentFrame(), at, dur)
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>
}

export const Label = ({ children, color = C.teal, style }: { children: ReactNode; color?: string; style?: CSSProperties }) => (
  <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 500, letterSpacing: 2.5, color, textTransform: 'uppercase', ...style }}>{children}</div>
)

export const Count = ({ to, at, dur = 27, decimals = 0, suffix = '' }: { to: number; at: number; dur?: number; decimals?: number; suffix?: string }) => {
  const v = to * prog(useCurrentFrame(), at, dur)
  return <>{v.toFixed(decimals)}{suffix}</>
}

/** Fine contour lines, drawn on over `draw` frames. */
export const Contours = ({ color, opacity = 0.5, draw = 60, seed = 1 }: { color: string; opacity?: number; draw?: number; seed?: number }) => {
  const f = useCurrentFrame()
  const p = prog(f, 0, draw, LINEAR)
  const lines = Array.from({ length: 16 }, (_, i) => {
    const base = 40 + i * 66
    const a = 26 + ((i * 7 + seed * 3) % 5) * 9
    const ph = i * 0.7 + seed
    let d = ''
    for (let x = 0; x <= 1920; x += 40) d += `${x === 0 ? 'M' : 'L'} ${x} ${base + Math.sin(x / 260 + ph) * a + Math.sin(x / 90 + ph * 2) * 8} `
    return d
  })
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity }}>
      {lines.map((d, i) => <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />)}
    </svg>
  )
}

export type Line = { from: number; to: number; text: string }

/** Documentary captions: bottom-left, at most two lines. Re-time these to the recorded voice. */
export const Caption = ({ lines }: { lines: Line[] }) => {
  const f = useCurrentFrame()
  const l = lines.find((x) => f >= x.from && f < x.to)
  if (!l) return null
  const p = Math.min(prog(f, l.from, 8, EDITORIAL), prog(f, l.to - 8, 8, (t) => 1 - t) * 0 + (l.to - f < 8 ? (l.to - f) / 8 : 1))
  return (
    <div style={{ position: 'absolute', left: 120, bottom: 70, maxWidth: 1500, opacity: p }}>
      <span style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, lineHeight: 1.35, color: C.white, background: 'rgba(23,27,25,0.82)', padding: '10px 18px', borderRadius: 4, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', display: 'inline' }}>{l.text}</span>
    </div>
  )
}

/** The signature transition: a teal line crosses the frame and the next scene appears below it. */
export const Waterline = () => {
  const f = useCurrentFrame()
  const x = prog(f, 0, 12, LINEAR)
  const fade = prog(f, 12, 6, LINEAR)
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 540, height: 3, width: 1920 * x, background: C.teal, opacity: 1 - fade }} />
    </AbsoluteFill>
  )
}
