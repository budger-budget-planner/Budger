import { useState, useEffect } from "react";
import {
  useGetNotificationSettings,
  useUpdateNotificationSettings,
  getGetNotificationSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings, isLoading } = useGetNotificationSettings();
  const update = useUpdateNotificationSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNotificationSettingsQueryKey() });
        toast({ title: "Notification settings saved" });
      },
    },
  });

  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState("20:00");
  const [days, setDays] = useState<string[]>(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setTime(settings.reminderTime);
      setDays(settings.days);
    }
  }, [settings]);

  useEffect(() => {
    if ("Notification" in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  async function handleToggleEnabled(val: boolean) {
    if (val && "Notification" in window && Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      setPermissionStatus(perm);
      if (perm !== "granted") {
        toast({ title: "Permission denied", description: "Enable notifications in your browser settings.", variant: "destructive" });
        return;
      }
    }
    setEnabled(val);
  }

  function toggleDay(day: string) {
    setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  function handleSave() {
    update.mutate({ data: { enabled, reminderTime: time, days } });
    if (enabled && permissionStatus === "granted") {
      scheduleNextReminder();
    }
  }

  function scheduleNextReminder() {
    const [h, m] = time.split(":").map(Number);
    const now = new Date();
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next.getTime() - now.getTime();
    setTimeout(() => {
      if (Notification.permission === "granted") {
        new Notification("Budger Reminder", {
          body: "Don't forget to log today's spending!",
          icon: "/favicon.ico",
        });
      }
    }, ms);
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Set daily reminders to log your spending</p>
      </div>

      <div className="space-y-6">
        {/* Enable toggle */}
        <div className="bg-card border border-card-border rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {enabled ? <Bell className="w-5 h-5 text-primary" /> : <BellOff className="w-5 h-5 text-muted-foreground" />}
              <div>
                <p className="font-medium text-sm">Daily Reminders</p>
                <p className="text-xs text-muted-foreground">Remind me to categorize today's spending</p>
              </div>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggleEnabled}
              data-testid="switch-notifications"
            />
          </div>

          {permissionStatus === "denied" && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
              Browser notifications are blocked. Enable them in your browser settings to use reminders.
            </div>
          )}
          {permissionStatus === "default" && !enabled && (
            <p className="mt-3 text-xs text-muted-foreground">Enabling reminders will request browser notification permission.</p>
          )}
          {enabled && permissionStatus === "granted" && (
            <p className="mt-3 text-xs text-muted-foreground">Reminders fire in your browser tab — keep it open or pinned for best results.</p>
          )}
        </div>

        {/* Time picker */}
        <div className={`bg-card border border-card-border rounded-xl p-5 transition-opacity ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-primary" />
            <p className="font-medium text-sm">Reminder Time</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Time of day</Label>
            <Input
              data-testid="input-reminder-time"
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">You'll be notified at this time on selected days.</p>
          </div>
        </div>

        {/* Days */}
        <div className={`bg-card border border-card-border rounded-xl p-5 transition-opacity ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
          <p className="font-medium text-sm mb-4">Reminder Days</p>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map(d => (
              <button
                key={d.key}
                type="button"
                data-testid={`button-day-${d.key}`}
                onClick={() => toggleDay(d.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  days.includes(d.key)
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {days.length === 0 && <p className="text-xs text-destructive mt-2">Select at least one day.</p>}
        </div>

        <Button
          onClick={handleSave}
          disabled={update.isPending || (enabled && days.length === 0)}
          className="w-full"
          data-testid="button-save-notifications"
        >
          {update.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
