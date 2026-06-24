import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import Onboarding from "@/components/Onboarding";
import LoginPage from "@/pages/Login";
import HomeSpending from "@/pages/HomeSpending";
import DashboardPage from "@/pages/Dashboard";
import TransactionsPage from "@/pages/Transactions";
import CategoriesPage from "@/pages/Categories";
import GoalsPage from "@/pages/Goals";
import HouseholdPage from "@/pages/Household";
import NotificationsPage from "@/pages/Notifications";
import InvitePage from "@/pages/Invite";
import { isOnboardingDone, markOnboardingDone, savePrefs, type AppPrefs } from "@/lib/prefs";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useGetMe();
  const [, navigate] = useLocation();
  const [onboarded, setOnboarded] = useState(isOnboardingDone);

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return null;

  if (!onboarded) {
    return (
      <Onboarding
        onComplete={(prefs: AppPrefs) => {
          savePrefs(prefs);
          markOnboardingDone();
          setOnboarded(true);
        }}
      />
    );
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/invite/:token" component={InvitePage} />
      {/*
        wouter v3: <Route> with NO path is an unconditional catch-all (always matches).
        "/:rest*" does NOT match bare "/" so it can't be used here.
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
