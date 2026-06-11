import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import BadgerLogo from "@/components/BadgerLogo";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient     = useQueryClient();
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");

  const login = useLogin({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries();
        setLocation("/");
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    login.mutate({ data: { name: name.trim(), email: email.trim() } });
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

      {/* ── Sign-in form ── */}
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="text-lg font-semibold text-foreground">Sign in</p>
          <p className="text-sm text-muted-foreground mt-1">No password needed</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Your name</Label>
            <Input
              placeholder="Alex Johnson"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              required
              className="h-13 rounded-2xl bg-muted border-border text-base px-4"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">Email address</Label>
            <Input
              type="email"
              placeholder="alex@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="h-13 rounded-2xl bg-muted border-border text-base px-4"
            />
          </div>
          <Button
            type="submit"
            disabled={login.isPending}
            className="w-full h-14 rounded-2xl text-base font-semibold mt-2"
          >
            {login.isPending ? "Signing in…" : "Continue"}
          </Button>
          {login.isError && (
            <p className="text-sm text-destructive text-center pt-1">
              {String((login.error as any)?.message ?? "Sign-in failed. Please try again.")}
            </p>
          )}
        </form>
      </div>

      <p className="text-xs text-muted-foreground/50">Budger &copy; 2026</p>
    </div>
  );
}
