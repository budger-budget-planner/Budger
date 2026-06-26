import { useState } from "react";
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

// ── Wallet step SVG illustrations ─────────────────────────────────────────────

function SlideIllustration({ index }: { index: number }) {
  const bg = "var(--color-card, #1a1a1a)";
  const border = "var(--color-border, #333)";
  const fg = "var(--color-foreground, #fff)";
  const muted = "var(--color-muted-foreground, #888)";

  if (index === 0) return (
    <svg viewBox="0 0 280 160" className="w-full h-full" fill="none">
      {/* Apple Pay box */}
      <rect x="8" y="44" width="72" height="72" rx="14" stroke={fg} strokeWidth="1.5" fill={bg}/>
      <rect x="22" y="62" width="44" height="28" rx="6" stroke={fg} strokeWidth="1.4" fill="none"/>
      <rect x="22" y="62" width="44" height="10" rx="6" stroke="none" fill={fg} opacity="0.15"/>
      <line x1="28" y1="82" x2="52" y2="82" stroke={fg} strokeWidth="1.2" strokeLinecap="round"/>
      <text x="44" y="106" textAnchor="middle" fill={fg} fontSize="8" fontFamily="system-ui,sans-serif">Apple Pay</text>
      {/* Arrow 1 */}
      <path d="M84 80 L104 80" stroke={muted} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M100 76 L104 80 L100 84" stroke={muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Wallet notification box */}
      <rect x="108" y="44" width="72" height="72" rx="14" stroke={fg} strokeWidth="1.5" fill={bg}/>
      {/* Notification banner */}
      <rect x="118" y="60" width="52" height="22" rx="5" fill={fg} opacity="0.1"/>
      <circle cx="126" cy="71" r="5" fill={fg} opacity="0.3"/>
      <line x1="134" y1="67" x2="162" y2="67" stroke={fg} strokeWidth="1" opacity="0.5" strokeLinecap="round"/>
      <line x1="134" y1="72" x2="156" y2="72" stroke={fg} strokeWidth="1" opacity="0.3" strokeLinecap="round"/>
      <line x1="134" y1="77" x2="152" y2="77" stroke={fg} strokeWidth="0.8" opacity="0.25" strokeLinecap="round"/>
      <text x="144" y="98" textAnchor="middle" fill={fg} fontSize="7.5" fontFamily="system-ui,sans-serif">Wallet</text>
      <text x="144" y="108" textAnchor="middle" fill={muted} fontSize="6.5" fontFamily="system-ui,sans-serif">notification</text>
      {/* Arrow 2 */}
      <path d="M184 80 L204 80" stroke={muted} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M200 76 L204 80 L200 84" stroke={muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Budger box */}
      <rect x="208" y="44" width="72" height="72" rx="14" stroke={fg} strokeWidth="1.5" fill={bg}/>
      {/* Badger face simplified */}
      <ellipse cx="244" cy="76" rx="18" ry="16" fill={fg} opacity="0.08"/>
      <ellipse cx="244" cy="76" rx="18" ry="16" stroke={fg} strokeWidth="1.4"/>
      <ellipse cx="237" cy="72" rx="5" ry="9" fill={fg} opacity="0.35"/>
      <ellipse cx="251" cy="72" rx="5" ry="9" fill={fg} opacity="0.35"/>
      <ellipse cx="244" cy="82" rx="4" ry="3" fill={fg} opacity="0.5"/>
      <text x="244" y="104" textAnchor="middle" fill={fg} fontSize="7.5" fontFamily="system-ui,sans-serif">Budger</text>
      <text x="244" y="114" textAnchor="middle" fill={muted} fontSize="6" fontFamily="system-ui,sans-serif">auto-logged ✓</text>
      {/* iOS Shortcuts label in middle */}
      <rect x="100" y="132" width="80" height="16" rx="8" fill={fg} opacity="0.07"/>
      <text x="140" y="143" textAnchor="middle" fill={muted} fontSize="7" fontFamily="system-ui,sans-serif">via iOS Shortcuts</text>
    </svg>
  );

  if (index === 1) return (
    <svg viewBox="0 0 280 160" className="w-full h-full" fill="none">
      {/* Phone outline */}
      <rect x="90" y="8" width="100" height="144" rx="16" stroke={fg} strokeWidth="1.5" fill={bg}/>
      <rect x="90" y="8" width="100" height="18" rx="16" stroke="none" fill={fg} opacity="0.06"/>
      {/* Status bar */}
      <rect x="124" y="12" width="32" height="4" rx="2" fill={fg} opacity="0.15"/>
      {/* Screen label */}
      <text x="140" y="38" textAnchor="middle" fill={fg} fontSize="9" fontWeight="600" fontFamily="system-ui,sans-serif">Shortcuts</text>
      {/* App icons grid */}
      {[0,1,2,3].map(i => (
        <rect key={i} x={100 + (i%2)*44} y={48 + Math.floor(i/2)*44} width="34" height="34" rx="9"
          stroke={fg} strokeWidth="1" fill={fg} opacity={i === 0 ? "0.18" : "0.07"}/>
      ))}
      {/* Shortcuts icon (highlighted) */}
      <path d="M111 61 L117 56 L121 63 L115 63 L119 70 L113 65 Z" fill={fg} opacity="0.8"/>
      {/* Bottom tab bar */}
      <rect x="92" y="128" width="96" height="22" rx="0" fill={fg} opacity="0.05"/>
      <text x="118" y="142" textAnchor="middle" fill={muted} fontSize="6.5" fontFamily="system-ui,sans-serif">Library</text>
      <text x="162" y="142" textAnchor="middle" fill={fg} fontSize="6.5" fontWeight="600" fontFamily="system-ui,sans-serif">Automation</text>
      <line x1="162" y1="144" x2="162" y2="148" stroke={fg} strokeWidth="1.5" strokeLinecap="round"/>
      {/* + button */}
      <circle cx="174" cy="28" r="8" fill={fg} opacity="0.15"/>
      <line x1="170" y1="28" x2="178" y2="28" stroke={fg} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="174" y1="24" x2="174" y2="32" stroke={fg} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );

  if (index === 2) return (
    <svg viewBox="0 0 280 160" className="w-full h-full" fill="none">
      <rect x="90" y="8" width="100" height="144" rx="16" stroke={fg} strokeWidth="1.5" fill={bg}/>
      <text x="140" y="34" textAnchor="middle" fill={fg} fontSize="9" fontWeight="600" fontFamily="system-ui,sans-serif">New Automation</text>
      <line x1="92" y1="40" x2="188" y2="40" stroke={border} strokeWidth="0.8"/>
      {/* Trigger type list */}
      {["Time of Day", "App", "Alarm"].map((label, i) => (
        <g key={label}>
          <rect x="96" y={48 + i * 28} width="88" height="22" rx="6"
            fill={i === 1 ? fg : "transparent"} opacity={i === 1 ? 0.12 : 1}
            stroke={i === 1 ? fg : border} strokeWidth={i === 1 ? 1.5 : 0.8}/>
          <text x="140" y={63 + i * 28} textAnchor="middle" fill={i === 1 ? fg : muted}
            fontSize="8" fontFamily="system-ui,sans-serif">{label}</text>
        </g>
      ))}
      {/* Wallet card icon */}
      <rect x="104" y="136" width="20" height="14" rx="3" stroke={fg} strokeWidth="1.2" fill={fg} opacity="0.08"/>
      <line x1="104" y1="141" x2="124" y2="141" stroke={fg} strokeWidth="0.8" opacity="0.4"/>
      <text x="140" y="146" textAnchor="middle" fill={fg} fontSize="7.5" fontFamily="system-ui,sans-serif">Wallet selected ✓</text>
      <rect x="130" y="136" width="50" height="13" rx="4" fill={fg} opacity="0.07"/>
    </svg>
  );

  if (index === 3) return (
    <svg viewBox="0 0 280 160" className="w-full h-full" fill="none">
      <rect x="90" y="8" width="100" height="144" rx="16" stroke={fg} strokeWidth="1.5" fill={bg}/>
      <text x="140" y="32" textAnchor="middle" fill={fg} fontSize="9" fontWeight="600" fontFamily="system-ui,sans-serif">Actions</text>
      {/* Notification banner mock */}
      <rect x="96" y="38" width="88" height="30" rx="7" fill={fg} opacity="0.1" stroke={fg} strokeWidth="0.8"/>
      <circle cx="106" cy="53" r="6" fill={fg} opacity="0.2"/>
      <text x="106" y="56" textAnchor="middle" fill={fg} fontSize="7" fontFamily="system-ui,sans-serif">W</text>
      <text x="150" y="49" textAnchor="middle" fill={fg} fontSize="6.5" fontFamily="system-ui,sans-serif">Spent £15.50 at</text>
      <text x="150" y="59" textAnchor="middle" fill={fg} fontSize="6.5" fontFamily="system-ui,sans-serif">Starbucks</text>
      {/* Arrow down */}
      <line x1="140" y1="72" x2="140" y2="84" stroke={muted} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M136 81 L140 85 L144 81" stroke={muted} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Action block */}
      <rect x="96" y="88" width="88" height="28" rx="7" fill={fg} opacity="0.08" stroke={fg} strokeWidth="1"/>
      <text x="140" y="100" textAnchor="middle" fill={fg} fontSize="7" fontFamily="system-ui,sans-serif">Get Details of</text>
      <text x="140" y="110" textAnchor="middle" fill={fg} fontSize="7" fontFamily="system-ui,sans-serif">Notification</text>
      {/* Extracted text */}
      <rect x="96" y="122" width="88" height="18" rx="5" fill={fg} opacity="0.06" stroke={border} strokeWidth="0.8"/>
      <text x="140" y="134" textAnchor="middle" fill={muted} fontSize="7" fontFamily="system-ui,sans-serif">→ "Spent £15.50 at Starbucks"</text>
    </svg>
  );

  if (index === 4) return (
    <svg viewBox="0 0 280 160" className="w-full h-full" fill="none">
      <rect x="90" y="8" width="100" height="144" rx="16" stroke={fg} strokeWidth="1.5" fill={bg}/>
      <text x="140" y="30" textAnchor="middle" fill={fg} fontSize="9" fontWeight="600" fontFamily="system-ui,sans-serif">Get Contents of URL</text>
      <line x1="92" y1="36" x2="188" y2="36" stroke={border} strokeWidth="0.8"/>
      {/* Method */}
      <text x="100" y="50" fill={muted} fontSize="7" fontFamily="system-ui,sans-serif">Method</text>
      <rect x="96" y="54" width="88" height="16" rx="4" fill={fg} opacity="0.08" stroke={border} strokeWidth="0.8"/>
      <text x="140" y="65" textAnchor="middle" fill={fg} fontSize="7.5" fontFamily="system-ui,sans-serif">POST</text>
      {/* URL field */}
      <text x="100" y="82" fill={muted} fontSize="7" fontFamily="system-ui,sans-serif">URL</text>
      <rect x="96" y="86" width="88" height="16" rx="4" fill={fg} opacity="0.08" stroke={fg} strokeWidth="1"/>
      <text x="140" y="97" textAnchor="middle" fill={fg} fontSize="6" fontFamily="system-ui,sans-serif">your-app.replit.app/api/…</text>
      {/* Body fields */}
      <text x="100" y="114" fill={muted} fontSize="7" fontFamily="system-ui,sans-serif">Body (JSON)</text>
      <rect x="96" y="118" width="88" height="12" rx="3" fill={fg} opacity="0.07" stroke={border} strokeWidth="0.6"/>
      <text x="102" y="127" fill={fg} fontSize="6" fontFamily="system-ui,sans-serif">token: <tspan fill={muted}>your-secret-token</tspan></text>
      <rect x="96" y="132" width="88" height="12" rx="3" fill={fg} opacity="0.07" stroke={border} strokeWidth="0.6"/>
      <text x="102" y="141" fill={fg} fontSize="6" fontFamily="system-ui,sans-serif">text: <tspan fill={muted}>Notification Detail</tspan></text>
    </svg>
  );

  // Slide 6: Copy token from Budger
  return (
    <svg viewBox="0 0 280 160" className="w-full h-full" fill="none">
      {/* Budger app screen */}
      <rect x="70" y="8" width="140" height="144" rx="18" stroke={fg} strokeWidth="1.5" fill={bg}/>
      <rect x="70" y="8" width="140" height="24" rx="18" stroke="none" fill={fg} opacity="0.05"/>
      {/* Header */}
      <text x="140" y="26" textAnchor="middle" fill={fg} fontSize="9" fontWeight="700" fontFamily="system-ui,sans-serif">Apple Pay Setup</text>
      <line x1="72" y1="32" x2="208" y2="32" stroke={border} strokeWidth="0.8"/>
      {/* Token section */}
      <text x="84" y="50" fill={muted} fontSize="7" fontFamily="system-ui,sans-serif">Webhook URL</text>
      <rect x="78" y="54" width="120" height="22" rx="6" fill={fg} opacity="0.08" stroke={fg} strokeWidth="0.9"/>
      <text x="118" y="68" textAnchor="middle" fill={fg} fontSize="6" fontFamily="system-ui,sans-serif">https://your-app/api/wallet…</text>
      {/* Copy URL button */}
      <rect x="184" y="58" width="10" height="10" rx="2" stroke={fg} strokeWidth="1" fill="none" opacity="0.7"/>
      <rect x="186" y="56" width="10" height="10" rx="2" stroke={fg} strokeWidth="1" fill={bg} opacity="0.9"/>
      <text x="84" y="92" fill={muted} fontSize="7" fontFamily="system-ui,sans-serif">Your token</text>
      <rect x="78" y="96" width="120" height="22" rx="6" fill={fg} opacity="0.08" stroke={fg} strokeWidth="0.9"/>
      <text x="118" y="110" textAnchor="middle" fill={fg} fontSize="6" fontFamily="system-ui,sans-serif">a3f9…d812</text>
      {/* Copy token button */}
      <rect x="184" y="100" width="10" height="10" rx="2" stroke={fg} strokeWidth="1" fill="none" opacity="0.7"/>
      <rect x="186" y="98" width="10" height="10" rx="2" stroke={fg} strokeWidth="1" fill={bg} opacity="0.9"/>
      {/* Paste into Shortcut callout */}
      <rect x="78" y="128" width="124" height="18" rx="6" fill={fg} opacity="0.12"/>
      <text x="140" y="140" textAnchor="middle" fill={fg} fontSize="7.5" fontFamily="system-ui,sans-serif">Paste into your Shortcut ✓</text>
    </svg>
  );
}

const WALLET_SLIDES = [
  { titleKey: "ob.wallet_s1_title", descKey: "ob.wallet_s1_desc" },
  { titleKey: "ob.wallet_s2_title", descKey: "ob.wallet_s2_desc" },
  { titleKey: "ob.wallet_s3_title", descKey: "ob.wallet_s3_desc" },
  { titleKey: "ob.wallet_s4_title", descKey: "ob.wallet_s4_desc" },
  { titleKey: "ob.wallet_s5_title", descKey: "ob.wallet_s5_desc" },
  { titleKey: "ob.wallet_s6_title", descKey: "ob.wallet_s6_desc" },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: { onComplete: (prefs: AppPrefs) => void }) {
  const queryClient = useQueryClient();
  const [step, setStep]               = useState<Step>("stay-signed-in");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [currency, setCurrency]       = useState("USD");
  // Inherit the language already chosen on the login screen
  const [language]                    = useState(() => {
    try { return JSON.parse(localStorage.getItem("budger_prefs_v1") ?? "{}").language ?? "en"; } catch { return "en"; }
  });
  const [totalBudget, setTotalBudget] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [walletSlide, setWalletSlide] = useState(0);
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
      // Persist all user settings to server in one call:
      // - firstLoginDone:true prevents re-triggering onboarding on next login
      // - language ensures the chosen language follows the account, not the device
      // - totalBudget (if set) persists across devices
      const updateData: Record<string, unknown> = {
        firstLoginDone: true,
        language,
      };
      if (totalBudget !== null) {
        updateData.totalBudget = totalBudget;
      }
      await updateMe.mutateAsync({ data: updateData as any });
      // Invalidate user cache so App.tsx sync gets fresh data (not stale null budget)
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch {
      // Continue even if network fails; server sync can retry next login
    } finally {
      setFinishing(false);
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

      {/* ── Wallet instructions ── */}
      {step === "wallet" && (
        <div className="flex flex-col gap-3 flex-1 w-full max-w-sm">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("ob.wallet_title")}</h2>
            <p className="text-xs text-muted-foreground mt-1">{t("ob.wallet_subtitle")}</p>
          </div>

          {/* Slide card */}
          <div className="bg-card border border-border rounded-3xl px-4 pt-4 pb-5 flex flex-col items-center gap-3 flex-1">
            {/* SVG illustration */}
            <div className="w-full flex-1 flex items-center justify-center min-h-0">
              <div className="w-full" style={{ maxHeight: "160px" }}>
                <SlideIllustration index={walletSlide} />
              </div>
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-foreground">
                {t(WALLET_SLIDES[walletSlide].titleKey)}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t(WALLET_SLIDES[walletSlide].descKey)}
              </p>
            </div>

            {/* Sub-slide dots */}
            <div className="flex gap-2 pt-1">
              {WALLET_SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setWalletSlide(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === walletSlide ? "w-5 bg-foreground" : "w-2 bg-border"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Slide nav */}
          <div className="flex gap-3 flex-shrink-0">
            {walletSlide > 0 && (
              <button
                onClick={() => setWalletSlide(s => s - 1)}
                className="flex-1 h-12 rounded-2xl bg-card border border-border text-foreground font-semibold text-sm"
              >
                ← {t("ob.prev")}
              </button>
            )}
            {walletSlide < WALLET_SLIDES.length - 1 ? (
              <button
                onClick={() => setWalletSlide(s => s + 1)}
                className="flex-1 h-12 rounded-2xl bg-foreground text-background font-semibold text-sm"
              >
                {t("ob.next")} →
              </button>
            ) : (
              <button
                onClick={next}
                className="flex-1 h-12 rounded-2xl bg-foreground text-background font-semibold text-sm"
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
