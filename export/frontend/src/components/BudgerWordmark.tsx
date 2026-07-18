import type { CSSProperties } from "react";

const GRADIENT = "linear-gradient(180deg, #6e6e6e 0%, #f0ede6 50%, #d8d3c8 100%)";

export default function BudgerWordmark({
  size = 44,
  tagline,
  className = "",
  style,
}: {
  size?: number;
  tagline?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`flex flex-col items-center ${className}`} style={style}>
      <span style={{ display: "inline-block" }}>
        <span
          style={{
            fontFamily: "'Quicksand', sans-serif",
            fontWeight: 700,
            fontSize: size,
            letterSpacing: "-0.005em",
            lineHeight: 1.3,
            paddingBottom: "0.1em",
            display: "inline-block",
            background: GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          Budger
        </span>
      </span>
      {tagline && (
        <span
          style={{ fontSize: size * 0.295 }}
          className="tracking-widest uppercase text-muted-foreground/60 -mt-1"
        >
          {tagline}
        </span>
      )}
    </div>
  );
}
