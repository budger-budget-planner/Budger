export function JuicyPicks() {
  // Gradient: top = silver/light-grey → bottom = white (vertical)
  const gradient: React.CSSProperties = {
    background: "linear-gradient(to bottom, #8c8c8c 0%, #c8c8c8 35%, #ffffff 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    display: "inline-block",
    lineHeight: 1,
  };

  const picks: {
    num: string;
    label: string;
    descriptor: string;
    style: React.CSSProperties;
    note?: string;
  }[] = [
    {
      num: "06",
      label: "Horizon",
      descriptor: "Oxanium · 700 · 0.06em tracking",
      note: "Your pick",
      style: {
        fontFamily: "'Oxanium', sans-serif",
        fontWeight: 700,
        fontSize: 88,
        letterSpacing: "0.06em",
      },
    },
    {
      num: "A",
      label: "Block",
      descriptor: "Russo One · 400 · tight",
      note: "Raw, punchy",
      style: {
        fontFamily: "'Russo One', sans-serif",
        fontWeight: 400,
        fontSize: 88,
        letterSpacing: "-0.01em",
      },
    },
    {
      num: "B",
      label: "Warp",
      descriptor: "Exo 2 · 900 · −0.04em",
      note: "Compressed energy",
      style: {
        fontFamily: "'Exo 2', sans-serif",
        fontWeight: 900,
        fontSize: 88,
        letterSpacing: "-0.04em",
      },
    },
    {
      num: "C",
      label: "Tower",
      descriptor: "Bebas Neue · 400 · 0.08em",
      note: "Tall & cinematic",
      style: {
        fontFamily: "'Bebas Neue', sans-serif",
        fontWeight: 400,
        fontSize: 110,
        letterSpacing: "0.08em",
      },
    },
    {
      num: "D",
      label: "Grid",
      descriptor: "Quantico · 700 · 0.04em",
      note: "Angular tech",
      style: {
        fontFamily: "'Quantico', sans-serif",
        fontWeight: 700,
        fontSize: 80,
        letterSpacing: "0.04em",
      },
    },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0d",
      padding: "40px 36px",
      fontFamily: "'Inter', sans-serif",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32, paddingBottom: 20, borderBottom: "1px solid #1e1e1e" }}>
        <p style={{ color: "#333", fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 4px" }}>
          Type Specimen · Budger
        </p>
        <p style={{ color: "#252525", fontSize: 10, letterSpacing: "0.06em", margin: 0 }}>
          Gradient: silver top → white bottom
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {picks.map((p, i) => (
          <div key={i} style={{
            background: "#111",
            border: "1px solid #1c1c1c",
            padding: "30px 32px 22px",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Dim index + "your pick" badge */}
            <div style={{ position: "absolute", top: 12, right: 16, display: "flex", alignItems: "center", gap: 8 }}>
              {p.note && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: p.note === "Your pick" ? "#4a4a4a" : "#282828",
                  border: p.note === "Your pick" ? "1px solid #333" : "none",
                  padding: p.note === "Your pick" ? "2px 6px" : "0",
                  borderRadius: 3,
                }}>
                  {p.note}
                </span>
              )}
              <span style={{ fontSize: 10, color: "#1e1e1e", fontWeight: 700, letterSpacing: "0.1em" }}>
                {p.num}
              </span>
            </div>

            {/* Wordmark */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ ...p.style, ...gradient }}>Budger</span>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <p style={{ color: "#383838", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>
                {p.label}
              </p>
              <p style={{ color: "#282828", fontSize: 10, letterSpacing: "0.04em", margin: 0 }}>
                {p.descriptor}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
