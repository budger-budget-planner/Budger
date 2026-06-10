import { useState } from "react";
import { type AppPrefs } from "@/lib/prefs";
import BadgerLogo from "@/components/BadgerLogo";

function ApplePayIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 814 1000" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 67.2 0 123.1 44.3 165.8 44.3 40.8 0 103.7-47.1 179.3-47.1 45.8 0 127.5 10.8 186.2 76.9zm-87.4-188.4c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
    </svg>
  );
}

const CURRENCIES = [
  { code: "USD", symbol: "$",  label: "US Dollar"        },
  { code: "EUR", symbol: "€",  label: "Euro"              },
  { code: "GBP", symbol: "£",  label: "British Pound"     },
  { code: "CHF", symbol: "Fr", label: "Swiss Franc"       },
  { code: "PLN", symbol: "zł", label: "Polish Zloty"      },
  { code: "JPY", symbol: "¥",  label: "Japanese Yen"      },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar"   },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  { code: "NOK", symbol: "kr", label: "Norwegian Krone"   },
  { code: "SEK", symbol: "kr", label: "Swedish Krona"     },
  { code: "DKK", symbol: "kr", label: "Danish Krone"      },
  { code: "BRL", symbol: "R$", label: "Brazilian Real"    },
];

const LANGUAGES = [
  { code: "en", label: "English"            },
  { code: "pl", label: "Polski"             },
  { code: "de", label: "Deutsch"            },
  { code: "fr", label: "Français"           },
  { code: "es", label: "Español"            },
  { code: "it", label: "Italiano"           },
  { code: "pt", label: "Português"          },
  { code: "nl", label: "Nederlands"         },
];

type Step = "welcome" | "currency" | "language" | "applepay";

export default function Onboarding({ onComplete }: { onComplete: (prefs: AppPrefs) => void }) {
  const [step, setStep]         = useState<Step>("welcome");
  const [currency, setCurrency] = useState("USD");
  const [language, setLanguage] = useState("en");

  const steps: Step[] = ["welcome", "currency", "language", "applepay"];
  const stepIndex = steps.indexOf(step);

  function next() {
    if (step === "welcome")   { setStep("currency"); return; }
    if (step === "currency")  { setStep("language");  return; }
    if (step === "language")  { setStep("applepay");  return; }
    if (step === "applepay")  { onComplete({ currency, language }); return; }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-between px-6 py-12">

      {/* Progress dots */}
      <div className="flex gap-2 mt-2">
        {steps.map((s, i) => (
          <div key={s} className={`h-1.5 rounded-full transition-all ${
            i === stepIndex ? "w-6 bg-foreground" :
            i < stepIndex  ? "w-3 bg-foreground/40" :
                             "w-3 bg-border"
          }`} />
        ))}
      </div>

      {/* ── WELCOME ── */}
      {step === "welcome" && (
        <div className="flex flex-col items-center text-center gap-6 flex-1 justify-center">
          <div className="p-5 rounded-3xl bg-card border border-border shadow-lg">
            <BadgerLogo size={80} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Welcome to Budger!</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Your household finances in one place.<br />
              Let's take 30 seconds to set things up.
            </p>
          </div>
        </div>
      )}

      {/* ── CURRENCY ── */}
      {step === "currency" && (
        <div className="flex flex-col gap-4 flex-1 justify-center w-full max-w-sm">
          <div className="text-center mb-2">
            <h2 className="text-2xl font-bold text-foreground">Home currency</h2>
            <p className="text-sm text-muted-foreground mt-1">Choose how amounts are displayed</p>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
            {CURRENCIES.map(c => (
              <button
                key={c.code}
                onClick={() => setCurrency(c.code)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition
                  ${currency === c.code
                    ? "border-foreground bg-foreground/8"
                    : "border-border bg-card"
                  }`}
              >
                <span className="text-xl font-bold text-foreground w-7 text-center">{c.symbol}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{c.code}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── LANGUAGE ── */}
      {step === "language" && (
        <div className="flex flex-col gap-4 flex-1 justify-center w-full max-w-sm">
          <div className="text-center mb-2">
            <h2 className="text-2xl font-bold text-foreground">Language</h2>
            <p className="text-sm text-muted-foreground mt-1">Numbers and dates will adapt to your region</p>
          </div>
          <div className="flex flex-col gap-2">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`flex items-center justify-between px-4 py-3.5 rounded-2xl border transition
                  ${language === l.code
                    ? "border-foreground bg-foreground/8"
                    : "border-border bg-card"
                  }`}
              >
                <span className="text-sm font-medium text-foreground">{l.label}</span>
                {language === l.code && (
                  <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center">
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
        <div className="flex flex-col items-center text-center gap-5 flex-1 justify-center w-full max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-card border border-border flex items-center justify-center shadow-lg">
            <ApplePayIcon />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Apple Pay in Budger</h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
              Use Apple Pay to pay when you log a transaction — just tap the{" "}
              <span className="text-foreground font-medium">Apple Pay</span> button on the add-transaction form.
              Face ID confirms the amount instantly.
            </p>
            <div className="bg-muted rounded-2xl px-4 py-3 text-left">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">ℹ️  Note: </span>
                Budger cannot automatically import payments made in other apps.
                Apple restricts cross-app payment data on all devices. You'll log
                each spend manually — it only takes a few seconds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={next}
        className="w-full max-w-sm h-14 rounded-2xl bg-foreground text-background
                   font-semibold text-base transition active:scale-95 shadow-sm"
      >
        {step === "applepay" ? "Let's go!" : "Continue"}
      </button>
    </div>
  );
}
