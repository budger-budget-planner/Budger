import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLogin, useRegister, useRegisterStart, useVerifyEmail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import BadgerLogo from "@/components/BadgerLogo";
import PinKeyboard from "@/components/PinKeyboard";
import { t, setLang } from "@/lib/i18n";
import { LANGUAGES, loadPrefs, savePrefs, markSession, setPendingOnboarding, clearOnboardingDone, setActiveUserId, migratePreLoginPrefs } from "@/lib/prefs";

type Screen =
  | "start"          // email + language, login default / sign-up link
  | "login-pin"      // existing user: PIN entry
  | "signup-info"    // new user: first/last name + email
  | "signup-check-email" // new user: confirm the (simulated) verification email
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
  // Dev-simulated verification email — no real mail service is wired up, so the
  // "inbox" is rendered right here with a button standing in for the emailed link.
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [emailOpened, setEmailOpened] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [loginChecking, setLoginChecking] = useState(false);
  const [loginPinLength, setLoginPinLength] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const ratio = vv.height / window.innerHeight;
      setKeyboardOpen(ratio < 0.75);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  function changeLang(code: string) {
    setLangState(code);
    setLang(code as "en" | "pl");
    savePrefs({ ...prefs, language: code });
  }

  const login = useLogin({
    mutation: {
      onSuccess: (user) => {
        // Scope prefs to this user so switching accounts doesn't bleed settings
        setActiveUserId(user.id);
        // Carry language (selected on login screen) into user-scoped prefs on first login
        migratePreLoginPrefs();
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
        } else if (msg.includes("expired") || msg.includes("410")) {
          setSignupError(t("login.verify_link_invalid"));
        } else {
          setSignupError(t("login.register_failed"));
        }
        setSignupPin("");
        setConfirmPin("");
        setScreen("signup-info");
      },
    },
  });

  const registerStart = useRegisterStart({
    mutation: {
      onSuccess: (data) => {
        setVerifyUrl(data.verifyUrl);
        setEmailOpened(false);
        setVerifyError("");
        setScreen("signup-check-email");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "";
        if (msg.includes("409") || msg.includes("already")) {
          setSignupError(t("login.email_taken"));
        } else {
          setSignupError(t("login.register_failed"));
        }
      },
    },
  });

  const verifyEmail = useVerifyEmail({
    mutation: {
      onSuccess: () => {
        setVerifyError("");
        setSignupPin("");
        setConfirmPin("");
        setScreen("signup-pin");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "";
        setVerifyError(msg.includes("expired") || msg.includes("invalid") ? t("login.verify_link_invalid") : t("login.verify_failed"));
      },
    },
  });

  // ── Login flow ──────────────────────────────────────────────────────────────

  async function handleLoginContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim()) return;
    setLoginError("");
    setLoginPin("");
    setLoginChecking(true);
    try {
      const r = await fetch(
        `${import.meta.env.BASE_URL}api/auth/check-email?email=${encodeURIComponent(loginEmail.trim())}`,
        { credentials: "include" },
      );
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        if (data.exists === false) {
          setLoginError(t("login.no_account"));
          return;
        }
        setLoginPinLength(typeof data.pinLength === "number" ? data.pinLength : null);
      }
      // On non-2xx or ambiguous response: proceed to PIN screen
      // (the PIN submit itself will surface a more specific error)
      setScreen("login-pin");
    } catch {
      // Network error — let the user through; the PIN screen will surface any real error
      setScreen("login-pin");
    } finally {
      setLoginChecking(false);
    }
  }

  function handleLoginPinChange(pin: string) {
    setLoginPin(pin);
    setLoginError("");
    // Auto-submit only when we know the exact PIN length and the user has typed exactly that many digits
    if (loginPinLength !== null && pin.length === loginPinLength && !login.isPending) {
      const email = loginEmail.trim();
      setTimeout(() => {
        login.mutate({ data: { email, password: pin } });
      }, 120); // brief pause so the last dot renders before submitting
    }
  }

  function handleLoginSubmit() {
    if (loginPin.length < 4 || login.isPending) return;
    login.mutate({ data: { email: loginEmail.trim(), password: loginPin } });
  }

  // ── Sign-up flow ────────────────────────────────────────────────────────────

  function handleSignupInfo(e: React.FormEvent) {
    e.preventDefault();
    setSignupError("");
    if (!firstName.trim() || !lastName.trim() || !signupEmail.trim()) return;
    registerStart.mutate({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: signupEmail.trim(),
      },
    });
  }

  function handleOpenSimulatedEmail() {
    setEmailOpened(true);
  }

  function handleConfirmEmailLink() {
    if (!verifyUrl) return;
    const token = new URL(verifyUrl, window.location.origin).searchParams.get("token");
    if (!token) return;
    setVerifyError("");
    verifyEmail.mutate({ data: { token } });
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
        <div key="start" className="min-h-screen flex flex-col items-center justify-center px-6 pb-10">
          {/* Account-created success banner */}
          {justRegistered && (
            <div className="login-enter login-enter-d1 w-full max-w-sm rounded-2xl bg-green-900/25 border border-green-700/40 px-4 py-3 text-center mb-4">
              <p className="text-sm font-semibold text-green-400">{t("login.account_created")}</p>
              <p className="text-xs text-green-400/70 mt-0.5">{t("login.account_created_sub")}</p>
            </div>
          )}

          {/*
            Centered square container — side ≈ phone width, content spread evenly.
          */}
          <div className="w-full max-w-sm flex flex-col items-center" style={{ gap: "clamp(24px, 8vw, 48px)" }}>

            {/* Language buttons */}
            <div className={`login-enter login-enter-d1 flex gap-2 self-end overflow-hidden transition-all duration-300 ease-in-out ${keyboardOpen ? "max-h-0 opacity-0 pointer-events-none" : "max-h-16 opacity-100"}`}>
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => changeLang(l.code)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition border ${
                    lang === l.code
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {l.code.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Logo + name */}
            <div className={`login-enter login-enter-d2 flex flex-col items-center gap-3 overflow-hidden transition-all duration-300 ease-in-out ${keyboardOpen ? "max-h-0 opacity-0 pointer-events-none" : "max-h-48 opacity-100"}`}>
              <span data-splash-logo-login>
                <BadgerLogo size={88} />
              </span>
              <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Budger</h1>
                <p className="text-sm text-muted-foreground mt-1">{t("login.tagline")}</p>
              </div>
            </div>

            {/* Login form */}
            <form onSubmit={handleLoginContinue} className="login-enter login-enter-d3 w-full space-y-3">
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
                disabled={loginChecking}
              >
                {loginChecking ? "…" : t("login.continue")}
              </Button>
              {loginError && (
                <p className="text-sm text-destructive text-center">{loginError}</p>
              )}
              <div className="text-center pt-1">
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

          </div>

          <p className={`login-enter login-enter-d4 text-xs text-muted-foreground/50 mt-6 overflow-hidden transition-all duration-300 ease-in-out ${keyboardOpen ? "max-h-0 opacity-0" : "max-h-10 opacity-100"}`}>{t("login.footer")}</p>
        </div>
      )}

      {/* ── Login PIN screen ── */}
      {screen === "login-pin" && (
        <div key="login-pin" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <button
            onClick={() => { setLoginPin(""); setLoginError(""); setScreen("start"); }}
            className="login-enter login-enter-d1 self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="login-enter login-enter-d2 flex flex-col items-center gap-2 w-full">
            <h2 className="text-2xl font-bold text-foreground">{t("login.enter_pin")}</h2>
            <p className="text-sm text-muted-foreground text-center">{loginEmail}</p>
            <button
              type="button"
              onClick={() => setLoginError(t("login.forgot_placeholder"))}
              className="text-xs text-muted-foreground underline underline-offset-4 mt-1"
            >
              {t("login.forgot")}
            </button>
            </div>

          <div className="login-enter login-enter-d3 w-full">
            <PinKeyboard
              value={loginPin}
              onChange={handleLoginPinChange}
              minLength={4}
              maxLength={loginPinLength ?? 8}
              label={login.isPending ? t("login.signing_in") : undefined}
              error={loginError || undefined}
            />
          </div>
        </div>
      )}

      {/* ── Sign-up info screen ── */}
      {screen === "signup-info" && (
        <div key="signup-info" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <button
            onClick={() => { setSignupError(""); setScreen("start"); }}
            className="login-enter login-enter-d1 self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="login-enter login-enter-d2 text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("login.create_account")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("login.create_sub")}</p>
          </div>

          <form onSubmit={handleSignupInfo} className="login-enter login-enter-d3 w-full max-w-sm space-y-3">
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
              disabled={registerStart.isPending}
              className="w-full h-14 rounded-2xl text-base font-semibold mt-2"
            >
              {registerStart.isPending ? t("login.sending_email") : t("login.next")}
            </Button>
          </form>
        </div>
      )}

      {/* ── Sign-up: check email screen ── */}
      {screen === "signup-check-email" && (
        <div key="signup-check-email" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <button
            onClick={() => { setVerifyError(""); setScreen("signup-info"); }}
            className="login-enter login-enter-d1 self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="login-enter login-enter-d2 flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Mail className="w-7 h-7 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">{t("login.check_email_title")}</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              {t("login.check_email_sub").replace("{email}", signupEmail.trim())}
            </p>
          </div>

          {/* Dev simulation: no real mail service is wired up, so we render the
              "inbox" here — tapping it reveals an email whose button behaves exactly
              like the link a real inbox would deliver. */}
          <div className="login-enter login-enter-d3 w-full max-w-sm space-y-3">
            {!emailOpened ? (
              <button
                onClick={handleOpenSimulatedEmail}
                className="w-full rounded-2xl border border-border bg-muted/40 hover:bg-muted transition p-4 text-left flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Mail className="w-4 h-4 text-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{t("login.sim_email_subject")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{t("login.sim_email_preview")}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{t("login.sim_email_tag")}</p>
                </div>
              </button>
            ) : (
              <div className="w-full rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{t("login.sim_email_subject")}</p>
                    <p className="text-[10px] text-muted-foreground/60">{t("login.sim_email_tag")}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("login.sim_email_body").replace("{name}", firstName.trim() || t("login.sim_email_fallback_name"))}
                </p>
                <Button
                  onClick={handleConfirmEmailLink}
                  disabled={verifyEmail.isPending}
                  className="w-full h-12 rounded-xl text-sm font-semibold"
                >
                  {verifyEmail.isPending ? t("login.verifying") : t("login.sim_email_link")}
                </Button>
              </div>
            )}
            {verifyError && (
              <p className="text-sm text-destructive text-center">{verifyError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Sign-up PIN creation screen ── */}
      {screen === "signup-pin" && (
        <div key="signup-pin" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <button
            onClick={() => setScreen("signup-info")}
            className="login-enter login-enter-d1 self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="login-enter login-enter-d2 text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("login.set_pin")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("login.set_pin_sub")}</p>
          </div>

          <div className="login-enter login-enter-d3 w-full">
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
            className="login-enter login-enter-d4 w-full h-14 rounded-2xl text-base font-semibold"
          >
            {t("login.next")}
          </Button>
        </div>
      )}

      {/* ── Sign-up PIN confirm screen ── */}
      {screen === "signup-confirm" && (
        <div key="signup-confirm" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <button
            onClick={() => { setConfirmPin(""); setSignupError(""); setScreen("signup-pin"); }}
            className="login-enter login-enter-d1 self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="login-enter login-enter-d2 text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("login.confirm_pin")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("login.confirm_pin_sub")}</p>
            {signupError && (
              <p className="text-sm text-destructive mt-2">{signupError}</p>
            )}
          </div>

          <div className="login-enter login-enter-d3 w-full">
            <PinKeyboard
              value={confirmPin}
              onChange={handleConfirmPin}
              minLength={signupPin.length}
              maxLength={signupPin.length}
              label={register.isPending ? t("login.creating") : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
