import { useId } from 'react'

const WAVE = 'M0 37.5C5 34.5 9 34.5 13 37.5S21 40.5 25 37.5 33 34.5 37 37.5 45 40.5 49 37.5 57 34.5 64 37.5'
const LUGS = [-90, -18, 54, 126, 198].map((deg) => {
  const a = (deg * Math.PI) / 180
  return [32 + 12.2 * Math.cos(a), 32 + 12.2 * Math.sin(a)] as const
})

/**
 * The mark: a wheel standing in water. A tyre ring, hub and lug nuts with the waterline
 * across it, the submerged part turning blue. It is how Vellam measures depth.
 */
export function Mark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  const id = useId().replace(/:/g, '')
  const c = onDark
    ? { ring: '#f5f4ef', waterRing: '#5b92f5', waterIn: '#2c58b8' }
    : { ring: '#0d1b26', waterRing: '#1e5bd6', waterIn: '#a9c4f7' }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id={`${id}b`}>
          <path d={`${WAVE}V64H0Z`} />
        </clipPath>
        <clipPath id={`${id}h`}>
          <circle cx="32" cy="32" r="21" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}b)`}>
        <circle cx="32" cy="32" r="21" fill={c.waterIn} />
      </g>
      <circle cx="32" cy="32" r="24.5" fill="none" stroke={c.ring} strokeWidth="7" />
      <g clipPath={`url(#${id}b)`}>
        <circle cx="32" cy="32" r="24.5" fill="none" stroke={c.waterRing} strokeWidth="7" />
      </g>
      <g clipPath={`url(#${id}h)`}>
        <path d={WAVE} fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      </g>
      <circle cx="32" cy="32" r="5.4" fill={c.ring} />
      {LUGS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.55" fill={c.ring} />
      ))}
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Mark size={30} />
      <span className="text-[16px] font-semibold tracking-[-0.015em] text-ink">Vellam</span>
    </span>
  )
}
