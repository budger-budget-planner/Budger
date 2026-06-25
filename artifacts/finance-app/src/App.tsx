import { useEffect, useState } from "react";
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
  clearOnboardingDone,
  savePrefs,
  loadPrefs,
  hasActiveSession,
  clearSession,
  type AppPrefs,
} from "@/lib/prefs";
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
  // Track whether onboarding should show (set by login event when isFirstLogin=true)
  const [showOnboarding, setShowOnboarding] = useState(false);

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
      }
    }
  }, [isLoading, user, navigate]);

  // Listen for login event to trigger onboarding for first-time users.
  // Always clear the local onboarding flag on any login so a new user on
  // the same device gets fresh onboarding regardless of who logged in before.
  useEffect(() => {
    function onLogin(e: Event) {
      const { isFirstLogin } = (e as CustomEvent).detail ?? {};
      if (isFirstLogin) {
        clearOnboardingDone(); // wipe previous user's flag
        setShowOnboarding(true);
      }
    }
    window.addEventListener("budger:login", onLogin);
    return () => window.removeEventListener("budger:login", onLogin);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  // Server is the source of truth: if firstLoginDone is true, user has been onboarded.
  // We only fall back to the localStorage flag for the rare case where the server
  // hasn't yet updated firstLoginDone (e.g. mid-onboarding refresh).
  const serverSaysOnboarded = user.firstLoginDone === true;

  // Sync server budget into localStorage so all pages read the correct per-user value.
  // Run on every user load so switching users always resets the budget display.
  const serverBudget = (user as any).totalBudget;
  if (serverBudget !== undefined) {
    const prefs = loadPrefs();
    const budgetNum = serverBudget != null ? parseFloat(serverBudget) : null;
    if (prefs.totalBudget !== budgetNum) {
      savePrefs({ ...prefs, totalBudget: budgetNum });
    }
  }

  if (showOnboarding || (!serverSaysOnboarded && !isOnboardingDone())) {
    return (
      <Onboarding
        onComplete={(prefs: AppPrefs) => {
          savePrefs(prefs);
          markOnboardingDone();
          setOnboarded(true);
          setShowOnboarding(false);
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
