import { AbsoluteFill, Sequence } from 'remotion'
import { Benchmark, End, Field, Limits, Voice } from './scenes/Late'
import { Intro, Opening, Pipeline, Problem } from './scenes/Early'
import { Technical } from './scenes/Technical'
import { SCENES } from './theme'
import { Waterline } from './ui'

const BY_ID = { opening: Opening, problem: Problem, intro: Intro, pipeline: Pipeline, technical: Technical, voice: Voice, benchmark: Benchmark, limits: Limits, field: Field, end: End }
// The signature transition is kept for the moments the story moves to a new kind of evidence.
const SWEEP = new Set(['pipeline', 'technical', 'benchmark', 'end'])

export const Film = () => (
  <AbsoluteFill>
    {SCENES.map((s) => {
      const Scene = BY_ID[s.id]
      return (
        <Sequence key={s.id} from={s.from} durationInFrames={s.dur} name={s.id}>
          <Scene />
          {SWEEP.has(s.id) && <Waterline />}
        </Sequence>
      )
    })}
  </AbsoluteFill>
)
