import { useState, useEffect } from "react";
import { type AppPrefs, CURRENCIES, LANGUAGES } from "@/lib/prefs";
import BadgerLogo from "@/components/BadgerLogo";
import { t } from "@/lib/i18n";

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
      } catch { setStatus("unavailable"); }
    }
    check();
  }, []);
  return status;
}

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

function ApplePayCard() {
  const status = useApplePayStatus();
  const items = [
    { icon: "🔒", label: t("ob.secure"), ok: status === "checking" ? null : location.protocol === "https:" },
    { icon: "🧭", label: t("ob.safari"), ok: status === "checking" ? null : !!window.PaymentRequest },
    { icon: "💳", label: t("ob.wallet"), ok: status === "checking" ? null : status === "available" },
  ];
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {items.map(({ icon, label, ok }) => (
        <div key={label} className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0">
          <span className="text-lg w-7 text-center">{icon}</span>
          <p className="flex-1 text-sm text-foreground">{label}</p>
          {ok === null
            ? <div className="w-4 h-4 rounded-full border-2 border-muted border-t-transparent animate-spin" />
            : ok ? <span className="text-green-400 text-base">✓</span>
                 : <span className="text-muted-foreground text-base">✗</span>}
        </div>
      ))}
      {status === "available" && (
        <div className="px-4 py-3 bg-green-900/20">
          <p className="text-sm text-green-400 font-medium">{t("ob.ap_ready")}</p>
        </div>
      )}
      {status === "needs_https" && (
        <div className="px-4 py-3 bg-muted">
          <p className="text-xs text-muted-foreground">{t("ob.ap_dev")}</p>
        </div>
      )}
      {status === "unavailable" && (
        <div className="px-4 py-3 bg-muted">
          <p className="text-xs text-muted-foreground">{t("ob.ap_unavail")}</p>
        </div>
      )}
    </div>
  );
}

export default function Onboarding({ onComplete }: { onComplete: (prefs: AppPrefs) => void }) {
  const [step, setStep]         = useState<Step>("welcome");
  const [currency, setCurrency] = useState("USD");
  const [language, setLanguage] = useState("en");

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) { setStep(STEPS[idx + 1]); return; }
    onComplete({ currency, language, totalBudget: null });
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center px-6 pt-14 pb-10 gap-8">
      <Dots current={step} />

      {step === "welcome" && (
        <div className="flex flex-col items-center text-center gap-6 flex-1 justify-center">
          <div className="p-5 rounded-3xl bg-card border border-border shadow-xl">
            <BadgerLogo size={84} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{t("ob.welcome")}</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              {t("ob.tagline")}<br />{t("ob.setup")}
            </p>
          </div>
        </div>
      )}

      {step === "currency" && (
        <div className="flex flex-col gap-3 flex-1 w-full max-w-sm overflow-hidden">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.home_currency")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("ob.how_shown")}</p>
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

      {step === "language" && (
        <div className="flex flex-col gap-3 flex-1 w-full max-w-sm overflow-hidden">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.language")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("ob.lang_desc")}</p>
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

      {step === "applepay" && (
        <div className="flex flex-col gap-4 flex-1 w-full max-w-sm">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.apple_pay")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("ob.check_compat")}</p>
          </div>
          <ApplePayCard />
          <div className="bg-card border border-border rounded-2xl px-4 py-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">{t("ob.how_works")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("ob.ap_explainer")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">{t("ob.note")}</span>{" "}{t("ob.cross_app")}
            </p>
          </div>
        </div>
      )}

      <button onClick={next}
        className="w-full max-w-sm h-14 rounded-2xl bg-foreground text-background
                   font-semibold text-base transition active:scale-95 shadow-sm flex-shrink-0">
        {step === "applepay" ? t("ob.lets_go") : t("ob.continue")}
      </button>
    </div>
  );
}
