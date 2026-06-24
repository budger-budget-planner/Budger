import { useState, useEffect } from "react";
import {
  useGetNotificationSettings,
  useUpdateNotificationSettings,
  getGetNotificationSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Plus, Trash2, TrendingUp, Target } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  loadSmartAlertPrefs,
  saveSmartAlertPrefs,
  type SmartAlertPrefs,
} from "@/hooks/useSmartNotifications";

/* ── Types ── */
type Alert = {
  id: string;
  time: string;
  days: string[];
  enabled: boolean;
};

const DAYS = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
];

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

/* ── Single alert card ── */
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
            {alert.enabled ? "On" : "Off"}
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
          <span className="text-xs text-muted-foreground w-10 flex-shrink-0">Time</span>
          <Input
            type="time"
            value={alert.time}
            onChange={e => onUpdate({ ...alert, time: e.target.value })}
            className="w-36 h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 flex-shrink-0">Days</span>
          <div className="flex gap-1.5">
            {DAYS.map(d => {
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
          <p className="text-xs text-destructive pl-12">Select at least one day.</p>
        )}
      </div>
    </div>
  );
}

/* ── Smart alert toggle row ── */
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

/* ── Page ── */
export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetNotificationSettings();

  const update = useUpdateNotificationSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationSettingsQueryKey() });
        toast({ title: "Alerts saved" });
      },
    },
  });

  const [alerts, setAlerts] = useState<Alert[]>(loadAlerts);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>("default");
  const [smartPrefs, setSmartPrefs] = useState<SmartAlertPrefs>(loadSmartAlertPrefs);

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
      setPermissionStatus(Notification.permission as NotificationPermission);
      if (!granted) {
        toast({
          title: "Permission denied",
          description: "Enable notifications in your browser settings first.",
          variant: "destructive",
        });
        return;
      }
    }
    const next = { ...smartPrefs, [key]: value };
    setSmartPrefs(next);
    saveSmartAlertPrefs(next);
    toast({ title: value ? "Alert enabled" : "Alert disabled" });
  }

  async function handleSave() {
    const anyEnabled = alerts.some(a => a.enabled);

    if (anyEnabled && "Notification" in window && Notification.permission !== "granted") {
      const granted = await ensurePermission();
      setPermissionStatus(Notification.permission as NotificationPermission);
      if (!granted) {
        toast({ title: "Permission denied", description: "Enable notifications in your browser settings.", variant: "destructive" });
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

    const currentPerm = Notification.permission;
    if (currentPerm === "granted") {
      for (const alert of alerts) {
        if (!alert.enabled || alert.days.length === 0) continue;
        const [h, m] = alert.time.split(":").map(Number);
        const now  = new Date();
        const next = new Date();
        next.setHours(h, m, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        setTimeout(() => {
          if (Notification.permission === "granted") {
            new Notification("Budger Reminder", {
              body: "Don't forget to log today's spending!",
              icon: "/favicon.ico",
            });
          }
        }, next.getTime() - now.getTime());
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

      {/* Permission banner */}
      {permissionStatus === "denied" && (
        <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
          Browser notifications are blocked. Enable them in your device / browser settings to use any alerts.
        </div>
      )}

      {/* ── Section 1: Daily reminders ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold">Daily Reminders</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Timed nudges to log your spending</p>
          </div>
          <button
            onClick={addAlert}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-foreground text-background text-sm font-semibold transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> Add
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
          {update.isPending ? "Saving…" : "Save Reminders"}
        </button>
      </section>

      {/* ── Section 2: Smart alerts ── */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold">Smart Alerts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Automatic notifications based on your spending & goals</p>
        </div>

        <div className="space-y-3">
          <SmartAlertRow
            icon={<TrendingUp className="w-4 h-4" />}
            title="Budget Threshold Alerts"
            description="Get a reminder at 75% and a warning at 90% of any category or monthly budget."
            checked={smartPrefs.budgetAlerts}
            onChange={v => handleSmartToggle("budgetAlerts", v)}
          />

          <SmartAlertRow
            icon={<Target className="w-4 h-4" />}
            title="Goal Progress Alerts"
            description="A week before month-end, get an update on how your savings goals are progressing."
            checked={smartPrefs.goalAlerts}
            onChange={v => handleSmartToggle("goalAlerts", v)}
          />
        </div>

        {/* Info cards */}
        <div className="mt-3 space-y-2">
          <div className="rounded-xl bg-card border border-border px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Budget alerts fire when:</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">📊</span>
                <span className="text-xs text-muted-foreground">Spending hits 75% of a budget — friendly reminder</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">⚠️</span>
                <span className="text-xs text-muted-foreground">Spending hits 90% of a budget — urgent warning</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-card border border-border px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">Goal alerts fire when:</p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs">🎯</span>
                <span className="text-xs text-muted-foreground">7 or fewer days left in the month</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">📅</span>
                <span className="text-xs text-muted-foreground">Once per month, showing your progress toward each goal</span>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
