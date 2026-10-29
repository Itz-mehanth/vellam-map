/** Brand mark: a flood staff gauge (the E-marked board on bridges) with the waterline across it. */
export function GaugeMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#0d1b26" />
      <rect x="9" y="5" width="2.4" height="13" fill="#fff" />
      <rect x="11.4" y="5" width="7.6" height="2.2" fill="#fff" />
      <rect x="11.4" y="10.4" width="5" height="2.2" fill="#fff" />
      <rect x="11.4" y="15.8" width="7.6" height="2.2" fill="#d3263a" />
      <path d="M5 22c1.9-1.4 3.8-1.4 5.7 0s3.8 1.4 5.7 0 3.8-1.4 5.7 0" fill="none" stroke="#6aa8ff" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <GaugeMark />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Vellam</span>
    </span>
  )
}
