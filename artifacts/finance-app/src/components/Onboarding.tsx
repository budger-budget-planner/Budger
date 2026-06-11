import { useState, useEffect } from "react";
import { type AppPrefs } from "@/lib/prefs";
import BadgerLogo from "@/components/BadgerLogo";

/* ── Apple Pay availability check ──────────────────────────────── */
type ApplePayStatus = "checking" | "available" | "unavailable" | "needs_https";

function useApplePayStatus(): ApplePayStatus {
  const [status, setStatus] = useState<ApplePayStatus>("checking");

  useEffect(() => {
    async function check() {
      if (!window.PaymentRequest) { setStatus("unavailable"); return; }
      if (location.protocol !== "https:") { setStatus("needs_https"); return; }
      try {
        const req = new window.PaymentRequest(
          [{ supportedMethods: "https://apple.com/apple-pay",
             data: { version: 3, merchantIdentifier: "merchant.budger.app",
                     merchantCapabilities: ["supports3DS"],
                     supportedNetworks: ["visa","masterCard","amex"],
                     countryCode: "US" } }],
          { total: { label: "Test", amount: { currency: "USD", value: "0.01" } } }
        );
        setStatus(await req.canMakePayment() ? "available" : "unavailable");
      } catch {
        setStatus("unavailable");
      }
    }
    check();
  }, []);

  return status;
}

/* ── Currency / Language data ───────────────────────────────────── */
const CURRENCIES = [
  { code: "USD", symbol: "$",  label: "US Dollar"         },
  { code: "EUR", symbol: "€",  label: "Euro"               },
  { code: "GBP", symbol: "£",  label: "British Pound"      },
  { code: "CHF", symbol: "Fr", label: "Swiss Franc"        },
  { code: "PLN", symbol: "zł", label: "Polish Zloty"       },
  { code: "JPY", symbol: "¥",  label: "Japanese Yen"       },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar"    },
  { code: "AUD", symbol: "A$", label: "Australian Dollar"  },
  { code: "NOK", symbol: "kr", label: "Norwegian Krone"    },
  { code: "SEK", symbol: "kr", label: "Swedish Krona"      },
  { code: "DKK", symbol: "kr", label: "Danish Krone"       },
  { code: "BRL", symbol: "R$", label: "Brazilian Real"     },
];

const LANGUAGES = [
  { code: "en", label: "English"   },
  { code: "pl", label: "Polski"    },
  { code: "de", label: "Deutsch"   },
  { code: "fr", label: "Français"  },
  { code: "es", label: "Español"   },
  { code: "it", label: "Italiano"  },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands"},
];

/* ── Step indicator ─────────────────────────────────────────────── */
type Step = "welcome" | "currency" | "language" | "applepay";
const STEPS: Step[] = ["welcome", "currency", "language", "applepay"];

function Dots({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex gap-2">
      {STEPS.map((s, i) => (
        <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
          i === idx ? "w-6 bg-foreground" :
          i <  idx  ? "w-3 bg-foreground/40" : "w-3 bg-border"
        }`} />
      ))}
    </div>
  );
}

/* ── Apple Pay status card ──────────────────────────────────────── */
function ApplePayCard() {
  const status = useApplePayStatus();

  const items: { icon: string; label: string; ok: boolean | null }[] = [
    {
      icon: "🔒",
      label: "Secure connection (HTTPS)",
      ok: status === "checking" ? null : location.protocol === "https:",
    },
    {
      icon: "🧭",
      label: "Safari browser on iPhone / Mac",
      ok: status === "checking" ? null : !!window.PaymentRequest,
    },
    {
      icon: "💳",
      label: "Cards added to Apple Wallet",
      ok: status === "checking" ? null : status === "available",
    },
  ];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {items.map(({ icon, label, ok }) => (
        <div key={label} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
          <span className="text-lg w-7 text-center">{icon}</span>
          <p className="flex-1 text-sm text-foreground">{label}</p>
          {ok === null
            ? <div className="w-4 h-4 rounded-full border-2 border-muted border-t-transparent animate-spin" />
            : ok
              ? <span className="text-green-400 text-base">✓</span>
              : <span className="text-muted-foreground text-base">✗</span>
          }
        </div>
      ))}
      {status === "available" && (
        <div className="px-4 py-3 bg-green-900/20">
          <p className="text-sm text-green-400 font-medium">Apple Pay is ready on this device!</p>
        </div>
      )}
      {status === "needs_https" && (
        <div className="px-4 py-3 bg-muted">
          <p className="text-xs text-muted-foreground">
            Apple Pay works on the <span className="text-foreground font-medium">published app</span>{" "}
            (HTTPS). In this dev preview it can't be activated, but it will work after publishing.
          </p>
        </div>
      )}
      {status === "unavailable" && (
        <div className="px-4 py-3 bg-muted">
          <p className="text-xs text-muted-foreground">
            Open Budger in <span className="text-foreground font-medium">Safari on iPhone or Mac</span>{" "}
            and add cards to Apple Wallet to enable Apple Pay.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export default function Onboarding({ onComplete }: { onComplete: (prefs: AppPrefs) => void }) {
  const [step, setStep]         = useState<Step>("welcome");
  const [currency, setCurrency] = useState("USD");
  const [language, setLanguage] = useState("en");

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) { setStep(STEPS[idx + 1]); return; }
    onComplete({ currency, language });
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center px-6 pt-14 pb-10 gap-8">
      <Dots current={step} />

      {/* ── WELCOME ── */}
      {step === "welcome" && (
        <div className="flex flex-col items-center text-center gap-6 flex-1 justify-center">
          <div className="p-5 rounded-3xl bg-card border border-border shadow-xl">
            <BadgerLogo size={84} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to Budger!</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Your household finances in one place.<br />
              Let's set up in 30 seconds.
            </p>
          </div>
        </div>
      )}

      {/* ── CURRENCY ── */}
      {step === "currency" && (
        <div className="flex flex-col gap-3 flex-1 w-full max-w-sm overflow-hidden">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">Home currency</h2>
            <p className="text-sm text-muted-foreground mt-1">How amounts are shown throughout the app</p>
          </div>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto">
            {CURRENCIES.map(c => (
              <button key={c.code} onClick={() => setCurrency(c.code)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition
                  ${currency === c.code ? "border-foreground bg-foreground/8" : "border-border bg-card"}`}>
                <span className="text-xl font-bold text-foreground w-8 text-center flex-shrink-0">{c.symbol}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{c.code}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.label}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── LANGUAGE ── */}
      {step === "language" && (
        <div className="flex flex-col gap-3 flex-1 w-full max-w-sm overflow-hidden">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">Language</h2>
            <p className="text-sm text-muted-foreground mt-1">Numbers and dates adapt to your region</p>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto">
            {LANGUAGES.map(l => (
              <button key={l.code} onClick={() => setLanguage(l.code)}
                className={`flex items-center justify-between px-4 py-3.5 rounded-2xl border transition
                  ${language === l.code ? "border-foreground bg-foreground/8" : "border-border bg-card"}`}>
                <span className="text-sm font-medium text-foreground">{l.label}</span>
                {language === l.code && (
                  <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── APPLE PAY ── */}
      {step === "applepay" && (
        <div className="flex flex-col gap-4 flex-1 w-full max-w-sm">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">Apple Pay</h2>
            <p className="text-sm text-muted-foreground mt-1">Check your device's compatibility</p>
          </div>

          <ApplePayCard />

          <div className="bg-card border border-border rounded-2xl px-4 py-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">How it works in Budger</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When you add a transaction, tap the{" "}
              <span className="text-foreground font-medium">Apple Pay</span> button to confirm
              the amount with Face ID or Touch ID — no card entry needed.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">Note:</span> Apple restricts
              cross-app data on all devices, so Budger cannot auto-import payments made in
              other apps (Maps, App Store, etc.). Each transaction is logged manually — it
              takes just a few seconds.
            </p>
          </div>
        </div>
      )}

      {/* Continue button */}
      <button onClick={next}
        className="w-full max-w-sm h-14 rounded-2xl bg-foreground text-background
                   font-semibold text-base transition active:scale-95 shadow-sm flex-shrink-0">
        {step === "applepay" ? "Let's go!" : "Continue →"}
      </button>
    </div>
  );
}
