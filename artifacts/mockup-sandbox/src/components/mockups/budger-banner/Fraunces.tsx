export function Fraunces() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-black">
      <h1
        className="text-6xl"
        style={{
          fontFamily: "'Fraunces', Georgia, serif",
          fontOpticalSizing: "auto" as any,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          background: "linear-gradient(to bottom, #d8d8d8 0%, #ffffff 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        }}
      >
        Budger
      </h1>
      <p className="text-xs tracking-widest uppercase text-neutral-500" style={{ fontFamily: "Inter, sans-serif" }}>
        Soft serif · plush &amp; elegant
      </p>
    </div>
  );
}
