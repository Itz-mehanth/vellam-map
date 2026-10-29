# Vellam Map: Design Plan

## Direction: "Hydrographic instrument"

Vellam Map should feel like a precision field instrument made by a civic engineering studio, not like a chatbot. The visual language comes from the tools flood engineers actually use: **staff gauges** (the red-and-white E-marked boards on bridges), **survey logs** and **nautical charts**. Calm, exact and legible under stress.

### What it must never look like
- No purple-to-blue gradients, glow, sparkles, emoji, robot or chat-bubble avatars, "Powered by AI" badges.
- No oversized rounded cards floating in empty space. No generic dashboard tiles.
- Models are named plainly where they do work (`SAM 3.1`, `Muse Spark`), like instrument channels on a log, never as magic.

## Foundations

| Token | Value | Use |
|---|---|---|
| `paper` | `#F5F4EF` | App background, warm like chart paper |
| `surface` | `#FFFFFF` | Panels |
| `ink` | `#0D1B26` | Text, primary buttons |
| `ink-2` / `ink-3` | `#3B4853` / `#6C7782` | Secondary and tertiary text |
| `line` | `#E4E1D8` | Hairlines (1px, never heavy shadows) |
| `gauge` | `#D3263A` | Staff-gauge red: brand mark and the danger band only |
| `signal` | `#1E5BD6` | Interactive accent, waterline |

**Depth bands** (named in body terms people use, not only numbers):
Ankle `<20 cm` `#3FA79A` · Knee `20–50` `#E3B23C` · Thigh `50–90` `#E2703A` · Waist+ `90+` `#C42F3B` · Unknown `#8C959D`.

**Type:** IBM Plex Sans (UI), IBM Plex Mono (every number, coordinate, timing and caption), Noto Sans Tamil (Tamil answers and labels), metrically close to Plex, self-hosted so the installed app works offline. Numbers are always tabular.

**Shape:** 6–10 px radii, 1 px hairlines, one soft shadow level for floating panels only. Dense, aligned to a 4 px grid.

**Motion:** quick and physical (150–300 ms, spring for sheets). Water rises in the gauge, steps of the survey log slide in as the server finishes them. Nothing loops for decoration; respect `prefers-reduced-motion`.

## Brand mark

A wheel standing in water: a tyre ring, hub and lug nuts with the waterline crossing it, the submerged part turning blue. It is literally how the app measures depth (a wheel of known size, partly under water), and it stays legible down to a 16 px tab icon. `public/logo.svg` is the source; the app icon is the same mark on ink with the light tyre. Icons, the 1200×630 link-preview card and the manifest shortcuts (`/?tab=report`, `/?tab=ask`) all derive from it.

## Layout

- **Map-first.** A full-bleed map is always the stage: OpenStreetMap tiles quietened with a CSS filter to a chart-paper tone, so only the depth pins carry colour (CARTO's free basemap now needs an API key). The work happens in a floating side panel on desktop and a bottom sheet on phones.
- **Top bar:** gauge-mark logo, wordmark, city, a live indicator ("18 reports · updated 2 min ago").
- **Panel tabs:** `Live` (alerts and the report feed), `Report` (the measurement), `Ask` (voice).

## Signature components

1. **Staff gauge** for results: a vertical gauge with E-marks from 0 to 150 cm, water rising to the measured depth, the uncertainty band hatched, body landmarks (ankle, knee, waist) at the side.
2. **Survey log** for the pipeline: numbered steps `01–07` in mono, instrument channel at the right (`SAM 3.1`, `Muse Spark`, `geometry`), real timings, expanding with the actual intermediate results.
3. **Depth markers** on the map: small pills showing the number itself ("62"), coloured by band; visual guesses are outlined and prefixed "~". Alert areas are faint radius rings.
4. **Voice console**: a large record control with a live waveform from the microphone, then the answer typeset like a dispatch, with numbered source reports that fly the map to the place.

## Build steps

1. Design tokens, fonts, icons (lucide), motion library.
2. App shell: top bar, map stage, floating panel / bottom sheet, tabs.
3. Map: tiles, depth-pill markers, alert rings, legend, fly-to.
4. Live tab: situation summary, alerts with share, report feed.
5. Report tab: capture, sample strip, survey log, staff gauge.
6. Ask tab: voice console with waveform, answer and sources.
7. Screenshot review at desktop and phone widths, then refine.
