import { useState, useEffect, useRef } from "react";
import { LEGAL } from "@/lib/legal";
import { useLocation, useSearch } from "wouter";
import { useLogin, useRegister, useRegisterStart, useVerifyEmail, useForgotPin, useResetPin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import BadgerLogo from "@/components/BadgerLogo";
import BudgerWordmark from "@/components/BudgerWordmark";
import PinKeyboard from "@/components/PinKeyboard";
import { t, setLang } from "@/lib/i18n";
import { LANGUAGES, loadPrefs, savePrefs, markSession, setPendingOnboarding, clearOnboardingDone, setActiveUserId, migratePreLoginPrefs } from "@/lib/prefs";
import { useWinkSplash } from "@/lib/appReady";

type Screen =
  | "start"               // email + language, login default / sign-up link
  | "login-pin"           // existing user: PIN entry
  | "signup-info"         // new user: first/last name + email
  | "signup-check-email"  // new user: confirm the (simulated) verification email
  | "signup-verifying"    // new user: auto-verifying token from real email link
  | "signup-pin"          // new user: set PIN
  | "signup-confirm"      // new user: confirm PIN
  | "forgot-pin"          // forgot PIN: email entry
  | "forgot-pin-sent"     // forgot PIN: check email message
  | "reset-pin"           // reset PIN: new PIN keyboard (from email link)
  | "reset-pin-confirm";  // reset PIN: confirm new PIN

export default function LoginPage() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const search = useSearch();
  const showWinkSplash = useWinkSplash();

  const prefs = loadPrefs();
  const [lang, setLangState] = useState<string>(prefs.language ?? "en");

  const [screen, setScreen] = useState<Screen>("start");
  // Set to true after successful registration so the start screen can show a success banner
  const [justRegistered, setJustRegistered] = useState(false);
  // Set to true when landing from a deletion request (the account is in the 24h grace period)
  const [pendingDeletion, setPendingDeletion] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("pendingDeletion") === "1"; } catch { return false; }
  });
  // Auto-dismiss the pending-deletion banner after 5 seconds
  useEffect(() => {
    if (!pendingDeletion) return;
    const id = setTimeout(() => setPendingDeletion(false), 5000);
    return () => clearTimeout(id);
  }, [pendingDeletion]);

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
  const [verifyError, setVerifyError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [legalModal, setLegalModal] = useState<null | "terms" | "privacy">(null);

  // Forgot / reset PIN state
  const [forgotEmail, setForgotEmail]     = useState("");
  const [forgotError, setForgotError]     = useState("");
  const [resetToken, setResetToken]       = useState("");
  const [resetPin, setResetPin]           = useState("");
  const [confirmResetPin, setConfirmResetPin] = useState("");
  const [resetError, setResetError]       = useState("");
  const [justPinReset, setJustPinReset]   = useState(false);

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [loginChecking, setLoginChecking] = useState(false);
  const [loginPinLength, setLoginPinLength] = useState<number | null>(null);
  // Show the submit button 5 seconds after the PIN screen appears,
  // so the digit count doesn't reveal how long the PIN is.
  const [showPinSubmit, setShowPinSubmit] = useState(false);
  useEffect(() => {
    if (screen !== "login-pin") { setShowPinSubmit(false); return; }
    const id = setTimeout(() => setShowPinSubmit(true), 5000);
    return () => clearTimeout(id);
  }, [screen]);

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

  // Auto-handle /reset-pin?token=xxx from the PIN reset email link.
  const autoResetRef = useRef(false);
  useEffect(() => {
    if (autoResetRef.current) return;
    if (location !== "/reset-pin") return;
    const params = new URLSearchParams(search);
    const token = params.get("token");
    autoResetRef.current = true;
    if (!token) {
      setResetError(t("login.reset_link_invalid"));
      setScreen("reset-pin"); // will show the error in the PIN screen header
      return;
    }
    setResetToken(token);
    setResetPin("");
    setConfirmResetPin("");
    setResetError("");
    setScreen("reset-pin");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, search]);

  // Auto-verify when landing on /verify-email?token=xxx from the real email link.
  // Gated to the /verify-email pathname so a stray ?token= on /login never consumes a token.
  const autoVerifiedRef = useRef(false);
  useEffect(() => {
    if (autoVerifiedRef.current) return;
    if (location !== "/verify-email") return;
    const params = new URLSearchParams(search);
    const token = params.get("token");
    if (!token) return;
    autoVerifiedRef.current = true;
    setScreen("signup-verifying");
    setVerifyError("");
    verifyEmail.mutate({ data: { token } });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, search]);

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
        // The server is the durable carrier of the account's language — it survives even
        // if this browser context (e.g. a mail app's in-app browser during email
        // verification) never had the locally-chosen language in its own localStorage.
        // Apply it immediately so PIN screen -> onboarding -> app all render correctly,
        // without waiting for firstLoginDone / the post-onboarding sync in App.tsx.
        const serverLang = (user as any).language;
        if (serverLang) {
          setLang(serverLang as "en" | "pl");
          savePrefs({ ...loadPrefs(), language: serverLang });
        }
        markSession();
        // If firstLoginDone is false this is their first login — trigger onboarding
        // via sessionStorage so AuthGuard picks it up after navigation
        if (!user.firstLoginDone) {
          clearOnboardingDone();
          setPendingOnboarding();
        }
        // Show the wink splash BEFORE navigating so it covers the brief moment
        // AuthGuard re-fetches /me after login. The wink runs for ~3 s — plenty
        // of time for the session cookie + query to resolve behind it.
        // Navigate immediately (under the overlay) so home mounts and starts
        // loading while the animation plays; by the time it fades out everything
        // is ready and there is no spinner visible to the user.
        showWinkSplash();
        queryClient.invalidateQueries();
        setLocation("/");
      },
      onError: (err: any) => {
        // ApiError stores the parsed response body at err.data (not err.response.data —
        // err.response is the raw Response object which has no .data property).
        // Fall back to err.message which buildErrorMessage populates as
        // "HTTP <status> <statusText>: <error>" for additional string-based matching.
        const errData  = err?.data ?? err?.response?.data; // data-first; response.data is legacy-safe fallback
        const errMsg   = errData?.error ?? err?.message ?? "";
        const status   = err?.status ?? err?.response?.status ?? 0;

        if (status === 429 || errMsg.includes("Too many attempts") || errMsg.includes("Too many requests")) {
          setLoginError(t("login.too_many_attempts"));
          // Keep the PIN — the user just needs to wait and retry
        } else if (status === 403 || errMsg.includes("account_pending_deletion")) {
          setLoginError(t("login.account_pending_deletion"));
          setLoginPin("");
        } else if (status === 404 || errMsg.includes("No account")) {
          setLoginError(t("login.no_account"));
          setLoginPin(""); // clear: no account — email step should be retried
        } else if (status === 401 || errMsg.includes("Incorrect")) {
          setLoginError(t("login.wrong_pin"));
          setLoginPin(""); // clear on wrong PIN so the user retypes deliberately
        } else {
          // Network / server error (e.g. "Failed to fetch", 5xx) —
          // keep the PIN so the user can retry via Continue without retyping.
          setLoginError(t("login.failed"));
        }
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
      onSuccess: () => {
        setVerifyError("");
        setScreen("signup-check-email");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "";
        if (msg.includes("email_pending_deletion")) {
          setSignupError(t("login.email_pending_deletion"));
        } else if (msg.includes("409") || msg.includes("already")) {
          setSignupError(t("login.email_taken"));
        } else {
          setSignupError(t("login.register_failed"));
        }
      },
    },
  });

  const forgotPinMutation = useForgotPin({
    mutation: {
      onSuccess: () => {
        setForgotError("");
        setScreen("forgot-pin-sent");
      },
      onError: () => {
        // Always advance to sent screen — don't leak whether email exists
        setForgotError("");
        setScreen("forgot-pin-sent");
      },
    },
  });

  const resetPinMutation = useResetPin({
    mutation: {
      onSuccess: () => {
        // Do NOT auto-login — user must sign in with their new PIN.
        setJustPinReset(true);
        setResetPin("");
        setConfirmResetPin("");
        setScreen("start");
        setLocation("/login");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? err?.message ?? "";
        setResetError(msg.includes("expired") || msg.includes("invalid") || msg.includes("Invalid")
          ? t("login.reset_link_invalid")
          : t("login.reset_failed"));
        setConfirmResetPin("");
      },
    },
  });

  const verifyEmail = useVerifyEmail({
    mutation: {
      onSuccess: (data) => {
        // When the user arrives via the email link on a fresh browser session,
        // signupEmail/firstName/lastName are empty (they were typed on a different
        // device or the page was reloaded). The verify endpoint returns the stored
        // values so we can populate them here, ensuring the subsequent
        // register.mutate({ email }) call has the correct email.
        //
        // Guard: if the server somehow returns an empty email, surface a clear
        // error instead of silently advancing to PIN setup where register would
        // fail with a generic "Registration failed" message.
        if (!data?.email) {
          setVerifyError(t("login.verify_failed"));
          return;
        }
        setVerifyError("");
        setSignupPin("");
        setConfirmPin("");
        setSignupEmail(data.email);
        if (data.firstName) setFirstName(data.firstName);
        if (data.lastName)  setLastName(data.lastName);
        // This step may run in a completely different browser context than the one
        // where the language was originally picked (e.g. a mail app's in-app browser
        // opening the verification link) — apply the server-stored language now so
        // PIN setup and everything after it renders in the right language.
        const verifiedLang = (data as any).language;
        if (verifiedLang) {
          setLangState(verifiedLang);
          setLang(verifiedLang as "en" | "pl");
          savePrefs({ ...loadPrefs(), language: verifiedLang });
        }
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
        if (data.pendingDeletion) {
          setLoginError(t("login.account_pending_deletion"));
          return;
        }
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
        language: lang,
      },
    });
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
              termsAccepted,
              privacyAccepted,
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
          {/* Pending-deletion notice banner */}
          {pendingDeletion && (
            <div className="login-enter login-enter-d1 w-full max-w-sm rounded-2xl bg-destructive/10 border border-destructive/30 px-4 py-3 text-center mb-4">
              <p className="text-sm font-semibold text-destructive">{t("login.pending_deletion")}</p>
              <p className="text-xs text-destructive/70 mt-0.5">{t("login.pending_deletion_sub")}</p>
            </div>
          )}
          {/* Account-created success banner */}
          {justRegistered && !pendingDeletion && (
            <div className="login-enter login-enter-d1 w-full max-w-sm rounded-2xl bg-green-900/25 border border-green-700/40 px-4 py-3 text-center mb-4">
              <p className="text-sm font-semibold text-green-400">{t("login.account_created")}</p>
              <p className="text-xs text-green-400/70 mt-0.5">{t("login.account_created_sub")}</p>
            </div>
          )}
          {/* PIN-reset success banner */}
          {justPinReset && !pendingDeletion && (
            <div className="login-enter login-enter-d1 w-full max-w-sm rounded-2xl bg-green-900/25 border border-green-700/40 px-4 py-3 text-center mb-4">
              <p className="text-sm font-semibold text-green-400">{t("login.pin_reset_success")}</p>
              <p className="text-xs text-green-400/70 mt-0.5">{t("login.pin_reset_success_sub")}</p>
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
                <BadgerLogo size={88} pauseIdleAnimations growPulse={false} />
              </span>
              <div data-splash-wordmark-login>
                <BudgerWordmark size={48} tagline="Budget Planner" />
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
                    // Always start the create-account form with a blank email —
                    // prefilling from the login field caused confusion when the
                    // email being typed there wasn't meant for the new account.
                    setSignupEmail("");
                    setFirstName("");
                    setLastName("");
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
              onClick={() => { setForgotEmail(loginEmail); setForgotError(""); setScreen("forgot-pin"); }}
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
              showSubmit={showPinSubmit}
              onSubmit={handleLoginSubmit}
              submitLabel={login.isPending ? t("login.signing_in") : t("login.continue")}
              submitDisabled={loginPin.length < 4 || login.isPending}
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

            {/* Legal acceptance checkboxes */}
            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded accent-foreground cursor-pointer"
                />
                <span className="text-sm text-muted-foreground leading-snug">
                  {t("login.terms_checkbox")}{" "}
                  <button
                    type="button"
                    onClick={() => setLegalModal("terms")}
                    className="text-foreground underline underline-offset-4"
                  >
                    {t("login.terms_link")}
                  </button>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={e => setPrivacyAccepted(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded accent-foreground cursor-pointer"
                />
                <span className="text-sm text-muted-foreground leading-snug">
                  {t("login.privacy_checkbox")}{" "}
                  <button
                    type="button"
                    onClick={() => setLegalModal("privacy")}
                    className="text-foreground underline underline-offset-4"
                  >
                    {t("login.privacy_link")}
                  </button>
                </span>
              </label>
            </div>

            {signupError && (
              <p className="text-sm text-destructive text-center">{signupError}</p>
            )}
            <Button
              type="submit"
              disabled={registerStart.isPending || !termsAccepted || !privacyAccepted}
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

          <div className="login-enter login-enter-d3 w-full max-w-sm space-y-3 text-center">
            <p className="text-xs text-muted-foreground/60">{t("login.check_email_hint")}</p>
            {verifyError && (
              <p className="text-sm text-destructive">{verifyError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Sign-up: verifying token from real email link ── */}
      {screen === "signup-verifying" && (
        <div key="signup-verifying" className="min-h-screen flex flex-col items-center justify-center px-6 pb-10 gap-6">
          {verifyEmail.isPending && (
            <>
              <div className="w-16 h-16 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
              <div className="text-center">
                <h2 className="text-xl font-bold text-foreground">{t("login.verifying")}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t("login.verifying_sub")}</p>
              </div>
            </>
          )}
          {!verifyEmail.isPending && verifyError && (
            <>
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <span className="text-2xl">✕</span>
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-foreground">{t("login.verify_failed_title")}</h2>
                <p className="text-sm text-muted-foreground">{verifyError}</p>
              </div>
              <Button
                onClick={() => { setVerifyError(""); setScreen("signup-info"); }}
                className="w-full max-w-xs h-13 rounded-2xl text-base font-semibold"
              >
                {t("login.start_over")}
              </Button>
            </>
          )}
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

      {/* ── Forgot PIN: email entry ── */}
      {screen === "forgot-pin" && (
        <div key="forgot-pin" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <button
            onClick={() => { setForgotError(""); setScreen("login-pin"); }}
            className="login-enter login-enter-d1 self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="login-enter login-enter-d2 flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Mail className="w-7 h-7 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">{t("login.forgot_title")}</h2>
            <p className="text-sm text-muted-foreground max-w-xs">{t("login.forgot_sub")}</p>
          </div>

          <form
            className="login-enter login-enter-d3 w-full max-w-sm space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!forgotEmail.trim()) return;
              setForgotError("");
              forgotPinMutation.mutate({ data: { email: forgotEmail.trim() } });
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">{t("common.email")}</Label>
              <Input
                type="email"
                placeholder="alex@example.com"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                autoComplete="email"
                required
                className="h-14 rounded-2xl bg-muted border-border text-base px-4"
              />
            </div>
            {forgotError && <p className="text-sm text-destructive text-center">{forgotError}</p>}
            <Button
              type="submit"
              className="w-full h-14 rounded-2xl text-base font-semibold"
              disabled={forgotPinMutation.isPending}
            >
              {forgotPinMutation.isPending ? t("login.sending_reset") : t("login.send_reset")}
            </Button>
          </form>
        </div>
      )}

      {/* ── Forgot PIN: check email ── */}
      {screen === "forgot-pin-sent" && (
        <div key="forgot-pin-sent" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <button
            onClick={() => setScreen("forgot-pin")}
            className="login-enter login-enter-d1 self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="login-enter login-enter-d2 flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Mail className="w-7 h-7 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">{t("login.reset_sent_title")}</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              {t("login.reset_sent_sub").replace("{email}", forgotEmail.trim())}
            </p>
          </div>
        </div>
      )}

      {/* ── Reset PIN: new PIN entry (from email link) ── */}
      {screen === "reset-pin" && (
        <div key="reset-pin" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <div className="login-enter login-enter-d2 text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("login.new_pin")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("login.new_pin_sub")}</p>
            {resetError && <p className="text-sm text-destructive mt-2">{resetError}</p>}
          </div>

          <div className="login-enter login-enter-d3 w-full">
            <PinKeyboard
              value={resetPin}
              onChange={(pin) => {
                setResetPin(pin);
                setResetError("");
              }}
              minLength={4}
              maxLength={8}
            />
          </div>

          <Button
            onClick={() => {
              if (resetPin.length < 4) return;
              setConfirmResetPin("");
              setResetError("");
              setScreen("reset-pin-confirm");
            }}
            disabled={resetPin.length < 4}
            className="login-enter login-enter-d4 w-full h-14 rounded-2xl text-base font-semibold"
          >
            {t("login.next")}
          </Button>
        </div>
      )}

      {/* ── Reset PIN: confirm new PIN ── */}
      {screen === "reset-pin-confirm" && (
        <div key="reset-pin-confirm" className="flex flex-col items-center justify-start min-h-screen px-6 pt-[5vh] pb-10 gap-8">
          <button
            onClick={() => { setConfirmResetPin(""); setResetError(""); setScreen("reset-pin"); }}
            className="login-enter login-enter-d1 self-start text-sm text-muted-foreground flex items-center gap-1"
          >
            ← {t("common.back")}
          </button>

          <div className="login-enter login-enter-d2 text-center">
            <h2 className="text-2xl font-bold text-foreground">{t("login.confirm_new_pin")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("login.confirm_new_pin_sub")}</p>
            {resetError && <p className="text-sm text-destructive mt-2">{resetError}</p>}
          </div>

          <div className="login-enter login-enter-d3 w-full">
            <PinKeyboard
              value={confirmResetPin}
              onChange={(pin) => {
                setConfirmResetPin(pin);
                setResetError("");
                if (pin.length >= resetPin.length) {
                  setTimeout(() => {
                    if (pin === resetPin) {
                      resetPinMutation.mutate({ data: { token: resetToken, password: pin } });
                    } else {
                      setResetError(t("login.pin_mismatch"));
                      setConfirmResetPin("");
                    }
                  }, 200);
                }
              }}
              minLength={resetPin.length}
              maxLength={resetPin.length}
              label={resetPinMutation.isPending ? t("login.resetting") : undefined}
            />
          </div>
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

      {/* ── Legal text modal ── */}
      {legalModal !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background"
          onClick={(e) => { if (e.target === e.currentTarget) setLegalModal(null); }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-safe-top pt-4 pb-3 border-b border-border shrink-0">
            <h2 className="text-base font-semibold text-foreground">
              {legalModal === "terms" ? t("login.terms_title") : t("login.privacy_title")}
            </h2>
            <button
              onClick={() => setLegalModal(null)}
              className="text-muted-foreground text-2xl leading-none px-2 py-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
              {legalModal === "terms"
                ? LEGAL.terms[lang as "en" | "pl"] ?? LEGAL.terms.en
                : LEGAL.privacy[lang as "en" | "pl"] ?? LEGAL.privacy.en}
            </pre>
          </div>

          {/* Accept / close button */}
          <div className="shrink-0 px-5 pb-safe-bottom pb-6 pt-3 border-t border-border">
            <Button
              className="w-full h-14 rounded-2xl text-base font-semibold"
              onClick={() => setLegalModal(null)}
            >
              {t("login.continue")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
