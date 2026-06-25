import { useState } from "react";
import { type AppPrefs, CURRENCIES, LANGUAGES } from "@/lib/prefs";
import BadgerLogo from "@/components/BadgerLogo";
import { t } from "@/lib/i18n";
import { useUpdateNotificationSettings, useUpdateMe } from "@workspace/api-client-react";

// ── Steps ────────────────────────────────────────────────────────────────────

type Step = "stay-signed-in" | "currency" | "budget" | "wallet" | "notifications";
const STEPS: Step[] = ["stay-signed-in", "currency", "budget", "wallet", "notifications"];

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

// ── Wallet placeholder slides ─────────────────────────────────────────────────

const WALLET_SLIDES = [
  { icon: "💳", titleKey: "ob.wallet_s1_title", descKey: "ob.wallet_s1_desc" },
  { icon: "📱", titleKey: "ob.wallet_s2_title", descKey: "ob.wallet_s2_desc" },
  { icon: "🔗", titleKey: "ob.wallet_s3_title", descKey: "ob.wallet_s3_desc" },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: { onComplete: (prefs: AppPrefs) => void }) {
  const [step, setStep]               = useState<Step>("stay-signed-in");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [currency, setCurrency]       = useState("USD");
  const [language, _setLanguage]      = useState("en");  // already set from login
  const [totalBudget, setTotalBudget] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [walletSlide, setWalletSlide] = useState(0);
  const [notifStatus, setNotifStatus] = useState<"idle" | "granted" | "denied" | "loading">("idle");

  const updateNotif = useUpdateNotificationSettings();
  const updateMe    = useUpdateMe();

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    } else {
      finish();
    }
  }

  function skip() { next(); }

  function finish() {
    // Persist budget to server so it survives device switches and stays per-user
    if (totalBudget !== null) {
      updateMe.mutate({ data: { totalBudget } });
    }
    onComplete({
      currency,
      language,
      totalBudget,
      staySignedIn,
    });
  }

  // ── Notifications step ────────────────────────────────────────────────────

  async function requestNotifications() {
    setNotifStatus("loading");
    if (!("Notification" in window)) {
      setNotifStatus("denied");
      return;
    }
    if (Notification.permission === "granted") {
      setNotifStatus("granted");
      return;
    }
    if (Notification.permission === "denied") {
      // Try to open system settings — web can't do this directly, but we can guide
      setNotifStatus("denied");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setNotifStatus("granted");
        // Turn on smart alerts in DB
        updateNotif.mutate({ data: { enabled: true, reminderTime: "20:00", days: ["1","2","3","4","5","6","7"] } });
      } else {
        setNotifStatus("denied");
      }
    } catch {
      setNotifStatus("denied");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center px-6 pt-12 pb-10 gap-6">
      <Dots current={step} />

      {/* ── Stay signed in ── */}
      {step === "stay-signed-in" && (
        <div className="flex flex-col items-center gap-6 flex-1 justify-center w-full max-w-sm">
          <div className="p-5 rounded-3xl bg-card border border-border shadow-xl">
            <BadgerLogo size={72} />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mb-2">{t("ob.stay_signed_in")}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("ob.stay_signed_in_desc")}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-2">{t("ob.stay_change_later")}</p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => { setStaySignedIn(true); next(); }}
              className={`w-full h-14 rounded-2xl border-2 font-semibold text-base transition
                ${staySignedIn ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground"}`}
            >
              {t("ob.yes_stay")}
            </button>
            <button
              onClick={() => { setStaySignedIn(false); next(); }}
              className={`w-full h-14 rounded-2xl border-2 font-semibold text-base transition
                ${!staySignedIn ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground"}`}
            >
              {t("ob.no_sign_out")}
            </button>
          </div>
        </div>
      )}

      {/* ── Currency ── */}
      {step === "currency" && (
        <div className="flex flex-col gap-3 flex-1 w-full max-w-sm overflow-hidden">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.home_currency")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("ob.how_shown")}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t("ob.can_skip")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1">
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

      {/* ── Budget ── */}
      {step === "budget" && (
        <div className="flex flex-col gap-5 flex-1 w-full max-w-sm justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.monthly_budget")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("ob.budget_desc")}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t("ob.can_skip")}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl px-4 py-4">
            <label className="text-xs text-muted-foreground">{t("ob.monthly_budget")}</label>
            <input
              type="number"
              placeholder={t("ob.budget_placeholder")}
              value={budgetInput}
              onChange={e => {
                setBudgetInput(e.target.value);
                const v = parseFloat(e.target.value);
                setTotalBudget(isNaN(v) || v <= 0 ? null : v);
              }}
              className="w-full bg-transparent text-2xl font-bold text-foreground outline-none mt-1 placeholder:text-muted-foreground/40"
            />
          </div>
        </div>
      )}

      {/* ── Wallet instructions (placeholder) ── */}
      {step === "wallet" && (
        <div className="flex flex-col gap-4 flex-1 w-full max-w-sm justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.wallet_title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("ob.wallet_subtitle")}</p>
          </div>

          {/* Slide card */}
          <div className="bg-card border border-border rounded-3xl p-8 flex flex-col items-center gap-4 flex-1 justify-center">
            <span className="text-6xl">{WALLET_SLIDES[walletSlide].icon}</span>
            <h3 className="text-lg font-bold text-foreground text-center">
              {t(WALLET_SLIDES[walletSlide].titleKey)}
            </h3>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {t(WALLET_SLIDES[walletSlide].descKey)}
            </p>
            {/* Slide dots */}
            <div className="flex gap-2 mt-2">
              {WALLET_SLIDES.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${
                  i === walletSlide ? "w-5 bg-foreground" : "w-2 bg-border"
                }`} />
              ))}
            </div>
          </div>

          {/* Slide nav */}
          <div className="flex gap-3">
            {walletSlide > 0 && (
              <button
                onClick={() => setWalletSlide(s => s - 1)}
                className="flex-1 h-13 rounded-2xl bg-card border border-border text-foreground font-semibold text-sm"
              >
                ← {t("ob.prev")}
              </button>
            )}
            {walletSlide < WALLET_SLIDES.length - 1 ? (
              <button
                onClick={() => setWalletSlide(s => s + 1)}
                className="flex-1 h-13 rounded-2xl bg-foreground text-background font-semibold text-sm"
              >
                {t("ob.next")} →
              </button>
            ) : (
              <button
                onClick={next}
                className="flex-1 h-13 rounded-2xl bg-foreground text-background font-semibold text-sm"
              >
                {t("ob.continue")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Notifications ── */}
      {step === "notifications" && (
        <div className="flex flex-col gap-5 flex-1 w-full max-w-sm justify-center">
          <div className="text-center">
            <span className="text-5xl">🔔</span>
            <h2 className="text-2xl font-bold text-foreground mt-4">{t("ob.notif_title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("ob.notif_desc")}</p>
          </div>

          {notifStatus === "granted" && (
            <div className="bg-green-900/20 border border-green-900/40 rounded-2xl px-4 py-3 text-center">
              <p className="text-sm text-green-400 font-medium">{t("ob.notif_enabled")}</p>
            </div>
          )}
          {notifStatus === "denied" && (
            <div className="bg-muted border border-border rounded-2xl px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">{t("ob.notif_denied")}</p>
            </div>
          )}

          {notifStatus !== "granted" && (
            <button
              onClick={requestNotifications}
              disabled={notifStatus === "loading" || notifStatus === "denied"}
              className="w-full h-14 rounded-2xl bg-foreground text-background font-semibold text-base
                         disabled:opacity-50 active:scale-95 transition"
            >
              {notifStatus === "loading" ? t("ob.notif_enabling") : t("ob.notif_enable_btn")}
            </button>
          )}

          <button
            onClick={finish}
            className="w-full h-14 rounded-2xl bg-card border border-border text-foreground font-semibold text-base active:scale-95 transition"
          >
            {notifStatus === "granted" ? t("ob.lets_go") : t("ob.skip_notif")}
          </button>
        </div>
      )}

      {/* ── Bottom action (skip/continue) for currency & budget steps ── */}
      {(step === "currency" || step === "budget") && (
        <div className="flex flex-col gap-3 w-full max-w-sm flex-shrink-0">
          <button onClick={next}
            className="w-full h-14 rounded-2xl bg-foreground text-background font-semibold text-base
                       transition active:scale-95 shadow-sm">
            {t("ob.continue")}
          </button>
          <button onClick={skip}
            className="w-full h-10 text-sm text-muted-foreground underline underline-offset-4">
            {t("ob.skip")}
          </button>
        </div>
      )}
    </div>
  );
}
