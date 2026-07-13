import { useCallback, useEffect, useRef, useState, Component, type ErrorInfo, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import SplashScreen from "@/components/SplashScreen";
import WinkSplashScreen from "@/components/WinkSplashScreen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@/lib/api-client";
import Layout from "@/components/Layout";
import Onboarding from "@/components/Onboarding";
import { useSmartNotifications } from "@/hooks/useSmartNotifications";
// Eager imports — all pages are bundled upfront so every tab switch is instant.
// The service-worker cache already handles fast first loads, so lazy-splitting
// pages only hurts UX (visible flash/spinner on first tab visit) with no gain.
import LoginPage        from "@/pages/Login";
import HomeSpending     from "@/pages/HomeSpending";
import DashboardPage    from "@/pages/Dashboard";
import TransactionsPage from "@/pages/Transactions";
import CategoriesPage   from "@/pages/Categories";
import GoalsPage        from "@/pages/Goals";
import HouseholdPage    from "@/pages/Household";
import NotificationsPage from "@/pages/Notifications";
import InvitePage       from "@/pages/Invite";
import {
  isOnboardingDone,
  markOnboardingDone,
  savePrefs,
  loadPrefs,
  hasActiveSession,
  clearSession,
  takePendingOnboarding,
  setActiveUserId,
  type AppPrefs,
} from "@/lib/prefs";
import { setLang } from "@/lib/i18n";
import { useLogout } from "@/lib/api-client";
import { AppReadyContext, SplashResetContext, WinkSplashContext, AppRefreshContext, useSplashReset } from "@/lib/appReady";

// ── Top-level Error Boundary ─────────────────────────────────────────────────
// Catches uncaught render errors so a single broken component doesn't blank
// the entire app. Shows a minimal recovery UI instead.
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so the error is visible in dev tools / workflow logs.
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8 text-center">
          <p className="text-lg font-semibold mb-2">Something went wrong</p>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold transition active:scale-95"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      // Run queries against the SW cache even when offline so the app
      // stays readable without a network connection.
      networkMode: "offlineFirst",
    },
  },
});

function SmartNotificationsRunner() {
  useSmartNotifications();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const [, navigate] = useLocation();
  const logout = useLogout();
  const resetSplash = useSplashReset();
  const [onboarded, setOnboarded] = useState(isOnboardingDone);
  // Track whether onboarding should show (set when login/register sets sessionStorage flag)
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Track the last userId we applied server prefs for, to avoid re-applying on every render
  const syncedUserIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
      return;
    }
    if (user) {
      const prefs = loadPrefs();
      // If staySignedIn=false and no active session (new browser session) → sign out
      if (!prefs.staySignedIn && !hasActiveSession()) {
        clearSession();
        setActiveUserId(null);
        logout.mutate({} as any, {
          onSettled: async () => {
            queryClient.clear();
            // Clear the SW's NetworkFirst API cache so a different user logging
            // in on this device/browser can never see a stale cached response
            // (e.g. transactions, balances) left over from this session.
            // Awaited (not fire-and-forget) so the next login can't race ahead
            // of the cache actually being wiped.
            if ("caches" in window) {
              await caches.delete("budger-api-v1").catch(() => {});
            }
            resetSplash(); // show splash → sequence plays → lands on login
          },
        });
        return;
      }
      // Check sessionStorage flag set by Login.tsx before navigation
      // This is the reliable way to detect first-login across the navigation boundary
      if (takePendingOnboarding()) {
        setShowOnboarding(true);
      }
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  // Server is the source of truth for onboarding status.
  const serverSaysOnboarded = user.firstLoginDone === true;

  // ── Server → localStorage sync (run once per user, not on every render) ──
  // Gated by userId so it runs once on login and whenever the user changes.
  // Also gated by serverSaysOnboarded: until onboarding completes, the server
  // has only default values (e.g. language = "en") — syncing them would overwrite
  // the user's locally-chosen language before onboarding even shows.
  if (syncedUserIdRef.current !== user.id && serverSaysOnboarded) {
    syncedUserIdRef.current = user.id;
    const prefs = loadPrefs();
    let updated = { ...prefs };

    // Budget: server is source of truth
    const serverBudget = (user as any).totalBudget;
    if (serverBudget !== undefined) {
      const budgetNum = serverBudget != null ? parseFloat(String(serverBudget)) : null;
      updated = { ...updated, totalBudget: budgetNum };
    }

    // Language: server is source of truth per-account; apply and activate it
    const serverLang = (user as any).language as string | undefined;
    if (serverLang && serverLang !== prefs.language) {
      updated = { ...updated, language: serverLang };
      setLang(serverLang as "en" | "pl");
    }

    // Currency: server is source of truth — prevents USD revert when localStorage clears
    const serverCurrency = (user as any).currency as string | undefined;
    if (serverCurrency && serverCurrency !== prefs.currency) {
      updated = { ...updated, currency: serverCurrency };
    }

    if (JSON.stringify(updated) !== JSON.stringify(prefs)) {
      savePrefs(updated);
    }
  }

  // Onboarding is shown ONLY when explicitly triggered by the login handler
  // via the sessionStorage flag (setPendingOnboarding). This ensures onboarding
  // is never shown immediately after registration — the user must log in first.
  if (showOnboarding) {
    return (
      <Onboarding
        isHonorableContributor={user.status === "golden"}
        onComplete={(prefs: AppPrefs) => {
          savePrefs(prefs);
          markOnboardingDone();
          setOnboarded(true);
          setShowOnboarding(false);
          // After onboarding, the user query was already refreshed by Onboarding.tsx.
          // Reset the sync ref so the fresh server data is applied on next render.
          syncedUserIdRef.current = null;
        }}
      />
    );
  }

  return (
    <>
      <SmartNotificationsRunner />
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/verify-email" component={LoginPage} />
      <Route path="/reset-pin" component={LoginPage} />
      <Route path="/invite/:token" component={InvitePage} />
      {/*
        wouter v3: <Route> with NO path is an unconditional catch-all (always matches).
      */}
      <Route>
        <AuthGuard>
          <Layout>
            <Switch>
              <Route path="/"              component={HomeSpending}     />
              <Route path="/dashboard"     component={DashboardPage}    />
              <Route path="/transactions"  component={TransactionsPage} />
              <Route path="/categories"    component={CategoriesPage}   />
              <Route path="/goals"         component={GoalsPage}        />
              <Route path="/household"     component={HouseholdPage}    />
              <Route path="/notifications" component={NotificationsPage}/>
            </Switch>
          </Layout>
        </AuthGuard>
      </Route>
    </Switch>
  );
}

function AppWithSplash() {
  const [splashDone,   setSplashDone]   = useState(false);
  const [winkActive,   setWinkActive]   = useState(false);
  // appVersion is a key for <AppRoutes> — bumping it remounts the entire route
  // tree so components re-render with updated language/currency from prefs/cache,
  // without a full page reload (which would empty React Query caches).
  const [appVersion,   setAppVersion]   = useState(0);
  const afterWinkRef = useRef<(() => void | Promise<void>) | undefined>(undefined);

  const resetSplash  = useCallback(() => setSplashDone(false), []);
  // Remount routes so all t() calls and currency formatters pick up new values.
  // Callers must pre-warm the query cache before invoking this.
  const softRefresh  = useCallback(() => setAppVersion(v => v + 1), []);
  const showWinkSplash = useCallback((afterDone?: () => void | Promise<void>) => {
    afterWinkRef.current = afterDone;
    setWinkActive(true);
  }, []);

  return (
    <SplashResetContext.Provider value={resetSplash}>
      <WinkSplashContext.Provider value={showWinkSplash}>
        <AppRefreshContext.Provider value={softRefresh}>
          <AppReadyContext.Provider value={splashDone}>
            {/* key=appVersion remounts routes after language/currency change */}
            <AppRoutes key={appVersion} />
            {/* Full 3-animation splash: only on app open or logout */}
            {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
            {/* Wink-only splash: afterDone may be async — overlay stays (invisible,
                non-blocking) until the promise resolves so callers can pre-warm
                caches before the route tree becomes visible. */}
            {winkActive && <WinkSplashScreen onDone={async () => {
              const cb = afterWinkRef.current;
              afterWinkRef.current = undefined;
              if (cb) await cb();
              setWinkActive(false);
            }} />}
          </AppReadyContext.Provider>
        </AppRefreshContext.Provider>
      </WinkSplashContext.Provider>
    </SplashResetContext.Provider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppWithSplash />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
