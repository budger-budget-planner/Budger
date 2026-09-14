export type BadgerMode = "awake" | "falling-asleep" | "sleeping" | "waking-up";

interface BadgerLogoProps {
  size?: number;
  /** Kept for compatibility with existing splash and onboarding call sites. */
  forceAnim?: "wink" | "sniff" | "lick" | null;
  /** Kept for compatibility with existing splash and onboarding call sites. */
  forceAnimDurationMs?: number;
  /** Kept for compatibility with the app shell's connectivity state. */
  mode?: BadgerMode;
  /** Kept for compatibility with existing splash call sites. */
  pauseIdleAnimations?: boolean;
  /** Kept for compatibility with existing animation call sites. */
  growPulse?: boolean;
}

const LOGO_WIDTH = 2386;
const LOGO_HEIGHT = 2048;
const LOGO_SRC = `${import.meta.env.BASE_URL}badger-logo-corrected.png`;

/**
 * Shared Budger mark.
 *
 * The corrected artwork is intentionally wider than its rounded frame because
 * the cheeks extend over the frame. The wrapper keeps the old square sizing
 * contract while allowing that artwork to remain uncropped.
 */
export default function BadgerLogo({ size = 40 }: BadgerLogoProps) {
  const imageWidth = Math.round(size * LOGO_WIDTH / LOGO_HEIGHT);

  return (
    <span
      role="img"
      aria-label="Budger badger logo"
      style={{
        position: "relative",
        display: "block",
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
        overflow: "visible",
      }}
    >
      <img
        src={LOGO_SRC}
        alt=""
        width={imageWidth}
        height={size}
        draggable={false}
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: imageWidth,
          height: size,
          maxWidth: "none",
          display: "block",
          transform: "translateX(-50%)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </span>
  );
}