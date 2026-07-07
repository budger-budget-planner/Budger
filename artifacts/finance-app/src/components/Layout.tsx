import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Home, LayoutDashboard, Tag, Users, LogOut, X, DollarSign, Globe, Target, RefreshCw } from "lucide-react";
import { useLogout, useGetMe, useListIncomingInvites, useUpdateMe } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import BadgerLogo, { type BadgerMode } from "@/components/BadgerLogo";
import NotificationCenter from "@/components/NotificationCenter";
import { loadPrefs, savePrefs, CURRENCIES, LANGUAGES, setActiveUserId, fmtDateTime } from "@/lib/prefs";
import { useSplashReset, useWinkSplash, useAppRefresh } from "@/lib/appReady";
import { fetchRates, forceFetchRates, getConversionRate, getLastRatesUpdate } from "@/lib/rates";
import { t, setLang } from "@/lib/i18n";
import { addNCNotification, setNCUserId } from "@/lib/nc-store";
import { useToast } from "@/hooks/use-toast";
import OfflineBanner from "@/components/OfflineBanner";
import { useQueueReplay } from "@/hooks/useQueueReplay";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";


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
  const [location, navigate] = useLocation();
  const mainRef        = useRef<HTMLDivElement>(null);
  const [waveIntensity, setWaveIntensity] = useState(0);
  const [larderReached, setLarderReached] = useState(false);

  // Drain queued offline mutations whenever connectivity returns
  useQueueReplay();

  // ── Badger sleep state machine ──────────────────────────────────────────────
  // Goes offline → "falling-asleep" (1.4 s transition) → "sleeping" (looping).
  // Back online  → "waking-up"     (1.0 s transition) → "awake".
  // Initial state is derived from navigator.onLine so app-load-while-offline
  // starts the badger already asleep with no spurious waking-up animation.
  const isOnline = useOnlineStatus();
  const [badgerMode, setBadgerMode] = useState<BadgerMode>(() =>
    navigator.onLine ? "awake" : "sleeping",
  );
  const badgerTimerRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevOnlineRef   = useRef(navigator.onLine);

  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (wasOnline === isOnline) return; // no actual change, skip

    clearTimeout(badgerTimerRef.current);
    if (!isOnline) {
      setBadgerMode("falling-asleep");
      badgerTimerRef.current = setTimeout(() => setBadgerMode("sleeping"), 1_400);
    } else {
      setBadgerMode("waking-up");
      badgerTimerRef.current = setTimeout(() => setBadgerMode("awake"), 1_000);
    }
    return () => clearTimeout(badgerTimerRef.current);
  }, [isOnline]);
  // ────────────────────────────────────────────────────────────────────────────

  // Scroll to top on every tab/route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  // Reset wave state when switching tabs
  useEffect(() => {
    setWaveIntensity(0);
    setLarderReached(false);
  }, [location]);

  // Intensify wave as user scrolls down within the page
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setWaveIntensity(max > 0 ? el.scrollTop / max : 0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Listen for Larder / GL card becoming visible — wave fades to card borders
  useEffect(() => {
    const handler = (e: Event) => setLarderReached((e as CustomEvent<{ visible: boolean }>).detail.visible);
    document.addEventListener('larder-reached', handler);
    return () => document.removeEventListener('larder-reached', handler);
  }, []);

  // Apply/remove animation kill-switch from persisted pref (NotificationCenter applies immediately on change)
  useEffect(() => {
    document.documentElement.classList.toggle('no-animations', prefs.disableAnimations ?? false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    refetchInterval: 5_000,
  });

  const { data: editProposalsBadge } = useQuery<Array<{ id: number; createdAt: string }>>({
    queryKey: ["goal-edit-proposals-badge"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/edit-proposals`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 5_000,
  });

  const { data: goalActivityBadge } = useQuery<Array<{ id: number; type: string; goalName?: string; actorName?: string; createdAt: string }>>({
    // Share the same cache entry as Goals.tsx so only one network request is made
    queryKey: ["goal-activity"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/goals/activity`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 5_000,
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

  // Goals tab badge only lights up when the household head has pending approvals to action.
  const hasNewProposals = (proposalsData ?? []).some(
    (p) => p.status === "pending" && new Date(p.createdAt).getTime() > goalsSeenAt,
  );
  const hasNewEditProposals = (editProposalsBadge ?? []).some(
    (p) => new Date(p.createdAt).getTime() > goalsSeenAt,
  );
  const showGoalsBadge = hasNewProposals || hasNewEditProposals;

  // ── Detect activity feed events → log to Notification Center ────────────
  // processedNcIds is a session-only fast-path to skip API calls for items
  // already handled this mount. The server-side dedup_key unique index is the
  // durable guarantee — it silently ignores duplicate inserts across sessions,
  // devices, or cleared localStorage.
  const processedNcIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!goalActivityBadge || !user?.id) return;
    const NC_TYPES = [
      "goal_completed_total", "goal_completed_monthly",
      "share_approved", "share_declined",
      "edit_approved", "edit_declined",
      "goal_created", "goal_changed",
      "goal_realized",
    ];

    for (const item of goalActivityBadge) {
      if (!NC_TYPES.includes(item.type)) continue;
      if (processedNcIds.current.has(item.id)) continue;
      processedNcIds.current.add(item.id);

      const gName = item.goalName ?? "goal";
      const actor = item.actorName ?? "";
      // Each goal_activity row gets a stable dedup key — the server rejects
      // any second insert for the same (user, key) pair with ON CONFLICT DO NOTHING.
      const dedupKey = `goal_activity_${item.id}`;

      if (item.type === "goal_completed_total") {
        addNCNotification({
          type: "goal_completed_total",
          titleEn: "Goal Completed",
          titlePl: "Cel osiągnięty",
          bodyEn: `${gName} has reached 100% of its total target. Well done!`,
          bodyPl: `${gName} osiągnął 100% całkowitego celu. Brawo!`,
          dedupKey,
        });
      } else if (item.type === "goal_completed_monthly") {
        addNCNotification({
          type: "goal_completed_monthly",
          titleEn: "Monthly Target Reached",
          titlePl: "Cel miesięczny osiągnięty",
          bodyEn: `${gName} hit its monthly savings target this month.`,
          bodyPl: `${gName} osiągnął miesięczny cel oszczędnościowy w tym miesiącu.`,
          dedupKey,
        });
      } else if (item.type === "share_approved") {
        addNCNotification({
          type: "share_approved",
          titleEn: "Goal Proposal Approved",
          titlePl: "Propozycja celu zatwierdzona",
          bodyEn: `Your proposed goal "${gName}" was approved and added to the household!`,
          bodyPl: `Twój proponowany cel „${gName}" został zaakceptowany i dodany do gospodarstwa!`,
          dedupKey,
        });
      } else if (item.type === "share_declined") {
        addNCNotification({
          type: "share_declined",
          titleEn: "Goal Proposal Declined",
          titlePl: "Propozycja celu odrzucona",
          bodyEn: `Your proposal for "${gName}" was declined.`,
          bodyPl: `Twoja propozycja dla „${gName}" została odrzucona.`,
          dedupKey,
        });
      } else if (item.type === "edit_approved") {
        addNCNotification({
          type: "edit_approved",
          titleEn: "Edit Proposal Approved",
          titlePl: "Propozycja edycji zatwierdzona",
          bodyEn: `Your edits to "${gName}" were approved!`,
          bodyPl: `Twoje zmiany w „${gName}" zostały zaakceptowane!`,
          dedupKey,
        });
      } else if (item.type === "edit_declined") {
        addNCNotification({
          type: "edit_declined",
          titleEn: "Edit Proposal Declined",
          titlePl: "Propozycja edycji odrzucona",
          bodyEn: `Your edits to "${gName}" were declined.`,
          bodyPl: `Twoje zmiany w „${gName}" zostały odrzucone.`,
          dedupKey,
        });
      } else if (item.type === "goal_created") {
        addNCNotification({
          type: "goal_created",
          titleEn: "New Household Goal",
          titlePl: "Nowy cel gospodarstwa",
          bodyEn: `A new goal "${gName}" has been added to the household.`,
          bodyPl: `Nowy cel „${gName}" został dodany do gospodarstwa.`,
          dedupKey,
        });
      } else if (item.type === "goal_changed") {
        addNCNotification({
          type: "goal_changed",
          titleEn: "Goal Updated",
          titlePl: "Cel zaktualizowany",
          bodyEn: actor ? `"${gName}" was updated by ${actor}.` : `"${gName}" was updated.`,
          bodyPl: actor ? `„${gName}" został zaktualizowany przez ${actor}.` : `„${gName}" został zaktualizowany.`,
          dedupKey,
        });
      } else if (item.type === "goal_realized") {
        addNCNotification({
          type: "goal_realized",
          titleEn: "Goal Realized",
          titlePl: "Cel zrealizowany",
          bodyEn: `${gName} is fully funded! It will move to Past Goals within 24 hours.`,
          bodyPl: `${gName} jest w pełni sfinansowany! Zostanie przeniesiony do Poprzednich celów w ciągu 24 godzin.`,
          dedupKey,
        });
      }
    }
  }, [goalActivityBadge, user?.id]);

  const { data: categoryProposals } = useQuery<Array<{ id: number }>>({
    queryKey: ["category-share-proposals"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/category-share-proposals`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 5_000,
  });
  const hasPendingCategoryProposals = (categoryProposals?.length ?? 0) > 0;

  const { data: incomingSplits } = useQuery<Array<{ id: number }>>({
    queryKey: ["splits-incoming-badge"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/splits/incoming`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 5_000,
  });
  const { data: declinedSplits } = useQuery<Array<{ id: number }>>({
    queryKey: ["splits-declined-badge"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/splits/issued`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 5_000,
  });
  const hasPendingSplits = (incomingSplits?.length ?? 0) > 0 || (declinedSplits?.length ?? 0) > 0;

  const { data: glData } = useQuery<{ entries?: Array<{ id: number; status: string }> } | null>({
    queryKey: ["great-larder"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/great-larder`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 5_000,
  });
  const hasGLPendingApprovals = (glData?.entries ?? []).some((e) => e.status === "pending");

  const [showProfile, setShowProfile] = useState(false);
  const [showMission, setShowMission] = useState(false);
  const [prefs, setPrefsState]        = useState(() => loadPrefs());
  const [converting, setConverting]   = useState(false);
  const [rates, setRates]             = useState<Record<string, number> | null>(null);
  const [refreshingRates, setRefreshingRates] = useState(false);
  const [ratesUpdatedAt, setRatesUpdatedAt]   = useState<number | null>(() => getLastRatesUpdate());
  // Pending language/currency the user just picked — highlight flips to it
  // instantly, but the actual update is hidden behind the splash until reload.
  const [langSwitchTarget, setLangSwitchTarget] = useState<string | null>(null);
  const [currSwitchTarget, setCurrSwitchTarget] = useState<string | null>(null);
  const { toast } = useToast();

  const resetSplash = useSplashReset();
  const showWinkSplash = useWinkSplash();
  const softRefresh = useAppRefresh();
  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        setActiveUserId(null);
        queryClient.clear();
        resetSplash(); // re-show splash → sequence plays → lands on login
      },
    },
  });

  function isActive(href: string) {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  }

  function changeCurrency(code: string) {
    if (code === prefs.currency || converting || currSwitchTarget) return;
    // Close the profile sheet and navigate home BEFORE showing the wink so
    // the home screen renders underneath the overlay. All async work below runs
    // during the ~3 s animation; when the animation ends the overlay awaits the
    // work promise (usually already resolved) then does a soft route-remount so
    // the app is immediately ready — no page reload, no empty-cache loading states.
    setShowProfile(false);
    navigate("/");
    setCurrSwitchTarget(code);
    setConverting(true);

    // Kick off every async operation immediately so they run in parallel with
    // the animation. By the time the wink ends (~3.29 s) they are typically done.
    const workPromise = (async () => {
      try {
        const rates = await fetchRates();
        const rate  = getConversionRate(prefs.currency, code, rates);

        // The server converts and persists the user's *current* totalBudget (as
        // stored in the DB right now) and returns the resulting value. We must use
        // that response instead of recomputing from our own local `prefs` cache —
        // this component's `prefs` state can be stale relative to the DB (e.g. the
        // user just edited their budget on another page that keeps its own prefs
        // state), and overwriting with a value derived from stale local state would
        // silently revert the budget the user just set.
        const convertRes = await fetch(`${import.meta.env.BASE_URL}api/convert-currency`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ from: prefs.currency, to: code, rate }),
        });
        const convertData = convertRes.ok ? await convertRes.json().catch(() => null) : null;
        const newBudget: number | null = convertData && "totalBudget" in convertData
          ? convertData.totalBudget
          : prefs.totalBudget != null
            ? Math.round(prefs.totalBudget * rate * 100) / 100
            : null;

        const next = { ...prefs, currency: code, totalBudget: newBudget };
        savePrefs(next);
        setPrefsState(next);
        // Only persist currency here — the server already persisted the converted
        // totalBudget as part of /api/convert-currency above.
        await updateMe.mutateAsync({ data: { currency: code } });

        // Pre-warm the query cache while the overlay is still visible so that
        // when routes remount they read fresh converted data from cache instantly.
        queryClient.invalidateQueries();
        await queryClient.refetchQueries({ type: "active" });
      } catch {
        // swallow — the overlay will still lift cleanly
      } finally {
        setConverting(false);
      }
    })();

    showWinkSplash(async () => {
      await workPromise; // almost always a no-op (already resolved by now)
      softRefresh();     // remount routes; cache is warm → zero loading states
    });
  }

  const updateMe = useUpdateMe();

  function changeLanguage(code: string) {
    if (code === prefs.language || langSwitchTarget) return;
    // Close the profile sheet and navigate home BEFORE showing the wink.
    // Language change is pure local state — no API awaiting needed.
    // setLang() updates the module-level override so t() returns new strings
    // immediately; softRefresh() remounts routes so every component re-renders.
    setShowProfile(false);
    navigate("/");
    setLangSwitchTarget(code);
    const next = { ...prefs, language: code };
    setPrefsState(next);
    savePrefs(next);
    setLang(code as "en" | "pl");
    // Fire-and-forget the persist — animation takes ~3 s, plenty of time.
    updateMe.mutate({ data: { language: code } });
    showWinkSplash(() => softRefresh()); // remount routes → all t() pick up new lang
  }

  async function handleRefreshRates() {
    if (refreshingRates) return;
    setRefreshingRates(true);
    try {
      const fresh = await forceFetchRates();
      setRates(fresh);
      setRatesUpdatedAt(getLastRatesUpdate());
      toast({ title: t("profile.rates_refreshed") });
    } catch {
      toast({ title: t("profile.rates_refresh_failed"), variant: "destructive" });
    } finally {
      setRefreshingRates(false);
    }
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
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowMission(true)}
            className="flex-shrink-0 transition active:scale-90"
            aria-label="The Mission"
          >
            <span data-splash-logo-home>
              <BadgerLogo size={42} mode={badgerMode} />
            </span>
          </button>
          <Link href="/" className="text-lg font-bold tracking-tight text-foreground leading-none">
            Budger
          </Link>
        </div>

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

      {/* ── Offline indicator ── */}
      <OfflineBanner />

      {/* ── Mission bottom sheet ── */}
      {showMission && (
        <>
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowMission(false)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border
                          rounded-t-3xl px-5 pt-6 pb-12 max-h-[88vh] overflow-y-auto">

            {/* drag handle */}
            <div className="w-10 h-1 rounded-full bg-border mx-auto mb-5" />

            {/* header */}
            <div className="flex items-center gap-3 mb-6">
              <BadgerLogo size={36} />
              <div>
                <p className="text-lg font-bold text-foreground">
                  {prefs.language === "pl" ? "Misja" : "The Mission"}
                </p>
                <p className="text-xs text-muted-foreground">Filip Snopek · Budger</p>
              </div>
            </div>

            {/* body */}
            {prefs.language === "pl" ? (
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

            <button
              onClick={() => setShowMission(false)}
              className="mt-6 w-full py-3 rounded-2xl bg-muted text-sm font-medium text-muted-foreground transition active:opacity-70"
            >
              {prefs.language === "pl" ? "Zamknij" : "Close"}
            </button>
          </div>
        </>
      )}

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
                    // Reflect the just-clicked currency immediately, even though
                    // the real conversion doesn't happen until the splash finishes.
                    const isSelected = c.code === (currSwitchTarget ?? prefs.currency);
                    const rate = rates ? getConversionRate(prefs.currency, c.code, rates) : null;
                    const rateStr = rate != null ? rate.toFixed(4) : null;
                    return (
                      <button
                        key={c.code}
                        onClick={() => changeCurrency(c.code)}
                        disabled={converting || isSelected || !!currSwitchTarget}
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
                <button
                  onClick={handleRefreshRates}
                  disabled={refreshingRates}
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl
                             border border-border bg-muted/40 text-sm font-medium text-foreground
                             transition active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingRates ? "animate-spin" : ""}`} />
                  {refreshingRates ? t("profile.updating_rates") : t("profile.update_rates")}
                </button>
                <p className="text-[10px] text-muted-foreground text-center">
                  {ratesUpdatedAt != null
                    ? t("profile.last_updated", { ts: fmtDateTime(ratesUpdatedAt) })
                    : t("profile.never_updated")}
                </p>
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
                    // Reflect the just-clicked language immediately, even though
                    // the real translation doesn't happen until the splash finishes.
                    const isSelected = l.code === (langSwitchTarget ?? prefs.language);
                    return (
                      <button
                        key={l.code}
                        onClick={() => changeLanguage(l.code)}
                        disabled={isSelected || !!langSwitchTarget}
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
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                         bg-destructive/10 text-sm font-medium text-destructive
                         transition active:opacity-70 disabled:opacity-40"
            >
              <LogOut className="w-4 h-4" />
              <span>
                {logout.isPending ? t("profile.signing_out") : t("profile.sign_out")}
              </span>
            </button>
          </div>
        </>
      )}


      {/* ── Page content ── */}
      <main ref={mainRef} className="flex-1 overflow-auto pb-24">
        {children}
      </main>

      {/* Ocean wave glow — Goals & Household tabs only; opacity scales with scroll */}
      <style>{`
        @keyframes nw1{0%{transform:translateX(-120px);opacity:0}12%{opacity:.85}88%{opacity:.85}100%{transform:translateX(110vw);opacity:0}}
        @keyframes nw2{0%{transform:translateX(110vw);opacity:0}15%{opacity:.60}85%{opacity:.60}100%{transform:translateX(-90px);opacity:0}}
        @keyframes nw3{0%{transform:translateX(5vw);opacity:.25}40%{opacity:.80;transform:translateX(55vw)}100%{transform:translateX(5vw);opacity:.25}}
        @keyframes nw4{0%{transform:translateX(60vw);opacity:0}20%{opacity:.70}80%{opacity:.70}100%{transform:translateX(-100px);opacity:0}}
        @keyframes nw5{0%{transform:translateX(-60px);opacity:.20}50%{opacity:.65;transform:translateX(40vw)}100%{transform:translateX(-60px);opacity:.20}}
        @keyframes nw6{0%{transform:translateX(80vw);opacity:.15}45%{opacity:.55;transform:translateX(20vw)}100%{transform:translateX(80vw);opacity:.15}}
      `}</style>
      {/* Wave beams — fixed, sit just above the nav bar top border */}
      <div
        className="fixed bottom-16 inset-x-0 overflow-visible pointer-events-none"
        style={{
          height: 0,
          zIndex: 41,
          opacity: !loadPrefs().disableAnimations && (location === '/goals' || location === '/household') && !larderReached
            ? Math.min(1, 0.55 + 0.45 * waveIntensity)
            : 0,
          transition: "opacity 0.8s ease",
        }}
      >
        <div style={{ position:"absolute", top:"-7px", left:0, width:"145px", height:"14px", background:"radial-gradient(ellipse 72px 7px at center, rgba(255,255,255,0.90) 0%, transparent 100%)", animation:"nw1 7s ease-in-out 0s infinite" }} />
        <div style={{ position:"absolute", top:"-6px", left:0, width:"105px", height:"11px", background:"radial-gradient(ellipse 52px 5px at center, rgba(255,255,255,0.62) 0%, transparent 100%)", animation:"nw2 9s ease-in-out 1.2s infinite" }} />
        <div style={{ position:"absolute", top:"-7px", left:0, width:"125px", height:"14px", background:"radial-gradient(ellipse 62px 7px at center, rgba(255,255,255,0.55) 0%, transparent 100%)", animation:"nw3 5.5s ease-in-out 0s infinite" }} />
        <div style={{ position:"absolute", top:"-6px", left:0, width:"92px",  height:"11px", background:"radial-gradient(ellipse 46px 5px at center, rgba(255,255,255,0.72) 0%, transparent 100%)", animation:"nw4 8s ease-in-out 2.5s infinite" }} />
        <div style={{ position:"absolute", top:"-8px", left:0, width:"72px",  height:"16px", background:"radial-gradient(ellipse 36px 8px at center, rgba(255,255,255,0.48) 0%, transparent 100%)", animation:"nw5 6.5s ease-in-out 4s infinite" }} />
        <div style={{ position:"absolute", top:"-5px", left:0, width:"85px",  height:"9px",  background:"radial-gradient(ellipse 42px 4px at center, rgba(255,255,255,0.58) 0%, transparent 100%)", animation:"nw6 7.5s ease-in-out 5.5s infinite" }} />
      </div>

      {/* ── Bottom navigation — 5 tabs evenly spaced ── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 h-16
                      bg-card/95 backdrop-blur border-t border-border
                      flex items-stretch">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          const isHousehold = href === "/household";
          const isGoals = href === "/goals";
          const isCategories = href === "/categories";
          const showBadge = (isHousehold && (hasInvitations || hasHouseholdAlert || hasPendingSplits || hasGLPendingApprovals)) || (isGoals && showGoalsBadge) || (isCategories && hasPendingCategoryProposals);
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
