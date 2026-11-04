import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion'
import { C, LINEAR, MECH, mono, prog, sans } from '../theme'
import { Caption, Contours, Count, Label, Reveal } from '../ui'

const SEQ = [
  { src: 'stills/nandanam4.jpg', from: 0, dur: 118, x0: -10, x1: 30 },
  { src: 'stills/nandanam5.jpg', from: 98, dur: 118, x0: 20, x1: -20 },
  { src: 'stills/nandanam6.jpg', from: 196, dur: 104, x0: -20, x1: 10 },
]

/** Slow push-in on a still, with a gentle drift. */
const Still = ({ src, from, dur, x0, x1 }: (typeof SEQ)[number]) => {
  const f = useCurrentFrame()
  const local = f - from
  const p = prog(local, 0, dur, LINEAR)
  const fade = Math.min(prog(f, from, 20, LINEAR), 1 - prog(f, from + dur - 20, 20, LINEAR) * (from + dur < 300 ? 1 : 0))
  if (local < 0 || local > dur) return null
  return (
    <AbsoluteFill style={{ opacity: fade, overflow: 'hidden' }}>
      <Img src={staticFile(src)} style={{ width: 1920, height: 1080, objectFit: 'cover', transform: `scale(${1.05 + 0.1 * p}) translateX(${x0 + (x1 - x0) * p}px)`, filter: 'saturate(0.82) contrast(1.04) brightness(0.86)' }} />
    </AbsoluteFill>
  )
}

export const Opening = () => (
  <AbsoluteFill style={{ background: '#101412' }}>
    {SEQ.map((s) => (
      <Still key={s.src} {...s} />
    ))}
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 100%)' }} />
    <div style={{ position: 'absolute', left: 120, bottom: 230 }}>
      <Reveal at={60} dur={20} y={28}>
        <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 88, letterSpacing: -2.5, color: C.white, lineHeight: 1.05 }}>
          How deep is
          <br />
          this street?
        </div>
      </Reveal>
      <Reveal at={96} dur={14}>
        <Label color={C.tealLight} style={{ marginTop: 22 }}>Chennai, Tamil Nadu</Label>
      </Reveal>
    </div>
    <div style={{ position: 'absolute', right: 120, top: 70, fontFamily: mono, fontSize: 16, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>Chennai floods, 2015 · photos: Vijayingarsal (CC0), Wikimedia Commons</div>
    <Caption lines={[{ from: 30, to: 280, text: 'During a flood, a photograph can show us the water. But can it tell us how dangerous it is?' }]} />
  </AbsoluteFill>
)

export const Problem = () => {
  const f = useCurrentFrame()
  const line = prog(f, 250, 30, LINEAR)
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Contours color={C.gridDark} opacity={0.5} draw={90} seed={2} />
      <div style={{ position: 'absolute', left: 120, top: 150 }}>
        <Reveal at={8}>
          <Label color={C.tealLight}>The problem</Label>
        </Reveal>
        <Reveal at={14} y={30}>
          <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 116, color: C.paper, letterSpacing: -3, marginTop: 14 }}>
            <Count to={1.81} at={14} dur={110} decimals={2} /> <span style={{ fontSize: 56 }}>billion</span>
          </div>
        </Reveal>
        <Reveal at={40}>
          <div style={{ fontFamily: sans, fontSize: 34, color: C.grid, maxWidth: 720 }}>people exposed to significant flood risk</div>
        </Reveal>
        <Reveal at={170} y={30}>
          <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 116, color: C.paper, letterSpacing: -3, marginTop: 56 }}>
            <span style={{ fontSize: 56, color: C.ink2 }}>more than </span>
            <Count to={400} at={170} dur={60} />
          </div>
        </Reveal>
        <Reveal at={190}>
          <div style={{ fontFamily: sans, fontSize: 34, color: C.grid }}>lives lost in Tamil Nadu&apos;s 2015 floods</div>
        </Reveal>
      </div>
      <Reveal at={150} dur={30} y={0} style={{ position: 'absolute', left: 1000, top: 110, width: 800, height: 420, overflow: 'hidden', border: `1px solid ${C.gridDark}` }}>
        <Img src={staticFile('stills/aerial_pmo.jpg')} style={{ width: 800, height: 420, objectFit: 'cover', transform: `scale(${1.02 + 0.08 * prog(f, 150, 250, LINEAR)})`, filter: 'saturate(0.85)' }} />
      </Reveal>
      <Reveal at={170} style={{ position: 'absolute', left: 1000, top: 536 }}>
        <div style={{ fontFamily: mono, fontSize: 15, color: C.ink2 }}>Chennai, 3 December 2015 · Prime Minister&apos;s Office, GODL-India, via Wikimedia Commons</div>
      </Reveal>
      <div style={{ position: 'absolute', left: 1000, top: 600, width: 800 }}>
        <div style={{ height: 3, background: C.teal, width: 800 * line }} />
        <Reveal at={280} y={16} dur={15}>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 68, letterSpacing: -1.5, color: C.paper, marginTop: 28 }}>
            A photo is
            <br />
            not data.
          </div>
        </Reveal>
      </div>
      <div style={{ position: 'absolute', left: 120, bottom: 215, fontFamily: mono, fontSize: 17, color: C.ink2 }}>Sources: World Bank (2024) · 2015 toll: Tamil Nadu government figure of 470 cited by the CAG (2018); Wikipedia lists 422</div>
      <Caption lines={[{ from: 40, to: 400, text: 'Flooding affects billions. In 2015, more than four hundred people died in Tamil Nadu. Yet a photograph cannot tell a rescuer how deep the water is.' }]} />
    </AbsoluteFill>
  )
}

export const Intro = () => {
  const f = useCurrentFrame()
  const title = Math.min(prog(f, 4, 16), 1 - prog(f, 96, 18))
  const step = (at: number, until: number) => Math.min(prog(f, at, 14), 1 - prog(f, until, 12))
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {/* a real, unedited recording of the app (replay mode), sped up 1.5x */}
      <OffthreadVideo src={staticFile('footage/app.mp4')} startFrom={75} playbackRate={1.5} muted style={{ width: 1920, height: 1080 }} />
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(245,244,238,0.98) 0%, rgba(245,244,238,0.96) 22%, rgba(245,244,238,0.0) 40%)', opacity: title }} />
      <div style={{ position: 'absolute', left: 120, top: 400, opacity: title, transform: `translateY(${(1 - title) * 20}px)` }}>
        <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 88, letterSpacing: -2.5, color: C.ink, lineHeight: 1.02 }}>
          Vellam
          <br />
          Map
        </div>
        <Label style={{ marginTop: 22 }}>Flood early-warning system</Label>
      </div>
      {[
        { at: 120, until: 175, n: '01', t: 'Pick a photo' },
        { at: 185, until: 255, n: '02', t: 'The pipeline runs, stage by stage' },
        { at: 262, until: 326, n: '03', t: 'A depth, with its error range' },
      ].map((s) => (
        <div key={s.n} style={{ position: 'absolute', right: 120, top: 120, opacity: step(s.at, s.until), transform: `translateY(${(1 - step(s.at, s.until)) * 12}px)`, background: C.ink, padding: '14px 22px', borderRadius: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 22, color: C.tealLight, letterSpacing: 1.5 }}>{s.n}</span>
          <span style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, color: C.paper, marginLeft: 16 }}>{s.t}</span>
        </div>
      ))}
      <div style={{ position: 'absolute', right: 120, bottom: 150, fontFamily: mono, fontSize: 18, color: C.ink, background: 'rgba(245,244,238,0.9)', padding: '6px 12px', letterSpacing: 1.2 }}>
        REPLAY MODE · RECORDED RUNS · MAP SHOWS LABELLED DEMO DATA
      </div>
      <Caption lines={[{ from: 24, to: 310, text: 'Vellam Map turns a flood photograph into a report with a place, a depth and an honest margin of error.' }]} />
    </AbsoluteFill>
  )
}

const NODES = [
  { n: '01', t: 'Photo', s: 'and a location' },
  { n: '02', t: 'SAM 3.1', s: 'segments water and wheels' },
  { n: '03', t: 'Geometry', s: 'waterline → centimetres' },
  { n: '04', t: 'Muse Spark', s: 'real flood? own depth' },
  { n: '05', t: 'Compare', s: 'do the two agree?' },
]

export const Pipeline = () => {
  const f = useCurrentFrame()
  const W = 270
  const GAP = 83
  const x = (i: number) => 120 + i * (W + GAP)
  const Y = 520
  const review = prog(f, 450, 30, MECH)
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Contours color={C.grid} opacity={0.5} draw={40} seed={5} />
      <div style={{ position: 'absolute', left: 120, top: 100 }}>
        <Reveal at={4}>
          <Label>How a report is checked</Label>
        </Reveal>
        <Reveal at={10} y={26}>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 68, letterSpacing: -1.5, color: C.ink, marginTop: 12 }}>Two readings that have to agree</div>
        </Reveal>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {NODES.slice(0, -1).map((_, i) => {
          const p = prog(f, 36 + i * 50, 28, MECH)
          return <line key={i} x1={x(i) + W} y1={Y + 60} x2={x(i) + W + GAP * p} y2={Y + 60} stroke={C.teal} strokeWidth={3} />
        })}
        <path d={`M ${x(4) + W / 2} ${Y + 120} V ${Y + 250}`} stroke={C.green} strokeWidth={3} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(f, 410, 28, LINEAR)} />
        <path d={`M ${x(4) + W / 2} ${Y + 250} H ${x(4) + W / 2 - 250}`} stroke={C.amber} strokeWidth={3} strokeDasharray="10 8" fill="none" opacity={review} />
      </svg>
      {(() => {
        const hop = (i: number) => 262 + i * 36
        const tx = (i: number) => x(i) + W / 2 - 110
        let cx = tx(0)
        for (let i = 1; i < 5; i++) cx += (tx(i) - tx(i - 1)) * prog(f, hop(i) - 14, 14, MECH)
        const show = prog(f, 250, 12)
        const stage = f < hop(1) ? 0 : f < hop(2) ? 1 : f < hop(3) ? 2 : f < hop(4) ? 3 : 4
        const badge = ['', 'water found', '34 ± 3 cm', '20–40 cm', 'agree'][stage]
        return (
          <div style={{ position: 'absolute', left: cx, top: Y - 215, width: 220, opacity: show }}>
            <div style={{ position: 'relative', width: 220, height: 147, border: `2px solid ${C.ink}`, overflow: 'hidden' }}>
              <Img src={staticFile('photos/s05.jpg')} style={{ position: 'absolute', width: 220, height: 147 }} />
              {stage >= 1 && <Img src={staticFile('photos/s05_water_mask.png')} style={{ position: 'absolute', width: 220, height: 147 }} />}
            </div>
            {badge && <div style={{ fontFamily: mono, fontSize: 20, color: C.ink, background: C.white, border: `1px solid ${C.grid}`, marginTop: 8, padding: '4px 10px', display: 'inline-block' }}>{badge}</div>}
          </div>
        )
      })()}
      {NODES.map((n, i) => {
        const a = prog(f, 28 + i * 50, 22)
        const key = i === 2 || i === 3
        return (
          <div key={n.n} style={{ position: 'absolute', left: x(i), top: Y, width: W, opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>
            <div style={{ height: 120, border: `2px solid ${key ? C.teal : C.ink}`, background: C.white, borderRadius: 6, padding: '18px 22px' }}>
              <div style={{ fontFamily: mono, fontSize: 19, color: C.teal, letterSpacing: 1.2 }}>{n.n}</div>
              <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 36, color: C.ink, marginTop: 4 }}>{n.t}</div>
            </div>
            <div style={{ fontFamily: sans, fontSize: 24, color: C.ink2, marginTop: 14 }}>{n.s}</div>
          </div>
        )
      })}
      <Reveal at={420} style={{ position: 'absolute', right: 120, top: Y + 175 }}>
        <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 24, color: C.green, letterSpacing: 1.2 }}>AGREE → LIVE MAP</div>
      </Reveal>
      <div style={{ position: 'absolute', left: x(4) + W / 2 - 560, top: Y + 270, opacity: review }}>
        <div style={{ fontFamily: mono, fontWeight: 500, fontSize: 24, color: C.amber, letterSpacing: 1.2 }}>DISAGREE → REVIEW, NOT THE MAP</div>
      </div>
      <Caption
        lines={[
          { from: 30, to: 250, text: 'SAM 3.1 finds the water and the wheels. Geometry turns the waterline into centimetres.' },
          { from: 270, to: 410, text: 'Muse Spark independently judges the photo and estimates depth.' },
          { from: 420, to: 530, text: 'If the two disagree, the report goes to review, not the map.' },
        ]}
      />
    </AbsoluteFill>
  )
}
