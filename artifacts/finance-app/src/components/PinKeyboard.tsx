import { useEffect } from "react";

interface PinKeyboardProps {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  minLength?: number;
  label?: string;
  error?: string;
}

const KEYS = ["1","2","3","4","5","6","7","8","9","","0","⌫"] as const;

export default function PinKeyboard({
  value,
  onChange,
  maxLength = 8,
  minLength = 4,
  label,
  error,
}: PinKeyboardProps) {
  // Handle physical keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") {
        if (value.length < maxLength) onChange(value + e.key);
      } else if (e.key === "Backspace") {
        onChange(value.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, maxLength]);

  function press(key: string) {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
    } else if (key === "") {
      // spacer
    } else {
      if (value.length < maxLength) onChange(value + key);
    }
  }

  const dots = Array.from({ length: Math.max(minLength, value.length + (value.length < maxLength ? 1 : 0)) }, (_, i) => i);

  return (
    <div className="flex flex-col items-center gap-8 select-none">
      {label && (
        <p className="text-base font-medium text-muted-foreground text-center px-4">{label}</p>
      )}

      {/* Dots indicator */}
      <div className="flex items-center gap-4">
        {dots.map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              i < value.length
                ? "bg-foreground border-foreground scale-110"
                : "bg-transparent border-border"
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center -mt-4">{error}</p>
      )}

      {/* Numpad grid */}
      <div className="grid grid-cols-3 gap-4 w-full">
        {KEYS.map((key, idx) => {
          const isSpacer = key === "";
          const isBackspace = key === "⌫";
          return (
            <button
              key={idx}
              onClick={() => !isSpacer && press(key)}
              disabled={isSpacer}
              className={`
                h-20 rounded-2xl text-2xl font-semibold transition-all duration-100
                ${isSpacer ? "invisible pointer-events-none" : ""}
                ${isBackspace
                  ? "bg-transparent text-muted-foreground active:scale-90"
                  : "bg-card border border-border text-foreground active:scale-90 active:bg-foreground/10 shadow-sm"
                }
              `}
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {isBackspace ? (
                <svg width="24" height="18" viewBox="0 0 24 18" fill="none" className="mx-auto">
                  <path d="M9 1H22C22.55 1 23 1.45 23 2V16C23 16.55 22.55 17 22 17H9L1 9L9 1Z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M15 6L11 12M11 6L15 12" stroke="currentColor" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
