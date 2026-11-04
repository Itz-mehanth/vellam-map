import { AbsoluteFill, useCurrentFrame } from 'remotion'
import bench from '../../public/bench.json'
import { C, LINEAR, MECH, mono, prog, sans, tamil } from '../theme'
import { Caption, Contours, Count, Label, Reveal, Slate } from '../ui'

const FlowBox = ({ at, title, text, color }: { at: number; title: string; text: string; color: string }) => (
  <Reveal at={at} style={{ width: 300 }}>
    <div style={{ border: `2px solid ${color}`, background: C.white, borderRadius: 6, padding: '22px 24px', minHeight: 150 }}>
      <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 34, color: C.ink }}>{title}</div>
      <div style={{ fontFamily: sans, fontSize: 24, color: C.ink2, marginTop: 8, lineHeight: 1.3 }}>{text}</div>
    </div>
  </Reveal>
)

export const Voice = () => {
  const f = useCurrentFrame()
  const arrow = (at: number) => prog(f, at, 18, LINEAR)
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Contours color={C.grid} opacity={0.5} draw={30} seed={6} />
      <div style={{ position: 'absolute', left: 120, top: 100 }}>
        <Reveal at={4}>
          <Label>Ask in your language</Label>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 68, letterSpacing: -1.5, color: C.ink, marginTop: 10 }}>Tamil or English, by voice</div>
        </Reveal>
      </div>
      <div style={{ position: 'absolute', left: 120, top: 330, display: 'flex', alignItems: 'center', gap: 28 }}>
        <FlowBox at={24} title="You speak" text="a question about a street or an area" color={C.ink} />
        <div style={{ width: 60 * arrow(50), height: 3, background: C.teal }} />
        <FlowBox at={56} title="Muse Voice Transcribe" text="turns Tamil or English speech into text" color={C.teal} />
        <div style={{ width: 60 * arrow(86), height: 3, background: C.teal }} />
        <FlowBox at={92} title="Muse Spark" text="answers from the live reports, with their uncertainty" color={C.teal} />
      </div>
      <Reveal at={150} style={{ position: 'absolute', left: 120, top: 640, width: 1000 }}>
        <Label color={C.ink2}>Example question</Label>
        <div style={{ fontFamily: tamil, fontWeight: 500, fontSize: 44, color: C.ink, marginTop: 14, lineHeight: 1.5 }}>இந்த பகுதியில் வெள்ளத்தின் ஆழம் எவ்வளவு?</div>
        <div style={{ fontFamily: sans, fontSize: 26, color: C.ink2, marginTop: 6 }}>How deep is the flooding in this area?</div>
      </Reveal>
      <Reveal at={220} style={{ position: 'absolute', left: 1180, top: 700, width: 620 }}>
        <div style={{ fontFamily: mono, fontSize: 19, color: C.ink2, lineHeight: 1.5 }}>Voice and questions need a Meta API key, so they are off in the keyless replay mode.</div>
      </Reveal>
      <Caption lines={[{ from: 20, to: 340, text: 'Ask in Tamil or English: Muse Voice Transcribe listens, Muse Spark answers.' }]} />
    </AbsoluteFill>
  )
}

const LEVELS = [0, 1, 2, 3, 4]
type Bench = {
  points: { level: number; mid: number }[]
  medians: Record<string, number>
  visual: { n: number; of: number; spearman: number; exact: number; within1: number; confusion: number[][]; median_by_level: (number | null)[] }
  geometry: { n: number; of: number; spearman: number; median_by_level: (number | null)[] }
}
const BN = bench as unknown as Bench
const pts = BN.points
const med = BN.medians

const Finding = ({ at, n, big, unit, text, color = C.paper, y }: { at: number; n: string; big: string; unit?: string; text: string; color?: string; y: number }) => (
  <Reveal at={at} style={{ position: 'absolute', left: 1300, top: y, width: 520 }}>
    <Label color={C.tealLight} style={{ fontSize: 18 }}>{n}</Label>
    <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 84, color, letterSpacing: -2, lineHeight: 1.05 }}>
      {big}
      {unit && <span style={{ fontFamily: sans, fontSize: 28, letterSpacing: 0, color: C.grid, marginLeft: 12 }}>{unit}</span>}
    </div>
    <div style={{ fontFamily: sans, fontSize: 25, color: C.grid, lineHeight: 1.35, marginTop: 4 }}>{text}</div>
  </Reveal>
)

const Scatter = ({ f }: { f: number }) => {
  const X0 = 180
  const X1 = 1180
  const Y0 = 830
  const Y1 = 340
  const maxD = 130
  const lx = (l: number) => X0 + 90 + l * ((X1 - X0 - 180) / 4)
  const dy = (d: number) => Y0 - (d / maxD) * (Y0 - Y1)
  const jitter = (i: number) => ((i * 37) % 23) - 11 // fixed, so every render is identical
  const draw = prog(f, 90, 110, LINEAR)
  const pathD = LEVELS.map((l, i) => `${i === 0 ? 'M' : 'L'} ${lx(l)} ${dy(med[String(l)])}`).join(' ')
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      {[0, 25, 50, 75, 100, 125].map((d) => (
        <g key={d} opacity={prog(f, 20, 20)}>
          <line x1={X0} x2={X1} y1={dy(d)} y2={dy(d)} stroke={C.gridDark} strokeWidth={1} />
          <text x={X0 - 14} y={dy(d) + 6} textAnchor="end" fontFamily={mono} fontSize={17} fill={C.ink2}>{d}</text>
        </g>
      ))}
      {LEVELS.map((l) => (
        <text key={l} x={lx(l)} y={Y0 + 40} textAnchor="middle" fontFamily={mono} fontSize={19} fill={C.grid} opacity={prog(f, 20, 20)}>{`TRUE LEVEL ${l}`}</text>
      ))}
      {pts.map((p, i) => (
        <circle key={i} cx={lx(p.level) + jitter(i) * 3} cy={dy(p.mid)} r={6} fill={C.tealLight} opacity={0.6 * prog(f, 30 + (i % 35) * 2, 14)} />
      ))}
      <path d={pathD} fill="none" stroke={C.amber} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      <text x={X0} y={Y1 - 24} fontFamily={mono} fontSize={19} fill={C.ink2}>MUSE SPARK DEPTH BY EYE (cm) · ONE DOT PER PHOTO · AMBER = MEDIAN PER LEVEL</text>
    </svg>
  )
}

/** Rows are the true level, columns are the level Muse Spark's depth falls in. */
const Matrix = ({ f }: { f: number }) => {
  const cell = 94
  const X0 = 330
  const Y0 = 330
  const m = BN.visual.confusion
  const max = Math.max(...m.flat())
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <text x={X0 + (cell * 5) / 2} y={Y0 - 56} textAnchor="middle" fontFamily={mono} fontSize={19} fill={C.grid}>LEVEL FROM MUSE SPARK&apos;S DEPTH</text>
      <text transform={`translate(${X0 - 110} ${Y0 + (cell * 5) / 2}) rotate(-90)`} textAnchor="middle" fontFamily={mono} fontSize={19} fill={C.grid}>TRUE LEVEL</text>
      {m.map((row, r) =>
        row.map((v, c) => {
          const d = Math.abs(r - c)
          const color = d === 0 ? C.teal : d === 1 ? C.amber : C.red
          const a = prog(f, 10 + (r * 5 + c) * 3, 16)
          return (
            <g key={`${r}-${c}`} opacity={a}>
              <rect x={X0 + c * cell} y={Y0 + r * cell} width={cell - 6} height={cell - 6} fill={v ? color : 'none'} fillOpacity={v ? 0.25 + 0.7 * (v / max) : 0} stroke={C.gridDark} />
              {v > 0 && <text x={X0 + c * cell + (cell - 6) / 2} y={Y0 + r * cell + (cell - 6) / 2 + 12} textAnchor="middle" fontFamily={mono} fontWeight={500} fontSize={34} fill={C.paper}>{v}</text>}
            </g>
          )
        }),
      )}
      {LEVELS.map((l) => (
        <g key={l}>
          <text x={X0 + l * cell + (cell - 6) / 2} y={Y0 + 5 * cell + 22} textAnchor="middle" fontFamily={mono} fontSize={18} fill={C.ink2}>{l}</text>
          <text x={X0 - 18} y={Y0 + l * cell + (cell - 6) / 2 + 6} textAnchor="end" fontFamily={mono} fontSize={18} fill={C.ink2}>{l}</text>
        </g>
      ))}
      <g opacity={prog(f, 90, 20)} fontFamily={mono} fontSize={18}>
        <rect x={X0} y={Y0 + 5 * cell + 56} width={18} height={18} fill={C.teal} />
        <text x={X0 + 28} y={Y0 + 5 * cell + 71} fill={C.grid}>exact</text>
        <rect x={X0 + 120} y={Y0 + 5 * cell + 56} width={18} height={18} fill={C.amber} />
        <text x={X0 + 148} y={Y0 + 5 * cell + 71} fill={C.grid}>one level off</text>
        <rect x={X0 + 320} y={Y0 + 5 * cell + 56} width={18} height={18} fill={C.red} />
        <text x={X0 + 348} y={Y0 + 5 * cell + 71} fill={C.grid}>two or more</text>
      </g>
    </svg>
  )
}

const GeoBars = ({ f }: { f: number }) => {
  const X0 = 200
  const Y0 = 800
  const Y1 = 400
  const maxD = 30
  const dy = (d: number) => Y0 - (d / maxD) * (Y0 - Y1)
  const geo = BN.geometry.median_by_level
  const eye = BN.visual.median_by_level
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <line x1={X0 - 20} x2={1180} y1={Y0} y2={Y0} stroke={C.ink2} />
      {[0, 1, 2].map((l) => {
        const gx = X0 + l * 330
        const pg = prog(f, 20 + l * 25, 30, MECH)
        const pe = prog(f, 32 + l * 25, 30, MECH)
        return (
          <g key={l}>
            <rect x={gx} y={dy((geo[l] ?? 0) * pg)} width={110} height={Y0 - dy((geo[l] ?? 0) * pg)} fill={C.red} />
            <rect x={gx + 130} y={dy((eye[l] ?? 0) * pe)} width={110} height={Y0 - dy((eye[l] ?? 0) * pe)} fill={C.tealLight} />
            <text x={gx + 55} y={dy(geo[l] ?? 0) - 12} textAnchor="middle" fontFamily={mono} fontWeight={500} fontSize={28} fill={C.paper} opacity={pg > 0.95 ? 1 : 0}>{(geo[l] ?? 0).toFixed(0)}</text>
            <text x={gx + 185} y={dy(eye[l] ?? 0) - 12} textAnchor="middle" fontFamily={mono} fontWeight={500} fontSize={28} fill={C.paper} opacity={pe > 0.95 ? 1 : 0}>{(eye[l] ?? 0).toFixed(0)}</text>
            <text x={gx + 120} y={Y0 + 40} textAnchor="middle" fontFamily={mono} fontSize={19} fill={C.grid}>{`LEVEL ${l}`}</text>
          </g>
        )
      })}
      <g fontFamily={mono} fontSize={18} opacity={prog(f, 100, 20)}>
        <rect x={X0} y={Y1 - 90} width={18} height={18} fill={C.red} />
        <text x={X0 + 28} y={Y1 - 75} fill={C.grid}>wheel geometry, median cm</text>
        <rect x={X0 + 330} y={Y1 - 90} width={18} height={18} fill={C.tealLight} />
        <text x={X0 + 358} y={Y1 - 75} fill={C.grid}>Muse Spark by eye, median cm</text>
      </g>
    </svg>
  )
}

export const Benchmark = () => {
  const f = useCurrentFrame()
  const v = BN.visual
  const within = Math.round(v.within1 * v.n)
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Contours color={C.gridDark} opacity={0.3} draw={60} seed={7} />
      <div style={{ position: 'absolute', left: 120, top: 90 }}>
        <Reveal at={4}>
          <Label color={C.tealLight}>Tested on real photographs</Label>
        </Reveal>
        <Reveal at={10} y={26}>
          <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 96, color: C.paper, letterSpacing: -3 }}>
            <Count to={100} at={10} dur={27} /> <span style={{ fontSize: 36, fontFamily: sans, letterSpacing: 0, color: C.grid }}>public photos, each with a known depth level</span>
          </div>
        </Reveal>
      </div>
      {f < 330 && (
        <>
          <Scatter f={f} />
          <Finding at={120} n="01 · MUSE SPARK READ" big={`${v.n}`} unit={`of ${v.of} photos`} text="Photos where it gave a depth. Everything below is measured over these." y={330} />
          <Finding at={200} n="02 · RANK CORRELATION" big={v.spearman.toFixed(2)} text="Predicted depth rises with the true level." color={C.tealLight} y={600} />
        </>
      )}
      {f >= 330 && f < 600 && (
        <>
          <Matrix f={f - 330} />
          <Finding at={360} n="03 · WITHIN ONE LEVEL" big={`${within}`} unit={`of ${v.n}`} text={`${Math.round(v.exact * v.n)} of ${v.n} landed on exactly the right level.`} color={C.tealLight} y={380} />
          <Reveal at={420} style={{ position: 'absolute', left: 1300, top: 700, width: 520 }}>
            <div style={{ fontFamily: mono, fontSize: 18, color: C.ink2, lineHeight: 1.6 }}>
              Levels are ordered classes, not centimetres. The cut-offs between levels (10, 35, 70, 110 cm) are our assumption. Muse Spark leans one level low.
            </div>
          </Reveal>
        </>
      )}
      {f >= 600 && (
        <>
          <GeoBars f={f - 600} />
          <Finding at={640} n="04 · WHEEL GEOMETRY READ" big={`${BN.geometry.n}`} unit={`of ${BN.geometry.of} photos`} text="Rare on these tight crops, and its readings sit low." color={C.red} y={330} />
          <Finding at={700} n="RANK CORRELATION, THOSE 12" big={BN.geometry.spearman.toFixed(2)} text="Weaker than Muse Spark, so we show it as one input, not the answer." y={600} />
        </>
      )}
      <Reveal at={40} style={{ position: 'absolute', left: 120, bottom: 135 }}>
        <div style={{ fontFamily: mono, fontSize: 16, color: C.ink2 }}>STURM-FloodDepth Flooded Cars, test split · CC BY 4.0 · run before the flood-check fix, so 69 photos produced a reading</div>
      </Reveal>
      <Caption
        lines={[
          { from: 20, to: 320, text: 'We tested the real pipeline on 100 public photos of flooded cars with known depth levels.' },
          { from: 340, to: 590, text: 'Where Muse Spark gave a depth, 68 of 69 were within one level of the truth.' },
          { from: 610, to: 830, text: 'Wheel geometry is the weakest part: it read only 12 of the 100 photos.' },
        ]}
      />
    </AbsoluteFill>
  )
}

const Big = ({ at, value, color, label }: { at: number; value: string; color: string; label: string }) => (
  <Reveal at={at} style={{ position: 'absolute' }}>
    <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 190, color, letterSpacing: -6, lineHeight: 1 }}>{value}</div>
    <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 30, color: C.ink, marginTop: 10 }}>{label}</div>
  </Reveal>
)

export const Limits = () => {
  const f = useCurrentFrame()
  const arrow = prog(f, 150, 30, LINEAR)
  const bar = prog(f, 260, 40, MECH)
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Contours color={C.grid} opacity={0.5} draw={30} seed={8} />
      <div style={{ position: 'absolute', left: 120, top: 90 }}>
        <Reveal at={4}>
          <Label>An engineering decision</Label>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 68, letterSpacing: -1.5, color: C.ink, marginTop: 10 }}>The check was throwing away real floods</div>
        </Reveal>
      </div>
      <div style={{ position: 'absolute', left: 120, top: 340 }}>
        <Label color={C.red}>Before the fix</Label>
        <div style={{ position: 'relative', height: 260, marginTop: 14 }}>
          <Big at={30} value="33%" color={C.red} label="23 of 70 real floods rejected" />
        </div>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <line x1={720} x2={720 + 160 * arrow} y1={500} y2={500} stroke={C.ink} strokeWidth={4} />
        <path d="M 868 486 L 884 500 L 868 514" fill="none" stroke={C.ink} strokeWidth={4} opacity={arrow > 0.9 ? 1 : 0} />
      </svg>
      <Reveal at={120} style={{ position: 'absolute', left: 740, top: 540 }}>
        <div style={{ fontFamily: sans, fontSize: 24, color: C.ink2, width: 200, lineHeight: 1.3 }}>graded evidence instead of yes or no</div>
      </Reveal>
      <div style={{ position: 'absolute', left: 940, top: 340 }}>
        <Label color={C.teal}>After the fix</Label>
        <div style={{ position: 'relative', height: 260, marginTop: 14 }}>
          <Big at={170} value="1%" color={C.teal} label="1 of 70 real floods rejected" />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 120, top: 700, width: 1000 }}>
        <Reveal at={250}>
          <Label color={C.amber}>The cost</Label>
        </Reveal>
        <div style={{ height: 34, background: C.grid, marginTop: 12, width: 800 }}>
          <div style={{ height: 34, background: C.amber, width: 800 * 0.34 * bar }} />
        </div>
        <Reveal at={290}>
          <div style={{ fontFamily: sans, fontSize: 30, color: C.ink, marginTop: 14 }}>
            <b>34%</b> (24 of 70) of real floods now show as <b>unconfirmed</b>.
          </div>
        </Reveal>
      </div>
      <Reveal at={330} style={{ position: 'absolute', left: 1180, top: 680, width: 620 }}>
        <div style={{ fontFamily: sans, fontSize: 26, color: C.ink2, lineHeight: 1.4 }}>
          Tested on 70 real floods and 10 non-floods that were never used to tune the fix. None of the 10 non-floods was accepted outright; 9 were rejected and 1 was shown as unconfirmed.
        </div>
      </Reveal>
      <Reveal at={410} style={{ position: 'absolute', left: 120, top: 900 }}>
        <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 40, color: C.ink, letterSpacing: -0.8 }}>We would rather show an honest &ldquo;unconfirmed&rdquo; than a confident mistake.</div>
      </Reveal>
      <Caption
        lines={[
          { from: 20, to: 250, text: 'Our strict flood check rejected a third of real floods in testing. We fixed it, and it now rejects 1 in 70.' },
          { from: 260, to: 520, text: 'The price: a third of real floods now show as unconfirmed instead of confirmed.' },
        ]}
      />
    </AbsoluteFill>
  )
}

export const End = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Contours color={C.gridDark} opacity={0.8} draw={150} seed={9} />
    <div style={{ position: 'absolute', left: 120, top: 300 }}>
      <Reveal at={60} y={26} dur={22}>
        <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 120, letterSpacing: -3.5, color: C.paper, lineHeight: 1 }}>Vellam Map</div>
      </Reveal>
      <Reveal at={90}>
        <div style={{ fontFamily: sans, fontSize: 38, color: C.grid, marginTop: 24, maxWidth: 1000, lineHeight: 1.3 }}>Turning the evidence people already capture into information communities can act on.</div>
      </Reveal>
      <Reveal at={125}>
        <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 34, color: C.tealLight, marginTop: 56 }}>github.com/Itz-mehanth/vellam-map</div>
      </Reveal>
      <Reveal at={150}>
        <div style={{ fontFamily: mono, fontSize: 22, color: C.ink2, marginTop: 18, letterSpacing: 1.2 }}>OPEN SOURCE · MIT · SAM 3.1 · MUSE SPARK · MUSE VOICE TRANSCRIBE</div>
      </Reveal>
    </div>
    <Caption lines={[{ from: 100, to: 330, text: 'Vellam Map. Built for the people who have to drive through it.' }]} />
  </AbsoluteFill>
)
