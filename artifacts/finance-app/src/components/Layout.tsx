import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, LayoutDashboard, Tag, Users, Bell, LogOut, X, DollarSign, Globe, Target } from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import BadgerLogo from "@/components/BadgerLogo";
import { loadPrefs, savePrefs, CURRENCIES, LANGUAGES } from "@/lib/prefs";

const nav = [
  { href: "/",              label: "Home",       icon: Home            },
  { href: "/dashboard",     label: "Dashboard",  icon: LayoutDashboard },
  { href: "/categories",    label: "Categories", icon: Tag             },
  { href: "/goals",         label: "Goals",      icon: Target          },
  { href: "/household",     label: "Household",  icon: Users           },
  { href: "/notifications", label: "Alerts",     icon: Bell            },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location]     = useLocation();
  const queryClient    = useQueryClient();
  const { data: user } = useGetMe();
  const [showProfile, setShowProfile] = useState(false);
  const [prefs, setPrefsState]        = useState(() => loadPrefs());

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

  function changeCurrency(code: string) {
    const next = { ...prefs, currency: code };
    savePrefs(next);
    setPrefsState(next);
    window.location.reload();
  }

  function changeLanguage(code: string) {
    const next = { ...prefs, language: code };
    savePrefs(next);
    setPrefsState(next);
    window.location.reload();
  }

  const currencyLabel = CURRENCIES.find(c => c.code === prefs.currency)?.label ?? prefs.currency;
  const languageLabel = LANGUAGES.find(l => l.code === prefs.language)?.label ?? prefs.language;

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

            {/* User header */}
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

            {/* ── Preferences ── */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preferences</p>

              {/* Currency */}
              <div className="flex items-center gap-3 py-1">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Currency</p>
                  <p className="text-xs text-muted-foreground truncate">{currencyLabel}</p>
                </div>
                <select
                  value={prefs.currency}
                  onChange={e => changeCurrency(e.target.value)}
                  className="bg-muted border border-border rounded-lg px-2 py-1.5 text-sm text-foreground
                             appearance-none cursor-pointer min-w-0 max-w-[130px] truncate"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Language */}
              <div className="flex items-center gap-3 py-1">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Language</p>
                  <p className="text-xs text-muted-foreground truncate">{languageLabel}</p>
                </div>
                <select
                  value={prefs.language}
                  onChange={e => changeLanguage(e.target.value)}
                  className="bg-muted border border-border rounded-lg px-2 py-1.5 text-sm text-foreground
                             appearance-none cursor-pointer min-w-0 max-w-[130px]"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* Sign out */}
            <button
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="flex items-center gap-3 w-full px-1 py-2 text-destructive
                         transition active:opacity-70 disabled:opacity-40"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium">{logout.isPending ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </>
      )}

      {/* ── Page content ── */}
      <main className="flex-1 overflow-auto pb-24">
        {children}
      </main>

      {/* ── Bottom navigation — 5 tabs ── */}
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
              data-testid={`nav-${label.toLowerCase()}`}
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
