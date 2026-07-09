export function CartoonPremium() {
  const gradient: React.CSSProperties = {
    background: "linear-gradient(to bottom, #8c8c8c 0%, #c8c8c8 35%, #ffffff 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    display: "inline-block",
    lineHeight: 1.05,
  };

  const picks: {
    num: string;
    label: string;
    descriptor: string;
    thought: string;
    style: React.CSSProperties;
  }[] = [
    {
      num: "01",
      label: "Warm Round",
      descriptor: "Nunito · 900 · −0.02em",
      thought: "Friendly but grounded — rounded terminals match the logo's curves",
      style: { fontFamily: "'Nunito', sans-serif", fontWeight: 900, fontSize: 92, letterSpacing: "-0.02em" },
    },
    {
      num: "02",
      label: "Soft Block",
      descriptor: "Fredoka · 700 · 0em",
      thought: "Chunky with soft corners — feels like a premium cartoon",
      style: { fontFamily: "'Fredoka', sans-serif", fontWeight: 700, fontSize: 88, letterSpacing: "0em" },
    },
    {
      num: "03",
      label: "Retro Punch",
      descriptor: "Righteous · 400 · 0.04em",
      thought: "Retro-bold with just enough quirkiness — exclusive feel",
      style: { fontFamily: "'Righteous', sans-serif", fontWeight: 400, fontSize: 84, letterSpacing: "0.04em" },
    },
    {
      num: "04",
      label: "Jolly Slab",
      descriptor: "Baloo 2 · 800 · −0.01em",
      thought: "Rounded slab serifs — playful but weighty like a bank mascot",
      style: { fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 86, letterSpacing: "-0.01em" },
    },
    {
      num: "05",
      label: "Bubble",
      descriptor: "Comfortaa · 700 · 0.06em",
      thought: "Maximum roundness — very logo-adjacent, almost icon-like",
      style: { fontFamily: "'Comfortaa', sans-serif", fontWeight: 700, fontSize: 80, letterSpacing: "0.06em" },
    },
    {
      num: "06",
      label: "Clean Soft",
      descriptor: "Quicksand · 700 · 0.02em",
      thought: "Rounded but restrained — premium fintech with a human touch",
      style: { fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 84, letterSpacing: "0.02em" },
    },
    {
      num: "07",
      label: "Editorial Quirk",
      descriptor: "Syne · 800 · −0.03em",
      thought: "Geometric oddity — exclusive design-world energy",
      style: { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 88, letterSpacing: "-0.03em" },
    },
    {
      num: "08",
      label: "Full Circle",
      descriptor: "Varela Round · 400 · 0.01em",
      thought: "Single weight but perfectly round — deceptively elegant",
      style: { fontFamily: "'Varela Round', sans-serif", fontWeight: 400, fontSize: 82, letterSpacing: "0.01em" },
    },
    {
      num: "09",
      label: "Cabin Club",
      descriptor: "Cabin Rounded · 700 · 0.03em",
      thought: "Humanist rounded — approachable yet structured",
      style: { fontFamily: "'Cabin Rounded', sans-serif", fontWeight: 700, fontSize: 82, letterSpacing: "0.03em" },
    },
    {
      num: "10",
      label: "Trophy",
      descriptor: "Paytone One · 400 · 0.01em",
      thought: "Bold display energy — headline-grade, playful authority",
      style: { fontFamily: "'Paytone One', sans-serif", fontWeight: 400, fontSize: 88, letterSpacing: "0.01em" },
    },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0d",
      padding: "40px 36px 48px",
      fontFamily: "'Inter', sans-serif",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 28, paddingBottom: 18, borderBottom: "1px solid #1e1e1e" }}>
        <p style={{ color: "#333", fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 3px" }}>
          Type Specimen · Budger
        </p>
        <p style={{ color: "#252525", fontSize: 10, letterSpacing: "0.06em", margin: 0 }}>
          Cartoony · Premium · Financial — silver → white
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {picks.map((p, i) => (
          <div key={i} style={{
            background: "#111",
            border: "1px solid #1c1c1c",
            padding: "26px 30px 18px",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Index watermark */}
            <span style={{
              position: "absolute", top: 12, right: 14,
              fontSize: 10, color: "#1e1e1e", fontWeight: 700, letterSpacing: "0.1em",
            }}>{p.num}</span>

            {/* Wordmark */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ ...p.style, ...gradient }}>Budger</span>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <p style={{ color: "#3a3a3a", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>
                  {p.label}
                </p>
                <p style={{ color: "#282828", fontSize: 10, letterSpacing: "0.04em", margin: 0 }}>
                  {p.descriptor}
                </p>
              </div>
              <p style={{ color: "#222", fontSize: 9.5, letterSpacing: "0.03em", margin: 0, fontStyle: "italic" }}>
                {p.thought}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
