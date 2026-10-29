import { motion, useReducedMotion } from 'motion/react'
import { BANDS, depthColour } from '../lib/depth'

const MAX = 150
const H = 236
const TOP = 8
const BOARD_X = 46
const BOARD_W = 30

/**
 * A flood staff gauge: E-marks every 10 cm, water rising to the reading,
 * the uncertainty band hatched, and body landmarks at the side for intuition.
 */
export function StaffGauge({ depth, uncertainty, visual = false }: { depth: number; uncertainty: number; visual?: boolean }) {
  const reduce = useReducedMotion()
  const y = (cm: number) => TOP + H - (Math.min(MAX, Math.max(0, cm)) / MAX) * H
  const water = depthColour(depth)
  const landmarks: [number, string][] = [[12, 'ankle'], [50, 'knee'], [80, 'thigh'], [105, 'waist']]
  const hatchId = `hatch-${Math.round(depth)}`

  return (
    <svg viewBox={`0 0 132 ${H + TOP * 2}`} className="h-[252px] w-[132px] shrink-0" role="img" aria-label={`Gauge reading ${Math.round(depth)} centimetres`}>
      <defs>
        <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#0d1b26" strokeWidth="1" strokeOpacity="0.35" />
        </pattern>
        <clipPath id="board">
          <rect x={BOARD_X} y={TOP} width={BOARD_W} height={H} rx="2" />
        </clipPath>
      </defs>

      {/* Body landmarks */}
      {landmarks.map(([cm, label]) => (
        <g key={label}>
          <line x1={BOARD_X - 7} x2={BOARD_X - 2} y1={y(cm)} y2={y(cm)} stroke="#a2aab1" />
          <text x={BOARD_X - 10} y={y(cm) + 3} textAnchor="end" fontSize="9" fill="#6c7782" fontFamily="IBM Plex Mono">
            {label}
          </text>
        </g>
      ))}

      {/* Board */}
      <rect x={BOARD_X} y={TOP} width={BOARD_W} height={H} rx="2" fill="#fff" stroke="#0d1b26" strokeWidth="1" />
      {Array.from({ length: MAX / 10 }, (_, i) => {
        const top = y((i + 1) * 10)
        const step = (H / MAX) * 10
        const colour = (i + 1) % 5 === 0 ? '#d3263a' : '#0d1b26'
        const left = i % 2 === 0
        const sx = left ? BOARD_X + 4 : BOARD_X + BOARD_W - 7
        const tx = left ? sx + 3 : sx - 9
        return (
          <g key={i} fill={colour}>
            <rect x={sx} y={top + 1} width="3" height={step - 2} />
            <rect x={tx} y={top + 1} width="9" height="2.2" />
            <rect x={tx} y={top + step / 2 - 1.1} width="6" height="2.2" transform={left ? undefined : `translate(3 0)`} />
            <rect x={tx} y={top + step - 3.2} width="9" height="2.2" />
          </g>
        )
      })}
      {[0, 50, 100, 150].map((cm) => (
        <text key={cm} x={BOARD_X + BOARD_W + 6} y={y(cm) + 3} fontSize="9" fill="#6c7782" fontFamily="IBM Plex Mono">
          {cm}
        </text>
      ))}

      {/* Water */}
      <g clipPath="url(#board)">
        <motion.rect
          x={BOARD_X}
          width={BOARD_W}
          fill={water}
          fillOpacity={visual ? 0.18 : 0.28}
          initial={reduce ? false : { y: TOP + H, height: 0 }}
          animate={{ y: y(depth), height: TOP + H - y(depth) }}
          transition={{ type: 'spring', stiffness: 60, damping: 16, delay: 0.1 }}
        />
        <rect x={BOARD_X} y={y(depth + uncertainty)} width={BOARD_W} height={Math.max(1, y(depth - uncertainty) - y(depth + uncertainty))} fill={`url(#${hatchId})`} />
      </g>

      {/* Reading line, extended past the board with an arrow */}
      <motion.g
        initial={reduce ? false : { y: TOP + H - y(depth) }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 60, damping: 16, delay: 0.1 }}
      >
        <line x1={BOARD_X - 4} x2={BOARD_X + BOARD_W + 26} y1={y(depth)} y2={y(depth)} stroke={water} strokeWidth="2" strokeDasharray={visual ? '4 3' : undefined} />
        <path d={`M${BOARD_X + BOARD_W + 26} ${y(depth) - 4} l6 4 -6 4z`} fill={water} />
      </motion.g>

      {/* Band ticks on the far right */}
      {BANDS.map((b, i) => {
        const lo = i === 0 ? 0 : BANDS[i - 1].max
        const hi = Math.min(MAX, b.max)
        return <rect key={b.key} x={128} y={y(hi)} width="3" height={y(lo) - y(hi)} fill={b.colour} />
      })}
    </svg>
  )
}
