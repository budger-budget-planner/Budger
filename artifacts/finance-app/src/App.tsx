import { useCallback, useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import SplashScreen from "@/components/SplashScreen";
import WinkSplashScreen from "@/components/WinkSplashScreen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import Onboarding from "@/components/Onboarding";
import { useSmartNotifications } from "@/hooks/useSmartNotifications";
import LoginPage from "@/pages/Login";
import HomeSpending from "@/pages/HomeSpending";
import DashboardPage from "@/pages/Dashboard";
import TransactionsPage from "@/pages/Transactions";
import CategoriesPage from "@/pages/Categories";
import GoalsPage from "@/pages/Goals";
import HouseholdPage from "@/pages/Household";
import NotificationsPage from "@/pages/Notifications";
import InvitePage from "@/pages/Invite";
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
import { useLogout } from "@workspace/api-client-react";
import { AppReadyContext, SplashResetContext, WinkSplashContext, useSplashReset } from "@/lib/appReady";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
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
          onSettled: () => {
            queryClient.clear();
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
  // If a lang/currency reload just happened, skip the full splash — the wink
  // was already shown before the reload. The flag is set in Layout.tsx.
  const [splashDone,   setSplashDone]   = useState(() => {
    if (sessionStorage.getItem("budger_skip_full_splash")) {
      sessionStorage.removeItem("budger_skip_full_splash");
      return true;
    }
    return false;
  });
  const [winkActive,   setWinkActive]   = useState(false);

  const resetSplash  = useCallback(() => setSplashDone(false), []);
  const showWinkSplash = useCallback(() => setWinkActive(true), []);

  return (
    <SplashResetContext.Provider value={resetSplash}>
      <WinkSplashContext.Provider value={showWinkSplash}>
        <AppReadyContext.Provider value={splashDone}>
          <AppRoutes />
          {/* Full 3-animation splash: only on app open or logout */}
          {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
          {/* Wink-only splash: for all other transitions */}
          {winkActive && <WinkSplashScreen onDone={() => setWinkActive(false)} />}
        </AppReadyContext.Provider>
      </WinkSplashContext.Provider>
    </SplashResetContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppWithSplash />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
