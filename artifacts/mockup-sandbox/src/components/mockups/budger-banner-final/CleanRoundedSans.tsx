const gradient = "linear-gradient(180deg, #6e6e6e 0%, #f0ede6 50%, #d8d3c8 100%)";

export function CleanRoundedSans() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-black">
      <h1
        className="text-7xl"
        style={{
          fontFamily: "'Quicksand', sans-serif",
          fontWeight: 700,
          letterSpacing: "-0.005em",
          lineHeight: 1.3,
          paddingBottom: "0.15em",
          display: "inline-block",
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
        Clean rounded sans, soft &amp; modern
      </p>
    </div>
  );
}
