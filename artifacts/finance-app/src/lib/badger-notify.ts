/**
 * Badger notification: a quick sniff sound + matching haptic pattern.
 *
 * Haptic pattern mirrors the audio rhythm:
 *   sniff · sniff · sniff (pause) · sniff · sniff
 *   [22, 38, 22, 38, 28,  90,  22, 38, 22]  ms
 *    buzz gap  buzz gap  buzz  pause buzz gap  buzz
 */

export const BADGER_HAPTIC_PATTERN = [22, 38, 22, 38, 28, 90, 22, 38, 22];

/** Returns true if the Vibration API is available on this device. */
export function canHaptic(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

/** Fire the badger sniff haptic pattern. */
export function hapticSniff(): boolean {
  if (!canHaptic()) return false;
  return navigator.vibrate(BADGER_HAPTIC_PATTERN);
}

/** Play the badger sniff sound. Returns a promise that resolves when playback starts. */
export async function playSniffSound(): Promise<void> {
  try {
    const audio = new Audio(`${import.meta.env.BASE_URL}sounds/badger-sniff.mp3`);
    audio.volume = 0.9;
    await audio.play();
  } catch {
    // Silently ignore — autoplay may be blocked before user gesture
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
