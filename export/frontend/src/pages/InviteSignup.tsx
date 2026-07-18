import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import PinKeyboard from "@/components/PinKeyboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { getGetMeQueryKey } from "@/lib/api-client";
import { setPendingOnboarding, markSession } from "@/lib/prefs";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import BudgerWordmark from "@/components/BudgerWordmark";

type Step = "loading" | "name" | "pin" | "confirm" | "submitting" | "done" | "error" | "expired";

export default function InviteSignupPage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("loading");
  const [inviteData, setInviteData] = useState<{ householdName: string; inviterName: string | null } | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [pinMismatch, setPinMismatch] = useState(false);

  // Fetch invite details on mount
  useEffect(() => {
    if (!token) { setStep("error"); return; }
    const base = import.meta.env.BASE_URL;
    fetch(`${base}api/invites/${token}`, { credentials: "include" })
      .then(async r => {
        if (r.status === 410) {
          const body = await r.json().catch(() => ({}));
          if (body.error === "REVOKED") setStep("error");
          else setStep("expired");
          return;
        }
        if (!r.ok) { setStep("error"); return; }
        const data = await r.json();
        if (data.isRegistered) {
          // This page is only for unregistered users
          setLocation(`/invite/${token}`);
          return;
        }
        setInviteData({ householdName: data.householdName ?? "the household", inviterName: data.inviterName ?? null });
        setStep("name");
      })
      .catch(() => setStep("error"));
  }, [token]);

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setStep("pin");
  }

  function handlePinComplete(value: string) {
    setPin(value);
    setPinMismatch(false);
    setStep("confirm");
  }

  async function handleConfirmPin(value: string) {
    setConfirmPin(value);
    if (value !== pin) {
      setPinMismatch(true);
      setPin("");
      setConfirmPin("");
      setStep("pin");
      return;
    }

    // Step 1: register-start (creates user, marks email verified)
    setStep("submitting");
    const base = import.meta.env.BASE_URL;
    try {
      const startRes = await fetch(`${base}api/invites/${token}/register-start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      if (!startRes.ok) {
        const body = await startRes.json().catch(() => ({}));
        if (body.error === "EXPIRED" || body.error === "ALREADY_REGISTERED") {
          setStep(body.error === "EXPIRED" ? "expired" : "error");
        } else {
          setErrorMsg(body.error ?? t("common.error"));
          setStep("error");
        }
        return;
      }
      const { email: userEmail } = await startRes.json();
      setEmail(userEmail);

      // Step 2: register (set PIN, establish session)
      const regRes = await fetch(`${base}api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: userEmail,
          password: pin,
          termsAccepted: true,
          privacyAccepted: true,
        }),
      });
      if (!regRes.ok) {
        const body = await regRes.json().catch(() => ({}));
        setErrorMsg(body.error ?? t("common.error"));
        setStep("error");
        return;
      }

      // Session established — trigger onboarding flow
      setPendingOnboarding();
      markSession();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setStep("done");
      // Navigate home after a brief moment so the success flash is visible
      setTimeout(() => setLocation("/"), 1200);
    } catch {
      setErrorMsg(t("common.error"));
      setStep("error");
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  // ── Expired ──────────────────────────────────────────────────────────
  if (step === "expired") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-5 text-center">
        <BudgerWordmark className="mb-2" />
        <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-amber-400" />
        </div>
        <div>
          <p className="font-semibold text-white">{t("invite.expired_title")}</p>
          <p className="text-sm text-white/50 mt-1">{t("invite.expired_msg")}</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (step === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-5 text-center">
        <BudgerWordmark className="mb-2" />
        <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <p className="font-semibold text-white">{t("invite.invalid_title")}</p>
          <p className="text-sm text-white/50 mt-1">{errorMsg || t("invite.invalid_msg")}</p>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-5 text-center">
        <BudgerWordmark className="mb-2" />
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle className="w-7 h-7 text-green-400" />
        </div>
        <p className="font-semibold text-green-400">{t("invite.joined")}</p>
      </div>
    );
  }

  // ── Submitting ───────────────────────────────────────────────────────
  if (step === "submitting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-4 text-center">
        <BudgerWordmark className="mb-2" />
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        <p className="text-sm text-white/50">{t("invite.joining")}</p>
      </div>
    );
  }

  const headerText = inviteData
    ? t("invite.signup_title", { name: inviteData.householdName })
    : t("invite.create_account");

  // ── Name step ────────────────────────────────────────────────────────
  if (step === "name") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-xs flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3">
            <BudgerWordmark />
            <p className="text-center font-semibold text-white">{headerText}</p>
            {inviteData?.inviterName && (
              <p className="text-sm text-white/50 text-center">
                {t("invite.invited_by", { name: inviteData.inviterName })}
              </p>
            )}
          </div>

          {pinMismatch && (
            <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-lg px-3 py-2">
              {t("invite.pins_dont_match")}
            </p>
          )}

          <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label>{t("invite.first_name")}</Label>
              <Input
                autoFocus
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Anna"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("invite.last_name")}</Label>
              <Input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Kowalska"
                required
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={!firstName.trim() || !lastName.trim()}>
              {t("common.continue")}
            </Button>
          </form>

          <p className="text-[11px] text-white/25 text-center leading-relaxed">
            {t("invite.terms_note")}
          </p>
        </div>
      </div>
    );
  }

  // ── PIN step ─────────────────────────────────────────────────────────
  if (step === "pin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-xs flex flex-col gap-6 items-center">
          <BudgerWordmark />
          <p className="font-semibold text-white text-center">{t("invite.set_pin")}</p>
          <PinKeyboard
            value={pin}
            onChange={setPin}
            onComplete={handlePinComplete}
            showSubmit={false}
          />
        </div>
      </div>
    );
  }

  // ── Confirm PIN step ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-xs flex flex-col gap-6 items-center">
        <BudgerWordmark />
        <p className="font-semibold text-white text-center">{t("invite.confirm_pin")}</p>
        <PinKeyboard
          value={confirmPin}
          onChange={setConfirmPin}
          onComplete={handleConfirmPin}
          showSubmit={false}
        />
      </div>
    </div>
  );
}
