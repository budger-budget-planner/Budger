import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import BadgerLogo from "@/components/BadgerLogo";

function AppleIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 814 1000" fill="currentColor"
      className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 67.2 0 123.1 44.3 165.8 44.3 40.8 0 103.7-47.1 179.3-47.1 45.8 0 127.5 10.8 186.2 76.9zm-87.4-188.4c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
    </svg>
  );
}

type LoginMode = "start" | "apple-info" | "apple-email" | "email";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient     = useQueryClient();
  const [mode, setMode] = useState<LoginMode>("start");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [appleEmail, setAppleEmail] = useState("");

  const login = useLogin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        setLocation("/");
      },
    },
  });

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    login.mutate({ data: { name: name.trim(), email: email.trim() } });
  }

  function handleAppleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appleEmail.trim()) return;
    const raw = appleEmail.split("@")[0];
    const derivedName = raw
      .replace(/[._\-+]/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
    login.mutate({ data: { name: derivedName || "Budger User", email: appleEmail.trim() } });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-between px-6 py-12">

      {/* ── Logo ── */}
      <div className="flex flex-col items-center gap-4 mt-8">
        <div className="p-4 rounded-3xl bg-card border border-border shadow-xl">
          <BadgerLogo size={72} />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Budger</h1>
          <p className="text-sm text-muted-foreground mt-1">Your household finances, in one place.</p>
        </div>
      </div>

      {/* ── Auth panel ── */}
      <div className="w-full max-w-sm space-y-3">

        {/* START */}
        {mode === "start" && (
          <>
            <button type="button" onClick={() => setMode("apple-info")}
              className="w-full flex items-center justify-center gap-3 h-14 rounded-2xl
                         bg-white text-black font-semibold text-base
                         transition active:scale-95 shadow-sm">
              <AppleIcon />
              Sign in with Apple
            </button>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <button type="button" onClick={() => setMode("email")}
              className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl
                         bg-muted text-foreground font-semibold text-base border border-border
                         transition active:scale-95">
              Continue with email
            </button>
          </>
        )}

        {/* APPLE INFO — explains what Apple Sign In can/can't do on the web */}
        {mode === "apple-info" && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                  <AppleIcon size={32} className="text-black" />
                </div>
              </div>
              <p className="text-lg font-semibold text-foreground">Sign in with Apple</p>
            </div>

            <div className="bg-card border border-border rounded-2xl divide-y divide-border">
              <div className="flex items-start gap-3 px-4 py-3.5">
                <span className="text-base mt-0.5">✓</span>
                <p className="text-sm text-foreground">
                  Your Apple ID email is used as your Budger identity
                </p>
              </div>
              <div className="flex items-start gap-3 px-4 py-3.5">
                <span className="text-base mt-0.5">✓</span>
                <p className="text-sm text-foreground">
                  Your display name is derived automatically from the email
                </p>
              </div>
              <div className="flex items-start gap-3 px-4 py-3.5">
                <span className="text-muted-foreground text-base mt-0.5">ℹ</span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Full native Apple Sign In (Face ID / Touch ID authentication)
                  requires this app to be published with an Apple Developer
                  Service ID. For now, enter your Apple ID email below.
                </p>
              </div>
            </div>

            <button type="button" onClick={() => setMode("apple-email")}
              className="w-full flex items-center justify-center gap-3 h-14 rounded-2xl
                         bg-white text-black font-semibold text-base
                         transition active:scale-95 shadow-sm">
              <AppleIcon />
              Continue with Apple ID
            </button>
            <button type="button" onClick={() => setMode("start")}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition text-center py-1">
              ← Back
            </button>
          </div>
        )}

        {/* APPLE EMAIL — enter Apple ID email to log in */}
        {mode === "apple-email" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">Enter your Apple ID</p>
              <p className="text-sm text-muted-foreground mt-1">
                Use the email address linked to your Apple ID
              </p>
            </div>
            <form onSubmit={handleAppleEmailSubmit} className="space-y-3">
              <Input
                type="email"
                placeholder="you@icloud.com"
                value={appleEmail}
                onChange={e => setAppleEmail(e.target.value)}
                autoFocus autoComplete="email"
                required
                className="h-13 rounded-2xl bg-muted border-border text-base px-4"
              />
              <button type="submit" disabled={login.isPending}
                className="w-full flex items-center justify-center gap-3 h-14 rounded-2xl
                           bg-white text-black font-semibold text-base
                           disabled:opacity-50 transition active:scale-95 shadow-sm">
                <AppleIcon />
                {login.isPending ? "Signing in…" : "Sign in"}
              </button>
            </form>
            {login.isError && (
              <p className="text-sm text-destructive text-center">{String((login.error as any)?.message ?? "Sign-in failed")}</p>
            )}
            <button type="button" onClick={() => setMode("apple-info")}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition text-center py-1">
              ← Back
            </button>
          </div>
        )}

        {/* EMAIL flow */}
        {mode === "email" && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">Welcome to Budger</p>
              <p className="text-sm text-muted-foreground mt-1">No password needed</p>
            </div>
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">Your name</Label>
                <Input placeholder="Alex Johnson" value={name}
                  onChange={e => setName(e.target.value)} required
                  className="h-12 rounded-2xl bg-muted border-border text-base px-4" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">Email address</Label>
                <Input type="email" placeholder="alex@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} required
                  className="h-12 rounded-2xl bg-muted border-border text-base px-4" />
              </div>
              <Button type="submit" disabled={login.isPending}
                className="w-full h-14 rounded-2xl text-base font-semibold mt-1">
                {login.isPending ? "Signing in…" : "Continue"}
              </Button>
            </form>
            {login.isError && (
              <p className="text-sm text-destructive text-center">{String((login.error as any)?.message ?? "Sign-in failed")}</p>
            )}
            <button type="button" onClick={() => setMode("start")}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition text-center py-1">
              ← Back
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground/50">Budger &copy; 2026</p>
    </div>
  );
}
