const gradient = "linear-gradient(180deg, #8a8a8a 0%, #ffffff 50%, #cfcac0 100%)";

export function OxaniumHorizon() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-black">
      <h1
        className="text-7xl"
        style={{
          fontFamily: "'Oxanium', sans-serif",
          fontWeight: 700,
          letterSpacing: "0.04em",
          background: gradient,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        }}
      >
        Budger
      </h1>
      <p className="text-xs tracking-widest uppercase text-neutral-500" style={{ fontFamily: "Inter, sans-serif" }}>
        Oxanium · 700 · wide
      </p>
    </div>
  );
}
