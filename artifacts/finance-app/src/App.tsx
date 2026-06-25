import { useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
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
  type AppPrefs,
} from "@/lib/prefs";
import { setLang } from "@/lib/i18n";
import { useLogout } from "@workspace/api-client-react";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function SmartNotificationsRunner() {
  useSmartNotifications();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const [, navigate] = useLocation();
  const logout = useLogout();
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
        logout.mutate({} as any, {
          onSettled: () => {
            queryClient.clear();
            navigate("/login");
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

  // ── Server → localStorage sync (run once per user, not on every render) ──
  // This applies the server's per-user settings (budget, language) to local state.
  // Gated by userId so it runs once on login and whenever the user changes.
  if (syncedUserIdRef.current !== user.id) {
    syncedUserIdRef.current = user.id;
    const prefs = loadPrefs();
    let updated = { ...prefs };

    // Budget: server is source of truth; only apply if server has a definitive value
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

    if (JSON.stringify(updated) !== JSON.stringify(prefs)) {
      savePrefs(updated);
    }
  }

  // Server is the source of truth: if firstLoginDone is true, user has been onboarded.
  // We only fall back to the localStorage flag for the rare case where the server
  // hasn't yet updated firstLoginDone (e.g. mid-onboarding refresh).
  const serverSaysOnboarded = user.firstLoginDone === true;

  if (showOnboarding || (!serverSaysOnboarded && !isOnboardingDone())) {
    return (
      <Onboarding
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
