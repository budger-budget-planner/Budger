import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Bell, BellOff, X, ChevronLeft, AlarmClock, BookOpen, Settings,
  Plus, Trash2, TrendingUp, Target, CheckCircle, AlertTriangle,
  Smartphone, ExternalLink, Circle, Sparkles, Crown,
  FileText, ShieldCheck, Clock, WifiOff, Tag,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetNotificationSettings,
  useUpdateNotificationSettings,
  getGetNotificationSettingsQueryKey,
  useGetMe,
} from "@/lib/api-client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import ApplePaySlides from "@/components/ApplePaySlides";
import ShareSheetSlides from "@/components/ShareSheetSlides";
import BadgesSlides from "@/components/BadgesSlides";
import BadgerLogo from "@/components/BadgerLogo";
import {
  loadSmartAlertPrefs, saveSmartAlertPrefs, type SmartAlertPrefs,
} from "@/hooks/useSmartNotifications";
import { t, getDayLabels } from "@/lib/i18n";
import { triggerBadgerNotification, hapticSniff, canHaptic } from "@/lib/badger-notify";
import { addNCNotification, loadNCNotifications, markAllNCRead, dismissNCNotification, setNCNotificationRead, type NCNotification, type NCNotifType } from "@/lib/nc-store";
import { setAppBadgeCount } from "@/lib/app-badge";
import { useOfflinePendingOps } from "@/hooks/useOfflinePendingOps";
import { discardOp, opLabel } from "@/lib/mutation-queue";
import { loadPrefs, savePrefs, checkNcSwipeHintDue } from "@/lib/prefs";
import { LEGAL } from "@/lib/legal";
import { showNotification } from "@/lib/show-notification";

// ─── Alert (alarm) types ──────────────────────────────────────────────────────
type Alert = { id: string; time: string; days: string[]; enabled: boolean };
const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
function DAYS() {
  const labels = getDayLabels();
  return DAY_KEYS.map((key, i) => ({ key, label: labels[i] }));
}
const ALERTS_KEY = "budger_alerts_v1";
function loadAlerts(): Alert[] {
  try { const raw = localStorage.getItem(ALERTS_KEY); if (raw) return JSON.parse(raw); } catch { /**/ }
  return [{ id: "default", time: "20:00", days: DAY_KEYS, enabled: false }];
}
function saveAlerts(alerts: Alert[]) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}
function makeId() { return Math.random().toString(36).slice(2, 9); }
async function ensurePermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}

// ─── Notification type metadata ───────────────────────────────────────────────
function ncIcon(type: NCNotifType) {
  switch (type) {
    case "daily_reminder":    return <Bell className="w-4 h-4" />;
    case "budget_75_cat":     return <TrendingUp className="w-4 h-4" />;
    case "budget_90_cat":     return <AlertTriangle className="w-4 h-4" />;
    case "budget_75_total":   return <TrendingUp className="w-4 h-4" />;
    case "budget_90_total":   return <AlertTriangle className="w-4 h-4" />;
    case "goal_checkin_multi":return <Target className="w-4 h-4" />;
    case "goal_monthly":      return <Target className="w-4 h-4" />;
    case "goal_overall":      return <Target className="w-4 h-4" />;
    case "goal_completed_monthly": return <CheckCircle className="w-4 h-4" />;
    case "goal_realized":          return <CheckCircle className="w-4 h-4" />;
    case "share_approved":    return <CheckCircle className="w-4 h-4" />;
    case "edit_approved":     return <CheckCircle className="w-4 h-4" />;
    case "share_declined":    return <AlertTriangle className="w-4 h-4" />;
    case "edit_declined":     return <AlertTriangle className="w-4 h-4" />;
    case "goal_created":      return <Target className="w-4 h-4" />;
    case "goal_changed":      return <Target className="w-4 h-4" />;
    case "head_request":      return <Crown className="w-4 h-4" />;
    case "split_accepted":    return <CheckCircle className="w-4 h-4" />;
    case "split_declined":    return <AlertTriangle className="w-4 h-4" />;
    case "transaction_added": return <Tag className="w-4 h-4" />;
    default: return <Bell className="w-4 h-4" />;
  }
}

function ncIconBg(type: NCNotifType) {
  switch (type) {
    case "budget_90_cat":
    case "budget_90_total":  return "bg-destructive/15 text-destructive";
    case "budget_75_cat":
    case "budget_75_total":  return "bg-yellow-500/15 text-yellow-400";
    case "goal_completed_monthly":
    case "goal_realized":
    case "share_approved":
    case "edit_approved":    return "bg-emerald-500/15 text-emerald-400";
    case "share_declined":
    case "edit_declined":    return "bg-destructive/15 text-destructive";
    case "split_accepted":   return "bg-emerald-500/15 text-emerald-400";
    case "split_declined":   return "bg-destructive/15 text-destructive";
    case "head_request":     return "bg-amber-500/15 text-amber-400";
    case "transaction_added":return "bg-sky-500/15 text-sky-400";
    default:                 return "bg-muted text-muted-foreground";
  }
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Sub-panel: Alarm ─────────────────────────────────────────────────────────
function AlarmPanel({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useGetNotificationSettings();
  const update = useUpdateNotificationSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationSettingsQueryKey() });
        toast({ title: t("notif.alerts_saved") });
      },
    },
  });
  const [alerts, setAlerts] = useState<Alert[]>(loadAlerts);
  const [permStatus, setPermStatus] = useState<NotificationPermission>("default");
  const reminderTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (settings && !localStorage.getItem(ALERTS_KEY)) {
      setAlerts([{ id: "default", time: settings.reminderTime, days: settings.days, enabled: settings.enabled }]);
    }
  }, [settings]);

  useEffect(() => {
    if ("Notification" in window) setPermStatus(Notification.permission as NotificationPermission);
  }, []);

  useEffect(() => {
    if (permStatus !== "denied") return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if ("Notification" in window) setPermStatus(Notification.permission as NotificationPermission);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [permStatus]);

  useEffect(() => () => { reminderTimers.current.forEach(clearTimeout); }, []);

  function toggleDay(alertId: string, day: string) {
    setAlerts(prev => prev.map(a => {
      if (a.id !== alertId) return a;
      const days = a.days.includes(day) ? a.days.filter(d => d !== day) : [...a.days, day];
      return { ...a, days };
    }));
  }

  async function handleSave() {
    const anyEnabled = alerts.some(a => a.enabled);
    if (anyEnabled && "Notification" in window && Notification.permission !== "granted") {
      const granted = await ensurePermission();
      setPermStatus(Notification.permission as NotificationPermission);
      if (!granted) {
        toast({ title: t("notif.perm_denied"), description: t("notif.enable_settings"), variant: "destructive" });
        return;
      }
    }
    saveAlerts(alerts);
    const first = alerts[0];
    update.mutate({ data: { enabled: first?.enabled ?? false, reminderTime: first?.time ?? "20:00", days: first?.days ?? [] } });

    reminderTimers.current.forEach(clearTimeout);
    reminderTimers.current = [];

    if ("Notification" in window && Notification.permission === "granted") {
      for (const alert of alerts) {
        if (!alert.enabled || alert.days.length === 0) continue;
        const [h, m] = alert.time.split(":").map(Number);
        const now = new Date();
        const next = new Date();
        next.setHours(h, m, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        const id = setTimeout(async () => {
          if ("Notification" in window && Notification.permission === "granted") {
            await showNotification(t("notif.budger_reminder"), {
              body: t("notif.dont_forget"),
              url: "/?sheet=alerts",
              tag: "daily-reminder",
            });
            addNCNotification({
              type: "daily_reminder",
              titleEn: "Budger Reminder",
              titlePl: "Przypomnienie Budger",
              bodyEn: "Don't forget to log today's spending!",
              bodyPl: "Nie zapomnij zalogować dzisiejszych wydatków!",
            });
            const hapticOn = localStorage.getItem("budger_haptic_v1") !== "off";
            triggerBadgerNotification({ haptic: hapticOn && canHaptic() });
          }
        }, next.getTime() - now.getTime());
        reminderTimers.current.push(id);
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center transition active:scale-95">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <AlarmClock className="w-5 h-5 text-foreground" />
          <h2 className="text-base font-bold">{t("nc.alarm")}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
        {permStatus === "denied" && (
          <div className="bg-muted border border-border rounded-2xl px-4 py-3 space-y-2">
            <p className="text-sm font-semibold">{t("notif.perm_denied")}</p>
            <p className="text-xs text-muted-foreground">{t("notif.blocked")}</p>
          </div>
        )}

        {alerts.map((alert) => (
          <div key={alert.id} className={`bg-card border border-border rounded-2xl overflow-hidden transition-opacity ${alert.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                {alert.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
                <span className="text-sm font-medium">{alert.enabled ? t("notif.on") : t("notif.off")}</span>
              </div>
              <div className="flex items-center gap-3">
                {alerts.length > 1 && (
                  <button onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
                    className="w-7 h-7 rounded-xl bg-destructive/10 flex items-center justify-center transition active:opacity-70">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}
                <Switch checked={alert.enabled} onCheckedChange={v => setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, enabled: v } : a))} />
              </div>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-10 flex-shrink-0">{t("notif.time")}</span>
                <Input type="time" value={alert.time} onChange={e => setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, time: e.target.value } : a))} className="w-36 h-9" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-10 flex-shrink-0">{t("notif.days")}</span>
                <div className="flex gap-1.5">
                  {DAYS().map(d => {
                    const active = alert.days.includes(d.key);
                    return (
                      <button key={d.key} type="button" onClick={() => toggleDay(alert.id, d.key)}
                        className={`w-8 h-8 rounded-full text-xs font-semibold transition-colors ${active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {alert.days.length === 0 && <p className="text-xs text-destructive pl-12">{t("notif.select_day")}</p>}
            </div>
          </div>
        ))}

        <button onClick={() => setAlerts(prev => [...prev, { id: makeId(), time: "09:00", days: ["mon","tue","wed","thu","fri"], enabled: true }])}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition active:opacity-70">
          <Plus className="w-4 h-4" />
          {t("nc.add_alarm")}
        </button>
      </div>

      <button onClick={handleSave}
        className="mt-4 w-full h-12 rounded-2xl bg-foreground text-background text-sm font-bold transition active:scale-95 flex-shrink-0">
        {t("notif.save")}
      </button>
    </div>
  );
}

// ─── Sub-panel: Manuals ───────────────────────────────────────────────────────
function ManualsPanel({ onBack }: { onBack: () => void }) {
  const [showApplePay, setShowApplePay] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Same webhook URL the "Copy URL" button inside the manuals fetches and copies —
  // this button is a convenience shortcut to the same action.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/webhook/token`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.token) {
          setWebhookUrl(`${window.location.origin}/api/webhook/apple/${data.token}`);
        }
      })
      .catch(() => {});
  }, []);

  function copyUrl() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  if (showApplePay) return <ApplePaySlides modal onClose={() => setShowApplePay(false)} />;
  if (showShareSheet) return <ShareSheetSlides modal onClose={() => setShowShareSheet(false)} />;
  if (showBadges) return <BadgesSlides modal onClose={() => setShowBadges(false)} />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center transition active:scale-95">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-foreground" />
          <h2 className="text-base font-bold">{t("nc.manuals")}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1">
        {/* Apple Pay tutorial */}
        <button onClick={() => setShowApplePay(true)}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-card border border-border transition active:scale-95 text-left">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">{t("man.configure_btn")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t("man.configure_desc")}</p>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground flex-shrink-0 rotate-180" />
        </button>

        {/* Share Sheet tutorial */}
        <button onClick={() => setShowShareSheet(true)}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-card border border-border transition active:scale-95 text-left">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">{t("ss.configure_btn")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t("ss.configure_desc")}</p>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground flex-shrink-0 rotate-180" />
        </button>

        {/* Badges tutorial */}
        <button onClick={() => setShowBadges(true)}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-card border border-border transition active:scale-95 text-left">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <Tag className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">{t("badges.configure_btn")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t("badges.configure_desc")}</p>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground flex-shrink-0 rotate-180" />
        </button>

        {/* Copy URL button — same action as the "Copy URL" button inside the manuals above,
            surfaced here for convenience so it isn't buried in a slide flow. */}
        <button onClick={copyUrl} disabled={!webhookUrl}
          className={`w-full flex items-center gap-3 px-4 py-4 rounded-2xl transition active:scale-95 text-left disabled:opacity-50 ${
            copied ? "bg-green-500/15 border border-green-500/30" : "bg-foreground text-background"
          }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            copied ? "bg-green-500/20" : "bg-background/15"
          }`}>
            {copied
              ? <CheckCircle className="w-5 h-5 text-green-400" />
              : <ExternalLink className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold leading-snug ${copied ? "text-green-400" : ""}`}>
              {copied ? t("ap.copied") : t("nc.setup_guide")}
            </p>
            <p className={`text-xs mt-0.5 leading-snug ${copied ? "text-green-400/70" : "opacity-70"}`}>
              {t("nc.setup_guide_desc")}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Sub-panel: Settings ──────────────────────────────────────────────────────
function SettingsPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const { data: user } = useGetMe();
  const [animDisabled, setAnimDisabled] = useState(() => loadPrefs().disableAnimations ?? false);
  const [forceOffline, setForceOffline] = useState<boolean>(() => {
    try { return localStorage.getItem("budger_force_offline") === "1"; } catch { return false; }
  });
  const [smartPrefs, setSmartPrefs] = useState<SmartAlertPrefs>(loadSmartAlertPrefs);
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("budger_haptic_v1") !== "off"; } catch { return true; }
  });
  const [previewing, setPreviewing] = useState(false);
  const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Offline sync status (shown in the Sync section above Smart alerts)
  const [syncExpanded, setSyncExpanded] = useState(false);
  const { ops, pendingCount, failedCount, refresh: opsRefresh } = useOfflinePendingOps();

  // Mission / Legal / Delete state
  const [showMission, setShowMission] = useState(false);
  const [legalModal, setLegalModal] = useState<null | "terms" | "privacy">(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"warning" | "type-email" | "final" | "pending" | "done">("warning");
  const [deleteUnderstood, setDeleteUnderstood] = useState(false);
  const [deleteEmailInput, setDeleteEmailInput] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const lang = (loadPrefs().language ?? "en") as "en" | "pl";

  useEffect(() => () => { if (previewTimeout.current) clearTimeout(previewTimeout.current); }, []);

  async function handleSmartToggle(key: keyof SmartAlertPrefs, value: boolean) {
    if (value) {
      const granted = await ensurePermission();
      if (!granted) {
        toast({ title: t("notif.perm_denied"), description: t("notif.enable_notif"), variant: "destructive" });
        return;
      }
    }
    const next = { ...smartPrefs, [key]: value };
    setSmartPrefs(next);
    saveSmartAlertPrefs(next);
    toast({ title: value ? t("notif.alert_enabled") : t("notif.alert_disabled") });
  }

  function toggleHaptic(v: boolean) {
    setHapticEnabled(v);
    try { localStorage.setItem("budger_haptic_v1", v ? "on" : "off"); } catch { /**/ }
    if (v) hapticSniff();
  }

  function toggleForceOffline(v: boolean) {
    setForceOffline(v);
    try { localStorage.setItem("budger_force_offline", v ? "1" : "0"); } catch { /**/ }
    window.dispatchEvent(new Event(v ? "offline" : "online"));
  }

  async function handlePreview() {
    if (previewing) return;
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    setPreviewing(true);
    await triggerBadgerNotification({ haptic: hapticEnabled && canHaptic() });
    previewTimeout.current = setTimeout(() => setPreviewing(false), 2600);
  }

  function openDeleteFlow() {
    setDeleteStep("warning");
    setDeleteUnderstood(false);
    setDeleteEmailInput("");
    setDeleteError("");
    setShowDeleteConfirm(true);
  }

  async function submitDeletionRequest() {
    setDeleteStep("pending");
    setDeleteError("");
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/auth/request-deletion`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang }),
      });
      if (!r.ok) throw new Error("failed");
      // Session is destroyed on the server — hard-navigate directly to the login route with
      // a pending-deletion notice so AuthGuard does not intercept and strip the query param.
      window.location.replace(`${import.meta.env.BASE_URL}login?pendingDeletion=1`);
    } catch {
      setDeleteStep("final");
      setDeleteError(lang === "pl"
        ? "Coś poszło nie tak. Spróbuj ponownie."
        : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center transition active:scale-95">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-foreground" />
          <h2 className="text-base font-bold">{t("nc.settings")}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 -mx-1 px-1">

        {/* 0. Offline sync — only shown when there are queued or failed ops */}
        {(pendingCount > 0 || failedCount > 0) && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {lang === "pl" ? "Synchronizacja offline" : "Offline sync"}
            </p>
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Header row — toggles the list */}
              <button
                onClick={() => setSyncExpanded(e => !e)}
                className="w-full flex items-center justify-between px-4 py-3.5 transition active:opacity-70"
              >
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${failedCount > 0 ? "text-destructive" : "text-amber-400"}`} />
                  <span className="text-sm font-medium">
                    {lang === "pl"
                      ? (failedCount > 0
                          ? `${failedCount} błąd${pendingCount > 0 ? `, ${pendingCount} oczekuje` : ""}`
                          : `${pendingCount} oczekuj${pendingCount === 1 ? "e" : "ą"}`)
                      : (failedCount > 0
                          ? `${failedCount} failed${pendingCount > 0 ? `, ${pendingCount} pending` : ""}`
                          : `${pendingCount} pending change${pendingCount !== 1 ? "s" : ""}`)
                    }
                  </span>
                </div>
                <ChevronLeft className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${syncExpanded ? "rotate-90" : "-rotate-90"}`} />
              </button>

              {/* Expanded list of queued ops */}
              {syncExpanded && (
                <div className="border-t border-border divide-y divide-border/50">
                  {ops.map(op => (
                    <div key={op.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        op.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {op.status === "failed"
                          ? <AlertTriangle className="w-3.5 h-3.5" />
                          : <Clock className="w-3.5 h-3.5" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{opLabel(op)}</p>
                        {op.status === "failed" && (op as any).error && (
                          <p className="text-[10px] text-destructive/80 mt-0.5 line-clamp-1">
                            {String((op as any).error).slice(0, 80)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          await discardOp(op.id);
                          opsRefresh();
                          window.dispatchEvent(new CustomEvent("queue-updated"));
                          // Also fire queue-drain so useQueueReplay retries remaining ops immediately
                          window.dispatchEvent(new CustomEvent("queue-drain"));
                        }}
                        className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 transition active:scale-90"
                        title={lang === "pl" ? "Odrzuć" : "Discard"}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 1. Go Offline toggle */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {lang === "pl" ? "Połączenie" : "Connection"}
          </p>
          <div className={`flex items-start justify-between gap-3 py-4 px-4 rounded-2xl border transition-colors ${
            forceOffline
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-card border-border"
          }`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 ${forceOffline ? "text-amber-400" : "text-muted-foreground"}`}>
                <WifiOff className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {lang === "pl" ? "Tryb offline" : "Go Offline"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {lang === "pl"
                    ? "Symuluj brak połączenia"
                    : "Simulate no connection"}
                </p>
              </div>
            </div>
            <Switch checked={forceOffline} onCheckedChange={toggleForceOffline} />
          </div>
        </section>

        {/* 2. Smart alerts */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("notif.smart")}</p>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 py-4 px-4 bg-card border border-border rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-muted-foreground"><TrendingUp className="w-4 h-4" /></div>
                <div>
                  <p className="text-sm font-medium">{t("notif.budget_thresh")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("notif.budget_thresh_desc")}</p>
                </div>
              </div>
              <Switch checked={smartPrefs.budgetAlerts} onCheckedChange={v => handleSmartToggle("budgetAlerts", v)} />
            </div>
            <div className="flex items-start justify-between gap-3 py-4 px-4 bg-card border border-border rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-muted-foreground"><Target className="w-4 h-4" /></div>
                <div>
                  <p className="text-sm font-medium">{t("notif.goal_prog")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("notif.goal_prog_desc")}</p>
                </div>
              </div>
              <Switch checked={smartPrefs.goalAlerts} onCheckedChange={v => handleSmartToggle("goalAlerts", v)} />
            </div>
          </div>
        </section>

        {/* 2. Animations toggle */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("prefs.animations")}</p>
          <div className="flex items-start justify-between gap-3 py-4 px-4 bg-card border border-border rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-muted-foreground"><Sparkles className="w-4 h-4" /></div>
              <div>
                <p className="text-sm font-medium">{t("prefs.disable_animations")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("prefs.disable_animations_desc")}</p>
              </div>
            </div>
            <Switch
              checked={animDisabled}
              onCheckedChange={val => {
                setAnimDisabled(val);
                savePrefs({ ...loadPrefs(), disableAnimations: val });
                document.documentElement.classList.toggle('no-animations', val);
              }}
            />
          </div>
        </section>

        {/* 3. Sound & Haptics / Preview */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("notif.sound_section")}</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {/* Haptic row */}
            <div className="flex items-start justify-between gap-3 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-muted-foreground">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 8v8" /><path d="M6 6v12" />
                    <rect x="8" y="4" width="8" height="16" rx="2" />
                    <path d="M18 6v12" /><path d="M22 8v8" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">{t("notif.haptic_label")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {canHaptic() ? t("notif.haptic_desc") : t("notif.haptic_unavailable")}
                  </p>
                </div>
              </div>
              <Switch checked={hapticEnabled && canHaptic()} disabled={!canHaptic()} onCheckedChange={toggleHaptic} />
            </div>
            {/* Sound preview row */}
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-muted-foreground">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t("notif.badger_sniff")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("notif.sniff_pattern")}</p>
                </div>
              </div>
              <button onClick={handlePreview} disabled={previewing}
                className={`px-4 py-1.5 rounded-xl text-sm font-semibold border transition active:scale-95 ${previewing ? "border-foreground/20 text-muted-foreground" : "border-border text-foreground bg-muted"}`}>
                {previewing ? "▶︎" : t("notif.preview_btn")}
              </button>
            </div>
          </div>
        </section>

        {/* 4. Mission */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {lang === "pl" ? "O aplikacji" : "About"}
          </p>
          <div className="space-y-2">
            <button
              onClick={() => setShowMission(true)}
              className="flex items-center gap-3 w-full py-3 px-4 rounded-2xl bg-card border border-border text-sm text-foreground transition active:opacity-70"
            >
              <Sparkles className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{lang === "pl" ? "Misja" : "The Mission"}</span>
            </button>
          </div>
        </section>

        {/* 5. Legal */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {lang === "pl" ? "Prawne" : "Legal"}
          </p>
          <div className="space-y-2">
            <button
              onClick={() => setLegalModal("terms")}
              className="flex items-center gap-3 w-full py-3 px-4 rounded-2xl bg-card border border-border text-sm text-foreground transition active:opacity-70"
            >
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{t("login.terms_title")}</span>
            </button>
            <button
              onClick={() => setLegalModal("privacy")}
              className="flex items-center gap-3 w-full py-3 px-4 rounded-2xl bg-card border border-border text-sm text-foreground transition active:opacity-70"
            >
              <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{t("login.privacy_title")}</span>
            </button>
          </div>
        </section>

        {/* 6. Danger zone */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {lang === "pl" ? "Strefa zagrożenia" : "Danger zone"}
          </p>
          <div className="space-y-2">
            <button
              onClick={openDeleteFlow}
              className="flex items-center gap-3 w-full py-3 px-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-sm text-destructive transition active:opacity-70"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>{lang === "pl" ? "Usuń konto" : "Delete my account"}</span>
            </button>
          </div>
        </section>
      </div>

      {/* ── Mission overlay (portalled) ── */}
      {showMission && createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-background">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <BadgerLogo size={32} />
              <div>
                <p className="text-base font-semibold text-foreground">
                  {lang === "pl" ? "Misja" : "The Mission"}
                </p>
                <p className="text-xs text-muted-foreground">Filip Snopek · Budger</p>
              </div>
            </div>
            <button
              onClick={() => setShowMission(false)}
              className="text-muted-foreground text-2xl leading-none px-2 py-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {lang === "pl" ? (
              <div className="space-y-4 text-sm text-foreground/80 leading-relaxed">
                <p>Pomysł na Budgera narodził się z lat praktyk i potrzeby. Potrzebowałem planera finansowego dla swojej rodziny, by śledzić bieżące wydatki oraz mądrze planować te które dopiero nadejdą.</p>
                <p>Od lat starannie planowałem wydatki w notatniku swojego telefonu — zalążki podejścia. Później zacząłem te wydatki kategoryzować. Z biegiem czasu stworzyłem pierwszy świadomy budżet, ale bez środków aby śledzić każdy finansowy ruch trudno było utrzymać konsekwencję. Aplikacje bankowe nie oferowały elastyczności, a ja miałem kilka kont w różnych bankach. To zadanie zdawało się przytłaczające i niemożliwe do zrealizowania.</p>
                <p>Gdy nadszedł 2026, Sztuczna Inteligencja pojawiła się w wielu codziennych obszarach, tworząc okazję, otwierając drzwi. Jedną z nich był vibecoding, czyli tworzenie kodu za pomocą promptów, a nie języka programistycznego. Iskra potrzebna by podjąć akcję. Mając środki do zrealizacji celu zacząłem tworzyć narzędzie którego potrzebowałem przez tyle lat. I tak, Panie i Panowie, narodził się Budger.</p>
                <p>Z czasem zdałem sobie sprawę, że osobista potrzeba przekształciła się w misję stworzenia społeczności i szerzenia finansowej świadomości. Każdy z nas ma miesięczne wydatki oraz cele do których dąży. Świadomość swoich finansów oraz staranne planowanie sprawia, że stają się one łatwiejsze i bardziej osiągalne. Chciałbym podzielić się tym podejściem z moimi najbliższymi, przyjaciółmi, a w przyszłości po prostu z ludźmi myślącymi podobnie do mnie. Ideą Budgera jest planowanie i osiąganie celów — indywidualnych jak i tych wspólnych. Dla lepszej przyszłości.</p>
                <p>Dedykuję tę aplikację mojej rodzinie, szczególnie żonie Natalii oraz córce Matyldzie, które napędzały mnie i dawały wsparcie w całym procesie, oraz bratu Pawłowi i chrześniakowi Teodorowi, którzy byli inspiracją do brandingu, dając mi pozytywne skojarzenia z Borsukiem.</p>
                <p>Borsuki same w sobie są bardzo przedsiębiorczymi zwierzętami. Poszukują pożywienia na wiele sposobów, podejmują sprytne decyzje, budują złożone nory które przekazywane są z pokolenia na pokolenie. Jeśli ta aplikacja osiągnie komercyjny sukces, deklaruję wsparcie ich bezpieczeństwa oraz dobrobytu.</p>
                <p className="text-foreground/50 text-xs pt-2 border-t border-border">Autor i CEO Budgera, Filip Snopek</p>
              </div>
            ) : (
              <div className="space-y-4 text-sm text-foreground/80 leading-relaxed">
                <p>The idea for Budger was born out of necessity and years of practice. I needed a planner for my household, to more carefully track current expenses and plan wisely those that are yet to come.</p>
                <p>Over the years, I carefully planned my expenses in my phone notebook — a start of a mindset. Then, I started to categorize them. Over time I created the first conscious budget, but with no means to actually track every financial move, it was difficult to stay consistent. Banking apps were not flexible enough, and I had multiple accounts to manage. The task seemed overwhelming and impossible to achieve.</p>
                <p>Then 2026 came, and Artificial Intelligence surged in most areas of everyday life, creating opportunities and opening many doors. One of them was vibecoding — creating code with prompts instead of coding language. A spark needed to take action. With the means to do it, I started to create the tool I needed for so many years. And that's, ladies and gentlemen, how Budger was born.</p>
                <p>Over time I realized that this personal need became a mission to create community and spread financial awareness. Everyone has monthly expenses and goals to achieve. By staying conscious of your finances and through careful planning, everything is easier and much more obtainable. I'd like to spread this approach with my close ones, friends, and in the future, people that think just like me. The idea of Budger is to plan and achieve goals — individual or common. For a better future.</p>
                <p>I dedicate this app to my family, especially my wife Natalia and daughter Matylda, for giving me drive and support along the way, and brother Paweł and godson Teodor, who both were an inspiration for the branding as they gave me fond memories with the Badger.</p>
                <p>Badgers themselves are extremely entrepreneurial animals. They seek many opportunities to get food, make smart choices, build complex burrows that are passed from generation to generation. If this app reaches commercial success, I pledge to contribute to their safety and wellbeing.</p>
                <p className="text-foreground/50 text-xs pt-2 border-t border-border">Author and CEO of Budger, Filip Snopek</p>
              </div>
            )}
          </div>
          <div className="shrink-0 px-5 pb-8 pt-3 border-t border-border">
            <button
              onClick={() => setShowMission(false)}
              className="w-full py-4 rounded-2xl bg-muted text-sm font-semibold text-foreground transition active:opacity-70"
            >
              {lang === "pl" ? "Zamknij" : "Close"}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Legal text overlay (portalled) ── */}
      {legalModal !== null && createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-background">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border shrink-0">
            <h2 className="text-base font-semibold text-foreground">
              {legalModal === "terms" ? t("login.terms_title") : t("login.privacy_title")}
            </h2>
            <button
              onClick={() => setLegalModal(null)}
              className="text-muted-foreground text-2xl leading-none px-2 py-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {legalModal === "terms"
                ? LEGAL.terms[lang] ?? LEGAL.terms.en
                : LEGAL.privacy[lang] ?? LEGAL.privacy.en}
            </pre>
          </div>
          <div className="shrink-0 px-5 pb-8 pt-3 border-t border-border">
            <button
              onClick={() => setLegalModal(null)}
              className="w-full py-4 rounded-2xl bg-muted text-sm font-semibold text-foreground transition active:opacity-70"
            >
              {lang === "pl" ? "Zamknij" : "Close"}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Delete account flow (portalled, 3 steps) ── */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-background">

          {/* Step 1: Warning + Consequences */}
          {deleteStep === "warning" && (
            <>
              <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-sm text-muted-foreground flex items-center gap-1"
                >
                  ← {lang === "pl" ? "Anuluj" : "Cancel"}
                </button>
                <span className="text-xs text-muted-foreground">
                  {lang === "pl" ? "Krok 1 z 3" : "Step 1 of 3"}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                <div className="flex flex-col items-center gap-3 text-center pt-2">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                    <Trash2 className="w-7 h-7 text-destructive" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">
                    {lang === "pl" ? "Zanim przejdziesz dalej" : "Before you continue"}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                    {lang === "pl"
                      ? "Żądanie usunięcia konta jest nieodwracalne. Gdy zostanie przetworzone przez nasz zespół, nie będziemy w stanie odzyskać Twoich danych."
                      : "Requesting account deletion is irreversible. Once processed by our team, we will not be able to recover your data."}
                  </p>
                </div>
                <div className="rounded-2xl border border-destructive/25 bg-destructive/5 overflow-hidden">
                  <div className="px-4 py-3 border-b border-destructive/20">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wider">
                      {lang === "pl" ? "Co zostanie trwale usunięte" : "What will be permanently deleted"}
                    </p>
                  </div>
                  {([
                    lang === "pl"
                      ? ["Twoje konto i dane logowania", "Nie będziesz mógł się zalogować po usunięciu"]
                      : ["Your account and login credentials", "You will not be able to sign in after deletion"],
                    lang === "pl"
                      ? ["Wszystkie transakcje", "Każdy wpis finansowy który kiedykolwiek dodałeś"]
                      : ["All transactions", "Every financial entry you have ever added"],
                    lang === "pl"
                      ? ["Wszystkie kategorie i budżety", "Twoje kolory, nazwy i limity miesięczne"]
                      : ["All categories and budgets", "Your colours, names and monthly limits"],
                    lang === "pl"
                      ? ["Cele i wkłady", "Postępy, historię i cele gospodarstwa domowego"]
                      : ["Goals and contributions", "Progress, history and household goals"],
                    lang === "pl"
                      ? ["Członkostwo w gospodarstwie domowym", "Zostaniesz usunięty z każdego wspólnego gospodarstwa"]
                      : ["Household membership", "You will be removed from any shared household"],
                    lang === "pl"
                      ? ["Zdjęcia paragonów i załączniki", "Wszystkie przesłane obrazy transakcji"]
                      : ["Receipt photos and attachments", "All uploaded transaction images"],
                    lang === "pl"
                      ? ["Ustawienia powiadomień i preferencje", "Harmonogramy, waluty, języki i inne"]
                      : ["Notification settings and preferences", "Schedules, currencies, languages and more"],
                  ] as [string, string][]).map(([title, sub], i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-destructive/10 last:border-0">
                      <span className="mt-0.5 text-destructive text-base leading-none">✕</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl bg-muted/50 border border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "pl"
                      ? "Po potwierdzeniu Twoje konto zostanie trwale usunięte po 24 godzinach. W tym czasie nie możesz się zalogować ani zarejestrować na ten adres e-mail. Po upływie tego czasu e-mail staje się wolny do ponownej rejestracji."
                      : "Once confirmed, your account will be permanently deleted after 24 hours. During that window you cannot log in or re-register with this email. After the 24 hours your email is free to use again."}
                  </p>
                </div>
                <label className="flex items-start gap-3 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={deleteUnderstood}
                    onChange={e => setDeleteUnderstood(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded accent-destructive cursor-pointer"
                  />
                  <span className="text-sm text-foreground leading-snug font-medium">
                    {lang === "pl"
                      ? "Rozumiem wszystkie powyższe konsekwencje i chcę trwale usunąć moje konto."
                      : "I understand all the consequences listed above and want to permanently delete my account."}
                  </span>
                </label>
              </div>
              <div className="shrink-0 px-5 pb-8 pt-3 border-t border-border space-y-2.5">
                <button
                  disabled={!deleteUnderstood}
                  onClick={() => setDeleteStep("type-email")}
                  className="w-full py-4 rounded-2xl bg-destructive text-sm font-semibold text-white transition active:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {lang === "pl" ? "Kontynuuj" : "Continue"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-3 rounded-2xl bg-muted text-sm font-medium text-muted-foreground transition active:opacity-70"
                >
                  {lang === "pl" ? "Rezygnuję, zachowaj moje konto" : "Never mind, keep my account"}
                </button>
              </div>
            </>
          )}

          {/* Step 2: Type email to confirm */}
          {deleteStep === "type-email" && (
            <>
              <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <button onClick={() => setDeleteStep("warning")} className="text-sm text-muted-foreground flex items-center gap-1">
                  ← {lang === "pl" ? "Wróć" : "Back"}
                </button>
                <span className="text-xs text-muted-foreground">
                  {lang === "pl" ? "Krok 2 z 3" : "Step 2 of 3"}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-8 flex flex-col gap-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-2xl">✉️</span>
                  </div>
                  <h2 className="text-xl font-bold text-foreground">
                    {lang === "pl" ? "Potwierdź swój adres e-mail" : "Confirm your email"}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                    {lang === "pl"
                      ? "Wpisz poniżej swój adres e-mail, aby potwierdzić, że chcesz usunąć konto."
                      : "Type your email address below to confirm you want to delete this account."}
                  </p>
                  <p className="text-sm font-semibold text-foreground bg-muted px-3 py-1.5 rounded-xl">
                    {user?.email}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    {lang === "pl" ? "Twój adres e-mail" : "Your email address"}
                  </label>
                  <input
                    type="email"
                    value={deleteEmailInput}
                    onChange={e => setDeleteEmailInput(e.target.value)}
                    placeholder={user?.email ?? ""}
                    autoComplete="off"
                    autoCapitalize="none"
                    className="w-full h-14 rounded-2xl bg-muted border border-border text-base px-4 text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-destructive"
                  />
                  {deleteEmailInput.length > 0 && deleteEmailInput !== user?.email && (
                    <p className="text-xs text-destructive">
                      {lang === "pl" ? "Adres e-mail nie pasuje." : "Email address does not match."}
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 px-5 pb-8 pt-3 border-t border-border space-y-2.5">
                <button
                  disabled={deleteEmailInput !== user?.email}
                  onClick={() => setDeleteStep("final")}
                  className="w-full py-4 rounded-2xl bg-destructive text-sm font-semibold text-white transition active:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {lang === "pl" ? "Kontynuuj" : "Continue"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-3 rounded-2xl bg-muted text-sm font-medium text-muted-foreground transition active:opacity-70"
                >
                  {lang === "pl" ? "Rezygnuję, zachowaj moje konto" : "Never mind, keep my account"}
                </button>
              </div>
            </>
          )}

          {/* Step 3: Final trigger */}
          {deleteStep === "final" && (
            <>
              <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
                <button onClick={() => setDeleteStep("type-email")} className="text-sm text-muted-foreground flex items-center gap-1">
                  ← {lang === "pl" ? "Wróć" : "Back"}
                </button>
                <span className="text-xs text-muted-foreground">
                  {lang === "pl" ? "Krok 3 z 3" : "Step 3 of 3"}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-5 gap-5 text-center">
                <div className="w-20 h-20 rounded-full bg-destructive/10 border-2 border-destructive/30 flex items-center justify-center">
                  <Trash2 className="w-9 h-9 text-destructive" />
                </div>
                <div className="space-y-2 max-w-xs">
                  <h2 className="text-xl font-bold text-foreground">
                    {lang === "pl" ? "Ostatnia szansa" : "Last chance"}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {lang === "pl"
                      ? "Kliknięcie przycisku poniżej wyśle nieodwołalne żądanie usunięcia konta i wszystkich Twoich danych."
                      : "Tapping the button below will send an irrevocable request to delete your account and all your data."}
                  </p>
                  <p className="text-sm font-semibold text-destructive">
                    {lang === "pl" ? "Tej operacji nie można cofnąć." : "This action cannot be undone."}
                  </p>
                </div>
                {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              </div>
              <div className="shrink-0 px-5 pb-8 pt-3 border-t border-border space-y-2.5">
                <button
                  onClick={submitDeletionRequest}
                  className="w-full py-4 rounded-2xl bg-destructive text-sm font-bold text-white transition active:opacity-80"
                >
                  {lang === "pl" ? "Trwale usuń moje konto i dane" : "Permanently delete my account and data"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-3 rounded-2xl bg-muted text-sm font-medium text-muted-foreground transition active:opacity-70"
                >
                  {lang === "pl" ? "Rezygnuję, zachowaj moje konto" : "Never mind, keep my account"}
                </button>
              </div>
            </>
          )}

          {/* Pending */}
          {deleteStep === "pending" && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5">
              <div className="w-12 h-12 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">
                {lang === "pl" ? "Wysyłanie żądania…" : "Submitting request…"}
              </p>
            </div>
          )}

          {/* Done */}
          {deleteStep === "done" && (
            <div className="flex-1 flex flex-col items-center justify-center px-8 gap-5 text-center">
              <div className="w-20 h-20 rounded-full bg-green-900/25 border border-green-700/30 flex items-center justify-center">
                <span className="text-3xl">✓</span>
              </div>
              <div className="space-y-2 max-w-xs">
                <h2 className="text-xl font-bold text-foreground">
                  {lang === "pl" ? "Żądanie wysłane" : "Request submitted"}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {lang === "pl"
                    ? "Otrzymaliśmy Twoje żądanie. Przetworzymy je w ciągu 30 dni i wyślemy potwierdzenie na Twój adres e-mail."
                    : "We've received your request. Our team will process it within 30 days and send a confirmation to your email."}
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="mt-4 w-full max-w-xs py-4 rounded-2xl bg-muted text-sm font-semibold text-foreground transition active:opacity-70"
              >
                {lang === "pl" ? "Zamknij" : "Close"}
              </button>
            </div>
          )}

        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Swipeable notification card ─────────────────────────────────────────────
function SwipeableNotifCard({
  n,
  lang,
  onDismiss,
  onToggleRead,
  showHint,
}: {
  n: NCNotification;
  lang: "en" | "pl";
  onDismiss: (id: string) => void;
  onToggleRead: (id: string, read: boolean) => void;
  showHint?: boolean;
}) {
  const [offset,    setOffset]    = useState(0);
  const [animated,  setAnimated]  = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isDragging  = useRef(false);
  const startX      = useRef(0);
  const startY      = useRef(0);
  const currentOff  = useRef(0);
  const isScrolling = useRef<boolean | null>(null);
  const hasMoved    = useRef(false);

  const THRESHOLD = 80; // px before a release triggers the swipe action

  // Swipe hint wiggle — identical timing/offsets to the home-tab transaction
  // swipe hint (SwipeableTxRow in HomeSpending.tsx), so both feel the same.
  useEffect(() => {
    if (!showHint) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const go = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { if (!cancelled) fn(); }, ms);
      timers.push(id);
    };
    setAnimated(true);
    go(() => setOffset(-7.5), 100);          // left ×1 (half)
    go(() => setOffset(0),    260);          // back
    go(() => setOffset(-15),  370);          // left ×2 (full)
    go(() => setOffset(0),    530);          // back
    go(() => setOffset(9.5),  1360);         // right ×1 (half)
    go(() => setOffset(0),    1520);         // back
    go(() => setOffset(19),   1630);         // right ×2 (full)
    go(() => setOffset(0),    1790);         // back
    go(() => setAnimated(false), 1900);
    return () => { cancelled = true; timers.forEach(clearTimeout); setOffset(0); setAnimated(false); };
  }, [showHint]);

  function handleTouchStart(e: React.TouchEvent) {
    if (dismissed) return;
    startX.current      = e.touches[0].clientX;
    startY.current      = e.touches[0].clientY;
    isDragging.current  = true;
    isScrolling.current = null;
    hasMoved.current    = false;
    setAnimated(false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging.current || dismissed) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Disambiguate scroll vs horizontal swipe on first significant move
    if (isScrolling.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isScrolling.current = Math.abs(dy) > Math.abs(dx);
    }
    if (isScrolling.current === null || isScrolling.current) return;

    hasMoved.current   = true;
    currentOff.current = dx;
    setOffset(dx);
  }

  function handleTouchEnd() {
    if (!isDragging.current || dismissed) return;
    isDragging.current = false;
    if (!hasMoved.current || isScrolling.current) return;

    setAnimated(true);
    const off = currentOff.current;

    if (off <= -THRESHOLD) {
      // Swipe right-to-left, past threshold → delete (matches transaction rows)
      setDismissed(true);
      setOffset(-(window.innerWidth + 60));
      setTimeout(() => onDismiss(n.id), 260);
    } else if (off >= THRESHOLD) {
      // Swipe left-to-right, past threshold → toggle read/unread, then spring back
      onToggleRead(n.id, !n.read);
      setOffset(0);
      currentOff.current = 0;
    } else {
      // Not far enough → spring back to rest
      setOffset(0);
      currentOff.current = 0;
    }
  }

  const isUnread = !n.read;
  const title    = lang === "pl" ? n.titlePl : n.titleEn;
  const body     = lang === "pl" ? n.bodyPl  : n.bodyEn;
  // 0 → 1 as drag approaches THRESHOLD; clamp so it doesn't exceed 1
  const progress = Math.min(Math.abs(offset) / THRESHOLD, 1);
  // Swiping left-to-right (offset > 0) reveals the read/unread toggle hint;
  // swiping right-to-left (offset < 0) reveals the delete hint.
  const showingToggleHint = offset > 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ opacity: dismissed ? 0 : 1, transition: dismissed ? "opacity 0.26s ease" : "none" }}
    >
      {/* Swipe-hint background: delete (right-to-left) or read/unread toggle (left-to-right) */}
      <div
        className="absolute inset-0 bg-card rounded-2xl flex items-center px-4"
        style={{
          justifyContent: offset >= 0 ? "flex-start" : "flex-end",
          opacity: progress,
        }}
        aria-hidden
      >
        {showingToggleHint ? (
          <>
            <div className="absolute inset-0 rounded-2xl bg-sky-500/10" />
            {isUnread
              ? <CheckCircle className="w-5 h-5 text-sky-400 relative z-10" />
              : <Circle className="w-5 h-5 text-sky-400 relative z-10" />}
          </>
        ) : (
          <>
            <div className="absolute inset-0 rounded-2xl bg-destructive/10" />
            <X className="w-5 h-5 text-destructive relative z-10" />
          </>
        )}
      </div>

      {/* Card content — slides with the finger */}
      <div
        className={`flex items-start gap-3 px-4 py-3 rounded-2xl border transition-colors ${
          isUnread ? "bg-card border-border" : "bg-card/50 border-border/50"
        }`}
        style={{
          transform:  `translateX(${offset}px)`,
          transition: animated ? "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          touchAction: "pan-y",
          willChange: "transform",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${ncIconBg(n.type)}`}>
          {ncIcon(n.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold leading-snug ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
              {title}
            </p>
            {isUnread && <span className="w-2 h-2 rounded-full bg-pink-500 flex-shrink-0 mt-1.5" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
          <p className="text-[10px] text-muted-foreground/50 mt-1">{relTime(n.timestamp)}</p>
        </div>
        <button
          onClick={() => onDismiss(n.id)}
          aria-label={t("nc.dismiss")}
          className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5 transition active:scale-90 hover:bg-muted/70"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

// ─── Notification Feed ────────────────────────────────────────────────────────
function NotifFeed({
  notifications,
  onDismiss,
  onToggleRead,
  showHint,
}: {
  notifications: NCNotification[];
  onDismiss: (id: string) => void;
  onToggleRead: (id: string, read: boolean) => void;
  showHint: boolean;
}) {
  const lang = loadPrefs().language as "en" | "pl";

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Bell className="w-8 h-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{t("nc.no_notifications")}</p>
      </div>
    );
  }

  const topId = notifications[0]?.id;

  return (
    <div className="space-y-2">
      {notifications.map(n => (
        <SwipeableNotifCard
          key={n.id}
          n={n}
          lang={lang}
          onDismiss={onDismiss}
          onToggleRead={onToggleRead}
          showHint={showHint && n.id === topId}
        />
      ))}
    </div>
  );
}

// ─── Main Notification Center ─────────────────────────────────────────────────
type Panel = "alarm" | "manuals" | "settings" | null;

export function NotificationCenter({ userId }: { userId: number | string }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [notifications, setNotifications] = useState<NCNotification[]>([]);
  const [swipeHintDue, setSwipeHintDue] = useState(false);

  async function refresh() {
    setNotifications(await loadNCNotifications());
  }

  // Load notifications on mount and when userId changes
  useEffect(() => {
    if (!userId) return;
    refresh();
  }, [userId]);

  // Refresh notifications list when drawer opens
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  // Refresh instantly when a notification is added/dismissed (same tab)
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("nc-updated", handler);
    // Short fallback interval catches any missed signals (e.g. cross-tab writes)
    const id = setInterval(handler, 5_000);
    return () => { window.removeEventListener("nc-updated", handler); clearInterval(id); };
  }, []);

  async function handleOpen() {
    await refresh();
    setSwipeHintDue(checkNcSwipeHintDue());
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setPanel(null);
  }

  async function handleDismiss(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await dismissNCNotification(id);
  }

  async function handleToggleRead(id: string, read: boolean) {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read } : n)));
    await setNCNotificationRead(id, read);
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const hasBadge = unreadCount > 0;

  // Mirror the in-app unread count onto the home-screen app icon (Badging API).
  // Covers: initial load, new items arriving (nc-updated / 5s poll refresh),
  // and marking items read/dismissed — all of which already flow through
  // `notifications` state above.
  useEffect(() => {
    setAppBadgeCount(unreadCount);
  }, [unreadCount]);

  const ACTION_BTNS: { id: Panel & string; labelKey: string; icon: React.ReactNode }[] = [
    { id: "alarm",   labelKey: "nc.alarm",   icon: <AlarmClock className="w-5 h-5" /> },
    { id: "manuals", labelKey: "nc.manuals", icon: <BookOpen className="w-5 h-5" /> },
    { id: "settings",labelKey: "nc.settings",icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <>
      {/* ── Bell button (rendered inside Layout header) ── */}
      <button
        onClick={handleOpen}
        className="relative w-10 h-10 rounded-full bg-muted border border-border
                   flex items-center justify-center flex-shrink-0 transition active:scale-95"
        aria-label={t("nc.title")}
      >
        <Bell className={`w-5 h-5 ${hasBadge ? "text-pink-400" : "text-muted-foreground"}`} strokeWidth={hasBadge ? 2.2 : 1.6} />
        {hasBadge && (
          <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-pink-500 border border-background" />
        )}
      </button>

      {/* ── Drawer (portalled to document.body so header stacking context doesn't clip it) ── */}
      {open && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Sheet */}
          <div className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border
                          rounded-t-3xl flex flex-col"
               style={{ height: "90vh" }}>

            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header row */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                {!panel && <h2 className="text-base font-bold">{t("nc.title")}</h2>}
              </div>
              <button onClick={handleClose}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center transition active:scale-95">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden px-5 pb-10 flex flex-col min-h-0">

              {/* ── Main view (no sub-panel) ── */}
              {panel === null && (
                <>
                  {/* Three action buttons — always visible at the top */}
                  <div className="grid grid-cols-3 gap-3 mb-5 flex-shrink-0">
                    {ACTION_BTNS.map(btn => (
                      <button
                        key={btn.id}
                        onClick={() => setPanel(btn.id as Panel)}
                        className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted border border-border
                                   transition active:scale-95 hover:bg-muted/80"
                      >
                        <div className="text-foreground">{btn.icon}</div>
                        <span className="text-xs font-semibold text-foreground">{t(btn.labelKey)}</span>
                      </button>
                    ))}
                  </div>

                  {/* Mark-all-read — below the tabs stripe */}
                  {unreadCount > 0 && (
                    <div className="flex justify-end mb-3 flex-shrink-0">
                      <button
                        onClick={async () => {
                          await markAllNCRead();
                          setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                        }}
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors active:opacity-70"
                      >
                        {t("nc.read_all")}
                      </button>
                    </div>
                  )}

                  {/* Notification feed */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <NotifFeed
                      notifications={notifications}
                      onDismiss={handleDismiss}
                      onToggleRead={handleToggleRead}
                      showHint={swipeHintDue}
                    />
                  </div>
                </>
              )}

              {/* ── Sub-panels ── */}
              {panel === "alarm"    && <AlarmPanel    onBack={() => setPanel(null)} />}
              {panel === "manuals"  && <ManualsPanel  onBack={() => setPanel(null)} />}
              {panel === "settings" && <SettingsPanel onBack={() => setPanel(null)} />}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export default NotificationCenter;
