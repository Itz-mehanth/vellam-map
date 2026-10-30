"""Cinematic audio for the demo film: a four-movement stereo score, real rain ambience and a small family of sound cues.

    python demo/audio2.py prototype demo/video/out/film.mp4 demo/audio_out2     # ~46 s excerpts to judge the sound
    python demo/audio2.py full      demo/video/out/film.mp4 demo/audio_out2     # whole film, muxed under the video

Everything but the rain is synthesized here, so there is nothing to license. The rain and traffic bed is
"Urban Street on a Rainy Afternoon" by Extemporalist (Wikimedia Commons, CC0), see demo/ambience/SOURCES.txt.
Times follow demo/video/src/theme.ts (30 fps). Stems are written separately so a voiceover can be mixed over them.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 180.0
N = int(SR * DUR)
HERE = Path(__file__).resolve().parent
rng = np.random.default_rng(11)
T = np.arange(N) / SR


# ------------------------------------------------------------------ helpers
def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x, axis=0)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def f2s(frame):
    return frame / 30.0


def place(bus, sig, at, gain=1.0, pan=0.0):
    """Mix a mono signal into the stereo bus with an equal-power pan (-1 left .. +1 right)."""
    i = int(at * SR)
    if i >= N or i < 0:
        return
    j = min(N, i + len(sig))
    a = (pan + 1) * np.pi / 4
    bus[i:j, 0] += sig[: j - i] * gain * np.cos(a)
    bus[i:j, 1] += sig[: j - i] * gain * np.sin(a)


def env_ar(n, attack, release):
    k = np.arange(n) / SR
    return np.minimum(1, k / max(attack, 1e-4)) * np.minimum(1, (n / SR - k) / max(release, 1e-4))


def curve(points):
    xs, ys = zip(*points)
    return np.interp(T, xs, ys)


def reverb(bus, wet=0.25, length=2.8):
    """Stereo convolution reverb from decaying, decorrelated noise."""
    n = int(length * SR)
    k = np.arange(n) / SR
    out = np.zeros_like(bus)
    for ch in (0, 1):
        ir = rng.normal(0, 1, n) * np.exp(-k * 2.4)
        ir = lp(ir, 5200)
        ir /= np.abs(ir).sum() ** 0.5 * 18
        out[:, ch] = fftconvolve(bus[:, ch], ir)[:N]
    return bus * (1 - wet * 0.4) + out * wet


# ------------------------------------------------------------------ instrument voices
def string(freq, dur, bright=2200):
    """Soft, slow ensemble string: detuned saws, low-passed, long attack."""
    n = int(dur * SR)
    k = np.arange(n) / SR
    s = np.zeros(n)
    for det in (-0.09, 0.0, 0.09):
        f = freq * (1 + det / 100)
        for h in range(1, 9):
            s += np.sin(2 * np.pi * f * h * k + h) / h
    s = lp(s, bright) * env_ar(n, 2.6, 2.8)
    return s * (1 + 0.04 * np.sin(2 * np.pi * 4.7 * k))  # a trace of vibrato-like movement


def piano(freq, dur=4.5):
    """Low-register piano-ish note: inharmonic partials with a hammer click and a long decay."""
    n = int(dur * SR)
    k = np.arange(n) / SR
    s = np.zeros(n)
    for h, a in zip(range(1, 9), (1, .6, .45, .3, .2, .14, .09, .06)):
        fh = freq * h * np.sqrt(1 + 0.0004 * h * h)
        s += a * np.sin(2 * np.pi * fh * k) * np.exp(-k * (0.9 + 0.55 * h))
    click = hp(rng.normal(0, 1, n), 1800) * np.exp(-k * 90) * 0.04
    s = lp(s + click, 4200)
    return s * np.minimum(1, k / 0.004)


def drone(freqs, dur):
    n = int(dur * SR)
    k = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        s += np.sin(2 * np.pi * f * k) + 0.35 * np.sin(2 * np.pi * f * 2.001 * k)
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * k)
    return lp(s, 600) * lfo * env_ar(n, 4.0, 4.0)


def tick(freq=3200, dur=0.05, hz_q=1.0):
    n = int(dur * SR)
    k = np.arange(n) / SR
    return bp(rng.normal(0, 1, n), freq * 0.7, min(freq * 1.4, 19000)) * np.exp(-k * 120) * hz_q


def tone(freq, dur=1.0, shape="sine"):
    n = int(dur * SR)
    k = np.arange(n) / SR
    if shape == "sine":
        s = np.sin(2 * np.pi * freq * k) + 0.25 * np.sin(2 * np.pi * freq * 2 * k)
    elif shape == "tri":
        s = (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * freq * k))
    else:  # soft fm: a different timbre for the second model
        s = np.sin(2 * np.pi * freq * k + 1.2 * np.sin(2 * np.pi * freq * 1.5 * k))
    return s * np.minimum(1, k / 0.012) * np.exp(-k * (3.0 if dur > 0.5 else 8.0))


# ------------------------------------------------------------------ the score
SC = {"problem": 10, "intro": 24, "pipeline": 35, "technical": 53, "voice": 95, "benchmark": 107, "limits": 135, "field": 153, "end": 167}


def music():
    bus = np.zeros((N, 2))

    # Movement A, 0-24 s: a low drone and a few piano notes. Starts almost silent.
    place(bus, drone([55.0, 82.4, 110.0], 36), 0.0, 0.05, 0.0)
    for at, n, g, p in [(2.5, 45, .5, -.3), (6.0, 48, .4, .2), (10.4, 57, .55, -.2), (15.7, 52, .6, .1), (18.6, 45, .35, -.3)]:
        place(bus, piano(midi(n)), at, g * 0.18, p)  # the line "A photo is not data" (19.3 s) gets silence

    # Movement B, 24-95 s: Am - F - C - G strings, a pulse that arrives slowly, and a quiet figure
    chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
    t, ci = 22.0, 0
    while t < 95:
        for j, n in enumerate(chords[ci % 4]):
            place(bus, string(midi(n), 9.6), t + j * 0.35, 0.040, (-0.5, 0.0, 0.5)[j])
        place(bus, string(midi(chords[ci % 4][0] - 12), 9.6, 900), t, 0.05, 0.0)
        t, ci = t + 8.0, ci + 1
    beat = 60 / 92
    t = 26.0
    while t < 95:
        ramp = min(1.0, (t - 26) / 14)
        if 35 < t:
            place(bus, tick(2600), t, 0.07 * ramp, -0.35)
            if round((t - 26) / beat) % 2 == 0:
                place(bus, tick(900, 0.09), t + beat / 2, 0.05 * ramp, 0.35)
        t += beat
    fig = [57, 60, 64, 67, 64, 60]
    t, k = 38.0, 0
    while t < 93:
        place(bus, piano(midi(fig[k % 6] + 12), 2.8), t, 0.07, -0.6 + 1.2 * ((k % 6) / 5))
        t, k = t + beat * 2, k + 1

    # voice scene, 95-107 s: nearly only the drone, so a spoken question can sit on top of it
    place(bus, drone([55.0, 82.4], 14), 94.0, 0.05, 0.0)

    # Movement C, 107-167 s: analytical pulse for the benchmark, then back to almost nothing
    t = 107.0
    while t < 135:
        place(bus, tick(3000), t, 0.05, -0.3)
        t += beat
    for j, n in enumerate([57, 60, 64]):
        place(bus, string(midi(n), 12.0), 107.0 + j * 0.3, 0.035, (-0.4, 0.0, 0.4)[j])
    for j, n in enumerate([53, 57, 60]):
        place(bus, string(midi(n), 14.0), 124.0 + j * 0.3, 0.030, (-0.4, 0.0, 0.4)[j])
    place(bus, drone([55.0, 82.4, 98.0], 34), 135.0, 0.06, 0.0)       # limitations: low, restrained, unresolved (G sounding against Am)
    for at, n in [(138.0, 45), (144.0, 48), (153.5, 45), (158.0, 52)]:
        place(bus, piano(midi(n), 5.0), at, 0.12, 0.0)

    # Movement D, 167-180 s: it opens into a warm, sustained resolution on A major add9
    for j, n in enumerate([45, 57, 61, 64, 66, 69]):
        place(bus, string(midi(n), 14.0, 2600), 166.0 + j * 0.25, 0.05, (-0.7, -0.35, 0.0, 0.3, 0.55, 0.8)[j])
    place(bus, piano(midi(57), 12.0), 169.0, 0.30, -0.1)   # the title lands with one low piano note
    place(bus, piano(midi(69), 10.0), 172.4, 0.18, 0.25)
    place(bus, piano(midi(73), 9.0), 174.2, 0.12, -0.2)

    # energy shape and the deliberate pauses
    shape = curve([(0, .18), (6, .22), (10, .35), (19, .35), (19.3, .12), (22.5, .3), (24, .45), (35, .6), (53, .85), (94, .85),
                   (95, .22), (106, .22), (108, .75), (135, .65), (136, .4), (147, .4), (148.2, .12), (151.5, .12), (153, .4),
                   (166, .5), (169, .95), (172, .85), (180, .35)])
    bus *= shape[:, None]
    bus *= np.minimum(1, T / 2.0)[:, None]
    bus *= np.minimum(1, (DUR - T) / 5.0)[:, None]
    bus = reverb(bus, 0.35, 3.2)
    return bus / max(1e-9, np.abs(bus).max()) * 0.5


# ------------------------------------------------------------------ environment
def ambience():
    bus = np.zeros((N, 2))
    sr, x = wavfile.read(HERE / "ambience" / "rain_street.wav")
    x = x.astype(float) / 32768
    x = x[int(12 * sr): int(26 * sr)]
    x *= 0.6 / max(1e-9, np.abs(x).max())            # the source recording is very quiet; bring it up
    env = curve([(0, 1.0), (7.5, 1.0), (10, 0.28), (14, 0.0), (180, 0.0)])
    n = min(len(x), int(14 * SR))
    bus[:n] = x[:n] * env[:n, None]
    # the main question lands at about 2-5 s; ease the rain just under it, then let it come back before the stats
    bus *= curve([(0, 0.0), (0.4, 1.0), (180, 1.0)])[:, None]
    return bus


# ------------------------------------------------------------------ sound cues
def sfx():
    bus = np.zeros((N, 2))
    S = SC

    def verified(at, pan=0.0):  # warm two-note confirmation, resolving upward
        place(bus, tone(587.33, 0.9, "sine"), at, 0.20, pan)
        place(bus, tone(880.0, 1.2, "sine"), at + 0.16, 0.22, pan)

    def review(at, pan=0.0):  # two notes that do not resolve: a suspended fourth
        place(bus, tone(587.33, 0.9, "tri"), at, 0.20, pan)
        place(bus, tone(698.46, 1.4, "tri"), at + 0.18, 0.20, pan)

    # opening: the headline appears over the rain with a low accent
    place(bus, piano(midi(33), 6.0), 2.0, 0.55, 0.0)
    # problem: low notes on the numbers (the quiet around the final line is in the music shape)
    place(bus, piano(midi(45), 5.0), S["problem"] + f2s(14), 0.30, -0.2)
    place(bus, piano(midi(40), 6.0), S["problem"] + f2s(170), 0.34, 0.2)
    # intro: map interface appearing, a single soft stereo sweep, then step ticks
    n = int(1.1 * SR)
    k = np.arange(n) / SR
    sweep = bp(rng.normal(0, 1, n), 700, 5200) * np.sin(np.pi * k / 1.1) ** 3
    sw = np.zeros((n, 2))
    sw[:, 0] = sweep * np.linspace(1, 0.15, n)
    sw[:, 1] = sweep * np.linspace(0.15, 1, n)
    i = int((S["intro"] + f2s(100)) * SR)
    bus[i:i + n] += sw * 0.07
    for fr in (120, 185, 262):
        place(bus, tick(2200, 0.06), S["intro"] + f2s(fr), 0.12, 0.2)
    # pipeline: each stage has its own small sound
    stage = [(tick(1800, 0.07), 0.18, -0.6), (bp(rng.normal(0, 1, int(0.5 * SR)), 1500, 4200) * np.hanning(int(0.5 * SR)), 0.1, -0.3),
             (tone(659.25, 0.5, "tri"), 0.12, 0.0), (tone(493.88, 0.6, "fm"), 0.12, 0.3), (tone(587.33, 0.5, "sine"), 0.12, 0.6)]
    for i2, (sig, g, p) in enumerate(stage):
        place(bus, sig, S["pipeline"] + f2s(28 + i2 * 50 + 4), g, p)
    verified(S["pipeline"] + f2s(420))
    review(S["pipeline"] + f2s(450), 0.1)
    # technical walkthrough, tied to the animation frames
    T0 = S["technical"]
    n = int(1.6 * SR)
    k = np.arange(n) / SR
    place(bus, bp(rng.normal(0, 1, n), 900, 6000) * (k / 1.6) ** 2 * np.sin(np.pi * k / 1.6) * 1.5, T0 + f2s(36), 0.07, -0.4)  # the mask forming
    place(bus, tone(587.33, 0.5, "tri"), T0 + f2s(90), 0.10, -0.3)                                                   # water segmented
    for i2 in range(6):
        place(bus, tick(2800 + 120 * i2, 0.05), T0 + f2s(320 + i2 * 8), 0.14, -0.5 + i2 * 0.2)                     # six wheels found
    place(bus, tone(659.25, 0.5, "tri"), T0 + f2s(366), 0.12, 0.3)                                                   # two are in water
    for i2, fr in enumerate((590, 614, 640, 668, 686)):                                                              # a ratchet as the circle and waterline are drawn
        place(bus, tick(1500 - 70 * i2, 0.07 + 0.01 * i2), T0 + f2s(fr), 0.18, 0.1)
    place(bus, tone(783.99, 1.4, "sine"), T0 + f2s(716), 0.22, 0.0)                                                  # the measurement resolves
    for i2, fr in enumerate((790, 820, 874)):
        place(bus, tick(2000, 0.05), T0 + f2s(fr), 0.12, -0.2 + i2 * 0.25)
    place(bus, tone(493.88, 1.0, "fm"), T0 + f2s(950), 0.14, 0.35)                                                   # Muse Spark answers: a distinct timbre
    verified(T0 + f2s(1124), -0.2)
    review(T0 + f2s(1138), 0.25)
    # benchmark: restrained data accents, no success sounds
    place(bus, tick(2400, 0.05), S["benchmark"] + f2s(10), 0.14, 0.0)
    for i2 in range(20):
        place(bus, tick(2500 + (i2 % 6) * 160, 0.03), S["benchmark"] + f2s(60 + i2 * 7), 0.06, -0.7 + 1.4 * (i2 / 19))
    place(bus, tone(659.25, 0.6, "tri"), S["benchmark"] + f2s(200), 0.12, 0.2)                                       # 0.89
    place(bus, tick(2200, 0.05), S["benchmark"] + f2s(360), 0.12, 0.0)
    place(bus, tone(392.0, 0.9, "tri"), S["benchmark"] + f2s(640), 0.12, -0.2)
    # limitations: a muted tone for the rejection, a softer resolution for the fix, a quiet marker for the cost
    place(bus, tone(311.13, 1.3, "tri"), S["limits"] + f2s(30), 0.16, -0.3)
    place(bus, tone(587.33, 1.2, "sine"), S["limits"] + f2s(170), 0.14, 0.3)
    place(bus, tone(440.0, 0.8, "tri"), S["limits"] + f2s(260), 0.10, 0.0)
    # field placeholders: real footage will bring its own sound, so only a quiet click for the comparison
    place(bus, tick(2100, 0.06), S["field"] + f2s(60), 0.12, 0.0)
    # end card: one accent when the title appears, then GitHub
    n = int(2.4 * SR)
    k = np.arange(n) / SR
    place(bus, lp(rng.normal(0, 1, n), 220) * np.exp(-k * 2.2) * 2.0, S["end"] + f2s(60), 0.3, 0.0)
    place(bus, tick(2000, 0.06), S["end"] + f2s(125), 0.12, 0.0)
    return bus


# ------------------------------------------------------------------ mixing
def save(path, bus):
    wavfile.write(path, SR, (np.clip(bus, -1, 1) * 32767).astype(np.int16))


def ff(*a):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)


def build(out: Path):
    out.mkdir(parents=True, exist_ok=True)
    m, a, s = music(), ambience(), sfx()
    save(out / "music.wav", m)
    save(out / "ambience.wav", a)
    save(out / "sfx.wav", s)
    mix = m * 0.7 + a * 0.9 + s * 1.0
    save(out / "mix_raw.wav", mix / max(1e-9, np.abs(mix).max()) * 0.9)
    ff("-i", str(out / "mix_raw.wav"), "-af", "loudnorm=I=-18:TP=-1.5:LRA=9", "-ar", "48000", "-ac", "2", str(out / "mix.wav"))


def report(path):
    sr, x = wavfile.read(path)
    x = x.astype(float) / 32768
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    print(f"{path.name}: {len(x) / sr:.1f}s, stereo={x.ndim == 2}, peak {20 * np.log10(np.abs(x).max()):.1f} dBFS, "
          f"side/mid {20 * np.log10(np.sqrt((side ** 2).mean()) / np.sqrt((mid ** 2).mean())):.1f} dB, "
          f"L-R correlation {np.corrcoef(x[:, 0], x[:, 1])[0, 1]:.2f}")


def main(mode, film, out):
    out = Path(out)
    build(out)
    if mode == "full":
        ff("-i", str(film), "-i", str(out / "mix.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "224k", "-ac", "2", "-shortest", str(out / "film_with_audio.mp4"))
        print("full film ->", out / "film_with_audio.mp4")
    else:
        # six moments that carry the sound design: rain opening, the statistics and the silence, SAM, geometry, verified vs review, the ending
        wins = [(0, 9), (14.5, 23.5), (56, 62), (74, 80.5), (89.5, 96), (166, 180)]
        parts = []
        for i, (a, b) in enumerate(wins):
            ff("-ss", str(a), "-t", str(b - a), "-i", str(out / "mix.wav"), "-af", f"afade=t=in:d=0.25,afade=t=out:st={b - a - 0.4}:d=0.4", str(out / f"p{i}.wav"))
            parts.append(out / f"p{i}.wav")
        ff(*sum([["-i", str(p)] for p in parts], []), "-filter_complex", f"concat=n={len(parts)}:v=0:a=1", str(out / "prototype.wav"))
        print("prototype ->", out / "prototype.wav")
    report(out / "mix.wav")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
