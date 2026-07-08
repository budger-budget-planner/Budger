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

// Milliseconds from the start of the sound to sniff 4 — used to time page
// transitions so the scene changes exactly when the 4th sniff fires.
export const SNIFF_4_OFFSET_MS = 435;

// Slot boundaries in source-buffer seconds
// 4 × ♪ (0.145 s each) + 1 × ♩ (0.580 s — extended sustain with fade-out)
const SNIFF_SLOTS = [
  { start: 0,     srcOffset: 0,     srcDuration: 0.145 },
  { start: 0.145, srcOffset: 0.145, srcDuration: 0.145 },
  { start: 0.290, srcOffset: 0.290, srcDuration: 0.145 },
  { start: 0.435, srcOffset: 0.435, srcDuration: 0.145 },
  { start: 0.580, srcOffset: 0.580, srcDuration: 1.0 },
];

// Total output duration of the sequence (seconds) — used to schedule the fade-out
const SEQUENCE_DURATION = 0.580 + 1.0; // 1.580 s

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

/**
 * Create (and resume) the shared AudioContext synchronously, from within a
 * user-gesture call stack (click/tap/change handler — called directly, not
 * after an `await`). Mobile Safari and Chrome's autoplay policies only allow
 * `AudioContext.resume()` to unlock playback when it runs as part of the
 * gesture itself; calling it later (e.g. inside a network response handler
 * that resolves seconds after the tap) silently fails to unlock audio, so
 * `playSniffSound()` ends up scheduling into a context that never plays.
 *
 * Call this at the moment of the triggering tap (e.g. opening the file
 * picker) so the context is already "running" by the time the async work
 * finishes and `playSniffSound()` is actually invoked.
 */
export function primeSniffAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    // Also start warming the sniff buffer fetch/decode so it's ready by the
    // time playback is requested.
    void getSniffBuffer();
  } catch {
    // Ignore — AudioContext may be unavailable in this environment
  }
}

/** Play the badger sniff sound with per-sniff melodic pitch offsets. */
export async function playSniffSound(): Promise<void> {
  try {
    const ctx = getAudioContext();
    // Browsers suspend AudioContext until a user gesture; resume if needed.
    // This only succeeds here if a gesture unlocked it earlier (see
    // `primeSniffAudio`) — by the time an async AI extraction resolves, we
    // are well outside the gesture window on iOS Safari / Chrome autoplay policy.
    if (ctx.state === "suspended") await ctx.resume();

    const buffer = await getSniffBuffer();
    const now = ctx.currentTime;

    // Fade-in levels for the first two sniffs: sniff 1 starts at 0.15 and
    // ramps to 0.55 by its end; sniff 2 ramps from 0.55 to 0.9; sniff 3+
    // plays at full volume 0.9.
    const FADE_IN_LEVELS = [
      { from: 0.15, to: 0.55 }, // sniff 1
      { from: 0.55, to: 0.9  }, // sniff 2
    ];

    SNIFF_SLOTS.forEach(({ start, srcOffset, srcDuration }, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = SNIFF_RATES[i];

      const gain = ctx.createGain();

      if (i < FADE_IN_LEVELS.length) {
        // First two sniffs: fade in over the slot duration
        const { from, to } = FADE_IN_LEVELS[i];
        gain.gain.setValueAtTime(from, now + start);
        gain.gain.linearRampToValueAtTime(to, now + start + srcDuration);
      } else if (i === SNIFF_SLOTS.length - 1) {
        // Last (sustained) sniff: hold full volume then fade out over final 0.65 s
        gain.gain.setValueAtTime(0.9, now + start);
        const fadeStart = now + SEQUENCE_DURATION - 0.65;
        gain.gain.setValueAtTime(0.9, fadeStart);
        gain.gain.linearRampToValueAtTime(0, now + SEQUENCE_DURATION);
      } else {
        // Middle sniffs: full volume, explicitly scheduled for consistency
        gain.gain.setValueAtTime(0.9, now + start);
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
