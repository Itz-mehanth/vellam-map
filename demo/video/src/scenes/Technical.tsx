import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import s05 from '../../public/photos/s05.json'
import s18 from '../../public/photos/s18.json'
import crop from '../../public/photos/wheelA_crop.json'
import { C, LINEAR, MECH, mono, prog, sans } from '../theme'
import { Caption, Label, Reveal } from '../ui'

// Every number and coordinate here is read from the recorded pipeline runs (backend/replays), not typed by hand.
type Wheel = { depth_cm: number | null; uncertainty_cm: number | null; box: number[]; circle?: { cx: number; cy: number; r: number }; waterline_y?: number; cm_per_px?: number; reason: string }
const A = s05 as unknown as {
  geometry: { wheels: Wheel[] }
  fusion: { inputs: { depth_cm: number; uncertainty_cm: number }[]; depth_cm: number; uncertainty_cm: number }
  verify: { verdict: { depth_cm_low: number; depth_cm_high: number; depth_reference: string; reason: string; flood_evidence: string } }
}
const B = s18 as unknown as { fusion: { depth_cm: number; uncertainty_cm: number }; verify: { verdict: { depth_cm_low: number; depth_cm_high: number } } }

const PHOTO = { left: 120, top: 150, w: 1000, h: 667 }
const SRC_W = 1280
const K = PHOTO.w / SRC_W // source pixels to screen pixels

const Stage = ({ n, title, text, at }: { n: string; title: string; text: string; at: number }) => (
  <Reveal at={at} style={{ position: 'absolute', left: 1180, top: 160, width: 620 }}>
    <Label>{n}</Label>
    <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 52, letterSpacing: -1.2, color: C.ink, marginTop: 10, lineHeight: 1.1 }}>{title}</div>
    <div style={{ fontFamily: sans, fontSize: 30, color: C.ink2, marginTop: 16, lineHeight: 1.35 }}>{text}</div>
  </Reveal>
)

const Tag = ({ at, x, y, children, color = C.teal }: { at: number; x: number; y: number; children: string; color?: string }) => (
  <Reveal at={at} dur={12} style={{ position: 'absolute', left: x, top: y }}>
    <div style={{ fontFamily: mono, fontSize: 20, color: C.white, background: color, padding: '5px 12px', borderRadius: 4, letterSpacing: 1 }}>{children}</div>
  </Reveal>
)

const Stat = ({ at, label, value, y }: { at: number; label: string; value: string; y: number }) => (
  <Reveal at={at} style={{ position: 'absolute', left: 1180, top: y }}>
    <div style={{ fontFamily: mono, fontSize: 19, color: C.ink2, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 56, color: C.ink, letterSpacing: -1 }}>{value}</div>
  </Reveal>
)

/** Real wheel detections drawn on the photo: the in-water wheels get a fitted circle, the rest a plain box. */
const WheelMarks = ({ f }: { f: number }) => (
  <svg width={PHOTO.w} height={PHOTO.h} style={{ position: 'absolute', inset: 0 }}>
    {A.geometry.wheels.map((w, i) => {
      const [x0, y0, x1, y1] = w.box.map((v) => v * K)
      const used = w.depth_cm !== null
      const p = prog(f, 20 + i * 8, 16)
      const col = used ? C.amber : C.white
      const L = 9
      return (
        <g key={i} opacity={p} stroke={col} strokeWidth={used ? 3 : 2} fill="none">
          <path d={`M${x0} ${y0 + L}V${y0}H${x0 + L} M${x1 - L} ${y0}H${x1}V${y0 + L} M${x1} ${y1 - L}V${y1}H${x1 - L} M${x0 + L} ${y1}H${x0}V${y1 - L}`} />
          {used && w.circle && <circle cx={w.circle.cx * K} cy={w.circle.cy * K} r={w.circle.r * K} strokeDasharray="5 4" />}
        </g>
      )
    })}
  </svg>
)

/** The one idea that makes it work: a wheel of known size is a ruler, and the waterline cuts it. */
const WheelCloseup = ({ f }: { f: number }) => {
  const w = A.geometry.wheels.find((x) => x.depth_cm !== null && x.circle)!
  const c = w.circle!
  const S = 620
  const R = 135
  const k = R / c.r
  const mid = S / 2
  const wlY = mid + (w.waterline_y! - c.cy) * k
  const botY = mid + R
  const circ = prog(f, 14, 40, LINEAR)
  const line = prog(f, 70, 30, LINEAR)
  const brace = prog(f, 110, 24)
  const num = prog(f, 140, 24)
  const px = (c.cy + c.r - w.waterline_y!)
  return (
    <div style={{ position: 'absolute', left: 1180, top: 190, width: S, height: S, overflow: 'hidden', border: `1px solid ${C.grid}`, background: C.white }}>
      <Img src={staticFile('photos/s05_wheelA.png')} style={{ position: 'absolute', width: crop.size * k, left: mid - (c.cx - crop.x0) * k, top: mid - (c.cy - crop.y0) * k, maxWidth: 'none', imageRendering: 'auto' }} />
      <svg width={S} height={S} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={mid} cy={mid} r={R} fill="none" stroke={C.tealLight} strokeWidth={3} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - circ} />
        <circle cx={mid} cy={mid} r={5} fill={C.tealLight} opacity={circ} />
        <line x1={mid} y1={mid} x2={mid + R * 0.7071} y2={mid - R * 0.7071} stroke={C.tealLight} strokeWidth={2} opacity={circ} />
        <text x={mid + R * 0.4} y={mid - R * 0.52} fontFamily={mono} fontSize={22} fill={C.white} opacity={circ}>r</text>
        <line x1={0} x2={S * line} y1={wlY} y2={wlY} stroke={C.amber} strokeWidth={3} />
        <text x={14} y={wlY - 10} fontFamily={mono} fontSize={20} fill={C.amber} opacity={line}>WATERLINE</text>
        <line x1={mid - R} x2={mid + R} y1={botY} y2={botY} stroke={C.white} strokeWidth={2} strokeDasharray="6 5" opacity={brace} />
        <g opacity={brace}>
          <line x1={S - 70} x2={S - 70} y1={wlY} y2={botY} stroke={C.white} strokeWidth={3} />
          <line x1={S - 82} x2={S - 58} y1={wlY} y2={wlY} stroke={C.white} strokeWidth={3} />
          <line x1={S - 82} x2={S - 58} y1={botY} y2={botY} stroke={C.white} strokeWidth={3} />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: 14, bottom: 14, opacity: num, fontFamily: mono, fontSize: 21, color: C.white, background: 'rgba(23,27,25,0.82)', padding: '8px 12px', borderRadius: 4, lineHeight: 1.5 }}>
        {px.toFixed(0)} px under water × {w.cm_per_px!.toFixed(2)} cm/px
        <br />
        <b style={{ fontSize: 30, color: C.tealLight }}>= {w.depth_cm!.toFixed(1)} ± {w.uncertainty_cm!.toFixed(1)} cm</b>
      </div>
    </div>
  )
}

const Ruler = ({ f }: { f: number }) => {
  const base = 780
  const px = 9 // px per cm
  const bar = (cx: number, d: number, u: number, color: string, at: number, name: string) => {
    const p = prog(f, at, 40, MECH)
    const h = d * px * p
    return (
      <g key={name}>
        <rect x={cx - 38} y={base - h} width={76} height={h} fill={color} opacity={0.88} />
        <line x1={cx} x2={cx} y1={base - (d + u) * px * p} y2={base - (d - u) * px * p} stroke={C.ink} strokeWidth={3} />
        <line x1={cx - 14} x2={cx + 14} y1={base - (d + u) * px * p} y2={base - (d + u) * px * p} stroke={C.ink} strokeWidth={3} />
        <line x1={cx - 14} x2={cx + 14} y1={base - (d - u) * px * p} y2={base - (d - u) * px * p} stroke={C.ink} strokeWidth={3} />
        <text x={cx} y={base + 38} textAnchor="middle" fontFamily={mono} fontSize={20} fill={C.ink2}>{name}</text>
        <text x={cx} y={base - (d + u) * px * p - 18} textAnchor="middle" fontFamily={mono} fontSize={26} fontWeight={500} fill={C.ink} opacity={p > 0.9 ? 1 : 0}>{`${d.toFixed(0)} ± ${u.toFixed(0)}`}</text>
      </g>
    )
  }
  const [w1, w2] = A.fusion.inputs
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      {[0, 10, 20, 30, 40, 50, 60].map((c) => (
        <g key={c}>
          <line x1={1180} x2={1800} y1={base - c * px} y2={base - c * px} stroke={C.grid} strokeWidth={1} />
          <text x={1180} y={base - c * px - 6} fontFamily={mono} fontSize={17} fill={C.ink2}>{c} cm</text>
        </g>
      ))}
      {bar(1330, w1.depth_cm, w1.uncertainty_cm, C.tealLight, 10, 'WHEEL A')}
      {bar(1490, w2.depth_cm, w2.uncertainty_cm, C.tealLight, 40, 'WHEEL B')}
      {bar(1690, A.fusion.depth_cm, A.fusion.uncertainty_cm, C.teal, 100, 'FUSED')}
    </svg>
  )
}

const Case = ({ at, x, photo, title, geo, vis, ok }: { at: number; x: number; photo: string; title: string; geo: string; vis: string; ok: boolean }) => {
  const color = ok ? C.green : C.amber
  return (
    <Reveal at={at} style={{ position: 'absolute', left: x, top: 290, width: 800 }}>
      <div style={{ display: 'flex', gap: 28 }}>
        <Img src={staticFile(photo)} style={{ width: 360, height: 240, objectFit: 'cover', border: `1px solid ${C.grid}` }} />
        <div>
          <Label color={color}>{title}</Label>
          <div style={{ fontFamily: mono, fontSize: 19, color: C.ink2, marginTop: 14 }}>GEOMETRY</div>
          <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 44, color: C.ink }}>{geo}</div>
          <div style={{ fontFamily: mono, fontSize: 19, color: C.ink2, marginTop: 8 }}>MUSE SPARK</div>
          <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 44, color: C.ink }}>{vis}</div>
        </div>
      </div>
      <div style={{ marginTop: 30, borderTop: `3px solid ${color}`, paddingTop: 20, fontFamily: sans, fontWeight: 600, fontSize: 46, color }}>{ok ? 'Agree → verified, on the map' : 'Disagree → sent to review'}</div>
    </Reveal>
  )
}

export const Technical = () => {
  const f = useCurrentFrame()
  const water = prog(f, 40, 50, LINEAR)
  const showPhoto = f < 1110
  const v = A.verify.verdict
  const wheelCount = A.geometry.wheels.length
  const photoDim = f >= 570 && f < 900 ? 0.5 : 1
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {showPhoto && (
        <div style={{ position: 'absolute', left: PHOTO.left, top: PHOTO.top, width: PHOTO.w, height: PHOTO.h, border: `1px solid ${C.grid}`, overflow: 'hidden', background: C.white }}>
          <Img src={staticFile('photos/s05.jpg')} style={{ width: PHOTO.w, height: PHOTO.h, position: 'absolute', opacity: photoDim === 1 ? 1 : 0.55 }} />
          <Img src={staticFile('photos/s05_water_mask.png')} style={{ width: PHOTO.w, height: PHOTO.h, position: 'absolute', opacity: water * (f < 300 ? 1 : 0.55) }} />
          {f >= 300 && <WheelMarks f={f - 300} />}
        </div>
      )}
      {f < 300 && (
        <>
          <Stage n="01 / Water" title="SAM 3.1 outlines the water" text="Every pixel of floodwater in the photo is segmented." at={8} />
          <Tag at={60} x={PHOTO.left + 24} y={PHOTO.top + 24}>SAM 3.1 · WATER</Tag>
          <Stat at={80} label="Water in frame" value="30%" y={560} />
          <Stat at={96} label="Confidence" value="0.85" y={700} />
        </>
      )}
      {f >= 300 && f < 570 && (
        <>
          <Stage n="02 / Wheels" title="Wheels are the ruler" text="A wheel has a known size, so where the water meets it says how deep the water is." at={308} />
          <Tag at={340} x={PHOTO.left + 24} y={PHOTO.top + 24} color={C.amber}>SAM 3.1 · WHEELS</Tag>
          <Stat at={380} label="Wheels found" value={String(wheelCount)} y={560} />
          <Stat at={396} label="Standing in water" value={String(A.fusion.inputs.length)} y={700} />
        </>
      )}
      {f >= 570 && f < 770 && (
        <>
          <div style={{ position: 'absolute', left: 1180, top: 110 }}>
            <Reveal at={576}>
              <Label>03 / Geometry</Label>
            </Reveal>
          </div>
          <WheelCloseup f={f - 576} />
          <Reveal at={700} style={{ position: 'absolute', left: 1180, top: 830, width: 620 }}>
            <div style={{ fontFamily: sans, fontSize: 24, color: C.ink2, lineHeight: 1.35 }}>Fit a circle to the visible rim, recover the hidden part under water, then read the depth off the circle.</div>
          </Reveal>
        </>
      )}
      {f >= 770 && f < 900 && (
        <>
          <div style={{ position: 'absolute', left: 1180, top: 150 }}>
            <Reveal at={774}>
              <Label>03 / Geometry</Label>
              <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 44, letterSpacing: -1, color: C.ink, marginTop: 8 }}>Two wheels, one reading</div>
            </Reveal>
          </div>
          <Ruler f={f - 774} />
          <Reveal at={850} style={{ position: 'absolute', left: 1180, top: 880 }}>
            <div style={{ fontFamily: sans, fontSize: 26, color: C.ink2 }}>The more certain wheel counts more.</div>
          </Reveal>
        </>
      )}
      {f >= 900 && f < 1110 && (
        <>
          <Stage n="04 / Independent check" title="Muse Spark looks at the same photo" text="It does not see the geometry. It answers on its own." at={908} />
          <Reveal at={950} style={{ position: 'absolute', left: 1180, top: 560, width: 620 }}>
            <div style={{ fontFamily: mono, fontSize: 21, lineHeight: 1.9, color: C.ink, borderLeft: `3px solid ${C.amber}`, paddingLeft: 22 }}>
              flood_evidence: <b>{v.flood_evidence}</b>
              <br />
              depth: <b>{v.depth_cm_low}–{v.depth_cm_high} cm</b>
              <br />
              reference: {v.depth_reference}
            </div>
          </Reveal>
          <Reveal at={1010} style={{ position: 'absolute', left: 1180, top: 790, width: 620 }}>
            <div style={{ fontFamily: sans, fontSize: 24, color: C.ink2, lineHeight: 1.4 }}>&ldquo;{v.reason}&rdquo;</div>
          </Reveal>
        </>
      )}
      {f >= 1110 && (
        <>
          <div style={{ position: 'absolute', left: 120, top: 100 }}>
            <Reveal at={1114}>
              <Label>05 / Compare</Label>
              <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 52, letterSpacing: -1.2, color: C.ink, marginTop: 8 }}>Agree: publish. Disagree: review.</div>
            </Reveal>
          </div>
          <Case at={1124} x={120} photo="photos/s05.jpg" title="Verified" geo={`${A.fusion.depth_cm.toFixed(0)} ± ${A.fusion.uncertainty_cm.toFixed(0)} cm`} vis={`${v.depth_cm_low}–${v.depth_cm_high} cm`} ok />
          <Case at={1138} x={1000} photo="photos/s18.jpg" title="Review" geo={`${B.fusion.depth_cm.toFixed(0)} ± ${B.fusion.uncertainty_cm.toFixed(0)} cm`} vis={`${B.verify.verdict.depth_cm_low}–${B.verify.verdict.depth_cm_high} cm`} ok={false} />
          <Reveal at={1190} style={{ position: 'absolute', left: 120, top: 700 }}>
            <div style={{ fontFamily: sans, fontSize: 30, color: C.ink2, maxWidth: 1500, lineHeight: 1.4 }}>Real recorded runs. A wrong depth on the map is worse than a missing one, so a large disagreement is held back for a person to check.</div>
          </Reveal>
        </>
      )}
      <Caption
        lines={[
          { from: 20, to: 290, text: 'First, SAM 3.1 identifies the water in the photograph.' },
          { from: 310, to: 560, text: 'Vehicle wheels give a physical reference for depth.' },
          { from: 590, to: 890, text: 'A circle fitted to the wheel and the waterline turn into centimetres, with an error range.' },
          { from: 915, to: 1100, text: 'A second model, Muse Spark, independently checks the same photo.' },
          { from: 1120, to: 1250, text: 'When the two disagree, the report goes to review, not the map.' },
        ]}
      />
    </AbsoluteFill>
  )
}
