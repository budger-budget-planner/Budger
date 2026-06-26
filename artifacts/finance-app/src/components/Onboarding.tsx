import { useState, useEffect } from "react";
import { type AppPrefs, CURRENCIES, LANGUAGES } from "@/lib/prefs";
import BadgerLogo from "@/components/BadgerLogo";
import { t } from "@/lib/i18n";
import {
  useUpdateNotificationSettings,
  useUpdateMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

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

// ── Apple Pay shortcut tutorial slides ────────────────────────────────────────

const WALLET_SLIDES = [
  {
    icon: "🪄",
    title: "Expenses on autopilot",
    desc: "Every time you tap your iPhone to pay, Budger can log it for you instantly — no typing, no forgetting. Set it up once and it just works.",
  },
  {
    icon: "📱",
    title: "Open Shortcuts on your iPhone",
    desc: "Find the Shortcuts app (it comes with every iPhone). Tap Automation at the bottom of the screen, then tap the + button in the top-right corner.",
  },
  {
    icon: "💳",
    title: "Choose the payment trigger",
    desc: "Tap New Blank Automation. Scroll down to Wallet & Apple Pay and choose Transaction. Set it to Run Immediately and turn off the notification toggle.",
  },
  {
    icon: "⚙️",
    title: "Add one action",
    desc: "Add a Get Contents of URL action. Set Method to POST and Request Body to JSON. Add a single key called  transaction  and set its value to Shortcut Input (the blue chip).",
  },
  {
    icon: "🔗",
    title: "Paste your personal link",
    desc: "Copy the link below and paste it as the URL in that action. That's it — every Apple Pay purchase will appear in Budger automatically.",
  },
];

// ── Copy-to-clipboard helper ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className={`mt-3 w-full px-4 py-3 rounded-2xl font-semibold text-sm transition active:scale-95 ${
        copied
          ? "bg-green-900/30 border border-green-700/40 text-green-400"
          : "bg-foreground text-background"
      }`}
    >
      {copied ? "✓ Copied!" : "Copy link"}
    </button>
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
  const [walletSlide, setWalletSlide] = useState(0);
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<"idle" | "granted" | "denied" | "loading">("idle");
  const [finishing, setFinishing]     = useState(false);

  const updateNotif = useUpdateNotificationSettings();
  const updateMe    = useUpdateMe();

  // Fetch webhook token when wallet step is reached
  useEffect(() => {
    if (step !== "wallet" || webhookToken) return;
    fetch(`${import.meta.env.BASE_URL}api/webhook/token`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.token) setWebhookToken(data.token); })
      .catch(() => {});
  }, [step, webhookToken]);

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

  // Wallet slide navigation
  function walletNext() {
    if (walletSlide < WALLET_SLIDES.length - 1) {
      setWalletSlide(s => s + 1);
    } else {
      next();
    }
  }
  function walletPrev() {
    if (walletSlide > 0) setWalletSlide(s => s - 1);
  }

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

  // Webhook URL for last slide
  const webhookUrl = webhookToken
    ? `${window.location.origin}/api/webhook/apple/${webhookToken}`
    : null;

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
        </div>
      )}

      {/* ── Wallet — Apple Pay shortcut tutorial ── */}
      {step === "wallet" && (
        <div className="flex flex-col gap-4 flex-1 w-full max-w-sm justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">Auto-logging</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Step {walletSlide + 1} of {WALLET_SLIDES.length}
            </p>
          </div>

          {/* Slide card with invisible tap zones */}
          <div className="relative bg-card border border-border rounded-3xl flex-1 flex flex-col items-center justify-center p-8 gap-5 overflow-hidden">
            {/* Left tap zone — go back */}
            <button
              onClick={walletPrev}
              disabled={walletSlide === 0}
              className="absolute inset-y-0 left-0 w-1/2 z-10 select-none cursor-pointer disabled:cursor-default"
              aria-label="Previous slide"
              style={{ WebkitTapHighlightColor: "transparent" }}
            />
            {/* Right tap zone — go forward */}
            <button
              onClick={walletNext}
              className="absolute inset-y-0 right-0 w-1/2 z-10 select-none cursor-pointer"
              aria-label="Next slide"
              style={{ WebkitTapHighlightColor: "transparent" }}
            />

            {/* Slide content — pointer-events-none so taps fall through to the zones */}
            <div className="pointer-events-none flex flex-col items-center gap-4 w-full">
              <span className="text-6xl select-none">{WALLET_SLIDES[walletSlide].icon}</span>
              <h3 className="text-lg font-bold text-foreground text-center leading-snug">
                {WALLET_SLIDES[walletSlide].title}
              </h3>
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                {WALLET_SLIDES[walletSlide].desc}
              </p>

              {/* Last slide: webhook URL */}
              {walletSlide === WALLET_SLIDES.length - 1 && (
                <div className="w-full mt-1">
                  {webhookUrl ? (
                    <div className="pointer-events-auto">
                      <div className="bg-background border border-border rounded-xl px-3 py-2.5">
                        <p className="text-xs text-muted-foreground break-all leading-relaxed font-mono select-all">
                          {webhookUrl}
                        </p>
                      </div>
                      <CopyButton text={webhookUrl} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <div className="w-3 h-3 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
                      <p className="text-xs text-muted-foreground">Generating your link…</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Slide dots */}
            <div className="pointer-events-none flex gap-2 mt-1">
              {WALLET_SLIDES.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${
                  i === walletSlide ? "w-5 bg-foreground" : "w-2 bg-border"
                }`} />
              ))}
            </div>

            {/* Tap hint — only on first slide */}
            {walletSlide === 0 && (
              <p className="pointer-events-none absolute bottom-3 text-[10px] text-muted-foreground/40 tracking-wide">
                tap anywhere to continue
              </p>
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
            disabled={finishing}
            className="w-full h-14 rounded-2xl bg-card border border-border text-foreground font-semibold text-base active:scale-95 transition disabled:opacity-50"
          >
            {finishing ? "Saving…" : notifStatus === "granted" ? t("ob.lets_go") : t("ob.skip_notif")}
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
