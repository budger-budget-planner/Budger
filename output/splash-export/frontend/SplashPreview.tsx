/**
 * /splash-preview — Static frames for verifying splash-screen proportions.
 *
 * Shows each key phase of the splash animation as a full-screen still so
 * proportions can be checked without fighting animation timing.
 *
 * Frames (tap the dots or swipe to navigate):
 *   1. bigText   — large wordmark centered, logo hidden
 *   2. float     — logo + wordmark at splash proportions (logo 120 px, wordmark 38 px)
 *   3. settled   — logo + wordmark landed at login-screen proportions (88 px / 48 px)
 *   4. login     — actual login screen layout for direct comparison
 */
import { useState } from "react";
import BadgerLogo from "@/components/BadgerLogo";
import BudgerWordmark from "@/components/BudgerWordmark";

// Sizes that match the real SplashScreen.tsx and Login.tsx exactly.
const SPLASH_LOGO_SIZE   = 120;  // SplashScreen SPLASH_SIZE
const SPLASH_WORD_SIZE   = 38;   // BudgerWordmark size={38} in SplashScreen
const LOGIN_LOGO_SIZE    = 88;   // BadgerLogo size={88} in Login.tsx
const LOGIN_WORD_SIZE    = 48;   // BudgerWordmark size={48} in Login.tsx

const RADIAL_BG =
  "radial-gradient(ellipse at 50% 48%, hsl(0,0%,18%) 0%, hsl(0,0%,8%) 52%, hsl(0,0%,4%) 100%)";

const LABELS = ["1 · Opening text", "2 · Float", "3 · Login landing", "4 · Login (reference)"];

/* ── Individual frames ─────────────────────────────────────────────────────── */

/** Frame 1: bigText — only the wordmark visible, scaled large, logo invisible */
function FrameBigText() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: RADIAL_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/*
        Reproduce the real layout: an invisible logo div sits above the wordmark
        inside the flex column. The wordmark is shifted up to compensate, then
        scaled up, ending up visually centered on the screen.
        Logo height ≈ 120 px; group center sits ~95 px below screen center.
      */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Invisible logo placeholder (takes up space but not visible) */}
        <div style={{ width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE, opacity: 0 }} />

        {/* Wordmark shifted up and scaled */}
        <div
          style={{
            marginTop: 20,
            transform: "scale(1.55) translateY(-61px)",
            transformOrigin: "center center",
          }}
        >
          <BudgerWordmark size={SPLASH_WORD_SIZE} tagline="Budget Planner" />
        </div>
      </div>
    </div>
  );
}

/** Frame 2: float — logo fully visible, wordmark at normal splash size */
function FrameFloat() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: RADIAL_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <BadgerLogo size={SPLASH_LOGO_SIZE} pauseIdleAnimations growPulse={false} />
        <div style={{ marginTop: 20 }}>
          <BudgerWordmark size={SPLASH_WORD_SIZE} tagline="Budget Planner" />
        </div>
      </div>
    </div>
  );
}

/** Frame 3: settled — logo + wordmark in login-screen proportions, shifted up */
function FrameSettled() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: RADIAL_BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Shift up ~15 vh to simulate the login-screen position */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: "translateY(-15vh)",
        }}
      >
        <BadgerLogo size={LOGIN_LOGO_SIZE} pauseIdleAnimations growPulse={false} />
        <div style={{ marginTop: 12 }}>
          <BudgerWordmark size={LOGIN_WORD_SIZE} tagline="Budget Planner" />
        </div>
      </div>
    </div>
  );
}

/** Frame 4: login reference — exact login-screen layout */
function FrameLoginRef() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "hsl(0,0%,4%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px 40px",
        gap: 32,
      }}
    >
      {/* Language buttons (decorative) */}
      <div style={{ display: "flex", gap: 8, alignSelf: "flex-end", marginBottom: -16 }}>
        {["EN", "PL"].map((l, i) => (
          <div
            key={l}
            style={{
              padding: "6px 16px",
              borderRadius: 12,
              border: `1px solid ${i === 0 ? "hsl(0,0%,90%)" : "hsl(0,0%,30%)"}`,
              background: i === 0 ? "hsl(0,0%,90%)" : "transparent",
              color: i === 0 ? "hsl(0,0%,4%)" : "hsl(0,0%,50%)",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {l}
          </div>
        ))}
      </div>

      {/* Logo + wordmark */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <BadgerLogo size={LOGIN_LOGO_SIZE} pauseIdleAnimations growPulse={false} />
        <BudgerWordmark size={LOGIN_WORD_SIZE} tagline="Budget Planner" />
      </div>

      {/* Email input (decorative) */}
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 14, color: "hsl(0,0%,50%)", marginBottom: 6 }}>Email address</div>
        <div
          style={{
            height: 56,
            borderRadius: 16,
            background: "hsl(0,0%,12%)",
            border: "1px solid hsl(0,0%,20%)",
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            color: "hsl(0,0%,40%)",
            fontSize: 16,
          }}
        >
          alex@example.com
        </div>
      </div>

      {/* Continue button (decorative) */}
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          height: 56,
          borderRadius: 16,
          background: "hsl(0,0%,90%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          fontWeight: 600,
          color: "hsl(0,0%,4%)",
        }}
      >
        Continue
      </div>

      <div style={{ fontSize: 14, color: "hsl(0,0%,40%)" }}>
        New here?{" "}
        <span style={{ color: "hsl(0,0%,90%)", textDecoration: "underline" }}>
          Create an account
        </span>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function SplashPreview() {
  const initialFrame = Math.max(0, Math.min(3, Number(new URLSearchParams(window.location.search).get("f") ?? "0")));
  const [frame, setFrame] = useState(initialFrame);

  const frames = [
    <FrameBigText key="bigtext" />,
    <FrameFloat   key="float"   />,
    <FrameSettled key="settled" />,
    <FrameLoginRef key="login"  />,
  ];

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#000" }}>
      {/* Active frame */}
      <div style={{ position: "absolute", inset: 0 }}>
        {frames[frame]}
      </div>

      {/* Frame label */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            color: "hsl(0,0%,70%)",
            fontSize: 12,
            fontFamily: "monospace",
            padding: "4px 12px",
            borderRadius: 99,
            letterSpacing: "0.04em",
          }}
        >
          {LABELS[frame]}
        </div>
      </div>

      {/* Nav dots */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {frames.map((_, i) => (
          <button
            key={i}
            onClick={() => setFrame(i)}
            style={{
              width: i === frame ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === frame ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "width 0.2s ease, background 0.2s ease",
            }}
            aria-label={LABELS[i]}
          />
        ))}
      </div>

      {/* Prev / next tap zones */}
      <button
        onClick={() => setFrame(f => Math.max(0, f - 1))}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 80,
          width: "40%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        aria-label="Previous frame"
      />
      <button
        onClick={() => setFrame(f => Math.min(frames.length - 1, f + 1))}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 80,
          width: "40%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        aria-label="Next frame"
      />
    </div>
  );
}
