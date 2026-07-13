import { useState, useEffect, useRef } from "react";
import { type AppPrefs, CURRENCIES, LANGUAGES, loadPrefs } from "@/lib/prefs";
import BadgerLogo from "@/components/BadgerLogo";
import { t } from "@/lib/i18n";
import { Zap, Bell, Banknote, Check } from "lucide-react";
import {
  useUpdateNotificationSettings,
  useUpdateMe,
  getGetMeQueryKey,
} from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeToPushNotifications, isPushSupported } from "@/lib/push-notifications";

// ── Steps ────────────────────────────────────────────────────────────────────

type Step = "stay-signed-in" | "currency" | "budget" | "wallet" | "notifications" | "welcome";
const STEPS: Step[] = ["stay-signed-in", "currency", "budget", "wallet", "notifications", "welcome"];

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

// ── Shared step icon container ────────────────────────────────────────────────

function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-18 h-18 rounded-2xl bg-card border border-border flex items-center justify-center p-4 self-center">
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Onboarding({
  onComplete,
  isHonorableContributor = false,
}: {
  onComplete: (prefs: AppPrefs) => void;
  isHonorableContributor?: boolean;
}) {
  const queryClient = useQueryClient();
  const [step, setStep]               = useState<Step>("stay-signed-in");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [currency, setCurrency]       = useState("USD");
  const [language]                    = useState(() => loadPrefs().language ?? "en");
  const [totalBudget, setTotalBudget] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [notifStatus, setNotifStatus] = useState<"idle" | "granted" | "denied" | "loading">("idle");
  const [finishing, setFinishing]     = useState(false);

  // ── Splash-out state for the welcome screen's CTA ─────────────────────────
  const [launching, setLaunching]   = useState(false);
  const [launchVisible, setLaunchVisible] = useState(false);
  const mountedRef    = useRef(true);
  const launchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Welcome-screen badger lick — fires 1 s after the step is shown ─────────
  const [welcomeAnim, setWelcomeAnim] = useState<"lick" | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (launchTimeout.current) clearTimeout(launchTimeout.current);
    };
  }, []);

  // Trigger one lick 1 s after landing on the welcome step
  useEffect(() => {
    if (step !== "welcome") { setWelcomeAnim(null); return; }
    const t1 = setTimeout(() => setWelcomeAnim("lick"), 1000);
    const t2 = setTimeout(() => setWelcomeAnim(null), 1000 + 2400 + 100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step]);

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
        currency,
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
    onComplete({ currency, language, totalBudget, staySignedIn, disableAnimations: false });
  }

  function handleLetsStart() {
    setLaunching(true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (mountedRef.current) setLaunchVisible(true);
    }));
    launchTimeout.current = setTimeout(() => {
      if (mountedRef.current) finish();
    }, 900);
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
    if (Notification.permission === "granted") {
      setNotifStatus("granted");
      if (isPushSupported()) subscribeToPushNotifications().catch(() => {});
      return;
    }
    if (Notification.permission === "denied")  { setNotifStatus("denied");  return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setNotifStatus("granted");
        updateNotif.mutate({ data: { enabled: true, reminderTime: "20:00", days: ["1","2","3","4","5","6","7"] } });
        if (isPushSupported()) subscribeToPushNotifications().catch(() => {});
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

      {/* ── Splash-out overlay — sits above everything ── */}
      {launching && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{
            background: "radial-gradient(ellipse at 50% 48%, hsl(0,0%,18%) 0%, hsl(0,0%,8%) 52%, hsl(0,0%,4%) 100%)",
            opacity: launchVisible ? 1 : 0,
            transition: "opacity 0.45s ease",
          }}
        >
          <div
            className={launchVisible ? "splash-pulse" : ""}
            style={{
              transform: launchVisible ? "scale(1)" : "scale(0.82)",
              transition: "transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <BadgerLogo
              size={120}
              forceAnim={launchVisible ? "lick" : null}
              forceAnimDurationMs={1067}
            />
          </div>
        </div>
      )}

      {/* Hide dots on welcome — the screen stands alone */}
      {step !== "welcome" && <Dots current={step} />}

      {/* ── Stay signed in ── */}
      {step === "stay-signed-in" && (
        <div className="flex flex-col items-center gap-6 flex-1 justify-center w-full max-w-sm">
          <div className="p-4 rounded-2xl bg-card border border-border">
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
              className="w-full h-14 rounded-2xl bg-foreground text-background font-semibold text-base transition active:scale-95"
            >
              {t("ob.yes_stay")}
            </button>
            <button
              onClick={() => { setStaySignedIn(false); next(); }}
              className="w-full h-14 rounded-2xl bg-card border border-border text-foreground font-semibold text-base transition active:scale-95"
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
            {CURRENCIES.map(c => {
              const selected = currency === c.code;
              return (
                <button
                  key={c.code}
                  onClick={() => setCurrency(c.code)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition active:scale-95 ${
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  <span className={`text-xl font-bold w-8 text-center flex-shrink-0 ${selected ? "text-background" : "text-foreground"}`}>
                    {c.symbol}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{c.code}</p>
                    <p className={`text-xs truncate ${selected ? "text-background/70" : "text-muted-foreground"}`}>{c.label}</p>
                  </div>
                  {selected && <Check className="w-4 h-4 flex-shrink-0 text-background" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Budget ── */}
      {step === "budget" && (
        <div className="flex flex-col gap-5 flex-1 w-full max-w-sm justify-center">
          <StepIcon>
            <Banknote className="w-8 h-8 text-foreground" />
          </StepIcon>
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
            <button
              onClick={next}
              className="w-full h-14 rounded-2xl bg-foreground text-background font-semibold text-base transition active:scale-95"
            >
              {t("ob.continue")}
            </button>
            <button
              onClick={skip}
              className="w-full h-10 text-sm text-muted-foreground underline underline-offset-4"
            >
              {t("ob.skip")}
            </button>
          </div>
        </div>
      )}

      {/* ── Wallet — Automation teaser ── */}
      {step === "wallet" && (
        <div className="flex flex-col items-center gap-6 flex-1 justify-center w-full max-w-sm">
          <StepIcon>
            <Zap className="w-8 h-8 text-foreground" />
          </StepIcon>
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.automate_title")}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{t("ob.automate_desc")}</p>
            <div className="bg-card border border-border rounded-2xl px-4 py-4 text-left space-y-2 mt-2">
              <p className="text-xs font-semibold text-foreground">{t("ob.automate_where_title")}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{t("ob.automate_where")}</p>
              <p className="text-xs text-muted-foreground/60 leading-relaxed">{t("ob.automate_coming")}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 w-full flex-shrink-0">
            <button
              onClick={next}
              className="w-full h-14 rounded-2xl bg-foreground text-background font-semibold text-base transition active:scale-95"
            >
              {t("ob.continue")}
            </button>
          </div>
        </div>
      )}

      {/* ── Notifications ── */}
      {step === "notifications" && (
        <div className="flex flex-col gap-5 flex-1 w-full max-w-sm justify-center">
          <StepIcon>
            <Bell className="w-8 h-8 text-foreground" />
          </StepIcon>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.notif_title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("ob.notif_desc")}</p>
          </div>

          {notifStatus === "granted" && (
            <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
              <Check className="w-4 h-4 text-foreground flex-shrink-0" />
              <p className="text-sm text-foreground font-medium">{t("ob.notif_enabled")}</p>
            </div>
          )}
          {notifStatus === "denied" && (
            <div className="bg-card border border-border rounded-2xl px-4 py-3 text-center">
              <p className="text-sm text-muted-foreground">{t("ob.notif_blocked_title")}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {notifStatus !== "granted" && (
              <button
                onClick={requestNotifications}
                disabled={notifStatus === "loading"}
                className="w-full h-14 rounded-2xl bg-foreground text-background font-semibold text-base disabled:opacity-50 active:scale-95 transition"
              >
                {notifStatus === "loading" ? t("ob.notif_enabling") :
                 notifStatus === "denied"  ? t("ob.try_again") :
                 t("ob.notif_enable_btn")}
              </button>
            )}
            <button
              onClick={next}
              className="w-full h-14 rounded-2xl bg-card border border-border text-foreground font-semibold text-base active:scale-95 transition"
            >
              {notifStatus === "granted" ? t("ob.lets_go") : t("ob.skip_notif")}
            </button>
          </div>
        </div>
      )}

      {/* ── Welcome ── */}
      {step === "welcome" && (
        <div className="flex flex-col flex-1 w-full max-w-sm items-center gap-6">
          {/* Logo — lick fires after 1 s */}
          <div className="flex justify-center pt-4">
            <BadgerLogo size={120} forceAnim={welcomeAnim} />
          </div>

          {/* Large header */}
          <div className="text-center">
            <h1 className="text-5xl font-black tracking-widest text-foreground uppercase">
              {t("ob.welcome_header")}
            </h1>
          </div>

          {/* Body — scrollable if needed */}
          <div className="flex-1 overflow-y-auto">
            {isHonorableContributor ? (
              /* ── Honorable Contributor body ── */
              <p className="text-sm text-muted-foreground leading-relaxed">
                {language === "pl" ? (
                  <>
                    <span className="font-bold text-foreground">Witamy w Budgerze</span>
                    {" "}- jedynym Planerze Budżetu jakiego kiedykolwiek będziesz potrzebować. Jesteśmy szczęśliwi że postanowiłaś/łeś dołączyć do nas w podróży do finansowej stabilności i harmonii jako jeden z 50 pierwszych użytkowników. Z tego powodu mamy ekscytujące wieści! Został nadany ci tytuł <span className="font-bold text-foreground">„Honorowego Współtwórcy"</span>. To oznacza, że bez względu na to co przyszłość przyniesie Budgerowi, będziesz w tym z nami używając wszystkich funkcjonalności aplikacji…{" "}
                    <span className="font-bold text-foreground">ZA DARMO!</span>
                    {" "}Raz jeszcze, dziękujemy że jesteś z nami! Zacznijmy grzebać w planowaniu naszej przyszłości!
                  </>
                ) : (
                  <>
                    <span className="font-bold text-foreground">Welcome to Budger</span>
                    {" "}- the only Budget Planner you'll ever need. We're glad you decided to join us in this journey of financial stability and harmony as one of your first 50 users. For that reason we have an exciting news! You've been awarded with a <span className="font-bold text-foreground">„Honorable Contributor"</span> title. That means that no matter what the future holds to Budger, you will enjoy this ride with us using full functionalities of the app…{" "}
                    <span className="font-bold text-foreground">FOR FREE!</span>
                    {" "}Once again, thank you for being with us and let's dig deeper in planning our future.
                  </>
                )}
              </p>
            ) : (
              /* ── Regular user body ── */
              <p className="text-sm text-muted-foreground leading-relaxed">
                {language === "pl" ? (
                  <>
                    <span className="font-bold text-foreground">Witamy w Budgerze</span>
                    {" "}- jedynym Planerze Budżetu jakiego kiedykolwiek będziesz potrzebować. Jesteśmy szczęśliwi że postanowiłaś/łeś dołączyć do nas w podróży do finansowej stabilności i harmonii. Obecnie wszystkie funkcje są udostępnione do testów za darmo - ciesz się nimi póki czas! W przyszłości możemy wprowadzić plany subskrypcji, ale bez obaw - kluczowe narzędzia Budgera{" "}
                    <span className="font-bold text-foreground">ZAWSZE POZOSTANĄ DARMOWE</span>
                    . Raz jeszcze, dziękujemy że jesteś z nami! Zacznijmy grzebać w planowaniu naszej przyszłości!
                  </>
                ) : (
                  <>
                    <span className="font-bold text-foreground">Welcome to Budger</span>
                    {" "}- the only Budget planner you'll ever need. We're glad you decided to join us in this journey of financial stability and harmony. Currently all the features are free to test - enjoy them while it lasts. In the future we may introduce subscription plans, but don't worry - Budger's key tools will{" "}
                    <span className="font-bold text-foreground">ALWAYS REMAIN FREE</span>
                    . Once again, thank you for being with us and let's dig deeper in planning our future.
                  </>
                )}
              </p>
            )}
          </div>

          {/* CTA button */}
          <div className="w-full flex-shrink-0">
            <button
              onClick={handleLetsStart}
              disabled={finishing || launching}
              className="w-full h-14 rounded-2xl bg-foreground text-background font-bold text-base
                         transition active:scale-95 disabled:opacity-60"
            >
              {t("ob.welcome_lets_start")}
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom action (skip/continue) for currency step ── */}
      {step === "currency" && (
        <div className="flex flex-col gap-3 w-full max-w-sm flex-shrink-0">
          <button
            onClick={next}
            className="w-full h-14 rounded-2xl bg-foreground text-background font-semibold text-base transition active:scale-95"
          >
            {t("ob.continue")}
          </button>
          <button
            onClick={skip}
            className="w-full h-10 text-sm text-muted-foreground underline underline-offset-4"
          >
            {t("ob.skip")}
          </button>
        </div>
      )}
    </div>
  );
}
