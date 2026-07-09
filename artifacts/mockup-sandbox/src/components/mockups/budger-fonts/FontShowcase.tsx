export function FontShowcase() {
  const gradient = {
    background: "linear-gradient(to right, #6b7280 0%, #d1d5db 18%, #ffffff 38%, #ffffff 62%, #d1d5db 82%, #6b7280 100%)",
    WebkitBackgroundClip: "text" as const,
    WebkitTextFillColor: "transparent" as const,
    backgroundClip: "text" as const,
    display: "inline-block" as const,
  };

  const fonts: {
    label: string;
    descriptor: string;
    style: React.CSSProperties;
  }[] = [
    {
      label: "01 — System Modern",
      descriptor: "Geist · 800 · tight",
      style: { fontFamily: "'Geist', sans-serif", fontWeight: 800, fontSize: 64, letterSpacing: "-0.03em" },
    },
    {
      label: "02 — Rounded Tech",
      descriptor: "Outfit · 900 · natural",
      style: { fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 64, letterSpacing: "-0.01em" },
    },
    {
      label: "03 — Brand Punch",
      descriptor: "Montserrat · 900 · compressed",
      style: { fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 60, letterSpacing: "-0.05em" },
    },
    {
      label: "04 — Editorial Serif",
      descriptor: "Playfair Display · 700 · natural",
      style: { fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 58, letterSpacing: "0em" },
    },
    {
      label: "05 — Terminal",
      descriptor: "Space Mono · 700 · wide",
      style: { fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 48, letterSpacing: "0.04em" },
    },
    {
      label: "06 — Horizon",
      descriptor: "Oxanium · 700 · wide",
      style: { fontFamily: "'Oxanium', sans-serif", fontWeight: 700, fontSize: 58, letterSpacing: "0.06em" },
    },
    {
      label: "07 — Whisper",
      descriptor: "Poppins · 100 · ultra-wide",
      style: { fontFamily: "'Poppins', sans-serif", fontWeight: 100, fontSize: 52, letterSpacing: "0.28em" },
    },
    {
      label: "08 — Warm Ink",
      descriptor: "Lora · 700 italic · natural",
      style: { fontFamily: "'Lora', serif", fontWeight: 700, fontStyle: "italic", fontSize: 58, letterSpacing: "0.01em" },
    },
    {
      label: "09 — Technical",
      descriptor: "Space Grotesk · 700 · snug",
      style: { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 60, letterSpacing: "-0.02em" },
    },
    {
      label: "10 — Corporate Clarity",
      descriptor: "IBM Plex Sans · 700 · airy",
      style: { fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 700, fontSize: 58, letterSpacing: "0.08em" },
    },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0d0d",
        padding: "48px 40px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 40, borderBottom: "1px solid #222", paddingBottom: 24 }}>
        <p style={{ color: "#3f3f3f", fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
          Type Specimen · Budger
        </p>
        <p style={{ color: "#2a2a2a", fontSize: 11, letterSpacing: "0.06em" }}>
          White + silver gradient · 10 proposals
        </p>
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2px",
        }}
      >
        {fonts.map((f, i) => (
          <div
            key={i}
            style={{
              background: "#111",
              border: "1px solid #1a1a1a",
              padding: "32px 28px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              minHeight: 140,
              justifyContent: "space-between",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Subtle index watermark */}
            <span
              style={{
                position: "absolute",
                top: 10,
                right: 14,
                fontSize: 10,
                color: "#1e1e1e",
                fontWeight: 700,
                letterSpacing: "0.1em",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            {/* Wordmark */}
            <div style={{ lineHeight: 1 }}>
              <span style={{ ...f.style, ...gradient }}>Budger</span>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <p style={{ color: "#3a3a3a", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>
                {f.label}
              </p>
              <p style={{ color: "#2a2a2a", fontSize: 10, letterSpacing: "0.04em", margin: 0 }}>
                {f.descriptor}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
