import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin, useRegister } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import BadgerLogo from "@/components/BadgerLogo";
import PinKeyboard from "@/components/PinKeyboard";
import { t, setLang } from "@/lib/i18n";
import { LANGUAGES, loadPrefs, savePrefs, markSession, setPendingOnboarding, clearOnboardingDone } from "@/lib/prefs";

type Screen =
  | "start"          // email + language, login default / sign-up link
  | "login-pin"      // existing user: PIN entry
  | "signup-info"    // new user: first/last name + email
  | "signup-pin"     // new user: set PIN
  | "signup-confirm";// new user: confirm PIN

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const prefs = loadPrefs();
  const [lang, setLangState] = useState<string>(prefs.language ?? "en");

  const [screen, setScreen] = useState<Screen>("start");
  // Set to true after successful registration so the start screen can show a success banner
  const [justRegistered, setJustRegistered] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPin, setLoginPin] = useState("");
  const [loginError, setLoginError] = useState("");

  // Sign-up state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPin, setSignupPin]     = useState("");
  const [confirmPin, setConfirmPin]   = useState("");
  const [signupError, setSignupError] = useState("");

  function changeLang(code: string) {
    setLangState(code);
    setLang(code as "en" | "pl");
    savePrefs({ ...prefs, language: code });
  }

  const login = useLogin({
    mutation: {
      onSuccess: (user) => {
        markSession();
        // If firstLoginDone is false this is their first login — trigger onboarding
        // via sessionStorage so AuthGuard picks it up after navigation
        if (!user.firstLoginDone) {
          clearOnboardingDone();
          setPendingOnboarding();
        }
        queryClient.invalidateQueries();
        setLocation("/");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? t("login.failed");
        if (msg.includes("No account") || msg.includes("404")) {
          setLoginError(t("login.no_account"));
        } else if (msg.includes("Incorrect") || msg.includes("401")) {
          setLoginError(t("login.wrong_pin"));
        } else {
          setLoginError(t("login.failed"));
        }
        setLoginPin("");
      },
    },
  });

  const register = useRegister({
    mutation: {
      onSuccess: () => {
        // After registration, return to the start screen so the user logs in manually.
        // Onboarding is triggered by the login handler (when firstLoginDone is false),
        // NOT by registration — this ensures language chosen on the start screen is
        // carried into onboarding correctly.
        setJustRegistered(true);
        setLoginEmail(signupEmail.trim());
        setScreen("start");
        // Invalidate any stale queries but do NOT navigate to "/" yet
        queryClient.invalidateQueries();
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "";
        if (msg.includes("409") || msg.includes("already")) {
          setSignupError(t("login.email_taken"));
        } else {
          setSignupError(t("login.register_failed"));
        }
        setSignupPin("");
        setConfirmPin("");
        setScreen("signup-info");
      },
    },
  });

  // ── Login flow ──────────────────────────────────────────────────────────────

  function handleLoginContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim()) return;
    setLoginError("");
    setLoginPin("");
    setScreen("login-pin");
  }

  function handleLoginPinChange(pin: string) {
    setLoginPin(pin);
    setLoginError("");
    if (pin.length >= 4) {
      // Auto-submit
      setTimeout(() => {
        login.mutate({ data: { email: loginEmail.trim(), password: pin } });
      }, 200);
    }
  }

  // ── Sign-up flow ────────────────────────────────────────────────────────────

  function handleSignupInfo(e: React.FormEvent) {
    e.preventDefault();
    setSignupError("");
    if (!firstName.trim() || !lastName.trim() || !signupEmail.trim()) return;
    setSignupPin("");
    setConfirmPin("");
    setScreen("signup-pin");
  }

  function handleSignupPin(pin: string) {
    setSignupPin(pin);
  }

  function handleSignupPinDone() {
    if (signupPin.length < 4) return;
    setConfirmPin("");
    setScreen("signup-confirm");
  }

  function handleConfirmPin(pin: string) {
    setConfirmPin(pin);
    if (pin.length >= signupPin.length) {
      // Auto-submit when same length
      setTimeout(() => {
        if (pin === signupPin) {
          register.mutate({
            data: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: signupEmail.trim(),
              password: pin,
            },
          });
        } else {
          setSignupError(t("login.pin_mismatch"));
          setConfirmPin("");
        }
      }, 200);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Start screen ── */}
      {screen === "start" && (
        <div className="flex flex-col items-center justify-between min-h-screen px-6 py-10">
          {/* Language picker */}
          <div className="flex gap-2 self-end">
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => changeLang(l.code)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition border ${
                  lang === l.code
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground"
                }`}
              >
                {l.code.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Account-created success banner */}
          {justRegistered && (
            <div className="w-full max-w-sm rounded-2xl bg-green-900/25 border border-green-700/40 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-green-400">{t("login.account_created")}</p>
              <p className="text-xs text-green-400/70 mt-0.5">{t("login.account_created_sub")}</p>
            </div>
          )}

          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-3xl bg-card border border-border shadow-xl">
              <BadgerLogo size={80} />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Budger</h1>
              <p className="text-sm text-muted-foreground mt-1">{t("login.tagline")}</p>
            </div>
          </div>

          {/* Login form */}
          <form onSubmit={handleLoginContinue} className="w-full max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">{t("common.email")}</Label>
              <Input
                type="email"
                placeholder="alex@example.com"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                autoComplete="email"
                required
                className="h-14 rounded-2xl bg-muted border-border text-base px-4"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-14 rounded-2xl text-base font-semibold"
            >
              {t("login.continue")}
            </Button>

            {/* Sign up link */}
            <div className="text-center pt-2">
              <span className="text-sm text-muted-foreground">{t("login.no_account_prompt")} </span>
              <button
                type="button"
                onClick={() => {
                  setSignupError("");
                  setSignupEmail(loginEmail);
                  setScreen("signup-info");
                }}
                className="text-sm text-foreground underline underline-offset-4"
              >
                {t("login.sign_up")}
              </button>
            </div>
          </form>

          <p className="text-xs text-muted-foreground/50">{t("login.footer")}</p>
        </div>
      )}

      {/* ── Login PIN screen ── */}
      {screen === "login-pin" && (
        <div className="flex flex-col items-center justify-between min-h-screen px-6 py-10">
          <button
            onClick={() => { setLoginPin(""); setLoginError(""); setScreen("start"); }}
            className="self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="flex flex-col items-center gap-2">
            <h2 className="text-2xl font-bold text-foreground">{t("login.enter_pin")}</h2>
            <p className="text-sm text-muted-foreground text-center">{loginEmail}</p>
            <button
              type="button"
              onClick={() => setLoginError(t("login.forgot_placeholder"))}
              className="text-xs text-muted-foreground underline underline-offset-4 mt-1"
            >
              {t("login.forgot")}
            </button>
            {loginError && (
              <p className="text-sm text-destructive text-center mt-1">{loginError}</p>
            )}
          </div>

          <div className="w-full">
            <PinKeyboard
              value={loginPin}
              onChange={handleLoginPinChange}
              minLength={4}
              maxLength={8}
              label={login.isPending ? t("login.signing_in") : undefined}
            />
          </div>

          <div className="h-12" />
        </div>
      )}

      {/* ── Sign-up info screen ── */}
      {screen === "signup-info" && (
        <div className="flex flex-col items-center justify-between min-h-screen px-6 py-10">
          <button
            onClick={() => { setSignupError(""); setScreen("start"); }}
            className="self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("login.create_account")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("login.create_sub")}</p>
          </div>

          <form onSubmit={handleSignupInfo} className="w-full max-w-sm space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{t("login.first_name")}</Label>
                <Input
                  placeholder="Alex"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  required
                  className="h-13 rounded-2xl bg-muted border-border text-base px-4"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{t("login.last_name")}</Label>
                <Input
                  placeholder="Johnson"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  required
                  className="h-13 rounded-2xl bg-muted border-border text-base px-4"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">{t("common.email")}</Label>
              <Input
                type="email"
                placeholder="alex@example.com"
                value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                autoComplete="email"
                required
                className="h-13 rounded-2xl bg-muted border-border text-base px-4"
              />
            </div>
            {signupError && (
              <p className="text-sm text-destructive text-center">{signupError}</p>
            )}
            <Button
              type="submit"
              className="w-full h-14 rounded-2xl text-base font-semibold mt-2"
            >
              {t("login.next")}
            </Button>
          </form>

          <div className="h-10" />
        </div>
      )}

      {/* ── Sign-up PIN creation screen ── */}
      {screen === "signup-pin" && (
        <div className="flex flex-col items-center justify-between min-h-screen px-6 py-10">
          <button
            onClick={() => setScreen("signup-info")}
            className="self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("login.set_pin")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("login.set_pin_sub")}</p>
          </div>

          <div className="w-full">
            <PinKeyboard
              value={signupPin}
              onChange={handleSignupPin}
              minLength={4}
              maxLength={8}
            />
          </div>

          <Button
            onClick={handleSignupPinDone}
            disabled={signupPin.length < 4}
            className="w-full h-14 rounded-2xl text-base font-semibold"
          >
            {t("login.next")}
          </Button>
        </div>
      )}

      {/* ── Sign-up PIN confirm screen ── */}
      {screen === "signup-confirm" && (
        <div className="flex flex-col items-center justify-between min-h-screen px-6 py-10">
          <button
            onClick={() => { setConfirmPin(""); setSignupError(""); setScreen("signup-pin"); }}
            className="self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("login.confirm_pin")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("login.confirm_pin_sub")}</p>
            {signupError && (
              <p className="text-sm text-destructive mt-2">{signupError}</p>
            )}
          </div>

          <div className="w-full">
            <PinKeyboard
              value={confirmPin}
              onChange={handleConfirmPin}
              minLength={signupPin.length}
              maxLength={signupPin.length}
              label={register.isPending ? t("login.creating") : undefined}
            />
          </div>

          <div className="h-12" />
        </div>
      )}
    </div>
  );
}
