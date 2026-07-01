/**
 * Badger notification: a quick sniff sound + matching haptic pattern.
 *
 * Rhythm: 4 eighth notes + 1 sustained quarter note (BPM 207, 1.5× faster).
 * Original pitch arc: 720 Hz → 590 → 510 → 650 → 808 Hz (baked into the MP3).
 * Per-sniff melodic pitch offsets (semitones from base):
 *   Sniff 1:  0   (as is)
 *   Sniff 2: −1   (down a semitone)
 *   Sniff 3: −3   (down a tone from 2nd)
 *   Sniff 4: −1   (up a tone from 3rd)
 *   Sniff 5: +1   (up a tone from 4th — lands a semitone above base)
 *
 * Haptic pattern mirrors the audio (♪ slot = 145 ms, ♩ slot = 290 ms):
 *   sniff · sniff · sniff · sniff · sniff~~~~
 *   [55, 90, 55, 90, 55, 90, 55, 90, 110]  ms
 *    ♪buzz gap  ♪buzz gap  ♪buzz gap  ♪buzz gap  ♩buzz
 */

export const BADGER_HAPTIC_PATTERN = [55, 90, 55, 90, 55, 90, 55, 90, 110];

/** Returns true if the Vibration API is available on this device. */
export function canHaptic(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

/** Fire the badger sniff haptic pattern. */
export function hapticSniff(): boolean {
  if (!canHaptic()) return false;
  return navigator.vibrate(BADGER_HAPTIC_PATTERN);
}

// ── Web Audio playback ──────────────────────────────────────────────────────

// Per-sniff playback rates: rate = 2^(semitones/12)
// Semitone offsets: 0, −1, −3, −1, 0
const SNIFF_RATES = [
  Math.pow(2,  0 / 12), // sniff 1 — base pitch
  Math.pow(2, -1 / 12), // sniff 2 — ↓1 semitone
  Math.pow(2, -3 / 12), // sniff 3 — ↓2 semitones from sniff 2 (= ↓3 from base)
  Math.pow(2, -1 / 12), // sniff 4 — ↑2 semitones from sniff 3 (= ↓1 from base)
  Math.pow(2, +1 / 12), // sniff 5 — ↑2 semitones from sniff 4 (= 1 semitone above base)
];

// Slot boundaries in source-buffer seconds
// 4 × ♪ (0.145 s each) + 1 × ♩ (0.580 s — extended sustain with fade-out)
const SNIFF_SLOTS = [
  { start: 0,     srcOffset: 0,     srcDuration: 0.145 },
  { start: 0.145, srcOffset: 0.145, srcDuration: 0.145 },
  { start: 0.290, srcOffset: 0.290, srcDuration: 0.145 },
  { start: 0.435, srcOffset: 0.435, srcDuration: 0.145 },
  { start: 0.580, srcOffset: 0.580, srcDuration: 0.580 },
];

// Total output duration of the sequence (seconds) — used to schedule the fade-out
const SEQUENCE_DURATION = 0.580 + 0.580; // 1.160 s

// Singletons — created once, reused across calls
let _ctx: AudioContext | null = null;
let _buffer: AudioBuffer | null = null;
let _loadPromise: Promise<AudioBuffer> | null = null;

function getAudioContext(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AudioContext();
  }
  return _ctx;
}

async function getSniffBuffer(): Promise<AudioBuffer> {
  if (_buffer) return _buffer;
  if (_loadPromise) return _loadPromise;

  const ctx = getAudioContext();
  _loadPromise = fetch(`${import.meta.env.BASE_URL}sounds/badger-sniff.mp3`)
    .then(r => r.arrayBuffer())
    .then(ab => ctx.decodeAudioData(ab))
    .then(buf => { _buffer = buf; return buf; });

  return _loadPromise;
}

/** Play the badger sniff sound with per-sniff melodic pitch offsets. */
export async function playSniffSound(): Promise<void> {
  try {
    const ctx = getAudioContext();
    // Browsers suspend AudioContext until a user gesture; resume if needed
    if (ctx.state === "suspended") await ctx.resume();

    const buffer = await getSniffBuffer();
    const now = ctx.currentTime;

    SNIFF_SLOTS.forEach(({ start, srcOffset, srcDuration }, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = SNIFF_RATES[i];

      const gain = ctx.createGain();
      gain.gain.value = 0.9;

      // On the last (sustained) sniff, schedule a gradual fade-out over the
      // final 0.45 s so it tails off naturally instead of cutting abruptly.
      if (i === SNIFF_SLOTS.length - 1) {
        const fadeStart = now + SEQUENCE_DURATION - 0.45;
        gain.gain.setValueAtTime(0.9, fadeStart);
        gain.gain.linearRampToValueAtTime(0, now + SEQUENCE_DURATION);
      }

      src.connect(gain);
      gain.connect(ctx.destination);

      src.start(now + start, srcOffset, srcDuration);
    });
  } catch {
    // Silently ignore — AudioContext may be blocked before any user gesture
  }
}

/**
 * Fire the full badger notification: sound + optional haptic together.
 * Pass `haptic: false` to skip vibration (e.g. when the user has it toggled off).
 */
export async function triggerBadgerNotification({ haptic = true }: { haptic?: boolean } = {}): Promise<void> {
  await Promise.all([
    playSniffSound(),
    haptic ? Promise.resolve(hapticSniff()) : Promise.resolve(false),
  ]);
}
