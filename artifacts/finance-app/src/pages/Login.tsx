import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
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
    <div className="min-h-screen flex bg-background">
      {/* Left: branding */}
      <div className="hidden lg:flex w-1/2 bg-sidebar flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold text-white">Pocket</span>
        </div>
        <div>
          <blockquote className="text-2xl font-light text-white/80 leading-relaxed mb-6">
            "Your household finances, in one place. Clear, shared, and always up to date."
          </blockquote>
          <div className="flex flex-col gap-3">
            {["Track every purchase by category", "Share expenses with your household", "Set reminders to log spending"].map((f) => (
              <div key={f} className="flex items-center gap-3 text-white/60 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-sidebar-primary flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-white/30">Pocket &copy; 2026</p>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-semibold">Pocket</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">Welcome back</h1>
          <p className="text-muted-foreground text-sm mb-8">Enter your details to access your finances</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="input-name">Your name</Label>
              <Input
                id="input-name"
                data-testid="input-name"
                placeholder="Alex Johnson"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="input-email">Email address</Label>
              <Input
                id="input-email"
                data-testid="input-email"
                type="email"
                placeholder="alex@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              data-testid="button-submit"
              disabled={login.isPending}
            >
              {login.isPending ? "Signing in..." : "Continue"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-6">
            No password needed. We'll find or create your account by email.
          </p>
        </div>
      </div>
    </div>
  );
}
