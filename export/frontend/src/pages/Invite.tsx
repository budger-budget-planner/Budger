import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@/lib/api-client";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, AlertCircle, Users } from "lucide-react";
import BudgerWordmark from "@/components/BudgerWordmark";
import { markSession } from "@/lib/prefs";

type PageState =
  | "loading"
  | "revoked"
  | "expired"
  | "not_found"
  | "registered_view"       // logged-in registered user, choosing to accept or decline
  | "unregistered"          // unregistered user, must sign up
  | "confirming_decline"    // asking for confirmation before declining
  | "accepting"
  | "accepted"
  | "declining"
  | "declined"
  | "need_login";           // must log in first

interface InviteDetails {
  id: number;
  email: string;
  token: string;
  householdName: string | null;
  inviterName: string | null;
  role: string;
  expiresAt: string;
  isRegistered: boolean;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: me } = useGetMe();
  const [state, setState] = useState<PageState>("loading");
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const action = new URLSearchParams(search).get("action") as "accept" | "decline" | null;

  const base = import.meta.env.BASE_URL;

  // ── Fetch invite details ─────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setState("not_found"); return; }
    fetch(`${base}api/invites/${token}`, { credentials: "include" })
      .then(async r => {
        if (r.status === 410) {
          const body = await r.json().catch(() => ({}));
          setState(body.error === "REVOKED" ? "revoked" : "expired");
          return;
        }
        if (r.status === 404) { setState("not_found"); return; }
        if (!r.ok) { setState("not_found"); return; }
        const data: InviteDetails = await r.json();
        setInvite(data);
        // Routing decision is deferred to the action effect below
      })
      .catch(() => setState("not_found"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Route once we have invite + me status ────────────────────────────
  const autoAccept = useCallback(async () => {
    if (!token) return;
    setState("accepting");
    const r = await fetch(`${base}api/invites/${token}/accept`, {
      method: "POST", credentials: "include",
    });
    if (r.ok) {
      markSession();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setState("accepted");
    } else {
      const body = await r.json().catch(() => ({}));
      setErrorMsg(body.error ?? t("common.error"));
      setState("not_found");
    }
  }, [token, base, queryClient]);

  useEffect(() => {
    if (!invite) return; // wait for invite data

    if (!invite.isRegistered) {
      // Unregistered — always show sign-up screen regardless of login state
      setState("unregistered");
      return;
    }

    // Registered user flow
    if (!me) {
      // Not logged in — need to save state and redirect to login
      setState("need_login");
      return;
    }

    // Logged in — check the email matches
    if (me.email?.toLowerCase() !== invite.email?.toLowerCase()) {
      // Wrong account logged in
      setState("need_login");
      return;
    }

    if (action === "accept") {
      autoAccept();
    } else if (action === "decline") {
      setState("confirming_decline");
    } else {
      setState("registered_view");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite, me, action]);

  async function handleAccept() {
    if (!token) return;
    setState("accepting");
    const r = await fetch(`${base}api/invites/${token}/accept`, {
      method: "POST", credentials: "include",
    });
    if (r.ok) {
      markSession();
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setState("accepted");
    } else {
      const body = await r.json().catch(() => ({}));
      setErrorMsg(body.error ?? t("common.error"));
      setState("registered_view");
    }
  }

  async function handleDecline() {
    if (!token) return;
    setState("declining");
    const r = await fetch(`${base}api/invites/${token}/decline`, {
      method: "POST", credentials: "include",
    });
    if (r.ok) {
      setState("declined");
    } else {
      const body = await r.json().catch(() => ({}));
      setErrorMsg(body.error ?? t("common.error"));
      setState("registered_view");
    }
  }

  function handleGoToLogin() {
    sessionStorage.setItem("budger_pending_invite", token ?? "");
    if (action) sessionStorage.setItem("budger_pending_invite_action", action);
    setLocation("/login");
  }

  function handleGoToSignup() {
    setLocation(`/invite/${token}/signup`);
  }

  const householdName = invite?.householdName ?? t("invite.a_household");
  const inviterName = invite?.inviterName;

  // ── Shared wrapper ────────────────────────────────────────────────────
  function Card({ children }: { children: React.ReactNode }) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-xs flex flex-col items-center gap-5 text-center">
          <BudgerWordmark className="mb-1" />
          {children}
        </div>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <Card>
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </Card>
    );
  }

  if (state === "accepting") {
    return (
      <Card>
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        <p className="text-sm text-white/50">{t("invite.accepting")}</p>
      </Card>
    );
  }

  if (state === "declining") {
    return (
      <Card>
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        <p className="text-sm text-white/50">{t("invite.declining")}</p>
      </Card>
    );
  }

  if (state === "accepted") {
    return (
      <Card>
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle className="w-7 h-7 text-green-400" />
        </div>
        <div>
          <p className="font-semibold text-green-400">{t("invite.accepted")}</p>
          <p className="text-sm text-white/50 mt-1">{t("invite.accepted_msg", { name: householdName })}</p>
        </div>
        <Button className="w-full" onClick={() => setLocation("/household")}>
          {t("invite.go_to_household")}
        </Button>
      </Card>
    );
  }

  if (state === "declined") {
    return (
      <Card>
        <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-white/40" />
        </div>
        <div>
          <p className="font-semibold text-white">{t("invite.declined")}</p>
          <p className="text-sm text-white/50 mt-1">{t("invite.declined_msg", { name: householdName })}</p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => setLocation("/")}>
          {t("common.done")}
        </Button>
      </Card>
    );
  }

  if (state === "expired") {
    return (
      <Card>
        <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-amber-400" />
        </div>
        <div>
          <p className="font-semibold text-white">{t("invite.expired_title")}</p>
          <p className="text-sm text-white/50 mt-1">{t("invite.expired_msg")}</p>
        </div>
      </Card>
    );
  }

  if (state === "revoked") {
    return (
      <Card>
        <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <p className="font-semibold text-white">{t("invite.revoked_title")}</p>
          <p className="text-sm text-white/50 mt-1">{t("invite.revoked_msg")}</p>
        </div>
      </Card>
    );
  }

  if (state === "not_found") {
    return (
      <Card>
        <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <p className="font-semibold text-white">{t("invite.not_found_title")}</p>
          <p className="text-sm text-white/50 mt-1">{errorMsg || t("invite.not_found_msg")}</p>
        </div>
      </Card>
    );
  }

  if (state === "unregistered") {
    return (
      <Card>
        <div className="w-14 h-14 rounded-full bg-pink-500/20 flex items-center justify-center">
          <Users className="w-7 h-7 text-pink-400" />
        </div>
        <div>
          <p className="font-semibold text-white">
            {t("invite.join_btn", { name: householdName })}
          </p>
          {inviterName && (
            <p className="text-sm text-white/50 mt-1">{t("invite.invited_by", { name: inviterName })}</p>
          )}
          <p className="text-xs text-white/30 mt-2">{t("invite.signup_to_join")}</p>
        </div>
        <Button className="w-full" onClick={handleGoToSignup}>
          {t("invite.signup_btn")}
        </Button>
      </Card>
    );
  }

  if (state === "need_login") {
    return (
      <Card>
        <div className="w-14 h-14 rounded-full bg-pink-500/20 flex items-center justify-center">
          <Users className="w-7 h-7 text-pink-400" />
        </div>
        <div>
          <p className="font-semibold text-white">
            {t("invite.join_btn", { name: householdName })}
          </p>
          {inviterName && (
            <p className="text-sm text-white/50 mt-1">{t("invite.invited_by", { name: inviterName })}</p>
          )}
        </div>
        <Button className="w-full" onClick={handleGoToLogin}>
          {t("invite.go_to_login")}
        </Button>
      </Card>
    );
  }

  if (state === "confirming_decline") {
    return (
      <Card>
        <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
          <XCircle className="w-7 h-7 text-white/40" />
        </div>
        <div>
          <p className="font-semibold text-white">{t("invite.decline_confirm_title")}</p>
          <p className="text-sm text-white/50 mt-1">{t("invite.decline_confirm_msg", { name: householdName })}</p>
        </div>
        <div className="flex gap-3 w-full">
          <Button variant="outline" className="flex-1" onClick={() => setState("registered_view")}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" className="flex-1" onClick={handleDecline}>
            {t("hh.decline")}
          </Button>
        </div>
      </Card>
    );
  }

  // ── registered_view — logged-in registered user ──────────────────────
  return (
    <Card>
      <div className="w-14 h-14 rounded-full bg-pink-500/20 flex items-center justify-center">
        <Users className="w-7 h-7 text-pink-400" />
      </div>
      <div>
        <p className="font-semibold text-white">
          {t("invite.join_btn", { name: householdName })}
        </p>
        {inviterName && (
          <p className="text-sm text-white/50 mt-1">{t("invite.invited_by", { name: inviterName })}</p>
        )}
        <p className="text-xs text-white/30 mt-2">
          {t("invite.expires", { date: new Date(invite?.expiresAt ?? "").toLocaleDateString() })}
        </p>
      </div>
      {errorMsg && (
        <p className="text-xs text-red-400 text-center">{errorMsg}</p>
      )}
      <div className="flex flex-col gap-2 w-full">
        <Button className="w-full" onClick={handleAccept}>
          {t("hh.accept")}
        </Button>
        <Button variant="ghost" className="w-full text-white/40 hover:text-white" onClick={() => setState("confirming_decline")}>
          {t("hh.decline")}
        </Button>
      </div>
    </Card>
  );
}
