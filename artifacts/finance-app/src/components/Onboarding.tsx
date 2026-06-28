import { useState, useEffect } from "react";
import { type AppPrefs, CURRENCIES, LANGUAGES } from "@/lib/prefs";
import BadgerLogo from "@/components/BadgerLogo";
import { t } from "@/lib/i18n";
import ApplePaySlides from "@/components/ApplePaySlides";
import {
  useUpdateNotificationSettings,
  useUpdateMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ── iOS notification settings path ───────────────────────────────────────────

function getNotifSettingsPath(): { steps: string[]; tip: string } {
  const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isStandalone) {
    return {
      steps: ["Settings", "Budger", "Notifications", "Allow Notifications"],
      tip: "",
    };
  }
  return {
    steps: ["Settings", "Safari", "Notifications", "This website", "Allow"],
    tip: "Add Budger to your Home Screen for easier notification management.",
  };
}

function openIOSSettings() {
  window.location.href = "app-settings:";
}

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

// ── Main component ────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: { onComplete: (prefs: AppPrefs) => void }) {
  const queryClient = useQueryClient();
  const [step, setStep]               = useState<Step>("stay-signed-in");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [currency, setCurrency]       = useState("USD");
  const [language]                    = useState(() => {
    try { return JSON.parse(localStorage.getItem("budger_prefs_v1") ?? "{}").language ?? "en"; } catch { return "en"; }
  });
  const [totalBudget, setTotalBudget] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [notifStatus, setNotifStatus] = useState<"idle" | "granted" | "denied" | "loading">("idle");
  const [finishing, setFinishing]     = useState(false);

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

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    try {
      const updateData: Record<string, unknown> = {
        firstLoginDone: true,
        language,
      };
      if (totalBudget !== null) {
        updateData.totalBudget = totalBudget;
      }
      await updateMe.mutateAsync({ data: updateData as any });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch {
      // Continue even if network fails
    } finally {
      setFinishing(false);
    }
    onComplete({ currency, language, totalBudget, staySignedIn });
  }

  // ── Auto-recheck when user returns from iOS Settings ─────────────────────

  useEffect(() => {
    if (notifStatus !== "denied") return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        setNotifStatus("granted");
        updateNotif.mutate({ data: { enabled: true, reminderTime: "20:00", days: ["1","2","3","4","5","6","7"] } });
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [notifStatus]);

  // ── Notifications step ────────────────────────────────────────────────────

  async function requestNotifications() {
    setNotifStatus("loading");
    if (!("Notification" in window)) { setNotifStatus("denied"); return; }
    if (Notification.permission === "granted") { setNotifStatus("granted"); return; }
    if (Notification.permission === "denied")  { setNotifStatus("denied");  return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setNotifStatus("granted");
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
            <p className="text-sm text-muted-foreground leading-relaxed">{t("ob.stay_signed_in_desc")}</p>
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
          <div className="flex flex-col gap-3 w-full flex-shrink-0">
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
        </div>
      )}

      {/* ── Wallet — Apple Pay automation slides ── */}
      {step === "wallet" && (
        <div className="flex-1 w-full max-w-sm flex flex-col min-h-0">
          <ApplePaySlides onDone={next} />
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
          {notifStatus === "denied" && (() => {
            const { steps, tip } = getNotifSettingsPath();
            return (
              <div className="bg-muted border border-border rounded-2xl px-4 py-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">{t("ob.notif_blocked_title")}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("ob.notif_blocked_desc")}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {steps.map((s, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground bg-background border border-border rounded-lg px-2 py-1">{s}</span>
                      {i < steps.length - 1 && <span className="text-muted-foreground text-xs">›</span>}
                    </span>
                  ))}
                </div>
                {tip && <p className="text-xs text-muted-foreground/60 leading-relaxed">{tip}</p>}
                <button
                  onClick={openIOSSettings}
                  className="w-full h-11 rounded-xl bg-background border border-border text-foreground text-sm font-semibold active:scale-95 transition"
                >
                  {t("ob.open_settings")}
                </button>
              </div>
            );
          })()}

          {notifStatus !== "granted" && (
            <button
              onClick={requestNotifications}
              disabled={notifStatus === "loading"}
              className="w-full h-14 rounded-2xl bg-foreground text-background font-semibold text-base
                         disabled:opacity-50 active:scale-95 transition"
            >
              {notifStatus === "loading" ? t("ob.notif_enabling") :
               notifStatus === "denied"  ? t("ob.try_again") :
               t("ob.notif_enable_btn")}
            </button>
          )}

          <button
            onClick={finish}
            disabled={finishing}
            className="w-full h-14 rounded-2xl bg-card border border-border text-foreground font-semibold text-base active:scale-95 transition disabled:opacity-50"
          >
            {finishing ? t("common.saving") : notifStatus === "granted" ? t("ob.lets_go") : t("ob.skip_notif")}
          </button>
        </div>
      )}

      {/* ── Bottom action (skip/continue) for currency step ── */}
      {step === "currency" && (
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
