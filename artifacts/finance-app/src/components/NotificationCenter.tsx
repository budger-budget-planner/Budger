import { useState, useEffect, useRef } from "react";
import {
  Bell, BellOff, X, ChevronLeft, AlarmClock, BookOpen, Settings,
  Plus, Trash2, TrendingUp, Target, CheckCircle, AlertTriangle,
  Smartphone, ExternalLink,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetNotificationSettings,
  useUpdateNotificationSettings,
  getGetNotificationSettingsQueryKey,
} from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import ApplePaySlides from "@/components/ApplePaySlides";
import ShareSheetSlides from "@/components/ShareSheetSlides";
import {
  loadSmartAlertPrefs, saveSmartAlertPrefs, type SmartAlertPrefs,
} from "@/hooks/useSmartNotifications";
import { t, getDayLabels } from "@/lib/i18n";
import { triggerBadgerNotification, hapticSniff, canHaptic } from "@/lib/badger-notify";
import { addNCNotification, loadNCNotifications, getNCSeenAt, setNCSeenAt, type NCNotification, type NCNotifType } from "@/lib/nc-store";
import { loadPrefs } from "@/lib/prefs";

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
    case "goal_completed_total":   return <CheckCircle className="w-4 h-4" />;
    case "goal_completed_monthly": return <CheckCircle className="w-4 h-4" />;
    default: return <Bell className="w-4 h-4" />;
  }
}

function ncIconBg(type: NCNotifType) {
  switch (type) {
    case "budget_90_cat":
    case "budget_90_total":  return "bg-destructive/15 text-destructive";
    case "budget_75_cat":
    case "budget_75_total":  return "bg-yellow-500/15 text-yellow-400";
    case "goal_completed_total":
    case "goal_completed_monthly": return "bg-emerald-500/15 text-emerald-400";
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
        const id = setTimeout(() => {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(t("notif.budger_reminder"), { body: t("notif.dont_forget"), icon: "/favicon.ico" });
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

  const WEBHOOK_GUIDE = "https://budger.app/docs/ios-shortcut";

  function copyUrl() {
    navigator.clipboard?.writeText(WEBHOOK_GUIDE).catch(() => {});
  }

  if (showApplePay) return <ApplePaySlides modal onClose={() => setShowApplePay(false)} />;
  if (showShareSheet) return <ShareSheetSlides modal onClose={() => setShowShareSheet(false)} />;

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
            <p className="text-sm font-semibold leading-snug">{t("ap.configure_btn")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t("ap.configure_desc")}</p>
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

        {/* URL quick-access */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">{t("nc.setup_guide")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("nc.setup_guide_desc")}</p>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <button onClick={() => window.open(WEBHOOK_GUIDE, "_blank")}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-muted border border-border text-sm font-semibold transition active:scale-95">
              <ExternalLink className="w-4 h-4" />
              {t("nc.open_url")}
            </button>
            <button onClick={copyUrl}
              className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold transition active:scale-95">
              {t("nc.copy_url")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-panel: Settings ──────────────────────────────────────────────────────
function SettingsPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [smartPrefs, setSmartPrefs] = useState<SmartAlertPrefs>(loadSmartAlertPrefs);
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("budger_haptic_v1") !== "off"; } catch { return true; }
  });
  const [previewing, setPreviewing] = useState(false);
  const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  async function handlePreview() {
    if (previewing) return;
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    setPreviewing(true);
    await triggerBadgerNotification({ haptic: hapticEnabled && canHaptic() });
    previewTimeout.current = setTimeout(() => setPreviewing(false), 2600);
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
        {/* Sound & Haptics */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{t("notif.sound_section")}</p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
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
          </div>
        </section>

        {/* Smart alerts */}
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
      </div>
    </div>
  );
}

// ─── Notification Feed ────────────────────────────────────────────────────────
function NotifFeed({ notifications, seenAt }: { notifications: NCNotification[]; seenAt: number }) {
  const lang = loadPrefs().language as "en" | "pl";

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Bell className="w-8 h-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{t("nc.no_notifications")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map(n => {
        const isUnread = n.timestamp > seenAt;
        const title = lang === "pl" ? n.titlePl : n.titleEn;
        const body = lang === "pl" ? n.bodyPl : n.bodyEn;
        return (
          <div key={n.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-2xl border transition-colors ${isUnread ? "bg-card border-border" : "bg-card/50 border-border/50"}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${ncIconBg(n.type)}`}>
              {ncIcon(n.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-sm font-semibold leading-snug ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>{title}</p>
                {isUnread && <span className="w-2 h-2 rounded-full bg-pink-500 flex-shrink-0 mt-1.5" />}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">{relTime(n.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Notification Center ─────────────────────────────────────────────────
type Panel = "alarm" | "manuals" | "settings" | null;

export function NotificationCenter({ userId }: { userId: number | string }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [notifications, setNotifications] = useState<NCNotification[]>([]);
  const [seenAt, setSeenAt] = useState<number>(0);

  // Load seen-at on mount and when userId changes
  useEffect(() => {
    if (!userId) return;
    setSeenAt(getNCSeenAt(userId));
    setNotifications(loadNCNotifications());
  }, [userId]);

  // Refresh notifications list when drawer opens
  useEffect(() => {
    if (open) setNotifications(loadNCNotifications());
  }, [open]);

  // Refresh every 30s to pick up new NC items fired by background hooks
  useEffect(() => {
    const id = setInterval(() => setNotifications(loadNCNotifications()), 30_000);
    return () => clearInterval(id);
  }, []);

  function handleOpen() {
    setNotifications(loadNCNotifications());
    setOpen(true);
  }

  function handleClose() {
    if (userId) {
      const now = setNCSeenAt(userId);
      setSeenAt(now);
    }
    setOpen(false);
    setPanel(null);
  }

  const unreadCount = notifications.filter(n => n.timestamp > seenAt).length;
  const hasBadge = unreadCount > 0;

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
        className="relative w-8 h-8 rounded-full bg-muted border border-border
                   flex items-center justify-center flex-shrink-0 transition active:scale-95"
        aria-label={t("nc.title")}
      >
        <Bell className={`w-4 h-4 ${hasBadge ? "text-pink-400" : "text-muted-foreground"}`} strokeWidth={hasBadge ? 2.2 : 1.6} />
        {hasBadge && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-pink-500 border border-background" />
        )}
      </button>

      {/* ── Drawer ── */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Sheet */}
          <div className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border
                          rounded-t-3xl flex flex-col"
               style={{ maxHeight: "90vh" }}>

            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header row */}
            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              {panel ? (
                <div /> /* back button is inside sub-panel */
              ) : (
                <h2 className="text-base font-bold">{t("nc.title")}</h2>
              )}
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

                  {/* Notification feed */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {unreadCount > 0 && (
                      <p className="text-xs text-muted-foreground mb-3">
                        {unreadCount} {unreadCount === 1 ? t("nc.unread_one") : t("nc.unread_many")}
                      </p>
                    )}
                    <NotifFeed notifications={notifications} seenAt={seenAt} />
                  </div>
                </>
              )}

              {/* ── Sub-panels ── */}
              {panel === "alarm"    && <AlarmPanel    onBack={() => setPanel(null)} />}
              {panel === "manuals"  && <ManualsPanel  onBack={() => setPanel(null)} />}
              {panel === "settings" && <SettingsPanel onBack={() => setPanel(null)} />}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default NotificationCenter;
