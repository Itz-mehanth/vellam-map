import type { Tone } from './tone'

export const STATUS: Record<string, { label: string; tone: Tone; text: string }> = {
  verified: { label: 'Verified', tone: 'ok', text: 'Published to the live map.' },
  flood_unconfirmed: {
    label: 'Unconfirmed',
    tone: 'warn',
    text: 'Water seems to be on the ground, but the photo is too blurry, dark, cropped or shallow to confirm how far it spreads. It is shown, flagged as unconfirmed.',
  },
  flood_visual_estimate: {
    label: 'Visual estimate',
    tone: 'warn',
    text: 'No wheel was visible at the waterline, so there is no geometric measurement. The range is a by-eye estimate and much less reliable.',
  },
  flood_unmeasured: { label: 'Flood confirmed', tone: 'warn', text: 'The flood is real, but its depth could not be read from this photo.' },
  flood_review: {
    label: 'Needs review',
    tone: 'warn',
    text: 'The measured depth disagrees with the visual check, or the photo was geotagged elsewhere. It is shown as unconfirmed.',
  },
  rejected_stale: { label: 'Rejected: too old', tone: 'bad', text: 'The photo was taken more than 3 days ago.' },
  rejected_duplicate: { label: 'Rejected: duplicate', tone: 'bad', text: 'This photo matches an earlier report.' },
  rejected_not_flood: { label: 'Rejected: not a flood', tone: 'bad', text: 'This does not look like a real, original flood photo.' },
}
