import { useState, useEffect, useRef } from "react";
import {
  useGetNotificationSettings,
  useUpdateNotificationSettings,
  getGetNotificationSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Plus, Trash2, TrendingUp, Target, Smartphone } from "lucide-react";
import ApplePaySlides from "@/components/ApplePaySlides";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  loadSmartAlertPrefs,
  saveSmartAlertPrefs,
  type SmartAlertPrefs,
} from "@/hooks/useSmartNotifications";
import { t, getDayLabels } from "@/lib/i18n";
import { triggerBadgerNotification, hapticSniff, canHaptic } from "@/lib/badger-notify";

type Alert = {
  id: string;
  time: string;
  days: string[];
  enabled: boolean;
};

const DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
function DAYS() {
  const labels = getDayLabels();
  return DAY_KEYS.map((key, i) => ({ key, label: labels[i] }));
}

const ALERTS_KEY = "budger_alerts_v1";

function loadAlerts(): Alert[] {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [{ id: "default", time: "20:00", days: ["mon","tue","wed","thu","fri","sat","sun"], enabled: false }];
}

function saveAlerts(alerts: Alert[]) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

async function ensurePermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function AlertCard({
  alert,
  onUpdate,
  onDelete,
  canDelete,
}: {
  alert: Alert;
  onUpdate: (a: Alert) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  function toggleDay(day: string) {
    const days = alert.days.includes(day)
      ? alert.days.filter(d => d !== day)
      : [...alert.days, day];
    onUpdate({ ...alert, days });
  }

  return (
    <div className={`bg-card border border-border rounded-2xl overflow-hidden transition-opacity ${alert.enabled ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {alert.enabled
            ? <Bell className="w-4 h-4 text-foreground" />
            : <BellOff className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-medium text-foreground">
            {alert.enabled ? t("notif.on") : t("notif.off")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {canDelete && (
            <button
              onClick={onDelete}
              className="w-7 h-7 rounded-xl bg-destructive/10 flex items-center justify-center transition active:opacity-70"
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
          )}
          <Switch
            checked={alert.enabled}
            onCheckedChange={v => onUpdate({ ...alert, enabled: v })}
          />
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-10 flex-shrink-0">{t("notif.time")}</span>
          <Input
            type="time"
            value={alert.time}
            onChange={e => onUpdate({ ...alert, time: e.target.value })}
            className="w-36 h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 flex-shrink-0">{t("notif.days")}</span>
          <div className="flex gap-1.5">
            {DAYS().map(d => {
              const active = alert.days.includes(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDay(d.key)}
                  className={`w-8 h-8 rounded-full text-xs font-semibold transition-colors
                    ${active
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                    }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
        {alert.days.length === 0 && (
          <p className="text-xs text-destructive pl-12">{t("notif.select_day")}</p>
        )}
      </div>
    </div>
  );
}

function SmartAlertRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-4 px-4 bg-card border border-border rounded-2xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetNotificationSettings();

  const update = useUpdateNotificationSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationSettingsQueryKey() });
        toast({ title: t("notif.alerts_saved") });
      },
    },
  });

  const [alerts, setAlerts] = useState<Alert[]>(loadAlerts);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>("default");
  const [smartPrefs, setSmartPrefs] = useState<SmartAlertPrefs>(loadSmartAlertPrefs);
  const [showApplePaySlides, setShowApplePaySlides] = useState(false);
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("budger_haptic_v1") !== "off"; } catch { return true; }
  });
  const [previewing, setPreviewing] = useState(false);
  const previewTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reminderTimers  = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (settings && !localStorage.getItem(ALERTS_KEY)) {
      setAlerts([{
        id: "default",
        time: settings.reminderTime,
        days: settings.days,
        enabled: settings.enabled,
      }]);
    }
  }, [settings]);

  useEffect(() => {
    if ("Notification" in window) setPermissionStatus(Notification.permission);
  }, []);

  // Auto-recheck when user returns from iOS Settings
  useEffect(() => {
    if (permissionStatus !== "denied") return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (!("Notification" in window)) return;
      setPermissionStatus(Notification.permission as NotificationPermission);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [permissionStatus]);

  function updateAlert(updated: Alert) {
    setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
  }

  function deleteAlert(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  function addAlert() {
    setAlerts(prev => [
      ...prev,
      { id: makeId(), time: "09:00", days: ["mon","tue","wed","thu","fri"], enabled: true },
    ]);
  }

  async function handleSmartToggle(key: keyof SmartAlertPrefs, value: boolean) {
    if (value) {
      const granted = await ensurePermission();
      if ("Notification" in window) {
        setPermissionStatus(Notification.permission as NotificationPermission);
      }
      if (!granted) {
        toast({
          title: t("notif.perm_denied"),
          description: t("notif.enable_notif"),
          variant: "destructive",
        });
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
    try { localStorage.setItem("budger_haptic_v1", v ? "on" : "off"); } catch { /* ignore */ }
    if (v) hapticSniff();
  }

  // Clear timers on unmount to avoid state updates / dangling callbacks
  useEffect(() => {
    return () => {
      if (previewTimeout.current) clearTimeout(previewTimeout.current);
      reminderTimers.current.forEach(clearTimeout);
    };
  }, []);

  async function handlePreview() {
    if (previewing) return;
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    setPreviewing(true);
    await triggerBadgerNotification({ haptic: hapticEnabled && canHaptic() });
    previewTimeout.current = setTimeout(() => setPreviewing(false), 2600);
  }

  async function handleSave() {
    const anyEnabled = alerts.some(a => a.enabled);

    if (anyEnabled && "Notification" in window && Notification.permission !== "granted") {
      const granted = await ensurePermission();
      setPermissionStatus(Notification.permission as NotificationPermission);
      if (!granted) {
        toast({ title: t("notif.perm_denied"), description: t("notif.enable_settings"), variant: "destructive" });
        return;
      }
    }

    saveAlerts(alerts);

    const first = alerts[0];
    update.mutate({
      data: {
        enabled: first?.enabled ?? false,
        reminderTime: first?.time ?? "20:00",
        days: first?.days ?? [],
      },
    });

    // Clear any previously-scheduled reminder timers before registering new ones
    reminderTimers.current.forEach(clearTimeout);
    reminderTimers.current = [];

    if ("Notification" in window && Notification.permission === "granted") {
      for (const alert of alerts) {
        if (!alert.enabled || alert.days.length === 0) continue;
        const [h, m] = alert.time.split(":").map(Number);
        const now  = new Date();
        const next = new Date();
        next.setHours(h, m, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        const id = setTimeout(() => {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(t("notif.budger_reminder"), {
              body: t("notif.dont_forget"),
              icon: "/favicon.ico",
            });
            // Fire badger sound + haptic (respecting user haptic preference)
            const hapticOn = localStorage.getItem("budger_haptic_v1") !== "off";
            triggerBadgerNotification({ haptic: hapticOn && canHaptic() });
          }
        }, next.getTime() - now.getTime());
        reminderTimers.current.push(id);
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-5 pb-4 max-w-lg mx-auto space-y-6">

      {showApplePaySlides && (
        <ApplePaySlides modal onClose={() => setShowApplePaySlides(false)} />
      )}

      {permissionStatus === "denied" && (() => {
        const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
        const steps = isStandalone
          ? ["Settings", "Budger", "Notifications", "Allow Notifications"]
          : ["Settings", "Safari", "Notifications", "This website", "Allow"];
        const tip = isStandalone
          ? ""
          : "Add Budger to your Home Screen for easier notification management.";
        return (
          <div className="bg-muted border border-border rounded-2xl px-4 py-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Notifications are blocked</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Open iPhone Settings and follow the path below, then come back — the page will update automatically.
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
              onClick={() => { window.location.href = "app-settings:"; }}
              className="w-full h-11 rounded-xl bg-background border border-border text-foreground text-sm font-semibold active:scale-95 transition"
            >
              Open Settings
            </button>
          </div>
        );
      })()}

      {/* ── Daily reminders ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold">{t("notif.daily_reminders")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("notif.timed_nudges")}</p>
          </div>
          <button
            onClick={addAlert}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-foreground text-background text-sm font-semibold transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> {t("common.add")}
          </button>
        </div>

        <div className="space-y-3">
          {alerts.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onUpdate={updateAlert}
              onDelete={() => deleteAlert(alert.id)}
              canDelete={alerts.length > 1}
            />
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={update.isPending || alerts.some(a => a.enabled && a.days.length === 0)}
          className="mt-3 w-full h-12 rounded-2xl bg-foreground text-background font-semibold text-base transition active:scale-95 disabled:opacity-40"
          data-testid="button-save-notifications"
        >
          {update.isPending ? t("common.saving") : t("notif.save")}
        </button>
      </section>

      {/* ── Smart alerts ── */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold">{t("notif.smart")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("notif.smart_desc")}</p>
        </div>

        <div className="space-y-3">
          <SmartAlertRow
            icon={<TrendingUp className="w-4 h-4" />}
            title={t("notif.budget_thresh")}
            description={t("notif.budget_thresh_desc")}
            checked={smartPrefs.budgetAlerts}
            onChange={v => handleSmartToggle("budgetAlerts", v)}
          />

          <SmartAlertRow
            icon={<Target className="w-4 h-4" />}
            title={t("notif.goal_prog")}
            description={t("notif.goal_prog_desc")}
            checked={smartPrefs.goalAlerts}
            onChange={v => handleSmartToggle("goalAlerts", v)}
          />
        </div>
      </section>

      {/* ── Alert Sound & Haptics ── */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold">{t("notif.sound_section")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("notif.sound_desc")}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Preview row */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              {/* Badger sniff icon — animated nose */}
              <div className="relative w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                <span className="text-xl select-none">🦡</span>
                {previewing && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-foreground animate-ping opacity-80" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{t("notif.badger_sniff")}</p>
                <p className="text-xs text-muted-foreground">{t("notif.sniff_pattern")}</p>
              </div>
            </div>
            <button
              onClick={handlePreview}
              disabled={previewing}
              className={`px-4 py-1.5 rounded-xl text-sm font-semibold border transition active:scale-95 ${
                previewing
                  ? "border-foreground/20 text-muted-foreground"
                  : "border-border text-foreground bg-muted"
              }`}
            >
              {previewing ? "▶︎" : t("notif.preview_btn")}
            </button>
          </div>

          {/* Haptic toggle row */}
          <div className="flex items-start justify-between gap-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-muted-foreground">
                {/* Vibration icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 8v8" /><path d="M6 6v12" />
                  <rect x="8" y="4" width="8" height="16" rx="2" />
                  <path d="M18 6v12" /><path d="M22 8v8" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{t("notif.haptic_label")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {canHaptic() ? t("notif.haptic_desc") : t("notif.haptic_unavailable")}
                </p>
              </div>
            </div>
            <Switch
              checked={hapticEnabled && canHaptic()}
              disabled={!canHaptic()}
              onCheckedChange={toggleHaptic}
            />
          </div>
        </div>
      </section>

      {/* ── Apple Pay automation ── */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold">{t("ap.setup_title")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("ap.configure_desc")}</p>
        </div>

        <button
          onClick={() => setShowApplePaySlides(true)}
          className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-card border border-border transition active:scale-95 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-snug">{t("ap.configure_btn")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t("ap.configure_desc")}</p>
          </div>
          <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </section>

    </div>
  );
}
