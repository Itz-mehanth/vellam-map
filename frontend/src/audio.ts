/** Microphone recording, converted to the WAV format Muse Voice Transcribe accepts. */

const TARGET_RATE = 16000
export const MAX_RECORD_SECONDS = 20

export interface Recorder {
  stream: MediaStream
  stop: () => Promise<Blob>
}

export async function startRecording(onAutoStop: () => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.start()
  const timer = window.setTimeout(onAutoStop, MAX_RECORD_SECONDS * 1000)
  return {
    stream,
    stop: () =>
      new Promise((resolve) => {
        window.clearTimeout(timer)
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop())
          resolve(await toWav(new Blob(chunks, { type: recorder.mimeType })))
        }
        recorder.stop()
      }),
  }
}

/** Decode any browser audio format, downmix to mono, resample to 16 kHz, write 16-bit PCM WAV. */
async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  await ctx.close()
  const length = Math.ceil(decoded.duration * TARGET_RATE)
  const offline = new OfflineAudioContext(1, length, TARGET_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination) // multi-channel input is downmixed to mono by the 1-channel destination
  source.start()
  const samples = (await offline.startRendering()).getChannelData(0)

  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, TARGET_RATE, true)
  view.setUint32(28, TARGET_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  return new Blob([view], { type: 'audio/wav' })
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis
  const now = synth.getVoices()
  if (now.length) return Promise.resolve(now)
  // Browsers fill the voice list asynchronously, so the first call is usually empty.
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(synth.getVoices()), 1500)
    synth.addEventListener('voiceschanged', () => { window.clearTimeout(timer); resolve(synth.getVoices()) }, { once: true })
  })
}

/** Reads text aloud with the browser's voice for the language. Resolves false if the device has none. */
export async function speak(text: string, lang: string): Promise<boolean> {
  if (!('speechSynthesis' in window)) return false
  const prefix = lang.toLowerCase().slice(0, 2)
  const voices = await loadVoices()
  const voice =
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === lang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  if (!voice) return false
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  window.speechSynthesis.speak(u)
  return true
}
