import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Home, LayoutDashboard, Tag, Users, LogOut, X, DollarSign, Globe, Target } from "lucide-react";
import { useLogout, useGetMe, useListIncomingInvites, useUpdateMe } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import BadgerLogo from "@/components/BadgerLogo";
import NotificationCenter from "@/components/NotificationCenter";
import { loadPrefs, savePrefs, CURRENCIES, LANGUAGES, setActiveUserId } from "@/lib/prefs";
import { fetchRates, getConversionRate } from "@/lib/rates";
import { t } from "@/lib/i18n";
import { addNCNotification, setNCUserId } from "@/lib/nc-store";

function navItems() {
  return [
    { href: "/",          label: t("nav.home"),       icon: Home            },
    { href: "/dashboard", label: t("nav.dashboard"),  icon: LayoutDashboard },
    { href: "/categories",label: t("nav.categories"), icon: Tag             },
    { href: "/goals",     label: t("nav.goals"),      icon: Target          },
    { href: "/household", label: t("nav.household"),  icon: Users           },
  ];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location]     = useLocation();
  const queryClient    = useQueryClient();
  const { data: user } = useGetMe();
  const { data: incomingInvites } = useListIncomingInvites();
  const hasInvitations = (incomingInvites?.length ?? 0) > 0;
  const hasHouseholdAlert = !!(user as any)?.pendingHouseholdAlert;

  const { data: proposalsData } = useQuery<Array<{ id: number; status: string; createdAt: string }>>({
    queryKey: ["goal-proposals-badge"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/proposals`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { data: editProposalsBadge } = useQuery<Array<{ id: number; createdAt: string }>>({
    queryKey: ["goal-edit-proposals-badge"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/edit-proposals`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const { data: goalActivityBadge } = useQuery<Array<{ id: number; type: string; goalName?: string; createdAt: string }>>({
    queryKey: ["goal-activity-badge"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/activity`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30_000,
  });

  // Scope NC store to this user as soon as we know who they are
  useEffect(() => {
    if (user?.id) setNCUserId(user.id);
  }, [user?.id]);

  // localStorage-based last-seen timestamp per user — badge clears on Goals tab click
  const [goalsSeenAt, setGoalsSeenAt] = useState<number>(0);
  useEffect(() => {
    if (user?.id) {
      try {
        const stored = parseInt(localStorage.getItem(`goals_seen_at_${user.id}`) ?? "0") || 0;
        setGoalsSeenAt(stored);
      } catch { /* ignore */ }
    }
  }, [user?.id]);

  function markGoalsSeen() {
    const now = Date.now();
    setGoalsSeenAt(now);
    try { localStorage.setItem(`goals_seen_at_${(user as any)?.id ?? "x"}`, String(now)); } catch { /* ignore */ }
  }

  // Badge-worthy activity types — goal_changed is informational only, no badge
  const BADGE_TYPES = ["goal_completed_total", "goal_completed_monthly", "share_approved", "share_declined", "edit_approved", "edit_declined", "goal_created"];

  const hasNewBadgeActivity = (goalActivityBadge ?? []).some(
    (a) => BADGE_TYPES.includes(a.type) && new Date(a.createdAt).getTime() > goalsSeenAt,
  );
  const hasNewProposals = (proposalsData ?? []).some(
    (p) => p.status === "pending" && new Date(p.createdAt).getTime() > goalsSeenAt,
  );
  const hasNewEditProposals = (editProposalsBadge ?? []).some(
    (p) => new Date(p.createdAt).getTime() > goalsSeenAt,
  );
  const showGoalsBadge = hasNewBadgeActivity || hasNewProposals || hasNewEditProposals;

  // ── Detect goal_completed_total/monthly → log to Notification Center ─────
  const processedNcIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!goalActivityBadge || !user?.id) return;
    const NC_TYPES = ["goal_completed_total", "goal_completed_monthly"];

    // Use the highest createdAt we have previously seen as the watermark —
    // avoids skipping late-arriving backend events that createdAt < Date.now().
    let watermark = 0;
    try { watermark = parseInt(localStorage.getItem(`nc_goal_watermark_${user.id}`) ?? "0") || 0; } catch { /**/ }

    let maxTs = watermark;

    for (const item of goalActivityBadge) {
      if (!NC_TYPES.includes(item.type)) continue;
      if (processedNcIds.current.has(item.id)) continue;

      const itemTs = new Date(item.createdAt).getTime();
      if (itemTs <= watermark) {
        // Already processed in a prior session — mark as seen so we don't reprocess
        processedNcIds.current.add(item.id);
        continue;
      }

      processedNcIds.current.add(item.id);
      maxTs = Math.max(maxTs, itemTs);

      const gName = item.goalName ?? "goal";

      if (item.type === "goal_completed_total") {
        addNCNotification({
          type: "goal_completed_total",
          titleEn: "Goal Completed",
          titlePl: "Cel osiągnięty",
          bodyEn: `${gName} has reached 100% of its total target. Well done!`,
          bodyPl: `${gName} osiągnął 100% całkowitego celu. Brawo!`,
        });
      } else if (item.type === "goal_completed_monthly") {
        addNCNotification({
          type: "goal_completed_monthly",
          titleEn: "Monthly Target Reached",
          titlePl: "Cel miesięczny osiągnięty",
          bodyEn: `${gName} hit its monthly savings target this month.`,
          bodyPl: `${gName} osiągnął miesięczny cel oszczędnościowy w tym miesiącu.`,
        });
      }
    }

    // Persist the highest createdAt we've seen so far as the new watermark
    if (maxTs > watermark) {
      try { localStorage.setItem(`nc_goal_watermark_${user.id}`, String(maxTs)); } catch { /**/ }
    }
  }, [goalActivityBadge, user?.id]);

  const { data: incomingSplits } = useQuery<Array<{ id: number }>>({
    queryKey: ["splits-incoming-badge"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/splits/incoming`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30_000,
  });
  const { data: declinedSplits } = useQuery<Array<{ id: number }>>({
    queryKey: ["splits-declined-badge"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/splits/issued`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30_000,
  });
  const hasPendingSplits = (incomingSplits?.length ?? 0) > 0 || (declinedSplits?.length ?? 0) > 0;
  const [showProfile, setShowProfile] = useState(false);
  const [prefs, setPrefsState]        = useState(() => loadPrefs());
  const [converting, setConverting]   = useState(false);
  const [rates, setRates]             = useState<Record<string, number> | null>(null);

  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        setActiveUserId(null);
        queryClient.clear();
        window.location.href = import.meta.env.BASE_URL + "login";
      },
    },
  });

  function isActive(href: string) {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  }

  async function changeCurrency(code: string) {
    if (code === prefs.currency || converting) return;
    setConverting(true);
    try {
      const rates = await fetchRates();
      const rate  = getConversionRate(prefs.currency, code, rates);

      await fetch(`${import.meta.env.BASE_URL}api/convert-currency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ from: prefs.currency, to: code, rate }),
      });

      const newBudget = prefs.totalBudget != null
        ? Math.round(prefs.totalBudget * rate * 100) / 100
        : null;

      const next = { ...prefs, currency: code, totalBudget: newBudget };
      savePrefs(next);
      setPrefsState(next);
    } catch {
    } finally {
      setConverting(false);
      window.location.reload();
    }
  }

  const updateMe = useUpdateMe();

  function changeLanguage(code: string) {
    const next = { ...prefs, language: code };
    savePrefs(next);
    setPrefsState(next);
    updateMe.mutate({ data: { language: code } });
    window.location.reload();
  }

  function toggleStaySignedIn() {
    const next = { ...prefs, staySignedIn: !prefs.staySignedIn };
    savePrefs(next);
    setPrefsState(next);
  }

  useEffect(() => {
    if (showProfile && !rates) {
      fetchRates().then(setRates);
    }
  }, [showProfile]);

  const nav = navItems();

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">

      {/* ── Top header ── */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-5 h-14
                         bg-background/90 backdrop-blur border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <span data-splash-logo-home>
            <BadgerLogo size={28} />
          </span>
          <span className="text-base font-bold tracking-tight text-foreground">Budger</span>
        </Link>

        {/* Right side: Notification Center bell + profile avatar */}
        <div className="flex items-center gap-2">
          <NotificationCenter userId={(user as any)?.id ?? "guest"} />
          <button
            onClick={() => setShowProfile(true)}
            className="w-8 h-8 rounded-full bg-muted border border-border
                       flex items-center justify-center flex-shrink-0 transition active:scale-95"
          >
            <span className="text-xs font-bold text-foreground">
              {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
          </button>
        </div>
      </header>

      {/* ── Profile bottom sheet ── */}
      {showProfile && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowProfile(false)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border
                          rounded-t-3xl px-5 pt-5 pb-10 space-y-4 max-h-[85vh] overflow-y-auto">

            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="font-semibold text-foreground">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
              <button onClick={() => setShowProfile(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("profile.preferences")}
              </p>

              {/* Currency */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("profile.currency")}
                    {converting && <span className="ml-2 normal-case">{t("profile.converting")}</span>}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CURRENCIES.map(c => {
                    const isSelected = c.code === prefs.currency;
                    const rate = rates ? getConversionRate(prefs.currency, c.code, rates) : null;
                    const rateStr = rate != null
                      ? rate < 0.01 ? rate.toFixed(4)
                      : rate < 0.1  ? rate.toFixed(3)
                      : rate.toFixed(2)
                      : null;
                    return (
                      <button
                        key={c.code}
                        onClick={() => changeCurrency(c.code)}
                        disabled={converting || isSelected}
                        className={`flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition active:scale-95 disabled:cursor-default ${
                          isSelected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-muted/40 text-foreground hover:bg-muted"
                        } ${converting && !isSelected ? "opacity-40" : ""}`}
                      >
                        <span className="text-sm font-bold">{c.symbol} {c.code}</span>
                        {rateStr && !isSelected && (
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            1 {prefs.currency} = {rateStr} {c.code}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("profile.language")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {LANGUAGES.map(l => {
                    const isSelected = l.code === prefs.language;
                    return (
                      <button
                        key={l.code}
                        onClick={() => changeLanguage(l.code)}
                        disabled={isSelected}
                        className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition active:scale-95 disabled:cursor-default ${
                          isSelected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-muted/40 text-foreground hover:bg-muted"
                        }`}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Keep me signed in */}
              <button
                onClick={toggleStaySignedIn}
                className="flex items-center justify-between w-full py-1"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{t("profile.stay_signed_in")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("profile.stay_signed_in_desc")}</p>
                </div>
                <div className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ml-4 ${
                  prefs.staySignedIn ? "bg-foreground" : "bg-border"
                }`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-background shadow transition-all ${
                    prefs.staySignedIn ? "left-[calc(100%-1.375rem)]" : "left-0.5"
                  }`} />
                </div>
              </button>
            </div>

            <div className="h-px bg-border" />

            <button
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="flex items-center gap-3 w-full px-1 py-2 text-destructive
                         transition active:opacity-70 disabled:opacity-40"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium">
                {logout.isPending ? t("profile.signing_out") : t("profile.sign_out")}
              </span>
            </button>
          </div>
        </>
      )}

      {/* ── Page content ── */}
      <main className="flex-1 overflow-auto pb-24">
        {children}
      </main>

      {/* ── Bottom navigation — 5 tabs evenly spaced ── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 h-16
                      bg-card/95 backdrop-blur border-t border-border
                      flex items-stretch">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          const isHousehold = href === "/household";
          const isGoals = href === "/goals";
          const showBadge = (isHousehold && (hasInvitations || hasHouseholdAlert || hasPendingSplits)) || (isGoals && showGoalsBadge);
          return (
            <Link
              key={href}
              href={href}
              onClick={isGoals ? markGoalsSeen : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors
                          ${active ? "text-foreground" : showBadge ? "text-pink-400" : "text-muted-foreground"}`}
              data-testid={`nav-${href.replace("/", "") || "home"}`}
            >
              <div className={`relative p-1.5 rounded-xl transition-colors ${active ? "bg-muted" : ""}`}>
                <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.6} />
                {showBadge && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-pink-500 border border-black" />
                )}
              </div>
              {active && (
                <span className="text-[10px] font-medium leading-none">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
