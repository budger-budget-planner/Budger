import { useEffect, useRef, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import BadgerLogo from "@/components/BadgerLogo";
import { loadPrefs, hasActiveSession } from "@/lib/prefs";

type Phase = "showing" | "to-home" | "to-login";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("showing");
  const [minDone, setMinDone] = useState(false);
  const { data: user, isLoading } = useGetMe();
  const resolvedRef = useRef(false);

  // Enforce minimum 2-second display
  useEffect(() => {
    const id = setTimeout(() => setMinDone(true), 2000);
    return () => clearTimeout(id);
  }, []);

  // Transition once BOTH the 2s elapsed AND the auth check resolved
  useEffect(() => {
    if (!minDone || isLoading || resolvedRef.current) return;
    resolvedRef.current = true;

    const prefs = loadPrefs();
    const goHome = user != null && (prefs.staySignedIn || hasActiveSession());
    setPhase(goHome ? "to-home" : "to-login");

    // Remove from DOM after transition finishes (550ms transition + 50ms buffer)
    setTimeout(onDone, 600);
  }, [minDone, isLoading, user, onDone]);

  const transitioning = phase !== "showing";

  // Logo transform: shrink toward top-left (header) or shrink in place (login center)
  let logoTransform = "scale(1)";
  if (phase === "to-home") {
    logoTransform = "translate(-43vw, -44vh) scale(0.233)";
  } else if (phase === "to-login") {
    logoTransform = "scale(0.733)";
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        // Radial gradient: lighter grey at center (card-border hue) → very dark at edges (sidebar)
        background:
          "radial-gradient(ellipse at 50% 48%, hsl(0,0%,18%) 0%, hsl(0,0%,8%) 52%, hsl(0,0%,4%) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Fade the whole overlay out during transition
        opacity: transitioning ? 0 : 1,
        transition: "opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: transitioning ? "none" : "auto",
      }}
    >
      <div
        style={{
          transform: logoTransform,
          transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
          willChange: "transform",
          transformOrigin: "center center",
        }}
      >
        <BadgerLogo size={120} />
      </div>
    </div>
  );
}
