import { Easing, interpolate } from 'remotion'
import { loadFont as loadSans } from '@remotion/google-fonts/IBMPlexSans'
import { loadFont as loadMono } from '@remotion/google-fonts/IBMPlexMono'
import { loadFont as loadTamil } from '@remotion/google-fonts/NotoSansTamil'

export const sans = loadSans('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily
export const mono = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily
export const tamil = loadTamil('normal', { weights: ['400', '500'], subsets: ['tamil'] }).fontFamily

export const C = {
  paper: '#F5F4EE',
  ink: '#171B19',
  ink2: '#626A64',
  grid: '#D9DCD3',
  gridDark: '#39413C',
  teal: '#168C83',
  tealLight: '#4FC3B8',
  amber: '#D99A36',
  red: '#C65B43',
  green: '#397C58',
  white: '#FFFFFF',
}

export const EDITORIAL = Easing.bezier(0.22, 1, 0.36, 1)
export const SMOOTH = Easing.bezier(0.16, 1, 0.3, 1)
export const MECH = Easing.bezier(0.65, 0, 0.35, 1)
export const LINEAR = (t: number) => t

/** 0 to 1 over `dur` frames starting at `start`. */
export const prog = (f: number, start: number, dur: number, easing: (t: number) => number = EDITORIAL) =>
  interpolate(f, [start, start + dur], [0, 1], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

export const SCENES = [
  { id: 'opening', from: 0, dur: 300 },
  { id: 'problem', from: 300, dur: 420 },
  { id: 'intro', from: 720, dur: 330 },
  { id: 'pipeline', from: 1050, dur: 540 },
  { id: 'technical', from: 1590, dur: 1260 },
  { id: 'voice', from: 2850, dur: 360 },
  { id: 'benchmark', from: 3210, dur: 840 },
  { id: 'limits', from: 4050, dur: 540 },
  { id: 'field', from: 4590, dur: 420 },
  { id: 'end', from: 5010, dur: 390 },
] as const
export const TOTAL = 5400
