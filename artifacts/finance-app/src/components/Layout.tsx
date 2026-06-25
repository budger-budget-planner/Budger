import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Home, LayoutDashboard, Tag, Users, Bell, LogOut, X, DollarSign, Globe, Target } from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import BadgerLogo from "@/components/BadgerLogo";
import { loadPrefs, savePrefs, CURRENCIES, LANGUAGES } from "@/lib/prefs";
import { fetchRates, getConversionRate } from "@/lib/rates";
import { t } from "@/lib/i18n";

function navItems() {
  return [
    { href: "/",              label: t("nav.home"),       icon: Home            },
    { href: "/dashboard",     label: t("nav.dashboard"),  icon: LayoutDashboard },
    { href: "/categories",    label: t("nav.categories"), icon: Tag             },
    { href: "/goals",         label: t("nav.goals"),      icon: Target          },
    { href: "/household",     label: t("nav.household"),  icon: Users           },
    { href: "/notifications", label: t("nav.alerts"),     icon: Bell            },
  ];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location]     = useLocation();
  const queryClient    = useQueryClient();
  const { data: user } = useGetMe();
  const [showProfile, setShowProfile] = useState(false);
  const [prefs, setPrefsState]        = useState(() => loadPrefs());
  const [converting, setConverting]   = useState(false);
  const [rates, setRates]             = useState<Record<string, number> | null>(null);

  const logout = useLogout({
    mutation: {
      onSuccess: () => {
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

  function changeLanguage(code: string) {
    const next = { ...prefs, language: code };
    savePrefs(next);
    setPrefsState(next);
    window.location.reload();
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
          <BadgerLogo size={28} />
          <span className="text-base font-bold tracking-tight text-foreground">Budger</span>
        </Link>
        <button
          onClick={() => setShowProfile(true)}
          className="w-8 h-8 rounded-full bg-muted border border-border
                     flex items-center justify-center flex-shrink-0 transition active:scale-95"
        >
          <span className="text-xs font-bold text-foreground">
            {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
          </span>
        </button>
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
                        <span className="font-bold text-sm">{c.symbol} {c.code}</span>
                        {isSelected ? (
                          <span className={`text-[10px] mt-0.5 ${isSelected ? "opacity-60" : "opacity-50"}`}>
                            {c.label.replace(/ \(.*\)/, "")}
                          </span>
                        ) : rateStr ? (
                          <span className="text-[10px] mt-0.5 opacity-50 leading-tight">
                            1 {prefs.currency} = {rateStr} {c.code}
                          </span>
                        ) : (
                          <span className="text-[10px] mt-0.5 opacity-30">—</span>
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

      {/* ── Bottom navigation ── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 h-16
                      bg-card/95 backdrop-blur border-t border-border
                      flex items-stretch">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors
                          ${active ? "text-foreground" : "text-muted-foreground"}`}
              data-testid={`nav-${href.replace("/", "") || "home"}`}
            >
              <div className={`p-1.5 rounded-xl transition-colors ${active ? "bg-muted" : ""}`}>
                <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.6} />
              </div>
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
