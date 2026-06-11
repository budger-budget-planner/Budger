import { useState, useEffect } from "react";
import {
  useGetNotificationSettings,
  useUpdateNotificationSettings,
  getGetNotificationSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

/* ── Types ── */
type Alert = {
  id: string;
  time: string;
  days: string[];
  enabled: boolean;
};

const DAYS = [
  { key: "mon", label: "M"  },
  { key: "tue", label: "T"  },
  { key: "wed", label: "W"  },
  { key: "thu", label: "T"  },
  { key: "fri", label: "F"  },
  { key: "sat", label: "S"  },
  { key: "sun", label: "S"  },
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
      {/* Header row */}
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

      {/* Time + days */}
      <div className="px-4 py-3 space-y-3">
        {/* Time picker */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-10 flex-shrink-0">Time</span>
          <Input
            type="time"
            value={alert.time}
            onChange={e => onUpdate({ ...alert, time: e.target.value })}
            className="w-36 h-9"
          />
        </div>

        {/* Day pills */}
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
                      ? "bg-foreground text-background"   /* white bg → black text */
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

  // Hydrate from DB on first load
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

  async function handleSave() {
    const anyEnabled = alerts.some(a => a.enabled);

    // Request permission if needed
    if (anyEnabled && "Notification" in window && Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      setPermissionStatus(perm);
      if (perm !== "granted") {
        toast({ title: "Permission denied", description: "Enable notifications in your browser settings.", variant: "destructive" });
        return;
      }
    }

    // Persist to localStorage
    saveAlerts(alerts);

    // Sync first alert to DB for backward compat
    const first = alerts[0];
    update.mutate({
      data: {
        enabled: first?.enabled ?? false,
        reminderTime: first?.time ?? "20:00",
        days: first?.days ?? [],
      },
    });

    // Schedule browser notifications for all enabled alerts
    if (permissionStatus === "granted" || (anyEnabled && Notification.permission === "granted")) {
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
    <div className="px-4 pt-5 pb-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold">Alerts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Daily reminders to log your spending</p>
        </div>
        <button
          onClick={addAlert}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-foreground text-background
                     text-sm font-semibold transition active:scale-95"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {permissionStatus === "denied" && (
        <div className="mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-xs">
          Browser notifications are blocked. Enable them in your browser settings.
        </div>
      )}

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
        className="mt-5 w-full h-13 rounded-2xl bg-foreground text-background font-semibold text-base
                   transition active:scale-95 disabled:opacity-40"
        data-testid="button-save-notifications"
      >
        {update.isPending ? "Saving…" : "Save Alerts"}
      </button>
    </div>
  );
}
