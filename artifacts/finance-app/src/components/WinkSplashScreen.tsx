import { useEffect, useRef, useState } from "react";
import BadgerLogo from "@/components/BadgerLogo";

const LOGO_SIZE = 96;
const TARGET_SIZE = 42;
const STILL_MS = 900;
const WINK_MS = 700;
const FLY_MS = 550;
const FADE_MS = 260;

type Phase = "float" | "wink" | "fly" | "fade";

export default function WinkSplashScreen({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<Phase>("float");
  const flyRef = useRef<{ tx: number; ty: number; scale: number } | null>(null);

  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];

    ids.push(setTimeout(() => setPhase("wink"), STILL_MS));

    ids.push(setTimeout(() => {
      const el = document.querySelector("[data-splash-logo-home]") as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const targetCX = rect.left + rect.width / 2;
        const targetCY = rect.top + rect.height / 2;
        const startCX = window.innerWidth / 2;
        const startCY = window.innerHeight / 2;
        flyRef.current = {
          tx: targetCX - startCX,
          ty: targetCY - startCY,
          scale: TARGET_SIZE / LOGO_SIZE,
        };
      }
      setPhase("fly");
    }, STILL_MS + WINK_MS));

    if (onDone) {
      ids.push(setTimeout(() => setPhase("fade"), STILL_MS + WINK_MS + FLY_MS));
      ids.push(setTimeout(onDone, STILL_MS + WINK_MS + FLY_MS + FADE_MS));
    }

    return () => ids.forEach(clearTimeout);
  }, [onDone]);

  const fly = flyRef.current;
  const isFly = phase === "fly" || phase === "fade";

  const logoStyle: React.CSSProperties = {
    transition: isFly ? `transform ${FLY_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none",
    transform: isFly && fly
      ? `translate(${fly.tx}px, ${fly.ty}px) scale(${fly.scale})`
      : "translate(0, 0) scale(1)",
    transformOrigin: "center center",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background:
          "radial-gradient(ellipse at 50% 48%, hsl(0,0%,18%) 0%, hsl(0,0%,8%) 52%, hsl(0,0%,4%) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: phase === "fade" ? 0 : 1,
        transition: phase === "fade" ? `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : "none",
        pointerEvents: phase === "fade" ? "none" : "auto",
      }}
    >
      <div
        className={phase === "float" ? "splash-pulse" : undefined}
        style={logoStyle}
      >
        <BadgerLogo
          size={LOGO_SIZE}
          forceAnim={phase === "wink" ? "wink" : null}
          forceAnimDurationMs={phase === "wink" ? WINK_MS : undefined}
        />
      </div>
    </div>
  );
}
